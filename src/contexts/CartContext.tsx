import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from './AuthContext';
import { CartItem, Product } from '../types';

const GUEST_CART_KEY = 'cartzy_guest_cart_v1';

export function getCartItemKey(item: Pick<CartItem, 'productId' | 'selectedSize' | 'selectedColor'>): string {
  return `${item.productId}::${item.selectedSize || ''}::${item.selectedColor || ''}`;
}

interface CartContextValue {
  items: CartItem[];
  wishlistIds: string[];
  totalCount: number;
  subtotal: number;
  mrpTotal: number;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  clearToast: () => void;
  addToCart: (
    product: Product,
    qty?: number,
    options?: {
      sellingPriceOverride?: number;
      maxStockOverride?: number;
      selectedSize?: string;
      selectedColor?: string;
    }
  ) => Promise<void>;
  updateQuantity: (
    productId: string,
    qty: number,
    selectedSize?: string,
    selectedColor?: string
  ) => Promise<void>;
  removeFromCart: (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => Promise<void>;
  syncValidatedItems: (validatedItems: CartItem[]) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleWishlist: (productId: string) => Promise<void>;
  isInWishlist: (productId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((cur) => (cur === msg ? null : cur)), 2800);
  };

  useEffect(() => {
    const localRaw = localStorage.getItem(GUEST_CART_KEY);
    let guestItems: CartItem[] = [];
    try {
      guestItems = localRaw ? JSON.parse(localRaw) : [];
    } catch {
      guestItems = [];
    }

    if (!user) {
      setItems(guestItems);
      setWishlistIds([]);
      return;
    }

    let cancelled = false;
    const cartRef = doc(db, 'carts', user.uid);
    const wishRef = doc(db, 'wishlists', user.uid);

    const mergeGuestCartIfNeeded = async () => {
      if (guestItems.length === 0) return;
      try {
        const cartSnap = await getDoc(cartRef);
        const cloudItems: CartItem[] = cartSnap.exists() ? cartSnap.data().items || [] : [];

        const mergedMap = new Map<string, CartItem>();
        [...cloudItems, ...guestItems].forEach((item) => {
          const key = getCartItemKey(item);
          const existing = mergedMap.get(key);
          if (existing) {
            mergedMap.set(key, {
              ...existing,
              quantity: Math.min(existing.maxStock, existing.quantity + item.quantity),
            });
          } else {
            mergedMap.set(key, item);
          }
        });

        const merged = Array.from(mergedMap.values());
        await setDoc(cartRef, {
          items: merged,
          updatedAt: new Date().toISOString(),
        });
        localStorage.removeItem(GUEST_CART_KEY);
      } catch (error) {
        console.error('Guest cart merge error:', error);
      }
    };

    mergeGuestCartIfNeeded();

    const unsubCart = onSnapshot(
      cartRef,
      (snap) => {
        if (cancelled) return;
        setItems(snap.exists() ? ((snap.data().items || []) as CartItem[]) : []);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `carts/${user.uid}`);
      }
    );

    const unsubWish = onSnapshot(
      wishRef,
      (snap) => {
        if (cancelled) return;
        setWishlistIds(snap.exists() ? ((snap.data().productIds || []) as string[]) : []);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `wishlists/${user.uid}`);
      }
    );

