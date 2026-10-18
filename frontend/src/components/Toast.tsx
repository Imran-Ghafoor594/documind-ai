import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type Tone = "success" | "error" | "info";
interface ToastItem { id: number; tone: Tone; text: string }
interface Api { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }
const Ctx = createContext<Api>({ success() {}, error() {}, info() {} });
export const useToast = () => useContext(Ctx);

const STYLE: Record<Tone, string> = {
  success: "border-emerald-200 text-emerald-900", error: "border-red-200 text-red-900", info: "border-ink-200 text-ink-900",
};
const ICON = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setItems((l) => [...l.slice(-3), { id, tone, text }]);
    setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4500);
  }, [dismiss]);
  const api = useMemo<Api>(() => ({ success: (t) => push("success", t), error: (t) => push("error", t), info: (t) => push("info", t) }), [push]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end lg:items-start lg:pl-[16rem]" role="region" aria-label="Notifications">
        {items.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
              className={`pointer-events-none flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-white px-3.5 py-3 text-sm shadow-pop ${STYLE[t.tone]}`}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="min-w-0 flex-1 break-words">{t.text}</p>
              <button className="pointer-events-auto rounded p-0.5 text-ink-500 hover:bg-ink-100" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><X className="h-4 w-4" /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
