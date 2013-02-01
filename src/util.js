(function() {
    'use strict';

    //
    // class
    //

    function Class() {};

    Class.create = function() {
        return new this();
    };

    Class.extend = function(Target) {
        _.extend(Target, this);
        _.extend(Target.prototype, this.prototype);
        return this;
    };

    //
    // identifiable
    //

    function Identifiable() {
        this.id = _.uniqueId(this.idPrefix);
    };
    Class.extend(Identifiable);

    Identifiable.prototype.idPrefix = 'Id';

    //
    // callable: basic function emulation
    //

    function Callable() {};
    Class.extend(Callable);

    Callable.prototype.call = function(context) {
        var args = Array.prototype.slice.call(arguments, 1);
        return this.apply(context, args);
    };

    // Apply this function. This is usually implemented by subclasses.
    Callable.prototype.apply = $.noop;

    //
    // export
    //

    if (!this.frp) {
        this.frp = {};
    }
    frp.Identifiable = Identifiable;
    frp.Callable = Callable;
}).call(this);
