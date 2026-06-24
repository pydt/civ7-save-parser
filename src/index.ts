import { readFileSync } from 'fs';
import { inflateSync, constants } from 'zlib';
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

export const GAME_DATA_MARKERS = {
  GAME_TURN: Buffer.from([0x9d, 0x2c, 0xe6, 0xbd]),
  GAME_AGE: Buffer.from([0x84, 0x84, 0xc6, 0xd0]),
  LEADER_NAME: Buffer.from([0x0f, 0xfb, 0x8c, 0xc1]),
  CIV_NAME: Buffer.from([0x76, 0x97, 0x40, 0xde]),
  // Per-player actor type. Civ6 called this ACTOR_AI_HUMAN (marker 95b942ce);
  // Civ7 renamed the marker but kept the value encoding: 3 = Human, 1 = AI.
  PLAYER_TYPE: Buffer.from([0xd4, 0x5f, 0x83, 0x28]),
  // Per-player id, matching the in-game player id / localPlayerID space.
  // Confirmed: Lakshmibai=0, Augustus=1, Franklin=2.
  PLAYER_ID: Buffer.from([0xde, 0xf6, 0x2d, 0x9b])
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

export const parseChunks = (data: RawChunkData) => {
  return {
    turn: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_TURN)),
    age: data.group1.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_AGE)),
    players: data.group3.flatMap(x => {
      if (x.type === ChunkType.ChunkArray) {
        const leader = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.LEADER_NAME) && y.value);
        const civ = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.CIV_NAME) && y.value);
        const playerType = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.PLAYER_TYPE));
        const playerId = x.value.find(y => y.marker.equals(GAME_DATA_MARKERS.PLAYER_ID));

        if (leader && civ) {
          // PLAYER_ID matches the in-game player id / localPlayerID space
          // (confirmed: Lakshmibai=0, Augustus=1, Franklin=2). Whose turn it is
          // (localPlayerID) is NOT in the uncompressed data — see REVERSING.md.
          const id = typeof playerId?.value === 'number' ? playerId.value : undefined;
          return [
            {
              leader,
              civ,
              playerType,
              id,
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

export const parseChunk = (data: Buffer, offset: number): Civ7Chunk => {
  const marker = data.subarray(offset, offset + 4);
  const type = data.readUint32LE(offset + 4);

  const dataStartOffset = offset + 12;

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
      const result = [];
      let endOffset = dataStartOffset + 12;

      for (let i = 0; i < itemCount; i++) {
        const len = data.readUInt32LE(endOffset + 16);
        const subChunks = readNChunks(data, endOffset + 20, len);
        result.push(subChunks);
        endOffset = subChunks[subChunks.length - 1]?.endOffset;
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
