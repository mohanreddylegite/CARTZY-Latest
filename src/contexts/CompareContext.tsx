import React, { createContext, useContext, useEffect, useState } from 'react';
import { STARTER_PRODUCTS } from '../data/starterCatalog';
import { fetchActiveProducts } from '../services/storeService';
import { Product } from '../types';
import { useCart } from './CartContext';

const COMPARE_STORAGE_KEY = 'cartzy_compare_ids_v1';
export const MAX_COMPARE_PRODUCTS = 4;

interface CompareContextValue {
  compareProducts: Product[];
  addToCompare: (product: Product) => void;
  removeFromCompare: (productId: string) => void;
  toggleCompare: (product: Product) => void;
  clearCompare: () => void;
  isInCompare: (productId: string) => boolean;
}

const CompareContext = createContext<CompareContextValue | null>(null);

export const CompareProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useCart();
  const [compareProducts, setCompareProducts] = useState<Product[]>(() => {
    try {
      const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
      if (!raw) return [];
      const ids: string[] = JSON.parse(raw);
      if (!Array.isArray(ids)) return [];
      return ids
        .slice(0, MAX_COMPARE_PRODUCTS)
        .map((id) => STARTER_PRODUCTS.find((p) => p.id === id))
        .filter((p): p is Product => Boolean(p));
    } catch {
      return [];
    }
  });

  useEffect(() => {
    let mounted = true;
    let storedIds: string[] = [];
    try {
      const raw = localStorage.getItem(COMPARE_STORAGE_KEY);
      storedIds = raw ? JSON.parse(raw) : [];
    } catch {
      storedIds = [];
    }
    if (!Array.isArray(storedIds) || storedIds.length === 0) return;

    fetchActiveProducts(80)
      .then((prods) => {
        if (!mounted || prods.length === 0) return;
        const byId = new Map(prods.map((p) => [p.id, p]));
        const hydrated = storedIds
          .slice(0, MAX_COMPARE_PRODUCTS)
          .map((id) => byId.get(id))
          .filter((p): p is Product => Boolean(p));
        if (hydrated.length > 0) {
          setCompareProducts(hydrated);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const persistIds = (list: Product[]) => {
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(list.map((p) => p.id)));
    } catch {
      // ignore storage quota errors
    }
  };

  const addToCompare = (product: Product) => {
    if (compareProducts.some((p) => p.id === product.id)) {
      return;
    }
    if (compareProducts.length >= MAX_COMPARE_PRODUCTS) {
      showToast(`Compare tray is full (max ${MAX_COMPARE_PRODUCTS} products). Remove one first.`);
      return;
    }
    const next = [...compareProducts, product];
    setCompareProducts(next);
    persistIds(next);
    showToast(`Added ${product.name} to comparison (${next.length}/${MAX_COMPARE_PRODUCTS})`);
  };

  const removeFromCompare = (productId: string) => {
    const next = compareProducts.filter((p) => p.id !== productId);
    setCompareProducts(next);
    persistIds(next);
  };

  const toggleCompare = (product: Product) => {
    if (compareProducts.some((p) => p.id === product.id)) {
      removeFromCompare(product.id);
      showToast(`Removed ${product.name} from comparison`);
    } else {
      addToCompare(product);
    }
  };

  const clearCompare = () => {
    setCompareProducts([]);
    persistIds([]);
  };

  const isInCompare = (productId: string) => compareProducts.some((p) => p.id === productId);

  return (
    <CompareContext.Provider
      value={{
        compareProducts,
        addToCompare,
        removeFromCompare,
        toggleCompare,
        clearCompare,
        isInCompare,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
};

export const useCompare = () => {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error('useCompare must be used inside CompareProvider');
  return ctx;
};
