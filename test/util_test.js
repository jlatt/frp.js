//
// basic class
//

module('Class', {
    'setup': function() {
        this.cls = frp.Class.create();
    }
});

test('create', 2, function() {
    strictEqual(this.cls.constructor.create, frp.Class.create);
    strictEqual(this.cls.constructor.extend, frp.Class.extend);
});

//
// id set
//

module('IdSet', {
    'setup': function() {
        this.set = frp.IdSet.create();
    }
});

test('create', 1, function() {
    ok(this.set);
});

//
// callable interface
//

// currently unused
module('Callable');
