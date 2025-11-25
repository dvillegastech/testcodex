from typing import Optional, List
from schemas import MovieBase, MovieDetail, Server
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL
import re

# NOTA: Las películas están principalmente en pelisflix.cat (sitio hermano)
# SeriesFlix.boats redirige a pelisflix.cat para el contenido de películas
# Este scraper mantendrá la funcionalidad genérica para cualquier URL de películas


async def scrape_movies_list(page: int = 1) -> List[MovieBase]:
    """
    Scrape del listado de películas
    NOTA: SeriesFlix redirige las películas a pelisflix.cat
    Este endpoint puede retornar resultados vacíos o redirigir
    """
    # SeriesFlix.boats no tiene sección de películas directa
    # Las películas están en pelisflix.cat
    # Intentamos igualmente por si hay algún contenido
    url = f"{BASE_URL}/peliculas" if page == 1 else f"{BASE_URL}/peliculas/page/{page}"

    soup = await fetch_page(url)

    if not soup:
        return []

    movies_list = []

    # Buscar items con las clases .TPost
    items = soup.select(".TPost.B, .TPost.A, article.TPost")

    for item in items:
        try:
            # Buscar enlace principal
            link = item.select_one("a[href*='/pelicula/'], a[href*='/movie/']")
            if not link:
                link = item.select_one("a")

            # Título
            title_elem = item.select_one(".Title, a.Title")

            # Imagen
            img = item.select_one(".Image img, figure img")

            # Año desde .Qlty
            year_elem = item.select_one(".Qlty")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))

                # Extraer año si está presente
                year = clean_text(year_elem.get_text()) if year_elem else None

                movie = MovieBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text()) if title_elem else clean_text(link.get_text()),
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                    year=year,
                    rating=None,
                )
                movies_list.append(movie)
        except Exception as e:
            print(f"Error parsing movie: {e}")
            continue

    return movies_list


async def scrape_movie_detail(movie_id: str) -> Optional[MovieDetail]:
    """
    Scrape del detalle de una película incluyendo servidores
    """
    # Intentar diferentes formatos de URL
    possible_urls = [
        f"{BASE_URL}/pelicula/{movie_id}",
        f"{BASE_URL}/peliculas/{movie_id}",
        f"{BASE_URL}/movie/{movie_id}",
        f"{BASE_URL}/movies/{movie_id}",
    ]

    soup = None
    movie_url = ""

    for url in possible_urls:
        soup = await fetch_page(url)
        if soup:
            movie_url = url
            break

    if not soup:
        return None

    try:
        # Información básica
        title_elem = soup.select_one("h1.Title, .Title, h1")
        title = clean_text(title_elem.get_text()) if title_elem else movie_id

        img_elem = soup.select_one(".TPost img, .Image img, figure img")
        image = make_absolute_url(img_elem.get("src") or img_elem.get("data-src", "")) if img_elem else None

        description_elem = soup.select_one(".Description, p.Description, .TPMvCn p")
        description = clean_text(description_elem.get_text()) if description_elem else None

        # Año desde .Qlty o .Info
        year_elem = soup.select_one(".Qlty, .Info .Qlty")
        year = None
        if year_elem:
            year_text = clean_text(year_elem.get_text())
            year_match = re.search(r'(\d{4})', year_text)
            if year_match:
                year = year_match.group(1)

        # Duración desde .Info
        duration = None
        info_elem = soup.select_one(".Info")
        if info_elem:
            info_text = clean_text(info_elem.get_text())
            duration_match = re.search(r'(\d+\s*min)', info_text)
            if duration_match:
                duration = duration_match.group(1)

        # Géneros - buscar enlaces a /genero/
        genres = []
        genre_elems = soup.select("a[href*='/genero/']")
        for genre in genre_elems[:5]:
            genre_text = clean_text(genre.get_text())
            if genre_text and genre_text not in genres:
                genres.append(genre_text)

        # Cast - buscar en metadata
        cast = []
        cast_section = soup.find(string=re.compile(r'Actores?:', re.I))
        if cast_section:
            parent = cast_section.find_parent()
            if parent:
                cast_links = parent.find_all("a")
                for actor in cast_links[:10]:
                    actor_name = clean_text(actor.get_text())
                    if actor_name:
                        cast.append(actor_name)

        # Servidores
        servers = await scrape_movie_servers(soup)

        movie_detail = MovieDetail(
            id=movie_id,
            title=title,
            url=movie_url,
            image=image,
            description=description,
            year=year,
            rating=rating,
            duration=duration,
            genres=genres,
            cast=cast,
            servers=servers,
        )

        return movie_detail

    except Exception as e:
        print(f"Error parsing movie detail: {e}")
        return None


async def scrape_movie_servers(soup) -> List[Server]:
    """
    Extrae los servidores de streaming de una película
    """
    servers = []

    # Selectores comunes para servidores
    server_elems = soup.select(
        ".server, .player-option, .option, li[data-video], .play-box-iframe, "
        ".playother li, .options-server li, .play-servers li"
    )

    for server_elem in server_elems:
        try:
            name_elem = server_elem.select_one(".server-name, .title, span, strong")
            name = clean_text(name_elem.get_text()) if name_elem else "Servidor"

            # URL del servidor
            server_url = (
                server_elem.get("data-video") or
                server_elem.get("data-src") or
                server_elem.get("data-url") or
                server_elem.get("data-post") or
                ""
            )

            # Si no está en atributo, buscar en iframe
            if not server_url:
                iframe = server_elem.select_one("iframe")
                if iframe:
                    server_url = iframe.get("src") or iframe.get("data-src", "")

            # Buscar en enlaces
            if not server_url:
                link = server_elem.select_one("a")
                if link:
                    server_url = link.get("href", "")

            if server_url:
                quality_elem = server_elem.select_one(".quality, .qlty, .res")
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
