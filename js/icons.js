const ICON_BASE_URL = new URL('../assets/icons/', import.meta.url);

export function iconUrl(itemOrSlug) {
  const slug = typeof itemOrSlug === 'string' ? itemOrSlug : itemOrSlug?.id;
  return slug ? new URL(`${encodeURIComponent(slug)}.png`, ICON_BASE_URL).href : '';
}

export function iconMarkup(item, small = false) {
  const url = iconUrl(item);
  const className = `item-icon-clean${small ? ' small' : ''}`;
  if (!url) return '<span class="icon-fallback-clean">IMG</span>';
  return `<img class="${className}" src="${url}" alt="" loading="lazy">`;
}

export function bindImageFallbacks(container = document) {
  container.querySelectorAll('.item-icon-clean').forEach(img => {
    if (img.dataset.fallbackBound) return;
    img.dataset.fallbackBound = '1';
    img.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'icon-fallback-clean';
      fallback.textContent = 'IMG';
      img.replaceWith(fallback);
    });
  });
}
