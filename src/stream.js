// Event Streams
// -------------

/* globals frp */

// Create an event stream. Some streams are hooked to native (external) event
// handlers. Others must be triggered directly by calling `emit`.
//
//     return := Stream
function Stream() {
    _.bindAll(this, 'receive');
    this.cancel = _.once(this.cancel);
    this.onEmit = jQuery.Callbacks('memory unique');
    this.onCancel = jQuery.Callbacks('memory once unique');
    this.receive.stream = this; // so streams can find their sources.
}

// Wrap the constructor for ease of use.
//
//     return := Stream
Stream.create = function() {
    return new Stream();
};

// Extend the instance with arbitrary properties. This can be used to set the
// iterator or override other properties. e.g. `stream.extend({'iter':
// frp.iter.map(Math.sqrt)});`
//
//     object := Object
//     return := this
Stream.prototype.extend = function(/*object, ...*/) {
    var args = [this];
    args.push.apply(args, arguments);
    return _.extend.apply(_, args);
};

// By default, use an identity mapping for incoming events. Set `iter` to any
// `Iterator` to modify the incoming event stream.
Stream.prototype.iter = frp.iter.identity();

// Set the iterator for this stream.
//
//     iterator := Iterator
//     return := this
Stream.prototype.iterate = function(/*iterator, ...*/) {
    this.iter = frp.iter.chain.apply(frp.iter, arguments);
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

// Create a stream bound to a dom event using jQuery. See docs for
// [jQuery](http://api.jquery.com/jQuery/) regarding arguments.
//
//     source := jQuery || arguments to jQuery()
//     event := String
//     selector := String
//     return := Stream
Stream.$ = function(source, event, selector/*?*/) {
    var stream = Stream.create();
    var $source = jQuery(source);
    frp.assert($source.length > 0, 'empty jQuery');
    var args = Array.prototype.slice.call(arguments, 1);
    args.push(function(e) {
        stream.emit(e);
    });

    $source.on.apply($source, args);
    stream.onCancel.add(function() {
        $source.off.apply($source, args);
    });

    return stream;
};

// Trigger via google maps events.
//
//     source := google.maps.Object
//     event := String
//     return := Stream
Stream.gmap = function(source, event) {
    /* globals google */
    frp.assert(_.isString(event));

    var stream = Stream.create();
    var callback = _.bind(stream.emit, stream);
    var listener = google.maps.addListener(source, event, callback);
    stream.onCancel.add(function() {
        google.maps.removeListener(listener);
    });

    return stream;
};

// Call `sample` to emit a value every `wait` ms. Very small values of `wait`
// will produce unexpected behavior.
//
//     sample := function() Value
//     wait := Number
//     return := Stream
Stream.sample = function(sample, wait) {
    frp.assert(wait > 0);

    var stream = Stream.create();
    var handle = setInterval(function() {
        stream.emit(sample());
    }, wait);
    stream.onCancel.add(function() {
        clearInterval(handle);
    });
    return stream;
};

// Export.
frp.Stream = Stream;
