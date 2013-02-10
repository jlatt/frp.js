function getDefault(object, key, defValueFunc) {
    if (key in object) {
        return object[key];
    }
    var value = defValueFunc.apply(this, arguments);
    object[key] = value;
    return value;
};

function Proxy() {
    this.streams = {};
};
frp.Class.extend(Proxy);

Proxy.prototype.get = function(id) {
    return getDefault.call(frp.MemoryStream, this.streams, id, frp.MemoryStream.create);
};

//
// export
//

frp.Proxy = Proxy;
