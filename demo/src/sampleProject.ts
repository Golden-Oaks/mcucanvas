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
