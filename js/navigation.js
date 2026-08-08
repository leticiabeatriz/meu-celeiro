const pages=[...document.querySelectorAll("[data-page]")],links=[...document.querySelectorAll("[data-route]")];
export function currentRoute(){const r=location.hash.replace("#","").trim();return pages.some(p=>p.dataset.page===r)?r:"home"}
export function renderRoute(){const r=currentRoute();pages.forEach(p=>p.hidden=p.dataset.page!==r);links.forEach(l=>l.classList.toggle("active",l.dataset.route===r));return r}
export function initNavigation(onChange){if(!location.hash)history.replaceState(null,"","#home");const render=()=>{const r=renderRoute();onChange?.(r)};window.addEventListener("hashchange",render);render()}
