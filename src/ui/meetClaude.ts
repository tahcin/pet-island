import { CLAUDE_READING } from "../pet/mascot";
import { randomSeed, seedFromLocation, useGame } from "../store";
import { cancelReading } from "./readingFlow";

/** No photo path: skip the reading and go straight to the reveal with the Claude mascot. */
export function meetClaude(): void {
  cancelReading();
  const game = useGame.getState();
  game.setPhoto(null);
  game.setReading(CLAUDE_READING);
  game.setSeed(seedFromLocation() ?? randomSeed());
  useGame.setState({ detailsReady: true });
  game.setScreen("reveal");
}
