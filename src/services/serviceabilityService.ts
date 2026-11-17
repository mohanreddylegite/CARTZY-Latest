import {
  DEFAULT_PUBLIC_DRIVERS,
  DEFAULT_PUBLIC_SHOPS,
  DEFAULT_VIJAYAWADA_CITY,
  DEFAULT_VIJAYAWADA_WARDS,
  DEFAULT_VIJAYAWADA_ZONES,
  VIJAYAWADA_BOUNDARY_GEOJSON,
} from '../data/vijayawadaDefaults.ts';
import type {
  OperatingHours,
  Product,
  PublicDriver,
  PublicShop,
  ServiceCity,
  ServiceWard,
  ServiceZone,
  ServiceabilityResult,
} from '../types/index.ts';

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][1];
    const yi = ring[i][0];
    const xj = ring[j][1];
    const yj = ring[j][0];
    const intersect =
      yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygonCoordinates(lat: number, lng: number, rings: number[][][]): boolean {
  if (!Array.isArray(rings) || rings.length === 0) return false;
  if (!pointInRing(lat, lng, rings[0])) return false;
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(lat, lng, rings[h])) return false;
  }
  return true;
}

export function isPointInGeoJson(lat: number, lng: number, geoJsonInput: unknown): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !geoJsonInput) return false;
  let obj: any = geoJsonInput;
  if (typeof geoJsonInput === 'string') {
    try {
      obj = JSON.parse(geoJsonInput);
    } catch {
      return false;
    }
  }
  if (!obj || typeof obj !== 'object') return false;

  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    return obj.features.some((f: any) => isPointInGeoJson(lat, lng, f));
  }
  if (obj.type === 'Feature' && obj.geometry) {
    return isPointInGeoJson(lat, lng, obj.geometry);
  }
  if (obj.type === 'Polygon' && Array.isArray(obj.coordinates)) {
    return pointInPolygonCoordinates(lat, lng, obj.coordinates);
  }
  if (obj.type === 'MultiPolygon' && Array.isArray(obj.coordinates)) {
    return obj.coordinates.some((poly: number[][][]) => pointInPolygonCoordinates(lat, lng, poly));
  }
  return false;
}

export function extractGooglePolygonRings(geoJsonInput: unknown): Array<Array<{ lat: number; lng: number }>> {
  let obj: any = geoJsonInput;
  if (typeof geoJsonInput === 'string') {
    try {
      obj = JSON.parse(geoJsonInput);
    } catch {
      return [];
    }
  }
  if (!obj || typeof obj !== 'object') return [];
  const results: Array<Array<{ lat: number; lng: number }>> = [];

  const collectGeometry = (geom: any) => {
    if (!geom) return;
    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      results.push(geom.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] })));
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      for (const poly of geom.coordinates) {
        if (Array.isArray(poly?.[0])) {
          results.push(poly[0].map((c: number[]) => ({ lat: c[1], lng: c[0] })));
        }
      }
    }
  };

  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    for (const f of obj.features) collectGeometry(f?.geometry);
  } else if (obj.type === 'Feature') {
    collectGeometry(obj.geometry);
  } else {
    collectGeometry(obj);
  }

  return results;
}

export function getIstClockParts(nowDate: Date = new Date()): { dayOfWeek: number; hhmm: string } {
  const istMs = nowDate.getTime() + 330 * 60 * 1000;
  const ist = new Date(istMs);
  const dayOfWeek = ist.getUTCDay();
  const hh = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return { dayOfWeek, hhmm: `${hh}:${mm}` };
}

export function isShopCurrentlyOpen(hours?: OperatingHours, nowDate: Date = new Date()): boolean {
  if (!hours) return true;
  if (hours.temporarilyClosed) return false;
  if (hours.is24x7) return true;

  const { dayOfWeek, hhmm } = getIstClockParts(nowDate);
  if (Array.isArray(hours.daysOpen) && hours.daysOpen.length > 0 && !hours.daysOpen.includes(dayOfWeek)) {
    return false;
  }

  const open = (hours.openTime || '06:00').trim();
  const close = (hours.closeTime || '23:30').trim();
  if (open === close) return true;
  if (close > open) {
    return hhmm >= open && hhmm <= close;
  }
  return hhmm >= open || hhmm <= close;
}

export interface ServiceabilityLocationInput {
  city?: string;
  state?: string;
  locality?: string;
  formattedAddress?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  zoneId?: string;
  wardNumber?: number;
}

