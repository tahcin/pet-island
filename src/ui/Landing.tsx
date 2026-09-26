import { useRef, useState, type DragEvent } from "react";
import SampleScene from "./SampleScene";
import { PhotoError, preparePhoto, type PreparedPhoto } from "./photo";
import { meetPet } from "./readingFlow";

/** Title screen: one big upload button, drag and drop anywhere, then a polaroid preview. */
export default function Landing() {
  const input = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

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
