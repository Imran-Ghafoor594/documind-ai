import { BarChart3, ClipboardCheck, FileStack, LayoutDashboard, LayoutTemplate, LifeBuoy, ScanText, Settings, Receipt, Sparkles, type LucideIcon } from "lucide-react";
import { useWorkspace } from "../context";
import { href, type RouteName } from "../router";

interface Item { name: RouteName; to: string; label: string; icon: LucideIcon }
export const NAV: Item[] = [
  { name: "overview", to: "/", label: "Overview", icon: LayoutDashboard },
  { name: "documents", to: "/documents", label: "Documents", icon: FileStack },
  { name: "extraction", to: "/extraction", label: "AI Extraction", icon: ScanText },
  { name: "review", to: "/review", label: "Review Queue", icon: ClipboardCheck },
  { name: "expenses", to: "/expenses", label: "Expenses", icon: Receipt },
  { name: "reports", to: "/reports", label: "Reports", icon: BarChart3 },
  { name: "templates", to: "/templates", label: "Templates", icon: LayoutTemplate },
  { name: "settings", to: "/settings", label: "Settings", icon: Settings },
  { name: "help", to: "/help", label: "Help & Support", icon: LifeBuoy },
];

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand-700"><Sparkles className="h-5 w-5" aria-hidden /></span>
      <span className="text-lg font-semibold tracking-tight text-white">DocuMind AI</span>
    </div>
  );
}

export function SidebarContent({ active, onNavigate }: { active: RouteName; onNavigate?: () => void }) {
  const { reviewCount, system } = useWorkspace();
  return (
    <div className="on-brand flex h-full flex-col bg-brand-600 text-white">
      <div className="px-4 pb-4 pt-5"><Logo /></div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ name, to, label, icon: Icon }) => {
          const current = active === name;
          return (
            <a key={name} href={href(to)} onClick={onNavigate} aria-current={current ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${current ? "bg-white/20" : "hover:bg-white/10"}`}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {name === "review" && reviewCount > 0 && (
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold leading-none text-brand-700" aria-label={`${reviewCount} documents need review`}>{reviewCount}</span>
              )}
            </a>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-white/25 px-4 py-3 text-xs">
        <p className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${system.ai_configured ? "bg-white" : "border border-white"}`} aria-hidden />AI: {system.ai_configured ? "configured" : "not configured"}</p>
        <p className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${system.ocr_available ? "bg-white" : "border border-white"}`} aria-hidden />OCR: {system.ocr_available ? "available" : "not installed"}</p>
      </div>
    </div>
  );
}
