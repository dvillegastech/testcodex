from fastapi import APIRouter, HTTPException, Query
from typing import List
from schemas import SeriesBase, SeriesDetail, Server
from scrapers.series_scraper import scrape_series_list, scrape_series_detail, scrape_episode_servers

router = APIRouter(prefix="/api/series", tags=["series"])


@router.get("", response_model=List[SeriesBase])
async def get_series(page: int = Query(1, ge=1, description="Número de página")):
    """
    Obtiene el listado de series con paginación
    """
    series_list = await scrape_series_list(page)
    return series_list


@router.get("/{series_id}", response_model=SeriesDetail)
async def get_series_detail(series_id: str):
    """
    Obtiene el detalle de una serie incluyendo todas sus temporadas y episodios
    """
    series = await scrape_series_detail(series_id)
    if not series:
        raise HTTPException(status_code=404, detail=f"Serie '{series_id}' no encontrada")
    return series


@router.get("/episode/servers", response_model=List[Server])
async def get_episode_servers(episode_url: str = Query(..., description="URL del episodio")):
    """
    Obtiene los servidores de streaming de un episodio específico

    Parámetro: episode_url - URL completa del episodio
    """
    servers = await scrape_episode_servers(episode_url)
    if not servers:
        raise HTTPException(status_code=404, detail="No se encontraron servidores para este episodio")
    return servers
