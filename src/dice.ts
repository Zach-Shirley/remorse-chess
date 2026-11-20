// Dice for games played on this device (pass-and-play and bot games). Online games never use
// this: the server rolls.
import type { Rng } from "./game";

// Math.random, unless the page address scripts the first rolls: `/local?dice=2,4,6` makes the
// first three dice show 2, 4 and 6, and real randomness takes over after that. The browser
// check scripts use it to reach a known position; it only affects games on this device.
export function createLocalDice(search: string = typeof window === "undefined" ? "" : window.location.search): Rng {
  const scripted = (new URLSearchParams(search).get("dice") ?? "")
    .split(",")
    .map((text) => Number(text))
    .filter((face) => Number.isInteger(face) && face >= 1 && face <= 6);
  return () => {
    const face = scripted.shift();
    return face === undefined ? Math.random() : (face - 0.5) / 6;
  };
}
