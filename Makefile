
.PHONY: build
build:
	npm run build
	cp -r static/* dist/

.PHONY: clean
clean:
	rm -rf dist