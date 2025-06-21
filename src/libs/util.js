import * as CryptoJS from 'crypto-js';
import { isLowerEnv } from '../constants';
/**
 * guid - Generate globally unique identifier
 * @returns {string} Returns guid
 */
function guid() {
  function _p8(s) {
    const p = (`${Math.random().toString(16)}000000000`).substr(2, 8);
    return s ? `-${p.substr(0, 4)}-${p.substr(4, 4)}` : p;
  }
  return (_p8() + _p8(true) + _p8(true) + new Date().toISOString().slice(0, 10)).replace(/-/g, '');
}

export const isString = (value) => typeof value === 'string' || value instanceof String;
export const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
export const isArray = (value) => Array.isArray(value);
export const isFunction = (value) => typeof value === 'function';
export const isObject = (value) => value && typeof value === 'object' && value.constructor === Object;

export function countUtf8Bytes(s) {
  let b = 0;
  let i = 0;
  let c;
  // eslint-disable-next-line no-cond-assign, no-bitwise, no-plusplus
  for (;c = s.charCodeAt(i++); b += c >> 11 ? 3 : c >> 7 ? 2 : 1);
  return b;
}

export function checkPayloadConstraint(payload, limit) {
  return Math.ceil(countUtf8Bytes(JSON.stringify(payload)) / limit);
}

const getDecryptedObject = (ciphertext) => {
  const decData = CryptoJS.enc.Base64.parse(ciphertext).toString(CryptoJS.enc.Utf8);
  const bytes = CryptoJS.AES.decrypt(decData, process.env.SECRET_KEY_FOR_ENCRYPTION).toString(CryptoJS.enc.Utf8);
  return JSON.parse(bytes);
};

const generateEncryptedObject = (object) => {
  const encyJSON = CryptoJS.AES.encrypt(JSON.stringify(object), process.env.SECRET_KEY_FOR_ENCRYPTION).toString();
  return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(encyJSON));
};

export const getAllowedOrigins = () => {
  if (!isLowerEnv) {
    return [
      'https://resume.app',
    ];
  }
  return [
    'http://localhost:3000'];
};
export {
  guid, generateEncryptedObject, getDecryptedObject,
};
