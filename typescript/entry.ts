#!/usr/bin/env ts-node
console.log("Hello from typescript foobar");
// var transactions = require("transactions_pb");
import {Muid, Transaction} from "transactions_pb";
try {
  window["Muid"] = Muid;
  window["Transaction"] = Transaction;
} catch (e) {
  console.log(`whatever: ${e}`)
}
// var values = require("values_pb");

function toHexString(bytes: Uint8Array): string {
    return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}

function fromHexString(hexString: string): Uint8Array {
  return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}


/*
function muidToText(muid: Muid, sep = ""): string {
    sep = sep || "";
    let timePart = muid.getTimestamp().toString(16).toUpperCase().padStart(14,'0');
    let medallionPart = muid.getMedallion().toString(16).toUpperCase().padStart(13, '0');
    let offsetPart = muid.getOffset().toString(16).toUpperCase().padStart(5, '0');
    return timePart + sep + medallionPart + sep + offsetPart;
}

function toHexString(bytes: Uint8Array): string {
  return bytes.reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
}


console.log(muidToText(muid, "-"));
console.log(toHexString(muid.serializeBinary()));
*/


var medallion = 425579549941797;
var milliseconds = 1643351021040;
var microseconds = milliseconds * 1000; 
var offset = 3;

var muid = new Muid();
muid.setMedallion(medallion);
muid.setTimestamp(microseconds);
muid.setOffset(offset);

var eg = "0880e3e6cee7d3f50210a5c097afffe1601803";
var eg2 = toHexString(fromHexString(eg));
console.log(`eg2=${eg2}`);


// muid.setOffset(99);
console.log(toHexString(muid.serializeBinary()));

console.log("--------------------------");
var muid2 = new Muid(fromHexString(eg));
console.log(muid2.getTimestamp());
var ser2 = toHexString(muid2.serializeBinary());
console.log(ser2);

/*
var target: string = "";
if (typeof location == "object") {
  console.log("getting websocket target from window");
  target = ((location.protocol === "https:") ? "wss://" : "ws://") + location.host
} else if (typeof process != "undefined") {
  target = process.env["GINK_SERVER"];
}
if (!target) {
  throw new Error("target not specified");
}

var W3cWebSocket = typeof WebSocket == 'function' ? WebSocket : eval("require('websocket').w3cwebsocket");
console.log(`Trying to connect to ${target}`);
let websocketClient: WebSocket = new W3cWebSocket(target, "echo");

websocketClient.onopen = function(ev: Event) {
  console.log('connected' + ev.toString());
  websocketClient.send(Date.now().toString());
};
 
websocketClient.onclose = function(ev: CloseEvent) {
  console.log('disconnected' + ev.toString());
};

var calls = 0;
websocketClient.onmessage = function(ev: MessageEvent<any>) {
  console.log(`Roundtrip time: ${Date.now() - Number(ev.data)} ms`);
 
  calls += 1;
  if (calls < 3) {
  setTimeout(function timeout() {
    websocketClient.send(Date.now().toString());
  }, 1000);
}
  
};
*/

import { IndexedGink, mode } from "./indexed";
function show(x: string) {
  return function(y: any) {
    console.log(`show ${x}: ${y} aka ${JSON.stringify(y)}`);
  }
}

globalThis.IndexedGink = IndexedGink;
(async function() {
  globalThis.gink = mode == "browser" ? new IndexedGink() : 
    await IndexedGink.withTransactionLog("/tmp/gink.trxns");
  var testTrxn = new Transaction();
  testTrxn.setMedallion(medallion);
  testTrxn.setTimestamp(microseconds);
  testTrxn.setChainStart(microseconds);
  testTrxn.setComment("Hello, Gink!");
  var out = globalThis.gink.addTransaction(testTrxn.serializeBinary());
  // out.then(show('trxn out')).catch(console.error);
  // globalThis.gink.getChainInfos().then(show('objs')).catch(console.error);
  // globalThis.gink.getGreeting().then(show('greeting'));
  await globalThis.gink.close();
})();