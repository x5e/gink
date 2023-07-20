import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import {
    server as WebSocketServer, request as WebSocketRequest,
} from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';
import { parse } from 'querystring';

/**
 * Just a utility class to wrap websocket.server.
 */
export class Listener {

    ready: Promise<any>;
    private websocketServer: WebSocketServer;
    readonly httpServer: HttpServer | HttpsServer;

    constructor(args: {
        requestHandler: (request: WebSocketRequest)=>void,
        staticContentRoot?: DirPath,
        port?: NumberStr,
        logger?: CallBack,
        sslKeyFilePath?: FilePath,
        sslCertFilePath?: FilePath,
    }) {
        const staticServer = args.staticContentRoot ? new StaticServer(args.staticContentRoot): new StaticServer("./static"); // not sure if this needs to be undefined, but changed for now
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
                const url = new URL(request.url, `https://${request.headers.host}`);
                if (url.pathname == "/list_connections") {
                    staticServer?.serveFile("./list_connections.html", 200, {}, request, response);
                }
                else if (url.pathname == "/create_connection" && request.method == 'POST') {
                    let formData = "";
                    request.on('data', (chunk) => {
                        formData += chunk;
                    });

                    request.on('end', () => {
                        const parsedFormData = parse(formData);
                        const ipAddress = parsedFormData.address;

                        console.log("Received form data:", ipAddress); //create connection here

                        response.writeHead(301, { 'Content-Type': 'text/plain' });
                        response.end('Connection created successfully!');
                    });
                }
                else {
                    staticServer?.serve(request, response);
                }
            }).listen(port, () => {
                args?.logger(`Secure server is listening on port ${port}`);
                callWhenReady();
            });
        } else {
            this.httpServer = createHttpServer(function (request, response) {
                const url = new URL(request.url, `http://${request.headers.host}`);
                if (url.pathname == "/list_connections") {
                    staticServer?.serve(request, response);
                }
                else if (url.pathname == "/create_connection" && request.method == 'POST') {
                    let formData = "";
                    request.on('data', (chunk) => {
                        formData += chunk;
                    });

                    request.on('end', () => {
                        const parsedFormData = parse(formData);
                        const ipAddress = parsedFormData.address;

                        console.log("Received form data:", ipAddress); //create connection here

                        response.writeHead(301, { 'Content-Type': 'text/plain' });
                        response.end('Connection created successfully!');
                    });
                }
                else {
                    staticServer?.serve(request, response);
                }
            });
            this.httpServer.listen(port, function () {
                args?.logger(`Insecure server is listening on port ${port}`);
                callWhenReady();
            });
        }
        this.websocketServer = new WebSocketServer({ httpServer: this.httpServer });
        this.websocketServer.on('request', args.requestHandler);
    }
}
