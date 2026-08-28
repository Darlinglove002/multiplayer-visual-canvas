import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiGraphSchema, type AiGraph, type CanvasSnapshot } from "@canvas/shared";
import { GENERATE_SYSTEM_PROMPT, buildUserContent } from "./prompt";

// Sonnet handles this bounded structured-generation task well, faster and
// ~5x cheaper than Opus. Same model the ai-refund-ops-agent used.
const MODEL = "claude-sonnet-5";
const MAX_ATTEMPTS = 2;

export type GenerateOutcome =
  | { ok: true; graph: AiGraph }
  | {
      ok: false;
      reason: "auth" | "rate_limited" | "refusal" | "invalid_output" | "api_error";
    };

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * LLM proposes the graph (what blocks, what connections); everything after this
 * — id generation, edge resolution against the live doc, layout — is
 * deterministic code (see lib/canvas/apply-ai-graph.ts). Same split as the
 * ai-refund-ops-agent guardrail: the model's judgement, the code's guarantees.
 */
export async function generateGraph(
  prompt: string,
  snapshot: CanvasSnapshot,
): Promise<GenerateOutcome> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return { ok: false, reason: "auth" };
  }
  const userContent = buildUserContent(prompt, snapshot);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let message;
    try {
      message = await anthropic().messages.parse({
        model: MODEL,
        max_tokens: 8000,
        system: GENERATE_SYSTEM_PROMPT,
        output_config: { format: zodOutputFormat(aiGraphSchema) },
        messages: [{ role: "user", content: userContent }],
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, reason: "auth" };
      if (err instanceof Anthropic.RateLimitError) return { ok: false, reason: "rate_limited" };
      console.error("[ai/generate] API error", err);
      return { ok: false, reason: "api_error" };
    }

    if (message.stop_reason === "refusal") return { ok: false, reason: "refusal" };
    if (message.parsed_output && message.parsed_output.nodes.length > 0) {
      return { ok: true, graph: message.parsed_output };
    }
  }

  return { ok: false, reason: "invalid_output" };
}
