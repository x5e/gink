import { Database } from "./Database";
import { LogBackedStore } from "./LogBackedStore";
import {
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { CallBack, FilePath } from "./typedefs";
import { Peer } from './Peer';
import { Buffer } from "buffer";
import { ensure } from "./utils";



export class RoutingServerInstance extends Database {

    constructor(readonly filePath: FilePath, readonly logger: CallBack = console.log) {
        super(new LogBackedStore(filePath, false), { software: `routing server for ${filePath}` }, logger);
    }

    async onConnection(connection: WebSocketConnection) {
        // Note: can't await before the connection is accepted, or you'll miss the greeting.
        this.logger(`Connection accepted for ${this.filePath}`);
        const sendFunc = (data: Uint8Array) => connection.sendBytes(Buffer.from(data));
        const closeFunc = () => { connection.close(); };
        const connectionId = this.createConnectionId();
        ensure(typeof (connectionId) === "number" && connectionId > 0);
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
            this.logger(`Server for ${this.filePath} received binary message of ${webSocketMessage.binaryData.length} bytes from ${connectionId}`);
            await this.receiveMessage(webSocketMessage.binaryData, connectionId);
        }
    }

    private onClose(connectionId: number, reasonCode: number, description: string) {
        this.peers.delete(connectionId);
        this.logger(`Peer ${connectionId} disconnected from ${this.filePath} ${reasonCode}, ${description}`);
    }

}
