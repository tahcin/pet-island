import { useGame } from "./store";
import Reveal from "./ui/Reveal";
import Play from "./ui/Play";

export default function App() {
  const screen = useGame((s) => s.screen);
  if (screen === "reveal") return <Reveal />;
  return <Play />;
}
