import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, type LucideIcon } from "lucide-react";

export const Skeleton = ({ className = "" }: { className?: string }) => <div aria-hidden className={`animate-pulse rounded bg-ink-200/70 ${className}`} />;

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-ink-200 bg-white p-3"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="mt-2 h-3 w-1/3" /><Skeleton className="mt-3 h-3 w-1/2" /></div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div role="status" className="flex items-center gap-2 py-8 text-sm text-ink-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}</div>;
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700"><Icon className="h-5 w-5" aria-hidden /></span>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-600">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-700"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
      <h3 className="text-sm font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{message}</p>
      {onRetry && <button className="btn-secondary mt-4" onClick={onRetry}><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>}
    </div>
  );
}

const TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900", ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};
export function Notice({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${TONES[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
