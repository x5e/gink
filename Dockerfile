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
RUN if [ `uname -m` != aarch64 ]; then ./functional-tests/browser-client-test/browser-test.js; fi
RUN ./functional-tests/routing-server-test.js
WORKDIR /opt/gink/python
ENV PIP_ROOT_USER_ACTION=ignore
# The most recent python protobuf library isn't compatible with the files generated
# by the protobuf compiler installed by Debian.
RUN apt-get install -y python3-pip
RUN pip3 --no-cache-dir install --upgrade pip
COPY python/requirements.txt ./requirements.txt
RUN pip3 --no-cache-dir install -r requirements.txt
COPY python/gink ./gink
RUN python3 -m nose2
