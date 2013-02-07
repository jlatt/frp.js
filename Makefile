files = src/util.js src/stream.js src/proxy.js src/vector_clock.js

frp.js: $(files)
	cat $(files) > $@

.PHONY: clean

clean:
	rm -vf frp.js
