import type { AnalysisResult } from "@/lib/types";
export function allocationsToCsv(
  result: AnalysisResult,
  reviews: Record<string, string> = {},
) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (typeof value === "string" && /^[\s]*[=+\-@]/.test(text))
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows: (string | number)[][] = [
    [
      "provenance",
      "item_id",
      "label",
      "description",
      "item_amount_usd",
      "status",
      "fund",
      "split_percent",
      "split_amount_usd",
      "explanation",
      "missing_evidence",
      "citations",
      "regulations",
      "reviewer_decision",
    ],
  ];
  for (const item of result.allocations)
    for (const split of item.splits.length ? item.splits : [undefined])
      rows.push([
        "Eastbay original reference recommendations | Shown independently of uploaded files | Pre-Evaluated Demo Analysis | No live Claude API call",
        item.itemId,
        item.label,
        item.description,
        item.amount,
        item.status,
        split?.fund ?? "",
        split?.percent ?? "",
        split?.amount ?? "",
        item.reason,
        item.missingEvidence ?? "",
        item.citations
          .map(
            (citation) =>
              `${citation.sourceDoc} p.${citation.page} [verified=${citation.verified}] ${citation.quote}`,
          )
          .join("\n"),
        (item.regulations ?? []).join("; "),
        reviews[item.itemId] ?? "not reviewed",
      ]);
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
