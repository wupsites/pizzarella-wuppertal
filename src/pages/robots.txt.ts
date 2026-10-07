import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://pizzarella-wuppertal.de/').replace(/\/?$/, '/');
  return new Response(`User-agent: *\nAllow: /\nDisallow: /kasse/\nDisallow: /api/\n\nSitemap: ${base}sitemap-index.xml\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
