// The knight's outline. The other five pieces are turned on a lathe in studio.js and need no outline.
// Coordinates: 100x100 box, y grows downward (SVG convention), knight faces left.

// Horse head and neck, drawn as one closed outline. The base (pedestal) is separate.
export const KNIGHT_HEAD = [
  "M 33 96",                       // front of the chest at the collar
  "C 27 88, 26 76, 33 66",         // chest swelling forward
  "C 38 58, 46 53, 46 45",         // neck front rising to the throat
  "C 46 42, 44 41, 42 43",         // throat notch behind the jowl
  "C 39 47, 34 47, 31 46",         // round jowl
  "C 26 49, 20 54, 16 57",         // jaw line down to the chin
  "C 13.5 59, 9.5 59, 8.5 55.5",   // chin and lower lip
  "L 12.5 53",                     // mouth corner
  "C 9 53.5, 4 52, 3 47.5",        // upper lip
  "C 2.5 43.5, 4 41, 6 39",        // nostril
  "C 12 31, 19 22, 26 14",         // nose bridge up to the forehead
  "C 27 10, 28 4, 31 0",           // front of the ear
  "C 36 2, 40 6, 42 11",           // back of the ear
  "C 52 11, 64 18, 71 31",         // poll and crest of the neck
  "C 78 45, 80 64, 78 80",         // back of the neck
  "C 77 86, 77 91, 77 96",         // down to the collar
  "Z"
].join(" ");

// Eye and nostril, as small closed shapes cut or painted on the head.
export const KNIGHT_EYE = { cx: 27.5, cy: 24, rx: 3.3, ry: 2.1, rotate: -45 };
export const KNIGHT_NOSTRIL = { cx: 7.5, cy: 44.5, r: 1.6 };

// The back of the neck as two cubic curves (poll to crest, crest to collar). The mane follows it.
export const KNIGHT_BACK = [
  [[42, 11], [52, 11], [64, 18], [71, 31]],
  [[71, 31], [78, 45], [80, 64], [78, 80]]
];
