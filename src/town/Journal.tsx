import { useEffect, useState } from "react";
import { useGame } from "../store";
import { villagers } from "../game/runtime";
import {
  controlledBody,
  currentDefs,
  people,
  questContext,
  questWorld,
} from "../game/interactions";
import {
  objectiveText,
  questProgress,
  rewardText,
  type QuestDef,
} from "../game/quests";
import { whereWords } from "../world/town";
import { clearGuide, guideEls, guideMe } from "./guide";
import "./journal.css";

type Tab = "quests" | "folk" | "guide";

const SPECIES_WORD: Record<string, string> = {
  dog: "Dog",
  cat: "Cat",
  rabbit: "Rabbit",
  small_rodent: "Hamster",
};

function whereOf(x: number, z: number): string {
  const w = questWorld.current;
  if (!w) return "";
  const b = controlledBody();
  return whereWords(w.town, x, z, { x: b.pos.x, z: b.pos.z });
}

function Hearts({ n }: { n: number }) {
  return (
    <span className="jn-hearts" aria-label={`${n} hearts`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path
            d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.8 1.3 5.2 3 1.4-1.7 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"
            fill={i < Math.ceil(n / 2) ? "#ff8fa3" : "#f1e2d2"}
          />
        </svg>
      ))}
    </span>
  );
}

function QuestRow({
  def,
  names,
  petName,
  tick,
}: {
  def: QuestDef;
  names: string[];
  petName: string;
  tick: number;
}) {
  const state = useGame((s) => s.quests[def.villager]);
  const i = def.villager;
  const v = villagers[i];
  const ctx = questContext(i);
  const [have, need] = questProgress(def, state, ctx);
  const person = people()[i];
  return (
    <li
      className={`jn-quest jn-${state}`}
      data-testid={`journal-quest-${i}`}
      data-tick={tick}
    >
      <div className="jn-quest-head">
        <strong>{names[i]}</strong>
        <span className="jn-species">
          {SPECIES_WORD[person?.species ?? "dog"]}
        </span>
        {state !== "done" && (
          <span className="jn-progress">
            {state === "active" ? `${have} of ${need}` : "New"}
          </span>
        )}
      </div>
      <div className="jn-objective">
        {state === "notStarted"
          ? `Talk to ${names[i]} to hear their favor.`
          : objectiveText(def, names, petName)}
      </div>
      <div className="jn-meta">
        <span>Reward: {rewardText(def.reward)}</span>
        {v && state !== "done" && (
          <span>{whereOf(v.body.pos.x, v.body.pos.z)}</span>
        )}
      </div>
      {state !== "done" && (
        <button
          type="button"
          className="jn-guide"
          data-testid={`guide-${i}`}
          onClick={() => guideMe(i)}
        >
          Guide me
        </button>
      )}
    </li>
  );
}

const CONTROLS: [string, string][] = [
  ["W A S D", "Walk"],
  ["Shift", "Run"],
  ["Space", "Talk, give, pick up"],
  ["T", "Talk to your pet"],
  ["Tab", "Switch between you and your pet"],
  ["C", "Pet camera"],
  ["P", "Photo mode"],
  ["N", "New island"],
  ["M", "Map"],
  ["J or Q", "Journal"],
  ["Esc", "Close"],
];

/** Quest journal: quests, townsfolk, and a controls guide. Also hosts the waypoint arrow. */
export default function Journal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("quests");
  const [tick, setTick] = useState(0);
  const reading = useGame((s) => s.reading);
  const quests = useGame((s) => s.quests);
  const friendship = useGame((s) => s.friendship);
  const bells = useGame((s) => s.bells);
  const petName = reading.nameSuggestions[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (e.code === "KeyJ" || e.code === "KeyQ") setOpen((o) => !o);
      else if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Refresh distances and places while open.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 700);
    return () => window.clearInterval(id);
  }, [open]);

  const folk = people();
  const names = folk.map((p) => p.name);
  const defs = currentDefs();
  const groups: [string, QuestDef[]][] = [
    ["Active", defs.filter((d) => quests[d.villager] === "active")],
    ["Available", defs.filter((d) => quests[d.villager] === "notStarted")],
    ["Done", defs.filter((d) => quests[d.villager] === "done")],
  ];

  return (
    <>
      <div
        className="jn-arrow"
        style={{ display: "none" }}
        data-testid="waypoint-arrow"
        ref={(el) => {
          guideEls.arrow = el;
        }}
      >
        <span className="jn-arrow-tip" />
        <span
          className="jn-arrow-label"
          ref={(el) => {
            guideEls.dist = el;
          }}
        />
      </div>
      {/* Shared bottom-right dock; other HUD pills (Passport) join it to the left. */}
      <div className="hud-dock" id="hud-dock" data-no-orbit>
        <button
          type="button"
          className="jn-button"
          data-testid="journal-button"
          data-no-orbit
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <rect
              x="4"
              y="3"
              width="15"
              height="18"
              rx="3"
              fill="#ffd9a8"
              stroke="#a8744f"
              strokeWidth="1.6"
            />
            <path
              d="M8 8h7M8 12h7M8 16h4"
              stroke="#a8744f"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          Journal <kbd>J</kbd>
        </button>
      </div>
      {open && (
        <div className="jn-panel" data-no-orbit data-testid="journal">
          <div className="jn-top">
            <h2>Journal</h2>
            <span className="jn-bells" data-testid="bells">
              {bells} bells
            </span>
            <button
              type="button"
              className="jn-close"
              aria-label="Close journal"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="jn-tabs" role="tablist">
            {(
              [
                ["quests", "Quests"],
                ["folk", "Townsfolk"],
                ["guide", "Guide"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="jn-body">
            {tab === "quests" &&
              groups.map(([title, list]) =>
                list.length === 0 ? null : (
                  <section key={title}>
                    <h3>{title}</h3>
                    <ul>
                      {list.map((d) => (
                        <QuestRow
                          key={d.villager}
                          def={d}
                          names={names}
                          petName={petName}
                          tick={tick}
                        />
                      ))}
                    </ul>
                  </section>
                ),
              )}
            {tab === "quests" && (
              <button type="button" className="jn-clear" onClick={clearGuide}>
                Clear guide
              </button>
            )}
            {tab === "folk" && (
              <ul>
                {folk.map((p, i) => {
                  const v = villagers[i];
                  return (
                    <li
                      key={`${p.name}-${i}`}
                      className="jn-folk"
                      data-testid={`folk-${i}`}
                    >
                      <div className="jn-quest-head">
                        <strong>{p.name}</strong>
                        <span className="jn-species">
                          {SPECIES_WORD[p.species]}
                        </span>
                        <Hearts n={friendship[i] ?? 0} />
                      </div>
                      <div className="jn-objective">{p.persona}</div>
                      {v && (
                        <div className="jn-meta">
                          {whereOf(v.body.pos.x, v.body.pos.z)}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {tab === "guide" && (
              <table className="jn-keys">
                <tbody>
                  {CONTROLS.map(([k, what]) => (
                    <tr key={k}>
                      <td>
                        <kbd>{k}</kbd>
                      </td>
                      <td>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
