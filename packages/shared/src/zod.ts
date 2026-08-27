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

/**
 * The only shape the AI layer is allowed to return: ADD-ONLY.
 *
 * - No ids, no coordinates. The client regenerates ids (`ai_<nanoid>`) and elk
 *   assigns layout, so the model can never target or move an existing element.
 * - Edge endpoints reference either a new node's `tempId` or an existing live
 *   node id. Resolution + dangling-edge pruning happen at apply time inside a
 *   single Y.Doc transaction, checked against the live doc (not the snapshot
 *   the model saw, which may already be stale).
 */
export const aiPatchSchema = z.object({
  addNodes: z
    .array(
      z.object({
        tempId: z.string().min(1).max(64),
        kind: nodeKindSchema,
        content: z.string().min(1).max(2000),
      }),
    )
    .max(40),
  addEdges: z
    .array(
      z.object({
        source: z.string().min(1).max(64),
        target: z.string().min(1).max(64),
        label: z.string().max(120).optional(),
      }),
    )
    .max(80),
});

export type AiPatch = z.infer<typeof aiPatchSchema>;
export type AiPatchNode = AiPatch["addNodes"][number];
export type AiPatchEdge = AiPatch["addEdges"][number];
