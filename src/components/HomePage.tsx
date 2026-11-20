import { useState } from "react";
import { BookOpen, Bot, ChevronRight, Globe, Users } from "lucide-react";
import type { BotLevel } from "../bot";
import { DEFAULT_GAME_RULES, type GameRules } from "../game";
import type { ColorChoice } from "../multiplayer/protocol";
import heroTall from "../assets/hero-tall.webp";
import heroWide from "../assets/hero.webp";
import { BotLevelPicker } from "../ui/BotLevelPicker";
import { ColorPicker } from "../ui/ColorPicker";
import { RulesDialog, SoundToggle } from "../ui/GameChrome";
import { Modal } from "../ui/Modal";

type HomePageProps = {
  onStartLocal: (rules: GameRules) => void;
  onStartBot: (level: BotLevel, rules: GameRules, color: ColorChoice) => void;
  onOpenMultiplayer: () => void;
};

type HomeDialog = "rules" | "bots" | null;

export function HomePage({ onStartLocal, onStartBot, onOpenMultiplayer }: HomePageProps) {
  const [dialog, setDialog] = useState<HomeDialog>(null);
  const [botLevel, setBotLevel] = useState<BotLevel>("medium");
  const [botColor, setBotColor] = useState<ColorChoice>("white");
  // Plain chess has no rule options. A variant keeps its options in state here and passes them on.
  const rules = DEFAULT_GAME_RULES;

  return (
    <main className="home-page">
      <picture className="home-hero" aria-hidden="true">
        <source media="(max-aspect-ratio: 4/5)" srcSet={heroTall} />
        <img src={heroWide} alt="" draggable="false" />
      </picture>
      <div className="home-shade" aria-hidden="true" />

      <div className="home-corner">
        <SoundToggle />
      </div>

      <section className="home-menu" aria-labelledby="home-title">
        <p className="home-kicker">The classic game of kings</p>
        <h1 id="home-title">
          Play <span>Chess</span>
        </h1>
        <p className="home-summary">
          Take on a bot, share one screen with a friend, or find an opponent online.
        </p>

        <div className="home-actions" aria-label="Game modes">
          <button className="menu-button primary" type="button" onClick={() => setDialog("bots")}>
            <span className="menu-icon"><Bot aria-hidden="true" size={22} /></span>
            <span className="menu-copy">
              <strong>Play a Bot</strong>
              <small>Easy, medium or hard</small>
            </span>
            <ChevronRight className="menu-arrow" aria-hidden="true" size={20} />
          </button>
          <button className="menu-button" type="button" onClick={onOpenMultiplayer}>
            <span className="menu-icon"><Globe aria-hidden="true" size={22} /></span>
            <span className="menu-copy">
              <strong>Play Multiplayer</strong>
              <small>Private rooms and quick match</small>
            </span>
            <ChevronRight className="menu-arrow" aria-hidden="true" size={20} />
          </button>
          <button className="menu-button" type="button" onClick={() => onStartLocal(rules)}>
            <span className="menu-icon"><Users aria-hidden="true" size={22} /></span>
            <span className="menu-copy">
              <strong>Pass &amp; Play</strong>
              <small>Two players, one screen</small>
            </span>
            <ChevronRight className="menu-arrow" aria-hidden="true" size={20} />
          </button>
        </div>

        <button className="rules-link" type="button" onClick={() => setDialog("rules")}>
          <BookOpen aria-hidden="true" size={18} />
          How to play
        </button>
      </section>

      {dialog === "bots" ? (
        <Modal title="Play a bot" description="Pick a difficulty and a side." onClose={() => setDialog(null)}>
          <BotLevelPicker value={botLevel} onChange={setBotLevel} />
          <ColorPicker value={botColor} onChange={setBotColor} />
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              data-autofocus
              onClick={() => onStartBot(botLevel, rules, botColor)}
            >
              Start game
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "rules" ? <RulesDialog onClose={() => setDialog(null)} /> : null}
    </main>
  );
}
