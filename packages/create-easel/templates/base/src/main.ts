import {mountSections} from './sections';

const dispose = mountSections('[data-easel-counter]', (element) => {
  const decrease = element.querySelector<HTMLButtonElement>('[data-decrease-button]');
  const increase = element.querySelector<HTMLButtonElement>('[data-increase-button]');
  const output = element.querySelector('output');
  if (!decrease || !increase || !output) return () => {};
  let count = 0;
  const controller = new AbortController();
  decrease.disabled = false;
  increase.disabled = false;
  decrease.addEventListener(
    'click',
    () => {
      output.value = String(--count);
    },
    {signal: controller.signal},
  );
  increase.addEventListener(
    'click',
    () => {
      output.value = String(++count);
    },
    {signal: controller.signal},
  );
  return () => controller.abort();
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
