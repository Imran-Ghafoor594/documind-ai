import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface DialogProps {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
  width?: string; dismissible?: boolean; description?: string;
}

/** Modal with focus trap, Escape to close, scroll lock and focus restore. A bottom sheet on small screens. */
export function Dialog({ title, onClose, children, footer, width = "max-w-lg", dismissible = true, description }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef(onClose);
  const dismissRef = useRef(dismissible);
  closeRef.current = onClose;
  dismissRef.current = dismissible;

  useEffect(() => {
    const node = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = node.querySelector<HTMLElement>("[data-autofocus]") ?? items().find((el) => el.dataset.close !== "true") ?? items()[0];
    (first ?? node).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissRef.current) { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== "Tab") return;
      const list = items();
      if (list.length === 0) { e.preventDefault(); return; }
      const [a, z] = [list[0], list[list.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    node.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { node.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/45 sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && dismissible) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}
        className={`flex max-h-[92dvh] w-full ${width} flex-col rounded-t-xl bg-white shadow-pop sm:rounded-xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-sm text-ink-600">{description}</p>}
          </div>
          <button data-close="true" className="rounded p-1 text-ink-600 hover:bg-ink-100 disabled:opacity-40" onClick={onClose} disabled={!dismissible} aria-label="Close dialog">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Promise-based confirmation dialog (replaces window.confirm)
export interface ConfirmOptions { title: string; message: ReactNode; confirmLabel?: string; tone?: "danger" | "primary" }
type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>;
const ConfirmCtx = createContext<ConfirmFn>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise((resolve) => setState({ opts, resolve })), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Dialog title={state.opts.title} onClose={() => done(false)} width="max-w-md"
          footer={<>
            <button className="btn-secondary" onClick={() => done(false)}>Cancel</button>
            <button data-autofocus className={state.opts.tone === "primary" ? "btn-primary" : "btn-danger-solid"} onClick={() => done(true)}>
              {state.opts.confirmLabel ?? "Confirm"}
            </button>
          </>}>
          <div className="text-sm text-ink-700">{state.opts.message}</div>
        </Dialog>
      )}
    </ConfirmCtx.Provider>
  );
}
