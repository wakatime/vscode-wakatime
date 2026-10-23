const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const apiKey = '11111111-1111-4111-8111-111111111111';
const logger = { debug() {}, warn() {} };

function fixture(t, fsOverrides = {}, platform = process.platform) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-wakatime-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const env = { HOME: home, USERPROFILE: home };
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const calls = [];
  let onWrite;
  const configFs = {
    ...fs,
    ...fsOverrides,
    writeFile(file, contents, options, callback) {
      (fsOverrides.writeFile || fs.writeFile)(file, contents, options, (err) => {
        callback(err);
        if (!err) onWrite();
      });
    },
  };

  function load(name) {
    const filename = path.join(__dirname, '..', 'out', 'src', `${name}.js`);
    const exports = {};
    const originalRequire = createRequire(filename);
    vm.runInNewContext(
      fs.readFileSync(filename, 'utf8'),
      {
        exports,
        process: { env, cwd: () => home },
        require(name) {
          if (name === 'fs') return configFs;
          if (name === 'path') return paths;
          if (name === 'os') {
            return {
              ...os,
              platform: () => platform,
              homedir: () => env[platform === 'win32' ? 'USERPROFILE' : 'HOME'],
            };
          }
          if (name === 'child_process') {
            return {
              execFile(binary, args) {
                calls.push({ binary, args });
                return new EventEmitter();
              },
            };
          }
          if (name === './dependencies') return { Dependencies: class {} };
          if (name === 'vscode') {
            return {
              workspace: { getConfiguration: () => ({ get: () => undefined }) },
              window: { showErrorMessage() {} },
            };
          }
          if (name.startsWith('./')) return load(name.slice(2));
          return originalRequire(name);
        },
      },
      { filename },
    );
    return exports;
  }

  return {
    root,
    home,
    env,
    calls,
    Desktop: load('desktop').Desktop,
    options: () => new (load('options').Options)(logger, path.join(home, '.wakatime')),
    wakatime: () => new (load('wakatime').WakaTime)(root, logger),
    write(action) {
      return new Promise((resolve) => {
        onWrite = resolve;
        action();
      });
    },
  };
}

function writeConfig(file, contents = `[settings]\napi_key = ${apiKey}\ndisabled = true\n`) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, contents, { mode: 0o600 });
}

for (const configHome of [undefined, '', 'relative-config', '~/.config']) {
  test(`uses the default XDG path for XDG_CONFIG_HOME=${configHome}`, (t) => {
    const f = fixture(t);
    f.env.XDG_CONFIG_HOME = configHome;
    assert.equal(
      f.options().getConfigFile(false),
      path.join(f.home, '.config', 'wakatime', 'wakatime.cfg'),
    );
    assert.equal(fs.existsSync(path.join(f.home, '.config')), false);
    assert.equal(fs.existsSync(path.join(f.home, '.wakatime.cfg')), false);
  });
}

test('reads the API key and extension settings from a custom XDG config', async (t) => {
  const f = fixture(t);
  f.env.XDG_CONFIG_HOME = path.join(f.root, 'custom-config');
  const file = path.join(f.env.XDG_CONFIG_HOME, 'wakatime', 'wakatime.cfg');
  writeConfig(file);
  const options = f.options();
  assert.equal(options.getConfigFile(false), file);
  assert.equal(await options.getApiKey(), apiKey);
  assert.equal(await options.getSettingAsync('settings', 'disabled'), 'true');
  assert.equal(await new Promise((resolve) => options.hasApiKey(resolve)), true);
  assert.equal(fs.existsSync(path.join(f.home, '.wakatime.cfg')), false);
});

for (const contents of ['', '[settings]\napi_key = legacy-key\n']) {
  test(`keeps ${contents ? 'an existing' : 'an empty'} legacy config authoritative`, async (t) => {
    const f = fixture(t);
    const legacy = path.join(f.home, '.wakatime.cfg');
    writeConfig(legacy, contents);
    writeConfig(path.join(f.home, '.config', 'wakatime', 'wakatime.cfg'));
    const options = f.options();
    assert.equal(options.getConfigFile(false), legacy);
    assert.equal(
      await options.getSettingAsync('settings', 'api_key'),
      contents ? 'legacy-key' : null,
    );
  });
}

