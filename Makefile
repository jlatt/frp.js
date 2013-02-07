files = src/util.js src/stream.js src/proxy.js

frp.js: $(files)
	cat $(files) > frp.js

.PHONY: clean

clean:
	rm -vf frp.js
