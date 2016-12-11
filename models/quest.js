/*
CREATE TABLE quests (
  id VARCHAR(255) NOT NULL,
  PRIMARY KEY(id),
  published TIMESTAMP NULL DEFAULT NOW(),
  tombstone TIMESTAMP NULL DEFAULT NULL,
  publishedurl VARCHAR(2048),
  userid VARCHAR(255),
  author VARCHAR(255),
  email VARCHAR(255),
  maxplayers INT,
  maxtimeminutes INT,
  minplayers INT,
  mintimeminutes INT,
  summary VARCHAR(1024),
  title VARCHAR(255),
  url VARCHAR(2048)
);
*/

const Joi = require('joi');
const NamedPg = require('node-postgres-named');
const Pg = require('pg');
const Squel = require('squel');
const Url = require('url');

const Config = require('../config');
const CloudStorage = require('../lib/cloudstorage');
const ToMeta = require('../translation/to_meta');
const User = require('./user');
const Utils = require('./utils');

Pg.defaults.ssl = true;
const urlparams = Url.parse(Config.get('DATABASE_URL'));
const userauth = urlparams.auth.split(':');
const poolConfig = {
  user: userauth[0],
  password: userauth[1],
  host: urlparams.hostname,
  port: urlparams.port,
  database: urlparams.pathname.split('/')[1],
  ssl: true
};
const pool = new Pg.Pool(poolConfig);
NamedPg.patch(pool);


const table = 'quests';
const schema = {
  id: Joi.string().max(255), // <userId>_<docId>
  publishedurl: Joi.string().uri().max(2048),
  userid: User.schema.id,
  author: Joi.string().max(255),
  email: Joi.string().email().max(255),
  maxplayers: Joi.number().min(1).max(20),
  maxtimeminutes: Joi.number().min(1),
  minplayers: Joi.number().min(1).max(20),
  mintimeminutes: Joi.number().min(1),
  summary: Joi.string().max(1024),
  title: Joi.string().max(255),
  url: Joi.string().max(2048), // Note: not required to be a URI because other parts of the code
                               // still want it to exclude http://

  // metadata
  published: Joi.date(),
  tombstone: Joi.date().default(null),
};
exports.schema = schema;

const schemaSearch = Object.assign(schema, {
  order: Joi.string(), // TODO limit to schema keys
  owner: User.schema.id,
  players: Joi.number().min(1).max(20),
  published_after: Joi.number(),
  search: Joi.string(),
});


exports.getById = function(id, cb) {

  Joi.validate(id, schema.id, (err, id) => {

    if (err) {
      return cb(err);
    }

    let query = Squel.select()
      .from(table)
      .where('id = ?', id)
      .limit(1)
      .toString();

    pool.query(query, {}, (err, results) => {

      if (err) {
        return cb(err);
      }

      if (results.length !== 1) {
        return cb({
          code: 404,
          message: 'Not found'
        });
      }

      cb(null, Utils.objectPgToJs(results[0]));
    });
  });
};

exports.search = function(userId, params, cb) {

  if (!params) {
    return cb(new Error("No search parameters given; requires at least one parameter"));
  }

  Joi.validate(params, schemaSearch, (err, params) => {

    if (err) {
      return cb(err);
    }

    let query = Squel.select()
      .from(table)
      .where('tombstone IS NULL');

    if (params.id) {
      query = query.where('id = ?', params.id);
    }

    if (params.owner) {
      query = query.where('userid = ?', params.owner);
    }

    // Require results to be published if we're not querying our own quests
    if (params.owner !== userId || userId == "") {
      query = query.where('published IS NOT NULL');
    }

    if (params.players) {
      query = query.where('minplayers <= ?', params.players)
                   .where('maxplayers >= ?', params.players);
    }

    if (params.search) {
      const search = '%' + params.search.toLowerCase() + '%';
      query = query.where(Squel.expr().and('LOWER(title) LIKE ?', search).or('LOWER(summary) LIKE ?', search));
    }

    if (params.published_after) {
      query = query.where("published > NOW() - '? seconds'::INTERVAL", params.published_after);
    }

    if (params.order) {
      query = query.order(params.order.substr(1), (params.order[0] === '+'));
    }

    const limit = Math.max(params.limit || 0, 100);
    query = query.limit(limit);
    query = query.toString();
    pool.query(query, function(err, results) {

      if (err) {
        return cb(err);
      }

      const hasMore = results.rows.length === limit ? token + results.rows.length : false;
      cb(null, results.rows.map(Utils.objectPgToJs), hasMore);
    });
  });
};

exports.publish = function(userId, docId, xml, cb) {
// TODO: Validate XML

  if (!userId) {
    return cb(new Error('Invalid or missing User ID'));
  }

  if (!docId) {
    return cb(new Error('Invalid or missing Quest ID'));
  }

  if (!xml) {
    return cb('Could not publish - no xml data.');
  }

  const id = userId + '_' + docId;
  const cloudStorageData = {
    gcsname: userId + "/" + docId + "/" + Date.now() + ".xml",
    buffer: xml
  }

  // Run in parallel with the Datastore model.
  CloudStorage.upload(cloudStorageData, (err, data) => {
    if (err) {
      console.log(err);
    }
  });

  const meta = Object.assign({}, ToMeta.fromXML(xml),
      {
        id: id,
        userid: userId,
        publishedurl: CloudStorage.getPublicUrl(cloudStorageData.gcsname),
      });

  Joi.validate(meta, schema, (err, meta) => {

    if (err) {
      return cb(err);
    }

    const query = Utils.generateUpsertSql(table, meta);
    pool.query(query, {}, (err, result) => {
      cb(err, id);
    });
  });
};

exports.unpublish = function(userId, docId, cb) {

  if (!userId) {
    return cb(new Error('Invalid or missing User ID'));
  }

  if (!docId) {
    return cb(new Error('Invalid or missing Quest ID'));
  }

  const id = userId + '_' + docId;
  const query = Utils.generateUpsertSql(table, {id: id, tombstone: Date.now()});
  pool.query(query, {}, (err, result) => {
    cb(err, id);
  });
};