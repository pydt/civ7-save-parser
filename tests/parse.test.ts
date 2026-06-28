import { readFileSync } from 'fs';
import { parse, decompress, writeCompressedData, setPlayerType, PlayerType } from '../src/index';
import { join } from 'path';

describe('Parsing', () => {
  it('parses antiquity 51 savegame', () => {
    const result = parse(readFileSync(join(__dirname, './RizalAnt51.Civ7Save')));
    expect(result.turn?.value).toBe(51);
    expect(result.age?.value).toBe('AGE_ANTIQUITY');
    expect(result.players.length).toBe(6);

    expect(result.players[0].civ.value).toBe('CIVILIZATION_AKSUM');
    expect(result.players[0].leader.value).toBe('LEADER_HARRIET_TUBMAN');

    expect(result.players[1].civ.value).toBe('CIVILIZATION_HAN');
    expect(result.players[1].leader.value).toBe('LEADER_TECUMSEH');

    expect(result.players[2].civ.value).toBe('CIVILIZATION_ROME');
    expect(result.players[2].leader.value).toBe('LEADER_FRIEDRICH_ALT');

    expect(result.players[3].civ.value).toBe('CIVILIZATION_KHMER');
    expect(result.players[3].leader.value).toBe('LEADER_HIMIKO_ALT');

    expect(result.players[4].civ.value).toBe('CIVILIZATION_GREECE');
    expect(result.players[4].leader.value).toBe('LEADER_LAFAYETTE');

    expect(result.players[5].civ.value).toBe('CIVILIZATION_MISSISSIPPIAN');
    expect(result.players[5].leader.value).toBe('LEADER_JOSE_RIZAL');
  });

  it('parses exploration 1 savegame', () => {
    const result = parse(readFileSync(join(__dirname, './RizalExp1.Civ7Save')));
    expect(result.turn?.value).toBe(1);
    expect(result.age?.value).toBe('AGE_EXPLORATION');
    expect(result.players.length).toBe(6);

    expect(result.players[0].civ.value).toBe('CIVILIZATION_SONGHAI');
    expect(result.players[0].leader.value).toBe('LEADER_HARRIET_TUBMAN');

    expect(result.players[1].civ.value).toBe('CIVILIZATION_SHAWNEE');
    expect(result.players[1].leader.value).toBe('LEADER_TECUMSEH');

    expect(result.players[2].civ.value).toBe('CIVILIZATION_SPAIN');
    expect(result.players[2].leader.value).toBe('LEADER_FRIEDRICH_ALT');

    expect(result.players[3].civ.value).toBe('CIVILIZATION_MAJAPAHIT');
    expect(result.players[3].leader.value).toBe('LEADER_HIMIKO_ALT');

    expect(result.players[4].civ.value).toBe('CIVILIZATION_NORMAN');
    expect(result.players[4].leader.value).toBe('LEADER_LAFAYETTE');

    expect(result.players[5].civ.value).toBe('CIVILIZATION_MING');
    expect(result.players[5].leader.value).toBe('LEADER_JOSE_RIZAL');

    // José Rizal is the only human in this single-player save
    expect(result.players.filter(p => p.isHuman).map(p => p.leader.value)).toEqual([
      'LEADER_JOSE_RIZAL'
    ]);
  });

  it('parses a hotseat savegame (variable group separators) with 2 humans', () => {
    const result = parse(readFileSync(join(__dirname, './AugustusAnt1.Civ7Save')));
    expect(result.turn?.value).toBe(1);
    expect(result.age?.value).toBe('AGE_ANTIQUITY');
    expect(result.players.length).toBe(5);

    expect(result.players.map(p => p.leader.value)).toEqual([
      'LEADER_GENGHIS_KHAN',
      'LEADER_IBN_BATTUTA',
      'LEADER_AUGUSTUS',
      'LEADER_FRIEDRICH',
      'LEADER_LAKSHMIBAI'
    ]);

    // Augustus and Lakshmibai are the two human players (PLAYER_TYPE === 3)
    expect(result.players.filter(p => p.isHuman).map(p => p.leader.value)).toEqual([
      'LEADER_AUGUSTUS',
      'LEADER_LAKSHMIBAI'
    ]);

    // PLAYER_ID matches the in-game player id (localPlayerID space)
    expect(result.players.find(p => p.leader.value === 'LEADER_LAKSHMIBAI')?.id).toBe(0);
    expect(result.players.find(p => p.leader.value === 'LEADER_AUGUSTUS')?.id).toBe(1);
  });

  it('detects enabled mods, including the PYDT hotseat limiter', () => {
    const result = parse(readFileSync(join(__dirname, './PachacutiAnt1.Civ7Save')));

    expect(result.hasMod('pydt-hotseat-limiter')).toBe(true);
    expect(result.hasMod('mod-that-is-not-installed')).toBe(false);

    const limiter = result.mods.find(m => m.id === 'pydt-hotseat-limiter');
    expect(limiter).toMatchObject({
      id: 'pydt-hotseat-limiter',
      name: 'PYDT Hotseat Turn Limiter',
      enabled: true
    });

    // base game modules are always present
    expect(result.mods.map(m => m.id)).toEqual(expect.arrayContaining(['base-standard', 'core']));
  });

  it('decompresses the compressed game-state blob', () => {
    const decompressed = decompress(readFileSync(join(__dirname, './RizalExp1.Civ7Save')));

    expect(decompressed).not.toBeNull();
    // the blob is the bulk game state — multiple MB, and contains the game GUID
    expect(decompressed!.length).toBeGreaterThan(1_000_000);
    expect(decompressed!.includes(Buffer.from('BABB79B4', 'latin1'))).toBe(true);
  });

  it('round-trips the compressed game state (decompress -> writeCompressedData)', () => {
    const original = readFileSync(join(__dirname, './RizalExp1.Civ7Save'));
    const decompressed = decompress(original)!;

    // edit the game state, then write it back into a valid save
    const edited = Buffer.from(decompressed);
    const marker = edited.indexOf(Buffer.from('BABB79B4', 'latin1'));
    edited.write('CAFEF00D', marker, 'latin1'); // same-length edit

    const rewritten = writeCompressedData(original, edited);

    // the rewritten save decompresses back to exactly our edited buffer
    const roundTripped = decompress(rewritten)!;
    expect(roundTripped.equals(edited)).toBe(true);
    expect(roundTripped.includes(Buffer.from('CAFEF00D', 'latin1'))).toBe(true);
    expect(roundTripped.includes(Buffer.from('BABB79B4', 'latin1'))).toBe(false);
  });

  it('sets a player to AI (for turn skipping) as an in-place edit', () => {
    const data = readFileSync(join(__dirname, './LakshmibaiAnt2.Civ7Save'));

    // Lakshmibai (id 0) and Augustus (id 1) are the two humans
    expect(
      parse(data)
        .players.filter(p => p.isHuman)
        .map(p => p.id)
        .sort()
    ).toEqual([0, 1]);

    const modified = setPlayerType(data, 0, PlayerType.AI);

    // exactly one byte changed (the PLAYER_TYPE value), same length
    expect(modified.length).toBe(data.length);
    let changed = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] !== modified[i]) {
        changed++;
      }
    }
    expect(changed).toBe(1);

    // Lakshmibai now reads as AI; Augustus is still human
    const after = parse(modified);
    expect(after.players.find(p => p.id === 0)?.isHuman).toBe(false);
    expect(after.players.find(p => p.id === 1)?.isHuman).toBe(true);

    expect(() => setPlayerType(data, 99, PlayerType.AI)).toThrow();
  });
});
