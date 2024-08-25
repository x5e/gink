FROM darinmcgill/base

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

ENV CHROME_BIN=/usr/bin/chromium

ENV GINK=/opt/gink
RUN mkdir -p $GINK
WORKDIR $GINK

COPY javascript/*.json ./javascript/
RUN cd ./javascript && npm ci && npm rebuild
COPY Makefile ./
COPY proto ./proto

COPY python ./python
RUN make python/gink/builders
ENV PYTHONPATH=$GINK/python
WORKDIR $GINK/python
# Python lint
RUN mypy gink/impl gink/tests
RUN pycodestyle --max-line-length=120 --select=E501 gink/impl/*.py gink/tests/*.py

# Python unit-tests
RUN python3 -m nose2

WORKDIR $GINK
COPY javascript/*.js javascript/.prettier* ./javascript/
COPY javascript/implementation ./javascript/implementation
RUN make javascript
WORKDIR $GINK/javascript

# JavaScript/TypeScript unit-tests
COPY javascript/unit-tests ./unit-tests
RUN npx prettier . --check
RUN npm test
RUN npm run browser-unit

# Integration tests
COPY javascript/integration-tests/*.js javascript/integration-tests/*.sh ./integration-tests/
RUN ./integration-tests/run_integration_tests.sh

COPY javascript/content_root ./content_root
COPY javascript/integration-tests/browser-tests ./integration-tests/browser-tests
RUN npm run browser-integration
