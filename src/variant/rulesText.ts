// The rules as the app explains them: the creator's rules with the video each comes from, and
// this app's interpretations (the rulings in interpretation.ts, in words). The rules dialog
// renders these lists; the README repeats them.
import type { RULE_SETS } from "./remorse";

export const CREATOR = {
  name: "Bardelo Bardalini",
  youtube: "https://www.youtube.com/@bardelo_bardalini",
  instagram: "https://www.instagram.com/bardelo_bardalini/"
};

export const VIDEOS: { id: number; title: string; url: string }[] = [
  { id: 1, title: "Remorse Chess", url: "https://www.youtube.com/shorts/H-JyKN_1jM4" },
  { id: 2, title: "Remorse Chess: Psychos & Devastation", url: "https://www.youtube.com/shorts/_ySYb2fEvRQ" },
  { id: 3, title: "Remorse Chess: Announcement & Reclassification", url: "https://www.youtube.com/shorts/mm3rmrhY_KM" },
  { id: 4, title: "Remorse Chess: Reactions to Attacks Pt. 1", url: "https://www.youtube.com/shorts/DJ3hAbNY6vc" },
  { id: 5, title: "Remorse Chess: Reactions to Attack Pt. 2", url: "https://www.youtube.com/shorts/UYv9RKw2zWI" }
];

export type RuleLine = {
  text: string;
  // The creator's videos the rule comes from (ids in VIDEOS).
  videos: number[];
};

export type RuleSetName = (typeof RULE_SETS)[number];

export const RULES_BY_SET: Record<RuleSetName, { heading: string; intro: string; rules: RuleLine[] }> = {
  classic: {
    heading: "Classic",
    intro: "The first video. No dice.",
    rules: [
      { text: "It is chess, and you win by checkmate.", videos: [1] },
      { text: "A piece that captures becomes guilt-ridden: a token goes under it.", videos: [1] },
      { text: "A guilt-ridden piece is a pacifist. It moves as usual but refuses to capture.", videos: [1] },
      { text: "Move a bishop to a square next to a guilt-ridden piece to absolve it. It can capture again.", videos: [1] },
      { text: "A bishop that captures is guilt-ridden too, takes one turn to clean its own conscience, and absolves itself.", videos: [1] },
      { text: "With no bishops left you cannot absolve anyone until a pawn promotes to a bishop.", videos: [1] }
    ]
  },
  reactions: {
    heading: "Reactions",
    intro: "Classic, but a die decides how each piece takes its first capture.",
    rules: [
      { text: "The first time a piece captures, roll a D6. The result is that piece's reaction for the rest of the game: each piece rolls only once.", videos: [2] },
      { text: "1: Devastated. The piece is immobilised. Absolve it with a bishop within three turns, or it removes itself.", videos: [2] },
      { text: "2 or 3: Guilt-ridden, as in Classic.", videos: [2] },
      { text: "4 or 5: Unaffected. It carries on as a normal piece.", videos: [2] },
      { text: "6: Sadist. It gains an extra move after making a capture. The extra move does not stack if it captures again in the same turn.", videos: [2, 3] },
      { text: "A Sadist that has taken three pieces in total gains bloodlust: it only moves if it can take a piece, and it is willing to take friendly pieces.", videos: [2] }
    ]
  },
  witnesses: {
    heading: "Witnesses",
    intro: "Reactions, and the comrades of a captured piece react to seeing it fall.",
    rules: [
      { text: "When a piece is taken, every piece of its own side standing next to the capture rolls a D6.", videos: [4] },
      { text: "1 or 2: the witness becomes guilt-ridden. This is temporary: a bishop absolves it, and it does not count as the piece's own capture reaction (it still rolls when it first captures).", videos: [4] },
      { text: "If the witness was already guilt-ridden, a 1 or 2 doubles the effect: it is temporarily devastated, and needs a bishop within three turns.", videos: [4] },
      { text: "3 or 4: no reaction.", videos: [5] },
      { text: "5 or 6: Vendetta. The witness gains one guilt-free attack, which can only be made against the piece type that made the capture.", videos: [5] },
      { text: "A piece that is already a Sadist is not affected by witness rolls.", videos: [4] }
    ]
  }
};

// What the videos do not settle, and what this app does about it. Each line matches a constant
// or function in src/variant/interpretation.ts.
export const INTERPRETATIONS: string[] = [
  "\"Adjacent\" means all eight neighbouring squares, diagonals included, for absolution and for witnesses.",
  "Only a friendly bishop that is itself healthy absolves. It happens the moment its move lands, and it clears every afflicted friendly piece next to the landing square: guilt-ridden or devastated, temporary or not. A piece that walks up to a bishop is not absolved.",
  "A pawn that promotes to a bishop absolves the pieces next to its promotion square.",
  "A guilt-ridden bishop absolves itself when its owner has finished their next turn. A devastated bishop needs another bishop.",
  "A reaction is permanent: a piece that rolled guilt-ridden is guilt-ridden again after every capture, and a piece that rolled devastated is devastated again. An unaffected piece never suffers from its own captures.",
  "Guilt-ridden and devastated pieces give no check and control no squares, so a king may stand next to them and castle past them.",
  "The three turns of devastation are the owner's own turns. If the piece is still devastated when the owner's fourth turn would start, it is removed before they move.",
  "Kings roll like any other piece. A devastated king that is not absolved in time removes itself, and its side loses.",
  "The Sadist's extra move is optional (End turn), must be made with the Sadist itself, and may be any legal move for it. The capture that rolls the 6 already earns one.",
  "No move may ever capture a king. A piece with bloodlust may take any friendly piece except its own king, and friendly captures count toward its three.",
  "A vendetta capture can be made even while guilt-ridden; it rolls no reaction and causes no guilt, and it is used up. The victim's neighbours still roll as witnesses. A vendetta against the king (when a king made the capture) can never be collected.",
  "Witnesses roll in board order (a8 to h1) after the capturing piece's own roll. A witness that is already devastated still rolls, and a new vendetta replaces an old one.",
  "En passant is a capture by the pawn, and its witnesses are the neighbours of the captured pawn. Castling, promotion and the draws are standard chess.",
  "Every roll and the Sadist's extra move happen before check, checkmate and stalemate are judged for the next player. A side with no legal move and no check on its king is stalemated, even if that is because its pieces are immobilised or refuse to capture."
];
