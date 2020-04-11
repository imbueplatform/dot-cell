
import net from 'net';
import utp from 'utp-native';
import Nanoresource from 'nanoresource';
import Discovery from '@hyperswarm/discovery'

import { pause, backoff, listen, listenTcpUdp, localIpAddress, noop } from "../common/utils";

export interface OnSocket {
    (socket: net.Socket, isTcp: Boolean): void
}

export interface OnBind {
    (): void;
}

export interface NetworkConstructConfig {
    port?: Number,
    broadcastLocalAddress?: Boolean,
    ephemeral?: Boolean,
    bootstrap?: string[],
    onSocket: OnSocket,
    onBind: OnBind
}

/**
 * NetworkConstruct class
 */
export class NetworkConstruct extends Nanoresource {

    private _config: NetworkConstructConfig;
    private _tcpServer: net.Server;
    private _utpServer: any;
    private _sockets: Set<net.Socket> = new Set();
    private _discovery: any;

    constructor(config: NetworkConstructConfig) {
        super();

        this._config = Object.assign({
            onBind: config.onBind || noop,
            onSocket: config.onSocket || noop
        }, config);

        this._tcpServer = net.createServer();
        this._utpServer = utp();

        /** Initialize */
        this.init();
    }

    private init(): void {
        
        this._tcpServer.on("connection", this.onConnection.bind(this, true))
    }

    private onConnection(isTcp: Boolean, socket: net.Socket): void {
        if(isTcp)
            socket.setNoDelay(true);
        else
            socket.on("end", () => this.end())
            
        this._sockets.add(socket);
        
        socket.on("close", this.removeSocket.bind(this, socket));

        this._config.onSocket(socket, isTcp);
    }

    private onProtocolError(err: Error): void {
        if(this.destroyed === false) this.destroy(err);
    }

    private removeSocket(socket: net.Socket): void {
        this._sockets.delete(socket);
    }

    public get address(): net.AddressInfo | string | null {
        return this._tcpServer.address();
    }

    public attach(): void {
        return this.open(this._config.port || 0);
    }

    private _open(): void {

        let runner = (): Promise<void> => {
            return listenTcpUdp(this._tcpServer, this._utpServer, this._config.port as number).then(() => {
                this._discovery = this.createDiscovery();
                this._config.onBind();
            });
        };

        backoff(5, runner, 500)
    }

    private createDiscovery(): any {
        let { ephemeral, bootstrap } = this._config;
        return Discovery({
            bootstrap,
            ephemeral,
            socket: this._utpServer
        })
    }
}