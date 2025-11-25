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
 * Soporta JWPlayer y otros players que ofuscan las URLs
 */
async function extractVideoUrl(playerUrl) {
  try {
    // Caso 1: URL con iframe anidado (Waaw y similares)
    // Ejemplo: https://nuuuppp.sbs/iframe/?url=https%3A%2F%2Fwaaw.tv%2F...
    if (playerUrl.includes('/iframe/?url=')) {
      const urlParams = new URL(playerUrl);
      const nestedUrl = urlParams.searchParams.get('url');
      if (nestedUrl) {
        // Recursivamente resolver la URL anidada
        return await extractVideoUrl(decodeURIComponent(nestedUrl));
      }
    }

    const html = await fetchHtml(playerUrl);
    if (!html) return null;

    // Método 1: Buscar cualquier array con forEach que decodifica Base64
    // Patrón: var ARRAY = ["base64"...]; var VARIABLE = ""; ARRAY.forEach(function...)
    const arrayPattern = /var\s+(\w+)\s*=\s*\[([^\]]+)\];[\s\S]*?var\s+(\w+)\s*=\s*"";[\s\S]*?\1\.forEach\(function\s+\w+\(value\)\s*\{[\s\S]*?String\.fromCharCode\(parseInt\(atob\(value\)\.replace\(\/\\D\/g,\s*['"]{2}\)\)\s*-\s*(\d+)\)/;
    const arrayMatch = html.match(arrayPattern);

    if (arrayMatch) {
      const arrayName = arrayMatch[1];
      const arrayContent = arrayMatch[2];
      const offset = parseInt(arrayMatch[4]);
      const values = arrayContent.match(/"([^"]+)"/g);

      if (values && offset) {
        try {
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

          if (decodedUrl && decodedUrl.startsWith('http')) {
            // Buscar si hay parámetros de sesión que agregar
            const sessionMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);
            if (sessionMatch && html.includes('file:') && html.includes('?s=')) {
              return decodedUrl + '?s=' + sessionMatch[1];
            }
            return decodedUrl;
          }
        } catch (e) {
          console.error('Error processing array with forEach:', e.message);
        }
      }
    }

    // Fallback: buscar arrays con nombres comunes (xrpubgUnC, CLMVsGCNF, etc)
    const commonArrayMatch = html.match(/var\s+(xrpubgUnC|CLMVsGCNF|[A-Z]{6,})\s*=\s*\[([^\]]+)\]/);
    if (commonArrayMatch) {
      const arrayContent = commonArrayMatch[2];
      const values = arrayContent.match(/"([^"]+)"/g);

      // Intentar con diferentes offsets comunes
      const commonOffsets = [4232499, 1657710, 4232500, 1657711];

      for (const offset of commonOffsets) {
        if (values) {
          try {
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

            if (decodedUrl && decodedUrl.startsWith('http')) {
              // Buscar si hay parámetros de sesión que agregar
              const sessionMatch = html.match(/var\s+sesz\s*=\s*["']([^"']+)["']/);
              if (sessionMatch && html.includes('file:') && html.includes('?s=')) {
                return decodedUrl + '?s=' + sessionMatch[1];
              }
              return decodedUrl;
            }
          } catch (e) {
            // Probar con el siguiente offset
          }
        }
      }
    }

    // Método 2: Buscar variable QqntSWkx que contiene la URL decodificada
    const urlVarMatch = html.match(/var\s+(\w+)\s*=\s*""\s*;\s*\w+\.forEach\([^)]+\)\s*;[\s\S]*?file:\s*\1\s*\+/);
    if (urlVarMatch) {
      const varName = urlVarMatch[1];
      // Buscar el array asociado
      const arrayPattern = new RegExp(`var\\s+\\w+\\s*=\\s*\\[([^\\]]+)\\];[\\s\\S]*?${varName}`);
      const arrayMatch = html.match(arrayPattern);

      if (arrayMatch) {
        const values = arrayMatch[1].match(/"([^"]+)"/g);
        if (values) {
          try {
            let decodedUrl = '';
            for (const quotedValue of values) {
              const value = quotedValue.replace(/"/g, '');
              const decoded = Buffer.from(value, 'base64').toString('utf-8');
              const numbers = decoded.replace(/\D/g, '');
              const charCode = parseInt(numbers) - 1657710;
              decodedUrl += String.fromCharCode(charCode);
            }

            if (decodedUrl && decodedUrl.startsWith('http')) {
              return decodedUrl;
            }
          } catch (e) {
            console.error('Error decoding URL variable:', e.message);
          }
        }
      }
    }

    // Fallback 1: Buscar directamente URLs .m3u8 en el HTML
    const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
    if (m3u8Match) {
      return m3u8Match[1];
    }

    // Fallback 2: Buscar en setup de jwplayer con concatenación de variables
    // Ejemplo: file: varUrl + "?s=" + sesz + ""
    const setupWithVarsMatch = html.match(/file\s*:\s*(\w+)\s*\+\s*["']([^"']+)["']\s*\+\s*(\w+)/);
    if (setupWithVarsMatch) {
      const baseUrlVar = setupWithVarsMatch[1];
      const queryStart = setupWithVarsMatch[2];
      const sessionVar = setupWithVarsMatch[3];

      // Buscar el valor de la variable de sesión
      const sessionMatch = html.match(new RegExp(`var\\s+${sessionVar}\\s*=\\s*["']([^"']+)["']`));
      const sessionValue = sessionMatch ? sessionMatch[1] : '';

      // Buscar el valor de la URL base (ya debería estar decodificado)
      const baseUrlMatch = html.match(new RegExp(`var\\s+${baseUrlVar}\\s*=\\s*["']([^"']+)["']`));
      if (baseUrlMatch) {
        const completeUrl = baseUrlMatch[1] + queryStart + sessionValue;
        if (completeUrl.startsWith('http')) {
          return completeUrl;
        }
      }
    }

    // Fallback 3: Buscar en variables 'file:' comunes de JWPlayer
    const fileMatch = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (fileMatch) {
      return fileMatch[1];
    }

    // Fallback 3: Buscar iframe src anidado
    const iframeSrcMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeSrcMatch) {
      const iframeSrc = iframeSrcMatch[1];
      if (iframeSrc.includes('http')) {
        // Recursivamente resolver el iframe
        return await extractVideoUrl(iframeSrc);
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting video URL:', error.message);
    return null;
  }
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
