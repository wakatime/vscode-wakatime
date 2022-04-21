
# Changelog

## 18.1.1 (2022-04-21)

- Remove reference to window in web extension.
  [#269](https://github.com/wakatime/vscode-wakatime/issues/269)

## 18.1.0 (2022-04-08)

- Track time spent on unsaved sql queries in Azure Data Studio.
  [#266](https://github.com/wakatime/vscode-wakatime/issues/266)

## 18.0.11 (2022-04-05)

- Upgrade vscode engine to v1.59.0.

## 18.0.10 (2022-04-05)

- Downgrade vscode engine to support Azure Data Studio.

## 18.0.9 (2022-04-05)

- Append random string to wakatime-cli.zip to prevent file name collision when two workspaces open at same time.
  [#268](https://github.com/wakatime/vscode-wakatime/issues/268)

## 18.0.8 (2022-03-21)

- Display code time in status bar tooltip when status_bar_coding_activity set to false.
  [#265](https://github.com/wakatime/vscode-wakatime/issues/265)

## 18.0.7 (2022-03-06)

- Display error message when Defender prevents WakaTime from reading api key.
  [#251](https://github.com/wakatime/vscode-wakatime/issues/251)

## 18.0.6 (2022-02-17)

- Verbose logging around reading api key when debug enabled.
  [#251](https://github.com/wakatime/vscode-wakatime/issues/251)

## 18.0.5 (2022-02-02)

- Stop expiring api key in-memory cache and always pass api key to wakatime-cli.
  [#256](https://github.com/wakatime/vscode-wakatime/issues/256)

## 18.0.4 (2022-01-05)

- Prevent using empty cached wakatime-cli version.
  [sublime-wakatime#108](https://github.com/wakatime/sublime-wakatime/issues/108)

## 18.0.3 (2021-12-25)

- Improve status bar tooltip text.

## 18.0.2 (2021-12-24)

- Fix project and language detection on Web.

## 18.0.1 (2021-12-24)

- Update logo.

## 18.0.0 (2021-12-24)

- Add support for Windows arm64.
- Web extension.
  [#237](https://github.com/wakatime/vscode-wakatime/issues/237)


## 17.1.0 (2021-10-08)

- Remove legacy python wakatime-cli.

## 17.0.8 (2021-09-21)

- Separate INI file for internal configs.
  [wakatime-cli#535](https://github.com/wakatime/wakatime-cli/issues/535)

## 17.0.7 (2021-09-21)

- Default to CWD when HOME env var not set.
  [#238](https://github.com/wakatime/vscode-wakatime/issues/238)

## 17.0.6 (2021-09-21)

- Support when HOME env var not set.
  [#238](https://github.com/wakatime/vscode-wakatime/issues/238)

## 17.0.5 (2021-09-16)

- Add lines-in-file when sending heartbeat.

## 17.0.4 (2021-09-16)

- Add lineno and cursorpos when sending heartbeat.
- Prevent sending duplicate heartbeats from malfunctioning plugins.
  [#163](https://github.com/wakatime/vscode-wakatime/issues/163)
  [#193](https://github.com/wakatime/vscode-wakatime/issues/193)
  [#198](https://github.com/wakatime/vscode-wakatime/issues/198)

## 17.0.3 (2021-09-15)

- Fix tests badge image in readme.

## 17.0.2 (2021-09-15)

- Improve status bar tooltip text.
  [#215](https://github.com/wakatime/vscode-wakatime/issues/215)

## 17.0.1 (2021-09-14)

- Use api key from WAKATIME_API_KEY env var if defined.
  [#236](https://github.com/wakatime/vscode-wakatime/issues/236)

## 17.0.0 (2021-08-30)

- Default to new beta wakatime-cli, without fallback to legacy Python.

## 16.0.0 (2021-08-30)

- Default to legacy Python wakatime-cli.

## 15.0.2 (2021-08-23)

- Prevent fallback to legacy wakatime-cli when working offline.

## 15.0.1 (2021-08-18)

- Only use new beta Go wakatime-cli when fetching today code stats for status bar.

## 15.0.0 (2021-08-12)

- Enable new Go wakatime-cli by default.

## 14.0.3 (2021-07-30)

- Flag to enable new beta wakatime-cli in settings file.
  [#216](https://github.com/wakatime/vscode-wakatime/issues/216)

## 14.0.2 (2021-07-19)

- Prevent using new Go wakatime-cli when fetching today code stats.
  [#216](https://github.com/wakatime/vscode-wakatime/issues/216)

## 14.0.1 (2021-07-19)

- Fallback to raw value of os.arch when unable to detect architecture for wakatime-cli.
  [#216](https://github.com/wakatime/vscode-wakatime/issues/216)

## 14.0.0 (2021-07-06)

- Rollback Go wakatime-cli launch until random project names bug is fixed.

## 13.0.0 (2021-07-01)

- Use new Go wakatime-cli and fallback to legacy Python wakatime-cli on errors.

## 12.0.0 (2021-05-25)

- Rollback Go wakatime-cli launch.
  [#202](https://github.com/wakatime/vscode-wakatime/issues/202)
  [#203](https://github.com/wakatime/vscode-wakatime/issues/203)

## 11.0.0 (2021-05-24)

- Enable new Go wakatime-cli by default.

## 10.0.1 (2021-05-21)

- Fix bug using response variable when network error causes it to be undefined.
  [#200](https://github.com/wakatime/vscode-wakatime/issues/200)

## 10.0.0 (2021-05-19)

- Use legacy Python wakatime-cli to wait for bugfixes in Go wakatime-cli.
  [#196](https://github.com/wakatime/vscode-wakatime/issues/196)

## 9.0.5 (2021-05-18)

- Use plugin name in GitHub API User-Agent header, now that ETag not used.

## 9.0.4 (2021-05-18)

- GitHub ETag is not reliable, use Last-Modified-Since timestamp instead.

## 9.0.3 (2021-05-18)

- Include plugin name when reporting missing cli platforms to API.

## 9.0.2 (2021-05-18)

- Use same User-Agent header for all plugins, to share GitHub API cache.

## 9.0.1 (2021-05-18)

- Report missing wakatime-cli platform support to API.

## 9.0.0 (2021-05-17)

- Enable new Go wakatime-cli after Windows bugfixes.

## 8.0.0 (2021-05-05)

- Disable new Go wakatime-cli.
  [#191](https://github.com/wakatime/vscode-wakatime/issues/191)

## 7.0.2 (2021-05-05)

- Use --entity when passing file to wakatime-cli.

## 7.0.1 (2021-05-05)

- Show status bar icon by default, when not disabled in wakatime.cfg file.

## 7.0.0 (2021-05-05)

- Use Go wakatime-cli downloaded from GitHub releases, with legacy_python_cli wakatime.cfg option.

## 6.0.5 (2021-05-05)

- Create wakatime folder inside home folder before using.
  [#169](https://github.com/wakatime/vscode-wakatime/issues/169)
  [#188](https://github.com/wakatime/vscode-wakatime/issues/188)
  [#189](https://github.com/wakatime/vscode-wakatime/issues/189)
  [#190](https://github.com/wakatime/vscode-wakatime/issues/190)

## 6.0.4 (2021-05-05)

- Use extension folder to store wakatime-cli, because of issues saving to home folder.

## 6.0.3 (2021-05-04)

- Use home folder to store wakatime-cli, to prevent re-downloading every extension update.

## 6.0.2 (2021-05-04)

- Fix bug when writing multiple config values at once.

## 6.0.1 (2021-05-03)

- Use GitHub Releases api instead of Tags api for wakatime-cli alpha builds.

## 6.0.0 (2021-05-03)

- Support for Go wakatime-cli downloaded from GitHub Releases, when standalone false in cfg file.

## 5.0.1 (2021-02-19)

- Support global WakaTime installation.
  [#178](https://github.com/wakatime/vscode-wakatime/pull/178)

## 5.0.0 (2020-12-31)

- Support for Azure Data Studio editor app name.
  [#179](https://github.com/wakatime/vscode-wakatime/issues/179)

## 4.0.10 (2020-12-21)

- Support for Onivim 2 editor app name.
  [#173](https://github.com/wakatime/vscode-wakatime/issues/173)

## 4.0.9 (2020-10-05)

- Prevent opening cmd window when sending heartbeats on Windows platform.
  [#166](https://github.com/wakatime/vscode-wakatime/issues/166)
- Allow proxy config to be empty or removable.
  [#164](https://github.com/wakatime/vscode-wakatime/issues/164)

## 4.0.8 (2020-09-13)

- Config option to disable extension.
  [#141](https://github.com/wakatime/vscode-wakatime/issues/141)

## 4.0.7 (2020-08-25)

- Downgrade request library to v2.88.0 because possible bad deprecated release.
  [#160](https://github.com/wakatime/vscode-wakatime/issues/160)


## 4.0.6 (2020-08-24)

- Fix plugin initializing.
  [#156](https://github.com/wakatime/vscode-wakatime/issues/156)


## 4.0.5 (2020-08-23)

- Listen for errors when downloading zip file to prevent extension crash.
  [#154](https://github.com/wakatime/vscode-wakatime/issues/154)


## 4.0.4 (2020-08-23)

- Switch back to request library since urllib causing problems on Linux.
  [#155](https://github.com/wakatime/vscode-wakatime/issues/155)


## 4.0.3 (2020-08-22)

- Use options when fetching to increase default timeout.
  [#154](https://github.com/wakatime/vscode-wakatime/issues/154)


## 4.0.2 (2020-08-22)

- Increase default network timeout from 5s to 60s.
  [#154](https://github.com/wakatime/vscode-wakatime/issues/154)


## 4.0.1 (2020-08-22)

- Replace deprecated request library with urllib.
  [#150](https://github.com/wakatime/vscode-wakatime/issues/150)


## 4.0.0 (2020-02-23)

- Download wakatime-cli standalone as zipped folder for improved performance.


## 3.0.1 (2020-02-22)

- Prevent sending heartbeats before wakatime-cli has finished downloading.


## 3.0.0 (2020-02-22)

- Use standalone wakatime-cli by default over source version.


## 2.3.2 (2020-02-22)

- Use exe file extension for standalone wakatime-cli on Windows platform.


## 2.3.1 (2020-02-19)

- Support for standalone wakatime-cli, off by default.


## 2.3.0 (2020-02-09)

- Detect python in Windows LocalAppData install locations.
- Upgrade embedded python to v3.8.1.


## 2.2.1 (2019-10-23)

- Support Portable version on all platforms.
  [#116](https://github.com/wakatime/vscode-wakatime/issues/116)


## 2.2.0 (2019-07-20)

- Respect no_ssl_verify config for all network requests.
  [#111](https://github.com/wakatime/vscode-wakatime/issues/111)


## 2.1.2 (2019-05-22)

- Improvements around status bar enabled setting.
  [#102](https://github.com/wakatime/vscode-wakatime/issues/102)


## 2.1.1 (2019-05-14)

- Bug fix: prevent reading api key from disc when cached in memory.
  [#101](https://github.com/wakatime/vscode-wakatime/issues/101)


## 2.1.0 (2019-05-08)

- Support for remote development.
  [#95](https://github.com/wakatime/vscode-wakatime/issues/95)


## 2.0.9 (2019-05-05)

- Fix status_bar_enabled option in package contributing commands.
  [#97](https://github.com/wakatime/vscode-wakatime/issues/97)


## 2.0.8 (2019-04-30)

- Rename status_bar_enabled setting from status_bar_icon.


## 2.0.7 (2019-04-25)

- Handle exceptions from execFile when searching for Python.
  [#94](https://github.com/wakatime/vscode-wakatime/issues/94)


## 2.0.6 (2019-04-23)

- Show status bar time in localized timezone instead of UTC.


## 2.0.5 (2019-04-23)

- Throttle fetching status bar coding stats to once per minute.
- Suppress error when unable to fetch coding stats while working offline.


## 2.0.4 (2019-04-23)

- Fix extension marketplace content by including images in package contents.


## 2.0.3 (2019-04-23)

- Use api subdomain for fetching status bar time.


## 2.0.2 (2019-04-23)

- Fix extension marketplace content from missing readme.


## 2.0.1 (2019-04-22)

- Fix extension entry point.
  [#93](https://github.com/wakatime/vscode-wakatime/issues/93)


## 2.0.0 (2019-04-22)

- Status bar item shows coding activity for Today.
  [#92](https://github.com/wakatime/vscode-wakatime/pull/92)
- Clicking status bar icon opens WakaTime dashboard website.


## 1.3.0 (2019-04-17)

- Support for Portable Mode with config files in code-portable-data folder.
  [#91](https://github.com/wakatime/vscode-wakatime/pull/91)
- New commands wakatime.config_file and wakatime.log_file.
  [#91](https://github.com/wakatime/vscode-wakatime/pull/91)


## 1.2.14 (2019-04-09)

- Handle exceptions when calling execFile.


## 1.2.13 (2019-03-13)

- Add keywords to package for improved discoverability.


## 1.2.12 (2019-03-06)

- Re-enable minifying webpack output.


## 1.2.11 (2019-03-06)

- Use extensionPath from extension context because storagePath not available on
  Windows and Linux platforms.
  [#84](https://github.com/wakatime/vscode-wakatime/issues/84)


## 1.2.10 (2019-03-06)

- Stop minifying webpack output to improve debugging.
- Use storagePath from extension context instead of whole context object.
  [#84](https://github.com/wakatime/vscode-wakatime/issues/84)


## 1.2.9 (2019-03-06)

- Use extension context storage path for wakatime cli dependencies location.
  [#84](https://github.com/wakatime/vscode-wakatime/issues/84)


## 1.2.8 (2019-03-06)

- Retrieve extension json directy from vscode library instead of passing as
  constructor argument.
  [#84](https://github.com/wakatime/vscode-wakatime/issues/84)


## 1.2.7 (2019-02-23)

- Fix dependencies path.


## 1.2.6 (2019-02-23)

- Use webpack to bundle imports and speed up plugin load time.


## 1.2.5 (2018-12-14)

- Only quote args passed to wakatime-cli.
  [#73](https://github.com/wakatime/vscode-wakatime/pull/73)


## 1.2.4 (2018-11-30)

- Fix bug on Windows platform caused by spaces in wakatime-cli command args.
  [#69](https://github.com/wakatime/vscode-wakatime/pull/69)


## 1.2.3 (2018-07-06)

- Prefer Python 3 if available.
  [#58](https://github.com/wakatime/vscode-wakatime/pull/58)


## 1.2.2 (2018-05-12)

- Improve extension startup time by lazy importing dependencies.
  [#53](https://github.com/wakatime/vscode-wakatime/issues/53)


## 1.2.1 (2018-04-23)

- Prevent using unsupported Python 3 versions.


## 1.2.0 (2018-04-04)

- Prefer Python3 over Python2 when running wakatime-cli core.
- Improve detection of Python3 on Ubuntu 17.10 platforms.


## 1.1.26 (2018-03-21)

- Use fs.unlink instead of fs.unlinkSync to prevent problems on Windows OS.
  [#49](https://github.com/wakatime/vscode-wakatime/issues/49)


## 1.1.25 (2018-03-20)

- Upgrade node dependencies to latest versions.


## 1.1.24 (2018-03-13)

- Status bar tooltip hover text now shows when finished initializing.


## 1.1.23 (2018-03-12)

- Shorten status bar text.
  [#47](https://github.com/wakatime/vscode-wakatime/issues/47)


## 1.1.22 (2017-12-08)

- Support for `WAKATIME_HOME` ENV variable to configure log and cfg folder.
  [#36](https://github.com/wakatime/vscode-wakatime/pull/36)
- Support vscode multi-root workspaces
  [#37](https://github.com/wakatime/vscode-wakatime/pull/37)


## 1.1.21 (2017-10-26)

- Also check stderr for Python version when detecting supported versions.
  [#29](https://github.com/wakatime/vscode-wakatime/issues/29)


## 1.1.20 (2017-10-25)

- Remove tags files from published package.


## 1.1.19 (2017-10-25)

- Prevent using old Anaconda python distributions because they parse arguments
  containing spaces incorrectly.
  [#28](https://github.com/wakatime/vscode-wakatime/issues/28)
- Stop wrapping args containing spaces with quotes.


## 1.1.18 (2017-10-24)

- Wrap args containing spaces with quotes to prevent child_process treating
  one argument as two.


## 1.1.17 (2017-10-19)

- Upgrade node dependencies to fix deprecation warning.
  [#27](https://github.com/wakatime/vscode-wakatime/issues/27)


## 1.1.16 (2017-09-24)

- Prevent side-effects from adding methods to built-in String.prototype.
  [#26](https://github.com/wakatime/vscode-wakatime/issues/26)


## 1.1.15 (2017-09-18)

- Fix install instructions for new marketplace markdown parser.


## 1.1.14 (2017-09-18)

- SVG logos no longer supported, using PNG instead.


## 1.1.13 (2017-08-14)

- Use proxy when downloading dependencies.
  [#13](https://github.com/wakatime/vscode-wakatime/issues/13)
  [#22](https://github.com/wakatime/vscode-wakatime/issues/22)


## 1.1.12 (2017-06-17)

- Fix Open WakaTime Dashboard command on Windows.


## 1.1.11 (2017-06-16)

- Setup custom commands before initializing plugin, so they still work even
  if initializing fails.


## 1.1.10 (2017-06-12)

- Prevent corrupting config file with log messages.
  [#20](https://github.com/wakatime/vscode-wakatime/issues/20)


## 1.1.9 (2017-06-11)

- Fix bug which inverted status bar icon setting.
  [#19](https://github.com/wakatime/vscode-wakatime/issues/19)


## 1.1.8 (2017-06-02)

- Force Python to use same config file as Vscode on Windows.
  [#18](https://github.com/wakatime/vscode-wakatime/issues/18)


## 1.1.7 (2017-05-24)

- Add newline to package.json to allow installing plugin without crash.


## 1.1.6 (2017-05-16)

- Open Dashboard by pressing CMD+SHIFT+p then selecting WakaTime Dashboard
  command.


## 1.1.5 (2017-05-13)

- Ability to hide status bar icon by pressing CMD+SHIFT+p then editing the
  WakaTime Status Bar Icon setting. #17


## 1.1.4 (2017-02-23)

- When API Key not entered correctly, re-prompt for api key instead of showing
  an error.


## 1.1.3 (2017-02-16)

- Fix bug preventing settings from being saved when config file not already
  created.


## 1.1.2 (2017-02-15)

- Allow https, socks5, and NTLM proxy formats.


## 1.1.1 (2017-02-14)

- Display current debug setting when changing from command pallet.


## 1.1.0 (2017-02-14)

- Ability to set proxy from command pallet.


## 1.0.10 (2017-02-14)

- Fix bug causing logging to always be set to debug level.
- Update log level when debug setting changed, without requiring restart.


## 1.0.9 (2017-02-14)

- Improve logging, only printing debug messages when debug set to true.


## 1.0.8 (2017-02-13)

- Use proxy from ~/.wakatime.cfg when downloading dependencies.
  [#13](https://github.com/wakatime/vscode-wakatime/issues/13)


## 1.0.7 (2017-02-11)

- New command pallet command WakaTime Settings, for changing api key.


## 1.0.6 (2016-06-14)

- Use currently open VSCode project as alternate project when not found from
  revision control folder.


## 1.0.5 (2016-06-14)

- Remove core async to fix bug where core not removed before extracting.
- Update rimraf to v2.5.2.
- Upgrade request to v2.72.0.


## 1.0.4 (2016-03-21)

- update product screenshot


## 1.0.3 (2016-01-26)

- improve status bar feedback messages
- upgrade embedded windows python version to 3.5.1


## 1.0.2 (2015-12-02)

- remove dependency on winreg


## 1.0.1 (2015-12-02)

- update status bar message when finished initializing


## 1.0.0 (2015-12-01)

- fallback to embedded Python when system installed Python is broken
- get extension version from package.json instead of hard-coding


## 0.1.2 (2015-11-20)

- correct path to embedded Python on Windows


## 0.1.1 (2015-11-20)

- minor bug fix


## 0.1.0 (2015-11-20)

- use embeddable Python instead of installing Python on Windows


## 0.0.2 (2015-11-17)

- readme formatting fix



## 0.0.1 (2015-11-16)

- Birth
