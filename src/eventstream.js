(function(frp) {
    function EventStream(onValue) {
        this.onEmit = $.Callbacks('memory unique');
        this.onCancel = $.Callbacks('memory once unique');

        this.onValue = _.bind(onValue, this);
    };

    // utility

    // Do any cleanup required after statful initialization.
    EventStream.prototype.cancel = function() {
        this.onCancel.fireWith(this);
        return this;
    };

    EventStream.prototype.sendTo = function(es) {
        this.onEmit.add(es.onEvent);
        return this;
    };

    EventStream.prototype.receiveFrom = function(es) {
        es.onEmit.add(this.onValue);
        return this;
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

    // new event streams

    EventStream.prototype.map = function(mapFunc) {
        return new EventStream(function(value) {
            this.emit(mapFunc.call(this, value));
        });
    };

    EventStream.prototype.mapArray = function(mapFunc) {
        return new EventStream(function() {
            this.emit.apply(this, mapFunc.apply(this, arguments));
        });
    };

    EventStream.prototype.filter = function(filterFunc) {
        return new EventStream(function() {
            if (filterFunc.apply(this, arguments)) {
                this.emit.apply(this, arguments);
            }
        });
    };

    // see `EventStream.merge`.
    EventStream.prototype.merge = function(/*es, ...*/) {
        return EventSource.merge([this].concat(arguments));
    };

    // constructors

    // This stream does not emit events.
    EventStream.zero = function() {
        var es = new EventStream(function() {});
        es.emit = function() {
            return this;
        };
        return es;
    };

    // This stream emits one event with specified values(s).
    EventStream.one = function(/*value, ...*/) {
        var es = new EventStream(function() {});
        es.emitArray(arguments);
        return es;
    };

    // Emit constant value(s), and the same value on every trigger.
    EventStream.constant = function(/*value, ...*/) {
        var values = arguments;
        var es = new EventStream(function() {
            this.emitArray(values);
        });
        es.emitArray(values);
        return es;
    };

    // Return a stream that emits the events of all stream arguments.
    EventStream.merge(/*es, ...*/) {
        var merged = new EventSource(_.identity);
        _.each(arguments, function(es) {
            es.sendTo(merged);
        });
        return merged;
    };

    // Switcher takes a list of `EventStream`s that emit `EventStream`s. When one of the arguments
    // emits a stream, switcher then emits values from that stream.
    EventStream.switcher = function(/*es, ...*/) {
        var switcher = new EventStream(_.identity);
        _.each(arguments, function(es) {
            es.onEmit.add(function(es) {
                if (switcher.current) {
                    switcher.current.onEmit.remove(switcher.current);
                }
                switcher.current = es;
                es.sendTo(switcher);
            });
        });
        return switcher;
    };

    // Emit the most recent event no more than every `bounce` ms.
    EventStream.debounce = function(es, bounce) {
        return new EventStream(_.debounce(this.emitArray, bounce));
    };

    // Delay each received event by `delay` ms.
    EventStream.delay = function(es, delay) {
        return new EventStream(function() {
            _.delay(this.emitArray, delay, arguments);
        });
    };

    // Trigger via jquery events.
    EventStream.$ = function(source/*, event, [selector]*/) {
        var es = new EventStream();
        // Take no more than two arguments after the first.
        var args = Array.prototype.slice.call(arguments, 1).slice(0, 2);
        args.push(function(e) {
            es.emit(e);
        });
        var $source = $(source);
        $source.on.apply($source, args);
        es.onCancel.add(function() {
            $source.off.apply($source, args);
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
