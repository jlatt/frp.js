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
function VectorClock() {}

// ### instance methods

// Get the keyed value, returning a default if necessary.
//
//     key := Key
//     return := Count
VectorClock.prototype.get = function(key) {
    if (this.keys.hasOwnProperty(key)) {
        return this.keys[key];
    }
    return 0;
};

// ### constructors

// Return a vector clock that follows only a specific key from the current
// clock.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.next = function(key) {
    var next = new VectorClock();
    assert(function() { return !(key in next); });
    next[key] = this.get(key) + 1;
    return next;
};

VectorClock.prototype.merge = function(clock) {
    assert(isInstance, clock, VectorClock);
    var merged = new VectorClock();
    _.each([this, clock], function(merging) {
        _.each(merging, function(value, key) {
            merged[key] = Math.max(merged.get(key), value);
        }, this);
    }, this);
    return merged;
};

// ### class methods

// ### helper classes

function VectorClockArray() {}
VectorClockArray.prototype = [];
VectorClockArray.prototype.constructor = VectorClockArray;

VectorClockArray.prototype.append = function() {
    this.push.apply(this, arguments);
    return this;
};

// Attempt to merge several vector clocks together. If clocks diverge on any
// keys, return `null`.
//
//     return := VectorClock || null
VectorClockArray.prototype.merge = function() {
    if (this.length === 0) {
        return null;
    }
    if (this.length === 1) {
        return arguments[1];
    }
    if (this.isSparse()) {
        return null;
    }

    var merged = new VectorClock();
    var isUnified = _.all(this, function(clock) {
        return _.all(clock, function(value, key) {
            if (merged.hasOwnProperty(key) && (merged[key] !== value)) {
                return false;
            }
            merged[key] = value;
            return true;
        }, this);
    }, this);
    return isUnified ? merged : null;
};

VectorClockArray.prototype.isSparse = function() {
    for (var i = 0, len = this.length; i < len; i += 1) {
        if (!this.hasOwnProperty(i)) {
            return true;
        }
    }
    return false;
};

VectorClockArray.create = function() {
    return new VectorClockArray();
};
