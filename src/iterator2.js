function noop(value, send) {}

function identity(value, send) {
    send.call(this, value);
}

function map(func) {
    return function(value, send) {
        send.call(this, func.call(this, value));
    };
}

function mapApply(func) {
    return function(value, send) {
        send.call(this, func.apply(this, value));
    };
}

function filter(func) {
    return function(value, send) {
        if (func.call(this, value)) {
            send.call(this, value);
        }
    };
}

function fold(initial, func) {
    var current = initial;
    return function(value, send) {
        current = func.call(this, current, value);
        send.call(this, current);
    };
}

function chain(/*iterator, ...*/) {
    frp.assert(arguments.length > 1);

    return _.reduceRight(arguments, function(next, current) {
        return function(value, send) {
            current.call(this, value, function(value) {
                next.call(this, value, send);
            });
        };
    }, identity);
}

function constant(value) {
    return map(function() {
        return value;
    });
}

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

function onceThen(once, then) {
    var current = function() {
        once.apply(this, arguments);
        current = then;
    };
    return function() {
        current.apply(this, arguments);
    };
}

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

function debounce(wait) {
    return _.debounce(identity, wait);
}

function throttle(wait) {
    return _.throttle(identity, wait);
}

function delay(wait) {
    var handle;
    function makeDelay(value, send) {
        handle = _.chain(send).bind(this, [value]).delay(wait).value();
    }
    return onceThen(makeDelay, function(value, send) {
        window.clearTimeout(handle);
        makeDelay.apply(this, arguments);
    });
}

var promise = map(function() {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
});

function unpromise(promise, send) {
    promise.done(send);
}

var abortLastPromise = chain(lastN(2), mapApply(function(current, last) {
    if (arguments.length > 1) {
        last.abort();
    }
    return current;
}));

function mapPromise(done, fail) {
    return map(function(promise) {
        return promise.then(done, fail);
    });
}

//
// exports
//

frp.iter = {
    'abortLastPromise': abortLastPromise,
    'chain':            chain,
    'constant':         constant,
    'debounce':         debounce,
    'delay':            delay,
    'dropWhile':        dropWhile,
    'filter':           filter,
    'fold':             fold,
    'identity':         identity,
    'lastN':            lastN,
    'map':              map,
    'mapPromise':       mapPromise,
    'mapApply':         mapApply,
    'noop':             noop,
    'onceThen':         onceThen,
    'promise':          promise,
    'takeWhile':        takeWhile,
    'throttle':         throttle,
    'unique':           unique,
    'unpromise':        unpromise
};
