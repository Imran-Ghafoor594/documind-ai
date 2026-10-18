import { useEffect, useMemo, useState } from "react";

export type RouteName = "overview" | "documents" | "extraction" | "review" | "expenses" | "reports" | "templates" | "settings" | "help" | "notfound";
export interface Route { name: RouteName; id: number | null; query: URLSearchParams; path: string }

const PLAIN: RouteName[] = ["expenses", "reports", "templates", "settings", "help"];
const WITH_ID: RouteName[] = ["documents", "extraction", "review"];

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const head = (parts[0] ?? "overview") as RouteName;
  const query = new URLSearchParams(qs);
  const base = { query, path };
  if (parts.length === 0) return { name: "overview", id: null, ...base };
  if (PLAIN.includes(head) && parts.length === 1) return { name: head, id: null, ...base };
  if (WITH_ID.includes(head) && parts.length <= 2) {
    if (parts.length === 1) return { name: head, id: null, ...base };
    if (/^\d+$/.test(parts[1])) return { name: head, id: Number(parts[1]), ...base };
  }
  return { name: "notfound", id: null, ...base };
}

export function useRoute(): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return useMemo(() => parseRoute(hash), [hash]);
}

export const navigate = (path: string) => { window.location.hash = path; };
export const href = (path: string) => `#${path}`;
