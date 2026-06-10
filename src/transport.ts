import type { CanvasProjection } from "./types";
import type { PeripheralInteraction, SimulationFrame } from "./peripheral-state";

export interface SimulationTransport {
  start(canvas: CanvasProjection, onFrame: (frame: SimulationFrame | null) => void): void;
  stop(): void;
  sendInteraction(nodeId: string, interaction: PeripheralInteraction): void;
}
