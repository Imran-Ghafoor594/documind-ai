/** Protected binary endpoints cannot use normal <a> or <iframe> tags: those
 * browsers requests have no Authorization header. Fetch authenticated Blobs.
 * This helper is used only in VITE_DEMO_MODE, and does not append secrets to URLs.
 */
import { API_BASE, DEMO_MODE, getDemoToken } from "../api";

export async function getDemoBlobWithName(url: string): Promise<{ blob: Blob; filename: string | null }> {
  const token = getDemoToken();
  if (!token) throw new Error("Demo access session is missing. Reload to enter the code.");
  const result = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!result.ok) throw new Error(`Could not load file (HTTP ${result.status}).`);
  const disposition = result.headers.get("Content-Disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const normalName = disposition.match(/filename="([^"]+)"/i)?.[1];
  let filename: string | null = normalName ?? null;
  if (encodedName) {
    try { filename = decodeURIComponent(encodedName); } catch { /* fallback */ }
  }
  filename = filename?.replace(/[\\/\r\n]/g, "_") ?? null;
  return { blob: await result.blob(), filename };
}

export async function getDemoBlob(url: string): Promise<Blob> {
  return (await getDemoBlobWithName(url)).blob;
}

export async function getProtectedPreviewUrl(id: number): Promise<string> {
  const blob = await getDemoBlob(`${API_BASE}/api/documents/${id}/file`);
  return URL.createObjectURL(blob);
}

/** Return an unregister function; used once at the top of the app. */
export function interceptDemoResourceLinks(): () => void {
  if (!DEMO_MODE) return () => {};
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    const element = event.target as Element | null;
    const anchor = element?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    const apiOrigin = new URL(API_BASE || window.location.origin, window.location.origin);
    if (url.origin !== apiOrigin.origin || !/^\/api\/(?:documents\/\d+\/file|export\/csv|reports\/csv)$/.test(url.pathname)) return;
    event.preventDefault();
    const download = anchor.hasAttribute("download") || url.pathname.endsWith("/csv");
    // Open synchronously before awaiting fetch to avoid popup blockers.
    const tab = download ? null : window.open("", "_blank");
    void (async () => {
      try {
        const { blob, filename } = await getDemoBlobWithName(url.href);
        const objectUrl = URL.createObjectURL(blob);
        if (download) {
          const temp = document.createElement("a");
          temp.href = objectUrl;
          temp.download = filename ?? (url.pathname.endsWith("/csv") ? "documind-export.csv" : "document");
          document.body.appendChild(temp);
          temp.click(); temp.remove();
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        } else if (tab) {
          tab.location.href = objectUrl;
          window.setTimeout(() => URL.revokeObjectURL(objectUrl), 300_000);
        } else {
          URL.revokeObjectURL(objectUrl);
          window.alert("Your browser blocked the preview window. Allow pop-ups and try again.");
        }
      } catch (error) {
        tab?.close();
        window.alert((error as Error).message);
      }
    })();
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
