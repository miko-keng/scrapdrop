import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  X,
  Play,
  Pause,
} from "lucide-react";
import { api, send } from "../api";
import type { Kit } from "./model";
import {
  tutorialSteps,
  validateRecipe,
  RECIPE_VERSION,
  recipeName,
} from "./recipes";
import { PreviewBoundary } from "./PreviewBoundary";
import { CutDiagram } from "./ProjectArt";
import "./tutorial.css";
const Scene = lazy(() => import("./TutorialScene"));
export type MakingTarget = { kind: "job" | "order"; id: string };
export function LearnButton({
  kit,
  target,
}: {
  kit: Kit;
  target?: MakingTarget;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="sd-btn outline" onClick={() => setOpen(true)}>
        <BookOpen size={17} />
        Learn to make this
      </button>
      {open && (
        <Tutorial kit={kit} target={target} close={() => setOpen(false)} />
      )}
    </>
  );
}
function Tutorial({
  kit: initial,
  target,
  close,
}: {
  kit: Kit;
  target?: MakingTarget;
  close: () => void;
}) {
  const [kit, setKit] = useState(initial),
    [step, setStep] = useState(0),
    [completed, setCompleted] = useState<string[]>([]),
    [loading, setLoading] = useState(!!target),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [mode, setMode] = useState<"3d" | "2d">("3d"),
    [paused, setPaused] = useState(false),
    [replay, setReplay] = useState(0),
    [resetView, setResetView] = useState(0),
    [help, setHelp] = useState<any>(null),
    [question, setQuestion] = useState("Explain this step in simpler words."),
    [helpBusy, setHelpBusy] = useState(false),
    [photo, setPhoto] = useState<{ type: "image/jpeg"; data: string } | null>(
      null,
    ),
    [consent, setConsent] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    revision = useRef(0),
    fingerprint = useRef(""),
    queue = useRef(Promise.resolve()),
    broken = useRef(false),
    request = useRef(0);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const steps = tutorialSteps(kit),
    current = steps[step],
    validation = validateRecipe(kit),
    supported = (kit.recipeVersion || 1) === RECIPE_VERSION;
  useEffect(() => {
    const d = dialog.current,
      previous = document.activeElement as HTMLElement;
    d?.showModal();
    const media = matchMedia("(prefers-reduced-motion: reduce)"),
      change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => {
      d?.close();
      previous?.focus();
      media.removeEventListener("change", change);
    };
  }, []);
  useEffect(() => {
    if (!target) return;
    let gone = false;
    api("/scrapdrop/learning/" + target.kind + "/" + target.id)
      .then((r: any) => {
        if (gone) return;
        setKit(r.kit);
        revision.current = r.progress.revision;
        fingerprint.current = r.fingerprint;
        setCompleted(r.progress.completed);
        setStep(
          Math.max(
            0,
            tutorialSteps(r.kit).findIndex((s) => s.id === r.progress.stepId),
          ),
        );
        setStatus("Saved progress loaded.");
      })
      .catch((e) => {
        if (!gone) {
          setError(e.message);
          broken.current = true;
        }
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => {
      gone = true;
    };
  }, []);
  function persist(index: number, done: string[]) {
    if (!target || loading || broken.current) return;
    const stepId = steps[index].id;
    setStatus("Saving progress…");
    queue.current = queue.current.then(async () => {
      if (broken.current) return;
      try {
        const r = await api(
          "/scrapdrop/learning/" +
            target!.kind +
            "/" +
            target!.id +
            "/progress",
          {
            method: "PUT",
            body: JSON.stringify({
              revision: revision.current,
              fingerprint: fingerprint.current,
              stepId,
              completed: done,
            }),
          },
        );
        revision.current = r.revision;
        setStatus("Progress saved.");
      } catch (e) {
        broken.current = true;
        setError(
          (e as Error).message +
            " Close and reopen this guide to reload saved progress.",
        );
      }
    });
  }
  function go(next: number) {
    if (!supported) return;
    next = Math.max(0, Math.min(steps.length - 1, next));
    request.current++;
    setHelp(null);
    setStep(next);
    persist(next, completed);
  }
  async function choosePhoto(file?: File) {
    if (!file) return;
    const seq = ++request.current;
    setPhoto(null);
    setConsent(false);
    setHelp(null);
    setError("");
    try {
      if (
        file.size > 2 * 1024 * 1024 ||
        !["image/jpeg", "image/png"].includes(file.type)
      )
        throw Error("Choose a JPEG or PNG under 2 MB.");
      const bitmap = await createImageBitmap(file),
        scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL("image/jpeg", 0.75).split(",")[1];
      if (data.length > 1300000) throw Error("Use a smaller image.");
      if (request.current === seq) setPhoto({ type: "image/jpeg", data });
    } catch (e) {
      if (request.current === seq) setError((e as Error).message);
    }
  }
  async function ask() {
    const seq = ++request.current;
    setHelpBusy(true);
    setError("");
    try {
      const r = await send("/scrapdrop/tutorial/help", {
        ...(target ? { target } : { input: kit.batch?.input }),
        stepId: current.id,
        question,
        ...(photo ? { photo, consent } : {}),
      });
      if (request.current === seq) setHelp(r);
    } catch (e) {
      if (request.current === seq) setError((e as Error).message);
    } finally {
      setHelpBusy(false);
    }
  }
  const stock = kit.batch?.plan.allocations || [];
  return createPortal(
    <dialog
      ref={dialog}
      className="sd-tutorial"
      aria-labelledby="sd-tutorial-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (
          ["INPUT", "TEXTAREA", "SELECT"].includes(
            (e.target as HTMLElement).tagName,
          )
        )
          return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(step + 1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(step - 1);
        }
      }}
    >
      <header className="sd-tut-header">
        <div>
          <span>YOUR MAKING COMPANION · RECIPE {kit.recipeVersion || 1}</span>
          <h1 id="sd-tutorial-title">
            Make your {recipeName(kit.template.id)}.
          </h1>
        </div>
        <button aria-label="Close tutorial" className="sd-icon" onClick={close}>
          <X />
        </button>
      </header>
      <p>
        {kit.config.quantity} planned · {kit.finished.join(" × ")} mm · Geometry{" "}
        {validation.valid ? "checked" : "needs review"} · Physical trial pending
      </p>
      {!supported && (
        <p role="alert">
          This recipe version needs its original printable guide. 3D teaching is
          unavailable.
        </p>
      )}
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {kit.batch && !kit.batch.plan.stockReady && (
        <p className="sd-batch-warning">
          Draft tutorial: required materials are missing. Preview the method,
          then resolve the material plan before making.
        </p>
      )}
      {supported ? (
        <>
          <div className="sd-tut-layout">
            <section>
              <div className="sd-tut-view-switch">
                <button
                  aria-pressed={mode === "3d"}
                  onClick={() => setMode("3d")}
                >
                  3D steps
                </button>
                <button
                  aria-pressed={mode === "2d"}
                  onClick={() => setMode("2d")}
                >
                  2D cutting guide
                </button>
              </div>
              {mode === "3d" && supported && validation.valid ? (
                <PreviewBoundary
                  fallback={<CutDiagram kit={kit} />}
                  onFailure={() => {
                    setMode("2d");
                    setStatus(
                      "3D could not load. Your measured 2D guide and saved steps are still available.",
                    );
                  }}
                >
                  <Suspense fallback={<p>Preparing your fold sequence…</p>}>
                    <Scene
                      kit={kit}
                      step={step}
                      replay={replay}
                      resetView={resetView}
                      paused={paused}
                      reduced={reduced}
                      onFailure={() => {
                        setMode("2d");
                        setStatus(
                          "3D is unavailable here. The full 2D guide remains usable.",
                        );
                      }}
                    />
                  </Suspense>
                </PreviewBoundary>
              ) : (
                <CutDiagram kit={kit} />
              )}
              <div className="sd-tut-actions">
                <button
                  className="sd-btn small outline"
                  onClick={() => setReplay((v) => v + 1)}
                >
                  <RotateCcw size={15} />
                  Replay step
                </button>
                <button
                  className="sd-btn small outline"
                  onClick={() => setResetView((v) => v + 1)}
                >
                  Reset view
                </button>
                <button
                  className="sd-btn small outline"
                  onClick={() => setPaused((v) => !v)}
                >
                  {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
                  {paused ? "Play motion" : "Pause motion"}
                </button>
                <button
                  className="sd-btn small outline"
                  onClick={() => window.print()}
                >
                  Print all steps
                </button>
              </div>
              <small>
                {reduced
                  ? "Reduced motion: steps jump to their final position."
                  : "Drag to rotate; scroll to zoom. Motion illustrates the authored recipe."}{" "}
                Batch colors may vary; the first allocated sheet/ribbon provides
                the reference colors.
              </small>
            </section>
            <section className="sd-tut-step">
              <span>
                STEP {step + 1} OF {steps.length}
              </span>
              <h2>{current.title}</h2>
              <p>{current.action}</p>
              <p>
                <b>Tools now:</b> {current.tools.join(", ") || "Your hands"}
              </p>
              <p className="sd-tut-tip">{current.tip}</p>
              <p>
                <b>Batch rhythm:</b> Repeat this operation across{" "}
                {kit.config.quantity} pieces where practical. Drying and
                collection are extra.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={completed.includes(current.id)}
                  disabled={loading}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...completed, current.id]
                      : completed.filter((s) => s !== current.id);
                    setCompleted(next);
                    persist(step, next);
                  }}
                />{" "}
                I completed this step
              </label>
              <div className="sd-tut-actions">
                <button
                  className="sd-btn outline"
                  disabled={step === 0 || loading}
                  onClick={() => go(step - 1)}
                >
                  <ArrowLeft size={15} />
                  Back
                </button>
                <button
                  className="sd-btn"
                  disabled={step === steps.length - 1 || loading}
                  onClick={() => go(step + 1)}
                >
                  Next
                  <ArrowRight size={15} />
                </button>
              </div>
              <nav className="sd-tut-dots" aria-label="Tutorial steps">
                {steps.map((s, i) => (
                  <button
                    key={s.id}
                    aria-current={i === step ? "step" : undefined}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    disabled={loading}
                    onClick={() => go(i)}
                  >
                    {completed.includes(s.id) ? "✓" : i + 1}
                  </button>
                ))}
              </nav>
              <p role="status">
                {loading
                  ? "Loading your saved recipe…"
                  : target
                    ? status
                    : "Preview only. Save a making plan or purchase materials to keep progress with that plan."}
              </p>
            </section>
          </div>
          <details className="sd-tut-materials" open={step === 0}>
            <summary>Your actual material allocation</summary>
            {stock.map((a) => (
              <p key={a.source + a.itemId}>
                <b>
                  {a.source === "owned" ? "YOURS" : "SHOP"} · {a.name}
                </b>{" "}
                — {a.units} whole {a.type === "ribbon" ? "segments" : "sheets"},{" "}
                {a.width} × {a.length} mm → {a.projects} project pieces
              </p>
            ))}
            <p>
              Tools to arrange separately:{" "}
              {kit.batch?.plan.toolsToGet?.join(", ") || "None recorded"}. Tools
              are not included in the purchase.
            </p>
          </details>
          <details className="sd-tut-help">
            <summary>Explain this step / troubleshoot</summary>
            <label>
              Your question
              <textarea
                value={question}
                maxLength={600}
                onChange={(e) => {
                  request.current++;
                  setHelp(null);
                  setQuestion(e.target.value);
                }}
              />
            </label>
            <label>
              Optional photo · JPEG/PNG, up to 2 MB
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(e) => choosePhoto(e.target.files?.[0])}
              />
            </label>
            <small>
              The photo stays in this browser until you ask. Images are resized
              and metadata removed; the server does not store the image.
            </small>
            {photo && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  Share this photo for uncertain visual suggestions when AI is
                  enabled
                </label>
                <button
                  className="sd-text"
                  onClick={() => {
                    request.current++;
                    setPhoto(null);
                    setConsent(false);
                    setHelp(null);
                  }}
                >
                  Remove photo
                </button>
              </>
            )}
            <button
              className="sd-btn outline"
              disabled={
                helpBusy ||
                question.trim().length < 3 ||
                (!!photo && !consent) ||
                !kit.batch
              }
              onClick={ask}
            >
              {helpBusy ? "Reading the recipe…" : "Explain this step"}
            </button>
            {help && (
              <div role="status">
                <b>
                  {help.source === "ai"
                    ? "Gemini recipe help"
                    : help.source === "fixture"
                      ? "Local recipe help"
                      : "Authored fallback guidance"}
                  {help.cached ? " · cached" : ""}
                </b>
                <p>{help.answer}</p>
                <ul>
                  {help.checks.map((c: string) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <small>
                  {help.notice}
                  {help.uncertain
                    ? " Verify your piece yourself; this is not a pass/fail inspection."
                    : ""}
                </small>
              </div>
            )}
          </details>
          <section className="sd-tut-print-all">
            <h2>All making steps</h2>
            <CutDiagram kit={kit} />
            <ol>
              {steps.map((s) => (
                <li key={s.id}>
                  <h3>{s.title}</h3>
                  <p>{s.action}</p>
                  <p>{s.tip}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <section>
          <h2>Original saved instructions</h2>
          <CutDiagram kit={kit} />
          <ol>
            {kit.template.guide.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ol>
          <button className="sd-btn" onClick={() => window.print()}>
            Print original guide
          </button>
        </section>
      )}
    </dialog>,
    document.body,
  );
}
