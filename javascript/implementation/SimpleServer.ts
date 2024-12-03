import {
    request as WebSocketRequest,
    connection as WebSocketConnection,
    Message as WebSocketMessage,
} from "websocket";
import { Database } from "./Database";
import { Peer } from "./Peer";
import { Buffer } from "buffer";
import { Store } from "./Store";
import {
    CallBack,
    NumberStr,
    FilePath,
    DirPath,
    AuthFunction,
} from "./typedefs";
import { Listener } from "./Listener";
import { decodeToken } from "./utils";
import { ServerResponse, IncomingMessage } from "http";

/**
 * A server that connects all inbound websocket connections to a single database instance.
 */
export class SimpleServer extends Database {
    private listener: Listener;
    readonly authFunc: AuthFunction;
    public connections: Map<number, WebSocketConnection>;

    constructor(
        args?: {
            store?: Store,
            port?: NumberStr;
            sslKeyFilePath?: FilePath;
            sslCertFilePath?: FilePath;
            staticContentRoot?: DirPath;
            logger?: CallBack;
            identity?: string;
            authFunc?: AuthFunction;
        }
    ) {
        super(args);
        this.listener = new Listener({
            requestHandler: this.onRequest.bind(this),
            requestListener: this.requestListener.bind(this),
            index: "/static/dashboard/dashboard.html",
            ...args,
        });

        this.connections = new Map();
        this.authFunc = args.authFunc || (() => true);
        this.ready = Promise.all([this.ready, this.listener.ready]).then(() =>
            args.logger(`SimpleServer.ready`)
        );
    }

    private async onRequest(request: WebSocketRequest) {
        await this.ready;
        const thisServer = this; // pass into closures
        let protocol: string | null = null;
        let token: string | null = null;
        if (request.requestedProtocols.length) {
            for (const protocol of request.requestedProtocols) {
                if (protocol.match(/0x.*/)) {
                    token = decodeToken(protocol);
                }
            }
            if (request.requestedProtocols.includes(Database.PROTOCOL))
                protocol = Database.PROTOCOL;
            else return request.reject(400, "bad protocol");
        }

        if (!this.authFunc(token)) {
            return request.reject(401, "authentication failed");
        }

        const connection: WebSocketConnection = request.accept(
            protocol,
            request.origin
        );
        this.logger(`Connection accepted.`);
        const sendFunc = (data: Uint8Array) => {
            connection.sendBytes(Buffer.from(data));
        };
        const closeFunc = () => {
            connection.close();
        };
        const connectionId = this.createConnectionId();
        this.connections.set(connectionId, connection);
        const peer = new Peer(sendFunc, closeFunc);
        this.peers.set(connectionId, peer);
        connection.on("close", function (_reasonCode, _description) {
            thisServer.peers.delete(connectionId);
            thisServer.connections.delete(connectionId);
            thisServer.logger(
                " Peer " + connection.remoteAddress + " disconnected."
            );
        });
        connection.on("message", this.onMessage.bind(this, connectionId));
        sendFunc(this.iHave.getGreetingMessageBytes());
    }

    private onMessage(
        connectionId: number,
        webSocketMessage: WebSocketMessage
    ) {
        if (webSocketMessage.type === "utf8") {
            this.logger("Received Text Message: " + webSocketMessage.utf8Data);
        } else if (webSocketMessage.type === "binary") {
            this.logger(
                "Server received binary message of " +
                    webSocketMessage.binaryData.length +
                    " bytes."
            );
            this.receiveMessage(
                webSocketMessage.binaryData,
                connectionId
            ).catch((reason) => this.logger(reason));
        }
    }

    private requestListener(
        request: IncomingMessage,
        response: ServerResponse
    ) {
        const connectTo = this.connectTo.bind(this);
        if (request.url.startsWith("/api/connections")) {
            if (request.method === "GET") {
                let connections = Object.fromEntries(this.connections);
                response.end(JSON.stringify(connections));
            }
            if (request.method === "POST") {
                request.addListener("data", async function (chunk) {
                    await connectTo(chunk);
                });
            }
        } else {
            this.listener.requestListener(request, response);
        }
    }
}
