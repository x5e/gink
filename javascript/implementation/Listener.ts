import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import {
    server as WebSocketServer, request as WebSocketRequest,
} from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';
import { SimpleServer } from './SimpleServer';
import { OAuth2Client } from 'google-auth-library';

/**
 * Just a utility class to wrap websocket.server.
 */
export class Listener {
    ready: Promise<any>;
    private websocketServer: WebSocketServer;
    readonly httpServer: HttpServer | HttpsServer;

    private oAuth2Client: OAuth2Client;

    constructor(args: {
        requestHandler: (request: WebSocketRequest) => void,
        instance?: SimpleServer,
        staticContentRoot?: DirPath,
        port?: NumberStr,
        logger?: CallBack,
        sslKeyFilePath?: FilePath,
        sslCertFilePath?: FilePath,
        useOAuth?: boolean;
    }) {
        const thisListener = this;
        const staticServer = args.staticContentRoot ? new StaticServer(args.staticContentRoot) : new StaticServer("./static");
        const port = args.port || "8080";
        let callWhenReady: CallBack;
        this.ready = new Promise((resolve) => {
            callWhenReady = resolve;
        });

        if (args.useOAuth) {
            // Set up Google OAuth client
            const oAuthClientID = process.env["OAUTH_CLIENT_ID"];
            const oAuthClientSecret = process.env["OAUTH_CLIENT_SECRET"];

            // Don't need scopes until a request is made, but it's better to throw the error up front
            if (!process.env["OAUTH_SCOPES"]) throw new Error("Need to provide OAuth scopes (separated by a ',') in env variable OAUTH_SCOPES");
            if (!oAuthClientID) throw new Error("Provide Google Client ID in env OAUTH_CLIENT_ID to use OAuth");
            if (!oAuthClientSecret) throw new Error("Provide Google Client Secret in env OAUTH_CLIENT_SECRET to use OAuth");

            this.oAuth2Client = new OAuth2Client(
                oAuthClientID,
                oAuthClientSecret,
                "http://localhost:8080/oauth2callback",
            );
        }

        if (args.sslKeyFilePath && args.sslCertFilePath) {
            const options = {
                key: readFileSync(args.sslKeyFilePath),
                cert: readFileSync(args.sslCertFilePath),
            };
            this.httpServer = createHttpsServer(options, function (request, response) {
                const url = new URL(request.url, `http://${request.headers.host}`);
                request.addListener('end', function () {
                    if (url.pathname == "/") {
                        staticServer.serveFile('dashboard/dashboard.html', 200, {}, request, response);
                    }
                    else if (url.pathname == "/connections") {
                        staticServer.serveFile("/list_connections.html", 200, {}, request, response);
                    }
                    else if (url.pathname == "/list_connections") {
                        let connections = Object.fromEntries(args.instance.connections);
                        response.end(JSON.stringify(connections));
                    }
                    else if (url.pathname == "/create_connection") {
                        if (request.method == 'POST') {
                            const ipAddress = url.searchParams.get("ipAddress");
                            thisListener.handleConnection(ipAddress, args.instance, args.logger);
                            response.end(JSON.stringify({ "status": 201, "message": "Connection created successfully" }));
                        }
                        else {
                            response.end(JSON.stringify({ "status": 405, "message": "Bad Method." }));
                        }
                    }
                    else {
                        staticServer.serve(request, response);
                    }
                }).resume();
            }).listen(port, () => {
                args?.logger(`Secure server is listening on port ${port}`);
                callWhenReady();
            });
        } else {
            this.httpServer = createHttpServer(function (request, response) {
                const url = new URL(request.url, `http://${request.headers.host}`);
                request.addListener('end', async function () {
                    if (args.useOAuth) {
                        // This is where Google redirects to after the user gives permissions
                        if (url.pathname == "/oauth2callback") {
                            const code = url.searchParams.get("code");
                            const { tokens } = await thisListener.oAuth2Client.getToken(code);
                            thisListener.oAuth2Client.setCredentials(tokens);

                            response.writeHead(302, {
                                Location: "http://localhost:8080/"
                            });
                            response.end();
                            return;
                        }

                        // no access token, need to authorize
                        if (!thisListener.oAuth2Client.credentials.access_token) {
                            const scopesStr: string = process.env["OAUTH_SCOPES"];
                            const oAuthScopes = scopesStr.split(",");
                            response.writeHead(302, {
                                Location: thisListener.oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: oAuthScopes })
                            });
                            response.end();
                            return;
                        }
                    }

                    if (url.pathname == "/") {
                        staticServer.serveFile('dashboard/dashboard.html', 200, {}, request, response);
                    }
                    else if (url.pathname == "/connections") {
                        staticServer.serveFile("/list_connections.html", 200, {}, request, response);
                    }
                    else if (url.pathname == "/list_connections") {
                        let connections = Object.fromEntries(args.instance.connections);
                        response.writeHead(200);
                        response.end(JSON.stringify(connections));
                    }
                    else if (url.pathname == "/create_connection") {
                        if (request.method == 'POST') {
                            const ipAddress = url.searchParams.get("ipAddress");
                            const created = await thisListener.handleConnection(ipAddress, args.instance, args.logger);
                            if (created) {
                                response.writeHead(201);
                                response.end(JSON.stringify({ "status": 201, "message": "Connection created successfully" }));
                            }
                            else {
                                response.writeHead(400);
                                response.end(JSON.stringify({ "status": 400, "message": "Error. Connection not created." }));
                            }
                        }
                        else {
                            response.writeHead(405);
                            response.end(JSON.stringify({ "status": 405, "message": "Bad Method." }));
                        }
                    }
                    else {
                        staticServer.serve(request, response);
                    }
                }).resume();
            });
            this.httpServer.listen(port, function () {
                args?.logger(`Insecure server is listening on port ${port}`);
                callWhenReady();
            });
        }
        this.websocketServer = new WebSocketServer({ httpServer: this.httpServer });
        this.websocketServer.on('request', args.requestHandler);
    }

    async handleConnection(ipAddress: string, instance?: SimpleServer, logger?: CallBack): Promise<boolean> {
        if (instance) {
            // this will obviously change eventually, but adding some validation for now
            const validURL = /^ws:\/\/\d{3}.\d{1}.\d{1}.\d{1}:\d{4}/;
            if (!validURL.test(ipAddress)) {
                logger("Needs to be a valid websocket connection.");
            } else {
                logger("Connecting to " + ipAddress);
                await instance.connectTo(ipAddress);
                return true;
            }
        } else if (!instance) {
            logger("No instance provided.");
        }
        return false;
    }
}
