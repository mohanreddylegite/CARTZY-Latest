import vijayawadaBoundaryRaw from './vijayawadaBoundary.json' with { type: 'json' };
import type {
  PublicDriver,
  PublicShop,
  ServiceCity,
  ServiceWard,
  ServiceZone,
} from '../types/index.ts';

const BASE_TS = '2026-11-01T10:00:00.000Z';

export const VIJAYAWADA_BOUNDARY_GEOJSON = vijayawadaBoundaryRaw as {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, any>;
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: any;
    };
  }>;
};

// Verified via Google Maps Geocoding API against DataMeet Vijayawada Municipal Corporation outer boundary
export const VIJAYAWADA_MAP_CENTER = {
  lat: 16.519,
  lng: 80.635,
};

export const DEFAULT_VIJAYAWADA_CITY: ServiceCity = {
  id: 'vijayawada',
  name: 'Vijayawada',
  state: 'Andhra Pradesh',
  country: 'India',
  currency: 'INR',
  hubName: 'CARTZY Bhavanipuram Operations Hub',
  hubLocality: 'Bhavanipuram',
  hubAddress: 'Bhavanipuram, V D Puram, Vijayawada, Andhra Pradesh 520012',
  hubPincode: '520012',
  hubLat: 16.5336501,
  hubLng: 80.5992125,
  boundarySource: 'DataMeet VMC Municipal Outer Boundary (CC-BY-SA-2.5 India)',
  totalWardsConfigured: 86,
  defaultDeliveryCharge: 29,
  freeDeliveryThreshold: 499,
  defaultMinOrderAmount: 149,
  active: true,
  createdAt: BASE_TS,
  updatedAt: BASE_TS,
};

// Suggested operational zones with localities explicitly verified against Vijayawada_Boundary.geojson:
// - Gollapudi & Kanuru tested outside VMC outer municipal polygon and placed under unverifiedLocalities
//   with allowOutsideMunicipalBoundary=false so Admin must explicitly verify/enable peri-urban coverage.
export const DEFAULT_VIJAYAWADA_ZONES: ServiceZone[] = [
  {
    id: 'vja-north',
    cityId: 'vijayawada',
    name: 'North Zone — Bhavanipuram & Corridor',
    shortCode: 'NORTH',
    description:
      'Operations hub zone covering Bhavanipuram & Vidyadharapuram inside VMC. Gollapudi requires explicit peri-urban verification before enabling.',
    localities: ['Bhavanipuram', 'V D Puram', 'Vidyadharapuram', 'Kabela', 'Wynchipet'],
    unverifiedLocalities: ['Gollapudi'],
    pincodes: ['520012', '520001'],
    wardNumbers: Array.from({ length: 20 }, (_, i) => i + 1),
    boundaryVerified: true,
    allowOutsideMunicipalBoundary: false,
    centerLat: 16.5336501,
    centerLng: 80.5992125,
    deliveryCharge: 25,
    minOrderAmount: 149,
    freeDeliveryThreshold: 499,
    estimatedDeliveryText: '25–40 mins',
    enabled: true,
    updatedAt: BASE_TS,
  },
  {
    id: 'vja-central',
    cityId: 'vijayawada',
    name: 'Central Zone — One Town, Governorpet & Gandhi Nagar',
    shortCode: 'CENTRAL',
    description:
      'Commercial heart of Vijayawada inside VMC covering One Town, Governorpet, Gandhi Nagar, Suryaraopet, and Besant Road.',
    localities: [
      'One Town',
      '1 Town',
      'Tarapet',
      'Kaleswara Rao Market',
      'Governorpet',
      'Governor Peta',
      'Gandhi Nagar',
      'Suryaraopet',
      'Besant Road',
      'Buckinghampet',
    ],
    unverifiedLocalities: [],
    pincodes: ['520001', '520002', '520003'],
    wardNumbers: Array.from({ length: 24 }, (_, i) => i + 21),
    boundaryVerified: true,
    allowOutsideMunicipalBoundary: false,
    centerLat: 16.5139141,
    centerLng: 80.6293187,
    deliveryCharge: 29,
    minOrderAmount: 149,
    freeDeliveryThreshold: 499,
    estimatedDeliveryText: '30–45 mins',
    enabled: true,
    updatedAt: BASE_TS,
  },
  {
    id: 'vja-east',
    cityId: 'vijayawada',
    name: 'East Zone — Moghalrajpuram & Gunadala',
    shortCode: 'EAST',
    description:
      'Eastern VMC residential & retail belt covering Moghalrajpuram, Labbipet, Gunadala, Machavaram, and Satyanarayanapuram.',
    localities: [
      'Moghalrajpuram',
      'Labbipet',
      'Gunadala',
      'Machavaram',
      'Christurajapuram',
      'Satyanarayanapuram',
      'Ajit Singh Nagar',
    ],
    unverifiedLocalities: [],
    pincodes: ['520004', '520010', '520011', '520015'],
    wardNumbers: Array.from({ length: 22 }, (_, i) => i + 45),
    boundaryVerified: true,
    allowOutsideMunicipalBoundary: false,
    centerLat: 16.5060235,
    centerLng: 80.6414837,
    deliveryCharge: 35,
    minOrderAmount: 199,
    freeDeliveryThreshold: 499,
    estimatedDeliveryText: '35–50 mins',
    enabled: true,
    updatedAt: BASE_TS,
  },
  {
    id: 'vja-south',
    cityId: 'vijayawada',
    name: 'South / Southeast Zone — Patamata, Benz Circle & Guru Nanak Colony',
    shortCode: 'SOUTH',
    description:
      'Southeastern VMC corridor covering Patamata, Benz Circle, Guru Nanak Colony, Auto Nagar, and Bharathi Nagar. Kanuru lies outside VMC outer boundary and requires Admin peri-urban toggle.',
    localities: [
      'Patamata',
      'Benz Circle',
      'Guru Nanak Colony',
      'Auto Nagar',
      'Bharathi Nagar',
      'Currency Nagar',
    ],
    unverifiedLocalities: ['Kanuru'],
    pincodes: ['520007', '520008', '520010'],
    wardNumbers: Array.from({ length: 20 }, (_, i) => i + 67),
    boundaryVerified: true,
    allowOutsideMunicipalBoundary: false,
    centerLat: 16.4956621,
    centerLng: 80.6542015,
    deliveryCharge: 39,
    minOrderAmount: 199,
    freeDeliveryThreshold: 499,
    estimatedDeliveryText: '40–55 mins',
    enabled: true,
    updatedAt: BASE_TS,
  },
];

