(function() {
    'use strict';

    module('Stream', {
        'setup': function() {
            this.stream = frp.Stream.create();
        }
    });

    test('.create', 1, function() {
        ok(this.stream, 'create should return a stream');
    });

    test('.prototype.emit', 1, function() {
        this.stream.onEmit.add(function() {
            ok(true, 'should call onEmit callbacks when emit() is called');
        });
        this.stream.emit(true);
    });

    test('.prototype.sendTo', 1, function() {
        var testValue = 5;
        var stream2 = frp.Stream.create();
        stream2.receive = function(value) {
            strictEqual(value, testValue);
        };
        this.stream.sendTo(stream2);
        this.stream.emit(testValue);
    });

    test('.prototype.unSendTo', 0, function() {
        var stream2 = frp.Stream.create();
        stream2.receive = function() {
            ok(false);
        };
        this.stream.sendTo(stream2);
        this.stream.unSendTo(stream2);
        this.stream.emit();
    });

    test('.prototype.cancel', 1, function() {
        this.stream.onCancel.add(function() {
            ok(true);
        });
        this.stream.cancel();
        this.stream.cancel();
    });

    test('.prototype.pipe', 1, function() {
        var piped = this.stream.pipe(function() {
            ok(true);
        });
        this.stream.emit();
    });

    test('.prototype.identity', 1, function() {
        var testValue = 5;
        var ident = this.stream.identity();
        ident.onEmit.add(function(value) {
            strictEqual(value, testValue);
        })
        this.stream.emit(testValue);
    });

    test('.prototype.constant', 1, function() {
        var testValue = true;
        var constant = this.stream.constant(testValue);
        constant.onEmit.add(function(value) {
            strictEqual(value, testValue);
        });
        this.stream.emit();
    });

    test('.prototype.map', 1, function() {
        var testValue = 5;
        var map = function(value) {
            return value * 3;
        };
        var mapped = this.stream.map(map);
        mapped.onEmit.add(function(value) {
            strictEqual(value, map(testValue));
        });
        this.stream.emit(testValue);
    });

    test('.prototype.filter', 2, function() {
        var testValues = [1, 2, 3, 4];
        var expected = [1, 3];
        var expectedIndex = 0;
        var filtered = this.stream.filter(function(value) {
            return !!(value % 2);
        });
        filtered.onEmit.add(function(value) {
            strictEqual(value, expected[expectedIndex]);
            ++expectedIndex;
        });
        _.each(testValues, function(testValue) {
            this.stream.emit(testValue);
        }, this);
    });
}).call(this);
