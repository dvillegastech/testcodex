const axios = require('axios');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

async function extractFromNuuuppp(url) {
  console.log('=== Extracting from nuuuppp.sbs ===');
  console.log('URL:', url);
  
  const response = await axios.get(url, { headers: HEADERS, timeout: 30000 });
  const html = response.data;
  
  // Buscar el array con valores Base64 (formato: var NOMBRE = ["base64"...]; </script>)
  const arrayMatch = html.match(/var\s+(\w+)\s*=\s*\[([^\]]+)\];\s*<\/script>/);
  if (!arrayMatch) {
    console.log('ERROR: No array found');
    return null;
  }
  
  console.log('Found array variable:', arrayMatch[1]);
  const values = arrayMatch[2].match(/"([^"]+)"/g);
  if (!values) {
    console.log('ERROR: No values in array');
    return null;
  }
  console.log('Values count:', values.length);
  
  // Buscar el offset en el código (formato: - NUMERO)
  const offsetMatch = html.match(/-\s*(\d{5,})\)/);
  if (!offsetMatch) {
    console.log('ERROR: No offset found');
    return null;
  }
  const offset = parseInt(offsetMatch[1]);
  console.log('Found offset:', offset);
  
  // Decodificar la URL
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
      console.log('Error decoding value:', e.message);
    }
  }
  
  console.log('Decoded URL:', decodedUrl);
  
  // Buscar sesión
  const sessionMatch = html.match(/var\s+sesz\s*=\s*"([^"]+)"/);
  if (sessionMatch) {
    const finalUrl = decodedUrl + '?s=' + sessionMatch[1];
    console.log('Final URL with session:', finalUrl);
    return finalUrl;
  }
  
  return decodedUrl;
}

async function extractFromWaaw(embedUrl) {
  console.log('\n=== Extracting from Waaw ===');
  console.log('URL:', embedUrl);
  
  const response = await axios.get(embedUrl, { 
    headers: { ...HEADERS, Referer: 'https://waaw.tv/' }, 
    timeout: 30000 
  });
  const html = response.data;
  
  // Buscar URL m3u8 directa en el HTML
  const m3u8Match = html.match(/src:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i);
  if (m3u8Match) {
    console.log('Found m3u8 URL:', m3u8Match[1]);
    return m3u8Match[1];
  }
  
  console.log('ERROR: No m3u8 found in Waaw');
  return null;
}

async function extractFromIframeUrl(playerUrl) {
  console.log('\n=== Extracting from iframe URL ===');
  console.log('URL:', playerUrl);
  
  // Si es un iframe con URL anidada
  if (playerUrl.includes('/iframe/?url=')) {
    const urlParams = new URL(playerUrl);
    const nestedUrl = urlParams.searchParams.get('url');
    if (nestedUrl) {
      const decodedNestedUrl = decodeURIComponent(nestedUrl);
      console.log('Nested URL:', decodedNestedUrl);
      
      // Si la URL anidada es de waaw.tv, extraer de ahí
      if (decodedNestedUrl.includes('waaw.tv')) {
        // Convertir watch_video.php a embed /e/
        if (decodedNestedUrl.includes('watch_video.php')) {
          const vMatch = decodedNestedUrl.match(/v=([^&]+)/);
          if (vMatch) {
            const embedUrl = `https://waaw.tv/e/${vMatch[1]}`;
            return await extractFromWaaw(embedUrl);
          }
        }
        return await extractFromWaaw(decodedNestedUrl);
      }
    }
  }
  
  return null;
}

// Test con los URLs reales
async function runTests() {
  try {
    // Test 1: nuuuppp.sbs/watch/ (Principal)
    const url1 = 'https://nuuuppp.sbs/watch/4Z4hQFJYbSrdB9SuFRP4cYiLxUBbXdgUpHJ0j1H9s08';
    const result1 = await extractFromNuuuppp(url1);
    console.log('\nRESULT 1:', result1 ? 'SUCCESS' : 'FAILED');
    
    // Test 2: nuuuppp.sbs/iframe/?url=waaw.tv (Waaw)
    const url2 = 'https://nuuuppp.sbs/iframe/?url=https%3A%2F%2Fwaaw.tv%2Fwatch_video.php%3Fv%3DvfaYBGhGaYRI';
    const result2 = await extractFromIframeUrl(url2);
    console.log('\nRESULT 2:', result2 ? 'SUCCESS' : 'FAILED');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

runTests();
