import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import {
  DEFAULT_PUBLIC_DRIVERS,
  DEFAULT_PUBLIC_SHOPS,
  DEFAULT_VIJAYAWADA_CITY,
  DEFAULT_VIJAYAWADA_WARDS,
  DEFAULT_VIJAYAWADA_ZONES,
} from '../data/vijayawadaDefaults';
import { ParsedGoogleAddress, parseGoogleAddressComponents } from '../services/mapsAddressParser';
import { fetchServiceabilityDataset } from '../services/serviceAreaStore';
import {
  evaluateLocationServiceability,
  isProductDeliverableToArea,
  ServiceabilityDataset,
} from '../services/serviceabilityService';
import type {
  CustomerLocationState,
  Product,
  PublicShop,
  ServiceabilityResult,
} from '../types';
import { useAuth } from './AuthContext';

const LOCATION_STORAGE_KEY = 'cartzy_customer_location_v2';

const DEFAULT_CUSTOMER_LOCATION: CustomerLocationState = {
  cityId: BUSINESS_CONFIG.launchCityId,
  cityName: BUSINESS_CONFIG.launchCity,
  state: BUSINESS_CONFIG.launchState,
  pincode: BUSINESS_CONFIG.operationsHub.pincode,
  locality: BUSINESS_CONFIG.operationsHub.locality,
  formattedAddress: `${BUSINESS_CONFIG.operationsHub.locality}, ${BUSINESS_CONFIG.launchCity}, ${BUSINESS_CONFIG.launchState} ${BUSINESS_CONFIG.operationsHub.pincode}`,
  lat: BUSINESS_CONFIG.operationsHub.lat,
  lng: BUSINESS_CONFIG.operationsHub.lng,
  source: 'default',
  zoneId: 'vja-north',
  zoneName: 'North: Bhavanipuram & Gollapudi',
};

