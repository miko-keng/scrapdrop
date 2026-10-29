import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "../../api";
import type { SavedJob } from "../ManufacturingWorkspace";
import { PreviewBoundary } from "../PreviewBoundary";
import { validateSchedule, type Slot } from "./engine";
const Schedule = lazy(() => import("./ProductionSchedule"));
const Insights = lazy(() => import("./ProductionInsights"));
export default function ProductionPanel() {
  const timelineEnabled =
    import.meta.env.VITE_ENABLE_BRYNTUM !== "false" &&
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_BRYNTUM === "true");
  const insightsEnabled =
    import.meta.env.VITE_ENABLE_AG_STUDIO !== "false" &&
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_AG_STUDIO === "true");
  const [jobs, setJobs] = useState<SavedJob[]>([]),
    [rows, setRows] = useState<any[]>([]),
    [slots, setSlots] = useState<Slot[]>([]),
    [revision, setRevision] = useState(0),
    [date, setDate] = useState(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kuala_Lumpur",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("schedule"),
    [showTimeline, setShowTimeline] = useState(true);
  async function load() {
    const [j, a, s] = await Promise.all([
      api<SavedJob[]>("/scrapdrop/manufacturing/operator-jobs"),
      api("/scrapdrop/manufacturing/analytics"),
      api("/scrapdrop/manufacturing/schedule"),
    ]);
    setJobs(j);
    setRows(a);
    setSlots(s.slots);
    setRevision(s.revision);
    setDate(s.date);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const scheduleJob = (j: SavedJob) => {
    if (slots.some((s) => s.id.startsWith(j.id + ":"))) return;
    let cursor = Math.max(0, ...slots.map((s) => s.end));
    const appended = j.plan.schedule.map((o) => {
      if ((cursor % 1440) + o.minutes > 480)
        cursor = (Math.floor(cursor / 1440) + 1) * 1440;
      const next = {
        ...o,
        id: j.id + ":" + o.id,
        predecessors: o.predecessors.map((p) => j.id + ":" + p),
        start: cursor,
        end: cursor + o.minutes,
      };
      cursor = next.end;
      return next;
    });
    setSlots((s) => [...s, ...appended]);
    setNotice("Draft schedule updated. Save to validate shared resources.");
  };
  const validate = (next: Slot[]) => {
    const errors = validateSchedule(next);
    if (errors.length) {
      setError(errors.join(" ") + " The previous valid draft was restored.");
      setSlots((s) => [...s]);
    } else {
      setError("");
      setSlots(next);
      setNotice("Draft edited. Save to validate on the server.");
    }
  };
  return (
    <section className="mfg-card">
      <h2>Production workspace</h2>
      <p>
        Real saved jobs and recorded results. Estimates are not measured
        outcomes.
      </p>
      <div className="mfg-tabs">
        <button onClick={() => setTab("schedule")}>
          Resources & operations
        </button>
        <button onClick={() => setTab("insights")}>Production insights</button>
        <button onClick={() => void load().catch((e) => setError(e.message))}>
          Reload saved data
        </button>
      </div>
      {error && (
        <p role="alert" className="sd-error">
          {error}
        </p>
      )}
      <p role="status">{notice}</p>
      {tab === "schedule" ? (
        <>
          <p>
            Draft workshop schedule · one maker and one exclusive cutter.
            Timeline starts at 09:00 MYT on the selected date. This is an
            internal planning view, not a promised shop appointment.
          </p>
          <label>
            Workshop start date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="mfg-actions">
            {jobs.map((j) => (
              <button
                key={j.id}
                className="sd-btn small outline"
                disabled={slots.some((s) => s.id.startsWith(j.id + ":"))}
                onClick={() => scheduleJob(j)}
              >
                Schedule {j.plan.input.title}
              </button>
            ))}
          </div>
          {!jobs.length && <p>Save a making plan first to schedule it here.</p>}
          {!!slots.length && (
            <>
              <div className="mfg-actions">
                <button
                  className="sd-btn"
                  onClick={async () => {
                    try {
                      const ids = [
                        ...new Set(slots.map((s) => s.id.split(":")[0])),
                      ];
                      const next = await api(
                        "/scrapdrop/manufacturing/schedule",
                        {
                          method: "PUT",
                          body: JSON.stringify({
                            revision,
                            date,
                            jobs: ids.map((id) => ({
                              id,
                              intervals: slots
                                .filter((s) => s.id.startsWith(id + ":"))
                                .map((s) => ({
                                  id: s.id.slice(id.length + 1),
                                  start: s.start,
                                  end: s.end,
                                })),
                            })),
                          }),
                        },
                      );
                      setSlots(next.slots);
                      setRevision(next.revision);
                      setNotice("Schedule validated and saved.");
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Validate & save schedule
                </button>
                <button
                  className="sd-text"
                  onClick={() => {
                    setSlots([]);
                    setNotice(
                      "Draft cleared. Save to clear the persisted schedule.",
                    );
                  }}
                >
                  Clear draft
                </button>
                <button
                  className="sd-text"
                  onClick={() => setShowTimeline((v) => !v)}
                >
                  {showTimeline ? "Use accessible table" : "Show timeline"}
                </button>
              </div>
              {showTimeline && timelineEnabled && (
                <PreviewBoundary
                  fallback={
                    <p>
                      The Bryntum trial could not load. Use the operation table
                      below.
                    </p>
                  }
                >
                  <Suspense fallback={<p>Loading resource timeline…</p>}>
                    <Schedule slots={slots} date={date} onEdit={validate} />
                  </Suspense>
                </PreviewBoundary>
              )}
              <div className="mfg-table-wrap">
                <table>
                  <caption>
                    Equivalent operation list · relative minutes from workshop
                    start
                  </caption>
                  <thead>
                    <tr>
                      <th>Operation</th>
                      <th>Resource</th>
                      <th>Start minute</th>
                      <th>Finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slots.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>{s.resources.join(" + ")}</td>
                        <td>
                          <input
                            aria-label={`Start ${s.name} ${s.id}`}
                            type="number"
                            min={0}
                            value={s.start}
                            onChange={(e) => {
                              const start = e.target.valueAsNumber;
                              if (Number.isFinite(start))
                                validate(
                                  slots.map((o) =>
                                    o.id === s.id
                                      ? { ...o, start, end: start + o.minutes }
                                      : o,
                                  ),
                                );
                            }}
                          />
                        </td>
                        <td>{s.end}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!slots.length && (
            <button
              className="sd-btn outline"
              onClick={async () => {
                try {
                  const next = await api("/scrapdrop/manufacturing/schedule", {
                    method: "PUT",
                    body: JSON.stringify({ revision, date, jobs: [] }),
                  });
                  setRevision(next.revision);
                  setNotice("Empty schedule saved.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Save empty schedule
            </button>
          )}
        </>
      ) : (
        <>
          {insightsEnabled && (
            <PreviewBoundary
              fallback={
                <p>
                  AG Studio is unavailable. Your production records remain in
                  the table below.
                </p>
              }
            >
              <Suspense fallback={<p>Loading insights…</p>}>
                <Insights rows={rows} />
              </Suspense>
            </PreviewBoundary>
          )}
          <div className="mfg-table-wrap">
            <table>
              <caption>
                Accessible production records ·{" "}
                {rows.filter((r) => r.status === "Actual recorded").length}{" "}
                finalized observations
              </caption>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Estimate (min)</th>
                  <th>Actual (min)</th>
                  <th>Purchased (USD)</th>
                  <th>Contribution (USD)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.job}>
                    <td>{r.title}</td>
                    <td>{r.status}</td>
                    <td>{r.estimatedMinutes}</td>
                    <td>{r.actualMinutes ?? "Not recorded"}</td>
                    <td>{r.purchaseUSD}</td>
                    <td>{r.contributionUSD ?? "Not recorded"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
