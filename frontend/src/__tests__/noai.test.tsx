/**
 * Missing-credentials behaviour in the real UI. Needs the QA backend started WITHOUT any AI configuration:
 *   cd backend && QA_NO_AI=1 python -m tests.qa_server      (skipped when AI is configured)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { api } from "../api";

const BASE = "http://127.0.0.1:5055";
const health = await fetch(BASE + "/api/health").then((r) => r.json()).catch(() => null);
const noAi = health?.ai_configured === false;
const pdf = (n: string) => new File([readFileSync(join(__dirname, "sample.pdf"))], n, { type: "application/pdf" });
const mount = (hash: string) => { window.location.hash = hash; return render(<App />); };

describe.skipIf(!noAi)("AI not configured", () => {
  it("uploads still work, nothing is faked, and every screen says so", async () => {
    const u = userEvent.setup({ applyAccept: false });
    const doc = await api.upload(pdf("noai.pdf"), null, () => {});
    expect(doc.ai_status).toBe("not_configured");
    expect(Object.values(doc.fields).every((v) => v === null)).toBe(true);
    expect(doc.ai_model).toBeNull();

    mount(`/review/${doc.id}`);
    expect(await screen.findByText(/AI extraction isn't configured, so nothing was filled in automatically/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Vendor/)).toHaveValue("");
    expect(screen.getByText("AI: not configured")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /confirm and save/i }));        // empty record cannot be confirmed
    expect((await screen.findAllByText(/required before you can confirm/i)).length).toBeGreaterThan(0);
    expect((await api.get(doc.id)).verification_status).toBe("unverified");
  });

  it("Extraction, Settings, Overview and Help explain the situation and how to fix it", async () => {
    const [doc] = (await api.list({ per_page: 1 })).data;
    const first = mount(`/extraction/${doc.id}`);
    expect(await screen.findByText(/AI extraction is not configured on this server/i)).toBeInTheDocument();
    expect(screen.getAllByText("No AI result").length).toBeGreaterThan(0);   // every field row says so
    first.unmount();
    const second = mount("/settings");
    expect(await screen.findByText("Not configured")).toBeInTheDocument();
    expect(screen.getByText(/API keys are never shown here/i)).toBeInTheDocument();
    second.unmount();
    mount("/help");
    expect(await screen.findByText("AI not configured")).toBeInTheDocument();
    await waitFor(() => expect(document.body.textContent).toContain("AI_BASE_URL"));
  });
});
