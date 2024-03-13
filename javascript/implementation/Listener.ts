import { createServer as createHttpServer, Server as HttpServer, ServerResponse, IncomingMessage } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync, createReadStream, existsSync } from 'fs';
import {
    server as WebSocketServer, request as WebSocketRequest,
} from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';
import { SimpleServer } from './SimpleServer';
import { join } from 'path';

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
        sslCertFilePath?: FilePath;
    }) {
        const staticContentRoot = args.staticContentRoot ?? join(__dirname, "../../content_root");
        const thisListener = this;
        const port = args.port || "8080";
        let callWhenReady: CallBack;
        this.ready = new Promise((resolve) => {
            callWhenReady = resolve;
        });

        const serveFile = (filePath: FilePath, statusCode: number, response: ServerResponse) => {
            const readStream = createReadStream(join(staticContentRoot, filePath));
            let contentType;
            if (filePath.endsWith(".js"))
                contentType = "text/javascript";
            else if (filePath.endsWith(".html"))
                contentType = "text/html";
            else if (filePath.endsWith(".css"))
                contentType = "text/css";
            response.writeHead(statusCode, { 'Content-type': contentType });
            readStream.pipe(response);
        };

        const requestListener = (request: IncomingMessage, response: ServerResponse) => {
            const url = new URL(request.url, `http://${request.headers.host}`);
            request.addListener('end', async function () {
                if (url.pathname == "/") {
                    serveFile('/static/dashboard/dashboard.html', 200, response);
                }
                else if (url.pathname == "/connections") {
                    serveFile("/static/list_connections.html", 200, response);
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
                    if (existsSync(join(staticContentRoot, url.pathname))) {
                        serveFile(url.pathname, 200, response);
                    }
                    else {
                        response.end(JSON.stringify({ "status": 401, "message": "File not found" }));
                    }
                }
            }).resume();
        };

        if (args.sslKeyFilePath && args.sslCertFilePath) {
            const options = {
                key: readFileSync(args.sslKeyFilePath),
                cert: readFileSync(args.sslCertFilePath),
            };
            this.httpServer = createHttpsServer(options, requestListener).listen(port, () => {
                args?.logger(`Secure server is listening on port ${port}`);
                callWhenReady();
            });
        } else {
            this.httpServer = createHttpServer(requestListener).listen(port, function () {
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
