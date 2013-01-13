(function(frp) {

    // utility functions

    function noop() {};

    function returnThis() {
        return this;
    };

    function create() {
        var instance = new this();
        instance.initialize.apply(instance, arguments);
        return instance;
    };

    function inherit(Cons, ProtoCons) {
        Cons.prototype = new ProtoCons();
        Cons.prototype.constructor = Cons;
        Cons.create = create;
        return Cons;
    };


    // represent event streams

    // Create a new stream.
    function EventStream() {};
    EventStream.create = create;

    EventStream.prototype.initialize = function() {
        this.id = _.uniqueId('EventStream:');
        this.onEmit = $.Callbacks('memory unique');
        this.onCancel = $.Callbacks('memory once unique');
        _.bindAll(this, 'receiveValue', 'emit', 'emitArray');
        return this;
    };

    EventStream.prototype.receiveValue = noop;

    EventStream.prototype.tap = function(func, context) {
        func.call(context || this, this);
        return this;
    };

    // Add context for debugging assistance.
    EventStream.prototype.setData = function(/*key, value || **kwargs*/) {
        this.data = this.data || {};
        if (arguments.length === 2) {
            this.data[arguments[0]] = arguments[1];
        } else if (arguments.length === 1) {
            _.extend(this.data, arguments[0]);
        }
        return this;
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

    function Custom() {};
    inherit(Custom, EventStream);

    Custom.prototype.initialize = function(receiveValue) {
        this.receiveValue = receiveValue;
        return EventStream.prototype.initialize.call(this);
    };

    EventStream.custom = function(receiveValue) {
        return Custom.create(receiveValue);
    };

    // Map each event value with `mapFunc`.
    EventStream.map = function(mapFunc) {
        return Custom.create(function() {
            this.emit(mapFunc.apply(this, arguments));
        });
    };

    // Map all arguments through `mapFunc`.
    EventStream.mapArray = function(mapFunc) {
        return Custom.create(function() {
            this.emitArray(mapFunc.apply(this, arguments));
        });
    };

    // Only emit events when `filterFunc` returns a truthy value.
    EventStream.filter = function(filterFunc) {
        return Custom.create(function() {
            if (filterFunc.apply(this, arguments)) {
                this.emitArray(arguments);
            }
        });
    };

    // Emit events from the value of `foldFunc`.
    // - foldFunc:function(value:Value, lastValue:Value):Value
    // - initialValue:Value
    EventStream.fold = function(foldFunc, initialValue) {
        return Custom
            .create(function(value) {
                this.emit(foldFunc.call(this, value, this.data.last));
                this.setData('last', value);
            })
            .setData('last', initialValue);
    };

    // Emit the most recent event `bounce` ms after the first last event arrives.
    EventStream.debounce = function(bounce) {
        return Custom
            .create(_.debounce(this.emit, bounce))
            .setData('debounce', debounce);
    };

    // Delay each received event by `delay` ms. This function does not guarantee
    // order, but relies on the JS internal scheduler.
    EventStream.delay = function(delay) {
        return Custom
            .create(function() {
                var delayHandle;

                function clear() {
                    clearTimeout(delayHandle);
                };

                delayHandle = _.delay(function(args) {
                    es.onCancel.remove(clear);
                    es.emitArray(args);
                }, delay, arguments);
                this.onCancel.add(clear);
            })
            .setData('delay', delay);
    };

    // Emit an event no more often than every `throttle` ms.
    EventStream.throttle = function(throttle) {
        return Custom
            .create(_.throttle(this.emit, throttle))
            .setData('throttle', throttle);
    };

    // Emit incoming events until `takeWhile` returns falsy.
    EventStream.takeWhile = function(takeFunc) {
        return Custom
            .create(function() {
                if (takeFunc.apply(this, arguments)) {
                    this.emitArray(arguments);
                } else {
                    this.receiveValue = noop;
                }
            });
    };

    // Don't emit events until `dropFunc` return falsy.
    EventStream.dropWhile = function(dropFunc) {
        return Custom
            .create(function() {
                if (!dropFunc.apply(this, arguments)) {
                    this.receiveValue = this.emit;
                }
            });
    };

    // Adapt a stream of events into promises of those events.
    EventStream.promise = function() {
        return Custom
            .create(function() {
                this.emit($.Deferred().resolveWith(this, arguments));
            });
    };

    // Adapt a stream of promises into a stream of values.
    EventStream.unpromise = function() {
        return Custom
            .create(function(promise) {
                promise.then(this.emit, this.emit);
            });
    };

    EventStream.prepend = function(prepend) {
        return EventStream
            .mapArray(function() {
                var args = _.toArray(arguments);
                args.unshift(this.data.prepend);
                return args;
            })
            .setData('prepend', prepend);
    };

    function Identity() {};
    inherit(Identity, EventStream);
    Identity.prototype.receiveValue = Identity.prototype.emit;

    // Create a stream that replays whatever it receives.
    EventStream.identity = function() {
        return Identity.create();
    };

    function Zero() {};
    inherit(Zero, EventStream);
    Zero.prototype.emitArray = returnThis;

    // This stream does not emit events.
    EventStream.zero = function() {
        return Zero.create();
    };

    function One() {};
    inherit(One, EventStream);

    One.prototype.emitArray = function() {
        this.emitArray = returnThis;
        return EventStream.prototype.emitArray.apply(this, arguments);
    };
    
    // This stream emits one event with specified values(s).
    EventStream.one = function(/*value, ...*/) {
        return One.create()
            .create()
            .emitArray(arguments);
    };

    // Emit constant value(s), and the same value on every trigger.
    EventStream.constant = function(/*value, ...*/) {
        return EventStream
            .mapArray(function() {
                return this.data.values;
            })
            .setData('values', arguments)
            .emitArray(arguments);
    };

    // Return a stream that emits the events of all stream arguments.
    EventStream.merge = function(/*es, ...*/) {
        return EventSource
            .map(_.identity)
            .tap(function() {
                _.each(arguments, this.receiveFrom, this);
            });
    };

    function Switcher() {};
    inherit(Switcher, EventStream);

    Switcher.prototype.initialize = function(streams) {
        EventStream.prototype.initialize.call(this);
        _.bindAll(this, 'switchStreams');
        this.setData('current', null);

        _.each(streams, function(es) {
            es.onEmit.add(this.switchStreams);
            this.onCancel.add(function() {
                es.onEmit.remove(this.switchStreams);
            });
        }, this);
        return this;
    };

    Switcher.prototype.switchStreams = function(es) {
        if (es !== this.data.current) {
            if (this.data.current) {
                this.data.current.unsendTo(this);
            }
            this.setData('current', ses)
                .receiveFrom(ses);
        }
        return this;
    };

    // Switcher takes a list of `EventStream`s that emit `EventStream`s. When
    // one of the arguments emits a stream, switcher then emits values from that
    // stream.
    EventStream.switcher = function(/*es, ...*/) {
        return Switcher.create(arguments);
    };

    function Interval() {};
    inherit(Interval, EventStream);

    Interval.prototype.initialize = function(interval, value) {
        EventStream.prototype.initialize.call(this);
        _.bindAll(this, 'emitValue');
        this.setData({'interval': interval, 'value': value});

        var handle = setInterval(this.emitValue, interval);
        this.onCancel.add(function() {
            clearInterval(handle);
        });
        return this;
    };

    Interval.prototype.emitValue = function() {
        this.emit(this.data.value);
        return this;
    };

    // Trigger `value` every `interval` ms.
    EventStream.interval = function(interval, value) {
        return Interval.create(interval, value);
    };

    function DOMEvent() {};
    inherit(DOMEvent, EventStream);

    DOMEvent.prototype.initialize = function(source, event, selector) {
        this.setData({
            '$source': jQuery(source),
            'event': event,
            'selector': selector
        });

        if (this.data.selector) {
            this.data.$source.on(event, selector, this.emit);
        } else {
            this.data.$source.on(event, this.emit);
        }

        this.onCancel.add(function() {
            if (this.data.selector) {
                this.data.$source.off(this.data.event, this.data.selector, this.emit);
            } else {
                this.data.$source.off(this.data.event, this.emit);
            }
        });

        return this;
    };

    // Trigger via jquery events.
    EventStream.$ = function(source, event, selector) {
        return DOMEvent.create(source, event, selector);
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
