import '@vitejs/plugin-react/preamble';
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mountSections} from './sections';

function Counter({decrease, increase}: {decrease: string; increase: string}) {
  const [count, setCount] = useState(0);
  return (
    <div className="counter">
      <button
        type="button"
        aria-label={decrease}
        onClick={() => setCount((value) => value - 1)}
      >
        −
      </button>
      <output>{count}</output>
      <button
        type="button"
        aria-label={increase}
        onClick={() => setCount((value) => value + 1)}
      >
        +
      </button>
    </div>
  );
}

const dispose = mountSections('[data-easel-counter]', (element) => {
  const root = createRoot(element);
  root.render(
    <Counter
      decrease={element.dataset.decrease ?? ''}
      increase={element.dataset.increase ?? ''}
    />,
  );
  return () => root.unmount();
});

if (import.meta.hot) import.meta.hot.dispose(dispose);
