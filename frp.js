(function() {
'use strict';

// FRP.js is a [functional reactive
// programming](http://en.wikipedia.org/wiki/Functional_reactive_programming)
// library written in JavaScript for browser-side programming.
//
// Type Annotations
// ----------------
//
// Annotations take the format
//
//     Name := Type Description
//
// - `:=` means "has type".
// - `Type, ...` denotes a variable-length array of `Type`s
// - `||` denotes a union of two type definitions
//
// Parameter Annotations
// ---------------------
//
// These annotations appear inline in the parameter description for a
// function. They always use the multiline comment syntax (`/* */`) so that they
// can be interpolated between parameter definitions.
//
// - `?` denotes an optional parameter.
// - `, ...` denotes variable arguments
//
// General Types
// -------------
//
//     Value := Object || String || Number || Boolean || RegExp
//     Send := function(Value)
//     Iterator := function(Value, Send)

this.frp = {
    'VERSION': '1.0'
};
// Utility Functions
// -----------------
/* globals frp */

// If `condition` is falsy, throw an error.
//
//     condition := Value
//     message := String
//     throws := Error
function assert(condition, message/*?*/) {
    if (!condition) {
        throw new Error(message || 'assertion failed');
    }
}

// Get a keyed value from an object. If the value is not present in the
// prototype chain, call `makeDefaultValue`, setting it as `key` in `object` and
// returning it.
//
//     object := Object
//     key := String
//     makeDefaultValue := function(Object, String, makeDefaultValue) Value
//     return := Value
function getDefault(object, key, makeDefaultValue) {
    if (key in object) {
        return object[key];
    }
    var value = makeDefaultValue.apply(this, arguments);
    object[key] = value;
    return value;
}

// Create a prototypal heir of an object.
//
//     object := Object
//     return := Object
function heir(object) {
    function Heir() {}
    Heir.prototype = object;
    return new Heir();
}

// Export.
frp.assert     = assert;
frp.getDefault = getDefault;
frp.heir       = heir;
// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each `Iterator` is a function with the same signature. Every
// `frp.iter` function returns an `Iterator`.

/* globals frp */
var iter = {};

// Send every received value.
//
//     return := Iterator
iter.identity = _.once(function() {
    function identity(value, send) {
        send.call(this, value);
    }
    return identity;
});

// Map incoming values with `func`.
//
//     func := function(Value) Value
//     return := Iterator
iter.map = function(func) {
    function map(value, send) {
        send.call(this, func.call(this, value));
    }
    return map;
};

// Map incoming values by applying `value` an an arguments array.
//
//     func := function(Value, ...) Value
//     return := Iterator
iter.mapApply = function(func) {
    function mapApply(value, send) {
        send.call(this, func.apply(this, value));
    }
    return mapApply;
};

// Filter incoming values with `func`.
//
//     func := function(Value) Boolean
//     return := Iterator
iter.filter = function(func) {
    function filter(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        }
    }
    return filter;
};

// Fold over the incoming stream. Call `func` where `current` begins with value
// `initial` and the return value sets `current` for the next call.
//
//     initial := Value
//     func := function(Value, Value) Value
//     return := Iterator
iter.fold = function(initial, func) {
    var current = initial;
    function fold(value, send) {
        current = func.call(this, current, value);
        send.call(this, current);
    }
    return fold;
};

// Chain a list of iterator functions together. Each iterator is applied in
// sequence.
//
//     iterator := Iterator
//     return := Iterator
iter.chain = function(/*iterator, ...*/) {
    if (arguments.length === 0) {
        return iter.identity();
    }

    if (arguments.length === 1) {
        return arguments[0];
    }

    return _.reduceRight(arguments, function(next, current) {
        function chain(value, send) {
            current.call(this, value, function(value) {
                next.call(this, value, send);
            });
        }
        return chain;
    }, iter.identity(), this);
};

// Send a constant `value` for every received value.
//
//     value := Value
//     return := Iterator
iter.constant = function(value) {
    function constant() {
        return value;
    }
    return iter.map(constant);
};

// For incoming values, send an array of up to `n` received values in that
// order.
//
//     n := Number, > 1
//     return := Iterator
iter.lastN = function(n) {
    frp.assert(n > 1, 'lastN requires n > 1');

    //     values := [Value, ...]
    //     value, return := Value
    function lastN(values, value) {
        var next = [value].concat(values);
        next.length = Math.min(next.length, n);
        return next;
    }
    return iter.fold([], lastN);
};

// Ensure the the argument, which must be array-like, has at least `n`
// elements. This is often chained with `lastN`.
//
//     n := Integer, > 0
iter.atLeastN = function(n) {
    frp.assert(n > 0);

    //     args := Array-like
    //     return := Boolean
    function atLeastN(args) {
        return args.length >= n;
    }
    return iter.filter(atLeastN);
};

// For the first value, call `once`. Afterwards, call `then`.
//
//     once, then, return := Iterator
iter.onceThen = function(once, then) {
    var current = function() {
        current = then;
        once.apply(this, arguments);
    };
    function onceThen() {
        current.apply(this, arguments);
    }
    return onceThen;
};

// Only send values unique from the previously received value. `isEqual`
// defaults to [`_.isEqual`](http://underscorejs.org/#isEqual).
//
//     isEqual := function(Value, Value) Boolean
//     return := Iterator
iter.unique = function(isEqual/*?*/) {
    if (!_.isFunction(isEqual)) {
        isEqual = _.bind(_.isEqual, _);
    }

    var current;
    function setAndSend(value, send) {
        current = value;
        send.call(this, current);
    }
    function sendIfEqual(value, send) {
        if (!isEqual.call(this, current, value)) {
            setAndSend.call(this, value, send);
        }
    }
    return iter.onceThen(setAndSend, sendIfEqual);
};

// Send received values until `func` returns falsy.
//
//     func := function(Value) Boolean
//     return := Iterator
iter.takeWhile = function(func) {
    var taking = function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        } else {
            taking = $.noop;
        }
    };
    function takeWhile() {
        taking.apply(this, arguments);
    }
    return takeWhile;
};

