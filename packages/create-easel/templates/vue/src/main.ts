import {createApp} from 'vue';
import Counter from './Counter.vue';
import {mountSections} from './sections';

const dispose = mountSections('[data-easel-counter]', (element) => {
  const app = createApp(Counter, {
    decrease: element.dataset.decrease ?? '',
    increase: element.dataset.increase ?? '',
  });
  app.mount(element);
  return () => app.unmount();
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
