// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each `Iterator` is a function with the same signature. Every
// `frp.iter` function returns an `Iterator`.

/* global frp */
var iter = {};

var applyValue = function(func) {
    frp.assert(_.isFunction(func));

    function applyValue(args) {
        return func.apply(this, args);
    }
    return applyValue;
};

var not = function(func) {
    frp.assert(_.isFunction(func));

    function not() {
        return !func.apply(this, arguments);
    }
    return not;
};

// Apply incoming values varargs-style with `send` following.
//
//     func := function(Value, ..., Send)
//     return := Iterator
iter.apply = function(func) {
    frp.assert(_.isFunction(func));

    function apply(value, send) {
        var args = _.toArray(value);
        args.push(send);
        func.apply(this, args);
    }
    return apply;
};

// Map incoming values with `func`.
//
//     func := function(Value) Value
//     return := Iterator
iter.map = function(func) {
    frp.assert(_.isFunction(func));

    function map(value, send) {
        var mapped = func.call(this, value);
        send.call(this, mapped);
    }
    return map;
};

// Emit every received value.
//
//     return := Iterator
iter.identity = _.once(function() {
    return iter.map(_.identity);
});

// Pluck a value from an object.
//
//     key := String || Number, integer
//     return := Iterator
iter.get = function(key) {
    frp.assert(_.isString(key) || _.isNumber(key));

    //     value, return := Value
    function get(value) {
        return value[key];
    }
    return iter.map(get);
};

// Get the 0-keyed element from a stream of values, usually arraylikes.
//
//     return := Iterator
iter.first = _.once(function() {
    return iter.get(0);
});

// Map incoming values by applying `value` as an arraylike.
//
//     func := function(Value, ...) Value
//     return := Iterator
iter.mapApply = function(func) {
    return iter.map(applyValue(func));
};

// Perform some operation on each value then emit. This is a good way to contain
// side effects, like logging.
//
//     func := function(Value)
//     return := Iterator
iter.tap = function(func) {
    frp.assert(_.isFunction(func));

    function tap(value) {
        func.apply(this, arguments);
        return value;
    }
    return iter.map(tap);
};

// Tap an event stream, applying each value as an arraylike.
//
//     func := function(Value, ...)
//     return := Iterator
iter.tapApply = function(func) {
    return iter.tap(applyValue(func));
};

// Filter incoming values with `func`.
//
//     func := function(Value) Boolean
//     return := Iterator
iter.filter = function(func) {
    frp.assert(_.isFunction(func));

    function filter(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        }
    }
    return filter;
};

// Filter, but apply `func` with arraylike values.
//
//     func := function(Value, ...) Boolean
//     return := Iterator
iter.filterApply = function(func) {
    return iter.filter(applyValue(func));
};

// Fold over the incoming stream. Call `func` where `current` begins with value
// `initial` and the return value sets `current` for the next call.
//
//     initial := Value
//     func := function(Value, Value) Value
//     return := Iterator
iter.fold = function(initial, func) {
    frp.assert(_.isFunction(func));

    var current = initial;
    function fold(value) {
        current = func.call(this, current, value);
        return current;
    }
    return iter.map(fold);
};

//     initial := Value
//     func := function(Value, ...) Value
//     return := Iterator
iter.foldApply = function(initial, func) {
    frp.assert(_.isFunction(func));

    function foldApply(current, value) {
        var args = [current];
        args.push.apply(args, value);
        return func.apply(this, args);
    }
    return iter.fold(initial, foldApply);
};

// Number incoming values with monotonically increasing ordinals. `order`
// specifies the initial value.
//
//     order := Number
//     return := Iterator
iter.enumerate = function(initial, step) {
    if (!_.isNumber(initial)) {
        initial = 0;
    }
    if (!_.isNumber(step)) {
        step = 1;
    }

    function enumerate(last, order, value) {
        return [value, order + step];
    }
    return iter.foldApply([undefined, initial - step], enumerate);
};

// For incoming values, send an array of up to `n` received values, most
// recently received first.
//
//     n := Number, > 1
//     return := Iterator
iter.lastN = function(n) {
    frp.assert(n > 1, 'lastN requires n > 1');

    //     values := [Value, ...]
    //     value, return := Value
    function lastN(values, value) {
        var next = [value];
        next.push.apply(next, values.slice(0, n - 1));
        return next;
    }
    return iter.fold([], lastN);
};

// For the first value, call `once`. Afterwards, call `then`.
//
//     once, then, return := Iterator
iter.onceThen = function(once, then) {
    frp.assert(_.isFunction(once));
    frp.assert(_.isFunction(then));

    var current = function() {
        current = then;
        once.apply(this, arguments);
    };
    function onceThen() {
        current.apply(this, arguments);
    }
    return onceThen;
};

