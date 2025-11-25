const axios = require('axios');
const cheerio = require('cheerio');
const { BASE_URL, fetchPage, fetchPageWithHtml, extractIdFromUrl, cleanText, makeAbsoluteUrl, HEADERS } = require('../utils');

/**
 * Scrape del listado de series desde /series-online/
 */
async function scrapeSeriesList(page = 1) {
  const url = page === 1
    ? `${BASE_URL}/series-online/`
    : `${BASE_URL}/series-online/page/${page}/`;

  const $ = await fetchPage(url);
  if (!$) return [];

  const seriesList = [];

  $('.TPost.B, article.TPost.B').each((i, item) => {
    try {
      const $item = $(item);
      let link = $item.find('a[href*="/serie/"]').first();
      if (!link.length) link = $item.find('a').first();

      const titleElem = $item.find('.Title, a.Title').first();
      const img = $item.find('.Image img, figure img').first();
      const yearElem = $item.find('.Qlty').first();
      const infoElem = $item.find('.Info').first();

      const href = link.attr('href');
      if (href) {
        const url = makeAbsoluteUrl(href);

        let year = null;
        if (yearElem.length) {
          year = cleanText(yearElem.text());
        } else if (infoElem.length) {
          const infoText = cleanText(infoElem.text());
          const yearMatch = infoText.match(/(\d{4})/);
          if (yearMatch) year = yearMatch[1];
        }

        seriesList.push({
          id: extractIdFromUrl(url),
          title: cleanText(titleElem.text()) || cleanText(link.text()),
          url,
          image: img.length ? makeAbsoluteUrl(img.attr('src') || img.attr('data-src') || '') : null,
          year,
          rating: null,
        });
      }
    } catch (error) {
      console.error('Error parsing series:', error.message);
    }
  });

  return seriesList;
}

/**
 * Scrape del detalle de una serie incluyendo temporadas y episodios
 */
