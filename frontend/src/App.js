import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./App.css";

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
      const userData = { id: user_id, email, name };
      localStorage.setItem("user", JSON.stringify(userData));
      
      // Set user in state
      setUser(userData);
      
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
function ProtectedRoute({ children }) {
  const { user, loading } = React.useContext(AuthContext);
  
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
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

// More components will be implemented but are excluded to avoid oversized code block
// We'll add LoginPage, RegisterPage, FeedPage, etc. in the next chunks

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
              {/* Other routes will be added */}
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