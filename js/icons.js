const exceptions = {
  "Shepherd's Pie": 'Shepherds Pie.png',
  'Caffè Latte': 'Caffe Latte.png',
  'Caffè Mocha': 'Caffe Mocha.png'
};

export function iconUrl(nameEn) {
  if (!nameEn) return '';
  const fileName = exceptions[nameEn] ?? `${nameEn}.png`;
  return `https://hayday.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
}

export function iconMarkup(item, small = false) {
  const url = iconUrl(item?.nameEn);
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
