"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  applyNodeChanges,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeChange,
  type Connection,
} from "@xyflow/react";
// NOTE: the consumer must include ReactFlow's stylesheet once globally, e.g.
//   @import "@xyflow/react/dist/style.css";   (in your global CSS)
// The library deliberately does NOT import the CSS here so it stays consumable
// from Node / SSR / test runners that can't load .css modules.
import { CanvasNodeCard } from "./CanvasNodeCard";
import type { CanvasNodeCardData } from "./CanvasNodeCard";
import type { CanvasProjection, CanvasEdge, CanvasNode } from "./types";
import { applyCommand, connectionKind } from "./mutations";
import type { CanvasCommand } from "./mutations";

// ── helpers ──────────────────────────────────────────────────────────────────

function projectPortId(handleId: string): string {
  return handleId.replace(/:(source|target)$/, "");
}

function buildConnectedPortsByNode(
  edges: CanvasEdge[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const edge of edges) {
    const fromSet =
      map.get(edge.fromNode) ?? map.set(edge.fromNode, new Set()).get(edge.fromNode)!;
    fromSet.add(edge.fromPort);
    const toSet =
      map.get(edge.toNode) ?? map.set(edge.toNode, new Set()).get(edge.toNode)!;
    toSet.add(edge.toPort);
  }
  return map;
}

function buildPortPeersByNode(
  edges: CanvasEdge[],
): Map<string, Record<string, string[]>> {
  const map = new Map<string, Record<string, string[]>>();
  for (const edge of edges) {
    for (const [nodeId, portId, peer] of [
      [edge.fromNode, edge.fromPort, edge.toNode] as const,
      [edge.toNode, edge.toPort, edge.fromNode] as const,
    ]) {
      const peers =
        map.get(nodeId) ?? map.set(nodeId, {}).get(nodeId)!;
      (peers[portId] ??= []).push(peer);
    }
  }
  return map;
}

function buildFlowEdges(
  edges: CanvasEdge[],
  draftPort: { nodeId: string; portId: string } | null,
  selectedEdgeId: string | undefined,
): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    sourceHandle: `${edge.fromPort}:source`,
    target: edge.toNode,
    targetHandle: `${edge.toPort}:target`,
    label: edge.label,
    selected: selectedEdgeId === edge.id,
    animated:
      draftPort?.nodeId === edge.fromNode &&
      draftPort.portId === edge.fromPort,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: {
      stroke: selectedEdgeId === edge.id ? "#2563eb" : "#64748b",
      strokeWidth: selectedEdgeId === edge.id ? 3 : 2,
    },
    labelStyle: { fill: "#475569", fontSize: 12, fontWeight: 600 },
    labelBgStyle: {
      fill: "rgba(255,255,255,0.94)",
      stroke: "#e2e8f0",
    },
    labelBgPadding: [8, 4] as [number, number],
    labelBgBorderRadius: 999,
    ariaLabel: `${edge.fromNode}.${edge.fromPort} → ${edge.toNode}.${edge.toPort} · ${edge.label}`,
  }));
}

function visiblePortIdsFor(
  node: CanvasNode,
  connectedPortsByNode: Map<string, Set<string>>,
  pinnedPorts: Record<string, string[]>,
  draftPort: { nodeId: string; portId: string } | null,
): string[] {
  if (node.ports.length <= 3) return node.ports.map((p) => p.id);
  const visible = new Set(connectedPortsByNode.get(node.id) ?? []);
  for (const id of pinnedPorts[node.id] ?? []) visible.add(id);
  if (draftPort?.nodeId === node.id) visible.add(draftPort.portId);
  return node.ports.flatMap((p) => (visible.has(p.id) ? [p.id] : []));
}

// ── types ────────────────────────────────────────────────────────────────────

export type CanvasSelection = {
  nodeId?: string;
  edgeId?: string;
  port?: { nodeId: string; portId: string };
};

