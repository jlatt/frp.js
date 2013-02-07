(function() {
    'use strict';

    function VectorClock() {};
    frp.Class.extend(VectorClock);

    VectorClock.prototype.clocks = {};

    // Get the value of a key in the clock. Returns an integer >= 0.
    VectorClock.prototype.getClock = function(key) {
        return this.clocks[key] || 0;
    };

    // Return `true` iff this clock is a descendant of `other`.
    VectorClock.prototype.descends = function(other) {
        return _.all(other.clocks, function(value, key) {
            return this.getClock(key) >= value;
        }, this);
    };

    // new clocks

    VectorClock.prototype.merge = function(other) {
        var merged = this.constructor.create();
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
        var incr = this.constructor.create();
        incr.clocks = frp.heir(this.clocks);
        incr.clocks[name] = incr.getClock(name) + 1;
        return incr;
    };

    //
    // export
    //

    frp.VectorClock = VectorClock;

}).call(this);
