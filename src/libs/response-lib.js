/**
 * buildResponse - Builds response with statuscode and body object
 * @param  {number} statusCode
 * @param  {object} body
 * @return {objects}
 */
function buildResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

/**
 * success - Construct response object with 200 status code response
 * @param  {object} body
 * @returns {object}
 */
function success(body) {
  return buildResponse(200, body);
}

/**
 * failure - Construct response object with 500 status code response
 * @param  {object} body
 * @returns {object}
 */
function failure(body) {
  return buildResponse(500, body);
}

export { success, failure, buildResponse };
