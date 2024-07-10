import { createServer as createHttpServer, Server as HttpServer, ServerResponse, IncomingMessage } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { server as WebSocketServer, request as WebSocketRequest, } from 'websocket';
import { NumberStr, DirPath, CallBack, FilePath } from './typedefs';
import { createReadStream, existsSync } from 'fs';
import { getType } from './utils';
import { join, extname } from 'path';


/**
 * Just a utility class to wrap websocket.server.
 */
export class Listener {
    ready: Promise<any>;
    private websocketServer: WebSocketServer;
    readonly httpServer: HttpServer | HttpsServer;
    readonly staticContentRoot?: string;
    readonly index?: string;

    constructor(args: {
        requestHandler: (request: WebSocketRequest) => void,
        requestListener?: (request: IncomingMessage, response: ServerResponse) => void,
        staticContentRoot?: DirPath,
        port?: NumberStr,
        logger?: CallBack,
        sslKeyFilePath?: FilePath,
        sslCertFilePath?: FilePath,
        index?: string,
    }) {
        this.staticContentRoot = args.staticContentRoot ?? join(__dirname, "../../content_root");
        const requestListener = args.requestListener || this.requestListener.bind(this);
        const port = args.port || "8080";
        let callWhenReady: CallBack;
        this.index = args.index;
        this.ready = new Promise((resolve) => {
            callWhenReady = resolve;
        });

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

    public requestListener(request: IncomingMessage, response: ServerResponse) {
        const url = new URL(request.url, `http://${request.headers.host}`);
        const requestedPath = url.pathname == "/" ? this.index : url.pathname;
        const localPath = join(this.staticContentRoot, requestedPath);
        if (existsSync(localPath)) {
            const readStream = createReadStream(localPath);
            const extension = extname(localPath).slice(1);
            response.writeHead(200, { 'Content-type': getType(extension) });
            readStream.pipe(response);
        }
        else {
            response.writeHead(404, "Not Found");
            response.end("not found");
        }
    };


}
