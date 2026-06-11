export const sample = {
  project: {
    name: "MCU Canvas Demo",
    boards: {
      pico: { definition: "core:board/raspberry-pi-pico" },
    },
    components: {
      led1: { definition: "core:component/gpio-led" },
      screen: { definition: "catalog:placeholder/oled" },
      btn: { definition: "catalog:placeholder/button" },
    },
    connections: {
      c1: { from: "pico.gpio25", to: "led1.in", kind: "gpio" },
      c2: { from: "pico.gnd", to: "btn.signal", kind: "gpio" },
      c3: { from: "pico.p3v3", to: "screen.sda", kind: "i2c" },
    },
  },
  layout: {
    items: {
      pico: { position: { x: 100, y: 200 } },
      led1: { position: { x: 500, y: 80 } },
      btn: { position: { x: 500, y: 220 } },
      screen: { position: { x: 500, y: 380 } },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  },
};

// Port metadata for each definition. Without this the parser only knows about
// the pins referenced by connections, so every node shows ≤3 (all connected)
// ports and "Add Pin" has nothing to reveal. With a catalog, a board exposes
// its full pin set — only the wired ones show by default, and "Add Pin" reveals
// the rest so you can wire them.
export const sampleCatalog = [
  {
    id: "core:board/raspberry-pi-pico",
    label: "Raspberry Pi Pico",
    ports: [
      ...Array.from({ length: 29 }, (_, i) => ({
        id: `gpio${i}`,
        label: `GP${i}`,
        kind: "gpio",
      })),
      { id: "p3v3", label: "3V3", kind: "power" },
      { id: "vbus", label: "VBUS", kind: "power" },
      { id: "gnd", label: "GND", kind: "ground" },
      { id: "run", label: "RUN", kind: "signal" },
    ],
  },
  {
    id: "core:component/gpio-led",
    label: "GPIO LED",
    ports: [
      { id: "in", label: "IN", kind: "gpio" },
      { id: "gnd", label: "GND", kind: "ground" },
    ],
  },
  {
    id: "catalog:placeholder/oled",
    label: "OLED",
    ports: [
      { id: "sda", label: "SDA", kind: "i2c" },
      { id: "scl", label: "SCL", kind: "i2c" },
      { id: "vcc", label: "VCC", kind: "power" },
      { id: "gnd", label: "GND", kind: "ground" },
    ],
  },
  {
    id: "catalog:placeholder/button",
    label: "Button",
    ports: [
      { id: "signal", label: "Signal", kind: "gpio" },
      { id: "gnd", label: "GND", kind: "ground" },
    ],
  },
];
