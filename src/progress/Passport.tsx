import { useGame } from "../store";
import {
  ITEM_KINDS,
  ITEM_NAMES,
  LEVEL_REWARDS,
  MAX_LEVEL,
  RARE_NAMES,
  SHOP,
  STAMPS,
  canBuy,
  dailyTasks,
  levelProgress,
  nextGoal,
  titleForLevel,
} from "./progression";
import { useProgress, type PassportTab } from "./progressStore";
import { BellIcon, CheckIcon, FlameIcon, ItemIcon, StarIcon } from "./icons";

const TABS: { id: PassportTab; label: string }[] = [
  { id: "bond", label: "Bond" },
  { id: "today", label: "Today" },
  { id: "collection", label: "Collection" },
  { id: "stamps", label: "Stamps" },
  { id: "shop", label: "Shop" },
];

function BondTab() {
  const xp = useProgress((s) => s.xp);
  const owned = useProgress((s) => s.owned);
  const title = useProgress((s) => s.title);
  const petName = useGame((s) => s.reading.nameSuggestions[0] ?? "Your pet");
  const lp = levelProgress(xp);
  return (
    <div className="pg-tab">
      <div className="pg-bond-head">
        <div className="pg-bond-level">{lp.level}</div>
        <div>
          <div className="pg-bond-title">{titleForLevel(lp.level)}</div>
          <div className="pg-muted">
            You and {petName}
            {title ? `, ${title}` : ""}
          </div>
        </div>
      </div>
      <div className="pg-bar" aria-label="Bond XP">
        <span style={{ width: `${Math.round(lp.frac * 100)}%` }} />
      </div>
      <div className="pg-muted pg-small" data-testid="progress-xp">
        {xp} XP{lp.level < MAX_LEVEL ? `, ${lp.toNext} to ${titleForLevel(lp.level + 1)}` : ", max bond"}
      </div>
      <ul className="pg-list">
        {Object.entries(LEVEL_REWARDS).map(([lvl, r]) => {
          const got = owned.includes(r.id);
          return (
            <li key={lvl} className={got ? "pg-got" : ""}>
              <span className="pg-chip">Lv {lvl}</span>
              <span className="pg-grow">{r.label}</span>
              {got ? <CheckIcon /> : <span className="pg-muted pg-small">{titleForLevel(Number(lvl))}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TodayTab() {
  const daily = useProgress((s) => s.daily);
  const streak = useProgress((s) => s.streak);
  const xp = useProgress((s) => s.xp);
  const defs = dailyTasks(daily.date);
  const goal = nextGoal(
    xp,
    daily.progress.map((p, i) => ({ progress: p, done: daily.done[i] })),
    defs,
  );
  return (
    <div className="pg-tab">
      <div className="pg-streak-row">
        <FlameIcon />
        <span>
          <b>Day {Math.max(1, streak)} streak.</b> New tasks every morning.
        </span>
      </div>
      <ul className="pg-list">
        {defs.map((d, i) => (
          <li key={d.kind} className={daily.done[i] ? "pg-got" : ""} data-testid="daily-task">
            {daily.done[i] ? <CheckIcon /> : <span className="pg-dot" />}
            <span className="pg-grow">
              {d.label}
              <span className="pg-mini-bar">
                <span style={{ width: `${(daily.progress[i] / d.goal) * 100}%` }} />
              </span>
            </span>
            <span className="pg-reward">
              <BellIcon />
              {d.bells}
              <span className="pg-muted pg-small">+{d.xp} XP</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="pg-goal">{goal}</p>
    </div>
  );
}

function CollectionTab() {
  const catalog = useProgress((s) => s.catalog);
  const rares = useProgress((s) => s.rares);
  const found = ITEM_KINDS.filter((k) => catalog[k] > 0).length + ITEM_KINDS.filter((k) => rares[k] > 0).length;
  return (
    <div className="pg-tab">
      <div className="pg-muted">
        {found} of {ITEM_KINDS.length * 2} found. Rare treasures sparkle now and then.
      </div>
      <div className="pg-grid">
        {ITEM_KINDS.map((k) => (
          <div key={k} className={`pg-card ${catalog[k] ? "" : "pg-locked"}`}>
            <ItemIcon kind={k} found={catalog[k] > 0} />
            <div className="pg-card-name">{catalog[k] ? ITEM_NAMES[k] : "???"}</div>
            <div className="pg-small pg-muted">x{catalog[k]}</div>
          </div>
        ))}
        {ITEM_KINDS.map((k) => (
          <div key={`r-${k}`} className={`pg-card pg-card-rare ${rares[k] ? "" : "pg-locked"}`}>
            <ItemIcon kind={k} rare found={rares[k] > 0} />
            <div className="pg-card-name">{rares[k] ? RARE_NAMES[k] : "Rare ???"}</div>
            <div className="pg-small pg-muted">x{rares[k]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StampsTab() {
  const stamps = useProgress((s) => s.stamps);
  const owned = useProgress((s) => s.owned);
  const stickers = owned.filter((id) => id.startsWith("sticker-"));
  return (
    <div className="pg-tab">
      <div className="pg-muted">
        {stamps.length} of {STAMPS.length} stamps
        {stickers.length ? `, ${stickers.length} sticker${stickers.length > 1 ? "s" : ""}` : ""}
      </div>
      <div className="pg-stamps">
        {STAMPS.map((s, i) => {
          const got = stamps.includes(s.id);
          return (
            <div
              key={s.id}
              className={`pg-stamp ${got ? "pg-stamp-got" : ""}`}
              style={{ ["--tilt" as string]: `${((i * 37) % 13) - 6}deg` }}
              title={s.hint}
            >
              <StarIcon size={22} color={got ? "#ffd65c" : "#eadcc4"} />
              <div className="pg-stamp-name">{s.label}</div>
              <div className="pg-small pg-muted">{got ? "Stamped" : s.hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShopTab() {
  const owned = useProgress((s) => s.owned);
  const buy = useProgress((s) => s.buy);
  const title = useProgress((s) => s.title);
  const setTitle = useProgress((s) => s.setTitle);
  const bells = useGame((s) => s.bells);
  const equipped = useGame((s) => s.equipped);
  return (
    <div className="pg-tab">
      <div className="pg-muted">
        You have <b>{bells}</b> bells. Treats for your pet and your passport.
      </div>
      <ul className="pg-list">
        {SHOP.map((item) => {
          const have = owned.includes(item.id) || (item.accessory ? equipped.includes(item.accessory) : false);
          const itemTitle = item.label.replace(/^Title: /, "");
          return (
            <li key={item.id} className={have ? "pg-got" : ""}>
              <span className="pg-grow">{item.label}</span>
              {have ? (
                item.kind === "title" ? (
                  <button type="button" className="pg-btn-sm" onClick={() => setTitle(title === itemTitle ? null : itemTitle)}>
                    {title === itemTitle ? "Wearing" : "Wear"}
                  </button>
                ) : (
                  <span className="pg-muted pg-small">Owned</span>
                )
              ) : (
                <button
                  type="button"
                  className="pg-btn-sm"
                  disabled={!canBuy(bells, owned, item)}
                  onClick={() => buy(item.id)}
                  data-testid={`buy-${item.id}`}
                >
                  <BellIcon />
                  {item.price}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The Island Passport: bond, today, collection, stamps, and a little shop. */
export default function Passport() {
  const open = useProgress((s) => s.open);
  const tab = useProgress((s) => s.tab);
  const setTab = useProgress((s) => s.setTab);
  const setOpen = useProgress((s) => s.setOpen);
  if (!open) return null;
  return (
    <div className="pg-passport" data-no-orbit data-testid="passport" role="dialog" aria-label="Island Passport">
      <div className="pg-passport-head">
        <h2>Island Passport</h2>
        <button type="button" className="pg-close" onClick={() => setOpen(false)} aria-label="Close passport">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="pg-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? "pg-tab-on" : ""}
            onClick={() => setTab(t.id)}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="pg-body">
        {tab === "bond" && <BondTab />}
        {tab === "today" && <TodayTab />}
        {tab === "collection" && <CollectionTab />}
        {tab === "stamps" && <StampsTab />}
        {tab === "shop" && <ShopTab />}
      </div>
    </div>
  );
}
