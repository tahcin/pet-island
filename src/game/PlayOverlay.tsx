import { useEffect } from "react";
import { useGame, type ItemKind } from "../store";
import { findTarget, hintFor, labelEls, usePlayUi } from "./interactions";
import { SpeechBubbleCard } from "../ui/SpeechBubble";
import { itemName, speciesItem } from "./collectibles";
import { questDefs } from "./quests";
import "./play.css";

/** Small inline icons per item (no emoji). */
export function ItemIcon({ kind, size = 20 }: { kind: ItemKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (kind === "bone")
    return (
      <svg {...common}>
        <g fill="#fff4dc" stroke="#b89a78" strokeWidth="1.4">
          <rect x="6" y="9.5" width="12" height="5" rx="2.5" />
          <circle cx="5.5" cy="9" r="3" />
          <circle cx="5.5" cy="15" r="3" />
          <circle cx="18.5" cy="9" r="3" />
          <circle cx="18.5" cy="15" r="3" />
        </g>
      </svg>
    );
  if (kind === "yarn")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" fill="#f29ab0" stroke="#c9607e" strokeWidth="1.4" />
        <path d="M5 10c4 1 10 1 14-2M5.5 15c4-1 9-5 11-9M8 19c1-5 6-9 11-8" fill="none" stroke="#c9607e" strokeWidth="1.2" />
      </svg>
    );
  if (kind === "carrot")
    return (
      <svg {...common}>
        <path d="M14 8 L4 20 L16 11 Z" fill="#ff9a4a" stroke="#d0702a" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M15 9c1-3 3-5 5-5M15 9c3-1 5 0 6 1M15 9c0-2 0-4-1-6" fill="none" stroke="#5ab04f" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 4 C5 4 3 12 4 17 L20 17 C21 12 19 4 12 4 Z" fill="#ffd9c8" stroke="#d4907c" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 5v12M8 6l-2 11M16 6l2 11" stroke="#d4907c" strokeWidth="1.1" />
      <rect x="9" y="17" width="6" height="3" rx="1.2" fill="#ffd9c8" stroke="#d4907c" strokeWidth="1.2" />
    </svg>
  );
}

function Pill({ kind }: { kind: ItemKind }) {
  const count = useGame((s) => s.inventory[kind]);
  const pops = usePlayUi((s) => s.pops[kind] ?? 0);
  return (
    <div key={pops} className={`pi-pill${pops > 0 ? " pi-pop" : ""}`} data-testid={`count-${kind}`} title={itemName(kind, 2)}>
      <ItemIcon kind={kind} />
      <span className="pi-pill-count">{count}</span>
    </div>
  );
}

function QuestCard() {
  const species = useGame((s) => s.reading.spec.species);
  const villagers = useGame((s) => s.reading.villagers);
  const quests = useGame((s) => s.quests);
  const inventory = useGame((s) => s.inventory);
  const defs = questDefs(species).filter((d) => quests[d.villager] !== "notStarted");
  if (defs.length === 0) return null;
  return (
    <div className="pi-quests" data-testid="quest-tracker">
      {defs.map((d) => {
        const name = villagers[d.villager]?.name ?? "A friend";
        const done = quests[d.villager] === "done";
        const have = Math.min(d.count, inventory[d.kind]);
        return (
          <div key={d.villager} className={`pi-quest${done ? " done" : ""}`} data-testid={`quest-${d.villager}`}>
            <span className="pi-quest-icon">
              {done ? (
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" fill="#9ad69a" />
                  <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <ItemIcon kind={d.kind} size={18} />
              )}
            </span>
            <span className="pi-quest-text">
              {done
                ? `${name} loved the ${itemName(d.kind, d.count)}`
                : `${name} wants ${d.count} ${itemName(d.kind, d.count)} (${have} of ${d.count})`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Polls the interaction target a few times a second for the Space hint (DOM only). */
function useHintPoll(): void {
  useEffect(() => {
    const id = window.setInterval(() => {
      usePlayUi.getState().setHint(hintFor(findTarget()));
    }, 120);
    return () => window.clearInterval(id);
  }, []);
}

const ACCENTS = ["#ffc9a8", "#d9c8f5", "#bfeccf"];

/** Name tags, greeting glyphs, and speech bubbles over the villagers (moved per frame by Villagers). */
function VillagerLabels() {
  const villagers = useGame((s) => s.reading.villagers);
  const labels = usePlayUi((s) => s.labels);
  return (
    <>
      {villagers.slice(0, 3).map((r, i) => {
        const l = labels[i];
        const accent = ACCENTS[i];
        return (
          <div
            key={i}
            className="pi-label"
            style={{ display: "none" }}
            ref={(el) => {
              labelEls[i] = el;
            }}
          >
            {l?.bubble ? (
              <SpeechBubbleCard text={l.bubble} name={r.name} accent={accent} testId={`villager-bubble-${i}`} />
            ) : (
              <div className="pi-tag-anchor">
                <div className="pi-tag-wrap">
                  {l?.glyph && <span className="pi-glyph">{l.glyph}</span>}
                  <span className="pi-nametag" style={{ background: accent }} data-testid={`villager-tag-${i}`}>
                    {r.name}
                  </span>
                  {l?.near && <span className="pi-talk-hint">Space to talk</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** DOM overlay for M5 play: item counters, quest tracker, Space hint. */
export default function PlayOverlay() {
  const species = useGame((s) => s.reading.spec.species);
  const hint = usePlayUi((s) => s.hint);
  useHintPoll();
  const kinds: ItemKind[] = [speciesItem(species), "shell"];
  return (
    <div className="pi-play" data-testid="play-overlay">
      <VillagerLabels />
      <div className="pi-pills">
        {kinds.map((k) => (
          <Pill key={k} kind={k} />
        ))}
      </div>
      <QuestCard />
      {hint && (
        <div key={hint} className="pi-hint" data-testid="interact-hint">
          <kbd>Space</kbd>
          {hint.replace(/^Space: /, "")}
        </div>
      )}
    </div>
  );
}
