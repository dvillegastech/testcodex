from typing import Optional, List
from schemas import SeriesBase, SeriesDetail, Season, Episode, Server
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL
import re


async def scrape_series_list(page: int = 1) -> List[SeriesBase]:
    """
    Scrape del listado de series
    """
    url = f"{BASE_URL}/series" if page == 1 else f"{BASE_URL}/series/page/{page}"
    soup = await fetch_page(url)

    if not soup:
        return []

    series_list = []
    items = soup.select(".items .item, .series-list .item, article.item, .tvshows article")

    for item in items:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .data h3")
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
                series_list.append(series)
        except Exception as e:
            print(f"Error parsing series: {e}")
            continue

    return series_list


async def scrape_series_detail(series_id: str) -> Optional[SeriesDetail]:
    """
    Scrape del detalle de una serie incluyendo temporadas y episodios
    """
    # Intentar diferentes formatos de URL
    possible_urls = [
        f"{BASE_URL}/series/{series_id}",
        f"{BASE_URL}/serie/{series_id}",
        f"{BASE_URL}/tv/{series_id}",
    ]

    soup = None
    series_url = ""

    for url in possible_urls:
        soup = await fetch_page(url)
        if soup:
            series_url = url
            break

    if not soup:
        return None

    try:
        # Información básica
        title_elem = soup.select_one("h1, .title, .data h1")
        title = clean_text(title_elem.get_text()) if title_elem else series_id

        img_elem = soup.select_one(".poster img, .thumbnail img, article img")
        image = make_absolute_url(img_elem.get("src") or img_elem.get("data-src", "")) if img_elem else None

        description_elem = soup.select_one(".description, .wp-content, .summary p, .texto")
        description = clean_text(description_elem.get_text()) if description_elem else None

        year_elem = soup.select_one(".year, .date, .release-date")
        year = clean_text(year_elem.get_text()) if year_elem else None

        rating_elem = soup.select_one(".rating, .imdb, .dt_rating_vgs")
        rating = clean_text(rating_elem.get_text()) if rating_elem else None

        # Géneros
        genres = []
        genre_elems = soup.select(".genres a, .genre a, .sgeneros a")
        for genre in genre_elems:
            genres.append(clean_text(genre.get_text()))

        # Cast
        cast = []
        cast_elems = soup.select(".cast a, .actor a, .persons a")
        for actor in cast_elems[:10]:
            cast.append(clean_text(actor.get_text()))

        # Temporadas y episodios
        seasons = await scrape_seasons(soup, series_url, series_id)

        series_detail = SeriesDetail(
            id=series_id,
            title=title,
            url=series_url,
            image=image,
            description=description,
            year=year,
            rating=rating,
            genres=genres,
            cast=cast,
            seasons=seasons,
        )

        return series_detail

    except Exception as e:
        print(f"Error parsing series detail: {e}")
        return None


async def scrape_seasons(soup, series_url: str, series_id: str) -> List[Season]:
    """
    Extrae las temporadas y episodios de una serie
    """
    seasons = []

    # Buscar selectores de temporadas
    season_selectors = soup.select(".season, .se-c, #seasons .se-q")

    if not season_selectors:
        # Si no hay selector de temporadas, buscar episodios directamente
        season_selectors = [soup]

    for idx, season_elem in enumerate(season_selectors, 1):
        try:
            # Obtener número de temporada
            season_num_elem = season_elem.select_one(".se-t, .title, .season-number")
            if season_num_elem:
                season_text = season_num_elem.get_text()
                season_match = re.search(r'(\d+)', season_text)
                season_num = int(season_match.group(1)) if season_match else idx
            else:
                season_num = idx

            # Extraer episodios
            episodes = []
            episode_elems = season_elem.select(".episode, .episodio, .se-a li, .eps-item")

            for ep_elem in episode_elems:
                try:
                    ep_link = ep_elem.select_one("a")
                    if not ep_link or not ep_link.get("href"):
                        continue

                    ep_url = make_absolute_url(ep_link.get("href"))
                    ep_img = ep_elem.select_one("img")
                    ep_title_elem = ep_elem.select_one(".title, .episodiotitle, .epl-title")

                    # Extraer número de episodio
                    ep_num_elem = ep_elem.select_one(".episode-number, .numerando, .epl-num")
                    if ep_num_elem:
                        ep_text = ep_num_elem.get_text()
                        ep_match = re.search(r'(\d+)', ep_text)
                        ep_num = int(ep_match.group(1)) if ep_match else len(episodes) + 1
                    else:
                        ep_num = len(episodes) + 1

                    episode = Episode(
                        number=ep_num,
                        title=clean_text(ep_title_elem.get_text()) if ep_title_elem else f"Episodio {ep_num}",
                        url=ep_url,
                        image=make_absolute_url(ep_img.get("src") or ep_img.get("data-src", "")) if ep_img else None,
                        servers=[]  # Los servidores se cargan al consultar el episodio específico
                    )
                    episodes.append(episode)
                except Exception as e:
                    print(f"Error parsing episode: {e}")
                    continue

            if episodes:
                season = Season(number=season_num, episodes=episodes)
                seasons.append(season)

        except Exception as e:
            print(f"Error parsing season: {e}")
            continue

    return seasons


async def scrape_episode_servers(episode_url: str) -> List[Server]:
    """
    Extrae los servidores de streaming de un episodio
    """
    soup = await fetch_page(episode_url)
    if not soup:
        return []

    servers = []

    # Selectores comunes para servidores
    server_elems = soup.select(".server, .player-option, .option, li[data-video], .play-box-iframe")

    for server_elem in server_elems:
        try:
            name_elem = server_elem.select_one(".server-name, .title, span")
            name = clean_text(name_elem.get_text()) if name_elem else "Servidor"

            # URL del servidor
            server_url = (
                server_elem.get("data-video") or
                server_elem.get("data-src") or
                server_elem.get("data-url") or
                ""
            )

            # Si no está en atributo, buscar en iframe
            if not server_url:
                iframe = server_elem.select_one("iframe")
                if iframe:
                    server_url = iframe.get("src") or iframe.get("data-src", "")

            if server_url:
                quality_elem = server_elem.select_one(".quality, .qlty")
                quality = clean_text(quality_elem.get_text()) if quality_elem else None

                server = Server(
                    name=name,
                    url=make_absolute_url(server_url) if not server_url.startswith("http") else server_url,
                    quality=quality
                )
                servers.append(server)
        except Exception as e:
            print(f"Error parsing server: {e}")
            continue

    return servers
