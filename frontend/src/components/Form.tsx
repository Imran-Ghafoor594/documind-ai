import type { ReactNode } from "react";

export function Field({ label, htmlFor, error, hint, tag, children }: { label: string; htmlFor: string; error?: string; hint?: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}{tag && <span className="ml-2 font-normal">{tag}</span>}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-700" id={`${htmlFor}-err`}>{error}</p>}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <select className="input !py-1.5 text-xs" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
  );
}
