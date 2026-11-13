// SHARED CONTRACT. Every lane builds against these types.
// Changing this file affects all three lanes: announce the change on Murmur
// (group:fundproof) before you edit it, and push it as its own small commit.

/** Fund codes used everywhere: CSVs, Claude output, UI. */
export type FundCode = "GRANT-FED" | "GRANT-FDN" | "UNRESTRICTED";

export const FUND_CODES: FundCode[] = ["GRANT-FED", "GRANT-FDN", "UNRESTRICTED"];

export interface Fund {
  code: FundCode;
  name: string;
  type: "federal" | "foundation" | "unrestricted";
  awardNumber?: string;
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string;
  budgetRemaining?: number; // dollars, before this month's allocations
  sourceDoc?: string; // file name in data/inputs, e.g. "grant-fed-agreement.pdf"
}

// ---------- Raw inputs (DATA lane parses these from data/inputs) ----------

export interface Transaction {
  id: string; // "T-001"
  date: string; // YYYY-MM-DD
  vendor: string;
  description: string;
  amount: number;
  account: string;
}

export interface PayrollLine {
  employeeId: string; // "E-01"
  name: string;
  title: string;
  period: string; // "2026-10"
  grossPay: number;
  benefits: number;
  /** What the org's budget planned, e.g. "GRANT-FED 50% / GRANT-FDN 30% / UNRESTRICTED 20%". Not evidence on its own. */
  plannedAllocation: string;
  /** Short job description; mentions which programs the person works on. */
  jobDescription: string;
}

export interface TimesheetRow {
  employeeId: string;
  period: string;
  activity: string;
  fund: FundCode;
  hours: number;
}

export interface GrantDoc {
  fund: FundCode;
  file: string; // file name in data/inputs
  /** Plain text of each page, index 0 = page 1. Used for citation checks. */
  pages: string[];
}

export interface Dataset {
  org: string;
  period: string; // "2026-10"
  funds: Fund[];
  transactions: Transaction[];
  payroll: PayrollLine[];
  timesheets: TimesheetRow[];
  grantDocs: GrantDoc[];
}

// ---------- Grant rules (AI lane extracts these from the grant PDFs) ----------

export interface GrantRule {
  id: string; // "FED-R1"
  fund: FundCode;
  kind: "allowed" | "disallowed" | "documentation" | "allocation";
  summary: string; // one plain sentence
  citation: Citation;
}

// ---------- Results (AI lane proposes, DATA lane computes and verifies) ----------

export type AllocationStatus = "supported" | "needs_evidence" | "not_allowable";

export interface Citation {
  sourceDoc: string; // file name in data/inputs
  page: number; // 1-based
  quote: string; // exact text from the document
  /** Set by lib/data/verifyCitations.ts. null = not checked yet. */
  verified: boolean | null;
}

export interface Split {
  fund: FundCode;
  amount: number; // dollars, 2 decimals; computed in code, never by Claude
  percent: number; // 0-100
}

export interface Allocation {
  itemId: string; // "T-001" for transactions, "PAY-E-01" for payroll
  itemType: "transaction" | "payroll";
  label: string; // vendor or employee name, for the table
  description: string;
  amount: number; // total dollars for the item
  status: AllocationStatus;
  splits: Split[]; // empty when status is needs_evidence and nothing can be proposed
  reason: string; // one or two plain sentences from Claude
  citations: Citation[];
  /** Only for needs_evidence: what document would resolve it. */
  missingEvidence?: string;
  /** Regulation references, e.g. ["2 CFR 200.430(i)"]. */
  regulations?: string[];
}

export interface AnalysisSummary {
  itemCount: number;
  totalAmount: number;
  byStatus: Record<AllocationStatus, { count: number; amount: number }>;
  byFund: Record<FundCode, number>;
  citationsVerified: number;
  citationsTotal: number;
}

export interface AnalysisResult {
  generatedAt: string; // ISO timestamp
  mode: "mock" | "live" | "cache";
  org: string;
  period: string;
  funds: Fund[];
  rules: GrantRule[];
  allocations: Allocation[];
  summary: AnalysisSummary;
}

// ---------- API ----------

/** POST /api/analyze request body. */
export interface AnalyzeRequest {
  /** Text of an uploaded timesheets CSV that replaces data/inputs/timesheets.csv (the fix-loop moment). */
  timesheetsCsv?: string;
  /** Extra evidence the user uploaded as text, e.g. a signed scope of work (demo scenario 3). */
  supportingDocs?: SupportingDoc[];
}

/** A text document uploaded as evidence. Claude may use it; code never treats it as a verified grant quote. */
export interface SupportingDoc {
  file: string; // file name, e.g. "brightpath-scope-of-work.txt"
  text: string;
}

/** POST /api/analyze response: AnalysisResult. GET /api/dataset response: Dataset. */
