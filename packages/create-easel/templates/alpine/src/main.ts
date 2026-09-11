import Alpine from 'alpinejs';

Alpine.data('easelCounter', () => ({count: 0}));
Alpine.start();

function handleSectionLoad(event: Event): void {
  if (event.target instanceof HTMLElement) Alpine.initTree(event.target);
}

function handleSectionUnload(event: Event): void {
  if (event.target instanceof HTMLElement) Alpine.destroyTree(event.target);
}

document.addEventListener('shopify:section:load', handleSectionLoad);
document.addEventListener('shopify:section:unload', handleSectionUnload);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
    document.removeEventListener('shopify:section:unload', handleSectionUnload);
  });
}