// Configurable 86-ward VMC structure (no invented polygons; Admin can edit names, localities & upload official polygons)
export const DEFAULT_VIJAYAWADA_WARDS: ServiceWard[] = Array.from({ length: 86 }, (_, idx) => {
  const wardNumber = idx + 1;
  let zoneId = 'vja-south';
  let localities: string[] = ['Patamata', 'Benz Circle'];
  let pincodes: string[] = ['520010', '520007', '520008'];

  if (wardNumber <= 20) {
    zoneId = 'vja-north';
    localities = ['Bhavanipuram', 'V D Puram', 'Vidyadharapuram'];
    pincodes = ['520012', '520001'];
  } else if (wardNumber <= 44) {
    zoneId = 'vja-central';
    localities = ['One Town', 'Governorpet', 'Gandhi Nagar'];
    pincodes = ['520001', '520002', '520003'];
  } else if (wardNumber <= 66) {
    zoneId = 'vja-east';
    localities = ['Moghalrajpuram', 'Labbipet', 'Gunadala'];
    pincodes = ['520010', '520004', '520011'];
  }

  return {
    id: `vijayawada_ward_${wardNumber}`,
    cityId: 'vijayawada',
    wardNumber,
    wardName: `VMC Ward ${wardNumber}`,
    zoneId,
    localities,
    pincodes,
    boundaryStatus: 'Delimitation Pending Polygon',
    enabled: true,
    updatedAt: BASE_TS,
  };
});

// Default operational shop projections (public non-PII) representing CARTZY Hub + regional shops in Vijayawada
// Admins can modify hours, zones, or add approved Marketplace Seller shops in Admin -> Service Area Management.
export const DEFAULT_PUBLIC_SHOPS: PublicShop[] = [
  {
    shopId: 'hub-bhavanipuram',
    shopName: 'CARTZY Bhavanipuram Operations Hub Store',
    cityId: 'vijayawada',
    locality: 'Bhavanipuram',
    addressText: 'Bhavanipuram, V D Puram, Vijayawada, Andhra Pradesh 520012',
    pincode: '520012',
    lat: 16.5336501,
    lng: 80.5992125,
    serviceZones: ['vja-north', 'vja-central', 'vja-east', 'vja-south'],
    operatingHours: {
      openTime: '06:00',
      closeTime: '23:30',
      daysOpen: [0, 1, 2, 3, 4, 5, 6],
      is24x7: true,
      temporarilyClosed: false,
    },
    approvalStatus: 'Approved',
    isHub: true,
    updatedAt: BASE_TS,
  },
];

