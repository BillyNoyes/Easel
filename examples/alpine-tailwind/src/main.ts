import Alpine from 'alpinejs';

Alpine.data('counter', () => ({count: 0}));
Alpine.start();

const shopifyWindow = window as typeof window & {
  Shopify?: {designMode?: boolean};
};

if (shopifyWindow.Shopify?.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    Alpine.initTree(event.target as HTMLElement);
  });

  document.addEventListener('shopify:section:unload', (event) => {
    Alpine.destroyTree(event.target as HTMLElement);
  });
}
