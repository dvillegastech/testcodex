const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { scrapeHome } = require('./lib/scrapers/homeScraper');
const { scrapeSeriesList, scrapeSeriesDetail, scrapeEpisodeServers } = require('./lib/scrapers/seriesScraper');
const { scrapeSearch } = require('./lib/scrapers/searchScraper');
const { extractVideoUrl, HEADERS } = require('./lib/utils');

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API info endpoint (for API consumers)
app.get('/api', (req, res) => {
  res.json({
    message: 'SeriesFlix Scraping API - Solo SERIES',
    version: '1.1.0',
    note: 'SeriesFlix.boats es exclusivamente para series. Para películas, usar pelisflix.cat',
    docs: '/docs',
    endpoints: {
      home: '/api/home',
      series: {
        list: '/api/series?page=1',
        detail: '/api/series/{series_id}',
        episode_servers: '/api/series/episode/servers?episode_url=URL',
      },
      video: {
        resolve: '/api/video/resolve?player_url=URL',
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

// Video URL resolver endpoint
app.get('/api/video/resolve', async (req, res) => {
  try {
    const { player_url } = req.query;
    if (!player_url) {
      return res.status(400).json({ error: 'player_url parameter is required' });
    }

    const videoUrl = await extractVideoUrl(player_url);

    if (!videoUrl) {
      return res.status(404).json({ error: 'No se pudo extraer la URL del video desde el player' });
    }

    res.json({
      player_url,
      video_url: videoUrl,
      type: videoUrl.includes('.m3u8') ? 'HLS/M3U8' : 'Direct'
    });
  } catch (error) {
    console.error('Error in /api/video/resolve:', error);
    res.status(500).json({ error: error.message });
  }
});

// Video proxy endpoint to bypass CORS
app.get('/api/video/proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'url parameter is required' });
    }

    // Determinar si es un archivo de video (.ts) o un manifest
    const isVideoSegment = url.endsWith('.ts') || url.includes('.ts?');
    const isM3u8 = url.includes('.m3u8');
    
    // Detectar si es una URL de streaming (iboprufeno.lat, cfglobalcdn, etc.)
    const isStreamingUrl = url.includes('iboprufeno.lat') || url.includes('?s=') || url.includes('cfglobalcdn.com');
    
    // Determinar el Referer correcto según el dominio
    let referer = 'https://nuuuppp.sbs/';
    if (url.includes('cfglobalcdn.com') || url.includes('waaw.tv')) {
      referer = 'https://waaw.tv/';
    }

    // Configurar el tipo de respuesta según el tipo de archivo
    const config = {
      headers: {
        ...HEADERS,
        'Referer': referer,
        'Origin': referer.replace(/\/$/, ''),
      },
      responseType: isVideoSegment ? 'arraybuffer' : 'text',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
    };

    // Hacer la petición
    const response = await axios.get(url, config);

    // Configurar headers CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Content-Length',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    };

    // Si es un segmento de video (.ts), reenviarlo directamente
    if (isVideoSegment) {
      res.set({
        ...corsHeaders,
        'Content-Type': 'video/mp2t',
        'Content-Length': response.data.length,
      });
      return res.send(Buffer.from(response.data));
    }

    // Detectar si la respuesta es un manifest M3U8 (por contenido)
    const content = response.data;
    const looksLikeM3u8 = typeof content === 'string' && content.trim().startsWith('#EXTM3U');

    // Si es un manifest .m3u8 (por URL o por contenido), procesarlo
    if (isM3u8 || looksLikeM3u8 || isStreamingUrl) {
      res.set({
        ...corsHeaders,
        'Content-Type': 'application/vnd.apple.mpegurl',
      });

      if (typeof content === 'string' && content.includes('#EXTM3U')) {
        // Extraer la URL base
        const urlObj = new URL(url);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1)}`;

        // Reescribir URLs en el manifest
        const processedContent = content.split('\n').map(line => {
          const trimmed = line.trim();

          // Ignorar líneas vacías y comentarios
          if (!trimmed || trimmed.startsWith('#')) {
            return line;
          }

          // Si la línea es una URL absoluta, hacer proxy
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            return `/api/video/proxy?url=${encodeURIComponent(trimmed)}`;
          }

          // Si la línea es una URL relativa
          if (!trimmed.startsWith('/')) {
            const fullUrl = baseUrl + trimmed;
            return `/api/video/proxy?url=${encodeURIComponent(fullUrl)}`;
          }

          // URL relativa desde la raíz
          const fullUrl = `${urlObj.protocol}//${urlObj.host}${trimmed}`;
          return `/api/video/proxy?url=${encodeURIComponent(fullUrl)}`;
        }).join('\n');

        return res.send(processedContent);
      }

      return res.send(content);
    }

    // Para otros tipos de archivo
    res.set({
      ...corsHeaders,
      'Content-Type': response.headers['content-type'] || 'application/octet-stream',
    });
    res.send(response.data);

  } catch (error) {
    console.error('Error in /api/video/proxy:', error.message);

    // Si el error es de red, dar más detalles
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Timeout al obtener el video' });
    }
    if (error.response) {
      return res.status(error.response.status).json({
        error: `Error del servidor: ${error.response.status}`
      });
    }

    res.status(500).json({ error: 'Error proxying video content: ' + error.message });
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
