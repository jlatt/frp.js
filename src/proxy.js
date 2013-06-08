/* globals frp: false */

// `Proxy` is a dictionary of named streams. It provides indirection between
// streams that are connected out of order with when they are created.
//
//     return := Proxy
function Proxy() {
    this.streams = {};
}

// Provide a non-`new` way of constructing instances.
//     return := Proxy
Proxy.create = function() {
    return new Proxy();
};

// Get a stream by name, creating it iff it does not yet exist.
//
// name := String
// return := Stream
Proxy.prototype.get = function(name) {
    return frp.getDefault.call(frp.Stream, this.streams, name,
                               frp.Stream.create);
};

// Export.
frp.Proxy = Proxy;
