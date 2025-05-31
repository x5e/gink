import {
    request as WebSocketRequest,
    connection as WebSocketConnection,
} from "websocket";
import { Database } from "./Database";
import { Store } from "./Store";
import {
    CallBack,
    NumberStr,
    FilePath,
    DirPath,
    AuthFunction,
    PROTOCOL,
} from "./typedefs";
import { Listener } from "./Listener";
import { decodeToken } from "./utils";
import { ServerResponse, IncomingMessage } from "http";
import { ServerConnection } from "./ServerConnection";

/**
 * A server that connects all inbound websocket connections to a single database instance.
 */
export class SimpleServer extends Database {
    private listener: Listener;
    readonly authFunc: AuthFunction;

    constructor(args?: {
        store?: Store;
        port?: NumberStr;
        sslKeyFilePath?: FilePath;
        sslCertFilePath?: FilePath;
        staticContentRoot?: DirPath;
        logger?: CallBack;
        identity?: string;
        authFunc?: AuthFunction;
    }) {
        super(args);
        this.listener = new Listener({
            requestHandler: this.onRequest.bind(this),
            requestListener: this.requestListener.bind(this),
            index: "/static/dashboard/dashboard.html",
            ...args,
        });

        this.authFunc = args.authFunc || (() => true);
        this.ready = Promise.all([this.ready, this.listener.ready]).then(() =>
            args.logger(`SimpleServer.ready`),
        );
    }

    private async onRequest(request: WebSocketRequest) {
        await this.ready;
        let protocol: string | null = null;
        let token: string | null = null;
        if (request.requestedProtocols.length) {
            for (const protocol of request.requestedProtocols) {
                if (protocol.match(/0x.*/)) {
                    token = decodeToken(protocol);
                }
            }
            if (request.requestedProtocols.includes(PROTOCOL))
                protocol = PROTOCOL;
            else return request.reject(400, "bad protocol");
        }

        if (!this.authFunc(token)) {
            return request.reject(401, "authentication failed");
        }
        const websocketConnection: WebSocketConnection = request.accept(
            protocol,
            request.origin,
        );
        this.logger(`Connection accepted from ${request.remoteAddress}`);
        const connection = new ServerConnection({
            onClose: () => {
                this.connections.delete(connectionId);
                this.logger(`connection ${connectionId} closed`);
            },
            onData: (data) => this.receiveMessage(data, connectionId),
            websocketConnection,
        });
        const connectionId = this.createConnectionId();
        this.connections.set(connectionId, connection);
        connection.send(this.iHave.getGreetingMessageBytes());
        connection.markHasSentGreeting();
    }

    private requestListener(
        request: IncomingMessage,
        response: ServerResponse,
    ) {
        if (request.url.startsWith("/api/connections")) {
            if (request.method === "GET") {
                let connections = Object.fromEntries(this.connections);
                response.end(JSON.stringify(connections));
            }
            if (request.method === "POST") {
                request.addListener("data", async (chunk) => {
                    response.statusCode = 400;
                    response.end(JSON.stringify(chunk));
                });
            }
        } else {
            this.listener.requestListener(request, response);
        }
    }
}
