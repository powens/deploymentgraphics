
.PHONY: build
build:
	pnpm run build

.PHONY:
build-gh-pages:
	pnpm run build-gh
	cp -r static/* dist/

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