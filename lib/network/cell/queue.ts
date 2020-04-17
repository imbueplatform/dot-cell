import { EventEmitter } from 'events';
import { QueueDelay, CellPriority } from '../../common/types';
import { createQueueTimer, Timer } from '../../common/utils/timer-utils'
import { CellPeer } from './cell-peer';
import { toId } from '../../common/utils/network-utils';

import spq from 'shuffled-priority-queue';


export class PeerQueue extends EventEmitter {

    private _infos: Map<any, CellPeer> | undefined = new Map();
    private _queue: any | undefined = spq();
    private _multiplex: any;
    private _requeue: Timer[] = [];
    private _remove: Timer[] = [];
    private _dedup: Map<any, any> = new Map();

    private _destroyed: boolean = false;

    constructor(opt: any) {
        super();

        this._multiplex = !!opt.multiplex || false;

        this.initialiseQueues(opt);

    }

    get prioritised(): Number {
        const p = this._queue.priorities;

        let count: number = 0;

        for(let i=2; i < p.length; i++)
            count += p[i].length;

        return count;
    }

    get length(): Number {
        return this._queue.length;
    }

    public deduplicate(localId: Buffer, remoteId: Buffer, peer: CellPeer): Boolean {
        const id = localId.toString('hex') + '\n' + remoteId.toString('hex');
        const compare = Buffer.compare(localId, remoteId);

        peer.dedup = id;

        if(compare === 0) {
            peer.destroy(
                new Error('Connected to self.')
            )
            return true;
        }

        const other = this._dedup.get(id);

        if(!other) {
            this._dedup.set(id, peer);
            return false;
        }

        const otherIsDuplicate = (other.type === peer.type) ?
            (compare < 0 ? peer.client : !peer.client) :
            other.type === 'utp';

        if(otherIsDuplicate) {
            this.dropduplicate(peer, other, id);
            return false;
        } else {
            this.dropduplicate(other, peer, id);
            return true;
        }

    }

    public disconnected(peer: CellPeer) {
        if(peer.dedup && this._dedup.get(peer.dedup) === peer)
            this._dedup.delete(peer.dedup);
    }

    public requeue(info: CellPeer): Boolean {
        if(this._destroyed)
            return false;

        const queue = info.requeue();

        if(queue === -1) {
            this._remove[info.banned ? 1 : 0].push(info);
            return false;
        }

        this._requeue[queue].push(info);

        return true;
    }

    public shift(): CellPeer | undefined {
        if(this._destroyed)
            return undefined;

        const info = this._queue.shift() as CellPeer;

        if(info)
            info.active(true);

        return info;
    }

    public add(peer: any): void {
        if(this._destroyed)
            return;

        const id = toId(peer, this._multiplex);

        let info = this._infos?.get(id);

        const existing = !!info;

        if(!info) {
            info = new CellPeer(peer, this);
            this._infos?.set(id, info);
        }

        info.topic(peer.topic);

        if(this._multiplex && existing)
            return;

        if(this._queue.has(info))
            return;

        if(!info.update())
            return;

        const empty = !this._queue.head();

        this._queue.add(info);

        if(empty)
            this.emit('readable');
    }

    public remove(peer: any): void {
        if(this._destroyed)
            return;

        const id = toId(peer, this._multiplex);
        const info = this._infos?.get(id);

        if(info) {
            info.destroy();
            this._queue.remove(info);
            this._infos?.delete(id);
        }
    }

    public destroy(): void {
        if(this._destroyed)
            return;
        this._destroyed = true;

        for(const timer of this._requeue)
            timer.destroy();

        for(const timer of this._remove)
            timer.destroy();

        this._infos = undefined;
        this._queue = undefined;
    }

    private initialiseQueues(opt: any): void {
        const {
            requeue = [ QueueDelay.BACKOFF_S, QueueDelay.BACKOFF_M, QueueDelay.BACKOFF_L ],
            forget = {
                unresponsive: QueueDelay.FORGET_UNRESPONSIVE,
                banned: QueueDelay.FORGET_BANNED
            }
        } = opt;

        const backoff = [QueueDelay.BACKOFF_S, QueueDelay.BACKOFF_M, QueueDelay.BACKOFF_L, ...requeue.slice(3)];

        const push = this.push.bind(this);
        const release = this.release.bind(this);

        this._requeue = backoff.map((ms => createQueueTimer(ms, push)));
        this._remove = [QueueDelay.FORGET_UNRESPONSIVE, QueueDelay.FORGET_BANNED].map((ms) => {
            return ms < Infinity ? 
            createQueueTimer(ms, release) : new Timer(0, undefined)
        });
    }

    private dropduplicate(peer: CellPeer, duplicatePeer: CellPeer, id: string): void {
        duplicatePeer.duplicate = true;
        duplicatePeer.emit('duplicate');

        this._dedup.set(id, peer);

        if(!duplicatePeer.client)
            return;

        duplicatePeer.ban(true);

        peer.stream.on('close', this.unbanduplicate.bind(this, peer, duplicatePeer, id));
    }

    private unbanduplicate(peer: CellPeer, duplicatePeer: CellPeer, id: string): void {
        if(peer.banned)
            return;

        if(this._infos === undefined || this._infos.get(toId(duplicatePeer, this._multiplex)) !== duplicatePeer)
            return;

        this.remove(duplicatePeer);
        this.add(duplicatePeer);
    }

    private push(batch: CellPeer[]): void {
        const empty = !this._queue.head();

        let readable = false;

        for(const info of batch) {
            info.active(false);

            if(info.update() === false) {
                this._remove[info.banned ? 1 : 0].push(info);
                continue;
            }
            this._queue.add(info);
        }
    }

    private release(batch: CellPeer[]): void {
        for(const info of batch)
            this.remove(info.peer);
    }
}