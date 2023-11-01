FROM --platform=linux/amd64 node:lts
RUN rm -rf ~/.* || true
CMD bash
ENV WORKING=/opt/gink/javascript
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY package.json ./
RUN npm install
RUN npm rebuild
COPY *.js* ./
COPY proto ./proto
COPY implementation ./implementation

COPY unit-tests ./unit-tests
RUN npm run test

RUN ./node_modules/.bin/tsc
RUN chmod a+x tsc.out/implementation/main.js

COPY integration-tests ./integration-tests
RUN apt-get update
RUN apt-get install -y chromium
RUN npm run browser-tests
RUN ./integration-tests/node-client-test.js
RUN ./integration-tests/routing-server-test.js
