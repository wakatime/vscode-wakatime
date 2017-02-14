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

    (If you already have a WakaTime plugin installed, you won't be prompted for your api key.)

  5. Use VSCode like you normally do and your time will automatically be tracked for you.


Usage
-----

Visit https://wakatime.com to see your coding activity.

![Project Overview](./images/Screen-Shot-2016-03-21.png)


Configuring
-----------

Some settings are available from CMD+SHIFT+p, then typing `wakatime`.

Settings are stored in the INI file at `$HOME/.wakatime.cfg`.

More information can be found from [wakatime core](https://github.com/wakatime/wakatime#configuring).


Troubleshooting
---------------

First, turn on debug mode:

1. Press CMD+SHIFT+p
2. Type `wakatime.debug`, and press `Enter`.
3. Select `true`, then press `Enter`.

Next, open your Developer Console to view logs and errors:

`Help -> Toggle Developer Tools`

Errors outside the scope of vscode-wakatime go to `~/.wakatime.log` from [wakatime-cli][cli].

For more general troubleshooting information, see [wakatime/wakatime#troubleshooting][cli].


[cli]: https://github.com/wakatime/wakatime#troubleshooting
