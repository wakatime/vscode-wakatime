
# Changelog


## 1.1.13 (2017-08-14)

- Use proxy when downloading dependencies. #22 #13


## 1.1.12 (2017-06-17)

- Fix Open WakaTime Dashboard command on Windows.


## 1.1.11 (2017-06-16)

- Setup custom commands before initializing plugin, so they still work even
  if initializing fails.


## 1.1.10 (2017-06-12)

- Prevent corrupting config file with log messages. #20


## 1.1.9 (2017-06-11)

- Fix bug which inverted status bar icon setting. #19


## 1.1.8 (2017-06-02)

- Force Python to use same config file as Vscode on Windows. #18


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

- Use proxy from ~/.wakatime.cfg when downloading dependencies. #13


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

