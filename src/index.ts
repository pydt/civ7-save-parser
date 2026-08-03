import { readFileSync } from 'fs';
import { inflateSync, deflateSync, constants } from 'zlib';
import minimist from 'minimist';

// The bulk game state (units, tiles, per-player data, whose turn it is) lives in
// a compressed section after the uncompressed chunk groups. Framing matches Civ6:
// a zlib stream split into length-prefixed blocks, i.e. a repeating
// [u32 LE blockLen][blockLen bytes of deflate data]. The first block's length
// prefix is 0x00010000 (65536) immediately followed by the zlib header (78 9c),
// so COMPRESSED_DATA_START reliably locates the start. Concatenate the block
// payloads (dropping the length prefixes) and inflate with Z_SYNC_FLUSH.
// (Approach confirmed against the community tool iqqmuT/civ7-save-editor.)
const COMPRESSED_DATA_START = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x78, 0x9c]);

/**
 * Decompress the game-state blob from a Civ7 save. Returns ~7 MB of data that is
 * largely (but not entirely) in the same marker+type chunk format as the header.
 * Returns null if the save has no compressed section.
 */
export const decompress = (data: Buffer): Buffer | null => {
  const start = data.indexOf(COMPRESSED_DATA_START);
  if (start < 0) {
    return null;
  }

  const blocks: Buffer[] = [];
  let pos = start;
  let blockLen = data.readUInt32LE(pos);
  pos += 4;
  while (blockLen > 1 && pos + blockLen <= data.length) {
    blocks.push(data.subarray(pos, pos + blockLen));
    pos += blockLen;
    if (pos + 4 > data.length) {
      break;
    }
    blockLen = data.readUInt32LE(pos);
    pos += 4;
  }

  return inflateSync(Buffer.concat(blocks), { finishFlush: constants.Z_SYNC_FLUSH });
};

const COMPRESSED_BLOCK_SIZE = 64 * 1024;

/** Locate the compressed section: [start, end) covers the length-prefixed blocks
 *  (everything before `start` is the uncompressed header; everything from `end`
 *  is the trailer, whose leading u32=1 terminates block reading). */
const compressedBounds = (data: Buffer): { start: number; end: number } | null => {
  const start = data.indexOf(COMPRESSED_DATA_START);
  if (start < 0) {
    return null;
  }

  let pos = start;
  let blockLen = data.readUInt32LE(pos);
  pos += 4;
  while (blockLen > 1 && pos + blockLen <= data.length) {
    pos += blockLen;
    if (pos + 4 > data.length) {
      return { start, end: pos };
    }
    blockLen = data.readUInt32LE(pos);
    pos += 4;
  }

  // We exited by reading the terminator (blockLen <= 1) and advanced 4 past it;
  // back up so the trailer (the terminator onward) stays with the footer.
  return { start, end: pos - 4 };
};

/** Deflate + re-chunk into the save's length-prefixed block framing (inverse of
 *  the block reading in decompress()). */
const recompress = (decompressed: Buffer): Buffer => {
  // Default level (6) keeps the zlib header at 78 9c, matching the game's saves
  // and our COMPRESSED_DATA_START detection. (Level 9 would emit 78 da.)
  const deflated = deflateSync(decompressed, { finishFlush: constants.Z_SYNC_FLUSH });
  const parts: Buffer[] = [];
  for (let pos = 0; pos < deflated.length; pos += COMPRESSED_BLOCK_SIZE) {
    const block = deflated.subarray(pos, pos + COMPRESSED_BLOCK_SIZE);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(block.length);
    parts.push(len, block);
  }
  return Buffer.concat(parts);
};

/**
 * Write a modified game-state blob back into a save: keeps the uncompressed
 * header and trailer, re-compresses the (modified) decompressed data, and
 * reassembles. `modifiedDecompressed` is the buffer from decompress(), edited.
 * Recompressed bytes differ from the original (zlib vs the game's compressor) but
 * decompress to the same data; the game accepts re-written saves.
 */
export const writeCompressedData = (originalSave: Buffer, modifiedDecompressed: Buffer): Buffer => {
  const bounds = compressedBounds(originalSave);
  if (!bounds) {
    throw new Error('Save has no compressed section');
  }

  return Buffer.concat([
    originalSave.subarray(0, bounds.start),
    recompress(modifiedDecompressed),
    originalSave.subarray(bounds.end)
  ]);
};

