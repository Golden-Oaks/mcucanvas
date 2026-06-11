import type { CanvasPort, CanvasEdge, CanvasProjection } from "./types";

// ── helpers ──────────────────────────────────────────────────────────────────

function cloneProjection(p: CanvasProjection): CanvasProjection {
  return {
    ...p,
    nodes: p.nodes.map((n) => ({ ...n, position: { ...n.position }, ports: [...n.ports] })),
    edges: [...p.edges],
    viewport: { ...p.viewport },
    status: { ...p.status, messages: [...p.status.messages] },
  };
}

function normalizedPortKind(kind: string): string {
  const v = kind.toLowerCase().trim();
  if (["gpio", "signal", "digital", "io"].includes(v)) return "gpio";
  if (["power", "vcc", "3v3", "3.3v", "vin"].includes(v)) return "power";
  if (["ground", "gnd"].includes(v)) return "ground";
  return v;
}

export function connectionKind(
  fromKind: string,
  toKind: string,
): string | null {
  const a = normalizedPortKind(fromKind);
  const b = normalizedPortKind(toKind);
  if (a === b) return a;
  if ((a === "power" && b === "power") || (a === "ground" && b === "ground"))
    return a;
  return null; // incompatible
}

function sanitizeConnectionId(
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
  existingIds: Set<string>,
): string {
  const base =
    `${fromNode}_${fromPort}_to_${toNode}_${toPort}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "connection";
  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter++;
  }
  return candidate;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function generateNodeId(
  definition: string,
  existingIds: Set<string>,
): string {
  const lastSegment = definition.includes("/")
    ? definition.split("/").pop()!
    : definition;
  const base = slugify(lastSegment) || "node";
  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}_${counter}`;
    counter++;
  }
  return candidate;
}

function fail(projection: CanvasProjection, message: string): MutationResult {
  return { ok: false, projection, message };
}

function succeed(projection: CanvasProjection, message: string): MutationResult {
  return { ok: true, projection, message };
}

// ── types ────────────────────────────────────────────────────────────────────

export type CanvasCommand =
  | {
      action: "connect";
      fromNode: string;
      fromPort: string;
      toNode: string;
      toPort: string;
    }
  | { action: "disconnect"; edgeId: string }
  | { action: "layout"; nodeId: string; x: number; y: number }
  | {
      action: "addNode";
      kind: "board" | "component";
      definition: string;
      x?: number;
      y?: number;
      ports?: CanvasPort[];
      label?: string;
    }
  | { action: "removeNode"; nodeId: string };

export type MutationResult = {
  ok: boolean;
  projection: CanvasProjection;
  message: string;
};

// ── mutators ─────────────────────────────────────────────────────────────────

export function connectPorts(
  projection: CanvasProjection,
  c: { fromNode: string; fromPort: string; toNode: string; toPort: string },
): MutationResult {
  const fromNode = projection.nodes.find((n) => n.id === c.fromNode);
  const toNode = projection.nodes.find((n) => n.id === c.toNode);

  if (!fromNode) return fail(projection, `Node "${c.fromNode}" not found.`);
  if (!toNode) return fail(projection, `Node "${c.toNode}" not found.`);

  if (c.fromNode === c.toNode)
    return fail(projection, "Cannot connect a node to itself.");

  const fromPort = fromNode.ports.find((p) => p.id === c.fromPort);
  const toPort = toNode.ports.find((p) => p.id === c.toPort);

  if (!fromPort)
    return fail(
      projection,
      `Port "${c.fromPort}" not found on node "${c.fromNode}".`,
    );
  if (!toPort)
    return fail(
      projection,
      `Port "${c.toPort}" not found on node "${c.toNode}".`,
    );

  const kind = connectionKind(fromPort.kind, toPort.kind);
  if (kind === null)
    return fail(
      projection,
      `Incompatible port kinds: "${fromPort.kind}" and "${toPort.kind}".`,
    );

  const duplicate = projection.edges.some(
    (e) =>
      e.fromNode === c.fromNode &&
      e.fromPort === c.fromPort &&
      e.toNode === c.toNode &&
      e.toPort === c.toPort,
  );
  if (duplicate)
    return fail(projection, "An identical connection already exists.");

  const existingIds = new Set(projection.edges.map((e) => e.id));
  const id = sanitizeConnectionId(
    c.fromNode,
    c.fromPort,
    c.toNode,
    c.toPort,
    existingIds,
  );

  const edge: CanvasEdge = {
    id,
    fromNode: c.fromNode,
    fromPort: c.fromPort,
    toNode: c.toNode,
    toPort: c.toPort,
    label: kind.toUpperCase(),
  };

  const next = cloneProjection(projection);
  next.edges = [...next.edges, edge];
  return succeed(next, `Connected ${c.fromNode}.${c.fromPort} → ${c.toNode}.${c.toPort}.`);
}

