files = src/__init__.js src/util.js src/iterator.js src/vectorclock.js src/stream.js src/proxy.js
target = frp.js

.PHONY: clean test lint

$(target): $(files)
	cat $^ | ./script/package.sh > $@

docs: $(target)
	docco $^

clean:
	rm -rf $(target) docs

test: $(target)
	open test/index.html

lint: $(files)
	jshint $(files)
