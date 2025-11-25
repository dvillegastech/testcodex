# SeriesFlix Scraping API

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdvillegastech%2Ftestcodex)

API REST para extraer información de SeriesFlix y **reproducir videos** mediante scraping web.

**IMPORTANTE**: SeriesFlix.boats es exclusivamente para SERIES. Para películas, existe pelisflix.cat (sitio hermano separado).

## 🚀 Deploy Rápido en Vercel

Haz clic en el botón de arriba para deployar esta API en Vercel en menos de 1 minuto.

## ✨ Características

- **Home**: Contenido destacado y series en tendencia
- **Series**: Listado de series con detalles completos de temporadas y episodios
- **Búsqueda**: Búsqueda de series por título
- **Temporadas y Episodios**: Extracción completa de todas las temporadas y sus episodios
- **Servidores**: Extracción de enlaces de streaming para episodios (LATINO, CASTELLANO, SUBTITULADO)
- **🎬 Extracción de Video**: Obtención de URLs M3U8/HLS directas desde los players
- **📺 Proxy de Video**: Bypass de CORS para reproducción en navegadores

## 📱 Flujo Completo para tu App

```
1. GET /api/series/{id}           → Obtener serie con temporadas/episodios
2. GET /api/series/episode/servers → Obtener lista de servidores
3. GET /api/video/resolve          → Extraer URL M3U8 del video
4. GET /api/video/proxy            → (Opcional) Proxy para evitar CORS
5. Reproducir con HLS.js o nativo
```

## 🔧 Instalación Local

### Requisitos
- Node.js 16+
- npm o yarn

### Setup

```bash
# Clonar repositorio
git clone https://github.com/dvillegastech/testcodex.git
cd testcodex

# Instalar dependencias
npm install

# Iniciar servidor
npm start
```

La API estará disponible en: `http://localhost:8000`

## 📚 Endpoints

### 🏠 Home

#### `GET /api/home`
Obtiene el contenido de la página principal.

```json
{
  "featured": [...],
  "recent": [...],
  "popular": [...]
}
```

---

### 📺 Series

#### `GET /api/series?page=1`
Lista todas las series con paginación.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `page` | number | No | Número de página (default: 1) |

```json
[
  {
    "id": "solo-asesinatos-en-el-edificio-ztei",
    "title": "Solo Asesinatos en el Edificio",
    "url": "https://seriesflix.boats/serie/solo-asesinatos-en-el-edificio-ztei/",
    "image": "https://...",
    "year": "2021"
  }
]
```

---

#### `GET /api/series/{series_id}`
Obtiene el detalle completo de una serie incluyendo temporadas y episodios.

```json
{
  "id": "solo-asesinatos-en-el-edificio-ztei",
  "title": "Solo Asesinatos en el Edificio",
  "description": "Tres extraños comparten una obsesión...",
  "year": "2021",
  "genres": ["Comedia", "Crimen", "Drama"],
  "cast": ["Steve Martin", "Martin Short", "Selena Gomez"],
  "seasons": [
    {
      "number": 1,
      "episodes": [
        {
          "number": 1,
          "title": "Episodio 1",
          "url": "https://seriesflix.boats/episodio/solo-asesinatos-en-el-edificio-ztei-1x1/"
        }
      ]
    }
  ]
}
```

---

#### `GET /api/series/episode/servers?episode_url=URL`
Obtiene los servidores de streaming disponibles para un episodio.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `episode_url` | string | Sí | URL completa del episodio |

**Ejemplo:**
```bash
curl "http://localhost:8000/api/series/episode/servers?episode_url=https://seriesflix.boats/episodio/solo-asesinatos-en-el-edificio-ztei-1x1/"
```

**Respuesta:**
```json
[
  {
    "name": "LATINO 01 - Principal",
    "url": "https://nuuuppp.sbs/watch/4Z4hQFJYbSrdB9SuFRP4cYiLxUBbXdgUpHJ0j1H9s08",
    "quality": "HD",
    "language": "LATINO"
  },
  {
    "name": "LATINO 02 - Waaw",
    "url": "https://nuuuppp.sbs/iframe/?url=https%3A%2F%2Fwaaw.tv%2F...",
    "quality": "HD",
    "language": "LATINO"
  },
  {
    "name": "CASTELLANO 01 - Principal",
    "url": "https://nuuuppp.sbs/watch/...",
    "quality": "HD",
    "language": "CASTELLANO"
  },
  {
    "name": "SUBTITULADO 01 - Principal",
    "url": "https://nuuuppp.sbs/watch/...",
    "quality": "HD",
    "language": "SUBTITULADO"
  }
]
```

**💡 Recomendación:** Usa los servidores **"Principal"** ya que tienen mejor compatibilidad.

---

### 🎬 Video

#### `GET /api/video/resolve?player_url=URL`
**⭐ Endpoint principal para obtener la URL del video.**

Extrae la URL directa del stream M3U8/HLS desde el player.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `player_url` | string | Sí | URL del servidor (de `/api/series/episode/servers`) |

**Ejemplo:**
```bash
curl "http://localhost:8000/api/video/resolve?player_url=https://nuuuppp.sbs/watch/4Z4hQFJYbSrdB9SuFRP4cYiLxUBbXdgUpHJ0j1H9s08"
```

**Respuesta:**
```json
{
  "player_url": "https://nuuuppp.sbs/watch/...",
  "video_url": "https://sv4.iboprufeno.lat/?s=TOKEN_DE_SESION",
  "type": "Direct"
}
```

**⚠️ Importante:** 
- Las URLs contienen **tokens de sesión** que expiran en 30 segundos - 5 minutos
- Deben usarse **inmediatamente** después de extraerse
- El `type` puede ser `"Direct"` o `"HLS/M3U8"`

