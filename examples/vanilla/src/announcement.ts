export {};

const mounted = new WeakSet<Element>();

function mountAnnouncements(root: ParentNode = document): void {
  for (const element of root.querySelectorAll('[data-announcement]')) {
    if (mounted.has(element)) continue;
    mounted.add(element);
    element.setAttribute('data-enhanced', 'true');
  }
}

mountAnnouncements();

const shopifyWindow = window as typeof window & {
  Shopify?: {designMode?: boolean};
};

if (shopifyWindow.Shopify?.designMode) {
  document.addEventListener('shopify:section:load', (event) => {
    mountAnnouncements(event.target as ParentNode);
  });
}
