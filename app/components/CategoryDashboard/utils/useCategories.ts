import { useState, useEffect } from 'react';
import { logger } from '../../../utils/client-logger';

export const useCategories = () => {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/get_all_categories');
        if (response.ok) {
          const data = await response.json();
          setCategories(data);
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          const errorMessage = `Failed to fetch categories: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
          throw new Error(errorMessage);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error occurred');
        setError(error);
        logger.error('Error fetching categories', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return { categories, loading, error };
};

