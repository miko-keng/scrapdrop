import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Play,
  RotateCcw,
  MessageSquare,
  Folder,
} from "lucide-react";
import { api, send } from "../api";

function FileResult({ sample, title }: { sample: any; title: string }) {
  return (
    <div className="mk-evidence">
      <strong>{title}</strong>
      <div className="mk-output-list">
        {sample.rows.map((row: any) => (
          <div key={row.oldName}>
            <span>{row.oldName}</span>
            <ArrowRight size={12} />
            <strong>{row.newName}</strong>
          </div>
        ))}
      </div>
      <p className="mk-checks">
        <CheckCircle2 size={14} /> {sample.checks.fileCount} unchanged images ·
        unique output names
      </p>
    </div>
  );
}
export function SampleAttachment({ record }: { record: any }) {
  const body = JSON.parse(record.body),
    sample = body.sample;
  const [replay, setReplay] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!sample) return null;
  return (
    <div className="mk-attached-sample">
      <FileResult
        sample={sample}
        title={`Attached example · ${sample.toolTitle || (sample.toolId === "pattern-rename" ? "Pattern Rename" : "Map Rename")} v${sample.version}`}
      />
      <strong className="mk-current-label">
        Current behaviour — before the requested change
      </strong>
      <small>
        Supplied sample files · label “{sample.options.label}” ·{" "}
        {sample.options.date} · pattern {sample.options.pattern}. Personal
        uploads are not attached.
      </small>
      <button
        className="mk-text"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setReplay(
              await send(`/market/adaptations/${record.id}/sample`, {}),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <RotateCcw size={14} />
        {busy ? "Reproducing…" : "Reproduce current result"}
      </button>
      {error && (
        <p role="alert" className="mk-error">
          {error}
        </p>
      )}
      {replay && (
        <div role="status">
          <FileResult
            sample={replay}
            title="Reproduced using the original settings"
          />
          <small>
            This runs the existing tool. The requested feature has not been
            implemented by this action.
          </small>
        </div>
      )}
    </div>
  );
}

