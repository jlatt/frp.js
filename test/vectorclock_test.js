module('VectorClock');

test('create', function() {
    ok(frp.VectorClock.create(), 'constructor failed');
});

module('VectorClock.prototype', {
    'setup': function() {
        this.vclock = frp.VectorClock.create();
    },
    'teardown': function() {
        delete this.vclock;
    }
});

test('getClock', function() {
    _.each(['foo', 'bar', 'baz', 'foo'], function(key) {
        strictEqual(this.vclock.getClock(key), 0);
    }, this);
});

test('increment', function() {
    var other = this.vclock.increment('foo');
    ok(other.descends(this.vclock));
    ok(!this.vclock.descends(other));
});

test('descends', function() {
    var other1 = frp.VectorClock.create();
    var other2 = this.vclock.increment('foo');
    ok(this.vclock.descends(other1));
    ok(other1.descends(this.vclock));
    ok(other2.descends(this.vclock));
    ok(!this.vclock.descends(other2));
});
