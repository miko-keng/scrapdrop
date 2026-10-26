import { useState } from "react";
import { api } from "../api";
import { money, type Kit } from "./model";
import { economics, emptyEconomics, type EconomicsInput } from "./production";
import type { MakingTarget } from "./Tutorial";
import "./tutorial.css";
const costLabels: Record<keyof EconomicsInput, string> = {
  sellingPrice: "Selling price per good unit (USD)",
  hourlyRate: "Labor rate per hour (USD)",
  ownedMaterialCost: "Cost of owned materials used (USD)",
  consumables: "Glue and other consumables (USD)",
  overhead: "Other batch overhead (USD)",
  paymentFees: "Payment or selling fees (USD)",
};
function EconomicsFields({
  value,
  change,
}: {
  value: EconomicsInput;
  change: (v: EconomicsInput) => void;
}) {
  return (
    <div className="sd-production-grid">
      {(Object.keys(costLabels) as (keyof EconomicsInput)[]).map((key) => (
        <label key={key}>
          {costLabels[key]}
          <input
            type="number"
            min="0"
            max="100000"
            step="0.01"
            value={value[key] / 100}
            onChange={(e) =>
              change({
                ...value,
                [key]: Math.round(Number(e.target.value) * 100),
              })
            }
          />
        </label>
      ))}
    </div>
  );
}
function EconomicSummary({
  kit,
  value,
  actual,
}: {
  kit: Kit;
  value: EconomicsInput;
  actual?: { completed: number; minutes: number };
}) {
  const s = economics(kit, value, actual);
  return (
    <>
      <div className="sd-economics">
        <span>
          Revenue<strong>{money(s.revenue)}</strong>
        </span>
        <span>
          Batch cost incl. labor<strong>{money(s.cost)}</strong>
        </span>
        <span>
          Contribution before tax<strong>{money(s.contribution)}</strong>
        </span>
        <span>
          Cost per good unit
          <strong>
            {s.perGoodUnit === null ? "No good units" : money(s.perGoodUnit)}
          </strong>
        </span>
      </div>
      <small>
        Estimates use your entered costs; zero means excluded, not proven free.
        Includes {money(kit.total)} of shop materials/service. Owned-material
        cash avoided ({money(s.cashAvoided)}) is a separate comparison and is
        not profit. Drying, travel and tax are not inferred.
      </small>
    </>
  );
}
export function BatchEconomics({ kit }: { kit: Kit }) {
  const [v, setV] = useState<EconomicsInput>({ ...emptyEconomics });
  return (
    <details className="sd-production">
      <summary>What could this batch earn?</summary>
      <p>
        Enter a selling price and your real costs. These estimates do not change
        the material checkout price.
      </p>
      <EconomicsFields value={v} change={setV} />
      <EconomicSummary kit={kit} value={v} />
    </details>
  );
}
export function ProductionResults({
  kit,
  target,
  onSaved,
}: {
  kit: Kit;
  target: MakingTarget;
  onSaved?: () => void;
}) {
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [completed, setCompleted] = useState(kit.config.quantity),
    [spoiled, setSpoiled] = useState(0),
    [minutes, setMinutes] = useState(kit.batch?.plan.estimatedMinutes || 1),
    [notes, setNotes] = useState(""),
    [cost, setCost] = useState<EconomicsInput>({ ...emptyEconomics }),
    [offcuts, setOffcuts] = useState<
      {
        sourceId: string;
        name: string;
        width: number;
        length: number;
        quantity: number;
      }[]
    >([]),
    [credited, setCredited] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const allocations = kit.batch?.plan.allocations || [],
    sources = allocations.filter((a) =>
      a.type === "ribbon" ? a.remainingLength > 0 : a.remainingArea > 0,
    );
  async function load() {
    if (loaded || busy) return;
    setBusy(true);
    try {
      const r = await api(
        "/scrapdrop/learning/" + target.kind + "/" + target.id,
      );
      if (r.result) {
        const v = r.result;
        setRevision(v.revision);
        setCompleted(v.completed);
        setSpoiled(v.spoiled);
        setMinutes(v.minutes);
        setNotes(v.notes);
        setCost(v.economics);
        setOffcuts(v.offcuts);
        setCredited(v.credited);
        setStatus(
          v.finalize ? "Finished results loaded." : "Draft results loaded.",
        );
      }
      setLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(finalize: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api(
        "/scrapdrop/learning/" + target.kind + "/" + target.id + "/results",
        {
          method: "PUT",
          body: JSON.stringify({
            revision,
            completed,
            spoiled,
            minutes,
            notes,
            economics: cost,
            offcuts,
            finalize,
          }),
        },
      );
      setRevision(r.revision);
      setCredited(r.credited);
      setStatus(
        finalize
          ? "Results saved. Whole used units were deducted once and measured offcuts credited once."
          : "Draft results saved. Inventory has not changed.",
      );
      onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="sd-production"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>Record what you actually made</summary>
      {!loaded ? (
        <p>
          {busy
            ? "Loading your private making record…"
            : error || "Open this section to load your record."}
        </p>
      ) : (
        <>
          <p>
            Planned: {kit.config.quantity} pieces and{" "}
            {kit.batch?.plan.estimatedMinutes} hands-on minutes. Record good
            pieces, spoiled pieces and actual hands-on time. Drying and travel
            are extra.
          </p>
          <div className="sd-production-grid">
            <label>
              Good pieces completed
              <input
                type="number"
                min="0"
                max={kit.config.quantity}
                value={completed}
                onChange={(e) => setCompleted(Number(e.target.value))}
              />
            </label>
            <label>
              Spoiled pieces
              <input
                type="number"
                min="0"
                max={kit.config.quantity}
                value={spoiled}
                onChange={(e) => setSpoiled(Number(e.target.value))}
              />
            </label>
            <label>
              Actual hands-on minutes
              <input
                type="number"
                min="1"
                max="100000"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </div>
          <p>
            Time difference: {minutes - (kit.batch?.plan.estimatedMinutes || 0)}{" "}
            minutes versus the estimate. Good yield:{" "}
            {Math.round((completed / kit.config.quantity) * 100)}% of the
            planned batch.
          </p>
          <EconomicsFields value={cost} change={setCost} />
          <EconomicSummary
            kit={kit}
            value={cost}
            actual={{ completed, minutes }}
          />
          <label>
            Making notes
            <textarea
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <h3>Measured reusable offcuts</h3>
          <p>
            Measure usable rectangles or unbroken ribbon yourself. Remaining
            area in the drawing includes margins and is not automatically
            reusable stock. Finalizing credits these lots once.
          </p>
          {offcuts.map((o, i) => (
            <div key={i} className="sd-offcut-row">
              <label>
                Original allocated material
                <select
                  disabled={credited}
                  value={o.sourceId}
                  onChange={(e) =>
                    setOffcuts((v) =>
                      v.map((x, j) =>
                        j === i ? { ...x, sourceId: e.target.value } : x,
                      ),
                    )
                  }
                >
                  {sources.map((a) => (
                    <option
                      key={a.source + a.itemId}
                      value={a.source + ":" + a.itemId}
                    >
                      {a.source === "owned" ? "Yours" : "Shop"} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Offcut name
                <input
                  disabled={credited}
                  value={o.name}
                  onChange={(e) =>
                    setOffcuts((v) =>
                      v.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <div className="sd-production-grid">
                {(["width", "length", "quantity"] as const).map((key) => (
                  <label key={key}>
                    {key === "quantity"
                      ? "Offcut whole units"
                      : `Offcut ${key} (mm)`}
                    <input
                      disabled={credited}
                      type="number"
                      min="1"
                      max={key === "quantity" ? 100 : 3000}
                      value={o[key]}
                      onChange={(e) =>
                        setOffcuts((v) =>
                          v.map((x, j) =>
                            j === i
                              ? { ...x, [key]: Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="sd-text"
                disabled={credited}
                onClick={() => setOffcuts((v) => v.filter((_, j) => j !== i))}
              >
                Remove offcut
              </button>
            </div>
          ))}
          <button
            className="sd-btn outline"
            disabled={credited || !sources.length || offcuts.length >= 5}
            onClick={() =>
              setOffcuts((v) => [
                ...v,
                {
                  sourceId: sources[0].source + ":" + sources[0].itemId,
                  name: "Measured offcut",
                  width: Math.min(20, sources[0].width),
                  length: 20,
                  quantity: 1,
                },
              ])
            }
          >
            Add measured offcut
          </button>
          {credited && (
            <p>
              Offcuts already credited. Edit their measurements in your
              owned-material inventory; they cannot be credited twice here.
            </p>
          )}
          <div className="sd-tut-actions">
            <button
              className="sd-btn outline"
              disabled={busy || credited}
              onClick={() => save(false)}
            >
              Save draft results
            </button>
            <button
              className="sd-btn"
              disabled={busy || completed + spoiled !== kit.config.quantity}
              onClick={() => save(true)}
            >
              Finish batch and update materials
            </button>
          </div>
          <small>
            To finish, good plus spoiled pieces must equal the planned quantity.
            Paid orders must be collected first. Saving a draft does not consume
            inventory.
          </small>
        </>
      )}
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </details>
  );
}
