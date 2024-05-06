"""
This test ensures a wsgi webserver can be passed into a gink database
and the endpoints will be reachable as expected.
"""
from ..impl.database import Database
from ..impl.memory_store import MemoryStore
import requests
from flask import Flask
import multiprocessing

def test_wsgi_integration():
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

    store = MemoryStore()
    flask_db = Database(store=store, web_server=flask_app)
    wsgi_db = Database(store=store, web_server=wsgi_app, web_server_addr=('localhost', 8082))

    p = multiprocessing.Process(target=flask_db.run)
    p.start()
    p2 = multiprocessing.Process(target=wsgi_db.run)
    p2.start()

    data = requests.get("http://localhost:8081/hello").text
    data2 = requests.get("http://localhost:8082").text
    assert "Hello World" in data
    assert "Hello universe!" in data2

    p.terminate()
    p2.terminate()
