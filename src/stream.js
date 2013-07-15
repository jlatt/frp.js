// Event Streams
// -------------

/* global frp */

// Create an event stream. Some streams are hooked to native (external) event
// handlers. Others must be triggered directly by calling `emit`.
//
//     return := Stream
function Stream() {
    _.bindAll(this, 'receive');
    this.cancel = _.once(this.cancel);
    this.onEmit = jQuery.Callbacks('memory unique');
    this.onCancel = jQuery.Callbacks('memory once unique');
}

// ### class methods

// Wrap the constructor for ease of use.
//
//     return := Stream
Stream.create = function() {
    return new Stream();
};

// Create a stream that emits events from all argument streams.
//
//     arguments := nested array(s) of Stream
//     return := Stream
Stream.merge = function(/*stream, ...*/) {
    var streams = _.flatten(arguments);
    var merged = this.create();
    _.invoke(streams, 'sendTo', merged);
    return merged;
};

// Call `sample` to emit a value every `wait` ms. Very small values of `wait`
// will produce unexpected behavior.
//
//     sample := Stream function() Value
//     wait := Number, integer > 0
//     return := Stream
Stream.sample = function(sample, wait) {
    frp.assert(_.isFunction(sample));
    frp.assert(wait > 0);

    var stream = Stream.create();
    var handle;
    function delay() {
        handle = _.delay(function() {
            stream.emit(sample.call(stream));
            delay();
        }, wait);
    }
    stream.onCancel.add(function() {
        window.clearTimeout(handle);
    });
    delay();
    return stream;
};

// ### instance properties

// By default, use an identity mapping for incoming events. Set `iter` to any
// `Iterator` to modify the incoming event stream.
Stream.prototype.iter = frp.iter.identity();

// ### instance methods

// Set the iterator for this stream.
//
//     iterator := Iterator
//     return := this
Stream.prototype.setIter = function(/*iterator, ...*/) {
    this.iter = frp.iter.chain.apply(this, arguments);
    return this;
};

// Build an iterator for this stream.
//
//     arguments := see frp.iter.build
//     return := this
Stream.prototype.buildIter = function(/*...*/) {
    this.iter = frp.iter.build.apply(this, arguments);
    return this;
};

// Receive an event. This function is not usually called directly, but rather by
// callbacks from upstream even signals.
//
//     value := Value
Stream.prototype.receive = function(value) {
    this.iter(value, this.emit);
};

// Call `onEmit` callbacks with optional `value`. Because of the implementation,
// all arguments passed will be emitted. It is not recommended to use multiple
// arguments.
//
//     value := Value
//     return := this
Stream.prototype.emit = function(/*value?*/) {
    this.onEmit.fireWith(this, arguments);
    return this;
};

// Cancel all event emission. Call `onCancel` callbacks.
//
//     return := Stream
Stream.prototype.cancel = function() {
    this.onEmit.disable();
    this.onCancel.fireWith(this, [this]);
    return this;
};

// Send values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.sendTo = function(stream) {
    frp.assert(_.isObject(stream) && _.isFunction(stream.receive));

    this.onEmit.add(stream.receive);
    return this;
};

// Stop sending values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.unSendTo = function(stream) {
    frp.assert(_.isObject(stream) && _.isFunction(stream.receive));

    this.onEmit.remove(stream.receive);
    return this;
};

// Return `true` iff this stream sends to the other stream.
//
//     stream := Stream
//     return := Boolean
Stream.prototype.sendsTo = function(stream) {
    frp.assert(_.isObject(stream) && _.isFunction(stream.receive));

    return this.onEmit.has(stream.receive);
};

// Merge this stream with other streams.
//
//     arguments := nested array(s) of Stream
//     return := Stream
Stream.prototype.merge = function(/*stream, ...*/) {
    return Stream.merge(this, arguments);
};

// Export.
frp.Stream = Stream;
