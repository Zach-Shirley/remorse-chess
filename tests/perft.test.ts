import { describe, expect, it } from "vitest";
import { START_FEN, fromFen, perft } from "../src/game";

// Reference node counts from the Chess Programming Wiki "Perft Results" page. If a count is
// off, the move generator is wrong: fix the engine, never the number.
const POSITIONS: { name: string; fen: string; counts: number[] }[] = [
  { name: "start position", fen: START_FEN, counts: [20, 400, 8902, 197281] },
  {
    name: "Kiwipete",
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    counts: [48, 2039, 97862]
  },
  { name: "position 3", fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1", counts: [14, 191, 2812, 43238] },
  {
    name: "position 4",
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1",
    counts: [6, 264, 9467]
  },
  {
    name: "position 5",
    fen: "rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8",
    counts: [44, 1486, 62379]
  }
];

describe("perft", () => {
  for (const position of POSITIONS) {
    position.counts.forEach((expected, index) => {
      it(`${position.name} depth ${index + 1} = ${expected}`, () => {
        expect(perft(fromFen(position.fen), index + 1)).toBe(expected);
      });
    });
  }
});
