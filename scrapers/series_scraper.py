from typing import Optional, List
from schemas import SeriesBase, SeriesDetail, Season, Episode, Server
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL
import re


async def scrape_series_list(page: int = 1) -> List[SeriesBase]:
    """
    Scrape del listado de series desde /series-online/
    """
    url = f"{BASE_URL}/series-online/" if page == 1 else f"{BASE_URL}/series-online/page/{page}/"
    soup = await fetch_page(url)

    if not soup:
        return []

    series_list = []
    # Buscar todas las cards .TPost.B dentro de la lista
    items = soup.select(".TPost.B, article.TPost.B")

    for item in items:
        try:
            # Buscar enlace a la serie
            link = item.select_one("a[href*='/serie/']")
            if not link:
                # Buscar cualquier enlace dentro del item
                link = item.select_one("a")

            # Título
            title_elem = item.select_one(".Title, a.Title")

            # Imagen
            img = item.select_one(".Image img, figure img")

            # Año (en .Qlty generalmente)
            year_elem = item.select_one(".Qlty")

            # Info adicional (puede contener duración, año, etc)
            info_elem = item.select_one(".Info")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))

                # Extraer año de Info si tiene formato "2025 | 45min"
                year = None
                if year_elem:
                    year = clean_text(year_elem.get_text())
                elif info_elem:
                    info_text = clean_text(info_elem.get_text())
                    year_match = re.search(r'(\d{4})', info_text)
                    if year_match:
                        year = year_match.group(1)

                series = SeriesBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text()) if title_elem else clean_text(link.get_text()),
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                    year=year,
                    rating=None,  # No visible en listado
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
    # La URL correcta es /serie/{series_id}/
    series_url = f"{BASE_URL}/serie/{series_id}/"
    soup = await fetch_page(series_url)

    if not soup:
        # Intentar sin trailing slash
        series_url = f"{BASE_URL}/serie/{series_id}"
        soup = await fetch_page(series_url)

    if not soup:
        return None

    try:
        # Información básica - buscar en el header de la serie
        title_elem = soup.select_one("h1.Title, .Title, h1")
        title = clean_text(title_elem.get_text()) if title_elem else series_id

        # Imagen principal (poster)
        img_elem = soup.select_one(".TPost img, .Image img, article img, figure img")
        image = make_absolute_url(img_elem.get("src") or img_elem.get("data-src", "")) if img_elem else None

        # Descripción
        description_elem = soup.select_one(".Description, p.Description, .TPMvCn p")
        description = clean_text(description_elem.get_text()) if description_elem else None

        # Año - puede estar en .Qlty o .Info
        year_elem = soup.select_one(".Qlty, .Info .Qlty, .year")
        year = None
        if year_elem:
            year_text = clean_text(year_elem.get_text())
            year_match = re.search(r'(\d{4})', year_text)
            if year_match:
                year = year_match.group(1)

        # Géneros - buscar enlaces a /genero/
        genres = []
        genre_elems = soup.select("a[href*='/genero/']")
        for genre in genre_elems[:5]:  # Limitar a 5 géneros
            genre_text = clean_text(genre.get_text())
            if genre_text and genre_text not in genres:
                genres.append(genre_text)

        # Cast - buscar en metadata si existe
        cast = []
        # Patrón común: buscar en textos que contengan "Actores:" o similar
        cast_section = soup.find(string=re.compile(r'Actores?:', re.I))
        if cast_section:
            # Buscar elementos hermanos
            parent = cast_section.find_parent()
            if parent:
                cast_links = parent.find_all("a")
                for actor in cast_links[:10]:
                    actor_name = clean_text(actor.get_text())
                    if actor_name:
                        cast.append(actor_name)

        # Temporadas - buscar enlaces a /temporada/
        seasons = await scrape_seasons_from_links(soup, series_id)

        series_detail = SeriesDetail(
            id=series_id,
            title=title,
            url=series_url,
            image=image,
            description=description,
            year=year,
            rating=None,  # No siempre disponible
            genres=genres,
            cast=cast,
            seasons=seasons,
        )

        return series_detail

    except Exception as e:
        print(f"Error parsing series detail: {e}")
        return None


