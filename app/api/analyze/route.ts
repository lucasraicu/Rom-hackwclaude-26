// AI lane. POST /api/analyze  body: AnalyzeRequest  ->  AnalysisResult
// datasetId (uploaded files) is analyzed only in mock mode by lib/data/mockAnalysis.ts; never served demo fixtures.
// FUNDPROOF_MOCK=1 returns fixtures so the UI never waits on Claude.
// FUNDPROOF_MOCK=cache returns the recorded Claude run for this input from data/cache (initial and after-fix fall back to fixtures).
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import initial from "@/lib/fixtures/analysis.initial.json";
import afterFix from "@/lib/fixtures/analysis.after-fix.json";
import { runAnalysis } from "@/lib/pipeline";
import type { AnalysisResult, AnalyzeRequest } from "@/lib/types";
import { loadUploadedDataset } from "@/lib/data/uploadStore";
import { UploadError } from "@/lib/data/uploadTypes";
import { buildMockAnalysis } from "@/lib/data/mockAnalysis";

export const runtime = "nodejs";
export const maxDuration = 300;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Scenario = "initial" | "after-fix" | "scope-of-work";

/** Each demo input maps to one recorded run (scripts/replay-claude-runs.ts writes them). */
function scenarioFor(body: AnalyzeRequest): Scenario {
  if (body.supportingDocs?.length) return "scope-of-work";
  return body.timesheetsCsv ? "after-fix" : "initial";
}

async function fromCache(scenario: Scenario): Promise<AnalysisResult> {
  const file = path.join(process.cwd(), "data", "cache", `analysis.${scenario}.json`);
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as AnalysisResult;
    return { ...saved, mode: "cache" };
  } catch {
    if (scenario === "scope-of-work") throw new Error(`No recorded run in data/cache/${path.basename(file)}. Run npx tsx scripts/replay-claude-runs.ts.`);
    console.warn(`[fundproof] ${path.basename(file)} not found in data/cache; serving the mock fixture instead`);
    return (scenario === "after-fix" ? afterFix : initial) as AnalysisResult;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AnalyzeRequest;
  const fixed = !!body.timesheetsCsv;
  const mode = process.env.FUNDPROOF_MOCK;
  if (body.datasetId !== undefined) {
    if (typeof body.datasetId !== "string" || !body.datasetId.trim()) {
      return NextResponse.json({ error: "datasetId must be a non-empty string." }, { status: 400 });
    }
    if (mode !== "1" && mode !== "cache") {
      return NextResponse.json(
        { error: "Uploaded datasets can only be analyzed in mock mode today. Set FUNDPROOF_MOCK=1 and restart." },
        { status: 501 },
      );
    }
    try {
      const ds = await loadUploadedDataset(body.datasetId);
      await pause(1200);
      return NextResponse.json(buildMockAnalysis(ds));
    } catch (err) {
      const status = err instanceof UploadError ? err.status : 500;
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status });
    }
  }
  if (mode === "1" || mode === "cache") {
    await pause(1200); // feels like real work in the UI
    if (mode === "1") return NextResponse.json((fixed ? afterFix : initial) as AnalysisResult);
    try {
      return NextResponse.json(await fromCache(scenarioFor(body)));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 503 });
    }
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local, or set FUNDPROOF_MOCK=1 (or =cache) to run without Claude." },
      { status: 500 },
    );
  }
  try {
    const started = Date.now();
    const result = await runAnalysis({ timesheetsCsv: body.timesheetsCsv, supportingDocs: body.supportingDocs });
    console.log(`[fundproof] live analysis (${fixed ? "after fix" : "initial"}) took ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const message = accountProblem(err) ?? (err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const FALLBACK = "Set FUNDPROOF_MOCK=1 (or =cache) in .env.local and restart to demo without Claude.";

/** Bad key or an account with no credits: say so plainly instead of passing on the raw SDK error. */
function accountProblem(err: unknown): string | null {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return `The Anthropic API rejected ANTHROPIC_API_KEY (${err.status}). Check the key. ${FALLBACK}`;
  }
  if (err instanceof Anthropic.BadRequestError && /credit balance|billing/i.test(err.message)) {
    return `The Anthropic account has no API credits left. Add credits in the Console. ${FALLBACK}`;
  }
  return null;
}
