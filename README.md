# WakaTime for Visual Studio Code

[![Build Status](https://travis-ci.com/wakatime/vscode-wakatime.png?branch=master)](https://travis-ci.com/wakatime/vscode-wakatime)
![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/WakaTime.vscode-wakatime.png?label=Visual%20Studio%20Marketplace)
[![Coding time tracker](https://wakatime.com/badge/github/wakatime/vscode-wakatime.png?branch=master)](https://wakatime.com/badge/github/wakatime/vscode-wakatime)

[WakaTime][wakatime] is an open source VS Code plugin for metrics, insights, and time tracking automatically generated from your programming activity.


## Installation

1. Press `F1` or `⌘ + Shift + P` and type `install`. Pick `Extensions: Install Extension`.

    ![type install](./images/type-install.png)
2. Type `wakatime` and hit `enter`.

    ![type wakatime](./images/type-wakatime.png)

3. Restart Visual Studio Code.

4. Enter your [api key](https://wakatime.com/settings?apikey=true), then press `enter`.

    > (If you’re not prompted, press `F1` or `⌘ + Shift + P` then type `WakaTime API Key`.)

5. Use VSCode and your coding activity will be displayed on your [WakaTime dashboard](https://wakatime.com)


## Usage

Visit https://wakatime.com to see your coding activity.

![Project Overview](./images/Screen-Shot-2016-03-21.png)


## Configuring

VS Code specific settings are available from `⌘ + Shift + P`, then typing `wakatime`.

For example, to hide today's coding activity in your status bar:

Press `⌘ + Shift + P` then set `WakaTime: Status Bar Coding Activity` to `false`.

Extension settings are stored in the INI file at `$WAKATIME_HOME/.wakatime.cfg`.

More information can be found from [wakatime core](https://github.com/wakatime/wakatime#configuring).

Notes:
1. `$WAKATIME_HOME` defaults to `$HOME`
1. To disable the extension at startup add `disabled=true` to your config, this operation can also be performed by pressing `⌘ + Shift + P` and selecting `WakaTime: Disable`.

## Troubleshooting

First, turn on debug mode:

1. Press `F1` or `⌘ + Shift + P`
2. Type `> WakaTime: Debug`, and press `Enter`.
3. Select `true`, then press `Enter`.

Next, open your Developer Console to view logs and errors:

`Help → Toggle Developer Tools`

Errors outside the scope of vscode-wakatime go to `$WAKATIME_HOME/.wakatime.log` from [wakatime-cli][wakatime-cli-help].

The [How to Debug Plugins][how to debug] guide shows how to check when coding activity was last received from your editor using the [Plugins Status Page][plugins status page].

**Microsoft Windows Only:** Using WakaTime behind a corporate proxy? Try enabling your Windows Root Certs inside VS Code with the [win-ca][winca] extension:
Press `Ctrl + Shift + X`, search for `win-ca`, press `Install`.

For more general troubleshooting info, see the [wakatime-cli Troubleshooting Section][wakatime-cli-help].

[wakatime]: https://wakatime.com/vs-code
[wakatime-cli-help]: https://github.com/wakatime/wakatime#troubleshooting
[how to debug]: https://wakatime.com/faq#debug-plugins
[plugins status page]: https://wakatime.com/plugin-status
[winca]: https://github.com/ukoloff/win-ca/tree/master/vscode
