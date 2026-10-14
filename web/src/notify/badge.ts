// The tab's title badge ("(2) Dunder Mifflin OS") and favicon (the DM mark, with a red dot when something needs you). Pure.
export const BASE_TITLE = 'Dunder Mifflin OS';

export function badgeTitle(count: number, base = BASE_TITLE): string {
  if (count <= 0) return base;
  return `(${count > 99 ? '99+' : count}) ${base}`;
}

export function faviconSvg(dot: boolean): string {
  const mark = '<rect x="1" y="1" width="30" height="30" rx="7" fill="#1f5fae"/>'
    + '<text x="16" y="21.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="900" fill="#fff">DM</text>';
  const badge = dot ? '<circle cx="25" cy="7" r="6.5" fill="#d64545" stroke="#fff" stroke-width="2"/>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${mark}${badge}</svg>`;
}

export const faviconHref = (dot: boolean): string => `data:image/svg+xml,${encodeURIComponent(faviconSvg(dot))}`;
