FROM node:latest
RUN apt-get update
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y protobuf-compiler
RUN apt-get install -y chromium-driver
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
RUN make
COPY typescript-unit-tests ./typescript-unit-tests
RUN make unit_tests
COPY functional-tests ./functional-tests
RUN ./functional-tests/node-client-test.js
RUN ./functional-tests/browser-client-test/browser-test.js
RUN ./functional-tests/routing-server-test.js