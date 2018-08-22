'use strict';


import * as _ from './tools';

/**
 * Response parser
 * @param  {object} params Request params
 * @param  {object} opt    Adapter options
 * @param  {object} opt    Solr response object
 * @return {object}        Adapter response
 */
export function responseFind(params, opt, res) {

  let response = {};

  if (_.has(opt, 'paginate.max')) { //TODO: ??
    response = {
      QTime: _.get(res, 'responseHeader.QTime') || 0, //"<total number of records>",
      total: _.get(res, 'response.numFound') || 0, //"<total number of records>",
      limit: parseInt(_.get(params, 'query.$limit')) || _.get(opt, 'paginate.default') || _.get(opt, 'paginate.max'),
      skip: parseInt(_.get(params, 'query.$skip')) || 0, //res.response.start "<number of skipped items (offset)>",
      data: responseGet(res, true) //[/* data */]
    };

  } else {
    response = _.get(res, 'response.docs') || [];
  }

  if (_.has(res, 'facets')) {
    response.facet = _.get(res, 'facets');
  }

  if (_.has(res, 'highlighting')) {
    response.highlighting = _.get(res, 'highlighting');
  }

  if (_.has(res, 'spellcheck')) {
    response.spellcheck = _.get(res, 'spellcheck');
  }

  if (_.has(res, 'moreLikeThis')) {
    response.moreLikeThis = _.get(res, 'moreLikeThis');
  }

  return response;
}

/**
 * Response Docs parser
 * @param  {[type]}  res     [description]
 * @param  {Boolean} allDocs [description]
 * @return {[type]}          [description]
 */
export function responseGet(res, allDocs = false) {

  if (!_.has(res, 'response.docs') && !_.has(res, 'grouped')) {
    return allDocs === false ? {} : [];
  }

  let docs = _.get(res, 'response.docs') || _.get(res, 'grouped') || [];

  return allDocs === false ? docs[0] : docs;
}
