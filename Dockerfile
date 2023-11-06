FROM debian:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update --fix-missing && apt-get upgrade -y
ENV WORKING=/opt/gink
RUN mkdir -p $WORKING
WORKDIR $WORKING
RUN apt-get install -y make
COPY packages.txt ./
COPY Makefile ./
RUN make install-dependencies
COPY proto ./proto
COPY javascript ./javascript
COPY python ./python
RUN make python/gink/builders
WORKDIR $WORKING/python
RUN python3 -m nose2
WORKDIR $WORKING
RUN make javascript
WORKDIR $WORKING/javascript
RUN npm test
