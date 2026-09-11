export function mountSections(
  selector: string,
  initialize: (element: HTMLElement) => () => void,
): () => void {
  const cleanups = new Map<HTMLElement, () => void>();

  function mount(root: ParentNode): void {
    const elements = [...root.querySelectorAll(selector)];
    if (root instanceof HTMLElement && root.matches(selector)) elements.unshift(root);
    for (const element of elements) {
      if (!(element instanceof HTMLElement) || cleanups.has(element)) continue;
      const fallback = element.innerHTML;
      const dispose = initialize(element);
      cleanups.set(element, () => {
        dispose();
        element.innerHTML = fallback;
      });
    }
  }

  function unmount(root: ParentNode): void {
    for (const [element, dispose] of cleanups) {
      if (!root.contains(element)) continue;
      dispose();
      cleanups.delete(element);
    }
  }

  function handleSectionLoad(event: Event): void {
    if (event.target instanceof HTMLElement) mount(event.target);
  }

  function handleSectionUnload(event: Event): void {
    if (event.target instanceof HTMLElement) unmount(event.target);
  }

  mount(document);
  document.addEventListener('shopify:section:load', handleSectionLoad);
  document.addEventListener('shopify:section:unload', handleSectionUnload);

  return () => {
    document.removeEventListener('shopify:section:load', handleSectionLoad);
    document.removeEventListener('shopify:section:unload', handleSectionUnload);
    for (const dispose of cleanups.values()) dispose();
    cleanups.clear();
  };
}
