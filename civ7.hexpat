import std.sys;
import std.core;
import std.mem;

// ============================================================================
//  Civ7 save format  (.Civ7Save)  — reverse-engineered for playyourdamnturn.com
//  Companion to REVERSING.md and src/markers.ts (the authoritative dictionary).
//
//  Layout:  "CIV7" header, then a series of chunk "groups", then a compressed
//  game-state blob (not described here):
//    group1   game/session metadata (turn, age, settings, GUID, enabled mods)
//    group2   4 small fixed records
//    group3   per-player records (leader / civ / PLAYER_TYPE) + city-states
//    (interstitial chunks — present only in hotseat / multiplayer saves)
//    group4   Number32 flags / counters
//    group5   small section
//    group6   second per-actor section (same marker keys as group3)
//    ...      END_UNCOMPRESSED (00 00 01 00) + zlib-compressed state
//             (whose-turn, unit positions, etc. live in here)
//
//  Every chunk is keyed by a stable 4-byte marker — an FNV-style hash of an
//  internal field name, CONSTANT across all saves and SHARED with Civ6 for the
//  game-level fields. Markers are stored little-endian; the match values below
//  are the u32 (LE) as ImHex reads/displays them.
// ============================================================================

fn format_marker(u32 m) {
    match (m) {
        (0x40213E08): return "AGE_DISPLAY_NAME";
        (0x3A0545DA): return "APP_VERSION";
        (0x760A632A): return "CIV_DISPLAY_NAME";
        (0x7FB416A8): return "DIFFICULTY";
        (0x0F32E71D): return "DIFFICULTY_DISPLAY_NAME";
        (0x8427AE5C): return "ENABLED_MODS";
        (0xD0C68484): return "GAME_AGE";
        (0xE8615AFE): return "GAME_DATE";
        (0xF4E540D8): return "GAME_GUID";
        (0xBDE62C9D): return "GAME_TURN";
        (0x05D9B099): return "GAMESPEED";
        (0xFAD3D4C3): return "GAMESPEED_DISPLAY_NAME";
        (0x4D42B590): return "GUID_BINARY";
        (0xAF9AE4BB): return "HOST_CIVILIZATION";
        (0x6BB7B2A1): return "HOST_LEADER";
        (0x9DBCDA95): return "LEADER_DISPLAY_NAME";
        (0x584C6027): return "MAP_DISPLAY_NAME";
        (0x0B835C40): return "MAPSIZE";
        (0xA69B93CD): return "MAPSIZE_DISPLAY_NAME";
        (0xEA0B2698): return "mod.DISPLAY_NAME";
        (0x4D87CE8C): return "mod.ENABLED";
        (0xE52F6176): return "mod.ID";
        (0xD0A9D02F): return "mod.unknown_2fd0a9d0";
        (0x306F37F9): return "PLATFORM";
        (0x1099AFBD): return "player.AGE_CIV_COLLECTION";
        (0xA61F8C33): return "player.AGE_CIV_COLLECTION_2";
        (0x7E57445B): return "player.CIV_ADJECTIVE_LOC_KEY";
        (0x5E7A6BC5): return "player.CIV_FULLNAME_LOC_KEY";
        (0x21066932): return "player.CIV_NAME_LOC_KEY";
        (0x8D97FD50): return "player.CIV_POOL";
        (0xDE409776): return "player.CIVILIZATION";
        (0x19A09C7A): return "player.CIVILIZATION_LEVEL";
        (0xD6F59D65): return "player.COLOR_PRIMARY";
        (0xC18CFB0F): return "player.LEADER";
        (0x844694F9): return "player.LEADER_COLLECTION";
        (0xAA605FBD): return "player.LEADER_COLLECTION_2";
        (0x376E0D50): return "player.LEADER_POOL";
        (0x28835FD4): return "player.PLAYER_TYPE";        // 3 = Human, 1 = AI
        (0x48C3A20B): return "player.unknown_0ba2c348";
        (0x296EED0E): return "player.unknown_0eed6e29";   // city-state per-turn flag
        (0x6CFE5320): return "player.unknown_2053fe6c";
        (0xC5F1092C): return "player.unknown_2c09f1c5";
        (0x940E4331): return "player.unknown_31430e94";
        (0xDBD22E39): return "player.unknown_392ed2db";
        (0xC481BF39): return "player.unknown_39bf81c4";
        (0xBF00614A): return "player.unknown_4a6100bf";
        (0xA2392459): return "player.unknown_592439a2";
        (0xF7F2AC65): return "player.unknown_65acf2f7";
        (0x5A62396D): return "player.unknown_6d39625a";
        (0x006EC490): return "player.unknown_90c46e00";
        (0xC34C91AA): return "player.unknown_array_aa914cc3";
        (0xD9BAAFB2): return "player.unknown_b2afbad9";
        (0x4FBC7ECE): return "player.unknown_ce7ebc4f";
        (0xD47E92DB): return "player.unknown_db927ed4";
        (0x9B2DF6DE): return "player.unknown_def62d9b";
        (0x35CC85E3): return "player.unknown_e385cc35";
        (0x65598AEE): return "player.unknown_ee8a5965";
        (0xE9C15FFD): return "player.unknown_fd5fc1e9";
        (0xC45925DE): return "RULESET";
        (0xD028A431): return "RULESET_DISPLAY_NAME";
        (0x1E4C13B0): return "SAVE_NAME";
        (0x0EFE6D64): return "SAVE_TIMESTAMP";              // 08000000 <u32 unix epoch LE> 00000000
        (0x5DFD8F10): return "unknown_108ffd5d";
        (0x85988715): return "unknown_15879885";
        (0xAD0FC730): return "unknown_30c70fad";
        (0xEFCA224E): return "unknown_4e22caef";
        (0x7C546F81): return "unknown_816f547c";
        (0xB40DDBAE): return "unknown_aedb0db4";
        (0x88305EBB): return "unknown_array_bb5e3088";
        (0x5374EDB0): return "unknown_b0ed7453";
        (0xDFDD68B5): return "unknown_b568dddf";
        (0x414C0CDC): return "unknown_dc0c4c41";
        (0xD31307E8): return "unknown_e80713d3";
        (0x83F18CEF): return "unknown_ef8cf183";
        (_): return std::format("unknown 0x{:08X}", m);
    }
};

