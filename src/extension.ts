import * as vscode from 'vscode';

import { Logger } from './logger';
import { Options } from './options';
import { WakaTime } from './wakatime';

var logger = new Logger('info');
var wakatime: WakaTime;

export function activate(ctx: vscode.ExtensionContext) {
  var options = new Options();

  wakatime = new WakaTime(ctx.extensionPath, logger, options);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.apikey', function() {
      wakatime.promptForApiKey();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.proxy', function() {
      wakatime.promptForProxy();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.debug', function() {
      wakatime.promptForDebug();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.status_bar_icon', function() {
      wakatime.promptStatusBarIcon();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.status_bar_coding_activity', function() {
      wakatime.promptStatusBarCodingActivity();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.dashboard', function() {
      wakatime.openDashboardWebsite();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.config_file', function() {
      wakatime.openConfigFile();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('wakatime.log_file', function() {
      wakatime.openLogFile();
    }),
  );

  ctx.subscriptions.push(wakatime);

  options.getSetting('settings', 'debug', function(_error, debug) {
    if (debug && debug.trim() === 'true') {
      logger.setLevel('debug');
      logger.debug('::WakaTime debug mode::');
    }
    wakatime.initialize();
  });
}

export function deactivate() {
  wakatime.dispose();
  logger.info('WakaTime has been disabled!');
}
