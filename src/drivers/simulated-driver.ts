import type { PeripheralDriver } from "./driver";
import type {
  PeripheralInteraction,
  PeripheralState,
} from "../peripheral-state";
import type { CanvasProjection } from "../types";
import { peripheralKindForDefinition } from "../catalog";

export class SimulatedDriver implements PeripheralDriver {
  private state = new Map<string, PeripheralState>();

  /** Per-node blink phase accumulator (ms), for LED blinking. */
  private blinkPhases = new Map<string, number>();

  /** Per-node last temp change timestamp (ms), for trend → stable decay. */
  private lastTempChangeMs = new Map<string, number>();

  /** Elapsed simulation time (ms). */
  private elapsed = 0;

  /** Stashed canvas edges for wiring checks. */
  private edges: CanvasProjection["edges"] = [];

  start(canvas: CanvasProjection): void {
    this.state.clear();
    this.blinkPhases.clear();
    this.lastTempChangeMs.clear();
    this.elapsed = 0;
    this.edges = canvas.edges;

    for (const node of canvas.nodes) {
      if (node.kind === "board") continue;
      const kind = peripheralKindForDefinition(node.definition);
      const seeded = this.seedState(kind, node.id);
      if (seeded) {
        this.state.set(node.id, seeded);
      }
    }
  }

  stop(): void {
    this.state.clear();
    this.blinkPhases.clear();
    this.lastTempChangeMs.clear();
    this.elapsed = 0;
    this.edges = [];
  }

  tick(dtMs: number): void {
    this.elapsed += dtMs;

    for (const [id, s] of this.state) {
      switch (s.kind) {
        case "led":
          this.tickLed(id, s, dtMs);
          break;
        case "servo":
          this.tickServo(id, s, dtMs);
          break;
        case "motor":
          this.tickMotor(id, s);
          break;
        case "temp":
          this.tickTemp(id, s);
          break;
        case "button":
          this.tickButton(id, s, dtMs);
          break;
      }
    }
  }

  // ── Per-kind tick ─────────────────────────────────────────────────

  private tickLed(id: string, s: PeripheralState & { kind: "led" }, dtMs: number): void {
    if (s.mode !== "blinking") return;

    const freqHz = s.frequencyHz ?? 2;
    const halfPeriodMs = 1000 / freqHz / 2;
    let phase = (this.blinkPhases.get(id) ?? 0) + dtMs;

    // Toggle each half-period.
    const toggles = Math.floor(phase / halfPeriodMs);
    if (toggles % 2 === 1) {
      this.state.set(id, { ...s, value: !s.value });
    }
    phase = phase % (halfPeriodMs * 2);
    // Handle the case where phase wraps but we had multiple toggles
    if (toggles > 0) {
      phase = phase % (halfPeriodMs * 2);
    }
    this.blinkPhases.set(id, phase);
  }

  private tickServo(id: string, s: PeripheralState & { kind: "servo" }, dtMs: number): void {
    const target = s.targetAngleDeg ?? s.angleDeg;
    if (Math.abs(s.angleDeg - target) <= 0.5) {
      if (s.moving) {
        this.state.set(id, { ...s, moving: false, angleDeg: target });
      }
      return;
    }

    // Ease up to ~120°/sec
    const maxStep = (dtMs / 1000) * 120;
    const delta = target - s.angleDeg;
    const step = Math.sign(delta) * Math.min(maxStep, Math.abs(delta));
    const newAngle = +(s.angleDeg + step).toFixed(1);
    this.state.set(id, { ...s, angleDeg: newAngle, moving: true });
  }

  private tickMotor(id: string, s: PeripheralState & { kind: "motor" }): void {
    if (!s.running) {
      if (s.rpm !== 0) {
        this.state.set(id, { ...s, rpm: 0 });
      }
      return;
    }

    // Tiny jitter for liveliness when running (±~10 rpm around nominal 1240).
    const jitter = Math.round((Math.random() - 0.5) * 20);
    // Distinguish "we already set a new rpm" from "seeded baseline" —
    // if rpm is near 1240±30, jitter around it; otherwise keep user-set rpm.
    const isNearBaseline = Math.abs(s.rpm % 1240) < 30 || s.rpm === 0;
    const newRpm = isNearBaseline
      ? 1240 + jitter
      : s.rpm + jitter;
    this.state.set(id, { ...s, rpm: newRpm });
  }

  private tickTemp(id: string, s: PeripheralState & { kind: "temp" }): void {
    if (s.trend === "stable") return;

    const lastChange = this.lastTempChangeMs.get(id) ?? 0;
    const sinceChange = this.elapsed - lastChange;

    // Decay trend → stable after ~1.5s
    if (sinceChange >= 1500) {
      this.state.set(id, { ...s, trend: "stable" });
    }
  }

