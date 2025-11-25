const { BASE_URL, fetchPage, extractIdFromUrl, cleanText, makeAbsoluteUrl } = require('../utils');

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
  const $ = await fetchPage(episodeUrl);
  if (!$) return [];

  const servers = [];
  const seenUrls = new Set();
  const serverElems = $(
    '.server, .player-option, .option, li[data-video], .play-box-iframe, li[data-embed], button[data-video], button[data-embed]'
  );

  const resolveServerUrl = $elem => {
    const possibleAttrs = [
      'data-video',
      'data-src',
      'data-url',
      'data-embed',
      'data-link',
      'data-file',
      'href',
    ];

    for (const attr of possibleAttrs) {
      const value = $elem.attr(attr);
      if (value) return value;
    }

    const iframe = $elem.find('iframe').first();
    if (iframe.length) {
      return iframe.attr('src') || iframe.attr('data-src') || '';
    }

    return '';
  };

  const addServer = (name, url, quality = null) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : makeAbsoluteUrl(url);
    if (seenUrls.has(fullUrl)) return;

    seenUrls.add(fullUrl);
    servers.push({ name, url: fullUrl, quality });
  };

  serverElems.each((i, elem) => {
    try {
      const $elem = $(elem);
      const nameElem = $elem.find('.server-name, .title, span').first();
      const name = nameElem.length ? cleanText(nameElem.text()) : 'Servidor';

      const serverUrl = resolveServerUrl($elem);
      if (serverUrl) {
        const qualityElem = $elem.find('.quality, .qlty').first();
        const quality = qualityElem.length ? cleanText(qualityElem.text()) : $elem.attr('data-quality') || null;

        addServer(name, serverUrl, quality);
      }
    } catch (error) {
      console.error('Error parsing server:', error.message);
    }
  });

  // Algunos episodios incluyen la lista de servidores en scripts inline
  $('script').each((i, script) => {
    try {
      const content = $(script).html() || '';
      const match = content.match(/sources?\s*[:=]\s*(\[[^\]]+\])/i);

      if (match && match[1]) {
        const normalized = match[1].replace(/'(\s*[^']*?)'/g, '"$1"');
        const parsed = JSON.parse(normalized);

        parsed.forEach(source => {
          const file = source.file || source.src || source.url;
          const label = source.label || source.title || 'Servidor';
          const quality = source.res || source.quality || null;
          addServer(label, file, quality);
        });
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
