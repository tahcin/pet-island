import { useEffect } from "react";
import { useGame } from "../store";
import { dailyTasks, nextGoal } from "./progression";
import { useProgress } from "./progressStore";
import { BellIcon, FlameIcon, HeartIcon, StarIcon } from "./icons";

/** Shown on the first visit of a day: streak, gift, fresh tasks, and a next goal. */
export function WelcomeBack() {
  const welcome = useProgress((s) => s.welcome);
  const dismiss = useProgress((s) => s.dismissWelcome);
  const xp = useProgress((s) => s.xp);
  const daily = useProgress((s) => s.daily);
  const petName = useGame((s) => s.reading.nameSuggestions[0] ?? "Your pet");
  if (!welcome) return null;
  const defs = dailyTasks(daily.date);
  const goal = nextGoal(
    xp,
    daily.progress.map((p, i) => ({ progress: p, done: daily.done[i] })),
    defs,
  );
  const headline = welcome.firstEver ? "Welcome to the island!" : "Welcome back!";
  return (
    <div className="pg-welcome" data-no-orbit data-testid="welcome-card" role="dialog" aria-label={headline}>
      <div className="pg-welcome-top">
        <FlameIcon />
        <span className="pg-streak">Day {welcome.streak} streak</span>
      </div>
      <h2>{headline}</h2>
      <p className="pg-sub">
        {welcome.firstEver
          ? `${petName} is so happy to explore with you.`
          : welcome.daysAway > 1
            ? welcome.daysAway > 30
              ? `${petName} missed you! It has been a while.`
              : `${petName} missed you! It has been ${welcome.daysAway} days.`
            : `${petName} was waiting by the dock for you.`}
      </p>
      <ul className="pg-away">
        <li>
          <BellIcon /> Daily gift: <b>{welcome.gift} bells</b>
        </li>
        <li>
          <StarIcon size={16} /> 3 new daily tasks are ready
        </li>
        {!welcome.firstEver && (
          <li>
            <HeartIcon size={16} /> Fresh shells washed up on the beach
          </li>
        )}
      </ul>
      <p className="pg-goal">{goal}</p>
      <button type="button" className="pg-btn" onClick={dismiss} data-testid="welcome-ok">
        Let's play
      </button>
    </div>
  );
}

/** Big level up card with a confetti burst. */
export function CelebrationCard() {
  const c = useProgress((s) => s.celebration);
  const dismiss = useProgress((s) => s.dismissCelebration);
  useEffect(() => {
    if (!c) return;
    const t = window.setTimeout(dismiss, 4200);
    return () => window.clearTimeout(t);
  }, [c, dismiss]);
  if (!c) return null;
  return (
    <div className="pg-celebrate" data-no-orbit data-testid="level-up" key={c.id} onClick={dismiss}>
      <div className="pg-confetti" aria-hidden>
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ ["--i" as string]: i }}>
            {i % 3 === 0 ? <HeartIcon size={16} /> : <StarIcon size={16} color={i % 2 ? "#ffd65c" : "#b9e3ff"} />}
          </span>
        ))}
      </div>
      <div className="pg-celebrate-kicker">Bond level {c.level}!</div>
      <div className="pg-celebrate-title">{c.title}</div>
      {c.reward && <div className="pg-celebrate-reward">Unlocked: {c.reward.label}</div>}
    </div>
  );
}

/** Small toast for daily tasks, stamps, and rare finds. */
export function NoticeToast() {
  const n = useProgress((s) => s.notice);
  useEffect(() => {
    if (!n) return;
    const t = window.setTimeout(() => {
      if (useProgress.getState().notice?.id === n.id) useProgress.setState({ notice: null });
    }, 3200);
    return () => window.clearTimeout(t);
  }, [n]);
  if (!n) return null;
  return (
    <div className={`pg-notice ${n.rare ? "pg-rare" : ""}`} key={n.id} data-testid="progress-notice">
      {n.rare ? <StarIcon size={20} /> : <HeartIcon size={18} />}
      <span>{n.text}</span>
    </div>
  );
}
