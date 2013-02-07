(function(frp) {
    'use strict';

    var heir = (('__proto__' in 'test') ?
                function(object) {
                    return {'__proto__': object};
                } :
                function(object) {
                    function Heir() {};
                    Heir.prototype = object;
                    return new Heir();
                });

    function VectorClock() {
        this.clocks = {};
    };
    frp.Class.extend(VectorClock);

    // Get the value of a key in the clock. Returns an integer >= 0.
    VectorClock.prototype.getClock = function(key) {
        return this.clocks.hasOwnProperty(key) ? this.clocks[key] : 0;
    };

    // Return `true` iff this clock is a descendant of `other`.
    VectorClock.prototype.descends = function(other) {
        return _.all(other.clocks, function(value, key) {
            return this.getClock(key) >= value;
        }, this);
    };

    // new clocks

    VectorClock.prototype.merge = function(other) {
        var merged = VectorClock.create(this.name);
        _.chain([this, other])
            .pluck('clocks')
            .map(_.keys)
            .union()
            .sort()
            .uniq(/*sorted=*/true)
            .each(function(key) {
                merged.clocks[key] = _.chain([this, other])
                    .invoke('getClock', key)
                    .max()
                    .value();
            }, this);

        // Safely increment this clock's local value, just in case the other
        // clock descends from some future value of this clock. This shouldn't
        // happen in practice, but the implementation should avoid misuse of the
        // clocks if possible.
        merged.clocks[this.name] = Math.max(merged.getClock(), this.getClock(this.name) + 1);

        return merged;
    };

    VectorClock.prototype.increment = function(name) {
        var incr = heir(this);
        incr.name = name;
        incr[name] = incr.getClock(name) + 1;
        return incr;
    };

    //
    // export
    //

    frp.VectorClock = VectorClock;

}).call(this, this.frp = this.frp || {});
