from fastapi import FastAPI, APIRouter, Depends, HTTPException, Body, Query, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
import os
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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "YOUR_SECRET_KEY_HERE")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

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
    user = await db.users.find_one({"email": form_data.username})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
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
    # Update user preferences
    update_data = {
        "interests": preferences.interests,
        "knowledge_level": preferences.knowledge_level,
        "email_digests": preferences.email_digests,
        "email_frequency": preferences.email_frequency,
        "slack_enabled": preferences.slack_enabled,
        "slack_webhook": preferences.slack_webhook
    }
    
    await db.users.update_one(
        {"id": current_user.id},
        {"$set": update_data}
    )
    
    # Return updated user
    updated_user = await db.users.find_one({"id": current_user.id})
    return User(**updated_user)

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
    if await db.interest_categories.count_documents({}) == 0:
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
        await db.interest_categories.insert_many(default_categories)
    
    # Set up default news sources if none exist
    if await db.news_sources.count_documents({}) == 0:
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
        await db.news_sources.insert_many(default_sources)
    
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
