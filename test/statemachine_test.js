module('StateMachine');

test('create', function() {
    ok(frp.StateMachine.create());
});

module('StateMachine.prototype', {
    'setup': function() {
        this.stateMachine = StateMachine.create();
    }
});

test('on', function() {
    this.stateMachine.set('foo', 1);
    this.stateMachine.on(['foo'], function(foo) {
        strictEqual(1, foo);
    });

    this.stateMachine.on(['bar'], function(bar) {
        strictEqual(2, bar);
    });
    this.stateMachine.set('bar', 2);
});
