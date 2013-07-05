/* globals frp */

// ### utility functions

function isKeys(keys) {
    return (_.isArray(keys) &&
            (keys.length > 0) &&
            _.all(keys, _.isString));
}

function isInstance(object, Class) {
    return object instanceof Class;
}

function indexMap(array) {
    var map = {};
    _.each(array, function(str, index) {
        frp.assert(_.isString, str);
        map[str] = index;
    }, this);
    return map;
}

// Create a named valued associated with a vector clock.
//
//     key := String
//     value := Value
//     clock := VectorClock
//     return := ClockedValue
function ClockedValue(key, value, clock) {
    frp.assert(_.isString, key);
    frp.assert(_.isObject, clock);
    frp.assert(_.isFunction, clock.isUnified);
    frp.assert.call(clock, clock.isUnified);

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
    frp.assert(isKeys, keys);

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
        frp.assert.call(this.values, this.values.hasOwnProperty, key);
        return this.values[key].value;
    }, this);
};

// Set an indexed value in the sources array.
//
//     value := ClockedValue
//     return := this
Sources.prototype.set = function(value) {
    frp.assert(isInstance, value, ClockedValue);

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
    frp.assert(_.isString, key);

    if (!this.values.hasOwnProperty(key)) {
        return false;
    }
    var current = this.values[key];
    if (!this.last.hasOwnProperty(key)) {
        return true;
    }
    var last = this.last[key];
    return !_.isEqual(current.value, last.value);
};

// Get the merged clock for all received values.
//
//     return := VectorClock
Sources.prototype.getClock = function() {
    return frp.VectorClock.merge(_.pluck(this.values, 'clock'));
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
    return _.all(this.keys, function(key) {
        return this.values.hasOwnProperty(key);
    }, this);
};

// Create a `Handle` for undoing stateful operations by attaching
// callbacks. Return a `Handle` from a function whose actions can be undone
// later.
//
//     return := Handle
function Handle() {
    this.onCancel = $.Callbacks('memory once unique');
}

// Call cancel callbacks. They are only called once.
//
//     return := this
Handle.prototype.cancel = function() {
    this.onCancel.fireWith(this, [this]);
    return this;
};

// ## state machine

// ### private api

// Add a clocked value to the machine.
//
//     value := ClockedValue
//     return := this
function setValue(value) {
    frp.assert(isInstance, value, ClockedValue);

    this.values[value.key] = value.value;
    this.clock = frp.VectorClock.merge([this.clock, value.clock]).max();
    this.getCallbacks(value.key).fireWith(this, [value]);
    return this;
}

function Binding(state, keys) {
    _.bindAll(this, 'onValue');
    this.state = state;
    this.keys = keys;
    this.sources = new Sources(keys);
}
_.extend(Binding.prototype, {
    'onSources': $.noop,

    'bind': function() {
        var handle = new Handle();
        var onValue = this.onValue;
        _.each(this.keys, function(key) {
            var callbacks = this.state.getCallbacks(key);
            this.handle.onCancel.add(function() {
                callbacks.remove(onValue);
            });
            callbacks.add(onValue);
        }, this);
        return handle;
    },

    'onValue': function(value) {
        this.sources.set(value);
        if (this.sources.isReady()) {
            this.onSources();
        }
    }
});

function StateChange(state, keys, onKeys) {
    Binding.call(this, state, keys);
    this.onKeys = onKeys;
}
StateChange.prototype = frp.heir(Binding.prototype);

StateChange.prototype.onSources = function() {
    var args = this.sources.args();
    this.onKeys.apply(this.state, args);
};

function Calculation(state, keys, target, calculate) {
    Binding.call(this, state, keys);
    this.target = target;
    this.calculate = calculate;
}
Calculation.prototype = frp.heir(Binding.prototype);
_.extend(Calculation.prototype, {
    'setTarget': function(value) {
        var clock = this.sources.getClock().increment(this.target);
        var clocked = new ClockedValue(this.target, value, clock);
        setValue.call(this.state, clocked);
        return this;
    },

    'onSources': function() {
        var args = this.sources.args();
        args.push(this.state.get(this.target));
        var result = this.calculate.apply(this.state, args);
        this.handleValue(result);
    },

    'handleValue': function(result) {
        this.setTarget(result);
    }
});

