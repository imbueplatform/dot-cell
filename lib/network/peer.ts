
import net from 'net';
import Debug from 'debug';

import { PeerConfig, SocketCallback } from '../common/types';

const debug = Debug("imbue:cell:peer");

export class Peer {
    
    private _config: PeerConfig;
    private _peerSocket: net.Socket | undefined = undefined;

    private _timedOut: boolean = false;
    private _connected: boolean = false;
    private _closes: number = 1;
    private _activeSockets: net.Socket[] = [];
    private _timeout: NodeJS.Timeout | undefined;

    constructor(config: PeerConfig) {
        this._config = config;
    }

    public connect(): Promise<net.Socket> {

        let { host, port } = this._config.peer;

        debug(`connecting to ${host}:${port} via tcp`);

        return new Promise((res, rej) => {

            this._peerSocket = net.connect(port, host);
            this._activeSockets.push(this._peerSocket);
    
            this.setupSocket((err, socket) => {
                if(err) return rej(err);
                return res(socket);
            });

        });
    }

    private setupSocket(callback: SocketCallback): void {
        
        let onSocketTimeout = (socket: net.Socket) => {
            debug(`socket timedout:`, socket.address());
            this.destroyDeadSockets(true);
            callback(new Error(`socket timedout: ${socket.address()}`));
        }

        let onError = (err?: Error) => {
            if(!--this._closes && !this._connected && !this._timedOut)
            {
                clearTimeout(this._timeout as NodeJS.Timeout);
                callback(err || new Error("Sockets failed"));
            }
        }

        let onProtocolError = (err: Error, socket: net.Socket) => {
            if(socket.destroyed === false) socket.destroy(err); 
        }

        let onHolePunch = (err: Error) => {
            if(this._connected && this._timedOut) return;
            if(err) return onError(err);

            let { host, port } = this._config.peer;

            debug(`connecting to ${host}:${port} via utp`);

            let utp = this._config.cellNetworkResource.utp.connect(port, host);

            utp.on("error", () => (err: Error) => onProtocolError(err, utp));
            utp.on("connect", () => onConnect(utp));
            utp.on("close", () => onClose(utp));

            this._activeSockets.push(utp)
        }

        let onOpen = (err: Error) => {
            if(err) return onError(err);
            debug(`holepunching`);
            this._config.cellNetworkResource.discovery.holepunch(this._config.peer, onHolePunch)
        }

        let onClose = (socket: net.Socket) => {
            debug(`removing socket`);
            this._config.cellNetworkResource.sockets.delete(socket)
            onError(undefined);
        }

        let onConnect = (socket: net.Socket) => {
            if(this._connected && this._timedOut) 
                return socket.destroy();

            this.destroyDeadSockets();

            clearTimeout(this._timeout as NodeJS.Timeout);

            debug(`connected to: `, socket.address());

            this._connected = true;
            this._config.cellNetworkResource.sockets.add(socket);
        }
        
        this._timeout = setTimeout(() => onSocketTimeout(this._peerSocket as net.Socket), this._config.connectionTimeout);

        this._peerSocket?.setNoDelay(true);

        this._peerSocket?.on("error", (err: Error) => onProtocolError(err, this._peerSocket as net.Socket));
        this._peerSocket?.on("connect", () => onConnect(this._peerSocket as net.Socket));
        this._peerSocket?.on("close", () => onClose(this._peerSocket as net.Socket));

        if(!this._config.peer.referer) 
            return;

        this._closes++;
        this._config.cellNetworkResource.open(onOpen);
    }

    private destroyDeadSockets(destroyAllSockets: boolean = false): void {
        debug(`destroying sockets`);

        this._activeSockets.forEach((socket) => {
            if(!destroyAllSockets && (socket !== this._peerSocket))
                socket.destroy();
            else
                socket.destroy();
        })
    }

}