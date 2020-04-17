import { EventEmitter } from 'events'
import net from 'net';

import { EmptyFunction, CellConfig, ErrorFunction, PeerResponse, AnnounceConfig, ValidatePeerFunction, CellElements } from './common/types';
import { CellNetworkResource, PeerQueue, CellPeer } from './network';
import Debug from 'debug';

const debug = Debug("imbue:cell");

interface CellElementsIndex {
    [index: string]: any 
}

const MAX_SERVER_SOCKETS = Infinity
const MAX_CLIENT_SOCKETS = Infinity
const MAX_PEERS = 24

export class Cell extends EventEmitter {

    private _network: CellNetworkResource;

    private _destroyed: boolean = false;
    private _prioritisedInFlight: number = 0;
    private _clientSockets: number = 0;
    private _serverSockets: number = 0;
    private _peers: number = 0;

    private _maxPeers: number = 0;
    private _maxServerSockets: number = 0;
    private _maxClientSockets: number = 0;

    private _open: boolean = false;
    private _connections: Set<net.Socket> = new Set();

    private _validatePeer: ValidatePeerFunction = () => true;

    private _ce: CellElementsIndex = {};

    constructor(private config?: CellConfig) {
        super();

        this._network = new CellNetworkResource({
            ephemeral: config?.ephemeral || true,
            bootstrap: config?.bootstrap || undefined,
            announce: !!config?.announce || false,
            onBind: this.onSocketBind.bind(this),
            onSocket: this.onSockeConnected.bind(this),
            onClose: this.onSocketClose.bind(this)
        });

        this._network.tcp.maxConnections = this.config?.maxServerSockets || MAX_SERVER_SOCKETS;
        this._network.utp.maxConnections = this.config?.maxServerSockets || MAX_SERVER_SOCKETS;

        this._maxPeers = this.config?.maxPeers || MAX_PEERS;
        this._maxServerSockets = this.config?.maxServerSockets || MAX_SERVER_SOCKETS;
        this._maxClientSockets = this.config?.maxClientSockets || MAX_SERVER_SOCKETS;

        this._open = this._peers < this._maxPeers;

        this._connections = this._network.sockets;

        this._validatePeer = this.config?.validatePeer || this.__validate;

        this._ce[CellElements.STATUS] = new Map<any, any>();
        this._ce[CellElements.FLUSH] = [];
        this._ce[CellElements.QUEUE] = new PeerQueue();
        this._ce[CellElements.QUEUE].on('readable', this[CellElements.DRAIN](this._ce[CellElements.QUEUE]));

    }

    __validate(peer?: any): Boolean {
        return true;
    }

    [CellElements.DRAIN] (queue: PeerQueue): EmptyFunction {

        debug(`${CellElements.DRAIN}()`);

        const onAttempt = () => {
            for(let i = 0; i < this._ce[CellElements.FLUSH].length; i++) {
                if(this._clientSockets >= this._maxClientSockets || --this._ce[CellElements.FLUSH][i][0] <= 0) {
                    const callback = this._ce[CellElements.FLUSH][i][1];
                    this._ce[CellElements.FLUSH][i--] = this._ce[CellElements.FLUSH][this._ce[CellElements.FLUSH].length - 1];
                    this._ce[CellElements.FLUSH].pop();
                    callback(null);
                }
            }
        }

        const onError = (err: Error, peer: CellPeer) => {
            this._clientSockets -= 1;
            this[CellElements.DECREMENT_PEER_COUNT]();
            queue.requeue(peer);
            drain();
            onAttempt();
            return;    
        }

        const onConnect = (info: CellPeer, prioritised: Boolean) => (response: PeerResponse) => {
            if(prioritised)
                this._prioritisedInFlight -= 1;

            info.connected(response.socket, response.isTcp);
            this.emit('connection', response.socket, info);

            response.socket.on('close', () => {
                this._clientSockets -= 1;
                this.emit('disconnection', response.socket, info);
                this[CellElements.DECREMENT_PEER_COUNT]();
                info.disconnected();
                queue.requeue(info);
                setImmediate(drain);
            });

            drain();
            onAttempt();
        }

        const drain = () => {
            if(this._open === false) return;
            if(this._clientSockets >= this._maxClientSockets) return;

            while(true) {
                const info = queue.shift();

                if(!info) return;

                if(info.peer.topic) {
                    const domain = this._network.discovery._domain(info.peer.topic);
                    if(!this._network.discovery._domains.has(domain)) {
                        onAttempt();
                        continue;
                    }
                }

                if(info.prioritised)
                    this._prioritisedInFlight += 1;

                this._clientSockets += 1;
                this[CellElements.INCREMENT_PEER_COUNT]();

                this.connect(info.peer)
                    .then(onConnect(info, info.prioritised))
                    .catch((err) => onError(err, info))

                return;
            }
        }

        return drain;
    }

    [CellElements.LEAVE] (key: Buffer, onLeave: Function): void {

        debug(`${CellElements.LEAVE}()`, key);

        const domain: any = this._network.discovery._domain(key);
        const topics: any = this._network.discovery._domain.get(domain);

        if(!topics) return;

        for(const topic of topics) {
            if(Buffer.compare(key, topic.key) === 0) {
                topic.destroy();
                if(onLeave)
                    topic.once('close', onLeave);
                break;
            }
        }
    }

