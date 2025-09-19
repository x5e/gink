import { AbstractConnection } from "./AbstractConnection";
import { encodeToken } from "./utils";
import { CallBack, Connection } from "./typedefs";

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
    private logger: CallBack;
    private onErrorCb?: CallBack;

    constructor(options: {
        endpoint: string;
        authToken?: string;
        onData: (data: Uint8Array) => Promise<void>;
        onOpen: () => void;
        reconnectOnClose?: boolean;
        logger?: CallBack;
        onError?: CallBack;
        waitFor: Promise<void>;
    }) {
        super();
        const {
            endpoint,
            authToken,
            onData,
            reconnectOnClose,
            onOpen,
            waitFor,
            logger,
            onError,
        } = options;
        this.onErrorCb = onError;
        this.onOpen = onOpen;
        this.endpoint = endpoint;
        this.onData = onData;
        this.logger = logger;
        this.protocols = ["gink"];
        if (authToken) this.protocols.push(encodeToken(authToken));
        this.reconnectOnClose = reconnectOnClose;
        this.pendingConnect = true;
        waitFor.then(() => this.connect());
    }

    get readyState(): number {
        return (
            this.websocketClient?.readyState ??
            ClientConnection.W3cWebSocket.CLOSED
        );
    }

    get connected(): boolean {
        return this.readyState === ClientConnection.W3cWebSocket.OPEN;
    }

    connect() {
        this.pendingConnect = false;
        if (this.websocketClient) {
            if (
                this.websocketClient.readyState ===
                    ClientConnection.W3cWebSocket.OPEN ||
                this.websocketClient.readyState ===
                    ClientConnection.W3cWebSocket.CONNECTING
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

    private onError(ev?: Event) {
        this.logger("WebSocket error:", ev);
        // console.log(`onErrorCb: ${this.onErrorCb}`);
        if (ev) {
            this.onErrorCb?.(ev);
        } else {
            this.onErrorCb?.(new Error("WebSocket error"));
        }
        this.onClosed();
    }

    private onClose(ev: CloseEvent) {
        this.logger(
            `WebSocket closed: code=${ev?.code}, reason=${ev?.reason}, wasClean=${ev?.wasClean}`,
        );
        this.onClosed();
    }

    private onClosed() {
        this.resetAbstractConnection();
        this.websocketClient = undefined;
        this.notify();
        if (this.reconnectOnClose) {
            if (this.pendingConnect) return;
            this.logger("will start reconnect in 1 second");
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
            //console.error(`got non-arraybuffer message: ${data}`);
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
