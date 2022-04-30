#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)

all: javascript_protos

node_modules:
	mkdir -p node_modules

javascript_protos: $(PROTOS)
	protoc \
	--proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	$(PROTOS)


clean:
	rm -rf node_modules/*_pb.js
