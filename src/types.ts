export type CanvasPort = { id: string; label: string; kind: string; description?: string };
export type CanvasNode = {
  id: string;
  instanceId: string;
  label: string;
  kind: "board" | "component";
  definition: string;
  description?: string;
  ports: CanvasPort[];
  position: { x: number; y: number };
};
export type CanvasEdge = {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
  label: string;
  description?: string;
};
export type CanvasProjection = {
  projectName: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: { x: number; y: number; zoom: number };
  status: { level: "ready" | "degraded" | "error"; messages: string[] };
};
