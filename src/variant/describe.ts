// Words for consciences and events: the toasts, the move list, the selected-piece note and the
// screen-reader labels all read from here, so they cannot disagree.
import type { PieceKind, Player } from "../game";
import { DEVASTATION_TURNS } from "./interpretation";
import { devastationCountdown, type GameEvent, type Mind, type PieceRef } from "./remorse";

const SIDE: Record<Player, string> = { white: "White", black: "Black" };
const PLURAL: Record<PieceKind, string> = {
  pawn: "pawns",
  knight: "knights",
  bishop: "bishops",
  rook: "rooks",
  queen: "queens",
  king: "kings"
};
const FILES = "abcdefgh";

export function pieceLabel(piece: { player: Player; kind: PieceKind }): string {
  return `${SIDE[piece.player]} ${piece.kind}`;
}

function squareLabel(piece: PieceRef): string {
  return `${FILES[piece.square.col]}${8 - piece.square.row}`;
}

export function pluralKind(kind: PieceKind): string {
  return PLURAL[kind];
}

// The one status a piece's main token shows. A piece can also carry a vendetta beside it.
export type TokenKind = "devastated" | "guilty" | "bloodlust" | "sadist" | "unaffected";

export function mainToken(mind: Mind | undefined): TokenKind | null {
  if (!mind) return null;
  if (mind.affliction === "devastated") return "devastated";
  if (mind.affliction === "guilty") return "guilty";
  if (mind.bloodlust) return "bloodlust";
  if (mind.reaction === "sadist") return "sadist";
  if (mind.reaction === "unaffected") return "unaffected";
  return null;
}

export const TOKEN_NAMES: Record<TokenKind | "vendetta", string> = {
  guilty: "Guilt-ridden",
  devastated: "Devastated",
  sadist: "Sadist",
  bloodlust: "Bloodlust",
  unaffected: "Unaffected",
  vendetta: "Vendetta"
};

// A short label, e.g. for a screen reader: "guilt-ridden, vendetta against rooks".
export function mindSummary(mind: Mind | undefined): string {
  if (!mind) return "";
  const parts: string[] = [];
  const token = mainToken(mind);
  if (token === "devastated") parts.push(`devastated, ${devastationCountdown(mind)} turns left`);
  else if (token) parts.push(TOKEN_NAMES[token].toLowerCase());
  if (mind.vendetta) parts.push(`vendetta against ${PLURAL[mind.vendetta]}`);
  return parts.join(", ");
}

// Full sentences for the piece the player has selected.
export function describeMind(mind: Mind | undefined, kind: PieceKind): string[] {
  if (!mind) return [];
  const lines: string[] = [];
  if (mind.affliction === "devastated") {
    const turns = devastationCountdown(mind);
    lines.push(
      `Devastated${mind.temporary ? " (as a witness)" : ""}: it cannot move. A friendly bishop must land next to it within ${turns} ${turns === 1 ? "turn" : "turns"}, or it removes itself.`
    );
  } else if (mind.affliction === "guilty") {
    if (kind === "bishop" && mind.penance !== undefined) {
      lines.push("Guilt-ridden: it refuses to capture, and absolves itself once your next turn is over.");
    } else {
      lines.push(
        `Guilt-ridden${mind.temporary ? " (as a witness)" : ""}: it moves but refuses to capture, until a friendly bishop is next to it.`
      );
    }
  }
  if (mind.bloodlust) {
    lines.push("Sadist with bloodlust: it only moves to capture, and it will take its own side's pieces (never its king).");
  } else if (mind.reaction === "sadist") {
    const left = Math.max(0, 3 - (mind.captures ?? 0));
    lines.push(
      `Sadist: it may move again after a capture. ${left === 0 ? "Bloodlust is next." : `Bloodlust after ${left} more ${left === 1 ? "capture" : "captures"}.`}`
    );
  } else if (mind.reaction === "unaffected") {
    lines.push("Unaffected: captures never trouble it.");
  } else if (mind.reaction === "guilty" && !mind.affliction) {
    lines.push("Absolved for now. Its reaction is guilt: it will be guilt-ridden again after its next capture.");
  } else if (mind.reaction === "devastated" && !mind.affliction) {
    lines.push("Absolved for now. Its reaction is devastation: its next capture will devastate it again.");
  }
  if (mind.vendetta) {
    lines.push(
      mind.vendetta === "king"
        ? "Vendetta against the king: it can never be collected, because kings are not captured."
        : `Vendetta: one guilt-free capture, only against ${PLURAL[mind.vendetta]}.`
    );
  }
  return lines;
}

