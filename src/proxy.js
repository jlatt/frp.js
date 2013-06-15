// Stream Proxy
// ------------
//
// Sometimes an event source is available before a sink or vice-versa. `Proxy`
// helps by providing named `Stream`s that can be chained as sources or sinks of
// particular values.
/* globals frp */

// Make a `Proxy`
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
//     name := String
//     return := Stream
Proxy.prototype.get = function(name) {
    return frp.getDefault.call(frp.Stream, this.streams, name,
                               frp.Stream.create);
};

// Export.
frp.Proxy = Proxy;
