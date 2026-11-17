import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Loader2,
  Map as MapIcon,
  MapPin,
  Search,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { useLocationService } from '../../contexts/LocationContext';
import { VERIFIED_VIJAYAWADA_LOCALITIES } from '../../data/vijayawadaDefaults';
import { getServerConfigStatus } from '../../services/storeService';
import { DeliveryLocationPicker } from './DeliveryLocationPicker';

export const ServiceLocationModal: React.FC = () => {
  const {
    customerLocation,
    dataset,
    serviceability,
    isLocationModalOpen,
    closeLocationModal,
    setLocationByPincode,
    setManualVijayawadaAddress,
    setLocationFromGoogleAddress,
    detectGpsLocation,
    refreshDataset,
  } = useLocationService();

  const [pincodeInput, setPincodeInput] = useState(customerLocation.pincode || '520012');
  const [manualLocality, setManualLocality] = useState(customerLocation.locality || '');
  const [manualCity, setManualCity] = useState(customerLocation.cityName || 'Vijayawada');
  const [manualPin, setManualPin] = useState(customerLocation.pincode || '520012');
  const [selectedCityTabId, setSelectedCityTabId] = useState(
    customerLocation.cityId || 'vijayawada'
  );

  const [gpsLoading, setGpsLoading] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [mapsPickerOpen, setMapsPickerOpen] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState(
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const wasOpenRef = React.useRef(false);

  useEffect(() => {
    const justOpened = isLocationModalOpen && !wasOpenRef.current;
    wasOpenRef.current = isLocationModalOpen;
    if (!justOpened) return;

    setStatusError('');
    setSelectedCityTabId(
      dataset.cities.some((c) => c.id === customerLocation.cityId)
        ? customerLocation.cityId
        : dataset.cities.find((c) => c.id === 'vijayawada')?.id || dataset.cities[0]?.id || 'vijayawada'
    );
    void refreshDataset();

    if (!mapsApiKey) {
      getServerConfigStatus()
        .then((cfg) => {
          if (cfg.googleMapsApiKey) setMapsApiKey(cfg.googleMapsApiKey);
        })
        .catch(() => {});
    }
  }, [isLocationModalOpen, customerLocation.cityId, dataset.cities, mapsApiKey, refreshDataset]);

  useEffect(() => {
    if (!isLocationModalOpen) return;
    setPincodeInput(customerLocation.pincode || '520012');
    setManualLocality(customerLocation.locality || '');
    setManualCity(customerLocation.cityName || 'Vijayawada');
    setManualPin(customerLocation.pincode || '520012');
  }, [
    isLocationModalOpen,
    customerLocation.pincode,
    customerLocation.locality,
    customerLocation.cityName,
  ]);

  if (!isLocationModalOpen) return null;

  const handleApplyPincode = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError('');
    const clean = pincodeInput.replace(/\D/g, '');
    if (!/^[1-9][0-9]{5}$/.test(clean)) {
      setStatusError('Enter a valid 6-digit Indian PIN code (e.g., 520012, 520010, 520002).');
      return;
    }
    setLocationByPincode(clean);
  };

  const handleApplyManual = (e: React.FormEvent) => {
    e.preventDefault();
    setStatusError('');
    if (!manualLocality.trim() || !manualCity.trim()) {
      setStatusError('Enter both locality/area and city name.');
      return;
    }
    const clean = manualPin.replace(/\D/g, '').slice(0, 6);
    if (clean && !/^[1-9][0-9]{5}$/.test(clean)) {
      setStatusError('Enter a valid 6-digit PIN code or leave it matched to your locality.');
      return;
    }

    const verifiedPreset = VERIFIED_VIJAYAWADA_LOCALITIES.find(
      (v) => v.label.toLowerCase() === manualLocality.trim().toLowerCase()
    );

    setManualVijayawadaAddress({
      locality: manualLocality.trim(),
      city: manualCity.trim(),
      pincode: clean || verifiedPreset?.pincode || '',
      lat: verifiedPreset?.lat,
      lng: verifiedPreset?.lng,
      zoneId: verifiedPreset?.zoneId,
    });
  };

  const handleGps = async () => {
    setStatusError('');
    setGpsLoading(true);
    const res = await detectGpsLocation();
    setGpsLoading(false);
    if (!res.ok && res.error) {
      setStatusError(res.error);
    }
  };

  const displayCity =
    dataset.cities.find((c) => c.id === selectedCityTabId) ||
    dataset.cities.find((c) => c.id === 'vijayawada') ||
    dataset.cities[0];
  const displayZones = displayCity
    ? dataset.zones.filter((z) => z.cityId === displayCity.id)
    : dataset.zones;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-[#14213D]/60 backdrop-blur-xs flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Choose Delivery Location"
      >
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5 my-auto">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-lg font-extrabold text-[#14213D] flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#FCA311]" />
                Select Delivery Area ({displayCity?.name || 'Vijayawada'})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Products, open shops, delivery charges, and live rider availability update for your exact municipal location.
              </p>
            </div>
            <button
              type="button"
              onClick={closeLocationModal}
              aria-label="Close delivery location dialog"
              className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#14213D] hover:bg-slate-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Live Serviceability Status Banner */}
          <div
            className={`rounded-2xl border p-4 space-y-2 ${
              serviceability.deliverable
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {serviceability.deliverable ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                )}
                <span className="text-xs font-extrabold">
                  {customerLocation.locality}
                  {customerLocation.pincode ? ` (${customerLocation.pincode})` : ''} · {customerLocation.cityName}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  serviceability.withinBoundary
                    ? 'bg-emerald-600 text-white'
                    : 'bg-rose-600 text-white'
                }`}
              >
                {serviceability.withinBoundary ? 'Inside City Boundary' : 'Outside Boundary'}
              </span>
            </div>

            <p className="text-xs leading-relaxed">{serviceability.message}</p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-black/5">
                <p className="text-slate-500 font-semibold">Zone / Ward</p>
                <p className="font-bold text-[#14213D] truncate">
                  {serviceability.matchedZoneName || 'Unmatched'}
                  {serviceability.matchedWardNumber ? ` (Ward #${serviceability.matchedWardNumber})` : ''}
                </p>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-black/5 flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-500 font-semibold">Open Shops</p>
                  <p className="font-bold text-[#14213D]">
                    {serviceability.hasAvailableShop
                      ? `${serviceability.availableShopIds.length} active`
                      : 'None open for zone'}
                  </p>
                </div>
              </div>
              <div className="bg-white/80 rounded-xl px-3 py-2 border border-black/5 flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-[#FCA311] shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-500 font-semibold">Delivery Partners</p>
                  <p className="font-bold text-[#14213D]">
                    {serviceability.hasAvailableDriver
                      ? `${serviceability.onlineDriverCount} online · ₹${serviceability.deliveryCharge} fee`
                      : 'None online'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {statusError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{statusError}</span>
            </div>
          )}

          {/* Action Row: GPS + Google Map Picker + PIN Check */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleGps}
                disabled={gpsLoading}
                className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
                Use GPS Location
              </button>
              <button
                type="button"
                onClick={() => setMapsPickerOpen(true)}
                className="flex-1 min-w-[160px] px-4 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#1c2f57] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5"
              >
                <MapIcon className="w-4 h-4 text-[#FCA311]" />
                Drop Pin on Map
              </button>
            </div>

            <form onSubmit={handleApplyPincode} className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pincodeInput}
                onChange={(e) => setPincodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit PIN (e.g. 520010)"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                Check PIN
              </button>
            </form>
          </div>

          {/* City Zones & Quick Localities */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-[#14213D]">
                {displayCity?.name || 'Vijayawada'} Delivery Zones &amp; Verified Localities
              </p>
              <div className="flex items-center gap-2">
                {dataset.cities.length > 1 && (
                  <select
                    value={displayCity?.id || ''}
                    onChange={(e) => setSelectedCityTabId(e.target.value)}
                    aria-label="Select service city"
                    className="border border-slate-300 rounded-lg px-2 py-1 text-[11px] font-bold bg-white text-[#14213D]"
                  >
                    {dataset.cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.active ? 'Active' : 'Paused'})
                      </option>
                    ))}
                  </select>
                )}
                {displayCity && (
                  <span className="text-[11px] text-slate-500">
                    Hub: {displayCity.hubLocality} ({displayCity.hubPincode})
                  </span>
                )}
              </div>
            </div>

            {displayZones.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                No delivery zones configured for {displayCity?.name || 'this city'} yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                {displayZones.map((zone) => {
                  const isSelectedZone = serviceability.matchedZoneId === zone.id && serviceability.withinBoundary;
                  return (
                    <div
                      key={zone.id}
                      className={`rounded-2xl border p-3 space-y-2 transition-colors ${
                        isSelectedZone
                          ? 'border-[#2563EB] bg-blue-50/50'
                          : 'border-slate-200 bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-[#14213D]">{zone.name}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            zone.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {zone.enabled ? `₹${zone.deliveryCharge} · Min ₹${zone.minOrderAmount}` : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {zone.localities.map((locName) => {
                          const preset = VERIFIED_VIJAYAWADA_LOCALITIES.find(
                            (v) => v.label.toLowerCase() === locName.toLowerCase()
                          );
                          return (
                            <button
                              key={locName}
                              type="button"
                              onClick={() =>
                                setManualVijayawadaAddress({
                                  locality: locName,
                                  city: displayCity?.name || 'Vijayawada',
                                  state: displayCity?.state || 'Andhra Pradesh',
                                  pincode: preset?.pincode || zone.pincodes[0] || displayCity?.hubPincode || '520001',
                                  lat: preset?.lat,
                                  lng: preset?.lng,
                                  zoneId: zone.id,
                                })
                              }
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                customerLocation.locality.toLowerCase() === locName.toLowerCase()
                                  ? 'bg-[#14213D] text-white border-[#14213D]'
                                  : 'bg-white text-slate-700 border-slate-200 hover:border-[#2563EB]'
                              }`}
                            >
                              {locName}
                            </button>
                          );
                        })}
                        {(zone.unverifiedLocalities || []).map((extLoc) => {
                          const preset = VERIFIED_VIJAYAWADA_LOCALITIES.find(
                            (v) => v.label.toLowerCase() === extLoc.toLowerCase()
                          );
                          return (
                            <button
                              key={extLoc}
                              type="button"
                              onClick={() =>
                                setManualVijayawadaAddress({
                                  locality: extLoc,
                                  city: displayCity?.name || 'Vijayawada',
                                  state: displayCity?.state || 'Andhra Pradesh',
                                  pincode: preset?.pincode || zone.pincodes[0] || displayCity?.hubPincode || '520012',
                                  lat: preset?.lat,
                                  lng: preset?.lng,
                                  zoneId: zone.id,
                                })
                              }
                              title={
                                zone.allowOutsideMunicipalBoundary
                                  ? 'Peri-urban corridor enabled by Admin'
                                  : 'Outside verified VMC boundary (Admin override disabled)'
                              }
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                customerLocation.locality.toLowerCase() === extLoc.toLowerCase()
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              {extLoc} {zone.allowOutsideMunicipalBoundary ? '· Ext' : '· Fringe'}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Manual Locality / City Test or Entry */}
          <form onSubmit={handleApplyManual} className="rounded-2xl bg-slate-50 border border-slate-200 p-3.5 space-y-2.5">
            <p className="text-[11px] font-bold text-slate-600">
              Manual Area / Address Check (Any Locality, PIN, or City)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="text"
                value={manualLocality}
                onChange={(e) => setManualLocality(e.target.value)}
                placeholder="Locality (e.g. Benz Circle)"
                className="sm:col-span-2 px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
              />
              <input
                type="text"
                value={manualCity}
                onChange={(e) => setManualCity(e.target.value)}
                placeholder="City (e.g. Vijayawada)"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
              />
              <input
                type="text"
                maxLength={6}
                value={manualPin}
                onChange={(e) => setManualPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="PIN (optional)"
                className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  setManualVijayawadaAddress({
                    locality: 'Brodipet',
                    city: 'Guntur',
                    state: 'Andhra Pradesh',
                    pincode: '522002',
                    lat: 16.3066525,
                    lng: 80.4365402,
                  })
                }
                className="text-[11px] font-semibold text-slate-500 hover:text-[#14213D] underline cursor-pointer"
              >
                Test outside boundary (Guntur 522002)
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl border border-[#14213D] text-[#14213D] text-xs font-bold hover:bg-slate-200/60 cursor-pointer"
                >
                  Apply Manual Area
                </button>
                <button
                  type="button"
                  onClick={closeLocationModal}
                  className="px-4 py-2 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-extrabold cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <DeliveryLocationPicker
        isOpen={mapsPickerOpen}
        onClose={() => setMapsPickerOpen(false)}
        apiKey={mapsApiKey}
        initialLocation={
          customerLocation.lat && customerLocation.lng
            ? { lat: customerLocation.lat, lng: customerLocation.lng }
            : null
        }
        onConfirm={(resolved) => {
          setLocationFromGoogleAddress(resolved);
          setMapsPickerOpen(false);
        }}
      />
    </>
  );
};
