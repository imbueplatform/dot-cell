
import os from 'os';
import net from 'net';

type NetworkInterfaceInfo = {
    [index: string]: os.NetworkInterfaceInfo[]
}

interface ErrorFunction {
    (err?: Error): void
}

/**
 * Get the local IPv4 Address
 */
export const localIpAddress = (): string | undefined => {
    let networkInterfaces: NetworkInterfaceInfo = os.networkInterfaces();

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

    return server.listen(port);
}

export const listenTcpUdp = (tcpServer: net.Server, udpServer: net.Server, port: number): Promise<void> => {

    return new Promise((res, rej) => {
        listen(tcpServer, port, (err) => {
            if(err) return rej(err);

            listen(udpServer, (tcpServer.address() as net.AddressInfo).port, (err) => {
                if(err) return rej(err);

                tcpServer.once("close", () => rej(err));
                tcpServer.close();

                return;
            });

            return res();
        });
    });
}
