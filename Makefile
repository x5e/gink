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

test: node_modules javascript_protos
	npm run test