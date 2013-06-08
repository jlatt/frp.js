//
// util
//

var testIterate = function(testValues, expected, block) {
    return function() {
        expect(expected.length);
        var expectedIndex = 0;
        var iter = block.call(this);
        iter.onEmit.add(function(value) {
            deepEqual(value, expected[expectedIndex]);
            ++expectedIndex;
        });
        _.each(testValues, function(testValue) {
            this.stream.emit(testValue);
        }, this);
    };
};

var testNotImplemented =  function() {
    expect(1);
    ok(false, 'unimplemented');
};

//
// stream
//

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

test('merge', testNotImplemented);

test('prototype.merge', testNotImplemented);

test('$', testNotImplemented);

test('gmap', testNotImplemented);

test('interval', testNotImplemented);
