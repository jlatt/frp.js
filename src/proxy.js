(function(frp) {

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

    Proxy.prototype.get = function(id) {
        return getDefault.call(frp.Stream, this.streams, id, frp.Stream.create);
    };

    Proxy.prototype.pipe = function(from, id) {
        var to = this.get(id);
        from.onEmit.add(to.bind());
        return to;
    };

    //
    // export
    //

    frp.Proxy = Proxy;

}).call(this, this.frp = this.frp || {});
