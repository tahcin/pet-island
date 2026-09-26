import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { BUILDS, DEFAULT_READING, MARKING_PATTERNS, SPECIES, type PetSpec } from "../../src/schema/petReading";
import { MARKING_SIZE, markingTextures, paintMarkings } from "../../src/pet/markingTexture";

const base: PetSpec = { ...DEFAULT_READING.spec, baseColor: "#c8955a", secondaryColor: "#f6f1e7", markingCoverage: 0.5 };

function same(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

function distinctColors(px: Uint8ClampedArray): number {
  const set = new Set<number>();
  for (let i = 0; i < px.length; i += 4) set.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  return set.size;
}

describe("markingTexture", () => {
  it("paints a full opaque 256x256 buffer", () => {
    const px = paintMarkings(base, "body");
    expect(px.length).toBe(MARKING_SIZE * MARKING_SIZE * 4);
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it("solid and socks paint only the base colour", () => {
    for (const markingPattern of ["solid", "socks"] as const) {
      for (const part of ["body", "head"] as const) {
        expect(distinctColors(paintMarkings({ ...base, markingPattern }, part))).toBe(1);
      }
    }
  });

  it("every other pattern paints visible markings", () => {
    for (const markingPattern of MARKING_PATTERNS) {
      if (markingPattern === "solid" || markingPattern === "socks") continue;
      for (const species of SPECIES) {
        for (const build of BUILDS) {
          const spec = { ...base, markingPattern, species, build };
          const colors = distinctColors(paintMarkings(spec, "body")) + distinctColors(paintMarkings(spec, "head"));
          expect(colors, `${markingPattern} ${species} ${build}`).toBeGreaterThan(2);
        }
      }
    }
  });

  it("the secondary colour covers a sensible share for patterned coats", () => {
    const share = (px: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 230) n++;
      return n / (px.length / 4);
    };
    const tux = share(paintMarkings({ ...base, markingPattern: "tuxedo" }, "body"));
    expect(tux).toBeGreaterThan(0.1);
    expect(tux).toBeLessThan(0.7);
    const blaze = share(paintMarkings({ ...base, markingPattern: "blaze" }, "head"));
    expect(blaze).toBeGreaterThan(0.01);
    expect(blaze).toBeLessThan(0.3);
  });

  it("is deterministic and depends on the spec", () => {
    for (const markingPattern of MARKING_PATTERNS) {
      const spec = { ...base, markingPattern };
      expect(same(paintMarkings(spec, "body"), paintMarkings({ ...spec }, "body"))).toBe(true);
      expect(same(paintMarkings(spec, "head"), paintMarkings({ ...spec }, "head"))).toBe(true);
    }
    const a = paintMarkings({ ...base, markingPattern: "spots" }, "body");
    const b = paintMarkings({ ...base, markingPattern: "spots", secondaryColor: "#3a3238" }, "body");
    expect(same(a, b)).toBe(false);
  });

  it("wraps the buffers in cached sRGB DataTextures", () => {
    const t1 = markingTextures({ ...base, markingPattern: "patches" });
    const t2 = markingTextures({ ...base, markingPattern: "patches" });
    expect(t1).toBe(t2);
    expect(t1.body).toBeInstanceOf(THREE.DataTexture);
    expect(t1.body.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(t1.head.image.width).toBe(MARKING_SIZE);
  });
});
