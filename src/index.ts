import { readFileSync } from 'fs';
import minimist from 'minimist';

export const GAME_DATA_MARKERS = {
  GAME_TURN: Buffer.from([0x9d, 0x2c, 0xe6, 0xbd]),
  GAME_AGE: Buffer.from([0x84, 0x84, 0xc6, 0xd0]),
  LEADER_NAME: Buffer.from([0x0f, 0xfb, 0x8c, 0xc1]),
  CIV_NAME: Buffer.from([0x76, 0x97, 0x40, 0xde])
};

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

        if (leader && civ) {
          return [
            {
              leader,
              civ
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
  group4: Civ7Chunk[];
  group5: Civ7Chunk[];
};

export const parseRaw = (data: Buffer): RawChunkData => {
  if (data.subarray(0, 4).toString() !== 'CIV7') {
    throw new Error('Not a CIV 7 save file!');
  }

  const lastEndOffset = (chunks: Civ7Chunk[]) => chunks[chunks.length - 1].endOffset;

  // There has to be some pattern to the root data but I haven't figured it out yet
  const group1Len = data.readUint32LE(8);
  const group1 = readNChunks(data, 12, group1Len);

  const group2Len = data.readUint32LE(lastEndOffset(group1) + 8);
  const group2 = readNChunks(data, lastEndOffset(group1) + 12, group2Len);

  const group3Len = data.readUint32LE(lastEndOffset(group2) + 4);
  const group3 = readNChunks(data, lastEndOffset(group2) + 8, group3Len);

  const group4Len = data.readUint32LE(lastEndOffset(group3) + 16);
  const group4 = readNChunks(data, lastEndOffset(group3) + 20, group4Len);

  const group5Len = data.readUint32LE(lastEndOffset(group4));
  const group5 = readNChunks(data, lastEndOffset(group4) + 4, group5Len);

  return {
    group1,
    group2,
    group3,
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
