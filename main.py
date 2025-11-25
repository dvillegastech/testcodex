from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import home, series, movies, search
from config import PORT, HOST
import uvicorn

app = FastAPI(
    title="SeriesFlix Scraping API",
    description="API REST para obtener información de SeriesFlix mediante scraping",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configurar CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
app.include_router(home.router)
app.include_router(series.router)
app.include_router(movies.router)
app.include_router(search.router)


@app.get("/")
async def root():
    return {
        "message": "SeriesFlix Scraping API",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "home": "/api/home",
            "series": {
                "list": "/api/series?page=1",
                "detail": "/api/series/{series_id}",
                "episode_servers": "/api/series/episode/servers?episode_url=URL"
            },
            "movies": {
                "list": "/api/movies?page=1",
                "detail": "/api/movies/{movie_id}"
            },
            "search": "/api/search?q=query"
        }
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno del servidor: {str(exc)}"}
    )


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        reload=True
    )
