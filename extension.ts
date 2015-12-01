// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import vscode = require('vscode');

import fs = require('fs');
import os = require('os');
import path = require('path');
import child_process = require('child_process');

var AdmZip = require('adm-zip');
var ini = require('ini');
var request = require('request');
var rimraf = require('rimraf');
var Winreg = require('winreg');


// this method is called when your extension is activated. activation is
// controlled by the activation events defined in package.json
export function activate(ctx: vscode.ExtensionContext) {

    // initialize WakaTime
    let wakatime = new WakaTime();

    // add to a list of disposables which are disposed when this extension
    // is deactivated again.
    ctx.subscriptions.push(wakatime);
}


export class WakaTime {

    private version:string = '0.1.2';
    private statusBar:vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    private disposable:vscode.Disposable;
    private lastFile:string;
    private lastHeartbeat:number = 0;
    private dependencies:Dependencies;
    private options:Options = new Options();

    constructor() {
        console.log('Initializing WakaTime v' + this.version);
        this.statusBar.text = '$(clock) WakaTime Initializing...';
        this.statusBar.show();
        
        this._checkApiKey();

        this.dependencies = new Dependencies();
        this.dependencies.checkAndInstall();

        this._setupEventListeners();
    }

    private _checkApiKey() {
        this.options.hasApiKey(function(hasApiKey) {
            if (!hasApiKey) {
                this.options.promptForApiKey(function(apiKey) {
                    this.options.setApiKey(apiKey);
                }.bind(this));
            }
        }.bind(this));
    }

    private _setupEventListeners() {
        // subscribe to selection change and editor activation events
        let subscriptions: vscode.Disposable[] = [];
        vscode.window.onDidChangeTextEditorSelection(this._onChange, this, subscriptions);
        vscode.window.onDidChangeActiveTextEditor(this._onChange, this, subscriptions);
        vscode.workspace.onDidSaveTextDocument(this._onSave, this, subscriptions);

        // create a combined disposable from both event subscriptions
        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    private _onChange() {
        this._onEvent(false);
    }

    private _onSave() {
        this._onEvent(true);
    }

    private _onEvent(isWrite) {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let doc = editor.document;
            if (doc) {
                let file = doc.fileName;
                if (file) {
                    let time = Date.now();
                    if (isWrite || this._enoughTimePassed(time) || this.lastFile !== file) {
                        this._sendHeartbeat(file, isWrite);
                        this.lastFile = file;
                        this.lastHeartbeat = time;
                    }
                }
            }
        }
    }

    private _sendHeartbeat(file, isWrite) {
        this.dependencies.getPythonLocation(function(pythonBinary) {
            
            if (pythonBinary) {
        
                let core = this.dependencies.getCoreLocation();
                let user_agent = 'vscode/' + vscode.version + ' vscode-wakatime/' + this.version;
                let args = [core, '--file', file, '--plugin', user_agent];
                if (isWrite)
                    args.push('--write');
        
                let process = child_process.execFile(pythonBinary, args, function(error, stdout, stderr) {
                    if (error != null) {
                        this.statusBar.text = '$(clock) WakaTime Error';
                        this.statusBar.tooltip = 'Help -> Toggle Developer Tools for more details';
                        if (stderr && stderr.toString() != '')
                            console.error(stderr);
                        if (stdout && stdout.toString() != '')
                            console.error(stdout);
                        console.error(error);
                    }
                }.bind(this));
                process.on('close', function(code, signal) {
                    if (code == 0) {
                        this.statusBar.text = '$(clock) WakaTime Active';
                        let today = new Date();
                        this.statusBar.tooltip = 'Last heartbeat sent at ' + this.formatDate(today);
                    } else {
                        this.statusBar.text = '$(clock) WakaTime Error';
                        this.statusBar.tooltip = 'Help -> Toggle Developer Tools for more details';
                        if (code == 102) {
                            console.error('API Error (102); Check your ~/.wakatime.log file for more details.');
                        } else if (code == 103) {
                            console.error('Config Parsing Error (103); Check your ~/.wakatime.log file for more details.');
                        }
                    }
                }.bind(this));
                
            }
            
        }.bind(this));
    }

    private formatDate(date) {
        let months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ];
        let ampm = 'AM';
        let hour = date.getHours();
        if (hour > 11) {
            ampm = 'PM';
            hour = hour - 12;
        }
        let minute = date.getMinutes();
        if (minute < 10) minute = '0' + minute;
        return months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear() + ' ' + hour + ':' + minute + ' ' + ampm;
    }

    private _enoughTimePassed(time) {
        return this.lastHeartbeat + 120000 < time;
    }

    public dispose() {
        this.statusBar.dispose();
        this.disposable.dispose();
    }
}


class Dependencies {

    private _cachedPythonLocation: string;

    public checkAndInstall() {
        if (!this.isCoreInstalled()) {
            this.installCore();
        } else {
            this.isCoreLatest(function(isLatest) {
                if (!isLatest) {
                    this.installCore();
                }
            }.bind(this));
        }

        this.isPythonInstalled(function(isInstalled) {
            if (!isInstalled)
                this.installPython();
        }.bind(this));
    }

