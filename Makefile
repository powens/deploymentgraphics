
.PHONY: build
build:
	npm run build

.PHONY:
build-gh-pages:
	npm run build-gh
	cp -r static/* dist/

.PHONY: clean
clean:
	rm -rf dist