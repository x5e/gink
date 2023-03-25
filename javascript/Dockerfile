FROM node:lts
RUN rm -rf ~/.* || true
CMD bash
ENV WORKING=/opt/gink/javascript
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY package.json ./
RUN npm install
RUN npm rebuild
COPY tsconfig.json webpack.config.js web-entry.js jest.config.js ./
COPY builders ./builders
COPY implementation ./implementation
COPY unit-tests ./unit-tests
RUN ./node_modules/.bin/jest
#RUN make node_modules/gink/protoc.out tsc.out webpack.out
#COPY typescript-unit-tests ./typescript-unit-tests
#RUN make unit_tests
#COPY functional-tests ./functional-tests
#RUN ./functional-tests/node-client-test.js
#RUN if [ `uname -m` != aarch64 ]; then apt-get install -y chromium-driver; fi
#RUN if [ `uname -m` != aarch64 ]; then ./functional-tests/browser-client-test/browser-test.js; fi
#RUN ./functional-tests/routing-server-test.js

