import fs from "node:fs/promises";
import path from "node:path";
import { extractText } from "unpdf";
import FundProofWorkspace from "./components/FundProofWorkspace";
import type { DemoReference, DemoSource } from "./components/uploadAnalysis";

// Read only this synthetic source whitelist. Never scan data/ or load an answer key.
export default async function Home() {
  const definitions = [
    ["grant-fed-agreement.pdf", "Grant agreement"],
    ["grant-fdn-agreement.pdf", "Grant agreement"],
    ["transactions.csv", "Transactions"],
    ["payroll.csv", "Payroll"],
    ["timesheets.csv", "Timesheet"],
    ["funds.json", "Supporting document"],
  ] as const;
  const sources: DemoSource[] = await Promise.all(
    definitions.map(async ([filename, kind]) => {
      const bytes = await fs.readFile(
        path.join(process.cwd(), "data", "inputs", filename),
      );
      const pdf = filename.endsWith(".pdf");
      return {
        filename,
        kind,
        size: bytes.length,
        mimeType: pdf
          ? "application/pdf"
          : filename.endsWith(".csv")
            ? "text/csv"
            : "application/json",
        base64: bytes.toString("base64"),
        text: pdf ? undefined : bytes.toString("utf8"),
        pages: pdf
          ? (await extractText(new Uint8Array(bytes), { mergePages: false }))
              .text
          : undefined,
      };
    }),
  );
  const reference: DemoReference = {
    documents: sources,
  };
  return <FundProofWorkspace reference={reference} />;
}
