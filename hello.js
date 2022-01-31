var transactions = require("transactions_pb");
var values = require("values_pb");

// const fs = require('fs');

/*
fs.readFile(process.argv[2], (err, data) => {
    if (err) {return console.error(`problem reading file: ${err}`);}
    let config = JSON.parse(data);
    console.log(config);
});
*/

var medallion = 425579549941797;
var milliseconds = 1643351021040;
var microseconds = milliseconds * 1000; 
var offset = 3;

var muid = new transactions.Muid();

muid.setMedallion(medallion);
muid.setTimestamp(microseconds);
muid.setOffset(offset);

function muidToText(muid, sep) {
    sep = sep || "";
    let timePart = muid.getTimestamp().toString(16).toUpperCase().padStart(14,'0');
    let medallionPart = muid.getMedallion().toString(16).toUpperCase().padStart(13, '0');
    let offsetPart = muid.getOffset().toString(16).toUpperCase().padStart(5, '0');
    return timePart + sep + medallionPart + sep + offsetPart;
}

console.log("hello multiverse");
console.log(muidToText(muid));
console.log(muidToText(muid, "-"));
console.log(muid.toObject());
//console.log(muid.serializeBinary());
//console.log(Buffer.from(muid.serializeBinary()).toString('hex'));

function nodeIndexedDB(fn) {
    console.log("using nodeIndexedDB");
    fn = fn || "default.indexeddb";
    const IndexedDB = eval("require('indexeddb')");
    const Destructible = eval("require('destructible')");
    const destructible = new Destructible('destructible');
    const indexedDB = IndexedDB.create(destructible, fn);
    return indexedDB;
}

console.log("before the thing");
//indexedDB = indexedDB || nodeIndexedDB();

const request = indexedDB.open('test', 1);

request.onupgradeneeded = function (event) {
    console.log("doing upgrade");
    const db = request.result
    const store = db.createObjectStore('president', { keyPath: [ 'lastName', 'firstName' ] })
    store.put({ firstName: 'George', lastName: 'Washington' })
    store.put({ firstName: 'John', lastName: 'Adams' })
    store.put({ firstName: 'Thomas', lastName: 'Jefferson' })
}

request.onsuccess = function (event) {
    console.log("onsuccess");
    const db = request.result
    const cursor = db.transaction('president')
                     .objectStore('president')
                     .openCursor()
    const gathered = []
    cursor.onsuccess = function (event) {
        const cursor = event.target.result
        if (cursor != null) {
            gathered.push(cursor.value)
            cursor.continue()
        } else {
            console.log(gathered, [{
                firstName: 'John', lastName: 'Adams'
            }, {
                firstName: 'Thomas', lastName: 'Jefferson'
            }, {
                firstName: 'George', lastName: 'Washington'
            }], 'gathered')
            db.close()
        }
    }
}
