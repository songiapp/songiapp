import Dexie, { Table } from "dexie";
import type {
  GroupedLetter,
  LocalArtist,
  LocalDatabase,
  LocalFileDatabase,
  LocalFileDatabaseContent,
  LocalLetter,
  LocalRecentObject,
  LocalSong,
  SongDatabase,
  SongDbListItem,
} from "./types";
import _ from "lodash";
import {
  getFirstLetter,
  localeSortByKey,
  removeDiacritics,
  removeHtmlTags,
} from "./utils";
import { removeChords } from "./chordTools";
import { parseSongDatabase } from "./songpro";

class CloudSongsDb extends Dexie {
  public songs!: Table<LocalSong, string>;
  public databases!: Table<LocalDatabase, string>;
  public artists!: Table<LocalArtist, string>;
  public letters!: Table<LocalLetter, string>;

  public constructor() {
    super("cloudsongs");

    this.version(1).stores({
      songs: "id,artistId,databaseId,*titleWords,*textWords",
      databases: "id,isActive",
      artists: "id,artistId,databaseId,letterId,*nameWords",
      letters: "id,letter,databaseId",
    });
  }
}

class LocalSongsDb extends Dexie {
  public databases!: Table<LocalFileDatabase, number>;
  public dbcontent!: Table<LocalFileDatabaseContent, number>;

  public constructor() {
    super("localsongs");

    this.version(2).stores({
      databases: "++id",
      dbcontent: "++id,databaseId,isActive",
    });
  }
}

class PreferencesDb extends Dexie {
  public recents!: Table<LocalRecentObject, string>;

  public constructor() {
    super("preferences");

    this.version(1).stores({
      recents: "id",
    });
  }
}

const cloudSongs = new CloudSongsDb();
const preferences = new PreferencesDb();
const localSongs = new LocalSongsDb();

if (localStorage.getItem("deleteLocalDatabase") == "cloudsongs") {
  window.indexedDB.deleteDatabase("cloudsongs");
  localStorage.removeItem("deleteLocalDatabase");
  document.location.reload();
}

