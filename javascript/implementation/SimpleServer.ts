import {
    request as WebSocketRequest,
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { GinkInstance } from "./GinkInstance";
import { Peer } from './Peer';
import { Buffer } from "buffer";
import { Store,  } from "./Store";
import { CallBack, NumberStr, FilePath, DirPath, AuthFunction } from "./typedefs";
import { Listener } from "./Listener";

/**
 * A server that connects all inbound websocket connections to a single database instance.
 */
export class SimpleServer extends GinkInstance {

    private listener: Listener;
    public connections: Map<number, WebSocketConnection>

    constructor(store: Store, args: {
        port?: NumberStr;
        sslKeyFilePath?: FilePath;
        sslCertFilePath?: FilePath;
        staticContentRoot?: DirPath;
        logger?: CallBack;
        software?: string;
        authFunction?: AuthFunction;
    }) {
        super(store, {software: args.software || "SimpleServer"}, args.logger || (() => null));
        this.listener = new Listener({
            requestHandler: this.onRequest.bind(this),
            instance: this,
            ...args
        });
        this.connections = new Map();
        this.ready = Promise.all([this.ready, this.listener.ready]).then(() => args.logger(`SimpleServer.ready`));
    }

    private async onRequest(request: WebSocketRequest) {
        await this.ready;
        const thisServer = this; // pass into closures
        let protocol: string | null = null;
        if (request.requestedProtocols.length) {
            if (request.requestedProtocols.includes(GinkInstance.PROTOCOL))
                protocol = GinkInstance.PROTOCOL;
            else
                return request.reject(400, "bad protocol");
        }
        const connection: WebSocketConnection = request.accept(protocol, request.origin);
        this.logger(`Connection accepted.`);
        const sendFunc = (data: Uint8Array) => { connection.sendBytes(Buffer.from(data)); };
        const closeFunc = () => { connection.close(); };
        const connectionId = this.createConnectionId();
        this.connections.set(connectionId, connection.remoteAddress);
        const peer = new Peer(sendFunc, closeFunc);
        this.peers.set(connectionId, peer);
        connection.on('close', function (_reasonCode, _description) {
            thisServer.peers.delete(connectionId);
            thisServer.connections.delete(connectionId);
            thisServer.logger(' Peer ' + connection.remoteAddress + ' disconnected.');
        });
        connection.on('message', this.onMessage.bind(this, connectionId));
        sendFunc(this.iHave.getGreetingMessageBytes());
    }

    private onMessage(connectionId: number, webSocketMessage: WebSocketMessage) {
        if (webSocketMessage.type === 'utf8') {
            this.logger('Received Text Message: ' + webSocketMessage.utf8Data);
        }
        else if (webSocketMessage.type === 'binary') {
            this.logger('Server received binary message of ' + webSocketMessage.binaryData.length + ' bytes.');
            this.receiveMessage(webSocketMessage.binaryData, connectionId);
        }
    }
}
