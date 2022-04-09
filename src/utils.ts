export class Utils {
  public static quote(str: string): string {
    if (str.includes(' ')) return `"${str.replace('"', '\\"')}"`;
    return str;
  }

  public static apiKeyInvalid(key?: string): string {
    const err = 'Invalid api key... check https://wakatime.com/settings for your key';
    if (!key) return err;
    const re = new RegExp(
      '^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$',
      'i',
    );
    if (!re.test(key)) return err;
    return '';
  }

  public static validateProxy(proxy: string): string {
    if (!proxy) return '';
    let re;
    if (proxy.indexOf('\\') === -1) {
      re = new RegExp('^((https?|socks5)://)?([^:@]+(:([^:@])+)?@)?[\\w\\.-]+(:\\d+)?$', 'i');
    } else {
      re = new RegExp('^.*\\\\.+$', 'i');
    }
    if (!re.test(proxy))
      return 'Invalid proxy. Valid formats are https://user:pass@host:port or socks5://user:pass@host:port or domain\\user:pass';
    return '';
  }

  public static formatDate(date: Date): String {
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
    if (hour == 0) {
      hour = 12;
    }
    let minute = date.getMinutes();
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} ${hour}:${
      minute < 10 ? `0${minute}` : minute
    } ${ampm}`;
  }

  public static obfuscateKey(key: string): string {
    let newKey = '';
    if (key) {
      newKey = key;
      if (key.length > 4)
        newKey = 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXX' + key.substring(key.length - 4);
    }
    return newKey;
  }

  public static wrapArg(arg: string): string {
    if (arg.indexOf(' ') > -1) return '"' + arg.replace(/"/g, '\\"') + '"';
    return arg;
  }

  public static formatArguments(binary: string, args: string[]): string {
    let clone = args.slice(0);
    clone.unshift(this.wrapArg(binary));
    let newCmds: string[] = [];
    let lastCmd = '';
    for (let i = 0; i < clone.length; i++) {
      if (lastCmd == '--key') newCmds.push(this.wrapArg(this.obfuscateKey(clone[i])));
      else newCmds.push(this.wrapArg(clone[i]));
      lastCmd = clone[i];
    }
    return newCmds.join(' ');
  }

  public static isUnsavedFile(file: string): boolean {
    const re = new RegExp('^SQLQuery_[0-9]+$');
    return re.test(file);
  }
}
