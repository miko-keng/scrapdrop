import { useEffect, useRef, useState } from "react";
import { X, LockKeyhole, LoaderCircle, RotateCcw, Check } from "lucide-react";
import { api, send } from "./api";
import type { Config } from "./shared/types";
import type { ExpertTool } from "./shared/expert";
import { currency } from "./shared/expert";

let sdkPromise: Promise<void> | undefined;
export function loadSDK(clientId: string) {
  if ((window as any).paypal) return Promise.resolve();
  if (!sdkPromise)
    sdkPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        sdkPromise = undefined;
        reject(
          new Error(
            "PayPal could not load. Check your connection and reopen checkout.",
          ),
        );
      };
      document.head.append(script);
    });
  return sdkPromise;
}
export default function ToolCheckout({
  tool,
  config,
  onClose,
  onSuccess,
}: {
  tool: ExpertTool;
  config: Config;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const target = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState("Loading PayPal sandbox…"),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false);
  const orderId = useRef(""),
    requestKey = useRef(crypto.randomUUID());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    closeButton.current?.focus();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],iframe,[tabindex="0"]',
          ) || [],
        );
        if (!nodes.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes[nodes.length - 1].focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === nodes[nodes.length - 1]
        ) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      buttons: any;
    const storageKey = `taskslice-checkout:${tool.id}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved) {
        orderId.current = saved.id;
        requestKey.current = saved.key;
      }
    } catch {}
    async function setup() {
      if (!config.paypalReady || !config.paypalClientId) {
        setStatus("");
        setError(
          "PayPal sandbox credentials are not configured. Your project stays here while you set them up.",
        );
        return;
      }
      try {
        await loadSDK(config.paypalClientId);
        if (cancelled) return;
        setStatus("");
        buttons = (window as any).paypal.Buttons({
          style: {
            layout: "vertical",
            shape: "pill",
            label: "paypal",
            height: 48,
          },
          createOrder: async () => {
            const order = await send(`/expert/tools/${tool.id}/orders`, {
              version: tool.version,
              idempotencyKey: requestKey.current,
            });
            if (order.owned) {
              onSuccess();
              throw new Error("Already owned.");
            }
            orderId.current = order.id;
            sessionStorage.setItem(
              storageKey,
              JSON.stringify({ id: order.id, key: requestKey.current }),
            );
            return order.providerId;
          },
          onApprove: async () => {
            setStatus("Confirming your sandbox payment…");
            try {
              const result = await send(
                `/orders/${orderId.current}/capture`,
                {},
              );
              if (result.status === "paid") {
                sessionStorage.removeItem(storageKey);
                onSuccess();
              } else
                setStatus(
                  "Still awaiting confirmation. Check the status before trying again.",
                );
            } catch (e) {
              setError((e as Error).message);
              setStatus(
                "Your order is saved. Check its status before paying again.",
              );
            }
          },
          onCancel: () =>
            setStatus(
              "Checkout closed. No tool access has been granted. You can try again.",
            ),
          onError: () =>
            setError(
              "PayPal could not finish checkout. If you approved payment, check its status below.",
            ),
        });
        await buttons.render(target.current);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void setup();
    return () => {
      cancelled = true;
      try {
        buttons?.close();
      } catch {}
    };
  }, []);
  async function check() {
    setChecking(true);
    setError("");
    try {
      if (!orderId.current)
        throw new Error("Start checkout with the PayPal button first.");
      const order = await api(`/orders/${orderId.current}`);
      if (order.status === "paid") onSuccess();
      else
        setStatus(
          `Payment status: ${order.status.replaceAll("_", " ")}. Access unlocks after PayPal confirms payment.`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }
  return (
    <div
      className="ts-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="ts-modal"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
      >
        <button
          className="ts-icon close"
          ref={closeButton}
          aria-label="Close checkout"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="ts-eyebrow">
          <LockKeyhole size={14} /> YOUR NEXT USEFUL THING
        </span>
        <h2 id="checkout-title">Make this method yours.</h2>
        <p>{tool.definition.title}</p>
        <div className="ts-checkout-price">
          <strong>{currency(tool.price / 100)}</strong>
          <span>USD · one-time tool purchase</span>
        </div>
        <ul className="ts-benefits">
          <li>
            <Check size={16} />
            Save and revisit your quotes
          </li>
          <li>
            <Check size={16} />
            Reuse the tool for your next project
          </li>
          <li>
            <Check size={16} />
            Export CSV and a print-ready quote
          </li>
        </ul>
        <div ref={target} />
        {status && (
          <p className="ts-notice" role="status">
            {status}
          </p>
        )}
        {error && (
          <p className="ts-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="ts-text-btn"
          onClick={() => void check()}
          disabled={checking}
        >
          {checking ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <RotateCcw size={15} />
          )}
          Check payment status
        </button>
        <p className="ts-fine">
          PayPal sandbox only. No real money moves.
          <br />
          Access is saved in this browser. Keep your cookies.
        </p>
      </div>
    </div>
  );
}
