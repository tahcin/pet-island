import { fallbackMessage, fetchDetails, fetchReading } from "../api";
import { liftColor, normalizeHex, type PetReading, type Villager } from "../schema/petReading";
import { randomSeed, seedFromLocation, useGame } from "../store";
import type { PreparedPhoto } from "./photo";

/** The reading screen stays up at least this long so the transition never flickers. */
const MIN_READING_MS = 1400;

let session = 0;

const SPARE_NAMES = ["Juniper", "Tamsin", "Marlo", "Quill", "Saffron", "Bramble"];

/** Villagers must not share the pet's name (or each other's). Pure. */
export function dedupeVillagerNames(villagers: Villager[], petName: string): Villager[] {
  const taken = new Set([petName.toLowerCase()]);
  let spare = 0;
  return villagers.map((v) => {
    let name = v.name;
    while (taken.has(name.toLowerCase())) name = SPARE_NAMES[spare++ % SPARE_NAMES.length];
    taken.add(name.toLowerCase());
    return name === v.name ? v : { ...v, name };
  });
}

/** When Claude is unavailable, tint the stand-in pet with the color measured from the photo. */
function applyMeasuredColor(reading: PetReading, measured: string): PetReading {
  const base = liftColor(normalizeHex(measured, reading.spec.baseColor));
  return { ...reading, spec: { ...reading.spec, baseColor: base, markingPattern: "blaze" } };
}

/**
 * Upload to reveal: shows the reading screen, fires the core and details calls in parallel,
 * moves to the reveal as soon as the core arrives, and merges the details whenever they land.
 */
export async function meetPet(photo: PreparedPhoto): Promise<void> {
  const id = ++session;
  const game = useGame.getState();
  game.setPhoto(photo.dataUrl);
  useGame.setState({ detailsReady: false });
  game.setScreen("reading");
  const started = performance.now();

  const detailsPromise = fetchDetails(photo.base64);
  const core = await fetchReading(photo.base64);
  if (id !== session) return;
  const reading = core.fallback ? applyMeasuredColor(core.reading, photo.measuredColor) : core.reading;

  const wait = MIN_READING_MS - (performance.now() - started);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (id !== session) return;

  const g = useGame.getState();
  g.setReading(reading, core.fallback, fallbackMessage(core.reason));
  g.setSeed(seedFromLocation() ?? randomSeed());
  g.setScreen("reveal");

  const details = await detailsPromise;
  if (id !== session) return;
  const petName = useGame.getState().reading.nameSuggestions[0];
  useGame.getState().setDetails({
    mind: details.details.mind,
    villagers: dedupeVillagerNames(details.details.villagers, petName),
  });
}

/** Cancels any in-flight reading (e.g. the player went back to the landing screen). */
export function cancelReading(): void {
  session++;
}
