// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each `Iterator` is a function with the same signature. Every
// `frp.iter` function returns an `Iterator`.

/* global frp */
var iter = {};

//     func := function(Value, ...) Value
//     return := Iterator
var applyValue = function(func) {
    frp.assert(_.isFunction(func));

    //     args := Array || Arguments
    //     return := Value
    function applyValue(args) {
        return func.apply(this, args);
    }
    return applyValue;
};

// Construct an iterator that treats the first argument as an arguments.
//
//     iterator, return := Iterator
var applier = function(iterator) {
    //     func := function(Value, ...) Value
    //     return := Iterator
    function applier(func) {
        return iterator(applyValue(func));
    }
    return applier;
};

//     func := Function
//     return := Function
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

    //     value := Value
    //     send := Send
    function map(value, send) {
        var mapped = func.call(this, value);
        send.call(this, mapped);
    }
    return map;
};

// Map incoming values by applying `value` as an arraylike. See `iter.map` for
// arguments.
//
//     return := Iterator
iter.mapApply = applier(iter.map);

// Emit every received value.
//
//     return := Iterator
iter.identity = _.once(function() {
    return iter.map(_.identity);
});

// Call a named function (with optional arguments) on every received value,
// emitting the result.
//
//     fname := String
//     arg := Value
//     return := Iterator
iter.invoke = function(fname/*, arg, ...*/) {
    var args = _(arguments).slice(1);
    //     value, return := Value
    function invoke(value) {
        return value[fname].apply(value, args);
    }
    return iter.map(invoke);
};

// Apply brackets to incoming objects. This also works for array indices. `key`
// is usually a `String` or array index, but anything that stringifies will
// work.
//
//     key := Value
//     return := Iterator
iter.get = function(key) {
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
    return iter.map(_.first);
});

// Get the last element from arraylike values in a stream.
//
//     return := Iterator
iter.last = _.once(function() {
    return iter.map(_.last);
});

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
//     return := Iterator
iter.tapApply = applier(iter.tap);

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
//     return := Iterator
iter.filterApply = applier(iter.filter);

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
        var last = (values.length < n) ? values : values.slice(0, n - 1);
        next.push.apply(next, last);
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

// Defer emitting events until the next stack frame. Order is preserved, but the
// stack before this point will not be available.
//
//     return := Iterator
iter.defer = function() {
    var queue = [];
    function shift() {
        queue.shift()();
    }
    function defer(value, send) {
        queue.push(_.bind(send, this, value));
        _.defer(shift);
    }
    return defer;
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
        //     return := jQuery.Deferred
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
    //     previous := jQuery.Deferred
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
    //     promise := jQuery.Deferred
    function setMostRecent(promise) {
        mostRecent = promise;
    }
    //     promise := jQuery.Deferred
    //     send := Send
    function unpromiseMostRecent(promise, send) {
        setMostRecent(promise);
        var context = this;
        promise.done(function(value) {
            if (promise === mostRecent) {
                send.call(context, value);
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
    frp.assert(arguments.length > 0);

    if (arguments.length === 1) {
        return arguments[0];
    }

    var first = _.last(arguments);
    var rest = _(arguments).slice(0, -1);
    //     next, current := Iterator
    return _.reduceRight(rest, function(next, current) {
        //     value := Value
        //     send := Send
        function chain(value, send) {
            //     nextValue := Value
            function sendNext(nextValue) {
                next.call(this, nextValue, send);
            }
            current.call(this, value, sendNext);
        }
        return chain;
    }, first, this);
};

// Build an iterator. Pass an even number of arguments, alternating between the
// name of an iterator in `frp.iter` and an array of arguments.
//
//     name := String
//     args := Array || null
//     return := Iterator
iter.build = function(/*(name, args), ...*/) {
    var len = arguments.length;
    frp.assert(len > 0);
    frp.assert((len % 2) === 0, 'build requires an even number of arguments');

    var chainArgs = [];
    for (var i = 0; i < len; i += 2) {
        var name = arguments[i];
        var args = arguments[i + 1];
        var iterator = iter[name];
        frp.assert(_.isFunction(iterator),
                   'name must refer to a function in frp.iter');
        chainArgs.push(iterator.apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
