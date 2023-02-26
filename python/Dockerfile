from python:3.8
RUN rm -rf ~/.profile ~/.bashrc ~/.wget-hsts
CMD bash
ENV WORKING=/opt/gink/python
RUN mkdir -p $WORKING
WORKDIR $WORKING
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY gink ./gink
RUN nose2
COPY .mypy.ini ./
RUN mypy gink/impl gink/tests
