import mongoose from 'mongoose';
import { env, isProduction } from '../config/env.js';

/** Kept alive for the lifetime of the process when the dev fallback is used. */
let memoryServer = null;

/**
 * Connect to MongoDB.
 *
 * Called once during server bootstrap BEFORE we start accepting traffic, so
 * socket handlers can assume the database is ready.
 *
 * In development, if MongoDB is not reachable (a very common "fresh clone"
 * situation), we transparently start an in-memory MongoDB instead of killing
 * the backend. Without this the Socket.io server never starts listening and
 * the browser reports a cryptic "WebSocket connection failed".
 */
export async function connectDB(uri = env.mongoUri) {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, {
      // Fail fast (10s) instead of hanging forever on a bad connection string.
      serverSelectionTimeoutMS: 10000,
    });
  } catch (err) {
    if (isProduction) throw err;

    console.warn(`[db] could not connect to ${uri}`);
    console.warn(`[db] ${err.message}`);
    console.warn('[db] starting an in-memory MongoDB for local development...');
    console.warn('[db] (data is ephemeral and is lost when the server stops)');

    // Imported lazily so production installs never need this devDependency.
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    await mongoose.connect(memoryServer.getUri('codesync'), {
      serverSelectionTimeoutMS: 10000,
    });
  }

  const { host, name } = mongoose.connection;
  console.log(`[db] connected to ${host}/${name}`);

  mongoose.connection.on('error', (err) => console.error('[db] error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));

  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();

  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
