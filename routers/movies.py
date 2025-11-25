from fastapi import APIRouter, HTTPException, Query
from typing import List
from schemas import MovieBase, MovieDetail
from scrapers.movies_scraper import scrape_movies_list, scrape_movie_detail

router = APIRouter(prefix="/api/movies", tags=["movies"])


@router.get("", response_model=List[MovieBase])
async def get_movies(page: int = Query(1, ge=1, description="Número de página")):
    """
    Obtiene el listado de películas con paginación
    """
    movies_list = await scrape_movies_list(page)
    return movies_list


@router.get("/{movie_id}", response_model=MovieDetail)
async def get_movie_detail(movie_id: str):
    """
    Obtiene el detalle de una película incluyendo todos sus servidores
    """
    movie = await scrape_movie_detail(movie_id)
    if not movie:
        raise HTTPException(status_code=404, detail=f"Película '{movie_id}' no encontrada")
    return movie
