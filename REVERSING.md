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

## Current player / whose turn — NOT in the uncompressed data

Diffing the two hotseat saves (turn 1 vs turn 2) shows that **the entire
uncompressed region is static configuration**. The only uncompressed changes
between turns are: `GAME_TURN`, `GAME_DATE`, `SAVE_NAME`/`SAVE_TIMESTAMP`, and a
per-actor flag (`0eed6e29`) that flips `0→1` on city-states/minor powers. The
group3 AND group6 player records are byte-identical across the two turns. There
is **no current-player scalar or per-actor turn bool** anywhere in groups 1–6.

We only parse ~5–8% of the file. The rest is a **compressed game-state blob**
(an `END_UNCOMPRESSED`-style `00 00 01 00` marker appears, mirroring Civ6's
format). So whose-turn, unit positions, etc. live in compression — Civ7 moved
into the compressed section what Civ6 kept in the clear (Civ6's `IS_CURRENT_TURN`
was uncompressed). Note `0x789c` byte hits in the file are NOT valid zlib stream
starts, so the exact framing still needs working out.

**Implication for PYDT:** reading turn #, roster, leaders/civs, and human/AI is
done from the uncompressed groups. "Whose turn" would require decoding the
compressed section — but recall the Civ6 handler never implemented
`setCurrentTurnIndex` and PYDT tracks turn order in its own DB, so a first
integration may not need it from the file at all. The harder open question is the
**password-swap write path**, which also likely lives in the compressed region.

## Groups 4+ — still mostly unmapped

Groups 4, 5, and the newly-found group6 (another 67-record actor section keyed by
`959a8400`, same as group3) are parsed but largely unlabeled. They're static
config, so lower priority than the compressed blob.

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
