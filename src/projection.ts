import type { CanvasPort, CanvasNode, CanvasEdge, CanvasProjection } from "./types";

// ── internal types ───────────────────────────────────────────────────────────
type InstanceRecord = { definition?: unknown; config?: unknown };
type ProjectFile = {
  name?: unknown;
  boards?: unknown;
  components?: unknown;
  connections?: unknown;
};
type LayoutFile = {
  items?: unknown;
  nodes?: unknown;
  viewport?: unknown;
};
type DefinitionMetadata = { label?: string; description?: string; ports?: CanvasPort[] };

// ── constants ────────────────────────────────────────────────────────────────
const FALLBACK_PORTS: Record<string, CanvasPort[]> = {
  "core:board/raspberry-pi-pico": [
    { id: "gpio25", label: "GPIO25", kind: "gpio" },
    { id: "p3v3", label: "3V3", kind: "power" },
    { id: "gnd", label: "GND", kind: "ground" },
  ],
  "core:component/gpio-led": [{ id: "in", label: "Signal", kind: "gpio" }],
};

const DEFINITION_LABELS: Record<string, { label: string; description: string }> = {
  "core:board/raspberry-pi-pico": {
    label: "Raspberry Pi Pico",
    description: "Core MCU board definition",
  },
  "core:component/gpio-led": {
    label: "GPIO LED",
    description: "Core GPIO LED component",
  },
};

// ── pure posix-path helpers (no node:path, no node:fs) ───────────────────────
function posixDirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "." : p.slice(0, i);
}

function posixJoin(...segments: string[]): string {
  let result = "";
  for (const seg of segments) {
    if (!seg) continue;
    if (!result) {
      result = seg;
      continue;
    }
    result = result.replace(/\/+$/, "") + "/" + seg.replace(/^\/+/, "");
  }
  const parts = result.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/") || ".";
}

// ── pure helpers ─────────────────────────────────────────────────────────────
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePort(id: string, value: unknown): CanvasPort | null {
  if (!isRecord(value)) {
    return { id, label: id, kind: "signal" };
  }
  const portId = cleanString(value.id) ?? cleanString(value.name) ?? id;
  return {
    id: portId,
    label:
      cleanString(value.label) ??
      cleanString(value.displayName) ??
      cleanString(value.name) ??
      portId,
    kind:
      cleanString(value.kind) ??
      cleanString(value.type) ??
      cleanString(value.bus) ??
      "signal",
    description: cleanString(value.description),
  };
}

function normalizePorts(value: unknown): CanvasPort[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const port = normalizePort(String(index), entry);
      return port ? [port] : [];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([id, entry]) => {
      const port = normalizePort(id, entry);
      return port ? [port] : [];
    });
  }
  return [];
}

function collectDefinitionMetadata(
  source: unknown,
  definitions = new Map<string, DefinitionMetadata>(),
) {
  if (!isRecord(source) && !Array.isArray(source)) return definitions;
  if (Array.isArray(source)) {
    for (const item of source) collectDefinitionMetadata(item, definitions);
    return definitions;
  }

  const id =
    cleanString(source.definition) ??
    cleanString(source.id) ??
    cleanString(source.ref) ??
    cleanString(source.name);
  if (id?.includes("/")) {
    const existing = definitions.get(id) ?? {};
    const ports = normalizePorts(
      source.ports ?? source.pins ?? source.interfaces,
    );
    definitions.set(id, {
      label:
        cleanString(source.label) ??
        cleanString(source.displayName) ??
        cleanString(source.title) ??
        existing.label,
      description:
        cleanString(source.description) ??
        cleanString(source.summary) ??
        existing.description,
      ports: ports.length ? ports : existing.ports,
    });
  }

  for (const value of Object.values(source))
    collectDefinitionMetadata(value, definitions);
  return definitions;
}

