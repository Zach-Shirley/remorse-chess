import type { CSSProperties, ReactNode } from "react";
import type { Piece, PieceKind, Player } from "../game";
import bishopBlack from "../assets/pieces/bishop-black.webp";
import bishopWhite from "../assets/pieces/bishop-white.webp";
import kingBlack from "../assets/pieces/king-black.webp";
import kingWhite from "../assets/pieces/king-white.webp";
import knightBlack from "../assets/pieces/knight-black.webp";
import knightWhite from "../assets/pieces/knight-white.webp";
import pawnBlack from "../assets/pieces/pawn-black.webp";
import pawnWhite from "../assets/pieces/pawn-white.webp";
import queenBlack from "../assets/pieces/queen-black.webp";
import queenWhite from "../assets/pieces/queen-white.webp";
import rookBlack from "../assets/pieces/rook-black.webp";
import rookWhite from "../assets/pieces/rook-white.webp";

// Sprites rendered by art/render.mjs. A new game swaps this table (and the files behind it).
const SPRITES: Record<Player, Record<PieceKind, string>> = {
  white: { pawn: pawnWhite, knight: knightWhite, bishop: bishopWhite, rook: rookWhite, queen: queenWhite, king: kingWhite },
  black: { pawn: pawnBlack, knight: knightBlack, bishop: bishopBlack, rook: rookBlack, queen: queenBlack, king: kingBlack }
};

export function pieceSprite(player: Player, kind: PieceKind) {
  return SPRITES[player][kind];
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
  // A second piece that slides in the same move (the rook when castling).
  companion?: { pieceId: string; dx: number; dy: number };
};

type PieceTokenProps = {
  piece: Piece;
  animation?: PieceAnimation | null;
  onAnimationEnd?: (animationId: number) => void;
  // A small status marker drawn over the piece (see docs/ARCHITECTURE.md, "Piece badges").
  badge?: ReactNode;
};

export function PieceToken({ piece, animation = null, onAnimationEnd, badge }: PieceTokenProps) {
  const style = animation
    ? ({ "--dx": `${animation.dx * 100}%`, "--dy": `${animation.dy * 100}%` } as CSSProperties)
    : undefined;
  const classes = ["piece", piece.kind, piece.player, animation ? `animate-${animation.mode}-${animation.direction}` : ""];

  return (
    <span
      className={classes.filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
      onAnimationEnd={(event) => {
        if (animation && event.target === event.currentTarget) onAnimationEnd?.(animation.id);
      }}
    >
      <img className="piece-art" src={pieceSprite(piece.player, piece.kind)} alt="" draggable="false" />
      {badge ? <span className="piece-badge">{badge}</span> : null}
    </span>
  );
}
