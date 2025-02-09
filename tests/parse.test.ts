import { readFileSync } from "fs";
import { GAME_DATA_MARKERS, parse } from "../src/index";
import { join } from "path";

describe("Parsing", () => {
  it("parses my first savegame", () => {
    const result = parse(
      readFileSync(join(__dirname, "./RizalAnt51.Civ7Save")),
    );

    const gameTurn = result.find((x) =>
      x.marker.equals(GAME_DATA_MARKERS.GAME_TURN),
    );

    expect(gameTurn?.value).toBe(51);
  });
});
