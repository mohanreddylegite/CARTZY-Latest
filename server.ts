import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import nodemailer from 'nodemailer';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  STARTER_COUPONS,
  STARTER_FLASH_SALES,
  STARTER_PRODUCTS,
} from './src/data/starterCatalog.ts';
import { BUSINESS_CONFIG } from './src/config/businessConfig.ts';
import { DEFAULT_PUBLIC_SHOPS } from './src/data/vijayawadaDefaults.ts';
import {
  evaluateLocationServiceability,
  isProductDeliverableToArea,
  type ServiceabilityDataset,
} from './src/services/serviceabilityService.ts';
import type { Product } from './src/types/index.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf-8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const firebaseConfig = loadFirebaseConfig();
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';

const BUSINESS_RULES = {
  FREE_STANDARD_SHIPPING_THRESHOLD: BUSINESS_CONFIG.freeShippingThreshold,
  STANDARD_SHIPPING_FEE: BUSINESS_CONFIG.standardShippingFee,
  EXPRESS_SHIPPING_FEE: BUSINESS_CONFIG.expressShippingFee,
  EXPRESS_ELIGIBLE_PIN_PREFIXES: BUSINESS_CONFIG.expressMetroPrefixes,
  MAX_COD_AMOUNT: BUSINESS_CONFIG.maxCodAmount,
  STANDARD_ESTIMATE_LABEL: 'Same-day Vijayawada delivery (30–55 mins)',
  EXPRESS_ESTIMATE_LABEL: 'Priority Vijayawada Express (20–35 mins)',
};

function sanitizeString(val: unknown, maxLen = 200): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[<>]/g, '').trim().slice(0, maxLen);
}

function isValidIndianMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile.trim());
}

function isValidIndianPincode(pincode: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pincode.trim());
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Parse Firestore REST API typed field values into plain JS values
function decodeFirestoreValue(v: any): any {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return Boolean(v.booleanValue);
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) {
    return (v.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if ('mapValue' in v) {
    const out: Record<string, any> = {};
    const fields = v.mapValue.fields || {};
    for (const key of Object.keys(fields)) {
      out[key] = decodeFirestoreValue(fields[key]);
    }
    return out;
  }
  return null;
}

function decodeFirestoreDoc(doc: any): Record<string, any> | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, any> = {};
  for (const key of Object.keys(doc.fields)) {
    out[key] = decodeFirestoreValue(doc.fields[key]);
  }
  const parts = String(doc.name || '').split('/');
  out.id = parts[parts.length - 1];
  return out;
}

async function fetchFirestoreDocument(collectionPath: string, docId: string, bearerToken?: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${DATABASE_ID}/documents/${collectionPath}/${encodeURIComponent(docId)}`;
  const headers: Record<string, string> = {};
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    return null;
  }
  const json = await res.json();
  return decodeFirestoreDoc(json);
}

async function queryCouponByCode(code: string, bearerToken?: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${DATABASE_ID}/documents:runQuery`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'coupons' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'code' },
            op: 'EQUAL',
            value: { stringValue: code.toUpperCase() },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as any[];
  const first = rows.find((r) => r.document);
  return first ? decodeFirestoreDoc(first.document) : null;
}

async function listFirestoreCollection(
  collectionPath: string,
  pageSize = 200,
  bearerToken?: string
): Promise<Array<Record<string, any>>> {
  try {
    const out: Array<Record<string, any>> = [];
    let pageToken = '';
    for (let page = 0; page < 5; page += 1) {
      const qs = new URLSearchParams({ pageSize: String(pageSize) });
      if (pageToken) qs.set('pageToken', pageToken);
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${DATABASE_ID}/documents/${collectionPath}?${qs.toString()}`;
      const headers: Record<string, string> = {};
      if (bearerToken) {
        headers['Authorization'] = `Bearer ${bearerToken}`;
      }
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const json = (await res.json()) as { documents?: any[]; nextPageToken?: string };
      for (const doc of json.documents || []) {
        const decoded = decodeFirestoreDoc(doc);
        if (decoded) out.push(decoded);
      }
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    return out;
  } catch {
    return [];
  }
}

async function verifyFirebaseUserUid(bearerToken?: string): Promise<string | null> {
  if (!bearerToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: bearerToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { users?: Array<{ localId?: string }> };
    return data.users?.[0]?.localId || null;
  } catch {
    return null;
  }
}

async function fetchUserOrdersFromFirestore(
  uid: string,
  bearerToken: string
): Promise<Array<Record<string, any>>> {
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${DATABASE_ID}/documents:runQuery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'userId' },
              op: 'EQUAL',
              value: { stringValue: uid },
            },
          },
          limit: 20,
        },
      }),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as any[];
    return rows
      .filter((r) => r.document)
      .map((r) => decodeFirestoreDoc(r.document))
      .filter((d): d is Record<string, any> => Boolean(d));
  } catch {
    return [];
  }
}

async function queryUserOrderByField(
  uid: string,
  fieldPath: 'idempotencyKey' | 'razorpayPaymentId' | 'razorpayOrderId',
  value: string,
  bearerToken?: string
): Promise<Record<string, any> | null> {
  if (!uid || !value || !bearerToken) return null;
  try {
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${DATABASE_ID}/documents:runQuery`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: 'userId' },
                    op: 'EQUAL',
                    value: { stringValue: uid },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath },
                    op: 'EQUAL',
                    value: { stringValue: value },
                  },
                },
              ],
            },
          },
          limit: 1,
        },
      }),
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as any[];
    const first = rows.find((r) => r.document);
    return first ? decodeFirestoreDoc(first.document) : null;
  } catch {
    return null;
  }
}

async function getAuthoritativeCatalogAndFlashSales(bearerToken?: string) {
  const [cloudProducts, cloudSales, cloudShops] = await Promise.all([
    listFirestoreCollection('products', 120, bearerToken),
    listFirestoreCollection('flashSales', 50, bearerToken),
    listFirestoreCollection('publicShops', 100, bearerToken),
  ]);

  const effectiveShops: Array<Record<string, any>> =
    cloudShops.length > 0 ? cloudShops : (DEFAULT_PUBLIC_SHOPS as Array<Record<string, any>>);
  const shopById = new Map<string, Record<string, any>>();
  for (const s of effectiveShops) {
    const sid = s.shopId || s.id;
    if (sid) shopById.set(String(sid), s);
  }

  const rawProducts = cloudProducts.length > 0 ? cloudProducts : STARTER_PRODUCTS;
  const products = rawProducts.filter((p) => {
    if (p.active === false) return false;
    if (p.approvalStatus && p.approvalStatus !== 'Approved') return false;
    if (Number(p.stock || 0) <= 0) return false;
    if (p.sellerId) {
      const shop = shopById.get(String(p.sellerId));
      if (shop && shop.approvalStatus !== 'Approved') return false;
    }
    return true;
  });

  const rawSales = cloudSales.length > 0 ? cloudSales : cloudProducts.length > 0 ? [] : STARTER_FLASH_SALES;
  const nowMs = Date.now();
  const activeFlashSales = rawSales.filter((s) => {
    if (!s.active) return false;
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end;
  });

  return { products, activeFlashSales };
}

