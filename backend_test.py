
import requests
import sys
import time
import uuid
from datetime import datetime

class AIIndustryNavigatorTester:
    def __init__(self, base_url="https://32424d38-bc56-48f8-b667-7393bfec131e.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user = {
            "email": f"test_{uuid.uuid4()}@example.com",
            "password": "password123",
            "name": "Test User"
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.json()}")
                except:
                    print(f"Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_register(self):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "users/register",
            200,
            data=self.test_user
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user_id')
            return True
        return False

    def test_login(self):
        """Test user login"""
        login_data = {
            "username": self.test_user["email"],
            "password": self.test_user["password"]
        }
        success, response = self.run_test(
            "User Login",
            "POST",
            "users/login",
            200,
            data=login_data
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response.get('user_id')
            return True
        return False

    def test_get_user_profile(self):
        """Test getting user profile"""
        success, response = self.run_test(
            "Get User Profile",
            "GET",
            "users/me",
            200
        )
        return success

    def test_update_preferences(self):
        """Test updating user preferences"""
        preferences = {
            "user_id": self.user_id,
            "interests": ["Machine Learning", "AI Ethics"],
            "knowledge_level": "Intermediate",
            "email_digests": True,
            "email_frequency": "Weekly",
            "slack_enabled": False
        }
        success, response = self.run_test(
            "Update User Preferences",
            "PUT",
            "users/preferences",
            200,
            data=preferences
        )
        return success

    def test_get_articles(self):
        """Test getting articles"""
        success, response = self.run_test(
            "Get Articles",
            "GET",
            "articles",
            200,
            params={"limit": 10}
        )
        if success and isinstance(response, list):
            print(f"Retrieved {len(response)} articles")
            if len(response) > 0:
                self.article_id = response[0].get('id')
                return True
        return success

    def test_get_personalized_feed(self):
        """Test getting personalized feed"""
        success, response = self.run_test(
            "Get Personalized Feed",
            "GET",
            "articles/feed",
            200
        )
        return success

    def test_get_article_by_id(self):
        """Test getting article by ID"""
        if not hasattr(self, 'article_id'):
            print("⚠️ No article ID available to test")
            return False
            
        success, response = self.run_test(
            "Get Article by ID",
            "GET",
            f"articles/{self.article_id}",
            200
        )
        return success

    def test_article_summarization(self):
        """Test article summarization"""
        data = {
            "url": "https://venturebeat.com/ai/how-ai-is-transforming-the-future-of-work/",
            "knowledge_level": "Intermediate"
        }
        success, response = self.run_test(
            "Article Summarization",
            "POST",
            "articles/summarize",
            200,
            data=data
        )
        return success and 'summary' in response

    def test_ask_about_article(self):
        """Test asking questions about an article"""
        if not hasattr(self, 'article_id'):
            print("⚠️ No article ID available to test")
            return False
            
        data = {
            "query": "What are the main points of this article?",
            "article_id": self.article_id
        }
        success, response = self.run_test(
            "Ask About Article",
            "POST",
            "articles/ask",
            200,
            data=data
        )
        return success and 'answer' in response

    def test_get_interests(self):
        """Test getting interest categories"""
        success, response = self.run_test(
            "Get Interest Categories",
            "GET",
            "interests",
            200
        )
        return success

    def test_get_sources(self):
        """Test getting news sources"""
        success, response = self.run_test(
            "Get News Sources",
            "GET",
            "sources",
            200
        )
        return success

def main():
    # Setup
    tester = AIIndustryNavigatorTester()
    
    # Run tests
    print("\n🚀 Starting API Tests for AI Industry Navigator\n")
    
    # Test registration
    if not tester.test_register():
        print("❌ Registration failed, trying login...")
        if not tester.test_login():
            print("❌ Login also failed, stopping tests")
            return 1
    
    # Test user profile and preferences
    tester.test_get_user_profile()
    tester.test_update_preferences()
    
    # Test articles
    tester.test_get_articles()
    tester.test_get_personalized_feed()
    tester.test_get_article_by_id()
    
    # Test AI features
    tester.test_article_summarization()
    tester.test_ask_about_article()
    
    # Test categories and sources
    tester.test_get_interests()
    tester.test_get_sources()
    
    # Print results
    print(f"\n📊 Tests passed: {tester.tests_passed}/{tester.tests_run}")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())
      