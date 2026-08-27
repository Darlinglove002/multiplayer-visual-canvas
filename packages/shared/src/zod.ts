import { z } from "zod";
import { NODE_KINDS } from "./types";

export const nodeKindSchema = z.enum(NODE_KINDS);

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected a #rrggbb hex color");

export const snapshotNodeSchema = z.object({
  id: z.string().min(1),
  kind: nodeKindSchema,
  x: z.number().finite(),
  y: z.number().finite(),
  color: hexColorSchema,
  content: z.string().max(2000),
});

export const snapshotEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().max(120).optional(),
});

export const canvasSnapshotSchema = z.object({
  nodes: z.array(snapshotNodeSchema),
  edges: z.array(snapshotEdgeSchema),
});

export const AI_MAX_NODES = 24;
export const AI_MAX_EDGES = 48;

/**
 * The only shape the AI layer may return — and it is ADD-ONLY by construction:
 *
 * - No ids, no coordinates. The client regenerates ids (`ai_<nanoid>`) and elk
 *   assigns layout, so the model can never target, move, or delete an existing
 *   element — only propose new ones.
 * - `label` is always a string ("" when none) — no optional fields, so it maps
 *   cleanly to a strict structured-output schema.
 * - An edge endpoint is either a new node's `tempId` or an existing live node
 *   id. Resolution + dangling-edge pruning happen at apply time, inside one
 *   Y.Doc transaction, against the *live* doc (not the possibly-stale snapshot
 *   the model was shown).
 */
// Array length isn't constrained in the schema — some structured-output
// backends reject minItems/maxItems. The system prompt states the cap and the
// client applier clamps to AI_MAX_NODES / AI_MAX_EDGES.
export const aiGraphSchema = z.object({
  nodes: z.array(
    z.object({
      tempId: z.string().min(1).max(64),
      kind: nodeKindSchema,
      content: z.string().min(1).max(200),
    }),
  ),
  edges: z.array(
    z.object({
      source: z.string().min(1).max(64),
      target: z.string().min(1).max(64),
      label: z.string().max(80),
    }),
  ),
});

export type AiGraph = z.infer<typeof aiGraphSchema>;
export type AiGraphNode = AiGraph["nodes"][number];
export type AiGraphEdge = AiGraph["edges"][number];
