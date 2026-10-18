import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";

export interface MenuItem { label: string; icon?: LucideIcon; onSelect?: () => void; href?: string; download?: boolean; newTab?: boolean; danger?: boolean; disabled?: boolean }

/** Accessible dropdown menu (button + role=menu) with arrow-key navigation. */
export function Menu({ label, items, icon: Icon, iconOnly = false, variant = "btn-secondary", align = "right" }: {
  label: string; items: MenuItem[]; icon?: LucideIcon; iconOnly?: boolean; variant?: string; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); trigger.current?.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const nodes = Array.from(root.current!.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'));
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(i + (e.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
  };

  const cls = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50 aria-disabled:opacity-50";
  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button ref={trigger} type="button" className={`${variant} ${iconOnly ? "btn-sm !px-2" : ""}`} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
        aria-label={iconOnly ? label : undefined} onClick={() => setOpen(!open)}>
        {iconOnly ? <MoreHorizontal className="h-4 w-4" aria-hidden /> : <>{Icon && <Icon className="h-4 w-4" aria-hidden />}{label}<ChevronDown className="h-3.5 w-3.5" aria-hidden /></>}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={`absolute z-40 mt-1 min-w-48 overflow-hidden rounded-lg border border-ink-200 bg-white py-1 shadow-pop ${align === "right" ? "right-0" : "left-0"}`}>
          {items.map((it) => {
            const body = <>{it.icon && <it.icon className="h-4 w-4 shrink-0" aria-hidden />}<span>{it.label}</span></>;
            const tone = `${cls} ${it.danger ? "text-red-700" : "text-ink-800"}`;
            if (it.href && !it.disabled)
              return <a key={it.label} role="menuitem" tabIndex={-1} className={tone} href={it.href} download={it.download || undefined}
                target={it.newTab ? "_blank" : undefined} rel={it.newTab ? "noreferrer" : undefined} onClick={() => setOpen(false)}>{body}</a>;
            return <button key={it.label} role="menuitem" tabIndex={-1} type="button" aria-disabled={it.disabled || undefined} className={tone}
              onClick={() => { if (it.disabled) return; setOpen(false); it.onSelect?.(); }}>{body}</button>;
          })}
        </div>
      )}
    </div>
  );
}