function tokenize(...texts: string[]): string[] {
  const res: string[] = [];

  for (const text of texts) {
    for (const word of removeDiacritics(
      removeHtmlTags(removeChords(String(text ?? "")))
    )
      .toLocaleLowerCase()
      .split(/[\s\-\(\)\.\,\;\!\?\"\'\/\+\*\&]/)) {
      const trimmed = word.replace(/[^a-z]/g, "").trim();
      if (trimmed.length >= 2) {
        res.push(trimmed);
      }
    }
  }

  return res;
}

export async function saveSongDb(db: SongDbListItem, data: SongDatabase) {
  await cloudSongs.transaction(
    "rw",
    cloudSongs.songs,
    cloudSongs.artists,
    cloudSongs.databases,
    cloudSongs.letters,
    () => {
      const songs = data.songs.map((song) => ({
        ..._.omit(song, ["text"]),
        databaseId: db.id,
        databaseTitle: db.title,
        id: `${db.id}/${song.id}`,
        artistId: `${db.id}/${song.artistId}`,
        isActive: 1,
        textWords: _.uniq(tokenize(song.text!).slice(0, 20)),
        titleWords: _.uniq(tokenize(song.title)),
      }));
      cloudSongs.songs.bulkAdd(_.uniqBy(songs, "id"));

      const artists = data.artists.map((artist) => ({
        ...artist,
        id: `${db.id}/${artist.id}`,
        databaseId: db.id,
        databaseTitle: db.title,
        isActive: 1,
        letterId: `${db.id}/${artist.letter}`,
        nameWords: _.uniq(tokenize(artist.name)),
      }));
      cloudSongs.artists.bulkAdd(_.uniqBy(artists, "id"));

      cloudSongs.databases.add({
        ...db,
        isActive: 1,
        songCount: data.songs.length,
        artistCount: data.artists.length,
      });

      const letters = data.letters.map((letter) => ({
        ...letter,
        id: `${db.id}/${letter.letter}`,
        databaseId: db.id,
      }));
      cloudSongs.letters.bulkAdd(_.uniqBy(letters, "id"));
    }
  );
}

export async function deleteAllDatabases() {
  await cloudSongs.transaction(
    "rw",
    cloudSongs.songs,
    cloudSongs.artists,
    cloudSongs.databases,
    cloudSongs.letters,
    async () => {
      await cloudSongs.songs.clear();
      await cloudSongs.artists.clear();
      await cloudSongs.databases.clear();
      await cloudSongs.letters.clear();
    }
  );
}

export async function upgradeAllDatabases() {
  const dbs = await cloudSongs.databases.toArray();
  const data = await Promise.all(
    dbs.map((db) =>
      fetch(db.url)
        .then((res) => res.text())
        .then((res) => parseSongDatabase(res))
    )
  );

  await cloudSongs.transaction(
    "rw",
    cloudSongs.songs,
    cloudSongs.artists,
    cloudSongs.databases,
    cloudSongs.letters,
    async () => {
      await cloudSongs.songs.clear();
      await cloudSongs.artists.clear();
      await cloudSongs.databases.clear();
      await cloudSongs.letters.clear();

      for (const item of _.zip(dbs, data)) {
        await saveSongDb(item[0]!, item[1]!);
      }
    }
  );
}

export async function deleteSongDb(dbid: string) {
  await cloudSongs.transaction(
    "rw",
    cloudSongs.songs,
    cloudSongs.artists,
    cloudSongs.databases,
    cloudSongs.letters,
    () => {
      cloudSongs.songs.where({ databaseId: dbid }).delete();
      cloudSongs.artists.where({ databaseId: dbid }).delete();
      cloudSongs.databases.where({ id: dbid }).delete();
      cloudSongs.letters.where({ databaseId: dbid }).delete();
    }
  );
}

export async function findArtists(dbid?: string): Promise<LocalArtist[]> {
  const activeDbs = dbid ? [dbid] : await getActiveDatabaseIds();

  return localeSortByKey(
    await cloudSongs.artists.where("databaseId").anyOf(activeDbs).toArray(),
    "name"
  );
}

export async function findActiveLetters(
  dbid?: string
): Promise<GroupedLetter[]> {
  const activeDbs = dbid ? [dbid] : await getActiveDatabaseIds();

  const allLetters = await cloudSongs.letters
    .where("databaseId")
    .anyOf(activeDbs)
    .toArray();

  const groupedLetters = _.groupBy(allLetters, (x) => x.letter);

  return _.sortBy(
    Object.entries(groupedLetters).map(([k, v]) => ({
      letter: k,
      artistCount: _.sumBy(v, (x) => x.artistCount),
      // letterIds: v.map((x) => x.id),
    })),
    "letter"
  );
}

export async function findArtistsByLetter(
  letter: string,
  dbid?: string
): Promise<LocalArtist[]> {
  const activeDbs = dbid ? [dbid] : await getActiveDatabaseIds();

  return localeSortByKey(
    await cloudSongs.artists
      .where("letterId")
      .anyOf(activeDbs.map((db) => `${db}/${letter}`))
      .toArray(),
    "name"
  );
}

export async function findDatabases(): Promise<LocalDatabase[]> {
  return localeSortByKey(await cloudSongs.databases.toArray(), "title");
}

export async function findFileDatabases(): Promise<LocalFileDatabase[]> {
  return localeSortByKey(await localSongs.databases.toArray(), "title");
}

export async function getActiveDatabaseIds(): Promise<string[]> {
  return (await cloudSongs.databases.where({ isActive: 1 }).toArray()).map(
    (x) => x.id
  );
}

export async function getActivceSongCount() {
  return _.sum(
    (await cloudSongs.databases.where({ isActive: 1 }).toArray()).map(
      (x) => x.songCount
    )
  );
}

export async function findSongsByArtist(
  artistId: string
): Promise<LocalSong[]> {
  return localeSortByKey(
    await cloudSongs.songs.where({ artistId }).toArray(),
    "title"
  );
}

export async function findSongsByDatabase(
  databaseId: string
): Promise<LocalSong[]> {
  return localeSortByKey(
    await cloudSongs.songs.where({ databaseId }).toArray(),
    "title"
  );
}

export async function findSongsByRange(
  offset: number,
  limit: number,
  databaseId?: string
): Promise<LocalSong[]> {
  const activeIds = await getActiveDatabaseIds();
  const where = databaseId
    ? cloudSongs.songs.where({ databaseId })
    : cloudSongs.songs.where("databaseId").anyOf(activeIds);
  return localeSortByKey(
    await where.offset(offset).limit(limit).toArray(),
    "title"
  );
}

export async function getSong(songid: string): Promise<LocalSong | undefined> {
  return cloudSongs.songs.get(songid);
}

export async function getSongs(songids: string[]): Promise<LocalSong[]> {
  return _.compact(await Promise.all(songids.map((songid) => getSong(songid))));
  // return cloudSongs.songs.where({ id: songids }).toArray();
}

export async function getLocalFileDatabase(
  id: number
): Promise<LocalFileDatabase | undefined> {
  return localSongs.databases.get(id);
}

export async function getLocalFileDatabaseContent(
  id: number
): Promise<LocalFileDatabaseContent | undefined> {
  return (
    await localSongs.dbcontent.where({ databaseId: id, isActive: 1 }).toArray()
  )[0];
}

export async function getArtist(
  artistid: string
): Promise<LocalArtist | undefined> {
  return cloudSongs.artists.get(artistid);
}

export async function getDatabase(
  dbid: string
): Promise<LocalDatabase | undefined> {
  return cloudSongs.databases.get(dbid);
}

export async function setLocalDbActive(dbid: string, isActive: boolean) {
  await cloudSongs.databases
    .where({ id: dbid })
    .modify({ isActive: isActive ? 1 : 0 });
}

async function deleteOldRecents() {
  const count = await preferences.recents.count();
  if (count > 100) {
    const all = _.sortBy(await preferences.recents.toArray(), (x) => x.date);
    await preferences.recents.bulkDelete(all.slice(0, -100).map((x) => x.id));
  }
}

export async function addRecentSong(song: LocalSong) {
  await preferences.recents.put({
    type: "song",
    date: new Date(),
    id: `song:${song.id}`,
    song,
  });
  await deleteOldRecents();
}

export async function addRecentArtist(artist: LocalArtist) {
  await preferences.recents.put({
    type: "artist",
    date: new Date(),
    id: `artist:${artist.name}`,
    artist,
  });
  await deleteOldRecents();
}

export async function addLocalSongsDb(title: string) {
  const newid = await localSongs.databases.put({
    title,
    songCount: 2,
    artistCount: 1,
  });
  await localSongs.dbcontent.put({
    databaseId: newid,
    data: "@title=song1\n@artist=Some artist\n\n#1.\nText[Ami] to be [Fmaj]continued\n\n---\n\n@title=song2\n@artist=Some artist\n\n#1.\nText[Ami] to be [Fmaj]continued",
    isActive: 1,
    savedDate: new Date(),
  });
  return newid;
}

export async function saveLocalSongsDb(dbid: number, source: string) {
  const oldDb = (await getLocalFileDatabase(dbid))!;
  const parsed = parseSongDatabase(source);

  const newDb = {
    ...oldDb,
    data: source,
    songCount: parsed.songs.length,
    artistCount: parsed.artists.length,
  };

  await localSongs.databases.put(newDb);
  await localSongs.dbcontent.where({ databaseId: dbid }).delete();
  await localSongs.dbcontent.put({
    databaseId: dbid,
    savedDate: new Date(),
    isActive: 1,
    data: source,
  });

  const activated = await getDatabase(String(dbid));
  if (activated) {
    await convertDbFromFileToCloud(newDb, parsed);
  }
}

export async function addNewSongsToLocalDb(
  dbid: number,
  addedSongsSource: string
) {
  const activated = await getDatabase(String(dbid));
  if (!activated) {
    return;
  }

  const oldContent = await getLocalFileDatabaseContent(dbid);

  const newSource = oldContent?.data
    ? oldContent?.data + "\n---\n" + addedSongsSource
    : addedSongsSource;
  await saveLocalSongsDb(dbid, newSource);
}

export async function updateSongsInLocalDb(
  dbid: number,
  updatedSongsIds: string[],
  updatedSongsSource: string
) {
  const activated = await getDatabase(String(dbid));
  if (!activated) {
    return;
  }

  const songs = await findSongsByDatabase(String(dbid));
  const newSource = [
    ...songs
      .filter((x) => !updatedSongsIds.includes(x.id))
      .map((x) => x.source),
    updatedSongsSource,
  ].join("\n---\n");
  await saveLocalSongsDb(dbid, newSource);
}

export async function deleteSongsFromLocalDb(
  dbid: number,
  deletedSongsIds: string[]
) {
  const activated = await getDatabase(String(dbid));
  if (!activated) {
    return;
  }

  const songs = await findSongsByDatabase(String(dbid));
  const newSource = songs
    .filter((x) => !deletedSongsIds.includes(x.id))
    .map((x) => x.source)
    .join("\n---\n");
  await saveLocalSongsDb(dbid, newSource);
}

export async function deleteFileDb(id: number) {
  await localSongs.databases.delete(id);
  await localSongs.dbcontent.where({ databaseId: id }).delete();
}

export async function findAllRecents(): Promise<LocalRecentObject[]> {
  const res = await preferences.recents.toArray();
  const sorted = _.sortBy(res, (x) => x.date);
  sorted.reverse();
  return sorted;
}
export interface LocalDbSearchResult {
  artists: LocalArtist[];
  songs: LocalSong[];
  searchDone: boolean;
}

export async function searchLocalDb(
  criteria: string
): Promise<LocalDbSearchResult> {
  const tokens = tokenize(criteria);

  const LIMIT = 100;

  if (!tokens.length) {
    return {
      searchDone: false,
      songs: [],
      artists: [],
    };
  }

  const activeDbs = await getActiveDatabaseIds();

  const artists = await cloudSongs.artists
    .where("nameWords")
    .startsWith(_.maxBy(tokens, (x) => x.length)!)
    .filter(
      (artist) =>
        activeDbs.includes(artist.databaseId) &&
        tokens.every((token) =>
          artist.nameWords.find((word) => word.startsWith(token))
        )
    )
    .distinct()
    .limit(LIMIT)
    .toArray();

  if (artists.length >= LIMIT) {
    return {
      searchDone: true,
      songs: [],
      artists,
    };
  }

  const songsByTitle = await cloudSongs.songs
    .where("titleWords")
    .startsWith(_.maxBy(tokens, (x) => x.length)!)
    .filter(
      (song) =>
        activeDbs.includes(song.databaseId) &&
        tokens.every((token) =>
          song.titleWords.find((word) => word.startsWith(token))
        )
    )
    .distinct()
    .limit(LIMIT - artists.length)
    .toArray();

  if (artists.length + songsByTitle.length >= LIMIT) {
    return {
      searchDone: true,
      songs: songsByTitle,
      artists,
    };
  }

  const songsByText = await cloudSongs.songs
    .where("textWords")
    .startsWith(_.maxBy(tokens, (x) => x.length)!)
    .filter(
      (song) =>
        activeDbs.includes(song.databaseId) &&
        tokens.every(
          (token) =>
            song.titleWords.find((word) => word.startsWith(token)) ||
            song.textWords.find((word) => word.startsWith(token))
        )
    )
    .distinct()
    .limit(LIMIT - artists.length - songsByTitle.length)
    .toArray();

  return {
    searchDone: true,
    songs: [
      ...localeSortByKey(songsByTitle, "title"),
      ...localeSortByKey(songsByText, "title"),
    ],
    artists: localeSortByKey(artists, "name"),
  };
}

export async function convertDbFromFileToCloud(
  db: LocalFileDatabase,
  parsed?: SongDatabase
) {
  if (!parsed) {
    const content = await getLocalFileDatabaseContent(db.id!);
    if (content) {
      parsed = parseSongDatabase(content?.data!);
    }
  }
  if (!parsed) {
    return;
  }

  await deleteSongDb(String(db.id));

  await saveSongDb(
    {
      title: db.title,
      id: String(db.id),
      description: "",
      url: "",
      size: "",
      // @ts-ignore
      songCount: parsed.songs.length,
      artistCount: parsed.artists.length,
    },
    parsed
  );
}
