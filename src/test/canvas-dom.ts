import { act, fireEvent } from "@testing-library/react";
import type { Size } from "../lib/coordinates";

/** Supply layout measurements that jsdom cannot produce. */
export function mockCanvasResize() {
  const original = globalThis.ResizeObserver;
  const observers = new Map<Element, (size: Size) => void>();
  globalThis.ResizeObserver = class implements ResizeObserver {
    private targets = new Set<Element>();
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.targets.add(target);
      observers.set(target, ({ width, height }) => {
        this.callback(
          [
            {
              target,
              contentRect: new DOMRect(0, 0, width, height),
              borderBoxSize: [],
              contentBoxSize: [],
              devicePixelContentBoxSize: [],
            },
          ],
          this
        );
      });
    }
    unobserve(target: Element) {
      observers.delete(target);
    }
    disconnect() {
      this.targets.forEach((target) => observers.delete(target));
    }
  };
  return {
    resize(target: Element, size: Size) {
      const observer = observers.get(target);
      if (!observer) throw new Error("Element is not being observed");
      act(() => observer(size));
    },
    restore() {
      globalThis.ResizeObserver = original;
    },
  };
}

/** Supply pointer identity and capture without pretending to simulate layout. */
export function mockCanvasPointerEvents() {
  const original = Object.getOwnPropertyDescriptor(window, "PointerEvent");
  const captures = new WeakMap<Element, Set<number>>();
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
  const methods = [
    "setPointerCapture",
    "hasPointerCapture",
    "releasePointerCapture",
  ] as const;
  const originals = methods.map((name) =>
    Object.getOwnPropertyDescriptor(Element.prototype, name)
  );
  Object.defineProperties(Element.prototype, {
    setPointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        const ids = captures.get(this) ?? new Set<number>();
        ids.add(id);
        captures.set(this, ids);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        return captures.get(this)?.has(id) ?? false;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: Element, id: number) {
        captures.get(this)?.delete(id);
      },
    },
  });
  return () => {
    if (original) Object.defineProperty(window, "PointerEvent", original);
    else Reflect.deleteProperty(window, "PointerEvent");
    methods.forEach((name, index) => {
      const descriptor = originals[index];
      if (descriptor)
        Object.defineProperty(Element.prototype, name, descriptor);
      else Reflect.deleteProperty(Element.prototype, name);
    });
  };
}

export function loadCanvasImage(
  image: HTMLElement,
  size: Size = { width: 1600, height: 1000 }
) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: size.width },
    naturalHeight: { configurable: true, value: size.height },
  });
  fireEvent.load(image);
}
