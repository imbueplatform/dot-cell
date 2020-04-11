interface EmptyFunction {
    (): Promise<void>
}

export const pause = (duration: number): Promise<void> => {
    return new Promise((res) => setTimeout(res, duration));
}

export const backoff = (retries: number, callback: EmptyFunction, delay: number = 500): Promise<void> => {
    return callback().catch((err) => {
        retries > 1 ? pause(delay).then(() => {
            backoff(retries -1, callback, delay * 1);
        }) : Promise.reject(err);
    });
}