import { EventEmitter } from 'events'
import net from 'net';

import {} from './common/utils'
import { NetworkConstructConfig, EmptyFunction } from './common/types';
import { CellNetworkResource, Peer, PeerQueue, CellPeer } from './network';


export interface CellConfig {
    maxServerSockets: number,
    maxClientSockets: number,
    maxPeers: number,
    bootstrap: string[],
    ephemeral: Boolean,
    queue: Object,
    announce: Boolean,
    validatePeer: EmptyFunction
}

export class Cell extends EventEmitter {

    private _network: CellNetworkResource;

    constructor(private config: CellConfig) {
        super();

        this._network = new CellNetworkResource({
            ephemeral: config.ephemeral,
            bootstrap: config.bootstrap,
            announce: !!config.announce,
            onBind: this.onSocketBind.bind(this),
            onSocket: this.onSockeConnected.bind(this),
            onClose: this.onSocketClose.bind(this)
        });

        this._network.tcp.maxConnections = this.config.maxServerSockets;
        this._network.utp.maxConnections = this.config.maxServerSockets;

        
    }

    private onSockeConnected(socket: net.Socket, isTcp: Boolean): void {

    }

    private onSocketBind(): void {
        this.emit('listening');
    }

    private onSocketClose(): void {
        this.emit('close');
    }
}