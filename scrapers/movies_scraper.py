from typing import Optional, List
from schemas import MovieBase, MovieDetail, Server

# NOTA IMPORTANTE: SeriesFlix.boats NO tiene películas
# Este sitio es exclusivamente para SERIES
# Las películas están en pelisflix.cat (sitio hermano diferente)
# Estos endpoints se mantienen por compatibilidad pero retornan vacío


async def scrape_movies_list(page: int = 1) -> List[MovieBase]:
    """
    SeriesFlix.boats NO tiene películas, solo series.
    Este endpoint retorna una lista vacía.
    Para películas, usar pelisflix.cat (sitio diferente).
    """
    return []


async def scrape_movie_detail(movie_id: str) -> Optional[MovieDetail]:
    """
    SeriesFlix.boats NO tiene películas, solo series.
    Este endpoint retorna None.
    Para películas, usar pelisflix.cat (sitio diferente).
    """
    return None


async def scrape_movie_servers(soup) -> List[Server]:
    """
    No aplicable - SeriesFlix.boats no tiene películas.
    """
    return []
