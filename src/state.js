/* global frp, assert, getDefault, VectorClock, isKeys, isInstance */
/* global inherit, VersionedValue */

function Sequence(initial) {
    if (_.isNumber(initial)) {
        this.current = initial;
    }
}

Sequence.prototype.current = 0;

Sequence.prototype.next = function() {
    var next = this.current;
    this.current += 1;
    return next;
};

function Repeater() {
    this.key = this.keySequence.next();
    this.onValue = $.Callbacks('memory');
    this.onCancel = $.Callbacks('memory once');
}

Repeater.prototype.clock = new VectorClock();

Repeater.prototype.keySequence = new Sequence();

Repeater.prototype.cancel = function() {
    this.onCancel.fire(this, [this]);
    return this;
};

Repeater.prototype.emit = function(value) {
    return this.emitMany([value]);
};

Repeater.prototype.emitMany = function(values) {
    this.clock = this.clock.next(this.key).merge(this.clock);
    this.onValue.fireWith(this, [this.key, values, this.clock]);
    return this;
};

// ### methods

function SubRepeater() {
    Repeater.call(this);
    _.bindAll(this, 'onReceive');
}

inherits(SubRepeater, Repeater);

SubRepeater.prototype.onReceive = $.noop;

SubRepeater.prototype.addSource = function(source) {
    this.onCancel.add(function() {
        source.onValue.remove(this.onReceive);
    });
    source.onValue.add(this.onReceive);
};

function MapRepeater(source, map, context) {
    SubRepeater.call(this);

    if (_.isFunction(map)) {
        this.map = map;
    }
    this.context = _.isObject(context) ? context : this;

    this.addSource(source);
}

inherit(MapRepeater, SubRepeater);

MapRepeater.prototype.map = _.identity;

MapRepeater.prototype.onReceive = function(key, values, clock) {
    this.clock = this.clock.merge(clock);
    var value = this.map.apply(this.context, values);
    this.emit(value);
};

Repeater.prototype.map = function(func, context) {
    return new MapRepeater(this, func, context);
};

function FoldRepeater(source, initial, fold, context) {
    SubRepeater.call(this);

    this.value = initial;
    if (_.isFunction(fold)) {
        this.fold = fold;
    }
    this.context = _.isObject(context) ? context : this;

    this.addSource(source);
}

inherit(SubRepeater, FoldRepeater);

FoldRepeater.prototype.fold = _.identity;

FoldRepeater.prototype.onReceive = function(key, values, clock) {
    var merged = VectorClockArray
        .create()
        .append(this.clock, clock)
        .merge();
    if (merged === null) {
        return;
    }
    this.clock = merged;
    this.value = this.fold.apply(this.context, [this.value].concat(values));
};

Repeater.prototype.fold = function(initial, fold, context) {
    return new FoldRepeater(this, initial, fold, context);
};

// TODO

Repeater.prototype.unique = function() {
    return new UniqueRepeater(this);
};

// ### class methods

Repeater.create = function() {
    return new Repeater();
};

function JoinRepeater(sources) {
    SubRepeater.call(this);

    this.values = new Array(sources.length);
    this.clocks = new VectorClockArray(sources.length);

    // `indexOf` is a sparse array mapping keys (integers) to indices
    // (integers).
    this.indexOf = [];
    _.each(sources, function(source, index) {
        this.indexOf[source.key] = index;
        this.addSource(source);
    }, this);
}

inherit(JoinRepeater, SubRepeater);

JoinRepeater.prototype.onReceive = function(key, values, clock) {
    var index = this.indexOf[key];
    this.values[index] = value;
    this.clocks[index] = clock;
    var merged = this.clocks.merge();
    if (merged === null) {
        // Received arguments have inconsistent clocks. We only emit arrays of
        // values with consistent clocks.
        return;
    }
    this.clock = this.clock.merge(merged);
    this.emitMany(this.values);
};

Repeater.join = function(/*repeater, ...*/) {
    return new JoinRepeater(arguments);
};

// Create a state machine.
//
//     return := StateMachine
function StateMachine() {
    // A map of keys to $.Callbacks
    this.callbacks = {};
    // The global clock, representing all keys present in the system
    this.clock = new VectorClock();
    // A map of key to versioned value
    this.values = {};
}

// Get the current value of a key. This function does not make any guarantees on
// the system state and is generally useful for debugging outside bindings and
// calculations.
//
//     key := String
//     return := Value
StateMachine.prototype.get = function(key) {
    if (this.has(key)) {
        return this.values[key].value;
    }
    return undefined;
};

StateMachine.prototype.has = function(key) {
    return this.values.hasOwnProperty(key);
};

// Set a key/value pair without any sources. The value's clock will follow the
// global clock's value for that key. It will not depend on any other clocks.
//
//     key := String
//     value := Value
//     return := this
StateMachine.prototype.set = function(key, value) {
    assert(_.isString, key);
    var clock = new VectorClock();
    var vvalue = new VersionedValue(key, value, clock);
    this.setValue(vvalue);
    return this;
};

// Set key/value pairs from an object. Order is not guaranteed.
//
//     values := Object
//     return := this
StateMachine.prototype.setMany = function(values) {
    assert(_.isObject, values);
    _.each(values, function(value, key) {
        this.set(key, value);
    }, this);
    return this;
};

StateMachine.prototype.changed = function(key) {
    assert(_.isString, key);
    return this.has(key) ? this.values[key].changed : false;
};

