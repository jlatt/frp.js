module('util');

test('assert', function() {
    throws(function() {
        frp.assert(false);
    }, 'assertion failed');

    throws(function() {
        frp.assert(false, 'message');
    }, 'message');
});

test('getDefault', function() {
    var test = {'foo': true, 'bar': undefined};
    function returnZero() {
        return 0;
    }
    strictEqual(frp.getDefault(test, 'foo', returnZero), true);
    strictEqual(frp.getDefault(test, 'bar', returnZero), undefined);
    strictEqual(frp.getDefault(test, 'baz', returnZero), 0);
});
