# Reverse-engineering the Civ7 save format

Working notes + tooling for decoding `.Civ7Save` files. The goal is everything
[playyourdamnturn.com](https://www.playyourdamnturn.com) needs to manage a
play-by-cloud game: the persistent game id, current turn, the player roster, and
(the big one) **whose turn it is** plus **which slots are human vs AI**.

## File format in one paragraph

A save starts with the ASCII header `CIV7`, then five top-level groups
(`group1`..`group5`) of **typed chunks**. Each chunk is keyed by a stable 4-byte
**marker** — almost certainly an FNV-style hash of an internal field name. The
marker bytes are identical across every save, so a marker always means the same
thing. `src/index.ts` parses the chunk stream; `src/markers.ts` maps known
markers to meanings; `civ7.hexpat` is the ImHex visual schema.

- **group1** — game/session metadata (turn, age, settings, GUID, save name, mods…)
- **group2** — four small fixed records (unclear)
- **group3** — per-player records (one `ChunkArray` per player + city-states)
- **group4** — many small `Number32` flags/counters + a few strings
- **group5** — bulk data (largest group)

## Tools

```bash
# Labeled, indented dump of an entire save
npm run dump -- tests/RizalExp1.Civ7Save
npm run dump -- tests/RizalExp1.Civ7Save --unknown          # only unnamed markers
npm run dump -- tests/RizalExp1.Civ7Save --grep=LEADER       # filter by text
npm run dump -- tests/RizalExp1.Civ7Save --marker=9d2ce6bd   # one marker

# Differential analysis — the key RE tool. Shows what CHANGED between two saves.
npm run diff -- a.Civ7Save b.Civ7Save                # changed values only
npm run diff -- a.Civ7Save b.Civ7Save --all          # + added/removed
npm run diff -- a.Civ7Save b.Civ7Save --by-marker    # key by marker, robust to shifts
```

The workflow: capture two saves that differ by **exactly one** known variable,
diff them, and the marker whose value changed is the field you were looking for.
When you confirm a marker, update `src/markers.ts` (bump `confidence`, tighten
the note) so the dump/diff output labels it everywhere from then on.

## What we've decoded so far

See `src/markers.ts` for the full list. Highlights that are solid:

- `GAME_GUID` (`d840e5f4`) — persistent game id PYDT keys on
- `GAME_TURN` (`9d2ce6bd`), `GAME_AGE` (`8484c6d0`), `GAME_DATE` (`fe5a61e8`)
- `SAVE_NAME`, `SAVE_TIMESTAMP` (unix epoch LE), `APP_VERSION`, `PLATFORM`
- settings: `GAMESPEED`, `MAPSIZE`, `DIFFICULTY`, `RULESET`, map type
- `ENABLED_MODS` (`5cae2784`) — enabled mods/DLC/ages
- per player: `LEADER`, `CIVILIZATION`, `CIVILIZATION_LEVEL` (full civ vs city-state)

## Player slot type — SOLVED (`d45f8328`)

`player.PLAYER_TYPE` (`d45f8328`, a `Number32` in each group3 player record):
**3 = Human, 1 = AI** — the same value encoding as Civ6's `ACTOR_AI_HUMAN`
(`95b942ce`), just under a renamed marker. Confirmed across all four saves: the
lone human (José Rizal) is `3` in both single-player saves, and Augustus +
Lakshmibai are `3` in the hotseat saves; everything else (AI + city-states) is
`1`. Exposed by the parser as `players[].isHuman` / `players[].playerType`.

## Hotseat save structure (parser was crashing on these)

Hotseat/multiplayer saves use **variable group separators** that the original
fixed-offset code couldn't handle. `parseRaw` now:
- reads the group3→group4 separator as self-describing
  (`[1][N][N interstitial chunks][..][..][group4Len]`); `N` is 0 in
  single-player, 1+ in hotseat (captured as `RawChunkData.interstitial34`)
- locates group5 by scanning for the first real marker
- never throws on the later groups, so groups 1–3 (the player data) always parse

## Current player / whose turn — it's a per-player flag, ONLY in the compressed data

**Conclusion: whose-turn is the per-player `isTurnActive` boolean and it lives
only in the compressed game state — it is NOT in the uncompressed data.**

Ground truth (in-game console, `GameContext.localPlayerID` + the player object's
`isTurnActive`): the active player = `localPlayerID`. Confirmed: `LakshmibaiAnt2`
→ 0 (Lakshmibai), `AugustusAnt2` → 1 (Augustus), `FranklinAnt1` → 2 (Franklin).
Each player's `PLAYER_ID` (`def62d9b`) matches this id space, so the parser
exposes `players[].id`.

**Decisive experiment (conclusive):** `FranklinAnt2` (Franklin id 2 active) vs
`LafayetteAnt2` (Lafayette id 5 active) — same 6-player game, both round 2,
different active players with high/distinct ids. The two files genuinely differ
(2.06 MB vs 2.04 MB, diverging at 0x7e in the compressed region), but their
**uncompressed structured data is byte-identical except the save timestamp and
name — zero meaningful diffs.** So the active player is conclusively NOT in the
uncompressed data.

Dead ends ruled out (every uncompressed candidate was a turn-1 counter or a 0/1
flag that only matched because our multiplayer pairs used ids 0 and 1):
- `af61f36a` (in game-session record `4d61e67c`): only ever reads 0 or 1, so it
  cannot represent ids 2–5. `LafayetteAnt1` is id 5 but reads 1 — **disproven**;
  the round-2 Lakshmibai(0)/Augustus(1) "matches" were coincidence.
- `326673de` (Number32 at marker+24, in the group3→group4 separator): tracked the
  active player in the *turn-1* Franklin(3)/Lafayette(6) pair (value and chunk
  count both = player#), but it's a **turn-1 initialization counter** that maxes
  out and stays there in later rounds (e.g. stuck at 6) — **disproven**.
- A search of all uncompressed groups for a scalar reading the expected per-save
  current id found nothing.

So reading/writing `isTurnActive` requires the compressed game DB. The catch (see
below): the live per-player records there are keyed by index, not a searchable
hash, and sit in a region that shifts heavily between saves (the string-intern
table), so positional/byte diffing fails. Locating the flag needs structural
decode of the compressed player records — guided by the editor's marker-navigation
(`PLAYER_SLOT_MARKERS` → `FXSBLKED` blocks) and in-game ground truth.

**Pragmatic alternative for PYDT:** PYDT already tracks turn order in its own DB,
and the uncompressed data gives turn #, roster, leader/civ, `PLAYER_ID`, and
human/AI. `CivData.isCurrentTurn` could be *derived* from PYDT's known current
player (`player.id === pydtCurrentPlayerId`) rather than read from the save —
sidestepping the compressed decode entirely. The Civ6 handler only used
`isCurrentTurn` to clean up stale flags for a turn-timer bug; whether Civ7 needs
that write at all is an open question.

### (Historical) the compressed game state

Before finding `af61f36a`, the working theory was that whose-turn lived only in
the compressed blob (the in-memory `Player.isTurnActive` does). The compressed
decode work below is still useful for other fields (gold, influence, etc.) but is
**not needed for `isCurrentTurn`** — that's a simple uncompressed read/write.

### Decompression — SOLVED (`decompress()` in src/index.ts)

The compressed game state is a zlib stream split into **length-prefixed blocks**:
a repeating `[u32 LE blockLen][blockLen bytes of deflate data]`. The first block's
length prefix is `00 00 01 00` (= 65536 = 64 KiB) immediately followed by the
zlib header `78 9c`, so the 6-byte `COMPRESSED_DATA_START` (`00 00 01 00 78 9c`)
locates the start. Read each block length, collect that many bytes, repeat until
the length is ≤ 1; concat the block payloads (dropping the 4-byte prefixes) and
`inflateSync` with `Z_SYNC_FLUSH`. AugustusAnt1's 1.45 MB → **7.04 MB** of game
state. Re-compression is the inverse: `deflateSync` + `Z_SYNC_FLUSH`, then split
into 64 KiB blocks each prefixed with its length. (Confirmed against the
community tool — see below. My earlier "64 KiB + 4-byte gap" reading was the same
bytes mis-described; the "gaps" are the length prefixes.)

The decompressed blob is **largely the same marker+type chunk format** as the
header — it opens with `GAME_GUID` (`d840e5f4`) + a type-2 string, and contains
`LEADER_AUGUSTUS`, `Player`, `DIPLOMACY`, etc. BUT it is not a clean uniform
stream: `parseChunk` walks the first 3 chunks then hits other record formats at
offset 137 (e.g. `type=1024` = a `[hash][u16]` table), plus string-intern tables
and packed arrays.

**Positional byte-diff of the decompressed blobs does NOT work — even for a clean
pair.** `LakshmibaiAnt2` (player 1 active, turn 2) vs `AugustusAnt2` (player 2
active, turn 2, next save): decompressed 7.9 MB vs 9.2 MB, first ~147 KB
identical, then **409k differing ranges**. Cause: a **string-interning table** of
`LOC_ATTR_*` keys whose length differs between states, shifting every later
offset. Must navigate by markers, not offsets.

### Community tool: iqqmuT/civ7-save-editor (big accelerator)

A JS save editor that edits player **gold** and **influence** by decompress →
locate value → edit → recompress. It confirms our decompression and gives a
proven **marker-navigation** technique for the body. Key constants (verbatim):

- `COMPRESSED_DATA_START` = `00 00 01 00 78 9c`
- `GOLD_MARKER` = `23 1e 99 37` · `INFLUENCE_MARKER` = `50 3c a8 4a`
  (26 occurrences each in our hotseat body — one per player/city entity)
- `FXSBLKED_MARKER` = ASCII `"FXSBLKED"` — a block barrier used to step from a
  value marker to its data (`indexOf(GOLD) → indexOf(FXSBLKED) → +8 → value`)
- `LEADER_MARKER` = `0f fb 8c c1` (same as our `players[].LEADER`)
- **`PLAYER_SLOT_MARKERS`** (slots 1–8) = `b861f0f4, 2e51f783, d4ab9f19,
  0230f96d, a1a59df3, 37959a84, 8dc4931d, 1bf4946a` — **these are exactly the
  group3/group6 player-record ChunkArray keys**. So a player's group3 record
  marker tells you their slot #, and the same marker keys their data in the body.
  (In AugustusAnt1: Lakshmibai=slot1, Augustus=slot2, Ibn=slot4, Friedrich=slot5;
  some players/city-states use markers outside this set of 8.)
- Gold/influence are **24-bit**: read u32 LE, `>> 8`, `+1` if low byte is `0xFF`.

Also from CivFanatics: the game's own modding API can dump state via
`UI.setClipboardText()` as JSON when a save is loaded — a way to get **ground
truth** (e.g. who the active player is) to then locate in the binary.

### Status on `isCurrentTurn`

Not yet located, but the path is now concrete and no longer requires decoding the
whole DB: use marker-navigation (anchor on `PLAYER_SLOT_MARKERS` / per-player body
markers, like the editor does for gold) to find a per-player current-turn flag.
First gold-anchored window diff of the clean pair only showed treasury changing
(`00→05`), so the flag isn't adjacent to gold — widen the per-player search, or
use the in-game JSON dump to get ground truth and locate it directly.

**Skipping players:** does NOT need `setCurrentTurnIndex` (Civ6 never implemented
it). Most save handlers skip a player by setting their type to AI — which we can

**Skipping players:** does NOT need `setCurrentTurnIndex` (Civ6 never implemented
it). Most save handlers skip a player by setting their type to AI — which we can
already do via `PLAYER_TYPE` (`d45f8328`) in the uncompressed group3 record. The
write-back question (whether setting that uncompressed field alone is enough, or
the compressed copy must also change) is open.

## Groups 4+ (uncompressed) — still mostly unmapped

Groups 4, 5, 6 (a second 67-record actor section keyed by `959a8400`), and the
tiny groups 7–8 (keyed by `4ba04935`) are parsed but largely unlabeled. They're
static config, so lower priority than the compressed blob. Uncompressed data ends
at ~11% of the file; the rest is the compressed game state.

## Save corpus to capture (for differential analysis)

Capture these once hotseat is available. Name them descriptively and drop them in
`tests/`. The more a pair holds constant, the cleaner the diff.

| # | Scenario | What it isolates |
|---|----------|------------------|
| 1 | Same game, save on turn N, then **end turn**, save on turn N+1 | turn-advance fields, score/yield counters, **active player** if it rotates |
| 2 | Hotseat, 2+ humans: save at **player A's turn**, then at **player B's turn** (same turn #) | the current-player marker (this is the prize) |
| 3 | Game with a **known human + AI mix** | the human-vs-AI slot-type marker |
| 4 | Same game saved **twice without doing anything** | the always-changes noise floor (timestamp, RNG) to ignore |
| 5 | A **dead/eliminated** player present | dead/defeated slot flag |

For each, jot down the ground truth (turn #, who's active, who's human/AI) so we
know what the diff should reveal.

## Civ6 cross-reference (the parser this replaces)

`../civ6-save-parser/index.js` is the prior-gen parser. Crucial finding: **Civ6
and Civ7 share the same marker-hashing scheme**, and the game-level markers are
byte-for-byte identical:

| Marker | Civ6 name | Civ7 status |
|--------|-----------|-------------|
| `9d2ce6bd` | GAME_TURN | confirmed same |
| `99b0d905` | GAME_SPEED | confirmed same |
| `405c830b` | MAP_SIZE | confirmed same |
| `5cae2784` | MOD_BLOCK_1 | = our ENABLED_MODS |
| `bb5e3088` | MOD_BLOCK_4 | = our second nested list |

The **actor/player** markers were renamed in Civ7 (different hashes — none of the
Civ6 ones below appear in our Civ7 saves), so these are what we still need to map
via differential analysis. They tell us what to look for:

| Civ6 marker | Field | Civ7 equivalent |
|-------------|-------|-----------------|
| `cb21b07a` | IS_CURRENT_TURN (bool) | **UNKNOWN — the prize** |
| `95b942ce` | ACTOR_AI_HUMAN (3=Human, 1=AI, 2=locked/empty) | **UNKNOWN** |
| `a6dfa762` | PLAYER_ALIVE (bool) | UNKNOWN |
| `beab55ca` | ACTOR_TYPE (`CIVILIZATION_LEVEL_FULL_CIV`) | `7a9ca019` (our CIVILIZATION_LEVEL) |
| `2f5c5e9d` | ACTOR_NAME (civ) | `769740de` (our player.CIVILIZATION) |
| `5f5ecde8` | LEADER_NAME | `0ffb8cc1` (our player.LEADER) |
| `fd6bb9da` | PLAYER_NAME (human display name) | UNKNOWN |
| `6cd17c6e` | PLAYER_PASSWORD | UNKNOWN |

Civ6's CIV-selection logic (worth replicating): a "CIV" = a slot whose
`ACTOR_AI_HUMAN !== 2` AND `ACTOR_TYPE === CIVILIZATION_LEVEL_FULL_CIV` AND has an
`ACTOR_NAME`. City-states/independents are filtered out — same distinction our
`CIVILIZATION_LEVEL` field already makes.

## PYDT integration contract (the output shape to target)

The API consumes parsers through a `SaveHandler` interface
(`../api/lib/saveHandlers/saveHandler.ts`). A future `Civ7SaveHandler` must
implement it. PYDT does NOT just read — it **modifies and re-serializes** saves:

- reads: `gameTurn`, `gameSpeed`, `mapFile`, `mapSize`, `parsedDlcs`, and per-civ
  `type` (HUMAN/AI/DEAD), `playerName`, `leaderName`, `isCurrentTurn`, `password`
- writes (then `getData()` re-serializes for re-upload):
  - sets/clears each non-active player's `password` (so loaders can only play
    their own civ)
  - sets a skipped player's `type` to AI
  - `setCurrentTurnIndex(n)` + `cleanupSave(game)`

**Implication:** beyond reading, the Civ7 parser will eventually need
**write-back** — modify a chunk's value (string/int/bool) and re-emit the byte
stream, the way `civ6-save-parser` does with `modifyChunk`/`addChunk`/`deleteChunk`.
Our current parser is read-only; that's the larger follow-on once the markers are
mapped. Read-only (validate + report turn/players/whose-turn) is enough for a
first integration pass.
