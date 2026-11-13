import type { AnalysisResult, Dataset, FundCode } from "../types";

export interface UploadSource {
  documentId: string;
  filename: string;
  page?: number;
  sheet?: string;
  row?: number;
  column?: string;
}

export interface UploadTable {
  sheet?: string;
  columns: string[];
  rows: string[][];
}

export interface UploadedDocument {
  id: string;
  filename: string;
  mimeType: string;
  kind: "grant" | "transactions" | "payroll" | "timesheet" | "receipt" | "email" | "supporting" | "unknown";
  parseStatus: "parsed" | "unsupported" | "error";
  warnings: string[];
  pages?: string[];
  tables?: UploadTable[];
  text?: string;
  fundCode?: FundCode;
  linkedItemIds?: string[];
}

export interface UploadedDataset {
  datasetId: string;
  dataset: Dataset;
  documents: UploadedDocument[];
  warnings: string[];
  readyForAnalysis: boolean;
  missingRequirements: string[];
  createdAt: string;
  expiresAt: string;
  /** Immediate simulated response when the server is explicitly in mock mode. */
  mockAnalysis?: AnalysisResult;
}

export const UPLOAD_LIMITS = {
  files: 20,
  fileBytes: 10 * 1024 * 1024,
  totalBytes: 40 * 1024 * 1024,
  pages: 100,
  rows: 5000,
  columns: 100,
  textCharacters: 500000,
  expandedXlsxBytes: 32 * 1024 * 1024,
  lifetimeMs: 6 * 60 * 60 * 1000,
} as const;

export class UploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
