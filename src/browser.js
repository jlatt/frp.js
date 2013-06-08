// page visibility http://www.w3.org/TR/page-visibility/

function BrowserEvent(target, property, event) {
    this.target = target;
    this.property = property;
    this.event = event;
}

BrowserEvent.prototype.sampleEvent = function() {
    return this.target[this.property];
};

BrowserEvent.prototype.sample = function(interval) {
    var event = this;
    return Stream.interval(interval, function() {
        return event.sampleEvent();
    });
};

BrowserEvent.prototype.change = function() {
    var event = this;
    Stream.$(this.target, this.event).map(function(e) {
        return event.sampleEvent();
    });
};


var orientation = new BrowserEvent(window, 'orientation', 'orientationchange');
orientation.PORTRAIT          =   0;
orientation.PORTRAIT_REVERSED = 180;
orientation.LANDSCAPE_RIGHT   = -90;
orientation.LANDSCAPE_LEFT    =  90;


var visibility = new BrowserEvent(document, 'visibilityState', 'visibilitychange');
visibility.HIDDEN    = 'hidden';
visibility.VISIBLE   = 'visible';
visibility.PRERENDER = 'prerender';
visibility.UNLOADED  = 'unloaded';

frp.browser = {
    'orientation': orientation,
    'visibility':  visibility
};
