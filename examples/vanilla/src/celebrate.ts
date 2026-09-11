export function celebrate(element: Element): void {
  element.classList.add('is-celebrating');
  window.setTimeout(() => element.classList.remove('is-celebrating'), 600);
}
