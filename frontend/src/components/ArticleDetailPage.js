
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const ArticleDetailPage = () => {
  const { id } = useParams();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchArticle = async () => {
      try {
        const response = await fetch(`/api/articles/${id}`);
        if (!response.ok) throw new Error('Failed to fetch article');
        const data = await response.json();
        setArticle(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!article) return <div>Article not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">{article.title}</h1>
      {article.image_url && (
        <img 
          src={article.image_url} 
          alt={article.title}
          className="w-full h-64 object-cover rounded-lg mb-6"
        />
      )}
      <div className="mb-4 text-gray-600">
        <span>Source: {article.source_name}</span>
        {article.published_date && (
          <span className="ml-4">
            Published: {new Date(article.published_date).toLocaleDateString()}
          </span>
        )}
      </div>
      <p className="text-lg mb-6">{article.summary}</p>
      <div className="prose max-w-none">
        {article.content && <p>{article.content}</p>}
      </div>
    </div>
  );
};

export default ArticleDetailPage;
