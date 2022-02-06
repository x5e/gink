#!/usr/bin/env ts-node
// var WebSocketServer = require('websocket').server;
import {server as WebSocketServer, connection as Connection, Message} from 'websocket';


import {createServer} from 'http';
import {Server as StaticServer} from 'node-static';
const staticServer = new StaticServer(process.env["PWD"])
var httpServer = createServer(function(request, response) {
    staticServer.serve(request, response);
});
httpServer.listen(8080, function() {
    console.log((new Date()) + ' Server is listening on port 8080');
});


var websocketServer = new WebSocketServer({
    httpServer: httpServer,
});
let connection: Connection;

function onMessage(message: Message) {
    if (message.type === 'utf8') {
        console.log('Received Message: ' + message.utf8Data);
        connection.sendUTF(message.utf8Data);
    }
    else if (message.type === 'binary') {
        console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
        connection.sendBytes(message.binaryData);
    }
}

websocketServer.on('request', function(request) {
    connection = request.accept('echo', request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', onMessage);
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});
