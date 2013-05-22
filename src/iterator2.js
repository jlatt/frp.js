// Do nothing.
function noop(value, send) {}

// Send every received value.
function identity(value, send) {
    send.call(this, value);
}

// Map incoming values with `func(value)`.
function map(func) {
    return function(value, send) {
        send.call(this, func.call(this, value));
    };
}

// Map incoming values by applying `value` an an arguments array.
function mapApply(func) {
    return function(value, send) {
        send.call(this, func.apply(this, value));
    };
}

// Filter incoming values with `func(value)`.
function filter(func) {
    return function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        }
    };
}

// Fold over the incoming stream. Call `func(current, value)` where `current`
// begins with value `initial` and the return value sets `current` for the next
// call.
function fold(initial, func) {
    var current = initial;
    return function(value, send) {
        current = func.call(this, current, value);
        send.call(this, current);
    };
}

// Chain a list of iterator functions together.
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
function constant(value) {
    return map(function() {
        return value;
    });
}

// For incoming values, send an array of up to `n` received values in that
// order.
function lastN(n) {
    frp.assert(n > 1);

    return fold([], function(values, value) {
        var last = values.slice(0, n - 1);
        last.unshift(value);
        if (last.length > n) {
            last.length = n;
        }
        return last;
    });
}

// For the first value, call `once`. Afterwards, call `then`.
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

// Send received values until `func` returns `false`.
function takeWhile(func) {
    var taking = function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        } else {
            taking = noop;
        }
    };
    return function() {
        taking.apply(this, arguments);
    };
}

// Send no received values until `func` returns `false`.
function dropWhile(func) {
    var dropping = function(value, send) {
        if (!func.call(this, value)) {
            dropping = noop;
            send.call(this, value);
        }
    };
    return function() {
        dropping.apply(this, arguments);
    };
}

// Send the last value after reeiving no values for `wait` ms.
function debounce(wait) {
    return _.debounce(identity, wait);
}

// Send no more than one value per `wait` ms.
function throttle(wait) {
    return _.throttle(identity, wait);
}

// Send incoming values after a delay of `wait` ms. This relies on the
// scheduler, so order cannot be guaranteed.
function delay(wait) {
    var handle;
    return function(value, send) {
        _.chain(send).bind(this, [value]).delay(wait);
    };
}

// Turn incoming values into a promise for a value.
var promise = map(function() {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
});

// Remove promise wrappers. Order is not guaranteed.
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
function mapPromise(done) {
    return map(function(promise) {
        return promise.then(done);
    });
}

//
// exports
//

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
    'noop':       noop,
    'onceThen':   onceThen,
    'promise':    promise,
    'takeWhile':  takeWhile,
    'throttle':   throttle,
    'unique':     unique,
    'unpromise':  unpromise
};
