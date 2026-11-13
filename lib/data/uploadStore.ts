import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { UPLOAD_LIMITS, UploadError, type UploadedDataset } from "./uploadTypes";

export const UPLOAD_STORE_DIR = path.join(os.tmpdir(), "fundproof-uploads", createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16));
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

export async function saveUploadedDataset(input: Omit<UploadedDataset, "datasetId" | "createdAt" | "expiresAt">): Promise<UploadedDataset> {
  await fs.mkdir(UPLOAD_STORE_DIR, { recursive: true, mode: 0o700 });
  const now = Date.now();
  const files = (await fs.readdir(UPLOAD_STORE_DIR)).filter((name) => name.endsWith(".json"));
  let active = 0;
  for (const file of files) {
    const location = path.join(UPLOAD_STORE_DIR, file);
    const stat = await fs.stat(location).catch(() => null);
    if (stat && now - stat.mtimeMs > UPLOAD_LIMITS.lifetimeMs) await fs.unlink(location).catch(() => {});
    else active++;
  }
  if (active >= 100) throw new UploadError("Temporary upload storage is full. Try again after older uploads expire.", 503);
  const record: UploadedDataset = { ...input, datasetId: randomUUID(), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + UPLOAD_LIMITS.lifetimeMs).toISOString() };
  const content = JSON.stringify(record);
  if (Buffer.byteLength(content) > UPLOAD_LIMITS.totalBytes) throw new UploadError("The extracted dataset exceeds the storage size limit.", 413);
  const file = path.join(UPLOAD_STORE_DIR, `${record.datasetId}.json`);
  const temporary = file + ".tmp";
  try {
    await fs.writeFile(temporary, content, { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }
  return record;
}

export async function getUploadedDataset(id: string): Promise<UploadedDataset> {
  if (!validId(id)) throw new UploadError("Invalid uploaded dataset ID.");
  let content: string;
  try { content = await fs.readFile(path.join(UPLOAD_STORE_DIR, `${id}.json`), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new UploadError("Uploaded dataset was not found; upload the files again.", 404);
    throw error;
  }
  const record: UploadedDataset = JSON.parse(content);
  if (!Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= Date.now()) {
    throw new UploadError("Uploaded dataset expired; upload the files again.", 410);
  }
  return record;
}

/** AI-owned analysis entrypoint uses this rather than the bundled demo loader. */
export async function loadUploadedDataset(id: string) {
  const record = await getUploadedDataset(id);
  if (!record.readyForAnalysis) throw new UploadError(record.missingRequirements.join(" ") || "Uploaded records need review before analysis.", 422);
  return record.dataset;
}
