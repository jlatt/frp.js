/* global frp, assert, getDefault, VectorClock, isKeys, isInstance */
/* global inherit, VersionedValue */

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
// value of `target`. If option `promise` is passed, `calculate` is expected to
// return a `Promise` for a future value of the calculation.
//
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
//     options := {'promise': true}
//     return := Handle
StateMachine.prototype.calculate = function(
    keys, target, calculate, options/*?*/) {
    var Calc = Calculation;
    if (_.isObject(options) && ('promise' in options)) {
        Calc = PromiseCalculation;
    }
    var calculation = new Calc(this, keys, target, calculate);
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
