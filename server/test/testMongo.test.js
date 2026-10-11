const { assertSafeTestDatabase, databaseNameOf } = require('./helpers/testMongo');

describe('test database safety guard', () => {
  test('reads the database name from a connection string', () => {
    expect(databaseNameOf('mongodb://localhost:27017/agribid_test')).toBe('agribid_test');
    expect(databaseNameOf('mongodb://u:p@host1:27017,host2:27017/agribid_test?replicaSet=rs0')).toBe('agribid_test');
    expect(databaseNameOf('mongodb+srv://u:p@cluster0.x.mongodb.net/agribid_test?retryWrites=true')).toBe('agribid_test');
    expect(databaseNameOf('mongodb://localhost:27017')).toBeNull();
  });

  test('accepts only databases whose name ends in _test', () => {
    expect(assertSafeTestDatabase('mongodb://localhost:27017/agribid_test')).toBe('agribid_test');
    expect(assertSafeTestDatabase('mongodb://localhost:27017/anything_test')).toBe('anything_test');
  });

  test('refuses your real database (the tests delete everything in it)', () => {
    expect(() => assertSafeTestDatabase('mongodb://localhost:27017/agribid')).toThrow(/must end with "_test"/);
    expect(() => assertSafeTestDatabase('mongodb+srv://u:p@c.mongodb.net/production?x=1')).toThrow(/must end with "_test"/);
  });

  test('refuses a connection string with no database name at all', () => {
    expect(() => assertSafeTestDatabase('mongodb://localhost:27017')).toThrow(/none in the URI/);
    expect(() => assertSafeTestDatabase(undefined)).toThrow();
  });

  test('a name that merely contains "test" is not enough', () => {
    expect(() => assertSafeTestDatabase('mongodb://localhost:27017/testing')).toThrow();
    expect(() => assertSafeTestDatabase('mongodb://localhost:27017/test_data_prod')).toThrow();
  });
});
