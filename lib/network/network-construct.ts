
import net from 'net';
import utp from 'utp-native';
import Nanoresource from 'nanoresource';
import Discovery from '@hyperswarm/discovery'
import Debug from 'debug';

import { NetworkConstructConfig, PeerConfig } from '../common/types';
import { pause, backoff, listen, listenTcpUdp, localIpAddress, noop } from "../common/utils";
import { Peer } from './peer';

const debug = Debug("imbue:cell:network");


/**
 * NetworkConstruct class
 */
export class CellNetworkResource extends Nanoresource {

    private _config: NetworkConstructConfig;
    private _tcpServer: net.Server;
    private _utpServer: any;
    private _sockets: Set<net.Socket> = new Set();
    private _discovery: any;
    private _peer: Peer | undefined;

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

    public get address(): net.AddressInfo | string | null {
        return this._tcpServer.address();
    }

    public get discovery(): any {
        return this._discovery;
    }

    public get tcp(): net.Server {
        return this._tcpServer;
    }

    public get utp(): any {
        return this._utpServer;
    }

    public get sockets(): Set<net.Socket> {
        return this._sockets;
    }

    public attach(): void {
        debug("attaching to %0", this._config.port);
        return this.open(this._config.port || 0);
    }

    public async connect(peer: any): Promise<net.Socket> {
        return new Peer({
            peer: peer,
            connectionTimeout: 10000,
            cellNetworkResource: this
        }).connect();
    }

    public lookupOne(key: Buffer): Promise<any> {
        return new Promise((res, rej) => {
            if(key.length !== 32)
                return rej('Key should be a 32 byte buffer');
            
            const localAddress = this.getLocalAddress();

            debug('got local address: %0', localAddress)

            this._discovery.lookupOne(key, { localAddress }, (err: Error, peer: any) => {
                if(err)
                    return rej("discovery error");
                return res(peer);
            });
        });
    }

    private init(): void {
        debug("initialising TCP and UTP server ...");
        this._utpServer.on("connection", this.onConnection.bind(this, false))
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

    private removeSocket(socket: net.Socket): void {
        debug("removing socket %0", socket);
        this._sockets.delete(socket);
    }

    private getLocalAddress(): { host: string, port: number } | undefined {
        if(!this._config.announce)
            return undefined;

        const ipAddress = localIpAddress();

        if(!ipAddress) 
            return undefined;

        return {
            host: ipAddress,
            port: (this._tcpServer.address() as net.AddressInfo).port
        }
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