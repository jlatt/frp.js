//
// functional iterators
//

function Identity() {};

Identity.prototype.onNext = function(value, send) {
    send.call(this, value);
};

function Chain() {
    this.iterators = arguments;
};

Chain.prototype.onNext = function(value, send) {
    this.onNextIterator(value, send, 0);
};

Chain.prototype.onNextIterator = function(value, send, index) {
    frp.assert(index >= 0);

    if (index < this.iterators.length) {
        var chain = this;
        this.iterators[index].onNext(value, function(value) {
            chain.onNextIterator(value, send, index + 1);
        });
    } else {
        Identity.prototype.onNext.call(this, value, send);
    }
};

function Map(map) {
    frp.assert(_.isFunction(map));

    this.map = map;
};

Map.prototype.onNext = function(value, send) {
    Identity.prototype.onNext.call(this, this.map(value), send);
};

function MapApply(map) {
    Map.apply(this, arguments);
};

MapApply.prototype.onNext = function(value, send) {
    Identity.prototype.onNext.call(this, this.map.apply(this, value), send);
};

function Filter(filter) {
    frp.assert(_.isFunction(filter));

    this.filter = filter;
};

Filter.prototype.onNext = function(value, send) {
    if (this.filter(value)) {
        Identity.prototype.onNext.apply(this, arguments);
    }
};

function Constant(value) {
    this.value = value;
};

Constant.prototype.onNext = function(value, send) {
    Identity.prototype.onNext.call(this, this.value, send);
};

function Fold(initial, fold) {
    frp.assert(_.isFunction(fold));

    this.value = initial;
    this.fold = fold;
};

Fold.prototype.onNext = function(value, send) {
    this.value = this.fold(value, this.value);
    Identity.prototype.onNext.call(this, this.value, send);
};

function TakeWhile(take) {
    frp.assert(_.isFunction(take));

    this.take = take;
};

TakeWhile.prototype.onNext = function(value, send) {
    if (this.take(value)) {
        Identity.prototype.onNext.apply(this, arguments);
    } else {
        this.onNext = $.noop;
    }
};

function DropWhile(drop) {
    frp.assert(_.isFunction(drop));

    this.drop = drop;
};

DropWhile.prototype.onNext = function(value, send) {
    if (!this.drop(value)) {
        this.onNext = Identity.prototype.onNext;
        this.onNext(value, send);
    }
};

function Unique() {};

Unique.prototype = new Filter(function(value) {
    var eq = this.isEqual(value, this.value);
    this.value = value;
    return !eq;
});

Unique.prototype.constructor = Unique;

Unique.prototype.isEqual = _.isEqual;

Unique.prototype.onNext = function(value, send) {
    this.value = value;
    this.onNext = Filter.prototype.onNext;
    Identity.prototype.onNext.apply(this, arguments);
};

function LastN(n) {
    frp.assert(n > 0);

    this.n = n;
};

LastN.prototype = new Fold([], function(value, values) {
    var lastN = (values.length >= this.n) ? values.slice(1, this.n) : values.slice();
    lastN.push(value);
    return lastN;
});

LastN.prototype.constructor = LastN;

//
// timing iterators
//

function Debounce(wait) {
    frp.assert(wait > 0);

    this.onNext = _.debounce(this.onNext, wait);
};

Debounce.prototype = new Identity();

Debounce.prototype.constructor = Debounce;

function Throttle(wait) {
    frp.assert(wait > 0);

    this.onNext = _.throttle(this.onNext, wait);
};

Throttle.prototype = new Identity();

Throttle.prototype.constructor = Throttle;

//
// future iterators
//

function Promise() {};

Promise.prototype.map = function(value) {
    return jQuery.Deferred().resolveWith(this, arguments).promise();
};

Promise.prototype.onNext = Map.prototype.onNext;

function Unpromise() {};

Unpromise.prototype.onNext = function(value, send) {
    var iter = this;
    value.done(function() {
        send.apply(iter, arguments);
    });
};

function MapPromise(mapPromise) {
    this.mapPromise = _.bind(mapPromise, this);
};

MapPromise.prototype.map = function(value) {
    return value.pipe(this.mapPromise);
};

MapPromise.prototype.onNext = Map.prototype.onNext;

function AbortPrevious() {};

AbortPrevious.prototype = new Chain(
    new LastN(2),
    new Map(function(values) {
        this.map = this.abortPrevious;
        return values[0];
    })
);

AbortPrevious.prototype.constructor = AbortPrevious;

AbortPrevious.prototype.abortPrevious = function(values) {
    values[0].abort();
    return values[1];
};
