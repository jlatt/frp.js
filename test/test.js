(function() {
    'use strict';

    function assert(v, message) {
        if (!v) {
            throw new Error(message || 'assert failed');
        }
    };

    function assertFunc(func, message) {
        assert(func.call(this, message));
    };

    function run(description, func) {
        return func.call(this);
    };

    this.test = {
        'assert': assert,
        'assertFunc': assertFunc,
        'run': run
    };
}).call(this);
