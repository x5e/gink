
import {
    request as WebSocketRequest,
    connection as WebSocketConnection
} from 'websocket';
import { AuthFunction, CallBack, DirPath, NumberStr, FilePath } from "./typedefs";
import { GinkInstance } from "./GinkInstance";
import { RoutingServerInstance } from './RoutingServerInstance';
import { ensure, decodeToken, isPathDangerous } from './utils';
import { existsSync } from 'fs';
import { join } from "path";
import { Listener } from './Listener';

/**
 * A class that listens on a port, and then serves either static content over HTTP(S)
 * or opens websocket connections and hands it off to the appropriate RoutingServerInstance.
 *
 * The user passes in a dataFilesRoot, which should be a writable directory on the local system.
 * The RoutingServer will create a RoutingServerInstance for each file/requested resource.
 */
export class RoutingServer {
    ready: Promise<void>;
    readonly logger: CallBack;
    readonly dataFilesRoot: DirPath | null;
    readonly authFunc: AuthFunction;
    private listener: Listener;

    private instances: Map<string, RoutingServerInstance> = new Map();

    constructor(args: {
        dataFilesRoot: DirPath,
        port?: NumberStr;
        sslKeyFilePath?: FilePath;
        sslCertFilePath?: FilePath;
        staticContentRoot?: DirPath;
        logger?: CallBack;
        authFunc?: AuthFunction;
    }) {
        const logger = this.logger = args.logger || (() => null);
        this.authFunc = args.authFunc || (() => true);
        this.dataFilesRoot = args.dataFilesRoot;
        ensure(existsSync(this.dataFilesRoot), "data root not there");
        this.listener = new Listener({
            requestHandler: this.onRequest.bind(this), logger,
            ...args
        });
        this.ready = this.listener.ready.then(() => logger(`RoutingServer ready`));
    }

    /**
     *
     * @param path absolute path to the datafile
     * @returns a promise of an instance that will manage that file
     */
    private getInstance(path?: string): RoutingServerInstance {
        // Note: can't afford to await for the instance to be ready, or you'll miss the greeting.
        let instance = this.instances.get(path);
        if (!instance) {
            instance = new RoutingServerInstance(path, this.logger);
            this.instances.set(path, instance);
        }
        return instance;
    }

    /**
     * Decides whether to accept the request, and if it does, hands it off
     * to a database instance to manage that connection to the specified resource.
     * @param request contains information passed from the websocket server
     */
    private async onRequest(request: WebSocketRequest) {
        let protocol: string | null = null;
        let token: string | null = null;
        if (request.requestedProtocols.length) {
            for (const protocol of request.requestedProtocols) {
                if (protocol.match(/0x.*/)) {
                    token = decodeToken(protocol).split("token ")[1];
                }
            }

            if (request.requestedProtocols.includes(GinkInstance.PROTOCOL))
                protocol = GinkInstance.PROTOCOL;
            else
                return request.reject(400, "bad protocol");
        }

        if (isPathDangerous(request.resource))
            return request.reject(400, "bad path");

        if (!this.authFunc(token)) {
            return request.reject(401, "authentication failed");
        }
        const connection: WebSocketConnection = request.accept(protocol, request.origin);
        const instanceKey = join(this.dataFilesRoot, request.resource);
        const instance = this.getInstance(instanceKey);
        await instance.onConnection(connection);
    }
}
