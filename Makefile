
.PHONY: build
build:
	pnpm run build

.PHONY: build-gh-pages
build-gh-pages:
	pnpm run build-gh
	cp -r static/* dist/
	# Don't publish the demo's tests.
	rm -f dist/*.test.js
	# static/data/ is gen-presets input, already compiled into bundle.js.
	rm -rf dist/data

.PHONY: pull-terrain
pull-terrain:
	scripts/pull-40kdc-terrain.sh

.PHONY: process-terrain
process-terrain:
	pnpm run convert:40kdc

.PHONY: update-terrain
update-terrain: pull-terrain process-terrain

.PHONY: clean
clean:
	rm -rf dist

.PHONY: serve-local
serve-local:
	pnpm run serve

.PHONY: serve
serve: clean serve-local