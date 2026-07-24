import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { CommitPassProvider } from "./state/CommitPassProvider";
import "./styles.css";

const Router =
  window.location.pathname.startsWith("/app/") ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <CommitPassProvider>
        <App />
      </CommitPassProvider>
    </Router>
  </StrictMode>,
);
