WakaTime for Visual Studio Code
===============================

Metrics, insights, and time tracking automatically generated from your programming activity.


Installation
------------

  1. Press `F1` or `CMD + Shift + P` and type `install`. Pick `Extensions: Install Extension`.

  ![type install](./images/type-install.png)

  2. Type `wakatime` and hit `enter`.

  ![type wakatime](./images/type-wakatime.png)

  3. Restart Visual Studio Code.

  4. Enter your [api key](https://wakatime.com/settings?apikey=true), then press `enter`.

    (If you’re not prompted, press `F1` or `CMD + Shift + P` then type `WakaTime API Key`.)

  5. Use VSCode and your coding activity will be displayed on your [WakaTime dashboard](https://wakatime.com).


Usage
-----

Visit https://wakatime.com to see your coding activity.

![Project Overview](./images/Screen-Shot-2016-03-21.png)


Configuring
-----------
> `$WAKATIME_HOME` defaults to `$HOME`

Some settings are available from CMD+SHIFT+p, then typing `wakatime`.

Settings are stored in the INI file at `$WAKATIME_HOME/.wakatime.cfg`.

More information can be found from [wakatime core](https://github.com/wakatime/wakatime#configuring).


Troubleshooting
---------------

First, turn on debug mode:

1. Press CMD+SHIFT+p
2. Type `wakatime.debug`, and press `Enter`.
3. Select `true`, then press `Enter`.

Next, open your Developer Console to view logs and errors:

`Help → Toggle Developer Tools`

Errors outside the scope of vscode-wakatime go to `$WAKATIME_HOME/.wakatime.log` from [wakatime-cli][wakatime-cli-help].

The [How to Debug Plugins][how to debug] guide shows how to check when coding activity was last received from your editor using the [Plugins Status Page][plugins status page].

For more general troubleshooting info, see the [wakatime-cli Troubleshooting Section][wakatime-cli-help].


[wakatime-cli-help]: https://github.com/wakatime/wakatime#troubleshooting
[how to debug]: https://wakatime.com/faq#debug-plugins
[plugins status page]: https://wakatime.com/plugin-status
