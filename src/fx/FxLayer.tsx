import type { WorldData } from "../world/generateWorld";
import Grass from "./Grass";
import Clouds from "./Clouds";

/** All decorative world effects, mounted once from WorldExtras. Each reads gfx for quality. */
export default function FxLayer({ world }: { world: WorldData }) {
  return (
    <group name="fx">
      <Grass world={world} />
      <Clouds />
    </group>
  );
}
