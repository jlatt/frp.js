// FRP.js is a [functional reactive
// programming](http://en.wikipedia.org/wiki/Functional_reactive_programming)
// library written in JavaScript for browser-side programming.
//
// Type Annotations
// ----------------
//
// Annotations take the format
//
//     Name := Type Description
//
// - `:=` means "has type".
// - `Type, ...` denotes a variable-length array of `Type`s
// - `||` denotes a union of two type definitions
//
// Parameter Annotations
// ---------------------
//
// These annotations appear inline in the parameter description for a
// function. They always use the multiline comment syntax (`/* */`) so that they
// can be interpolated between parameter definitions.
//
// - `?` denotes an optional parameter.
// - `, ...` denotes variable arguments
//
// General Types
// -------------
//
//     Value := Object || String || Number || Boolean || RegExp
//     Send := function(Value)
//     Iterator := function(Value, Send)

this.frp = {
    'VERSION': '1.0'
};
