"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSyncExternalStore } from "react";
import type { CanvasProjection } from "./types";
import type {
  PeripheralInteraction,
  PeripheralState,
  SimulationFrame,
} from "./peripheral-state";
import { SimulatedDriver } from "./drivers/simulated-driver";
import type { SimulationTransport } from "./transport";

// ── Module-local store factory ─────────────────────────────────────────────
// Frame lives OUTSIDE React state — only subscribed card bodies re-render.

function createSimStore() {
  let frame: SimulationFrame | null = null;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getFrame(): SimulationFrame | null {
      return frame;
    },
    setFrame(f: SimulationFrame | null) {
      frame = f;
      for (const l of listeners) {
        l();
      }
    },
  };
}

type SimStore = ReturnType<typeof createSimStore>;

// ── Context ────────────────────────────────────────────────────────────────

export interface SimulationContextValue {
  running: boolean;
  start: () => void;
  stop: () => void;
  sendInteraction: (nodeId: string, interaction: PeripheralInteraction) => void;
  store: SimStore;
}

/** Default no-op value so hooks work safely outside the provider. */
const defaultStore = createSimStore();
const defaultContextValue: SimulationContextValue = {
  running: false,
  start: () => {},
  stop: () => {},
  sendInteraction: () => {},
  store: defaultStore,
};

const SimulationContext = createContext<SimulationContextValue>(defaultContextValue);

// ── Provider ───────────────────────────────────────────────────────────────

type SimulationStateProviderProps = {
  canvas: CanvasProjection;
  transport?: SimulationTransport;
  children: ReactNode;
};

/**
 * Holds a live-state store fed by an external {@link SimulationTransport}
 * or a client-side SimulatedDriver (preview mode).  Frame updates never
 * enter React state — only the cards that subscribe to their node's slice
 * re-render.
 */
export function SimulationStateProvider({
  canvas,
  transport,
  children,
}: SimulationStateProviderProps) {
  const [store] = useState<SimStore>(() => createSimStore());
  const [running, setRunning] = useState(false);
  const driverRef = useRef<SimulatedDriver | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tRef = useRef(0);
  // Track the live transport + whether a session is active so the unmount
  // cleanup can tear them down (an empty-dep effect can't read props/state).
  const transportRef = useRef<SimulationTransport | undefined>(undefined);
  const activeRef = useRef(false);

  // ── start ────────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (transport) {
      transportRef.current = transport;
      transport.start(canvas, store.setFrame);
    } else {
      const driver = new SimulatedDriver();
      driverRef.current = driver;
      driver.start(canvas);
      tRef.current = 0;
      intervalRef.current = setInterval(() => {
        tRef.current += 100;
        driver.tick(100);
        store.setFrame({
          running: true,
          t: tRef.current,
          peripherals: driver.snapshot(),
        });
      }, 100);
    }
    activeRef.current = true;
    setRunning(true);
  }, [transport, canvas, store]);

  // ── stop ─────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (transport) {
      transport.stop();
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      driverRef.current?.stop();
      driverRef.current = null;
    }
    transportRef.current = undefined;
    activeRef.current = false;
    store.setFrame(null);
    setRunning(false);
  }, [transport, store]);

  // ── sendInteraction ──────────────────────────────────────────────────
  const sendInteraction = useCallback(
    (nodeId: string, interaction: PeripheralInteraction) => {
      if (transport) {
        transport.sendInteraction(nodeId, interaction);
      } else {
        driverRef.current?.applyInteraction(nodeId, interaction);
        // State updates will appear on the next tick (~100 ms).
      }
    },
    [transport],
  );

  // ── cleanup ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      // Tear down an in-flight session on unmount so the SSE EventSource and
      // server-side session don't leak when the editor closes mid-simulation.
      if (activeRef.current) {
        transportRef.current?.stop();
        driverRef.current?.stop();
      }
    };
  }, []);

  // Stable context value — store is ref-stable, callbacks are memoized.
  const value = useMemo<SimulationContextValue>(
    () => ({ running, start, stop, sendInteraction, store }),
    [running, start, stop, sendInteraction, store],
  );

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Returns the live {@link PeripheralState} for a single node, or `null`
 * when no frame exists or the node has no peripheral.  Uses
 * `useSyncExternalStore` so ONLY the component that reads this slice
 * re-renders on each frame update — ReactFlow and other cards are left
 * alone.
 */
export function usePeripheralState(nodeId: string): PeripheralState | null {
  const ctx = useContext(SimulationContext);
  return useSyncExternalStore(
    ctx.store.subscribe,
    () => ctx.store.getFrame()?.peripherals[nodeId] ?? null,
    () => null,
  );
}

/**
 * Returns the simulation session controls.  Safe to call outside the
 * provider — returns `{ running: false }` and no-op functions.
 */
export function useSimulation(): Omit<SimulationContextValue, "store"> {
  const ctx = useContext(SimulationContext);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { store: _store, ...rest } = ctx;
  return rest;
}
