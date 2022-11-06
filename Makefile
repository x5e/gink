#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./node_modules/.bin/:$(PATH)

all: node_modules protoc.out tsc.out

node_modules: package.json
	npm install

protoc.out: $(PROTOS) 
	 mkdir -p protoc.out && protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:protoc.out \
	$(PROTOS) && rm -rf node_modules/gink/protoc.out && \
	mkdir -p node_modules/gink && ln -s -r -t node_modules/gink protoc.out

webpack.out:
	env webpack

tsc.out:
	env tsc && chmod a+x tsc.out/main.js

clean:
	rm -rf protoc.out webpack.out tsc.out

unit_tests:
	env jest

integration_test:
	./functional-tests/integration-test.js

browser_test: webpack.out library-implementation/* functional-tests/*
	./functional-tests/browser-test.js

test: unit_tests integration_test browser_test

server: node_modules protoc.out
	GINK_DATA_FILE=/tmp/gink.binary-log GINK_SERVER=1 GINK_RESET=1 GINK_PORT=8080 \
        ts-node ./typescript-implementation/main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_SERVER)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules protoc.out
	ts-node ./typescript-implementation/main.ts ws://127.0.0.1:8080

headless_browser:
	google-chrome --headless --no-sandbox --remote-debugging-port=9222 --disable-gpu

decapitate:
	kill `ps auxe | egrep '(remote-debugging-port)=9222' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'