    return () => {
      cancelled = true;
      unsubCart();
      unsubWish();
    };
  }, [user]);

  const persistCart = async (next: CartItem[]) => {
    setItems(next);
    if (user) {
      try {
        await setDoc(doc(db, 'carts', user.uid), {
          items: next,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `carts/${user.uid}`);
      }
    } else {
      localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
    }
  };

  const addToCart = async (
    product: Product,
    qty = 1,
    options?: {
      sellingPriceOverride?: number;
      maxStockOverride?: number;
      selectedSize?: string;
      selectedColor?: string;
    }
  ) => {
    if (product.active === false || (product.approvalStatus && product.approvalStatus !== 'Approved')) {
      showToast('This product is currently unavailable.');
      throw new Error('Product is currently unavailable');
    }

    const effectiveMaxStock =
      typeof options?.maxStockOverride === 'number'
        ? Math.min(product.stock, options.maxStockOverride)
        : product.stock;
    const effectivePrice =
      typeof options?.sellingPriceOverride === 'number'
        ? options.sellingPriceOverride
        : product.sellingPrice;

    const chosenSize =
      options?.selectedSize ||
      (product.availableSizes && product.availableSizes.length > 0 ? product.availableSizes[0] : undefined);
    const chosenColor =
      options?.selectedColor ||
      (product.availableColors && product.availableColors.length > 0 ? product.availableColors[0] : undefined);

    if (effectiveMaxStock <= 0) {
      showToast('This product is currently out of stock.');
      throw new Error('Product is out of stock');
    }

    const targetKey = getCartItemKey({
      productId: product.id,
      selectedSize: chosenSize,
      selectedColor: chosenColor,
    });
    const existing = items.find((i) => getCartItemKey(i) === targetKey);
    if (existing) {
      if (existing.quantity >= effectiveMaxStock) {
        showToast(`Only ${effectiveMaxStock} unit(s) available in stock for ${product.name}.`);
        return;
      }
      const nextQty = Math.min(effectiveMaxStock, existing.quantity + qty);
      await persistCart(
        items.map((i) =>
          getCartItemKey(i) === targetKey
            ? {
                ...i,
                quantity: nextQty,
                maxStock: effectiveMaxStock,
                sellingPrice: effectivePrice,
                originalPrice: product.originalPrice,
              }
            : i
        )
      );
      showToast(`Updated ${product.name} quantity to ${nextQty}`);
    } else {
      const newItem: CartItem = {
        productId: product.id,
        name: product.name,
        image: product.images[0] || '',
        brand: product.brand,
        sellingPrice: effectivePrice,
        originalPrice: product.originalPrice,
        quantity: Math.min(effectiveMaxStock, Math.max(1, qty)),
        maxStock: effectiveMaxStock,
        taxRatePercent: product.taxRatePercent || 0,
        ...(chosenSize ? { selectedSize: chosenSize } : {}),
        ...(chosenColor ? { selectedColor: chosenColor } : {}),
        ...(product.sellerId ? { sellerId: product.sellerId } : {}),
        ...(product.sellerName ? { sellerName: product.sellerName } : {}),
      };
      await persistCart([...items, newItem]);
      showToast(`Added ${product.name} to your cart`);
    }
  };

  const updateQuantity = async (
    productId: string,
    qty: number,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    if (qty <= 0) {
      await removeFromCart(productId, selectedSize, selectedColor);
      return;
    }
    const targetKey = getCartItemKey({ productId, selectedSize, selectedColor });
    let hitMaxStock = 0;
    await persistCart(
      items.map((i) => {
        const matches =
          selectedSize !== undefined || selectedColor !== undefined
            ? getCartItemKey(i) === targetKey
            : i.productId === productId;
        if (!matches) return i;
        if (qty > i.maxStock) {
          hitMaxStock = i.maxStock;
        }
        return { ...i, quantity: Math.max(1, Math.min(i.maxStock, qty)) };
      })
    );
    if (hitMaxStock > 0) {
      showToast(`Maximum available stock is ${hitMaxStock} unit(s).`);
    }
  };

  const removeFromCart = async (
    productId: string,
    selectedSize?: string,
    selectedColor?: string
  ) => {
    const targetKey = getCartItemKey({ productId, selectedSize, selectedColor });
    await persistCart(
      items.filter((i) =>
        selectedSize !== undefined || selectedColor !== undefined
          ? getCartItemKey(i) !== targetKey
          : i.productId !== productId
      )
    );
    showToast('Item removed from cart');
  };

  const syncValidatedItems = async (validatedItems: CartItem[]) => {
    await persistCart(validatedItems);
  };

  const clearCart = async () => {
    await persistCart([]);
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      showToast('Sign in to save items to your wishlist.');
      throw new Error('Sign in required to use wishlist');
    }
    const exists = wishlistIds.includes(productId);
    const next = exists
      ? wishlistIds.filter((id) => id !== productId)
      : [...wishlistIds, productId];
    setWishlistIds(next);
    try {
      await setDoc(doc(db, 'wishlists', user.uid), {
        productIds: next,
        updatedAt: new Date().toISOString(),
      });
      showToast(exists ? 'Removed from wishlist' : 'Saved to wishlist');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `wishlists/${user.uid}`);
    }
  };

  const isInWishlist = (productId: string) => wishlistIds.includes(productId);

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.sellingPrice * i.quantity, 0);
  const mrpTotal = items.reduce((sum, i) => sum + i.originalPrice * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        wishlistIds,
        totalCount,
        subtotal,
        mrpTotal,
        toastMessage,
        showToast,
        clearToast: () => setToastMessage(null),
        addToCart,
        updateQuantity,
        removeFromCart,
        syncValidatedItems,
        clearCart,
        toggleWishlist,
        isInWishlist,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
};
