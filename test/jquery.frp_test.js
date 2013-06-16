module('jquery.frp');

test('toStream', 3, function() {
    var stream = $('body').toStream('click', 'a.foobar');
    stream.onEmit.add(function(e) {
        e.preventDefault();
        ok(e, 'got event');
    });

    var $a = $('<a/>', {'href': '#', 'class': 'foobar'})
        .appendTo('body')
        .click()
        .click()
        .click();

    _.defer(function() {
        $a.remove();
    });
});
