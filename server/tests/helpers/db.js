import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Shared test harness.
 *
 * Each test FILE runs in its own Node process (node --test), so every file
 * gets an isolated in-memory MongoDB. `env.js` is imported lazily by the app
 * AFTER we point MONGO_URI at this server, so no real database is touched.
 */

let memoryServer = null;

export async function setupDB() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'codesync-test-secret';
  // Test files may override these before calling setupDB().
  process.env.ALLOW_LOCAL_EXEC ??= 'true';
  process.env.PISTON_API_URL ??= 'http://127.0.0.1:9/api/v2'; // deliberately unreachable
  process.env.PERSIST_DEBOUNCE_MS = '10';

  memoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoryServer.getUri('codesync-test');

  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  return mongoose.connection;
}

export async function teardownDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

/** Remove all documents between tests without recreating the server. */
export async function clearDB() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
