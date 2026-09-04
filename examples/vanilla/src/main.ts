export {};

const counters = new WeakSet<Element>();

function mountCounters(root: ParentNode = document): void {
  for (const counter of root.querySelectorAll('[data-counter]')) {
    if (counters.has(counter)) continue;
    counters.add(counter);
    const output = counter.querySelector<HTMLOutputElement>('[data-count]');
    let count = 0;
    counter.querySelector('[data-decrease]')?.addEventListener('click', () => {
      count -= 1;
      if (output) output.value = String(count);
    });
    counter.querySelector('[data-increase]')?.addEventListener('click', () => {
      count += 1;
      if (output) output.value = String(count);
      if (count === 3) {
        void import('./celebrate.js').then(({celebrate}) => celebrate(counter));
      }
    });
  }
}

mountCounters();

const shopifyWindow = window as typeof window & {
  Shopify?: {designMode?: boolean};
};

if (shopifyWindow.Shopify?.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    mountCounters(event.target as ParentNode);
  });
}
