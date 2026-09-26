import { useEffect, useRef, useState } from "react";
import { useGame } from "../store";
import { input } from "../control/useInput";
import { useTalk } from "./talkState";
import { sayToPet } from "./petMind";
import { pauseMenu } from "../ui/PauseMenu";
import "./talk.css";

const CHIPS = ["Who are you?", "Follow me", "Wait here", "Show me a trick", "Let's play", "Find something!"];
const MAX = 200;

/** Chat bar for talking to the pet (F25). T or Enter opens it in companion mode; Esc closes. */
export default function TalkOverlay() {
  const open = useTalk((s) => s.open);
  const toast = useTalk((s) => s.toast);
  const mode = useGame((s) => s.mode);
  const photoMode = useGame((s) => s.photoMode);
  const [text, setText] = useState("");
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (useTalk.getState().open) return;
      // Paused: T and Enter must not open the chat bar behind the menu (Enter still presses its buttons).
      if (pauseMenu.isOpen) return;
      const g = useGame.getState();
      if (g.mode !== "companion" || g.photoMode || g.screen !== "play") return;
      if (e.code === "KeyT" || e.code === "Enter") {
        e.preventDefault();
        useTalk.getState().setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      input.suspended = true;
      input.down.clear();
      field.current?.focus();
    } else if (!pauseMenu.isOpen) input.suspended = false;
    return () => {
      if (!pauseMenu.isOpen) input.suspended = false;
    };
  }, [open]);

  useEffect(() => {
    if (mode !== "companion" || photoMode) useTalk.getState().setOpen(false);
  }, [mode, photoMode]);

  const close = () => {
    useTalk.getState().setOpen(false);
    setText("");
    field.current?.blur();
  };

  const send = (line: string) => {
    const l = line.trim().slice(0, MAX);
    if (!l) return;
    sayToPet(l);
    close();
  };

  return (
    <>
      {open && (
        <div className="talk-bar" data-testid="talk-bar">
          <div className="talk-chips">
            {CHIPS.map((c) => (
              <button key={c} className="talk-chip" onMouseDown={(e) => e.preventDefault()} onClick={() => send(c)}>
                {c}
              </button>
            ))}
          </div>
          <form
            className="talk-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input
              ref={field}
              className="talk-input"
              data-testid="talk-input"
              value={text}
              maxLength={MAX}
              placeholder="Say something to your pet"
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                }
                e.stopPropagation();
              }}
              onFocus={() => (input.suspended = true)}
              onBlur={() => (input.suspended = false)}
            />
            <button className="talk-send" type="submit">
              Say
            </button>
          </form>
        </div>
      )}
      {toast && (
        <div className="talk-toast" data-testid="talk-toast">
          {toast}
        </div>
      )}
    </>
  );
}