test('keeps legacy stat errors authoritative', (t) => {
  const f = fixture(t, {
    statSync() {
      throw Object.assign(new Error('permission denied'), { code: 'EACCES' });
    },
  });
  assert.equal(f.options().getConfigFile(false), path.join(f.home, '.wakatime.cfg'));
});

test('does not fall back when the legacy config cannot be read', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.home, '.wakatime.cfg'));
  writeConfig(path.join(f.home, '.config', 'wakatime', 'wakatime.cfg'));
  await assert.rejects(f.options().getSettingAsync('settings', 'api_key'), /could not read/);
});

test('honors WAKATIME_HOME before XDG and portable paths even when it does not exist', (t) => {
  const f = fixture(t);
  f.env.WAKATIME_HOME = path.join(f.root, 'missing-waka-home');
  f.env.VSCODE_PORTABLE = path.join(f.root, 'portable');
  assert.equal(f.options().getConfigFile(false), path.join(f.env.WAKATIME_HOME, '.wakatime.cfg'));
  assert.equal(fs.existsSync(f.env.WAKATIME_HOME), false);
});

test('expands WAKATIME_HOME relative to the user home', (t) => {
  const f = fixture(t);
  f.env.WAKATIME_HOME = '~/waka-home';
  assert.equal(f.options().getConfigFile(false), path.join(f.home, 'waka-home', '.wakatime.cfg'));
});

for (const [platform, directory] of [
  ['linux', '~literal'],
  ['win32', '~literal'],
  ['linux', "'literal"],
  ['linux', '"literal'],
]) {
  test(`keeps ${directory} safe for CLI config expansion on ${platform}`, async (t) => {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    const file = '.' + paths.sep + paths.join(directory, '.wakatime.cfg');
    const f = fixture(
      t,
      {
        readFile(selectedFile, encoding, callback) {
          if (selectedFile === file) callback(null, `[settings]\napi_key = ${apiKey}\n`);
          else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        },
      },
      platform,
    );
    f.env.WAKATIME_HOME = '.' + paths.sep + directory;
    const options = f.options();
    assert.equal(options.getConfigFile(false), file);
    assert.equal(await options.getApiKey(), apiKey);
  });
}

for (const wakaHome of ['~', '~/waka-home', '~\\waka-home']) {
  test(`expands Windows WAKATIME_HOME=${wakaHome} using HOME before USERPROFILE`, async (t) => {
    const file = path.win32.join('D:\\custom-home', wakaHome.slice(1), '.wakatime.cfg');
    const f = fixture(
      t,
      {
        readFile(selectedFile, encoding, callback) {
          if (selectedFile === file) callback(null, `[settings]\napi_key = ${apiKey}\n`);
          else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        },
      },
      'win32',
    );
    f.env.HOME = 'D:\\custom-home';
    f.env.USERPROFILE = 'C:\\Users\\test';
    f.env.WAKATIME_HOME = wakaHome;
    const options = f.options();
    assert.equal(options.getConfigFile(false), file);
    assert.equal(await options.getApiKey(), apiKey);
  });
}

test('expands Windows WAKATIME_HOME using USERPROFILE when HOME is unset', (t) => {
  const f = fixture(t, {}, 'win32');
  delete f.env.HOME;
  f.env.USERPROFILE = 'C:\\Users\\test';
  f.env.WAKATIME_HOME = '~/waka-home';
  assert.equal(f.options().getConfigFile(false), 'C:\\Users\\test\\waka-home\\.wakatime.cfg');
});