export function GuidedExample({
  accountId,
  requireAccount,
  nav,
}: {
  accountId?: string;
  requireAccount: () => boolean;
  nav: (url: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState<"buyer" | "builder">("buyer"),
    [result, setResult] = useState<any>(null),
    [record, setRecord] = useState<any>(null),
    [alternative, setAlternative] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reply, setReply] = useState(
      "Map Rename already keeps your camera/ and portraits/ folders. Try it with the same sample. Pattern Rename has not been changed.",
    );
  useEffect(() => {
    setRecord(null);
    setResult(null);
    setAlternative(null);
    setView("buyer");
    if (accountId)
      api("/market/example")
        .then((data) => setRecord(data.request))
        .catch((e) => setError(e.message));
  }, [accountId]);
  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mk-panel mk-guided">
      <div className="mk-section-heading">
        <div>
          <span className="mk-kicker">
            GUIDED EXAMPLE · YOUR OWN PRACTICE RECORD
          </span>
          <h2>See a buyer request become a builder response.</h2>
          <p>
            Try Pattern Rename, ask to keep folders, then respond as the example
            builder. No payment or external message.
          </p>
        </div>
        <button
          className="mk-btn outline"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Play size={15} />
          {open ? "Close example" : "Try buyer-to-builder example"}
        </button>
      </div>
      {open && (
        <>
          <ol className="mk-walkthrough-stages" aria-label="Walkthrough stages">
            {["Try", "Request", "Builder reviews", "Reply", "Buyer checks"].map(
              (label, index) => (
                <li
                  key={label}
                  className={
                    index <=
                    (!record
                      ? result
                        ? 1
                        : 0
                      : !record.response
                        ? 2
                        : alternative
                          ? 4
                          : 3)
                      ? "complete"
                      : ""
                  }
                >
                  {index + 1}. {label}
                </li>
              ),
            )}
          </ol>
          <div className="mk-flow-tabs" role="group" aria-label="Example roles">
            <button
              className={view === "buyer" ? "selected" : ""}
              onClick={() => setView("buyer")}
            >
              1 · Example buyer
            </button>
            <button
              className={view === "builder" ? "selected" : ""}
              disabled={!record}
              onClick={() => setView("builder")}
            >
              2 · Example builder
            </button>
          </div>
          <p className="mk-note">
            Both roles belong to your practice account. This does not create a
            real customer, register a paid provider, or grant paid access.
          </p>
          {error && (
            <p className="mk-error" role="alert">
              {error}
            </p>
          )}
          {view === "buyer" ? (
            <div>
              <h3>Try the current tool, then describe what should change.</h3>
              {!record ? (
                <>
                  <p>
                    Run three supplied PNGs. Pattern Rename gives them
                    consistent names and flattens their folders.
                  </p>
                  <button
                    className="mk-btn"
                    disabled={busy}
                    onClick={() => {
                      if (!requireAccount()) return;
                      void act(async () => {
                        const run = await send("/market/trials", {
                          toolIds: ["pattern-rename"],
                          sample: true,
                          label: "Wedding",
                          date: "2026-10-25",
                          preserveFolders: true,
                          pattern: "{label}_{date}_{seq}",
                        });
                        setResult(run.results[0]);
                      });
                    }}
                  >
                    <Play size={15} />
                    {busy ? "Running…" : "Run buyer sample"}
                  </button>
                  {result && (
                    <>
                      <FileResult
                        sample={result}
                        title="Actual Pattern Rename output"
                      />
                      <div className="mk-note">
                        <strong>Requested difference</strong>
                        <p>Keep camera/ and portraits/ in the output ZIP.</p>
                      </div>
                      <button
                        className="mk-btn"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const saved = await send("/market/example", {
                              sampleJobId: result.id,
                            });
                            setRecord(saved.request);
                            setView("builder");
                          })
                        }
                      >
                        <MessageSquare size={15} />
                        Send practice request with this sample
                      </button>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="mk-small-pill">
                    {record.status === "responded"
                      ? "Builder replied"
                      : "Request saved"}
                  </p>
                  <p>{JSON.parse(record.body).request}</p>
                  <SampleAttachment record={record} />
                  {record.response ? (
                    <div className="mk-note" role="status">
                      <strong>Builder response</strong>
                      <p>{record.response}</p>
                    </div>
                  ) : (
                    <button
                      className="mk-btn outline"
                      onClick={() => setView("builder")}
                    >
                      Open example builder inbox
                      <ArrowRight size={15} />
                    </button>
                  )}
                </>
              )}
              {record?.response && (
                <>
                  <button
                    className="mk-btn outline"
                    disabled={busy}
                    onClick={() =>
                      void act(async () =>
                        setAlternative(
                          await send(
                            `/market/adaptations/${record.id}/sample`,
                            { alternative: "map-rename" },
                          ),
                        ),
                      )
                    }
                  >
                    <Folder size={15} />
                    Try Map Rename on the same sample
                  </button>
                  {alternative && (
                    <>
                      <FileResult
                        sample={alternative}
                        title="Existing alternative: Map Rename preserves folders"
                      />
                      <small>
                        This is a different existing application, not an
                        automatically built feature.
                      </small>
                      <button
                        className="mk-text"
                        onClick={() => nav("/tools/map-rename")}
                      >
                        Open Map Rename
                        <ArrowRight size={14} />
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            record && (
              <div>
                <span className="mk-kicker">PRACTICE BUILDER INBOX</span>
                <h3>Request: preserve the buyer’s folders</h3>
                <strong>Requested change</strong>
                <p>{JSON.parse(record.body).request}</p>
                <p>
                  Reproduce the current result first. Your reply can propose a
                  change or recommend an existing alternative; replying does not
                  implement a feature.
                </p>
                <SampleAttachment record={record} />
                <label>
                  Your example response
                  <textarea
                    value={reply}
                    maxLength={2000}
                    onChange={(e) => setReply(e.target.value)}
                  />
                </label>
                <button
                  className="mk-btn"
                  disabled={busy || reply.trim().length < 10}
                  onClick={() =>
                    void act(async () => {
                      await send(`/market/adaptations/${record.id}/respond`, {
                        response: reply,
                      });
                      const updated = await api("/market/example");
                      setRecord(updated.request);
                      setView("buyer");
                    })
                  }
                >
                  Send practice response
                  <ArrowRight size={15} />
                </button>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
