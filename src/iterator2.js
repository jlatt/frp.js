function noop(value, send) {}

function identity(value, send) {
    send.call(this, value);
}

function map(func) {
    return function(value, send) {
        identity.call(this, value, func.call(this, value));
    };
}

function mapApply(func) {
    return function(value, send) {
        identity.call(this, value, func.apply(this, value));
    };
}

function filter(func) {
    return function(value, send) {
        if (func.call(this, value)) {
            identity.apply(this, arguments);
        }
    };
}

function fold(initial, func) {
    var current = initial;
    return function(value, send) {
        current = func.call(this, current, value);
        send.call(this, value);
    };
}

function chain(/*iterator, ...*/) {
    return _.reduceRight(arguments, function(next, current) {
        return function(value, send) {
            current.call(this, value, function(value) {
                next.call(this, send, value);
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
    return fold([], function(value, values) {
        var last = values.slice();
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

var promise = map(function() {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
});

function unpromise(promise, send) {
    promise.done(send);
}

var abortPrevious = chain(lastN(2), mapApply(function(current, last) {
        if (arguments.length > 1) {
            last.abort();
        }
        return current;
    }));
}

frp.iter = {
    'abortPrevious': abortPrevious,
    'chain': chain,
    'constant': constant,
    'debounce': debounce,
    'dropWhile': dropWhile,
    'filter': filter,
    'fold': fold,
    'identity': identity,
    'lastN': lastN,
    'map': map,
    'mapApply': mapApply,
    'noop': noop,
    'onceThen': onceThen,
    'promise': promise,
    'takeWhile': takeWhile,
    'throttle': throttle,
    'unique': unique,
    'unpromise': unpromise
};
