import { api, send } from "../../api";
import { lazy, Suspense, useState, useEffect } from "react";
import { useReducedMotion } from "motion/react";
import { PreviewBoundary } from "../PreviewBoundary";
import type { Plan, Recipe } from "./engine";
const Scene = lazy(() => import("./RecipeScene"));
export function RecipeDiagram({
  recipe,
  selected,
}: {
  recipe: Recipe;
  selected?: string;
}) {
  return (
    <svg
      className="mfg-net"
      viewBox={`-12 -16 ${recipe.blank.width + 24} ${recipe.blank.length + 32}`}
      role="img"
      aria-label={`${recipe.product.name} cutting net ${recipe.blank.width} by ${recipe.blank.length} millimetres`}
    >
      {recipe.panels.map((p) => (
        <g key={p.id}>
          <rect
            x={p.x}
            y={p.y}
            width={p.width}
            height={p.length}
            fill={selected === p.id ? "#c4d98b" : p.tab ? "#e4cfaa" : "#eee9da"}
            stroke="#354e40"
            strokeWidth=".7"
          />
          <text
            x={p.x + p.width / 2}
            y={p.y + p.length / 2}
            textAnchor="middle"
            fontSize={Math.min(5, p.length / 3)}
          >
            {p.label}
          </text>
        </g>
      ))}
      {recipe.folds.map((y) => (
        <path
          key={y}
          d={`M0 ${y} H${recipe.blank.width}`}
          stroke="#b04a2e"
          strokeDasharray="3 2"
          strokeWidth="1"
        />
      ))}
      {recipe.holes.map((h, i) => (
        <circle
          key={i}
          cx={h.x}
          cy={h.y}
          r={h.radius}
          fill="white"
          stroke="#354e40"
          strokeWidth=".6"
        />
      ))}
      <text x={recipe.blank.width / 2} y={-5} textAnchor="middle" fontSize="5">
        {recipe.blank.width} mm wide × {recipe.blank.length} mm long
      </text>
    </svg>
  );
}
export function ManufacturingGuide({
  plan,
  initial,
  save,
  jobId,
}: {
  plan: Plan;
  initial?: { product: number; step: number };
  jobId?: string;
  save?: (p: { product: number; step: number }) => Promise<void>;
}) {
  const [product, setProduct] = useState(initial?.product || 0),
    [step, setStep] = useState(initial?.step || 0),
    [replay, setReplay] = useState(0),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [part, setPart] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
  const reduced = !!useReducedMotion();
  const r = plan.recipes[product] || plan.recipes[0],
    s = r.steps[Math.min(step, r.steps.length - 1)],
    allocation = plan.sheets.find((sh) =>
      sh.placements.some((p) => p.productId === r.product.id),
    );
  return (
    <section className="mfg-guide">
      <div className="mfg-section-head">
        <div>
          <span className="sd-kicker">YOUR MEASURED MAKING GUIDE</span>
          <h2>Learn to make this.</h2>
        </div>
        <button className="sd-btn outline" onClick={() => window.print()}>
          Print 2D guide
        </button>
      </div>
      <label>
        Product
        <select
          value={product}
          onChange={(e) => {
            setProduct(+e.target.value);
            setStep(0);
            setPart("");
          }}
        >
          {plan.recipes.map((r, i) => (
            <option key={r.product.id} value={i}>
              {r.product.quantity} × {r.product.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Recipe v{r.version} · {r.product.family} construction ·{" "}
        <strong>Prototype: first physical trial pending</strong>
      </p>
      <div className="mfg-inspect-grid">
        <div>
          <div className="mfg-preview">
            <PreviewBoundary
              fallback={<RecipeDiagram recipe={r} selected={part} />}
            >
              <Suspense fallback={<p>Loading assembly…</p>}>
                {failed ? (
                  <RecipeDiagram recipe={r} selected={part} />
                ) : (
                  <Scene
                    recipe={r}
                    color={allocation?.color || plan.input.color}
                    thickness={plan.input.thickness}
                    fold={s.fold}
                    replay={replay}
                    reduced={reduced}
                    selected={part}
                    onFailure={() => setFailed(true)}
                  />
                )}
              </Suspense>
            </PreviewBoundary>
          </div>
          <div className="mfg-actions">
            <button
              className="sd-btn small outline"
              onClick={() => setReplay((n) => n + 1)}
            >
              Replay / reset camera
            </button>
            <button className="sd-text" onClick={() => setFailed((v) => !v)}>
              {failed ? "Try 3D" : "Use 2D"}
            </button>
          </div>
          <small>
            Drag to inspect.{" "}
            {reduced
              ? "Reduced motion: final pose shown."
              : "Hinges follow the shared cutting recipe."}{" "}
            Allocated material colors can vary across units.
          </small>
        </div>
        <div>
          <RecipeDiagram recipe={r} selected={part} />
          <div className="mfg-parts">
            {r.panels.map((p) => (
              <button
                key={p.id}
                aria-pressed={part === p.id}
                onClick={() => setPart(p.id)}
              >
                {p.label} · {p.width} × {p.length} mm
              </button>
            ))}
          </div>
          <small>
            Solid outline: cut. Dashed red: score/fold. Screen/print scaling is
            not calibrated; measure with a ruler.
          </small>
        </div>
      </div>
      <div className="mfg-step" aria-live="polite">
        <span>
          Step {step + 1} of {r.steps.length}
        </span>
        <progress value={step + 1} max={r.steps.length} />
        <h3>{s.title}</h3>
        <p>{s.action}</p>
        <p>
          <strong>Tools:</strong> {s.tools.join(", ") || "None for this step"}
        </p>
        <p>
          <strong>Material:</strong> {plan.input.thickness} mm card.{" "}
          {plan.sheets
            .filter((sh) =>
              sh.placements.some((p) => p.productId === r.product.id),
            )
            .map((sh) => `${sh.source}: ${sh.name}`)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join("; ")}
          .
        </p>
        <div className="mfg-actions">
          <button
            className="sd-btn outline"
            disabled={step === 0}
            onClick={() => setStep((n) => n - 1)}
          >
            Back
          </button>
          <button
            className="sd-btn"
            disabled={step === r.steps.length - 1}
            onClick={() => setStep((n) => n + 1)}
          >
            Next step
          </button>
          {save && (
            <button
              className="sd-text"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await save({ product, step });
                  setNotice("Progress saved.");
                } catch (e) {
                  setNotice((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save progress
            </button>
          )}
        </div>
        <p role="status">{notice}</p>
        {jobId && (
          <details>
            <summary>Explain this step / troubleshoot</summary>
            <label>
              Your question
              <input
                value={question}
                maxLength={600}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="I folded this panel the wrong way…"
              />
            </label>
            <button
              className="sd-btn outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await send(
                    `/scrapdrop/manufacturing/jobs/${jobId}/explain`,
                    {
                      product,
                      step,
                      question:
                        question.trim() ||
                        "Explain this current making step and its common mistakes.",
                    },
                  );
                  setAnswer(
                    `${r.source}${r.cached ? " · cached" : ""}: ${r.answer}`,
                  );
                } catch (e) {
                  setAnswer((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Explain this step
            </button>
            <p role="status">{answer}</p>
          </details>
        )}
      </div>
      <details>
        <summary>All steps · printable fallback</summary>
        {plan.recipes.map((r) => (
          <article key={r.product.id}>
            <h3>
              {r.product.quantity} × {r.product.name}
            </h3>
            <RecipeDiagram recipe={r} />
            <ol>
              {r.steps.map((s) => (
                <li key={s.title}>
                  <strong>{s.title}.</strong> {s.action} Tools:{" "}
                  {s.tools.join(", ")}.
                </li>
              ))}
            </ol>
          </article>
        ))}
      </details>
    </section>
  );
}
export function SheetDiagrams({
  plan,
  operator = false,
}: {
  plan: Plan;
  operator?: boolean;
}) {
  return (
    <div className="mfg-sheets">
      {plan.sheets
        .filter((s) => !operator || s.source === "shop")
        .map((s) => (
          <article key={s.id}>
            <h4>
              {s.source === "owned" ? "Your sheet" : "Purchase"} · {s.name}
            </h4>
            <small>
              {s.width} × {s.length} mm · {s.id}
            </small>
            <svg
              viewBox={`0 0 ${s.width} ${s.length}`}
              role="img"
              aria-label={`${s.source} sheet with ${s.placements.length} blanks`}
            >
              <rect
                width={s.width}
                height={s.length}
                fill={s.color}
                opacity=".3"
              />
              {s.placements.map((p) => (
                <g key={p.partId}>
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.length}
                    fill="#fffdf2"
                    stroke="#2b4c39"
                    strokeWidth="1"
                  />
                  <text x={p.x + 2} y={p.y + 7} fontSize="5">
                    {p.productId} · {p.rotated ? "rotated" : ""}
                  </text>
                </g>
              ))}
            </svg>
            <p>
              {s.placements
                .map((p) => `${p.partId}: ${p.width} × ${p.length} mm`)
                .join("; ")}
            </p>
          </article>
        ))}
    </div>
  );
}
export function ManufacturingOrderGuide({
  jobId,
  plan,
}: {
  jobId?: string;
  plan: Plan;
}) {
  const [saved, setSaved] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (jobId)
      void api(`/scrapdrop/manufacturing/jobs/${jobId}`)
        .then(setSaved)
        .catch((e) => setError(e.message));
  }, [jobId]);
  return (
    <div className="mfg-workspace">
      <ManufacturingGuide
        key={saved?.id || "preview"}
        plan={plan}
        jobId={saved?.id}
        initial={saved?.progress}
        save={
          saved
            ? async (progress) => {
                setSaved(
                  await api(
                    `/scrapdrop/manufacturing/jobs/${saved.id}/progress`,
                    {
                      method: "PUT",
                      body: JSON.stringify({
                        ...progress,
                        revision: saved.revision,
                      }),
                    },
                  ),
                );
              }
            : undefined
        }
      />
      <SheetDiagrams plan={plan} />
      {error && <p role="alert">{error}</p>}
      <p>
        <a href="/production">
          Open saved production jobs to record actual results after collection →
        </a>
      </p>
    </div>
  );
}
