import React, { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  Polygon,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Compass,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import {
  VERIFIED_VIJAYAWADA_LOCALITIES,
  VIJAYAWADA_BOUNDARY_GEOJSON,
  VIJAYAWADA_MAP_CENTER,
} from '../../data/vijayawadaDefaults';
import {
  adminAssignDriverZones,
  batchToggleWards,
  fetchServiceabilityDataset,
  savePublicDriver,
  savePublicShop,
  saveServiceCity,
  saveServiceWard,
  saveServiceZone,
  seedVijayawadaServiceArea,
  syncSellerToPublicShop,
} from '../../services/serviceAreaStore';
import {
  evaluateLocationServiceability,
  extractGooglePolygonRings,
  isShopCurrentlyOpen,
  ServiceabilityDataset,
} from '../../services/serviceabilityService';
import type { ServiceabilityResult } from '../../types';
import { formatINR } from '../../services/indianValidation';
import type {
  DeliveryPartner,
  Order,
  PublicDriver,
  PublicShop,
  SellerProfile,
  ServiceCity,
  ServiceWard,
  ServiceZone,
} from '../../types';

type SubTab = 'map-cities' | 'zones' | 'wards' | 'shops' | 'drivers' | 'reports';

interface AdminServiceAreaPanelProps {
  orders: Order[];
  sellers: SellerProfile[];
  deliveryPartners: DeliveryPartner[];
  adminUid: string;
  adminEmail: string;
  mapsApiKey: string;
  onFeedback: (msg: string) => void;
  onRefresh: () => Promise<void>;
}

const HistoricalWardsOverlayLayer: React.FC<{ visible: boolean }> = ({ visible }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (!visible) {
      map.data.forEach((feature) => map.data.remove(feature));
      return;
    }

    let cancelled = false;
    map.data.setStyle({
      fillColor: '#FCA311',
      fillOpacity: 0.08,
      strokeColor: '#B45309',
      strokeWeight: 1,
      clickable: false,
    });
    map.data.loadGeoJson('/data/vijayawadaWards77Reference.geojson', undefined, () => {
      if (cancelled) {
        map.data.forEach((f) => map.data.remove(f));
      }
    });

    return () => {
      cancelled = true;
      map.data.forEach((feature) => map.data.remove(feature));
    };
  }, [map, visible]);

  return null;
};

const ServiceAreaMapInner: React.FC<{
  city: ServiceCity;
  shops: PublicShop[];
  drivers: PublicDriver[];
  showHistorical77Wards: boolean;
}> = ({ city, shops, drivers, showHistorical77Wards }) => {
  const apiStatus = useApiLoadingStatus();
  const boundaryPaths = useMemo(() => {
    const geo = city.boundaryGeoJson || (city.id === 'vijayawada' ? VIJAYAWADA_BOUNDARY_GEOJSON : null);
    return geo ? extractGooglePolygonRings(geo) : [];
  }, [city]);

  const mapCenter = useMemo(
    () =>
      city.id === 'vijayawada'
        ? VIJAYAWADA_MAP_CENTER
        : { lat: city.hubLat || VIJAYAWADA_MAP_CENTER.lat, lng: city.hubLng || VIJAYAWADA_MAP_CENTER.lng },
    [city]
  );

  const apiFailed =
    apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE;

  if (apiFailed) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-slate-50 space-y-2">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
        <p className="font-bold text-sm text-[#14213D]">Google Map preview could not load</p>
        <p className="text-xs text-slate-600 max-w-md">
          All city/zone/ward boundary rules remain active via verified GeoJSON polygons. Verify your Google Maps JavaScript API key if needed.
        </p>
      </div>
    );
  }

  if (apiStatus !== APILoadingStatus.LOADED) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
        Loading Vijayawada Service Area Map...
      </div>
    );
  }

  const onlineDrivers = drivers.filter(
    (d) =>
      d.cityId === city.id &&
      d.verificationStatus === 'Approved' &&
      d.isOnline &&
      typeof d.currentLat === 'number' &&
      typeof d.currentLng === 'number'
  );

  const cityShops = shops.filter(
    (s) => s.cityId === city.id && typeof s.lat === 'number' && typeof s.lng === 'number'
  );

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={mapCenter}
      defaultZoom={12}
      gestureHandling="greedy"
      streetViewControl={false}
      mapTypeControl={true}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      className="w-full h-full"
    >
      {boundaryPaths.map((paths, idx) => (
        <Polygon
          key={idx}
          paths={paths}
          strokeColor="#2563EB"
          strokeOpacity={0.9}
          strokeWeight={2.5}
          fillColor="#2563EB"
          fillOpacity={0.09}
          clickable={false}
        />
      ))}

      <HistoricalWardsOverlayLayer visible={showHistorical77Wards && city.id === 'vijayawada'} />

      {/* Operations Hub Marker (No circular radius) */}
      <AdvancedMarker
        position={{ lat: city.hubLat, lng: city.hubLng }}
        title={`${city.hubName} (${city.hubLocality} - ${city.hubPincode})`}
      >
        <Pin background="#FCA311" borderColor="#14213D" glyphColor="#14213D" scale={1.25} />
      </AdvancedMarker>

      {/* Active Shops */}
      {cityShops
        .filter((s) => !s.isHub)
        .map((shop) => (
          <AdvancedMarker
            key={shop.shopId}
            position={{ lat: shop.lat, lng: shop.lng }}
            title={`${shop.shopName} (${shop.locality})`}
          >
            <Pin background="#2563EB" borderColor="#ffffff" glyphColor="#ffffff" scale={0.95} />
          </AdvancedMarker>
        ))}

      {/* Online Delivery Partners */}
      {onlineDrivers.map((drv) => (
        <AdvancedMarker
          key={drv.partnerId}
          position={{ lat: drv.currentLat!, lng: drv.currentLng! }}
          title={`Online Partner ${drv.partnerId} (${drv.assignedZones.join(', ')})`}
        >
          <Pin background="#059669" borderColor="#ffffff" glyphColor="#ffffff" scale={0.9} />
        </AdvancedMarker>
      ))}
    </GoogleMap>
  );
};

