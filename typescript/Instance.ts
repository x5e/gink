import { createServer as createHttpServer, Server as HttpServer } from 'http';
import { createServer as createHttpsServer, Server as HttpsServer } from 'https';
import { readFileSync } from 'fs';
import { Server as StaticServer } from 'node-static';
import { now } from "./utils";
import { server as WebSocketServer, request as WebSocketRequest, connection as WebSocketConnection, Message } from 'websocket';

type FileName = string;
type NumberStr = string;

interface InstanceArgs {
    GINK_PORT?: NumberStr;
    GINK_SSL_KEY?: FileName;
    GINK_SSL_CERT?: FileName;
    GINK_LOG_FILE?: FileName;
    GINK_MEDALLION?: NumberStr;
    PWD: string;
}

class Instance {
    readonly port: NumberStr;
    #websocketServer: WebSocketServer;

    constructor(args: InstanceArgs) {
        const staticServer = new StaticServer(args["PWD"]);
        this.port = args["GINK_PORT"] || "8080";
        let httpServer: HttpServer | HttpsServer;
        if (args["GINK_SSL_KEY"] && args["GINK_SSL_CERT"]) {
            var options = {
                key: readFileSync(args["GINK_SSL_KEY"]),
                cert: readFileSync(args["GINK_SSL_CERT"]),
            };
            httpServer = createHttpsServer(options, function (request, response) {
                staticServer.serve(request, response);
            }).listen(this.port, () => console.log(
                `${now()} Secure server is listening on port ${this.port}`));
        } else {
            httpServer = createHttpServer(function (request, response) {
                staticServer.serve(request, response);
            });
            httpServer.listen(this.port, function () {
                console.log(`${now()} Insecure server is listening on port ${this.port}`);
            });
        }
        this.#websocketServer = new WebSocketServer({httpServer});
        this.#websocketServer.on('request', this.#onRequest.bind(this));
    }

    #onRequest(request: WebSocketRequest) {
        const connection = request.accept('gink', request.origin);
        console.log(`${now()} Connection accepted via port ${this.port}`);
        connection.on('message', onMessage);
        connection.on('close', function(reasonCode, description) {
            console.log((now()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
        });
    }
}