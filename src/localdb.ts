import { openDB, deleteDB, wrap, unwrap, DBSchema } from "idb";
import type { LocalSong, SongDatabase, SongDbListItem } from "./types";

interface LocalDb extends DBSchema {
  songs: {
    key: string;
    value: LocalSong;
  };
  databases: {
    key: string;
    value: SongDbListItem;
  };
}

const localDbPromise = openDB<LocalDb>("songiapp", 1, {
  upgrade(db, oldVersion, newVersion, transaction, event) {
    if (oldVersion < 1) {
      db.createObjectStore("songs", { keyPath: "id" });
      db.createObjectStore("databases", { keyPath: "url" });
    }
  },
  blocked(currentVersion, blockedVersion, event) {
    // …
  },
  blocking(currentVersion, blockedVersion, event) {
    // …
  },
  terminated() {
    // …
  },
});

async function getSongsTransaction(mode: "readonly" | "readwrite") {
  if (!localDbPromise) return null;
  const tx = (await localDbPromise).transaction("songs", mode);
  return tx;
}

async function getDatabasesTransaction(mode: "readonly" | "readwrite") {
  if (!localDbPromise) return null;
  const tx = (await localDbPromise).transaction("databases", mode);
  return tx;
}

export async function saveSongDb(db: SongDbListItem, data: SongDatabase) {
  const txSongs = await getSongsTransaction("readwrite");
  const storeSongs = txSongs?.objectStore("songs");
  for (const song of data.songs) {
    await storeSongs?.put?.({
      ...song,
      databaseUrl: db.url,
      id: `${db.url}@${song.id}`,
    });
  }
  await txSongs?.done;

  const txDatabases = await getDatabasesTransaction("readwrite");
  const storeDatabases = txDatabases?.objectStore("databases");
  storeDatabases?.put?.(db);
  await txDatabases?.done;
}
