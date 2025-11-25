from typing import List
from schemas import SearchResult, SeriesBase, MovieBase
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL
import urllib.parse


async def scrape_search(query: str) -> SearchResult:
    """
    Scrape de los resultados de búsqueda
    """
    encoded_query = urllib.parse.quote(query)

    # Intentar diferentes formatos de URL de búsqueda
    possible_urls = [
        f"{BASE_URL}/?s={encoded_query}",
        f"{BASE_URL}/buscar?s={encoded_query}",
        f"{BASE_URL}/search?q={encoded_query}",
        f"{BASE_URL}/search/{encoded_query}",
    ]

    soup = None
    for url in possible_urls:
        soup = await fetch_page(url)
        if soup:
            break

    if not soup:
        return SearchResult()

    search_result = SearchResult()

    # Buscar todos los items de resultados
    items = soup.select(".items .item, .search-results .item, article.item, .result-item")

    for item in items:
        try:
            link = item.select_one("a")
            if not link or not link.get("href"):
                continue

            url = make_absolute_url(link.get("href"))
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .data h3")
            year_elem = item.select_one(".year, .date")
            rating_elem = item.select_one(".rating, .imdb")

            title = clean_text(title_elem.get_text() if title_elem else link.get("title", ""))
            image = make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None
            year = clean_text(year_elem.get_text()) if year_elem else None
            rating = clean_text(rating_elem.get_text()) if rating_elem else None

            # Determinar si es serie o película
            # Comúnmente las series tienen indicadores como "type", "badge", o la URL contiene "series"
            type_elem = item.select_one(".type, .badge, .item-type")
            type_text = clean_text(type_elem.get_text()).lower() if type_elem else ""

            is_series = (
                "serie" in type_text or
                "tv" in type_text or
                "/series/" in url or
                "/serie/" in url or
                "/tv/" in url
            )

            item_id = extract_id_from_url(url)

            if is_series:
                series = SeriesBase(
                    id=item_id,
                    title=title,
                    url=url,
                    image=image,
                    year=year,
                    rating=rating,
                )
                search_result.series.append(series)
            else:
                movie = MovieBase(
                    id=item_id,
                    title=title,
                    url=url,
                    image=image,
                    year=year,
                    rating=rating,
                )
                search_result.movies.append(movie)

        except Exception as e:
            print(f"Error parsing search result: {e}")
            continue

    return search_result
