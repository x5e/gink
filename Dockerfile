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
COPY . .
RUN make
RUN make unit_tests
RUN make node-client-test
RUN make browser-client-test
