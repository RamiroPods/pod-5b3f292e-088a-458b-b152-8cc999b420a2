import json
import os
from datetime import datetime
from json import JSONDecodeError
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from writerai import Writer


app = FastAPI(title="Product Description Platform API", version="1.0.0")

cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:5174",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path("data")
DATA_FILE = DATA_DIR / "products.json"
DATA_DIR.mkdir(parents=True, exist_ok=True)

writer_client: Optional[Writer] = None


class HealthResponse(BaseModel):
    status: str
    message: str


class ProductBrief(BaseModel):
    name: str
    category: Optional[str] = None
    brand: Optional[str] = None
    tagline: Optional[str] = None
    features: List[str] = Field(default_factory=list)
    seo_keywords: List[str] = Field(default_factory=list)
    tone: Optional[str] = "balanced"
    audience: Optional[str] = None
    language: Optional[str] = "English"
    additional_notes: Optional[str] = None
    length: Optional[str] = "detailed"


class ProductDescriptionResponse(BaseModel):
    description: str


class ProductCreateRequest(ProductBrief):
    description: Optional[str] = None
    auto_generate: bool = True


class ProductUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    tagline: Optional[str] = None
    features: Optional[List[str]] = None
    seo_keywords: Optional[List[str]] = None
    tone: Optional[str] = None
    audience: Optional[str] = None
    language: Optional[str] = None
    additional_notes: Optional[str] = None
    length: Optional[str] = None
    description: Optional[str] = None
    regenerate_description: Optional[bool] = False


class ProductResponse(ProductBrief):
    id: str
    description: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


def get_writer_client() -> Writer:
    global writer_client
    if writer_client is None:
        api_key = os.getenv("WRITER_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail="Writer API key not configured. Set WRITER_API_KEY to enable generation.",
            )
        writer_client = Writer(api_key=api_key)
    return writer_client


def load_products() -> Dict[str, Dict[str, object]]:
    if not DATA_FILE.exists():
        return {}

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as file:
            raw = json.load(file)
            if isinstance(raw, list):
                return {item["id"]: item for item in raw if isinstance(item, dict) and item.get("id")}
    except (JSONDecodeError, OSError, KeyError):
        pass

    return {}


def save_products(products: Dict[str, Dict[str, object]]) -> None:
    serialized = []
    for product in products.values():
        entry = product.copy()
        for field in ("created_at", "updated_at"):
            value = entry.get(field)
            if isinstance(value, datetime):
                entry[field] = value.isoformat()
        serialized.append(entry)

    with open(DATA_FILE, "w", encoding="utf-8") as file:
        json.dump(serialized, file, indent=2, ensure_ascii=False)


def serialize_product(product: ProductResponse) -> Dict[str, object]:
    data = product.dict()
    data["created_at"] = product.created_at.isoformat()
    data["updated_at"] = product.updated_at.isoformat()
    return data


def build_generation_prompt(brief: ProductBrief) -> Tuple[str, int]:
    length_profiles = {
        "short": {
            "guidance": "Write a tight, one-paragraph spotlight with a short features list.",
            "max_tokens": 320,
        },
        "standard": {
            "guidance": "Craft a persuasive 2-3 paragraph description plus feature highlights.",
            "max_tokens": 520,
        },
        "detailed": {
            "guidance": "Deliver a richly detailed narrative with multiple paragraphs, features, and ideal shopper segments.",
            "max_tokens": 780,
        },
    }

    profile = length_profiles.get(brief.length or "detailed", length_profiles["detailed"])
    features_block = "\n".join(f"- {feature}" for feature in brief.features) if brief.features else "- Highlight key differentiators."
    keywords = ", ".join(brief.seo_keywords) if brief.seo_keywords else "None provided"
    language = brief.language or "English"

    prompt = f"""You are an expert e-commerce copywriter crafting premium product detail page content.

Product name: {brief.name}
Category: {brief.category or 'General'}
Brand: {brief.brand or 'Not specified'}
Tagline: {brief.tagline or 'Not specified'}
Target audience: {brief.audience or 'Online shoppers'}
Tone: {brief.tone or 'balanced'}
Language: {language}

Core product features:\n{features_block}
SEO keywords to weave naturally: {keywords}
Additional creative direction: {brief.additional_notes or 'None'}

{profile['guidance']}
Structure the copy with:
- A magnetic headline hook (1 sentence)
- Two to three compelling body paragraphs focused on benefits
- A bullet list called "Key Features" summarising the strongest selling points
- A section titled "Ideal For" describing the target customers or use cases
- A closing call-to-action sentence

Ensure the description is original, vivid, and conversion-focused while remaining truthful to the brief. Avoid generic filler and keep the writing in {language}.
"""

    return prompt, profile["max_tokens"]


