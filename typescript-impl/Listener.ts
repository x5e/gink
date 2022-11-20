import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import {
    server as WebSocketServer, request as WebSocketRequest,
} from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';

/**
 * Just a utility class to wrap websocket.server.
 */
export class Listener {

    ready: Promise<any>;
    private websocketServer: WebSocketServer;
    private httpServer: HttpServer | HttpsServer;

    constructor(args: {
        requestHandler: (request: WebSocketRequest)=>void,
        staticContentRoot?: DirPath,
        port?: NumberStr,
        logger?: CallBack,
        sslKeyFilePath?: FilePath,
        sslCertFilePath?: FilePath,
    }) {
        const staticServer = args.staticContentRoot ? new StaticServer(args.staticContentRoot): undefined;
        const port = args.port || "8080";
        let callWhenReady: CallBack;
        this.ready = new Promise((resolve) => {
            callWhenReady = resolve;
        });
        if (args.sslKeyFilePath && args.sslCertFilePath) {
            var options = {
                key: readFileSync(args.sslKeyFilePath),
                cert: readFileSync(args.sslCertFilePath),
            };
            this.httpServer = createHttpsServer(options, function (request, response) {
                staticServer?.serve(request, response);
            }).listen(port, () => {
                args?.logger(`Secure server is listening on port ${port}`);
                callWhenReady();
            });
        } else {
            this.httpServer = createHttpServer(function (request, response) {
                staticServer?.serve(request, response);
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