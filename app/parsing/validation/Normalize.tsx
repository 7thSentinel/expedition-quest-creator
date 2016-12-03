import {Logger} from '../Logger'

export class AttributeNormalizer {
  private keySet: string[];
  private attrs: {[k: string]: string};
  private log: Logger;

  constructor(attrs: {[k: string]: string}, log: Logger) {
    this.keySet = [];
    this.attrs = attrs;
    this.log = log;
  }

  private extract(k: string, required?: boolean): string {
    this.keySet.push(k);
    var v = this.attrs[k];

    if (!v && required) {
      if (this.log) this.log.err('missing: "' + k + '"', '404');
    }
    return v;
  }

  getString(k: string, required?: boolean) {
    var v = this.extract(k, required);

    if (v === undefined) {
      return v;
    }

    if (typeof(v) === 'string') {
      return v;
    }

    if (this.log) {
      this.log.err(k + " should be a string, but is \""+v+'\"', '404');
    }
    return 'UNDEFINED';
  }

  getNumber(k: string, required?: boolean) {
    var v: any = this.extract(k, required);

    if (v === undefined) {
      return v;
    }

    if (!isNaN(parseFloat(v)) && isFinite(v)) {
      return parseInt(v, 10);
    }

    if (this.log) {
      this.log.err(k + " should be a number, but is \""+v+'\"', '404');
    }
    return 0;
  }

  confirmNoExtra() {
    for (let k of Object.keys(this.attrs)) {
      var found = false;
      for (let j of this.keySet) {
        if (k === j) {
          found = true;
          break;
        }
      }

      if (found) {
        continue;
      }

      if (this.log) this.log.err('unknown: "' + k + '"', '404');
    }
  }
}

export class Normalize {
  static questAttrs(attrs: {[k: string]: string}, log: Logger): ({[k: string]: any}) {
    var n = new AttributeNormalizer(attrs, log);
    var result = {
      title: n.getString('title', true),
      summary: n.getString('summary'),
      author: n.getString('author'),
      email: n.getString('email'),
      url: n.getString('url'),
      minplayers: n.getNumber('minplayers', true),
      maxplayers: n.getNumber('maxplayers', true),
      mintimeminutes: n.getNumber('mintimeminutes'),
      maxtimeminutes: n.getNumber('maxtimeminutes'),
    };
    n.confirmNoExtra();
    return result;
  }

  static combatAttrs(attrs: {[k: string]: string}, log: Logger): ({[k: string]: any}) {
    return {}; // TODO
  }

  static roleplayAttrs(attrs: {[k: string]: string}, log: Logger): ({[k: string]: any}) {
    return {}; // TODO
  }
}