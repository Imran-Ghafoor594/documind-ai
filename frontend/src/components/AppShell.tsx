import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { CrumbProvider } from "../context";
import type { Route } from "../router";
import { SidebarContent } from "./Sidebar";
import { TopBar } from "./TopBar";

export default function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [crumb, setCrumb] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDrawer(false), [route.path]);
  useEffect(() => {
    if (!drawer) return;
    const node = drawerRef.current!;
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>("a[href],button:not([disabled])"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab") {
        const l = focusables(); const [a, z] = [l[0], l[l.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    node.addEventListener("keydown", onKey);
    return () => { node.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [drawer]);

  return (
    <CrumbProvider value={setCrumb}>
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">Skip to main content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 lg:block"><SidebarContent active={route.name} /></aside>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }} style={{ background: "rgba(29,31,35,.45)" }}>
          <div ref={drawerRef} role="dialog" aria-modal="true" aria-label="Navigation menu" className="relative h-full w-72 max-w-[85vw]">
            <SidebarContent active={route.name} onNavigate={() => setDrawer(false)} />
            <button className="absolute right-2 top-4 rounded p-1.5 text-white hover:bg-white/15" onClick={() => setDrawer(false)} aria-label="Close navigation menu"><X className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>
      )}
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <TopBar route={route} crumb={crumb} onMenu={() => setDrawer(true)} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">{children}</main>
      </div>
    </CrumbProvider>
  );
}
