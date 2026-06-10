import type { LucideIcon } from "lucide-react";
import { Circle, Cog, Crosshair, Cpu, Gauge, Lightbulb, Monitor, Thermometer } from "lucide-react";
import type { PeripheralKind } from "./peripheral-state";

export type CatalogEntry = {
  displayName: string;
  icon: LucideIcon;
  accent: "emerald" | "blue";
  peripheralKind: PeripheralKind;
};

const COMPONENT_CATALOG: Record<string, CatalogEntry> = {
  "core:board/raspberry-pi-pico": {
    displayName: "Raspberry Pi Pico",
    icon: Cpu,
    accent: "emerald",
    peripheralKind: "unknown"
  },
  "core:component/gpio-led": {
    displayName: "LED",
    icon: Lightbulb,
    accent: "blue",
    peripheralKind: "led"
  },
  "catalog:placeholder/oled": {
    displayName: "OLED Display",
    icon: Monitor,
    accent: "blue",
    peripheralKind: "oled"
  },
  "catalog:placeholder/tmp117": {
    displayName: "Temperature Sensor",
    icon: Thermometer,
    accent: "blue",
    peripheralKind: "temp"
  },
  "catalog:placeholder/button": {
    displayName: "Button",
    icon: Circle,
    accent: "blue",
    peripheralKind: "button"
  },
  "catalog:placeholder/servo": {
    displayName: "Servo",
    icon: Crosshair,
    accent: "blue",
    peripheralKind: "servo"
  },
  "catalog:placeholder/motor": {
    displayName: "Motor",
    icon: Cog,
    accent: "blue",
    peripheralKind: "motor"
  }
};

export const ADDON_CATALOG: CatalogEntry[] = [
  { displayName: "Button", icon: Gauge, accent: "blue", peripheralKind: "button" },
  { displayName: "LED", icon: Lightbulb, accent: "blue", peripheralKind: "led" },
  { displayName: "Buzzer", icon: Gauge, accent: "blue", peripheralKind: "unknown" },
  { displayName: "Light Sensor", icon: Gauge, accent: "blue", peripheralKind: "unknown" },
  { displayName: "Humidity Sensor", icon: Thermometer, accent: "blue", peripheralKind: "unknown" }
];

export function catalogForDefinition(definition: string, fallbackName: string): CatalogEntry {
  return COMPONENT_CATALOG[definition] ?? {
    displayName: fallbackName,
    icon: Cpu,
    accent: "blue",
    peripheralKind: "unknown"
  };
}

export function peripheralKindForDefinition(definition: string): PeripheralKind {
  return COMPONENT_CATALOG[definition]?.peripheralKind ?? "unknown";
}

const PORT_DOT_COLORS: Record<string, string> = {
  SDA: "bg-blue-500",
  SCL: "bg-blue-500",
  "3V3": "bg-rose-500",
  VCC: "bg-rose-500",
  GND: "bg-slate-800",
  GP0: "bg-blue-500",
  Signal: "bg-emerald-500"
};

function portDotClass(label: string) {
  return PORT_DOT_COLORS[label] ?? "bg-slate-400";
}
