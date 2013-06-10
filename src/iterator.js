// Continuation-Style Iterators
// ----------------------------
//
// This is a library of standard iterators for building iteration chains within
// `Stream`s. Each iterator is a function with the same signature. Some
// functions in this library build iterators, while others are simple iterators
// to be used in a chain.

/* globals frp */
var iter = {};

// Send every received value.
//
//     value := Value
//     send := Send
function identity(value, send) {
    send.call(this, value);
}
iter.identity = identity;

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
        return iter.identity;
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
    }, iter.identity);
};

// Send a constant `value` for every received value.
//
//     value := Value
//     return := Iterator
iter.constant = function(value) {
    return iter.map(function() {
        return value;
    });
};

// For incoming values, send an array of up to `n` received values in that
// order.
//
//     n := Number, > 1
//     return := Iterator
iter.lastN = function(n) {
    frp.assert(n > 1);

    return iter.fold([], function(values, value) {
        var next = [value].concat(values);
        next.length = Math.min(next.length, n);
        return next;
    });
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

// Only send values unique from the previously received value.
//
//     isEqual? := function(Value, Value) Boolean
//     return := Iterator
iter.unique = function(isEqual) {
    if (!_.isFunction(isEqual)) {
        isEqual = _.bind(_.isEqual, _);
    }

    var current;
    var setAndSend = function(value, send) {
        current = value;
        send.call(this, current);
    };
    return iter.onceThen(setAndSend, function(value, send) {
        if (!isEqual.call(this, current, value)) {
            setAndSend.call(this, value, send);
        }
    });
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
            dropping = iter.identity;
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
    return _.debounce(iter.identity, wait);
};

// Send no more than one value per `wait` ms.
//
//     wait := Number
//     return := Iterator
iter.throttle = function(wait) {
    return _.throttle(iter.identity, wait);
};

// Send incoming values after a delay of `wait` ms. This relies on the
// scheduler, so order cannot be guaranteed.
//
//     wait := Number
//     return := Iterator
iter.delay = function(wait) {
    var handle;
    function delay(value, send) {
        _.chain(send).bind(this, [value]).delay(wait);
    }
    return delay;
};

// Turn incoming values into a resolved promise for a value.
//
//     return := Iterator
iter.promise = iter.map(function() {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
});

// Remove promise wrappers. Order is not guaranteed.
//
//     promise := $.Deferred
//     send := function(Value)
iter.unpromise = function(promise, send) {
    promise.done(send);
};

// Call `abort` on the previous value sent when sending a new value. This
// iterator can be used in a stream of XHRs to cancel the currently running XHR
// when receiving a new one.
iter.abortLast = iter.chain(
    iter.lastN(2),
    iter.mapApply(function(current, last) {
        if (arguments.length > 1) {
            last.abort();
        }
        return current;
    }));

// Map promises through a filter. Order is not guaranteed.
//
//     return := Iterator
iter.mapPromise = function(done) {
    return iter.map(function(promise) {
        return promise.then(done);
    });
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
        chainArgs.push(frp.iter[name].apply(this, args));
    }
    return iter.chain.apply(this, chainArgs);
};

// Export.
frp.iter = iter;
