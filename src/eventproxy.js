(function(frp) {

    function getDefault(object, key, defValueFunc) {
        if (key in object) {
            return object[key];
        }
        var value = defValueFunc.apply(this, arguments);
        object[key] = value;
        return value;
    };

    function EventProxy() {
        this.streams = {};
    };

    EventProxy.prototype.get = function(id) {
        return getDefault.call(EventStream, this.streams, id, EventStream.identity);
    };

    // export

    frp.EventProxy = EventProxy;

}).call(this, this.frp = this.frp || {});
