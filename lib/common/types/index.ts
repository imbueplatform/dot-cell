import net from 'net';
import os from 'os';
import { CellNetworkResource } from '../../network/core/network-construct'

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
    (): Promise<void> | void
}

export interface PeerConfig {
    connectionTimeout: number,
    peer: any,
    cellNetworkResource: CellNetworkResource
}

export interface SocketCallback {
    (err?: Error, peer?: PeerResponse): void
}

export interface PeerResponse {
    socket: net.Socket,
    isTcp: boolean
}

export interface AnnounceConfig {
    [key: string]: any,
    lookup: boolean,
    includeLength: boolean,
    port: number,
    length: number
    announce: boolean
}

export enum CellStatus {
    PROVEN = 0b1,
    RECONNECT = 0b10,
    BANNED = 0b100,
    ACTIVE = 0b1000,
    TRIED = 0b10000,
    FIREWALLED = 0b100000,
    BANNED_OR_ACTIVE = BANNED | ACTIVE,
    ACTIVE_OR_TRIED = ACTIVE | TRIED
}

export enum CellPriority {
    NOT_APPLICABLE = 0,
    HIGH = 1,
    MEDIUM = 2,
    LOW = 3,
    VERY_LOW = 4,
    NO_PRIORITY = 5
}

export enum QueueDelay {
    BACKOFF_S = 1000,
    BACKOFF_M = 5000,
    BACKOFF_L = 15000,
    FORGET_UNRESPONSIVE = 7500,
    FORGET_BANNED = Infinity
};

export interface ValidatePeerFunction {
    (peer?: any): Promise<void> | void
}

export interface CellConfig {
    maxServerSockets: number,
    maxClientSockets: number,
    maxPeers: number,
    bootstrap: string[],
    ephemeral: Boolean,
    queue: Object,
    announce: Boolean,
    validatePeer: ValidatePeerFunction
}