import Alpine from 'alpinejs';
import './style.css';

Alpine.data('docsNavigation', () => ({
  activeSection: 'overview',
  mobileOpen: false,
  observer: undefined as IntersectionObserver | undefined,
  init() {
    const sections = [...document.querySelectorAll<HTMLElement>('main section[id]')];
    this.observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) this.activeSection = visible.target.id;
      },
      {rootMargin: '-15% 0px -70%', threshold: [0, 0.2, 0.6]},
    );
    for (const section of sections) this.observer.observe(section);
  },
  navigate() {
    this.mobileOpen = false;
  },
}));

Alpine.data('copyCode', (label: string) => ({
  copied: false,
  label,
  resetTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  async copy(event: Event) {
    const button = event.currentTarget as HTMLElement;
    const code = button.closest('.code-shell')?.querySelector('code')?.textContent ?? '';
    await navigator.clipboard.writeText(code);
    this.copied = true;
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.copied = false;
    }, 1600);
  },
}));

Alpine.start();
