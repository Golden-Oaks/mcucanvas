import type { CanvasProjection } from "../types";
import type { PeripheralInteraction, PeripheralState } from "../peripheral-state";

export interface PeripheralDriver {
  start(canvas: CanvasProjection): void;
  stop(): void;
  tick(dtMs: number): void;
  applyInteraction(nodeId: string, interaction: PeripheralInteraction): void;
  snapshot(): Record<string, PeripheralState>;
}
