import Alpine from 'alpinejs';

Alpine.data('counter', () => ({count: 0}));
Alpine.start();

function handleSectionLoad(event: Event): void {
  Alpine.initTree(event.target as HTMLElement);
}

function handleSectionUnload(event: Event): void {
  Alpine.destroyTree(event.target as HTMLElement);
}

document.addEventListener('shopify:section:load', handleSectionLoad);
document.addEventListener('shopify:section:unload', handleSectionUnload);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
    document.removeEventListener('shopify:section:unload', handleSectionUnload);
  });
}
