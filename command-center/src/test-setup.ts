import "@testing-library/jest-dom/vitest";

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  disconnect() {}
  observe() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
  unobserve() {}
}

class ResizeObserverStub implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  writable: true,
  value: IntersectionObserverStub,
});

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: ResizeObserverStub,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  writable: true,
  value: () => null,
});

Object.defineProperty(globalThis, "scrollTo", {
  configurable: true,
  writable: true,
  value: () => undefined,
});
