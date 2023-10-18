#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./javascript/node_modules/.bin/:$(PATH)
PYTHON_CODE=$(wildcard python/*.py python/gink/impl/*.py python/gink/tests/*.py python/gink/*.py)


all: python/gink/builders node_modules/gink/protoc.out tsc.out webpack.out

clean:
	rm -rf javascript/protoc.out javascript/webpack.out javascript/tsc.out python/gink/builders javascript/node_modules/gink/protoc.out

node_modules:
	mkdir -p javascript/node_modules && \
	npm install --prefix javascript

python/gink/builders: $(PROTOS)
	rm -rf python/gink/builders* && \
	protoc --proto_path=. --python_out=python/gink/ $(PROTOS) && \
	sed -i -- 's/^from proto import /from . import /' python/gink/proto/* && \
	touch python/gink/proto/__init__.py && \
	mv python/gink/proto python/gink/builders

javascript/proto: $(PROTOS)
	rm -rf javascript/proto* && \
	protoc \
	--js_out=import_style=commonjs,binary:javascript/ $(PROTOS) \


protoc.out: $(PROTOS)
	 rm -rf protoc.out && mkdir -p protoc.out.making && protoc \
	--proto_path=. \
	--js_out=import_style=commonjs,binary:protoc.out.making \
	$(PROTOS) && mv protoc.out.making protoc.out

node_modules/gink/protoc.out: node_modules protoc.out
	rm -rf javascript/node_modules/gink && mkdir -p javascript/node_modules/gink && \
	cp -r protoc.out javascript/node_modules/gink/
#	ln -s -r -t node_modules/gink protoc.out

webpack.out: tsc.out
	env npx webpack-cli build --config ./javascript/webpack.config.js

tsc.out: protoc.out node_modules/gink/protoc.out
	env tsc -p javascript && chmod a+x javascript/tsc.out/implementation/main.js

unit_tests:
	env jest

node-client-test: node_modules/gink/protoc.out tsc.out
	./functional-tests/node-client-test.js

browser-client-test: webpack.out
	./functional-tests/browser-client-test/browser-test.js

routing-server-test: node_modules/gink/protoc.out tsc.out
	./functional-tests/routing-server-test.js

test: unit_tests node-client-test browser-client-test

server: node_modules protoc.out node_modules/gink/protoc.out
	GINK_STATIC_PATH=. GINK_DATA_FILE=/tmp/gink.binary-log GINK_RESET=1 GINK_PORT=8080 \
        ts-node ./typescript-impl/main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_PORT)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules protoc.out
	ts-node ./typescript-impl/main.ts ws://127.0.0.1:8080

headless_browser:
	google-chrome --headless --no-sandbox --remote-debugging-port=9222 --disable-gpu

decapitate:
	kill `ps auxe | egrep '(remote-debugging-port)=9222' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

python/setup.cfg: $(PYTHON_CODE) python/gink/builders
	date '+[metadata]%nversion=0.%Y%m%d.%s' > python/setup.cfg

python/dist: $(PYTHON_CODE) python/gink/builders python/setup.cfg
	cd python && rm -rf dist && python3 -m build --wheel --sdist && twine check dist/*

python/dist/.uploaded: python/dist
	cd python && twine check dist/* && twine upload dist/* && touch dist/.uploaded
