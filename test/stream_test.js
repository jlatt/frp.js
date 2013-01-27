(function() {
    'use strict';

    test.run('constructor', function() {
        frp.Stream.create();
    });

    test.run('emit', function() {
        var stream = frp.Stream.create();
        var emitted = false;
        stream.onEmit.add(function() {
            emitted = true;
        });
        stream.emit(true);
        assert(emitted, 'should call onEmit callbacks when emit() is called');
    });
}).call(this);
