import {mountSections} from '../sections';

const dispose = mountSections('[data-quantity-demo]', (element) => {
  const input = element.querySelector<HTMLInputElement>('input[type="number"]');
  const buttons = [...element.querySelectorAll<HTMLButtonElement>('[data-step]')];
  if (!input) return () => {};
  const controller = new AbortController();
  const options = {signal: controller.signal};

  function updateButtons(): void {
    if (!input) return;
    for (const button of buttons) {
      button.disabled =
        Number(button.dataset.step) < 0
          ? input.valueAsNumber <= Number(input.min)
          : input.valueAsNumber >= Number(input.max);
    }
  }

  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener(
      'click',
      () => {
        if (!Number.isFinite(input.valueAsNumber)) input.value = input.min;
        input.stepUp(Number(button.dataset.step));
        input.dispatchEvent(new Event('input', {bubbles: true}));
      },
      options,
    );
  }
  input.addEventListener('input', updateButtons, options);
  updateButtons();

  return () => {
    controller.abort();
    for (const button of buttons) {
      button.hidden = true;
      button.disabled = false;
    }
  };
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
