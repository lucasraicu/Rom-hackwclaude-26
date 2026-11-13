// AI lane. POST /api/analyze  body: AnalyzeRequest  ->  AnalysisResult
// FUNDPROOF_MOCK=1 returns fixtures so the UI never waits on Claude.
import { NextResponse } from "next/server";
import initial from "@/lib/fixtures/analysis.initial.json";
import afterFix from "@/lib/fixtures/analysis.after-fix.json";
import { runAnalysis } from "@/lib/pipeline";
import type { AnalysisResult, AnalyzeRequest } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as AnalyzeRequest;
  if (process.env.FUNDPROOF_MOCK === "1") {
    await pause(1200); // feels like real work in the UI
    return NextResponse.json((body.timesheetsCsv ? afterFix : initial) as AnalysisResult);
  }
  try {
    return NextResponse.json(await runAnalysis({ timesheetsCsv: body.timesheetsCsv }));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