export const GAME_DATA_MARKERS = {
  GAME_TURN: Buffer.from([0x9d, 0x2c, 0xe6, 0xbd]),
  GAME_AGE: Buffer.from([0x84, 0x84, 0xc6, 0xd0]),
  LEADER_NAME: Buffer.from([0x0f, 0xfb, 0x8c, 0xc1]),
  CIV_NAME: Buffer.from([0x76, 0x97, 0x40, 0xde]),
  // Per-player actor type. Civ6 called this ACTOR_AI_HUMAN (marker 95b942ce);
  // Civ7 renamed the marker but kept the value encoding: 3 = Human, 1 = AI.
  PLAYER_TYPE: Buffer.from([0xd4, 0x5f, 0x83, 0x28]),
  // Per-player TEAM id (renamed from an earlier PLAYER_ID guess). In FFA games
  // each player is on their own team, so this happens to equal a per-player
  // index (0,1,2...) with no collisions — which is how we originally mistook
  // it for a player id. In team games (see tests/teams_*.Civ7Save) teammates
  // share the same value, so it CANNOT be used to uniquely address a player.
  // Use PLAYER_SLOT_MARKERS / the `id` field derived from it instead.
  TEAM_ID: Buffer.from([0xde, 0xf6, 0x2d, 0x9b]),
  GAME_SPEED: Buffer.from([0x99, 0xb0, 0xd9, 0x05]),
  MAP_SIZE: Buffer.from([0x40, 0x5c, 0x83, 0x0b]),
  // Enabled mods/DLC/ages: a NestedArray in group1 of mod records.
  ENABLED_MODS: Buffer.from([0x5c, 0xae, 0x27, 0x84]),
  MOD_ID: Buffer.from([0x76, 0x61, 0x2f, 0xe5]),
  MOD_DISPLAY_NAME: Buffer.from([0x98, 0x26, 0x0b, 0xea]),
  MOD_ENABLED: Buffer.from([0x8c, 0xce, 0x87, 0x4d])
};

/**
 * Fixed, game-defined "slot" table — the Civ7 analogue of Civ6's SLOT_HEADERS.
 * Each group3 player record is itself keyed by one of these markers (i.e. it's
 * `record.marker`, not a field inside the record), and the marker-to-slot-number
 * association never changes: verified byte-identical order across every save
 * we've captured (single-player, hotseat, and 4v4 teams — see
 * tests/teams_*.Civ7Save), regardless of which civs/leaders occupy which slot.
 *
 * Unlike TEAM_ID, a slot is never shared between players, so it's the right
 * identifier to address a specific player (e.g. for setPlayerType). We've only
 * confirmed the 12 slots that have held a full civ in our sample saves (up to
 * 12 players); the remainder of the underlying table is city-state-only slots.
 */
export const PLAYER_SLOT_MARKERS = [
  Buffer.from([0xb8, 0x61, 0xf0, 0xf4]), // slot 0
  Buffer.from([0x2e, 0x51, 0xf7, 0x83]), // slot 1
  Buffer.from([0x94, 0x00, 0xfe, 0x1a]), // slot 2
  Buffer.from([0x02, 0x30, 0xf9, 0x6d]), // slot 3
  Buffer.from([0xa1, 0xa5, 0x9d, 0xf3]), // slot 4
  Buffer.from([0x37, 0x95, 0x9a, 0x84]), // slot 5
  Buffer.from([0x8d, 0xc4, 0x93, 0x1d]), // slot 6
  Buffer.from([0x1b, 0xf4, 0x94, 0x6a]), // slot 7
  Buffer.from([0x8a, 0xe9, 0x2b, 0xfa]), // slot 8
  Buffer.from([0x1c, 0xd9, 0x2c, 0x8d]), // slot 9
  Buffer.from([0x32, 0xca, 0x8c, 0xfa]), // slot 10
  Buffer.from([0xa4, 0xfa, 0x8b, 0x8d]) // slot 11
];

/** The slot index (0-based, see PLAYER_SLOT_MARKERS) for a group3 player
 *  record, or undefined if its marker isn't one of the known player slots. */
export const getSlotIndex = (recordMarker: Buffer): number | undefined => {
  const index = PLAYER_SLOT_MARKERS.findIndex(m => m.equals(recordMarker));
  return index >= 0 ? index : undefined;
};

