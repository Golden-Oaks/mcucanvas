"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  useStore,
  useReactFlow,
} from "@xyflow/react";
import type { CanvasProjection } from "./types";
import type { SimulationTransport } from "./transport";
import { SimulationStateProvider } from "./SimulationStateProvider";
import { CanvasNodeCard } from "./CanvasNodeCard";
import type { CanvasNodeCardData } from "./CanvasNodeCard";

export type McuCanvasProps = {
  projection: CanvasProjection;
  transport?: SimulationTransport;
  className?: string;
  fitView?: boolean;
};

const nodeTypes = { canvasCard: CanvasNodeCard };

/** Fits the view once after custom nodes are measured, then re-fits only on
 *  topology changes (node id set), not on every projection/data edit. */
function FitOnInit({
  idSignature,
  enabled,
}: {
  idSignature: string;
  enabled: boolean;
}) {
  const { fitView } = useReactFlow();
  // Non-empty ONLY when every node has real (non-zero) measured dimensions.
  const measuredSig = useStore((s) => {
    if (s.nodeLookup.size === 0) return "";
    const parts: string[] = [];
    for (const n of s.nodeLookup.values()) {
      const w = n.measured?.width ?? 0;
      const h = n.measured?.height ?? 0;
      if (!w || !h) return "";          // some node not measured yet → bail
      parts.push(`${n.id}:${w}x${h}`);
    }
    return parts.sort().join("|");
  });
  const lastFit = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !measuredSig) return;
    if (lastFit.current === idSignature) return;   // refit only on topology change
    const raf = requestAnimationFrame(() => {
      fitView();
      lastFit.current = idSignature;
    });
    return () => cancelAnimationFrame(raf);
  }, [enabled, measuredSig, idSignature, fitView]);

  return null;
}

export function McuCanvas({
  projection,
  transport,
  className,
  fitView,
}: McuCanvasProps) {
  const nodes = useMemo(() => {
    // Build a set of port ids referenced by edges, keyed by node id.
    const edgePortIds = new Map<string, Set<string>>();
    for (const e of projection.edges) {
      const fromSet = edgePortIds.get(e.fromNode) ?? new Set();
      fromSet.add(e.fromPort);
      edgePortIds.set(e.fromNode, fromSet);

      const toSet = edgePortIds.get(e.toNode) ?? new Set();
      toSet.add(e.toPort);
      edgePortIds.set(e.toNode, toSet);
    }

    return projection.nodes.map((node) => {
      const connectedIds = edgePortIds.get(node.id);
      const data: CanvasNodeCardData = {
        node,
        visiblePortIds: node.ports.map((p) => p.id),
        connectedPortIds: connectedIds ? Array.from(connectedIds) : [],
        draftPort: null,
        portPeers: {},
        compatibleWithDraft: () => false,
        onAddPin: () => {},
        onRemovePin: () => {},
        onClick: () => {},
        onPortClick: () => {},
      };
      return {
        id: node.id,
        type: "canvasCard",
        position: node.position,
        data,
      };
    });
  }, [projection]);

  const edges = useMemo(
    () =>
      projection.edges.map((e) => ({
        id: e.id,
        source: e.fromNode,
        target: e.toNode,
        sourceHandle: `${e.fromPort}:source`,
        targetHandle: `${e.toPort}:target`,
        label: e.label,
      })),
    [projection],
  );

  const idSignature = useMemo(
    () => nodes.map((n) => n.id).sort().join("|"),
    [nodes],
  );

  return (
    <ReactFlowProvider>
      <SimulationStateProvider canvas={projection} transport={transport}>
        <div className={className ?? "h-full w-full"}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
          >
            <FitOnInit idSignature={idSignature} enabled={fitView ?? true} />
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </SimulationStateProvider>
    </ReactFlowProvider>
  );
}
