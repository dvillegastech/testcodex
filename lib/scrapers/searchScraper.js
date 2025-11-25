const { BASE_URL, fetchPage, extractIdFromUrl, cleanText, makeAbsoluteUrl } = require('../utils');

/**
 * Scrape de los resultados de búsqueda usando ?s= parameter
 * Solo busca SERIES (SeriesFlix.boats no tiene películas)
 */
async function scrapeSearch(query) {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `${BASE_URL}/?s=${encodedQuery}`;

  const $ = await fetchPage(searchUrl);
  if (!$) return { series: [] };

  const searchResult = { series: [] };

  $('.TPost.B, .TPost.A, .TPost.C, article.TPost').each((i, item) => {
    try {
      const $item = $(item);
      let link = $item.find('a[href*="/serie/"]').first();
      if (!link.length) link = $item.find('a').first();

      const href = link.attr('href');
      if (!href) return;

      const url = makeAbsoluteUrl(href);

      // Solo procesar si es una serie
      if (!url.includes('/serie/')) return;

      const titleElem = $item.find('.Title, a.Title, h3.Title span').first();
      const img = $item.find('.Image img, figure img').first();
      const yearElem = $item.find('.Qlty').first();

      const title = cleanText(titleElem.text()) || cleanText(link.text());
      const image = img.length ? makeAbsoluteUrl(img.attr('src') || img.attr('data-src') || '') : null;
      const year = yearElem.length ? cleanText(yearElem.text()) : null;

      searchResult.series.push({
        id: extractIdFromUrl(url),
        title,
        url,
        image,
        year,
        rating: null,
      });
    } catch (error) {
      console.error('Error parsing search result:', error.message);
    }
  });

  return searchResult;
}

module.exports = { scrapeSearch };
