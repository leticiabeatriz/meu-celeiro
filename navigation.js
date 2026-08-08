const pages = [...document.querySelectorAll('[data-page]')];
const links = [...document.querySelectorAll('[data-route]')];

export function currentRoute() {
  const route = location.hash.replace('#', '').trim();
  return pages.some(page => page.dataset.page === route) ? route : 'celeiros';
}

export function renderRoute() {
  const route = currentRoute();
  pages.forEach(page => { page.hidden = page.dataset.page !== route; });
  links.forEach(link => { link.classList.toggle('active', link.dataset.route === route); });
  return route;
}

export function initNavigation(onChange) {
  if (!location.hash || location.hash === '#home') history.replaceState(null, '', '#celeiros');
  const render = () => onChange?.(renderRoute());
  window.addEventListener('hashchange', render);
  render();
}