test('expands Windows WAKATIME_HOME using HOMEDRIVE and HOMEPATH as the last fallback', (t) => {
  const f = fixture(t, {}, 'win32');
  delete f.env.HOME;
  delete f.env.USERPROFILE;
  f.env.HOMEDRIVE = 'D:';
  f.env.HOMEPATH = '\\custom-home';
  f.env.WAKATIME_HOME = '~/waka-home';
  assert.equal(f.options().getConfigFile(false), 'D:\\custom-home\\waka-home\\.wakatime.cfg');
});

test('does not expand Windows WAKATIME_HOME with an incomplete home pair', (t) => {
  const f = fixture(
    t,
    {
      statSync() {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
    },
    'win32',
  );
  delete f.env.HOME;
  delete f.env.USERPROFILE;
  f.env.HOMEDRIVE = 'D:';
  f.env.WAKATIME_HOME = '~/waka-home';
  assert.equal(
    f.options().getConfigFile(false),
    path.win32.join(f.home, '.config', 'wakatime', 'wakatime.cfg'),
  );
});

for (const [home, file] of [
  ['C:', 'C:.wakatime.cfg'],
  ['\\\\?\\C:\\..\\waka', '\\\\?\\C:\\waka\\.wakatime.cfg'],
  ['\\\\?\\UNC\\host\\share\\..\\waka', '\\\\?\\UNC\\host\\share\\waka\\.wakatime.cfg'],
  ['\\\\host\\..\\Config', '\\Config\\.wakatime.cfg'],
  ['\\\\.\\..\\Config', '\\Config\\.wakatime.cfg'],
  ['\\\\?\\..\\Config', '\\Config\\.wakatime.cfg'],
  ['\\a\\..\\??\\C:\\Config', '\\.\\??\\C:\\Config\\.wakatime.cfg'],
  ['.\\C:\\Config', '.\\C:\\Config\\.wakatime.cfg'],
  ['file:', 'file:.wakatime.cfg'],
  ['file:/Config', '.\\file:\\Config\\.wakatime.cfg'],
]) {
  test('preserves the Go Windows path in WAKATIME_HOME=' + JSON.stringify(home), async (t) => {
    const f = fixture(
      t,
      {
        readFile(selectedFile, encoding, callback) {
          if (selectedFile === file) callback(null, `[settings]\napi_key = ${apiKey}\n`);
          else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
        },
      },
      'win32',
    );
    f.env.WAKATIME_HOME = home;
    const options = f.options();
    assert.equal(options.getConfigFile(false), file);
    assert.equal(await options.getApiKey(), apiKey);
  });
}

for (const [home, wakaHome, file] of [
  ['C:\\', '~', 'C:\\.wakatime.cfg'],
  ['C:\\Users\\test', '~/file:/', 'C:\\Users\\test\\file:.wakatime.cfg'],
  ['\\', '~\\??\\C:\\Config', '\\.\\??\\C:\\Config\\.wakatime.cfg'],
]) {
  test(
    'joins Windows tilde expansion before adding the filename for ' + JSON.stringify(wakaHome),
    (t) => {
      const f = fixture(t, {}, 'win32');
      f.env.HOME = home;
      f.env.WAKATIME_HOME = wakaHome;
      assert.equal(f.options().getConfigFile(false), file);
    },
  );
}

for (const portable of [false, true]) {
  test(`ignores an unexpandable WAKATIME_HOME before ${portable ? 'portable' : 'XDG'} fallback`, async (t) => {
    const f = fixture(t, { existsSync: () => true });
    f.env.WAKATIME_HOME = '~another-user';
    if (portable) f.env.VSCODE_PORTABLE = path.join(f.root, 'portable');
    const file = portable
      ? path.join(f.env.VSCODE_PORTABLE, '.wakatime.cfg')
      : path.join(f.home, '.config', 'wakatime', 'wakatime.cfg');
    writeConfig(file);
    const options = f.options();
    assert.equal(options.getConfigFile(false), file);
    assert.equal(await options.getApiKey(), apiKey);
  });
}

test('uses USERPROFILE rather than HOME after rejecting a Windows WAKATIME_HOME', async (t) => {
  const file = 'C:\\Users\\test\\.config\\wakatime\\wakatime.cfg';
  const f = fixture(
    t,
    {
      existsSync: () => true,
      statSync() {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
      readFile(selectedFile, encoding, callback) {
        if (selectedFile === file) callback(null, `[settings]\napi_key = ${apiKey}\n`);
        else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
      },
    },
    'win32',
  );
  f.env.HOME = 'D:\\custom-home';
  f.env.USERPROFILE = 'C:\\Users\\test';
  f.env.WAKATIME_HOME = '~another-user';
  const options = f.options();
  assert.equal(options.getConfigFile(false), file);
  assert.equal(await options.getApiKey(), apiKey);
});

test('retains portable config and resource paths', (t) => {
  const f = fixture(t);
  f.env.VSCODE_PORTABLE = path.join(f.root, 'portable');
  assert.equal(f.options().getConfigFile(false), path.join(f.env.VSCODE_PORTABLE, '.wakatime.cfg'));
  assert.equal(f.Desktop.getHomeDirectory(), f.env.VSCODE_PORTABLE);
});

// Includes Go 1.27.3's Windows IsAbs cases:
// https://github.com/golang/go/blob/go1.27.3/src/path/filepath/path_test.go#L1077
const windowsDefaultConfig = 'C:\\Users\\test\\.config\\wakatime\\wakatime.cfg';
const windowsConfigPaths = [
  ['', windowsDefaultConfig],
  ['relative-config', windowsDefaultConfig],
  ['relative\\config\\nested', windowsDefaultConfig],
  ['/Config', windowsDefaultConfig],
  ['\\Config', windowsDefaultConfig],
  ['C:\\', 'C:\\wakatime\\wakatime.cfg'],
  ['c\\', windowsDefaultConfig],
  ['c::', windowsDefaultConfig],
  ['c:', windowsDefaultConfig],
  ['/', windowsDefaultConfig],
  ['\\', windowsDefaultConfig],
  ['\\Windows', windowsDefaultConfig],
  ['c:a\\b', windowsDefaultConfig],
  ['c:\\a\\b', 'c:\\a\\b\\wakatime\\wakatime.cfg'],
  ['c:/a/b', 'c:\\a\\b\\wakatime\\wakatime.cfg'],
  ['1:\\Config', '1:\\Config\\wakatime\\wakatime.cfg'],
  ['é:\\Config', windowsDefaultConfig],
  ['\\\\host\\share', '\\\\host\\share\\wakatime\\wakatime.cfg'],
  ['\\\\host\\share\\', '\\\\host\\share\\wakatime\\wakatime.cfg'],
  ['\\\\host\\share\\foo', '\\\\host\\share\\foo\\wakatime\\wakatime.cfg'],
  ['//host/share/foo/bar', '\\\\host\\share\\foo\\bar\\wakatime\\wakatime.cfg'],
  ['\\\\..\\..\\a', windowsDefaultConfig],
  ['//../../a', windowsDefaultConfig],
  ['\\\\i\\..\\c$', windowsDefaultConfig],
  ['//?/../x', windowsDefaultConfig],
  ['//./../x', windowsDefaultConfig],
  ['\\\\?\\a\\b\\c', '\\\\?\\a\\b\\c\\wakatime\\wakatime.cfg'],
  ['\\??\\a\\b\\c', '\\??\\a\\b\\c\\wakatime\\wakatime.cfg'],
  ['\\??\\volume', windowsDefaultConfig],
  ['\\??\\volume\\', '\\??\\volume\\wakatime\\wakatime.cfg'],
  ['\\\\?\\UNC\\host\\share\\Config', '\\\\?\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg'],
  ['\\??\\UNC\\host\\share\\Config', '\\??\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg'],
  ['\\\\?\\UNC\\host\\..\\Config', windowsDefaultConfig],
  ['\\??\\UNC\\host\\..\\Config', windowsDefaultConfig],
  ['\\\\?\\C:\\..\\Config', '\\\\?\\C:\\Config\\wakatime\\wakatime.cfg'],
  ['\\??\\C:\\..\\Config', '\\??\\C:\\Config\\wakatime\\wakatime.cfg'],
  [
    '\\\\?\\UNC\\host\\share\\..\\Config',
    '\\\\?\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg',
  ],
  [
    '\\\\.\\UNC\\host\\share\\..\\Config',
    '\\\\.\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg',
  ],
  ['\\??\\UNC\\host\\share\\..\\Config', '\\??\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg'],
  ['\\\\?\\C:\\nested\\..\\..\\Config', '\\\\?\\C:\\Config\\wakatime\\wakatime.cfg'],
  ['//?/UNC/host/share/../Config', '\\\\?\\UNC\\host\\share\\Config\\wakatime\\wakatime.cfg'],
  ['\\\\host\\share\\..\\Config', '\\\\host\\share\\Config\\wakatime\\wakatime.cfg'],
  ['C:\\nested\\..\\Config', 'C:\\Config\\wakatime\\wakatime.cfg'],
  ['\\\\?\\C:\\\\Config', '\\\\?\\C:\\Config\\wakatime\\wakatime.cfg'],
  ['\\\\', '\\\\wakatime\\wakatime.cfg'],
  ['//', '\\\\wakatime\\wakatime.cfg'],
  ['\\\\.', '\\\\.\\wakatime\\wakatime.cfg'],
  ['\\\\?', '\\\\?\\wakatime\\wakatime.cfg'],
  ['\\??', windowsDefaultConfig],
];

for (const [configHome, file] of windowsConfigPaths) {
  test(
    'matches Go Windows config discovery and key reads for ' + JSON.stringify(configHome),
    async (t) => {
      const f = fixture(
        t,
        {
          statSync() {
            throw Object.assign(new Error('missing'), { code: 'ENOENT' });
          },
          readFile(selectedFile, encoding, callback) {
            if (selectedFile === file) callback(null, '[settings]\napi_key = ' + apiKey + '\n');
            else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
          },
        },
        'win32',
      );
      f.env.USERPROFILE = 'C:\\Users\\test';
      f.env.XDG_CONFIG_HOME = configHome;
      const options = f.options();
      assert.equal(options.getConfigFile(false), file);
      assert.equal(await options.getApiKey(), apiKey);
    },
  );
}

for (const location of ['XDG', 'portable', '~literal', "'literal", '"literal']) {
  test(`all CLI commands use the selected ${location} config without quoting`, async (t) => {
    const literal = location !== 'XDG' && location !== 'portable';
    const literalFile = '.' + path.sep + path.join(location, '.wakatime.cfg');
    const f = fixture(
      t,
      literal
        ? {
            readFile(file, encoding, callback) {
              if (file === literalFile) callback(null, `[settings]\napi_key = ${apiKey}\n`);
              else callback(Object.assign(new Error('missing'), { code: 'ENOENT' }));
            },
          }
        : {},
    );
    if (location === 'portable') f.env.VSCODE_PORTABLE = path.join(f.root, 'portable data');
    else if (literal) f.env.WAKATIME_HOME = '.' + path.sep + location;
    else f.env.XDG_CONFIG_HOME = path.join(f.root, 'config with spaces');
    const wakatime = f.wakatime();
    const file = wakatime.options.getConfigFile(false);
    if (literal) assert.equal(file, literalFile);
    else writeConfig(file);
    wakatime.dependencies = { isCliInstalled: () => true, getCliLocation: () => 'wakatime-cli' };
    wakatime.extension = { version: 'test' };
    wakatime.editorName = 'vscode';
    wakatime.showStatusBarTeam = true;
    wakatime.hasTeamFeatures = true;
    wakatime.getProjectName = () => undefined;
    wakatime.getProjectFolder = () => undefined;
    wakatime.heartbeats.push({ entity: '/tmp/test.txt', time: 1, is_write: false });
    await wakatime.sendHeartbeats();
    await wakatime.syncAIHeartbeats();
    await wakatime._getCodingActivity();
    await wakatime.updateTeamStatusBar({ fileName: '/tmp/test.txt', uri: { scheme: 'file' } });
    assert.equal(f.calls.length, 4);
    for (const { args } of f.calls) {
      assert.equal(args.filter((arg) => arg === '--config').length, 1);
      assert.equal(args[args.indexOf('--config') + 1], file);
    }
  });
}

for (const multiple of [false, true]) {
  test(`${multiple ? 'setSettings' : 'setSetting'} updates a Windows drive-root config`, async (t) => {
    const file = 'C:\\.wakatime.cfg';
    let contents = `[settings]\napi_key = ${apiKey}\n`;
    const f = fixture(
      t,
      {
        readFile(selectedFile, encoding, callback) {
          assert.equal(selectedFile, file);
          callback(null, contents);
        },
        // Node rejects mkdir on a Windows drive root, even with recursive: true.
        mkdir(directory, options, callback) {
          assert.equal(directory, 'C:\\');
          callback(Object.assign(new Error('cannot create drive root'), { code: 'EPERM' }));
        },
        writeFile(selectedFile, data, options, callback) {
          assert.equal(selectedFile, file);
          assert.equal(options.mode, 0o600);
          contents = data;
          callback(null);
        },
      },
      'win32',
    );
    f.env.WAKATIME_HOME = 'C:\\';
    const options = f.options();
    await f.write(() => {
      if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
      else options.setSetting('settings', 'debug', 'true', false);
    });
    assert.equal(await options.getSettingAsync('settings', 'debug'), 'true');
    assert.equal(await options.getApiKey(), apiKey);
  });

  test(`${multiple ? 'setSettings' : 'setSetting'} preserves write permission errors`, (t) => {
    const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const f = fixture(t, {
      readFile(file, encoding, callback) {
        callback(null, '[settings]\n');
      },
      writeFile(file, contents, options, callback) {
        callback(error);
      },
      mkdir() {
        assert.fail('a write permission error must not attempt directory creation');
      },
    });
    const options = f.options();
    assert.throws(() => {
      if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
      else options.setSetting('settings', 'debug', 'true', false);
    }, error);
  });

  for (const [stage, code] of [
    ['mkdir', 'EACCES'],
    ['retry', 'EACCES'],
    ['retry', 'ENOENT'],
  ]) {
    test(`${multiple ? 'setSettings' : 'setSetting'} reports ${stage} ${code} without another retry`, (t) => {
      const missing = Object.assign(new Error('missing'), { code: 'ENOENT' });
      const failure = Object.assign(new Error('stage failure'), { code });
      let writes = 0;
      let directories = 0;
      const f = fixture(
        t,
        {
          readFile(file, encoding, callback) {
            callback(missing);
          },
          writeFile(file, data, options, callback) {
            callback(++writes === 1 ? missing : failure);
          },
          mkdir(file, options, callback) {
            directories++;
            callback(stage === 'mkdir' ? failure : null);
          },
        },
        'win32',
      );
      f.env.WAKATIME_HOME = 'C:\\nested';
      const options = f.options();
      assert.throws(() => {
        if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
        else options.setSetting('settings', 'debug', 'true', false);
      }, failure);
      assert.equal(directories, 1);
      assert.equal(writes, stage === 'mkdir' ? 1 : 2);
    });
  }

  // Exercise POSIX symlinks and permissions on the real filesystem.
  test(
    `${multiple ? 'setSettings' : 'setSetting'} preserves a legacy symlink and target permissions`,
    { skip: process.platform === 'win32' },
    async (t) => {
      const f = fixture(t);
      const target = path.join(f.root, 'target', 'config');
      const legacy = path.join(f.home, '.wakatime.cfg');
      writeConfig(target);
      fs.chmodSync(target, 0o640);
      fs.symlinkSync(target, legacy);
      const options = f.options();
      assert.equal(options.getConfigFile(false), legacy);
      await f.write(() => {
        if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
        else options.setSetting('settings', 'debug', 'true', false);
      });
      assert.equal(await options.getApiKey(), apiKey);
      assert.equal(await options.getSettingAsync('settings', 'disabled'), 'true');
      assert.match(fs.readFileSync(target, 'utf8'), /debug = true/);
      assert.equal(fs.lstatSync(legacy).isSymbolicLink(), true);
      assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    },
  );

  test(
    `${multiple ? 'setSettings' : 'setSetting'} creates XDG parents through a directory symlink`,
    { skip: process.platform === 'win32' },
    async (t) => {
      const f = fixture(t);
      const target = path.join(f.root, 'target');
      const link = path.join(f.root, 'linked-config');
      fs.mkdirSync(target);
      fs.symlinkSync(target, link);
      f.env.XDG_CONFIG_HOME = link;
      const options = f.options();
      await f.write(() => {
        if (multiple) options.setSettings('settings', [{ key: 'api_key', value: apiKey }], false);
        else options.setSetting('settings', 'api_key', apiKey, false);
      });
      assert.equal(await options.getApiKey(), apiKey);
      assert.match(
        fs.readFileSync(path.join(target, 'wakatime', 'wakatime.cfg'), 'utf8'),
        /api_key/,
      );
      assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
      assert.equal(fs.statSync(path.join(target, 'wakatime')).mode & 0o777, 0o700);
    },
  );

  test(
    `${multiple ? 'setSettings' : 'setSetting'} falls back past a dangling legacy symlink`,
    { skip: process.platform === 'win32' },
    async (t) => {
      const f = fixture(t);
      const legacy = path.join(f.home, '.wakatime.cfg');
      fs.symlinkSync(path.join(f.root, 'missing'), legacy);
      const options = f.options();
      assert.equal(
        options.getConfigFile(false),
        path.join(f.home, '.config', 'wakatime', 'wakatime.cfg'),
      );
      await f.write(() => {
        if (multiple) options.setSettings('settings', [{ key: 'api_key', value: apiKey }], false);
        else options.setSetting('settings', 'api_key', apiKey, false);
      });
      assert.equal(await options.getApiKey(), apiKey);
      assert.equal(fs.lstatSync(legacy).isSymbolicLink(), true);
    },
  );

  test(`${multiple ? 'setSettings' : 'setSetting'} creates XDG parents and a private config`, async (t) => {
    const f = fixture(t);
    const options = f.options();
    await f.write(() => {
      if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
      else options.setSetting('settings', 'debug', 'true', false);
    });
    assert.equal(await options.getSettingAsync('settings', 'debug'), 'true');
    assert.equal(fs.existsSync(path.join(f.home, '.wakatime.cfg')), false);
    assert.equal(
      options.getConfigFile(true),
      path.join(f.home, '.wakatime', 'wakatime-internal.cfg'),
    );
    assert.equal(options.getLogFile(), path.join(f.home, '.wakatime', 'wakatime.log'));
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.dirname(options.getConfigFile(false))).mode & 0o777, 0o700);
      assert.equal(fs.statSync(options.getConfigFile(false)).mode & 0o777, 0o600);
    }
  });

  test(`${multiple ? 'setSettings' : 'setSetting'} preserves existing XDG settings and permissions`, async (t) => {
    const f = fixture(t);
    f.env.XDG_CONFIG_HOME = path.join(f.root, 'custom-config');
    const options = f.options();
    const file = options.getConfigFile(false);
    writeConfig(file);
    fs.chmodSync(path.dirname(file), 0o750);
    fs.chmodSync(file, 0o640);
    await f.write(() => {
      if (multiple) options.setSettings('settings', [{ key: 'debug', value: 'true' }], false);
      else options.setSetting('settings', 'debug', 'true', false);
    });
    assert.equal(await options.getApiKey(), apiKey);
    assert.equal(await options.getSettingAsync('settings', 'disabled'), 'true');
    assert.equal(await options.getSettingAsync('settings', 'debug'), 'true');
    assert.equal(fs.existsSync(path.join(f.home, '.wakatime.cfg')), false);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o750);
      assert.equal(fs.statSync(file).mode & 0o777, 0o640);
    }
  });
}