export type McuCanvasEditorProps = {
  /** Authoritative / controlled projection. The editor keeps an internal
   *  optimistic copy for instant feedback; when this prop changes the editor
   *  reconciles back to the consumer's truth. */
  projection: CanvasProjection;
  /** Called after every successful mutation with the new projection and the
   *  command that produced it. The consumer typically persists to a server;
   *  the editor has already applied the change optimistically. */
  onChange?: (next: CanvasProjection, intent: CanvasCommand) => void;
  /** Optional controlled selection. When omitted the editor manages selection
   *  internally and still fires onSelectionChange. */
  selection?: CanvasSelection;
  /** Called whenever selection changes. */
  onSelectionChange?: (sel: CanvasSelection) => void;
  /** Disable all mutations (drag, connect, delete, etc.) when true. */
  readOnly?: boolean;
  /** Additional CSS classes for the wrapper div. */
  className?: string;
  /** Seam for external drag-drop (e.g. a library palette). Receives the
   *  flow-space position of the drop. The consumer is responsible for
   *  emitting an addNode command via onChange. */
  onPaneDrop?: (
    flowPosition: { x: number; y: number },
    event: React.DragEvent<HTMLElement>,
  ) => void;
  /** Render an off-screen accessible mirror of nodes/ports/edges (articles +
   *  buttons) alongside the ReactFlow canvas. ReactFlow does not render node
   *  internals under jsdom, so enable this in test/a11y contexts to get a
   *  deterministic, queryable representation of the graph. Default false. */
  a11yMirror?: boolean;
};

// ── inner pane-drop handler (needs ReactFlow context) ────────────────────────

function PaneDropHandler({
  onPaneDrop,
  children,
}: {
  onPaneDrop?: McuCanvasEditorProps["onPaneDrop"];
  children: React.ReactNode;
}) {
  const { screenToFlowPosition } = useReactFlow();

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onPaneDrop) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onPaneDrop(pos, e);
    },
    [onPaneDrop, screenToFlowPosition],
  );

  return (
    <div style={{ width: "100%", height: "100%" }} onDragOver={handleDragOver} onDrop={handleDrop}>
      {children}
    </div>
  );
}

// ── editor component ─────────────────────────────────────────────────────────

/**
 * Controlled, optimistic canvas editor that drives the existing CanvasNodeCard.
 *
 * **Requirement:** This component MUST be rendered inside a
 * `<SimulationStateProvider>` (from this same library) — do NOT wrap one
 * inside the editor. The consumer provides it.
 */