async function scrapeSeriesDetail(seriesId) {
  const seriesUrl = `${BASE_URL}/serie/${seriesId}/`;
  let $ = await fetchPage(seriesUrl);

  if (!$) {
    $ = await fetchPage(`${BASE_URL}/serie/${seriesId}`);
    if (!$) return null;
  }

  try {
    const titleElem = $('h1.Title, .Title, h1').first();
    const title = cleanText(titleElem.text()) || seriesId;

    const imgElem = $('.TPost img, .Image img, article img, figure img').first();
    const image = imgElem.length ? makeAbsoluteUrl(imgElem.attr('src') || imgElem.attr('data-src') || '') : null;

    const descriptionElem = $('.Description, p.Description, .TPMvCn p').first();
    const description = descriptionElem.length ? cleanText(descriptionElem.text()) : null;

    const yearElem = $('.Qlty, .Info .Qlty').first();
    let year = null;
    if (yearElem.length) {
      const yearText = cleanText(yearElem.text());
      const yearMatch = yearText.match(/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
    }

    const genres = [];
    $('a[href*="/genero/"]').slice(0, 5).each((i, elem) => {
      const genreText = cleanText($(elem).text());
      if (genreText && !genres.includes(genreText)) {
        genres.push(genreText);
      }
    });

    const cast = [];
    const castRegex = /Actores?:/i;
    $('*').filter(function() {
      return $(this).text().match(castRegex);
    }).first().find('a').slice(0, 10).each((i, elem) => {
      const actorName = cleanText($(elem).text());
      if (actorName) cast.push(actorName);
    });

    const seasons = await scrapeSeasonsFromLinks($, seriesId);

    return {
      id: seriesId,
      title,
      url: seriesUrl,
      image,
      description,
      year,
      rating: null,
      genres,
      cast,
      seasons,
    };
  } catch (error) {
    console.error('Error parsing series detail:', error.message);
    return null;
  }
}

/**
 * Extrae las temporadas desde los enlaces /temporada/
 */
async function scrapeSeasonsFromLinks($, seriesId) {
  const seasons = [];
  const seasonLinks = $('a[href*="/temporada/"]');

  if (seasonLinks.length === 0) {
    // Si no hay enlaces a temporadas, buscar episodios directamente
    const episodeLinks = $('a[href*="/episodio/"]');
    const episodes = [];

    episodeLinks.each((i, link) => {
      try {
        const url = makeAbsoluteUrl($(link).attr('href'));
        const epId = extractIdFromUrl(url);
        const match = epId.match(/-(\d+)x(\d+)/);
        const epNum = match ? parseInt(match[2]) : episodes.length + 1;

        episodes.push({
          number: epNum,
          title: cleanText($(link).text()) || `Episodio ${epNum}`,
          url,
          image: null,
          servers: [],
        });
      } catch (error) {
        console.error('Error parsing episode link:', error.message);
      }
    });

    if (episodes.length > 0) {
      seasons.push({ number: 1, episodes });
    }

    return seasons;
  }

  const seasonDict = {};

  for (let i = 0; i < seasonLinks.length; i++) {
    try {
      const link = seasonLinks[i];
      const seasonUrl = makeAbsoluteUrl($(link).attr('href'));
      const seasonSlug = extractIdFromUrl(seasonUrl);
      const seasonMatch = seasonSlug.match(/-(\d+)\/?$/);

      if (!seasonMatch) continue;
      const seasonNum = parseInt(seasonMatch[1]);

      if (seasonDict[seasonNum]) continue;

      const episodes = await scrapeSeasonEpisodes(seasonUrl);
      if (episodes.length > 0) {
        seasonDict[seasonNum] = { number: seasonNum, episodes };
      }
    } catch (error) {
      console.error('Error parsing season link:', error.message);
    }
  }

  const sortedSeasons = Object.keys(seasonDict)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(num => seasonDict[num]);

  return sortedSeasons;
}

/**
 * Extrae los episodios de una temporada específica
 */
async function scrapeSeasonEpisodes(seasonUrl) {
  const $ = await fetchPage(seasonUrl);
  if (!$) return [];

  const episodes = [];
  const episodeLinks = $('a[href*="/episodio/"]');

  episodeLinks.each((i, link) => {
    try {
      const url = makeAbsoluteUrl($(link).attr('href'));
      const epId = extractIdFromUrl(url);
      const match = epId.match(/-\d+x(\d+)/);
      const epNum = match ? parseInt(match[1]) : episodes.length + 1;

      const parent = $(link).closest('.TPost, article, li');
      let img = null;
      let titleText = cleanText($(link).text());

      if (parent.length) {
        const imgElem = parent.find('img').first();
        if (imgElem.length) {
          img = makeAbsoluteUrl(imgElem.attr('src') || imgElem.attr('data-src') || '');
        }

        const titleElem = parent.find('.Title').first();
        if (titleElem.length) {
          titleText = cleanText(titleElem.text());
        }
      }

      const episode = {
        number: epNum,
        title: titleText || `Episodio ${epNum}`,
        url,
        image: img,
        servers: [],
      };

      if (!episodes.find(e => e.number === epNum)) {
        episodes.push(episode);
      }
    } catch (error) {
      console.error('Error parsing episode:', error.message);
    }
  });

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

/**
 * Extrae los servidores de streaming de un episodio
 */
async function scrapeEpisodeServers(episodeUrl) {
  const { $, html } = await fetchPageWithHtml(episodeUrl);
  if (!$) return [];

  const pageHtml = html || '';

  const servers = [];
  const seenUrls = new Set();

  const tryParseJsonLike = snippet => {
    if (!snippet) return null;

    const cleaned = String(snippet)
      .replace(/^\s+|\s+$/g, '')
      .replace(/;$/, '');

    const normalizers = [
      value => value,
      value =>
        value
          .replace(/(\{|,|\[)\s*([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'([^']*)'/g, '"$1"'),
    ];

    for (const normalize of normalizers) {
      try {
        return JSON.parse(normalize(cleaned));
      } catch (e) {
        /* try next normalizer */
      }
    }

    return null;
  };

  const addServer = (name, url, quality = null, language = null) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : makeAbsoluteUrl(url);
    if (seenUrls.has(fullUrl)) return;

    seenUrls.add(fullUrl);
    servers.push({ name, url: fullUrl, quality, language });
  };

  const addParsedSources = parsed => {
    if (!parsed) return;

    const handleList = list => {
      list.forEach(source => {
        if (!source) return;
        const file =
          source.file ||
          source.src ||
          source.url ||
          source.link ||
          source.embed ||
          source.embed_url;

        const label = source.label || source.title || source.server || 'Servidor';
        const quality = source.res || source.quality || source.q || null;
        const language = source.lang || source.language || source.audio || null;

        addServer(label, file, quality, language);
      });
    };

    if (Array.isArray(parsed)) {
      handleList(parsed);
      return;
    }

    if (parsed && Array.isArray(parsed.sources)) {
      handleList(parsed.sources);
    }

    if (parsed && typeof parsed === 'object') {
      Object.values(parsed).forEach(value => {
        if (Array.isArray(value)) handleList(value);
      });
    }
  };

  const resolveServerUrl = $elem => {
    const possibleAttrs = [
      'data-video',
      'data-src',
      'data-url',
      'data-embed',
      'data-link',
      'data-file',
      'data-iframe',
      'data-href',
      'data-player',
      'href',
      'value',
    ];

    for (const attr of possibleAttrs) {
      let value = $elem.attr(attr);
      if (value) {
        // Decodificar Base64 si es necesario
        try {
          // Verificar si parece ser Base64 (sin protocolo http/https)
          if (!value.startsWith('http') && /^[A-Za-z0-9+/=]+$/.test(value)) {
            const decoded = Buffer.from(value, 'base64').toString('utf-8');
            // Verificar si el resultado decodificado es una URL válida
            if (decoded.startsWith('http')) {
              return decoded;
            }
          }
        } catch (e) {
          // Si falla la decodificación, usar el valor original
        }
        return value;
      }
    }

    const iframe = $elem.find('iframe').first();
    if (iframe.length) {
      return iframe.attr('src') || iframe.attr('data-src') || '';
    }

    return '';
  };

  const extractOptionData = $elem => {
    const labelElem = $elem.find('.server-name, .title, span').first();
    const label = cleanText(labelElem.text()) || cleanText($elem.text()) || 'Servidor';
    const language = cleanText($elem.attr('data-lang') || $elem.attr('data-language') || '');
    const quality = cleanText($elem.attr('data-quality') || $elem.attr('data-res') || '');

    return {
      label,
      language: language || null,
      quality: quality || null,
      embed: resolveServerUrl($elem),
      postId: $elem.attr('data-post') || null,
      nume: $elem.attr('data-nume') || null,
      type: $elem.attr('data-type') || null,
      provider: $elem.attr('data-provider') || null,
    };
  };

  const resolveAjaxIframe = async ({ postId, nume, type, provider }) => {
    if (!postId || !nume) return '';

    try {
      const ajaxUrl = `${BASE_URL}/wp-admin/admin-ajax.php`;
      const payload = new URLSearchParams({
        action: 'doo_player_ajax',
        post: postId,
        nume,
        type: type || provider || 'iframe',
      });

      const response = await axios.post(ajaxUrl, payload.toString(), {
        headers: {
          ...HEADERS,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: episodeUrl,
        },
      });

      const iframeHtml = response.data || '';
      const $iframe = cheerio.load(iframeHtml);
      const iframe = $iframe('iframe').first();

      if (iframe.length) {
        return iframe.attr('src') || iframe.attr('data-src') || '';
      }

      const match = String(iframeHtml).match(/src=["']([^"']+)["']/i);
      if (match) return match[1];

      try {
        const parsed = JSON.parse(iframeHtml);
        if (parsed && parsed.embed_url) return parsed.embed_url;
      } catch (e) {
        /* ignore json parse errors */
      }

      return '';
    } catch (error) {
      console.error('Error resolving player iframe:', error.message);
      return '';
    }
  };

  // Buscar divs con data-url en Base64 (nuevo selector para seriesflix.boats)
  $('.optns-bx div[data-url], .optnslst div[data-url], li div[data-url]').each((i, elem) => {
    try {
      const $elem = $(elem);
      const dataUrl = $elem.attr('data-url');

      if (dataUrl) {
        // Decodificar Base64
        let decodedUrl = '';
        try {
          decodedUrl = Buffer.from(dataUrl, 'base64').toString('utf-8');
        } catch (e) {
          console.error('Error decoding Base64:', e.message);
          return;
        }

        // Extraer información del servidor
        const serverNumber = cleanText($elem.find('.nmopt').text());

        // Buscar el idioma desde el contenedor padre (button.bstd o el dropdown)
        let language = '';
        const parentButton = $elem.closest('.drpdn').find('button.bstd > span').first();
        if (parentButton.length) {
          // Obtener solo el texto del primer nodo hijo (sin los <span> anidados)
          const buttonSpan = parentButton.get(0);
          if (buttonSpan && buttonSpan.childNodes) {
            for (const node of buttonSpan.childNodes) {
              if (node.nodeType === 3) { // TEXT_NODE
                const text = cleanText(node.nodeValue || '');
                if (text && text !== 'Idioma') {
                  language = text;
                  break;
                }
              }
            }
          }
        }

        // Si no encontramos idioma, intentar desde el span directo del elemento
        if (!language) {
          const spanText = cleanText($elem.find('span').first().text());
          const parts = spanText.split(/\s/);
          language = parts[0];
        }

        // Extraer el label del servidor (ej: "Principal", "Waaw")
        const serverSpans = $elem.find('span');
        let serverLabel = '';
        if (serverSpans.length > 1) {
          const lastSpan = cleanText($(serverSpans[serverSpans.length - 1]).text());
          if (lastSpan.includes('•')) {
            const parts = lastSpan.split('•');
            if (parts.length > 1) {
              serverLabel = cleanText(parts[1]);
            }
          }
        }

        // Construir nombre del servidor: "LATINO 01 - Principal"
        let serverName = 'Servidor';
        if (language) {
          serverName = language;
          if (serverNumber) {
            serverName += ` ${serverNumber}`;
          }
          if (serverLabel) {
            serverName += ` - ${serverLabel}`;
          }
        }

        addServer(serverName, decodedUrl, 'HD', language || null);
      }
    } catch (error) {
      console.error('Error parsing data-url element:', error.message);
    }
  });

  // Opciones de player agrupadas por idioma (ej. Latino, Castellano, Subtitulado)
  const playerOptionElems = $(
    '#playeroptionsul li, .playeroptions li, li.dooplay_player_option, li[data-post][data-nume]'
  );

  for (let i = 0; i < playerOptionElems.length; i++) {
    try {
      const optionData = extractOptionData($(playerOptionElems[i]));
      let finalUrl = optionData.embed;

      if (!finalUrl) {
        finalUrl = await resolveAjaxIframe(optionData);
      }

      addServer(optionData.label, finalUrl, optionData.quality, optionData.language);
    } catch (error) {
      console.error('Error parsing player option:', error.message);
    }
  }

  // Algunas páginas usan selects para alternar idioma/servidor
  $('select option').each((i, elem) => {
    try {
      const optionData = extractOptionData($(elem));
      let finalUrl = optionData.embed;

      if (!finalUrl) {
        const rawValue = $(elem).attr('value') || $(elem).attr('data-href');
        if (rawValue && rawValue !== '#') {
          finalUrl = rawValue;
        }
      }

      if (!finalUrl) {
        // Solo llamamos a resolveAjaxIframe si tenemos los datos necesarios
        if (optionData.postId && optionData.nume) {
          // Nota: Esta es una llamada síncrona en un each, lo cual no es ideal
          // pero mantenemos la estructura original
          resolveAjaxIframe(optionData).then(url => {
            if (url) {
              const label = optionData.label || cleanText($(elem).text()) || 'Servidor';
              addServer(label, url, optionData.quality, optionData.language);
            }
          }).catch(error => {
            console.error('Error in async ajax call:', error.message);
          });
        }
      } else {
        const label = optionData.label || cleanText($(elem).text()) || 'Servidor';
        addServer(label, finalUrl, optionData.quality, optionData.language);
      }
    } catch (error) {
      console.error('Error parsing select option:', error.message);
    }
  });

  // Fallback: elementos genéricos con data-video/embed y sin ajax
  $(
    '.server, .player-option, .option, li[data-video], .play-box-iframe, li[data-embed], button[data-video], button[data-embed]'
  ).each((i, elem) => {
    try {
      const optionData = extractOptionData($(elem));
      addServer(optionData.label, optionData.embed, optionData.quality, optionData.language);
    } catch (error) {
      console.error('Error parsing server element:', error.message);
    }
  });

  // Data attributes adicionales usados en algunas plantillas
  $('[data-iframe], [data-player-url], [data-href], [data-play]').each((i, elem) => {
    try {
      const optionData = extractOptionData($(elem));
      const embed = optionData.embed || $(elem).attr('data-player-url') || $(elem).attr('data-play');
      addServer(optionData.label, embed, optionData.quality, optionData.language);
    } catch (error) {
      console.error('Error parsing data-iframe element:', error.message);
    }
  });

  // Fallback adicional: iframes renderizados directamente en el contenedor del reproductor
  $('.TPlayer iframe, .Video iframe, iframe[src*="//player"], iframe[src*="//embed"]').each((i, iframe) => {
    try {
      const src = $(iframe).attr('src') || $(iframe).attr('data-src');
      addServer(`Iframe ${i + 1}`, src);
    } catch (error) {
      console.error('Error parsing iframe fallback:', error.message);
    }
  });

  // Extraer bloques JSON o arrays de "sources" incrustados en el HTML
  const jsonLikePatterns = [
    /(sources|videos|players)\s*[:=]\s*(\[[^\]]+\])/gi,
    /player\s*=\s*({[^;]+?sources[^;]+?});/gi,
    /var\s+tracks\s*=\s*(\[[^\]]+\])/gi,
  ];

  jsonLikePatterns.forEach(regex => {
    let match;
    while ((match = regex.exec(pageHtml)) !== null) {
      const candidate = match[2] || match[1];
      const parsed = tryParseJsonLike(candidate);
      addParsedSources(parsed);
    }
  });

  const encodedJsonRegex = /JSON\.parse\(\"(.+?)\"\)/gi;
  let encodedMatch;
  while ((encodedMatch = encodedJsonRegex.exec(pageHtml)) !== null) {
    const decoded = encodedMatch[1].replace(/\\"/g, '"');
    const parsed = tryParseJsonLike(decoded);
    addParsedSources(parsed);
  }

  // Algunos episodios incluyen la lista de servidores en scripts inline
  $('script').each((i, script) => {
    try {
      const content = $(script).html() || '';
      const sourcesMatch = content.match(/sources?\s*[:=]\s*(\[[\s\S]*?\])/i);
      const playerMatch = content.match(/player\s*=\s*({[\s\S]*?});/i);

      if (sourcesMatch && sourcesMatch[1]) {
        addParsedSources(tryParseJsonLike(sourcesMatch[1]));
      }

      if (playerMatch && playerMatch[1]) {
        addParsedSources(tryParseJsonLike(playerMatch[1]));
      }
    } catch (error) {
      console.error('Error parsing inline servers:', error.message);
    }
  });

  return servers;
}

module.exports = {
  scrapeSeriesList,
  scrapeSeriesDetail,
  scrapeEpisodeServers,
};