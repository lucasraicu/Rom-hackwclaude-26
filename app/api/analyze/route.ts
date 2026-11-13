// AI lane. POST /api/analyze  body: AnalyzeRequest  ->  AnalysisResult
// FUNDPROOF_MOCK=1 returns fixtures so the UI never waits on Claude.
// FUNDPROOF_MOCK=cache returns the last known-good live run saved in data/cache (falls back to fixtures).
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import initial from "@/lib/fixtures/analysis.initial.json";
import afterFix from "@/lib/fixtures/analysis.after-fix.json";
import { runAnalysis } from "@/lib/pipeline";
import type { AnalysisResult, AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fromCache(fixed: boolean): Promise<AnalysisResult> {
  const file = path.join(process.cwd(), "data", "cache", fixed ? "analysis.after-fix.json" : "analysis.initial.json");
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as AnalysisResult;
    return { ...saved, mode: "cache" };
  } catch {
    console.warn(`[fundproof] ${path.basename(file)} not found in data/cache; serving the mock fixture instead`);
    return (fixed ? afterFix : initial) as AnalysisResult;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AnalyzeRequest;
  const fixed = !!body.timesheetsCsv;
  const mode = process.env.FUNDPROOF_MOCK;
  if (mode === "1" || mode === "cache") {
    await pause(1200); // feels like real work in the UI
    return NextResponse.json(mode === "cache" ? await fromCache(fixed) : ((fixed ? afterFix : initial) as AnalysisResult));
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to .env.local, or set FUNDPROOF_MOCK=1 (or =cache) to run without Claude." },
      { status: 500 },
    );
  }
  try {
    const started = Date.now();
    const result = await runAnalysis({ timesheetsCsv: body.timesheetsCsv });
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
