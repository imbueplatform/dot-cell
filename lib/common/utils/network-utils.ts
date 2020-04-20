
import os from 'os';
import net from 'net';
import Debug from 'debug';
import { NetworkInterfaceInfo, ErrorFunction } from '../types';

const debug = Debug("imbue:cell:network-utils");

/**
 * Get the local IPv4 Address
 */
export const localIpAddress = (): string | undefined => {
    let networkInterfaces: any = os.networkInterfaces();

    for(let name of Object.keys(networkInterfaces))
        for (let address of networkInterfaces[name])
            if(!address.internal && address.family === "IPv4")
                return address.address;

    return undefined;

}

export const listen = (server: net.Server, port: number = 0, callback?: ErrorFunction): net.Server => {
    
    let done = (err: Error) => {
        server.removeListener("listening", done);
        server.removeListener("error", done);
        if(callback) callback(err);
    }

    ["listening", "error"].forEach((listener) => server.on(listener, done));

    server.listen(port);

    return server;
}

export const listenTcpUdp = (tcpServer: net.Server, utpServer: net.Server, port: number): Promise<void> => {

    return new Promise((res, rej) => {
        listen(tcpServer, port, (err) => {
            if(err) return rej(err);

            debug(`listening on tcp:`, tcpServer.address());

            listen(utpServer, (tcpServer.address() as net.AddressInfo).port, (err) => {
                if(err) {
                    tcpServer.once("close", () => rej(err));
                    tcpServer.close();
                    return rej(err);
                }

                debug(`listening on utp: `, utpServer.address());

                return res();
            });
        });
    });
}

export const toId = (peer: any, multiplex: Boolean): string => {
    const baseId = `${peer.host}:${peer.port}`;
    if(multiplex)
        return baseId;
    return `${baseId}${(peer.topic ? '@' + peer.topic.toString('hex') : '')}`;
}


import http from 'http';

/**
 * Find available port utility function
 * 
 * @param start starting port
 */
export const findAvailablePort = (start: number = 5337): Promise<number> => {
    return new Promise((res) => {

        /**
         * Nested `tryPort` helper function
         * 
         * @param nextPort next port number
         */
        const tryPort = (nextPort: number): void => {

            //save current context port, then increment it in preparation for failure.
            let currentPort = nextPort;
            nextPort++;

            // create a temporary http server
            let tempServer = http.createServer();
    
            /**
             * when an error event occurs (due to unavailable port),
             * try again with the incremented port value
             */
            tempServer.on('error', () => tryPort(nextPort));

            /**
             * Try and listen on the current port.
             * 
             * If successful, close temp server and return the available port, 
             * otherwise it will fire an error event.
             */
            tempServer.listen(currentPort, () => tempServer.close(() => res(currentPort)));
        }

        // kick it off ...
        tryPort(start);
    });
}

