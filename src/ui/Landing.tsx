import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import SampleScene, { type SampleCharacter } from "./SampleScene";
import { PhotoError, preparePhoto, type PreparedPhoto } from "./photo";
import { meetPet } from "./readingFlow";
import { meetClaude } from "./meetClaude";
import { clearSave, lastVisited, loadSave } from "../save/save";
import { continueGame } from "../save/saveRuntime";
import { LandingLogo, LandingSparkles, MascotArt, PetArt, StepArt } from "./landing/art";
import "../talk/talk.css";
import "./landing.css";

/** Pointer tilt for the collectible cards: writes CSS vars, no React state. */
function tilt(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
  el.style.setProperty("--rx", `${(-y * 12).toFixed(2)}deg`);
  el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
  el.style.setProperty("--gy", `${((y + 0.5) * 100).toFixed(1)}%`);
}

function untilt(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  el.style.setProperty("--ry", "0deg");
  el.style.setProperty("--rx", "0deg");
}

const STEPS = [
  { art: "upload" as const, title: "Upload", text: "One photo of your pet" },
  { art: "claude" as const, title: "Claude reads it", text: "Ears, colors, and mood" },
  { art: "island" as const, title: "Explore", text: "A fresh island, together" },
];

/** Title screen: pick Claude (default) or upload a pet photo, drag and drop anywhere, then a polaroid preview. */
export default function Landing() {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [save, setSave] = useState(() => loadSave());
  const [pick, setPick] = useState<SampleCharacter>("claude");

  const take = async (file: File | undefined) => {
    if (!file) return;
    setPick("dog");
    setError(null);
    setBusy(true);
    try {
      setPhoto(await preparePhoto(file));
    } catch (e) {
      setPhoto(null);
      setError(e instanceof PhotoError ? e.message : "Could not open that photo. Try another one.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };

  const upload = () => {
    setPick("dog");
    input.current?.click();
  };

  return (
    <div
      className={`screen landing${dragging ? " is-dragging" : ""}`}
      data-testid="landing"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="lp-sky" aria-hidden="true">
        <span className="lp-sun" />
      </div>
      <SampleScene character={pick} layout="hero" />
      <LandingSparkles />

      <div className="lp-scroll">
        <main className="lp-col">
          <div className="lp-kicker lp-in" style={{ animationDelay: "60ms" }}>
            <span className="lp-kicker-dot" />
            A cozy island adventure
          </div>
          <LandingLogo />
          <p className="lp-tagline lp-in" style={{ animationDelay: "320ms" }}>
            Your pet, as a cozy island buddy. <span className="lp-tag-claude">Built from one photo by Claude.</span>
          </p>

          {save && !photo && (
            <div className="lp-continue lp-in" data-testid="continue-card" style={{ animationDelay: "380ms" }}>
              <span className="lp-continue-swatch" style={{ background: save.reading.spec.baseColor }} />
              <div className="lp-continue-info">
                <span className="lp-continue-label">Welcome back</span>
                <strong>{save.reading.nameSuggestions[0]}</strong>
                <span className="lp-continue-where">
                  {save.reading.islandName}, {lastVisited(save.savedAt, Date.now())}
                </span>
              </div>
              <button className="btn lp-continue-btn" data-testid="continue" onClick={() => continueGame()}>
                Continue with {save.reading.nameSuggestions[0]}
              </button>
              <button
                className="link lp-fresh"
                data-testid="start-fresh"
                onClick={() => {
                  if (window.confirm(`Start fresh? ${save.reading.nameSuggestions[0]} and the island will be forgotten.`)) {
                    clearSave();
                    setSave(null);
                  }
                }}
              >
                Start fresh with a new pet
              </button>
            </div>
          )}

          {photo ? (
            <div className="lp-preview lp-in" style={{ animationDelay: "60ms" }}>
              <div className="polaroid lp-polaroid">
                <span className="lp-tape" />
                <img src={photo.dataUrl} alt="Your pet" />
                <span className="lp-polaroid-caption">new friend</span>
                <span className="sparkle s1" />
                <span className="sparkle s2" />
              </div>
              <div className="lp-preview-actions">
                <p className="lp-preview-note">Looking good. Claude will study the photo and build a toon twin.</p>
                <button className="btn lp-meet" data-testid="meet" onClick={() => void meetPet(photo)}>
                  Meet your pet
                </button>
                <button className="link" onClick={() => input.current?.click()}>
                  Pick a different photo
                </button>
              </div>
            </div>
          ) : (
            <div className="lp-picks" role="radiogroup" aria-label="Choose a companion">
              <div
                className={`lp-card lp-card-claude lp-in${pick === "claude" ? " is-picked" : ""}`}
                style={{ animationDelay: "420ms" }}
                role="radio"
                aria-checked={pick === "claude"}
                tabIndex={0}
                data-testid="pick-claude"
                onClick={() => setPick("claude")}
                onPointerMove={tilt}
                onPointerLeave={untilt}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setPick("claude");
                }}
              >
                <div className="lp-card-inner">
                  <div className="lp-card-top">
                    <span className="lp-card-no">No. 01</span>
                    <span className="lp-card-badge">Ready now</span>
                  </div>
                  <div className="lp-card-art">
                    <MascotArt />
                  </div>
                  <div className="lp-card-name">Claude</div>
                  <p className="lp-card-text">The curious little Claude mascot, ready to explore right away.</p>
                  <button
                    className="btn lp-card-btn lp-card-btn-claude"
                    data-testid="play-claude"
                    onClick={(e) => {
                      e.stopPropagation();
                      meetClaude();
                    }}
                  >
                    Play with Claude
                  </button>
                  <span className="lp-card-shine" />
                </div>
              </div>
              <div
                className={`lp-card lp-card-pet lp-in${pick === "dog" ? " is-picked" : ""}`}
                style={{ animationDelay: "520ms" }}
                role="radio"
                aria-checked={pick === "dog"}
                tabIndex={0}
                data-testid="pick-pet"
                onClick={() => setPick("dog")}
                onPointerMove={tilt}
                onPointerLeave={untilt}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setPick("dog");
                }}
              >
                <div className="lp-card-inner">
                  <div className="lp-card-top">
                    <span className="lp-card-no">No. 02</span>
                    <span className="lp-card-badge lp-badge-pet">One of a kind</span>
                  </div>
                  <div className="lp-card-art">
                    <PetArt />
                  </div>
                  <div className="lp-card-name">Your pet</div>
                  <p className="lp-card-text">Upload a photo and meet a toon version of your pet.</p>
                  <button
                    className="btn lp-card-btn"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      upload();
                    }}
                  >
                    {busy ? "Opening photo" : "Upload your pet"}
                  </button>
                  <span className="lp-card-shine" />
                </div>
              </div>
            </div>
          )}
          {!photo && <p className="lp-drop-hint lp-in" style={{ animationDelay: "620ms" }}>or drop a photo anywhere on this page</p>}
          {error && <p className="landing-error">{error}</p>}

          <ol className="lp-steps">
            {STEPS.map((s, i) => (
              <li key={s.art} className="lp-step lp-in" style={{ animationDelay: `${680 + i * 90}ms` }}>
                <StepArt kind={s.art} />
                <div>
                  <strong>
                    <span className="lp-step-n">{i + 1}</span>
                    {s.title}
                  </strong>
                  <span>{s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </main>
        <footer className="lp-footer lp-in" style={{ animationDelay: "900ms" }}>
          Made with <span className="lp-footer-claude">Claude</span> at Opus Build Day
        </footer>
      </div>

      <div className="lp-dropzone" aria-hidden="true">
        <div className="lp-dropzone-card">
          <PetArt />
          Drop your pet photo
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        data-testid="file-input"
        hidden
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
