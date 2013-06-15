// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each `Iterator` is a function with the same signature. every
// `frp.iter` function returns an `Iterator`.

/* globals frp */
var iter = {};

// Send every received value.
//
//     value := Value
//     send := Send
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
    frp.assert(n > 1);

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
        once.apply(this, arguments);
        current = then;
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

// Send the last value after reeiving no values for `wait` ms.
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
    function promise() {
        return jQuery.Deferred().resolveWith(this, arguments).promise();
    }
    return iter.map(promise);
});

// Remove promise wrappers. Order is not guaranteed.
//
//     promise := $.Deferred
//     send := function(Value)
//     return := Iterator
iter.unpromise = _.once(function() {
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
//     return := Iterator
iter.mapPromise = function(done) {
    function mapPromise(promise) {
        return promise.then(done);
    }
    return iter.map(mapPromise);
};

// Build an iterator. Pass an even number of arguments, alternating between the
// name of an iterator in `frp.iter` and an array of arguments.
//
//     arguments := String, Array, String, Array, ...
//     return := Iterator
iter.build = function(/*name1, args1, name2, args2, ...*/) {
    var len = arguments.length;
    frp.assert((len % 2) === 0);

    var chainArgs = [];
    for (var i = 0; i < len; i += 2) {
        var name = arguments[i];
        var args = arguments[i + 1];
        chainArgs.push(iter[name].apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
