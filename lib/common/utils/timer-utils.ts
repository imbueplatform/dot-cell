import { EmptyFunction } from '../types'

export class Timer {

    private _time: number = 0;
    private _interval: NodeJS.Timeout | undefined;
    private _pending: any[] = [];
    private _next: any[] = [];
    private _function: any;

    constructor(time: number, func: any) {
        this._time = time;
        this._function = func;
    }

    private onTick(): void {
        if(!this._next.length && !this._pending.length)
            return;

        if(this._next.length)
            this._function(this._next);

        this._next = this._pending;
        this._pending = [];
    }

    public destroy(): void {
        clearInterval(this._interval as NodeJS.Timeout);
        this._interval = undefined;
    }

    public push(info: any): void {
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
export const createTimer = (time: number, func: any): Timer => new Timer(time, func);

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



