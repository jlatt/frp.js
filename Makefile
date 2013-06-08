files = src/__init__.js src/util.js src/iterator.js src/vectorclock.js src/stream.js src/proxy.js

.PHONY: clean test lint

frp.js: $(files)
	cat $(files) | ./script/package.sh > $@

clean:
	rm -f frp.js

test: frp.js
	open test/index.html

lint:
	jshint $(files)