export interface ServiceabilityDataset {
  cities?: ServiceCity[];
  zones?: ServiceZone[];
  wards?: ServiceWard[];
  publicShops?: PublicShop[];
  publicDrivers?: PublicDriver[];
}

export function resolveOperationalDataset(dataset?: ServiceabilityDataset) {
  const cities = dataset?.cities && dataset.cities.length > 0 ? dataset.cities : [DEFAULT_VIJAYAWADA_CITY];
  const zones = dataset?.zones && dataset.zones.length > 0 ? dataset.zones : DEFAULT_VIJAYAWADA_ZONES;
  const wards = dataset?.wards && dataset.wards.length > 0 ? dataset.wards : DEFAULT_VIJAYAWADA_WARDS;
  const publicShops =
    dataset?.publicShops && dataset.publicShops.length > 0 ? dataset.publicShops : DEFAULT_PUBLIC_SHOPS;
  const publicDrivers =
    dataset?.publicDrivers && dataset.publicDrivers.length > 0
      ? dataset.publicDrivers
      : DEFAULT_PUBLIC_DRIVERS;

  return { cities, zones, wards, publicShops, publicDrivers };
}

function normalizeText(value?: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluateLocationServiceability(params: {
  location: ServiceabilityLocationInput;
  dataset?: ServiceabilityDataset;
  subtotal?: number;
  nowDate?: Date;
}): ServiceabilityResult {
  const { location, dataset, subtotal, nowDate = new Date() } = params;
  const { cities, zones, wards, publicShops, publicDrivers } = resolveOperationalDataset(dataset);
  const checkedAt = nowDate.toISOString();

  const lat = typeof location.lat === 'number' && Number.isFinite(location.lat) ? location.lat : undefined;
  const lng = typeof location.lng === 'number' && Number.isFinite(location.lng) ? location.lng : undefined;
  const hasCoords = lat !== undefined && lng !== undefined;
  const cleanPincode = String(location.pincode || '').replace(/\D/g, '').slice(0, 6);
  const cleanCity = normalizeText(location.city);
  const haystack = normalizeText(`${location.locality || ''} ${location.formattedAddress || ''}`);

  if (!hasCoords && !cleanPincode && !haystack && !location.zoneId && !location.wardNumber) {
    return {
      checkedAt,
      withinBoundary: false,
      boundaryReason: 'No delivery address or PIN code selected yet.',
      zoneEnabled: false,
      wardEnabled: false,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'INCOMPLETE_LOCATION',
      message: 'Select a Vijayawada address, PIN code, or map pin to check live delivery availability.',
      deliveryCharge: 0,
      minOrderAmount: 0,
      freeDeliveryThreshold: 499,
      estimatedDeliveryText: 'Unavailable',
    };
  }

  // 1. Identify target city (supports Vijayawada and any future admin-added cities)
  let matchedCity: ServiceCity | undefined;

  if (hasCoords) {
    matchedCity = cities.find((c) => {
      const geo = c.boundaryGeoJson || (c.id === 'vijayawada' ? VIJAYAWADA_BOUNDARY_GEOJSON : null);
      return geo ? isPointInGeoJson(lat!, lng!, geo) : false;
    });
  }

  if (!matchedCity && cleanCity) {
    matchedCity = cities.find(
      (c) =>
        normalizeText(c.name) === cleanCity ||
        cleanCity.includes(normalizeText(c.name)) ||
        normalizeText(c.id) === cleanCity
    );
  }

  if (!matchedCity && haystack) {
    const zoneByLocality = zones.find(
      (z) =>
        z.localities.some((loc) => haystack.includes(normalizeText(loc))) ||
        (z.unverifiedLocalities || []).some((loc) => haystack.includes(normalizeText(loc)))
    );
    if (zoneByLocality) {
      matchedCity = cities.find((c) => c.id === zoneByLocality.cityId);
    }
  }

  if (!matchedCity && cleanPincode) {
    const zoneByPin =
      zones.find((z) => z.pincodes.includes(cleanPincode) && z.enabled) ||
      zones.find((z) => z.pincodes.includes(cleanPincode));
    if (zoneByPin) {
      matchedCity = cities.find((c) => c.id === zoneByPin.cityId);
    }
  }

  if (!matchedCity && location.zoneId) {
    const z = zones.find((item) => item.id === location.zoneId);
    if (z) matchedCity = cities.find((c) => c.id === z.cityId);
  }

  // Fallback to active Vijayawada config only for evaluating boundary rejection reasons if another city wasn't matched
  const referenceCity = matchedCity || cities.find((c) => c.id === 'vijayawada') || cities[0];
  const distanceFromHubKm = hasCoords
    ? haversineDistanceKm(referenceCity.hubLat, referenceCity.hubLng, lat!, lng!)
    : undefined;

  if (!matchedCity) {
    return {
      checkedAt,
      withinBoundary: false,
      boundaryReason: hasCoords
        ? `Coordinates (${lat!.toFixed(5)}, ${lng!.toFixed(5)}) are outside active CARTZY city boundaries.`
        : `PIN ${cleanPincode || 'entered'} / city "${location.city || 'Unknown'}" is outside active CARTZY service cities.`,
      zoneEnabled: false,
      wardEnabled: false,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'OUTSIDE_BOUNDARY',
      message: `Delivery is currently outside CARTZY's ${referenceCity.name} service boundary.`,
      deliveryCharge: 0,
      minOrderAmount: referenceCity.defaultMinOrderAmount,
      freeDeliveryThreshold: referenceCity.freeDeliveryThreshold,
      estimatedDeliveryText: 'Not serviceable',
      distanceFromHubKm,
    };
  }

  if (!matchedCity.active) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `${matchedCity.name} city operations are currently paused by admin.`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      zoneEnabled: false,
      wardEnabled: false,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'CITY_DISABLED',
      message: `Delivery in ${matchedCity.name} is temporarily disabled by CARTZY Admin.`,
      deliveryCharge: 0,
      minOrderAmount: matchedCity.defaultMinOrderAmount,
      freeDeliveryThreshold: matchedCity.freeDeliveryThreshold,
      estimatedDeliveryText: 'Paused',
      distanceFromHubKm,
    };
  }

  const cityZones = zones.filter((z) => z.cityId === matchedCity!.id);
  const cityWards = wards.filter((w) => w.cityId === matchedCity!.id);
  const cityGeo =
    matchedCity.boundaryGeoJson ||
    (matchedCity.id === 'vijayawada' ? VIJAYAWADA_BOUNDARY_GEOJSON : null);

  // 2. Match Ward & Zone
  let matchedWard: ServiceWard | undefined;
  if (typeof location.wardNumber === 'number') {
    matchedWard = cityWards.find((w) => w.wardNumber === location.wardNumber);
  }
  if (!matchedWard && hasCoords) {
    matchedWard = cityWards.find(
      (w) => Boolean(w.geoJsonPolygon) && isPointInGeoJson(lat!, lng!, w.geoJsonPolygon)
    );
  }

  let matchedZone: ServiceZone | undefined;
  if (location.zoneId) {
    matchedZone = cityZones.find((z) => z.id === location.zoneId);
  }
  if (!matchedZone && matchedWard) {
    matchedZone = cityZones.find((z) => z.id === matchedWard!.zoneId);
  }

  // Check explicit unverified peri-urban locality mentions (e.g., Gollapudi, Kanuru)
  // Always inspect haystack even when location.zoneId was supplied so fringe presets cannot bypass peri-urban gating
  let matchedUnverifiedLocality = '';
  if (haystack) {
    const zonesToScan = matchedZone
      ? [matchedZone, ...cityZones.filter((z) => z.id !== matchedZone!.id)]
      : cityZones;
    for (const z of zonesToScan) {
      const hitUnverified = (z.unverifiedLocalities || []).find((loc) =>
        haystack.includes(normalizeText(loc))
      );
      if (hitUnverified) {
        if (!matchedZone) matchedZone = z;
        matchedUnverifiedLocality = hitUnverified;
        break;
      }
      if (!matchedZone) {
        const hitVerified = z.localities.find((loc) => haystack.includes(normalizeText(loc)));
        if (hitVerified) {
          matchedZone = z;
          break;
        }
      }
    }
  }

  // Check city boundary polygon strictly if coordinates are provided
  const pointInsideCityPolygon = hasCoords
    ? cityGeo
      ? isPointInGeoJson(lat!, lng!, cityGeo)
      : true
    : false;

  if (hasCoords && cityGeo && !pointInsideCityPolygon) {
    // Allow only if matched zone has explicit Admin peri-urban extension enabled AND locality/PIN matches
    const periUrbanAllowed = Boolean(
      matchedZone?.enabled &&
        matchedZone?.allowOutsideMunicipalBoundary &&
        (matchedUnverifiedLocality ||
          (cleanPincode && matchedZone.pincodes.includes(cleanPincode)))
    );

    if (!periUrbanAllowed) {
      return {
        checkedAt,
        withinBoundary: false,
        boundaryReason: matchedUnverifiedLocality
          ? `${matchedUnverifiedLocality} lies outside the verified ${matchedCity.name} Municipal Corporation boundary and peri-urban override is disabled.`
          : `Pinned location (${lat!.toFixed(5)}, ${lng!.toFixed(5)}) falls outside the verified ${matchedCity.name} Municipal Corporation boundary.`,
        matchedCityId: matchedCity.id,
        matchedCityName: matchedCity.name,
        matchedZoneId: matchedZone?.id,
        matchedZoneName: matchedZone?.name,
        zoneEnabled: Boolean(matchedZone?.enabled),
        wardEnabled: matchedWard ? matchedWard.enabled : true,
        hasAvailableShop: false,
        availableShopIds: [],
        hasAvailableDriver: false,
        onlineDriverCount: 0,
        deliverable: false,
        statusCode: 'OUTSIDE_BOUNDARY',
        message: matchedUnverifiedLocality
          ? `${matchedUnverifiedLocality} is outside the verified VMC municipal boundary. Admin must verify and enable peri-urban coverage for this area.`
          : `This address falls outside the verified ${matchedCity.name} Municipal Corporation boundary.`,
        deliveryCharge: 0,
        minOrderAmount: matchedCity.defaultMinOrderAmount,
        freeDeliveryThreshold: matchedCity.freeDeliveryThreshold,
        estimatedDeliveryText: 'Outside municipal boundary',
        distanceFromHubKm,
      };
    }
  }

  // If coordinates are inside city polygon (and no explicit zone matched by locality yet), map to nearest zone center in the city
  if (!matchedZone && hasCoords && pointInsideCityPolygon && cityZones.length > 0) {
    matchedZone = [...cityZones].sort(
      (a, b) =>
        haversineDistanceKm(lat!, lng!, a.centerLat, a.centerLng) -
        haversineDistanceKm(lat!, lng!, b.centerLat, b.centerLng)
    )[0];
  }

  // Manual entry without coordinates: check unverified localities & PIN codes
  if (!hasCoords) {
    if (matchedUnverifiedLocality && matchedZone && !matchedZone.allowOutsideMunicipalBoundary) {
      return {
        checkedAt,
        withinBoundary: false,
        boundaryReason: `${matchedUnverifiedLocality} is outside the verified ${matchedCity.name} Municipal Corporation boundary.`,
        matchedCityId: matchedCity.id,
        matchedCityName: matchedCity.name,
        matchedZoneId: matchedZone.id,
        matchedZoneName: matchedZone.name,
        zoneEnabled: matchedZone.enabled,
        wardEnabled: true,
        hasAvailableShop: false,
        availableShopIds: [],
        hasAvailableDriver: false,
        onlineDriverCount: 0,
        deliverable: false,
        statusCode: 'OUTSIDE_BOUNDARY',
        message: `${matchedUnverifiedLocality} is outside the verified VMC municipal boundary and is not enabled for delivery.`,
        deliveryCharge: 0,
        minOrderAmount: matchedZone.minOrderAmount,
        freeDeliveryThreshold: matchedZone.freeDeliveryThreshold,
        estimatedDeliveryText: 'Outside boundary',
      };
    }

    if (!matchedZone && cleanPincode) {
      matchedZone =
        cityZones.find((z) => z.pincodes.includes(cleanPincode) && z.enabled) ||
        cityZones.find((z) => z.pincodes.includes(cleanPincode));
    }
  }

  if (!matchedZone) {
    return {
      checkedAt,
      withinBoundary: false,
      boundaryReason: `No verified ${matchedCity.name} delivery zone matched PIN ${cleanPincode || 'entered'} / "${location.locality || ''}".`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      zoneEnabled: false,
      wardEnabled: false,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'OUTSIDE_BOUNDARY',
      message: `Unable to match this address to an active ${matchedCity.name} service zone. Drop a pin inside ${matchedCity.name} or enter a valid locality & PIN.`,
      deliveryCharge: 0,
      minOrderAmount: matchedCity.defaultMinOrderAmount,
      freeDeliveryThreshold: matchedCity.freeDeliveryThreshold,
      estimatedDeliveryText: 'Not serviceable',
      distanceFromHubKm,
    };
  }

  if (!matchedWard) {
    const matchingWards = cityWards.filter(
      (w) =>
        w.zoneId === matchedZone!.id &&
        ((cleanPincode && w.pincodes.includes(cleanPincode)) ||
          (haystack && w.localities.some((l) => haystack.includes(normalizeText(l)))))
    );
    if (matchingWards.length > 0) {
      matchedWard = matchingWards.find((w) => w.enabled) || matchingWards[0];
    }
  }

  if (!matchedZone.enabled) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `Inside ${matchedCity.name} (${matchedZone.name}), but this zone is currently disabled.`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      matchedZoneId: matchedZone.id,
      matchedZoneName: matchedZone.name,
      matchedWardNumber: matchedWard?.wardNumber,
      zoneEnabled: false,
      wardEnabled: matchedWard ? matchedWard.enabled : true,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'ZONE_DISABLED',
      message: `${matchedZone.name} is temporarily disabled for delivery in CARTZY Admin.`,
      deliveryCharge: matchedZone.deliveryCharge,
      minOrderAmount: matchedZone.minOrderAmount,
      freeDeliveryThreshold: matchedZone.freeDeliveryThreshold,
      estimatedDeliveryText: 'Zone disabled',
      distanceFromHubKm,
    };
  }

  if (matchedWard && !matchedWard.enabled) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `Ward ${matchedWard.wardNumber} (${matchedWard.wardName}) is currently deactivated.`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      matchedZoneId: matchedZone.id,
      matchedZoneName: matchedZone.name,
      matchedWardNumber: matchedWard.wardNumber,
      zoneEnabled: true,
      wardEnabled: false,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'WARD_DISABLED',
      message: `Delivery to ${matchedWard.wardName} is currently deactivated by Admin.`,
      deliveryCharge: matchedZone.deliveryCharge,
      minOrderAmount: matchedZone.minOrderAmount,
      freeDeliveryThreshold: matchedZone.freeDeliveryThreshold,
      estimatedDeliveryText: 'Ward deactivated',
      distanceFromHubKm,
    };
  }

  // 3. Real Operational Check: Approved + Open Shops serving this zone AND Approved + Online Delivery Partners
  const availableShops = publicShops.filter(
    (shop) =>
      shop.cityId === matchedCity!.id &&
      shop.approvalStatus === 'Approved' &&
      shop.serviceZones.includes(matchedZone!.id) &&
      isShopCurrentlyOpen(shop.operatingHours, nowDate)
  );

  const availableDrivers = publicDrivers.filter(
    (driver) =>
      driver.cityId === matchedCity!.id &&
      driver.verificationStatus === 'Approved' &&
      driver.isOnline === true &&
      (driver.assignedZones || []).includes(matchedZone!.id)
  );

  const freeThreshold = matchedZone.freeDeliveryThreshold || matchedCity.freeDeliveryThreshold || 499;
  const computedFee =
    typeof subtotal === 'number' && subtotal >= freeThreshold ? 0 : matchedZone.deliveryCharge;

  if (availableShops.length === 0) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `Address is inside ${matchedCity.name} (${matchedZone.name}).`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      matchedZoneId: matchedZone.id,
      matchedZoneName: matchedZone.name,
      matchedWardNumber: matchedWard?.wardNumber,
      zoneEnabled: true,
      wardEnabled: true,
      hasAvailableShop: false,
      availableShopIds: [],
      hasAvailableDriver: availableDrivers.length > 0,
      onlineDriverCount: availableDrivers.length,
      deliverable: false,
      statusCode: 'NO_OPEN_SHOP',
      message: `Address is inside ${matchedZone.name}, but no approved shop is currently open or covering this zone.`,
      deliveryCharge: computedFee,
      minOrderAmount: matchedZone.minOrderAmount,
      freeDeliveryThreshold: freeThreshold,
      estimatedDeliveryText: matchedZone.estimatedDeliveryText,
      distanceFromHubKm,
    };
  }

  if (availableDrivers.length === 0) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `Address is inside ${matchedCity.name} (${matchedZone.name}).`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      matchedZoneId: matchedZone.id,
      matchedZoneName: matchedZone.name,
      matchedWardNumber: matchedWard?.wardNumber,
      zoneEnabled: true,
      wardEnabled: true,
      hasAvailableShop: true,
      availableShopIds: availableShops.map((s) => s.shopId),
      hasAvailableDriver: false,
      onlineDriverCount: 0,
      deliverable: false,
      statusCode: 'NO_DELIVERY_PARTNER',
      message: `Address is inside ${matchedZone.name}, but no delivery partner is currently online for this zone.`,
      deliveryCharge: computedFee,
      minOrderAmount: matchedZone.minOrderAmount,
      freeDeliveryThreshold: freeThreshold,
      estimatedDeliveryText: matchedZone.estimatedDeliveryText,
      distanceFromHubKm,
    };
  }

  if (typeof subtotal === 'number' && subtotal > 0 && subtotal < matchedZone.minOrderAmount) {
    return {
      checkedAt,
      withinBoundary: true,
      boundaryReason: `Inside ${matchedCity.name} (${matchedZone.name}).`,
      matchedCityId: matchedCity.id,
      matchedCityName: matchedCity.name,
      matchedZoneId: matchedZone.id,
      matchedZoneName: matchedZone.name,
      matchedWardNumber: matchedWard?.wardNumber,
      zoneEnabled: true,
      wardEnabled: true,
      hasAvailableShop: true,
      availableShopIds: availableShops.map((s) => s.shopId),
      hasAvailableDriver: true,
      onlineDriverCount: availableDrivers.length,
      deliverable: false,
      statusCode: 'BELOW_MIN_ORDER',
      message: `Minimum order value for ${matchedZone.name} is ₹${matchedZone.minOrderAmount}. Add ₹${matchedZone.minOrderAmount - subtotal} more to checkout.`,
      deliveryCharge: computedFee,
      minOrderAmount: matchedZone.minOrderAmount,
      freeDeliveryThreshold: freeThreshold,
      estimatedDeliveryText: matchedZone.estimatedDeliveryText,
      distanceFromHubKm,
    };
  }

  return {
    checkedAt,
    withinBoundary: true,
    boundaryReason: `Verified inside ${matchedCity.name} (${matchedZone.name}).`,
    matchedCityId: matchedCity.id,
    matchedCityName: matchedCity.name,
    matchedZoneId: matchedZone.id,
    matchedZoneName: matchedZone.name,
    matchedWardNumber: matchedWard?.wardNumber,
    zoneEnabled: true,
    wardEnabled: true,
    hasAvailableShop: true,
    availableShopIds: availableShops.map((s) => s.shopId),
    hasAvailableDriver: true,
    onlineDriverCount: availableDrivers.length,
    deliverable: true,
    statusCode: 'DELIVERABLE',
    message: `Delivering to ${matchedZone.name} · Est. ${matchedZone.estimatedDeliveryText} · ${availableShops.length} shop(s) & ${availableDrivers.length} partner(s) active`,
    deliveryCharge: computedFee,
    minOrderAmount: matchedZone.minOrderAmount,
    freeDeliveryThreshold: freeThreshold,
    estimatedDeliveryText: matchedZone.estimatedDeliveryText,
    distanceFromHubKm,
  };
}

