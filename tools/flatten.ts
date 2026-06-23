import { parseRaw, ChunkType, Civ7Chunk, RawChunkData } from '../src/index';
import { MARKERS } from '../src/markers';

export interface FlatEntry {
  /** Structural path, e.g. "group3/2:0ffb8cc1" or "group3/2:abc.../0:def...". */
  path: string;
  /** Little-endian marker hex as stored in the file. */
  marker: string;
  /** Friendly name if known. */
  name?: string;
  type: ChunkType;
  typeName: string;
  /** Stable string representation of the value, used for display + diffing. */
  value: string;
  /** True for container chunks (ChunkArray / NestedArray). */
  container: boolean;
}

const hex = (b: Buffer) => b.toString('hex');

/** Stable, comparable string representation of a chunk's value. */
export const valueRepr = (c: Civ7Chunk): string => {
  if (typeof c.value === 'string') return JSON.stringify(c.value);
  if (typeof c.value === 'number') return String(c.value);
  if (Buffer.isBuffer(c.value)) return `bytes:${hex(c.value)}`;
  if (Array.isArray(c.value)) {
    // NestedArray is Civ7Chunk[][]; ChunkArray is Civ7Chunk[]
    const len = c.value.length;
    return c.type === ChunkType.NestedArray ? `nested[${len}]` : `array[${len}]`;
  }
  return '';
};

const walk = (chunks: Civ7Chunk[], prefix: string, out: FlatEntry[]) => {
  chunks.forEach((c, i) => {
    const marker = hex(c.marker);
    const path = `${prefix}/${i}:${marker}`;
    const container = c.type === ChunkType.ChunkArray || c.type === ChunkType.NestedArray;
    out.push({
      path,
      marker,
      name: MARKERS[marker]?.name,
      type: c.type,
      typeName: ChunkType[c.type] ?? `t${c.type}`,
      value: valueRepr(c),
      container
    });
    if (c.type === ChunkType.ChunkArray) {
      walk(c.value as Civ7Chunk[], path, out);
    } else if (c.type === ChunkType.NestedArray) {
      (c.value as Civ7Chunk[][]).forEach((sub, j) => walk(sub, `${path}/${j}`, out));
    }
  });
};

/** Flatten an entire parsed save into a list of path-keyed entries. */
export const flatten = (raw: RawChunkData): FlatEntry[] => {
  const out: FlatEntry[] = [];
  for (const [group, chunks] of Object.entries(raw)) {
    walk(chunks as Civ7Chunk[], group, out);
  }
  return out;
};

export const flattenBuffer = (data: Buffer): FlatEntry[] => flatten(parseRaw(data));
