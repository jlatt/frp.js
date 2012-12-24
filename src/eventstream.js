(function(frp) {

    // utility functions

    function noop() {};

    function returnThis() {
        return this;
    };

    // represent event streams

    // Create a new stream.
    function EventStream(receiveValue) {
        this.id = _.uniqueId('EventStream:');
        this.onEmit = $.Callbacks('memory unique');
        this.onCancel = $.Callbacks('memory once unique');
        this.receiveValue = _.bind(receiveValue, this);
    };

    // Do any cleanup required after statful initialization.
    EventStream.prototype.cancel = function() {
        this.onCancel.fireWith(this, [this]).disable();
        return this;
    };

    // connecting streams

    // Send events from this stream to another stream.
    EventStream.prototype.sendTo = function(es) {
        this.onEmit.add(es.receiveValue);
        return this;
    };

    // Stop sending events from this stream to another stream.
    EventStream.prototype.unsendTo = function(es) {
        this.onEmit.remove(es.receiveValue);
        return this;
    };

    // Receive events from another stream to this one.
    EventStream.prototype.receiveFrom = function(es) {
        return es.sendTo(this);
    };

    // Stop receiving events from another stream to this one.
    EventStream.prototype.unreceiveFrom = function(es) {
        return es.unsendTo(this);
    };

    // event emission
    // NB: These functions should be called from event streaming and not external code.

    // Emit a func-call like list of values to callbacks. Usually, this is one value.
    EventStream.prototype.emit = function(/*value, ...*/) {
        return this.emitArray(arguments);
    };

    // `values` is an array of values which will be parameters to the callbacks.
    EventStream.prototype.emitArray = function(values) {
        this.onEmit.fireWith(this, values);
        return this;
    };

    // constructors

    // see `EventStream.merge`.
    EventStream.prototype.merge = function(/*es, ...*/) {
        return EventSource.merge([this].concat(arguments));
    };


    // Map each event value with `mapFunc`.
    EventStream.prototype.map = function(mapFunc) {
        return EventStream.create(function() {
            this.emit(mapFunc.apply(this, arguments));
        });
    };

    // Map all arguments through `mapFunc`.
    EventStream.prototype.mapArray = function(mapFunc) {
        return EventStream.create(function() {
            this.emitArray(mapFunc.apply(this, arguments));
        });
    };

    // Only emit events when `filterFunc` returns a truthy value.
    EventStream.prototype.filter = function(filterFunc) {
        return EventStream.create(function() {
            if (filterFunc.apply(this, arguments)) {
                this.emitArray(arguments);
            }
        });
    };

    // Emit events from the value of `foldFunc`.
    // - foldFunc:function(value:Value, lastValue:Value):Value
    // - initialValue:Value
    EventStream.prototype.fold = function(foldFunc, initialValue) {
        var es = EventStream.create(function(value) {
            this.emit(foldFunc.call(this, value, this.lastValue));
            this.last = value;
        });
        es.lastValue = initialValue;
        return es;
    };

    // Emit the most recent event `bounce` ms after the first last event arrives.
    EventStream.prototype.debounce = function(bounce) {
        return EventStream.create(_.debounce(this.emit, bounce)).receiveFrom(this);
    };

    // Delay each received event by `delay` ms. This function does not guarantee
    // order, but relies on the JS internal scheduler.
    EventStream.prototype.delay = function(delay) {
        return EventStream.create(function() {
            var delayHandle;
            function clear() {
                clearTimeout(delayHandle);
            }
            delayHandle = _.delay(function(args) {
                es.onCancel.remove(clear);
                es.emitArray(args);
            }, delay, arguments);
            this.onCancel.add(clear);
        }).receiveFrom(this);
    };

    // Emit an event no more often than every `throttle` ms.
    EventStream.prototype.throttle = function(throttle) {
        return EventStream.create(_.throttle(this.emit, throttle)).receiveFrom(es);
    };

    // Emit incoming events until `takeWhile` returns falsy.
    EventStream.prototype.takeWhile = function(takeFunc) {
        return EventStream.create(function() {
            if (takeFunc.apply(this, arguments)) {
                this.emitArray(arguments);
            } else {
                this.receiveValue = noop;
            }
        }).receiveFrom(this);
    };

    // Don't emit events until `dropFunc` return falsy.
    EventStream.prototype.dropWhile = function(dropFunc) {
        return EventStream.create(function() {
            if (!dropFunc.apply(this, arguments)) {
                this.receiveValue = _.bind(this.emit, this);
            }
        }).receiveFrom(this);
    };

    // independent constructors

    // Create a new stream.
    EventStream.create = function(receiveValue) {
        return EventStream.create(receiveValue);
    };

    // Create a stream that replays whatever it receives.
    EventStream.identity = function() {
        return EventStream.create(EventStream.prototype.emitArray);
    };

    // This stream does not emit events.
    EventStream.zero = function() {
        var es = EventStream.create(noop);
        es.emitArray = returnThis;
        return es;
    };

    // This stream emits one event with specified values(s).
    EventStream.one = function(/*value, ...*/) {
        return EventStream.create(noop).emitArray(arguments);
    };

    // Emit constant value(s), and the same value on every trigger.
    EventStream.constant = function(/*value, ...*/) {
        var values = arguments;
        return EventStream.create(function() {
            this.emitArray(values);
        }).emitArray(values);
    };

    // Return a stream that emits the events of all stream arguments.
    EventStream.merge = function(/*es, ...*/) {
        var merged = EventSource.map(_.identity);
        _.each(arguments, merged.receiveFrom, merged);
        return merged;
    };

    // Switcher takes a list of `EventStream`s that emit `EventStream`s. When
    // one of the arguments emits a stream, switcher then emits values from that
    // stream.
    EventStream.switcher = function(/*es, ...*/) {
        var switcher = EventStream.map(_.identity);
        _.each(arguments, function(es) {
            es.onEmit.add(function(ses) {
                if (ses !== switcher.current) {
                    if (switcher.current) {
                        switcher.current.unsendTo(switcher);
                    }
                    switcher.current = ses;
                    ses.sendTo(switcher);
                }
            });
        });
        return switcher;
    };

    // Trigger events from calling `valueFunc` every `interval` ms.
    EventStream.interval = function(interval, valueFunc) {
        var es = EventStream.create(noop);

        var handle = setInterval(function() {
            es.emit(valueFunc.call(es));
        },  interval);
        es.onCancel.add(function() {
            clearInterval(handle);
        });

        return es;
    };

    // Trigger via jquery events.
    EventStream.$ = function(source/*, event, [selector]*/) {
        var es = EventStream.create(noop);

        var args = Array.prototype.slice.call(arguments, 1, 3);
        args.push(function(e) {
            es.emit(e);
        });

        this.$source = $(source);
        this.$source.on.apply(this.$source, args);
        es.onCancel.add(function() {
            this.$source.off.apply(this.$source, args);
        });

        return es;
    };

    // Trigger via google maps events.
    EventStream.gmap = function(source, event) {
        var es = EventStream.create(noop);

        var listener = google.maps.addListener(source, event, function() {
            es.emitArray(arguments);
        });
        es.onCancel.add(function() {
            google.maps.removeListener(listener);
        });

        return es;
    };

    // export

    frp.EventStream = EventStream;

}).call(this, this.frp = this.frp || {});
