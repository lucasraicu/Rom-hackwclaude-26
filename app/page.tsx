// UI lane. Placeholder only: proves the API works end to end. Replace with the real review screen.
"use client";
import { useState } from "react";
import type { AnalysisResult } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(timesheetsCsv?: string) {
    setLoading(true);
    const res = await fetch("/api/analyze", { method: "POST", body: JSON.stringify({ timesheetsCsv }) });
    setResult(await res.json());
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-5xl p-8 font-sans">
      <h1 className="text-3xl font-semibold">FundProof</h1>
      <p className="mt-1 text-neutral-500">From messy records to explainable fund allocations.</p>
      <div className="mt-6 flex gap-3">
        <button className="rounded bg-black px-4 py-2 text-white" onClick={() => run()} disabled={loading}>
          {loading ? "Analyzing..." : "Analyze October"}
        </button>
        <label className="cursor-pointer rounded border px-4 py-2">
          Upload corrected timesheet
          <input
            type="file"
            accept=".csv"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) run(await f.text());
            }}
          />
        </label>
      </div>
      {result && (
        <table className="mt-8 w-full text-left text-sm">
          <thead>
            <tr><th>Item</th><th>Amount</th><th>Status</th><th>Funds</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {result.allocations.map((a) => (
              <tr key={a.itemId} className="border-t align-top">
                <td className="py-2 pr-3">{a.label}</td>
                <td className="pr-3">${a.amount.toFixed(2)}</td>
                <td className="pr-3">{a.status}</td>
                <td className="pr-3">{a.splits.map((s) => `${s.fund} $${s.amount.toFixed(2)}`).join(", ")}</td>
                <td>{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
