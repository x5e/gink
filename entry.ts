console.log("Hello from typescript");
var transactions = require("transactions_pb");
var values = require("values_pb");

function muidToText(muid, sep): string {
    sep = sep || "";
    let timePart = muid.getTimestamp().toString(16).toUpperCase().padStart(14,'0');
    let medallionPart = muid.getMedallion().toString(16).toUpperCase().padStart(13, '0');
    let offsetPart = muid.getOffset().toString(16).toUpperCase().padStart(5, '0');
    return timePart + sep + medallionPart + sep + offsetPart;
}

var medallion = 425579549941797;
var milliseconds = 1643351021040;
var microseconds = milliseconds * 1000; 
var offset = 3;

var muid = new transactions.Muid();
muid.setMedallion(medallion);
muid.setTimestamp(microseconds);
muid.setOffset(offset);

console.log(muidToText(muid, "-"));
