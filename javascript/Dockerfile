FROM node:18
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

COPY web-entry.js ./
COPY webpack.config.js ./
RUN cd .. && npx webpack-cli build --config ./javascript/webpack.config.js

COPY integration-tests ./integration-tests
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

COPY static ./static
RUN npm run browser-unit
RUN npm run browser-integration
RUN ./integration-tests/node-client-test.js
RUN ./integration-tests/authentication-test.js
RUN ./integration-tests/routing-server-test.js
