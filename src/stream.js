// Event Streams
// -------------

/* globals frp */

// Create an event stream. Some streams are hooked to native (external) event
// handlers. Others must be triggered directly by calling `emit`.
//
//     return := Stream
function Stream() {
    _.bindAll(this, 'emit');
    this.onEmit = jQuery.Callbacks('memory unique');
    this.onCancel = jQuery.Callbacks('memory once unique');
}

// Wrap the constructor for ease of use.
//
//     return := Stream
Stream.create = function() {
    return new Stream();
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
    this.onEmit.add(stream.emit);
    return this;
};

// Stop sending values from this stream to another stream.
//
//     stream := Stream
//     return := this
Stream.prototype.unSendTo = function(stream) {
    this.onEmit.remove(stream.emit);
    return this;
};

// Return `true` iff this stream sends to the other stream.
//
//     stream := Stream
//     return := Boolean
Stream.prototype.sendsTo = function(stream) {
    return this.onEmit.has(stream.emit);
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
    return Stream.merge(this, arguments);
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
Stream.$ = function(source/*, event, selector?*/) {
    frp.assert(arguments.length > 1);

    var $source = jQuery(source);
    frp.assert($source.length > 0, 'empty jQuery');

    var stream = Stream.create();
    var args = Array.prototype.slice.call(arguments, 1);
    args.push(_.bind(stream.emit, stream)); // event handler
    stream.onCancel.add(function() {
        $source.off.apply($source, args);
    });
    $source.on.apply($source, args);

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
    var listener;
    stream.onCancel.add(function() {
        google.maps.removeListener(listener);
    });
    listener = google.maps.addListener(source, event, callback);

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
    var handle;
    stream.onCancel.add(function() {
        window.clearInterval(handle);
    });
    handle = window.setInterval(function() {
        stream.emit(sample());
    }, wait);
    return stream;
};

// Export.
frp.Stream = Stream;
