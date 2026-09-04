import '@vitejs/plugin-react/preamble';
import {useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';

const roots = new Map<Element, Root>();

function Counter({decrease, increase}: {decrease: string; increase: string}) {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <button
        type="button"
        onClick={() => setCount((value) => value - 1)}
        aria-label={decrease}
      >
        −
      </button>
      <output>{count}</output>
      <button
        type="button"
        onClick={() => setCount((value) => value + 1)}
        aria-label={increase}
      >
        +
      </button>
    </div>
  );
}

function mountsWithin(root: ParentNode): Element[] {
  const mounts = [...root.querySelectorAll('[data-react-counter]')];
  if (root instanceof Element && root.matches('[data-react-counter]'))
    mounts.unshift(root);
  return mounts;
}

function mount(root: ParentNode = document): void {
  for (const element of mountsWithin(root)) {
    if (roots.has(element)) continue;
    const reactRoot = createRoot(element);
    roots.set(element, reactRoot);
    reactRoot.render(
      <Counter
        decrease={element.getAttribute('data-decrease') ?? 'Decrease'}
        increase={element.getAttribute('data-increase') ?? 'Increase'}
      />,
    );
  }
}

function unmount(root: ParentNode): void {
  for (const element of mountsWithin(root)) {
    roots.get(element)?.unmount();
    roots.delete(element);
  }
}

mount();

const shopifyWindow = window as typeof window & {
  Shopify?: {designMode?: boolean};
};

if (shopifyWindow.Shopify?.designMode) {
  document.addEventListener('shopify:section:load', (event) =>
    mount(event.target as ParentNode),
  );
  document.addEventListener('shopify:section:unload', (event) =>
    unmount(event.target as ParentNode),
  );
}
