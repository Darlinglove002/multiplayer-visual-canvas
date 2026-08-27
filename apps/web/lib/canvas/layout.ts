"use client";

import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

const NODE_W = 184;
const NODE_H = 52;

/**
 * Lays out a set of nodes with elk (layered, top-down) and returns each node's
 * top-left position, normalized so the bounding box starts at (0, 0). The
 * caller offsets it into free canvas space. Claude never sees or picks x/y.
 */
export async function layoutSubgraph(
  nodeIds: string[],
  edges: { source: string; target: string }[],
): Promise<Map<string, { x: number; y: number }>> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodeIds.length === 0) return positions;

  const idSet = new Set(nodeIds);
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "60",
      "elk.spacing.nodeNode": "44",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children: nodeIds.map((id) => ({ id, width: NODE_W, height: NODE_H })),
    edges: edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e, i) => ({ id: `elk-e-${i}`, sources: [e.source], targets: [e.target] })),
  };

  const laidOut = await elk.layout(graph);
  let minX = Infinity;
  let minY = Infinity;
  for (const c of laidOut.children ?? []) {
    minX = Math.min(minX, c.x ?? 0);
    minY = Math.min(minY, c.y ?? 0);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  for (const c of laidOut.children ?? []) {
    positions.set(c.id, { x: (c.x ?? 0) - minX, y: (c.y ?? 0) - minY });
  }
  return positions;
}
