#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)

all: node_modules javascript_protos

node_modules: package.json
	npm install

javascript_protos: $(PROTOS) 
	 mkdir -p node_modules && protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	$(PROTOS)

clean:
	rm -rf node_modules/*_pb.js

unit_tests: node_modules javascript_protos
	npm run test

integration_tests:
	./typescript/integration-test.js

test: unit_tests integration_tests

server: node_modules javascript_protos
	GINK_SERVER=1 GINK_PORT=8080 node ./node_modules/.bin/ts-node ./typescript/main.ts

kill_server:
	kill `ps auxe | egrep '(GINK_SERVER)=1' | awk '{print $2}'` 2>/dev/null \
	|| echo 'not running'

instance: node_modules javascript_protos
	node ./node_modules/.bin/ts-node ./typescript/main.ts ws://localhost:8080

