import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import { now } from "./utils";
import { server as WebSocketServer, request as WebSocketRequest, 
    connection as WebSocketConnection, Message as WebSocketMessage } from 'websocket';
import { Client } from "./Client";
import { LogBackedStore } from "./LogBackedStore";
import { Peer } from './Peer';
import { Buffer } from "buffer";

type FilePath = string;
type NumberStr = string;

interface ServerArgs {
    port?: NumberStr;
    sslKeyFilePath?: FilePath;
    sslCertFilePath?: FilePath;
    logFilePath: FilePath;
    medallion?: NumberStr;
    staticPath: string;
    resetLog?: boolean;
}

class Server extends Client {
    readonly port: NumberStr;
    #websocketServer: WebSocketServer;

    constructor(args: ServerArgs) {
        super(new LogBackedStore(args.logFilePath, args.resetLog));
        const staticServer = new StaticServer(args.staticPath);
        this.port = args.port || "8080";
        let httpServer: HttpServer | HttpsServer;
        if (args["sslKeyFilePath"] && args["sslCertFilePath"]) {
            var options = {
                key: readFileSync(args["sslKeyFilePath"]),
                cert: readFileSync(args["sslCertFilePath"]),
            };
            httpServer = createHttpsServer(options, function (request, response) {
                staticServer.serve(request, response);
            }).listen(this.port, () => console.log(
                `${now()} Secure server is listening on port ${this.port}`));
        } else {
            httpServer = createHttpServer(function (request, response) {
                staticServer.serve(request, response);
            });
            httpServer.listen(this.port, function () {
                console.log(`${now()} Insecure server is listening on port ${this.port}`);
            });
        }
        this.#websocketServer = new WebSocketServer({httpServer});
        this.#websocketServer.on('request', this.#onRequest.bind(this));
    }

    #onRequest(request: WebSocketRequest) {
        const connection: WebSocketConnection = request.accept('gink', request.origin);
        console.log(`${now()} Connection accepted via port ${this.port}`);
        const sendFunc = (data: Uint8Array) => {connection.sendBytes(Buffer.from(data));};
        const closeFunc = () => {connection.close();};
        const connectionId = this.createConnectionId();
        const peer = new Peer(sendFunc, closeFunc);
        this.peers.set(connectionId, peer);
        connection.on('close', function(reasonCode, description) {
            this.peers.delete(connectionId);
            console.log((now()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        });
        connection.on('message', this.#onMessage.bind(this, connectionId));
    }

    #onMessage(connectionId: number, webSocketMessage: WebSocketMessage) {
        if (webSocketMessage.type === 'utf8') {
            console.log('Received Text Message: ' + webSocketMessage.utf8Data);
        }
        else if (webSocketMessage.type === 'binary') {
            console.log('Server received binary message of ' + webSocketMessage.binaryData.length + ' bytes.');
            this.receiveMessage(connectionId, webSocketMessage.binaryData);
        }
    }
}