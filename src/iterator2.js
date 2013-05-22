function noop(value, send) {};

function identity(value, send) {
    send(value);
};

function map(func) {
    return function(value, send) {
        send(func(value));
    };
};

function filter(func) {
    return function(value, send) {
        if (func(value)) {
            send(value);
        }
    };
};

function fold(initial, func) {
    var current = initial;
    return function(value, send) {
        current = func(value, current);
        send(current);
    };
};

function chain(/*iterator, ...*/) {
    return _.reduceRight(arguments, function(next, current) {
        return function(value, send) {
            current(value, function(value) {
                next(send, value);
            });
        };
    }, identity);
};

function lastN(n) {
    return fold([], function(value, values) {
        var last = (values.length >= n) ? values.slice(1, n) : values.slice();
        last.push(value);
        return last;
    });
};

function onceThen(once, then) {
    var current = function(value, send) {
        once(value, send);
        current = then;
    };
    return function(value, send) {
        current(value, send);
    };
};

function unique(isEqual) {
    if (!_.isFunction(isEqual)) {
        isEqual = _.isEqual;
    };

    var current;
    var setAndSend = function(value, send) {
        current = value;
        send(current);
    };
    return onceThen(setAndSend, function(value, send) {
        if (!isEqual(current, value)) {
            setAndSend(value, send);
        }
    });
};
