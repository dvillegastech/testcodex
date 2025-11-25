const express = require('express');
const cors = require('cors');
const { scrapeHome } = require('./lib/scrapers/homeScraper');
const { scrapeSeriesList, scrapeSeriesDetail, scrapeEpisodeServers } = require('./lib/scrapers/seriesScraper');
const { scrapeSearch } = require('./lib/scrapers/searchScraper');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SeriesFlix Scraping API - Solo SERIES',
    version: '1.0.0',
    note: 'SeriesFlix.boats es exclusivamente para series. Para películas, usar pelisflix.cat',
    docs: '/docs',
    endpoints: {
      home: '/api/home',
      series: {
        list: '/api/series?page=1',
        detail: '/api/series/{series_id}',
        episode_servers: '/api/series/episode/servers?episode_url=URL',
      },
      search: '/api/search?q=query',
    },
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Home endpoint
app.get('/api/home', async (req, res) => {
  try {
    const content = await scrapeHome();
    if (!content) {
      return res.status(500).json({ error: 'Error al obtener contenido de la home' });
    }
    res.json(content);
  } catch (error) {
    console.error('Error in /api/home:', error);
    res.status(500).json({ error: error.message });
  }
});

// Series list endpoint
app.get('/api/series', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    if (page < 1) {
      return res.status(400).json({ error: 'Page must be >= 1' });
    }
    const seriesList = await scrapeSeriesList(page);
    res.json(seriesList);
  } catch (error) {
    console.error('Error in /api/series:', error);
    res.status(500).json({ error: error.message });
  }
});

// Series detail endpoint
app.get('/api/series/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const series = await scrapeSeriesDetail(seriesId);
    if (!series) {
      return res.status(404).json({ error: `Serie '${seriesId}' no encontrada` });
    }
    res.json(series);
  } catch (error) {
    console.error('Error in /api/series/:seriesId:', error);
    res.status(500).json({ error: error.message });
  }
});

// Episode servers endpoint
app.get('/api/series/episode/servers', async (req, res) => {
  try {
    const { episode_url } = req.query;
    if (!episode_url) {
      return res.status(400).json({ error: 'episode_url parameter is required' });
    }
    const servers = await scrapeEpisodeServers(episode_url);
    if (servers.length === 0) {
      return res.status(404).json({ error: 'No se encontraron servidores para este episodio' });
    }
    res.json(servers);
  } catch (error) {
    console.error('Error in /api/series/episode/servers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length === 0) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = await scrapeSearch(q);
    res.json(results);
  } catch (error) {
    console.error('Error in /api/search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Movies endpoints (deprecated - return empty for compatibility)
app.get('/api/movies', (req, res) => {
  res.json([]);
});

app.get('/api/movies/:movieId', (req, res) => {
  res.status(404).json({ error: 'SeriesFlix.boats no tiene películas. Usar pelisflix.cat' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Start server (only if not in Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 SeriesFlix API running on http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
