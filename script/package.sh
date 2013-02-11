#!/bin/bash
cat <<EOF
(function() {
'use strict';

$(cat)

}).call(this);
EOF