// Get the callbacks list for a key.
//
//     return := $.Callbacks
StateMachine.prototype.getCallbacks = function(key) {
    assert(_.isString, key);
    return getDefault(this.callbacks, key, function() {
        return $.Callbacks('memory');
    });
};

// ### bindings and calculations

function StateView(state, keys) {
    assert(isInstance, state, StateMachine);
    assert(isKeys, keys);
    this.state = state;
    this.keys = keys;
}

StateView.prototype.isReady = function() {
    return (this.hasAll() &&
            this.anyChanged() &&
            this.isConsistent());
};

StateView.prototype.hasAll = function() {
    return _.all(this.keys, this.state.has, this.state);
};

StateView.prototype.anyChanged = function() {
    return _.any(this.keys, this.state.changed, this.state);
};

// Return `true` iff the clocks of all values represent consistent state.
//
//     return := Boolean
StateView.prototype.isConsistent = function() {
    return this.getClock() !== null;
};

StateView.prototype.getClock = function() {
    assert.call(this, this.hasAll);
    var clocks = _
        .chain(this.state.values)
        .pick(this.keys)
        .pluck('clock')
        .value();
    return VectorClock.mergeIfConsistent(clocks);
};

// Return an array of the sources in order. All sources must be present.
//
//     return := [Value, ...]
StateView.prototype.args = function() {
    assert.call(this, this.hasAll);
    return _.map(this.keys, this.state.get, this.state);
};

// Create a `Handle` for undoing stateful operations by attaching
// callbacks. Return a `Handle` from a function whose actions can be undone
// later.
//
//     return := Handle
function Handle() {
    this.onCancel = $.Callbacks('memory once');
}

// Call cancel callbacks. They are only called once.
//
//     return := this
Handle.prototype.cancel = function() {
    this.onCancel.fireWith(this, [this]);
    return this;
};

// Binding represents an association between a set of keyed values and a block
// of code that runs when those values have consistent history.
//
//     state := StateMachine
//     keys := [String, ...]
//     run := StateMachine function(Value, ...)
//     return := Binding
function Binding(state, keys, run) {
    this.view = new StateView(state, keys);
    assert(_.isFunction, run);
    this.run = run;
}

Binding.prototype.bind = function() {
    var handle = new Handle();
    var onValue = _.bind(this.onValue, this);
    _.each(this.keys, function(key) {
        var callbacks = this.state.getCallbacks(key);
        callbacks.add(onValue);
        handle.onCancel.add(function() {
            callbacks.remove(onValue);
        });
    }, this);
    return handle;
};

Binding.prototype.onValue = function() {
    if (this.view.isReady()) {
        this.onConsistent();
    }
};

Binding.prototype.onConsistent = function() {
    this.run.apply(this.view.state, this.view.args());
};

// Run a function when all the named values are available and their clocks
// indicate consistent state. `run` receives positional arguments for each of
// the `keys` in the order specified.
//
//     keys := [String, ...]
//     run := StateMachine function(Value, ...)
//     return := Handle
StateMachine.prototype.when = function(keys, run) {
    var binding = new Binding(this, keys, run);
    return binding.bind();
};

// `Calculation` is a `Binding` that creates a clocked value `target` from
// `sources`.
//
//     state := StateMachine
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
function Calculation(state, keys, target, calculate) {
    assert(target, _.isString);
    Binding.call(this, state, keys, calculate);
    this.target = target;
}

inherit(Calculation, Binding);

Calculation.prototype.clock = null;

// ### overrides

// Run when sources change.
Calculation.prototype.onConsistent = function() {
    // The clock for the result must be
    this.clock = this.view.getClock();
    var args = this.view.args();
    args.push(this.get());
    var result = this.run.apply(this.view.state, args);
    this.set(result);
};

// ### methods

Calculation.prototype.get = function() {
    return this.view.state.get(this.target);
};

Calculation.prototype.set = function(value) {
    var vvalue = new VersionedValue(this.target, value, this.clock);
    this.view.state.setValue(vvalue);
    return this;
};

// Calculate a promise, extracting the value when available.
function PromiseCalculation() {
    Calculation.apply(this, arguments);
}

inherit(PromiseCalculation, Calculation);

// ### data

PromiseCalculation.prototype.current = null;

// ### overrides

PromiseCalculation.prototype.set = function(current) {
    var calc = this;
    this.current = current;
    current.done(function() {
        if (current === calc.current) {
            Calculation.prototype.set.apply(calc, arguments);
        }
    });
};

// Create a value by combining other values. `calculate` receives positional
// arguments for each of the `keys` in the order specified, then the previous
// value of `target`.
//
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
//     return := Handle
StateMachine.prototype.calculate = function(keys, target, calculate) {
    var calculation = new Calculation(this, keys, target, calculate);
    return calculation.bind();
};

// See above. `calculate` is expected to return a promise that, if resolved,
// sets `target`.
//
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
//     return := Handle
StateMachine.prototype.calculatePromise = function(keys, target, calculate) {
    var calculation = new PromiseCalculation(this, keys, target, calculate);
    return calculation.bind();
};

// ### private api

// Add a clocked value to the machine.
//
//     value := VersionedValue
//     return := this
StateMachine.prototype.setValue = function(value) {
    assert(isInstance, value, VersionedValue);
    if (this.has(value.key)) {
        value.changed = !_.isEqual(value.value, this.get(value.key));
    }
    this.values[value.key] = value;
    this.clock = this.clock
        .next(value.key)
        .merge(value.clock)
        .merge(this.clock);
    this.getCallbacks(value.key)
        .fireWith(this, arguments);
    return this;
};

// Export.
frp.StateMachine = StateMachine;
