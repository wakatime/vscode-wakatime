# WakaTime for Arduino IDE

[![Tests](https://img.shields.io/github/actions/workflow/status/wakatime/vscode-wakatime/on_push.yml?branch=master&label=tests)](https://github.com/wakatime/vscode-wakatime/actions)
[![Version](https://img.shields.io/visual-studio-marketplace/v/WakaTime.vscode-wakatime.png?label=Visual%20Studio%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=WakaTime.vscode-wakatime)
[![WakaTime](https://wakatime.com/badge/github/wakatime/vscode-wakatime.png?branch=master)](https://wakatime.com/badge/github/wakatime/vscode-wakatime)

[WakaTime][wakatime] is an open source VS Code plugin for metrics, insights, and time tracking automatically generated from your programming activity.

[Arduino IDE](https://github.com/arduino/arduino-ide) `2.x` has been entirely rewritten and share no code with `1.x`. The new IDE is based on [Theia IDE](https://theia-ide.org/) framework and build with [Electron](https://www.electronjs.org/). It natively supports VSCODE extensions so we can use [WakaTime VSCODE](https://github.com/wakatime/vscode-wakatime) extension to track your coding time.

## Installation

Unfortunately there's no native way to install VSCODE extensions in Arduino IDE so far. So we have to install it manually.

1. Download the latest vscode-wakatime plugin vsix from [open-vsx.org](https://open-vsx.org/extension/WakaTime/vscode-wakatime).
2. Rename the `.vsix` file to `.zip`.
3. Extract the zip file into `~/.arduinoIDE/plugins/vscode-wakatime`.
4. Relaunch your Arduino IDE.
5. Enter your [api key](https://wakatime.com/api-key), then press enter.
   > (If you’re not prompted, press `F1` or `⌘ + Shift + P` then type `WakaTime API Key`.)
6. Use Arduino IDE like you normally do and your coding activity will be displayed on your [WakaTime Dashboard](https://wakatime.com/).

## Usage

Visit [https://wakatime.com](https://wakatime.com) to see your coding activity.

![Project Overview](https://wakatime.com/static/img/ScreenShots/Screen-Shot-2016-03-21.png)

## Configuring

VS Code specific settings are available from `⌘ + Shift + P`, then typing `wakatime`.

For example, to hide today's coding activity in your status bar:

Press `⌘ + Shift + P` then set `WakaTime: Status Bar Coding Activity` to `false`.

Extension settings are stored in the INI file at `$HOME/.wakatime.cfg`.

More information can be found from [wakatime-cli][wakatime-cli configs].

Notes:

1. `$HOME` defaults to `$HOME`
1. To disable the extension at startup add `disabled=true` to your config, this operation can also be performed by pressing `⌘ + Shift + P` and selecting `WakaTime: Disable`.

## Troubleshooting

First, turn on debug mode:

1. Press `F1` or `⌘ + Shift + P`
2. Type `> WakaTime: Debug`, and press `Enter`.
3. Select `true`, then press `Enter`.

Next, open your Developer Console to view logs and errors:

`Help → Toggle Developer Tools`

Errors outside the scope of vscode-wakatime go to `$HOME/.wakatime/wakatime.log` from [wakatime-cli][wakatime-cli help].

The [How to Debug Plugins][how to debug] guide shows how to check when coding activity was last received from your editor using the [Plugins Status Page][plugins status page].

**Microsoft Windows Only:** Using WakaTime behind a corporate proxy? Try enabling your Windows Root Certs inside VS Code with the [win-ca][winca] extension:
Press `Ctrl + Shift + X`, search for `win-ca`, press `Install`.

For more general troubleshooting info, see the [wakatime-cli Troubleshooting Section][wakatime-cli help].

## Uninstalling

1. Delete folder `~/.arduinoIDE/plugins/vscode-wakatime`.

## Contributing

Pull requests, bug reports, and feature requests are welcome!
Please search [existing issues][issues] before creating a new one.

Many thanks to all [contributors](AUTHORS)!

Made with :heart: by the [WakaTime Team][about].

[wakatime]: https://wakatime.com/vs-code
[wakatime-cli help]: https://github.com/wakatime/wakatime-cli/blob/develop/TROUBLESHOOTING.md
[wakatime-cli configs]: https://github.com/wakatime/wakatime-cli/blob/develop/USAGE.md
[how to debug]: https://wakatime.com/faq#debug-plugins
[plugins status page]: https://wakatime.com/plugin-status
[winca]: https://github.com/ukoloff/win-ca/tree/master/vscode
[issues]: https://github.com/wakatime/vscode-wakatime/issues
[about]: https://wakatime.com/about
