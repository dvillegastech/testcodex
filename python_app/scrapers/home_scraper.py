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

    # Featured content - cards destacadas (TPost.A)
    featured_section = soup.select(".TPost.A, article.TPost.A")
    for item in featured_section[:10]:
        try:
            # Buscar enlace y título
            link = item.select_one("a")
            title_elem = item.select_one(".Title, h2.Title")
            img = item.select_one(".Image img, figure img")

            # Extraer año de .Qlty o .Info
            year_elem = item.select_one(".Qlty, .Info .Qlty")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
            elif title_elem and title_elem.find_parent("a"):
                url = make_absolute_url(title_elem.find_parent("a").get("href", ""))
            else:
                # Si no hay enlace directo, buscar en el item
                all_links = item.select("a[href*='/serie/']")
                if all_links:
                    url = make_absolute_url(all_links[0].get("href"))
                else:
                    continue

            series = SeriesBase(
                id=extract_id_from_url(url),
                title=clean_text(title_elem.get_text()) if title_elem else "",
                url=url,
                image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                year=clean_text(year_elem.get_text()) if year_elem else None,
            )
            home_content.featured.append(series)
        except Exception as e:
            print(f"Error parsing featured item: {e}")
            continue

    # Series en tendencia - usar TPost.B y TPost.C
    series_section = soup.select(".TPost.B, .TPost.C, li .TPost.B")
    for item in series_section[:20]:
        try:
            # Buscar enlace principal
            link = item.select_one("a[href*='/serie/']")
            if not link:
                link = item.find_parent("a")

            title_elem = item.select_one(".Title, a.Title, h3.Title span")
            img = item.select_one(".Image img, figure img")

            # Extraer año de .Qlty
            year_elem = item.select_one(".Qlty")

            # Buscar info adicional
            info_elem = item.select_one(".Info")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
            elif title_elem:
                # El título puede ser un enlace
                if title_elem.name == "a":
                    url = make_absolute_url(title_elem.get("href", ""))
                else:
                    parent_link = title_elem.find_parent("a")
                    if parent_link:
                        url = make_absolute_url(parent_link.get("href", ""))
                    else:
                        continue
            else:
                continue

            series = SeriesBase(
                id=extract_id_from_url(url),
                title=clean_text(title_elem.get_text()) if title_elem else "",
                url=url,
                image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                year=clean_text(year_elem.get_text()) if year_elem else None,
            )
            home_content.trending_series.append(series)
        except Exception as e:
            print(f"Error parsing series item: {e}")
            continue

    # Top 10 - hometop10 con numeración
    top10_section = soup.select(".hometop10 .tns-item, .TPost.C")
    for item in top10_section[:10]:
        try:
            link = item.select_one("a[href*='/serie/']")
            title_elem = item.select_one(".Title, h3.Title span")
            img = item.select_one("img")

            if link and link.get("href"):
                url = make_absolute_url(link.get("href"))
                series = SeriesBase(
                    id=extract_id_from_url(url),
                    title=clean_text(title_elem.get_text()) if title_elem else "",
                    url=url,
                    image=make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                )
                # Evitar duplicados
                if not any(s.id == series.id for s in home_content.trending_series):
                    home_content.trending_series.append(series)
        except Exception as e:
            print(f"Error parsing top10 item: {e}")
            continue

    # Episodios recientes - buscar enlaces a /episodio/
    episodes_section = soup.select("a[href*='/episodio/']")
    seen_episodes = set()

    for link in episodes_section[:15]:
        try:
            url = make_absolute_url(link.get("href"))

            # Evitar duplicados
            if url in seen_episodes:
                continue
            seen_episodes.add(url)

            # Intentar obtener contexto del episodio
            parent = link.find_parent(".TPost") or link.find_parent("li") or link.find_parent("article")

            title_elem = None
            img = None

            if parent:
                title_elem = parent.select_one(".Title")
                img = parent.select_one("img")

            # Si no hay título en el parent, usar el texto del enlace
            title = clean_text(title_elem.get_text()) if title_elem else clean_text(link.get_text())

            home_content.recent_episodes.append({
                "title": title,
                "url": url,
                "image": make_absolute_url(img.get("src") or img.get("data-src", "")) if img else None,
                "episode": extract_id_from_url(url),  # El ID contiene info del episodio
            })
        except Exception as e:
            print(f"Error parsing episode item: {e}")
            continue

    return home_content
