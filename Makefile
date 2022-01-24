#TODO: switch over to Bazel

all: build/transactions_pb.js build/values_pb.js

build:
	mkdir -p build

build/values_pb.js: build proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:build \
	values.proto

build/transactions_pb.js: build proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:build \
	transactions.proto

clean:
	rm -rf build
