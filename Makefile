#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./node_modules/.bin/:$(PATH)

all: node_modules protoc.out tsc.out webpack.out

node_modules: package.json
	npm install

protoc.out: $(PROTOS) 
	 mkdir -p protoc.out && protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:protoc.out \
	$(PROTOS)

node_modules/gink/protoc.out: node_modules protoc.out
	rm -rf node_modules/gink && mkdir -p node_modules/gink && \
	ln -s -r -t node_modules/gink protoc.out

webpack.out: tsc.out
	env webpack

tsc.out: protoc.out node_modules/gink/protoc.out tsconfig.json typescript-impl/*.ts
	env tsc && chmod a+x tsc.out/main.js

clean:
	rm -rf protoc.out webpack.out tsc.out

unit_tests:
	env jest

node-client-test: node_modules/gink/protoc.out 
	./functional-tests/node-client-test/node-client-test.js

browser-client-test: webpack.out
	./functional-tests/browser-client-test/browser-test.js

test: unit_tests node-client-test browser-client-test

server: node_modules protoc.out node_modules/gink/protoc.out
	GINK_STATIC_PATH=. GINK_DATA_FILE=/tmp/gink.binary-log GINK_SERVER=1 GINK_RESET=1 GINK_PORT=8080 \
        ts-node ./typescript-impl/main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_SERVER)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules protoc.out
	ts-node ./typescript-impl/main.ts ws://127.0.0.1:8080

headless_browser:
	google-chrome --headless --no-sandbox --remote-debugging-port=9222 --disable-gpu

decapitate:
	kill `ps auxe | egrep '(remote-debugging-port)=9222' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'
