export {};

const mounted = new WeakSet<Element>();

function mountAnnouncements(root: ParentNode = document): void {
  for (const element of root.querySelectorAll('[data-announcement]')) {
    if (mounted.has(element)) continue;
    mounted.add(element);
    element.setAttribute('data-enhanced', 'true');
  }
}

function handleSectionLoad(event: Event): void {
  mountAnnouncements(event.target as ParentNode);
}

mountAnnouncements();
document.addEventListener('shopify:section:load', handleSectionLoad);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
  });
}