export type EventTone = "guilty" | "devastated" | "sadist" | "bloodlust" | "unaffected" | "vendetta" | "absolved" | "removed";

export type EventLine = {
  tone: EventTone;
  // The die face, when a die was rolled.
  value?: number;
  // Who it is about, e.g. "White rook".
  who: string;
  // What happened, e.g. "Guilt-ridden".
  what: string;
  // One full sentence for the move list tooltip and screen readers.
  text: string;
};

const CAPTURE_OUTCOME: Record<string, { tone: EventTone; what: string }> = {
  devastated: { tone: "devastated", what: "Devastated" },
  guilty: { tone: "guilty", what: "Guilt-ridden" },
  unaffected: { tone: "unaffected", what: "Unaffected" },
  sadist: { tone: "sadist", what: "Sadist" }
};

export function describeEvent(event: GameEvent): EventLine {
  switch (event.type) {
    case "roll": {
      const who = pieceLabel(event.piece);
      if (event.cause === "capture") {
        const { tone, what } = CAPTURE_OUTCOME[event.outcome];
        return { tone, value: event.value, who, what, text: `${who} rolled ${event.value}: ${what.toLowerCase()}` };
      }
      const witness = `${who} (witness)`;
      if (event.outcome === "guilty") {
        return { tone: "guilty", value: event.value, who: witness, what: "Shaken: guilt-ridden", text: `${witness} rolled ${event.value}: guilt-ridden` };
      }
      if (event.outcome === "devastated") {
        return { tone: "devastated", value: event.value, who: witness, what: "Doubled: devastated", text: `${witness} rolled ${event.value}: doubled to devastated` };
      }
      if (event.outcome === "vendetta") {
        const target = event.target ? PLURAL[event.target] : "the attacker";
        return { tone: "vendetta", value: event.value, who: witness, what: `Vendetta against ${target}`, text: `${witness} rolled ${event.value}: vendetta against ${target}` };
      }
      return { tone: "unaffected", value: event.value, who: witness, what: "No reaction", text: `${witness} rolled ${event.value}: no reaction` };
    }
    case "relapse": {
      const who = pieceLabel(event.piece);
      const what = event.affliction === "guilty" ? "Guilt-ridden" : "Devastated";
      return { tone: event.affliction, who, what, text: `${who} is ${what.toLowerCase()}` };
    }
    case "absolved": {
      const who = pieceLabel(event.by);
      const names = event.pieces.map((piece) => `the ${piece.kind} on ${squareLabel(piece)}`).join(" and ");
      return { tone: "absolved", who, what: `Absolved ${names}`, text: `${who} absolved ${names}` };
    }
    case "self-absolved": {
      const who = pieceLabel(event.piece);
      return { tone: "absolved", who, what: "Absolved itself", text: `${who} absolved itself` };
    }
    case "removed": {
      const who = pieceLabel(event.piece);
      return {
        tone: "removed",
        who,
        what: `Lost to despair on ${squareLabel(event.piece)}`,
        text: `${who} on ${squareLabel(event.piece)} was not absolved in ${DEVASTATION_TURNS} turns and removed itself`
      };
    }
    case "bloodlust": {
      const who = pieceLabel(event.piece);
      return { tone: "bloodlust", who, what: "Bloodlust", text: `${who} has bloodlust` };
    }
    case "vendetta-used": {
      const who = pieceLabel(event.piece);
      return { tone: "vendetta", who, what: "Vendetta settled", text: `${who} settled its vendetta, guilt-free` };
    }
    case "extra-move": {
      const who = pieceLabel(event.piece);
      return { tone: "sadist", who, what: "May move again", text: `${who} may move again` };
    }
  }
}
