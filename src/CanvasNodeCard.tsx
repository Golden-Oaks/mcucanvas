"use client";

import type { MouseEvent } from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { useCallback } from "react";
import { peripheralKindForDefinition } from "./catalog";
import type { CanvasProjection } from "./types";
import type { PeripheralInteraction } from "./peripheral-state";
import { usePeripheralState, useSimulation } from "./SimulationStateProvider";
import { PeripheralCardShell } from "./cards/PeripheralCardShell";
import { LedCardBody } from "./cards/LedCardBody";
import { ButtonCardBody } from "./cards/ButtonCardBody";
import { ServoCardBody } from "./cards/ServoCardBody";
import { MotorCardBody } from "./cards/MotorCardBody";
import { OledCardBody } from "./cards/OledCardBody";
import { TempCardBody } from "./cards/TempCardBody";

type CanvasNode = CanvasProjection["nodes"][number];

export type CanvasNodeCardData = Record<string, unknown> & {
  node: CanvasNode;
  draftPort: { nodeId: string; portId: string; kind: string } | null;
  compatibleWithDraft: (nodeId: string, kind: string) => boolean;
  visiblePortIds: string[];
  connectedPortIds: string[];
  portPeers: Record<string, string[]>;
  onAddPin: (nodeId: string, portId: string) => void;
  onRemovePin: (nodeId: string, portId: string) => void;
  onClick: () => void;
  onPortClick: (nodeId: string, portId: string, kind: string, event: MouseEvent) => void;
};

export function CanvasNodeCard({ data, selected }: NodeProps<Node<CanvasNodeCardData>>) {
  const kind = peripheralKindForDefinition(data.node.definition);
  const state = usePeripheralState(data.node.id);
  const { sendInteraction } = useSimulation();

  const onInteract = useCallback(
    (interaction: PeripheralInteraction) => {
      sendInteraction(data.node.id, interaction);
    },
    [data.node.id, sendInteraction],
  );

  let body: React.ReactNode | undefined;
  switch (kind) {
    case "led":
      body = <LedCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    case "button":
      body = <ButtonCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    case "servo":
      body = <ServoCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    case "motor":
      body = <MotorCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    case "oled":
      body = <OledCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    case "temp":
      body = <TempCardBody state={state} selected={selected} onInteract={onInteract} />;
      break;
    default:
      body = undefined;
  }

  return <PeripheralCardShell data={data} selected={selected} body={body} />;
}