export enum PlayerType {
  AI = 1,
  HUMAN = 3
}

export enum ChunkType {
  Unknown_1 = 1,
  Utf8String = 2,
  Utf16String = 3,
  Number32 = 8,
  Unknown_9 = 9,
  Unknown_10 = 10,
  Unknown_11 = 11,
  Unknown_12 = 12,
  Unknown_17 = 17,
  ChunkArray = 29,
  NestedArray = 30,
  Unknown_32 = 32
}

export type Civ7Chunk = {
  offset: number;
  dataStartOffset: number;
  endOffset: number;
  marker: Buffer;
} & (
  | {
      type: ChunkType.Utf8String | ChunkType.Utf16String;
      value: string;
    }
  | {
      type: ChunkType.Number32;
      value: number;
    }
  | {
      type: ChunkType.ChunkArray;
      value: Civ7Chunk[];
    }
  | {
      type: ChunkType.NestedArray;
      value: Civ7Chunk[][];
    }
  | {
      type:
        | ChunkType.Unknown_1
        | ChunkType.Unknown_9
        | ChunkType.Unknown_10
        | ChunkType.Unknown_11
        | ChunkType.Unknown_12
        | ChunkType.Unknown_17
        | ChunkType.Unknown_32;
      value: Buffer;
    }
);

export const parse = (data: Buffer) => {
  const chunks = parseRaw(data);
  return parseChunks(chunks);
};

/**
 * Set a player's type (Human / AI) by their slot id (see PLAYER_SLOT_MARKERS),
 * returning a new buffer. Used for turn-skipping: flip a player to AI so the
 * game plays their turn. PLAYER_TYPE is a fixed-size Number32, so this is an
 * in-place edit — nothing shifts.
 *
 * NOTE: this only changes the slot-keyed group3 player record. Whether the
 * game honors that alone (vs. also needing the group6 / compressed copies)
 * needs in-game verification.
 */
export const setPlayerType = (data: Buffer, playerId: number, type: PlayerType): Buffer => {
  const result = Buffer.from(data);
  const raw = parseRaw(result);
  let changed = false;

  for (const record of raw.group3) {
    if (record.type === ChunkType.ChunkArray) {
      const typeChunk = record.value.find(c => c.marker.equals(GAME_DATA_MARKERS.PLAYER_TYPE));

      if (getSlotIndex(record.marker) === playerId && typeChunk) {
        // Number32 value sits 8 bytes into the chunk data.
        result.writeUInt32LE(type, typeChunk.dataStartOffset + 8);
        changed = true;
      }
    }
  }

  if (!changed) {
    throw new Error(`No player with id ${playerId} found in the save`);
  }

  return result;
};

export interface Civ7Mod {
  id: string;
  name: string;
  enabled: boolean;
}

/**
 * The enabled mods / DLC / ages from the ENABLED_MODS block in group1.
 * Includes everything the game lists (base-standard, core, age-*, persona packs,
 * and any user mods like "pydt-hotseat-limiter").
 */
export const parseMods = (group1: Civ7Chunk[]): Civ7Mod[] => {
  const block = group1.find(x => x.marker.equals(GAME_DATA_MARKERS.ENABLED_MODS));

  if (!block || block.type !== ChunkType.NestedArray) {
    return [];
  }

  return block.value.flatMap(record => {
    const id = record.find(c => c.marker.equals(GAME_DATA_MARKERS.MOD_ID));
    const name = record.find(c => c.marker.equals(GAME_DATA_MARKERS.MOD_DISPLAY_NAME));
    const enabled = record.find(c => c.marker.equals(GAME_DATA_MARKERS.MOD_ENABLED));

    if (typeof id?.value !== 'string') {
      return [];
    }

    return [
      {
        id: id.value,
        name: typeof name?.value === 'string' ? name.value : '',
        enabled: enabled?.value === '1'
      }
    ];
  });
};

