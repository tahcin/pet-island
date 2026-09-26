import { useGame } from "../store";

/** Pastel HUD: pet name and traits, mode indicator, control hints, seed (PRD F13). */
export default function Hud() {
  const reading = useGame((s) => s.reading);
  const mode = useGame((s) => s.mode);
  const seed = useGame((s) => s.seed);
  const name = reading.nameSuggestions[0];
  const hints =
    mode === "companion"
      ? ["WASD move", "Shift run", "Space play", "Tab be the pet", "Drag to look"]
      : ["WASD move", "Shift run", "Space dig or sniff", "C pet-cam", "Tab back"];
  return (
    <div className="hud">
      <div className="hud-card panel" data-testid="hud-pet">
        <div className="hud-name title">{name}</div>
        <div className="hud-traits">{reading.personality.join(" · ")}</div>
      </div>
      <div className={`hud-mode panel mode-${mode}`} data-testid="mode">
        {mode === "companion" ? `Exploring with ${name}` : `Playing as ${name}`}
      </div>
      <div className="hud-hints">
        {hints.map((h) => (
          <span key={h} className="hud-hint">
            {h}
          </span>
        ))}
      </div>
      <div className="hud-seed" data-testid="seed">
        {reading.islandName} · seed {seed}
      </div>
    </div>
  );
}