    [CellElements.INCREMENT_PEER_COUNT] (): void {
        debug(`${CellElements.INCREMENT_PEER_COUNT}()`);

        this._peers++;
        this._open = this._peers < this._maxPeers;

        if(this._open === false) {
            this._network.tcp.maxConnections = -1;
            this._network.utp.maxConnections = -1;
        }
    }

    [CellElements.DECREMENT_PEER_COUNT] (): void {

        debug(`${CellElements.DECREMENT_PEER_COUNT}()`);

        this._peers--;
        if(this._open)
            return;

        this._open = this._peers < this._maxPeers;

        if(this._open === true) {
            this._network.tcp.maxConnections = this._maxServerSockets;
            this._network.utp.maxConnections = this._maxServerSockets;
        }
    }

    // "I am now certain, no doubt in my mind, the universe is computational and of sort of equivalent power to something like a touring machine."

    public join(key: Buffer, opts: AnnounceConfig = { announce: false, lookup: false, includeLength: false, length: 0, port: 0 }, onJoin?: Function): void {

        debug('join()', key, opts);

        if(this._destroyed)
            throw Error('destroyed');

        if(Buffer.isBuffer(key) === false)
            throw Error('missing key');

        opts = Object.assign(opts,{
            announce: opts.announce || false,
            includeLength: !!opts.length || opts.length === 0 || !!opts.includeLength,
            length: opts.length || 0,
            lookup: opts.lookup || false
        });

        if(!opts.announce && !opts.lookup)
            throw Error('provide announce or lookup');

        this._ce[CellElements.STATUS].set(key.toString('hex'), { announce: opts.announce, lookup: opts.lookup });

        this._network
            .attach()
            .then(() => opts.announce ? this._network.announce(key, opts) : this._network.lookup(key, opts.includeLength))
            .then((topic) => {
                if(onJoin) topic.flush(onJoin);

                topic.on('update', () => this.emit('updated', { key }));
                if(opts.lookup) {
                    topic.on('peer', (peer: any) => {
                        if(this._validatePeer && !this._validatePeer(peer)) {
                            this.emit('peer-rejected', peer);
                            return;
                        }
                        this.emit('peer', peer);
                        this._ce[CellElements.QUEUE].add(peer);
                    })
                }
                this.emit('join', key, opts);
            });
    }

    public flush(): Promise<void> {
        debug('flush()');

        if(this._destroyed)
            throw Error('destroyed');
        return new Promise((res, rej) => {

            this._network.attach().then(() => {
                this._network.discovery.flush(() => {
                    const prio = this._ce[CellElements.QUEUE].prioritised + this._prioritisedInFlight;
                    if(prio === 0 || this._clientSockets >= this._maxClientSockets) {
                        return res();
                    } else {
                        this._ce[CellElements.FLUSH].push([prio, res])
                    }
                })
            });

        });

    }

    public address(): net.AddressInfo | string | null {
        if(this._destroyed)
            throw Error('destroyed');

        return this._network.address;
    }

    public listen(port?: Number): Promise<any> {
        debug('listen()', port);
        if(this._destroyed)
            throw Error('destroyed');
        return this._network.attach(port)
    }

    public status(key: Buffer): string | undefined {
        debug('status()'), key;
        return this._ce[CellElements.STATUS].get(key.toString('hex')) || undefined;
    }

    public connect(peer: any): Promise<PeerResponse> {
        debug('connect()', peer);
        if(this._destroyed)
            throw Error('destroyed');
        return this._network.connect(peer);
    }

    public holepunchable(): any {
        const discovery = this._network.discovery;
        return discovery && discovery.dht.holepunchable();
    }

    public remoteAdress() {
        const discovery = this._network.discovery;
        return discovery && discovery.dht.remoteAdress();        
    }

    public leave(key: Buffer, onLeave: Function): void{
        debug('leave()');

        if(!Buffer.isBuffer(key))
            throw Error('missing key');

        if(this._destroyed) return;

        this._ce[CellElements.STATUS].delete(key.toString('hex'));

        this._network.attach().then(() => {
            this[CellElements.LEAVE](key, onLeave);
            this.emit('leave', key);
        }).catch((err) => {
            return;
        });

    }

    public destroy(callback: ErrorFunction): void {
        debug('destroy()');

        this._destroyed = true;
        this._ce[CellElements.QUEUE].destroy();
        this._network.close();
        this._ce[CellElements.STATUS].clear();

        const flush = this._ce[CellElements.FLUSH];
        this._ce[CellElements.FLUSH] = [];

        for(const [, callback] of flush)
            callback(Error('destroyed'));
    }

    private onSockeConnected(socket: net.Socket, isTcp: Boolean): void {
        const info = new CellPeer(undefined, this._ce[CellElements.QUEUE]);
        info.connected(socket, isTcp);
        this.emit('connection', socket, info);
        this._serverSockets++;
        this[CellElements.INCREMENT_PEER_COUNT]();
        this.once('close', () => {
            this._serverSockets--;
            this.emit('disconnection', socket, info);
            this[CellElements.DECREMENT_PEER_COUNT]();
        });
    }

    private onSocketBind(): void {
        debug('onSocketBind()');
        this.emit('listening');
    }

    private onSocketClose(): void {
        debug('onSocketClose()');
        this.emit('close');
    }
}