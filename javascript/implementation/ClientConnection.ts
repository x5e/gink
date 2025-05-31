import { AbstractConnection } from "./AbstractConnection";
import { encodeToken } from "./utils";
import { Connection } from "./typedefs";

export class ClientConnection extends AbstractConnection implements Connection {
    private static W3cWebSocket =
        typeof WebSocket === "function"
            ? WebSocket
            : eval("require('websocket').w3cwebsocket");
    private websocketClient?: WebSocket;
    private reconnectOnClose: boolean;
    private pendingConnect: boolean;
    private onData: (data: Uint8Array) => void;
    private onOpen: () => void;
    private protocols: string[];
    readonly endpoint: string;

    constructor(options: {
        endpoint: string;
        authToken?: string;
        onData: (data: Uint8Array) => Promise<void>;
        onOpen: () => void;
        reconnectOnClose?: boolean;
    }) {
        super();
        const { endpoint, authToken, onData, reconnectOnClose } = options;
        this.endpoint = endpoint;
        this.onData = onData;
        this.protocols = ["gink"];
        if (authToken) this.protocols.push(encodeToken(authToken));
        this.reconnectOnClose = reconnectOnClose ?? true;
        this.pendingConnect = true;
        this.connect();
    }

    get readyState(): number {
        return this.websocketClient?.readyState ?? WebSocket.CLOSED;
    }

    private connect() {
        this.pendingConnect = false;
        if (this.websocketClient) {
            if (
                this.websocketClient.readyState === WebSocket.OPEN ||
                this.websocketClient.readyState === WebSocket.CONNECTING
            ) {
                console.error("connect called but already connected");
                return;
            }
        }
        this.websocketClient = new ClientConnection.W3cWebSocket(
            this.endpoint,
            this.protocols,
        );
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
        if (this.reconnectOnClose) {
            if (this.pendingConnect) {
                console.log("onClose called but pendingConnect is true");
                return;
            }
            this.pendingConnect = true;
            setTimeout(() => {
                this.connect();
            }, 1000);
        }
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
        this.reconnectOnClose = false;
        this.websocketClient.close();
    }
}
