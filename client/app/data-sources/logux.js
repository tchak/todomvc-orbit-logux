import { Source, pushable, cloneRecordIdentity, buildTransform } from '@orbit/data';
import log from '@logux/client/log';
import CrossTabClient from '@logux/client/cross-tab-client';
import isFirstOlder from '@logux/core/is-first-older';

@pushable
class LoguxSource extends Source {
  lastAdded = 0;
  addCalls = 0;
  prevMeta;

  constructor(settings) {
    settings.autoActivate = false;
    super(settings);
    const config = settings.config;
    this.checkEvery = config.checkEvery || 25;
    delete config.checkEvery;
    this.reasonlessHistory = config.reasonlessHistory || 1000;
    delete config.reasonlessHistory;
    this.lastAdded
    this.client = new CrossTabClient(config);
    this.log = this.client.log;
    this.processing = {};
    this.activate();
  }

  async _activate() {
    await this.client.start();
    log(this.client);
    this.addListener();
    return super._activate();
  }

  async _push(transform) {
    for (let operation of transform.operations) {
      let action = this.operationToAction(operation);
      if (action) {
        this.send(action);
      } else {
        console.log('missing operation', operation);
      }
    }
    return [transform];
  }

  addListener() {
    this.client.on('add', (action, meta) => {
      if (meta.added > this.lastAdded) {
        this.lastAdded = meta.added;
      }

      if (action.type === 'logux/processed') {
        if (this.processing[action.id]) {
          this.processing[action.id][0]();
          delete this.processing[action.id];
        }
      } else if (meta.autoreason) {
        this.addCalls += 1;
        if (this.addCalls % this.checkEvery === 0 && this.lastAdded > this.reasonlessHistory) {
          this.log.removeReason(`tab${this.store.client.id}`, {
            maxAdded: this.lastAdded - this.reasonlessHistory
          });
        }
      }

      this.process(action, meta);
    });
  }

  operationToAction(operation) {
    const identity = cloneRecordIdentity(operation.record);
    switch (operation.op) {
    case 'addRecord':
      return {
        type: 'orbit/add',
        identity,
        attributes: operation.record.attributes
      };
    case 'removeRecord':
      return {
        type: 'orbit/remove',
        identity
      };
    case 'replaceAttribute':
      return {
        type: 'orbit/attr',
        identity,
        attribute: operation.attribute,
        value: operation.value
      };
    }
  }

  actionToOperation(action) {
    switch (action.type) {
    case 'orbit/add':
      return {
        op: 'addRecord',
        record: {
          ...action.identity,
          attributes: action.attributes
        }
      };
    case 'orbit/remove':
      return {
        op: 'removeRecord',
        record: action.identity
      };
    case 'orbit/attr':
      return {
        op: 'replaceAttribute',
        record: action.identity,
        attribute: action.attribute,
        value: action.value
      };
    }
  }

  async process(action, meta) {
    if (action.type === 'logux/undo') {
      console.log('logux: undo');
    } else if (action.type.slice(0, 6) === 'logux/') {
      return Promise.resolve();
    } else if (isFirstOlder(this.prevMeta, meta)) {
      this.prevMeta = meta;

      const operation = this.actionToOperation(action);
      const transform = buildTransform([operation]);

      return this.transformed([transform]);
    } else {
      console.log('logux: replay');
    }
  }

  send(action, meta) {
    if (!meta) { meta = {}; }
    if (!meta.reasons) { meta.autoreason = true; }

    meta.sync = true;

    if (meta.id === undefined) {
      meta.id = this.log.generateId();
    }

    return new Promise((resolve, reject) => {
      this.processing[meta.id] = [resolve, reject];
      this.log.add(action, meta);
    });
  }
}

export default {
  create(injections = {}) {
    injections.name = 'logux';
    injections.config = {
      subprotocol: '1.0.0',
      server: 'ws://localhost:31337',
      userId: '1',
      credentials: ''
    };
    return new LoguxSource(injections);
  }
};
