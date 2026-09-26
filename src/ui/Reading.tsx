import { useEffect, useState } from "react";
import { useGame } from "../store";
import SampleScene from "./SampleScene";

const STATUS = [
  "Claude is looking at your pet",
  "Checking the ears",
  "Counting the spots",
  "Measuring the fluff",
  "Thinking of a name",
  "Finding an island",
];

/** "Claude is looking at your pet..." with the polaroid floating and sparkling over the sample island. */
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
          {STATUS[step]}
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}
