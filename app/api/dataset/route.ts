// DATA lane. GET /api/dataset -> Dataset (the raw "before" view for the UI).
import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/data/loadDataset";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await loadDataset());
}
