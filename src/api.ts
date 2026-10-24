import type { Config } from "./shared/types";
let csrf = "";
export function setCSRF(value: string) {
  csrf = value;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message || "Something went wrong. Please try again.",
    );
  return data;
}
export async function getConfig() {
  const c = await api<Config>("/config");
  setCSRF(c.csrf);
  return c;
}
export const send = (path: string, data: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(data) });
