import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

/** Page container for regular (non three-pane) pages. */
export function PageContainer({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full ${wide ? "max-w-[96rem]" : "max-w-7xl"} px-4 py-5 sm:px-6 lg:px-8 lg:py-7`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>{subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** List pane + main workspace. Desktop: side by side with independent scrolling. Smaller screens: one at a time. */
export function TwoPane({ selected, list, children }: { selected: boolean; list: ReactNode; children: ReactNode }) {
  return (
    <div className="lg:flex lg:h-[calc(100dvh-var(--topbar))]">
      <section aria-label="Documents list" className={`${selected ? "hidden lg:flex" : "flex"} min-h-[calc(100dvh-var(--topbar))] w-full flex-col border-ink-200 bg-canvas lg:h-full lg:min-h-0 lg:w-[22rem] lg:shrink-0 lg:border-r`}>{list}</section>
      <section className={`${selected ? "block" : "hidden lg:block"} min-w-0 flex-1 bg-canvas lg:h-full lg:overflow-y-auto`}>{children}</section>
    </div>
  );
}

export function BackToList({ to, label }: { to: string; label: string }) {
  return <a href={`#${to}`} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-ink-700 hover:text-brand-700 lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden /> {label}</a>;
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-ink-200 px-4 py-3"><h2 className="pane-title min-w-0">{title}</h2>{actions}</div>}
      <div className={`min-w-0 ${pad ? "p-4" : ""}`}>{children}</div>
    </section>
  );
}
