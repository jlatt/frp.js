/* globals frp: false */

// Types:
//
//     Send := function(Value)
//     Iterator := function(Value, Send)

// Send every received value.
//
//     value := Value
//     send := Send
function identity(value, send) {
    send.call(this, value);
}

// Map incoming values with `func`.
//
//     func := function(Value) Value
//     return := Iterator
function map(func) {
    return function(value, send) {
        send.call(this, func.call(this, value));
    };
}

// Map incoming values by applying `value` an an arguments array.
//
//     func := function(Value, ...) Value
//     return := Iterator
function mapApply(func) {
    return function(value, send) {
        send.call(this, func.apply(this, value));
    };
}

// Filter incoming values with `func`.
//
//     func := function(Value) Boolean
//     return := Iterator
function filter(func) {
    return function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        }
    };
}

// Fold over the incoming stream. Call `func` where `current` begins with value
// `initial` and the return value sets `current` for the next call.
//
//     initial := Value
//     func := function(Value, Value) Value
//     return := Iterator
function fold(initial, func) {
    var current = initial;
    return function(value, send) {
        current = func.call(this, current, value);
        send.call(this, current);
    };
}

// Chain a list of iterator functions together.
//
//     iterator := Iterator, ...
//     return := Iterator
function chain(/*iterator, ...*/) {
    if (arguments.length === 0) {
        return identity;
    }

    if (arguments.length === 1) {
        return arguments[0];
    }

    return _.reduceRight(arguments, function(next, current) {
        return function(value, send) {
            current.call(this, value, function(value) {
                next.call(this, value, send);
            });
        };
    }, identity);
}

// Send a constant `value` for every received value.
//
//     value := Value
//     return := Iterator
function constant(value) {
    return map(function() {
        return value;
    });
}

// For incoming values, send an array of up to `n` received values in that
// order.
//
//     n := Number, > 1
//     return := Iterator
function lastN(n) {
    frp.assert(n > 1);

    return fold([], function(values, value) {
        var next = [value].concat(values);
        next.length = Math.min(next.length, n);
        return next;
    });
}

// For the first value, call `once`. Afterwards, call `then`.
//
//     once, then, return := Iterator
function onceThen(once, then) {
    var current = function() {
        once.apply(this, arguments);
        current = then;
    };
    return function() {
        current.apply(this, arguments);
    };
}

// Only send values unique from the previously received value.
//
//     isEqual := function(Value, Value) Boolean [optional]
//     return := Iterator
function unique(isEqual) {
    if (!_.isFunction(isEqual)) {
        isEqual = _.bind(_.isEqual, _);
    }

    var current;
    var setAndSend = function(value, send) {
        current = value;
        send.call(this, current);
    };
    return onceThen(setAndSend, function(value, send) {
        if (!isEqual.call(this, current, value)) {
            setAndSend.call(this, value, send);
        }
    });
}

// Send received values until `func` returns falsy.
//
//     func := function(Value) Boolean
//     return := Iterator
function takeWhile(func) {
    var taking = function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        } else {
            taking = $.noop;
        }
    };
    return function() {
        taking.apply(this, arguments);
    };
}

// Send no received values until `func` returns falsy.
//
//     func := function(Value) Boolean
//     return := Iterator
function dropWhile(func) {
    var dropping = function(value, send) {
        if (!func.call(this, value)) {
            dropping = identity;
            send.call(this, value);
        }
    };
    return function() {
        dropping.apply(this, arguments);
    };
}

// Send the last value after reeiving no values for `wait` ms.
//
//     wait := Number
//     return := Iterator
function debounce(wait) {
    return _.debounce(identity, wait);
}

// Send no more than one value per `wait` ms.
//
//     wait := Number
//     return := Iterator
function throttle(wait) {
    return _.throttle(identity, wait);
}

// Send incoming values after a delay of `wait` ms. This relies on the
// scheduler, so order cannot be guaranteed.
//
//     wait := Number
//     return := Iterator
function delay(wait) {
    var handle;
    return function(value, send) {
        _.chain(send).bind(this, [value]).delay(wait);
    };
}

// Turn incoming values into a resolved promise for a value.
//
//     return := Iterator
var promise = map(function() {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
});

// Remove promise wrappers. Order is not guaranteed.
//
//     promise := $.Deferred
//     send := function(Value)
function unpromise(promise, send) {
    promise.done(send);
}

// Call `abort` on the previous value sent when sending a new value.
var abortLast = chain(lastN(2), mapApply(function(current, last) {
    if (arguments.length > 1) {
        last.abort();
    }
    return current;
}));

// Map promises through a filter. Order is not guaranteed.
//
//     return := Iterator
function mapPromise(done) {
    return map(function(promise) {
        return promise.then(done);
    });
}

// Build an iterator. Pass an even number of arguments, alternating between the
// name of an iterator in `frp.iter` and an array of arguments.
//
//     arguments := String, Array, String, Array, ...
//     return := Iterator
function build(/*name1, args1, name2, args2, ...*/) {
    var len = arguments.length;
    frp.assert((len % 2) === 0);

    var chainArgs = [];
    for (var i = 0; i < len; i += 2) {
        var name = arguments[i];
        var args = arguments[i + 1];
        chainArgs.push(frp.iter[name].apply(this, args));
    }
    return chain.apply(this, chainArgs);
}

// Export.
frp.iter = {
    'abortLast':  abortLast,
    'chain':      chain,
    'constant':   constant,
    'debounce':   debounce,
    'delay':      delay,
    'dropWhile':  dropWhile,
    'filter':     filter,
    'fold':       fold,
    'identity':   identity,
    'lastN':      lastN,
    'map':        map,
    'mapPromise': mapPromise,
    'mapApply':   mapApply,
    'onceThen':   onceThen,
    'promise':    promise,
    'takeWhile':  takeWhile,
    'throttle':   throttle,
    'unique':     unique,
    'unpromise':  unpromise
};
