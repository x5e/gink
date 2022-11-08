import { GinkInstance } from "./GinkInstance";
import { Store } from "./Store";
import {
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { CallBack } from "./typedefs";
import { Peer } from './Peer';
import { Buffer } from "buffer";
import { ensure } from "./utils";



export class RoutingServerInstance extends GinkInstance {

    constructor(store: Store, software?: string, readonly logger: CallBack = console.log) {
        super(store, {software: software || "RoutingServerInstance"}, logger)
    }

    async onConnection(connection: WebSocketConnection) {
        // Note: can't await before the connection is accepted or you'll miss the greeting.
        this.logger(`Connection accepted.`);
        const sendFunc = (data: Uint8Array) => connection.sendBytes(Buffer.from(data));
        const closeFunc = () => { connection.close(); };
        const connectionId = this.createConnectionId();
        ensure(typeof(connectionId) === "number" && connectionId > 0);
        const peer = new Peer(sendFunc, closeFunc);
        this.peers.set(connectionId, peer);
        connection.on('close', this.onClose.bind(this, connectionId));
        connection.on('message', this.onMessage.bind(this, connectionId));
        await this.ready;
        sendFunc(this.iHave.getGreetingMessageBytes());
    }

    private async onMessage(connectionId: number, webSocketMessage: WebSocketMessage) {
        if (webSocketMessage.type === 'utf8') {
            this.logger('Received Text Message: ' + webSocketMessage.utf8Data);
        }
        else if (webSocketMessage.type === 'binary') {
            this.logger('Server received binary message of ' + webSocketMessage.binaryData.length + ' bytes.');
            await this.receiveMessage(webSocketMessage.binaryData, connectionId);
        }
    }

    private onClose(connectionId: number, reasonCode: number, description: string) {
        this.peers.delete(connectionId);
        this.logger(`Peer disconnected. ${reasonCode}, ${description}`);
    }

}