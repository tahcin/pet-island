/**
 * Global graphics quality knobs. Read once at mount by effects and lights.
 * Call setLowQuality() before the Canvas mounts (for example on phones).
 */
export const gfx = {
  grassDensity: 1,
  ambientLife: true,
  shadowMapSize: 4096,
};

export function setLowQuality(): void {
  gfx.grassDensity = 0.35;
  gfx.ambientLife = false;
  gfx.shadowMapSize = 1024;
}
