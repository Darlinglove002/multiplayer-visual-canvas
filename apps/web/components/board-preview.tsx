import type { CanvasSnapshot } from "@canvas/shared";

const NODE_W = 184;
const NODE_H = 48;
const PAD = 32;

/**
 * A schematic thumbnail of a board, drawn straight from the JSON snapshot the
 * sync server projects into Postgres. Outline-only so it reads on light and
 * dark; the colored accent bar is the node's own color.
 */
export function BoardPreview({
  snapshot,
  className,
}: {
  snapshot: CanvasSnapshot;
  className?: string;
}) {
  const nodes = snapshot?.nodes ?? [];
  const edges = snapshot?.edges ?? [];

  if (nodes.length === 0) {
    return (
      <div className={`grid place-items-center text-xs ${className ?? ""}`}>
        <span className="text-slate-400">empty board</span>
      </div>
    );
  }

  const minX = Math.min(...nodes.map((n) => n.x)) - PAD;
  const minY = Math.min(...nodes.map((n) => n.y)) - PAD;
  const maxX = Math.max(...nodes.map((n) => n.x)) + NODE_W + PAD;
  const maxY = Math.max(...nodes.map((n) => n.y)) + NODE_H + PAD;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      viewBox={`${minX} ${minY} ${Math.max(maxX - minX, 1)} ${Math.max(maxY - minY, 1)}`}
      preserveAspectRatio="xMidYMid meet"
      className={`text-slate-300 dark:text-slate-700 ${className ?? ""}`}
    >
      {edges.map((e) => {
        const s = byId.get(e.source);
        const t = byId.get(e.target);
        if (!s || !t) return null;
        return (
          <line
            key={e.id}
            x1={s.x + NODE_W / 2}
            y1={s.y + NODE_H}
            x2={t.x + NODE_W / 2}
            y2={t.y}
            stroke="currentColor"
            strokeWidth={3}
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect
            x={n.x}
            y={n.y}
            width={NODE_W}
            height={NODE_H}
            rx={10}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          />
          <rect x={n.x} y={n.y + 6} width={5} height={NODE_H - 12} rx={2.5} fill={n.color} />
        </g>
      ))}
    </svg>
  );
}
