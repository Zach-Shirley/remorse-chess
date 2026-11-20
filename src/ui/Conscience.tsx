// Everything on screen that shows a piece's conscience: the tokens under the pieces, the note for
// the selected piece, the roll card that announces each die, the legend and the rule-set picker.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Cross, Droplet, Flame, Minus, Skull, Zap } from "lucide-react";
import { findPiece, type GameState, type Piece, type PieceKind } from "../game";
import { playSound } from "../sound";
import {
  TOKEN_NAMES,
  describeEvent,
  describeMind,
  mainToken,
  mindSummary,
  pieceLabel,
  type EventLine,
  type TokenKind
} from "../variant/describe";
import { RULE_SETS, RULE_SET_INFO, devastationCountdown, type Mind, type RuleSet } from "../variant/remorse";
import type { RuleSetName } from "../variant/rulesText";

const KIND_LETTER: Record<PieceKind, string> = { pawn: "P", knight: "N", bishop: "B", rook: "R", queen: "Q", king: "K" };

function tokenGlyph(token: TokenKind, mind: Mind): ReactNode {
  if (token === "devastated") return devastationCountdown(mind);
  if (token === "guilty") return <Droplet aria-hidden="true" />;
  if (token === "bloodlust") return <Flame aria-hidden="true" />;
  if (token === "sadist") return <Zap aria-hidden="true" />;
  return <Minus aria-hidden="true" />;
}

// The tokens drawn under a piece (Board's `pieceBadge`). Null when the piece has nothing to show.
export function conscienceBadge(mind: Mind | undefined): ReactNode {
  if (!mind) return null;
  const token = mainToken(mind);
  if (!token && !mind.vendetta) return null;
  return (
    <>
      {token ? (
        <span className={`token ${token}`} data-token={token}>
          {tokenGlyph(token, mind)}
        </span>
      ) : null}
      {mind.vendetta ? (
        <span className="token vendetta" data-token="vendetta">
          {KIND_LETTER[mind.vendetta]}
        </span>
      ) : null}
    </>
  );
}

// Extra square classes (Board's `squareClassName`): afflicted pieces are drawn subdued, and the
// Sadist that may move again is ringed.
export function conscienceSquareClass(state: GameState, piece: Piece | null): string {
  if (!piece) return "";
  const mind = state.minds[piece.id];
  const classes: string[] = [];
  if (mind?.affliction) classes.push(`${mind.affliction}-square`);
  if (state.extraMove && state.extraMove.pieceId === piece.id && state.status.phase === "playing") classes.push("extra-move-square");
  return classes.join(" ");
}

// The square label suffix for screen readers.
export function conscienceAria(state: GameState, piece: Piece | null): string {
  return piece ? mindSummary(state.minds[piece.id]) : "";
}

// In words: the conscience of the piece the player is looking at.
export function ConscienceNote({ state, pieceId }: { state: GameState; pieceId: string | null }) {
  const located = pieceId ? findPiece(state, pieceId) : null;
  if (!located) return null;
  const mind = state.minds[located.piece.id];
  const lines = describeMind(mind, located.piece.kind);
  if (lines.length === 0) return null;
  return (
    <section className="conscience-note" aria-live="polite">
      <div className="conscience-note-heading">
        <span className="conscience-tokens">{conscienceBadge(mind)}</span>
        <strong>{pieceLabel(located.piece)}</strong>
      </div>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

export function Die({ value, tone, small = false }: { value: number; tone?: string; small?: boolean }) {
  return (
    <span className={`die ${tone ?? ""} ${small ? "small" : ""}`} role="img" aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <i key={index} className={PIPS[value]?.includes(index) ? "pip" : ""} />
      ))}
    </span>
  );
}

function EventIcon({ line }: { line: EventLine }) {
  if (line.value !== undefined) return <Die value={line.value} tone={line.tone} />;
  const icon =
    line.tone === "absolved" ? <Cross aria-hidden="true" /> :
    line.tone === "removed" ? <Skull aria-hidden="true" /> :
    line.tone === "bloodlust" ? <Flame aria-hidden="true" /> :
    line.tone === "sadist" ? <Zap aria-hidden="true" /> :
    line.tone === "vendetta" ? <Cross aria-hidden="true" /> :
    <Droplet aria-hidden="true" />;
  return <span className={`event-icon ${line.tone}`}>{icon}</span>;
}

// One event in the move list: the die face for a roll, a small icon otherwise. The sentence is
// in its title (and read by screen readers).
export function EventChip({ line }: { line: EventLine }) {
  return (
    <i className={`event-chip ${line.tone}`} title={line.text} aria-label={line.text} role="img">
      {line.value !== undefined ? (
        line.value
      ) : line.tone === "absolved" || line.tone === "vendetta" ? (
        <Cross aria-hidden="true" />
      ) : line.tone === "removed" ? (
        <Skull aria-hidden="true" />
      ) : line.tone === "bloodlust" ? (
        <Flame aria-hidden="true" />
      ) : (
        <Droplet aria-hidden="true" />
      )}
    </i>
  );
}

type RollCard = { id: number; lines: EventLine[] };

