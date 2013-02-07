(function() {
    'use strict';

    // Create an event stream. Some streams are hooked to native (external)
    // event handlers. Others must be triggered directly by calling `emit`.
    function Stream() {
        frp.Identifiable.call(this);
        _.bindAll(this, 'call');
        this.onEmit = jQuery.Callbacks(this.onEmitFlags);
        this.onCancel = jQuery.Callbacks('memory once unique');
        this.cancel = _.once(this.cancel);
    };
    frp.Identifiable.extend(Stream);

    Stream.prototype.call = function() {
        this.receive.apply(this, arguments);
    };

    Stream.prototype.idPrefix = 'Stream';

    Stream.prototype.onEmitFlags = 'unique';

    // Call `onEmit` callbacks with `value`, which is optional.
    //
    // value := Value
    // return := Stream
    Stream.prototype.emit = function(value) {
        this.onEmit.fireWith(this, [value, this]);
        return this;
    };

    // Add a stream to this stream's emitter callbacks.
    //
    // callable := Callable
    // return := Stream
    Stream.prototype.sendTo = function(stream) {
        frp.assert(!!stream && _.isFunction(stream.call));

        this.onEmit.add(stream.call);
        return this;
    };

    // Remove a stream from this stream's emitter callbacks.
    //
    // stream := Stream
    // return := Stream
    Stream.prototype.unSendTo = function(stream) {
        frp.assert(!!stream && _.isFunction(stream.call));

        this.onEmit.remove(stream.call);
        return this;
    };

    // Cancel all event emission. Call `onCancel` callbacks.
    //
    // return := Stream
    Stream.prototype.cancel = function() {
        this.onCancel.fireWith(this, [this]);
        this.onEmit.disable();
        return this;
    };

    // Receive an event.
    //
    // value := Value
    // fromStream := Stream
    Stream.prototype.receive = function(value, fromStream) {};

    // Pipe events from one stream through a new stream.
    //
    // receive := Stream.function(Value, Stream)
    // return := Stream
    Stream.prototype.pipe = function(receive) {
        frp.assert(!receive || _.isFunction(receive.apply));

        var stream = this.constructor.create();
        if (!!receive) {
            stream.receive = receive;
        }
        this.sendTo(stream);
        return stream;
    };

    //
    // functional pipes
    //

    var identityEmit = function(value) {
        this.emit(value);
    };

    // Emit all incoming events.
    //
    // return := Stream
    Stream.prototype.identity = function() {
        return this.pipe(identityEmit);
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
        frp.assert(!!filter && _.isFunction(filter.apply));

        return this.pipe(function(value) {
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
        frp.assert(!!fold && _.isFunction(fold.call));

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
        frp.assert(!!takeWhile && _.isFunction(takeWhile.apply));

        var maybeEmit = function(value) {
            if (takeWhile.apply(this, arguments)) {
                this.emit(value);
            } else {
                maybeEmit = $.noop;
            }
        };
        return this.pipe(function() {
            maybeEmit.apply(this, arguments);
        });
    };

    // Don't emit events until `dropWhile` return falsy.
    //
    // dropWhile := Stream.function(Value):Boolean
    // return := Stream
    Stream.prototype.dropWhile = function(dropWhile) {
        frp.assert(!!dropWhile && _.isFunction(dropWhile.apply));

        var maybeEmit = function(value) {
            if (!dropWhile.apply(this, arguments)) {
                this.emit(value);
                maybeEmit = identityEmit;
            }
        };
        return this.pipe(function() {
            maybeEmit.apply(this, arguments);
        });
    };

    // Emit only consecutive events for which `isEqual` is falsy. [default: _.isEqual]
    //
    // isEqual := function(v1 := Value, v2 := Value) := Boolean
    // return := Stream
    Stream.prototype.unique = function(isEqual) {
        frp.assert(!isEqual || _.isFunction(isEqual.call));

        if (!isEqual) {
            isEqual = _.isEqual;
        }
        var lastValue;
        var shouldEmit = function(value) {
            shouldEmit = function(value) {
                var notEq = !isEqual.call(this, lastValue, value);
                lastValue = value;
                return notEq;
            };
            lastValue = value;
            return true;
        };
        return this.filter(function() {
            return shouldEmit.apply(this, arguments);
        });
    };

    // Emit an array of the last `n` events from a stream.
    //
    // n := Number
    // return := Stream
    Stream.prototype.lastN = function(n) {
        frp.assert(n > 0);
        frp.assert(n.toFixed() === n.toString());

        return this.fold(function(value, lastValue) {
            var lastN = (lastValue.length >= n) ? lastValue.slice(1, n) : lastValue.slice();
            lastN.push(value);
            return lastN;
        }, []);
    };

    // Call a function on incoming events that are expected to be arraylike.
    Stream.prototype.unpack = function(unpacked) {
        frp.assert(!!unpacked && _.isFunction(unpacked.apply));

        return this.pipe(function(value) {
            unpacked.apply(this, value);
        });
    };

    //
    // timing pipes
    //

    // Emit an event once `wait` ms after the last incoming event.
    //
    // wait := Number
    // return := Stream
    Stream.prototype.debounce = function(wait) {
        frp.assert(wait > 0);

        return this.pipe(_.debounce(identityEmit, wait));
    };

    // Emit an event no more than every `wait` ms.
    //
    // wait := Number
    // return := Stream
    Stream.prototype.throttle = function(wait) {
        frp.assert(wait > 0);

        return this.pipe(_.throttle(identityEmit, wait));
    };

    // Delay all incoming events by `wait` ms. NB: This uses `setTimeout()` and
    // is subject to the JS scheduler for order.
    //
    // wait := Number
    // return := Stream
    Stream.prototype.delay = function(wait) {
        frp.assert(wait > 0);

        return this.pipe(function(value) {
            var handle;
            var clear = function() {
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
    //
    // return := Stream
    Stream.prototype.promise = function() {
        return this.map(function() {
            return jQuery.Deferred().resolveWith(this, arguments).promise();
        });
    };

    // Unpackage incoming promises as values.
    //
    // return := Stream
    Stream.prototype.unpromise = function() {
        return this.pipe(function(promise) {
            var stream = this;
            promise.done(function(value) {
                stream.emit(value);
            });
        });
    };

    // Pass a function to the incoming promise's pipe.
    //
    // return := Stream
    Stream.prototype.pipePromise = function(receive) {
        frp.assert(!!receive);

        var pipeFunc = _.bind(receive, this);
        return this.pipe(function(promise) {
            return promise.pipe(pipeFunc);
        });
    };

    // Abort the previous incoming value after receiving a new one.
    //
    // return := Stream
    Stream.prototype.abortPrevious = function() {
        var last = null;
        return this.map(function(abortable) {
            if (last !== null) {
                last.abort();
            }
            last = abortable;
            return abortable;
        });
    };

    //
    // FRP streams
    // I still don't understand what switcher is for.
    //

    // Create a stream that emits events from all argument streams.
    //
    // arguments := Stream, ...[Stream, ...]
    // return := Stream
    Stream.merge = function(/*stream, ...*/) {
        var streams = _.flatten(arguments);
        var merged = this.create();
        _.invoke(streams, 'sendTo', merged);
        return merged;
    };

    Stream.prototype.merge = function(/*stream, ...*/) {
        return Stream.merge(this, arguments);
    };

    // Create a stream that emits events from the stream that is the most recent
    // event of the argument streams. These streams all themselves return streams.
    //
    // arguments := Stream.merge.arguments
    // return := Stream
    Stream.switcher = function(/*stream, ...*/) {
        var switcher = this.create();
        var current = null;
        var merged = Stream.merge(arguments);
        merged.receive = function(stream) {
            if (current !== stream) {
                if (current !== null) {
                    current.unSendTo(switcher);
                }
                stream.sendTo(switcher);
                current = stream;
            }
        };
        return switcher;
    };

    Stream.prototype.switcher = function(/*stream, ...*/) {
        return this.constructor.switcher(this, arguments);
    };

    //
    // external event sources
    //

    // Create a stream bound to a dom event using jQuery. `selector` is optional.
    //
    // source := jQuery || jQuery.arguments
    // event := String
    // selector := String
    // return := Stream
    Stream.$ = function(source, event, selector) {
        var stream = this.create();
        var $source = jQuery(source);
        frp.assert($source.length > 0, 'empty jQuery');
        var args = Array.prototype.slice.call(arguments, 1);
        args.push(function(e) {
            stream.emit(e);
        });

        $source.on.apply($source, args);
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
    // return := Stream
    Stream.gmap = function(source, event, callback) {
        frp.assert(_.isString(event));

        var stream = this.create();
        if (!_.isFunction(callback)) {
            callback = identityEmit;
        }
        callback = _.bind(callback, stream);

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
    // return := Stream
    Stream.interval = function(value, wait) {
        frp.assert(wait > 0);

        var stream = this.create();
        var handle = setInterval(function() {
            stream.emit(value);
        }, wait);
        stream.onCancel.add(function() {
            clearInterval(handle);
        });
        return stream;
    };

    // MemoryStream is Stream that emits the last value for any callbacks added
    // after events are emitted.
    function MemoryStream() {
        Stream.call(this);
    };
    Stream.extend(MemoryStream);

    MemoryStream.prototype.idPrefix = 'MemoryStream';
    MemoryStream.prototype.onEmitFlags = 'memory unique';

    //
    // Export
    //

    frp.Stream       = Stream;
    frp.MemoryStream = MemoryStream;
}).call(this);
