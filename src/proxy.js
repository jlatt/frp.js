function Proxy() {
    this.streams = {};
}

Proxy.create = function() {
    return new Proxy();
};

Proxy.prototype.get = function(id) {
    return getDefault.call(frp.Stream, this.streams, id, frp.Stream.create);
};

//
// export
//

frp.Proxy = Proxy;
