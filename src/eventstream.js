(function(frp) {
    //
    // utility functions
    //

    function noop() {};

    function returnThis() {
        return this;
    };

    function identityEmit(value) {
        this.emit(value);
    };

    //
    // meat
    //

    // Create an event stream. Some streams are hooked to native (external)
    // event handlers. Others must be triggered directly by calling `emit`.
    function Stream() {
        this.id = _.uniqueId('Stream:');
        this.onEmit = $.Callbacks('memory unique');
        this.onCancel = $.Callbacks('memory once unique');

        this.onCancel.add(function() {
            this.onEmit.empty();
            this.onEmit.disable();
        });
    };

    Stream.prototype.emit = function(value) {
        this.onEmit.fireWith(this, [value, this]);
        return this;
    };

    Stream.prototype.cancel = function() {
        this.onCancel.fireWith(this, [this]);
        return this;
    };

    Stream.prototype.bind = function(receive) {
        return _.bind(receive, this);
    };

    // Pipe events from one stream through `receive` to a new stream.
    // receive := Stream.function(Value)
    Stream.prototype.pipe = function(receive) {
        var stream = new Stream();
        this.onEmit.add(stream.bind(receive));
        return stream;
    };

    //
    // functional pipes
    //

    // Emit all incoming events.
    //
    // return := Stream
    Stream.prototype.identity = function() {
        return this.pipe(function(value) {
            this.emit(value);
        });
    };

    // Emit a constant value for every input.
    //
    // value := Value
    // return := Stream
    Stream.prototype.constant = function(value) {
        return this.pipe(function() {
            this.emit(value);
        });
    };

    // Emit events processed by `map`.
    //
    // map := Stream.function(Value):Value
    // return := Stream
    Stream.prototype.map = function(map) {
        return this.pipe(function() {
            this.emit(map.apply(this, arguments));
        });
    };

    // Emit events filtered by `filter`.
    //
    // filter := function(Value):Boolean
    // return := Stream
    Stream.prototype.filter = function(filter) {
        return this.pipe(function() {
            if (filter.apply(this, arguments)) {
                this.emit(value);
            }
        });
    };

    // Emit events mapped through `fold`, which takes the current event and the
    // value from the previous invocation of `fold`. If fold has not yet been
    // run, `initialValue` is used as the last value.
    //
    // foldFunc := Stream.function(value, lastValue):Value
    // value := Value
    // lastValue := Value
    // initialValue := Value
    // return := Stream
    Stream.prototype.fold = function(fold, initialValue) {
        var lastValue = initialValue;
        return this.map(function(value) {
            lastValue = fold.call(this, value, lastValue);
            return lastValue;
        });
    };

    // Emit incoming events until `takeWhile` returns falsy.
    //
    // takeWhile := Stream.function(Value):Boolean
    // return := Stream
    Stream.prototype.takeWhile = function(takeWhile) {
        var take = function() {
            if (takeWhile.apply(this, arguments)) {
                return true;
            }
            take = function() { return false };
            return false;
            
        };
        return this.filter(function() {
            return take.apply(this, arguments);
        });
    };

    // Don't emit events until `dropWhile` return falsy.
    //
    // dropWhile := Stream.function(Value):Boolean
    // return := Stream
    Stream.prototype.dropWhile = function(dropWhile) {
        var drop = function() {
            if (dropWhile.apply(this, arguments)) {
                return false;
            }
            drop = function() { return true };
            return true;
        };
        return this.filter(function() {
            return drop.apply(this, arguments);
        });
    };

    //
    // timing pipes
    //

    // Emit an event once `wait` ms after the last incoming event.
    // wait := Number
    // return := Stream
    Stream.prototype.debounce = function(wait) {
        return this.pipe(_.debounce(function(value) {
            this.emit(value);
        }, wait));
    };

    // Emit an event no more than every `wait` ms.
    // wait := Number
    // return := Stream
    Stream.prototype.throttle = function(wait) {
        return this.pipe(_.throttle(function(value) {
            this.emit(value);
        }, wait));
    };

    // Delay all incoming events by `wait` ms. NB: This uses `setTimeout()` and
    // is subject to the JS scheduler for order.
    // wait := Number
    // return := Stream
    Stream.prototype.delay = function(wait) {
        return this.pipe(function(value) {
            var handle;
            function clear() {
                clearTimeout(handle);
            };
            this.onCancel.add(clear);
            handle = _
                .chain(function(value) {
                    this.onCancel.remove(clear);
                    this.emit(value);
                })
                .bind(this)
                .delay(wait)
                .value();
        });
    };

    //
    // future pipes
    //

    // Turn all incoming event objects into promises.
    // return := Stream
    Stream.prototype.promise = function() {
        return this.map(function() {
            return $.Deferred().resolveWith(this, arguments).promise();
        });
    };

    // Unpackage incoming promises as values.
    // return := Stream
    Stream.prototype.unpromise = function() {
        return this.pipe(function(promise) {
            var stream = this;
            promise.done(function(value) {
                stream.emit(value);
            });
        });
    };

    //
    // FRP streams
    //

    // Create a stream that emits events from all argument streams.
    //
    // return := Stream
    Stream.merge = function(/*stream, ...*/) {
        var merged = new Stream();
        _.chain(arguments)
            .pluck('onEmit')
            .invoke('add', merged.bind(identityEmit));
        return merged;
    };

    Stream.prototype.merge = function(stream) {
        return Stream.merge(this, stream);
    };

    // Create a stream that emits events from the stream that is the most recent
    // event of the argument streams. These streams all themselves return streams.
    //
    // return := Stream
    Stream.switcher = function(/*stream, ...*/) {
        var switcher = new Stream();
        var onEmit = switcher.bind(identityEmit);
        var current = null;
        Stream.merge.apply(Stream, arguments).pipe(function(stream) {
            if (current !== stream) {
                if (current !== null) {
                    current.onEmit.remove(onEmit);
                }
                stream.onEmit.add(onEmit);
                current = stream;
            }
        });
        return switcher;
    };

    Stream.prototype.switcher = function(stream) {
        return Stream.switcher(this, stream);
    };

    //
    // external event sources
    //

    // Create a stream bound to a dom event using jQuery. `selector is optional.
    //
    // source := String | jQuery | DOMElement
    // event := String
    // selector := String
    // return := Sink
    Stream.$ = function(source, event, selector) {
        var stream = new Stream();
        var $source = jQuery(source);
        var args = Array.prototype.slice.call(arguments, 1);
        args.push(function(e) {
            stream.emit(e);
        });

        $source.on.call($source, args);
        stream.onCancel.add(function() {
            $source.off.apply($source, args);
        });

        return stream;
    };

    // Trigger via google maps events. `callback` is optional; by default it
    // emits the first argument to the callback.
    //
    // source := google.maps.Object
    // event := String
    // callback := Function
    // return := Sink
    Stream.gmap = function(source, event, callback) {
        var stream = new Stream();
        if (!_.isFunction(callback)) {
            callback = function(arg1) {
                stream.emit(arg1);
            };
        }

        var listener = google.maps.addListener(source, event, callback);
        stream.onCancel.add(function() {
            google.maps.removeListener(listener);
        });

        return stream;
    };

    // Emit `value` on a regular schedule of `wait` ms.
    //
    // value := Value
    // wait := Number
    // return := Sink
    Stream.interval = function(value, wait) {
        var stream = new Stream();
        var handle = setInterval(function() {
            stream.emit(value);
        }, wait);
        stream.onCancel.add(function() {
            clearInterval(handle);
        });
        return stream;
    };

    //
    // export
    //

    frp.Stream = Stream;

}).call(this, this.frp = this.frp || {});
