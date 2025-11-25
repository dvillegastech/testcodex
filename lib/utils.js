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

async function fetchHtml(url) {
  const fetchWithHeaders = async targetUrl => {
    const response = await axios.get(targetUrl, {
      headers: HEADERS,
      timeout: TIMEOUT,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
    });

    return response.data;
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

    return html;
  } catch (error) {
    console.error(`Fallback fetch failed for ${url}:`, error.message);
    return null;
  }
}

/**
 * Realiza una petición HTTP y devuelve el HTML parseado con Cheerio
 */
async function fetchPage(url) {
  const html = await fetchHtml(url);
  if (!html) return null;

  return cheerio.load(html);
}

/**
 * Igual que fetchPage pero también devuelve el HTML bruto por si es necesario analizar scripts
 */
async function fetchPageWithHtml(url) {
  const html = await fetchHtml(url);
  const $ = html ? cheerio.load(html) : null;

  if (!$) return { $, html: html || '' };

  return { $, html };
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

/**
 * Extrae la URL del video M3U8/HLS desde un iframe de player
 * Soporta nuuuppp.sbs, waaw.tv y otros players que ofuscan las URLs
 */
async function extractVideoUrl(playerUrl) {
  try {
    // Caso 1: URL con iframe anidado (nuuuppp.sbs/iframe/?url=waaw.tv)
    if (playerUrl.includes('/iframe/?url=')) {
      const urlParams = new URL(playerUrl);
      const nestedUrl = urlParams.searchParams.get('url');
      if (nestedUrl) {
        const decodedNestedUrl = decodeURIComponent(nestedUrl);
        
        // Si es waaw.tv, convertir watch_video.php a embed /e/
        if (decodedNestedUrl.includes('waaw.tv')) {
          if (decodedNestedUrl.includes('watch_video.php')) {
            const vMatch = decodedNestedUrl.match(/v=([^&]+)/);
            if (vMatch) {
              const embedUrl = `https://waaw.tv/e/${vMatch[1]}`;
              return await extractVideoUrl(embedUrl);
            }
          }
          return await extractVideoUrl(decodedNestedUrl);
        }
        
        // Recursivamente resolver otras URLs anidadas
        return await extractVideoUrl(decodedNestedUrl);
      }
    }

    const html = await fetchHtml(playerUrl);
    if (!html) return null;

    // ===== MÉTODO 1: nuuuppp.sbs/watch/ - Array Base64 con offset dinámico =====
    // Buscar array antes de </script> (formato específico de nuuuppp.sbs)
    const arrayMatch = html.match(/var\s+(\w+)\s*=\s*\[([^\]]+)\];\s*<\/script>/);
    if (arrayMatch) {
      const arrayContent = arrayMatch[2];
      const values = arrayContent.match(/"([^"]+)"/g);
      
      // Buscar el offset dinámico en el código (formato: - NUMERO)
      const offsetMatch = html.match(/-\s*(\d{5,})\)/);
      
      if (values && offsetMatch) {
        const offset = parseInt(offsetMatch[1]);
        const decodedUrl = decodeBase64Array(values, offset);
        
        if (decodedUrl && decodedUrl.startsWith('http')) {
          // Buscar token de sesión
          const sessionMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);
          if (sessionMatch) {
            return decodedUrl + '?s=' + sessionMatch[1];
          }
          return decodedUrl;
        }
      }
    }

    // ===== MÉTODO 2: waaw.tv - URL m3u8 directa en src: =====
    const waawM3u8Match = html.match(/src:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i);
    if (waawM3u8Match) {
      return waawM3u8Match[1];
    }

    // ===== MÉTODO 3: Buscar cualquier URL m3u8 en el HTML =====
    const m3u8Patterns = [
      /["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/gi,
      /(https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*)/gi,
      /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
      /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
    ];

    for (const pattern of m3u8Patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const url = match[1] || match[0];
        if (url && url.startsWith('http') && url.includes('.m3u8')) {
          return url.replace(/\\"/g, '').replace(/\\/g, '');
        }
      }
    }

    // ===== MÉTODO 4: Arrays con forEach y atob (patrón genérico) =====
    const genericArrayPattern = /var\s+(\w+)\s*=\s*\[([^\]]+)\];[\s\S]*?\.forEach[\s\S]*?atob[\s\S]*?-\s*(\d{5,})\)/;
    const genericMatch = html.match(genericArrayPattern);
    if (genericMatch) {
      const arrayContent = genericMatch[2];
      const offset = parseInt(genericMatch[3]);
      const values = arrayContent.match(/"([^"]+)"/g);
      
      if (values && offset) {
        const decodedUrl = decodeBase64Array(values, offset);
        if (decodedUrl && decodedUrl.startsWith('http')) {
          const sessionMatch = html.match(/var\s+sesz?\s*=\s*["']([^"']+)["']/);
          if (sessionMatch && html.includes('?s=')) {
            return decodedUrl + '?s=' + sessionMatch[1];
          }
          return decodedUrl;
        }
      }
    }

    // ===== MÉTODO 5: JWPlayer setup con file: variable + session =====
    const setupWithVarsMatch = html.match(/file\s*:\s*(\w+)\s*\+\s*["']([^"']+)["']\s*\+\s*(\w+)/);
    if (setupWithVarsMatch) {
      const baseUrlVar = setupWithVarsMatch[1];
      const queryStart = setupWithVarsMatch[2];
      const sessionVar = setupWithVarsMatch[3];

      const sessionMatch = html.match(new RegExp(`var\\s+${sessionVar}\\s*=\\s*["']([^"']+)["']`));
      const sessionValue = sessionMatch ? sessionMatch[1] : '';

      const baseUrlMatch = html.match(new RegExp(`var\\s+${baseUrlVar}\\s*=\\s*["']([^"']+)["']`));
      if (baseUrlMatch && baseUrlMatch[1].startsWith('http')) {
        return baseUrlMatch[1] + queryStart + sessionValue;
      }
    }

    // ===== MÉTODO 6: iframe anidado =====
    const iframeSrcMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeSrcMatch) {
      const iframeSrc = iframeSrcMatch[1];
      const fullUrl = iframeSrc.startsWith('//') ? 'https:' + iframeSrc : iframeSrc;
      if (fullUrl.startsWith('http') && fullUrl !== playerUrl) {
        return await extractVideoUrl(fullUrl);
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting video URL:', error.message);
    return null;
  }
}

/**
 * Decodifica un array de valores Base64 con un offset numérico
 */
function decodeBase64Array(values, offset) {
  let decodedUrl = '';
  
  for (const quotedValue of values) {
    const value = quotedValue.replace(/"/g, '');
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf-8');
      const numbers = decoded.replace(/\D/g, '');
      const charCode = parseInt(numbers) - offset;
      if (!isNaN(charCode) && charCode > 0 && charCode < 256) {
        decodedUrl += String.fromCharCode(charCode);
      }
    } catch (e) {
      // Ignorar errores de decodificación individual
    }
  }
  
  return decodedUrl;
}

module.exports = {
  BASE_URL,
  fetchPage,
  fetchPageWithHtml,
  extractIdFromUrl,
  cleanText,
  makeAbsoluteUrl,
  extractVideoUrl,
  HEADERS,
};
