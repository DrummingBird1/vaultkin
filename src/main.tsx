/**
 * @file src/main.tsx
 * React + Vite entry point. Mounts <App/> inside the ErrorBoundary so any
 * crash falls through to a recoverable UI instead of a blank screen.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
