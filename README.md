# SeriesFlix Scraping API

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdvillegastech%2Ftestcodex)

API REST para extraer información de SeriesFlix mediante scraping web.

**IMPORTANTE**: SeriesFlix.boats es exclusivamente para SERIES. Para películas, existe pelisflix.cat (sitio hermano separado).

## 🚀 Deploy Rápido en Vercel

Haz clic en el botón de arriba para deployar esta API en Vercel en menos de 1 minuto.

## Características

- **Home**: Contenido destacado y series en tendencia
- **Series**: Listado de series con detalles completos de temporadas y episodios
- **Búsqueda**: Búsqueda de series por título
- **Temporadas y Episodios**: Extracción completa de todas las temporadas y sus episodios
- **Servidores**: Extracción de enlaces de streaming para episodios

## Instalación Local

### Requisitos

- Node.js 16+
- npm o yarn

### Setup

1. Clona el repositorio:
```bash
git clone <repository-url>
cd testcodex
git checkout vercel
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno (opcional):
```bash
cp .env.example .env
# Edita .env si necesitas cambiar configuraciones
```

## Uso

### Iniciar el servidor local

```bash
npm start
```

O para desarrollo:
```bash
npm run dev
```

La API estará disponible en: `http://localhost:8000`

## Endpoints

### Home

#### GET `/api/home`

Obtiene el contenido de la página principal con series destacadas y recientes.

**Respuesta:**
```json
{
  "featured": [...],
  "trending_series": [...],
  "recent_episodes": [...]
}
```

### Series

#### GET `/api/series?page=1`

Lista todas las series con paginación.

**Parámetros:**
- `page` (opcional): Número de página (default: 1)

**Respuesta:**
```json
[
  {
    "id": "breaking-bad",
    "title": "Breaking Bad",
    "url": "https://seriesflix.boats/series/breaking-bad",
    "image": "https://...",
    "year": "2008",
    "rating": "9.5"
  }
]
```

#### GET `/api/series/{series_id}`

Obtiene el detalle completo de una serie.

**Respuesta:**
```json
{
  "id": "breaking-bad",
  "title": "Breaking Bad",
  "url": "https://...",
  "image": "https://...",
  "year": "2008",
  "rating": "9.5",
  "description": "...",
  "genres": ["Drama", "Crime"],
  "cast": ["Bryan Cranston", "Aaron Paul"],
  "seasons": [
    {
      "number": 1,
      "episodes": [
        {
          "number": 1,
          "title": "Pilot",
          "url": "https://...",
          "image": "https://...",
          "servers": []
        }
      ]
    }
  ]
}
```

#### GET `/api/series/episode/servers?episode_url=URL`

Obtiene los servidores de un episodio específico.

**Parámetros:**
- `episode_url` (requerido): URL completa del episodio

**Respuesta:**
```json
[
  {
    "name": "Servidor 1",
    "url": "https://...",
    "quality": "HD"
  }
]
```

### Búsqueda

#### GET `/api/search?q=query`

Busca series por título.

**Parámetros:**
- `q` (requerido): Término de búsqueda

**Respuesta:**
```json
{
  "series": [...]
}
```

## Tecnología

Esta API está construida con:
- **Node.js** + **Express** - Servidor web
- **Axios** - Cliente HTTP para peticiones
- **Cheerio** - Parser HTML (similar a jQuery)
- **Vercel** - Plataforma de deployment

## Estructura del Proyecto

```
testcodex/
├── index.js            # Aplicación Express principal
├── package.json        # Dependencias Node.js
├── vercel.json         # Configuración Vercel
└── lib/
    ├── utils.js        # Utilidades compartidas
    └── scrapers/       # Lógica de scraping
        ├── homeScraper.js
        ├── seriesScraper.js
        └── searchScraper.js
```

## Ejemplos de Uso

### cURL

```bash
# Home
curl http://localhost:8000/api/home

# Listar series
curl http://localhost:8000/api/series?page=1

# Detalle de serie
curl http://localhost:8000/api/series/solo-asesinatos-en-el-edificio-ztei

# Servidores de episodio
curl "http://localhost:8000/api/series/episode/servers?episode_url=https://seriesflix.boats/episodio/solo-asesinatos-en-el-edificio-ztei-1x1/"

# Búsqueda
curl "http://localhost:8000/api/search?q=solo"
```

### Python

```python
import requests

BASE_URL = "http://localhost:8000"

# Obtener home
response = requests.get(f"{BASE_URL}/api/home")
home_data = response.json()

# Buscar series
response = requests.get(f"{BASE_URL}/api/search?q=breaking")
results = response.json()

# Obtener detalle de serie
response = requests.get(f"{BASE_URL}/api/series/breaking-bad")
series = response.json()
```

## Notas Importantes

- **Solo SERIES**: SeriesFlix.boats es exclusivamente para series. Para películas, usar pelisflix.cat
- La API hace scraping en tiempo real, las respuestas pueden tardar algunos segundos
- Los selectores CSS están basados en la estructura real del sitio (clases `.TPost`, `.Title`, `.Image`, `.Qlty`)
- Las temporadas se cargan desde URLs `/temporada/{serie-slug-N}/`
- Los episodios siguen el formato `/episodio/{serie-slug-SxE}/`
- Ejemplo real: `https://seriesflix.boats/episodio/solo-asesinatos-en-el-edificio-ztei-1x1/`
- Se recomienda implementar caché (Redis) para mejorar rendimiento en producción
- Los servidores de episodios se cargan bajo demanda con el endpoint específico

## Estructura Real del Sitio

SeriesFlix.boats utiliza las siguientes clases CSS:
- `.TPost.A` - Cards destacadas/hero
- `.TPost.B` - Cards estándar en grid
- `.TPost.C` - Cards compactas (listas)
- `.Title` - Títulos
- `.Image` - Contenedor de imágenes
- `.Qlty` - Calidad/Año
- `.Info` - Metadatos adicionales

URLs importantes:
- Listado de series: `/series-online/` y `/series-online/page/{N}/`
- Detalle de serie: `/serie/{slug}/`
- Temporada: `/temporada/{serie-slug-N}/`
- Episodio: `/episodio/{serie-slug-SxE}/`
- Búsqueda: `/?s={query}`

## Consideraciones Legales

Esta API es solo para fines educativos. Asegúrate de tener permiso para hacer scraping del sitio web y respetar sus términos de servicio.

## Licencia

MIT
