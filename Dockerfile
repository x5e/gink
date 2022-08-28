FROM node:latest
RUN apt-get update
RUN apt-get install -y protobuf-compiler
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
