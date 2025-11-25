from typing import Optional
from schemas import HomeContent, SeriesBase, MovieBase
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL


async def scrape_home() -> Optional[HomeContent]:
    """
    Scrape de la página principal de SeriesFlix
    """
    soup = await fetch_page(BASE_URL)
    if not soup:
        return None

    home_content = HomeContent()

    # Featured content (slider principal)
    featured_section = soup.select(".slider .slide, .featured .item, .highlight .item")
    for item in featured_section[:10]:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .name")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
                series = SeriesBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text() if title_elem else link.get("title", "")),
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                )
                home_content.featured.append(series)
        except Exception as e:
            print(f"Error parsing featured item: {e}")
            continue

    # Series en tendencia
    series_section = soup.select(".series-list .item, .series .item, .tvshows .item")
    for item in series_section[:20]:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .name")
            year_elem = item.select_one(".year, .date")
            rating_elem = item.select_one(".rating, .imdb")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
                series = SeriesBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text() if title_elem else link.get("title", "")),
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                    year=clean_text(year_elem.get_text()) if year_elem else None,
                    rating=clean_text(rating_elem.get_text()) if rating_elem else None,
                )
                home_content.trending_series.append(series)
        except Exception as e:
            print(f"Error parsing series item: {e}")
            continue

    # Películas en tendencia
    movies_section = soup.select(".movies-list .item, .movies .item, .films .item")
    for item in movies_section[:20]:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .name")
            year_elem = item.select_one(".year, .date")
            rating_elem = item.select_one(".rating, .imdb")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
                movie = MovieBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text() if title_elem else link.get("title", "")),
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                    year=clean_text(year_elem.get_text()) if year_elem else None,
                    rating=clean_text(rating_elem.get_text()) if rating_elem else None,
                )
                home_content.trending_movies.append(movie)
        except Exception as e:
            print(f"Error parsing movie item: {e}")
            continue

    # Episodios recientes
    episodes_section = soup.select(".episodes .item, .recent-episodes .item, .latest .item")
    for item in episodes_section[:15]:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3")
            episode_info = item.select_one(".episode, .ep-num")

            if link and link.get("href"):
                home_content.recent_episodes.append({
                    "title": clean_text(title_elem.get_text() if title_elem else link.get("title", "")),
                    "url": make_absolute_url(link.get("href")),
                    "image": make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                    "episode": clean_text(episode_info.get_text()) if episode_info else None,
                })
        except Exception as e:
            print(f"Error parsing episode item: {e}")
            continue

    return home_content
