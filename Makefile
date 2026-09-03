
.PHONY: build
build:
	pnpm run build

.PHONY:
build-gh-pages:
	pnpm run build-gh
	cp -r static/* dist/
	# static/ holds the demo's own tests (index.test.js, state.test.js);
	# they are not part of the site and must not be published with it.
	rm -f dist/*.test.js

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