#TODO: maybe switch over to Bazel?
PROTOS=$(wildcard proto/*.proto)
export PATH := ./javascript/node_modules/.bin/:$(PATH)
PYTHON_CODE=$(wildcard python/*.py python/gink/impl/*.py python/gink/tests/*.py python/gink/*.py)


all: python/gink/builders javascript/proto node_modules/gink/protoc.out tsc.out webpack.out

clean:
	rm -rf javascript/protoc.out javascript/proto javascript/webpack.out javascript/tsc.out python/gink/builders javascript/node_modules/gink/protoc.out

node_modules: javascript/package.json
	mkdir -p javascript/node_modules && \
	npm install --prefix javascript

python/gink/builders: $(PROTOS)
	rm -rf python/gink/builders* && \
	protoc --proto_path=. --python_out=python/gink/ $(PROTOS) && \
	sed -i -- 's/^from proto import /from . import /' python/gink/proto/* && \
	touch python/gink/proto/__init__.py && \
	mv python/gink/proto python/gink/builders

javascript/proto: $(PROTOS)
	rm -rf javascript/proto* && \
	protoc \
	--js_out=import_style=commonjs,binary:javascript/ $(PROTOS) \


protoc.out: $(PROTOS)
	 rm -rf javascript/protoc.out && mkdir -p protoc.out.making && protoc \
	--proto_path=. \
	--js_out=import_style=commonjs,binary:protoc.out.making \
	$(PROTOS) && mv protoc.out.making javascript/protoc.out

node_modules/gink/protoc.out: node_modules protoc.out
	rm -rf javascript/node_modules/gink && mkdir -p javascript/node_modules/gink && \
	cp -r javascript/protoc.out javascript/node_modules/gink/
#	ln -s -r -t node_modules/gink protoc.out

webpack.out: tsc.out
	env npx webpack-cli build --config ./javascript/webpack.config.js

tsc.out: protoc.out node_modules/gink/protoc.out
	env tsc -p javascript && chmod a+x javascript/tsc.out/implementation/main.js
