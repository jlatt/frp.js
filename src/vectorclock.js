// ## Vector Clocks
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
//     Key := String
//     Count := Number, int >= 0
/* global frp, assert, getDefault */

// Create a new vector clock. These vector clocks can represent clocks for
// individual and sets of values. We use the term *unified* to indicate a clock
// which does not have multiple values for a key. The collection of values
// represented by a unified clock have consistent histories. In the state
// machine, this usually means that it is safe to execute code requiring those
// multiple values.
//
//     keys := [Key, ...]
//     return := VectorClock
function VectorClock(keys/*?*/) {
    this.keys = _.isObject(keys) ? keys : {};
}

// ### class methods

// Wrap the constructor for ease.
//
//     keys := [Key, ...]
//     return := VectorClock
VectorClock.create = function(keys/*?*/) {
    return new VectorClock(keys);
};

// Merge several vector clocks together. Clock values are listed uniquely in
// order.
//
//     clocks := [VectorClock, ...]
//     return := VectorClock
VectorClock.merge = function(clocks) {
    var _keys = _.chain(clocks)
        .pluck('keys');
    var clock = new VectorClock();
    _.chain(clocks)
        .pluck('keys')
        .map(_.keys)
        .flatten(/*shallow=*/true)
        .sort()
        .uniq(/*sorted=*/true)
        .each(function(key) {
            clock.keys[key] = _keys
                .pluck(key)
                .compact()
                .flatten(/*shallow=*/true)
                .sort()
                .uniq(/*sorted=*/true)
                .value();
        }, this);
    return clock;
};

// ### instance methods

// Get the keyed value, returning a default if necessary.]
//
//     key := Key
//     return := [Count, ...]
VectorClock.prototype.get = function(key) {
    return getDefault.call(this, this.keys, function() {
        return [0];
    });
};

// Return `true` iff the clock is unified.
//
//     return := Boolean
VectorClock.prototype.isUnified = function() {
    return _.chain(this.keys)
        .values()
        .pluck('length')
        .all(function(length) {
            return length === 1;
        }, this)
        .value();
};

// ### constructors

// Copy a vector clock's keys to a new instance.
//
//     return := VectorClock
VectorClock.prototype.copy = function() {
    var vclock = new VectorClock();
    _.extend(vclock.keys, this.keys);
    return vclock;
};

// Return a copy with `name` incremented by 1.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.increment = function(key) {
    var vclock = this.copy();
    assert(function() {
        return vclock.hasOwnProperty(key) && (vclock[key].length === 1);
    });
    ++vclock[key][0];
    return vclock;
};

// Return a vector clock with only the maximum values appearing in each key
// set. The returned clock is always unified.
//
//     return := VectorClock
VectorClock.prototype.max = function() {
    var vclock = this.copy();
    _.each(vclock.keys, function(counts, key) {
        vclock.keys[key] = [_.max(counts)];
    }, this);
    return vclock;
};

// Return a vector clock that follows only a specific key from the current
// clock.
//
//     key := Key
//     return := VectorClock
VectorClock.prototype.next = function(key) {
    var keys = {};
    keys[key] = this.get(key) + 1;
    return new VectorClock(keys);
};

// Export.
frp.VectorClock = VectorClock;
