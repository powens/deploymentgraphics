
.PHONY: build
build:
	pnpm run build

.PHONY: build-gh-pages
build-gh-pages:
	pnpm run build-gh
	cp -r static/* dist/
	# static/ holds the demo's own tests (index.test.js, state.test.js); they
	# are not part of the site and must not be published with it. The compiled
	# side of the same rule lives in rollup.config.mjs, which turns off the
	# declaration emit that would otherwise drop a .d.ts per module into dist/.
	rm -f dist/*.test.js
	# static/data/ is authoring input for scripts/gen-presets.mjs, not site
	# content: the app renders from the presets compiled out of it, which are
	# already inside bundle.js. Publishing it shipped combined.yml twice and
	# put 1.8MB of raw 40kdc source (terrain/source/) on the site, none of
	# which any page fetches.
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