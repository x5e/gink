FROM node:latest
RUN apt-get update
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y protobuf-compiler
RUN apt-get install -y chromium-driver
CMD bash
ENV WORKING=/opt/gink/typescript
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY typescript/package.json ./
RUN npm install
RUN npm rebuild
RUN rm -rf ~/.* || true
COPY typescript .
RUN mkdir -p /opt/gink/proto
COPY proto ../proto
RUN make
RUN npm rebuild
RUN make unit_tests
RUN make integration_test
RUN make browser_test