    public getPythonLocation(callback) {
        if (this._cachedPythonLocation)
            return callback(this._cachedPythonLocation);

        let locations = [
            __dirname + path.sep + 'python' + path.sep + 'pythonw',
            "pythonw",
            "python",
            "/usr/local/bin/python",
            "/usr/bin/python",
            "\\python38\\pythonw",
            "\\Python38\\pythonw",
            "\\python37\\pythonw",
            "\\Python37\\pythonw",
            "\\python36\\pythonw",
            "\\Python36\\pythonw",
            "\\python35\\pythonw",
            "\\Python35\\pythonw",
            "\\python34\\pythonw",
            "\\Python34\\pythonw",
            "\\python33\\pythonw",
            "\\Python33\\pythonw",
            "\\python32\\pythonw",
            "\\Python32\\pythonw",
            "\\python31\\pythonw",
            "\\Python31\\pythonw",
            "\\python30\\pythonw",
            "\\Python30\\pythonw",
            "\\python27\\pythonw",
            "\\Python27\\pythonw",
            "\\python26\\pythonw",
            "\\Python26\\pythonw",
            "\\python38\\python",
            "\\Python38\\python",
            "\\python37\\python",
            "\\Python37\\python",
            "\\python36\\python",
            "\\Python36\\python",
            "\\python35\\python",
            "\\Python35\\python",
            "\\python34\\python",
            "\\Python34\\python",
            "\\python33\\python",
            "\\Python33\\python",
            "\\python32\\python",
            "\\Python32\\python",
            "\\python31\\python",
            "\\Python31\\python",
            "\\python30\\python",
            "\\Python30\\python",
            "\\python27\\python",
            "\\Python27\\python",
            "\\python26\\python",
            "\\Python26\\python",
        ];
    
        // get Python location from Windows Registry
        this.getPythonLocationFromWinReg(function(pythonLocation) {
            if (pythonLocation)
                locations.unshift(pythonLocation);
        
            let args = ['--version'];
            for (var i = 0; i < locations.length; i++) {
                try {
                    let stdout = child_process.execFileSync(locations[i], args);
                    this._cachedPythonLocation = locations[i];
                    return callback(locations[i]);
                } catch (e) {
                    console.warn(e);
                }
            }
                
            callback(null);

        }.bind(this));
    }

    public getPythonLocationFromWinReg(callback) {
        if (os.platform() != 'win32') return callback(null);

        this._getPythonLocationFromWinRegHive(Winreg.HKCU, function(pythonBinary) {
            if (pythonBinary) return callback(pythonBinary);
            this._getPythonLocationFromWinRegHive(Winreg.HKLM, function(pythonBinary) {
                callback(pythonBinary);
            }.bind(this));
        }.bind(this));
    }
    
    private _getPythonLocationFromWinRegHive(hive, callback) {
        let parentKey = '\\SOFTWARE\\Python\\PythonCore';
        if (os.arch().indexOf('x64') > -1) parentKey = '\\SOFTWARE\\Wow6432Node\\Python\\PythonCore';
        
        try {
            var regKey = new Winreg({
                hive: hive,
                key: parentKey,
            });
            regKey.keys(function (err, items) {
                if (err) {
                    console.error('Error Reading WinReg (' + parentKey + '): ' + err.toString());
                } else {
                    let keys = [];
                    for (var i in items) {
                        keys.push(items[i].key);
                    }
                    keys.sort().reverse();
                    this.getPythonLocationFromWinRegKeys(hive, keys, callback);
                }
            }.bind(this));
        } catch (e) {
            console.error(e);
        }
    }

    public getPythonLocationFromWinRegKeys(hive, keys, callback) {
        if (keys.length == 0) return callback(null);
        
        let key = keys.shift() + '\\InstallPath';
        
        var regKey = new Winreg({
            hive: hive,
            key: key,
        });
        regKey.get('', function(err, item) {
            if (err) {
                console.error('Error Reading WinReg (' + key + '): ' + err.toString());
                this.getPythonLocationFromWinRegKeys(hive, keys, callback);
            } else {
                console.log('Python from from: ' + key);
                callback(item.value + '\\pythonw');
            }
        }.bind(this));
    }

    public getCoreLocation() {
        let dir = __dirname + path.sep + 'wakatime-master' + path.sep + 'wakatime' + path.sep + 'cli.py';
        return dir;
    }

    private isCoreInstalled() {
        return fs.existsSync(this.getCoreLocation());
    }

