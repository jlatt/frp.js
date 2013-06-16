jQuery.fn.extend({
    // Call `frp.Stream.$()` conveniently from the jQuery API.
    //
    //     event := String
    //     selector := String
    //     return := frp.Stream
    'toStream': function(/*event, selector?*/) {
        var args = [this];
        args.push.apply(args, arguments);
        return frp.Stream.$.apply(frp.Stream, args);
    }
});
