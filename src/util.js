function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'assertion failed');
    }
}

function getDefault(object, key, defValueFunc) {
    if (key in object) {
        return object[key];
    }
    var value = defValueFunc.apply(this, arguments);
    object[key] = value;
    return value;
}

//
// prototypal inheritance
//

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
