/* global frp, assert, getDefault, VectorClock, isKeys, isInstance */
/* global indexMap, inherit */

// Create a named valued associated with a vector clock.
//
//     key := String
//     value := Value
//     clock := VectorClock
//     return := ClockedValue
function ClockedValue(key, value, clock) {
    assert(_.isString, key);
    assert(_.isObject, clock);
    assert(_.isFunction, clock.isUnified);
    assert.call(clock, clock.isUnified);
    this.key = key;
    this.value = value;
    this.clock = clock;
}

// Create a sources array. This object exists to track clocks and determine if
// they are unified so that the state machine can run code.
//
//     keys := [String, ...]
//     return := Sources
function Sources(keys) {
    assert(isKeys, keys);
    this.keys = keys;
    // Map indexes to keys for constructing args.
    this.keyToIndex = indexMap(keys);
    // A map of key to clocked value
    this.values = {};
    // Previous values
    this.last = {};
}

Sources.prototype.args = function() {
    return _.map(this.keys, function(key) {
        assert.call(this.values, this.values.hasOwnProperty, key);
        return this.values[key].value;
    }, this);
};

// Set an indexed value in the sources array.
//
//     value := ClockedValue
//     return := this
Sources.prototype.set = function(value) {
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
Sources.prototype.valueChanged = function(key) {
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
//     return := VectorClock
Sources.prototype.getClock = function() {
    return VectorClock.merge(_.pluck(this.values, 'clock'));
};

// The sources are ready iff there is at least one change, they are all
// present, and their clocks are unified.
//
//     return := Boolean
Sources.prototype.isReady = function() {
    return (this.isPresent() &&
            this.isChanged() &&
            this.isUnified());
};

Sources.prototype.isUnified = function() {
    return this.getClock().isUnified();
};

Sources.prototype.isChanged = function() {
    return _.any(this.keys, this.valueChanged, this);
};

// Return true iff all values are present.
//
//     return := Boolean
Sources.prototype.isPresent = function() {
    return _.all(this.keys, this.hasValue, this);
};

Sources.prototype.hasValue = function(key) {
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
    this.clock = VectorClock.create();
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

    return getDefault.call(this, this.callbacks, key, function() {
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
    this.sources = new Sources(keys);
    assert(_.isFunction, run);
    this.bind = _.once(this.bind);
    this.state = state;
    this.run = run;
}

Binding.prototype.bind = function() {
    var handle = new Handle();
    var onValue = _.bind(this.onValue, this);
    _.each(this.keys, function(key) {
        var callbacks = this.state.getCallbacks(key);
        handle.onCancel.add(function() {
            callbacks.remove(onValue);
        });
        callbacks.add(onValue);
    }, this);
    return handle;
};

Binding.prototype.onValue = function(value) {
    assert(isInstance, value, ClockedValue);
    this.sources.set(value);
    if (this.sources.isReady()) {
        this.onSources();
    }
};

Binding.prototype.onSources = function() {
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
Calculation.prototype.onSources = function() {
    var args = this.sources.args();
    args.push(this.state.get(this.target));
    var result = this.run.apply(this.state, args);
    this.handleValue(result);
};

// Receive a value from a promise container.
//
//     result := Value
Calculation.prototype.handleValue = function(result) {
    this.setTarget(result);
};

// Calculate a promise, extracting the value when available.
function PromiseCalculation() {
    Calculation.apply(this, arguments);
}

inherit(PromiseCalculation, Calculation);

PromiseCalculation.prototype.previous = null;

PromiseCalculation.prototype.current = $.Deferred().resolve().promise();

PromiseCalculation.prototype.onSources = function() {
    this.previous = this.current;
    this.current = null;
    Calculation.prototype.onSources.call(this);
};

PromiseCalculation.prototype.handleValue = function(result) {
    this.current = result;
    this.handlePromise();
};

PromiseCalculation.prototype.handlePromise = function() {
    if (!_.isNull(this.previous) && _.isFunction(this.previous.abort)) {
        this.previous.abort();
    }
    this.current.done(this.finish());
};

//     return := function(Value)
PromiseCalculation.prototype.finish = function() {
    var calc = this;
    var current = this.current;
    return function(result) {
        if (current === calc.current) {
            calc.setTarget(result);
        }
    };
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
    assert(isKeys, keys);
    assert(_.isFunction, run);

    var binding = new Binding(this, keys, run);
    return binding.bind();
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

// Calculations can return a promise to represent a future result. There are two
// styles: interrupt, and chain. Interrupt attempts to call `.abort()` on the
// promise calculated before the current operation, if any. Chain waits until
// the previous promise completes before discarding its value in favor of the
// current operation's promise.
//
//     keys := [String, ...]
//     target := String
//     calculate := StateMachine function(Value, ...) Value
//     style := 'interrupt' || 'chain'
//     return := Handle
//     throw := Error
StateMachine.prototype.calculatePromise = function(
    keys, target, calculate, style) {
    assert(style, _.isString);
    var PromiseCalc;
    if (style === 'interrupt') {
        PromiseCalc = PromiseCalculation;
    } else if (style === 'chain') {
        PromiseCalc = ChainedPromiseCalculation;
    } else {
        throw new Error('calculate: bad options');
    }
    var calculation = new PromiseCalc(this, keys, target, calculate);
    return calculation.bind();
};

// ### private api

// Add a clocked value to the machine.
//
//     value := ClockedValue
//     return := this
StateMachine.prototype.setValue = function(value) {
    assert(isInstance, value, ClockedValue);
    this.values[value.key] = value.value;
    this.clock = VectorClock.merge([this.clock, value.clock]).max();
    this.getCallbacks(value.key).fireWith(this, [value]);
    return this;
};

// Export.
frp.StateMachine = StateMachine;
