
import { network } from './network/network';
import fs from 'fs';
const debug = require('debug')('imbue-cell')

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

    private _createStream(peer: any): any {
        let _stream = fs.createReadStream('file.txt');

        _stream.on('close', function () {
            debug('stream close')
        })
        _stream.on('error', function (err) {
            debug('replication error:', err.message)
        })
        _stream.on('end', () => {
            this._synced = true;
            debug('stream ended');
        })
        return _stream;
    }
}