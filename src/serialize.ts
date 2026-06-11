import type { CanvasProjection } from "./types";

export type McuProjectFiles = {
  projectJson: Record<string, unknown>;
  layoutJson: Record<string, unknown>;
};

export function projectionToMcuFiles(
  projection: CanvasProjection,
): McuProjectFiles {
  const boards = Object.fromEntries(
    projection.nodes
      .filter((n) => n.kind === "board")
      .map((n) => [n.id, { definition: n.definition }]),
  );

  const components = Object.fromEntries(
    projection.nodes
      .filter((n) => n.kind === "component")
      .map((n) => [n.id, { definition: n.definition }]),
  );

  const connections = Object.fromEntries(
    projection.edges.map((e) => {
      const conn: Record<string, unknown> = {
        from: `${e.fromNode}.${e.fromPort}`,
        to: `${e.toNode}.${e.toPort}`,
        kind: e.label.toLowerCase(),
      };
      if (e.description) {
        conn.description = e.description;
      }
      return [e.id, conn];
    }),
  );

  const projectJson: Record<string, unknown> = {
    name: projection.projectName,
    boards,
    components,
    connections,
  };

  const layoutNodes: Record<string, unknown> = {};
  for (const node of projection.nodes) {
    layoutNodes[node.id] = {
      position: { x: node.position.x, y: node.position.y },
    };
  }

  const layoutJson: Record<string, unknown> = {
    version: 1,
    nodes: layoutNodes,
    viewport: {
      x: projection.viewport.x,
      y: projection.viewport.y,
      zoom: projection.viewport.zoom,
    },
  };

  return { projectJson, layoutJson };
}
