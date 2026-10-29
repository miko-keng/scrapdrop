export type TrackableOrder = {
  state: string;
  fulfillment: string;
  refunded: number;
};
export function orderProgress(o: TrackableOrder) {
  if (o.refunded > 0)
    return {
      label: "Refund recorded",
      description:
        "A payment adjustment is recorded. Check your receipt for the amount.",
      step: -1,
    };
  if (o.state === "canceled" || o.state === "failed")
    return {
      label: o.state === "canceled" ? "Canceled" : "Payment unsuccessful",
      description: "This order is not progressing to pickup.",
      step: -1,
    };
  if (o.state !== "paid")
    return {
      label: "Payment checking",
      description:
        "Payment is not confirmed yet. Please wait before collecting your order.",
      step: 0,
    };
  if (o.fulfillment === "collected")
    return {
      label: "Collected",
      description: "Your order has been collected.",
      step: 3,
    };
  if (o.fulfillment === "ready")
    return {
      label: "Ready for pickup",
      description:
        "Your seller marked the order ready. Follow the pickup instructions on your receipt.",
      step: 2,
    };
  return {
    label: "Preparing",
    description:
      "Payment is confirmed. Your seller has not marked the order ready yet.",
    step: 1,
  };
}
export const orderSteps = [
  "Payment checking",
  "Preparing",
  "Ready for pickup",
  "Collected",
];
