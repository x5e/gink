import { GinkInstance } from "./GinkInstance";
import { Store } from "./Store";
import {
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { CallBack } from "./typedefs";
import { Peer } from './Peer';
import { Buffer } from "buffer";



export class RoutingServerInstance extends GinkInstance {

    constructor(store: Store, instanceInfo?: string, readonly logger: CallBack = console.log) {
        super(store, instanceInfo || "GinkServerInstance")
    }

    async onConnection(connection: WebSocketConnection) {
        await this.ready;
        this.logger(`Connection accepted.`);
        const sendFunc = (data: Uint8Array) => { connection.sendBytes(Buffer.from(data)); };
        const closeFunc = () => { connection.close(); };
        const connectionId = this.createConnectionId();
        const peer = new Peer(sendFunc, closeFunc);
        const peers = this.peers;
        peers.set(connectionId, peer);
        connection.on('close', this.onClose.bind(this, connectionId));
        connection.on('message', this.onMessage.bind(this, connectionId));
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