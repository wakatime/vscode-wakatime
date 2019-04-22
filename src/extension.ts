import * as vscode from 'vscode';

import {
  COMMAND_API_KEY,
  COMMAND_PROXY,
  COMMAND_DEBUG,
  COMMAND_STATUS_BAR_ICON,
  COMMAND_STATUS_BAR_CODING_ACTIVITY,
  COMMAND_DASHBOARD,
  COMMAND_CONFIG_FILE,
  COMMAND_LOG_FILE,
} from './constants';
import { Logger } from './logger';
import { Options } from './options';
import { WakaTime } from './wakatime';

var logger = new Logger('info');
var wakatime: WakaTime;

export function activate(ctx: vscode.ExtensionContext) {
  var options = new Options();

  wakatime = new WakaTime(ctx.extensionPath, logger, options);

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_API_KEY, function() {
      wakatime.promptForApiKey();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_PROXY, function() {
      wakatime.promptForProxy();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DEBUG, function() {
      wakatime.promptForDebug();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_ICON, function() {
      wakatime.promptStatusBarIcon();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_STATUS_BAR_CODING_ACTIVITY, function() {
      wakatime.promptStatusBarCodingActivity();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_DASHBOARD, function() {
      wakatime.openDashboardWebsite();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_CONFIG_FILE, function() {
      wakatime.openConfigFile();
    }),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_LOG_FILE, function() {
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
