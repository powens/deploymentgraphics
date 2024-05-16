
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

.PHONY: serve-local
serve-local:
	npm run serve

.PHONY: serve
serve: clean serve-local