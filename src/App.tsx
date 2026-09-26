import { useGame } from "./store";
import Landing from "./ui/Landing";
import Reading from "./ui/Reading";
import Reveal from "./ui/Reveal";
import Play from "./ui/Play";

export default function App() {
  const screen = useGame((s) => s.screen);
  switch (screen) {
    case "landing":
      return <Landing />;
    case "reading":
      return <Reading />;
    case "reveal":
      return <Reveal />;
    default:
      return <Play />;
  }
}