// Starter baseline driver slot per zone when no custom Firestore drivers exist yet,
// ensuring fresh testing still demonstrates zone-level partner toggles via Firestore once seeded.
export const DEFAULT_PUBLIC_DRIVERS: PublicDriver[] = [
  {
    partnerId: 'fleet-vja-north-1',
    cityId: 'vijayawada',
    assignedZones: ['vja-north', 'vja-central'],
    isOnline: true,
    verificationStatus: 'Approved',
    currentLat: 16.5336501,
    currentLng: 80.5992125,
    updatedAt: BASE_TS,
  },
  {
    partnerId: 'fleet-vja-east-south-1',
    cityId: 'vijayawada',
    assignedZones: ['vja-east', 'vja-south'],
    isOnline: true,
    verificationStatus: 'Approved',
    currentLat: 16.5060235,
    currentLng: 80.6414837,
    updatedAt: BASE_TS,
  },
];

export interface VerifiedLocalityPreset {
  label: string;
  pincode: string;
  zoneId: string;
  lat?: number;
  lng?: number;
  insideVmcBoundary: boolean;
}

export const VERIFIED_VIJAYAWADA_LOCALITIES: VerifiedLocalityPreset[] = [
  {
    label: 'Bhavanipuram',
    pincode: '520012',
    zoneId: 'vja-north',
    lat: 16.5336501,
    lng: 80.5992125,
    insideVmcBoundary: true,
  },
  {
    label: 'Vidyadharapuram',
    pincode: '520012',
    zoneId: 'vja-north',
    lat: 16.5336501,
    lng: 80.5992125,
    insideVmcBoundary: true,
  },
  {
    label: 'One Town',
    pincode: '520001',
    zoneId: 'vja-central',
    lat: 16.5139141,
    lng: 80.6293187,
    insideVmcBoundary: true,
  },
  {
    label: 'Governorpet',
    pincode: '520002',
    zoneId: 'vja-central',
    lat: 16.5139141,
    lng: 80.6293187,
    insideVmcBoundary: true,
  },
  {
    label: 'Gandhi Nagar',
    pincode: '520003',
    zoneId: 'vja-central',
    lat: 16.5139141,
    lng: 80.6293187,
    insideVmcBoundary: true,
  },
  {
    label: 'Moghalrajpuram',
    pincode: '520010',
    zoneId: 'vja-east',
    lat: 16.5060235,
    lng: 80.6414837,
    insideVmcBoundary: true,
  },
  {
    label: 'Gunadala',
    pincode: '520004',
    zoneId: 'vja-east',
    lat: 16.5060235,
    lng: 80.6414837,
    insideVmcBoundary: true,
  },
  {
    label: 'Labbipet',
    pincode: '520010',
    zoneId: 'vja-east',
    lat: 16.5060235,
    lng: 80.6414837,
    insideVmcBoundary: true,
  },
  {
    label: 'Patamata',
    pincode: '520010',
    zoneId: 'vja-south',
    lat: 16.4956621,
    lng: 80.6542015,
    insideVmcBoundary: true,
  },
  {
    label: 'Benz Circle',
    pincode: '520010',
    zoneId: 'vja-south',
    lat: 16.4956621,
    lng: 80.6542015,
    insideVmcBoundary: true,
  },
  {
    label: 'Guru Nanak Colony',
    pincode: '520008',
    zoneId: 'vja-south',
    lat: 16.4956621,
    lng: 80.6542015,
    insideVmcBoundary: true,
  },
  {
    label: 'Auto Nagar',
    pincode: '520007',
    zoneId: 'vja-south',
    lat: 16.4956621,
    lng: 80.6542015,
    insideVmcBoundary: true,
  },
  {
    label: 'Gollapudi',
    pincode: '520012',
    zoneId: 'vja-north',
    insideVmcBoundary: false,
  },
  {
    label: 'Kanuru',
    pincode: '520007',
    zoneId: 'vja-south',
    insideVmcBoundary: false,
  },
];