// Announces what the latest action set off: every die with its piece, number and outcome, and
// absolutions and losses. It sits over the top of the board and never blocks a click.
export function EventFeed({ state }: { state: GameState }) {
  const seen = useRef(state.actionCount);
  const [card, setCard] = useState<RollCard | null>(null);

  useEffect(() => {
    const previous = seen.current;
    seen.current = state.actionCount;
    // An undo or a new game: nothing new happened.
    if (state.actionCount <= previous) {
      setCard(null);
      return;
    }
    // "May move again" is already said by the turn status and the End turn button.
    const lines = state.lastEvents.filter((event) => event.type !== "extra-move").map(describeEvent);
    if (lines.length === 0) return;
    setCard({ id: state.actionCount, lines });
    if (lines.some((line) => line.value !== undefined)) playSound("dice");
    else if (lines.some((line) => line.tone === "removed")) playSound("despair");
    else if (lines.some((line) => line.tone === "absolved")) playSound("absolve");
    const timer = window.setTimeout(
      () => setCard((current) => (current?.id === state.actionCount ? null : current)),
      2600 + lines.length * 700
    );
    return () => window.clearTimeout(timer);
  }, [state.actionCount, state.lastEvents]);

  if (!card) return null;
  return (
    <div className="roll-card" role="status" key={card.id} data-testid="roll-card">
      {card.lines.map((line, index) => (
        <div className={`roll-line ${line.tone}`} key={index} style={{ animationDelay: `${index * 90}ms` }}>
          <EventIcon line={line} />
          <span className="roll-who">{line.who}</span>
          <strong className="roll-what">{line.what}</strong>
        </div>
      ))}
    </div>
  );
}

const LEGEND: { token: TokenKind | "vendetta"; glyph: ReactNode; text: string }[] = [
  { token: "guilty", glyph: <Droplet aria-hidden="true" />, text: "Refuses to capture until a friendly bishop is next to it." },
  { token: "devastated", glyph: 3, text: "Cannot move. The number is the turns its owner has left to bring a bishop." },
  { token: "unaffected", glyph: <Minus aria-hidden="true" />, text: "Has rolled, and captures never trouble it." },
  { token: "sadist", glyph: <Zap aria-hidden="true" />, text: "May move again after it captures." },
  { token: "bloodlust", glyph: <Flame aria-hidden="true" />, text: "A Sadist after three captures: moves only to capture, friends included." },
  { token: "vendetta", glyph: "R", text: "One guilt-free capture against the piece type shown by its letter (K Q R B N P)." }
];

export function TokenLegend() {
  return (
    <ul className="token-legend">
      {LEGEND.map((entry) => (
        <li key={entry.token}>
          <span className="conscience-tokens">
            <span className={`token ${entry.token}`}>{entry.glyph}</span>
          </span>
          <div>
            <strong>{TOKEN_NAMES[entry.token]}</strong>
            <p>{entry.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

const RULE_SET_KEY = "remorse-chess:rule-set";

function readRuleSet(): RuleSetName {
  try {
    const stored = localStorage.getItem(RULE_SET_KEY);
    return RULE_SETS.find((name) => name === stored) ?? "reactions";
  } catch {
    return "reactions";
  }
}

// The player's rule set, remembered on this device.
export function useRuleSetChoice(): [RuleSetName, (next: RuleSetName) => void] {
  const [ruleSet, setRuleSet] = useState<RuleSetName>(readRuleSet);
  return [
    ruleSet,
    (next) => {
      setRuleSet(next);
      try {
        localStorage.setItem(RULE_SET_KEY, next);
      } catch {
        // Private mode: the choice lasts for this page load.
      }
    }
  ];
}

export function ruleSetLabel(ruleSet: RuleSet): string {
  return ruleSet === "plain" ? "Plain chess" : RULE_SET_INFO[ruleSet].label;
}

export function RuleSetPicker({ value, onChange }: { value: RuleSetName; onChange: (ruleSet: RuleSetName) => void }) {
  return (
    <div className="option-cards rule-sets" role="radiogroup" aria-label="Rule set">
      {RULE_SETS.map((name, index) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          className={value === name ? "active" : ""}
          data-rule-set={name}
          onClick={() => onChange(name)}
        >
          {/* How many of the creator's rule layers are in play. */}
          <span className="level-pips" aria-hidden="true">
            {RULE_SETS.map((_, pip) => (
              <i key={pip} className={pip <= index ? "lit" : ""} />
            ))}
          </span>
          <strong>{RULE_SET_INFO[name].label}</strong>
          <small>{RULE_SET_INFO[name].description}</small>
        </button>
      ))}
    </div>
  );
}

// A compact reminder of the rule set in play, for the side panel.
export function RuleSetChip({ ruleSet }: { ruleSet: RuleSet }) {
  if (ruleSet === "plain") return null;
  return (
    <p className="rule-set-chip" title={RULE_SET_INFO[ruleSet].description} data-testid="rule-set-chip">
      <span>Rules</span>
      <strong>{RULE_SET_INFO[ruleSet].label}</strong>
      <small>{RULE_SET_INFO[ruleSet].description}</small>
    </p>
  );
}