---

#### `GET /api/video/proxy?url=URL`
Proxy para evitar problemas de CORS al reproducir videos en el navegador.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `url` | string | Sí | URL del video o manifest M3U8 |

**Características:**
- ✅ Detecta automáticamente manifests M3U8 (por contenido, no por extensión)
- ✅ Reescribe URLs de segmentos `.ts` para pasar por el proxy
- ✅ Headers CORS correctos para navegadores
- ✅ Soporta streaming de segmentos de video

**Uso en tu app:**
```javascript
// URL extraída
const videoUrl = "https://sv4.iboprufeno.lat/?s=TOKEN";

// Usar a través del proxy
const proxyUrl = `https://tu-api.vercel.app/api/video/proxy?url=${encodeURIComponent(videoUrl)}`;

// Reproducir con HLS.js
const hls = new Hls();
hls.loadSource(proxyUrl);
hls.attachMedia(videoElement);
```

---

### 🔍 Búsqueda

#### `GET /api/search?q=query`
Busca series por título.

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `q` | string | Sí | Término de búsqueda |

```json
{
  "series": [
    {
      "id": "breaking-bad",
      "title": "Breaking Bad",
      "url": "https://...",
      "image": "https://...",
      "year": "2008"
    }
  ]
}
```

---

## 📱 Ejemplo Completo para App

### JavaScript/React Native

```javascript
const API_BASE = 'https://tu-api.vercel.app';

// 1. Buscar una serie
const searchResults = await fetch(`${API_BASE}/api/search?q=breaking`).then(r => r.json());

// 2. Obtener detalles de la serie
const series = await fetch(`${API_BASE}/api/series/${searchResults.series[0].id}`).then(r => r.json());

// 3. Obtener servidores del primer episodio
const episodeUrl = series.seasons[0].episodes[0].url;
const servers = await fetch(`${API_BASE}/api/series/episode/servers?episode_url=${encodeURIComponent(episodeUrl)}`).then(r => r.json());

// 4. Filtrar solo servidores "Principal" (mejor compatibilidad)
const principalServers = servers.filter(s => s.name.includes('Principal'));

// 5. Extraer URL del video
const videoData = await fetch(`${API_BASE}/api/video/resolve?player_url=${encodeURIComponent(principalServers[0].url)}`).then(r => r.json());

// 6. Reproducir
const videoUrl = `${API_BASE}/api/video/proxy?url=${encodeURIComponent(videoData.video_url)}`;
// Usar con HLS.js, react-native-video, ExoPlayer, etc.
```

### Swift (iOS)

```swift
import AVKit

let apiBase = "https://tu-api.vercel.app"

// Extraer URL del video
let resolveURL = URL(string: "\(apiBase)/api/video/resolve?player_url=\(playerUrl.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)")!

URLSession.shared.dataTask(with: resolveURL) { data, _, _ in
    let json = try! JSONDecoder().decode(VideoResponse.self, from: data!)
    
    // Usar proxy para evitar CORS
    let proxyURL = "\(apiBase)/api/video/proxy?url=\(json.video_url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!)"
    
    // Reproducir con AVPlayer
    let player = AVPlayer(url: URL(string: proxyURL)!)
    let playerVC = AVPlayerViewController()
    playerVC.player = player
    player.play()
}.resume()
```

### Kotlin (Android)

```kotlin
// Con ExoPlayer
val videoUrl = "$API_BASE/api/video/proxy?url=${URLEncoder.encode(extractedUrl, "UTF-8")}"

val mediaItem = MediaItem.fromUri(videoUrl)
val player = ExoPlayer.Builder(context).build()
player.setMediaItem(mediaItem)
player.prepare()
player.play()
```

---

## 🎯 Servidores Disponibles

| Servidor | Dominio | Estado | Notas |
|----------|---------|--------|-------|
| **Principal** | `nuuuppp.sbs/watch/` → `iboprufeno.lat` | ✅ Funciona | Sin protección de IP, recomendado |
| **Waaw** | `nuuuppp.sbs/iframe/` → `waaw.tv` | ⚠️ Variable | Protección por IP, puede fallar |

**💡 Tip:** Filtra los servidores por nombre para usar solo los "Principal":
```javascript
const bestServers = servers.filter(s => s.name.includes('Principal'));
```

---

## 🏗️ Estructura del Proyecto

```
testcodex/
├── index.js                 # Servidor Express + endpoints
├── package.json             # Dependencias
├── vercel.json              # Configuración Vercel
├── public/
│   └── index.html           # Demo interactivo
└── lib/
    ├── utils.js             # Utilidades + extractVideoUrl()
    └── scrapers/
        ├── homeScraper.js   # Scraper de home
        ├── seriesScraper.js # Scraper de series/episodios/servidores
        └── searchScraper.js # Scraper de búsqueda
```

---

## 🔒 Headers y CORS

La API incluye headers CORS para permitir peticiones desde cualquier origen:

```javascript
// Todos los endpoints permiten
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
```

---

## ⚡ Rate Limiting

- No hay rate limiting implementado en la API
- Se recomienda implementar caché en tu app para no saturar los servidores origen
- Las URLs de video tienen tokens que expiran, no las cachees

---

## 🚀 Deploy en Vercel

1. Fork este repositorio
2. Importa en [Vercel](https://vercel.com/new)
3. Deploy automático ✅

O usa el botón de arriba para deploy instantáneo.

---

## 📄 Licencia

MIT

---

## ⚠️ Disclaimer

Esta API es solo para **fines educativos**. El uso de scraping puede violar los términos de servicio del sitio web. Úsala bajo tu propia responsabilidad.
