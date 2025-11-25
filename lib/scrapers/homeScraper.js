const { BASE_URL, fetchPage, extractIdFromUrl, cleanText, makeAbsoluteUrl } = require('../utils');

/**
 * Scrape de la página principal de SeriesFlix
 */
async function scrapeHome() {
  const $ = await fetchPage(BASE_URL);
  if (!$) return null;

  const homeContent = {
    featured: [],
    trending_series: [],
    recent_episodes: [],
  };

  // Featured content - cards destacadas (TPost.A)
  $('.TPost.A, article.TPost.A').slice(0, 10).each((i, item) => {
    try {
      const $item = $(item);
      const link = $item.find('a').first();
      const titleElem = $item.find('.Title, h2.Title').first();
      const img = $item.find('.Image img, figure img').first();
      const yearElem = $item.find('.Qlty, .Info .Qlty').first();

      let url = link.attr('href');
      if (!url && titleElem.length) {
        url = titleElem.closest('a').attr('href');
      }
      if (!url) {
        const allLinks = $item.find('a[href*="/serie/"]');
        if (allLinks.length > 0) {
          url = allLinks.first().attr('href');
        }
      }

      if (url) {
        url = makeAbsoluteUrl(url);
        homeContent.featured.push({
          id: extractIdFromUrl(url),
          title: cleanText(titleElem.text()) || '',
          url,
          image: img.length ? makeAbsoluteUrl(img.attr('src') || img.attr('data-src') || '') : null,
          year: yearElem.length ? cleanText(yearElem.text()) : null,
          rating: null,
        });
      }
    } catch (error) {
      console.error('Error parsing featured item:', error.message);
    }
  });

  // Series en tendencia - TPost.B y TPost.C
  $('.TPost.B, .TPost.C, li .TPost.B').slice(0, 20).each((i, item) => {
    try {
      const $item = $(item);
      let link = $item.find('a[href*="/serie/"]').first();
      if (!link.length) link = $item.closest('a');

      const titleElem = $item.find('.Title, a.Title, h3.Title span').first();
      const img = $item.find('.Image img, figure img').first();
      const yearElem = $item.find('.Qlty').first();

      let url = link.attr('href');
      if (!url && titleElem.length) {
        if (titleElem.is('a')) {
          url = titleElem.attr('href');
        } else {
          const parentLink = titleElem.closest('a');
          if (parentLink.length) url = parentLink.attr('href');
        }
      }

      if (url) {
        url = makeAbsoluteUrl(url);
        const series = {
          id: extractIdFromUrl(url),
          title: cleanText(titleElem.text()) || '',
          url,
          image: img.length ? makeAbsoluteUrl(img.attr('src') || img.attr('data-src') || '') : null,
          year: yearElem.length ? cleanText(yearElem.text()) : null,
          rating: null,
        };

        // Evitar duplicados
        if (!homeContent.trending_series.find(s => s.id === series.id)) {
          homeContent.trending_series.push(series);
        }
      }
    } catch (error) {
      console.error('Error parsing series item:', error.message);
    }
  });

  // Episodios recientes
  const seenEpisodes = new Set();
  $('a[href*="/episodio/"]').slice(0, 15).each((i, link) => {
    try {
      const url = makeAbsoluteUrl($(link).attr('href'));

      if (seenEpisodes.has(url)) return;
      seenEpisodes.add(url);

      const parent = $(link).closest('.TPost, li, article');
      let titleElem = null;
      let img = null;

      if (parent.length) {
        titleElem = parent.find('.Title').first();
        img = parent.find('img').first();
      }

      const title = titleElem && titleElem.length ? cleanText(titleElem.text()) : cleanText($(link).text());

      homeContent.recent_episodes.push({
        title,
        url,
        image: img && img.length ? makeAbsoluteUrl(img.attr('src') || img.attr('data-src') || '') : null,
        episode: extractIdFromUrl(url),
      });
    } catch (error) {
      console.error('Error parsing episode item:', error.message);
    }
  });

  return homeContent;
}

module.exports = { scrapeHome };
