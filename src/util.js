function AssertError() {
    Error.apply(this, arguments);
}
AssertError.prototype = new Error('assertion failed');
AssertError.prototype.constructor = AssertError;

function assert(condition, message) {
    if (!condition) {
        throw new AssertError(message);
    }
}

//
// class
//

function Class() {}

Class.create = function() {
    return new this();
};

Class.extend = function(Target) {
    _.extend(Target, this);
    _.extend(Target.prototype, this.prototype);
    return this;
};

// object := Object
Class.prototype.extend = function(/*object, ...*/) {
    return _.extend.apply(_, [this].concat(arguments));
};

//
// set based on id
//

function IdSet() {
    this.members = {};
}
Class.extend(IdSet);

IdSet.prototype.length = 0;

IdSet.prototype.add = function(element) {
    frp.assert(element && element.id);

    if (!this.members.hasOwnProperty(element.id)) {
        this.members[element.id] = element;
        ++this.lemgth;
    }
    return this;
};

IdSet.prototype.remove = function(element) {
    frp.assert(element && element.id);

    if (this.members.hasOwnProperty(element.id)) {
        delete this.members[element.id];
        --this.length;
    }
    return this;
};

IdSet.prototype._ = function(fname) {
    var args = Array.prototype.slice.call(arguments, 1);
    return _[fname].apply(_, args);
};

//
// callable: basic function emulation
//

function Callable() {}
Class.extend(Callable);

Callable.prototype.call = function(context) {
    var args = Array.prototype.slice.call(arguments, 1);
    return this.apply(context, args);
};

// Apply this function. This is usually implemented by subclasses.
Callable.prototype.apply = $.noop;

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

frp.AssertError  = AssertError;
frp.assert       = assert;
frp.Class        = Class;
frp.IdSet        = IdSet;
frp.Callable     = Callable;
frp.heir         = heir;
