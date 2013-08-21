// ## Vector Clocks
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
//     Key := String
//     Count := Number, int >= 0
/* global assert, getDefault, isInstance */

// Create a new vector clock.
//
//     keys := [Key, ...]
//     return := VectorClock
function VectorClock(keys/*?*/) {
    this.keys = _.isObject(keys) ? keys : {};
}

// ### instance methods

// Get the keyed value, returning a default if necessary.
//
//     key := Key
//     return := Count
VectorClock.prototype.get = function(key) {
    return getDefault(this.keys, Number);
};

// ### constructors

// Return a vector clock that follows only a specific key from the current
// clock.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.next = function(key) {
    var next = {};
    next[key] = this.get(key) + 1;
    return new VectorClock(next);
};

VectorClock.prototype.merge = function(clock) {
    var merged = _.clone(this.keys);
    _.each(clock.keys, function(key) {
        merged[key] = Math.max(this.get(key), clock.get(key));
    }, this);
    return copy;
};

// ### class methods

// Attempt to merge several vector clocks together. If clocks diverge on any
// keys, return `null`.
//
//     clock := VectorClock
//     return := VectorClock || null
VectorClock.mergeIfConsistent = function(/*clock, ...*/) {
    if (arguments.length === 0) {
        return null;
    }
    if (arguments.length === 1) {
        return arguments[1];
    }
    var merged = {};
    var isUnified = _.all(arguments, function(clock) {
        return _.all(clock.keys, function(value, key) {
            if (merged.hasOwnProperty(key) && (merged[key] !== value)) {
                return false;
            }
            merged[key] = value;
            return true;
        }, this);
    }, this);
    return isUnified ? new VectorClock(merged) : null;
};

// ### helper classes

function VectorClockArray() {
    Array.apply(this, arguments);
};

inherits(VectorClockArray, Array);

VectorClockArray.prototype.append = function() {
    this.push.apply(this, arguments);
    return this;
};

VectorClockArray.prototype.merge = function() {
    if (!this.isFull()) {
        return null;
    }
    return VectorClock.mergeIfConsistent.apply(VectorClock, this);
};

VectorClockArray.prototype.isFull = function() {
    for (var i = 0, len = this.length; i < len; i += 1) {
        if (this[i] === undefined) {
            return false;
        }
    }
    return true;
};

VectorClockArray.create = function() {
    return new VectorClockArray()
};

// Create a named valued associated with a vector clock.
//
//     key := String
//     value := Value
//     clock := VectorClock
//     return := VersionedValue
function VersionedValue(key, value, clock) {
    assert(_.isString, key);
    assert(isInstance, clock, VectorClock);
    this.key = key;
    this.value = value;
    this.clock = clock;
}

VersionedValue.prototype.changed = false;
