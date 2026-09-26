/**
 * Real-photo acceptance check (TASKS M2): sends every image in a folder through the same
 * readPet() and readPetDetails() the server uses, in parallel like the client, and prints the
 * spec, the names, and timing. Usage: npx tsx scripts/readPhotos.ts [folder]  (default: test-photos)
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { readPet, readPetDetails, type ImageType } from "../server/petReading";

const TYPES: Record<string, ImageType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main(): Promise<void> {
  const dir = process.argv[2] ?? "test-photos";
  const files = readdirSync(dir).filter((f) => TYPES[extname(f).toLowerCase()]);
  const results = await Promise.all(
    files.map(async (f) => {
      const type = TYPES[extname(f).toLowerCase()];
      const data = readFileSync(join(dir, f)).toString("base64");
      const [core, details] = await Promise.all([readPet(data, type), readPetDetails(data, type)]);
      return { f, core, details };
    }),
  );
  let slow = 0;
  for (const { f, core, details } of results) {
    const s = core.reading.spec;
    if (core.ms > 10_000) slow++;
    console.log(
      `${f}: core ${(core.ms / 1000).toFixed(1)} s ${core.fallback ? `FALLBACK (${core.reason})` : "ok"}, details ${(details.ms / 1000).toFixed(1)} s ${details.fallback ? `FALLBACK (${details.reason})` : "ok"}`,
    );
    console.log(
      `   ${s.species} ${s.build} ${s.size} ${s.furLength} fur | base ${s.baseColor} second ${s.secondaryColor} ${s.markingPattern} ${s.markingCoverage} | ears ${s.earType} tail ${s.tailType} | eyes ${s.eyeColor} | conf ${s.confidence}`,
    );
    console.log(
      `   ${core.reading.nameSuggestions[0]} (${core.reading.personality.join(", ")}) on ${core.reading.islandName}: "${core.reading.greeting}"`,
    );
    console.log(`   mind: ${details.value.mind.persona}`);
    console.log(`   villagers: ${details.value.villagers.map((v) => `${v.name} the ${v.species}`).join(", ")}`);
  }
  console.log(`${results.length} photos, ${slow} core readings over 10 s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
