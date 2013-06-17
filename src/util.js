// Utility Functions
// -----------------
/* globals frp */

// If `condition` is falsy, throw an error.
//
//     condition := Value
//     message := String
//     throws := Error
function assert(condition, message/*?*/) {
    if (!condition) {
        throw new Error(message || 'assertion failed');
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
    if (key in object) {
        return object[key];
    }
    var value = makeDefaultValue.apply(this, arguments);
    object[key] = value;
    return value;
}

// Export.
frp.assert     = assert;
frp.getDefault = getDefault;
