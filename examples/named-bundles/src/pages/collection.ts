import {mountSections} from '../sections';

const dispose = mountSections('[data-collection-filter]', (element) => {
  const controls = element.querySelector<HTMLElement>('[data-filter-controls]');
  const input = element.querySelector<HTMLInputElement>('input[type="search"]');
  const status = element.querySelector<HTMLElement>('[data-filter-status]');
  const cards = [...element.querySelectorAll<HTMLElement>('[data-product-title]')];
  if (!controls || !input || !status) return () => {};
  const controller = new AbortController();
  const originalStatus = status.textContent;

  function filter(): void {
    if (!input || !status) return;
    const query = input.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      card.hidden = !(card.dataset.productTitle ?? '')
        .toLocaleLowerCase()
        .includes(query);
      if (!card.hidden) visible++;
    }
    status.textContent = (status.dataset.countLabel ?? '').replace(
      '[count]',
      String(visible),
    );
  }

  controls.hidden = false;
  input.addEventListener('input', filter, {signal: controller.signal});
  filter();

  return () => {
    controller.abort();
    controls.hidden = true;
    for (const card of cards) card.hidden = false;
    status.textContent = originalStatus;
  };
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
