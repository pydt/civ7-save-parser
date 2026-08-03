/**
 * Civ7 save-file marker dictionary.
 *
 * Every chunk in a Civ7 save is keyed by a stable 4-byte marker (stored
 * little-endian; we key this map by the lowercase hex of the bytes as they
 * appear in the file). The markers look like FNV-style hashes of an internal
 * field name and are CONSTANT across every save file, so this map is a durable
 * record of what we've reverse-engineered.
 *
 * `confidence`:
 *   - 'known'    we're confident of the meaning (usually a self-describing string value)
 *   - 'likely'   strong inference, not yet confirmed by differential analysis
 *   - 'guess'    a hypothesis to confirm/refute
 *
 * When you confirm a guess (e.g. via tools/diff.ts across controlled saves),
 * bump its confidence and tighten the note.
 */
export interface MarkerInfo {
  /** Human-readable name for the field. */
  name: string;
  /** Which top-level group(s) we've observed this marker in. */
  group?: string;
  confidence: 'known' | 'likely' | 'guess';
  /** Anything useful: observed values, hypotheses, units, etc. */
  note?: string;
}

export const MARKERS: Record<string, MarkerInfo> = {
  // ---- group1: game/session metadata ----
  '99b0d905': {
    name: 'GAMESPEED',
    group: 'group1',
    confidence: 'known',
    note: 'e.g. GAMESPEED_STANDARD'
  },
  '405c830b': { name: 'MAPSIZE', group: 'group1', confidence: 'known', note: 'e.g. MAPSIZE_SMALL' },
  '646dfe0e': {
    name: 'SAVE_TIMESTAMP',
    group: 'group1',
    confidence: 'likely',
    note: 'type10, 12b: 08000000 <u32 unix-epoch LE> 00000000 — save creation time'
  },
  '1de7320f': {
    name: 'DIFFICULTY_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_DIFFICULTY_*_NAME json blob'
  },
  b0134c1e: {
    name: 'SAVE_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'utf16, e.g. "RizalExp1"'
  },
  f9376f30: { name: 'PLATFORM', group: 'group1', confidence: 'known', note: 'e.g. "PC"' },
  da45053a: {
    name: 'APP_VERSION',
    group: 'group1',
    confidence: 'known',
    note: 'e.g. "1.0.1 (1089031)"'
  },
  '083e2140': {
    name: 'AGE_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_AGE_*_NAME json blob'
  },
  dc0c4c41: {
    name: 'unknown_dc0c4c41',
    group: 'group1',
    confidence: 'guess',
    note: 'type9, value 01000000'
  },
  '90b5424d': {
    name: 'GUID_BINARY',
    group: 'group1',
    confidence: 'likely',
    note: 'type32, 16 raw bytes — a binary GUID/handle'
  },
  '27604c58': {
    name: 'MAP_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_MAP_*_NAME json blob'
  },
  '108ffd5d': {
    name: 'unknown_108ffd5d',
    group: 'group1',
    confidence: 'guess',
    note: 'type11, 12b'
  },
  a1b2b76b: {
    name: 'HOST_LEADER',
    group: 'group1',
    confidence: 'likely',
    note: 'utf8 LEADER_* — host/local player leader (group1 copy)'
  },
  '2a630a76': {
    name: 'CIV_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_CIVILIZATION_*_NAME json blob'
  },
  '816f547c': { name: 'unknown_816f547c', group: 'group1', confidence: 'guess', note: 'type9' },
  a816b47f: {
    name: 'DIFFICULTY',
    group: 'group1',
    confidence: 'known',
    note: 'e.g. DIFFICULTY_PRINCE'
  },
  ef8cf183: {
    name: 'unknown_ef8cf183',
    group: 'group1',
    confidence: 'guess',
    note: 'type9, value 00000000'
  },
  '5cae2784': {
    name: 'ENABLED_MODS',
    group: 'group1',
    confidence: 'known',
    note: 'NestedArray of enabled mods/DLC/ages (base-standard, core, age-*, persona packs, and user mods like pydt-hotseat-limiter). Parsed by parseMods().'
  },
  '15879885': { name: 'unknown_15879885', group: 'group1', confidence: 'guess', note: 'type9' },
  bb5e3088: {
    name: 'unknown_array_bb5e3088',
    group: 'group1',
    confidence: 'guess',
    note: 'NestedArray (len ~10) — another mod/config list?'
  },
  // ENABLED_MODS sub-record fields
  '8cce874d': {
    name: 'mod.ENABLED',
    group: 'group1',
    confidence: 'known',
    note: 'utf8 "1" enabled flag'
  },
  '2fd0a9d0': {
    name: 'mod.unknown_2fd0a9d0',
    group: 'group1',
    confidence: 'guess',
    note: 'utf8, usually empty'
  },
  '76612fe5': {
    name: 'mod.ID',
    group: 'group1',
    confidence: 'known',
    note: 'mod/module id, e.g. age-exploration, base-standard, core, pydt-hotseat-limiter'
  },
  '98260bea': {
    name: 'mod.DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'mod display name (sometimes localized json)'
  },
  '95dabc9d': {
    name: 'LEADER_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_LEADER_*_NAME json blob'
  },
  cd939ba6: {
    name: 'MAPSIZE_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_MAPSIZE_*_NAME json blob'
  },
  '30c70fad': {
    name: 'unknown_30c70fad',
    group: 'group1',
    confidence: 'guess',
    note: 'type9, value 00000000'
  },
  bbe49aaf: {
    name: 'HOST_CIVILIZATION',
    group: 'group1',
    confidence: 'likely',
    note: 'utf8 CIVILIZATION_* — host/local player civ (group1 copy)'
  },
  aedb0db4: { name: 'unknown_aedb0db4', group: 'group1', confidence: 'guess', note: 'type9' },
  '9d2ce6bd': {
    name: 'GAME_TURN',
    group: 'group1',
    confidence: 'known',
    note: 'current turn number'
  },
  de2559c4: {
    name: 'RULESET',
    group: 'group1',
    confidence: 'known',
    note: 'e.g. RULESET_STANDARD'
  },
  '31a428d0': {
    name: 'RULESET_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_RULESET_*_NAME json blob'
  },
  '8484c6d0': {
    name: 'GAME_AGE',
    group: 'group1',
    confidence: 'known',
    note: 'e.g. AGE_EXPLORATION'
  },
  e80713d3: {
    name: 'unknown_e80713d3',
    group: 'group1',
    confidence: 'guess',
    note: 'type9, value 01000000'
  },
  b568dddf: { name: 'unknown_b568dddf', group: 'group1', confidence: 'guess', note: 'type9' },
  fe5a61e8: {
    name: 'GAME_DATE',
    group: 'group1',
    confidence: 'likely',
    note: 'display date string, e.g. "400 CE"'
  },
  '4e22caef': {
    name: 'unknown_4e22caef',
    group: 'group1',
    confidence: 'guess',
    note: 'number, value 1 — age index / started flag?'
  },
  d840e5f4: {
    name: 'GAME_GUID',
    group: 'group1',
    confidence: 'known',
    note: 'string GUID, the persistent game id (e.g. BABB79B4-...)'
  },
  c3d4d3fa: {
    name: 'GAMESPEED_DISPLAY_NAME',
    group: 'group1',
    confidence: 'known',
    note: 'localized LOC_GAMESPEED_*_NAME json blob'
  },

  // ---- group3: per-player records (ChunkArray) + misc ----
  // game-session record (4d61e67c) — holds game name, version, ruleset, age, and:
  af61f36a: {
    name: 'unknown_af61f36a',
    group: 'group3',
    confidence: 'guess',
    note: 'In the game-session record (4d61e67c). 12-byte [1][1][x]; 3rd word was 0/1 in the 2-player Lak/Aug pair and looked like the active-player index, but FranklinAnt1 (6 humans, Franklin id 2 active) reads 0 — DISPROVEN as current-player. Some other per-save counter.'
  },
  '4d61e67c': {
    name: 'GAME_SESSION_RECORD',
    group: 'group3',
    confidence: 'likely',
    note: 'ChunkArray holding game name, app version, ruleset, age, gamespeed, difficulty, session GUID, and CURRENT_PLAYER (af61f36a)'
  },
  '90c46e00': {
    name: 'player.unknown_90c46e00',
    group: 'group3',
    confidence: 'guess',
    note: 'type9, first field of every player record'
  },
  bdaf9910: {
    name: 'player.AGE_CIV_COLLECTION',
    group: 'group3',
    confidence: 'likely',
    note: 'e.g. ExplorationAgeCivilizations'
  },
  '7a9ca019': {
    name: 'player.CIVILIZATION_LEVEL',
    group: 'group3',
    confidence: 'known',
    note: 'CIVILIZATION_LEVEL_FULL_CIV | CITY_STATE — distinguishes major players from city-states'
  },
  '32690621': {
    name: 'player.CIV_NAME_LOC_KEY',
    group: 'group3',
    confidence: 'known',
    note: 'LOC_CIVILIZATION_*_NAME'
  },
  d45f8328: {
    name: 'player.PLAYER_TYPE',
    group: 'group3',
    confidence: 'known',
    note: 'ACTOR_AI_HUMAN equivalent: 3 = Human, 1 = AI. Confirmed across all 4 saves (humans=3, AI & city-states=1). Civ6 used marker 95b942ce for this; the value encoding carried over.'
  },
  '0eed6e29': {
    name: 'player.unknown_0eed6e29',
    group: 'group3',
    confidence: 'guess',
    note: 'type1, 12b. Last word is 0/1; stays 1 for full civs, flips 0->1 on city-states/minor powers between turn 1 and turn 2 (per-actor "processed/met this turn"?). NOT the current-player flag.'
  },
  e385cc35: {
    name: 'player.unknown_e385cc35',
    group: 'group3',
    confidence: 'guess',
    note: 'utf8 "NONE"'
  },
  '500d6e37': {
    name: 'player.LEADER_POOL',
    group: 'group3',
    confidence: 'likely',
    note: 'comma-separated leader pick list'
  },
  '0ba2c348': {
    name: 'player.unknown_0ba2c348',
    group: 'group3',
    confidence: 'guess',
    note: 'utf8 "NONE"'
  },
  ce7ebc4f: {
    name: 'player.unknown_ce7ebc4f',
    group: 'group3',
    confidence: 'guess',
    note: 'type1, 12b'
  },
  b0ed7453: {
    name: 'unknown_b0ed7453',
    confidence: 'guess',
    note: 'type9, appears in group1/group3/player records'
  },
  '6d39625a': {
    name: 'player.unknown_6d39625a',
    group: 'group3',
    confidence: 'guess',
    note: 'sometimes ffffffff (city-state), sometimes a number'
  },
  c56b7a5e: {
    name: 'player.CIV_FULLNAME_LOC_KEY',
    group: 'group3',
    confidence: 'known',
    note: 'LOC_CIVILIZATION_*_FULLNAME / _DESCRIPTION'
  },
  ee8a5965: {
    name: 'player.unknown_ee8a5965',
    group: 'group3',
    confidence: 'guess',
    note: 'number, often 0'
  },
  '2053fe6c': {
    name: 'player.unknown_2053fe6c',
    group: 'group3',
    confidence: 'guess',
    note: 'number (hash-like)'
  },
  '5b44577e': {
    name: 'player.CIV_ADJECTIVE_LOC_KEY',
    group: 'group3',
    confidence: 'known',
    note: 'LOC_CIVILIZATION_*_ADJECTIVE'
  },
  f9944684: {
    name: 'player.LEADER_COLLECTION',
    group: 'group3',
    confidence: 'likely',
    note: 'e.g. StandardLeaders'
  },
  '50fd978d': {
    name: 'player.CIV_POOL',
    group: 'group3',
    confidence: 'likely',
    note: 'comma-separated civ pick list'
  },
  '31430e94': {
    name: 'player.unknown_31430e94',
    group: 'group3',
    confidence: 'guess',
    note: 'type17, 12b'
  },
  def62d9b: {
    name: 'player.TEAM_ID',
    group: 'group3',
    confidence: 'known',
    note: "Renamed from a PLAYER_ID guess: in team games (tests/teams_*.Civ7Save) teammates share this value (e.g. two 4-team pairs all read 0/1/2/3), so it is NOT a unique player id. In FFA games it happens to equal a per-player index since each player is their own team — that coincidence is what led to the original PLAYER_ID guess. Use PLAYER_SLOT_MARKERS (the group3 record's own marker) for a unique per-player id instead."
  },
  '592439a2': {
    name: 'player.unknown_592439a2',
    group: 'group3',
    confidence: 'guess',
    note: 'number (hash-like); constant across city-states'
  },
  '338c1fa6': {
    name: 'player.AGE_CIV_COLLECTION_2',
    group: 'group3',
    confidence: 'guess',
    note: 'e.g. ExplorationAgeCivilizations'
  },
  bd5f60aa: {
    name: 'player.LEADER_COLLECTION_2',
    group: 'group3',
    confidence: 'guess',
    note: 'e.g. StandardLeaders'
  },
  '4a6100bf': {
    name: 'player.unknown_4a6100bf',
    group: 'group3',
    confidence: 'guess',
    note: 'number — tracks def62d9b'
  },
  '0ffb8cc1': {
    name: 'player.LEADER',
    group: 'group3',
    confidence: 'known',
    note: 'utf8 LEADER_* (empty for city-states)'
  },
  aa914cc3: {
    name: 'player.unknown_array_aa914cc3',
    group: 'group3',
    confidence: 'guess',
    note: 'ChunkArray, usually empty'
  },
  '39bf81c4': {
    name: 'player.unknown_39bf81c4',
    group: 'group3',
    confidence: 'guess',
    note: 'type1, 12b'
  },
  '2c09f1c5': {
    name: 'player.unknown_2c09f1c5',
    group: 'group3',
    confidence: 'guess',
    note: 'utf8, often empty'
  },
  db927ed4: {
    name: 'player.unknown_db927ed4',
    group: 'group3',
    confidence: 'guess',
    note: 'utf8 "NONE"'
  },
  '659df5d6': {
    name: 'player.COLOR_PRIMARY',
    group: 'group3',
    confidence: 'guess',
    note: 'number — looks like ARGB (0xFF000000 etc.)'
  },
  b2afbad9: {
    name: 'player.unknown_b2afbad9',
    group: 'group3',
    confidence: 'guess',
    note: 'number (hash-like)'
  },
  '769740de': {
    name: 'player.CIVILIZATION',
    group: 'group3',
    confidence: 'known',
    note: 'utf8 CIVILIZATION_* (CITYSTATE placeholder for city-states)'
  },
  fd5fc1e9: {
    name: 'player.unknown_fd5fc1e9',
    group: 'group3',
    confidence: 'guess',
    note: 'utf8, often empty'
  },
  '392ed2db': {
    name: 'player.unknown_392ed2db',
    group: 'group3',
    confidence: 'guess',
    note: 'type9'
  },
  '65acf2f7': {
    name: 'player.unknown_65acf2f7',
    group: 'group3',
    confidence: 'guess',
    note: 'number (hash-like)'
  },

  // ---- group3: fixed player-slot markers (see PLAYER_SLOT_MARKERS in index.ts) ----
  // Each of these IS a group3 record's own ChunkArray marker (not a field inside
  // one). Confirmed identical marker-to-slot-number order across every save
  // captured so far, including tests/teams_*.Civ7Save (4v4 teams).
  b861f0f4: { name: 'player.SLOT_0', group: 'group3', confidence: 'known', note: 'slot 0' },
  '2e51f783': { name: 'player.SLOT_1', group: 'group3', confidence: 'known', note: 'slot 1' },
  '9400fe1a': { name: 'player.SLOT_2', group: 'group3', confidence: 'known', note: 'slot 2' },
  '0230f96d': { name: 'player.SLOT_3', group: 'group3', confidence: 'known', note: 'slot 3' },
  a1a59df3: { name: 'player.SLOT_4', group: 'group3', confidence: 'known', note: 'slot 4' },
  '37959a84': { name: 'player.SLOT_5', group: 'group3', confidence: 'known', note: 'slot 5' },
  '8dc4931d': { name: 'player.SLOT_6', group: 'group3', confidence: 'known', note: 'slot 6' },
  '1bf4946a': { name: 'player.SLOT_7', group: 'group3', confidence: 'known', note: 'slot 7' },
  '8ae92bfa': { name: 'player.SLOT_8', group: 'group3', confidence: 'known', note: 'slot 8' },
  '1cd92c8d': { name: 'player.SLOT_9', group: 'group3', confidence: 'known', note: 'slot 9' },
  '32ca8cfa': { name: 'player.SLOT_10', group: 'group3', confidence: 'known', note: 'slot 10' },
  a4fa8b8d: { name: 'player.SLOT_11', group: 'group3', confidence: 'known', note: 'slot 11' }
};

/** Look up a marker by its little-endian hex string (as stored in the file). */
export const markerName = (markerHex: string): string | undefined =>
  MARKERS[markerHex.toLowerCase()]?.name;
