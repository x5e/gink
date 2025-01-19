PROTOS=$(wildcard proto/*.proto)
export PATH := ./javascript/node_modules/.bin/:./node_modules/.bin/:$(PATH)
PYTHON_CODE=$(wildcard python/*.py python/gink/impl/*.py python/gink/tests/*.py python/gink/*.py)

all: python/gink/builders javascript/proto javascript/tsc.out javascript/content_root/generated

.PHONY: clean running-as-root install-dependencies install-debian-packages javascript push-base

clean:
	rm -rf javascript/proto javascript/content_root/generated javascript/tsc.out python/gink/builders

rebuild: clean all

running-as-root:
	bash -c 'test `id -u` -eq 0'

test-python:
	cd python && python3 -m nose2

test-javascript:
	cd javascript && npm test

test-browser:
	cd javascript && npm run browser-unit

test: test-python test-javascript

install-debian-packages: running-as-root
	apt-get update && \
	apt-get install -y `cat packages.txt | tr '\n' ' '`

install-protoc-gen-js: running-as-root
	npm install -g protoc-gen-js # https://stackoverflow.com/questions/72572040

install-dependencies: install-debian-packages install-protoc-gen-js

python/gink/builders: $(PROTOS)
	rm -rf python/gink/builders* && \
	protoc --proto_path=. --python_out=python/gink/ $(PROTOS) && \
	sed -i -- 's/^from proto import /from . import /' python/gink/proto/* && \
	touch python/gink/proto/__init__.py && \
	mv python/gink/proto python/gink/builders

install-python-packages:
	cd python && \
	pip install -r requirements.txt

javascript: javascript/proto javascript/tsc.out javascript/content_root/generated

javascript/node_modules: javascript/package.json
	mkdir -p javascript/node_modules && \
	npm install --prefix javascript

javascript/proto: $(PROTOS)
	rm -rf javascript/proto* && \
	protoc \
	--js_out=import_style=commonjs,binary:javascript/ $(PROTOS) \

javascript/content_root/generated: javascript/tsc.out
	env webpack-cli build --config ./javascript/webpack.config.js

javascript/tsc.out: $(wildcard javascript/implementation/*.ts)
	env tsc -p javascript && chmod a+x javascript/tsc.out/implementation/main.js

push-base:
	docker buildx build --platform linux/amd64,linux/arm64 --push --tag darinmcgill/base:latest --no-cache -f Dockerfile.base .

build-base:
	docker build --tag darinmcgill/base:latest -f Dockerfile.base .
