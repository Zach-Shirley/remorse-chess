import { Shuffle } from "lucide-react";
import type { Player } from "../game";
import type { ColorChoice } from "../multiplayer/protocol";
import { pieceSprite } from "./PieceToken";

const OPTIONS: { value: ColorChoice; label: string }[] = [
  { value: "red", label: "Red" },
  { value: "black", label: "Black" },
  { value: "random", label: "Random" }
];

// Red always moves first, whichever side the player picks.
export function ColorPicker({ value, onChange }: { value: ColorChoice; onChange: (choice: ColorChoice) => void }) {
  return (
    <div className="color-picker">
      <span className="field-caption">Your color · Red moves first</span>
      <div className="segmented" role="radiogroup" aria-label="Your color">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={value === option.value ? "active" : ""}
            onClick={() => onChange(option.value)}
          >
            {option.value === "random" ? (
              <Shuffle aria-hidden="true" size={16} />
            ) : (
              <img src={pieceSprite(option.value, "man")} alt="" draggable="false" />
            )}
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function resolveColorChoice(choice: ColorChoice): Player {
  if (choice === "random") return Math.random() < 0.5 ? "red" : "black";
  return choice;
}