// Only send values unique from the previously received value. The first value
// is always sent. `isEqual` defaults to
// [`_.isEqual`](http://underscorejs.org/#isEqual).
//
//     isEqual := function(Value, Value) Boolean
//     return := Iterator
iter.unique = function(isEqual/*?*/) {
    if (!_.isFunction(isEqual)) {
        isEqual = _.isEqual;
    }
    return iter.chain(
        iter.lastN(2),
        iter.onceThen(
            iter.identity(),
            iter.filterApply(not(isEqual))),
        iter.first());
};

// Send the last value after receiving no values for `wait` ms.
//
//     wait := Number, integer > 0
//     return := Iterator
iter.debounce = function(wait) {
    frp.assert(wait > 0);

    return _.debounce(iter.identity(), wait);
};

// Send no more than one value per `wait` ms.
//
//     wait := Number, integer > 0
//     return := Iterator
iter.throttle = function(wait) {
    frp.assert(wait > 0);

    return _.throttle(iter.identity(), wait);
};

// Turn incoming values into a resolved promise for a value.
//
//     return := Iterator
iter.promise = _.once(function() {
    //     value := Value
    //     return := jQuery.Deferred
    function promise(/*value*/) {
        return jQuery.Deferred().resolveWith(this, arguments).promise();
    }
    return iter.map(promise);
});

// Remove promise wrappers. Order is not guaranteed. Chain after `orderPromises`
// to preserve order of received values.
//
//     return := Iterator
iter.unpromise = _.once(function() {
    //     promise := jQuery.Deferred
    //     send := Send
    function unpromise(promise, send) {
        promise.done(_.bind(send, this));
    }
    return unpromise;
});

// Return a promise chained to the previously received promise. Used before
// `unpromise`, it will guarantee order of unpacked values.
//
//     return := Iterator
iter.orderPromises = _.once(function() {
    //     next, previous, return := jQuery.Deferred
    function orderPromises(next, previous) {
        function emitNext() {
            return next;
        }
        return previous.then(emitNext, emitNext);
    }
    return iter.chain(
        iter.lastN(2),
        iter.onceThen(
            iter.first(),
            iter.mapApply(orderPromises)));
});

// Call `abort` on the previous value sent when sending a new value. This
// iterator can be used in a stream of XHRs to cancel the currently running XHR
// when receiving a new one.
//
//     return := Iterator
iter.abortPreviousPromise = _.once(function() {
    //     current, previous := jQuery.Deferred
    function abortPreviousPromise(previous) {
        if (_.isFunction(previous.abort)) {
            previous.abort();
        }
    }
    return iter.chain(
        iter.lastN(2),
        iter.onceThen(
            iter.identity(),
            iter.chain(
                iter.get(1),
                iter.tap(abortPreviousPromise))),
        iter.first());
});

// Unwrap received promises, only emitting the most recently resolved values. If
// a new promise is received before the current promise resolves, the current
// promise's value is discarded.
//
//     return := Iterator
iter.unpromiseMostRecent = _.once(function() {
    var mostRecent;
    function setMostRecent(promise) {
        mostRecent = promise;
    }
    function unpromiseMostRecent(promise, send) {
        setMostRecent(promise);
        var context = this;
        promise.done(function(/*value*/) {
            if (promise === mostRecent) {
                send.apply(context, arguments);
            }
        });
    }
    return iter.onceThen(
        iter.tap(setMostRecent),
        unpromiseMostRecent);
});

// Chain a list of iterator functions together. Each iterator is applied in
// sequence.
//
//     iterator, return := Iterator
iter.chain = function(/*iterator, ...*/) {
    if (arguments.length === 0) {
        return iter.identity();
    }

    if (arguments.length === 1) {
        return arguments[0];
    }

    return _.reduceRight(arguments, function(next, current) {
        function chain(value, send) {
            function sendNext(nextValue) {
                next.call(this, nextValue, send);
            }
            current.call(this, value, sendNext);
        }
        return chain;
    }, iter.identity(), this);
};

// Build an iterator. Pass an even number of arguments, alternating between the
// name of an iterator in `frp.iter` and an array of arguments.
//
//     arguments := String, Array || null, String, Array || null, ...
//     return := Iterator
iter.build = function(/*name1, args1, name2, args2, ...*/) {
    var len = arguments.length;
    frp.assert((len % 2) === 0, 'build requires an even number of arguments');

    var chainArgs = [];
    for (var i = 0; i < len; i += 2) {
        var name = arguments[i];
        var args = arguments[i + 1];
        var iterator = iter[name];
        frp.assert(_.isFunction(iter[name]),
                   'name must refer to a function in frp.iter');
        frp.assert((args === null) ||
                   _.isArray(args) ||
                   _.isArguments(args) ||
                   ('length' in args),
                   'args must be arraylike');

        chainArgs.push(iterator.apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
