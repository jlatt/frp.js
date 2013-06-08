// Create an event stream. Some streams are hooked to native (external)
// event handlers. Others must be triggered directly by calling `emit`.
function Stream() {
    _.bindAll(this, 'receive');
    this.onEmit   = jQuery.Callbacks('memory unique');
    this.onCancel = jQuery.Callbacks('memory once unique');
    this.cancel   = _.once(this.cancel);
}

frp.Class.extend(Stream);

Stream.prototype.iter = frp.iter.identity;

Stream.prototype.receive = function(value) {
    this.iter(value, this.emit);
};

// Call `onEmit` callbacks with `value`, which is optional.
//
// value := Value
// return := Stream
Stream.prototype.emit = function(/*value*/) {
    this.onEmit.fireWith(this, arguments);
    return this;
};

// Cancel all event emission. Call `onCancel` callbacks.
//
// return := Stream
Stream.prototype.cancel = function() {
    this.onEmit.disable();
    this.onCancel.fireWith(this, [this]);
    return this;
};

// Send values from this stream to another stream.
//
// stream := Stream
// return := Stream
Stream.prototype.sendTo = function(stream) {
    this.onEmit.add(stream.receive);
    return this;
};

// Stop sending values from this stream to another stream.
//
// stream := Stream
// return := Stream
Stream.prototype.unSendTo = function(stream) {
    this.onEmit.remove(stream.receive);
    return this;
};

// Return `true` iff this stream sends to the other stream.
//
// stream := Stream
// return := Boolean
Stream.prototype.sendsTo = function(stream) {
    return this.onEmit.has(stream.receive);
};

// Create a stream that emits events from all argument streams.
//
// arguments := Stream, ...[Stream, ...]
// return := Stream
Stream.merge = function(/*stream, ...*/) {
    var streams = _.flatten(arguments);
    var merged = this.create();
    _.invoke(streams, 'sendTo', merged);
    return merged;
};

Stream.prototype.merge = function(/*stream, ...*/) {
    return Stream.merge(this, _.toArray(arguments));
};

//
// external event sources
//

// Create a stream bound to a dom event using jQuery. `selector` is optional.
//
// source := jQuery || jQuery.arguments
// event := String
// selector := String
// return := Stream
Stream.$ = function(source, event, selector) {
    var stream = this.create();
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

// Trigger via google maps events. `callback` is optional; by default it
// emits the first argument to the callback.
//
// source := google.maps.Object
// event := String
// callback := Function
// return := Stream
Stream.gmap = function(source, event, callback) {
    frp.assert(_.isString(event));

    var stream = this.create();
    if (!_.isFunction(callback)) {
        callback = identityEmit;
    }
    callback = _.bind(callback, stream);

    var listener = google.maps.addListener(source, event, callback);
    stream.onCancel.add(function() {
        google.maps.removeListener(listener);
    });

    return stream;
};

// Emit `value` on a regular schedule of `wait` ms.
//
// sample := function() Value
// wait := Number
// return := Stream
Stream.sample = function(sample, wait) {
    frp.assert(wait > 0);

    var stream = this.create();
    var handle = setInterval(function() {
        stream.emit(sample());
    }, wait);
    stream.onCancel.add(function() {
        clearInterval(handle);
    });
    return stream;
};

//
// Export
//

frp.Stream = Stream;
