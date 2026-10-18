import type { Doc } from "../api";
import { formatDate, money } from "../lib/format";
import { FIELD_LABEL, FIELD_ORDER, REQUIRED_FIELDS } from "../lib/labels";
import { Badge, SourceBadge } from "./Badges";

function show(doc: Doc | { fields: Doc["fields"] }, name: (typeof FIELD_ORDER)[number], values: Doc["fields"] | null): string {
  const v = values?.[name];
  if (v == null || v === "") return "—";
  if (name === "document_date") return formatDate(v);
  if (name === "subtotal" || name === "tax" || name === "total_amount") return money(v, (values as Doc["fields"]).currency ?? doc.fields.currency);
  return v;
}

/** What the model returned vs what is stored now, with where each current value came from. */
export default function FieldTable({ doc }: { doc: Doc }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">Extracted fields: AI suggestion compared with the current value</caption>
        <thead className="border-b border-ink-200 bg-ink-50"><tr>
          <th scope="col" className="th">Field</th><th scope="col" className="th">AI suggested</th><th scope="col" className="th">Current value</th><th scope="col" className="th">Source</th>
        </tr></thead>
        <tbody className="divide-y divide-ink-100">
          {FIELD_ORDER.map((name) => {
            const missing = REQUIRED_FIELDS.includes(name) && doc.fields[name] == null;
            return (
              <tr key={name}>
                <th scope="row" className="td whitespace-nowrap text-left font-medium">{FIELD_LABEL[name]}</th>
                <td className="td text-ink-700">{doc.ai_fields ? show(doc, name, doc.ai_fields) : <span className="text-ink-600">No AI result</span>}</td>
                <td className="td font-medium">{show(doc, name, doc.fields)}{missing && <span className="ml-2"><Badge tone="amber">Missing</Badge></span>}</td>
                <td className="td"><SourceBadge source={doc.field_sources[name]} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
