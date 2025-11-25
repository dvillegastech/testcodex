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
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: TIMEOUT,
      maxRedirects: 5,
    });
    return cheerio.load(response.data);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
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
};
