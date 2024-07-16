
.PHONY: build
build:
	pnpm run build

.PHONY:
build-gh-pages:
	pnpm run build-gh
	cp -r static/* dist/

.PHONY: clean
clean:
	rm -rf dist

.PHONY: serve-local
serve-local:
	pnpm run serve

.PHONY: serve
serve: clean serve-local