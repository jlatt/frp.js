// Vector Clocks
// -------------
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
/* globals frp */

// Create a new vector clock.
//
//     return := VectorClock
function VectorClock() {}

// Wrap the constructor for ease.
//
//     return := VectorClock
VectorClock.create = function() {
    return new VectorClock();
};

// Map names to integers. Since vector clocks are read-only structures, it's
// safe to use this so long as the name `clocks` is overridden in new instances.
VectorClock.prototype.clocks = {};

function returnZero() {
    return 0;
}

// Get the value of a key in the clock. Returns an integer >= 0.
//
//     key := String
//     return := Number, integer > 0
VectorClock.prototype.getClock = function(key) {
    return frp.getDefault.call(this, this.clocks, key, returnZero);
};

// Return `true` iff this clock is a descendant of `other`.
//
//     other := VectorClock
//     return := Boolean
VectorClock.prototype.descends = function(other) {
    return _.all(other.clocks, function(value, key) {
        return this.getClock(key) >= value;
    }, this);
};

// Merge this vector clock with another.
//
//     other := VectorClock
//     return := VectorClock
VectorClock.prototype.merge = function(other) {
    var merged = VectorClock.create();
    merged.clocks = frp.heir(merged.clocks);
    var vclocks = _.chain([this, other]);
    vclocks
        .pluck('clocks')
        .map(_.keys)
        .union()
        .sort()
        .uniq(/*sorted=*/true)
        .each(function(key) {
            merged.clocks[key] = vclocks
                .invoke('getClock', key)
                .max()
                .value();
        }, this);
};

// Return a vector clock with `name` incremented by 1.
//
//     name := String
//     return := VectorClock
VectorClock.prototype.increment = function(name) {
    var incr = VectorClock.create();
    incr.clocks = frp.heir(this.clocks);
    incr.clocks[name] = incr.getClock(name) + 1;
    return incr;
};

// Export.
frp.VectorClock = VectorClock;
