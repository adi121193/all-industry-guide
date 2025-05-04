from fastapi import FastAPI, APIRouter, Depends, HTTPException, Body, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import os
from typing import Dict, Any

from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions

import logging
import feedparser
import datetime
import uuid
import asyncio
import aiohttp
import google.generativeai as genai
import requests
from bs4 import BeautifulSoup
from typing import List, Optional, Dict, Any
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, HttpUrl
from passlib.context import CryptContext
from datetime import datetime, timedelta
import jwt

# Directory setup
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Initialize Supabase client
supabase_url = os.environ.get('SUPABASE_URL')
supabase_key = os.environ.get('SUPABASE_KEY')

if not supabase_url or not supabase_key:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")

try:
    # Initialize Supabase client with the anon/service role key
    supabase = create_client(supabase_url, supabase_key)
except Exception as e:
    print(f"Failed to initialize Supabase client: {e}")
    raise

# Create the main app without a prefix
app = FastAPI(title="AI Industry Navigator API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Google Gemini initialization
try:
    gemini_api_key = os.environ["GEMINI_API_KEY"]
    genai.configure(api_key=gemini_api_key)
    model = genai.GenerativeModel('gemini-1.5-pro')
except Exception as e:
    logging.error(f"Failed to initialize Gemini: {str(e)}")

# Password handling
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/login")

# JWT settings
if not (SECRET_KEY := os.environ.get("JWT_SECRET_KEY")):
    raise RuntimeError("JWT_SECRET_KEY environment variable must be set")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Initialize the scheduler
scheduler = AsyncIOScheduler()

# Knowledge levels
KNOWLEDGE_LEVELS = ["Beginner", "Intermediate", "Expert"]

# Define Models
class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(UserBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    interests: List[str] = []
    knowledge_level: str = "Intermediate"
    email_digests: bool = True
    email_frequency: str = "Weekly"
    slack_enabled: bool = False
    slack_webhook: Optional[str] = None
    is_onboarding_complete: bool = False

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    name: Optional[str] = None

class InterestCategory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None

class NewsSource(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    url: HttpUrl
    rss_url: Optional[HttpUrl] = None
    category: Optional[str] = None
    enabled: bool = True

class Article(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    url: HttpUrl
    source_name: str
    source_id: Optional[str] = None
    published_date: Optional[datetime] = None
    categories: List[str] = []
    summary: str
    content: Optional[str] = None
    image_url: Optional[HttpUrl] = None
    is_trending: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

class UserPreference(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    interests: List[str] = []
    knowledge_level: str
    email_digests: bool = True
    email_frequency: str = "Weekly"
    slack_enabled: bool = False
    slack_webhook: Optional[str] = None

class UserFeedback(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    article_id: str
    feedback_type: str  # "like", "dislike"
    comment: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ArticleSummaryRequest(BaseModel):
    url: HttpUrl = None
    content: Optional[str] = None
    knowledge_level: str = "Intermediate"

class ChatQuery(BaseModel):
    query: str
    article_id: Optional[str] = None
    context: Optional[str] = None

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = await db.users.find_one({"id": user_id})
    if user is None:
        raise credentials_exception
    return User(**user)

# AI-powered functions
async def summarize_article(article_content: str, knowledge_level: str) -> str:
    """Summarize an article using Google's Gemini API"""
    try:
        prompt = f"""
        Please summarize the following article. 
        Knowledge level: {knowledge_level}. 
        If the reader is a Beginner, make it more accessible with simple explanations.
        If the reader is an Expert, you can use technical terminology where appropriate.
        Keep the summary clear and concise (2-5 sentences).

        Article content:
        {article_content}
        """

        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logging.error(f"Error in summarization: {str(e)}")
        return "An error occurred during summarization."

async def answer_question(query: str, context: Optional[str] = None) -> str:
    """Answer a user's question using Google's Gemini API"""
    try:
        prompt = f"""
        Please answer the following question about AI or technology. 
        Be accurate, helpful, and concise.

        Question: {query}
        """

        if context:
            prompt += f"\n\nContext (use this information to help with your answer):\n{context}"

        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logging.error(f"Error in QA: {str(e)}")
        return "I'm sorry, I couldn't process that question at the moment."

async def detect_trends(articles: List[Article]) -> List[Article]:
    """Identify trending articles"""
    # Simple implementation - in production we'd use more sophisticated trend analysis
    # Mark the 3 most recent articles as trending for now
    sorted_articles = sorted(articles, key=lambda x: x.created_at, reverse=True)
    for i, article in enumerate(sorted_articles):
        if i < 3:
            article.is_trending = True
    return sorted_articles

# Content ingestion functions
async def parse_feed(feed_url: str, source_id: str, source_name: str) -> List[dict]:
    """Parse an RSS feed and extract articles"""
    try:
        feed = feedparser.parse(feed_url)
        articles = []

        for entry in feed.entries[:10]:  # Limit to 10 articles per source
            # Extract data
            title = entry.get('title', 'No title')
            link = entry.get('link', None)
            if not link:
                continue

            published = entry.get('published_parsed', None)
            published_date = None
            if published:
                published_date = datetime.fromtimestamp(datetime.timestamp(
                    datetime(*published[:6])
                ))

            # Extract content using requests and BeautifulSoup
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                response = requests.get(link, headers=headers, timeout=10)
                soup = BeautifulSoup(response.content, 'html.parser')

                # Remove script and style elements
                for script in soup(["script", "style"]):
                    script.extract()

                # Get text content
                content = soup.get_text(separator='\n', strip=True)

                # Try to find a main image
                image_url = None
                img_tags = soup.find_all('img', class_=lambda c: c and ('hero' in c.lower() or 'featured' in c.lower() or 'main' in c.lower()))
                if img_tags:
                    for img in img_tags:
                        if img.get('src'):
                            image_url = img.get('src')
                            break

                # If no specific image found, try to get the largest image
                if not image_url:
                    img_tags = soup.find_all('img')
                    if img_tags:
                        # Get the first decent sized image
                        for img in img_tags:
                            if img.get('src') and not img.get('src').endswith(('.ico', '.svg')):
                                if img.get('width') and img.get('height'):
                                    if int(img.get('width', 0)) > 200 and int(img.get('height', 0)) > 200:
                                        image_url = img.get('src')
                                        break
                                else:
                                    image_url = img.get('src')
                                    break
            except Exception as e:
                logging.warning(f"Error parsing article content: {str(e)}")
                content = entry.get('summary', 'No content available')
                image_url = None

            # Generate summary with Gemini
            summary = await summarize_article(content[:4000], "Intermediate")  # Limit content length

            articles.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "url": link,
                "source_name": source_name,
                "source_id": source_id,
                "published_date": published_date,
                "categories": [],  # Will be populated later
                "summary": summary,
                "content": content,
                "image_url": image_url,
                "is_trending": False,
                "created_at": datetime.utcnow()
            })

        return articles
    except Exception as e:
        logging.error(f"Error parsing feed {feed_url}: {str(e)}")
        return []

# Scheduled ingestion job
async def ingest_all_feeds():
    """Ingest articles from all enabled news sources"""
    try:
        sources = await db.news_sources.find({"enabled": True}).to_list(100)

        for source in sources:
            if not source.get("rss_url"):
                continue

            logging.info(f"Ingesting from source: {source['name']}")
            articles = await parse_feed(
                source["rss_url"], 
                source["id"], 
                source["name"]
            )

            if articles:
                # Filter articles - don't add duplicates
                existing_urls = set()
                existing_titles = set()

                # Get existing articles from last 3 days
                three_days_ago = datetime.utcnow() - timedelta(days=3)
                existing = await db.articles.find({
                    "created_at": {"$gte": three_days_ago}
                }).to_list(1000)

                for existing_article in existing:
                    existing_urls.add(existing_article["url"])
                    existing_titles.add(existing_article["title"])

                # Filter and insert new articles
                new_articles = []
                for article in articles:
                    if article["url"] not in existing_urls and article["title"] not in existing_titles:
                        new_articles.append(article)

                if new_articles:
                    await db.articles.insert_many(new_articles)
                    logging.info(f"Added {len(new_articles)} new articles from {source['name']}")
                else:
                    logging.info(f"No new articles from {source['name']}")
    except Exception as e:
        logging.error(f"Error in feed ingestion: {str(e)}")

# User routes
@api_router.post("/users/register", response_model=Token)
async def register_user(user_create: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_create.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    hashed_password = hash_password(user_create.password)
    new_user = User(
        email=user_create.email,
        name=user_create.name
    )

    user_dict = new_user.dict()
    user_dict["hashed_password"] = hashed_password
    if "password" in user_dict:
        del user_dict["password"]

    # Insert to database
    await db.users.insert_one(user_dict)

    # Generate token
    access_token = create_access_token(
        data={"sub": new_user.id}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=new_user.id,
        name=new_user.name
    )

@api_router.post("/users/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # Find user
    try:
        response = supabase.table('users').select('*').eq('email', form_data.username).execute()
        user = response.data[0] if response.data else None
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

    # Verify password
    if not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate token
    access_token = create_access_token(
        data={"sub": user["id"]}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user_id=user["id"],
        name=user.get("name")
    )

@api_router.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@api_router.put("/users/preferences", response_model=User)
async def update_preferences(
    preferences: UserPreference,
    current_user: User = Depends(get_current_user)
):
    try:
        # Update user preferences and mark onboarding as complete
        update_data = {
            "interests": preferences.interests,
            "knowledge_level": preferences.knowledge_level,
            "email_digests": preferences.email_digests,
            "email_frequency": preferences.email_frequency,
            "slack_enabled": preferences.slack_enabled,
            "slack_webhook": preferences.slack_webhook,
            "is_onboarding_complete": True
        }

        result = await db.users.update_one(
            {"id": current_user.id},
            {"$set": update_data}
        )

        if result.modified_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to update preferences"
            )

        # Return updated user
        updated_user = await db.users.find_one({"id": current_user.id})
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        return User(**updated_user)
    except Exception as e:
        logging.error(f"Error updating preferences: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save preferences. Please try again."
        )

# Article routes
@api_router.get("/articles", response_model=List[Article])
async def get_articles(
    limit: int = 20,
    skip: int = 0,
    categories: Optional[str] = None,
    trending: Optional[bool] = None,
    current_user: User = Depends(get_current_user)
):
    # Build query
    query = {}

    # Filter by user interests if requested
    if categories:
        category_list = categories.split(",")
        query["categories"] = {"$in": category_list}

    # Filter by trending status if requested
    if trending is not None:
        query["is_trending"] = trending

    # Get articles
    articles_cursor = db.articles.find(query)

    # Sort by latest first
    articles_cursor = articles_cursor.sort("published_date", -1)

    # Apply pagination
    articles_cursor = articles_cursor.skip(skip).limit(limit)

    # Convert to list
    articles = await articles_cursor.to_list(length=limit)

    # Format and return
    return [Article(**article) for article in articles]

@api_router.get("/articles/feed", response_model=List[Article])
async def get_personalized_feed(
    limit: int = 20,
    skip: int = 0,
    current_user: User = Depends(get_current_user)
):
    """Get a personalized feed based on user interests"""
    query = {}

    # Apply user interests if available
    if current_user.interests:
        query["categories"] = {"$in": current_user.interests}

    # Get articles
    articles_cursor = db.articles.find(query)

    # Sort by latest first
    articles_cursor = articles_cursor.sort("published_date", -1)

    # Apply pagination
    articles_cursor = articles_cursor.skip(skip).limit(limit)

    # Convert to list
    articles = await articles_cursor.to_list(length=limit)

    # If no articles with user interests, fallback to latest articles
    if not articles and current_user.interests:
        articles = await db.articles.find().sort("published_date", -1).limit(limit).to_list(length=limit)

    # Add some trending articles if available
    trending_articles = await db.articles.find({"is_trending": True}).limit(3).to_list(length=3)

    # Combine and deduplicate
    article_ids = set(a["id"] for a in articles)
    for trending in trending_articles:
        if trending["id"] not in article_ids:
            articles.append(trending)
            article_ids.add(trending["id"])

    # Format and return
    return [Article(**article) for article in articles]

@api_router.get("/articles/{article_id}", response_model=Article)
async def get_article(
    article_id: str,
    current_user: User = Depends(get_current_user)
):
    article = await db.articles.find_one({"id": article_id})
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found"
        )

    return Article(**article)

@api_router.post("/articles/summarize")
async def summarize_article_endpoint(
    request: ArticleSummaryRequest,
    current_user: User = Depends(get_current_user)
):
    content = request.content

    # If URL is provided but not content, fetch the content
    if request.url and not content:
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(str(request.url), headers=headers, timeout=10)
            soup = BeautifulSoup(response.content, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.extract()

            # Get text content
            content = soup.get_text(separator='\n', strip=True)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch article content: {str(e)}"
            )

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either URL or content must be provided"
        )

    # Generate summary
    summary = await summarize_article(
        content[:4000],  # Limit content length
        request.knowledge_level
    )

    return {"summary": summary}

@api_router.post("/articles/ask")
async def ask_about_article(
    query: ChatQuery,
    current_user: User = Depends(get_current_user)
):
    context = query.context

    # If article_id is provided but not context, fetch the article
    if query.article_id and not context:
        article = await db.articles.find_one({"id": query.article_id})
        if not article:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Article not found"
            )
        context = article.get("content", "")

    # Answer the question
    answer = await answer_question(query.query, context)

    return {"answer": answer}

@api_router.post("/articles/{article_id}/feedback")
async def provide_feedback(
    article_id: str,
    feedback: UserFeedback,
    current_user: User = Depends(get_current_user)
):
    # Check if article exists
    article = await db.articles.find_one({"id": article_id})
    if not article:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found"
        )

    # Set the user_id and article_id
    feedback.user_id = current_user.id
    feedback.article_id = article_id

    # Save feedback
    await db.feedback.insert_one(feedback.dict())

    return {"status": "success", "message": "Feedback recorded"}

# Interest and Category routes
@api_router.get("/interests", response_model=List[InterestCategory])
async def get_interests(current_user: User = Depends(get_current_user)):
    categories = await db.interest_categories.find().to_list(100)
    return [InterestCategory(**category) for category in categories]

# News Source routes
@api_router.get("/sources", response_model=List[NewsSource])
async def get_sources(current_user: User = Depends(get_current_user)):
    sources = await db.news_sources.find().to_list(100)
    return [NewsSource(**source) for source in sources]

# Add initial data if needed
@app.on_event("startup")
async def startup_db_client():
    # Set up default interest categories if none exist
    try:
        result = supabase.table('interest_categories').select('*').execute()
        if not result.data:
        default_categories = [
            {"id": str(uuid.uuid4()), "name": "Machine Learning", "description": "Machine learning algorithms and techniques"},
            {"id": str(uuid.uuid4()), "name": "AI Research", "description": "Academic research in artificial intelligence"},
            {"id": str(uuid.uuid4()), "name": "AI in Healthcare", "description": "Applications of AI in medical and healthcare fields"},
            {"id": str(uuid.uuid4()), "name": "NLP", "description": "Natural Language Processing and large language models"},
            {"id": str(uuid.uuid4()), "name": "Computer Vision", "description": "Image and video processing with AI"},
            {"id": str(uuid.uuid4()), "name": "AI Ethics", "description": "Ethical considerations in AI development and deployment"},
            {"id": str(uuid.uuid4()), "name": "AI Startups", "description": "News about AI startups and funding"},
            {"id": str(uuid.uuid4()), "name": "AI Policy", "description": "Government policies and regulations related to AI"},
            {"id": str(uuid.uuid4()), "name": "Robotics", "description": "AI in robotics and autonomous systems"}
        ]
        for category in default_categories:
                supabase.table('interest_categories').insert(category).execute()

    # Set up default news sources if none exist
    result = supabase.table('news_sources').select('*').execute()
    if not result.data:
        default_sources = [
            {
                "id": str(uuid.uuid4()),
                "name": "VentureBeat AI",
                "url": "https://venturebeat.com/category/ai/",
                "rss_url": "https://venturebeat.com/category/ai/feed/",
                "category": "AI News",
                "enabled": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "MIT Technology Review AI",
                "url": "https://www.technologyreview.com/topic/artificial-intelligence/",
                "rss_url": "https://www.technologyreview.com/feed/",
                "category": "AI Research",
                "enabled": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Google AI Blog",
                "url": "https://blog.research.google/",
                "rss_url": "https://blog.research.google/feeds/posts/default?alt=rss",
                "category": "AI Research",
                "enabled": True
            },
            {
                "id": str(uuid.uuid4()),
                "name": "AI News",
                "url": "https://www.artificialintelligence-news.com/",
                "rss_url": "https://www.artificialintelligence-news.com/feed/",
                "category": "AI News",
                "enabled": True
            }
        ]
        for source in default_sources:
                supabase.table('news_sources').insert(source).execute()

    # Add some demo articles if none exist
    result = supabase.table('articles').select('*').execute()
    if not result.data:
        logging.info("No articles found, adding demo articles...")
        demo_articles = [
            {
                "id": str(uuid.uuid4()),
                "title": "Google Introduces New Gemini Updates for Developers",
                "url": "https://blog.google/technology/ai/gemini-api-developers-launch/",
                "source_name": "Google AI Blog",
                "published_date": datetime.utcnow() - timedelta(days=1),
                "categories": ["Machine Learning", "NLP"],
                "summary": "Google has announced new updates to Gemini, their large language model. The updates include improved APIs for developers, better performance, and new capabilities like code generation and structured outputs.",
                "content": "Google has announced significant updates to their Gemini AI model aimed at developers. The new capabilities include improved API access, better performance on complex reasoning tasks, and enhanced capabilities for code generation. The Gemini model is now available through Google Cloud with more flexible pricing options for different usage patterns. Developers can access Gemini through Google's Vertex AI platform or through direct API calls. The model has shown significant improvements in benchmarks related to coding, mathematics, and multimodal reasoning. Google is also introducing new tools for fine-tuning and prompt engineering to help developers get better results.",
                "image_url": "https://storage.googleapis.com/gweb-uniblog-publish-prod/images/Gemini_API.max-1000x1000.jpg",
                "is_trending": True,
                "created_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()),
                "title": "New Research Shows Progress in AI Ethics Guidelines",
                "url": "https://example.com/ai-ethics-research",
                "source_name": "AI Ethics Journal",
                "published_date": datetime.utcnow() - timedelta(days=2),
                "categories": ["AI Ethics", "AI Policy"],
                "summary": "A new study has found that major AI companies are improving their adherence to ethical guidelines, though gaps remain in implementation and enforcement of these standards.",
                "content": "A comprehensive study published today in the AI Ethics Journal shows significant progress in how major technology companies are implementing AI ethical guidelines. The research, conducted over a two-year period, evaluated 25 major AI companies and their approach to ethical AI development. Results indicate that 78% of companies now have formal ethics guidelines, up from 45% two years ago. However, the study also identifies significant gaps in how these guidelines are enforced, with only 32% of companies having independent ethics review boards with meaningful authority. The researchers recommend stronger external oversight mechanisms and greater transparency in how ethical decisions are made within AI development teams. The study also highlights best practices from companies that have successfully integrated ethical considerations into their development processes.",
                "image_url": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485",
                "is_trending": True,
                "created_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()),
                "title": "Breakthrough in AI for Cancer Detection",
                "url": "https://example.com/ai-cancer-detection",
                "source_name": "Healthcare AI News",
                "published_date": datetime.utcnow() - timedelta(days=3),
                "categories": ["AI in Healthcare", "Computer Vision"],
                "summary": "Researchers have developed a new AI system that can detect early-stage cancer from medical imaging with higher accuracy than traditional methods, potentially saving thousands of lives through earlier intervention.",
                "content": "A team of researchers from Stanford University and Memorial Sloan Kettering Cancer Center have announced a breakthrough in using artificial intelligence for cancer detection. Their system, which combines advanced computer vision techniques with large-scale medical imaging datasets, has demonstrated the ability to identify early-stage cancer with 94% accuracy, compared to 72% accuracy for traditional screening methods. The AI system was trained on over 1 million anonymized medical images and validated across multiple independent datasets. Particularly promising results were seen in detecting lung, breast, and colorectal cancers at stages where treatment is most effective. The researchers are now working with regulatory authorities to begin clinical trials, with hopes of bringing the technology to hospitals within two years. If successful, the system could significantly increase cancer survival rates through earlier detection and intervention.",
                "image_url":"https://images.unsplash.com/photo-1576086213369-97a306d36557",
                "is_trending": False,
                "created_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()),
                "title": "AI Startup Raises $200M for Robotics Revolution",
                "url": "https://example.com/robotics-startup-funding",
                "source_name": "VentureBeat AI",
                "published_date": datetime.utcnow() - timedelta(days=4),
                "categories": ["AI Startups", "Robotics"],
                "summary": "RoboMinds, an emerging leader in AI-powered industrial robotics, has secured $200 million in Series C funding to expand its manufacturing automation platform across North America and Europe.",
                "content": "RoboMinds, a rapidly growing startup in the AI robotics space, has announced a $200 million Series C funding round led by Sequoia Capital with participation from Andreessen Horowitz and Tiger Global. The company, founded in 2020, has developed an innovative platform that combines advanced computer vision with reinforcement learning to create versatile robotics systems for manufacturing environments. Unlike traditional industrial robots that require extensive programming for specific tasks, RoboMinds' systems can adapt to new tasks through demonstration and natural language instructions. The company has already deployed its technology in automotive and electronics manufacturing facilities, demonstrating productivity improvements of 35-40% compared to traditional automation systems. The new funding will be used to expand the company's presence in North America and Europe, with plans to double its engineering team and establish new demonstration facilities in Detroit, Stuttgart, and Tokyo. Industry analysts see this as a significant development in making advanced robotics more accessible to mid-sized manufacturers who have previously struggled with the complexity and cost of robotics implementation.",
                "image_url": "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023",
                "is_trending": True,
                "created_at": datetime.utcnow()
            },
            {
                "id": str(uuid.uuid4()),
                "title": "New Benchmark Shows AI Systems Approaching Human Performance in Reasoning Tasks",
                "url": "https://example.com/ai-reasoning-benchmark",
                "source_name": "AI Research Institute",
                "published_date": datetime.utcnow() - timedelta(days=5),
                "categories": ["AI Research", "Machine Learning"],
                "summary": "A new comprehensive benchmark for evaluating AI reasoning capabilities shows top models are now achieving 87% of human performance on complex logical and mathematical reasoning tasks, a significant improvement from last year.",
                "content": "The AI Research Institute has released results from its 2025 Reasoning and Logic Benchmark (RLB), showing remarkable progress in AI systems' ability to handle complex reasoning tasks. The benchmark includes a diverse set of problems ranging from formal logic and mathematical proofs to commonsense reasoning about physical scenarios. According to the results, the top-performing AI systems now achieve 87% of human expert performance across all categories, up from 74% in last year's evaluation. Particularly notable is the progress in multi-step reasoning, where systems must construct chains of logical deductions to solve problems. The most advanced models showed a 25% improvement in this area compared to last year. The benchmark evaluated 12 leading AI systems from research labs and companies across the globe. OpenAI's latest GPT model and Anthropic's Claude system showed the strongest overall performance, while Google's PaLM-X excelled specifically in mathematical reasoning. Researchers attribute the improvements to advances in training methodologies that better equip models to decompose complex problems into manageable steps, as well as architectural innovations that enhance memory and attention mechanisms. Despite the progress, significant gaps remain in areas requiring abstract conceptualization and creative problem-solving approaches that humans typically excel at.",
                "image_url": "https://images.unsplash.com/photo-1509228627152-72ae9ae6848d",
                "is_trending": False,
                "created_at": datetime.utcnow()
            }
        ]
        for article in demo_articles:
                supabase.table('articles').insert(article).execute()
        logging.info(f"Added {len(demo_articles)} demo articles")

    # Start the scheduler for article ingestion
    scheduler.add_job(
        ingest_all_feeds,
        CronTrigger(hour="*/3"),  # Run every 3 hours
        id="ingest_feeds"
    )

    # Run ingestion initially to populate articles
    asyncio.create_task(ingest_all_feeds())

    # Start the scheduler
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_db_client():
    # Shut down scheduler
    scheduler.shutdown()

    # Close MongoDB connection
    client.close()

# Root route for the API
@api_router.get("/")
async def root():
    return {"message": "Welcome to the AI Industry Navigator API"}

# API root endpoint
@app.get("/api")
async def api_root():
    return {"message": "AI Industry Navigator API", "version": "1.0.0"}

# Include the router in the main app
app.include_router(api_router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)