async function collectCatalogAssetMetadata(
  catalogJson: unknown,
  readAsset: ((relPath: string) => Promise<unknown | null>) | undefined,
  metadata: Map<string, DefinitionMetadata>,
): Promise<void> {
  if (!isRecord(catalogJson)) return;
  const plugins = catalogJson.plugins;
  if (!Array.isArray(plugins)) return;

  type AssetTask = { relPath: string; pluginId: string; defKind: "board" | "component" };

  const tasks: AssetTask[] = plugins.flatMap((plugin) => {
    if (!isRecord(plugin)) return [];
    const manifest = isRecord(plugin.manifest) ? plugin.manifest : {};
    const pluginId = cleanString(manifest.id) ?? cleanString(plugin.folderName);
    if (!pluginId) return [];
    const manifestPath = cleanString(plugin.manifestPath);
    const pluginDir = manifestPath ? posixDirname(manifestPath) : "";
    const assets = Array.isArray(plugin.assets) ? plugin.assets : [];
    return assets.flatMap((asset) => {
      if (!isRecord(asset)) return [];
      const kind = cleanString(asset.kind);
      const defKind =
        kind === "board-definition"
          ? "board"
          : kind === "component-definition"
            ? "component"
            : null;
      if (!defKind) return [];
      const assetRelPath = cleanString(asset.path);
      if (!assetRelPath) return [];
      const relPath = pluginDir
        ? posixJoin(pluginDir, assetRelPath)
        : assetRelPath;
      return [{ relPath, pluginId, defKind }];
    });
  });

  const results = await Promise.all(
    tasks.map(async ({ relPath, pluginId, defKind }) => {
      const boardDef = readAsset ? await readAsset(relPath) : null;
      if (!isRecord(boardDef)) return null;
      const slug = cleanString(boardDef.slug);
      if (!slug) return null;
      return {
        id: `${pluginId}:${defKind}/${slug}`,
        boardDef,
        ports: normalizePorts(boardDef.ports),
      };
    }),
  );

  for (const result of results) {
    if (!result) continue;
    const { id, boardDef, ports } = result;
    const existing = metadata.get(id) ?? {};
    metadata.set(id, {
      label:
        existing.label ?? cleanString(boardDef.displayName),
      description:
        existing.description ?? cleanString(boardDef.description),
      ports:
        existing.ports?.length
          ? existing.ports
          : ports.length
            ? ports
            : existing.ports,
    });
  }
}

function definitionMeta(
  definition: string,
  kind: "board" | "component",
  metadata: Map<string, DefinitionMetadata>,
) {
  const enriched = metadata.get(definition);
  const fallback = DEFINITION_LABELS[definition];
  if (enriched?.label || enriched?.description) {
    return {
      label: enriched.label ?? fallback?.label ?? definition,
      description:
        enriched.description ??
        fallback?.description ??
        `${kind} definition ${definition}`,
    };
  }
  if (fallback) return fallback;
  const slug = definition.split("/").pop() ?? definition;
  return {
    label: slug
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: `${kind} definition ${definition}`,
  };
}

function portsFor(
  instanceId: string,
  definition: string,
  connections: Record<string, unknown>,
  metadata: Map<string, DefinitionMetadata>,
): CanvasPort[] {
  const known =
    metadata.get(definition)?.ports?.length
      ? metadata.get(definition)?.ports
      : FALLBACK_PORTS[definition];
  const inferred = new Set<string>();
  for (const connection of Object.values(connections)) {
    if (!isRecord(connection)) continue;
    for (const endpoint of [connection.from, connection.to]) {
      if (typeof endpoint !== "string") continue;
      const [node, port] = endpoint.split(".");
      if (node === instanceId && port) inferred.add(port);
    }
  }
  const inferredPorts = Array.from(inferred).map((port) => ({
    id: port,
    label: port,
    kind: "signal",
  }));
  return known
    ? Array.from(
        new Map(
          [...inferredPorts, ...known].map((port) => [port.id, port]),
        ).values(),
      )
    : inferredPorts;
}

function readPosition(layout: LayoutFile, id: string, index: number) {
  const items = isRecord(layout.items) ? layout.items : {};
  const nodes = isRecord(layout.nodes) ? layout.nodes : {};
  const entry = items[id] ?? nodes[id];
  if (isRecord(entry) && isRecord(entry.position)) {
    return {
      x:
        typeof entry.position.x === "number"
          ? entry.position.x
          : 120 + index * 220,
      y:
        typeof entry.position.y === "number"
          ? entry.position.y
          : 120 + index * 80,
    };
  }
  if (isRecord(entry)) {
    return {
      x: typeof entry.x === "number" ? entry.x : 120 + index * 220,
      y: typeof entry.y === "number" ? entry.y : 120 + index * 80,
    };
  }
  return { x: 120 + index * 220, y: 120 + index * 80 };
}