using civ7_chunk;
using markerless_chunk;

// The body of a chunk (everything after the optional 4-byte marker): the u64
// type tag followed by a type-specific payload. Shared by marker-prefixed chunks
// (civ7_chunk) and the markerless items inside a NestedArray (markerless_chunk).
struct chunk_body {
    u64 type;   // low u32 is the type tag; high u32 is padding/zero

    if (type == 1) {
        // 12 bytes of flags (e.g. PLAYER_TYPE lives in a type-8 number, but
        // several per-player bools/flags use this 3x u32 form)
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
        // utf-16 string (e.g. SAVE_NAME)
        u16 len;
        u16 wat1;
        u32 wat2;
        char16 str_data[len];
    }

    if (type == 8) {
        // 32-bit number — also used for hashes, ARGB colors, and PLAYER_TYPE
        // (3 = Human, 1 = AI). len should be 1.
        u32 len;
        u32 unknown;
        u32 data[len];
    }

    if (type == 9) {
        u16 len;
        u16 unknown[3];
        u32 data[len];
    }

    if (type == 10) {
        // e.g. SAVE_TIMESTAMP: data is [unix-epoch-LE, 0]
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
        u64 unknown2[len];
    }

    if (type == 29) {
        // ChunkArray — a record of marker-prefixed sub-chunks (e.g. each group3
        // player: player.LEADER, player.CIVILIZATION, player.PLAYER_TYPE, ...)
        u32 wat[2];
        u32 len;
        civ7_chunk chunks[len];
    }

    if (type == 30) {
        // NestedArray — an array of MARKERLESS items. Each item carries its own
        // type tag and dispatches like any chunk: it may be a ChunkArray record
        // (e.g. ENABLED_MODS, each item a mod's ID/ENABLED/DISPLAY_NAME sub-chunks)
        // OR a plain value such as the age-crisis string list (type-2 strings like
        // ANTIQUITY_CRISIS_INVASION). Modeling every item as a record breaks the
        // string case — see the parser's markerless NestedArray handling.
        u32 wat[2];
        u32 len;
        markerless_chunk items[len];
    }

    if (type == 32) {
        // raw bytes (e.g. GUID_BINARY = 16 bytes)
        u32 wat1;
        u32 len;
        u8 data[len];
    }

    std::assert(type <= 32, "Bad type");
};

// A marker-prefixed chunk: 4-byte field-name hash, then the shared body.
struct civ7_chunk {
    u32 marker [[format("format_marker")]];
    chunk_body body;
};

// A NestedArray item: the same body with NO leading 4-byte marker.
struct markerless_chunk {
    chunk_body body;
};

// Scans from `from` for the start of the next group: the first real marker
// (u32 >= 256 followed by a valid type 1..32). Returns the count of separator
// words that precede the group's [len] prefix. Handles the variable, padding-
// only headers between group4/5/6 in both single-player and hotseat saves.
// (NOT used for the group3->group4 boundary, which carries real interstitial
// chunks — see the explicit separator below.)
fn sep_words(u128 start) {
    u128 p = start;
    while (p < start + 128) {
        u32 m = std::mem::read_unsigned(p, 4);
        u32 t = std::mem::read_unsigned(p + 4, 4);
        if (m >= 256 && t >= 1 && t <= 32) {
            return (p - 4 - start) / 4;
        }
        p = p + 4;
    }
    return 0;
};

struct group_scan {
    // skip the separator words, then [u32 len][chunks]
    padding[sep_words($) * 4];
    u32 len;
    civ7_chunk chunks[len];
};

struct civ7_struct {
    char header[4];
    std::assert(header == "CIV7", "Invalid header!");
    u32 version;            // = 1
    u32 len1;
    civ7_chunk group1[len1];

    // group1 -> group2 : [u32][u32=1][u32 len2]
    u32 g2_a;
    u32 g2_b;
    u32 len2;
    civ7_chunk group2[len2];

    // group2 -> group3 : [u32=1][u32 len3]
    u32 g3_a;
    u32 len3;
    civ7_chunk group3[len3];

    // group3 -> group4 : self-describing separator carrying interstitial chunks.
    //   [u32=1][u32 N][N chunks][u32][u32][u32 len4]
    // N = 0 in single-player saves, >= 1 in hotseat / multiplayer saves.
    u32 g4_a;
    u32 interstitial_count;
    civ7_chunk interstitial[interstitial_count];
    u32 g4_b;
    u32 g4_c;
    u32 len4;
    civ7_chunk group4[len4];

    // group4 -> group5 and group5 -> group6 use variable padding-only headers;
    // group_scan locates each by finding the next real marker.
    group_scan group5;
    group_scan group6;   // second per-actor section, same marker keys as group3

    // After group6: END_UNCOMPRESSED (00 00 01 00) then zlib-compressed game
    // state. Not described here — see REVERSING.md.
};

civ7_struct civ7 @ 0x00;
