import { getMaterial, opponentOf, type GameState, type PieceKind, type Player } from "../game";
import { pieceSprite } from "./PieceToken";

const ORDER: PieceKind[] = ["knight", "king", "man"];
const LABELS: Record<PieceKind, string> = { knight: "knight", king: "king", man: "checker" };

// Chess.com-style row beside a player's name: the enemy pieces they have taken, plus "+N" when ahead.
export function MaterialStrip({ state, player }: { state: GameState; player: Player }) {
  const { score, captured } = getMaterial(state);
  const enemy = opponentOf(player);
  const lead = score[player] - score[enemy];
  const taken = [...captured[player]].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  if (taken.length === 0 && lead <= 0) return null;

  const summary = ORDER.map((kind) => {
    const count = taken.filter((k) => k === kind).length;
    return count ? `${count} ${LABELS[kind]}${count > 1 ? "s" : ""}` : null;
  })
    .filter(Boolean)
    .join(", ");

  return (
    <span className="material-strip" aria-label={`Captured ${summary || "nothing"}${lead > 0 ? `, ahead by ${lead}` : ""}`}>
      {ORDER.map((kind) => {
        const group = taken.filter((k) => k === kind);
        if (group.length === 0) return null;
        return (
          <span className={`material-group ${kind}`} key={kind} aria-hidden="true">
            {group.map((_, index) => (
              <img key={index} src={pieceSprite(enemy, kind)} alt="" draggable="false" />
            ))}
          </span>
        );
      })}
      {lead > 0 ? <span className="material-lead">+{lead}</span> : null}
    </span>
  );
}