export function McuCanvasEditor({
  projection: controlledProjection,
  onChange,
  selection: controlledSelection,
  onSelectionChange,
  readOnly = false,
  className,
  onPaneDrop,
  a11yMirror = false,
}: McuCanvasEditorProps) {
  // ── optimistic state ─────────────────────────────────────────────────────

  const [optimistic, setOptimistic] = useState<CanvasProjection>(() => controlledProjection);
  // Track the previous PROP value (not the optimistic value). Adopt only when the
  // prop reference itself changes — i.e. the consumer fed an authoritative result
  // back in. This must NOT key off the optimistic state, or an async consumer's
  // in-flight optimistic edits would be reverted on the very next render.
  const prevPropRef = useRef<CanvasProjection>(controlledProjection);
  if (controlledProjection !== prevPropRef.current) {
    prevPropRef.current = controlledProjection;
    setOptimistic(controlledProjection);
  }

  // ── selection (controlled or internal) ───────────────────────────────────

  const [internalSelection, setInternalSelection] = useState<CanvasSelection>(
    () => controlledSelection ?? {},
  );

  const isSelectionControlled = controlledSelection !== undefined;
  const selection = isSelectionControlled ? controlledSelection : internalSelection;

  const setSelection = useCallback(
    (next: CanvasSelection) => {
      if (!isSelectionControlled) setInternalSelection(next);
      onSelectionChange?.(next);
    },
    [isSelectionControlled, onSelectionChange],
  );

  // ── derived selection details ────────────────────────────────────────────

  const selectedNode = useMemo(
    () =>
      selection.nodeId
        ? optimistic.nodes.find((n) => n.id === selection.nodeId) ?? null
        : null,
    [optimistic.nodes, selection.nodeId],
  );

  const selectedEdge = useMemo(
    () =>
      selection.edgeId
        ? optimistic.edges.find((e) => e.id === selection.edgeId) ?? null
        : null,
    [optimistic.edges, selection.edgeId],
  );

  const selectedPortDetails = useMemo(() => {
    if (!selection.port) return null;
    const node = optimistic.nodes.find((n) => n.id === selection.port!.nodeId);
    if (!node) return null;
    const port = node.ports.find((p) => p.id === selection.port!.portId);
    return port ? { node, port } : null;
  }, [optimistic.nodes, selection.port]);

  // ── draft wire ───────────────────────────────────────────────────────────

  const [draftPort, setDraftPort] = useState<{
    nodeId: string;
    portId: string;
    kind: string;
  } | null>(null);

  const compatibleWithDraft = useCallback(
    (nodeId: string, kind: string): boolean => {
      return Boolean(
        draftPort &&
          draftPort.nodeId !== nodeId &&
          connectionKind(draftPort.kind, kind) !== null,
      );
    },
    [draftPort],
  );

  // ── pinned ports ─────────────────────────────────────────────────────────

  const [pinnedPorts, setPinnedPorts] = useState<Record<string, string[]>>({});

  const addPinnedPort = useCallback(
    (nodeId: string, portId: string) => {
      setPinnedPorts((prev) => {
        const current = prev[nodeId] ?? [];
        if (current.includes(portId)) return prev;
        return { ...prev, [nodeId]: [...current, portId] };
      });
    },
    [],
  );

  const removePinnedPort = useCallback(
    (nodeId: string, portId: string) => {
      setPinnedPorts((prev) => {
        const current = prev[nodeId] ?? [];
        const next = current.filter((id) => id !== portId);
        return next.length === 0
          ? (() => { const { [nodeId]: _, ...rest } = prev; return rest; })()
          : { ...prev, [nodeId]: next };
      });
      // Clear draft / selection if they targeted this port
      setDraftPort((prev) =>
        prev?.nodeId === nodeId && prev.portId === portId ? null : prev,
      );
      if (selection.port?.nodeId === nodeId && selection.port.portId === portId) {
        setSelection({});
      }
    },
    [setSelection, selection],
  );

  // ── two-step destructive confirm ─────────────────────────────────────────

  const [pendingDestructive, setPendingDestructive] = useState<{
    action: "removeNode" | "disconnect";
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  // ── op message ───────────────────────────────────────────────────────────

  const [opMessage, setOpMessage] = useState<string | null>(null);

  // ── commit helper ───────────────────────────────────────────────────────

  const commit = useCallback(
    (command: CanvasCommand) => {
      if (readOnly) return;
      const result = applyCommand(optimistic, command);
      if (!result.ok) {
        setOpMessage(result.message);
        return;
      }
      setOptimistic(result.projection);
      setOpMessage(null);
      setPendingDestructive(null);
      onChange?.(result.projection, command);
    },
    [optimistic, readOnly, onChange],
  );

  // ── port click (draft wire two-phase) ────────────────────────────────────

  const onPortClick = useCallback(
    (nodeId: string, portId: string, kind: string, _event: MouseEvent) => {
      setSelection({ port: { nodeId, portId } });

      if (!draftPort) {
        setDraftPort({ nodeId, portId, kind });
        setOpMessage(`Connection draft started from ${nodeId}.${portId}…`);
        return;
      }

      if (
        draftPort.nodeId === nodeId ||
        connectionKind(draftPort.kind, kind) === null
      ) {
        setOpMessage(`Incompatible target ${nodeId}.${portId}…`);
        return;
      }

      commit({
        action: "connect",
        fromNode: draftPort.nodeId,
        fromPort: draftPort.portId,
        toNode: nodeId,
        toPort: portId,
      });
      setDraftPort(null);
    },
    [draftPort, commit, setSelection],
  );

  // ── flow data builders ───────────────────────────────────────────────────

  const connectedPortsByNode = useMemo(
    () => buildConnectedPortsByNode(optimistic.edges),
    [optimistic.edges],
  );

  const portPeersByNode = useMemo(
    () => buildPortPeersByNode(optimistic.edges),
    [optimistic.edges],
  );

  const flowEdges = useMemo(
    () => buildFlowEdges(optimistic.edges, draftPort, selection.edgeId),
    [optimistic.edges, draftPort, selection.edgeId],
  );

  // ── flow nodes (with drag-position preservation) ─────────────────────────

  const flowNodeForRef = useRef<
    (node: CanvasNode, current?: FlowNode) => FlowNode<CanvasNodeCardData>
  >(undefined);

  flowNodeForRef.current = (node, current) => ({
    id: node.id,
    type: "canvasNode",
    position: current?.position ?? node.position,
    selected: selection.nodeId === node.id,
    data: {
      node,
      draftPort: draftPort ? { ...draftPort } : null,
      compatibleWithDraft,
      visiblePortIds: visiblePortIdsFor(
        node,
        connectedPortsByNode,
        pinnedPorts,
        draftPort,
      ),
      connectedPortIds: [...(connectedPortsByNode.get(node.id) ?? [])],
      portPeers: portPeersByNode.get(node.id) ?? {},
      onAddPin: addPinnedPort,
      onRemovePin: removePinnedPort,
      onClick: () => setSelection({ nodeId: node.id }),
      onPortClick: (nid, pid, kind, evt) => {
        evt.stopPropagation();
        onPortClick(nid, pid, kind, evt);
      },
    },
  });

  const [flowNodes, setFlowNodes] = useState<FlowNode<CanvasNodeCardData>[]>(
    () => optimistic.nodes.map((n) => flowNodeForRef.current!(n)),
  );

  const prevDepsRef = useRef<{
    nodes: string;
    edges: string;
    draftPort: string;
    selectedNodeId: string;
    pinnedPorts: string;
  }>({
    nodes: "",
    edges: "",
    draftPort: "",
    selectedNodeId: "",
    pinnedPorts: "",
  });

  // Fingerprint helpers for efficient dep comparison
  const nodesFp = useMemo(
    () =>
      optimistic.nodes
        .map((n) => `${n.id}|${n.ports.map((p) => p.id).join(",")}`)
        .join(";"),
    [optimistic.nodes],
  );

  const edgesFp = useMemo(
    () => optimistic.edges.map((e) => e.id).join(";"),
    [optimistic.edges],
  );

  const draftFp = draftPort
    ? `${draftPort.nodeId}:${draftPort.portId}:${draftPort.kind}`
    : "";

  const pinnedFp = useMemo(() => JSON.stringify(pinnedPorts), [pinnedPorts]);

  const curDeps = useMemo(
    () => ({
      nodes: nodesFp,
      edges: edgesFp,
      draftPort: draftFp,
      selectedNodeId: selection.nodeId ?? "",
      pinnedPorts: pinnedFp,
    }),
    [nodesFp, edgesFp, draftFp, selection.nodeId, pinnedFp],
  );

  // Rebuild flow nodes when any dep changes
  if (
    curDeps.nodes !== prevDepsRef.current.nodes ||
    curDeps.edges !== prevDepsRef.current.edges ||
    curDeps.draftPort !== prevDepsRef.current.draftPort ||
    curDeps.selectedNodeId !== prevDepsRef.current.selectedNodeId ||
    curDeps.pinnedPorts !== prevDepsRef.current.pinnedPorts
  ) {
    prevDepsRef.current = curDeps;
    setFlowNodes((current) =>
      optimistic.nodes.map((n) =>
        flowNodeForRef.current!(n, current.find((c) => c.id === n.id)),
      ),
    );
  }

  // ── flow handlers ────────────────────────────────────────────────────────

  const handleFlowNodesChange = useCallback(
    (changes: NodeChange<FlowNode<CanvasNodeCardData>>[]) => {
      setFlowNodes((cur) => applyNodeChanges(changes, cur));
    },
    [],
  );

  const handleFlowConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.sourceHandle ||
        !connection.target ||
        !connection.targetHandle
      )
        return;
      commit({
        action: "connect",
        fromNode: connection.source,
        fromPort: projectPortId(connection.sourceHandle),
        toNode: connection.target,
        toPort: projectPortId(connection.targetHandle),
      });
    },
    [commit],
  );

  // ── keyboard handler ─────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (readOnly) return;
      // Guard against firing while typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (selection.nodeId) {
        setPendingDestructive({
          action: "removeNode",
          nodeId: selection.nodeId,
        });
      } else if (selection.edgeId) {
        setPendingDestructive({
          action: "disconnect",
          edgeId: selection.edgeId,
        });
      }
    },
    [selection.nodeId, selection.edgeId, readOnly],
  );

  // ── empty state ──────────────────────────────────────────────────────────

  if (optimistic.nodes.length === 0) {
    return (
      <ReactFlowProvider>
        <div
          className={`w-full h-full flex items-center justify-center bg-slate-50 ${className ?? ""}`}
        >
          <div className="text-center">
            <p className="text-slate-500 text-lg font-medium">
              Canvas is empty
            </p>
            <p className="text-slate-400 text-sm mt-1">
              Drag a board or component onto the canvas to get started.
            </p>
          </div>
        </div>
      </ReactFlowProvider>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <ReactFlowProvider>
      <div
        className={`w-full h-full ${className ?? ""}`}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <PaneDropHandler onPaneDrop={onPaneDrop}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={{ canvasNode: CanvasNodeCard }}
            defaultViewport={optimistic.viewport}
            minZoom={0.5}
            maxZoom={2}
            panOnDrag
            zoomOnScroll
            nodesDraggable={!readOnly}
            onMoveEnd={(_, vp) =>
              setOptimistic((p) => ({ ...p, viewport: vp }))
            }
            onNodesChange={handleFlowNodesChange}
            onNodeDragStart={(_, node) => setSelection({ nodeId: node.id })}
            onNodeDragStop={(_, node) => {
              const cur = optimistic.nodes.find((n) => n.id === node.id);
              if (
                cur &&
                (Math.round(cur.position.x) !== Math.round(node.position.x) ||
                  Math.round(cur.position.y) !== Math.round(node.position.y))
              ) {
                commit({
                  action: "layout",
                  nodeId: node.id,
                  x: Math.round(node.position.x),
                  y: Math.round(node.position.y),
                });
              }
            }}
            onConnect={handleFlowConnect}
            onEdgeClick={(_, edge) => setSelection({ edgeId: edge.id })}
            className="bg-slate-50"
          >
            <Background color="#cbd5e1" gap={22} size={1.5} />
            <Controls
              showInteractive={false}
              position="bottom-right"
            />
          </ReactFlow>
        </PaneDropHandler>

        {/* ── accessible mirror (test / a11y; ReactFlow does not mount node
             internals under jsdom) ──────────────────────────────────────── */}
        {a11yMirror && (
          <div className="sr-only" aria-label="Anchored connection edges">
            {optimistic.nodes.map((node) => (
              <div key={node.id}>
                {/* Accessible name comes from aria-label only — no text child,
                    so getByText(node.label) still matches the real card's <h3>
                    rather than colliding with this mirror. */}
                <article
                  aria-label={`Canvas node ${node.label}`}
                  onClick={() => setSelection({ nodeId: node.id })}
                />
                {node.ports.map((port) => (
                  <button
                    type="button"
                    key={port.id}
                    title={
                      draftPort
                        ? compatibleWithDraft(node.id, port.kind)
                          ? "Compatible connection target"
                          : "Incompatible connection target"
                        : "Start connection draft"
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      onPortClick(node.id, port.id, port.kind, event);
                    }}
                  >
                    {port.label}
                  </button>
                ))}
              </div>
            ))}
            {optimistic.edges.map((edge) => (
              <button
                type="button"
                key={edge.id}
                aria-label={`${edge.fromNode}.${edge.fromPort} → ${edge.toNode}.${edge.toPort} · ${edge.label}`}
                onClick={() => setSelection({ edgeId: edge.id })}
              >
                {edge.label}
              </button>
            ))}
          </div>
        )}

        {/* ── overlays ───────────────────────────────────────────────────── */}

        {/* Draft port banner */}
        {draftPort && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="flex items-center gap-3 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-2 rounded-full text-sm font-medium shadow">
              <span>
                Draft from {draftPort.nodeId}.{draftPort.portId}; compatible
                targets are green.
              </span>
              <button
                className="ml-2 text-amber-600 hover:text-amber-900 underline"
                onClick={() => {
                  setDraftPort(null);
                  setOpMessage(null);
                }}
              >
                Cancel draft
              </button>
            </div>
          </div>
        )}

        {/* Selected node panel */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 z-10">
            <div className="flex items-center gap-3 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-full text-sm shadow">
              <span className="font-semibold">
                {selectedNode.kind}: {selectedNode.id}
              </span>
              <span className="text-slate-400 truncate max-w-[12rem]">
                {selectedNode.definition}
              </span>
              {!readOnly && (
                <>
                  <span className="text-slate-300">|</span>
                  {pendingDestructive?.action === "removeNode" &&
                  pendingDestructive.nodeId === selectedNode.id ? (
                    <>
                      <button
                        className="text-red-600 hover:text-red-800 font-semibold text-xs"
                        onClick={() =>
                          commit({
                            action: "removeNode",
                            nodeId: selectedNode.id,
                          })
                        }
                      >
                        Confirm delete
                      </button>
                      <button
                        className="text-slate-500 hover:text-slate-700 text-xs"
                        onClick={() => setPendingDestructive(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                      onClick={() =>
                        setPendingDestructive({
                          action: "removeNode",
                          nodeId: selectedNode.id,
                        })
                      }
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
              <button
                aria-label="Deselect"
                className="text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setSelection({});
                  setPendingDestructive(null);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Selected port panel */}
        {selection.port && selectedPortDetails && (
          <div className="absolute bottom-4 left-4 z-10 max-w-sm rounded-xl border border-blue-200 bg-white p-4 text-sm shadow-lg">
            <p className="font-semibold text-slate-900">
              Selected port: {selection.port.nodeId}.{selection.port.portId}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedPortDetails.port.label} · {selectedPortDetails.port.kind}
            </p>
            {selectedPortDetails.port.description ? (
              <p className="mt-1 text-xs text-slate-600">
                {selectedPortDetails.port.description}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              {!readOnly && (
                <button
                  className="rounded-lg bg-blue-600 px-3 py-1 text-xs text-white"
                  onClick={() => {
                    setDraftPort({
                      nodeId: selectedPortDetails.node.id,
                      portId: selectedPortDetails.port.id,
                      kind: selectedPortDetails.port.kind,
                    });
                    setOpMessage(
                      `Connection draft started from ${selectedPortDetails.node.id}.${selectedPortDetails.port.id}…`,
                    );
                  }}
                >
                  Start wire
                </button>
              )}
              <button
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs"
                onClick={() => setSelection({})}
              >
                Cancel selection
              </button>
            </div>
          </div>
        )}

        {/* Selected edge panel */}
        {selectedEdge && (
          <div className="absolute bottom-4 left-4 z-10 max-w-sm rounded-xl border border-blue-200 bg-white p-4 text-sm shadow-lg">
            <p className="font-semibold text-slate-900">
              Selected connection: {selectedEdge.id}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedEdge.fromNode}.{selectedEdge.fromPort} →{" "}
              {selectedEdge.toNode}.{selectedEdge.toPort} · {selectedEdge.label}
            </p>
            {selectedEdge.description ? (
              <p className="mt-1 text-xs text-slate-600">
                {selectedEdge.description}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              {!readOnly &&
                (pendingDestructive?.action === "disconnect" &&
                pendingDestructive.edgeId === selectedEdge.id ? (
                  <>
                    <button
                      className="rounded-lg bg-rose-600 px-3 py-1 text-xs text-white"
                      onClick={() =>
                        commit({
                          action: "disconnect",
                          edgeId: selectedEdge.id,
                        })
                      }
                    >
                      Confirm disconnect
                    </button>
                    <button
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs"
                      onClick={() => setPendingDestructive(null)}
                    >
                      Cancel disconnect
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded-lg bg-rose-600 px-3 py-1 text-xs text-white"
                    onClick={() =>
                      setPendingDestructive({
                        action: "disconnect",
                        edgeId: selectedEdge.id,
                      })
                    }
                  >
                    Disconnect
                  </button>
                ))}
              <button
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs"
                onClick={() => setSelection({})}
              >
                Cancel selection
              </button>
            </div>
          </div>
        )}

        {/* Op message */}
        {opMessage && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-slate-800 text-white px-3 py-1.5 rounded text-xs shadow max-w-md truncate">
              {opMessage}
            </div>
          </div>
        )}
      </div>
    </ReactFlowProvider>
  );
}