export function disconnectEdge(
  projection: CanvasProjection,
  edgeId: string,
): MutationResult {
  const idx = projection.edges.findIndex((e) => e.id === edgeId);
  if (idx === -1) return fail(projection, `Edge "${edgeId}" not found.`);

  const next = cloneProjection(projection);
  next.edges = next.edges.filter((_, i) => i !== idx);
  return succeed(next, `Disconnected "${edgeId}".`);
}

export function moveNode(
  projection: CanvasProjection,
  nodeId: string,
  position: { x: number; y: number },
): MutationResult {
  const idx = projection.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return fail(projection, `Node "${nodeId}" not found.`);

  if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
    return fail(projection, "Position coordinates must be finite numbers.");

  const next = cloneProjection(projection);
  next.nodes[idx] = { ...next.nodes[idx], position: { ...position } };
  return succeed(next, `Moved "${nodeId}" to (${position.x}, ${position.y}).`);
}

export function addNode(
  projection: CanvasProjection,
  input: {
    kind: "board" | "component";
    definition: string;
    x?: number;
    y?: number;
    ports?: CanvasPort[];
    label?: string;
  },
): MutationResult {
  const existingIds = new Set(projection.nodes.map((n) => n.id));
  const id = generateNodeId(input.definition, existingIds);

  const count = projection.nodes.length;
  const defaultX = 120 + (count % 3) * 280;
  const defaultY = 120 + Math.floor(count / 3) * 180;

  const node = {
    id,
    instanceId: id,
    label: input.label ?? id,
    kind: input.kind,
    definition: input.definition,
    ports: input.ports ?? [],
    position: {
      x: input.x ?? defaultX,
      y: input.y ?? defaultY,
    },
  };

  const next = cloneProjection(projection);
  next.nodes = [...next.nodes, node];
  return succeed(next, `Added ${input.kind} "${id}".`);
}

export function removeNode(
  projection: CanvasProjection,
  nodeId: string,
): MutationResult {
  const idx = projection.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) return fail(projection, `Node "${nodeId}" not found.`);

  const next = cloneProjection(projection);
  next.nodes = next.nodes.filter((_, i) => i !== idx);
  next.edges = next.edges.filter(
    (e) => e.fromNode !== nodeId && e.toNode !== nodeId,
  );
  return succeed(next, `Removed "${nodeId}".`);
}

// ── dispatcher ───────────────────────────────────────────────────────────────

export function applyCommand(
  projection: CanvasProjection,
  command: CanvasCommand,
): MutationResult {
  switch (command.action) {
    case "connect":
      return connectPorts(projection, {
        fromNode: command.fromNode,
        fromPort: command.fromPort,
        toNode: command.toNode,
        toPort: command.toPort,
      });
    case "disconnect":
      return disconnectEdge(projection, command.edgeId);
    case "layout":
      return moveNode(projection, command.nodeId, {
        x: command.x,
        y: command.y,
      });
    case "addNode":
      return addNode(projection, {
        kind: command.kind,
        definition: command.definition,
        x: command.x,
        y: command.y,
        ports: command.ports,
        label: command.label,
      });
    case "removeNode":
      return removeNode(projection, command.nodeId);
  }
}
