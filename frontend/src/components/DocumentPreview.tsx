import { useEffect, useState } from "react";
import { ExternalLink, FileWarning } from "lucide-react";
import { api, DEMO_MODE, type Doc } from "../api";
import { getProtectedPreviewUrl } from "../lib/demoResources";

/** Image/PDF preview: authenticated blob URL in demo; direct URL otherwise. */
export default function DocumentPreview({ doc }: { doc: Pick<Doc, "id" | "mime_type" | "original_filename"> }) {
  const [broken, setBroken] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(DEMO_MODE ? null : api.fileUrl(doc.id));
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";
  useEffect(() => {
    setBroken(false);
    if (!DEMO_MODE) { setPreviewUrl(api.fileUrl(doc.id)); return; }
    let active = true;
    setPreviewUrl(null);
    void getProtectedPreviewUrl(doc.id).then((url) => {
      if (active) setPreviewUrl(url);
      else URL.revokeObjectURL(url);
    }).catch(() => { if (active) setBroken(true); });
    return () => { active = false; };
  }, [doc.id]);
  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-ink-200 bg-white shadow-card">
        {DEMO_MODE && !broken && !previewUrl && <div className="p-12 text-center text-sm text-ink-600">Loading preview…</div>}
        {isImage && !broken && previewUrl && <img src={previewUrl} alt={`Uploaded document: ${doc.original_filename}`} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" onError={() => setBroken(true)} />}
        {isPdf && !broken && previewUrl && <iframe src={previewUrl} title={`PDF preview: ${doc.original_filename}`} className="h-[70vh] w-full" onError={() => setBroken(true)} />}
        {(broken || (!isImage && !isPdf)) && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-sm text-ink-600">
            <FileWarning className="h-8 w-8 text-ink-500" aria-hidden /><p>A preview isn't available for this file.</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-600">
        Some mobile browsers show only the first PDF page. <a className="inline-flex items-center gap-1 font-medium text-brand-700 underline" href={api.fileUrl(doc.id)} target="_blank" rel="noreferrer">Open the original <ExternalLink className="h-3 w-3" aria-hidden /></a>
      </p>
    </div>
  );
}
