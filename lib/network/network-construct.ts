
import net from 'net';
import utp from 'utp-native';
import Nanoresource from 'nanoresource';
import Discovery from '@hyperswarm/discovery'
import Debug from 'debug';

import { NetworkConstructConfig, ErrorFunction, AnnounceConfig } from '../common/types';
import { backoff, listenTcpUdp, localIpAddress, noop } from "../common/utils";
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

    public attach(): Promise<any> {
        debug("attaching to ", this._config.port);
        return new Promise((res, rej) => {
            this.open((err: Error) => {
                if (err) return rej(err);
                return res();
            });
        });
    }

    public async connect(peer: any): Promise<net.Socket> {

        debug(`connecting to peer: ${peer.host}:${peer.port}`);

        return new Peer({
            peer: peer,
            connectionTimeout: 10000,
            cellNetworkResource: this
        }).connect();
    }

    public lookupOne(key: Buffer): Promise<any> {

        debug('performing lookupOne:', key);

        return new Promise((res, rej) => {
            if (!this._discovery)
                return rej('you need to attach to the network');

            if (key.length !== 32)
                return rej('Key should be a 32 byte buffer');

            const localAddress = this.getLocalAddress();

            this._discovery.lookupOne(key, { localAddress }, (err: Error, peer: any) => {
                debug('any lookup err?', err);
                if (err)
                    return rej("discovery error");
                return res(peer);
            });
        });
    }

    public lookup(key: Buffer, includeLength: boolean = false): Promise<any> {

        debug('performing lookup:', key);

        return new Promise((res, rej) => {
            if (!this._discovery)
                return rej('you need to attach to the network');

            if (key.length !== 32)
                return rej('Key should be a 32 byte buffer');

            const localAddress = this.getLocalAddress();

            let topic: any = this._discovery.lookup(key, { localAddress, includeLength });

            return res(topic);
        });
    }

    public announce(key: Buffer, config: AnnounceConfig = { lookup: false, includeLength: false, length, port: 0 }): Promise<any> {

        debug('performing announce:', key);

        return new Promise((res, rej) => {
            if (!this._discovery)
                return rej('you need to attach to the network');

            if (key.length !== 32)
                return rej('Key should be a 32 byte buffer');

            const localAddress = this.getLocalAddress();

            config = Object.assign(config,{
                port: config.port || (this.address as net.AddressInfo).port,
                localAddress: localAddress,
                includeLength: config.includeLength || false,
                length: config.length || 0
            })

            let topic: any = this._discovery.announce(key, config)
            
            return res(topic);
        });
    }


    private init(): void {
        debug("initialising TCP and UTP server ...");
        this._utpServer.on("connection", this.onConnection.bind(this, false))
        this._tcpServer.on("connection", this.onConnection.bind(this, true))
    }

    private onConnection(isTcp: Boolean, socket: net.Socket): void {
        if (isTcp)
            socket.setNoDelay(true);
        else
            socket.on("end", () => this.end())


        debug('onConnection -> adding socket');

        this._sockets.add(socket);

        socket.on("close", this.removeSocket.bind(this, socket));

        this._config.onSocket(socket, isTcp);
    }

    private removeSocket(socket: net.Socket): void {
        debug("removed socket");
        this._sockets.delete(socket);
    }

    private getLocalAddress(): { host: string, port: number } | undefined {
        if (!this._config.announce)
            return undefined;

        const ipAddress = localIpAddress();

        if (!ipAddress)
            return undefined;

        return {
            host: ipAddress,
            port: (this.address as net.AddressInfo).port
        }
    }

    private createDiscovery(): any {
        let { ephemeral, bootstrap } = this._config;

        debug('creating discovery channel...', ephemeral, bootstrap);

        return Discovery({
            bootstrap: bootstrap,
            ephemeral: ephemeral,
            socket: this._utpServer
        })
    }

    private _open(callback: ErrorFunction): void {

        debug("starting network attach runner...");

        let runner = (): Promise<void> => {
            return listenTcpUdp(this._tcpServer, this._utpServer, this._config.port as number).then(() => {

                this._discovery = this.createDiscovery();
                this._config.onBind();
                callback();
            });
        };

        backoff(5, runner, 500)
    }

    private _close(callback: ErrorFunction): void {

        let missing = 2

        let onClose = () => {
            if (--missing)
                return;

            this._discovery = undefined;
            this._config.onClose();

            callback();
        }

        let onDiscoveryClose = () => {

            this._sockets.forEach((socket) => socket.destroy())
            this._sockets.clear()

            this._tcpServer.close()
            this._utpServer.close()

            this._tcpServer.on('close', onClose)
            this._utpServer.on('close', onClose)

        }

        this._discovery.destroy()
        this._discovery.on('close', onDiscoveryClose)
    }
}