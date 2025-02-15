import { readFileSync } from 'fs';
import { GAME_DATA_MARKERS, parse } from '../src/index';
import { join } from 'path';

describe('Parsing', () => {
  it('parses antiquity 51 savegame', () => {
    const result = parse(readFileSync(join(__dirname, './RizalAnt51.Civ7Save')));

    const gameTurn = result.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_TURN));
    expect(gameTurn?.value).toBe(51);

    const gameAge = result.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_AGE));
    expect(gameAge?.value).toBe('AGE_ANTIQUITY');
  });

  it('parses exploration 1 savegame', () => {
    const result = parse(readFileSync(join(__dirname, './RizalExp1.Civ7Save')));

    const gameTurn = result.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_TURN));
    expect(gameTurn?.value).toBe(1);

    const gameAge = result.find(x => x.marker.equals(GAME_DATA_MARKERS.GAME_AGE));
    expect(gameAge?.value).toBe('AGE_EXPLORATION');
  });
});
