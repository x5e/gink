FROM node:latest
RUN apt-get update
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get install -y protobuf-compiler
RUN apt-get install -y chromium-driver
ENV WORKING=/opt/gink
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY package.json ./
RUN npm install
CMD bash
COPY . .
RUN make
RUN make unit_tests
RUN make integration_tests
RUN ./typescript/browser-test.js
RUN rm -rf ~/.* || true
