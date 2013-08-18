/* global frp, assert, getDefault, VectorClock, isKeys, isInstance */
/* global inherit */

// Create a named valued associated with a vector clock.
//
//     key := String
//     value := Value
//     clock := VectorClock
//     return := ClockedValue
function ClockedValue(key, value, clock) {
    assert(_.isString, key);
    assert(isInstance, clock, VectorClock);
    this.key = key;
    this.value = value;
    this.clock = clock;
}

// Create a sources array. This object exists to track clocks and determine if
// they are unified so that the state machine can run code.
//
//     keys := [String, ...]
//     return := ClockedValueList
function ClockedValueList(keys) {
    assert(isKeys, keys);
    this.keys = keys;
    // A map of key to clocked value
    this.values = {};
    // Previous values
    this.last = {};
}

// Return an array of the sources in order. All sources must be present.
//
//     return := [Value, ...]
ClockedValueList.prototype.args = function() {
    assert.call(this, this.isPresent);
    return _.map(this.keys, function(key) {
        return this.values[key].value;
    }, this);
};

// Set an indexed value in the sources array.
//
//     value := ClockedValue
//     return := this
ClockedValueList.prototype.set = function(value) {
    assert(isInstance, value, ClockedValue);
    this.last[value.key] = this.values[value.key];
    this.values[value.key] = value;
    return this;
};

// Return `true` iff the current value is different from the previous value for
// a key.
//
//     key := String
//     return := Boolean
ClockedValueList.prototype.valueChanged = function(key) {
    assert(_.isString, key);
    if (!this.values.hasOwnProperty(key)) {
        return false;
    }
    if (!this.last.hasOwnProperty(key)) {
        return true;
    }
    var current = this.values[key];
    var last = this.last[key];
    return !_.isEqual(current.value, last.value);
};

// Get the merged clock for all received values.
//
//     return := VectorClock || null
ClockedValueList.prototype.getClock = function() {
    return VectorClock.merge(_.pluck(this.values, 'clock'));
};

// The sources are ready iff there is at least one change, they are all
// present, and their clocks are consistent.
//
//     return := Boolean
ClockedValueList.prototype.isReady = function() {
    return (this.isPresent() &&
            this.isChanged() &&
            this.hasClock());
};

// Return `true` iff the clocks of all values represent consistent state.
//
//     return := Boolean
ClockedValueList.prototype.hasClock = function() {
    return this.getClock() !== null;
};

ClockedValueList.prototype.isChanged = function() {
    return _.any(this.keys, this.valueChanged, this);
};

// Return true iff all values are present.
//
//     return := Boolean
ClockedValueList.prototype.isPresent = function() {
    return _.all(this.keys, this.hasValue, this);
};

