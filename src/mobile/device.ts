import { setLowQuality } from "../fx/quality";

/**
 * Touch device detection, evaluated once at import. Play.tsx imports this first so the
 * low graphics preset is set before any light or effect module reads it.
 * `?touch=1` forces touch controls on a desktop for testing, `?touch=0` forces them off.
 */
function detect(): boolean {
  if (typeof window === "undefined") return false;
  const flag = new URLSearchParams(window.location.search).get("touch");
  if (flag === "1") return true;
  if (flag === "0") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export const IS_TOUCH = detect();

/** Phones and tablets: narrow or short screens, or any touch-first device. */
export const IS_MOBILE =
  IS_TOUCH || (typeof window !== "undefined" && Math.min(window.innerWidth, window.innerHeight) < 600);

if (IS_TOUCH) {
  setLowQuality();
  document.documentElement.classList.add("is-touch");
}
