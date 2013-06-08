// If `condition` is falsy, throw an error.
//
// condition := Value
// message := String [optional]
// throws := Error
function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'assertion failed');
    }
}

// Get a keyed value from an object. If the value is not present in the
// prototype chain, call `makeDefaultValue`, setting it as `key` in `object` and
// returning it.
//
// object := Object
// key := String
// makeDefaultValue := function(object, key, makeDefaultValue) Value
function getDefault(object, key, makeDefaultValue) {
    if (key in object) {
        return object[key];
    }
    var value = makeDefaultValue.apply(this, arguments);
    object[key] = value;
    return value;
}

// Create a prototypal heir of an object.
//
// object := Object
// returns := Object
function heir(object) {
    function Heir() {}
    Heir.prototype = object;
    return new Heir();
}

//
// export
//

frp.assert     = assert;
frp.getDefault = getDefault;
frp.heir       = heir;
