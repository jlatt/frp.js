// ## Vector Clocks
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
//     Key := String
//     Count := Number, int >= 0
/* global assert, getDefault */

// Create a new vector clock.
//
//     keys := [Key, ...]
//     return := VectorClock
function VectorClock(keys) {
    this.keys = keys;
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

// Return a copy with `name` incremented by 1.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.increment = function(key) {
    var incremented = _.clone(this.keys);
    incremented[key] += 1;
    return new VectorClock(incremented);
};

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

VectorClock.prototype.copyFrom = function(clock) {
    var copy = new VectorClock(_.clone(this.keys));
    _.each(clock.keys, function(key) {
        this.keys[key] = Math.max(this.get(key), clock.get(key));
    }, this);
    return copy;
};

// ### class methods

// Merge several vector clocks together. If clocks diverge on any keys, return
// `null`.
//
//     clock := VectorClock
//     return := VectorClock || null
VectorClock.merge = function(/*clock, ...*/) {
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