// Send no received values until `func` returns falsy.
//
//     func := function(Value) Boolean
//     return := Iterator
iter.dropWhile = function(func) {
    var dropping = function(value, send) {
        if (!func.call(this, value)) {
            dropping = iter.identity();
            send.call(this, value);
        }
    };
    function dropWhile() {
        dropping.apply(this, arguments);
    }
    return dropWhile;
};

// Send the last value after receiving no values for `wait` ms.
//
//     wait := Number
//     return := Iterator
iter.debounce = function(wait) {
    return _.debounce(iter.identity(), wait);
};

// Send no more than one value per `wait` ms.
//
//     wait := Number
//     return := Iterator
iter.throttle = function(wait) {
    return _.throttle(iter.identity(), wait);
};

// Send incoming values after a delay of `wait` ms. This relies on the
// scheduler, so order cannot be guaranteed.
//
//     wait := Number
//     return := Iterator
iter.delay = function(wait) {
    function delay(value, send) {
        _.chain(send).bind(this, value).delay(wait);
    }
    return delay;
};

// Turn incoming values into a resolved promise for a value.
//
//     return := Iterator
iter.promise = _.once(function() {
    //     value := Value
    //     return := $.Deferred
    function promise(/*value*/) {
        return jQuery.Deferred().resolveWith(this, arguments).promise();
    }
    return iter.map(promise);
});

// Remove promise wrappers. Order is not guaranteed.
//
//     return := Iterator
iter.unpromise = _.once(function() {
    //     promise := $.Deferred
    //     send := Send
    function unpromise(promise, send) {
        promise.done(send);
    }
    return unpromise;
});

// Call `abort` on the previous value sent when sending a new value. This
// iterator can be used in a stream of XHRs to cancel the currently running XHR
// when receiving a new one.
//
//     return := Iterator
iter.abortLast = _.once(function() {
    //     current, last := Value
    function abortLast(current, last) {
        last.abort();
        return current;
    }
    return iter.chain(
        iter.lastN(2),
        iter.atLeastN(2),
        iter.mapApply(abortLast));
});

// Map promises through a filter. Order is not guaranteed.
//
//     done := function(/*...*/) Value
//     return := Iterator
iter.mapPromise = function(done) {
    //     promise, return := $.Deferred
    function mapPromise(promise) {
        return promise.then(done);
    }
    return iter.map(mapPromise);
};

