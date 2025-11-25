from typing import Optional, List
from schemas import MovieBase, MovieDetail, Server
from utils import fetch_page, extract_id_from_url, clean_text, make_absolute_url
from config import BASE_URL


async def scrape_movies_list(page: int = 1) -> List[MovieBase]:
    """
    Scrape del listado de películas
    """
    url = f"{BASE_URL}/peliculas" if page == 1 else f"{BASE_URL}/peliculas/page/{page}"

    # Intentar diferentes URLs posibles
    possible_urls = [
        f"{BASE_URL}/peliculas" if page == 1 else f"{BASE_URL}/peliculas/page/{page}",
        f"{BASE_URL}/movies" if page == 1 else f"{BASE_URL}/movies/page/{page}",
        f"{BASE_URL}/pelicula" if page == 1 else f"{BASE_URL}/pelicula/page/{page}",
    ]

    soup = None
    for url in possible_urls:
        soup = await fetch_page(url)
        if soup:
            break

    if not soup:
        return []

    movies_list = []
    items = soup.select(".items .item, .movies-list .item, article.item, .movies article")

    for item in items:
        try:
            link = item.select_one("a")
            img = item.select_one("img")
            title_elem = item.select_one(".title, h2, h3, .data h3")
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
        title_elem = soup.select_one("h1, .title, .data h1")
        title = clean_text(title_elem.get_text()) if title_elem else movie_id

        img_elem = soup.select_one(".poster img, .thumbnail img, article img")
        image = make_absolute_url(img_elem.get("src") or img_elem.get("data-src", "")) if img_elem else None

        description_elem = soup.select_one(".description, .wp-content, .summary p, .texto")
        description = clean_text(description_elem.get_text()) if description_elem else None

        year_elem = soup.select_one(".year, .date, .release-date")
        year = clean_text(year_elem.get_text()) if year_elem else None

        rating_elem = soup.select_one(".rating, .imdb, .dt_rating_vgs")
        rating = clean_text(rating_elem.get_text()) if rating_elem else None

        duration_elem = soup.select_one(".duration, .runtime, .time")
        duration = clean_text(duration_elem.get_text()) if duration_elem else None

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
