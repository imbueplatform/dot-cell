
import net from 'net';
import { PeerConfig, SocketCallback } from '../common/types';
import { Peer } from './p'

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

        return new Promise((res, rej) => {

            this._peerSocket = net.connect(port, host);
            this._activeSockets.push(this._peerSocket);
    
            this._timeout = setTimeout(this.onSocketTimeout.bind(this), this._config.connectionTimeout);
    
    
            this.setupSocket((err, socket) => {
                if(err) return rej(err);
                return res(socket);
            });

        });
    }

    private onSocketTimeout(): void {
        this.destroyDeadSockets(true);
        throw new Error("Timedout")
    }

    private setupSocket(callback: SocketCallback): void {
        
        let onError = (err?: Error) => {
            if(!--this._closes !&& this._connected && !this._timedOut)
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

            let utp = this._config.cellNetworkResource.utp.connect(port, host);

            utp.on("error", () => (err: Error) => onProtocolError(err, utp));
            utp.on("connect", () => onConnect(utp));
            utp.on("close", () => onClose(utp));

            this._activeSockets.push(utp)
        }

        let onOpen = (err: Error) => {
            if(err) return onError(err);
            this._config.cellNetworkResource.discovery.holepunch(this._config.peer, onHolePunch)
        }

        let onClose = (socket: net.Socket) => {
            this._config.cellNetworkResource.sockets.delete(socket)
            onError(undefined);
        }

        let onConnect = (socket: net.Socket) => {
            if(this._connected && this._timedOut) 
                return socket.destroy();

            this.destroyDeadSockets();

            clearTimeout(this._timeout as NodeJS.Timeout);

            this._connected = true;
            this._config.cellNetworkResource.sockets.add(socket);
        }
        
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
        this._activeSockets.forEach((socket) => {
            if(!destroyAllSockets && (socket !== this._peerSocket))
                socket.destroy();
            else
                socket.destroy();
        })
    }

}