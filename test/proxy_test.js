//
// proxy
//

module('Proxy');

test('create', function() {
    ok(frp.Proxy.create());
});

module('Proxy.prototype', {
    'setup': function() {
        this.proxy = frp.Proxy.create();
    }
});

test('get', 1, function() {
    var expected = 'test';
    this.proxy.get('a').emit(expected);
    var b = frp.Stream.create();
    b.onEmit.add(function(value) {
        strictEqual(value, expected);
    });
    this.proxy.get('a').sendTo(b);
});