// Build an iterator. Pass an even number of arguments, alternating between the
// name of an iterator in `frp.iter` and an array of arguments.
//
//     arguments := String, Array || null, String, Array || null, ...
//     return := Iterator
iter.build = function(/*name1, args1, name2, args2, ...*/) {
    var len = arguments.length;
    frp.assert((len % 2) === 0, 'build() requires an even number of arguments');

    var chainArgs = [];
    for (var i = 0; i < len; i += 2) {
        var name = arguments[i];
        var args = arguments[i + 1];
        frp.assert(_.isString(name) && _.isFunction(iter[name]),
                   'name must refer to a function in frp.iter');
        frp.assert((args === null) ||
                   _.isArray(args) ||
                   ('length' in args),
                   'args must be arralike');

        chainArgs.push(iter[name].apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
// Vector Clocks
// -------------
//
// [Vector Clocks](http://en.wikipedia.org/wiki/Vector_clock) provide event
// ordering without requiring time-based synchronization between multiple
// threads of execution.
/* globals frp */

// Create a new vector clock.
//
//     return := VectorClock
function VectorClock() {}

// Wrap the constructor for ease.
//
//     return := VectorClock
VectorClock.create = function() {
    return new VectorClock();
};

// Map names to integers. Since vector clocks are read-only structures, it's
// safe to use this so long as the name `clocks` is overridden in new instances.
VectorClock.prototype.clocks = {};

function returnZero() {
    return 0;
}

// Get the value of a key in the clock. Returns an integer >= 0.
//
//     key := String
//     return := Number, integer > 0
VectorClock.prototype.getClock = function(key) {
    return frp.getDefault.call(this, this.clocks, key, returnZero);
};

// Return `true` iff this clock is a descendant of `other`.
//
//     other := VectorClock
//     return := Boolean
VectorClock.prototype.descends = function(other) {
    return _.all(other.clocks, function(value, key) {
        return this.getClock(key) >= value;
    }, this);
};

// Merge this vector clock with another.
//
//     other := VectorClock
//     return := VectorClock
VectorClock.prototype.merge = function(other) {
    var merged = VectorClock.create();
    merged.clocks = frp.heir(merged.clocks);
    var vclocks = _.chain([this, other]);
    vclocks
        .pluck('clocks')
        .map(_.keys)
        .union()
        .sort()
        .uniq(/*sorted=*/true)
        .each(function(key) {
            merged.clocks[key] = vclocks
                .invoke('getClock', key)
                .max()
                .value();
        }, this);
};

// Return a vector clock with `name` incremented by 1.
//
//     name := String
//     return := VectorClock
VectorClock.prototype.increment = function(name) {
    var incr = VectorClock.create();
    incr.clocks = frp.heir(this.clocks);
    incr.clocks[name] = incr.getClock(name) + 1;
    return incr;
};

// Export.
frp.VectorClock = VectorClock;
// Event Streams
// -------------

/* globals frp */

// Create an event stream. Some streams are hooked to native (external) event
// handlers. Others must be triggered directly by calling `emit`.
//
//     return := Stream
function Stream() {
    _.bindAll(this, 'receive');
    this.cancel = _.once(this.cancel);
    this.onEmit = jQuery.Callbacks('memory unique');
    this.onCancel = jQuery.Callbacks('memory once unique');
}

// Wrap the constructor for ease of use.
//
//     return := Stream
Stream.create = function() {
    return new Stream();
};

// By default, use an identity mapping for incoming events. Set `iter` to any
// `Iterator` to modify the incoming event stream.
Stream.prototype.iter = frp.iter.identity();

// Set the iterator for this stream.
//
//     iterator := Iterator
//     return := this
Stream.prototype.setIter = function(/*iterator, ...*/) {
    this.iter = frp.iter.chain.apply(this, arguments);
    return this;
};

// Build an iterator for this stream.
//
//     arguments := see frp.iter.build
//     return := this
Stream.prototype.build = function(/*...*/) {
    this.iter = frp.iter.build.apply(this, arguments);
    return this;
};

// Receive an event. This function is not usually called directly, but rather by
// callbacks from upstream even signals.
//
//     value := Value
Stream.prototype.receive = function(value) {
    this.iter(value, this.emit);
};

// Call `onEmit` callbacks with optional `value`. Because of the implementation,
// all arguments passed will be emitted. It is not recommended to use multiple
// arguments.
//
//     value := Value
//     return := this
Stream.prototype.emit = function(/*value?*/) {
    this.onEmit.fireWith(this, arguments);
    return this;
};

// Cancel all event emission. Call `onCancel` callbacks.
//
//     return := Stream
Stream.prototype.cancel = function() {
    this.onEmit.disable();
    this.onCancel.fireWith(this, [this]);
    return this;
};

// Send values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.sendTo = function(stream) {
    this.onEmit.add(stream.receive);
    return this;
};

// Stop sending values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.unSendTo = function(stream) {
    this.onEmit.remove(stream.receive);
    return this;
};

// Return `true` iff this stream sends to the other stream.
//
//     stream := Stream
//     return := Boolean
Stream.prototype.sendsTo = function(stream) {
    return this.onEmit.has(stream.receive);
};

// Create a stream that emits events from all argument streams.
//
//     arguments := nested array(s) of Stream
//     return := Stream
Stream.merge = function(/*stream, ...*/) {
    var streams = _.flatten(arguments);
    var merged = this.create();
    _.invoke(streams, 'sendTo', merged);
    return merged;
};

// Merge this stream with other streams.
//
//     arguments := nested array(s) of Stream
//     return := Stream
Stream.prototype.merge = function(/*stream, ...*/) {
    return Stream.merge(this, _.toArray(arguments));
};

// External Event Sources (aka Signals)
// ------------------------------------

// Create a stream bound to a dom event using jQuery. See docs for
// [jQuery](http://api.jquery.com/jQuery/) regarding arguments.
//
//     source := jQuery || arguments to jQuery()
//     event := String
//     selector := String
//     return := Stream
Stream.$ = function(source/*, event, selector?*/) {
    frp.assert(arguments.length > 1);

    var $source = jQuery(source);
    frp.assert($source.length > 0, 'empty jQuery');

    var stream = Stream.create();
    var args = Array.prototype.slice.call(arguments, 1);
    args.push(_.bind(stream.emit, stream)); // event handler
    stream.onCancel.add(function() {
        $source.off.apply($source, args);
    });
    $source.on.apply($source, args);

    return stream;
};

// Trigger via google maps events.
//
//     source := google.maps.Object
//     event := String
//     return := Stream
Stream.gmap = function(source, event) {
    /* globals google */
    frp.assert(_.isString(event));

    var stream = Stream.create();
    var callback = _.bind(stream.emit, stream);
    var listener = google.maps.addListener(source, event, callback);
    stream.onCancel.add(function() {
        google.maps.removeListener(listener);
    });

    return stream;
};

// Call `sample` to emit a value every `wait` ms. Very small values of `wait`
// will produce unexpected behavior.
//
//     sample := function() Value
//     wait := Number
//     return := Stream
Stream.sample = function(sample, wait) {
    frp.assert(wait > 0);

    var stream = Stream.create();
    var handle = window.setInterval(function() {
        stream.emit(sample());
    }, wait);
    stream.onCancel.add(function() {
        window.clearInterval(handle);
    });
    return stream;
};

// Export.
frp.Stream = Stream;
// Stream Proxy
// ------------
//
// Sometimes an event source is available before a sink or vice-versa. `Proxy`
// helps by providing named `Stream`s that can be chained as sources or sinks of
// particular values.
/* globals frp */

// Make a `Proxy`
//
//     return := Proxy
function Proxy() {
    this.streams = {};
}

// Provide a non-`new` way of constructing instances.
//     return := Proxy
Proxy.create = function() {
    return new Proxy();
};

// Get a stream by name, creating it iff it does not yet exist.
//
//     name := String
//     return := Stream
Proxy.prototype.get = function(name) {
    return frp.getDefault.call(frp.Stream, this.streams, name,
                               frp.Stream.create);
};

// Export.
frp.Proxy = Proxy;
jQuery.fn.extend({
    // Call `frp.Stream.$()` conveniently from the jQuery API.
    //
    //     event := String
    //     selector := String
    //     return := frp.Stream
    'toStream': function(/*event, selector?*/) {
        var args = [this];
        args.push.apply(args, arguments);
        return frp.Stream.$.apply(frp.Stream, args);
    }
});
}).call(this);
