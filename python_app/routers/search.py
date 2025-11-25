from fastapi import APIRouter, Query
from schemas import SearchResult
from scrapers.search_scraper import scrape_search

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchResult)
async def search(q: str = Query(..., min_length=1, description="Término de búsqueda")):
    """
    Busca series y películas por título
    """
    results = await scrape_search(q)
    return results
