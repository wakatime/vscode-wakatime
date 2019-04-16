import * as path from 'path';
import * as fs from 'fs';

import { Dependencies } from './dependencies';

export class Options {
    private configFile = path.join(this.getWakaHome(), '.wakatime.cfg');
    private logFile = path.join(this.getWakaHome(), '.wakatime.log');

    private getWakaHome(): string {
        let home = process.env.WAKATIME_HOME;
        if (home) {
            return home;
        } else {
            return this.getUserHomeDir();
        }
    }

    public getSetting(section: string, key: string, callback: (string, any) => void): void {
        fs.readFile(this.getConfigFile(), 'utf-8', (err: NodeJS.ErrnoException, content: string) => {
            if (err) {
                if (callback) callback(new Error('could not read ' + this.getConfigFile()), null);
            } else {
                let currentSection = '';
                let lines = content.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    let line = lines[i];
                    if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
                        currentSection = line
                            .trim()
                            .substring(1, line.trim().length - 1)
                            .toLowerCase();
                    } else if (currentSection === section) {
                        let parts = line.split('=');
                        let currentKey = parts[0].trim();
                        if (currentKey === key && parts.length > 1) {
                            if (callback) callback(null, parts[1].trim());
                            return;
                        }
                    }
                }

                if (callback) callback(null, null);
            }
        });
    }

    public setSetting(section: string, key: string, val: string): void {
        fs.readFile(this.getConfigFile(), 'utf-8', (err: NodeJS.ErrnoException, content: string) => {
            // ignore errors because config file might not exist yet
            if (err) content = '';

            let contents: string[] = [];
            let currentSection = '';

            let found = false;
            let lines = content.split('\n');
            for (var i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (this.startsWith(line.trim(), '[') && this.endsWith(line.trim(), ']')) {
                    if (currentSection === section && !found) {
                        contents.push(key + ' = ' + val);
                        found = true;
                    }
                    currentSection = line
                        .trim()
                        .substring(1, line.trim().length - 1)
                        .toLowerCase();
                    contents.push(line);
                } else if (currentSection === section) {
                    let parts = line.split('=');
                    let currentKey = parts[0].trim();
                    if (currentKey === key) {
                        if (!found) {
                            contents.push(key + ' = ' + val);
                            found = true;
                        }
                    } else {
                        contents.push(line);
                    }
                } else {
                    contents.push(line);
                }
            }

            if (!found) {
                if (currentSection !== section) {
                    contents.push('[' + section + ']');
                }
                contents.push(key + ' = ' + val);
            }

            fs.writeFile(this.getConfigFile(), contents.join('\n'), (err) => {
                if (err) throw err;
            });
        });
    }

    public getConfigFile(): string {
        return this.configFile;
    }

    public getLogFile(): string {
        return this.logFile;
    }

    public getUserHomeDir(): string {
        if (process.env['VSCODE_PORTABLE'])
            return process.env['VSCODE_PORTABLE'] as string;

        return process.env[Dependencies.isWindows() ? 'USERPROFILE' : 'HOME'] || '';
    }

    public startsWith(outer: string, inner: string): boolean {
        return outer.slice(0, inner.length) === inner;
    }

    public endsWith(outer: string, inner: string): boolean {
        return inner === '' || outer.slice(-inner.length) === inner;
    }
}