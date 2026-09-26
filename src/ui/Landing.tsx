import { useRef, useState, type DragEvent } from "react";
import SampleScene from "./SampleScene";
import { PhotoError, preparePhoto, type PreparedPhoto } from "./photo";
import { meetPet } from "./readingFlow";
import { meetClaude } from "./meetClaude";
import { clearSave, lastVisited, loadSave } from "../save/save";
import { continueGame } from "../save/saveRuntime";
import "../talk/talk.css";

const CLAUDE_PILL = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 16px",
  borderRadius: 999,
  background: "#fbe3d8",
  color: "#8a4a36",
  fontWeight: 700,
  textDecoration: "none",
  border: "none",
  cursor: "pointer",
} as const;

/** Title screen: one big upload button, drag and drop anywhere, then a polaroid preview. */
export default function Landing() {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [save, setSave] = useState(() => loadSave());

  const take = async (file: File | undefined) => {
    if (!file) return;
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

  return (
    <div
      className={`screen landing${dragging ? " is-dragging" : ""}`}
      data-testid="landing"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <SampleScene />
      <div className="landing-card panel">
        <div className="landing-kicker">Welcome to</div>
        <h1 className="title landing-title">Pet Island</h1>
        <p className="landing-sub">Upload a photo of your pet and explore a brand new island together.</p>

        {save && !photo && (
          <div className="landing-continue" data-testid="continue-card">
            <span className="landing-continue-swatch" style={{ background: save.reading.spec.baseColor }} />
            <div className="landing-continue-info">
              <strong>{save.reading.nameSuggestions[0]}</strong>
              {save.reading.islandName}, {lastVisited(save.savedAt, Date.now())}
            </div>
            <button className="btn" data-testid="continue" onClick={() => continueGame()}>
              Continue with {save.reading.nameSuggestions[0]}
            </button>
          </div>
        )}
        {save && !photo && (
          <button
            className="link"
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
        )}

        {photo ? (
          <div className="landing-preview">
            <div className="polaroid">
              <img src={photo.dataUrl} alt="Your pet" />
            </div>
            <button className="btn" data-testid="meet" onClick={() => void meetPet(photo)}>
              Meet your pet
            </button>
            <button className="link" onClick={() => input.current?.click()}>
              Pick a different photo
            </button>
          </div>
        ) : (
          <>
            <button className="btn landing-upload" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Opening photo" : "Upload your pet"}
            </button>
            <p className="landing-hint">or drop a photo anywhere</p>
            <button className="link" data-testid="play-claude" onClick={meetClaude} style={CLAUDE_PILL}>
              <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
                <path fill="#d97757" d="M3 0h16v4h3v3h-3v3H3V7H0V4h3zM4 10h2v4H4zM7 10h2v4H7zM13 10h2v4h-2zM16 10h2v4h-2z" />
                <rect x="6" y="2" width="2" height="3" fill="#2b2226" />
                <rect x="14" y="2" width="2" height="3" fill="#2b2226" />
              </svg>
              No photo? Play with Claude
            </button>
          </>
        )}
        {error && <p className="landing-error">{error}</p>}
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
    </div>
  );
}
