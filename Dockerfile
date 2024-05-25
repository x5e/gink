FROM darinmcgill/base

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

ENV CHROME_BIN=/usr/bin/chromium

ENV GINK=/opt/gink
RUN mkdir -p $GINK
WORKDIR $GINK

COPY javascript/package*.json ./
RUN npm ci && npm rebuild
COPY Makefile ./
COPY proto ./proto

COPY python ./python
RUN make python/gink/builders
ENV PYTHONPATH $GINK/python
WORKDIR $GINK/python
# Python lint
RUN mypy gink/impl gink/tests

# Python unit-tests
RUN python3 -m nose2

WORKDIR $GINK
COPY javascript ./javascript
RUN make javascript
WORKDIR $GINK/javascript

# JavaScript/TypeScript unit-tests
RUN npm test
RUN npm run browser-unit

# # Python integration tests
RUN ./integration-tests/py-py-test.js
RUN ./integration-tests/py-ts-test.js
RUN ./integration-tests/ts-py-test.js
RUN ./integration-tests/chain-reuse-py-test.js lmdb
RUN ./integration-tests/chain-reuse-py-test.js binlog
RUN ./integration-tests/chain-reuse-py-test.js binlog
RUN ./integration-tests/wsgi-test.js

# JavaScript/TypeScript integration tests
RUN ./integration-tests/node-client-test.js
RUN ./integration-tests/authentication-test.js
RUN ./integration-tests/routing-server-test.js
RUN ./integration-tests/logbacked-peers-test.js
RUN ./integration-tests/test_expector.js
RUN ./integration-tests/chain-reuse-ts-test.js

RUN npm run browser-integration