def generate_product_description(brief: ProductBrief) -> str:
    try:
        client = get_writer_client()
        prompt, max_tokens = build_generation_prompt(brief)
        response = client.chat.chat(
            model="palmyra-x-004",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=max_tokens,
            temperature=0.4,
        )
        description = response.choices[0].message.content.strip()
        if not description:
            raise RuntimeError("Received empty description from Writer API")
        return description
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - relies on external API
        message = str(exc)
        if "api_key" in message.lower():
            raise HTTPException(status_code=401, detail="Invalid Writer API key provided.")
        if "rate limit" in message.lower():
            raise HTTPException(status_code=429, detail="Writer API rate limit exceeded. Please retry shortly.")
        raise HTTPException(status_code=500, detail=f"Error generating description: {message}")


products_db: Dict[str, Dict[str, object]] = load_products()


def get_product_or_404(product_id: str) -> ProductResponse:
    product = products_db.get(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductResponse(**product)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(status="healthy", message="Product Description Platform API is running")


@app.get("/api/info")
async def get_api_info() -> Dict[str, object]:
    return {
        "name": "Product Description Platform API",
        "version": "1.0.0",
        "description": "Generate, manage, and store detailed e-commerce product descriptions.",
        "endpoints": {
            "/health": "Service health",
            "/api/products": "Create and list products (GET, POST)",
            "/api/products/{product_id}": "Retrieve, update, or delete a product",
            "/api/products/generate": "Generate product copy without saving",
        },
    }


@app.post("/api/products/generate", response_model=ProductDescriptionResponse)
async def generate_description_endpoint(request: ProductBrief) -> ProductDescriptionResponse:
    description = generate_product_description(request)
    return ProductDescriptionResponse(description=description)


@app.post("/api/products", response_model=ProductResponse, status_code=201)
async def create_product(request: ProductCreateRequest) -> ProductResponse:
    brief_data = request.dict(exclude={"description", "auto_generate"})
    brief = ProductBrief(**brief_data)
    description = request.description

    if request.auto_generate or not (description and description.strip()):
        description = generate_product_description(brief)

    now = datetime.utcnow()
    product_id = str(uuid4())
    product = ProductResponse(
        id=product_id,
        description=description.strip(),
        created_at=now,
        updated_at=now,
        **brief.dict(),
    )

    products_db[product_id] = serialize_product(product)
    save_products(products_db)
    return product


@app.get("/api/products", response_model=List[ProductResponse])
async def list_products() -> List[ProductResponse]:
    return [ProductResponse(**item) for item in products_db.values()]


@app.get("/api/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str) -> ProductResponse:
    return get_product_or_404(product_id)


@app.put("/api/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, request: ProductUpdateRequest) -> ProductResponse:
    existing = get_product_or_404(product_id)
    update_data = request.dict(exclude_unset=True)
    regenerate = update_data.pop("regenerate_description", False)

    updated_payload = existing.dict()

    for field, value in update_data.items():
        if field in {"created_at", "updated_at", "id"}:
            continue
        if value is None:
            if field in {"category", "brand", "tagline", "audience", "additional_notes", "tone", "language", "length"}:
                updated_payload[field] = None
            continue
        updated_payload[field] = value

    if "features" in update_data and update_data["features"] is None:
        updated_payload["features"] = []
    if "seo_keywords" in update_data and update_data["seo_keywords"] is None:
        updated_payload["seo_keywords"] = []

    if "description" in update_data and update_data["description"] is not None:
        description = update_data["description"].strip()
    elif regenerate:
        brief_payload = {field: updated_payload[field] for field in ProductBrief.__fields__.keys()}
        description = generate_product_description(ProductBrief(**brief_payload))
    else:
        description = updated_payload["description"].strip()

    updated_payload["description"] = description
    updated_payload["updated_at"] = datetime.utcnow()

    product = ProductResponse(**updated_payload)
    products_db[product_id] = serialize_product(product)
    save_products(products_db)
    return product


@app.delete("/api/products/{product_id}", status_code=204)
async def delete_product(product_id: str) -> Response:
    if product_id not in products_db:
        raise HTTPException(status_code=404, detail="Product not found")

    del products_db[product_id]
    save_products(products_db)
    return Response(status_code=204)


app.mount("/", StaticFiles(directory="ui/dist", html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)