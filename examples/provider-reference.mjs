/** Runnable provider example. Credentials stay on this server, never in browser code. */
import express from "express";
import { randomBytes } from "node:crypto";
const app = express();
app.use(express.json({ limit: "32kb" }));
const platform = process.env.TASKSLICE_URL || "http://127.0.0.1:4317";
const credential = process.env.TASKSLICE_PROVIDER_KEY;
if (!credential) {
  console.error("Set TASKSLICE_PROVIDER_KEY to your own provider credential.");
  process.exit(1);
}
const sessions = new Map();
async function verify(token, operation) {
  const response = await fetch(platform + "/api/market/provider/verify", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, operation }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  return { ok: response.ok, ...body };
}
app.post("/taskslice/contract", async (req, res) => {
  try {
    const { token = "", requestKey = "", input } = req.body;
    if (
      typeof input !== "string" ||
      input.length > 1000 ||
      typeof token !== "string" ||
      typeof requestKey !== "string" ||
      !requestKey
    )
      return res.status(400).json({ allowed: false });
    const access = await verify(token, requestKey);
    if (!access.ok || !access.allowed)
      return res.status(403).json({ allowed: false });
    res.json({
      allowed: true,
      repeated: access.repeated,
      output: input.toUpperCase(),
    });
  } catch {
    res
      .status(503)
      .json({ allowed: false, error: "The platform could not be reached." });
  }
});
app.get("/taskslice/launch", async (req, res) => {
  try {
    const response = await fetch(platform + "/api/market/provider/exchange", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: req.query.code }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json();
    if (!response.ok || !body.allowed)
      return res.status(403).send("Access is missing, expired or revoked.");
    const session = randomBytes(24).toString("hex");
    sessions.set(session, { token: body.token, expires: Date.now() + 3600000 });
    res.setHeader(
      "Set-Cookie",
      `ref_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${new URL(platform).protocol === "https:" ? "; Secure" : ""}`,
    );
    res.redirect("/");
  } catch {
    res.status(503).send("The platform could not be reached.");
  }
});
app.get("/", (_req, res) =>
  res
    .type("html")
    .send(
      `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TaskSlice provider reference</title><style>body{font:16px system-ui;max-width:650px;margin:60px auto;padding:25px;color:#294738}textarea{width:100%;height:100px}button{padding:12px;margin:15px 0}pre{white-space:pre-wrap}</style><h1>A small application. A real integration.</h1><p>This reference converts text to uppercase. Trial the public example below; paid use is checked server-side. It is a technical integration example, not one of the marketplace's paid reference products.</p><textarea id="input" aria-label="Text to convert">A little know-how goes a long way.</textarea><button id="trial">Try free preview</button><button id="paid">Use protected operation</button><pre id="result" role="status"></pre><script>const input=document.querySelector('#input'),result=document.querySelector('#result');document.querySelector('#trial').onclick=()=>result.textContent=input.value.toUpperCase();document.querySelector('#paid').onclick=async()=>{try{const r=await fetch('/protected',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:input.value,requestKey:crypto.randomUUID()})});result.textContent=JSON.stringify(await r.json(),null,2);}catch{result.textContent='Request failed';}};</script></html>`,
    ),
);
app.post("/protected", async (req, res) => {
  if (
    req.headers.origin &&
    req.headers.origin !==
      `http://127.0.0.1:${process.env.PROVIDER_PORT || 4418}`
  )
    return res.status(403).json({ allowed: false });
  const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("ref_session="))
      ?.slice(12),
    session = sessions.get(cookie);
  if (!session || session.expires < Date.now())
    return res
      .status(403)
      .json({
        allowed: false,
        error: "Launch through TaskSlice with an active purchase.",
      });
  try {
    const access = await verify(session.token, req.body.requestKey);
    if (!access.allowed) return res.status(403).json({ allowed: false });
    if (typeof req.body.input !== "string" || req.body.input.length > 1000)
      return res.status(400).json({ allowed: false });
    res.json({
      allowed: true,
      repeated: access.repeated,
      output: req.body.input.toUpperCase(),
    });
  } catch {
    res.status(503).json({ allowed: false });
  }
});
app.listen(Number(process.env.PROVIDER_PORT || 4418), "127.0.0.1", () =>
  console.log("Provider reference ready on its configured loopback port."),
);
