const { _ } = require('@feathersjs/commons');
const debug = require('debug')('feathers-solr-query');
const uuidv1 = require('uuid/v1');
_.has = function has(obj, key) {
  return key.split('.').every(function(x) {
    if (typeof obj !== 'object' || obj === null || !(x in obj)) {
      return false;
    }
    obj = obj[x];
    return true;
  });
};
_.get = function get(obj, key) {
  return key.split('.').reduce(function(o, x) {
    return typeof o === 'undefined' || o === null ? o : o[x];
  }, obj);
};
const whitelist = ['$search', '$suggest', '$params', '$facet', '$populate'];

const Operators = {
  $in: (key, value) => {
    return Array.isArray(value) ? `${key}:(${value.join(' OR ')})` : `${key}:${value}`;
  },
  $or: (key, value) => {
    return Array.isArray(value) ? `(${value.join(' OR ')})` : `${key}:${value}`;
  },
  $lt: (key, value) => {
    return `${key}:[* TO ${value}}`;
  },
  $lte: (key, value) => {
    return `${key}:[* TO ${value}]`;
  },
  $gt: (key, value) => {
    return `${key}:{${value} TO *]`;
  },
  $gte: (key, value) => {
    return `${key}:[${value} TO *]`;
  },
  $like: (key, value) => {
    return `${key}:{${value}`;
  },
  $notlike: (key, value) => {
    return `!${key}:{${value}`;
  },
  $eq: (key, value) => {
    return Array.isArray(value) ? `(${value.join(' AND ')})` : `${key}:${value}`;
  },
  $ne: (key, value) => {
    return `!${key}:${value}`;
  },
  $and: (key, value) => {
    return `(${value.join(' AND ')})`;
  },
  $nin(key, value) {
    return Array.isArray(value) ? `!${key}:(${value.join(' OR ')})` : `!${key}:${value}`;
  },
  $limit(filters, paginate) {
    let result = {};
    if (typeof filters.$limit !== 'undefined') {
      if (_.has(paginate, 'max') && parseInt(filters.$limit) > parseInt(paginate.max)) {
        return;
      }
      result.limit = parseInt(filters.$limit);
    }
    return result;
  },
  $skip(filters, paginate) {
    return filters.$skip ? { offset: filters.$skip } : {};
  },
  $sort(filters, paginate) {
    let result = {};
    if (filters.$sort) {
      const sort = [];
      Object.keys(filters.$sort).forEach(name => {
        sort.push(name + (parseInt(filters.$sort[name]) === 1 ? ' asc' : ' desc'));
      });
      result.sort = sort.join(',');
    }
    return result;
  },
  $params(filters, query) {
    if (query['$params']) return { params: query['$params'] };
    return {};
  },
  $facet(filters, query) {
    if (query['$facet']) return { facet: query['$facet'] };
    return {};
  },
  $filter(filters, query) {
    if (query['$filter']) return { filter: Array.isArray(query['$filter']) ? query['$filter'] : [query['$filter']] };
    return {};
  }
};

function jsonQuery(id, filters, query, paginate) {
  let result = Object.assign(
    {
      query: (query.$search || '*:*').toString(),
      fields: filters.$select ? filters.$select.join(',') + ',id' : '*,score',
      limit: paginate.max || paginate.default || 10,
      offset: 0
    },
    Operators.$params(filters, query),
    Operators.$facet(filters, query),
    Operators.$sort(filters, paginate),
    Operators.$skip(filters, paginate),
    Operators.$limit(filters, paginate),
    Operators.$filter(filters, query)
  );

  // merge id and query // TODO: Fix if query.id has operators
  if (id && _.has(query, 'id')) {
    query.id = `(${id} AND ${query.id})`;
  } else if (id) {
    query.id = id;
  }

  // convert special adapter params
  whitelist.forEach(param => {
    delete query[param];
  });

  // convert query
  if (!_.isEmpty(query)) {
    result.filter = convertOperators(query);
  }

  debug(result);
  return result;
}

function convertOperators(query, root = false) {
  if (Array.isArray(query)) {
    return query.map(q => {
      return convertOperators(q, false);
    });
  }

  if (!_.isObject(query)) {
    return query;
  }

  const converted = Object.keys(query).reduce((res, prop) => {
    const value = query[prop];
    let queryString;

    if (prop === '$or') {
      const o = [].concat.apply([], convertOperators(value, false));
      queryString = Operators.$or(root || prop, o);
    } else if (_.has(Operators, prop)) {
      queryString = Operators[prop](root || prop, value);
    } else if (typeof prop === 'string') {
      if (!_.isObject(value)) {
        queryString = Operators.$eq(root || prop, value);
      } else {
        queryString = convertOperators(value, prop);
      }
      if (Array.isArray(queryString)) {
        if (queryString.length > 1) {
          queryString = Operators.$and(root || prop, queryString);
        }
      }
      return res.concat(queryString);
    }
    res.push(queryString);
    return res;
  }, []);

  return converted;
}

function deleteQuery(id, params) {
  if (id) {
    if (id === '*' || id === '*:*') {
      return { delete: { query: '*:*' } };
    }

    return { delete: id };
  } else if (_.isObject(params)) {
    const crit = [];

    Object.keys(params.query).forEach(function(name) {
      crit.push(name + ':' + params.query[name]);
    });

    return { delete: { query: crit.join(' AND ') } };
  }

  return { delete: { query: '*:*' } };
}

function patchQuery(toPatch, patch, idField) {
  toPatch = Array.isArray(toPatch) ? toPatch : [toPatch];

  const ids = toPatch.map(current => current[idField]);
  const atomicFieldUpdate = {};
  const actions = ['set', 'add', 'remove', 'removeregex', 'inc'];

  Object.keys(patch).forEach(field => {
    if (field !== idField) {
      const value = patch[field];
      if (_.isObject(value)) {
        if (actions.indexOf(Object.keys(value)[0]) === -1) {
          atomicFieldUpdate[field] = { add: value };
        }
      } else if (Array.isArray(value)) {
        atomicFieldUpdate[field] = { add: value };
      } else {
        atomicFieldUpdate[field] = value === '' ? { remove: value } : { set: value };
      }
    }
  });
  const patchData = toPatch.map(current => {
    return Object.assign({ [idField]: current[idField] }, atomicFieldUpdate);
  });

  return { ids, patchData };
}

const addId = (item, id) => {
  if (item[id] === undefined) {
    return Object.assign(
      {
        [id]: uuidv1()
      },
      item
    );
  }
  return item;
};

const getIds = (data, id) => {
  if (!Array.isArray(data) && data[id]) return [data[id]];

  return data.map(d => {
    return d[id];
  });
};

module.exports = {
  addId,
  getIds,
  jsonQuery,
  patchQuery,
  deleteQuery,
  whitelist,
  defaultOperators: Operators
};