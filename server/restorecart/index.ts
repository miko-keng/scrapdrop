import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import express from "express";
import { createApp } from "./app";

const production = process.env.NODE_ENV === "production",
  port = Number(
    process.env.RESTORECART_PORT ||
      (production ? process.env.PORT : undefined) ||
      4370,
  );
const base = (
  process.env.RESTORECART_BASE_URL || `http://127.0.0.1:${port}`
).replace(/\/+$/, "");
if (
  production &&
  (!process.env.RESTORECART_BASE_URL?.startsWith("https://") ||
    !process.env.RESTORECART_SELLER_PASSWORD)
)
  throw Error(
    "Hosted RestoreCart requires RESTORECART_BASE_URL (HTTPS) and RESTORECART_SELLER_PASSWORD.",
  );
const runtime = createApp({ base });
const { app } = runtime;
app.get("/", (_req, res) => res.redirect("/restorecart"));
const brandHTML = (html: string) =>
  html
    .replace(
      /<title>.*?<\/title>/s,
      "<title>RestoreCart — Keep your business moving</title>",
    )
    .replace(
      /content="Turn leftover[^\"]*"/,
      'content="Reconstruct your catalog, open a rescue shop and keep your business moving with PayPal sandbox."',
    )
    .replace('href="/favicon.svg"', 'href="/restorecart.svg"');
if (production) {
  app.use(express.static(resolve("dist")));
  app.get(/^\/(restorecart|s)(\/.*)?$/, (_req, res) =>
    res
      .type("html")
      .send(brandHTML(readFileSync(resolve("dist/index.html"), "utf8"))),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get(/^\/(restorecart|s)(\/.*)?$/, async (req, res, next) => {
    try {
      res
        .type("html")
        .send(
          await vite.transformIndexHtml(
            req.originalUrl,
            brandHTML(readFileSync(resolve("index.html"), "utf8")),
          ),
        );
    } catch (e) {
      next(e);
    }
  });
}
app.use((_req, res) =>
  res.status(404).type("text").send("Page not found. Open /restorecart."),
);
const server = app.listen(port, production ? "0.0.0.0" : "127.0.0.1", () =>
  console.log(`RestoreCart ready at ${base}/restorecart (PayPal sandbox only)`),
);
const timer = setInterval(() => void runtime.tick().catch(() => {}), 15000);
timer.unref();
void runtime.tick();
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    clearInterval(timer);
    server.close(() => {
      runtime.db.close();
      process.exit(0);
    });
  });
