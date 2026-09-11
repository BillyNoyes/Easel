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

function handleSectionLoad(event: Event): void {
  mount(event.target as ParentNode);
}

function handleSectionUnload(event: Event): void {
  unmount(event.target as ParentNode);
}

mount();
document.addEventListener('shopify:section:load', handleSectionLoad);
document.addEventListener('shopify:section:unload', handleSectionUnload);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
    document.removeEventListener('shopify:section:unload', handleSectionUnload);
    unmount(document);
  });
}
