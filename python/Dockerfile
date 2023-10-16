FROM python:3.8
RUN rm -rf ~/.profile ~/.bashrc ~/.wget-hsts
CMD bash
ENV WORKING=/opt/gink/python
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY . .
RUN pip install .[test,lint]
RUN nose2
RUN mypy gink/impl gink/tests
