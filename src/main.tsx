import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyStatusBarStyle } from "./platform";
import "@fontsource-variable/inter";
import "@fontsource-variable/unbounded";
import "./theme/index.css";

applyStatusBarStyle();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
