files = src/__init__.js src/util.js src/iterator.js src/vectorclock.js src/stream.js src/proxy.js

frp.js: lint $(files)
	cat $(files) | ./script/package.sh > $@

.PHONY: clean test lint

clean:
	rm -vf frp.js

test: frp.js
	open test/index.html

lint: $(files)
	jshint $(files)
