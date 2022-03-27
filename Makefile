#TODO: maybe switch over to Bazel?

all: node_modules/transactions_pb.js node_modules/values_pb.js node_modules/messages_pb.js \
     node_modules/log_pb.js

node_modules:
	mkdir -p node_modules

node_modules/values_pb.js: node_modules proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	values.proto

node_modules/transactions_pb.js: node_modules proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	transactions.proto

node_modules/messages_pb.js: node_modules proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	messages.proto

node_modules/log_pb.js: node_modules proto/*.proto
	protoc --proto_path=proto \
	--js_out=import_style=commonjs,binary:node_modules \
	log.proto

clean:
	rm -rf node_modules/*_pb.js