  private tickButton(id: string, s: PeripheralState & { kind: "button" }, dtMs: number): void {
    if (!s.pressed || s.locked) return;
    this.state.set(id, {
      ...s,
      heldMs: (s.heldMs ?? 0) + dtMs,
    });
  }

  // ── Interactions ──────────────────────────────────────────────────

  applyInteraction(nodeId: string, interaction: PeripheralInteraction): void {
    const current = this.state.get(nodeId);
    if (!current) return;
    if (interaction.kind !== current.kind) return;

    switch (interaction.kind) {
      case "button": {
        const s = current;
        if (s.kind !== "button") return;
        switch (interaction.action) {
          case "press":
            this.state.set(nodeId, { ...s, pressed: true, heldMs: 0, locked: false });
            break;
          case "release":
            this.state.set(nodeId, { ...s, pressed: false, heldMs: undefined, locked: false });
            break;
          case "lockToggle":
            this.state.set(nodeId, { ...s, locked: !s.locked, pressed: true, heldMs: s.locked ? 0 : s.heldMs });
            break;
        }
        break;
      }
      case "led": {
        const s = current;
        if (s.kind !== "led") return;
        switch (interaction.action) {
          case "auto":
            // Re-derive blinking if the LED node is wired to the board.
            if (this.isNodeWired(nodeId)) {
              this.state.set(nodeId, {
                ...s,
                mode: "blinking",
                value: false,
                frequencyHz: 2,
              });
              this.blinkPhases.set(nodeId, 0);
            } else {
              this.state.set(nodeId, { ...s, mode: "off", value: false });
            }
            break;
          case "on":
            this.state.set(nodeId, { ...s, mode: "on", value: true });
            break;
          case "off":
            this.state.set(nodeId, { ...s, mode: "off", value: false });
            break;
        }
        break;
      }
      case "motor": {
        const s = current;
        if (s.kind !== "motor") return;
        switch (interaction.action) {
          case "auto":
            this.state.set(nodeId, { ...s, running: true, rpm: 1240 });
            break;
          case "stop":
            this.state.set(nodeId, { ...s, running: false });
            break;
          case "reverse":
            this.state.set(nodeId, {
              ...s,
              direction: s.direction === "cw" ? "ccw" : "cw",
            });
            break;
        }
        break;
      }
      case "servo": {
        const s = current;
        if (s.kind !== "servo") return;
        if (interaction.action !== "setAngle") return;
        const clamped = Math.max(
          s.minDeg ?? 0,
          Math.min(s.maxDeg ?? 180, interaction.angleDeg),
        );
        // Only set the target — tick() eases angleDeg toward it.
        this.state.set(nodeId, {
          ...s,
          targetAngleDeg: clamped,
          moving: Math.abs(s.angleDeg - clamped) > 0.5,
        });
        break;
      }
      case "temp": {
        const s = current;
        if (s.kind !== "temp") return;
        if (interaction.action !== "setCelsius") return;
        const clamped = Math.max(
          s.minC ?? -40,
          Math.min(s.maxC ?? 125, interaction.celsius),
        );
        this.lastTempChangeMs.set(nodeId, this.elapsed);
        this.state.set(nodeId, {
          ...s,
          celsius: clamped,
          trend:
            clamped > s.celsius
              ? "rising"
              : clamped < s.celsius
                ? "falling"
                : "stable",
        });
        break;
      }
    }
  }

  snapshot(): Record<string, PeripheralState> {
    const result: Record<string, PeripheralState> = {};
    for (const [id, s] of this.state) {
      result[id] = { ...s };
    }
    return result;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /**
   * Returns `true` if the node is referenced by any canvas edge
   * (i.e. wired to the board or another component).
   */
  private isNodeWired(nodeId: string): boolean {
    return this.edges.some(
      (edge) => edge.fromNode === nodeId || edge.toNode === nodeId,
    );
  }

  private seedState(kind: string, nodeId: string): PeripheralState | null {
    switch (kind) {
      case "led": {
        // Blinking if wired to the board; otherwise off.
        const wired = this.isNodeWired(nodeId);
        return wired
          ? {
              kind: "led",
              mode: "blinking",
              value: false,
              frequencyHz: 2,
            }
          : { kind: "led", mode: "off", value: false };
      }
      case "button":
        return { kind: "button", pressed: false };
      case "servo":
        return {
          kind: "servo",
          angleDeg: 72,
          targetAngleDeg: 72,
          moving: false,
          minDeg: 0,
          maxDeg: 180,
        };
      case "motor":
        return {
          kind: "motor",
          running: true,
          rpm: 1240,
          direction: "cw",
        };
      case "temp":
        return {
          kind: "temp",
          celsius: 24.8,
          trend: "stable",
          editable: true,
          minC: -40,
          maxC: 125,
        };
      case "oled":
        return {
          kind: "oled",
          width: 128,
          height: 64,
          textFallback: ["Hello, Pico!", "Temp: 24.8 C"],
        };
      default:
        return null;
    }
  }
}
