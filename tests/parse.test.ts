import { readFileSync } from 'fs';
import { parse } from '../src/index';
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
  });
});
