(function(frp) {

    // utility functions

    function noop() {};

    function returnThis = function() {
        return this;
    };

    // represent event streams

    function EventStream(onValue) {
        this.id = _.uniqueId();
        this.onEmit = $.Callbacks('memory unique');
        this.onCancel = $.Callbacks('memory once unique');
        this.onValue = _.bind(onValue, this);
    };

    // Do any cleanup required after statful initialization.
    EventStream.prototype.cancel = _.once(function() {
        this.onCancel.fireWith(this);
        return this;
    });

    // connecting streams

    // Send events from this stream to another stream.
    EventStream.prototype.sendTo = function(es) {
        this.onEmit.add(es.onValue);
        return this;
    };;

    // Stop sending events from this stream to another stream.
    EventStream.prototype.unsendTo = function(es) {
        this.onEmit.add(es.onValue);
        return this;
    };

    // Receive events from another stream to this one.
    EventStream.prototype.receiveFrom = function(es) {
        return es.sendTo(this);
    };

    // Stop receiving events from another stream to this one.
    EventStream.prototype.unreceiveFrom = function(es) {
        return es.sendTo(this);
    };

    // event emission

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
        return new EventStream(function(value) {
            this.emit(mapFunc.call(this, value));
        });
    };

    // Map all arguments through `mapFunc`.
    EventStream.prototype.mapArray = function(mapFunc) {
        return new EventStream(function() {
            this.emitArray(mapFunc.apply(this, arguments));
        });
    };

    // Only emit events when `filterFunc` returns a truthy value.
    EventStream.prototype.filter = function(filterFunc) {
        return new EventStream(function() {
            if (filterFunc.apply(this, arguments)) {
                this.emitArray(arguments);
            }
        });
    };

    // Emit events from the value of `foldFunc`, which has parameters of the current and previous
    // event values.
    EventStream.prototype.fold = function(foldFunc, initialValue) {
        var es = new EventStream(function(value) {
            this.emit(foldFunc.call(this, value, this.last));
            this.last = value;
        });
        es.last = initialValue;
        return es;
    };

    // Emit the most recent event `bounce` ms after the first last event arrives.
    EventStream.prototype.debounce = function(bounce) {
        return new EventStream(_.debounce(this.emitArray, bounce)).receiveFrom(this);
    };

    // Delay each received event by `delay` ms.
    EventStream.prototype.delay = function(delay) {
        var emitArray;
        var es = new EventStream(function() {
            _.delay(emitArray, delay, arguments);
        })
        emitArray = _.bind(es.emitArray, es);
        this.sendTo(es);
        return es;
    };

    // Emit an event no more often than every `throttle` ms.
    EventStream.prototype.throttle = function(throttle) {
        return new EventStream(_.throttle(this.emitArray, throttle)).receiveFrom(es);
    };

    // Emit incoming events until `takeWhile` returns falsy.
    EventStream.prototype.takeWhile = function(takeFunc) {
        var onValue = function() {
            if (takeFunc.apply(this, arguments)) {
                this.emitArray(arguments);
            } else {
                onValue = noop;
            }
        };

        return new EventStream(function() {
            onValue.apply(this, arguments);
        }).receiveFrom(this);
    };

    // Don't emit events until `dropFunc` return falsy.
    EventStream.prototype.dropWhile = function(dropFunc) {
        var onValue = function() {
            if (!dropFunc.apply(this, arguments)) {
                onValue = this.emitArray;
            }
        };

        return new EventStream(function() {
            onValue.apply(this, arguments);
        }).receiveFrom(this);
    };

    EventStream.create = function(onValue) {
        return new EventStream(onValue);
    };

    // This stream does not emit events.
    EventStream.zero = function() {
        var es = new EventStream(noop);
        es.emit = returnThis;
        return es;
    };

    // This stream emits one event with specified values(s).
    EventStream.one = function(/*value, ...*/) {
        return new EventStream(noop).emitArray(arguments);
    };

    // Emit constant value(s), and the same value on every trigger.
    EventStream.constant = function(/*value, ...*/) {
        var values = arguments;
        return new EventStream(function() {
            this.emitArray(values);
        }).emitArray(values);
    };

    // Return a stream that emits the events of all stream arguments.
    EventStream.merge = function(/*es, ...*/) {
        var merged = EventSource.map(_.identity);
        _.each(arguments, merged.receiveFrom, merged);
        return merged;
    };

    // Switcher takes a list of `EventStream`s that emit `EventStream`s. When one of the arguments
    // emits a stream, switcher then emits values from that stream.
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
        var es = new EventStream(noop);
        var onInterval = _.bind(function() {
            this.emit(valueFunc.call(this));
        }, this);
        var handle = setInterval(onInterval, interval);
        es.onCancel.add(function() {
            clearInterval(handle);
        });
        return es;
    };

    // Trigger via jquery events.
    EventStream.$ = function(source/*, event, [selector]*/) {
        var es = new EventStream();

        // Take no more than two arguments after the first.
        var args = Array.prototype.slice.call(arguments, 1).slice(0, 2);
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
        var es = new EventStream();
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
