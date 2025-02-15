import std.sys;

using civ7_chunk;

struct array_chunk {
    u64 oned;
    u32 one;
    u32 blank;
    u32 len;
    civ7_chunk chunks[len];
};

struct civ7_chunk {
    u32 marker;
    u64 type;
    
    if (type == 1) {
        u32 unknown[3];
    }
    
    if (type == 2) {
      // utf-8 string
      u16 len;
      u16 wat;
      u32 key;
      if (key == 1) {
            char str_data[len];
      }
    }
    
    
    if (type == 3) {
        // utf-16 string?
        u16 len;
        u16 wat1;
        u32 wat2;
        char16 str_data[len];
    }
    
    if (type == 8) {
        // 32 bit number
        u32 len; // should always be 1?
        u32 unknown;
        u32 data[len];
    }
    
    if (type == 9) {
        u16 len;
        u16 unknown[3];
        u32 data[len];
    }
    
    if (type == 10) {
        u32 len;
        u32 unknown;
        u64 data[len];
    }
    
    if (type == 11) {
        u32 len;
        u32 unknown;
        u64 data[len];
    }
    
    if (type == 12) {
        u32 unknown[3];
    }
    
    if (type == 17) {
        u16 len;
        u16 unknown[3];
        u64 unknown[len];
    }
    
    if (type == 29) {
        u32 wat[2];
        u32 len;
        civ7_chunk chunks[len];
    }
    
    if (type == 30) {
        // start array?
        u32 wat[2];
        u32 len;
        array_chunk chunks[len];
    }
    
    if (type == 32) {
        u32 wat1;
        u32 len;
        u8 data[len];
    }
    
    std::assert(type <= 32, "Bad type");
};

struct civ7_struct {
    char header[4];
    std::assert(header == "CIV7", "Invalid header!");
    u32 wat1;
    u32 len;
    civ7_chunk chunks_1[len];
    
    u32 wat2 [2];
    u32 len2;
    civ7_chunk chunks_2[len2];
    
    u32 wat3;
    u32 len3;
    civ7_chunk chunks_3[len3];
    
    u32 wat4[4];
    u32 len4;
    civ7_chunk chunks_4[len4];
    
    u32 len5;
    civ7_chunk chunks_5[len5];
    
};

civ7_struct civ7 @ 0x00;