export const parseChunks = (data: RawChunkData) => {
  const mods = parseMods(data.group1);

  return {
    turn: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_TURN)),
    age: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_AGE)),
    gameSpeed: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_SPEED)),
    mapSize: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.MAP_SIZE)),
    mods,
    hasMod: (id: string) => mods.some(m => m.id === id && m.enabled),
    players: data.group3.flatMap(x => {
      if (x.type === ChunkType.ChunkArray) {
        const leader = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.LEADER_NAME) && y.value);
        const civ = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.CIV_NAME) && y.value);
        const playerType = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.PLAYER_TYPE));
        const team = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.TEAM_ID));

        if (leader && civ) {
          // `id` is the player's fixed slot number (see PLAYER_SLOT_MARKERS) —
          // unique per player, stable across saves, and what setPlayerType()
          // expects. `teamId` groups players (e.g. tests/teams_*.Civ7Save has
          // 4 teams of 2); in FFA games teamId happens to equal `id` since
          // each player is their own team. Whose turn it is (localPlayerID)
          // is NOT in the uncompressed data — see REVERSING.md.
          const id = getSlotIndex(x.marker);
          const teamId = typeof team?.value === 'number' ? team.value : undefined;
          return [
            {
              leader,
              civ,
              playerType,
              id,
              teamId,
              isHuman: playerType?.value === PlayerType.HUMAN
            }
          ];
        }
      }

      return [];
    }),
    rawData: data
  };
};

export type RawChunkData = {
  group1: Civ7Chunk[];
  group2: Civ7Chunk[];
  group3: Civ7Chunk[];
  /** Chunks that sit in the separator between group3 and group4. Empty in
   * single-player saves; non-empty in hotseat/multiplayer saves. */
  interstitial34: Civ7Chunk[];
  group4: Civ7Chunk[];
  group5: Civ7Chunk[];
};

const lastEndOffset = (chunks: Civ7Chunk[], fallback: number) =>
  chunks.length ? chunks[chunks.length - 1].endOffset : fallback;

/**
 * The separator between group3 and group4 is self-describing:
 *   [u32 a=1][u32 N][N chunks][u32][u32][u32 groupLen][group chunks...]
 * N is 0 in single-player saves and >0 in hotseat saves. Returns the
 * interstitial chunks plus where the following group's data starts.
 */
const readVarSeparator = (data: Buffer, off: number) => {
  const count = data.readUInt32LE(off + 4);
  const interstitial = readNChunks(data, off + 8, count);
  const afterChunks = lastEndOffset(interstitial, off + 8);
  return {
    interstitial,
    groupLen: data.readUInt32LE(afterChunks + 8),
    chunksAt: afterChunks + 12
  };
};

/**
 * The group4->group5 boundary is a simpler, variable-width header: zero or more
 * small "count" words, then [u32 groupLen][first marker...]. A real marker is a
 * 4-byte hash (>= 256) followed by a non-zero type word, so we scan forward for
 * the first plausible marker and take the group length from the word before it.
 */
const findNextGroup = (data: Buffer, off: number) => {
  for (let p = off; p < off + 64 && p + 8 <= data.length; p += 4) {
    const maybeMarker = data.readUInt32LE(p);
    const maybeType = data.readUInt32LE(p + 4);
    if (maybeMarker >= 256 && maybeType > 0 && maybeType <= 32) {
      return { groupLen: data.readUInt32LE(p - 4), chunksAt: p };
    }
  }
  throw new Error(`Could not locate next group after offset ${off}`);
};

export const parseRaw = (data: Buffer): RawChunkData => {
  if (data.subarray(0, 4).toString() !== 'CIV7') {
    throw new Error('Not a CIV 7 save file!');
  }

  const group1 = readNChunks(data, 12, data.readUint32LE(8));
  let off = lastEndOffset(group1, 12);

  const group2 = readNChunks(data, off + 12, data.readUint32LE(off + 8));
  off = lastEndOffset(group2, off);

  const group3 = readNChunks(data, off + 8, data.readUint32LE(off + 4));
  off = lastEndOffset(group3, off);

  // group3 -> group4: variable separator carrying interstitial chunks
  const sep = readVarSeparator(data, off);
  const group4 = readNChunks(data, sep.chunksAt, sep.groupLen);
  off = lastEndOffset(group4, sep.chunksAt);

  // group4 -> group5 uses a different header; best-effort so a failure here
  // never loses the player data in groups 1-3.
  let group5: Civ7Chunk[] = [];
  try {
    const next = findNextGroup(data, off);
    group5 = readNChunks(data, next.chunksAt, next.groupLen);
  } catch {
    group5 = [];
  }

  return {
    group1,
    group2,
    group3,
    interstitial34: sep.interstitial,
    group4,
    group5
  };
};

