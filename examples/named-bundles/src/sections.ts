export function mountSections(
  selector: string,
  mount: (element: HTMLElement) => () => void,
): () => void {
  const mounted = new Map<HTMLElement, () => void>();

  function mountWithin(root: ParentNode): void {
    const elements = [...root.querySelectorAll<HTMLElement>(selector)];
    if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
    for (const element of elements) {
      if (!mounted.has(element)) mounted.set(element, mount(element));
    }
  }

  function onSectionLoad(event: Event): void {
    if (event.target instanceof HTMLElement) mountWithin(event.target);
  }

  function onSectionUnload(event: Event): void {
    if (!(event.target instanceof HTMLElement)) return;
    for (const [element, dispose] of mounted) {
      if (event.target.contains(element)) {
        dispose();
        mounted.delete(element);
      }
    }
  }

  mountWithin(document);
  document.addEventListener('shopify:section:load', onSectionLoad);
  document.addEventListener('shopify:section:unload', onSectionUnload);

  return () => {
    document.removeEventListener('shopify:section:load', onSectionLoad);
    document.removeEventListener('shopify:section:unload', onSectionUnload);
    for (const dispose of mounted.values()) dispose();
    mounted.clear();
  };
}
