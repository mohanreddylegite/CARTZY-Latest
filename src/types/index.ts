export type OrderStatus =
  | 'Order Placed'
  | 'Confirmed'
  | 'Accepted'
  | 'Processing'
  | 'Preparing'
  | 'Packed'
  | 'Ready for Pickup'
  | 'Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Return Requested'
  | 'Returned';

export type SellerApprovalStatus =
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Suspended';

export interface SellerVerificationDoc {
  docType:
    | 'PAN Card'
    | 'Shop Act / Trade License'
    | 'GST Certificate'
    | 'FSSAI License'
    | 'Aadhaar / ID Proof'
    | 'Bank Proof'
    | 'Other';
  label: string;
  url: string;
  uploadedAt: string;
}

export type PaymentMethod = 'COD' | 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET';
export type PaymentStatus = 'Pending' | 'Initiated' | 'Paid' | 'Failed' | 'Cancelled' | 'Refunded';
export type RefundStatus = 'None' | 'Initiated' | 'Processed' | 'Failed';
export type DeliveryOption = 'STANDARD' | 'EXPRESS';

export interface PaymentRecord {
  id: string;
  orderId: string;
  orderNumber: string;
  idempotencyKey?: string;
  userId: string;
  customerName?: string;
  customerEmail?: string;
  method: PaymentMethod;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  gatewayVerified?: boolean;
  failureReason?: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface OperatingHours {
  openTime: string; // HH:mm 24h IST
  closeTime: string; // HH:mm 24h IST
  daysOpen: number[]; // 0 (Sun) - 6 (Sat)
  is24x7?: boolean;
  temporarilyClosed?: boolean;
}

export interface ServiceCity {
  id: string;
  name: string;
  state: string;
  country: string;
  currency: 'INR';
  hubName: string;
  hubLocality: string;
  hubAddress: string;
  hubPincode: string;
  hubLat: number;
  hubLng: number;
  boundarySource: string;
  boundaryGeoJson?: string;
  totalWardsConfigured: number;
  defaultDeliveryCharge: number;
  freeDeliveryThreshold: number;
  defaultMinOrderAmount: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceZone {
  id: string;
  cityId: string;
  name: string;
  shortCode: string;
  description?: string;
  localities: string[];
  unverifiedLocalities?: string[];
  pincodes: string[];
  wardNumbers: number[];
  boundaryVerified: boolean;
  allowOutsideMunicipalBoundary?: boolean;
  centerLat: number;
  centerLng: number;
  deliveryCharge: number;
  minOrderAmount: number;
  freeDeliveryThreshold: number;
  estimatedDeliveryText: string;
  enabled: boolean;
  updatedAt: string;
}

export interface ServiceWard {
  id: string;
  cityId: string;
  wardNumber: number;
  wardName: string;
  zoneId: string;
  localities: string[];
  pincodes: string[];
  boundaryStatus:
    | 'Verified VMC'
    | 'Official Ward Polygon Verified'
    | 'Locality Mapped'
    | 'Delimitation Pending Polygon'
    | 'Outside VMC';
  geoJsonPolygon?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PublicShop {
  shopId: string;
  shopName: string;
  shopCategory?: string;
  shopPhone?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  cityId: string;
  locality: string;
  addressText: string;
  pincode: string;
  lat: number;
  lng: number;
  serviceZones: string[];
  wardNumbers?: number[];
  operatingHours: OperatingHours;
  approvalStatus: SellerApprovalStatus;
  isHub?: boolean;
  updatedAt: string;
}

export interface PublicDriver {
  partnerId: string;
  cityId: string;
  assignedZones: string[];
  isOnline: boolean;
  verificationStatus: 'Pending' | 'Approved' | 'Suspended';
  currentLat?: number;
  currentLng?: number;
  updatedAt: string;
}

export interface CustomerLocationState {
  cityId: string;
  cityName: string;
  state: string;
  pincode: string;
  locality: string;
  formattedAddress?: string;
  lat?: number;
  lng?: number;
  source: 'default' | 'gps' | 'map' | 'pincode' | 'manual' | 'saved';
  wardNumber?: number;
  zoneId?: string;
  zoneName?: string;
}

export type ServiceabilityStatusCode =
  | 'DELIVERABLE'
  | 'OUTSIDE_BOUNDARY'
  | 'CITY_DISABLED'
  | 'ZONE_DISABLED'
  | 'WARD_DISABLED'
  | 'NO_OPEN_SHOP'
  | 'NO_DELIVERY_PARTNER'
  | 'BELOW_MIN_ORDER'
  | 'INCOMPLETE_LOCATION';

export interface ServiceabilityResult {
  checkedAt: string;
  withinBoundary: boolean;
  boundaryReason: string;
  matchedCityId?: string;
  matchedCityName?: string;
  matchedZoneId?: string;
  matchedZoneName?: string;
  matchedWardNumber?: number;
  zoneEnabled: boolean;
  wardEnabled: boolean;
  hasAvailableShop: boolean;
  availableShopIds: string[];
  hasAvailableDriver: boolean;
  onlineDriverCount: number;
  deliverable: boolean;
  statusCode: ServiceabilityStatusCode;
  message: string;
  deliveryCharge: number;
  minOrderAmount: number;
  freeDeliveryThreshold: number;
  estimatedDeliveryText: string;
  distanceFromHubKm?: number;
}

export interface PrivacySettings {
  orderUpdatesSms: boolean;
  promotionalOffers: boolean;
  personalizedRecommendations: boolean;
  shareLocationForDelivery: boolean;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  mobile: string;
  role: 'customer' | 'admin' | 'seller' | 'delivery';
  emailVerified: boolean;
  phoneVerified?: boolean;
  onboardingCompleted?: boolean;
  privacySettings?: PrivacySettings;
  photoUrl?: string;
  defaultPincode?: string;
  suspended?: boolean;
  suspensionReason?: string;
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  imageUrl: string;
  description?: string;
  displayOrder: number;
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  categoryName: string;
  brand: string;
  images: string[];
  originalPrice: number;
  sellingPrice: number;
  discountPercent: number;
  stock: number;
  ratingAvg: number;
  reviewCount: number;
  soldCount: number;
  specifications: Record<string, string>;
  availableSizes?: string[];
  availableColors?: string[];
  sellerId?: string;
  sellerName?: string;
  cityId?: string;
  serviceZones?: string[];
  approvalStatus?: 'Approved' | 'Pending' | 'Rejected';
  tags: string[];
  taxRatePercent: number;
  active: boolean;
  lastOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  name: string;
  image: string;
  brand: string;
  sellingPrice: number;
  originalPrice: number;
  quantity: number;
  maxStock: number;
  taxRatePercent: number;
  selectedSize?: string;
  selectedColor?: string;
  sellerId?: string;
  sellerName?: string;
}

export interface RevalidatedCartItem extends CartItem {
  available: boolean;
  deliverableToArea: boolean;
  unavailableReason?: string;
  stockAdjusted: boolean;
  priceChanged: boolean;
  requestedQuantity: number;
  isFlashDeal: boolean;
  categoryName?: string;
  shopName?: string;
}

export interface CartRevalidationResponse {
  checkedAt: string;
  allItemsValid: boolean;
  hasUnavailableItems: boolean;
  hasStockAdjustments: boolean;
  hasPriceChanges: boolean;
  areaDeliverable: boolean;
  areaMessage: string;
  matchedZoneName?: string;
  items: RevalidatedCartItem[];
  pricing: {
    mrpTotal: number;
    subtotal: number;
    productSavings: number;
    deliveryCharge: number;
    freeDeliveryThreshold: number;
    estimatedTotal: number;
  };
}

export interface Address {
  id: string;
  userId: string;
  label: 'Home' | 'Work' | 'Other';
  fullName: string;
  mobile: string;
  altMobile?: string;
  houseNo: string;
  street: string;
  locality: string;
  landmark?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  formattedAddress?: string;
  zoneId?: string;
  wardNumber?: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  expiryDate: string;
  usageLimit: number;
  usedCount: number;
  active: boolean;
}

export interface OrderItem {
  orderId: string;
  userId?: string;
  productId: string;
  sku: string;
  name: string;
  image: string;
  unitOriginalPrice: number;
  unitSellingPrice: number;
  quantity: number;
  lineTotal: number;
  taxAmount: number;
  selectedSize?: string;
  selectedColor?: string;
  sellerId?: string;
  sellerName?: string;
  createdAt?: string;
}

export interface OrderStatusHistoryItem {
  status: OrderStatus;
  timestamp: string;
  note: string;
  updatedBy: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  idempotencyKey: string;
  customerInfo: {
    fullName: string;
    mobile: string;
    email: string;
    altMobile?: string;
  };
  deliveryAddress: {
    label: 'Home' | 'Work' | 'Other';
    fullName: string;
    mobile: string;
    houseNo: string;
    street: string;
    locality: string;
    landmark?: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    formattedAddress?: string;
  };
  serviceAreaMeta?: {
    cityId: string;
    cityName: string;
    zoneId: string;
    zoneName: string;
    wardNumber?: number;
    withinBoundary: boolean;
    servicedByShopIds?: string[];
  };
  courierTracking?: {
    verifiedIntegration: boolean;
    providerName: string;
    trackingId: string;
    trackingUrl?: string;
    liveCoordinates?: {
      lat: number;
      lng: number;
      updatedAt: string;
    };
  };
  deliveryOption: DeliveryOption;
  estimatedDeliveryText: string;
  pricing: {
    mrpTotal: number;
    subtotal: number;
    productSavings: number;
    couponCode?: string | null;
    couponDiscount: number;
    rewardsRedeemed?: number;
    rewardsDiscount?: number;
    deliveryCharge: number;
    taxAmount: number;
    finalAmount: number;
  };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  refundStatus?: RefundStatus;
  refundAmount?: number;
  refundNotes?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  orderStatus: OrderStatus;
  returnRequest?: {
    reason: string;
    comments?: string;
    status: 'Requested' | 'Approved' | 'Rejected' | 'Completed';
    requestedAt: string;
    reviewedAt?: string;
    adminNote?: string;
  };
  sellerIds?: string[];
  assignedDriverId?: string;
  deliveryAssignmentId?: string;
  statusHistory: OrderStatusHistoryItem[];
  itemsCount: number;
  itemsPreview: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: string;
  productId: string;
  sellerId?: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  images?: string[];
  verifiedPurchase: boolean;
  sellerReply?: string;
  sellerReplyBy?: string;
  sellerRepliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  orderId?: string | null;
  read: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userRole?: 'customer' | 'seller' | 'delivery';
  name: string;
  email: string;
  orderNumber?: string;
  topic: string;
  message: string;
  status: 'Open' | 'In Progress' | 'Resolved';
  adminReply?: string;
  repliedBy?: string;
  updatedAt?: string;
  createdAt: string;
}

export interface FlashSale {
  id: string;
  title: string;
  productId: string;
  productName: string;
  productImage: string;
  brand: string;
  categoryName: string;
  originalPrice: number;
  salePrice: number;
  discountPercent: number;
  saleStock: number;
  soldCount: number;
  startDate: string;
  endDate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RewardTransaction {
  id: string;
  type: 'EARN' | 'REDEEM' | 'BONUS' | 'ADJUST';
  points: number;
  description: string;
  orderId?: string;
  createdAt: string;
}

export interface RewardAccount {
  userId: string;
  pointsBalance: number;
  totalEarned: number;
  totalRedeemed: number;
  referralCode: string;
  history: RewardTransaction[];
  updatedAt: string;
}

export interface StoreSettings {
  id: string;
  earnPointsPer100: number;
  rupeePerPoint: number;
  maxRedeemPercent: number;
  referralBonusPoints: number;
  defaultSellerCommissionPercent: number;
  promoBannerText?: string;
  promoBannerActive?: boolean;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface SellerProfile {
  sellerId: string;
  userId: string;
  businessName: string;
  ownerName: string;
  email: string;
  mobile: string;
  shopCategory?: string;
  shopPhone?: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  verificationDocs?: SellerVerificationDoc[];
  gstin?: string;
  cityId?: string;
  serviceZones?: string[];
  wardNumbers?: number[];
  operatingHours?: OperatingHours;
  pickupAddress: {
    houseNo: string;
    street: string;
    locality: string;
    city: string;
    state: string;
    pincode: string;
    lat?: number;
    lng?: number;
  };
  payoutUpiOrBank?: string;
  commissionPercent: number;
  approvalStatus: SellerApprovalStatus;
  rejectionReason?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  totalGrossSales: number;
  totalCommissionPaid: number;
  totalNetEarnings: number;
  createdAt: string;
  updatedAt: string;
}

export interface SellerSettlement {
  id: string;
  sellerId: string;
  sellerName: string;
  orderId: string;
  orderNumber: string;
  grossAmount: number;
  commissionPercent: number;
  commissionAmount: number;
  netPayoutAmount: number;
  status: 'Pending' | 'Paid' | 'Cancelled';
  payoutReference?: string;
  deductionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryPartner {
  partnerId: string;
  userId: string;
  fullName: string;
  mobile: string;
  email: string;
  vehicleType: 'Bike' | 'Scooter' | 'Cycle' | 'Van';
  vehicleNumber: string;
  licenseNumber: string;
  cityId?: string;
  city: string;
  state: string;
  assignedZones?: string[];
  verificationStatus: 'Pending' | 'Approved' | 'Suspended';
  isOnline: boolean;
  currentLat?: number;
  currentLng?: number;
  locationUpdatedAt?: string;
  totalDeliveries: number;
  totalEarnings: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAssignment {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string;
  driverId: string;
  driverName: string;
  driverMobile: string;
  zoneId?: string;
  zoneName?: string;
  pickupSummary: string;
  customerName: string;
  customerMobile: string;
  deliverySummary: string;
  deliveryLat?: number;
  deliveryLng?: number;
  codAmountToCollect: number;
  deliveryFeeEarning: number;
  status: 'Assigned' | 'Accepted' | 'Rejected' | 'Picked Up' | 'Out for Delivery' | 'Delivered';
  otpHash: string;
  otpSubmittedHash?: string;
  driverLat?: number;
  driverLng?: number;
  driverLocationUpdatedAt?: string;
  assignedAt: string;
  deliveredAt?: string;
  updatedAt: string;
}

export interface OrderSecret {
  orderId: string;
  userId: string;
  deliveryOtp: string;
  createdAt: string;
}

export interface AiAssistantProductCard {
  id: string;
  name: string;
  brand: string;
  categoryName: string;
  image: string;
  originalPrice: number;
  sellingPrice: number;
  discountPercent: number;
  ratingAvg: number;
  stock: number;
  flashSalePrice?: number;
}

export interface AiAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products?: AiAssistantProductCard[];
  hasOrdersContext?: boolean;
  fallbackMode?: boolean;
  timestamp: string;
}

export interface ServerConfigStatus {
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  razorpayMode?: 'test' | 'live' | null;
  smtpConfigured: boolean;
  googleMapsConfigured: boolean;
  googleMapsApiKey: string | null;
  geminiConfigured?: boolean;
  launchCity?: string;
  launchState?: string;
  expressMetroPrefixes: string[];
  freeShippingThreshold: number;
  maxCodAmount: number;
}
