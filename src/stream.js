// Create an event stream. Some streams are hooked to native (external)
// event handlers. Others must be triggered directly by calling `emit`.
function Stream(iter) {
    frp.Identifiable.call(this);
    _.bindAll(this, 'call');
    this.onEmit   = jQuery.Callbacks(this.onEmitFlags);
    this.onCancel = jQuery.Callbacks(this.onCancelFlags);
    this.cancel   = _.once(this.cancel);
    this.iter     = iter;
};
frp.Identifiable.extend(Stream);

Stream.prototype.call = function() {
    this.receive.apply(this, arguments);
};

Stream.prototype.idPrefix      = 'Stream';
Stream.prototype.onEmitFlags   = 'unique';
Stream.prototype.onCancelFlags = 'memory once unique';

// Call `onEmit` callbacks with `value`, which is optional.
//
// value := Value
// return := Stream
Stream.prototype.emit = function(value) {
    this.onEmit.fireWith(this, [value, this]);
    return this;
};

// Add a stream to this stream's emitter callbacks.
//
// callable := Callable
// return := Stream
Stream.prototype.sendTo = function(stream) {
    frp.assert(!!stream && _.isFunction(stream.call));

    this.onEmit.add(stream.call);
    return this;
};

// Remove a stream from this stream's emitter callbacks.
//
// stream := Stream
// return := Stream
Stream.prototype.unSendTo = function(stream) {
    frp.assert(!!stream && _.isFunction(stream.call));

    this.onEmit.remove(stream.call);
    return this;
};

// Cancel all event emission. Call `onCancel` callbacks.
//
// return := Stream
Stream.prototype.cancel = function() {
    this.onCancel.fireWith(this, [this]);
    this.onEmit.disable();
    return this;
};

// Receive an event.
//
// value := Value
// fromStream := Stream
Stream.prototype.receive = function(value, fromStream) {
    var stream = this;
    this.iter(value, function(value) {
        stream.emit(value);
    });
};

//
// FRP streams
// I still don't understand what switcher is for.
//

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
    return Stream.merge(this, arguments);
};

// Create a stream that emits events from the stream that is the most recent
// event of the argument streams. These streams all themselves return streams.
//
// arguments := Stream.merge.arguments
// return := Stream
Stream.switcher = function(/*stream, ...*/) {
    var switcher = this.create();
    var current = null;
    var merged = Stream.merge(arguments);
    merged.receive = function(stream) {
        if (current !== stream) {
            if (current !== null) {
                current.unSendTo(switcher);
            }
            stream.sendTo(switcher);
            current = stream;
        }
    };
    return switcher;
};

Stream.prototype.switcher = function(/*stream, ...*/) {
    return this.constructor.switcher(this, arguments);
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
// value := Value
// wait := Number
// return := Stream
Stream.interval = function(value, wait) {
    frp.assert(wait > 0);

    var stream = this.create();
    var handle = setInterval(function() {
        stream.emit(value);
    }, wait);
    stream.onCancel.add(function() {
        clearInterval(handle);
    });
    return stream;
};

// MemoryStream is Stream that emits the last value for any callbacks added
// after events are emitted.
function MemoryStream() {
    Stream.call(this);
};
Stream.extend(MemoryStream);

MemoryStream.prototype.idPrefix    = 'MemoryStream';
MemoryStream.prototype.onEmitFlags = 'memory unique';

//
// Export
//

frp.Stream       = Stream;
frp.MemoryStream = MemoryStream;
