import React from "react";
import { createRoot } from "react-dom/client";
import { lazy, Suspense } from "react";
const App = lazy(() => import("./scrapdrop/ScrapDropApp"));
const RestoreCart = lazy(() => import("./restorecart/RestoreCartApp"));
const restorecart =
  location.pathname.startsWith("/restorecart") ||
  location.pathname.startsWith("/s/");
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
const root =
  import.meta.hot?.data.root ?? createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <Suspense
      fallback={<p>Opening {restorecart ? "RestoreCart" : "ScrapDrop"}…</p>}
    >
      {restorecart ? <RestoreCart /> : <App />}
    </Suspense>
  </React.StrictMode>,
);
