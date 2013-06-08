function VectorClock() {}

VectorClock.create = function() {
    return new VectorClock();
};

VectorClock.prototype.clocks = {};

function returnZero() {
    return 0;
}

// Get the value of a key in the clock. Returns an integer >= 0.
VectorClock.prototype.getClock = function(key) {
    return frp.getDefault.call(this, this.clocks, key, returnZero);
};

// Return `true` iff this clock is a descendant of `other`.
VectorClock.prototype.descends = function(other) {
    return _.all(other.clocks, function(value, key) {
        return this.getClock(key) >= value;
    }, this);
};

// new clocks

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

VectorClock.prototype.increment = function(name) {
    var incr = VectorClock.create();
    incr.clocks = frp.heir(this.clocks);
    incr.clocks[name] = incr.getClock(name) + 1;
    return incr;
};

//
// export
//

frp.VectorClock = VectorClock;
