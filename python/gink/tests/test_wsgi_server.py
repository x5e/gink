"""
This test ensures a wsgi webserver can be passed into a gink database
and the endpoints will be reachable as expected.
"""
import requests
from flask import Flask
from multiprocessing import Process, set_start_method

from ..impl.wsgi_listener import WsgiListener
from ..impl.looping import loop

set_start_method("fork")  # flask can't be pickled

def wsgi_app(_, start_response):
    status = '200 OK'
    headers = [('Content-type', 'text/html')]
    start_response(status, headers)
    return [b'<h1 id="test">Hello universe!</h1>']

def test_wsgi_integration():
    flask_app = Flask(__name__)

    @flask_app.route('/hello')
    def _():
        return '<h1 id="test">Hello World</h1>'

    flask_wrapper = WsgiListener(flask_app, port=8081)
    basic_wrapper = WsgiListener(wsgi_app, port=8082)

    p1 = Process(target=loop, args=[flask_wrapper])
    p1.start()
    p2 = Process(target=loop, args=[basic_wrapper])
    p2.start()

    try:
        data1 = requests.get("http://localhost:8081/hello").text
        data2 = requests.get("http://localhost:8082").text
        assert "Hello World" in data1
        assert "Hello universe!" in data2
    finally:
        p1.terminate()
        p2.terminate()


if __name__ == "__main__":
    loop(WsgiListener(wsgi_app))
