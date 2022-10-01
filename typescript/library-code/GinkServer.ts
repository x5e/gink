import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import { info } from "./utils";
import {
    server as WebSocketServer, request as WebSocketRequest,
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { GinkInstance } from "./GinkInstance";
import { Peer } from './Peer';
import { Buffer } from "buffer";
import { Store } from "./Store";
import { ServerArgs } from './typedefs';

export class GinkServer extends GinkInstance {
    private websocketServer: WebSocketServer;

    constructor(store: Store, instanceInfo: string, args: ServerArgs) {
        super(store, instanceInfo);
        const staticPath = args.staticPath || __dirname;
        const staticServer = new StaticServer(staticPath);
        const port = args.port || "8080";
        let httpServer: HttpServer | HttpsServer;
        if (args["sslKeyFilePath"] && args["sslCertFilePath"]) {
            var options = {
                key: readFileSync(args["sslKeyFilePath"]),
                cert: readFileSync(args["sslCertFilePath"]),
            };
            httpServer = createHttpsServer(options, function (request, response) {
                staticServer.serve(request, response);
            }).listen(port, () => info(
                `Secure server is listening on port ${port}`));
        } else {
            httpServer = createHttpServer(function (request, response) {
                staticServer.serve(request, response);
            });
            httpServer.listen(port, function () {
                info(`Insecure server is listening on port ${port}`);
            });
        }
        this.websocketServer = new WebSocketServer({ httpServer });
        this.websocketServer.on('request', this.onRequest.bind(this));
    }

    private async onRequest(request: WebSocketRequest) {
        await this.initialized;
        const thisServer = this; // pass into closures
        let protocol: string | null = null;
        if (request.requestedProtocols.length) {
            if (request.requestedProtocols.includes(GinkInstance.PROTOCOL))
                protocol = GinkInstance.PROTOCOL;
            else
                return request.reject(400, "bad protocol");
        }
        const connection: WebSocketConnection = request.accept(protocol, request.origin);
        info(`Connection accepted.`);
        const sendFunc = (data: Uint8Array) => { connection.sendBytes(Buffer.from(data)); };
        const closeFunc = () => { connection.close(); };
        const connectionId = this.createConnectionId();
        const peer = new Peer(sendFunc, closeFunc);
        this.peers.set(connectionId, peer);
        connection.on('close', function (_reasonCode, _description) {
            thisServer.peers.delete(connectionId);
            info(' Peer ' + connection.remoteAddress + ' disconnected.');
        });
        connection.on('message', this.onMessage.bind(this, connectionId));
        sendFunc(this.getGreetingMessageBytes());
    }

    private onMessage(connectionId: number, webSocketMessage: WebSocketMessage) {
        if (webSocketMessage.type === 'utf8') {
            info('Received Text Message: ' + webSocketMessage.utf8Data);
        }
        else if (webSocketMessage.type === 'binary') {
            info('Server received binary message of ' + webSocketMessage.binaryData.length + ' bytes.');
            this.receiveMessage(webSocketMessage.binaryData, connectionId);
        }
    }
}
