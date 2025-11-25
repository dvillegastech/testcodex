# Extracción de URLs de Video

## Problema Actual

Los servidores de video (nuuuppp.sbs, waaw.tv) implementan múltiples capas de protección:

1. **JavaScript ofuscado** con múltiples niveles de encoding
2. **Anti-debugging** que detecta DevTools abiertos
3. **URLs blob** generadas dinámicamente en el navegador
4. **Sesiones y tokens** que expiran rápidamente

## Limitaciones del Scraping Simple

El scraping con `axios` + `cheerio` **NO puede**:
- Ejecutar JavaScript complejo
- Generar URLs blob del navegador
- Bypassear verificaciones anti-bot
- Mantener sesiones de JWPlayer

## Soluciones Propuestas

### Opción 1: Navegador Headless (Recomendada)

Usar Puppeteer o Playwright para:
1. Abrir la URL del player en un navegador real
2. Ejecutar el JavaScript
3. Interceptar peticiones de red
4. Capturar la URL .m3u8 antes de que se convierta en blob

```javascript
const puppeteer = require('puppeteer');

async function extractVideoWithBrowser(playerUrl) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Interceptar peticiones de red
  const m3u8Url = await new Promise((resolve) => {
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('.m3u8')) {
        resolve(url);
      }
    });

    page.goto(playerUrl);
  });

  await browser.close();
  return m3u8Url;
}
```

### Opción 2: Usar los iframes directamente

En lugar de extraer la URL del video, **devolver la URL del iframe** para que el cliente:
1. Embeba el iframe directamente
2. Use un navegador para reproducir
3. O implemente su propia lógica de extracción client-side

### Opción 3: Buscar APIs alternativas

Algunos sitios tienen APIs internas que devuelven las URLs directamente:
- Analizar el tráfico de red en DevTools
- Buscar llamadas AJAX/Fetch
- Reversar ingeniería del endpoint API

## Implementación Actual

La API actualmente devuelve:
```json
{
  "name": "LATINO 01 - Principal",
  "url": "https://nuuuppp.sbs/watch/...",
  "quality": "HD",
  "language": "LATINO"
}
```

**Uso recomendado:**
1. Obtener la lista de servidores con `/api/series/episode/servers`
2. Mostrar al usuario la URL del iframe
3. Usar Puppeteer/Playwright del lado del servidor si necesitas la URL directa
4. O embeber el iframe directamente en tu aplicación

## Costos vs Beneficios

| Método | Ventaja | Desventaja |
|--------|---------|------------|
| Scraping simple | Rápido, sin dependencias | No funciona con JS pesado |
| Puppeteer | Funciona con cualquier sitio | Lento, consume recursos |
| Iframe directo | Simple, no requiere extracción | Depende del servidor externo |
| API reversa | Rápido si existe | Difícil de encontrar, puede cambiar |

## Recomendación Final

Para este proyecto específico:
1. **Mantener el endpoint actual** que devuelve URLs de iframe
2. **Agregar endpoint con Puppeteer** (opcional) para casos donde se necesite la URL directa
3. **Documentar claramente** que las URLs de iframe deben usarse en navegadores reales
