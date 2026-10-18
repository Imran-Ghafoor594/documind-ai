import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type Meta, type Prefs, type SystemInfo, type Template } from "./api";
import { setDatePref } from "./lib/format";
import { useAsync } from "./lib/useAsync";
import { PageSkeleton, ErrorState } from "./components/Feedback";
import UploadDialog from "./components/UploadDialog";

interface Workspace {
  meta: Meta; prefs: Prefs; system: SystemInfo; templates: Template[]; reviewCount: number;
  /** Increments after any change to documents; lists include it in their dependencies to refetch. */
  version: number; bump: () => void; reloadTemplates: () => Promise<void>;
  savePrefs: (p: Partial<Prefs>) => Promise<void>; openUpload: () => void;
}
const Ctx = createContext<Workspace | null>(null);
export function useWorkspace(): Workspace {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const boot = useAsync(async () => {
    const [meta, settings, templates, queue] = await Promise.all([api.meta(), api.settings(), api.templates(), api.queue({ per_page: 1 })]);
    return { meta, settings, templates, count: queue.meta?.counts?.total ?? 0 };
  }, []);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [version, setVersion] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    if (!boot.data) return;
    setPrefs(boot.data.settings.preferences); setSystem(boot.data.settings.system);
    setTemplates(boot.data.templates); setReviewCount(boot.data.count);
  }, [boot.data]);

  const bump = useCallback(() => {
    setVersion((v) => v + 1);
    api.queue({ per_page: 1 }).then((r) => setReviewCount(r.meta?.counts?.total ?? 0)).catch(() => {});
  }, []);
  const reloadTemplates = useCallback(async () => { setTemplates(await api.templates()); }, []);
  const savePrefs = useCallback(async (p: Partial<Prefs>) => {
    const res = await api.saveSettings(p);
    setPrefs(res.preferences); setSystem(res.system);
  }, []);
  const openUpload = useCallback(() => setUploadOpen(true), []);

  const value = useMemo(() => (boot.data && prefs && system ? {
    meta: boot.data.meta, prefs, system, templates, reviewCount, version, bump, reloadTemplates, savePrefs, openUpload,
  } : null), [boot.data, prefs, system, templates, reviewCount, version, bump, reloadTemplates, savePrefs, openUpload]);

  if (boot.error) return <div className="mx-auto max-w-lg pt-24"><ErrorState message={boot.error} onRetry={boot.reload} /></div>;
  if (!value) return <div className="mx-auto max-w-5xl p-8"><PageSkeleton /></div>;
  setDatePref(value.prefs.date_format);
  return (
    <Ctx.Provider value={value}>
      {children}
      {uploadOpen && <UploadDialog onClose={() => setUploadOpen(false)} />}
    </Ctx.Provider>
  );
}

// ---- breadcrumb: pages report the name of the record they show
const CrumbCtx = createContext<(label: string | null) => void>(() => {});
export const CrumbProvider = CrumbCtx.Provider;
export function useCrumb(label: string | null | undefined) {
  const set = useContext(CrumbCtx);
  useEffect(() => { set(label ?? null); return () => set(null); }, [label, set]);
}
