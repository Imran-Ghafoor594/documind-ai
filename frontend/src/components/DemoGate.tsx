import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { FileText, KeyRound, ShieldCheck } from "lucide-react";
import { api, DEMO_MODE, getDemoToken, setDemoToken } from "../api";
import { interceptDemoResourceLinks } from "../lib/demoResources";

export default function DemoGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">(DEMO_MODE ? "checking" : "unlocked");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!DEMO_MODE) return;
    let active = true;
    if (!getDemoToken()) { setStatus("locked"); return; }
    void api.demoSession().then(() => { if (active) setStatus("unlocked"); })
      .catch(() => { setDemoToken(null); if (active) setStatus("locked"); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (status !== "unlocked") return;
    return interceptDemoResourceLinks();
  }, [status]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const session = await api.unlockDemo(code);
      setDemoToken(session.token);
      setCode(""); setStatus("unlocked");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  if (status === "unlocked") return <>{DEMO_MODE && <div className="bg-amber-50 px-4 py-1 text-center text-xs font-medium text-amber-900">Temporary demo · shared workspace · uploads may disappear after a restart · use sample documents only</div>}{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-50 p-5">
      <section className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-8 shadow-lg">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><FileText className="h-6 w-6" /></div>
        <h1 className="mb-2 text-2xl font-bold text-ink-900">DocuMind AI — Demo Access</h1>
        <p className="mb-6 text-sm text-ink-600">Hacktoberfest Side Hustle prototype. Enter the shared demo access code supplied by the project owner.</p>
        {status === "checking" ? <p className="text-sm text-ink-600">Checking demo session…</p> : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-ink-900" htmlFor="demo-code">Demo access code</label>
            <div className="relative"><KeyRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-500" /><input id="demo-code" autoComplete="off" type="password" minLength={1} required value={code} onChange={e => setCode(e.target.value)} className="input w-full pl-10" placeholder="Enter access code" /></div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button className="btn-primary w-full justify-center" disabled={busy} type="submit"><ShieldCheck className="h-4 w-4" />{busy ? "Checking…" : "Open Demo"}</button>
          </form>
        )}
        <p className="mt-6 text-xs text-ink-600">Do not upload real invoices, confidential financial records, or personal data. This is a shared, nonpersistent demo.</p>
      </section>
    </main>
  );
}
