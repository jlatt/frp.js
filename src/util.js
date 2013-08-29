// Utility Functions
// -----------------
/* globals frp */

// If `func` returns falsy, throw an error.
//
//     func := Function
//     value := Value
//     throw := Error
function assert(func/*, value, ...*/) {
    var args = _(arguments).slice(1);
    if (!func.apply(this, args)) {
        throw new Error('assertion failed');
    }
}

// Get a keyed value from an object. If the value is not present in the
// prototype chain, call `makeDefaultValue`, setting it as `key` in `object` and
// returning it.
//
//     object := Object
//     key := String
//     makeDefaultValue := function(Object, String, makeDefaultValue) Value
//     return := Value
function getDefault(object, key, makeDefaultValue) {
    assert(_.isObject, object);
    assert(_.isString, key);
    assert(_.isFunction, makeDefaultValue);

    if (key in object) {
        return object[key];
    }

    var value = makeDefaultValue.apply(this, arguments);
    object[key] = value;
    return value;
}

// Create a prototypal heir of an object.
//
//     object := Object
//     return := Object
function heir(object) {
    assert(_.isObject, object);

    function Heir() {}
    Heir.prototype = object;
    return new Heir();
}

function inherit(To, From) {
    assert(_.isFunction, To);
    assert(_.isFunction, From);
    To.prototype = heir(From.prototype);
    To.prototype.constructor = To;
}

function isKeys(keys) {
    return (_.isArray(keys) &&
            (keys.length > 0) &&
            _.all(keys, _.isString));
}

function isInstance(object, Constructor) {
    return object instanceof Constructor;
}

function isInteger(number) {
    return _.isNumber(number) && (Math.floor(number) === number);
}

function Sequence(initial) {
    if (isInteger(initial)) {
        this.current = initial;
    }
}

Sequence.prototype.current = 0;

Sequence.prototype.next = function() {
    var next = this.current;
    this.current += 1;
    return next;
};

// Create a `Handle` for undoing stateful operations by attaching
// callbacks. Return a `Handle` from a function whose actions can be undone
// later.
//
//     return := Handle
function Handle() {
    this.onCancel = $.Callbacks('memory once');
}

// Call cancel callbacks. They are only called once.
//
//     return := this
Handle.prototype.cancel = function() {
    this.onCancel.fireWith(this, [this]);
    return this;
};
