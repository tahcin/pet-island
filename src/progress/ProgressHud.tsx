import { useGame } from "../store";
import { dailyTasks, levelProgress } from "./progression";
import { useProgress } from "./progressStore";
import { BellIcon, CheckIcon } from "./icons";

/** Always visible pill: bond level ring, bells, and daily tasks done. Opens the passport. */
export default function ProgressHud() {
  const xp = useProgress((s) => s.xp);
  const done = useProgress((s) => s.daily.done);
  const date = useProgress((s) => s.daily.date);
  const setOpen = useProgress((s) => s.setOpen);
  const open = useProgress((s) => s.open);
  const bells = useGame((s) => s.bells);
  const lp = levelProgress(xp);
  const total = dailyTasks(date).length;
  const count = done.filter(Boolean).length;
  const r = 15;
  const c = 2 * Math.PI * r;

  return (
    <button
      type="button"
      className="pg-pill"
      data-no-orbit
      data-testid="progress-pill"
      onClick={(e) => {
        e.currentTarget.blur();
        setOpen(!open);
      }}
      aria-label="Open Island Passport"
      title="Island Passport (K)"
    >
      <span className="pg-ring">
        <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden>
          <circle cx="19" cy="19" r={r} fill="none" stroke="#f1e2c8" strokeWidth="4" />
          <circle
            cx="19"
            cy="19"
            r={r}
            fill="none"
            stroke="var(--pg-accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${c * lp.frac} ${c}`}
            transform="rotate(-90 19 19)"
          />
        </svg>
        <b data-testid="progress-level">{lp.level}</b>
      </span>
      <span className="pg-pill-stat">
        <BellIcon />
        {bells}
      </span>
      <span className={`pg-pill-stat ${count === total ? "pg-all" : ""}`} data-testid="progress-daily">
        <CheckIcon />
        {count}/{total}
      </span>
      <kbd>K</kbd>
    </button>
  );
}
