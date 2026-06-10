export type PeripheralKind = "led" | "button" | "servo" | "motor" | "oled" | "temp" | "unknown";

export type PeripheralState =
  | { kind: "led";    mode: "off" | "on" | "blinking" | "pwm"; value: boolean; frequencyHz?: number; dutyCycle?: number }
  | { kind: "button"; pressed: boolean; heldMs?: number; locked?: boolean }
  | { kind: "servo";  angleDeg: number; targetAngleDeg?: number; moving: boolean; minDeg?: number; maxDeg?: number }
  | { kind: "motor";  running: boolean; rpm: number; direction: "cw" | "ccw"; dutyCycle?: number }
  | { kind: "oled";   width: number; height: number; fps?: number; bufferPreviewUrl?: string; textFallback?: string[] }
  | { kind: "temp";   celsius: number; trend: "stable" | "rising" | "falling"; editable: boolean; minC?: number; maxC?: number };

export type PeripheralInteraction =
  | { kind: "button"; action: "press" | "release" | "lockToggle" }
  | { kind: "led" | "motor"; action: "auto" | "on" | "off" | "stop" | "reverse" }
  | { kind: "servo"; action: "setAngle"; angleDeg: number }
  | { kind: "temp";  action: "setCelsius"; celsius: number };

export type SimulationFrame = { running: boolean; t: number; peripherals: Record<string, PeripheralState> };