async function getAuthoritativeServiceabilityDataset(
  bearerToken?: string
): Promise<ServiceabilityDataset> {
  const [cities, zones, wards, publicShops, publicDrivers] = await Promise.all([
    listFirestoreCollection('serviceCities', 50, bearerToken),
    listFirestoreCollection('serviceZones', 100, bearerToken),
    listFirestoreCollection('serviceWards', 120, bearerToken),
    listFirestoreCollection('publicShops', 100, bearerToken),
    listFirestoreCollection('publicDrivers', 100, bearerToken),
  ]);
  return {
    cities: cities as any,
    zones: zones as any,
    wards: wards as any,
    publicShops: publicShops as any,
    publicDrivers: publicDrivers as any,
  };
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return {
    client: new Razorpay({ key_id: keyId, key_secret: keySecret }),
    keyId,
    keySecret,
  };
}

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function computeAuthoritativeCheckout(body: any, bearerToken?: string) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const uid = await verifyFirebaseUserUid(bearerToken);
  if (uid) {
    const userDoc = await fetchFirestoreDocument('users', uid, bearerToken);
    if (userDoc?.suspended === true) {
      throw new Error('Your CARTZY account is suspended. Please contact support@cartzy.in.');
    }
  }

  const [cloudSales, storeSettingsDoc, serviceDataset, anyProductsList] = await Promise.all([
    listFirestoreCollection('flashSales', 50, bearerToken),
    fetchFirestoreDocument('settings', 'store', bearerToken),
    getAuthoritativeServiceabilityDataset(bearerToken),
    listFirestoreCollection('products', 1, bearerToken),
  ]);
  const catalogInitialized = anyProductsList.length > 0;
  const salesPool = cloudSales.length > 0 ? cloudSales : catalogInitialized ? [] : STARTER_FLASH_SALES;
  const nowMs = Date.now();

  let mrpTotal = 0;
  let subtotal = 0;
  let taxAmount = 0;
  const verifiedItems: any[] = [];
  const verifiedProductRecords: Product[] = [];

  for (const item of items) {
    const productId = sanitizeString(item?.productId, 128);
    const quantity = Math.floor(Number(item?.quantity));
    const selectedSize = sanitizeString(item?.selectedSize, 40);
    const selectedColor = sanitizeString(item?.selectedColor, 40);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0 || quantity > 50) {
      throw new Error('Invalid product or quantity in cart.');
    }
    const cloudProd = await fetchFirestoreDocument('products', productId, bearerToken);
    const product =
      cloudProd ||
      (!catalogInitialized
        ? (STARTER_PRODUCTS.find((p) => p.id === productId) as Record<string, any> | undefined)
        : undefined) ||
      null;
    if (!product) {
      throw new Error(`Product ${productId} could not be verified in catalog.`);
    }
    if (!product.active) {
      throw new Error(`${product.name} is currently unavailable.`);
    }
    if (product.approvalStatus && product.approvalStatus !== 'Approved') {
      throw new Error(`${product.name} is pending seller approval and unavailable for purchase.`);
    }
    if (Number(product.stock) < quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    }

    const activeSale = salesPool.find((s) => {
      if (!s.active || s.productId !== product.id) return false;
      const start = new Date(s.startDate).getTime();
      const end = new Date(s.endDate).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end;
    });

    const unitOriginalPrice = Number(product.originalPrice);
    let unitSellingPrice = Number(product.sellingPrice);
    if (activeSale) {
      const remainingSaleUnits = Math.max(0, Number(activeSale.saleStock) - Number(activeSale.soldCount || 0));
      if (remainingSaleUnits >= quantity && Number(activeSale.salePrice) < unitSellingPrice) {
        unitSellingPrice = Number(activeSale.salePrice);
      }
    }
    const lineMrp = unitOriginalPrice * quantity;
    const lineTotal = unitSellingPrice * quantity;
    const taxRate = Number(product.taxRatePercent || 0);
    const lineTax = Math.round((lineTotal * taxRate) / (100 + taxRate));

    mrpTotal += lineMrp;
    subtotal += lineTotal;
    taxAmount += lineTax;

    verifiedProductRecords.push(product as Product);
    verifiedItems.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      image: Array.isArray(product.images) && product.images[0] ? product.images[0] : '',
      unitOriginalPrice,
      unitSellingPrice,
      quantity,
      lineTotal,
      taxAmount: lineTax,
      ...(selectedSize ? { selectedSize } : {}),
      ...(selectedColor ? { selectedColor } : {}),
      ...(product.sellerId ? { sellerId: String(product.sellerId) } : {}),
      ...(product.sellerName ? { sellerName: String(product.sellerName) } : {}),
    });
  }

  // City-wide Vijayawada serviceability & live operational readiness verification
  const addr = body?.deliveryAddress || {};
  const serviceability = evaluateLocationServiceability({
    location: {
      city: sanitizeString(addr.city, 80),
      state: sanitizeString(addr.state, 80),
      locality: sanitizeString(addr.locality, 120),
      formattedAddress: sanitizeString(addr.formattedAddress, 240),
      pincode: String(addr.pincode || '').trim(),
      lat: typeof addr.lat === 'number' && Number.isFinite(addr.lat) ? addr.lat : undefined,
      lng: typeof addr.lng === 'number' && Number.isFinite(addr.lng) ? addr.lng : undefined,
    },
    dataset: serviceDataset,
    subtotal,
  });

  if (!serviceability.deliverable) {
    throw new Error(serviceability.message);
  }

  const effectiveShops =
    serviceDataset.publicShops && serviceDataset.publicShops.length > 0
      ? serviceDataset.publicShops
      : DEFAULT_PUBLIC_SHOPS;
  for (const prodRecord of verifiedProductRecords) {
    const prodCheck = isProductDeliverableToArea({
      product: prodRecord,
      serviceability,
      publicShops: effectiveShops,
    });
    if (!prodCheck.deliverable) {
      throw new Error(`${prodRecord.name}: ${prodCheck.reason || 'Unavailable for this delivery area.'}`);
    }
  }

  let couponDiscount = 0;
  let couponCode: string | undefined;
  let couponId: string | undefined;
  const cleanCode = sanitizeString(body?.couponCode || '', 30).toUpperCase();

  if (cleanCode) {
    const coupon =
      (await queryCouponByCode(cleanCode, bearerToken)) ||
      (STARTER_COUPONS.find((c) => c.code === cleanCode) as Record<string, any> | undefined) ||
      null;
    if (!coupon) throw new Error('Coupon code not found.');
    if (!coupon.active) throw new Error('This coupon is inactive.');
    if (new Date(coupon.expiryDate).getTime() < Date.now()) {
      throw new Error('This coupon has expired.');
    }
    if (Number(coupon.usedCount) >= Number(coupon.usageLimit)) {
      throw new Error('This coupon has reached its usage limit.');
    }
    if (subtotal < Number(coupon.minOrderAmount)) {
      throw new Error(`Minimum order of ₹${coupon.minOrderAmount} required for ${cleanCode}.`);
    }
    couponDiscount =
      coupon.type === 'PERCENT'
        ? Math.min(Math.round((subtotal * Number(coupon.value)) / 100), Number(coupon.maxDiscount))
        : Math.min(Number(coupon.value), subtotal);
    couponCode = cleanCode;
    couponId = coupon.id;
  }

  const pincode = String(body?.deliveryAddress?.pincode || '').trim();
  const deliveryOption = body?.deliveryOption === 'EXPRESS' ? 'EXPRESS' : 'STANDARD';
  let deliveryCharge = serviceability.deliveryCharge;
  let estimatedDeliveryText =
    serviceability.estimatedDeliveryText || BUSINESS_RULES.STANDARD_ESTIMATE_LABEL;

  if (deliveryOption === 'EXPRESS') {
    const prefix = pincode.slice(0, 2);
    if (!BUSINESS_RULES.EXPRESS_ELIGIBLE_PIN_PREFIXES.includes(prefix)) {
      throw new Error('Express delivery is not available for the selected PIN code.');
    }
    deliveryCharge = Math.max(serviceability.deliveryCharge, BUSINESS_RULES.EXPRESS_SHIPPING_FEE);
    estimatedDeliveryText = BUSINESS_RULES.EXPRESS_ESTIMATE_LABEL;
  }

  let rewardsRedeemed = 0;
  let rewardsDiscount = 0;
  const requestedPoints = Math.max(0, Math.floor(Number(body?.pointsToRedeem || 0)));
  if (requestedPoints > 0) {
    if (!uid) {
      throw new Error('Please sign in to redeem CARTZY Rewards points.');
    }
    const rewardDoc = await fetchFirestoreDocument('rewards', uid, bearerToken);
    const availablePoints = Math.max(0, Number(rewardDoc?.pointsBalance || 0));
    if (requestedPoints > availablePoints) {
      throw new Error(`Insufficient reward points. Available balance: ${availablePoints}.`);
    }
    const rupeePerPoint = Math.max(0.5, Number(storeSettingsDoc?.rupeePerPoint || 1));
    const maxRedeemPercent = Math.min(50, Math.max(0, Number(storeSettingsDoc?.maxRedeemPercent ?? 20)));
    const netAfterCoupon = Math.max(0, subtotal - couponDiscount);
    const maxAllowedDiscount = Math.floor((netAfterCoupon * maxRedeemPercent) / 100);
    const maxRedeemablePoints = Math.floor(maxAllowedDiscount / rupeePerPoint);
    rewardsRedeemed = Math.min(requestedPoints, maxRedeemablePoints);
    rewardsDiscount = Math.round(rewardsRedeemed * rupeePerPoint);
    if (body?.paymentMethod && body.paymentMethod !== 'COD') {
      const minLeft = subtotal - couponDiscount - rewardsDiscount + deliveryCharge;
      if (minLeft < 1 && rewardsRedeemed > 0) {
        const trimPts = Math.ceil((1 - minLeft) / rupeePerPoint);
        rewardsRedeemed = Math.max(0, rewardsRedeemed - trimPts);
        rewardsDiscount = Math.round(rewardsRedeemed * rupeePerPoint);
      }
    }
  }

  const finalAmount = Math.max(0, subtotal - couponDiscount - rewardsDiscount + deliveryCharge);

  return {
    verifiedItems,
    couponId,
    estimatedDeliveryText,
    serviceAreaMeta: {
      cityId: serviceability.matchedCityId || BUSINESS_CONFIG.launchCityId,
      cityName: serviceability.matchedCityName || BUSINESS_CONFIG.launchCity,
      zoneId: serviceability.matchedZoneId || 'vja-north',
      zoneName: serviceability.matchedZoneName || 'North Zone — Bhavanipuram & Corridor',
      ...(typeof serviceability.matchedWardNumber === 'number'
        ? { wardNumber: serviceability.matchedWardNumber }
        : {}),
      withinBoundary: serviceability.withinBoundary,
      servicedByShopIds: serviceability.availableShopIds,
    },
    pricing: {
      mrpTotal,
      subtotal,
      productSavings: Math.max(0, mrpTotal - subtotal),
      couponCode: couponCode || null,
      couponDiscount,
      rewardsRedeemed,
      rewardsDiscount,
      deliveryCharge,
      taxAmount,
      finalAmount,
    },
  };
}