function readViewport(layout: LayoutFile) {
  const viewport = isRecord(layout.viewport) ? layout.viewport : {};
  return {
    x: typeof viewport.x === "number" ? viewport.x : 0,
    y: typeof viewport.y === "number" ? viewport.y : 0,
    zoom: typeof viewport.zoom === "number" ? viewport.zoom : 1,
  };
}

function projectInstances(project: ProjectFile) {
  const instances: Array<{
    id: string;
    kind: "board" | "component";
    record: InstanceRecord;
  }> = [];
  for (const [kind, collection] of [
    ["board", project.boards],
    ["component", project.components],
  ] as const) {
    if (!isRecord(collection)) continue;
    for (const [id, record] of Object.entries(collection)) {
      if (isRecord(record)) instances.push({ id, kind, record });
    }
  }
  return instances;
}

// ── public types ─────────────────────────────────────────────────────────────
export type McuProjectionInput = {
  projectJson: unknown; // mcu.json
  layoutJson?: unknown; // mcu.layout.json
  lockJson?: unknown; // mcu.lock.json
  catalogJson?: unknown; // .mcu/plugins/catalog.json
  messages?: string[]; // file-availability messages already built by the caller's reader
  readAsset?: (relPath: string) => Promise<unknown | null>; // reads per-plugin asset JSON; returns parsed value or null
};

// ── main export ──────────────────────────────────────────────────────────────
export async function projectionFromMcuFiles(
  input: McuProjectionInput,
): Promise<CanvasProjection> {
  const messages = [...(input.messages ?? [])];

  if (!isRecord(input.projectJson)) {
    return {
      projectName: "Unavailable MCU workspace",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      status: { level: "error", messages },
    };
  }

  const project = input.projectJson as ProjectFile;
  const layout = (isRecord(input.layoutJson) ? input.layoutJson : {}) as LayoutFile;
  const connections = isRecord(project.connections)
    ? (project.connections as Record<string, unknown>)
    : {};
  const metadata = collectDefinitionMetadata(input.lockJson);
  collectDefinitionMetadata(input.catalogJson, metadata);
  await collectCatalogAssetMetadata(input.catalogJson, input.readAsset, metadata);

  const nodes = projectInstances(project).map(({ id, kind, record }, index) => {
    const definition =
      typeof record.definition === "string" ? record.definition : "unknown";
    const meta = definitionMeta(definition, kind, metadata);
    return {
      id,
      instanceId: id,
      label: `${id} · ${meta.label}`,
      kind,
      definition,
      description: meta.description,
      ports: portsFor(id, definition, connections, metadata),
      position: readPosition(layout, id, index),
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = Object.entries(connections).flatMap(([id, connection]) => {
    if (
      !isRecord(connection) ||
      typeof connection.from !== "string" ||
      typeof connection.to !== "string"
    )
      return [];
    const [fromNode, fromPort] = connection.from.split(".");
    const [toNode, toPort] = connection.to.split(".");
    if (!nodeIds.has(fromNode) || !nodeIds.has(toNode)) {
      messages.push(`Connection ${id} references a missing instance.`);
      return [];
    }
    const kind = typeof connection.kind === "string" ? connection.kind : "link";
    return [
      {
        id,
        fromNode,
        fromPort,
        toNode,
        toPort,
        label: kind.toUpperCase(),
        description:
          typeof connection.description === "string"
            ? connection.description
            : undefined,
      },
    ];
  });

  const hasSafetyFailure = messages.some((message) =>
    message.includes("failed workspace safety checks"),
  );
  return {
    projectName:
      typeof project.name === "string" ? project.name : "MCU workspace",
    nodes,
    edges,
    viewport: readViewport(layout),
    status: {
      level:
        hasSafetyFailure || messages.some((message) => message.includes("mcu.json"))
          ? "error"
          : messages.length
            ? "degraded"
            : "ready",
      messages,
    },
  };
}
