// The rules dialog: the creator's rules by rule set with their sources, the token legend, this
// app's interpretations, the credit, and a reminder of standard chess.
import { ExternalLink } from "lucide-react";
import type { PieceKind } from "../game";
import { RULE_SETS, type RuleSet } from "../variant/remorse";
import { CREATOR, INTERPRETATIONS, RULES_BY_SET, VIDEOS, type RuleSetName } from "../variant/rulesText";
import { TokenLegend } from "./Conscience";
import { Modal } from "./Modal";
import { pieceSprite } from "./PieceToken";

const PIECE_RULES: { kind: PieceKind; title: string; text: string }[] = [
  { kind: "king", title: "King", text: "One square in any direction. It may never move into check." },
  { kind: "queen", title: "Queen", text: "Any distance in a straight line: along ranks, files or diagonals." },
  { kind: "rook", title: "Rook", text: "Any distance along ranks and files." },
  { kind: "bishop", title: "Bishop", text: "Any distance along diagonals. Here it is also the confessor." },
  { kind: "knight", title: "Knight", text: "An L: two squares one way, one to the side. It jumps over pieces." },
  { kind: "pawn", title: "Pawn", text: "One square forward (two from its start). Captures one square diagonally." }
];

const CHESS_NOTES: { title: string; text: string }[] = [
  {
    title: "Check and checkmate",
    text: "A king under attack is in check and must escape at once. If it cannot, that is checkmate and the game is over."
  },
  {
    title: "Castling",
    text: "Once per game the king moves two squares toward a rook and the rook jumps over it. Neither may have moved, the squares between must be empty, and the king may not castle out of, through or into check."
  },
  {
    title: "En passant",
    text: "A pawn that advances two squares and lands beside an enemy pawn can be captured by it as if it had moved one, but only on the very next move."
  },
  {
    title: "Promotion",
    text: "A pawn that reaches the far rank becomes a queen, rook, bishop or knight of your choice."
  },
  {
    title: "Draws",
    text: "Stalemate (no legal move while not in check), the same position three times, fifty moves by each side with no capture or pawn move, or too little material left to checkmate."
  }
];

function VideoRefs({ videos }: { videos: number[] }) {
  return (
    <span className="rule-sources">
      {videos.map((id) => {
        const video = VIDEOS.find((entry) => entry.id === id);
        if (!video) return null;
        return (
          <a key={id} href={video.url} target="_blank" rel="noreferrer" title={`Source: "${video.title}"`}>
            video {id}
          </a>
        );
      })}
    </span>
  );
}

// `ruleSet` is the one in play, when the dialog is opened from a game.
export function RulesDialog({ onClose, ruleSet }: { onClose: () => void; ruleSet?: RuleSet }) {
  const activeIndex = ruleSet ? RULE_SETS.indexOf(ruleSet as RuleSetName) : -1;

  return (
    <Modal
      title="How to play"
      description="Chess, except the pieces have a conscience. Checkmate still wins."
      onClose={onClose}
      wide
    >
      <div className="rules-body">
        {RULE_SETS.map((name, index) => {
          const section = RULES_BY_SET[name];
          const inPlay = activeIndex >= index;
          return (
            <section className={`rules-section ${ruleSet && !inPlay ? "not-in-play" : ""}`} key={name} data-rules={name}>
              <header>
                <h3>{section.heading}</h3>
                {ruleSet ? <span className={`rules-flag ${inPlay ? "on" : ""}`}>{inPlay ? "In this game" : "Not in this game"}</span> : null}
              </header>
              <p className="rules-intro">{section.intro}</p>
              <ul className="rule-lines">
                {section.rules.map((rule) => (
                  <li key={rule.text}>
                    <span>{rule.text}</span>
                    <VideoRefs videos={rule.videos} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="rules-section">
          <header>
            <h3>Tokens on the board</h3>
          </header>
          <TokenLegend />
        </section>

        <section className="rules-section" data-rules="interpretation">
          <header>
            <h3>This app's interpretation</h3>
          </header>
          <p className="rules-intro">
            The rules above are the creator's own words, with the video each comes from. His videos leave the
            questions below open. These answers are this app's choices, not his.
          </p>
          <ul className="rule-lines interpretation">
            {INTERPRETATIONS.map((text) => (
              <li key={text}>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rules-section" data-rules="credit">
          <header>
            <h3>Credit</h3>
          </header>
          <p className="rules-intro">
            Remorse Chess is a chess variant by{" "}
            <a href={CREATOR.youtube} target="_blank" rel="noreferrer">
              {CREATOR.name}
            </a>
            , who published it in five YouTube Shorts. This app is an independent implementation of what he describes.
          </p>
          <ul className="video-links">
            {VIDEOS.map((video) => (
              <li key={video.id}>
                <a href={video.url} target="_blank" rel="noreferrer">
                  <span>Video {video.id}</span>
                  {video.title}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <details className="rules-section chess-basics">
          <summary>Standard chess, in brief</summary>
          <ul className="rules-list piece-rules">
            {PIECE_RULES.map((rule) => (
              <li key={rule.kind}>
                <img src={pieceSprite("white", rule.kind)} alt="" draggable="false" />
                <div>
                  <strong>{rule.title}</strong>
                  <p>{rule.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="rules-notes">
            {CHESS_NOTES.map((note) => (
              <div key={note.title}>
                <dt>{note.title}</dt>
                <dd>{note.text}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>

      <div className="modal-actions single-action">
        <button className="button primary" type="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}
