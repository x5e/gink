import {
    connection as WebSocketConnection,
    Message as WebSocketMessage,
} from "websocket";

import { AbstractConnection } from "./AbstractConnection";

export class ServerConnection extends AbstractConnection {
    private onData: (data: Uint8Array) => Promise<void>;
    private onClose: () => void;
    private websocketConnection: WebSocketConnection;

    constructor(args: {
        onClose: () => void;
        onData: (data: Uint8Array) => Promise<void>;
        websocketConnection: WebSocketConnection;
    }) {
        super();
        const { onData, onClose, websocketConnection } = args;
        this.onData = onData;
        this.onClose = onClose;
        this.websocketConnection = websocketConnection;
        this.websocketConnection.on("message", this.onMessage.bind(this));
        this.websocketConnection.on("close", this.onClose.bind(this));
        this.websocketConnection.on("error", this.onClose.bind(this));
    }

    send(data: Uint8Array) {
        this.websocketConnection.sendBytes(Buffer.from(data));
    }

    close() {
        this.websocketConnection.close();
    }

    private onMessage(message: WebSocketMessage) {
        if (message.type === "utf8") {
            console.error(`Received Text Message: ${message.utf8Data}`);
        } else if (message.type === "binary") {
            this.onData(message.binaryData).catch((reason) => {
                console.error("something went wrong receiving data\n", reason);
                this.close();
            });
        }
    }
}
