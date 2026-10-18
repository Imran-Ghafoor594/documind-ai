import type { ReactNode } from "react";
import { REASON_LABEL, SOURCE_LABEL, STATUS_LABEL } from "../lib/labels";
import type { Doc, FieldSource } from "../api";

const TONES: Record<string, string> = {
  gray: "bg-ink-100 text-ink-700 ring-ink-200", green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200", blue: "bg-sky-50 text-sky-800 ring-sky-200",
  red: "bg-red-50 text-red-800 ring-red-200", brand: "bg-brand-50 text-brand-800 ring-brand-200",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, string> = { uploaded: "gray", processing: "blue", review_required: "amber", completed: "green", failed: "red" };
export const StatusBadge = ({ status }: { status: Doc["status"] }) => <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
export const VerifiedBadge = ({ doc }: { doc: Pick<Doc, "verification_status"> }) =>
  doc.verification_status === "confirmed" ? <Badge tone="green">Verified</Badge> : <Badge tone="gray">Unverified</Badge>;
export const ReasonBadge = ({ reason }: { reason: string }) => <Badge tone={reason === "failed" ? "red" : reason === "needs_confirmation" ? "gray" : "amber"}>{REASON_LABEL[reason] ?? reason}</Badge>;

const SRC_TONE: Record<string, string> = { ai: "blue", template: "brand", user: "gray" };
export const SourceBadge = ({ source }: { source: FieldSource }) =>
  source ? <Badge tone={SRC_TONE[source]}>{source === "user" ? "Edited by you" : SOURCE_LABEL[source]}</Badge> : <span className="text-xs text-ink-600">Empty</span>;
