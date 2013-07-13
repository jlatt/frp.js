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

// Wrap the constructor for ease of use.
//
//     return := Stream
Stream.create = function() {
    return new Stream();
};

// By default, use an identity mapping for incoming events. Set `iter` to any
// `Iterator` to modify the incoming event stream.
Stream.prototype.iter = frp.iter.identity();

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
Stream.prototype.build = function(/*...*/) {
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
    this.onEmit.add(stream.receive);
    return this;
};

// Stop sending values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.unSendTo = function(stream) {
    this.onEmit.remove(stream.receive);
    return this;
};

// Return `true` iff this stream sends to the other stream.
//
//     stream := Stream
//     return := Boolean
Stream.prototype.sendsTo = function(stream) {
    return this.onEmit.has(stream.receive);
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

// Merge this stream with other streams.
//
//     arguments := nested array(s) of Stream
//     return := Stream
Stream.prototype.merge = function(/*stream, ...*/) {
    return Stream.merge(this, _.toArray(arguments));
};

// External Event Sources (aka Signals)
// ------------------------------------

function Sampler(stream, sample, wait, context) {
    _.bindAll(this, 'emitAndDelay', 'cancel');
    this.cancel = _.once(this.cancel);

    this.stream = stream;
    this.sample = sample;
    this.wait = wait;
    this.context = context;

    stream.onCancel.add(this.cancel);
    this.delay();
}

Sampler.prototype.delay = function() {
    this.handle = _.delay(this.emitAndDelay, this.wait);
};

Sampler.prototype.emitAndDelay = function() {
    this.stream.emit(this.sample.call(this.context));
    this.delay();
};

Sampler.prototype.cancel = function() {
    window.clearTimeout(this.handle);
    this.stream.onCancel.remove(this.cancel);
};

// Call `sample` to emit a value every `wait` ms. Very small values of `wait`
// will produce unexpected behavior.
//
//     sample := function() Value
//     wait := Number, integer > 0
//     return := Stream
Stream.sample = function(sample, wait) {
    frp.assert(wait > 0);

    var stream = Stream.create();
    new Sampler(stream, sample, wait, this);
    return stream;
};

// Export.
frp.Stream = Stream;
