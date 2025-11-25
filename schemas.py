from pydantic import BaseModel, Field
from typing import List, Optional


class Server(BaseModel):
    name: str
    url: str
    quality: Optional[str] = None


class Episode(BaseModel):
    number: int
    title: Optional[str] = None
    url: str
    image: Optional[str] = None
    servers: List[Server] = []


class Season(BaseModel):
    number: int
    episodes: List[Episode] = []


class SeriesBase(BaseModel):
    id: str
    title: str
    url: str
    image: Optional[str] = None
    year: Optional[str] = None
    rating: Optional[str] = None


class SeriesDetail(SeriesBase):
    description: Optional[str] = None
    genres: List[str] = []
    cast: List[str] = []
    seasons: List[Season] = []


class MovieBase(BaseModel):
    id: str
    title: str
    url: str
    image: Optional[str] = None
    year: Optional[str] = None
    rating: Optional[str] = None


class MovieDetail(MovieBase):
    description: Optional[str] = None
    genres: List[str] = []
    cast: List[str] = []
    duration: Optional[str] = None
    servers: List[Server] = []


class HomeContent(BaseModel):
    featured: List[SeriesBase] = []
    trending_series: List[SeriesBase] = []
    trending_movies: List[MovieBase] = []
    recent_episodes: List[dict] = []


class SearchResult(BaseModel):
    series: List[SeriesBase] = []
    movies: List[MovieBase] = []
