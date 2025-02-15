import { readFileSync } from 'fs';
import minimist from 'minimist';

export const GAME_DATA_MARKERS = {
  GAME_TURN: Buffer.from([0x9d, 0x2c, 0xe6, 0xbd]),
  GAME_AGE: Buffer.from([0x84, 0x84, 0xc6, 0xd0])
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
  if (data.subarray(0, 4).toString() !== 'CIV7') {
    throw new Error('Not a CIV 7 save file!');
  }

  const allChunks: Civ7Chunk[] = [];

  const lastEndOffset = () => allChunks[allChunks.length - 1].endOffset;

  // There has to be some pattern to the root data but I haven't figured it out yet
  const group1Len = data.readUint32LE(8);
  allChunks.push(...readNChunks(data, 12, group1Len));

  const group2Len = data.readUint32LE(lastEndOffset() + 8);
  allChunks.push(...readNChunks(data, lastEndOffset() + 12, group2Len));

  const group3Len = data.readUint32LE(lastEndOffset() + 4);
  allChunks.push(...readNChunks(data, lastEndOffset() + 8, group3Len));

  const group4Len = data.readUint32LE(lastEndOffset() + 16);
  allChunks.push(...readNChunks(data, lastEndOffset() + 20, group4Len));

  const group5Len = data.readUint32LE(lastEndOffset());
  allChunks.push(...readNChunks(data, lastEndOffset() + 4, group5Len));

  return allChunks;
};

export const readNChunks = (data: Buffer, offset: number, numChunks: number) => {
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

type SimplifyResult = {
  marker: Buffer;
  value: string | number | SimplifyResult[] | SimplifyResult[][];
};

export const simplify = (chunks: Civ7Chunk[]): SimplifyResult[] => {
  return chunks.flatMap<SimplifyResult>(c => {
    switch (c.type) {
      case ChunkType.Utf8String:
      case ChunkType.Utf16String:
      case ChunkType.Number32:
        return [
          {
            marker: c.marker,
            value: c.value
          }
        ];

      case ChunkType.NestedArray:
        const value = c.value.map(x => simplify(x));

        return value.some(x => x.length)
          ? [
              {
                marker: c.marker,
                value
              }
            ]
          : [];

      case ChunkType.ChunkArray: {
        const value = simplify(c.value);

        return value.some(x => typeof x.value === 'number' || x.value?.length)
          ? [
              {
                marker: c.marker,
                value
              }
            ]
          : [];
      }

      default:
        return [];
    }
  });
};

if (require.main === module) {
  const argv = minimist(process.argv.slice(2));

  if (!argv._.length) {
    console.log('Please pass the filename as the argument to the script.');
  } else {
    const buffer = readFileSync(argv._[0]);
    const result = parse(buffer);
    console.log(JSON.stringify(simplify(result), null, 2));
  }
}
