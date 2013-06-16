module('Stream');

test('create', 1, function() {
    ok(frp.Stream.create(), 'create should return a stream');
});

test('merge', 5, function() {
    var streams = [];
    _.times(5, function() {
        streams.push(frp.Stream.create());
    }, this);
    var merged = frp.Stream.merge(streams);

    var expected = _.range(5);
    merged.onEmit.add(function(value) {
        strictEqual(value, expected.shift());
    });

    _.each(streams, function(stream, i) {
        stream.emit(i);
    }, this);
});

module('Stream.prototype', {
    'setup': function() {
        this.stream = frp.Stream.create();
    }
});

test('emit', 1, function() {
    this.stream.onEmit.add(function() {
        ok(true, 'should call onEmit callbacks when emit() is called');
    });
    this.stream.emit(true);
});

test('sendTo', 1, function() {
    var testValue = 5;
    var stream2 = frp.Stream.create();
    stream2.receive = function(value) {
        strictEqual(value, testValue);
    };
    this.stream.sendTo(stream2);
    this.stream.emit(testValue);
});

test('unSendTo', 0, function() {
    var stream2 = frp.Stream.create();
    stream2.receive = function() {
        ok(false);
    };
    this.stream.sendTo(stream2);
    this.stream.unSendTo(stream2);
    this.stream.emit();
});

test('cancel', 1, function() {
    this.stream.onEmit.add(function() {
        ok(false);
    });
    this.stream.onCancel.add(function() {
        ok(true);
    });
    this.stream.cancel();
    this.stream.cancel();
});

test('merge', 5, function() {
    var streams = [];
    _.times(4, function() {
        streams.push(frp.Stream.create());
    }, this);
    var merged = this.stream.merge(streams);

    _.each([this.stream].concat(streams), function(stream) {
        ok(stream.sendsTo(merged));
    }, this);
});

module('XHR');
