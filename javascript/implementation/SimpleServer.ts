import {
    request as WebSocketRequest,
    connection as WebSocketConnection, Message as WebSocketMessage
} from 'websocket';
import { GinkInstance } from "./GinkInstance";
import { Peer } from './Peer';
import { Buffer } from "buffer";
import { Store, } from "./Store";
import { CallBack, NumberStr, FilePath, DirPath, AuthFunction } from "./typedefs";
import { Listener } from "./Listener";
import { decodeFromHex, parseOAuthCreds } from './utils';
import { OAuth2Client, } from 'google-auth-library';

/**
 * A server that connects all inbound websocket connections to a single database instance.
 */
export class SimpleServer extends GinkInstance {

    private listener: Listener;
    readonly authFunc: AuthFunction;
    readonly oAuthFunc: (code: string) => Promise<boolean>;
    private oAuth2Client: OAuth2Client;
    public connections: Map<number, WebSocketConnection>;

    constructor(store: Store, args: {
        port?: NumberStr;
        sslKeyFilePath?: FilePath;
        sslCertFilePath?: FilePath;
        staticContentRoot?: DirPath;
        logger?: CallBack;
        software?: string;
        authFunc?: AuthFunction;
        useOAuth?: boolean;
    }) {
        super(store, { software: args.software || "SimpleServer" }, args.logger || (() => null));
        this.listener = new Listener({
            requestHandler: this.onRequest.bind(this),
            instance: this,
            ...args
        });
        this.connections = new Map();
        this.authFunc = args.authFunc || (() => true);

        this.oAuthFunc = (() => Promise.resolve(true));
        if (args.useOAuth) {
            const oAuthCredentials = parseOAuthCreds();
            // Set up Google OAuth client
            this.oAuth2Client = new OAuth2Client(
                oAuthCredentials.client_id,
                oAuthCredentials.client_secret,
                "http://localhost:8080/oauth2callback",
            );

            this.oAuthFunc = async (code: string): Promise<boolean> => {
                if (!code) return false;
                const { tokens } = await this.oAuth2Client.getToken(decodeURIComponent(code));
                const userInfo = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString());
                if (!oAuthCredentials.authorized_emails.includes(userInfo.email)) {
                    return false;
                }
                this.oAuth2Client.setCredentials(tokens);
                return true;
            };
        }

        this.ready = Promise.all([this.ready, this.listener.ready]).then(() => args.logger(`SimpleServer.ready`));
    }

    private async onRequest(request: WebSocketRequest) {
        await this.ready;
        const thisServer = this; // pass into closures
        let protocol: string | null = null;
        let token: string | null = null;
        let code: string | null = null;
        if (request.requestedProtocols.length) {
            for (const subprotocol of request.requestedProtocols) {
                if (subprotocol.match(/0x.*/)) {
                    let decoded = decodeFromHex(subprotocol);
                    if (decoded.includes("token ")) {
                        token = decodeFromHex(subprotocol);
                    }
                    else if (decoded.includes("oauth ")) {
                        code = decodeFromHex(subprotocol).split("oauth ")[1];
                    }
                }
            }

            if (request.requestedProtocols.includes(GinkInstance.PROTOCOL))
                protocol = GinkInstance.PROTOCOL;
            else
                return request.reject(400, "bad protocol");
        }

        if (!this.authFunc(token)) {
            return request.reject(401, "authentication failed");
        }
        if (!(await this.oAuthFunc(code))) {
            return request.reject(401, "authentication failed");
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
            this.receiveMessage(webSocketMessage.binaryData, connectionId).catch(
                (reason) => this.logger(reason)
            );
        }
    }
}
