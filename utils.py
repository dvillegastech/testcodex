import httpx
from bs4 import BeautifulSoup
from typing import Optional
from config import HEADERS, TIMEOUT, BASE_URL


async def fetch_page(url: str) -> Optional[BeautifulSoup]:
    """
    Realiza una petición HTTP y devuelve el contenido parseado con BeautifulSoup
    """
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=TIMEOUT) as client:
            response = await client.get(url, headers=HEADERS)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'lxml')
    except Exception as e:
        print(f"Error fetching {url}: {str(e)}")
        return None


def extract_id_from_url(url: str) -> str:
    """
    Extrae el ID único de una URL
    """
    parts = url.rstrip('/').split('/')
    return parts[-1] if parts else ""


def clean_text(text: Optional[str]) -> str:
    """
    Limpia y normaliza texto
    """
    if not text:
        return ""
    return " ".join(text.strip().split())


def make_absolute_url(url: str) -> str:
    """
    Convierte URLs relativas en absolutas
    """
    if not url:
        return ""
    if url.startswith("http"):
        return url
    return f"{BASE_URL}{url}" if url.startswith("/") else f"{BASE_URL}/{url}"
