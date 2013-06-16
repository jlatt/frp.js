files = src/__init__.js src/util.js src/iterator.js src/vectorclock.js src/stream.js src/proxy.js src/jquery.frp.js
target = frp.js
min_target = frp.min.js
gz_target = frp.min.js.gz

.PHONY: clean test lint pages

$(target): $(files)
	cat $^ | ./script/package.sh > $@

$(min_target): $(target)
	closure-compiler $^ > $@

$(gz_target): $(min_target)
	gzip -c $^ > $@

docs: $(target)
	docco $^

clean:
	rm -rf $(target) $(min_target) $(gz_target) docs

test: $(target)
	open test/index.html

lint: $(files)
	jshint $(files)

pages: docs
	tar c frp.js docs test | gzip -c > tmp.tgz
	git checkout gh-pages
	tar xfz tmp.tgz
	git add frp.js docs test
	git commit -m 'Update docs and tests.'
	git push
	git clean -fd
	git checkout master
