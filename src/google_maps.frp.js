/* global frp */

frp.augmentEvents = function(maps) {
    // Trigger via google maps events.
    //
    //     source := google.maps.Object
    //     event := String
    //     return := Stream
    maps.event.toStream = function(source, event) {
        frp.assert(_.isString(event));

        var stream = frp.Stream.create();
        var callback = _.bind(stream.emit, stream);
        var listener = maps.event.addListener(source, event, callback);
        stream.onCancel.add(function() {
            maps.event.removeListener(listener);
        });

        return stream;
    };
};
