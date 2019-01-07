declare namespace NodeJS {
    interface Global {
        log: Logger;
        Bluebird;
    }
}

declare interface Logger {
    level;
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    fatal(...args: any[]): void;
}

declare namespace Bluebird {}

declare const log: Logger;

