import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css?v=20261007b";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
