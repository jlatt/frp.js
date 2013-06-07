files = src/__init__.js src/util.js src/iterator.js src/vectorclock.js src/stream.js src/proxy.js

all: frp.js

frp.js: $(files)
	cat $(files) | ./script/package.sh > $@

.PHONY: clean test

clean:
	rm -vf frp.js

test: frp.js
	open test/index.html

lint:
	jshint $(files)
