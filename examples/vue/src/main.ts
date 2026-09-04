import {createApp, type App} from 'vue';
import Counter from './Counter.vue';

const apps = new Map<Element, App<Element>>();

function mountsWithin(root: ParentNode): Element[] {
  const mounts = [...root.querySelectorAll('[data-vue-counter]')];
  if (root instanceof Element && root.matches('[data-vue-counter]')) mounts.unshift(root);
  return mounts;
}

function mount(root: ParentNode = document): void {
  for (const element of mountsWithin(root)) {
    if (apps.has(element)) continue;
    const app = createApp(Counter, {
      decrease: element.getAttribute('data-decrease') ?? 'Decrease',
      increase: element.getAttribute('data-increase') ?? 'Increase',
    });
    app.mount(element);
    apps.set(element, app);
  }
}

function unmount(root: ParentNode): void {
  for (const element of mountsWithin(root)) {
    apps.get(element)?.unmount();
    apps.delete(element);
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
