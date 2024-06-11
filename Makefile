install:
	npm install --include=dev --verbose

build: clean build-npm format audit

build-npm:
	npm run build

lint:
	trunk check -a

format:
	trunk fmt -a

clean:
	rm -rf dist/*.js

audit:
	npm audit --audit-level high