const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_SEND_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_SENDS_PER_PHONE = 5;
const OTP_MAX_SENDS_PER_IP = 12;
const OTP_MAX_VERIFY_FAILURES = 5;
const OTP_VERIFY_LOCK_MS = 120 * 1000;

interface OtpPhoneSendRecord {
  lastSentAt: number;
  timestamps: number[];
}

interface OtpVerifyRecord {
  failures: number[];
  lockedUntil: number;
}

const otpSendByPhone = new Map<string, OtpPhoneSendRecord>();
const otpSendByIp = new Map<string, number[]>();
const otpVerifyByKey = new Map<string, OtpVerifyRecord>();

function getClientIp(req: express.Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd[0]) {
    return String(fwd[0]).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function pruneRecent(timestamps: number[], now: number): number[] {
  return timestamps.filter((ts) => now - ts < OTP_WINDOW_MS);
}

const ALLOWED_PAYMENT_METHODS = new Set(['COD', 'UPI', 'CARD', 'NETBANKING', 'WALLET']);
const ALLOWED_ONLINE_METHODS = new Set(['UPI', 'CARD', 'NETBANKING', 'WALLET']);

interface RazorpayPaymentSession {
  razorpayOrderId: string;
  uid: string;
  idempotencyKey: string;
  paymentMethod: string;
  amountPaise: number;
  currency: 'INR';
  status: 'created' | 'verified' | 'captured' | 'failed' | 'refunded';
  razorpayPaymentId?: string;
  orderId?: string;
  orderNumber?: string;
  createdAt: string;
  updatedAt: string;
}

const paymentSessions = new Map<string, RazorpayPaymentSession>();
const verifiedPaymentIds = new Map<
  string,
  { uid: string; razorpayOrderId: string; verifiedAt: string }
>();
const completedOrdersByIdempotency = new Map<
  string,
  { orderId: string; orderNumber: string; razorpayPaymentId?: string }
>();

async function startServer() {
  const app = express();

  // Raw body capture for Razorpay webhook signature verification
  app.post(
    '/api/payments/razorpay/webhook',
    express.raw({ type: 'application/json' }),
    (req, res) => {
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) {
        res.status(503).json({
          error: 'RAZORPAY_WEBHOOK_SECRET is not configured on the server.',
        });
        return;
      }
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Raw JSON webhook payload is required.' });
        return;
      }
      const signature = String(req.headers['x-razorpay-signature'] || '');
      const expected = crypto
        .createHmac('sha256', secret)
        .update(req.body)
        .digest('hex');

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        res.status(400).json({ error: 'Invalid webhook signature.' });
        return;
      }

      try {
        const payload = JSON.parse(req.body.toString('utf-8'));
        const event = String(payload?.event || 'verified');
        const paymentEntity = payload?.payload?.payment?.entity;
        const refundEntity = payload?.payload?.refund?.entity;
        const rzpOrderId = paymentEntity?.order_id;
        const now = new Date().toISOString();

        if (rzpOrderId && paymentSessions.has(rzpOrderId)) {
          const session = paymentSessions.get(rzpOrderId)!;
          if (event === 'payment.captured' || event === 'order.paid') {
            session.status = 'captured';
            if (paymentEntity?.id) session.razorpayPaymentId = String(paymentEntity.id);
          } else if (event === 'payment.failed') {
            session.status = 'failed';
            if (paymentEntity?.id) session.razorpayPaymentId = String(paymentEntity.id);
          } else if (event === 'refund.processed') {
            session.status = 'refunded';
          }
          session.updatedAt = now;
        }

        res.status(200).json({
          received: true,
          event,
          razorpayOrderId: rzpOrderId || null,
          razorpayPaymentId: paymentEntity?.id || refundEntity?.payment_id || null,
        });
      } catch {
        res.status(400).json({ error: 'Malformed JSON webhook body.' });
      }
    }
  );

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'CARTZY API' });
  });

  app.get('/api/config/status', (_req, res) => {
    const rzp = getRazorpayClient();
    const smtp = getSmtpTransporter();
    // Never expose server-only GOOGLE_MAPS_SERVER_KEY or GOOGLE_MAPS_API_KEY in public config;
    // only expose HTTP-referrer-restricted browser key if configured.
    const browserMapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || null;
    res.json({
      razorpayConfigured: Boolean(rzp),
      razorpayKeyId: rzp ? rzp.keyId : null,
      razorpayMode: rzp ? (rzp.keyId.startsWith('rzp_test_') ? 'test' : 'live') : null,
      smtpConfigured: Boolean(smtp),
      googleMapsConfigured: Boolean(browserMapsKey),
      googleMapsApiKey: browserMapsKey,
      geminiConfigured: Boolean(getGeminiClient()),
      launchCity: BUSINESS_CONFIG.launchCity,
      launchState: BUSINESS_CONFIG.launchState,
      operationsHub: BUSINESS_CONFIG.operationsHub,
      expressMetroPrefixes: BUSINESS_RULES.EXPRESS_ELIGIBLE_PIN_PREFIXES,
      freeShippingThreshold: BUSINESS_RULES.FREE_STANDARD_SHIPPING_THRESHOLD,
      maxCodAmount: BUSINESS_RULES.MAX_COD_AMOUNT,
    });
  });

  app.post('/api/serviceability/check', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const loc = req.body?.location || req.body || {};
      const subtotalRaw = Number(req.body?.subtotal);
      const dataset = await getAuthoritativeServiceabilityDataset(token);
      const result = evaluateLocationServiceability({
        location: {
          city: sanitizeString(loc.city, 80),
          state: sanitizeString(loc.state, 80),
          locality: sanitizeString(loc.locality, 120),
          formattedAddress: sanitizeString(loc.formattedAddress, 240),
          pincode: String(loc.pincode || '').trim(),
          lat: typeof loc.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : undefined,
          lng: typeof loc.lng === 'number' && Number.isFinite(loc.lng) ? loc.lng : undefined,
          zoneId: sanitizeString(loc.zoneId, 64) || undefined,
          wardNumber:
            typeof loc.wardNumber === 'number' && Number.isFinite(loc.wardNumber)
              ? loc.wardNumber
              : undefined,
        },
        dataset,
        subtotal: Number.isFinite(subtotalRaw) ? subtotalRaw : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to verify serviceability.' });
    }
  });

  app.post('/api/cart/revalidate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const rawItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
      const loc = req.body?.location || {};

      const locationInput = {
        city: sanitizeString(loc.city || BUSINESS_CONFIG.launchCity, 80),
        state: sanitizeString(loc.state || BUSINESS_CONFIG.launchState, 80),
        locality: sanitizeString(loc.locality || BUSINESS_CONFIG.operationsHub.locality, 120),
        formattedAddress: sanitizeString(loc.formattedAddress, 240),
        pincode: String(loc.pincode || BUSINESS_CONFIG.operationsHub.pincode).trim(),
        lat: typeof loc.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : undefined,
        lng: typeof loc.lng === 'number' && Number.isFinite(loc.lng) ? loc.lng : undefined,
        zoneId: sanitizeString(loc.zoneId, 64) || undefined,
        wardNumber:
          typeof loc.wardNumber === 'number' && Number.isFinite(loc.wardNumber)
            ? loc.wardNumber
            : undefined,
      };

      const [cloudSales, serviceDataset, anyProductsList] = await Promise.all([
        listFirestoreCollection('flashSales', 50, token),
        getAuthoritativeServiceabilityDataset(token),
        listFirestoreCollection('products', 1, token),
      ]);

      const catalogInitialized = anyProductsList.length > 0;
      const salesPool = cloudSales.length > 0 ? cloudSales : catalogInitialized ? [] : STARTER_FLASH_SALES;
      const effectiveShops =
        serviceDataset.publicShops && serviceDataset.publicShops.length > 0
          ? serviceDataset.publicShops
          : DEFAULT_PUBLIC_SHOPS;

      const baseServiceability = evaluateLocationServiceability({
        location: locationInput,
        dataset: serviceDataset,
        subtotal: 0,
      });

      const uniqueProdIds = Array.from(
        new Set(
          rawItems
            .map((it: any) => sanitizeString(it?.productId, 128))
            .filter(Boolean)
        )
      ) as string[];

      const fetchedMap = new Map<string, Record<string, any> | null>();
      await Promise.all(
        uniqueProdIds.map(async (pid) => {
          const cloudProd = await fetchFirestoreDocument('products', pid, token);
          if (cloudProd) {
            fetchedMap.set(pid, cloudProd);
          } else if (!catalogInitialized) {
            fetchedMap.set(pid, (STARTER_PRODUCTS.find((p) => p.id === pid) as any) || null);
          } else {
            fetchedMap.set(pid, null);
          }
        })
      );

      const nowMs = Date.now();
      const validatedItems: any[] = [];
      let mrpTotal = 0;
      let subtotal = 0;
      let hasUnavailableItems = false;
      let hasStockAdjustments = false;
      let hasPriceChanges = false;

      for (const raw of rawItems) {
        const productId = sanitizeString(raw?.productId, 128);
        if (!productId) continue;
        const requestedQty = Math.max(1, Math.min(50, Math.floor(Number(raw?.quantity) || 1)));
        const selectedSize = sanitizeString(raw?.selectedSize, 40) || undefined;
        const selectedColor = sanitizeString(raw?.selectedColor, 40) || undefined;

        const product = fetchedMap.get(productId);
        if (!product) {
          hasUnavailableItems = true;
          validatedItems.push({
            productId,
            name: sanitizeString(raw?.name, 180) || 'Unavailable Product',
            image: sanitizeString(raw?.image, 500),
            brand: sanitizeString(raw?.brand, 80) || 'CARTZY',
            sellingPrice: Number(raw?.sellingPrice || 0),
            originalPrice: Number(raw?.originalPrice || 0),
            quantity: requestedQty,
            requestedQuantity: requestedQty,
            maxStock: 0,
            taxRatePercent: Number(raw?.taxRatePercent || 0),
            ...(selectedSize ? { selectedSize } : {}),
            ...(selectedColor ? { selectedColor } : {}),
            available: false,
            deliverableToArea: false,
            unavailableReason: 'This product is no longer available in the catalog.',
            stockAdjusted: false,
            priceChanged: false,
            isFlashDeal: false,
          });
          continue;
        }

        const areaCheck = isProductDeliverableToArea({
          product: product as Product,
          serviceability: baseServiceability,
          publicShops: effectiveShops,
        });

        const isActive = product.active !== false;
        const isApproved = !product.approvalStatus || product.approvalStatus === 'Approved';
        const liveStock = Math.max(0, Number(product.stock || 0));

        const activeSale = salesPool.find((s) => {
          if (!s.active || s.productId !== product.id) return false;
          const start = new Date(s.startDate).getTime();
          const end = new Date(s.endDate).getTime();
          return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs <= end;
        });

        let unitSellingPrice = Number(product.sellingPrice || 0);
        const unitOriginalPrice = Number(product.originalPrice || unitSellingPrice);
        let maxStock = liveStock;
        let isFlashDeal = false;

        if (activeSale) {
          const remainingFlash = Math.max(0, Number(activeSale.saleStock) - Number(activeSale.soldCount || 0));
          if (remainingFlash > 0 && Number(activeSale.salePrice) < unitSellingPrice) {
            unitSellingPrice = Number(activeSale.salePrice);
            maxStock = Math.min(liveStock, remainingFlash);
            isFlashDeal = true;
          }
        }

        let unavailableReason: string | undefined;
        if (!isActive) unavailableReason = 'Product is currently hidden or discontinued by seller.';
        else if (!isApproved) unavailableReason = 'Product listing is pending marketplace approval.';
        else if (liveStock <= 0) unavailableReason = 'Currently out of stock.';
        else if (!areaCheck.deliverable) {
          unavailableReason = areaCheck.reason || baseServiceability.message;
        }

        const available = Boolean(isActive && isApproved && liveStock > 0 && areaCheck.deliverable);
        const validatedQuantity = available ? Math.max(1, Math.min(requestedQty, maxStock)) : requestedQty;
        const stockAdjusted = available && validatedQuantity < requestedQty;
        const priceChanged =
          Math.round(Number(raw?.sellingPrice || 0)) !== Math.round(unitSellingPrice);

        if (!available) hasUnavailableItems = true;
        if (stockAdjusted) hasStockAdjustments = true;
        if (priceChanged) hasPriceChanges = true;

        if (available) {
          mrpTotal += unitOriginalPrice * validatedQuantity;
          subtotal += unitSellingPrice * validatedQuantity;
        }

        validatedItems.push({
          productId: product.id,
          name: String(product.name || ''),
          image: Array.isArray(product.images) && product.images[0] ? String(product.images[0]) : '',
          brand: String(product.brand || ''),
          sellingPrice: unitSellingPrice,
          originalPrice: unitOriginalPrice,
          quantity: validatedQuantity,
          requestedQuantity: requestedQty,
          maxStock,
          taxRatePercent: Number(product.taxRatePercent || 0),
          ...(selectedSize ? { selectedSize } : {}),
          ...(selectedColor ? { selectedColor } : {}),
          ...(product.sellerId ? { sellerId: String(product.sellerId) } : {}),
          ...(product.sellerName ? { sellerName: String(product.sellerName) } : {}),
          available,
          deliverableToArea: areaCheck.deliverable,
          ...(unavailableReason ? { unavailableReason } : {}),
          stockAdjusted,
          priceChanged,
          isFlashDeal,
          categoryName: product.categoryName ? String(product.categoryName) : undefined,
          shopName: areaCheck.shop?.shopName,
        });
      }

      const finalServiceability = evaluateLocationServiceability({
        location: locationInput,
        dataset: serviceDataset,
        subtotal,
      });

      const deliveryCharge = subtotal > 0 ? finalServiceability.deliveryCharge : 0;

      res.json({
        checkedAt: new Date().toISOString(),
        allItemsValid: !hasUnavailableItems && !hasStockAdjustments && validatedItems.length > 0,
        hasUnavailableItems,
        hasStockAdjustments,
        hasPriceChanges,
        areaDeliverable: finalServiceability.deliverable,
        areaMessage: finalServiceability.message,
        matchedZoneName: finalServiceability.matchedZoneName,
        items: validatedItems,
        pricing: {
          mrpTotal,
          subtotal,
          productSavings: Math.max(0, mrpTotal - subtotal),
          deliveryCharge,
          freeDeliveryThreshold: finalServiceability.freeDeliveryThreshold,
          estimatedTotal: subtotal + deliveryCharge,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to revalidate cart.' });
    }
  });

  app.get('/api/auth/phone-config-check', async (req, res) => {
    try {
      const requestedHost = sanitizeString(
        typeof req.query.hostname === 'string' ? req.query.hostname : req.hostname,
        200
      ).toLowerCase();
      const [cfgRes, recaptchaRes, phoneProbeRes] = await Promise.all([
        fetch(
          `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(firebaseConfig.apiKey)}`
        ),
        fetch(
          `https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${encodeURIComponent(firebaseConfig.apiKey)}`
        ).catch(() => null),
        fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phoneNumber: '+919876543210',
              recaptchaToken: 'config-probe',
            }),
          }
        ).catch(() => null),
      ]);
      if (!cfgRes.ok) {
        res.status(502).json({
          ok: false,
          error: 'Unable to fetch Firebase project config.',
        });
        return;
      }
      const cfg = (await cfgRes.json()) as {
        projectId?: string;
        authorizedDomains?: string[];
      };
      const authorizedDomains = Array.isArray(cfg.authorizedDomains) ? cfg.authorizedDomains : [];
      const isHostAuthorized =
        !requestedHost ||
        authorizedDomains.some((d) => d.toLowerCase() === requestedHost);

      let recaptchaConfigured = false;
      if (recaptchaRes?.ok) {
        const recData = (await recaptchaRes.json().catch(() => ({}))) as {
          recaptchaSiteKey?: string;
        };
        recaptchaConfigured = Boolean(recData.recaptchaSiteKey);
      }

      let phoneProviderEnabled = false;
      let phoneProviderStatus:
        | 'enabled'
        | 'operation_not_allowed'
        | 'billing_not_enabled'
        | 'unknown' = 'unknown';

      if (phoneProbeRes) {
        const probeJson = (await phoneProbeRes.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        const msg = String(probeJson?.error?.message || '').toUpperCase();
        if (msg.includes('OPERATION_NOT_ALLOWED')) {
          phoneProviderEnabled = false;
          phoneProviderStatus = 'operation_not_allowed';
        } else if (msg.includes('BILLING_NOT_ENABLED')) {
          phoneProviderEnabled = false;
          phoneProviderStatus = 'billing_not_enabled';
        } else if (
          phoneProbeRes.ok ||
          msg.includes('CAPTCHA') ||
          msg.includes('RECAPTCHA') ||
          msg.includes('CLIENT_IDENTIFIER')
        ) {
          phoneProviderEnabled = true;
          phoneProviderStatus = 'enabled';
        }
      }

      res.json({
        ok: true,
        projectId: firebaseConfig.projectId,
        authorizedDomains,
        requestedHost: requestedHost || null,
        isHostAuthorized,
        recaptchaConfigured,
        phoneProviderEnabled,
        phoneProviderStatus,
      });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: err?.message || 'Unable to verify Firebase Phone Auth configuration.',
      });
    }
  });

  app.post('/api/auth/otp-rate-check', (req, res) => {
    const mobile = sanitizeString(req.body?.mobile, 20).replace(/\D/g, '').slice(-10);
    const action = req.body?.action === 'check' ? 'check' : 'record';
    if (!isValidIndianMobile(mobile)) {
      res.status(400).json({
        allowed: false,
        error: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
      });
      return;
    }

    const now = Date.now();
    const clientIp = getClientIp(req);

    // Opportunistic cleanup to keep memory bounded
    if (otpSendByPhone.size > 5000) {
      for (const [key, rec] of otpSendByPhone.entries()) {
        if (now - rec.lastSentAt > OTP_WINDOW_MS) otpSendByPhone.delete(key);
      }
    }
    if (otpSendByIp.size > 5000) {
      for (const [key, list] of otpSendByIp.entries()) {
        if (pruneRecent(list, now).length === 0) otpSendByIp.delete(key);
      }
    }

    const phoneRec = otpSendByPhone.get(mobile) || { lastSentAt: 0, timestamps: [] };
    phoneRec.timestamps = pruneRecent(phoneRec.timestamps, now);

    const sinceLast = now - phoneRec.lastSentAt;
    if (phoneRec.lastSentAt > 0 && sinceLast < OTP_SEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.max(1, Math.ceil((OTP_SEND_COOLDOWN_MS - sinceLast) / 1000));
      res.status(429).json({
        allowed: false,
        retryAfterSeconds,
        error: `Please wait ${retryAfterSeconds}s before requesting another OTP for +91 ${mobile}.`,
      });
      return;
    }

    if (phoneRec.timestamps.length >= OTP_MAX_SENDS_PER_PHONE) {
      const oldest = phoneRec.timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((OTP_WINDOW_MS - (now - oldest)) / 1000));
      res.status(429).json({
        allowed: false,
        retryAfterSeconds,
        error: `Too many OTP requests for this mobile number. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      });
      return;
    }

    const ipTimestamps = pruneRecent(otpSendByIp.get(clientIp) || [], now);
    if (ipTimestamps.length >= OTP_MAX_SENDS_PER_IP) {
      const oldest = ipTimestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((OTP_WINDOW_MS - (now - oldest)) / 1000));
      res.status(429).json({
        allowed: false,
        retryAfterSeconds,
        error: `Too many OTP attempts from your network. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      });
      return;
    }

    if (action === 'record') {
      phoneRec.lastSentAt = now;
      phoneRec.timestamps.push(now);
      otpSendByPhone.set(mobile, phoneRec);

      ipTimestamps.push(now);
      otpSendByIp.set(clientIp, ipTimestamps);
    }

    res.json({ allowed: true, cooldownSeconds: 60 });
  });

  app.post('/api/auth/otp-verify-guard', (req, res) => {
    const mobile = sanitizeString(req.body?.mobile, 20).replace(/\D/g, '').slice(-10);
    const action = req.body?.action;
    if (!isValidIndianMobile(mobile) || !['check', 'fail', 'success'].includes(action)) {
      res.status(400).json({ allowed: false, error: 'Invalid OTP verification guard request.' });
      return;
    }

    const now = Date.now();
    const key = `${mobile}:${getClientIp(req)}`;

    if (otpVerifyByKey.size > 5000) {
      for (const [k, rec] of otpVerifyByKey.entries()) {
        if (rec.lockedUntil < now && pruneRecent(rec.failures, now).length === 0) {
          otpVerifyByKey.delete(k);
        }
      }
    }

    if (action === 'success') {
      otpVerifyByKey.delete(key);
      res.json({ allowed: true });
      return;
    }

    const rec = otpVerifyByKey.get(key) || { failures: [], lockedUntil: 0 };
    rec.failures = pruneRecent(rec.failures, now);

    if (rec.lockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((rec.lockedUntil - now) / 1000));
      res.status(429).json({
        allowed: false,
        retryAfterSeconds,
        error: `Too many incorrect OTP attempts. Verification locked for ${retryAfterSeconds}s.`,
      });
      return;
    }

    if (action === 'fail') {
      rec.failures.push(now);
      if (rec.failures.length >= OTP_MAX_VERIFY_FAILURES) {
        rec.lockedUntil = now + OTP_VERIFY_LOCK_MS;
        otpVerifyByKey.set(key, rec);
        const retryAfterSeconds = Math.ceil(OTP_VERIFY_LOCK_MS / 1000);
        res.status(429).json({
          allowed: false,
          retryAfterSeconds,
          error: `Too many incorrect OTP attempts. Please wait ${retryAfterSeconds}s or request a new OTP.`,
        });
        return;
      }
      otpVerifyByKey.set(key, rec);
      res.json({
        allowed: true,
        remainingAttempts: OTP_MAX_VERIFY_FAILURES - rec.failures.length,
      });
      return;
    }

    res.json({
      allowed: true,
      remainingAttempts: OTP_MAX_VERIFY_FAILURES - rec.failures.length,
    });
  });

  app.post('/api/ai/assistant', async (req, res) => {
    try {
      const userMessage = sanitizeString(req.body?.message, 1200);
      if (!userMessage) {
        res.status(400).json({ error: 'Please enter a message for CARTZY AI.' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const uid = await verifyFirebaseUserUid(token);

      const [{ products, activeFlashSales }, userOrders] = await Promise.all([
        getAuthoritativeCatalogAndFlashSales(token),
        uid && token ? fetchUserOrdersFromFirestore(uid, token) : Promise.resolve([]),
      ]);

      const flashByProductId = new Map<string, Record<string, any>>();
      for (const sale of activeFlashSales) {
        const remaining = Math.max(0, Number(sale.saleStock) - Number(sale.soldCount || 0));
        if (remaining > 0) {
          flashByProductId.set(String(sale.productId), sale);
        }
      }

      const catalogSummary = products.map((p) => {
        const flash = flashByProductId.get(String(p.id));
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.categoryName,
          originalPrice: Number(p.originalPrice),
          sellingPrice: Number(p.sellingPrice),
          flashSalePrice: flash ? Number(flash.salePrice) : undefined,
          discountPercent: flash ? Number(flash.discountPercent) : Number(p.discountPercent),
          ratingAvg: Number(p.ratingAvg || 0),
          reviewCount: Number(p.reviewCount || 0),
          stock: Number(p.stock || 0),
          description: String(p.description || '').slice(0, 200),
          specifications: p.specifications || {},
        };
      });

      const orderSummary = userOrders
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
        .slice(0, 6)
        .map((o) => ({
          orderNumber: o.orderNumber,
          orderStatus: o.orderStatus,
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          finalAmount: o.pricing?.finalAmount,
          estimatedDeliveryText: o.estimatedDeliveryText,
          createdAt: o.createdAt,
          items: Array.isArray(o.itemsPreview)
            ? o.itemsPreview.map((i: any) => `${i.name} x${i.quantity}`)
            : [],
          courierTracking: o.courierTracking?.verifiedIntegration
            ? {
                provider: o.courierTracking.providerName,
                trackingId: o.courierTracking.trackingId,
              }
            : null,
        }));

      const buildProductCard = (p: Record<string, any>) => {
        const flash = flashByProductId.get(String(p.id));
        return {
          id: String(p.id),
          name: String(p.name),
          brand: String(p.brand),
          categoryName: String(p.categoryName),
          image: Array.isArray(p.images) && p.images[0] ? String(p.images[0]) : '',
          originalPrice: Number(p.originalPrice),
          sellingPrice: Number(p.sellingPrice),
          discountPercent: flash ? Number(flash.discountPercent) : Number(p.discountPercent || 0),
          ratingAvg: Number(p.ratingAvg || 0),
          stock: Number(p.stock || 0),
          ...(flash ? { flashSalePrice: Number(flash.salePrice) } : {}),
        };
      };

      const ai = getGeminiClient();
      if (!ai) {
        // Graceful fallback grounded strictly in catalogue & authenticated order data
        const lower = userMessage.toLowerCase();
        const isOrderQuery =
          lower.includes('order') || lower.includes('track') || lower.includes('delivery status');
        const maxBudgetMatch = lower.match(/under\s*[₹rs.\s]*([\d,]+)/i);
        const maxBudget = maxBudgetMatch ? Number(maxBudgetMatch[1].replace(/,/g, '')) : null;

        let matched = products.filter((p) => {
          const effectivePrice = Number(flashByProductId.get(String(p.id))?.salePrice ?? p.sellingPrice);
          if (maxBudget && effectivePrice > maxBudget) return false;
          const words = lower
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2 && !['under', 'best', 'suggest', 'laptop', 'show', 'compare', 'with', 'for', 'and'].includes(w));
          if (lower.includes('laptop')) {
            return (
              p.name.toLowerCase().includes('laptop') ||
              p.name.toLowerCase().includes('ultrabook') ||
              p.categoryId === 'laptops'
            );
          }
          if (words.length === 0) return true;
          const hay = `${p.name} ${p.brand} ${p.categoryName} ${p.description}`.toLowerCase();
          return words.some((w) => hay.includes(w));
        });
        if (matched.length === 0 && maxBudget) {
          matched = products.filter(
            (p) => Number(flashByProductId.get(String(p.id))?.salePrice ?? p.sellingPrice) <= maxBudget
          );
        }
        matched = matched.slice(0, 3);

        let fallbackReply =
          'CARTZY AI (Gemini API) is waiting for `GEMINI_API_KEY` to be configured in your server Secrets. ';
        if (isOrderQuery) {
          if (!uid) {
            fallbackReply +=
              'Please sign in to your CARTZY account to view your authenticated order status under My Orders.';
          } else if (orderSummary.length === 0) {
            fallbackReply += 'You do not have any placed orders on your account yet.';
          } else {
            const latest = orderSummary[0];
            fallbackReply += `Your latest order ${latest.orderNumber} is currently "${latest.orderStatus}" (Payment: ${latest.paymentMethod} - ${latest.paymentStatus}, Total: ₹${Number(latest.finalAmount || 0).toLocaleString('en-IN')}). Estimated delivery: ${latest.estimatedDeliveryText}.`;
          }
        } else if (matched.length > 0) {
          fallbackReply += `Here are ${matched.length} matching products directly from the live CARTZY catalog:`;
        } else {
          fallbackReply +=
            'I could not find an exact catalog match for that query. Try browsing Electronics, Mobiles, Fashion, Shoes, Beauty, Home & Kitchen, or Books & Stationery.';
        }

        res.json({
          aiAvailable: false,
          fallbackMode: true,
          reply: fallbackReply,
          recommendedProducts: isOrderQuery ? [] : matched.map(buildProductCard),
          hasOrdersContext: Boolean(uid && orderSummary.length > 0),
        });
        return;
      }

      const historyItems = Array.isArray(req.body?.history)
        ? req.body.history
            .slice(-6)
            .map((h: any) => ({
              role: h.role === 'user' ? 'user' : 'model',
              text: sanitizeString(h.text, 600),
            }))
            .filter((h: any) => h.text)
        : [];

      const systemInstruction = `You are CARTZY AI, the official shopping assistant for CARTZY ("Shop Smart. Live Better."), an Indian e-commerce storefront.
STRICT GROUNDING RULES:
1. Recommend ONLY products present in the LIVE CATALOG JSON provided below. NEVER invent products, prices, discounts, SKUs, or stock numbers.
2. Always format currency in Indian Rupees (₹). If a product has a flashSalePrice, highlight both the active flash sale price and regular price.
3. For product recommendations or comparisons, return exact matching product IDs in recommendedProductIds (max 4 IDs) so the UI can display interactive product cards.
4. Store policies: Standard delivery is FREE on orders ₹499+ (₹49 below ₹499, 4-7 business days). Metro Express delivery is ₹99 (1-3 business days for eligible PIN codes). Cash on Delivery is available up to ₹50,000; UPI/Cards/Net Banking are processed via Razorpay. Return window is 7 days for unused items in original packaging.
5. Order privacy:
   - Authenticated status: ${uid ? `Customer IS authenticated. Use ONLY the AUTHENTICATED ORDERS JSON below to answer order tracking questions.` : `Customer is NOT signed in. If they ask about their order, politely instruct them to sign in at /login or check My Orders — never guess or fabricate order details.`}
6. Keep answers clear, concise, trustworthy, and helpful.`;

      const promptPayload = `LIVE CATALOG (${catalogSummary.length} products):
${JSON.stringify(catalogSummary)}

${uid ? `AUTHENTICATED ORDERS (${orderSummary.length} recent):\n${JSON.stringify(orderSummary)}` : 'AUTHENTICATED ORDERS: Not signed in'}

RECENT CONVERSATION:
${historyItems.map((h: any) => `${h.role.toUpperCase()}: ${h.text}`).join('\n')}

CUSTOMER MESSAGE:
${userMessage}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: promptPayload,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Helpful customer-facing answer grounded strictly in the provided catalog, policies, and authenticated orders.',
              },
              recommendedProductIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 4 exact product id strings from the LIVE CATALOG JSON relevant to the response.',
              },
            },
            required: ['reply', 'recommendedProductIds'],
          },
        },
      });

      const rawText = (response.text || '{}').trim();
      let parsed: { reply?: string; recommendedProductIds?: string[] } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText, recommendedProductIds: [] };
      }

      const productById = new Map<string, Record<string, any>>(
        products.map((p) => [String(p.id), p])
      );
      const verifiedIds = Array.isArray(parsed.recommendedProductIds)
        ? Array.from(new Set(parsed.recommendedProductIds.map(String))).filter((id) =>
            productById.has(id)
          )
        : [];
      const recommendedProducts = verifiedIds
        .slice(0, 4)
        .map((id) => buildProductCard(productById.get(id)!));

      res.json({
        aiAvailable: true,
        fallbackMode: false,
        reply:
          parsed.reply ||
          'I checked our live CARTZY catalog for you. Let me know if you would like specs or a comparison!',
        recommendedProducts,
        hasOrdersContext: Boolean(uid && orderSummary.length > 0),
      });
    } catch (err: any) {
      console.error('CARTZY AI error:', err);
      const msg = String(err?.message || '');
      const status =
        msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')
          ? 429
          : msg.includes('403') || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')
          ? 403
          : 500;
      res.status(status).json({
        aiAvailable: false,
        fallbackMode: true,
        error:
          status === 429
            ? 'CARTZY AI quota limit reached temporarily. Please try again shortly or browse the catalog.'
            : status === 403
            ? 'Gemini API key permission or configuration check required in Settings > Secrets.'
            : 'CARTZY AI is temporarily unavailable. Please browse the live catalog or check My Orders.',
      });
    }
  });

  app.get('/api/maps/reverse-geocode', async (req, res) => {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({ error: 'Valid latitude and longitude coordinates are required.' });
      return;
    }

    const mapsKey =
      process.env.GOOGLE_MAPS_SERVER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!mapsKey) {
      res.status(503).json({
        code: 'MAPS_KEY_MISSING',
        error: 'Google Maps API credentials are not configured on the server.',
      });
      return;
    }

    try {
      const v4Url = new URL('https://geocode.googleapis.com/v4/geocode/location');
      v4Url.searchParams.set('location.latitude', String(lat));
      v4Url.searchParams.set('location.longitude', String(lng));
      v4Url.searchParams.set('languageCode', 'en');
      v4Url.searchParams.set('regionCode', 'IN');

      const v4Headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': mapsKey,
        'X-Goog-FieldMask': 'results.placeId,results.formattedAddress,results.addressComponents,results.location',
        'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
      };
      if (req.headers.referer) {
        v4Headers['Referer'] = String(req.headers.referer);
      }

      const v4Res = await fetch(v4Url.toString(), { method: 'GET', headers: v4Headers });
      const v4Data = (await v4Res.json().catch(() => ({}))) as any;

      if (v4Res.status === 429 || v4Data?.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          code: 'QUOTA_EXCEEDED',
          error: 'Google Maps Platform geocoding quota reached.',
        });
        return;
      }

      if (v4Res.ok && Array.isArray(v4Data?.results) && v4Data.results.length > 0) {
        const best = v4Data.results[0];
        res.json({
          placeId: best.placeId || null,
          formattedAddress: best.formattedAddress || '',
          lat: best.location?.latitude ?? lat,
          lng: best.location?.longitude ?? lng,
          addressComponents: Array.isArray(best.addressComponents) ? best.addressComponents : [],
        });
        return;
      }

      // Fallback to standard Geocoding JSON endpoint if v4 is disabled on the key
      const legacyUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      legacyUrl.searchParams.set('latlng', `${lat},${lng}`);
      legacyUrl.searchParams.set('language', 'en');
      legacyUrl.searchParams.set('region', 'in');
      legacyUrl.searchParams.set('key', mapsKey);

      const legacyRes = await fetch(legacyUrl.toString(), {
        headers: req.headers.referer ? { Referer: String(req.headers.referer) } : {},
      });
      const legacyData = (await legacyRes.json().catch(() => ({}))) as any;

      if (legacyRes.status === 429 || legacyData?.status === 'OVER_QUERY_LIMIT') {
        res.status(429).json({
          code: 'QUOTA_EXCEEDED',
          error: 'Google Maps Platform geocoding quota reached.',
        });
        return;
      }

      if (legacyData?.status === 'OK' && Array.isArray(legacyData?.results) && legacyData.results.length > 0) {
        const best = legacyData.results[0];
        res.json({
          placeId: best.place_id || null,
          formattedAddress: best.formatted_address || '',
          lat: best.geometry?.location?.lat ?? lat,
          lng: best.geometry?.location?.lng ?? lng,
          addressComponents: Array.isArray(best.address_components)
            ? best.address_components.map((c: any) => ({
                longText: c.long_name,
                shortText: c.short_name,
                types: c.types || [],
              }))
            : [],
        });
        return;
      }

      res.status(legacyRes.status >= 400 ? legacyRes.status : 422).json({
        code: legacyData?.status || v4Data?.error?.status || 'GEOCODE_UNAVAILABLE',
        error:
          legacyData?.error_message ||
          v4Data?.error?.message ||
          'Unable to resolve street address for this pin. You can still confirm the coordinates and enter address fields manually.',
      });
    } catch (err: any) {
      res.status(502).json({ error: err.message || 'Reverse geocoding request failed.' });
    }
  });

  app.post('/api/coupons/validate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const code = sanitizeString(req.body?.code, 30).toUpperCase();
      const subtotal = Number(req.body?.subtotal || 0);

      if (!code) {
        res.status(400).json({ error: 'Please enter a coupon code.' });
        return;
      }

      const coupon =
        (await queryCouponByCode(code, token)) ||
        (STARTER_COUPONS.find((c) => c.code === code) as Record<string, any> | undefined) ||
        null;
      if (!coupon) {
        res.status(404).json({ error: 'Coupon code not found.' });
        return;
      }
      if (!coupon.active) {
        res.status(400).json({ error: 'This coupon is currently inactive.' });
        return;
      }
      if (new Date(coupon.expiryDate).getTime() < Date.now()) {
        res.status(400).json({ error: 'This coupon has expired.' });
        return;
      }
      if (Number(coupon.usedCount) >= Number(coupon.usageLimit)) {
        res.status(400).json({ error: 'This coupon has reached its usage limit.' });
        return;
      }
      if (subtotal < Number(coupon.minOrderAmount)) {
        res.status(400).json({
          error: `Add ₹${Number(coupon.minOrderAmount) - subtotal} more to apply ${code}.`,
        });
        return;
      }

      const discount =
        coupon.type === 'PERCENT'
          ? Math.min(Math.round((subtotal * Number(coupon.value)) / 100), Number(coupon.maxDiscount))
          : Math.min(Number(coupon.value), subtotal);

      res.json({ valid: true, couponId: coupon.id, code, discount });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Unable to validate coupon.' });
    }
  });

  app.post('/api/checkout/validate-and-calculate', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const body = req.body;

      if (!sanitizeString(body?.customerInfo?.fullName, 100)) {
        res.status(400).json({ error: 'Full name is required.' });
        return;
      }
      if (!isValidIndianMobile(body?.customerInfo?.mobile || '')) {
        res.status(400).json({ error: 'Valid 10-digit Indian mobile number is required.' });
        return;
      }
      if (!isValidEmail(body?.customerInfo?.email || '')) {
        res.status(400).json({ error: 'Valid email address is required.' });
        return;
      }
      if (body?.customerInfo?.altMobile && !isValidIndianMobile(body.customerInfo.altMobile)) {
        res.status(400).json({ error: 'Alternative phone number must be 10 digits.' });
        return;
      }
      const addr = body?.deliveryAddress;
      if (!addr?.houseNo || !addr?.street || !addr?.locality || !addr?.city || !addr?.district || !addr?.state) {
        res.status(400).json({ error: 'Complete delivery address is required.' });
        return;
      }
      if (!isValidIndianPincode(addr.pincode || '')) {
        res.status(400).json({ error: 'Valid 6-digit Indian PIN code is required.' });
        return;
      }

      const requestedPaymentMethod = String(body?.paymentMethod || 'COD').toUpperCase();
      if (!ALLOWED_PAYMENT_METHODS.has(requestedPaymentMethod)) {
        res.status(400).json({ error: 'Unsupported payment method selected.' });
        return;
      }

      const computed = await computeAuthoritativeCheckout(body, token);

      if (requestedPaymentMethod === 'COD' && computed.pricing.finalAmount > BUSINESS_RULES.MAX_COD_AMOUNT) {
        res.status(400).json({
          error: `Cash on Delivery is available up to ₹${BUSINESS_RULES.MAX_COD_AMOUNT}. Please select UPI, Card, Wallet, or Net Banking.`,
        });
        return;
      }

      res.json(computed);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Checkout validation failed.' });
    }
  });

  app.post('/api/payments/razorpay/create-order', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      const uid = await verifyFirebaseUserUid(token);
      if (!uid) {
        res.status(401).json({ error: 'Authentication required to initiate online payment.' });
        return;
      }

      const rzp = getRazorpayClient();
      if (!rzp) {
        res.status(503).json({
          code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
          error:
            'Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured on the server. Add them to your environment secrets to accept UPI, Cards, Wallets, and Net Banking.',
        });
        return;
      }

      const idempotencyKey = sanitizeString(req.body?.idempotencyKey, 128);
      if (idempotencyKey.length < 8) {
        res.status(400).json({ error: 'Valid checkout idempotency key is required.' });
        return;
      }

      const requestedMethod = String(req.body?.paymentMethod || 'UPI').toUpperCase();
      if (!ALLOWED_ONLINE_METHODS.has(requestedMethod)) {
        res.status(400).json({
          error: 'Select UPI, Card, Net Banking, or Wallet to initiate an online Razorpay payment.',
        });
        return;
      }

      const idemMapKey = `${uid}:${idempotencyKey}`;
      const existingCompleted = completedOrdersByIdempotency.get(idemMapKey);
      if (existingCompleted) {
        res.status(409).json({
          code: 'DUPLICATE_ORDER_PREVENTED',
          error: `Order ${existingCompleted.orderNumber} is already paid and confirmed for this checkout session.`,
          existingOrderNumber: existingCompleted.orderNumber,
        });
        return;
      }

      const existingFirestoreOrder = await queryUserOrderByField(uid, 'idempotencyKey', idempotencyKey, token);
      if (existingFirestoreOrder) {
        completedOrdersByIdempotency.set(idemMapKey, {
          orderId: String(existingFirestoreOrder.id || ''),
          orderNumber: String(existingFirestoreOrder.orderNumber || ''),
          razorpayPaymentId: existingFirestoreOrder.razorpayPaymentId,
        });
        res.status(409).json({
          code: 'DUPLICATE_ORDER_PREVENTED',
          error: `Order ${existingFirestoreOrder.orderNumber} already exists for this checkout session.`,
          existingOrderNumber: existingFirestoreOrder.orderNumber,
        });
        return;
      }

      const computed = await computeAuthoritativeCheckout(req.body, token);

      const amountPaise = Math.round(computed.pricing.finalAmount * 100);
      if (amountPaise < 100) {
        res.status(400).json({ error: 'Order amount must be at least ₹1 for online payment.' });
        return;
      }

      const receipt = `CZ-${Date.now().toString(36).toUpperCase()}`;
      const rzpOrder = await rzp.client.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        notes: {
          uid,
          idempotencyKey,
          paymentMethod: requestedMethod,
        },
      });

      const now = new Date().toISOString();
      paymentSessions.set(rzpOrder.id, {
        razorpayOrderId: rzpOrder.id,
        uid,
        idempotencyKey,
        paymentMethod: requestedMethod,
        amountPaise,
        currency: 'INR',
        status: 'created',
        createdAt: now,
        updatedAt: now,
      });

      res.json({
        razorpayOrderId: rzpOrder.id,
        amount: amountPaise,
        currency: 'INR',
        keyId: rzp.keyId,
        mode: rzp.keyId.startsWith('rzp_test_') ? 'test' : 'live',
        receipt,
        computed,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to initiate Razorpay order.' });
    }
  });

  app.post('/api/payments/razorpay/verify', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const uid = await verifyFirebaseUserUid(token);
    if (!uid) {
      res.status(401).json({ verified: false, error: 'Authentication required to verify payment.' });
      return;
    }

    const rzp = getRazorpayClient();
    if (!rzp) {
      res.status(503).json({ error: 'Razorpay is not configured on the server.' });
      return;
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: 'Missing Razorpay verification fields.' });
      return;
    }

    const rzpOrderId = sanitizeString(String(razorpay_order_id), 120);
    const rzpPaymentId = sanitizeString(String(razorpay_payment_id), 120);

    const expected = crypto
      .createHmac('sha256', rzp.keySecret)
      .update(`${rzpOrderId}|${rzpPaymentId}`)
      .digest('hex');

    const sigBuf = Buffer.from(String(razorpay_signature));
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      res.status(403).json({ verified: false, error: 'Payment signature verification failed.' });
      return;
    }

    // Duplicate payment replay guard
    if (verifiedPaymentIds.has(rzpPaymentId)) {
      res.status(409).json({
        verified: false,
        code: 'DUPLICATE_PAYMENT_PREVENTED',
        error: 'Duplicate payment detected. This Razorpay payment ID was already verified.',
      });
      return;
    }

    const existingOrderWithPayment = await queryUserOrderByField(
      uid,
      'razorpayPaymentId',
      rzpPaymentId,
      token
    );
    if (existingOrderWithPayment) {
      res.status(409).json({
        verified: false,
        code: 'DUPLICATE_PAYMENT_PREVENTED',
        error: `This payment is already linked to order ${existingOrderWithPayment.orderNumber}.`,
        existingOrderNumber: existingOrderWithPayment.orderNumber,
      });
      return;
    }

    const session = paymentSessions.get(rzpOrderId);
    if (session) {
      if (session.uid !== uid) {
        res.status(403).json({
          verified: false,
          error: 'Payment session ownership mismatch.',
        });
        return;
      }
      if (session.orderId) {
        res.status(409).json({
          verified: false,
          code: 'DUPLICATE_ORDER_PREVENTED',
          error: `Order ${session.orderNumber || session.orderId} already exists for this payment session.`,
        });
        return;
      }
    }

    // Server-to-server payment confirmation with Razorpay API when gateway order is live/reachable
    try {
      const gatewayPayment = await (rzp.client.payments as any).fetch(rzpPaymentId);
      if (gatewayPayment) {
        if (gatewayPayment.order_id && gatewayPayment.order_id !== rzpOrderId) {
          res.status(403).json({
            verified: false,
            error: 'Gateway payment order reference mismatch.',
          });
          return;
        }
        if (gatewayPayment.status === 'failed') {
          res.status(400).json({
            verified: false,
            error: gatewayPayment.error_description || 'Payment failed at payment gateway.',
          });
          return;
        }
        if (session && Number(gatewayPayment.amount) !== session.amountPaise) {
          res.status(403).json({
            verified: false,
            error: 'Paid amount does not match server-calculated checkout total.',
          });
          return;
        }
        if (String(gatewayPayment.currency || 'INR').toUpperCase() !== 'INR') {
          res.status(403).json({
            verified: false,
            error: 'Unexpected payment currency reported by gateway.',
          });
          return;
        }
      }
    } catch (fetchErr: any) {
      // Reject explicitly if Razorpay says the payment ID does not exist under active credentials
      if (fetchErr?.statusCode === 400 || fetchErr?.statusCode === 404) {
        res.status(403).json({
          verified: false,
          error: fetchErr?.error?.description || 'Payment record could not be confirmed with Razorpay.',
        });
        return;
      }
    }

    const now = new Date().toISOString();
    verifiedPaymentIds.set(rzpPaymentId, {
      uid,
      razorpayOrderId: rzpOrderId,
      verifiedAt: now,
    });
    if (session) {
      session.status = 'verified';
      session.razorpayPaymentId = rzpPaymentId;
      session.updatedAt = now;
    }

    res.json({
      verified: true,
      razorpayOrderId: rzpOrderId,
      razorpayPaymentId: rzpPaymentId,
      gatewayConfirmed: true,
    });
  });

  app.post('/api/payments/razorpay/record-order-link', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const uid = await verifyFirebaseUserUid(token);
    if (!uid) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const idempotencyKey = sanitizeString(req.body?.idempotencyKey, 128);
    const orderId = sanitizeString(req.body?.orderId, 128);
    const orderNumber = sanitizeString(req.body?.orderNumber, 64);
    const razorpayOrderId = sanitizeString(req.body?.razorpayOrderId, 120);
    const razorpayPaymentId = sanitizeString(req.body?.razorpayPaymentId, 120);

    if (idempotencyKey && orderId) {
      completedOrdersByIdempotency.set(`${uid}:${idempotencyKey}`, {
        orderId,
        orderNumber,
        ...(razorpayPaymentId ? { razorpayPaymentId } : {}),
      });
    }
    if (razorpayOrderId && paymentSessions.has(razorpayOrderId)) {
      const session = paymentSessions.get(razorpayOrderId)!;
      if (session.uid === uid) {
        session.orderId = orderId;
        session.orderNumber = orderNumber;
        if (razorpayPaymentId) session.razorpayPaymentId = razorpayPaymentId;
        session.updatedAt = new Date().toISOString();
      }
    }
    res.json({ linked: true });
  });

  app.post('/api/payments/razorpay/refund', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
      if (!token) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }

      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        }
      );
      const lookupData = (await lookupRes.json().catch(() => ({}))) as {
        users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
      };
      const actor = lookupData.users?.[0];
      if (!actor?.localId) {
        res.status(401).json({ error: 'Invalid Firebase session.' });
        return;
      }

      const adminDoc = await fetchFirestoreDocument('admins', actor.localId, token);
      const isBootstrappedAdmin =
        String(actor.email || '').toLowerCase() === 'mohanreddy86417@gmail.com' &&
        actor.emailVerified === true;
      if (!adminDoc && !isBootstrappedAdmin) {
        res.status(403).json({ error: 'Admin permission required to issue refunds.' });
        return;
      }

      const paymentId = sanitizeString(req.body?.razorpayPaymentId, 120);
      const orderId = sanitizeString(req.body?.orderId, 120);
      const reason = sanitizeString(req.body?.reason, 200) || 'Customer return / cancellation refund';
      const amountRupees = Number(req.body?.amount || 0);

      if (!paymentId) {
        res.status(400).json({ error: 'Missing razorpayPaymentId for online refund.' });
        return;
      }

      if (orderId) {
        const orderDoc = await fetchFirestoreDocument('orders', orderId, token);
        if (!orderDoc) {
          res.status(404).json({ error: 'Order not found for refund verification.' });
          return;
        }
        if (orderDoc.razorpayPaymentId && orderDoc.razorpayPaymentId !== paymentId) {
          res.status(400).json({ error: 'Payment ID does not match the specified order.' });
          return;
        }
        const maxRefundable = Number(orderDoc.pricing?.finalAmount || 0);
        if (Number.isFinite(amountRupees) && amountRupees > maxRefundable) {
          res.status(400).json({ error: 'Refund amount cannot exceed the original order total.' });
          return;
        }
      }

      const rzp = getRazorpayClient();
      if (!rzp) {
        res.status(503).json({
          configured: false,
          gatewayConfirmed: false,
          error:
            'Razorpay API credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured. Refunds cannot be marked successful without gateway confirmation.',
        });
        return;
      }

      const refundPayload: Record<string, any> = {
        notes: { orderId, reason, processedBy: actor.email || actor.localId },
      };
      if (Number.isFinite(amountRupees) && amountRupees > 0) {
        refundPayload.amount = Math.round(amountRupees * 100);
      }

      const refund = await (rzp.client.payments as any).refund(paymentId, refundPayload);
      if (!refund?.id) {
        res.status(502).json({
          refunded: false,
          gatewayConfirmed: false,
          error: 'Razorpay gateway did not return a confirmed refund ID.',
        });
        return;
      }

      res.json({
        refunded: true,
        gatewayConfirmed: true,
        refundId: refund.id,
        status: refund.status || 'processed',
      });
    } catch (err: any) {
      res.status(400).json({
        refunded: false,
        gatewayConfirmed: false,
        error: err?.error?.description || err?.message || 'Razorpay refund failed.',
      });
    }
  });

  const emailSendByUid = new Map<string, number[]>();

  app.post('/api/notifications/email', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const uid = await verifyFirebaseUserUid(token);
    if (!uid) {
      res.status(401).json({ sent: false, error: 'Authentication required to send order email notifications.' });
      return;
    }

    const now = Date.now();
    const recent = pruneRecent(emailSendByUid.get(uid) || [], now);
    if (recent.length >= 10) {
      res.status(429).json({ sent: false, error: 'Email notification rate limit reached. Please wait a few minutes.' });
      return;
    }
    recent.push(now);
    emailSendByUid.set(uid, recent);

    const transporter = getSmtpTransporter();
    if (!transporter) {
      res.json({
        sent: false,
        configured: false,
        reason: 'SMTP credentials are not configured. In-app notification saved.',
      });
      return;
    }
    try {
      const { to, subject, html } = req.body || {};
      if (!isValidEmail(to || '') || !subject || !html) {
        res.status(400).json({ sent: false, error: 'Invalid email parameters.' });
        return;
      }
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'CARTZY <no-reply@cartzy.in>',
        to: String(to).trim(),
        subject: sanitizeString(subject, 160),
        html: String(html).slice(0, 10000),
      });
      res.json({ sent: true, configured: true });
    } catch (err: any) {
      res.status(500).json({ sent: false, error: err.message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const patched = result.code.replace(
            /let wsTransport = createWebSocketModuleRunnerTransport\(\{[\s\S]*?\}\);/,
            'let wsTransport = { async connect() {}, async disconnect() {}, send() {} };'
          );
          res.type('application/javascript').send(patched);
          return;
        }
      } catch {
        // fall through to vite.middlewares
      }
      next();
    });
    app.use(vite.middlewares);
  } else {
    app.use('/src/assets/images', express.static(path.join(__dirname, 'src/assets/images')));
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CARTZY server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
