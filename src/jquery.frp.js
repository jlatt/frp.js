/* global frp */

jQuery.fn.extend({
    // Create a stream bound to a dom event using jQuery. See docs for
    // [jQuery](http://api.jquery.com/jQuery/) regarding arguments.
    //
    //     event := String
    //     selector := String
    //     return := Stream
    'toStream': function(/*event, selector?*/) {
        frp.assert(arguments.length > 1);
        frp.assert(this.length > 0, 'empty jQuery');

        var stream = frp.Stream.create();
        var args = _.toArray(arguments);
        args.push(_.bind(stream.emit, stream)); // event handler
        stream.onCancel.add(_.bind(function() {
            this.off.apply(this, args);
        }, this));
        this.on.apply(this, args);

        return stream;
    }
});
