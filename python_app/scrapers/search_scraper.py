from typing import List
from schemas import SearchResult, SeriesBase, MovieBase
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL
import urllib.parse


async def scrape_search(query: str) -> SearchResult:
    """
    Scrape de los resultados de búsqueda usando ?s= parameter
    Solo busca SERIES (SeriesFlix.boats no tiene películas)
    """
    encoded_query = urllib.parse.quote(query)

    # La búsqueda usa el parámetro ?s= estándar de WordPress
    search_url = f"{BASE_URL}/?s={encoded_query}"

    soup = await fetch_page(search_url)

    if not soup:
        return SearchResult()

    search_result = SearchResult()

    # Buscar items con las clases .TPost (A, B, o C)
    items = soup.select(".TPost.B, .TPost.A, .TPost.C, article.TPost")

    for item in items:
        try:
            # Buscar enlace a serie
            link = item.select_one("a[href*='/serie/']")
            if not link:
                link = item.select_one("a")

            if not link or not link.get("href"):
                continue

            url = make_absolute_url(link.get("href"))

            # Solo procesar si es una serie
            if "/serie/" not in url:
                continue

            # Título
            title_elem = item.select_one(".Title, a.Title, h3.Title span")

            # Imagen
            img = item.select_one(".Image img, figure img")

            # Año desde .Qlty
            year_elem = item.select_one(".Qlty")
            year = clean_text(year_elem.get_text()) if year_elem else None

            title = clean_text(title_elem.get_text()) if title_elem else clean_text(link.get_text())
            image = make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None

            series = SeriesBase(
                id=extract_id_from_url(url),
                title=title,
                url=url,
                image=image,
                year=year,
                rating=None,
            )
            search_result.series.append(series)

        except Exception as e:
            print(f"Error parsing search result: {e}")
            continue

    return search_result
