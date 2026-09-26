import { useEffect } from "react";
import { useJuice } from "./juiceState";
import "./juice.css";

/** DOM overlay slot owned by M7 juice: photo countdown, camera flash, and toasts. */
export default function JuiceOverlay() {
  const countdown = useJuice((s) => s.countdown);
  const flash = useJuice((s) => s.flash);
  const toast = useJuice((s) => s.toast);
  const clearToast = useJuice((s) => s.clearToast);
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => clearToast(id), 2200);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);
  return (
    <div className="juice-photo">
      {countdown !== null && (
        <div key={countdown} className="juice-count" data-testid="photo-countdown">
          {countdown}
        </div>
      )}
      {flash > 0 && <div key={flash} className="juice-flash" />}
      {toast && (
        <div key={toast.id} className="juice-toast panel" data-testid="toast">
          {toast.text}
        </div>
      )}
    </div>
  );
}