interface LocationContextType {
  customerLocation: CustomerLocationState;
  dataset: Required<ServiceabilityDataset>;
  datasetLoading: boolean;
  serviceability: ServiceabilityResult;
  isLocationModalOpen: boolean;
  openLocationModal: () => void;
  closeLocationModal: () => void;
  refreshDataset: () => Promise<void>;
  updateCustomerLocation: (next: CustomerLocationState) => void;
  setLocationByPincode: (pincode: string, localityHint?: string) => void;
  setManualVijayawadaAddress: (params: {
    locality: string;
    city: string;
    state?: string;
    pincode: string;
    lat?: number;
    lng?: number;
    zoneId?: string;
    wardNumber?: number;
    formattedAddress?: string;
  }) => void;
  setLocationFromGoogleAddress: (parsed: ParsedGoogleAddress) => void;
  detectGpsLocation: () => Promise<{ ok: boolean; error?: string }>;
  checkProductDeliverable: (product: Product) => {
    deliverable: boolean;
    reason?: string;
    shop?: PublicShop;
  };
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile } = useAuth();

  const [customerLocation, setCustomerLocation] = useState<CustomerLocationState>(() => {
    try {
      const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CustomerLocationState;
        if (parsed && typeof parsed.pincode === 'string' && parsed.cityName) {
          return parsed;
        }
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CUSTOMER_LOCATION;
  });

  const [dataset, setDataset] = useState<Required<ServiceabilityDataset>>({
    cities: [DEFAULT_VIJAYAWADA_CITY],
    zones: DEFAULT_VIJAYAWADA_ZONES,
    wards: DEFAULT_VIJAYAWADA_WARDS,
    publicShops: DEFAULT_PUBLIC_SHOPS,
    publicDrivers: DEFAULT_PUBLIC_DRIVERS,
  });
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  const refreshDataset = useCallback(async () => {
    setDatasetLoading(true);
    try {
      const fresh = await fetchServiceabilityDataset();
      setDataset(fresh);
    } finally {
      setDatasetLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDataset();
  }, [refreshDataset]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(customerLocation));
    } catch {
      // ignore storage errors
    }
  }, [customerLocation]);

  // If user has a saved defaultPincode on profile and current location is still untouched default, reflect it if it differs
  useEffect(() => {
    if (
      customerLocation.source === 'default' &&
      profile?.defaultPincode &&
      /^[1-9][0-9]{5}$/.test(profile.defaultPincode) &&
      profile.defaultPincode !== customerLocation.pincode
    ) {
      const matchingZone = dataset.zones.find((z) => z.pincodes.includes(profile.defaultPincode!));
      const matchedCity = matchingZone
        ? dataset.cities.find((c) => c.id === matchingZone.cityId)
        : undefined;
      setCustomerLocation({
        cityId: matchedCity?.id || '',
        cityName: matchedCity?.name || 'Custom Location',
        state: matchedCity?.state || 'Andhra Pradesh',
        pincode: profile.defaultPincode,
        locality: matchingZone?.localities[0] || `PIN ${profile.defaultPincode}`,
        zoneId: matchingZone?.id,
        zoneName: matchingZone?.name,
        source: 'default',
      });
    }
  }, [profile?.defaultPincode, customerLocation.source, customerLocation.pincode, dataset.zones, dataset.cities]);

  const serviceability = useMemo(
    () =>
      evaluateLocationServiceability({
        location: {
          city: customerLocation.cityName,
          state: customerLocation.state,
          locality: customerLocation.locality,
          formattedAddress: customerLocation.formattedAddress,
          pincode: customerLocation.pincode,
          lat: customerLocation.lat,
          lng: customerLocation.lng,
          zoneId: customerLocation.zoneId,
          wardNumber: customerLocation.wardNumber,
        },
        dataset,
      }),
    [customerLocation, dataset]
  );

  const updateCustomerLocation = useCallback((next: CustomerLocationState) => {
    setCustomerLocation(next);
  }, []);

  const setLocationByPincode = useCallback(
    (pincode: string, localityHint?: string) => {
      const cleanPin = pincode.replace(/\D/g, '').slice(0, 6);
      if (!/^[1-9][0-9]{5}$/.test(cleanPin)) return;

      const matchedZone = dataset.zones.find((z) => z.pincodes.includes(cleanPin));
      const matchedCity = matchedZone
        ? dataset.cities.find((c) => c.id === matchedZone.cityId)
        : dataset.cities.find((c) => cleanPin.startsWith('520'));

      setCustomerLocation({
        cityId: matchedCity?.id || '',
        cityName: matchedCity?.name || (cleanPin.startsWith('522') ? 'Guntur / Outside VMC' : 'Outside Vijayawada'),
        state: matchedCity?.state || 'Andhra Pradesh',
        pincode: cleanPin,
        locality:
          localityHint?.trim() ||
          matchedZone?.localities[0] ||
          (cleanPin === '520012'
            ? 'Bhavanipuram'
            : cleanPin === '520001'
              ? 'One Town'
              : cleanPin === '520002'
                ? 'Governorpet'
                : cleanPin === '520003'
                  ? 'Gandhi Nagar'
                  : cleanPin === '520010'
                    ? 'Benz Circle'
                    : cleanPin === '520004'
                      ? 'Gunadala'
                      : `PIN ${cleanPin}`),
        zoneId: matchedZone?.id,
        zoneName: matchedZone?.name,
        source: 'pincode',
      });
    },
    [dataset.zones, dataset.cities]
  );

  const setManualVijayawadaAddress = useCallback(
    (params: {
      locality: string;
      city: string;
      state?: string;
      pincode: string;
      lat?: number;
      lng?: number;
      zoneId?: string;
      wardNumber?: number;
      formattedAddress?: string;
    }) => {
      const matchedZone =
        (params.zoneId ? dataset.zones.find((z) => z.id === params.zoneId) : undefined) ||
        dataset.zones.find((z) =>
          z.localities.some((l) => l.toLowerCase() === params.locality.trim().toLowerCase())
        );

      setCustomerLocation({
        cityId: matchedZone?.cityId || (params.city.toLowerCase().includes('vijayawada') ? 'vijayawada' : ''),
        cityName: params.city.trim(),
        state: (params.state || BUSINESS_CONFIG.launchState).trim(),
        pincode: params.pincode.replace(/\D/g, '').slice(0, 6),
        locality: params.locality.trim(),
        formattedAddress:
          params.formattedAddress ||
          `${params.locality.trim()}, ${params.city.trim()}, ${params.state || BUSINESS_CONFIG.launchState} ${params.pincode}`,
        lat: params.lat,
        lng: params.lng,
        zoneId: params.zoneId || matchedZone?.id,
        zoneName: matchedZone?.name,
        wardNumber: params.wardNumber,
        source: 'manual',
      });
    },
    [dataset.zones]
  );

  const setLocationFromGoogleAddress = useCallback(
    (parsed: ParsedGoogleAddress) => {
      const matchedCity = dataset.cities.find(
        (c) => c.name.toLowerCase() === (parsed.city || '').toLowerCase()
      );
      setCustomerLocation({
        cityId: matchedCity?.id || '',
        cityName: parsed.city || BUSINESS_CONFIG.launchCity,
        state: parsed.state || BUSINESS_CONFIG.launchState,
        pincode: parsed.pincode || '',
        locality: parsed.locality || parsed.street || 'Pinned Location',
        formattedAddress:
          parsed.formattedAddress ||
          `${parsed.locality || parsed.street}, ${parsed.city || BUSINESS_CONFIG.launchCity}`,
        lat: parsed.lat,
        lng: parsed.lng,
        source: 'map',
      });
    },
    [dataset.cities]
  );

  const detectGpsLocation = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return { ok: false, error: 'Geolocation is not supported in this browser.' };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = Number(pos.coords.latitude.toFixed(6));
          const lng = Number(pos.coords.longitude.toFixed(6));

          try {
            const res = await fetch(
              `/api/maps/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
            );
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.formattedAddress) {
              const parsed = parseGoogleAddressComponents({
                addressComponents: data.addressComponents || [],
                formattedAddress: data.formattedAddress || '',
                lat,
                lng,
                placeId: data.placeId,
              });
              setCustomerLocation({
                cityId: '',
                cityName: parsed.city || 'GPS Location',
                state: parsed.state || BUSINESS_CONFIG.launchState,
                pincode: parsed.pincode || '',
                locality: parsed.locality || parsed.street || 'Current GPS Pin',
                formattedAddress: parsed.formattedAddress || `${lat}, ${lng}`,
                lat,
                lng,
                source: 'gps',
              });
              resolve({ ok: true });
              return;
            }
          } catch {
            // fallback to coordinates-only below
          }

          setCustomerLocation({
            cityId: '',
            cityName: 'GPS Coordinates',
            state: BUSINESS_CONFIG.launchState,
            pincode: '',
            locality: `GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
            formattedAddress: `GPS coordinates ${lat}, ${lng}`,
            lat,
            lng,
            source: 'gps',
          });
          resolve({ ok: true });
        },
        (err) => {
          resolve({
            ok: false,
            error:
              err.code === err.PERMISSION_DENIED
                ? 'Location permission was denied. Please choose your Vijayawada zone, PIN code, or drop a pin on the map.'
                : 'Unable to detect GPS coordinates right now.',
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }, []);

  const checkProductDeliverable = useCallback(
    (product: Product) =>
      isProductDeliverableToArea({
        product,
        serviceability,
        publicShops: dataset.publicShops,
      }),
    [serviceability, dataset.publicShops]
  );

  return (
    <LocationContext.Provider
      value={{
        customerLocation,
        dataset,
        datasetLoading,
        serviceability,
        isLocationModalOpen,
        openLocationModal: () => setIsLocationModalOpen(true),
        closeLocationModal: () => setIsLocationModalOpen(false),
        refreshDataset,
        updateCustomerLocation,
        setLocationByPincode,
        setManualVijayawadaAddress,
        setLocationFromGoogleAddress,
        detectGpsLocation,
        checkProductDeliverable,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationService = () => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationService must be used within LocationProvider');
  return ctx;
};
