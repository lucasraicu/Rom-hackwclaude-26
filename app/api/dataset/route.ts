// DATA lane. GET /api/dataset -> Dataset (the raw "before" view for the UI).
import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/data/loadDataset";
import { parseUploadedFile } from "@/lib/data/parseFiles";
import { normalizeUpload } from "@/lib/data/normalizeUpload";
import { getUploadedDataset, saveUploadedDataset } from "@/lib/data/uploadStore";
import { UPLOAD_LIMITS, UploadError } from "@/lib/data/uploadTypes";
import { buildMockAnalysis } from "@/lib/data/mockAnalysis";

function withMockAnalysis(record: Awaited<ReturnType<typeof getUploadedDataset>>) {
  return process.env.FUNDPROOF_MOCK === "1" && record.readyForAnalysis
    ? { ...record, mockAnalysis: buildMockAnalysis(record.dataset) }
    : record;
}

export const runtime = "nodejs";

export async function GET(request?: Request) {
  try {
    const datasetId = request ? new URL(request.url).searchParams.get("datasetId") : null;
    if (datasetId !== null) return NextResponse.json(withMockAnalysis(await getUploadedDataset(datasetId)), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await loadDataset());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: err instanceof UploadError ? err.status : 500 });
  }
}

/** Bound the body before multipart decoding, including requests without Content-Length. */
async function readForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new UploadError("Send files as multipart/form-data.", 415);
  const maximum = UPLOAD_LIMITS.totalBytes + 1024 * 1024;
  if (Number(request.headers.get("content-length")) > maximum) throw new UploadError("Upload exceeds the 40 MB bundle limit.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new UploadError("No upload body was provided.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new UploadError("Upload exceeds the 40 MB bundle limit.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new UploadError("Could not read multipart form data."); }
}

export async function POST(request: Request) {
  try {
    const form = await readForm(request);
    const files = [...form.getAll("files"), ...form.getAll("files[]")].filter((value): value is File => typeof value !== "string");
    if (!files.length) throw new UploadError("Select at least one file using the files form field.");
    if (files.length > UPLOAD_LIMITS.files) throw new UploadError(`Upload at most ${UPLOAD_LIMITS.files} files.`);
    if (new Set(files.map((file) => file.name)).size !== files.length) throw new UploadError("Uploaded filenames must be unique so source citations are unambiguous.");
    if (files.reduce((sum, file) => sum + file.size, 0) > UPLOAD_LIMITS.totalBytes) throw new UploadError("Upload exceeds the 40 MB bundle limit.", 413);
    const metadata = (name: string, maximum: number) => {
      const value = form.get(name);
      if (value !== null && (typeof value !== "string" || value.length > maximum)) throw new UploadError(`Invalid ${name} field.`);
      return typeof value === "string" ? value : undefined;
    };
    const options = { org: metadata("org", 200), period: metadata("period", 7) };
    const documents = [];
    // Sequential extraction limits peak memory for PDFs and workbooks.
    for (const file of files) documents.push(await parseUploadedFile(file));
    const normalized = normalizeUpload(documents, options);
    const stored = await saveUploadedDataset(normalized);
    return NextResponse.json(withMockAnalysis(stored), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOSPC") {
      return NextResponse.json({ error: "Not enough local disk space to save this upload. Free some space and try again." }, { status: 507 });
    }
    const message = error instanceof Error ? error.message : "Could not ingest uploaded documents.";
    return NextResponse.json({ error: message }, { status: error instanceof UploadError ? error.status : 500 });
  }
}
