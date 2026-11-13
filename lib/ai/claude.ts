// AI lane. One place for the Claude client and the structured-output call.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic()); // reads ANTHROPIC_API_KEY from .env.local

type UserContent = Anthropic.Beta.Messages.BetaContentBlockParam[];

/**
 * Calls Claude and returns output parsed against a zod schema.
 * Server-side refusal fallback is on ("default" routing), so a rare refusal
 * is retried on a fallback model inside the same call.
 */
export async function callStructured<S extends z.ZodType>(opts: {
  system: string;
  content: UserContent;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const res = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "no details"}`);
  if (res.stop_reason === "max_tokens") throw new Error("Claude hit max_tokens; raise maxTokens");
  if (!res.parsed_output) throw new Error("Claude returned no parseable output");
  return res.parsed_output as z.infer<S>;
}

export function pdfBlock(base64: string, title: string): Anthropic.Beta.Messages.BetaContentBlockParam {
  return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 }, title };
}
