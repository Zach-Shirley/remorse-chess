import { BOT_LEVELS, type BotLevel } from "../bot";

const LEVELS = Object.keys(BOT_LEVELS) as BotLevel[];

export function BotLevelPicker({ value, onChange }: { value: BotLevel; onChange: (level: BotLevel) => void }) {
  return (
    <div className="bot-levels" role="radiogroup" aria-label="Bot difficulty">
      {LEVELS.map((level, index) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          className={value === level ? "active" : ""}
          onClick={() => onChange(level)}
        >
          {/* Strength pips: one, two or three lit. */}
          <span className="level-pips" aria-hidden="true">
            {LEVELS.map((_, pip) => (
              <i key={pip} className={pip <= index ? "lit" : ""} />
            ))}
          </span>
          <strong>{BOT_LEVELS[level].label}</strong>
          <small>{BOT_LEVELS[level].description}</small>
        </button>
      ))}
    </div>
  );
}
