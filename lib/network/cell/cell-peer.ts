import { EventEmitter } from 'events';
import { CellPriority, CellStatus } from '../../common/types';

export class CellPeer extends EventEmitter {

    private _peer: any;
    private _queue: any;

    private _priority: CellPriority = CellPriority.LOW;
    private _status: CellStatus = CellStatus.RECONNECT | CellStatus.FIREWALLED;
    private _retries: number = 0;
    
    private _client: Boolean = false;
    private _stream: any | undefined = undefined;
    private _duplicate: Boolean = false;
    private _topics: Array<any> = new Array<any>();
    private _index: number = 0;
    private _dedup: any | undefined = undefined;

    constructor(peer: any, queue: any){
        super();
        this._peer = peer;
        this._queue = queue;

        this._priority = (peer && peer.local) ? CellPriority.LOW : (peer && peer.to && peer.to.host === peer.host) ? CellPriority.HIGH : CellPriority.MEDIUM;
        this._retries = this._priority === CellPriority.HIGH ? 3 : 0;
        this._client = (this._peer !== undefined)
    }

    set duplicate(value: Boolean) {
        this._duplicate = value;
    }

    get duplicate(): Boolean {
        return this._duplicate;
    }

    get stream(): any {
        return this._stream;
    }

    get client(): Boolean {
        return this._client;
    }

    get dedup(): any {
        return this._dedup;
    }

    set dedup(value: any) {
        this._dedup = value;
    }

    get peer(): any {
        return this._peer;
    }

    get type(): string {
        return this._status & CellStatus.FIREWALLED ? 'utp' : 'tcp';
    }

    get prioritised(): Boolean {
        return this._priority >= CellPriority.MEDIUM;
    }

    get firewalled(): Boolean {
        return !!(this._status & CellStatus.FIREWALLED);
    }

    get banned(): Boolean {
        return !!(this._status & CellStatus.BANNED);
    }

    public dedublicate(remoteId: string, localId: string): any {
        return this._queue.deduplicate(remoteId, localId, this);
    }

    public backoff(): Boolean | undefined {
        if(this._client === false) 
            return;

        this.requeue();

        if(this._status & CellStatus.BANNED) 
            return false;

        if(this._retries > 3)
            return false;

        this._priority = this.prioritise();

        return true;
    }

    public reconnect(val: any): void {
        if(val)
            this._status |= CellStatus.RECONNECT;
        else
            this._status &= ~CellStatus.RECONNECT;
    }

    public active(val?: any): void {
        if(val)
            this._status |= CellStatus.ACTIVE_OR_TRIED;
        else
            this._status &= ~CellStatus.ACTIVE;
    }

    public connected(stream: any, isTcp: Boolean = true): void {
        if(isTcp)
            this._status &= ~CellStatus.FIREWALLED;

        this._status |= CellStatus.PROVEN;
        this._stream = stream;
        this._retries = 0;
        
        if(this._status & CellStatus.BANNED)
            this.ban();
    }

    public disconnected(): void {
        this._stream = undefined;
        this._topics = [];
        this.removeAllListeners('topic');

        if(this._queue)
            this._queue.disconnected(this);
    }

    public topic(topic: any): void {
        this._topics.push(topic);
        this.emit('topic', topic);
    }

    public update(): Boolean {
        if(this._status & CellStatus.BANNED_OR_ACTIVE)
            return false;

        if(this._retries >3)
            return false;

        this._priority = this.prioritise();

        return true;
    }

    public ban(soft?: any): void {
        if(soft) {
            this._status |= CellStatus.BANNED;

            if(this._stream && !this._stream.destroyed)
                this._stream.end();
            
            this.disconnected();
        }
        else 
            this.destroy(new Error('Peer was banned.'));
    }

    public destroy(err?: Error): void {
        this._status |= CellStatus.BANNED;

        if(this._stream && !this._stream.destroyed)
            this._stream.destroy(err);

        this.disconnected();
    }

    public requeue(): number {
        if(this._status & CellStatus.BANNED)
            return -1;

        if(!(this._status & CellStatus.RECONNECT))
            return -1;

        if(this._retries >= 3) {
            this._retries++;
            return -1;
        }

        return this._retries;
    }

    private prioritise(): CellPriority {
        if((this._status & CellStatus.TRIED) && !(this._status & CellStatus.PROVEN)) 
            return CellPriority.NOT_APPLICABLE;

        if(this._retries === 3)
            return CellPriority.HIGH;

        if(this._retries === 2)
            return CellPriority.VERY_LOW;

        if(this._retries === 1)
            return CellPriority.NO_PRIORITY;

        return (this._peer && this._peer.local) ? CellPriority.LOW : CellPriority.MEDIUM;
    }

}