function DeferredCalculation() {
    Calculation.apply(this, arguments);
}
DeferredCalculation.prototype = frp.heir(Calculation.prototype);
_.extend(DeferredCalculation.prototype, {
    'previous': null,

    'current': $.Deferred().resolve(),

    'onSources': function() {
        this.previous = this.current;
        this.current = null;
        Calculation.prototype.onSources.call(this);
    },

    'handleValue': function(result) {
        this.current = result;
        this.handleDeferred();
    },

    'handleDeferred': $.noop,

    'finish': function() {
        var calc = this;
        var current = this.current;
        return function(result) {
            if (current === calc.current) {
                calc.setTarget(result);
            }
        };
    }
});

function ChainedDeferredCalculation() {
    DeferredCalculation.apply(this, arguments);
}
ChainedDeferredCalculation.prototype = frp.heir(DeferredCalculation.prototype);

ChainedDeferredCalculation.prototype.handleDeferred = function() {
    var current = this.current;
    var finish = this.finish();
    this.previous.always(function() {
        current.done(finish);
    });
};

function InterruptDeferredCalculation() {
    DeferredCalculation.apply(this, arguments);
}
InterruptDeferredCalculation.prototype =
    frp.heir(DeferredCalculation.prototype);

InterruptDeferredCalculation.prototype.handleDeferred = function() {
    if (!_.isNull(this.previous) && _.isFunction(this.previous.abort)) {
        this.previous.abort();
    }
    this.current.done(this.finish());
};

// Create a state machine.
//
//     return := StateMachine
function StateMachine() {
    // A map of keys to $.Callbacks
    this.callbacks = {};
    // The global clock, representing all keys present in the system
    this.clock = frp.VectorClock.create();
    // A map of key to value
    this.values = {};
}
_.extend(StateMachine.prototype, {
    // ### public api

    // Get the current value of a key. This function is for debugging. It should
    // not be used to retrieve the current value for a key within callbacks.
    //
    //     key := String
    //     return := Value
    'get': function(key) {
        return this.values[key];
    },

    // Set a key/value pair without any sources. The value's clock will follow
    // the global clock's value for that key.
    //
    //     key := String
    //     value := Value
    //     return := this
    'set': function(key, value) {
        frp.assert(_.isString, key);

        var vclock = this.clock.next(key);
        var clocked = new ClockedValue(key, value, vclock);
        setValue.call(this, clocked);
        return this;
    },

    // Set key/value pairs from an object. Order is not guaranteed.
    //
    //     values := Object
    //     return := this
    'setMany': function(values) {
        frp.assert(_.isObject, values);

        _.each(values, function(value, key) {
            this.set(key, value);
        }, this);
        return this;
    },

    // Get the callbacks list for a key.
    //
    //     return := $.Callbacks
    'getCallbacks': function(key) {
        frp.assert(_.isString, key);

        return frp.getDefault.call(this, this.callbacks, key, function() {
            return $.Callbacks('memory unique');
        });
    },

    // Run a function when all the named values are available and their clocks
    // are unified. `calculate` receives positional arguments for each of the
    // `keys` in the order specified.
    //
    //     keys := [String, ...]
    //     onKeys := StateMachine function(Value, ...)
    //     return := Handle
    'on': function(keys, onKeys) {
        frp.assert(isKeys, keys);
        frp.assert(_.isFunction, onKeys);

        var binding = new StateChange(this, keys, onKeys);
        return binding.bind();
    },

    // Create a value by combining other values. If `calculate` returns a
    // `Deferred`, pass option `'interrupt'` to attempt to abort the current
    // operation in progress when starting a new one. Pass options `'chain'` to
    // wait until the previous `Deferred` completes, discarding its value,
    // before running the new operation. `calculate` receives positional
    // arguments for each of the `keys` in the order specified, then the
    // previous value of `target`.
    //
    //     keys := [String, ...]
    //     target := String
    //     calculate := StateMachine function(Value, ...) Value
    //     options := {'deferred': 'interrupt' || 'chain'}
    //     return := Handle
    'calculate': function(keys, target, calculate, options/*?*/) {
        frp.assert(isKeys, keys);
        frp.assert(_.isString, target);
        frp.assert(_.isFunction, calculate);

        var Calc = Calculation;
        if (_.isObject(options)) {
            if (options.deferred === 'interrupt') {
                Calc = InterruptDeferredCalculation;
            } else if (options.deferred === 'chain') {
                Calc = ChainedDeferredCalculation;
            }
        }
        var calculation = new Calc(this, keys, target, calculate);
        return calculation.bind();
    }
});

// Export.
frp.StateMachine = StateMachine;
