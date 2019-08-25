const { Server } = require('@logux/server');
const { Schema, cloneRecordIdentity } = require('@orbit/data');
const { default: SQLSource } = require('orbit-sql');

function setup(server, source, access = () => true) {
  const resend = (_, action) => ({ channels: channels(action.identity) });

  server.channel(`orbit/records/:type`, {
    access,
    async init(ctx, action, meta) {
      const { type } = ctx.params;
      const records = await source.query(q => q.findRecords(type));
      sendBackRecords(ctx, records);
    }
  });

  server.channel(`orbit/record/:type/:id`, {
    access,
    async init(ctx, action, meta) {
      const { type, id } = ctx.params;
      const record = await source.query(q => q.findRecord(type, id));
      sendBackRecord(ctx, record);
    }
  });

  server.type(`orbit/add`, {
    access,
    resend,
    async process(ctx, action, meta) {
      await source.update(t => t.addRecord({ ...action.identity, attributes: action.attributes }));
    }
  });

  server.type(`orbit/attr`, {
    access,
    resend,
    async process(ctx, action, meta) {
      await source.update(t => t.replaceAttribute(action.identity, action.attribute, action.value));
    }
  });

  server.type(`orbit/remove`, {
    access,
    resend,
    async process(ctx, action, meta) {
      await source.update(t => t.removeRecord(action.identity));
    }
  });
}

function channels({ type, id }) {
  return [
    `orbit/records/${type}`,
    `orbit/record/${type}/${id}`
  ];
}

function sendBackRecord(ctx, record, deleted = false) {
  const identity = cloneRecordIdentity(record);

  if (deleted) {
    ctx.sendBack({
      type: 'orbit/remove',
      identity
    });
  } else {
    ctx.sendBack({
      type: 'orbit/add',
      identity
    });
    for (let attribute in record.attributes) {
      ctx.sendBack({
        type: 'orbit/attr',
        identity,
        attribute,
        value: record.attributes[attribute]
      });
    }
  }
}

function sendBackRecords(ctx, records) {
  for (let record of records) {
    sendBackRecord(ctx, record);
  }
}

const server = new Server(
  Server.loadOptions(process, {
    subprotocol: '1.0.0',
    supports: '1.x',
    root: __dirname
  })
);

const schema = new Schema({
  models: {
    todo: {
      attributes: {
        title: { type: 'string' },
        completed: { type: 'boolean' }
      }
    }
  }
});

const source = new SQLSource({
  schema,
  knex: {
    client: 'sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true
  }
});

server.auth((userId, token) => {
  // Allow only local users until we will have a proper authentication
  return process.env.NODE_ENV === 'development'
});

setup(server, source);

server.listen();
