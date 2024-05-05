"""
This test ensures a wsgi webserver can be passed into a gink database
and the endpoints will be reachable as expected.
"""
from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from selenium import webdriver
from selenium.webdriver.common.by import By
from time import sleep
from flask import Flask
import multiprocessing

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
sleep(0.1)
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
options.add_argument('--no-sandbox')
options.add_argument('--disable-gpu')

driver = webdriver.Chrome(options=options)
driver.get("http://localhost:8081/hello")
elem = driver.find_element(By.ID, "test")
assert elem.text == "Hello World"
driver.get("http://localhost:8082")
elem = driver.find_element(By.ID, "test")
assert elem.text == "Hello universe!"

driver.quit()
p.terminate()
p2.terminate()
