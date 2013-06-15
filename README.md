Functional Reactive Programming for Javascript
==============================================

What is FRP?
------------
- [from the Elm project](http://elm-lang.org/learn/What-is-FRP.elm)
- [from Wikipedia](http://en.wikipedia.org/wiki/Functional_reactive_programming)

Inspiration comes from:
- [Elm][elm]
- [Flapjax][flapjax]

Contributors, pull requests, and issues welcome!

Why not Elm?
------------

[Elm][elm] is really cool, but it's Haskell that compiles to
Javascript. Transpiling gives me the willies. Until native debugging for the
languages is available in most browsers, you'll still need to understand the
Javascript environemnt in order to find issues.

Why not Flapjax?
----------------

[Flapjax][flapjax] is also cool, but it's self-contained and looks like it was
written by Haskellers.

My Goals
--------

- Make use of [underscore.js][underscore] and [jQuery][jquery] to avoid
  reinventing common functions.
- Provide a fast, continuation-based iterator system with common patterns
  already implemented.
- Provide useful tools for mapping along streams of [`$.Deferred`][deferred] objects.
- Provide utilities for binding to [Google Maps][maps].

Examples
--------

```js
Stream.$('body', 'click', 'button.twiddle').build(
    'map', [function(e) { return $(e.target).closest('button').hasClass('on'); }],
    'unique', []);
```

This streams boolean values reflecting the button state (`'on'`), but only when
that value changes.

```js
Stream.$('canvas', 'mousemove').build(
    'map', [function(e) { return {'x': e.pageX, 'y': pageY}; }],
    'lastN', [2],
    'atLeastN', [2],
    'filter', [function(pos) { return slope(pos[1], pos[0]) > 2; }],
    'mapApply', [function(b, a) { return b; }]);
```

This streams the mouse position whenever the slope from the previously recorded
position is greater than 2.

[deferred]: http://api.jquery.com/category/deferred-object/
[elm]: http://elm-lang.org/
[flapjax]: http://www.flapjax-lang.org/
[jquery]: http://jquery.com/
[maps]: https://developers.google.com/maps/documentation/javascript/reference
[underscore]: http://underscorejs.org/
