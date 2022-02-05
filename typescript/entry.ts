console.log("Hello from typescript foobar");
// var transactions = require("transactions_pb");
import {Muid} from "transactions_pb";
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
// muid.setOffset(offset);

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