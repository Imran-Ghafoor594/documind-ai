import type { ReactNode } from "react";
import type { Doc } from "../api";
import { formatDateTime } from "../lib/format";
import { StatusBadge, VerifiedBadge } from "./Badges";

/** Title block for a selected document: coral vendor name, file info, badges and actions (like the reference). */
export default function DocHeader({ doc, actions }: { doc: Doc; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold text-brand-700 sm:text-xl">{doc.fields.vendor ?? "Vendor not set"}</h1>
        <p className="mt-0.5 break-words text-sm text-ink-600">{doc.original_filename} · Uploaded {formatDateTime(doc.uploaded_at)}</p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5"><StatusBadge status={doc.status} /><VerifiedBadge doc={doc} /></p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
