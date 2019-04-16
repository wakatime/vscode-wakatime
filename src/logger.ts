export class Logger {
    private level: string;
    private levels = {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3,
    };

    constructor(level: string) {
        this.setLevel(level);
    }

    public setLevel(level: string): void {
        if (level in this.levels) {
            this.level = level;
        } else {
            throw new TypeError(`Invalid level: ${level}`);
        }
    }

    public log(level: string, msg: string): void {
        if (!(level in this.levels)) throw new TypeError(`Invalid level: ${level}`);

        const current: number = this.levels[level];
        const cutoff: number = this.levels[this.level];

        if (current >= cutoff) {
            msg = `[WakaTime][${level.toUpperCase()}] ${msg}`;
            if (level == 'debug') console.log(msg);
            if (level == 'info') console.info(msg);
            if (level == 'warn') console.warn(msg);
            if (level == 'error') console.error(msg);
        }
    }

    public debug(msg: string): void {
        this.log('debug', msg);
    }

    public info(msg: string): void {
        this.log('info', msg);
    }

    public warn(msg: string): void {
        this.log('warn', msg);
    }

    public error(msg: string): void {
        this.log('error', msg);
    }
}