FROM node:lts
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
RUN ./node_modules/.bin/jest

COPY integration-tests ./integration-tests
RUN ./node_modules/.bin/tsc
RUN chmod a+x tsc.out/implementation/main.js

RUN ./integration-tests/node-client-test.js
RUN ./integration-tests/routing-server-test.js

RUN if [ `uname -m` != aarch64 ]; then apt-get update; fi
RUN if [ `uname -m` != aarch64 ]; then apt-get install -y chromium-driver; fi
RUN if [ `uname -m` != aarch64 ]; then ./integration-tests/browser-client-test/browser-test.js; fi
