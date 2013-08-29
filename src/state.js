/* global frp, assert, getDefault, isKeys, isInstance, Sequence, inherit */
/* global VectorClock, VectorClockArray */

function Repeater() {
    this.id = this.idSequence.next();
    this.onValue = $.Callbacks('memory');
    this.onCancel = $.Callbacks('memory once');
}

Repeater.prototype.clock = new VectorClock();

Repeater.prototype.idSequence = new Sequence();

Repeater.prototype.cancel = function() {
    this.onCancel.fire(this, [this]);
    return this;
};

Repeater.prototype.emit = function(value) {
    return this.emitMany([value]);
};

Repeater.prototype.emitMany = function(values) {
    this.clock = this.clock.next(this.id).merge(this.clock);
    this.onValue.fireWith(this, [this.id, values, this.clock]);
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
    return this;
};

// map

function MapRepeater(source, map/*?*/, context/*?*/) {
    SubRepeater.call(this);

    if (_.isFunction(map)) {
        this.map = map;
    }
    this.context = _.isObject(context) ? context : this;

    this.addSource(source);
    this.onValue.lock();
}

inherit(MapRepeater, SubRepeater);

MapRepeater.prototype.map = _.identity;

MapRepeater.prototype.onReceive = function(id, values, clock) {
    this.clock = this.clock.merge(clock);
    var value = this.map.apply(this.context, values);
    this.emit(value);
};

Repeater.prototype.map = function(func, context) {
    return new MapRepeater(this, func, context);
};

// TODO unique

function UniqueRepeater(source) {
    SubRepeater.call(this);
    this.addSource(source);
    this.onValue.lock();
}

inherits(UniqueRepeater, SubRepeater);


UniqueRepeater.prototype.onReceive = function(id, values, clock) {
    if (this.hasOwnProperty('values') && _.isEqual(this.values, values)) {
        return;
    }

    this.values = values;
    this.onValue.fireWith(this, arguments);
};

Repeater.prototype.unique = function() {
    return new UniqueRepeater(this);
};

// ### class methods

Repeater.create = function() {
    return new Repeater();
};

// join

function JoinRepeater(sources) {
    SubRepeater.call(this);

    this.values = [];
    this.clocks = new VectorClockArray();

    // `indexOf` is a sparse array mapping ids (integers) to indices
    // (integers).
    this.indexOf = [];
    _.each(sources, function(source, index) {
        this.indexOf[source.id] = index;
        this.addSource(source);
    }, this);
    this.onValue.lock();
}

inherit(JoinRepeater, SubRepeater);

JoinRepeater.prototype.onReceive = function(id, values, clock) {
    var index = this.indexOf[id];
    this.values[index] = values;
    this.clocks[index] = clock;
    var merged = this.clocks.merge();
    if (merged === null) {
        // Received arguments have inconsistent clocks. We only emit arrays of
        // values with consistent clocks.
        return;
    }
    this.clock = this.clock.merge(merged);
    this.emitMany(_.flatten(this.values, /*shallow=*/true));
};

Repeater.join = function(/*repeater, ...*/) {
    return new JoinRepeater(arguments);
};

// ## Proxy

function ProxyRepeater() {
    SubRepeater.call(this);
}

inherits(ProxyRepeater, SubRepeater);

ProxyRepeater.prototype.onReceive = function() {
    this.onValue.fireWith(this, arguments);
};

ProxyRepeater.prototype.addSource = function() {
    var retVal = SubRepeater.prototype.addSource.apply(this, arguments);
    this.onValue.lock();
    return retVal;
};

ProxyRepeater.create = function() {
    return new ProxyRepeater();
};

function Proxy() {
    this.repeaters = {};
}

Proxy.prototype.get = function(name) {
    return getDefault(this.repeaters, name, ProxyRepeater.create);
};

Proxy.prototype.getMany = function(/*name, ...*/) {
    return _
        .chain(arguments)
        .flatten(/*shallow=*/true)
        .map(this.get, this)
        .value();
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
