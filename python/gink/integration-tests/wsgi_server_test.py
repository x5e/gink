from ..impl.database import Database
from ..impl.memory_store import MemoryStore
from selenium import webdriver
from selenium.webdriver.common.by import By
from time import sleep
from flask import Flask
import multiprocessing

app = Flask(__name__)

@app.route('/hello')
def hello_world():
    return '<h1 id="test">Hello World</h1>'

store = MemoryStore()
db = Database(store=store, web_server=app)

p = multiprocessing.Process(target=db.run)
p.start()
sleep(0.1)
options = webdriver.ChromeOptions()
options.add_argument("--headless=new")
driver = webdriver.Chrome(options=options)
driver.get("http://localhost:8081/hello")
elem = driver.find_element(By.ID, "test")
assert elem.text == "Hello World"

driver.quit()
p.terminate()