ClockedValueList.prototype.hasValue = function(key) {
    return this.values.hasOwnProperty(key);
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

// ## state machine

// Create a state machine.
//
//     return := StateMachine
function StateMachine() {
    // A map of keys to $.Callbacks
    this.callbacks = {};
    // The global clock, representing all keys present in the system
    this.clock = new VectorClock();
    // A map of key to value
    this.values = {};
}

// Get the current value of a key. This function does not make any guarantees on
// the system state and is only useful outside `Binding`s for debugging
// purposes.
//
//     key := String
//     return := Value
StateMachine.prototype.get = function(key) {
    return this.values[key];
};

// Set a key/value pair without any sources. The value's clock will follow the
// global clock's value for that key.
//
//     key := String
//     value := Value
//     return := this
StateMachine.prototype.set = function(key, value) {
    assert(_.isString, key);
    var vclock = this.clock.next(key);
    var clocked = new ClockedValue(key, value, vclock);
    this.setValue(clocked);
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

// Get the callbacks list for a key.
//
//     return := $.Callbacks
StateMachine.prototype.getCallbacks = function(key) {
    assert(_.isString, key);
    return getDefault(this.callbacks, key, function() {
        return $.Callbacks('memory');
    });
};

// Binding represents an association between a set of keyed values and a block
// of code that runs when those values have consistent history.
//
//     state := StateMachine
//     keys := [String, ...]
//     run := StateMachine function(Value, ...)
//     return := Binding
function Binding(state, keys, run) {
    assert(isInstance, state, StateMachine);
    this.state = state;
    this.sources = new ClockedValueList(keys);
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

Binding.prototype.onValue = function(value) {
    assert(isInstance, value, ClockedValue);
    this.sources.set(value);
    if (this.sources.isReady()) {
        this.allValuesReady();
    }
};

Binding.prototype.allValuesReady = function() {
    var args = this.sources.args();
    this.run.apply(this.state, args);
};

// `Calculation` is a `Binding` that creates a clocked value `target` from
// `sources`.
//
//     state := StateMachine
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
function Calculation(state, keys, target, calculate) {
    Binding.call(this, state, keys, calculate);
    assert(target, _.isString);
    this.target = target;
}

inherit(Calculation, Binding);

Calculation.prototype.setTarget = function(value) {
    var clock = this.sources.getClock().increment(this.target);
    var clocked = new ClockedValue(this.target, value, clock);
    this.state.setValue(clocked);
    return this;
};

// Run when sources change.
Calculation.prototype.allValuesReady = function() {
    var args = this.sources.args();
    args.push(this.state.get(this.target));
    var result = this.run.apply(this.state, args);
    this.setTarget(result);
};

// Calculate a promise, extracting the value when available.
function PromiseCalculation() {
    Calculation.apply(this, arguments);
}

inherit(PromiseCalculation, Calculation);

PromiseCalculation.prototype.previous = null;

PromiseCalculation.prototype.current = $.Deferred().resolve().promise();

PromiseCalculation.prototype.allValuesReady = function() {
    this.previous = this.current;
    this.current = null;
    Calculation.prototype.allValuesReady.call(this);
};

PromiseCalculation.prototype.setTarget = function(promise) {
    this.current = promise;
    this.handlePromise();
};

PromiseCalculation.prototype.handlePromise = function() {
    this.current.done(this.finish());
};

//     return := function(Value)
PromiseCalculation.prototype.finish = function() {
    var calc = this;
    var current = this.current;
    return function() {
        if (current === calc.current) {
            Calculation.prototype.setTarget.apply(calc, arguments);
        }
    };
};

function InterruptPromiseCalculation() {
    PromiseCalculation.apply(this, arguments);
}

inherit(InterruptPromiseCalculation, PromiseCalculation);

InterruptPromiseCalculation.prototype.handlePromise = function() {
    if (_.isObject(this.previous) && _.isFunction(this.previous.abort)) {
        this.previous.abort();
    }
    PromiseCalculation.prototype.handlePromise.call(this);
};

function ChainedPromiseCalculation() {
    PromiseCalculation.apply(this, arguments);
}

inherit(ChainedPromiseCalculation, PromiseCalculation);

ChainedPromiseCalculation.prototype.handlePromise = function() {
    var current = this.current;
    var finish = this.finish();
    this.previous.always(function() {
        current.done(finish);
    });
};

// Run a function when all the named values are available and their clocks are
// unified. `calculate` receives positional arguments for each of the `keys` in
// the order specified.
//
//     keys := [String, ...]
//     run := StateMachine function(Value, ...)
//     return := Handle
StateMachine.prototype.on = function(keys, run) {
    var binding = new Binding(this, keys, run);
    return binding.bind();
};

// Create a value by combining other values. `calculate` receives positional
// arguments for each of the `keys` in the order specified, then the previous
// value of `target`. If option `promise` is passed, `calculate` is expected to
// return a `Promise` for a future value of the calculation. If `promise` is
// `interrupt`, the previous promise is aborted when a new promise is
// generated. If `promise` is `chain`, the generated promise will not set its
// value until after the previous promise completes. The value of the previous
// promise is always discarded.
//
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
//     options := {'promise': (true || 'interrupt' || 'chain')}
//     return := Handle
StateMachine.prototype.calculate = function(
    keys, target, calculate, options/*?*/) {
    var Calc = Calculation;
    if (_.isObject(options) && ('promise' in options)) {
        Calc = PromiseCalculation;
        if (options.promise === 'interrupt') {
            Calc = InterruptPromiseCalculation;
        } else if (options.promise === 'chain') {
            Calc = ChainedPromiseCalculation;
        }
    }
    var calculation = new Calc(this, keys, target, calculate);
    return calculation.bind();
};

// ### private api

// Add a clocked value to the machine.
//
//     cvalue := ClockedValue
//     return := this
StateMachine.prototype.setValue = function(cvalue) {
    assert(isInstance, cvalue, ClockedValue);
    this.values[cvalue.key] = cvalue.value;
    this.clock = this.clock.copyFrom(cvalue.clock);
    this.getCallbacks(cvalue.key)
        .fireWith(this, [cvalue]);
    return this;
};

// Export.
frp.StateMachine = StateMachine;