    private isCoreLatest(callback) {
        this.getPythonLocation(function(pythonBinary) {
            if (pythonBinary) {
    
                let args = [this.getCoreLocation(), '--version'];
                child_process.execFile(pythonBinary, args, function(error, stdout, stderr) {
                    if (!(error != null)) {
                        let currentVersion = stderr.toString().trim();
                        console.log('Current wakatime-core version is ' + currentVersion);
    
                        console.log('Checking for updates to wakatime-core...');
                        this.getLatestCoreVersion(function(latestVersion) {
                            if (currentVersion === latestVersion) {
                                console.log('wakatime-core is up to date.');
                                if (callback)
                                    callback(true);
                            } else if (latestVersion) {
                                console.log('Found an updated wakatime-core v' + latestVersion);
                                if (callback)
                                    callback(false);
                            } else {
                                console.log('Unable to find latest wakatime-core version from GitHub.');
                                if (callback)
                                    callback(false);
                            }
                        });
                    } else {
                        if (callback)
                            callback(false);
                    }
                }.bind(this));
            } else {
                if (callback)
                    callback(false);
            }
        }.bind(this));
    }

    private getLatestCoreVersion(callback) {
        let url = 'https://raw.githubusercontent.com/wakatime/wakatime/master/wakatime/__about__.py';
        request.get(url, function(error, response, body) {
            let version = null;
            if (!error && response.statusCode == 200) {
                let lines = body.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    let re = /^__version_info__ = \('([0-9]+)', '([0-9]+)', '([0-9]+)'\)/g;
                    let match = re.exec(lines[i]);
                    if (match != null) {
                        version = match[1] + '.' + match[2] + '.' + match[3];
                        if (callback)
                          return callback(version);
                    }
                }
            }
            if (callback)
                return callback(version);
        });
    }

    private installCore = function() {
        console.log('Downloading wakatime-core...');
        let url = 'https://github.com/wakatime/wakatime/archive/master.zip';
        let zipFile = __dirname + path.sep + 'wakatime-master.zip';

        this.downloadFile(url, zipFile, function() {
            this.extractCore(zipFile);
        }.bind(this));
    }

    private extractCore(zipFile) {
        console.log('Extracting wakatime-core into "' + __dirname + '"...');
        this.removeCore();
        this.unzip(zipFile, __dirname);
        console.log('Finished extracting wakatime-core.');
    }

    private removeCore() {
        if (fs.existsSync(__dirname + path.sep + 'wakatime-master')) {
            try {
                rimraf(__dirname + path.sep + 'wakatime-master');
            } catch (e) {
                console.error(e);
            }
        }
    }

    private downloadFile(url, outputFile, callback) {
        let r = request(url);
        let out = fs.createWriteStream(outputFile);
        r.pipe(out);
        return r.on('end', function() {
            return out.on('finish', function() {
                if (callback != null) {
                    return callback();
                }
            });
        });
    }

    private unzip(file, outputDir) {
        if (fs.existsSync(file)) {
            try {
                let zip = new AdmZip(file);
                zip.extractAllTo(outputDir, true);
            } catch (e) {
                return console.error(e);
            } finally {
                fs.unlink(file);
            }
        }
    }

    private isPythonInstalled(callback) {
        this.getPythonLocation(function(pythonBinary) {
            callback(!!pythonBinary);
        }.bind(this));
    }

    private installPython() {
        if (os.type() === 'Windows_NT') {
            let ver = '3.5.0';
            let arch = 'win32';
            if (os.arch().indexOf('x64') > -1) arch = 'amd64';
            let url = 'https://www.python.org/ftp/python/' + ver + '/python-' + ver + '-embed-' + arch + '.zip';

            console.log('Downloading python...');
            let zipFile = __dirname + path.sep + 'python.zip';
            this.downloadFile(url, zipFile, function() {

                console.log('Extracting python...');
                this.unzip(zipFile, __dirname + path.sep + 'python');
                console.log('Finished installing python.');
            }.bind(this));
        } else {
            console.error('WakaTime depends on Python. Install it from https://python.org/downloads then restart VSCode.');
            // window.alert('WakaTime depends on Python. Install it from https://python.org/downloads then restart VSCode.');
        }
    }
}


class Options {

    private _apiKey:string;

    public hasApiKey(callback) {
        this.getApiKey(function(error, apiKey) {
            callback(!error);
        });
    }

    public getApiKey(callback) {
        let file = path.join(this.getUserHomeDir(), '.wakatime.cfg');
        fs.readFile(file, 'utf-8', function(err, content) {
            if (err) {
                callback(new Error('could not read ~/.wakatime.cfg'), null);
            } else {
                let configs = ini.parse(content);
                if (configs && configs.settings && configs.settings.api_key) {
                    callback(null, configs.settings.api_key);
                } else {
                    callback(new Error('wakatime key not found'), null);
                }
            }
        });
    }

    public setApiKey(apiKey:string, callback?) {
        if (apiKey) {
            let file = path.join(this.getUserHomeDir(), '.wakatime.cfg');
            let content = '[settings]\napi_key = ' + apiKey;
            fs.writeFile(file, content, function(err) {
                if (err) {
                    if (callback)
                        callback(new Error('could not write to ~/.wakatime.cfg'));
                } else {
                    if (callback)
                        callback(null);
                }
            });
        }
    }

    public promptForApiKey(callback, defaultKey?:string) {
        let options = {prompt: 'WakaTime API Key', value: defaultKey};
        vscode.window.showInputBox(options).then(function(apiKey) {
            callback(apiKey);
        });
    }

    public getUserHomeDir() {
        return process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] || '';
    }
}
