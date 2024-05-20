"""
This test ensures a wsgi webserver can be passed into a gink database
and the endpoints will be reachable as expected.
"""
import requests
from flask import Flask
import multiprocessing

from ..impl.wsgi_listener import WsgiListener
from ..impl.looping import loop

def test_wsgi_integration():
    multiprocessing.set_start_method("fork")
    # Flask Server
    flask_app = Flask(__name__)
    @flask_app.route('/hello')
    def hello_world():
        return '<h1 id="test">Hello World</h1>'

    # Default WSGI complient application
    def wsgi_app(environ, start_response):
        status = '200 OK'
        headers = [('Content-type', 'text/html')]
        start_response(status, headers)
        return [b'<h1 id="test">Hello universe!</h1>']


    flask_wrapper = WsgiListener(flask_app, port=8081)
    basic_wrapper = WsgiListener(wsgi_app, port=8082)

    p = multiprocessing.Process(target=flask_wrapper.run)
    p.start()
    p2 = multiprocessing.Process(target=wsgi_db.run)
    p2.start()

    try:
        data = requests.get("http://localhost:8081/hello").text
        data2 = requests.get("http://localhost:8082").text
        assert "Hello World" in data
        assert "Hello universe!" in data2
    finally:
        p.terminate()
        p2.terminate()
