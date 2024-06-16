FROM darinmcgill/base

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

ENV CHROME_BIN=/usr/bin/chromium

RUN curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
RUN chmod +x mkcert-v*-linux-amd64
RUN cp mkcert-v*-linux-amd64 /usr/local/bin/mkcert
WORKDIR /etc/ssl/certs
RUN mkcert -install
RUN mkcert localhost

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

# Integration tests
RUN ./integration-tests/run_integration_tests.sh

RUN npm run browser-integration
