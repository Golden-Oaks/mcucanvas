"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Handle, Position, useNodeId, useStore, useUpdateNodeInternals } from "@xyflow/react";
import { Plus, Search, SquareDashed, X } from "lucide-react";
import { catalogForDefinition } from "../catalog";
import type { CanvasNodeCardData } from "../CanvasNodeCard";

const KIND_DOT_CLASSES: Record<string, string> = {
  gpio: "bg-emerald-500",
  power: "bg-amber-500",
  ground: "bg-slate-500",
  uart: "bg-violet-500",
  serial: "bg-violet-500",
  spi: "bg-blue-500",
  i2c: "bg-orange-500",
  adc: "bg-rose-500",
  pwm: "bg-cyan-500"
};

function kindDotClass(kind: string) {
  return KIND_DOT_CLASSES[kind.toLowerCase()] ?? "bg-slate-400";
}

function kindGroupLabel(kind: string) {
  const normalized = kind.toLowerCase();
  if (normalized.length <= 4) return normalized.toUpperCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

type PeripheralCardShellProps = {
  data: CanvasNodeCardData;
  selected: boolean;
  /** Typed card face (preview + name + dominant state + controls). When set it
   *  REPLACES the generic icon/name header; boards/unknown keep the default. */
  body?: ReactNode;
};

export function PeripheralCardShell({ data, selected, body }: PeripheralCardShellProps) {
  const { node, draftPort, compatibleWithDraft, visiblePortIds, connectedPortIds, portPeers, onAddPin, onRemovePin, onClick, onPortClick } = data;
  const nodeId = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  const catalog = catalogForDefinition(node.definition, node.label);
  const Icon = catalog.icon;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinQuery, setPinQuery] = useState("");
  const pickerRef = useRef<HTMLDivElement>(null);

  const borderClass = selected ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-slate-300";
  const visibleHandleType = node.kind === "board" ? "source" : "target";
  const hiddenHandleType = visibleHandleType === "source" ? "target" : "source";
  const defaultSide: "left" | "right" = node.kind === "board" ? "right" : "left";

  const portSidesSignature = useStore((store) => {
    function centerX(id: string) {
      const entry = store.nodeLookup.get(id);
      if (!entry) return null;
      return entry.internals.positionAbsolute.x + (entry.measured.width ?? 0) / 2;
    }
    const own = nodeId ? centerX(nodeId) : null;
    if (own === null) return "";
    return Object.entries(portPeers)
      .flatMap(([portId, peers]) => {
        const xs = peers.map(centerX).filter((x): x is number => x !== null);
        if (!xs.length) return [];
        const avg = xs.reduce((sum, x) => sum + x, 0) / xs.length;
        return [`${portId}=${avg < own ? "left" : "right"}`];
      })
      .join("|");
  });
  const portSides = useMemo(() => {
    const sides: Record<string, "left" | "right"> = {};
    for (const pair of portSidesSignature.split("|")) {
      const [portId, side] = pair.split("=");
      if (portId && (side === "left" || side === "right")) sides[portId] = side;
    }
    return sides;
  }, [portSidesSignature]);

  const visibleSet = new Set(visiblePortIds);
  const connectedSet = new Set(connectedPortIds);
  const visiblePorts = node.ports.filter((port) => visibleSet.has(port.id));
  const hiddenPorts = node.ports.filter((port) => !visibleSet.has(port.id));
  const portsSignature = visiblePorts.map((port) => `${port.id}:${port.kind}:${portSides[port.id] ?? defaultSide}`).join("|");

  const normalizedQuery = pinQuery.trim().toLowerCase();
  const pickerPorts = normalizedQuery
    ? hiddenPorts.filter((port) => port.label.toLowerCase().includes(normalizedQuery) || port.kind.toLowerCase().includes(normalizedQuery))
    : hiddenPorts;
  const pickerGroups = useMemo(() => {
    const groups = new Map<string, typeof pickerPorts>();
    for (const port of pickerPorts) {
      const key = kindGroupLabel(port.kind);
      const list = groups.get(key);
      if (list) list.push(port);
      else groups.set(key, [port]);
    }
    return Array.from(groups.entries());
  }, [pickerPorts]);

  useEffect(() => {
    if (!nodeId) return;
    updateNodeInternals(nodeId);
    const frame = window.requestAnimationFrame(() => updateNodeInternals(nodeId));
    return () => window.cancelAnimationFrame(frame);
  }, [nodeId, portsSignature, updateNodeInternals]);

  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as globalThis.Node)) {
        setPickerOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  const subtitle = node.description ?? node.definition.split("/").pop()?.replace(/-/g, " ") ?? node.definition;

  return (
    <div className={`w-56 rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${borderClass}`}>
      {body ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Canvas node ${node.label}`}
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClick();
            }
          }}
          className="cursor-pointer px-3 pb-2 pt-4 outline-none"
        >
          {body}
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Canvas node ${node.label}`}
          onClick={onClick}
          className="flex w-full cursor-pointer flex-col items-center gap-1.5 px-4 pb-2 pt-5 text-center"
        >
          <span className="grid size-14 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <Icon className="size-7" aria-hidden />
          </span>
          <h3 className="mt-1 text-base font-semibold leading-tight text-slate-900">{catalog.displayName}</h3>
          <p className="truncate text-xs text-slate-400" title={subtitle}>{subtitle}</p>
        </button>
      )}

      <div className="flex flex-col gap-1.5 px-3 pb-2">
        {visiblePorts.map((port) => {
          const active = draftPort?.nodeId === node.id && draftPort.portId === port.id;
          const compatible = compatibleWithDraft(node.id, port.kind);
          const incompatible = Boolean(draftPort && !compatible && !active);
          const connected = connectedSet.has(port.id);
          const handleClass = active
            ? "!border-blue-600 !bg-blue-500"
            : compatible
              ? "!border-emerald-600 !bg-emerald-500"
              : incompatible
                ? "!border-rose-400 !bg-rose-300"
                : connected
                  ? "!border-slate-400 !bg-slate-300"
                  : "!border-slate-400 !bg-white";
          const rowClass = active
            ? "border-blue-300 bg-blue-50"
            : compatible
              ? "border-emerald-300 bg-emerald-50"
              : incompatible
                ? "border-rose-200 bg-rose-50"
                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50";
          const side = portSides[port.id] ?? defaultSide;
          const handlePosition = side === "right" ? Position.Right : Position.Left;
          const handleSideClass = side === "right" ? "!right-[-1.35rem]" : "!left-[-1.35rem]";
          return (
            <div key={port.id} className="group relative">
              <Handle
                type={visibleHandleType}
                position={handlePosition}
                id={`${port.id}:${visibleHandleType}`}
                className={`${handleSideClass} !size-3.5 !rounded-full !border-2 ${handleClass}`}
              />
              <Handle
                type={hiddenHandleType}
                position={handlePosition}
                id={`${port.id}:${hiddenHandleType}`}
                className={`${handleSideClass} !size-3.5 !rounded-full !border-2 !border-transparent !bg-transparent !opacity-0`}
              />
              <button
                type="button"
                onClick={(event) => onPortClick(node.id, port.id, port.kind, event)}
                title={draftPort ? (compatible ? "Compatible connection target" : "Incompatible connection target") : "Start connection draft"}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 ${rowClass}`}
              >
                <span className={`size-2 shrink-0 rounded-full ${kindDotClass(port.kind)}`} />
                <span className="truncate">{port.label}</span>
              </button>
              {!connected ? (
                <button
                  type="button"
                  aria-label={`Hide pin ${port.label}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemovePin(node.id, port.id);
                  }}
                  className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-slate-300 hover:bg-slate-100 hover:text-slate-500 group-hover:block"
                >
                  <X className="size-3" aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
        {!visiblePorts.length ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-5 text-center">
            <SquareDashed className="size-5 text-slate-300" aria-hidden />
            <p className="text-xs font-medium text-slate-500">No connections</p>
            <p className="text-[11px] text-slate-400">Add a pin to get started</p>
          </div>
        ) : null}
      </div>

      <div className="relative px-3 pb-3">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setPinQuery("");
            setPickerOpen((open) => !open);
          }}
          disabled={!hiddenPorts.length}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/60 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-default disabled:border-blue-100 disabled:bg-blue-50/30 disabled:text-blue-400"
        >
          <Plus className="size-3.5" aria-hidden />
          Add Pin
        </button>
        {pickerOpen ? (
          <div
            ref={pickerRef}
            onClick={(event) => event.stopPropagation()}
            className="nodrag nopan nowheel absolute left-2 right-2 top-full z-20 mt-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          >
            <div className="flex items-center justify-between px-1 pb-1.5">
              <span className="text-xs font-semibold text-slate-900">Add Pin</span>
              <button type="button" aria-label="Close pin picker" onClick={() => setPickerOpen(false)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={pinQuery}
                onChange={(event) => setPinQuery(event.target.value)}
                placeholder="Search pins…"
                aria-label={`Search pins on ${catalog.displayName}`}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs text-slate-900 placeholder:text-slate-400"
              />
            </label>
            <div className="mt-1.5 max-h-48 overflow-y-auto">
              {pickerGroups.map(([group, ports]) => (
                <div key={group}>
                  <p className="px-1.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                  {ports.map((port) => (
                    <button
                      key={port.id}
                      type="button"
                      onClick={() => {
                        onAddPin(node.id, port.id);
                        setPickerOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-blue-950 hover:bg-blue-50 hover:text-blue-900"
                    >
                      <span className={`size-2 shrink-0 rounded-full ${kindDotClass(port.kind)}`} />
                      <span className="truncate">{port.label}</span>
                    </button>
                  ))}
                </div>
              ))}
              {!pickerGroups.length ? (
                <p className="px-2 py-3 text-center text-xs text-slate-400">No matching pins</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
