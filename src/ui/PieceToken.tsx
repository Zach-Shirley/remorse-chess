import type { CSSProperties } from "react";
import { Hourglass } from "lucide-react";
import type { Piece, PieceKind, Player } from "../game";
import checkerBlack from "../assets/pieces/checker-black.webp";
import checkerRed from "../assets/pieces/checker-red.webp";
import kingBlack from "../assets/pieces/king-black.webp";
import kingRed from "../assets/pieces/king-red.webp";
import knightBlackRest from "../assets/pieces/knight-black-rest.webp";
import knightBlack from "../assets/pieces/knight-black.webp";
import knightRedRest from "../assets/pieces/knight-red-rest.webp";
import knightRed from "../assets/pieces/knight-red.webp";

// Sprites rendered by art/render.mjs. A new game swaps this table (and the files behind it).
const SPRITES: Record<Player, Record<PieceKind, string>> = {
  red: { man: checkerRed, king: kingRed, knight: knightRed },
  black: { man: checkerBlack, king: kingBlack, knight: knightBlack }
};
const RESTING_SPRITES: Record<Player, string> = { red: knightRedRest, black: knightBlackRest };

export function pieceSprite(player: Player, kind: PieceKind, resting = false) {
  return resting && kind === "knight" ? RESTING_SPRITES[player] : SPRITES[player][kind];
}

// A move animation. Offsets are in board cells; the piece box is exactly one cell.
export type PieceAnimation = {
  id: number;
  pieceId: string;
  mode: "slide" | "hop";
  // "from": the piece is already on its new square and animates in from the old one.
  // "to": the piece is still on its old square and animates out to the new one.
  direction: "from" | "to";
  dx: number;
  dy: number;
};

type PieceTokenProps = {
  piece: Piece;
  resting?: boolean;
  animation?: PieceAnimation | null;
  onAnimationEnd?: (animationId: number) => void;
};

export function PieceToken({ piece, resting = false, animation = null, onAnimationEnd }: PieceTokenProps) {
  const style = animation
    ? ({ "--dx": `${animation.dx * 100}%`, "--dy": `${animation.dy * 100}%` } as CSSProperties)
    : undefined;
  const classes = [
    "piece",
    piece.kind,
    piece.player,
    resting ? "resting" : "",
    animation ? `animate-${animation.mode}-${animation.direction}` : ""
  ];

  return (
    <span
      className={classes.filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (animation && event.target === event.currentTarget) onAnimationEnd?.(animation.id);
      }}
    >
      <img className="piece-art" src={pieceSprite(piece.player, piece.kind, resting)} alt="" draggable="false" />
      {resting ? (
        <span className="rest-badge">
          <Hourglass size={11} strokeWidth={2.6} />
        </span>
      ) : null}
    </span>
  );
}
