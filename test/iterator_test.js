module('iter');

var iter = frp.iter;
var VARIED = [5, null, undefined, 'foobar'];
var NUMBERS = [1, 2, 3, 4, 5];

// testValues := []
// receive := function(input, output) {}
function testIter(testValues, iterator, receive) {
    _.each(testValues, function(input) {
        iterator.call(this, input, function(output) {
            receive.call(this, input, output);
        });
    }, this);
}

function expectEqual(expect, equal) {
    return function(input, output) {
        equal(output, expect.shift());
    };
}

test('identity', 4, function() {
    testIter.call(this, VARIED, iter.identity(), function(input, output) {
        strictEqual(output, input);
    });
});

test('map', 5, function() {
    function square(v) {
        return v * v;
    }
    var iterator = iter.map(square);
    testIter.call(this, NUMBERS, iterator, function(input, output) {
        strictEqual(output, square(input));
    });
});

test('mapApply', 3, function() {
    var inputs = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    function sum(a, b, c) {
        return a + b + c;
    }
    var iterator = iter.mapApply(sum);
    testIter.call(this, inputs, iterator, function(input, output) {
        strictEqual(output, sum.apply(this, input));
    });
});

test('filter', 3, function() {
    function odd(n) {
        return (n % 2) === 1;
    }
    var iterator = iter.filter(odd);
    testIter.call(this, NUMBERS, iterator, function(input, output) {
        ok(odd(output));
    }, this);
});

test('fold', 5, function() {
    var iterator = iter.fold(0, function(s, n) {
        return s + n;
    });
    var expect = [1, 3, 6, 10, 15];
    testIter.call(this, NUMBERS, iterator, expectEqual(expect, strictEqual));
});

test('constant', 4, function() {
    var testVal = 7;
    var iterator = iter.constant(testVal);
    testIter.call(this, VARIED, iterator, function(input, output) {
        strictEqual(output, testVal);
    });
});

test('lastN', 5, function() {
    var iterator = iter.lastN(3);
    var expect = [[1], [2, 1], [3, 2, 1], [4, 3, 2], [5, 4, 3]];
    testIter.call(this, NUMBERS, iterator, expectEqual(expect, deepEqual));
});

test('onceThen', 5, function() {
    var testVal = 23;
    var iterator = iter.onceThen(
        iter.map(function(v) { return v + 10; }),
        iter.constant(testVal)
    );
    var expect = [11, 23, 23, 23, 23];
    testIter.call(this, NUMBERS, iterator, expectEqual(expect, strictEqual));
});

test('unique', 4, function() {
    var inputs = [1, 1, 1, 2, 2, 3, 3, 3, 4, 4];
    var expect = [1, 2, 3, 4];
    testIter.call(this, inputs, iter.unique(), expectEqual(expect, strictEqual));
});

test('takeWhile', 4, function() {
    function lessThanFour(v) {
        return v < 4;
    }
    var iterator = iter.takeWhile(lessThanFour);
    var expect = [0, 1, 2, 3];
    testIter.call(this, _.range(10), iterator, expectEqual(expect, strictEqual));
});

test('dropWhile', 5, function() {
    function lessThanFive(v) {
        return v < 5;
    }
    var iterator = iter.dropWhile(lessThanFive);
    var expect = [5, 6, 7, 8, 9];
    testIter.call(this, _.range(10), iterator, expectEqual(expect, strictEqual));
});

test('chain', 4, function() {
    var iterator = iter.chain(
        iter.map(function(v) { return v + 2; }),
        iter.map(function(v) { return v * 3; }),
        iter.filter(function(v) { return v > 10; }),
        iter.identity(),
        iter.identity(),
        iter.map(function(v) { return [v, 5]; }),
        iter.mapApply(function(v1, v2) { return v1 + v2; }));
    var expect = [17, 20, 23, 26];
    testIter.call(this, NUMBERS, iterator, function(input, output) {
        strictEqual(output, expect.shift());
    });
});
