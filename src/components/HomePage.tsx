import { useState } from "react";
import { BookOpen, Bot, ChevronRight, Globe, Users } from "lucide-react";
import type { BotLevel } from "../bot";
import type { GameRules } from "../game";
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

type HomeDialog = "new-game" | "rules" | "bots" | null;

export function HomePage({ onStartLocal, onStartBot, onOpenMultiplayer }: HomePageProps) {
  const [dialog, setDialog] = useState<HomeDialog>(null);
  const [forceCheckerCaptures, setForceCheckerCaptures] = useState(true);
  const [botLevel, setBotLevel] = useState<BotLevel>("medium");
  const [botColor, setBotColor] = useState<ColorChoice>("red");

  const captureToggle = (
    <label className="setting-toggle">
      <span>
        <strong>Force checker captures</strong>
        <small>When a checker can jump, it must. Knights stay optional.</small>
      </span>
      <input
        type="checkbox"
        checked={forceCheckerCaptures}
        onChange={(event) => setForceCheckerCaptures(event.currentTarget.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );

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
        <p className="home-kicker">A checkers variant with one bad idea</p>
        <h1 id="home-title">
          Knight <span>Checkers</span>
        </h1>
        <p className="home-summary">
          Classic checkers, plus one elusive knight that only moves every other turn.
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
          <button className="menu-button" type="button" onClick={() => setDialog("new-game")}>
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

      {dialog === "new-game" ? (
        <Modal
          title="Pass & Play"
          description="Two players share this screen. Red moves first."
          onClose={() => setDialog(null)}
        >
          {captureToggle}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              data-autofocus
              onClick={() => onStartLocal({ forceCheckerCaptures })}
            >
              Start game
            </button>
          </div>
        </Modal>
      ) : null}

      {dialog === "bots" ? (
        <Modal title="Play a bot" description="Pick a difficulty and a side." onClose={() => setDialog(null)}>
          <BotLevelPicker value={botLevel} onChange={setBotLevel} />
          <ColorPicker value={botColor} onChange={setBotColor} />
          {captureToggle}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              className="button primary"
              type="button"
              data-autofocus
              onClick={() => onStartBot(botLevel, { forceCheckerCaptures }, botColor)}
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
