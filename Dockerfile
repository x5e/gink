FROM node:latest
RUN apt-get update
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y protobuf-compiler
RUN if [ `uname -m` != aarch64 ]; then apt-get install -y chromium-driver; fi
CMD bash
ENV WORKING=/opt/gink
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY package.json ./
RUN npm install
RUN npm rebuild
RUN rm -rf ~/.* || true
COPY proto ./proto
COPY typescript-impl ./typescript-impl
COPY tsconfig.json webpack.config.js web-entry.js Makefile jest.config.js ./
RUN make node_modules/gink/protoc.out tsc.out webpack.out
COPY typescript-unit-tests ./typescript-unit-tests
RUN make unit_tests
COPY functional-tests ./functional-tests
RUN ./functional-tests/node-client-test.js
RUN if [ `uname -m` != aarch64 ]; then ./functional-tests/browser-client-test/browser-test.js; fi
RUN ./functional-tests/routing-server-test.js

# PYTHON STUFF
RUN apt-get install -y python3-nose2 python3-protobuf python3-sortedcontainers \
	python3-lmdb python3-wsproto
COPY python ./python
RUN make python/gink/builders
WORKDIR /opt/gink/python
RUN python3 -m nose2