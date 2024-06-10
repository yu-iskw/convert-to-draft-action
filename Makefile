install:
	npm install --include=dev --verbose

build: clean build-npm format

build-npm:
	npm run build

lint:
	trunk check -a

format:
	trunk fmt -a

clean:
	rm -rf dist/*.js
