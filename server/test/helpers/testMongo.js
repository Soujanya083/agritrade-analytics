// Database for the integration tests.
//
//  * Default: a temporary in-memory MongoDB (what CI uses; needs to download a MongoDB build once).
//  * TEST_MONGO_URI=mongodb://localhost:27017/agribid_test : use a real MongoDB you already run.
//    Handy on a machine whose installed MongoDB version differs from the one the in-memory
//    tool expects (that mismatch makes the temporary server die at start-up).
//
// SAFETY: the tests wipe their database. When TEST_MONGO_URI is used, the database name MUST end
// in "_test" or the helper refuses to run, so it can never touch your real data. The database is
// also emptied at the start, so an interrupted earlier run cannot leave stale users behind.

const DB_NAME_PATTERN = /^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/;

function databaseNameOf(uri) {
  const match = DB_NAME_PATTERN.exec(uri || '');
  return match ? match[1] : null;
}

function assertSafeTestDatabase(uri) {
  const name = databaseNameOf(uri);
  if (!name || !name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name || '(none in the URI)'}": the name must end with "_test" `
      + '(for example mongodb://localhost:27017/agribid_test), because the tests delete everything in it.',
    );
  }
  return name;
}

async function startTestMongo() {
  const external = process.env.TEST_MONGO_URI;
  if (external) {
    assertSafeTestDatabase(external);
    const { MongoClient } = require('mongodb'); // installed with mongoose
    const client = new MongoClient(external);
    await client.connect();
    await client.db().dropDatabase();
    await client.close();
    return { uri: external, stop: async () => {} };
  }
  const { MongoMemoryServer } = require('mongodb-memory-server'); // lazy: only needed on this path
  const server = await MongoMemoryServer.create();
  return { uri: server.getUri(), stop: () => server.stop() };
}

module.exports = { startTestMongo, assertSafeTestDatabase, databaseNameOf };
