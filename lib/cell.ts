
import { network } from './network/network-back';
import fs from 'fs';

const debug = require('debug')('imbue-cell')

const noop = () => {}

export class Cell {

    private _network: any | undefined = undefined;
    private _atom: any | undefined = undefined;
    private _synced: Boolean = false;

    constructor(atom: any) {
        this._atom = atom;
    }

    public async join(options: any): Promise<any> {

        let networkOptions: any = Object.assign({}, {
            stream: this._createStream
        }, options)

        this._network = await network(this._atom, networkOptions);
        return this._network;
    }

    get key(): string {
        return this._atom.discoveryKey
    }

    public async leave(): Promise<any> {
        if(!this._network)
            return Promise.resolve();

        this._network.leave();
        this._network.destroy(noop)

        delete this._network;

        return Promise.resolve();
    }

    public async close(): Promise<any> {
        return this._closeNetwork();
    }

    public async pause(): Promise<void> {
        await this.leave();
    }

    public async resume(): Promise<void> {
        this._network.joinNetwork();
    }

    private async _closeNetwork(): Promise<void> {
        if(this._network) 
            return this.leave()
    }

    private _createStream(peer: any): any {
        let _this: Cell = this;

        let _stream = fs.createReadStream('file.txt');

        _stream.on('close', function () {
            debug('stream close')
        });
        _stream.on('error', function (err) {
            debug('replication error:', err.message)
        });
        _stream.on('end', () => {
            _this._synced = true;
            debug('stream ended');
        });
        return _stream;
    }
}