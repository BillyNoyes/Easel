const status = document.querySelector<HTMLElement>('[data-shared-status]');

if (status) {
  status.textContent = status.dataset.loadedLabel ?? '';
}
