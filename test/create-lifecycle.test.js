import {expect, it, vi} from 'vitest';
import {mountSections} from '../packages/create-easel/templates/base/src/sections.ts';

it('restores fallback HTML, avoids duplicate mounts, and disposes detached sections', () => {
  class ElementFixture extends EventTarget {
    constructor(matches = true, children = []) {
      super();
      this.selected = matches;
      this.children = children;
      this.innerHTML = '<button disabled>+</button>';
    }
    matches() {
      return this.selected;
    }
    querySelectorAll() {
      return this.children.filter((child) => child.matches());
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains(element));
    }
  }
  const first = new ElementFixture();
  const second = new ElementFixture();
  const document = new ElementFixture(false, [first, second]);
  vi.stubGlobal('HTMLElement', ElementFixture);
  vi.stubGlobal('document', document);
  const cleanups = [];
  const initialize = vi.fn((element) => {
    element.innerHTML = '<button>+</button>';
    const cleanup = vi.fn();
    cleanups.push(cleanup);
    return cleanup;
  });
  const dispatch = (type, target) => {
    const event = new Event(type);
    Object.defineProperty(event, 'target', {value: target});
    document.dispatchEvent(event);
  };
  let stop;
  try {
    stop = mountSections('[data-counter]', initialize);
    expect(initialize).toHaveBeenCalledTimes(2);
    dispatch('shopify:section:load', first);
    expect(initialize).toHaveBeenCalledTimes(2);
    dispatch('shopify:section:unload', first);
    expect(first.innerHTML).toBe('<button disabled>+</button>');
    expect(cleanups[0]).toHaveBeenCalledTimes(1);
    expect(cleanups[1]).not.toHaveBeenCalled();
    dispatch('shopify:section:load', first);
    expect(initialize).toHaveBeenCalledTimes(3);
    document.children = [];
    stop();
    for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
    expect(first.innerHTML).toBe('<button disabled>+</button>');
    expect(second.innerHTML).toBe('<button disabled>+</button>');
    dispatch('shopify:section:load', first);
    expect(initialize).toHaveBeenCalledTimes(3);
  } finally {
    stop?.();
    vi.unstubAllGlobals();
  }
});
