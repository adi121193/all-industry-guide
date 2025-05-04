import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./App.css";
import ArticleDetailPage from './components/ArticleDetailPage';

// Backend URL from environment variables
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth provider to handle user authentication state
const AuthContext = React.createContext();

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for token in local storage
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      // Form data for API
      const formData = new FormData();
      formData.append("username", email);
      formData.append("password", password);
      
      const response = await axios.post(
        `${API}/users/login`, 
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          }
        }
      );
      
      const { access_token, user_id, name } = response.data;
      
      // Store token and user info
      localStorage.setItem("token", access_token);
      const userData = { id: user_id, email, name };
      localStorage.setItem("user", JSON.stringify(userData));
      
      // Set user in state
      setUser(userData);
      
      return { success: true };
    } catch (error) {
      console.error("Login error:", error);
      return { 
        success: false, 
        message: error.response?.data?.detail || "Login failed" 
      };
    }
  };

  const register = async (email, password, name) => {
    try {
      const response = await axios.post(`${API}/users/register`, {
        email,
        password,
        name
      });
      
      const { access_token, user_id } = response.data;
      
      // Store token and user info
      localStorage.setItem("token", access_token);
      const userData = { id: user_id, email, name, isNewUser: true };
      localStorage.setItem("user", JSON.stringify(userData));
      
      // Set user in state
      setUser({...userData, isNewUser: true});
      
      return { success: true };
    } catch (error) {
      console.error("Registration error:", error);
      return { 
        success: false, 
        message: error.response?.data?.detail || "Registration failed" 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Protected route component
function ProtectedRoute({ children, requireOnboarding = true }) {
  const { user, loading } = React.useContext(AuthContext);
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect new users to onboarding (unless we're already on the onboarding page)
  if (requireOnboarding && user.isNewUser && window.location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  
  return children;
}

// Axios interceptor to add authorization header
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Components
function NavBar() {
  const { user, logout } = React.useContext(AuthContext);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <span className="text-xl font-bold tracking-tight">AI Industry Navigator</span>
            </Link>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <Link to="/" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">Home</Link>
                {user && <Link to="/feed" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">My Feed</Link>}
                {user && <Link to="/explore" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">Explore</Link>}
                {user && <Link to="/profile" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">Profile</Link>}
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="ml-4 flex items-center md:ml-6">
              {user ? (
                <div className="flex items-center">
                  <span className="mr-4">{user.name || user.email}</span>
                  <button
                    onClick={logout}
                    className="px-3 py-2 rounded-md text-sm font-medium bg-red-600 hover:bg-red-700"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div className="flex space-x-4">
                  <Link to="/login" className="px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-700">Login</Link>
                  <Link to="/register" className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 hover:bg-blue-700">Register</Link>
                </div>
              )}
            </div>
          </div>
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
            >
              <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link to="/" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">Home</Link>
            {user && <Link to="/feed" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">My Feed</Link>}
            {user && <Link to="/explore" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">Explore</Link>}
            {user && <Link to="/profile" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">Profile</Link>}
          </div>
          <div className="pt-4 pb-3 border-t border-gray-700">
            {user ? (
              <div className="px-2 space-y-1">
                <div className="px-3 py-2">{user.name || user.email}</div>
                <button
                  onClick={logout}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium bg-red-600 hover:bg-red-700"
                >
                  Logout
                </button>
              </div>
            ) : (
              <div className="px-2 space-y-1">
                <Link to="/login" className="block px-3 py-2 rounded-md text-base font-medium hover:bg-gray-700">Login</Link>
                <Link to="/register" className="block px-3 py-2 rounded-md text-base font-medium bg-blue-600 hover:bg-blue-700">Register</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function HomePage() {
  const { user } = React.useContext(AuthContext);
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="hero bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">Stay Updated on AI Industry News</h1>
          <p className="text-xl mb-8">
            AI Industry Navigator delivers personalized AI news and insights tailored to your interests and expertise level.
          </p>
          {user ? (
            <Link to="/feed" className="bg-white text-blue-700 px-6 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition">Go to My Feed</Link>
          ) : (
            <Link to="/register" className="bg-white text-blue-700 px-6 py-3 rounded-lg font-bold text-lg hover:bg-gray-100 transition">Get Started</Link>
          )}
        </div>
      </div>
      
      <div className="max-w-6xl mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-blue-600 text-4xl mb-4">1</div>
            <h3 className="text-xl font-semibold mb-3">Personalized Content</h3>
            <p className="text-gray-600">
              Choose your interests and expertise level to get AI news that's relevant to you.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-blue-600 text-4xl mb-4">2</div>
            <h3 className="text-xl font-semibold mb-3">AI-Powered Summaries</h3>
            <p className="text-gray-600">
              Our AI generates concise summaries of articles, saving you time while keeping you informed.
            </p>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-blue-600 text-4xl mb-4">3</div>
            <h3 className="text-xl font-semibold mb-3">Interactive Assistance</h3>
            <p className="text-gray-600">
              Ask questions about any article or get explanations tailored to your knowledge level.
            </p>
          </div>
        </div>
      </div>
      
      <div className="bg-gray-100 py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          
          <div className="grid md:grid-cols-2 gap-12">
            <div className="flex">
              <div className="mr-4 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Personalized News Feed</h3>
                <p className="text-gray-600">
                  Receive news tailored to your specific interests and expertise level in AI.
                </p>
              </div>
            </div>
            
            <div className="flex">
              <div className="mr-4 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">AI-Driven Insights</h3>
                <p className="text-gray-600">
                  AI technology summarizes and explains complex concepts to enhance your understanding.
                </p>
              </div>
            </div>
            
            <div className="flex">
              <div className="mr-4 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Interactive Q&A</h3>
                <p className="text-gray-600">
                  Ask questions about articles and get instant, accurate answers from our AI assistant.
                </p>
              </div>
            </div>
            
            <div className="flex">
              <div className="mr-4 text-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2">Email Digests</h3>
                <p className="text-gray-600">
                  Receive regular email summaries of the most important AI news based on your preferences.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/feed');
    }
  }, [user, navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/feed');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Log in to your account</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              create a new account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register, user } = React.useContext(AuthContext);
  const navigate = useNavigate();
  
  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate('/feed');
    }
  }, [user, navigate]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const result = await register(email, password, name);
      if (result.success) {
        navigate('/onboarding');
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">Create a new account</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Or{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              log in to your existing account
            </Link>
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="name" className="sr-only">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Name"
              />
            </div>
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                loading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState([]);
  const [knowledgeLevel, setKnowledgeLevel] = useState("Intermediate");
  const [emailDigests, setEmailDigests] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState("Weekly");
  const [availableInterests, setAvailableInterests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  
  // Fetch available interests on load
  useEffect(() => {
    async function fetchInterests() {
      try {
        const response = await axios.get(`${API}/interests`);
        setAvailableInterests(response.data);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching interests:", err);
        setError("Could not fetch available interests");
        setLoading(false);
      }
    }
    
    fetchInterests();
  }, []);
  
  const toggleInterest = (interestId) => {
    if (interests.includes(interestId)) {
      setInterests(interests.filter(id => id !== interestId));
    } else {
      setInterests([...interests, interestId]);
    }
  };
  
  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };
  
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };
  
  const { user } = React.useContext(AuthContext);
  
  const handleSubmit = async () => {
    try {
      await axios.put(`${API}/users/preferences`, {
        interests,
        knowledge_level: knowledgeLevel,
        email_digests: emailDigests,
        email_frequency: emailFrequency,
        slack_enabled: false
      });
      
      // Update user in localStorage to indicate onboarding is complete
      if (user) {
        const updatedUser = { ...user, isNewUser: false };
        localStorage.setItem("user", JSON.stringify(updatedUser));
        // Store knowledge level for use in explanations
        localStorage.setItem("knowledgeLevel", knowledgeLevel);
        window.location.href = '/feed'; // Force a reload to update the user state
      }
      
      navigate('/feed');
    } catch (err) {
      console.error("Error saving preferences:", err);
      setError("Could not save your preferences. Please try again.");
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  return (
    <div className="min-h-[calc(100vh-64px)] bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold">Set Up Your Profile</h1>
          <p className="mt-2 text-gray-600">
            {step === 1 ? "Select your interests to personalize your feed" : 
             step === 2 ? "Set your knowledge level and preferences" :
             "Almost done! Configure your notifications"}
          </p>
          
          {/* Progress indicator */}
          <div className="mt-8 flex items-center justify-center">
            <div className={`h-2 w-2 md:h-3 md:w-3 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`h-1 w-12 md:w-24 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`h-2 w-2 md:h-3 md:w-3 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`h-1 w-12 md:w-24 ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div className={`h-2 w-2 md:h-3 md:w-3 rounded-full ${step >= 3 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
          </div>
        </div>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-6">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        
        {/* Step 1: Interests */}
        {step === 1 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Select Your Interests</h2>
            <p className="text-gray-600 mb-6">Choose topics you're interested in following. You can change these later.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {availableInterests.map((interest) => (
                <div 
                  key={interest.id}
                  className={`p-4 border rounded-lg cursor-pointer ${
                    interests.includes(interest.id) 
                      ? 'bg-blue-100 border-blue-500' 
                      : 'hover:bg-gray-100 border-gray-200'
                  }`}
                  onClick={() => toggleInterest(interest.id)}
                >
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      checked={interests.includes(interest.id)}
                      onChange={() => {}}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label className="ml-2 block font-medium text-gray-700">
                      {interest.name}
                    </label>
                  </div>
                  {interest.description && (
                    <p className="mt-1 text-xs text-gray-500">{interest.description}</p>
                  )}
                </div>
              ))}
            </div>
            
            {interests.length === 0 && (
              <p className="mt-4 text-sm text-red-500">Please select at least one interest</p>
            )}
            
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleNext}
                disabled={interests.length === 0}
                className={`px-4 py-2 rounded-md text-white font-medium ${
                  interests.length === 0 
                    ? 'bg-gray-300 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}
        
        {/* Step 2: Knowledge Level */}
        {step === 2 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Set Your Knowledge Level</h2>
            <p className="text-gray-600 mb-6">
              This helps us adjust the complexity of summaries and explanations to your expertise.
            </p>
            
            <div className="space-y-4">
              <div 
                className={`p-4 border rounded-lg cursor-pointer ${
                  knowledgeLevel === "Beginner" 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'hover:bg-gray-100 border-gray-200'
                }`}
                onClick={() => setKnowledgeLevel("Beginner")}
              >
                <div className="flex items-center">
                  <input 
                    type="radio" 
                    checked={knowledgeLevel === "Beginner"}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <label className="ml-2 block font-medium text-gray-700">
                    Beginner
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500 ml-6">
                  I'm new to AI or just starting to learn. I prefer simple explanations without technical jargon.
                </p>
              </div>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer ${
                  knowledgeLevel === "Intermediate" 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'hover:bg-gray-100 border-gray-200'
                }`}
                onClick={() => setKnowledgeLevel("Intermediate")}
              >
                <div className="flex items-center">
                  <input 
                    type="radio" 
                    checked={knowledgeLevel === "Intermediate"}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <label className="ml-2 block font-medium text-gray-700">
                    Intermediate
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500 ml-6">
                  I have some familiarity with AI concepts. I can handle some technical terms but appreciate context.
                </p>
              </div>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer ${
                  knowledgeLevel === "Expert" 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'hover:bg-gray-100 border-gray-200'
                }`}
                onClick={() => setKnowledgeLevel("Expert")}
              >
                <div className="flex items-center">
                  <input 
                    type="radio" 
                    checked={knowledgeLevel === "Expert"}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <label className="ml-2 block font-medium text-gray-700">
                    Expert
                  </label>
                </div>
                <p className="mt-1 text-sm text-gray-500 ml-6">
                  I'm experienced with AI technologies. I prefer precise, technical information without simplification.
                </p>
              </div>
            </div>
            
            <div className="mt-8 flex justify-between">
              <button
                onClick={handleBack}
                className="px-4 py-2 rounded-md text-gray-700 font-medium border hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleNext}
                className="px-4 py-2 rounded-md text-white font-medium bg-blue-600 hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
        
        {/* Step 3: Email Preferences */}
        {step === 3 && (
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Email Preferences</h2>
            <p className="text-gray-600 mb-6">
              Configure how you'd like to receive updates from AI Industry Navigator.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-center">
                <input 
                  id="email-digests"
                  type="checkbox" 
                  checked={emailDigests}
                  onChange={() => setEmailDigests(!emailDigests)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="email-digests" className="ml-2 block font-medium text-gray-700">
                  Receive email digests
                </label>
              </div>
              
              {emailDigests && (
                <div className="ml-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Digest frequency</label>
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <input 
                        id="frequency-daily"
                        type="radio" 
                        checked={emailFrequency === "Daily"}
                        onChange={() => setEmailFrequency("Daily")}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor="frequency-daily" className="ml-2 block text-gray-700">
                        Daily (morning brief)
                      </label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        id="frequency-weekly"
                        type="radio" 
                        checked={emailFrequency === "Weekly"}
                        onChange={() => setEmailFrequency("Weekly")}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <label htmlFor="frequency-weekly" className="ml-2 block text-gray-700">
                        Weekly (summary of top stories)
                      </label>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-sm text-gray-500 mt-4">
                You can change these preferences or opt out at any time from your profile.
              </p>
            </div>
            
            <div className="mt-8 flex justify-between">
              <button
                onClick={handleBack}
                className="px-4 py-2 rounded-md text-gray-700 font-medium border hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 rounded-md text-white font-medium bg-blue-600 hover:bg-blue-700"
              >
                Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedPage() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeArticle, setActiveArticle] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [queryAnswer, setQueryAnswer] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);
  
  useEffect(() => {
    async function fetchFeed() {
      try {
        // First try to get the personalized feed
        const response = await axios.get(`${API}/articles/feed`);
        
        if (response.data && response.data.length > 0) {
          setArticles(response.data);
        } else {
          // If no personalized articles, fallback to getting general articles
          console.log("No personalized articles found, falling back to general articles");
          const generalResponse = await axios.get(`${API}/articles`);
          setArticles(generalResponse.data);
        }
        setLoading(false);
      } catch (err) {
        console.error("Error fetching feed:", err);
        
        // Fallback to general articles if personalized feed fails
        try {
          console.log("Trying to fetch general articles as fallback");
          const fallbackResponse = await axios.get(`${API}/articles`);
          setArticles(fallbackResponse.data);
          setLoading(false);
        } catch (fallbackErr) {
          console.error("Error fetching fallback articles:", fallbackErr);
          setError("Could not fetch articles. Please try again later.");
          setLoading(false);
        }
      }
    }
    
    fetchFeed();
  }, []);
  
  const handleArticleClick = (article) => {
    setActiveArticle(article);
    setExplanation("");
    setQuery("");
    setQueryAnswer("");
  };
  
  const handleExplain = async () => {
    if (!activeArticle) return;
    
    setExplanationLoading(true);
    try {
      // If content is available, use that; otherwise use the summary
      const contentToExplain = activeArticle.content || activeArticle.summary;
      
      if (!contentToExplain) {
        setExplanation("No content available to explain.");
        return;
      }
      
      const response = await axios.post(`${API}/articles/summarize`, {
        content: contentToExplain,
        knowledge_level: localStorage.getItem("knowledgeLevel") || "Intermediate"
      });
      
      setExplanation(response.data.summary);
    } catch (err) {
      console.error("Error getting explanation:", err);
      setExplanation("Failed to generate explanation. Please try again.");
    } finally {
      setExplanationLoading(false);
    }
  };
  
  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || !activeArticle) return;
    
    setQueryLoading(true);
    try {
      // If the article has content, use article_id; otherwise provide the content directly
      const payload = {
        query: query
      };
      
      if (activeArticle.id) {
        payload.article_id = activeArticle.id;
      } else if (activeArticle.content) {
        payload.context = activeArticle.content;
      } else if (activeArticle.summary) {
        payload.context = activeArticle.summary;
      }
      
      const response = await axios.post(`${API}/articles/ask`, payload);
      
      setQueryAnswer(response.data.answer);
    } catch (err) {
      console.error("Error getting answer:", err);
      setQueryAnswer("Failed to get an answer. Please try again.");
    } finally {
      setQueryLoading(false);
    }
  };
  
  const handleFeedback = async (articleId, type) => {
    try {
      await axios.post(`${API}/articles/${articleId}/feedback`, {
        article_id: articleId,
        feedback_type: type
      });
      
      // Update UI to show feedback was given
      const updatedArticles = articles.map(article => {
        if (article.id === articleId) {
          return { ...article, feedback: type };
        }
        return article;
      });
      
      setArticles(updatedArticles);
    } catch (err) {
      console.error("Error providing feedback:", err);
    }
  };
  
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-lg">Loading your personalized feed...</div>
      </div>
    );
  }
  
  return (
    <div className="bg-gray-50 min-h-[calc(100vh-64px)]">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Your AI News Feed</h1>
        
        {error && (
          <div className="rounded-md bg-red-50 p-4 mb-6">
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}
        
        <div className="flex flex-col md:flex-row gap-6">
          {/* Articles list - left side */}
          <div className="md:w-1/2 lg:w-2/5">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-4 py-3 bg-gray-100 border-b">
                <h2 className="font-semibold">Latest Articles</h2>
              </div>
              
              <div className="divide-y">
                {articles.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No articles found. Try adjusting your interests.
                  </div>
                ) : (
                  articles.map(article => (
                    <div 
                      key={article.id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition ${
                        activeArticle?.id === article.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleArticleClick(article)}
                    >
                      {article.is_trending && (
                        <div className="text-xs font-semibold text-red-600 mb-1">TRENDING</div>
                      )}
                      <h3 className="font-medium mb-1">{article.title}</h3>
                      <p className="text-sm text-gray-500 mb-2">
                        {article.source_name} • {new Date(article.published_date).toLocaleDateString()}
                      </p>
                      <p className="text-sm line-clamp-3">{article.summary}</p>
                      
                      <div className="mt-3 flex gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFeedback(article.id, "like");
                          }}
                          className={`text-xs px-2 py-1 rounded ${
                            article.feedback === "like" 
                              ? "bg-green-100 text-green-700" 
                              : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <span role="img" aria-label="thumbs up">👍</span> Like
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFeedback(article.id, "dislike");
                          }}
                          className={`text-xs px-2 py-1 rounded ${
                            article.feedback === "dislike" 
                              ? "bg-red-100 text-red-700" 
                              : "bg-gray-100 hover:bg-gray-200"
                          }`}
                        >
                          <span role="img" aria-label="thumbs down">👎</span> Dislike
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          
          {/* Article detail and AI features - right side */}
          <div className="md:w-1/2 lg:w-3/5">
            {activeArticle ? (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4">
                  <h2 className="text-xl font-semibold mb-2">{activeArticle.title}</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    {activeArticle.source_name} • {new Date(activeArticle.published_date).toLocaleDateString()}
                  </p>
                  
                  {activeArticle.image_url && (
                    <img 
                      src={activeArticle.image_url} 
                      alt={activeArticle.title}
                      className="w-full h-48 object-cover mb-4 rounded"
                    />
                  )}
                  
                  <div className="prose prose-sm max-w-none mb-6">
                    <p>{activeArticle.summary}</p>
                    
                    <div className="mt-4">
                      <a 
                        href={activeArticle.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Read full article
                      </a>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-medium">AI Assistance</h3>
                      <button
                        onClick={handleExplain}
                        disabled={explanationLoading}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded flex items-center"
                      >
                        {explanationLoading ? "Generating..." : "Explain this article"}
                      </button>
                    </div>
                    
                    {explanation && (
                      <div className="bg-blue-50 p-4 rounded-lg mb-4">
                        <h4 className="text-sm font-semibold text-blue-800 mb-2">AI Explanation:</h4>
                        <p className="text-sm">{explanation}</p>
                      </div>
                    )}
                    
                    <form onSubmit={handleQuerySubmit} className="mt-4">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Ask a question about this article..."
                          className="flex-1 px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          disabled={queryLoading || !query.trim()}
                          className={`px-4 py-2 text-white text-sm rounded-md ${
                            queryLoading || !query.trim() 
                              ? "bg-gray-300 cursor-not-allowed" 
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                        >
                          {queryLoading ? "..." : "Ask"}
                        </button>
                      </div>
                    </form>
                    
                    {queryAnswer && (
                      <div className="bg-gray-50 p-4 rounded-lg mt-4">
                        <h4 className="text-sm font-semibold mb-2">Answer:</h4>
                        <p className="text-sm">{queryAnswer}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="mt-2 text-lg font-medium text-gray-900">Select an Article</h3>
                <p className="mt-1 text-gray-500">
                  Choose an article from the list to view details and interact with AI features.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



function ExplorePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-4">Explore</h1>
        <p>Explore page content coming soon...</p>
      </div>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4">
        <h1 className="text-2xl font-bold mb-4">Profile</h1>
        <p>Profile page content coming soon...</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="flex flex-col min-h-screen">
          <NavBar />
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/onboarding" element={
                <ProtectedRoute requireOnboarding={false}>
                  <OnboardingPage />
                </ProtectedRoute>
              } />
              <Route path="/feed" element={
                <ProtectedRoute requireOnboarding={true}>
                  <FeedPage />
                </ProtectedRoute>
              } />
              <Route path="/articles/:articleId" element={
                <ProtectedRoute requireOnboarding={true}>
                  <ArticleDetailPage />
                </ProtectedRoute>
              } />
              <Route path="/explore" element={
                <ProtectedRoute requireOnboarding={true}>
                  <ExplorePage />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute requireOnboarding={true}>
                  <ProfilePage />
                </ProtectedRoute>
              } />
            </Routes>
          </main>
          <footer className="bg-gray-800 text-white py-6">
            <div className="container mx-auto px-4">
              <div className="flex flex-col md:flex-row justify-between items-center">
                <div className="mb-4 md:mb-0">
                  <div className="text-lg font-bold">AI Industry Navigator</div>
                  <div className="text-sm text-gray-400">Stay informed on AI trends and news</div>
                </div>
                <div className="text-sm text-gray-400">
                  &copy; {new Date().getFullYear()} AI Industry Navigator. All rights reserved.
                </div>
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;