export {};

const counters = new Map<Element, AbortController>();

function countersWithin(root: ParentNode): Element[] {
  const matches = [...root.querySelectorAll('[data-counter]')];
  if (root instanceof Element && root.matches('[data-counter]')) matches.unshift(root);
  return matches;
}

function mountCounters(root: ParentNode = document): void {
  for (const counter of countersWithin(root)) {
    if (counters.has(counter)) continue;
    const controller = new AbortController();
    counters.set(counter, controller);
    const output = counter.querySelector<HTMLOutputElement>('[data-count]');
    let count = 0;
    counter.querySelector('[data-decrease]')?.addEventListener(
      'click',
      () => {
        count -= 1;
        if (output) output.value = String(count);
      },
      {signal: controller.signal},
    );
    counter.querySelector('[data-increase]')?.addEventListener(
      'click',
      () => {
        count += 1;
        if (output) output.value = String(count);
        if (count === 3) {
          void import('./celebrate.js').then(({celebrate}) => celebrate(counter));
        }
      },
      {signal: controller.signal},
    );
  }
}

function unmountCounters(root: ParentNode): void {
  for (const counter of countersWithin(root)) {
    counters.get(counter)?.abort();
    counters.delete(counter);
  }
}

function handleSectionLoad(event: Event): void {
  mountCounters(event.target as ParentNode);
}

function handleSectionUnload(event: Event): void {
  unmountCounters(event.target as ParentNode);
}

mountCounters();
document.addEventListener('shopify:section:load', handleSectionLoad);
document.addEventListener('shopify:section:unload', handleSectionUnload);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
    document.removeEventListener('shopify:section:unload', handleSectionUnload);
    unmountCounters(document);
  });
}