export function isProductDeliverableToArea(params: {
  product: Product;
  serviceability: ServiceabilityResult;
  publicShops?: PublicShop[];
  nowDate?: Date;
}): { deliverable: boolean; reason?: string; shop?: PublicShop } {
  const { product, serviceability, publicShops = DEFAULT_PUBLIC_SHOPS, nowDate = new Date() } = params;

  if (!product.active || (product.approvalStatus && product.approvalStatus !== 'Approved')) {
    return { deliverable: false, reason: 'Product is not currently active.' };
  }
  if ((product.stock || 0) <= 0) {
    return { deliverable: false, reason: 'Out of stock at the supplying shop.' };
  }
  if (!serviceability.deliverable || !serviceability.matchedZoneId) {
    return { deliverable: false, reason: serviceability.message };
  }

  const fulfillmentShopId = product.sellerId || 'hub-bhavanipuram';
  const shop = publicShops.find((s) => s.shopId === fulfillmentShopId);

  if (!shop) {
    return { deliverable: false, reason: 'No active local shop configured for this item.' };
  }
  if (shop.approvalStatus !== 'Approved') {
    return { deliverable: false, reason: `${shop.shopName} is awaiting approval.` };
  }
  if (!isShopCurrentlyOpen(shop.operatingHours, nowDate)) {
    return { deliverable: false, reason: `${shop.shopName} is currently closed.` };
  }

  const allowedZones =
    product.serviceZones && product.serviceZones.length > 0 ? product.serviceZones : shop.serviceZones;

  if (!allowedZones.includes(serviceability.matchedZoneId)) {
    return {
      deliverable: false,
      reason: `${shop.shopName} does not deliver to ${serviceability.matchedZoneName}.`,
    };
  }

  return { deliverable: true, shop };
}
