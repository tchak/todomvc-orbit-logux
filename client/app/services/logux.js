import Service from '@ember/service';
import { getOwner } from '@ember/application';

export default class extends Service {
  subscriptions = {};
  subscribers = {};

  constructor() {
    super(...arguments);
    this.source = getOwner(this).lookup('data-source:logux');
  }

  subscribe(channels) {
    const subscriptions = subscriptionsWithKeys(channels);

    return Promise.all(subscriptions.map(([subscription, key]) => {
      if (!this.subscribers[key]) {
        this.subscribers[key] = 0;
      }
      this.subscribers[key] += 1;

      if (this.subscribers[key] === 1) {
        const action = { type: 'logux/subscribe', ...subscription };
        this.subscriptions[key] = this.source.send(action);
      }

      return this.subscriptions[key];
    }));
  }

  unsubscribe(channels) {
    const subscriptions = subscriptionsWithKeys(channels);

    for (let [subscription, key] of subscriptions) {
      this.subscribers[key] -= 1;
      if (this.subscribers[key] === 0) {
        const action = { type: 'logux/unsubscribe', ...subscription }
        this.source.log.add(action, { sync: true });
        delete this.subscriptions[key];
      }
    }
  }
}

function subscriptionsWithKeys(channels) {
  return channels.map(channel => {
    const subscription = typeof channel === 'string' ? { channel } : channel;
    return [subscription, JSON.stringify(subscription)]
  });
}
