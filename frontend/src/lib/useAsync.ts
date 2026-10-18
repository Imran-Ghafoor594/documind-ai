import { useCallback, useEffect, useRef, useState } from "react";

/** Loads data; ignores out-of-order responses so a slow old request can never overwrite a newer one. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    const ticket = ++latest.current;
    setLoading(true);
    fn()
      .then((d) => { if (ticket === latest.current) { setData(d); setError(null); } })
      .catch((e: Error) => { if (ticket === latest.current) setError(e.message); })
      .finally(() => { if (ticket === latest.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); return () => { latest.current++; }; }, [run]);
  /** Replace the data with a response we already have (and discard any older in-flight request). */
  const mutate = useCallback((next: T) => { latest.current++; setData(next); setError(null); setLoading(false); }, []);
  return { data, error, loading, reload: run, mutate };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
