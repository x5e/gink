FROM debian:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update --fix-missing && apt-get upgrade -y
RUN apt-get install -y make

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

# Install Google Chrome Stable and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer.
RUN if [ `uname -m` != aarch64 ]; then apt-get update && apt-get install gnupg wget -y && \
  wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
  sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
  apt-get update && \
  apt-get install google-chrome-stable -y --no-install-recommends && \
  rm -rf /var/lib/apt/lists/* && export CHROME_BIN=/usr/bin/chrome; fi
RUN if [ `uname -m` == aarch64 ]; then apt update && apt install chromium-browser && export CHROME_BIN=/usr/bin/chromium-browser; fi

ENV GINK=/opt/gink
RUN mkdir -p $GINK
WORKDIR $GINK
COPY packages.txt ./
COPY Makefile ./
RUN make install-dependencies
COPY javascript/package.json ./
RUN npm install && npm rebuild

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
RUN mv node_modules ./javascript/
RUN make
WORKDIR $GINK/javascript


# JavaScript/TypeScript unit-tests
RUN npm test
RUN npm run browser-unit

# Python integration tests
RUN ./integration-tests/py-py-test.js
RUN ./integration-tests/py-ts-test.js
RUN ./integration-tests/ts-py-test.js
RUN ./integration-tests/chain-reuse-py-test.js lmdb
RUN ./integration-tests/chain-reuse-py-test.js binlog

# JavaScript/TypeScript integration tests
RUN ./integration-tests/node-client-test.js
RUN ./integration-tests/authentication-test.js
RUN ./integration-tests/routing-server-test.js
RUN ./integration-tests/logbacked-peers-test.js
RUN ./integration-tests/test_expector.js
RUN ./integration-tests/chain-reuse-ts-test.js

RUN npm run browser-integration
