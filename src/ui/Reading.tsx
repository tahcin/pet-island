import { useEffect, useState } from "react";
import { useGame } from "../store";
import SampleScene from "./SampleScene";
import { LandingSparkles, StepArt } from "./landing/art";
import "./landing.css";

const STATUS = [
  "Claude is looking at your pet",
  "Checking the ears",
  "Counting the spots",
  "Measuring the fluff",
  "Thinking of a name",
  "Finding an island",
];

/** "Claude is looking at your pet..." with the polaroid floating and sparkling over the hero diorama. */
export default function Reading() {
  const photoUrl = useGame((s) => s.photoUrl);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(STATUS.length - 1, s + 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="screen reading" data-testid="reading">
      <SampleScene anim="happy" />
      <LandingSparkles />
      <div className="reading-stack">
        {photoUrl && (
          <div className="polaroid polaroid-float">
            <img src={photoUrl} alt="Your pet" />
            <span className="sparkle s1" />
            <span className="sparkle s2" />
            <span className="sparkle s3" />
          </div>
        )}
        <div className="reading-status panel">
          <span className="reading-claude">
            <StepArt kind="claude" />
          </span>
          {STATUS[step]}
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
      <div className="reading-progress" aria-hidden="true">
        {STATUS.map((s, i) => (
          <i key={s} className={i <= step ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}
