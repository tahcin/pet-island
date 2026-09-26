import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./ui/styles.css";
import { applyDevRoute } from "./ui/devRoutes";

applyDevRoute();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
