import pump from 'pump';
import hyperswarm from 'hyperswarm';

let debug = require('debug')('imbue-cell')

export const DEFAULT_PORT = 3282;

export const network = async (atom: any, options: any): Promise<any> => {

    let swarm = hyperswarm();

    return new Promise<any>((resolve, reject) => {

        swarm.listen(DEFAULT_PORT);
        swarm.once("error", (err: any) => {
            if (err) debug("ERROR:", err.stack)
            swarm.listen(0);
        });
        swarm.on('connection', (socket: any, info: any) => {
            pump(socket, options.stream(info), socket, function (err) {
                if (err) return reject(err);
            });
        });
        swarm.join(atom.discoveryKey, {
            lookup: true,
            announce: options.announce
        }, null);

        return resolve(swarm);

    });
}