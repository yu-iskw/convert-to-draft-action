install:
	npm install --include=dev --verbose

build: clean
	npm run build

lint:
	trunk check -a

format:
	trunk fmt -a

clean:
	rm -fr dist/*.js
