#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./node_modules/.bin/:$(PATH)

all: node_modules javascript_protos webpack

node_modules: package.json
	npm install

javascript_protos: $(PROTOS) 
	 mkdir -p node_modules && protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	$(PROTOS)

webpack:
	env webpack

clean:
	rm -rf node_modules/*_pb.js

unit_tests: node_modules javascript_protos
	env jest

integration_tests:
	./typescript/integration-test.js

test: unit_tests integration_tests

server: node_modules javascript_protos
	GINK_SERVER=1 GINK_PORT=8080 ts-node ./typescript/main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_SERVER)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules javascript_protos
	ts-node ./typescript/main.ts ws://127.0.0.1:8080

