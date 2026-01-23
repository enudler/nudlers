import { useState, useEffect } from 'react';
import { logger } from '../../../utils/client-logger';

interface CardVendorMapping {
  [last4_digits: string]: {
    card_vendor: string | null;
    card_nickname: string | null;
  };
}

// Global cache to avoid refetching
let cachedVendors: CardVendorMapping | null = null;
let fetchPromise: Promise<CardVendorMapping> | null = null;

async function fetchCardVendors(): Promise<CardVendorMapping> {
  if (cachedVendors) {
    return cachedVendors;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetch('/api/cards')
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to fetch card vendors: ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then(data => {
      const mapping: CardVendorMapping = {};
      for (const card of data) {
        if (card.card_vendor) {
          mapping[card.last4_digits] = {
            card_vendor: card.card_vendor,
            card_nickname: card.card_nickname,
          };
        }
      }
      cachedVendors = mapping;
      fetchPromise = null;
      return mapping;
    })
    .catch(err => {
      fetchPromise = null;
      logger.error('Failed to fetch card vendors', err as Error);
      return {};
    });

  return fetchPromise;
}

export function useCardVendors() {
  const [vendorMap, setVendorMap] = useState<CardVendorMapping>(cachedVendors || {});
  const [isLoading, setIsLoading] = useState(!cachedVendors);

  useEffect(() => {
    if (!cachedVendors) {
      fetchCardVendors().then(data => {
        setVendorMap(data);
        setIsLoading(false);
      });
    }

    // Listen for updates to card vendors
    const handleUpdate = () => {
      cachedVendors = null;
      fetchCardVendors().then(data => {
        setVendorMap(data);
      });
    };

    window.addEventListener('cardVendorsUpdated', handleUpdate);
    return () => window.removeEventListener('cardVendorsUpdated', handleUpdate);
  }, []);

  const getCardVendor = (accountNumber: string | undefined | null): string | null => {
    if (!accountNumber || accountNumber.length < 4) return null;
    const last4 = accountNumber.slice(-4);
    return vendorMap[last4]?.card_vendor || null;
  };

  const getCardNickname = (accountNumber: string | undefined | null): string | null => {
    if (!accountNumber || accountNumber.length < 4) return null;
    const last4 = accountNumber.slice(-4);
    return vendorMap[last4]?.card_nickname || null;
  };

  return { vendorMap, isLoading, getCardVendor, getCardNickname };
}

// Utility function to clear cache (useful for testing)
export function clearCardVendorCache() {
  cachedVendors = null;
  fetchPromise = null;
}
