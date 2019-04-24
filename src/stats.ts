import { URL_SUMMARIES } from './constants';
import { Libs } from './libs';
import { Options } from './options';
import { Logger } from './logger';

export class Stats {
  private apiKey: string;
  private proxy: string;
  private options: Options;
  private logger: Logger;

  constructor(options: Options, logger: Logger) {
    this.options = options;
    this.logger = logger;
    this.options.getSetting('settings', 'api_key', (_, val) => {
      this.apiKey = val;
    });
    this.options.getSetting('settings', 'proxy', (_, val) => {
      this.proxy = val;
    });
  }

  public async getCodingActivity(): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      if (Libs.validateKey(this.apiKey)) return reject('Invalid Api Key');
      const request = await import('request');
      const url = `${URL_SUMMARIES}?start=today&end=today&api_key=${this.apiKey}`;
      let params = { url: url };
      if (this.proxy && this.proxy.trim()) params['proxy'] = this.proxy.trim();

      try {
        const body = await new Promise<string>((resolve, reject) => {
          request.get(params, (error, _response, body) => (error ? reject(error) : resolve(body)));
        });
        const data = JSON.parse(body).data[0];
        return resolve(`Today: ${data.grand_total.text}`);
      } catch (e) {
        this.logger.error(`Error retrieving coding activity: ${e}`);
        return reject();
      }
    });
  }
}
