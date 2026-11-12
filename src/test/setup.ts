import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom ships no ResizeObserver; recharts' ResponsiveContainer requires one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as typeof globalThis & { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom implements no layout, so this is absent; cmdk calls it on every render.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Radix's menus and selects call these Pointer Events APIs on open; jsdom
// implements none of them, so without the stubs a dropdown never opens and a
// test sees no menu at all.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = function hasPointerCapture() { return false; };
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function releasePointerCapture() {};
}
