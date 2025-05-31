
import { AbstractConnection } from "./AbstractConnection";
import { encodeToken } from "./utils";
import { HasMap } from "./HasMap";

export class ClientConnection extends AbstractConnection {
    private static W3cWebSocket =typeof WebSocket === "function"
        ? WebSocket
        : eval("require('websocket').w3cwebsocket");
    private websocketClient?: WebSocket;
    private iHave: HasMap;
    private reconnectOnClose: boolean;
    private pendingConnect: boolean;
    private onData: (data: Uint8Array) => void;
    private protocols: string[];
    readonly endpoint: string;

    constructor(options: {
        endpoint: string,
        authToken?: string,
        iHave: HasMap,
        onData: (data: Uint8Array) => void,
        reconnectOnClose?: boolean,
    }) {
        super();
        const {endpoint, authToken, iHave, onData, reconnectOnClose} = options;
        this.endpoint = endpoint;
        this.iHave = iHave;
        this.onData = onData;
        this.protocols = ["gink"];
        if (authToken) this.protocols.push(encodeToken(authToken));
        this.reconnectOnClose = reconnectOnClose ?? true;
        this.pendingConnect = true;
        this.connect();
    }

    private connect() {
        this.pendingConnect = false;
        this.setState("connecting");
        if (this.websocketClient) {
            if (this.websocketClient.readyState === WebSocket.OPEN ||
                this.websocketClient.readyState === WebSocket.CONNECTING) {
                    console.log("connect called but already connected");
                    return;
            }
        }
        this.websocketClient = new ClientConnection.W3cWebSocket(this.endpoint, this.protocols);
        if (!this.websocketClient) {
            throw new Error("Failed to create WebSocket client");
        }
        this.websocketClient.binaryType = "arraybuffer";
        this.websocketClient.onopen = this.onOpen.bind(this);
        this.websocketClient.onmessage = this.onMessage.bind(this);
        this.websocketClient.onerror = this.onError.bind(this);
        this.websocketClient.onclose = this.onClose.bind(this);
    }

    private onError(ev: Event) {
        console.log("onError", ev);
        this.onClosed();
    }

    private onClose(ev: CloseEvent) {
        console.log("onClose", ev);
        this.onClosed();
    }

    private onClosed() {
        this.setState("closed");
        if (this.reconnectOnClose) {
            if (this.pendingConnect) {
                console.log("onClose called but pendingConnect is true");
                return;
            }
            this.pendingConnect = true;
            this.setState("waiting");
            setTimeout(() => {
                this.connect();
            }, 1000);
        }
    }

    private onOpen() {
        this.websocketClient.send(this.iHave.getGreetingMessageBytes());
        this.setState("connected");
    }

    private onMessage(ev: MessageEvent) {
        const data = ev.data;
        if (data instanceof ArrayBuffer) {
            const uint8View = new Uint8Array(data);
            this.onData(uint8View);
        } else {
            // We don't expect any non-binary text messages.
            console.error(`got non-arraybuffer message: ${data}`);
        }
    }

    send(msg: Uint8Array) {
        this.websocketClient.send(msg);
    }

    close() {
        this.setState("closing");
        this.websocketClient.close();
    }

    stop() {
        this.reconnectOnClose = false;
        this.close();
    }


}
