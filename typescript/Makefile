#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard ../proto/*.proto)
export PATH := ./node_modules/.bin/:$(PATH)

all: node_modules javascript_protos webpack.out tsc.out

node_modules: package.json
	npm install

javascript_protos: $(PROTOS) 
	 mkdir -p node_modules && protoc \
	--proto_path=../proto \
	--js_out=import_style=commonjs,binary:node_modules \
	$(PROTOS)

webpack.out:
	env webpack

tsc.out:
	env tsc

clean:
	rm -rf node_modules/*_pb.js webpack.out tsc.out

unit_tests: node_modules javascript_protos
	env jest

integration_test:
	./functional-tests/integration-test.js

browser_test:
	./functional-tests/browser-test.js

test: unit_tests integration_test browser_test

server: node_modules javascript_protos
	GINK_LOG_FILE=test.binary-log GINK_SERVER=1 GINK_PORT=8080 \
        ts-node ./main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_SERVER)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules javascript_protos
	ts-node ./main.ts ws://127.0.0.1:8080

headless_browser:
	google-chrome --headless --no-sandbox --remote-debugging-port=9222 --disable-gpu

decapitate:
	kill `ps auxe | egrep '(remote-debugging-port)=9222' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'
