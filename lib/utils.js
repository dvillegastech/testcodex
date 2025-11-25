const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = process.env.BASE_URL || 'https://seriesflix.boats';
const TIMEOUT = 30000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

/**
 * Realiza una petición HTTP y devuelve el HTML parseado con Cheerio
 */
async function fetchPage(url) {
  const fetchWithHeaders = async targetUrl => {
    const response = await axios.get(targetUrl, {
      headers: HEADERS,
      timeout: TIMEOUT,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
    });

    return cheerio.load(response.data);
  };

  try {
    return await fetchWithHeaders(url);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
  }

  // Fallback: intenta recuperar el HTML a través de r.jina.ai (proxy de solo lectura)
  try {
    const normalizedUrl = url.replace(/^https?:\/\//, '');
    const proxyUrl = `https://r.jina.ai/http://${normalizedUrl}`;

    const response = await axios.get(proxyUrl, {
      headers: {
        ...HEADERS,
        Accept: 'text/html, text/plain;q=0.9,*/*;q=0.8',
      },
      timeout: TIMEOUT,
    });

    const body = typeof response.data === 'string' ? response.data : '';
    const doctypeIndex = body.indexOf('<!DOCTYPE');
    const html = doctypeIndex !== -1 ? body.slice(doctypeIndex) : body;

    return cheerio.load(html);
  } catch (error) {
    console.error(`Fallback fetch failed for ${url}:`, error.message);
    return null;
  }
}

/**
 * Extrae el ID único de una URL
 */
function extractIdFromUrl(url) {
  const parts = url.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Limpia y normaliza texto
 */
function cleanText(text) {
  if (!text) return '';
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Convierte URLs relativas en absolutas
 */
function makeAbsoluteUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return url.startsWith('/') ? `${BASE_URL}${url}` : `${BASE_URL}/${url}`;
}

module.exports = {
  BASE_URL,
  fetchPage,
  extractIdFromUrl,
  cleanText,
  makeAbsoluteUrl,
  HEADERS,
};
