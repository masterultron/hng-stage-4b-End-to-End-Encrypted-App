// lib/storage.ts
// Secure key storage using IndexedDB via idb

import { openDB } from 'idb';

const DB_NAME = 'whisperbox-keys';
const STORE = 'keys';

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE);
    },
  });
}

export async function storePrivateKey(userId: string, key: CryptoKey): Promise<void> {
  const db = await getDB();
  await db.put(STORE, key, `private-key-${userId}`);
}

export async function getPrivateKey(userId: string): Promise<CryptoKey | undefined> {
  const db = await getDB();
  return db.get(STORE, `private-key-${userId}`);
}

export async function clearPrivateKey(userId: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, `private-key-${userId}`);
}

export async function storeWrappedKeyIV(userId: string, iv: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE, iv, `wrapped-key-iv-${userId}`);
}

export async function getWrappedKeyIV(userId: string): Promise<string | undefined> {
  const db = await getDB();
  return db.get(STORE, `wrapped-key-iv-${userId}`);
}