import net from 'net';
import os from 'os';
import { CellNetworkResource } from '../../network/network-construct'

export interface OnSocket {
    (socket: net.Socket, isTcp: Boolean): void
}

export interface OnBind {
    (): void;
}

export interface OnClose {
    (): void;
}

export interface NetworkConstructConfig {
    port?: Number,
    broadcastLocalAddress?: Boolean,
    ephemeral?: Boolean,
    bootstrap?: string[],
    announce?: Boolean,
    onSocket: OnSocket,
    onBind: OnBind
    onClose: OnClose
}

export type NetworkInterfaceInfo = {
    [index: string]: os.NetworkInterfaceInfo[]
}

export interface ErrorFunction {
    (err?: Error): void
}

export interface EmptyFunction {
    (): Promise<void>
}

export interface PeerConfig {
    connectionTimeout: number,
    peer: any,
    cellNetworkResource: CellNetworkResource
}

export interface SocketCallback {
    (err?: Error, socket?: net.Socket): void
}