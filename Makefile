files = src/__init__.js src/util.js src/stream.js src/proxy.js src/vectorclock.js

frp.js: $(files)
	cat $(files) > $@

.PHONY: clean test

clean:
	rm -vf frp.js

test: frp.js
	open test/index.html
