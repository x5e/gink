import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import {
    server as WebSocketServer, request as WebSocketRequest,
} from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';
import { SimpleServer } from './SimpleServer';

/**
 * Just a utility class to wrap websocket.server.
 */
export class Listener {

    ready: Promise<any>;
    private websocketServer: WebSocketServer;
    readonly httpServer: HttpServer | HttpsServer;

    constructor(args: {
        requestHandler: (request: WebSocketRequest) => void,
        instance?: SimpleServer,
        staticContentRoot?: DirPath,
        port?: NumberStr,
        logger?: CallBack,
        sslKeyFilePath?: FilePath,
        sslCertFilePath?: FilePath,
    }) {
        const thisListener = this;
        const staticServer = args.staticContentRoot ? new StaticServer(args.staticContentRoot) : new StaticServer("./static");
        const port = args.port || "8080";
        let callWhenReady: CallBack;
        this.ready = new Promise((resolve) => {
            callWhenReady = resolve;
        });
        if (args.sslKeyFilePath && args.sslCertFilePath) {
            const options = {
                key: readFileSync(args.sslKeyFilePath),
                cert: readFileSync(args.sslCertFilePath),
            };
            this.httpServer = createHttpsServer(options, function (request, response) {
                const url = new URL(request.url, `http://${request.headers.host}`);
                if (url.pathname == "/") {
                    request.addListener('end', function () {
                        staticServer.serveFile("./connections.html", 200, {}, request, response);
                    }).resume();
                }
                else if (url.pathname == "/list_connections") {
                    request.addListener('end', function () {
                        let connections = Object.fromEntries(args.instance.connections);
                        response.end(JSON.stringify(connections));
                    }).resume();
                }
                else if (url.pathname == "/create_connection") {
                    request.addListener('end', function () {
                        if (request.method == 'POST') {
                            const ipAddress = url.searchParams.get("ipAddress");
                            thisListener.handleConnection(ipAddress, args.instance, args.logger);
                            response.end(JSON.stringify({ "status": 201, "message": "Connection created successfully" }));
                        }
                        else {
                            response.end(JSON.stringify({ "status": 405, "message": "Bad Method." }))
                        }
                    }).resume();
                }
            }).listen(port, () => {
                args?.logger(`Secure server is listening on port ${port}`);
                callWhenReady();
            });
        } else {
            this.httpServer = createHttpServer(function (request, response) {
                const url = new URL(request.url, `http://${request.headers.host}`);
                request.addListener('end', async function () {
                    if (url.pathname == "/list_connections") {
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
                logger("Needs to be a valid websocket connection.")
            } else {
                logger("Connecting to " + ipAddress);
                await instance.connectTo(ipAddress);
                return true;
            }
        } else if (!instance) {
            logger("No instance provided.")
        }
        return false;
    }
}
