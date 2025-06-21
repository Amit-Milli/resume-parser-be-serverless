export const USERS_TABLE_NAME = `usersTable-${process.env.stage || 'test'}`;
export const RESUME_S3_BUCKET = `resumebucketresume-parser-eightfold-${process.env.bucketsuffix || 'test'}`;

export const KEY_CONDITION_OPERATORS = {
  EQ: 'EQ',
  LT: 'LT',
  GT: 'GT',
  LE: 'LE',
  GE: 'GE',
  BETWEEN: 'BETWEEN',
  BEGINS_WITH: 'BEGINS_WITH',
};
Object.freeze(KEY_CONDITION_OPERATORS);

export default {
  USERS_TABLE_NAME,
  RESUME_S3_BUCKET,
};
