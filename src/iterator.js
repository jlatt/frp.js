// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each `Iterator` is a function with the same signature. Every
// `frp.iter` function returns an `Iterator`.

/* global frp, console */
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

iter.log = _.once(function() {
    function log(value) {
        console.log(value);
        return value;
    }
    return iter.map(log);
});

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

iter.filterApply = function(func) {
    function filterApply(value, send) {
        if (func.apply(this, value)) {
            send.call(this, value);
        }
    }
    return filterApply;
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

iter.foldApply = function(initial, func) {
    var current = initial;
    function foldApply(value, send) {
        var args = [current];
        args.push.apply(args, value);
        current = func.apply(this, args);
        send.call(this, current);
    }
    return foldApply;
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
            function sendNext(nextValue) {
                next.call(this, nextValue, send);
            }
            current.call(this, value, sendNext);
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
    function sendIfEqual(value/*, send*/) {
        if (!isEqual.call(this, current, value)) {
            setAndSend.apply(this, arguments);
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
        if (_.isObject(last) && _.isFunction(last.abort)) {
            last.abort();
        }
        return current;
    }
    return iter.chain(
        iter.lastN(2),
        iter.mapApply(abortLast));
});

// Map promises through a filter. the order `done` is called on each deferred is
// not guaranteed, but the chainable deferred are returned in order.
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
                   _.isArguments(args),
                   ('length' in args),
                   'args must be arraylike');

        chainArgs.push(iter[name].apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
