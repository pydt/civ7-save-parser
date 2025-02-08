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
    
    if (type == 9) {
        u32 unknown[3];
    }
    
    if (type == 10) {
        u32 unknown[4];
    }
    
    if (type == 11) {
        u32 unknown[4];
    }
    
    if (type == 30) {
        // start array?
        u32 wat1;
        u32 wat2;
        u32 len;
        array_chunk chunks[len];
    }
    
    if (type == 32) {
        u32 wat1;
        u32 len;
        u8 data[len];
    }
};

struct civ7_struct {
    char header[4];
    std::assert(header == "CIV7", "Invalid header!");
    u32 wat1;
    u32 wat2;
    civ7_chunk chunk[while($ < 10000)];
};

civ7_struct civ7 @ 0x00;