async def scrape_seasons_from_links(soup, series_id: str) -> List[Season]:
    """
    Extrae las temporadas desde los enlaces /temporada/{series-id-N}/
    """
    seasons = []

    # Buscar todos los enlaces a temporadas
    season_links = soup.select("a[href*='/temporada/']")

    if not season_links:
        # Si no hay enlaces a temporadas, puede ser una miniserie
        # Buscar episodios directamente
        episode_links = soup.select("a[href*='/episodio/']")
        if episode_links:
            episodes = []
            for ep_link in episode_links:
                try:
                    ep_url = make_absolute_url(ep_link.get("href"))
                    ep_id = extract_id_from_url(ep_url)

                    # Extraer temporada y episodio del formato: serie-slug-SxE
                    match = re.search(r'-(\d+)x(\d+)', ep_id)
                    if match:
                        season_num = int(match.group(1))
                        ep_num = int(match.group(2))
                    else:
                        ep_num = len(episodes) + 1
                        season_num = 1

                    episode = Episode(
                        number=ep_num,
                        title=clean_text(ep_link.get_text()) or f"Episodio {ep_num}",
                        url=ep_url,
                        image=None,
                        servers=[]
                    )
                    episodes.append(episode)
                except Exception as e:
                    print(f"Error parsing episode link: {e}")
                    continue

            if episodes:
                seasons.append(Season(number=1, episodes=episodes))

        return seasons

    # Procesar enlaces a temporadas
    season_dict = {}

    for link in season_links:
        try:
            season_url = make_absolute_url(link.get("href"))
            season_slug = extract_id_from_url(season_url)

            # Extraer número de temporada del slug: serie-slug-N
            season_match = re.search(r'-(\d+)/?$', season_slug)
            if season_match:
                season_num = int(season_match.group(1))
            else:
                continue

            # Evitar duplicados
            if season_num in season_dict:
                continue

            # Obtener episodios de esta temporada
            episodes = await scrape_season_episodes(season_url)

            if episodes:
                season_dict[season_num] = Season(number=season_num, episodes=episodes)

        except Exception as e:
            print(f"Error parsing season link: {e}")
            continue

    # Convertir dict a lista ordenada
    seasons = [season_dict[num] for num in sorted(season_dict.keys())]

    return seasons


async def scrape_season_episodes(season_url: str) -> List[Episode]:
    """
    Extrae los episodios de una temporada específica
    """
    soup = await fetch_page(season_url)
    if not soup:
        return []

    episodes = []

    # Buscar enlaces a episodios
    episode_links = soup.select("a[href*='/episodio/']")

    for link in episode_links:
        try:
            ep_url = make_absolute_url(link.get("href"))
            ep_id = extract_id_from_url(ep_url)

            # Extraer número de episodio del formato: serie-slug-SxE
            match = re.search(r'-\d+x(\d+)', ep_id)
            if match:
                ep_num = int(match.group(1))
            else:
                ep_num = len(episodes) + 1

            # Buscar imagen y título en el contexto
            parent = link.find_parent(".TPost") or link.find_parent("article") or link.find_parent("li")

            img = None
            title_text = clean_text(link.get_text())

            if parent:
                img_elem = parent.select_one("img")
                if img_elem:
                    img = make_absolute_url(img_elem.get("src") or img_elem.get("data-src", ""))

                title_elem = parent.select_one(".Title")
                if title_elem:
                    title_text = clean_text(title_elem.get_text())

            episode = Episode(
                number=ep_num,
                title=title_text or f"Episodio {ep_num}",
                url=ep_url,
                image=img,
                servers=[]  # Se cargan bajo demanda
            )

            # Evitar duplicados
            if not any(e.number == ep_num for e in episodes):
                episodes.append(episode)

        except Exception as e:
            print(f"Error parsing episode: {e}")
            continue

    # Ordenar por número de episodio
    episodes.sort(key=lambda x: x.number)

    return episodes


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