export const AdminServiceAreaPanel: React.FC<AdminServiceAreaPanelProps> = ({
  orders,
  sellers,
  deliveryPartners,
  adminUid,
  adminEmail,
  mapsApiKey,
  onFeedback,
  onRefresh,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('map-cities');
  const [dataset, setDataset] = useState<Required<ServiceabilityDataset> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState('vijayawada');
  const [showHistorical77Wards, setShowHistorical77Wards] = useState(false);

  // Add New City Modal/Form state
  const [showAddCity, setShowAddCity] = useState(false);
  const [newCityForm, setNewCityForm] = useState({
    id: '',
    name: '',
    state: 'Andhra Pradesh',
    hubName: '',
    hubLocality: '',
    hubAddress: '',
    hubPincode: '',
    hubLat: 16.519,
    hubLng: 80.635,
    defaultDeliveryCharge: 29,
    freeDeliveryThreshold: 499,
    defaultMinOrderAmount: 149,
    boundaryGeoJson: '',
  });

  // Add / Edit Zone state
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ServiceZone | null>(null);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneForm, setNewZoneForm] = useState({
    id: '',
    name: '',
    shortCode: '',
    localitiesText: '',
    unverifiedLocalitiesText: '',
    pincodesText: '',
    deliveryCharge: 29,
    minOrderAmount: 149,
    freeDeliveryThreshold: 499,
    estimatedDeliveryText: '30–45 mins',
    allowOutsideMunicipalBoundary: false,
  });

  // Wards filter + edit
  const [wardSearch, setWardSearch] = useState('');
  const [wardZoneFilter, setWardZoneFilter] = useState('ALL');
  const [editingWard, setEditingWard] = useState<ServiceWard | null>(null);

  const [editCityDraft, setEditCityDraft] = useState<ServiceCity | null>(null);
  const [serverTestLoading, setServerTestLoading] = useState(false);
  const [serverTestResult, setServerTestResult] = useState<ServiceabilityResult | null>(null);
  const [serverTestError, setServerTestError] = useState('');

  // Live address tester state
  const [testInput, setTestInput] = useState({
    locality: 'Benz Circle',
    city: 'Vijayawada',
    pincode: '520010',
    lat: '16.4956621',
    lng: '80.6542015',
    subtotal: '599',
  });

  const loadServiceData = async () => {
    setLoading(true);
    try {
      const fresh = await fetchServiceabilityDataset();
      setDataset(fresh);
      if (fresh.cities.length > 0 && !fresh.cities.some((c) => c.id === selectedCityId)) {
        setSelectedCityId(fresh.cities[0].id);
      }
    } catch (err: any) {
      onFeedback(err?.message || 'Unable to load service area configuration from Firestore.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadServiceData();
  }, []);

  const activeCity = useMemo(() => {
    if (!dataset) return null;
    return dataset.cities.find((c) => c.id === selectedCityId) || dataset.cities[0] || null;
  }, [dataset, selectedCityId]);

  const cityZones = useMemo(
    () => (dataset ? dataset.zones.filter((z) => z.cityId === selectedCityId) : []),
    [dataset, selectedCityId]
  );

  const cityWards = useMemo(
    () =>
      dataset
        ? dataset.wards
            .filter((w) => w.cityId === selectedCityId)
            .sort((a, b) => a.wardNumber - b.wardNumber)
        : [],
    [dataset, selectedCityId]
  );

  const filteredWards = useMemo(() => {
    const q = wardSearch.trim().toLowerCase();
    return cityWards.filter((w) => {
      if (wardZoneFilter !== 'ALL' && w.zoneId !== wardZoneFilter) return false;
      if (!q) return true;
      return (
        w.wardName.toLowerCase().includes(q) ||
        String(w.wardNumber) === q ||
        w.localities.some((l) => l.toLowerCase().includes(q)) ||
        w.pincodes.some((p) => p.includes(q))
      );
    });
  }, [cityWards, wardSearch, wardZoneFilter]);

  const zoneAnalytics = useMemo(() => {
    if (!dataset) return [];
    const activeOrders = orders.filter((o) => o.orderStatus !== 'Cancelled');
    return cityZones.map((zone) => {
      const matchedOrders = activeOrders.filter((o) => {
        if (o.serviceAreaMeta?.zoneId === zone.id) return true;
        const pin = String(o.deliveryAddress?.pincode || '');
        const loc = String(o.deliveryAddress?.locality || '').toLowerCase();
        return (
          zone.pincodes.includes(pin) ||
          zone.localities.some((l) => loc.includes(l.toLowerCase()))
        );
      });
      const gmv = matchedOrders.reduce((s, o) => s + (o.pricing?.finalAmount || 0), 0);
      const openShops = dataset.publicShops.filter(
        (sh) =>
          sh.cityId === selectedCityId &&
          sh.approvalStatus === 'Approved' &&
          sh.serviceZones.includes(zone.id) &&
          isShopCurrentlyOpen(sh.operatingHours)
      ).length;
      const onlineDrivers = dataset.publicDrivers.filter(
        (d) =>
          d.cityId === selectedCityId &&
          d.verificationStatus === 'Approved' &&
          d.isOnline &&
          d.assignedZones.includes(zone.id)
      ).length;

      return {
        zone,
        orderCount: matchedOrders.length,
        gmv,
        openShops,
        onlineDrivers,
      };
    });
  }, [dataset, orders, cityZones, selectedCityId]);

  const testResult = useMemo(() => {
    if (!dataset) return null;
    const latNum = testInput.lat.trim() ? Number(testInput.lat) : undefined;
    const lngNum = testInput.lng.trim() ? Number(testInput.lng) : undefined;
    const subNum = testInput.subtotal.trim() ? Number(testInput.subtotal) : undefined;
    return evaluateLocationServiceability({
      location: {
        locality: testInput.locality,
        city: testInput.city,
        pincode: testInput.pincode,
        lat: Number.isFinite(latNum) ? latNum : undefined,
        lng: Number.isFinite(lngNum) ? lngNum : undefined,
      },
      dataset,
      subtotal: Number.isFinite(subNum) ? subNum : undefined,
    });
  }, [dataset, testInput]);

  if (loading || !dataset || !activeCity) {
    return (
      <div className="bg-white p-10 rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
        Loading Vijayawada City-Wide Serviceability configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & City Selector */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-extrabold text-lg text-[#14213D] flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#2563EB]" />
            City-Wide Service Areas &amp; Vijayawada Operations
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Active city: <strong>{activeCity.name}</strong> ({activeCity.state}) · Hub:{' '}
            <strong>{activeCity.hubLocality}</strong> ({activeCity.hubPincode}) — hub marker only, city coverage uses verified VMC polygon &amp; live shop/partner readiness.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
            className="border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white text-[#14213D]"
          >
            {dataset.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.active ? 'Active' : 'Paused'})
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={busyId === 'seed-vja'}
            onClick={async () => {
              setBusyId('seed-vja');
              try {
                await seedVijayawadaServiceArea(adminUid, adminEmail);
                onFeedback('Vijayawada VMC city, 4 zones, 86 wards & Bhavanipuram hub seeded/synced in Firestore.');
                await loadServiceData();
                await onRefresh();
              } catch (err: any) {
                onFeedback(err?.message || 'Unable to sync Vijayawada defaults to Firestore.');
              } finally {
                setBusyId(null);
              }
            }}
            className="px-3.5 py-2 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busyId === 'seed-vja' ? 'animate-spin' : ''}`} />
            Sync Vijayawada Defaults to Firestore
          </button>

          <button
            type="button"
            onClick={() => setShowAddCity((prev) => !prev)}
            className="px-3.5 py-2 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add City
          </button>
        </div>
      </div>

      {/* Add New City Drawer */}
      {showAddCity && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newCityForm.name.trim() || !newCityForm.hubLocality.trim()) return;
            const rawGeo = newCityForm.boundaryGeoJson.trim();
            if (rawGeo) {
              try {
                const parsed = JSON.parse(rawGeo);
                if (extractGooglePolygonRings(parsed).length === 0) {
                  onFeedback('Boundary GeoJSON must contain at least one valid Polygon or MultiPolygon feature.');
                  return;
                }
              } catch {
                onFeedback('Boundary GeoJSON is not valid JSON.');
                return;
              }
            }
            const slug =
              (newCityForm.id || newCityForm.name)
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9_-]+/g, '-') || `city-${Date.now()}`;
            setBusyId('add-city');
            try {
              const saved = await saveServiceCity(
                {
                  id: slug,
                  name: newCityForm.name.trim(),
                  state: newCityForm.state.trim() || 'Andhra Pradesh',
                  country: 'India',
                  currency: 'INR',
                  hubName: newCityForm.hubName.trim() || `CARTZY ${newCityForm.name.trim()} Hub`,
                  hubLocality: newCityForm.hubLocality.trim(),
                  hubAddress:
                    newCityForm.hubAddress.trim() ||
                    `${newCityForm.hubLocality.trim()}, ${newCityForm.name.trim()}`,
                  hubPincode: newCityForm.hubPincode.trim() || '520001',
                  hubLat: Number(newCityForm.hubLat) || 16.519,
                  hubLng: Number(newCityForm.hubLng) || 80.635,
                  boundaryGeoJson: rawGeo || undefined,
                  boundarySource: rawGeo
                    ? 'Admin GeoJSON Boundary'
                    : 'Locality / Zone Configured',
                  totalWardsConfigured: 0,
                  defaultDeliveryCharge: Number(newCityForm.defaultDeliveryCharge) || 29,
                  freeDeliveryThreshold: Number(newCityForm.freeDeliveryThreshold) || 499,
                  defaultMinOrderAmount: Number(newCityForm.defaultMinOrderAmount) || 149,
                  active: true,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
                adminUid,
                adminEmail
              );
              setSelectedCityId(saved.id);
              setShowAddCity(false);
              onFeedback(`Added service city ${saved.name}. Configure its delivery zones next.`);
              await loadServiceData();
            } catch (err: any) {
              onFeedback(err?.message || 'Unable to save new service city.');
            } finally {
              setBusyId(null);
            }
          }}
          className="bg-white p-5 rounded-2xl border border-[#2563EB]/40 space-y-3"
        >
          <h3 className="font-bold text-sm text-[#14213D]">Configure Additional Launch City</h3>
          <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
            <input
              required
              placeholder="City Name (e.g. Mangalagiri)"
              value={newCityForm.name}
              onChange={(e) => setNewCityForm({ ...newCityForm, name: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="State (e.g. Andhra Pradesh)"
              value={newCityForm.state}
              onChange={(e) => setNewCityForm({ ...newCityForm, state: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              placeholder="Operations Hub Locality"
              value={newCityForm.hubLocality}
              onChange={(e) => setNewCityForm({ ...newCityForm, hubLocality: e.target.value })}
              className="border border-slate-300 rounded-xl px-3 py-2"
            />
            <input
              required
              maxLength={6}
              placeholder="Hub PIN Code"
              value={newCityForm.hubPincode}
              onChange={(e) =>
                setNewCityForm({ ...newCityForm, hubPincode: e.target.value.replace(/\D/g, '') })
              }
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              type="number"
              step="0.000001"
              placeholder="Hub Latitude"
              value={newCityForm.hubLat}
              onChange={(e) => setNewCityForm({ ...newCityForm, hubLat: Number(e.target.value) })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              type="number"
              step="0.000001"
              placeholder="Hub Longitude"
              value={newCityForm.hubLng}
              onChange={(e) => setNewCityForm({ ...newCityForm, hubLng: Number(e.target.value) })}
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              type="number"
              placeholder="Default Fee ₹"
              value={newCityForm.defaultDeliveryCharge}
              onChange={(e) =>
                setNewCityForm({ ...newCityForm, defaultDeliveryCharge: Number(e.target.value) })
              }
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
            <input
              type="number"
              placeholder="Min Order ₹"
              value={newCityForm.defaultMinOrderAmount}
              onChange={(e) =>
                setNewCityForm({ ...newCityForm, defaultMinOrderAmount: Number(e.target.value) })
              }
              className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
            />
          </div>
          <textarea
            rows={2}
            placeholder="Optional verified GeoJSON Polygon/FeatureCollection for this city boundary"
            value={newCityForm.boundaryGeoJson}
            onChange={(e) => setNewCityForm({ ...newCityForm, boundaryGeoJson: e.target.value })}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busyId === 'add-city'}
              className="px-4 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold"
            >
              Save New City
            </button>
            <button
              type="button"
              onClick={() => setShowAddCity(false)}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'map-cities', label: 'Vijayawada Boundary Map & Cities', icon: MapIcon },
            { id: 'zones', label: `Delivery Zones (${cityZones.length})`, icon: Layers },
            { id: 'wards', label: `Configurable Wards (${cityWards.length})`, icon: MapPin },
            { id: 'shops', label: `Shop Coverage & Hours (${dataset.publicShops.length})`, icon: Store },
            { id: 'drivers', label: `Partner Zone Assignments (${deliveryPartners.length})`, icon: Truck },
            { id: 'reports', label: 'Area Reports & Live Tester', icon: BarChart3 },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
              subTab === item.id
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-[#14213D] hover:bg-slate-50'
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      {/* 1. Interactive Vijayawada Boundary Map & City Controls */}
      {subTab === 'map-cities' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#14213D]">
                  {activeCity.name} Municipal Boundary, Hub, Shops &amp; Fleet Map
                </h3>
                <p className="text-[11px] text-slate-500">
                  Source: {activeCity.boundarySource || 'Verified Municipal Boundary'}. Delivery covers the entire municipal boundary — Bhavanipuram is the operations hub (no 10 km radius restriction).
                </p>
              </div>
              {activeCity.id === 'vijayawada' && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showHistorical77Wards}
                    onChange={(e) => setShowHistorical77Wards(e.target.checked)}
                  />
                  Show Historical 77-Ward Reference Overlay
                </label>
              )}
            </div>

            {showHistorical77Wards && activeCity.id === 'vijayawada' && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                Historical reference only: DataMeet&apos;s public VMC shapefile contains 77 wards. Your active 2026 CARTZY configuration supports <strong>{cityWards.length} wards</strong> in the Configurable Wards tab without inventing unverified polygons.
              </div>
            )}

            <div className="relative w-full h-[360px] sm:h-[420px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
              {!mapsApiKey ? (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2 bg-slate-50">
                  <AlertTriangle className="w-7 h-7 text-amber-600" />
                  <p className="font-bold text-sm text-[#14213D]">Google Maps Key Not Configured</p>
                  <p className="text-xs text-slate-600 max-w-md">
                    Configure <code>VITE_GOOGLE_MAPS_API_KEY</code> to view the interactive map. Polygon boundary checking runs accurately using verified GeoJSON coordinates.
                  </p>
                </div>
              ) : (
                <APIProvider apiKey={mapsApiKey} libraries={['places', 'marker']} language="en" region="IN">
                  <ServiceAreaMapInner
                    city={activeCity}
                    shops={dataset.publicShops}
                    drivers={dataset.publicDrivers}
                    showHistorical77Wards={showHistorical77Wards}
                  />
                </APIProvider>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#FCA311] border border-[#14213D]" />
                Operations Hub ({activeCity.hubLocality})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[#2563EB]" />
                VMC Municipal Boundary &amp; Approved Shops
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600" />
                Online Delivery Partners
              </span>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-200 space-y-4 h-fit">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-[#14213D]">City Status &amp; Hub</h3>
              <button
                type="button"
                disabled={busyId === `toggle-city-${activeCity.id}`}
                onClick={async () => {
                  setBusyId(`toggle-city-${activeCity.id}`);
                  try {
                    const updated: ServiceCity = { ...activeCity, active: !activeCity.active };
                    await saveServiceCity(updated, adminUid, adminEmail);
                    onFeedback(`${activeCity.name} service status set to ${updated.active ? 'Active' : 'Paused'}.`);
                    await loadServiceData();
                  } catch (err: any) {
                    onFeedback(err?.message || 'Unable to update city status.');
                  } finally {
                    setBusyId(null);
                  }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  activeCity.active
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {activeCity.active ? 'City Active (Click to Pause)' : 'City Paused (Click to Resume)'}
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200 space-y-1">
                <p className="font-bold text-[#14213D]">{activeCity.hubName}</p>
                <p className="text-slate-600">{activeCity.hubAddress}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  Coords: {activeCity.hubLat.toFixed(6)}, {activeCity.hubLng.toFixed(6)} · PIN {activeCity.hubPincode}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200">
                  <p className="text-slate-500">Active Zones</p>
                  <p className="text-lg font-extrabold text-[#14213D] font-mono">
                    {cityZones.filter((z) => z.enabled).length} / {cityZones.length}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200">
                  <p className="text-slate-500">Active Wards</p>
                  <p className="text-lg font-extrabold text-[#14213D] font-mono">
                    {cityWards.filter((w) => w.enabled).length} / {cityWards.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditCityDraft(
                    editCityDraft?.id === activeCity.id ? null : { ...activeCity }
                  )
                }
                className="w-full py-2 rounded-xl border border-slate-300 text-[#14213D] font-bold hover:bg-slate-50"
              >
                {editCityDraft?.id === activeCity.id
                  ? 'Close City & Boundary Editor'
                  : 'Edit Hub Details & Boundary GeoJSON'}
              </button>

              {editCityDraft?.id === activeCity.id && (
                <div className="p-3 rounded-xl bg-blue-50/70 border border-[#2563EB]/30 space-y-2">
                  <input
                    value={editCityDraft.hubName}
                    onChange={(e) => setEditCityDraft({ ...editCityDraft, hubName: e.target.value })}
                    placeholder="Hub Name"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={editCityDraft.hubLocality}
                      onChange={(e) => setEditCityDraft({ ...editCityDraft, hubLocality: e.target.value })}
                      placeholder="Hub Locality"
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                    />
                    <input
                      maxLength={6}
                      value={editCityDraft.hubPincode}
                      onChange={(e) =>
                        setEditCityDraft({
                          ...editCityDraft,
                          hubPincode: e.target.value.replace(/\D/g, ''),
                        })
                      }
                      placeholder="Hub PIN"
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                    />
                  </div>
                  <input
                    value={editCityDraft.hubAddress}
                    onChange={(e) => setEditCityDraft({ ...editCityDraft, hubAddress: e.target.value })}
                    placeholder="Hub Address"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.000001"
                      value={editCityDraft.hubLat}
                      onChange={(e) =>
                        setEditCityDraft({ ...editCityDraft, hubLat: Number(e.target.value) })
                      }
                      placeholder="Hub Lat"
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                    />
                    <input
                      type="number"
                      step="0.000001"
                      value={editCityDraft.hubLng}
                      onChange={(e) =>
                        setEditCityDraft({ ...editCityDraft, hubLng: Number(e.target.value) })
                      }
                      placeholder="Hub Lng"
                      className="border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-mono"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={editCityDraft.boundaryGeoJson || ''}
                    onChange={(e) =>
                      setEditCityDraft({
                        ...editCityDraft,
                        boundaryGeoJson: e.target.value.trim() || undefined,
                      })
                    }
                    placeholder="Optional Custom City Boundary GeoJSON Polygon/FeatureCollection (leave blank to use verified VMC boundary)"
                    className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    disabled={busyId === `save-city-${activeCity.id}`}
                    onClick={async () => {
                      if (!/^[1-9][0-9]{5}$/.test(editCityDraft.hubPincode)) {
                        onFeedback('Enter a valid 6-digit hub PIN code.');
                        return;
                      }
                      if (editCityDraft.boundaryGeoJson) {
                        try {
                          const parsed = JSON.parse(editCityDraft.boundaryGeoJson);
                          if (extractGooglePolygonRings(parsed).length === 0) {
                            onFeedback('Boundary GeoJSON must contain a valid Polygon or MultiPolygon.');
                            return;
                          }
                        } catch {
                          onFeedback('Boundary GeoJSON is not valid JSON.');
                          return;
                        }
                      }
                      setBusyId(`save-city-${activeCity.id}`);
                      try {
                        await saveServiceCity(editCityDraft, adminUid, adminEmail);
                        onFeedback(`Saved hub and boundary settings for ${editCityDraft.name}.`);
                        setEditCityDraft(null);
                        await loadServiceData();
                      } catch (err: any) {
                        onFeedback(err?.message || 'Unable to save city configuration.');
                      } finally {
                        setBusyId(null);
                      }
                    }}
                    className="w-full py-2 rounded-xl bg-[#2563EB] text-white font-bold inline-flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" /> Save City Configuration
                  </button>
                </div>
              )}

              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-[#14213D] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-[#2563EB] inline mr-1" />
                Orders require <strong>inside active boundary</strong> + <strong>approved open shop</strong> + <strong>online delivery partner assigned to that zone</strong>.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Delivery Zones Management */}
      {subTab === 'zones' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200">
            <div>
              <h3 className="font-bold text-[#14213D]">
                Operational Delivery Zones for {activeCity.name}
              </h3>
              <p className="text-xs text-slate-500">
                Enable/disable zones, adjust delivery fees, minimum order thresholds, and peri-urban boundary overrides (e.g. Gollapudi / Kanuru).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddZone((prev) => !prev)}
              className="px-3.5 py-2 rounded-xl bg-[#14213D] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Zone
            </button>
          </div>

          {showAddZone && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newZoneForm.name.trim()) return;
                const zoneId =
                  (newZoneForm.id || `${activeCity.id}-${newZoneForm.shortCode || newZoneForm.name}`)
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]+/g, '-');
                setBusyId('add-zone');
                try {
                  await saveServiceZone(
                    {
                      id: zoneId,
                      cityId: activeCity.id,
                      name: newZoneForm.name.trim(),
                      shortCode: (newZoneForm.shortCode || 'ZONE').trim().toUpperCase(),
                      localities: newZoneForm.localitiesText
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      unverifiedLocalities: newZoneForm.unverifiedLocalitiesText
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      pincodes: newZoneForm.pincodesText
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      wardNumbers: [],
                      boundaryVerified: true,
                      allowOutsideMunicipalBoundary: newZoneForm.allowOutsideMunicipalBoundary,
                      centerLat: activeCity.hubLat,
                      centerLng: activeCity.hubLng,
                      deliveryCharge: Number(newZoneForm.deliveryCharge) || 29,
                      minOrderAmount: Number(newZoneForm.minOrderAmount) || 149,
                      freeDeliveryThreshold: Number(newZoneForm.freeDeliveryThreshold) || 499,
                      estimatedDeliveryText: newZoneForm.estimatedDeliveryText || '30–45 mins',
                      enabled: true,
                      updatedAt: new Date().toISOString(),
                    },
                    adminUid,
                    adminEmail
                  );
                  setShowAddZone(false);
                  setNewZoneForm({
                    id: '',
                    name: '',
                    shortCode: '',
                    localitiesText: '',
                    unverifiedLocalitiesText: '',
                    pincodesText: '',
                    deliveryCharge: 29,
                    minOrderAmount: 149,
                    freeDeliveryThreshold: 499,
                    estimatedDeliveryText: '30–45 mins',
                    allowOutsideMunicipalBoundary: false,
                  });
                  onFeedback(`Created zone ${newZoneForm.name.trim()}.`);
                  await loadServiceData();
                } catch (err: any) {
                  onFeedback(err?.message || 'Unable to create zone.');
                } finally {
                  setBusyId(null);
                }
              }}
              className="bg-white p-5 rounded-2xl border border-[#2563EB]/40 space-y-3 text-xs"
            >
              <h4 className="font-bold text-[#14213D]">New Delivery Zone in {activeCity.name}</h4>
              <div className="grid sm:grid-cols-3 gap-3">
                <input
                  required
                  placeholder="Zone Name (e.g. West Zone — Ibrahimpatnam)"
                  value={newZoneForm.name}
                  onChange={(e) => setNewZoneForm({ ...newZoneForm, name: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2"
                />
                <input
                  required
                  placeholder="Short Code (e.g. WEST)"
                  value={newZoneForm.shortCode}
                  onChange={(e) => setNewZoneForm({ ...newZoneForm, shortCode: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 uppercase font-mono"
                />
                <input
                  placeholder="PIN Codes (comma separated)"
                  value={newZoneForm.pincodesText}
                  onChange={(e) => setNewZoneForm({ ...newZoneForm, pincodesText: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 font-mono"
                />
                <input
                  placeholder="Verified Localities (comma separated)"
                  value={newZoneForm.localitiesText}
                  onChange={(e) => setNewZoneForm({ ...newZoneForm, localitiesText: e.target.value })}
                  className="sm:col-span-2 border border-slate-300 rounded-xl px-3 py-2"
                />
                <input
                  placeholder="Fringe / Peri-urban Localities"
                  value={newZoneForm.unverifiedLocalitiesText}
                  onChange={(e) =>
                    setNewZoneForm({ ...newZoneForm, unverifiedLocalitiesText: e.target.value })
                  }
                  className="border border-slate-300 rounded-xl px-3 py-2"
                />
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <label className="font-semibold">
                  Fee ₹
                  <input
                    type="number"
                    value={newZoneForm.deliveryCharge}
                    onChange={(e) =>
                      setNewZoneForm({ ...newZoneForm, deliveryCharge: Number(e.target.value) })
                    }
                    className="ml-2 w-20 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                  />
                </label>
                <label className="font-semibold">
                  Min Order ₹
                  <input
                    type="number"
                    value={newZoneForm.minOrderAmount}
                    onChange={(e) =>
                      setNewZoneForm({ ...newZoneForm, minOrderAmount: Number(e.target.value) })
                    }
                    className="ml-2 w-20 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                  />
                </label>
                <label className="font-semibold">
                  Free Above ₹
                  <input
                    type="number"
                    value={newZoneForm.freeDeliveryThreshold}
                    onChange={(e) =>
                      setNewZoneForm({
                        ...newZoneForm,
                        freeDeliveryThreshold: Number(e.target.value),
                      })
                    }
                    className="ml-2 w-20 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                  />
                </label>
                <label className="font-semibold">
                  ETA Window
                  <input
                    type="text"
                    value={newZoneForm.estimatedDeliveryText}
                    onChange={(e) =>
                      setNewZoneForm({ ...newZoneForm, estimatedDeliveryText: e.target.value })
                    }
                    className="ml-2 w-28 border border-slate-300 rounded-lg px-2 py-1"
                  />
                </label>
                <label className="inline-flex items-center gap-1.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={newZoneForm.allowOutsideMunicipalBoundary}
                    onChange={(e) =>
                      setNewZoneForm({
                        ...newZoneForm,
                        allowOutsideMunicipalBoundary: e.target.checked,
                      })
                    }
                  />
                  Allow peri-urban corridor
                </label>
                <button
                  type="submit"
                  disabled={busyId === 'add-zone'}
                  className="px-4 py-2 rounded-xl bg-[#2563EB] text-white font-bold"
                >
                  Save Zone
                </button>
              </div>
            </form>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {cityZones.map((zone) => {
              const isEditing = editingZoneId === zone.id && zoneDraft;
              return (
                <div key={zone.id} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {zone.shortCode} · {zone.id}
                      </span>
                      <h4 className="font-bold text-[#14213D] mt-1">{zone.name}</h4>
                      {zone.description && <p className="text-xs text-slate-500 mt-0.5">{zone.description}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `zone-${zone.id}`}
                      onClick={async () => {
                        setBusyId(`zone-${zone.id}`);
                        try {
                          await saveServiceZone({ ...zone, enabled: !zone.enabled }, adminUid, adminEmail);
                          onFeedback(`${zone.name} ${!zone.enabled ? 'enabled' : 'disabled'}.`);
                          await loadServiceData();
                        } catch (err: any) {
                          onFeedback(err?.message || 'Unable to update zone status.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                        zone.enabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {zone.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {!isEditing ? (
                    <>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200">
                          <span className="text-slate-500 block">Fee / Free Over</span>
                          <span className="font-mono font-bold text-[#14213D]">
                            ₹{zone.deliveryCharge} / ₹{zone.freeDeliveryThreshold}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200">
                          <span className="text-slate-500 block">Min Order</span>
                          <span className="font-mono font-bold text-[#14213D]">₹{zone.minOrderAmount}</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-200">
                          <span className="text-slate-500 block">ETA Window</span>
                          <span className="font-bold text-[#14213D]">{zone.estimatedDeliveryText}</span>
                        </div>
                      </div>

                      <div className="text-xs space-y-1">
                        <p>
                          <strong>Verified Localities:</strong> {zone.localities.join(', ') || 'None'}
                        </p>
                        <p className="font-mono text-[11px] text-slate-600">
                          PINs: {zone.pincodes.join(', ')}
                        </p>
                        {(zone.unverifiedLocalities || []).length > 0 && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-amber-900">
                              <strong>Peri-urban outside VMC boundary:</strong>{' '}
                              {zone.unverifiedLocalities!.join(', ')}
                            </span>
                            <button
                              type="button"
                              disabled={busyId === `peri-${zone.id}`}
                              onClick={async () => {
                                setBusyId(`peri-${zone.id}`);
                                try {
                                  const nextAllow = !zone.allowOutsideMunicipalBoundary;
                                  await saveServiceZone(
                                    { ...zone, allowOutsideMunicipalBoundary: nextAllow },
                                    adminUid,
                                    adminEmail
                                  );
                                  onFeedback(
                                    `Peri-urban extension for ${zone.unverifiedLocalities!.join(', ')} ${
                                      nextAllow ? 'ENABLED' : 'RESTRICTED to verified VMC boundary'
                                    }.`
                                  );
                                  await loadServiceData();
                                } catch (err: any) {
                                  onFeedback(err?.message || 'Unable to update peri-urban setting.');
                                } finally {
                                  setBusyId(null);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                                zone.allowOutsideMunicipalBoundary
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-white border border-amber-400 text-amber-900'
                              }`}
                            >
                              {zone.allowOutsideMunicipalBoundary
                                ? 'Peri-Urban Allowed (Click to Restrict)'
                                : 'Blocked Outside VMC (Enable Corridor)'}
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingZoneId(zone.id);
                          setZoneDraft({ ...zone });
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-[#14213D] hover:bg-slate-50"
                      >
                        Edit Zone Rules &amp; Localities
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="font-semibold">
                          Delivery Fee ₹
                          <input
                            type="number"
                            value={zoneDraft.deliveryCharge}
                            onChange={(e) =>
                              setZoneDraft({ ...zoneDraft, deliveryCharge: Number(e.target.value) })
                            }
                            className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                          />
                        </label>
                        <label className="font-semibold">
                          Min Order ₹
                          <input
                            type="number"
                            value={zoneDraft.minOrderAmount}
                            onChange={(e) =>
                              setZoneDraft({ ...zoneDraft, minOrderAmount: Number(e.target.value) })
                            }
                            className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                          />
                        </label>
                        <label className="font-semibold">
                          Free Above ₹
                          <input
                            type="number"
                            value={zoneDraft.freeDeliveryThreshold}
                            onChange={(e) =>
                              setZoneDraft({
                                ...zoneDraft,
                                freeDeliveryThreshold: Number(e.target.value),
                              })
                            }
                            className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1 font-mono"
                          />
                        </label>
                        <label className="font-semibold">
                          ETA Label
                          <input
                            value={zoneDraft.estimatedDeliveryText}
                            onChange={(e) =>
                              setZoneDraft({ ...zoneDraft, estimatedDeliveryText: e.target.value })
                            }
                            className="w-full mt-1 border border-slate-300 rounded-lg px-2 py-1"
                          />
                        </label>
                      </div>
                      <label className="block font-semibold">
                        Verified Localities (comma separated)
                        <input
                          value={zoneDraft.localities.join(', ')}
                          onChange={(e) =>
                            setZoneDraft({
                              ...zoneDraft,
                              localities: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full mt-1 border border-slate-300 rounded-lg px-2.5 py-1.5"
                        />
                      </label>
                      <label className="block font-semibold">
                        Peri-urban / Fringe Localities (comma separated)
                        <input
                          value={(zoneDraft.unverifiedLocalities || []).join(', ')}
                          onChange={(e) =>
                            setZoneDraft({
                              ...zoneDraft,
                              unverifiedLocalities: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full mt-1 border border-slate-300 rounded-lg px-2.5 py-1.5"
                        />
                      </label>
                      <label className="block font-semibold">
                        PIN Codes (comma separated)
                        <input
                          value={zoneDraft.pincodes.join(', ')}
                          onChange={(e) =>
                            setZoneDraft({
                              ...zoneDraft,
                              pincodes: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full mt-1 border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                        />
                      </label>
                      <label className="inline-flex items-center gap-2 font-semibold">
                        <input
                          type="checkbox"
                          checked={Boolean(zoneDraft.allowOutsideMunicipalBoundary)}
                          onChange={(e) =>
                            setZoneDraft({
                              ...zoneDraft,
                              allowOutsideMunicipalBoundary: e.target.checked,
                            })
                          }
                        />
                        Allow peri-urban corridor outside verified VMC outer polygon
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === `save-zone-${zone.id}`}
                          onClick={async () => {
                            setBusyId(`save-zone-${zone.id}`);
                            try {
                              await saveServiceZone(zoneDraft, adminUid, adminEmail);
                              setEditingZoneId(null);
                              onFeedback(`Updated ${zoneDraft.name}.`);
                              await loadServiceData();
                            } catch (err: any) {
                              onFeedback(err?.message || 'Unable to save zone changes.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-[#2563EB] text-white font-bold inline-flex items-center gap-1"
                        >
                          <Save className="w-3.5 h-3.5" /> Save Zone
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingZoneId(null)}
                          className="px-3.5 py-1.5 rounded-xl border border-slate-300 font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Configurable 86-Ward VMC Management */}
      {subTab === 'wards' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-[#14213D]">
                Configurable VMC Ward Structure ({cityWards.length} Wards)
              </h3>
              <p className="text-xs text-slate-500">
                Supports the current 86-ward structure without hardcoding stale polygons. Edit ward names, zone mappings, localities, or paste verified 2026 ward GeoJSON boundaries.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={filteredWards.length === 0 || busyId === 'batch-wards'}
                onClick={async () => {
                  setBusyId('batch-wards');
                  try {
                    await batchToggleWards({
                      wards: filteredWards,
                      enabled: true,
                      actorUid: adminUid,
                      actorEmail: adminEmail,
                    });
                    onFeedback(`Activated ${filteredWards.length} visible wards.`);
                    await loadServiceData();
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Activate Visible ({filteredWards.length})
              </button>
              <button
                type="button"
                disabled={filteredWards.length === 0 || busyId === 'batch-wards'}
                onClick={async () => {
                  setBusyId('batch-wards');
                  try {
                    await batchToggleWards({
                      wards: filteredWards,
                      enabled: false,
                      actorUid: adminUid,
                      actorEmail: adminEmail,
                    });
                    onFeedback(`Deactivated ${filteredWards.length} visible wards.`);
                    await loadServiceData();
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 text-xs font-bold"
              >
                Deactivate Visible
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <input
              placeholder="Search ward #, name, locality or PIN..."
              value={wardSearch}
              onChange={(e) => setWardSearch(e.target.value)}
              className="flex-1 min-w-[220px] border border-slate-300 rounded-xl px-3 py-2"
            />
            <select
              value={wardZoneFilter}
              onChange={(e) => setWardZoneFilter(e.target.value)}
              className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
            >
              <option value="ALL">All Zones ({cityWards.length})</option>
              {cityZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.shortCode} · {z.name}
                </option>
              ))}
            </select>
          </div>

          {editingWard && (
            <div className="p-4 rounded-2xl bg-blue-50/70 border border-[#2563EB]/40 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-[#14213D]">
                  Edit Ward #{editingWard.wardNumber} ({editingWard.id})
                </h4>
                <button
                  type="button"
                  onClick={() => setEditingWard(null)}
                  className="text-slate-500 font-semibold"
                >
                  Close
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2.5">
                <input
                  value={editingWard.wardName}
                  onChange={(e) => setEditingWard({ ...editingWard, wardName: e.target.value })}
                  placeholder="Ward Name"
                  className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
                />
                <select
                  value={editingWard.zoneId}
                  onChange={(e) => setEditingWard({ ...editingWard, zoneId: e.target.value })}
                  className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
                >
                  {cityZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
                <select
                  value={editingWard.boundaryStatus}
                  onChange={(e) =>
                    setEditingWard({
                      ...editingWard,
                      boundaryStatus: e.target.value as ServiceWard['boundaryStatus'],
                    })
                  }
                  className="border border-slate-300 rounded-xl px-3 py-2 bg-white"
                >
                  <option value="Delimitation Pending Polygon">Delimitation Pending Polygon</option>
                  <option value="Locality Mapped">Locality Mapped</option>
                  <option value="Verified VMC">Verified VMC</option>
                  <option value="Official Ward Polygon Verified">Official Ward Polygon Verified</option>
                  <option value="Outside VMC">Outside VMC</option>
                </select>
                <input
                  value={editingWard.localities.join(', ')}
                  onChange={(e) =>
                    setEditingWard({
                      ...editingWard,
                      localities: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Localities (comma separated)"
                  className="sm:col-span-2 border border-slate-300 rounded-xl px-3 py-2 bg-white"
                />
                <input
                  value={editingWard.pincodes.join(', ')}
                  onChange={(e) =>
                    setEditingWard({
                      ...editingWard,
                      pincodes: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="PIN codes"
                  className="border border-slate-300 rounded-xl px-3 py-2 font-mono bg-white"
                />
              </div>
              <textarea
                rows={2}
                placeholder="Optional Official 2026 Ward GeoJSON Polygon"
                value={editingWard.geoJsonPolygon || ''}
                onChange={(e) =>
                  setEditingWard({ ...editingWard, geoJsonPolygon: e.target.value || undefined })
                }
                className="w-full border border-slate-300 rounded-xl px-3 py-2 font-mono bg-white"
              />
              <button
                type="button"
                disabled={busyId === `save-ward-${editingWard.id}`}
                onClick={async () => {
                  if (editingWard.geoJsonPolygon) {
                    try {
                      const parsed = JSON.parse(editingWard.geoJsonPolygon);
                      if (extractGooglePolygonRings(parsed).length === 0) {
                        onFeedback('Ward GeoJSON must contain a valid Polygon or MultiPolygon.');
                        return;
                      }
                    } catch {
                      onFeedback('Ward GeoJSON is not valid JSON.');
                      return;
                    }
                  }
                  setBusyId(`save-ward-${editingWard.id}`);
                  try {
                    await saveServiceWard(editingWard, adminUid, adminEmail);
                    onFeedback(`Saved Ward #${editingWard.wardNumber}.`);
                    setEditingWard(null);
                    await loadServiceData();
                  } catch (err: any) {
                    onFeedback(err?.message || 'Unable to save ward changes.');
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#2563EB] text-white font-bold"
              >
                Save Ward Changes
              </button>
            </div>
          )}

          <div className="max-h-[420px] overflow-y-auto overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-slate-50 border-b text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Ward #</th>
                  <th>Name &amp; Zone</th>
                  <th>Localities &amp; PINs</th>
                  <th>Polygon Status</th>
                  <th>Status</th>
                  <th className="px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWards.map((w) => {
                  const z = cityZones.find((zn) => zn.id === w.zoneId);
                  return (
                    <tr key={w.id} className="border-b last:border-b-0">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#14213D]">#{w.wardNumber}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-bold text-[#14213D]">{w.wardName}</p>
                        <p className="text-[11px] text-[#2563EB]">{z?.shortCode || w.zoneId}</p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <p>{w.localities.join(', ')}</p>
                        <p className="font-mono text-[10px] text-slate-500">{w.pincodes.join(', ')}</p>
                      </td>
                      <td className="py-2.5 pr-3 text-[11px] text-slate-600">{w.boundaryStatus}</td>
                      <td className="py-2.5 pr-3">
                        <button
                          type="button"
                          disabled={busyId === `ward-${w.id}`}
                          onClick={async () => {
                            setBusyId(`ward-${w.id}`);
                            try {
                              await saveServiceWard({ ...w, enabled: !w.enabled }, adminUid, adminEmail);
                              onFeedback(`Ward #${w.wardNumber} ${!w.enabled ? 'activated' : 'deactivated'}.`);
                              await loadServiceData();
                            } catch (err: any) {
                              onFeedback(err?.message || 'Unable to update ward status.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`px-2 py-0.5 rounded font-bold ${
                            w.enabled
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {w.enabled ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() => setEditingWard({ ...w })}
                          className="text-[#2563EB] font-bold hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Shop Coverage & Operating Hours */}
      {subTab === 'shops' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-[#14213D]">
                Shop Delivery Coverage &amp; IST Operating Hours
              </h3>
              <p className="text-xs text-slate-500">
                Products are only deliverable when an approved shop serving the customer&apos;s zone is open (not temporarily closed and within IST open/close hours).
              </p>
            </div>
            {sellers.some(
              (sl) =>
                sl.approvalStatus === 'Approved' &&
                !dataset.publicShops.some((ps) => ps.shopId === sl.sellerId)
            ) && (
              <button
                type="button"
                disabled={busyId === 'sync-sellers'}
                onClick={async () => {
                  setBusyId('sync-sellers');
                  try {
                    const missing = sellers.filter(
                      (sl) =>
                        sl.approvalStatus === 'Approved' &&
                        !dataset.publicShops.some((ps) => ps.shopId === sl.sellerId)
                    );
                    await Promise.all(missing.map((sl) => syncSellerToPublicShop(sl)));
                    onFeedback(`Synced ${missing.length} approved seller(s) into public shop coverage.`);
                    await loadServiceData();
                  } catch (err: any) {
                    onFeedback(err?.message || 'Unable to sync approved sellers.');
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyId === 'sync-sellers' ? 'animate-spin' : ''}`} />
                Sync Approved Sellers
              </button>
            )}
          </div>

          <div className="space-y-3">
            {dataset.publicShops.map((shop) => {
              const isOpenNow =
                shop.approvalStatus === 'Approved' && isShopCurrentlyOpen(shop.operatingHours);
              const hrs = shop.operatingHours || {
                openTime: '08:00',
                closeTime: '22:00',
                daysOpen: [0, 1, 2, 3, 4, 5, 6],
                is24x7: false,
                temporarilyClosed: false,
              };

              const persistShopHours = async (
                nextHours: typeof hrs,
                feedbackMsg: string
              ) => {
                setBusyId(`shop-${shop.shopId}`);
                try {
                  const updatedShop: PublicShop = {
                    ...shop,
                    operatingHours: nextHours,
                  };
                  await savePublicShop(updatedShop, adminUid, adminEmail);
                  if (sellers.some((sl) => sl.sellerId === shop.shopId)) {
                    await updateDoc(doc(db, 'sellers', shop.shopId), {
                      operatingHours: nextHours,
                      updatedAt: new Date().toISOString(),
                    }).catch(() => {});
                  }
                  onFeedback(feedbackMsg);
                  await loadServiceData();
                } catch (err: any) {
                  onFeedback(err?.message || 'Unable to update shop hours.');
                } finally {
                  setBusyId(null);
                }
              };

              return (
                <div
                  key={shop.shopId}
                  className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-extrabold text-sm text-[#14213D]">{shop.shopName}</h4>
                        {shop.isHub && (
                          <span className="px-2 py-0.5 rounded bg-[#FCA311]/20 text-[#14213D] font-bold text-[10px]">
                            Operations Hub
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500">
                        {shop.locality} ({shop.pincode}) · Status: <strong>{shop.approvalStatus}</strong> · Live:{' '}
                        <strong className={isOpenNow ? 'text-emerald-700' : 'text-rose-700'}>
                          {isOpenNow ? 'OPEN NOW' : 'CLOSED / PAUSED'}
                        </strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === `shop-${shop.shopId}`}
                      onClick={() =>
                        persistShopHours(
                          { ...hrs, temporarilyClosed: !hrs.temporarilyClosed },
                          `${shop.shopName} marked ${!hrs.temporarilyClosed ? 'Temporarily Closed' : 'Open'}.`
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl font-bold ${
                        hrs.temporarilyClosed
                          ? 'bg-emerald-600 text-white'
                          : 'border border-rose-300 text-rose-700 bg-white'
                      }`}
                    >
                      {hrs.temporarilyClosed ? 'Re-Open Shop' : 'Pause Shop Now'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="font-bold text-slate-600">Served Zones:</span>
                    {cityZones.map((z) => {
                      const active = shop.serviceZones.includes(z.id);
                      return (
                        <button
                          key={z.id}
                          type="button"
                          disabled={busyId === `shop-zone-${shop.shopId}`}
                          onClick={async () => {
                            setBusyId(`shop-zone-${shop.shopId}`);
                            try {
                              const nextZones = active
                                ? shop.serviceZones.filter((id) => id !== z.id)
                                : [...shop.serviceZones, z.id];
                              const updatedShop: PublicShop = { ...shop, serviceZones: nextZones };
                              await savePublicShop(updatedShop, adminUid, adminEmail);
                              if (sellers.some((sl) => sl.sellerId === shop.shopId)) {
                                await updateDoc(doc(db, 'sellers', shop.shopId), {
                                  serviceZones: nextZones,
                                  updatedAt: new Date().toISOString(),
                                }).catch(() => {});
                              }
                              onFeedback(`Updated served zones for ${shop.shopName}.`);
                              await loadServiceData();
                            } catch (err: any) {
                              onFeedback(err?.message || 'Unable to update shop zones.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border font-bold ${
                            active
                              ? 'bg-[#2563EB] border-[#2563EB] text-white'
                              : 'bg-white border-slate-300 text-slate-600'
                          }`}
                        >
                          {z.shortCode}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    <label className="font-semibold inline-flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(hrs.is24x7)}
                        onChange={(e) =>
                          persistShopHours(
                            { ...hrs, is24x7: e.target.checked },
                            `${shop.shopName} 24x7 mode ${e.target.checked ? 'enabled' : 'disabled'}.`
                          )
                        }
                      />
                      24×7 Open
                    </label>
                    {!hrs.is24x7 && (
                      <>
                        <label className="font-semibold">
                          Open (IST):
                          <input
                            type="time"
                            defaultValue={hrs.openTime}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== hrs.openTime) {
                                void persistShopHours(
                                  { ...hrs, openTime: e.target.value },
                                  `Updated opening time for ${shop.shopName} to ${e.target.value} IST.`
                                );
                              }
                            }}
                            className="ml-1.5 border border-slate-300 rounded-lg px-2 py-1 bg-white font-mono"
                          />
                        </label>
                        <label className="font-semibold">
                          Close (IST):
                          <input
                            type="time"
                            defaultValue={hrs.closeTime}
                            onBlur={(e) => {
                              if (e.target.value && e.target.value !== hrs.closeTime) {
                                void persistShopHours(
                                  { ...hrs, closeTime: e.target.value },
                                  `Updated closing time for ${shop.shopName} to ${e.target.value} IST.`
                                );
                              }
                            }}
                            className="ml-1.5 border border-slate-300 rounded-lg px-2 py-1 bg-white font-mono"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-1">
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel, dIdx) => {
                            const dayOpen = (hrs.daysOpen || [0, 1, 2, 3, 4, 5, 6]).includes(dIdx);
                            return (
                              <button
                                key={dayLabel}
                                type="button"
                                onClick={() => {
                                  const base = hrs.daysOpen || [0, 1, 2, 3, 4, 5, 6];
                                  const nextDays = dayOpen
                                    ? base.filter((d) => d !== dIdx)
                                    : [...base, dIdx].sort((a, b) => a - b);
                                  void persistShopHours(
                                    { ...hrs, daysOpen: nextDays },
                                    `Updated open days for ${shop.shopName}.`
                                  );
                                }}
                                className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                                  dayOpen
                                    ? 'bg-[#14213D] border-[#14213D] text-white'
                                    : 'bg-white border-slate-300 text-slate-400'
                                }`}
                              >
                                {dayLabel}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Delivery Partner Zone Assignments */}
      {subTab === 'drivers' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
          <div>
            <h3 className="font-bold text-[#14213D]">
              Delivery Partner Zone Assignments ({deliveryPartners.length} registered · {dataset.publicDrivers.length} fleet slots)
            </h3>
            <p className="text-xs text-slate-500">
              A Vijayawada zone is only deliverable when at least one approved delivery partner assigned to that zone is Online.
            </p>
          </div>

          <div className="space-y-3">
            {deliveryPartners.map((p) => {
              const currentZones = p.assignedZones || [];
              return (
                <div key={p.partnerId} className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-sm text-[#14213D]">
                        {p.fullName} · <span className="font-mono text-xs">{p.mobile}</span>
                      </p>
                      <p className="text-slate-500">
                        {p.city}, {p.state} · Vehicle: {p.vehicleType} ({p.vehicleNumber}) · Status:{' '}
                        <strong>{p.verificationStatus}</strong> ·{' '}
                        <strong className={p.isOnline ? 'text-emerald-700' : 'text-slate-500'}>
                          {p.isOnline ? 'ONLINE' : 'Offline'}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-600">Assigned Zones:</span>
                    {cityZones.map((z) => {
                      const active = currentZones.includes(z.id);
                      return (
                        <button
                          key={z.id}
                          type="button"
                          disabled={busyId === `drv-${p.partnerId}`}
                          onClick={async () => {
                            setBusyId(`drv-${p.partnerId}`);
                            try {
                              const nextZones = active
                                ? currentZones.filter((id) => id !== z.id)
                                : [...currentZones, z.id];
                              await adminAssignDriverZones({
                                partner: p,
                                cityId: activeCity.id,
                                assignedZones: nextZones,
                                adminUid,
                                adminEmail,
                              });
                              onFeedback(`Updated zone assignments for ${p.fullName}.`);
                              await loadServiceData();
                              await onRefresh();
                            } catch (err: any) {
                              onFeedback(err?.message || 'Unable to assign partner zones.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border font-bold ${
                            active
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-300 text-slate-600'
                          }`}
                        >
                          {z.shortCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Also expose publicDrivers fleet slots (including starter hub fleet slots) */}
            {dataset.publicDrivers
              .filter((pd) => !deliveryPartners.some((dp) => dp.partnerId === pd.partnerId))
              .map((pd) => (
                <div key={pd.partnerId} className="p-4 rounded-2xl border border-slate-200 bg-[#F8FAFC] space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#14213D] font-mono">
                        Active Fleet Slot: {pd.partnerId}
                      </p>
                      <p className="text-slate-500">
                        Verification: <strong>{pd.verificationStatus}</strong> · Live:{' '}
                        <strong className={pd.isOnline ? 'text-emerald-700' : 'text-rose-700'}>
                          {pd.isOnline ? 'ONLINE' : 'Offline'}
                        </strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `fleet-${pd.partnerId}`}
                      onClick={async () => {
                        setBusyId(`fleet-${pd.partnerId}`);
                        try {
                          await savePublicDriver({ ...pd, isOnline: !pd.isOnline }, adminUid, adminEmail);
                          onFeedback(`Fleet slot ${pd.partnerId} set ${!pd.isOnline ? 'ONLINE' : 'Offline'}.`);
                          await loadServiceData();
                        } catch (err: any) {
                          onFeedback(err?.message || 'Unable to update fleet slot status.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold ${
                        pd.isOnline
                          ? 'border border-rose-300 text-rose-700 bg-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {pd.isOnline ? 'Set Offline' : 'Set Online'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-600">Assigned Zones:</span>
                    {cityZones.map((z) => {
                      const active = pd.assignedZones.includes(z.id);
                      return (
                        <button
                          key={z.id}
                          type="button"
                          disabled={busyId === `fleet-z-${pd.partnerId}`}
                          onClick={async () => {
                            setBusyId(`fleet-z-${pd.partnerId}`);
                            try {
                              const nextZones = active
                                ? pd.assignedZones.filter((id) => id !== z.id)
                                : [...pd.assignedZones, z.id];
                              await savePublicDriver({ ...pd, assignedZones: nextZones }, adminUid, adminEmail);
                              onFeedback(`Updated fleet slot ${pd.partnerId} zones.`);
                              await loadServiceData();
                            } catch (err: any) {
                              onFeedback(err?.message || 'Unable to update fleet slot zones.');
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border font-bold ${
                            active
                              ? 'bg-[#2563EB] border-[#2563EB] text-white'
                              : 'bg-white border-slate-300 text-slate-600'
                          }`}
                        >
                          {z.shortCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 6. Area-Wise Order Reports & Live Address Serviceability Tester */}
      {subTab === 'reports' && (
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white p-5 rounded-2xl border border-slate-200 space-y-4 overflow-x-auto">
            <h3 className="font-bold text-[#14213D]">
              Vijayawada Zone Performance &amp; Live Readiness
            </h3>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">Zone</th>
                  <th>Orders</th>
                  <th>GMV</th>
                  <th>Open Shops</th>
                  <th>Online Drivers</th>
                  <th>Fee / Min</th>
                </tr>
              </thead>
              <tbody>
                {zoneAnalytics.map(({ zone, orderCount, gmv, openShops, onlineDrivers }) => (
                  <tr key={zone.id} className="border-b last:border-b-0">
                    <td className="py-3 pr-2">
                      <p className="font-bold text-[#14213D]">{zone.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{zone.pincodes.join(', ')}</p>
                    </td>
                    <td className="font-mono font-bold tabular-nums">{orderCount}</td>
                    <td className="font-mono font-bold tabular-nums">{formatINR(gmv)}</td>
                    <td className="font-mono tabular-nums">{openShops}</td>
                    <td className="font-mono tabular-nums">{onlineDrivers}</td>
                    <td className="font-mono tabular-nums">
                      ₹{zone.deliveryCharge} / ₹{zone.minOrderAmount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
            <h3 className="font-bold text-sm text-[#14213D]">Live Address Serviceability Tester</h3>
            <p className="text-slate-500">
              Test boundary polygon, zone/ward status, open shop availability, and online delivery partner readiness.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {VERIFIED_VIJAYAWADA_LOCALITIES.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() =>
                    setTestInput({
                      locality: preset.label,
                      city: 'Vijayawada',
                      pincode: preset.pincode,
                      lat: preset.lat != null ? String(preset.lat) : '',
                      lng: preset.lng != null ? String(preset.lng) : '',
                      subtotal: testInput.subtotal,
                    })
                  }
                  className={`px-2.5 py-1 rounded-lg border font-semibold ${
                    preset.insideVmcBoundary
                      ? 'bg-slate-50 border-slate-200 text-[#14213D]'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setTestInput({
                    locality: 'Brodipet',
                    city: 'Guntur',
                    pincode: '522002',
                    lat: '16.3066525',
                    lng: '80.4365402',
                    subtotal: testInput.subtotal,
                  })
                }
                className="px-2.5 py-1 rounded-lg border bg-rose-50 border-rose-200 text-rose-800 font-semibold"
              >
                Guntur (Outside)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                value={testInput.locality}
                onChange={(e) => setTestInput({ ...testInput, locality: e.target.value })}
                placeholder="Locality"
                className="border border-slate-300 rounded-xl px-2.5 py-2"
              />
              <input
                value={testInput.city}
                onChange={(e) => setTestInput({ ...testInput, city: e.target.value })}
                placeholder="City"
                className="border border-slate-300 rounded-xl px-2.5 py-2"
              />
              <input
                value={testInput.pincode}
                onChange={(e) => setTestInput({ ...testInput, pincode: e.target.value })}
                placeholder="PIN Code"
                className="border border-slate-300 rounded-xl px-2.5 py-2 font-mono"
              />
              <input
                value={testInput.subtotal}
                onChange={(e) => setTestInput({ ...testInput, subtotal: e.target.value })}
                placeholder="Cart Subtotal ₹"
                className="border border-slate-300 rounded-xl px-2.5 py-2 font-mono"
              />
              <input
                value={testInput.lat}
                onChange={(e) => setTestInput({ ...testInput, lat: e.target.value })}
                placeholder="Lat"
                className="border border-slate-300 rounded-xl px-2.5 py-2 font-mono"
              />
              <input
                value={testInput.lng}
                onChange={(e) => setTestInput({ ...testInput, lng: e.target.value })}
                placeholder="Lng"
                className="border border-slate-300 rounded-xl px-2.5 py-2 font-mono"
              />
            </div>

            {testResult && (
              <div
                className={`p-3.5 rounded-2xl border space-y-1.5 ${
                  testResult.deliverable
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between font-extrabold">
                  <span className="inline-flex items-center gap-1.5">
                    {testResult.deliverable ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                    )}
                    {testResult.statusCode}
                  </span>
                  <span>{testResult.deliverable ? 'DELIVERABLE' : 'REJECTED'}</span>
                </div>
                <p>{testResult.message}</p>
                <p className="text-[11px] opacity-80">
                  Boundary: {testResult.withinBoundary ? 'Inside' : 'Outside'} · Zone:{' '}
                  {testResult.matchedZoneName || 'None'} · Open Shops: {testResult.availableShopIds.length} · Online Riders:{' '}
                  {testResult.onlineDriverCount}
                </p>
              </div>
            )}

            <div className="pt-1 space-y-2">
              <button
                type="button"
                disabled={serverTestLoading}
                onClick={async () => {
                  setServerTestLoading(true);
                  setServerTestError('');
                  try {
                    const latNum = testInput.lat.trim() ? Number(testInput.lat) : undefined;
                    const lngNum = testInput.lng.trim() ? Number(testInput.lng) : undefined;
                    const subNum = testInput.subtotal.trim() ? Number(testInput.subtotal) : undefined;
                    const res = await fetch('/api/serviceability/check', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        location: {
                          locality: testInput.locality,
                          city: testInput.city,
                          pincode: testInput.pincode,
                          ...(Number.isFinite(latNum) ? { lat: latNum } : {}),
                          ...(Number.isFinite(lngNum) ? { lng: lngNum } : {}),
                        },
                        subtotal: Number.isFinite(subNum) ? subNum : undefined,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Server serviceability check failed.');
                    setServerTestResult(json as ServiceabilityResult);
                  } catch (err: any) {
                    setServerTestError(err?.message || 'Unable to verify via server API.');
                  } finally {
                    setServerTestLoading(false);
                  }
                }}
                className="w-full py-2 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 font-bold inline-flex items-center justify-center gap-1.5"
              >
                {serverTestLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verify Live via Backend API (/api/serviceability/check)
              </button>
              {serverTestError && (
                <p className="text-[11px] text-rose-700 font-semibold">{serverTestError}</p>
              )}
              {serverTestResult && (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-0.5">
                  <p className="font-bold text-[#14213D]">
                    Server API Result: {serverTestResult.statusCode} ·{' '}
                    {serverTestResult.deliverable ? 'DELIVERABLE' : 'REJECTED'} (Fee ₹
                    {serverTestResult.deliveryCharge})
                  </p>
                  <p>{serverTestResult.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
