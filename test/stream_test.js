module('Stream', {
    'setup': function() {
        this.stream = frp.Stream.create();
    }
});

test('create', 1, function() {
    ok(this.stream, 'create should return a stream');
});

test('prototype.emit', 1, function() {
    this.stream.onEmit.add(function() {
        ok(true, 'should call onEmit callbacks when emit() is called');
    });
    this.stream.emit(true);
});

test('prototype.sendTo', 1, function() {
    var testValue = 5;
    var stream2 = frp.Stream.create();
    stream2.receive = function(value) {
        strictEqual(value, testValue);
    };
    this.stream.sendTo(stream2);
    this.stream.emit(testValue);
});

test('prototype.unSendTo', 0, function() {
    var stream2 = frp.Stream.create();
    stream2.receive = function() {
        ok(false);
    };
    this.stream.sendTo(stream2);
    this.stream.unSendTo(stream2);
    this.stream.emit();
});

test('prototype.cancel', 1, function() {
    this.stream.onCancel.add(function() {
        ok(true);
    });
    this.stream.cancel();
    this.stream.cancel();
});

test('prototype.pipe', 1, function() {
    var piped = this.stream.pipe(function() {
        ok(true);
    });
    this.stream.emit();
});

test('prototype.identity', 1, function() {
    var testValue = 5;
    var ident = this.stream.identity();
    ident.onEmit.add(function(value) {
        strictEqual(value, testValue);
    })
    this.stream.emit(testValue);
});

test('prototype.constant', 1, function() {
    var testValue = true;
    var constant = this.stream.constant(testValue);
    constant.onEmit.add(function(value) {
        strictEqual(value, testValue);
    });
    this.stream.emit();
});

var testIterate = function(testValues, expected, block) {
    return function() {
        expect(expected.length);
        var expectedIndex = 0;
        var iter = block.call(this);
        iter.onEmit.add(function(value) {
            strictEqual(value, expected[expectedIndex]);
            ++expectedIndex;
        });
        _.each(testValues, function(testValue) {
            this.stream.emit(testValue);
        }, this); 
    };
};

test('prototype.map', testIterate([5, 6, 7], [15, 18, 21], function() {
    return this.stream.map(function(value) {
        return value * 3;
    });
}));

test('prototype.filter', testIterate([1, 2, 3, 4], [1, 3], function() {
    return this.stream.filter(function(value) {
        return !!(value % 2);
    });
}));

test('prototype.fold', testIterate([1, 2, 3, 4], [1, 3, 6, 10], function() {
    return this.stream.fold(function(value, lastValue) {
        return value + lastValue;
    }, 0);
}));

test('prototype.takeWhile', testIterate([1, 2, 3, 4, 5], [1, 2, 3], function() {
    return this.stream.takeWhile(function(value) {
        return value < 4;
    });
}));

test('prototype.dropWhile', testIterate([1, 2, 3, 4, 5], [4, 5], function() {
    return this.stream.dropWhile(function(value) {
        return value < 4;
    });
}));

test('prototype.unique', testIterate([1, 2, 3, 3, 3, 4, 4], [1, 2, 3, 4], function() {
    return this.stream.unique();
}));
