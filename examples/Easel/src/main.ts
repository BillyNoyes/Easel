document.documentElement.classList.add('js');

document.addEventListener('shopify:section:load', () => {
  document.documentElement.dataset.sectionUpdated = 'true';
});
