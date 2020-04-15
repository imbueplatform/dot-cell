import { EmptyFunction } from '../types'


export class Timer {
    protected _time: number = 0;
    protected _interval: NodeJS.Timeout | undefined;
    protected _pending: any[] = [];
    protected _next: any[] = [];
    protected _function: any;

    constructor(time: number, func: any) {
        this._time = time;
        this._function = func;
    }

    protected onTick(): void {
        if(!this._next.length && !this._pending.length)
            return;

        if(this._next.length)
            this._function(this._next);

        this._next = this._pending;
        this._pending = [];
    }

    public destroy(): void {}
    public push(info?: any): void {}
}

export class QueueTimer extends Timer {

    constructor(time: number, func: any) {
        super(time, func);
    }

    public destroy(): void {
        clearInterval(this._interval as NodeJS.Timeout);
        this._interval = undefined;
    }

    public push(info?: any): void {
        if(!this._interval) 
            this._interval = setInterval(this.onTick.bind(this), Math.floor(this._time * 0.66))
        this._pending.push(info);
    }
}

/**
 * Create Timer utility function
 * @param time time delay
 * @param func function
 */
export const createQueueTimer = (time: number, func: any): QueueTimer => new QueueTimer(time, func);

/**
 * Pause utility promise function.
 */
export const pause = (duration: number): Promise<void> => {
    return new Promise((res) => setTimeout(res, duration));
}

/**
 * Exponential backoff utility promise function.
 */
export const backoff = (retries: number, callback: EmptyFunction, delay: number = 500): Promise<void> => {
    return callback().catch((err) => 
        retries > 1 ? 
            pause(delay).then(() => backoff(retries - 1, callback, delay * 2)) : 
            Promise.reject(err));
}



