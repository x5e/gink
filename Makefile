#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./node_modules/.bin/:$(PATH)

all: python/gink/builders node_modules/gink/protoc.out tsc.out webpack.out 

node_modules: package.json
	npm install

python/gink/builders: $(PROTOS)
	rm -rf python/gink/builders* && \
	mkdir -p python/gink/builders.making && \
	protoc --proto_path=proto --python_out=python/gink/builders.making $(PROTOS) && \
	sed -i -- 's/^import /import gink.builders./' python/gink/builders.making/* && \
	mv python/gink/builders.making python/gink/builders

protoc.out: $(PROTOS) 
	 rm -rf protoc.out && mkdir -p protoc.out.making && protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:protoc.out.making \
	$(PROTOS) && mv protoc.out.making protoc.out

node_modules/gink/protoc.out: node_modules protoc.out
	rm -rf node_modules/gink && mkdir -p node_modules/gink && \
	ln -s -r -t node_modules/gink protoc.out

webpack.out: tsc.out
	env webpack

tsc.out: protoc.out node_modules/gink/protoc.out tsconfig.json typescript-impl/*.ts
	env tsc && chmod a+x tsc.out/main.js

clean:
	rm -rf protoc.out webpack.out tsc.out python/gink/builders node_modules/gink/protoc.out

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
