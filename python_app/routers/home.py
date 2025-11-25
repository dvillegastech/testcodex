from fastapi import APIRouter, HTTPException
from schemas import HomeContent
from scrapers.home_scraper import scrape_home

router = APIRouter(prefix="/api", tags=["home"])


@router.get("/home", response_model=HomeContent)
async def get_home():
    """
    Obtiene el contenido de la página principal
    """
    content = await scrape_home()
    if not content:
        raise HTTPException(status_code=500, detail="Error al obtener contenido de la home")
    return content
