import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import {
  assertContractConfiguration,
  readRuntimeConfig,
  type RuntimeEnvironment,
} from "./lib/config";
import { PUBLIC_TESTNET_CONFIG } from "./lib/seed";
import { CommitPassProvider } from "./state/CommitPassProvider";
import "./styles.css";

const Router =
  window.location.pathname.startsWith("/app/") ? HashRouter : BrowserRouter;
const viteEnvironment = (
  import.meta as ImportMeta & { readonly env: RuntimeEnvironment }
).env;
const runtimeConfig = readRuntimeConfig(viteEnvironment, PUBLIC_TESTNET_CONFIG);
assertContractConfiguration(runtimeConfig);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <CommitPassProvider runtimeConfig={runtimeConfig}>
        <App />
      </CommitPassProvider>
    </Router>
  </StrictMode>,
);