export const readNChunks = (data: Buffer, offset: number, numChunks: number): Civ7Chunk[] => {
  const chunks = [];

  for (let i = 0; i < numChunks; i++) {
    const result = parseChunk(data, chunks[chunks.length - 1]?.endOffset || offset);
    chunks.push(result);
  }

  return chunks;
};

// `hasMarker = false` parses a "markerless" chunk (just [type][body], no leading
// 4-byte marker) — the item format inside a NestedArray. Everything downstream
// keys off dataStartOffset, so the two forms share the same body-parsing switch.
export const parseChunk = (data: Buffer, offset: number, hasMarker = true): Civ7Chunk => {
  const marker = hasMarker ? data.subarray(offset, offset + 4) : data.subarray(offset, offset);
  const type = data.readUint32LE(hasMarker ? offset + 4 : offset);

  const dataStartOffset = hasMarker ? offset + 12 : offset + 8;

  switch (type) {
    case ChunkType.Unknown_1:
    case ChunkType.Unknown_12: {
      // unknown 12 byte data
      const endOffset = dataStartOffset + 12;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset, endOffset)
      };
    }

    case ChunkType.Unknown_9: {
      // unknown variable length 32 bit data?
      const len = data.readUint16LE(dataStartOffset);
      const endOffset = dataStartOffset + 8 + len * 4;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset + 8, endOffset)
      };
    }

    case ChunkType.Unknown_10:
    case ChunkType.Unknown_11:
    case ChunkType.Unknown_17: {
      // unknown variable length 64 bit data?
      const len = data.readUInt16LE(dataStartOffset);
      const endOffset = dataStartOffset + 8 + len * 8;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset + 4, endOffset)
      };
    }

    case ChunkType.Number32: {
      return {
        offset,
        dataStartOffset,
        endOffset: dataStartOffset + 12,
        marker,
        type,
        value: data.readUint32LE(dataStartOffset + 8)
      };
    }

    case ChunkType.Utf8String: {
      const len = data.readUint16LE(dataStartOffset);
      const endOffset = dataStartOffset + 8 + len;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset + 8, endOffset - 1).toString('utf-8')
      };
    }

    case ChunkType.Utf16String: {
      const len = data.readUint16LE(dataStartOffset);
      const endOffset = dataStartOffset + 8 + len * 2;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset + 8, endOffset - 2).toString('utf16le')
      };
    }

    case ChunkType.ChunkArray: {
      const subChunkCount = data.readUint32LE(dataStartOffset + 8);
      const subChunks = readNChunks(data, dataStartOffset + 12, subChunkCount);

      return {
        offset,
        dataStartOffset,
        endOffset: subChunks[subChunks.length - 1]?.endOffset || dataStartOffset + 12,
        marker,
        type,
        value: subChunks
      };
    }

    case ChunkType.NestedArray: {
      const itemCount = data.readUint32LE(dataStartOffset + 8);
      const result: Civ7Chunk[][] = [];
      let endOffset = dataStartOffset + 12;

      for (let i = 0; i < itemCount; i++) {
        // Each item is a markerless chunk. Usually a ChunkArray record (e.g. an
        // ENABLED_MODS entry) — kept as its sub-chunk list to preserve the
        // Civ7Chunk[][] shape — but can also be a plain value chunk such as a
        // string (e.g. the age-crisis type list), which becomes a 1-element list.
        const item = parseChunk(data, endOffset, false);
        result.push(item.type === ChunkType.ChunkArray ? item.value : [item]);
        endOffset = item.endOffset;
      }

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: result
      };
    }

    case ChunkType.Unknown_32:
      // unknown data string
      const len = data.readUInt32LE(dataStartOffset + 4);
      const endOffset = dataStartOffset + 8 + len;

      return {
        offset,
        dataStartOffset,
        endOffset,
        marker,
        type,
        value: data.subarray(dataStartOffset + 8, endOffset)
      };
  }

  throw new Error(`Could not parse chunk at offset ${offset}!`);
};

if (require.main === module) {
  const argv = minimist(process.argv.slice(2));

  if (!argv._.length) {
    console.log('Please pass the filename as the argument to the script.');
  } else {
    const buffer = readFileSync(argv._[0]);
    const result = parse(buffer);
    console.log(
      JSON.stringify(
        result,
        (key, value) => {
          if (value.value) {
            return value.value;
          }

          if (key === 'rawData') {
            return undefined;
          }

          return value;
        },
        2
      )
    );
  }
}
