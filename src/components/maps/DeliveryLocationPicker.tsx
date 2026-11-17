import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMap,
  MapCameraChangedEvent,
  MapMouseEvent,
  Pin,
  Polygon,
  useApiLoadingStatus,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Crosshair, Loader2, MapPin, Search, AlertTriangle, Check, X } from 'lucide-react';
import { VIJAYAWADA_BOUNDARY_GEOJSON, VIJAYAWADA_MAP_CENTER } from '../../data/vijayawadaDefaults';
import { useIndiaAutocompleteSuggestions } from '../../hooks/useIndiaAutocompleteSuggestions';
import {
  ParsedGoogleAddress,
  parseGoogleAddressComponents,
  reportGmpQuotaIfApplicable,
} from '../../services/mapsAddressParser';
import { extractGooglePolygonRings } from '../../services/serviceabilityService';

interface DeliveryLocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  initialLocation?: { lat: number; lng: number } | null;
  onConfirm: (resolved: ParsedGoogleAddress) => void;
}

const DEFAULT_INDIA_CENTER = VIJAYAWADA_MAP_CENTER;
const VMC_BOUNDARY_PATHS = extractGooglePolygonRings(VIJAYAWADA_BOUNDARY_GEOJSON);

const PickerMapInner: React.FC<{
  initialLocation?: { lat: number; lng: number } | null;
  onConfirm: (resolved: ParsedGoogleAddress) => void;
  onClose: () => void;
}> = ({ initialLocation, onConfirm, onClose }) => {
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const startCoord = initialLocation || DEFAULT_INDIA_CENTER;
  const [cameraCenter, setCameraCenter] = useState(startCoord);
  const [cameraZoom, setCameraZoom] = useState(initialLocation ? 17 : 12);
  const [pinPosition, setPinPosition] = useState(startCoord);

  const [searchInput, setSearchInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { suggestions, isLoading: suggestionsLoading, error: searchErr, resetSession } =
    useIndiaAutocompleteSuggestions(searchInput);

  const [resolving, setResolving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [resolvedAddress, setResolvedAddress] = useState<ParsedGoogleAddress | null>(null);

  const reverseGeocodeCoordinates = useCallback(async (lat: number, lng: number) => {
    setResolving(true);
    setStatusMessage('');
    try {
      const res = await fetch(
        `/api/maps/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.status === 429 || data?.code === 'QUOTA_EXCEEDED') {
        reportGmpQuotaIfApplicable(data);
        setStatusMessage(
          'Google Maps geocoding quota reached. Your pinned coordinates are kept — please review or enter street fields manually.'
        );
        setResolvedAddress((prev) => ({
          houseNo: prev?.houseNo || '',
          street: prev?.street || '',
          locality: prev?.locality || '',
          landmark: prev?.landmark || '',
          city: prev?.city || '',
          district: prev?.district || 'NTR District',
          state: prev?.state || 'Andhra Pradesh',
          pincode: prev?.pincode || '',
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          formattedAddress: prev?.formattedAddress || '',
        }));
        return;
      }

      if (!res.ok) {
        setStatusMessage(
          data?.error ||
            'Could not auto-resolve street details for this pin. You can confirm the pin coordinates and edit fields manually.'
        );
        setResolvedAddress((prev) => ({
          houseNo: prev?.houseNo || '',
          street: prev?.street || '',
          locality: prev?.locality || '',
          landmark: prev?.landmark || '',
          city: prev?.city || 'Vijayawada',
          district: prev?.district || 'NTR District',
          state: prev?.state || 'Andhra Pradesh',
          pincode: prev?.pincode || '',
          lat: Number(lat.toFixed(6)),
          lng: Number(lng.toFixed(6)),
          formattedAddress: prev?.formattedAddress || '',
        }));
        return;
      }

      const parsed = parseGoogleAddressComponents({
        addressComponents: data.addressComponents || [],
        formattedAddress: data.formattedAddress || '',
        lat: data.lat ?? lat,
        lng: data.lng ?? lng,
        placeId: data.placeId || undefined,
      });
      setResolvedAddress(parsed);
    } catch {
      setStatusMessage(
        'Network issue while resolving street address. Pin coordinates are preserved for manual entry.'
      );
      setResolvedAddress((prev) => ({
        houseNo: prev?.houseNo || '',
        street: prev?.street || '',
        locality: prev?.locality || '',
        landmark: prev?.landmark || '',
        city: prev?.city || 'Vijayawada',
        district: prev?.district || 'NTR District',
        state: prev?.state || 'Andhra Pradesh',
        pincode: prev?.pincode || '',
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      }));
    } finally {
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    if (initialLocation && apiStatus === APILoadingStatus.LOADED) {
      reverseGeocodeCoordinates(initialLocation.lat, initialLocation.lng);
    }
  }, [initialLocation, apiStatus, reverseGeocodeCoordinates]);

  const handleSelectSuggestion = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!placesLib || !suggestion.placePrediction) return;
    setResolving(true);
    setStatusMessage('');
    setDropdownOpen(false);

    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'addressComponents'],
      });

      const loc = place.location;
      if (loc) {
        const lat = loc.lat();
        const lng = loc.lng();
        setPinPosition({ lat, lng });
        setCameraCenter({ lat, lng });
        setCameraZoom(17);

        const components = (place.addressComponents || []).map((c) => ({
          longText: c.longText,
          shortText: c.shortText,
          types: c.types,
        }));

        const parsed = parseGoogleAddressComponents({
          addressComponents: components,
          formattedAddress: place.formattedAddress || '',
          displayName: place.displayName || '',
          lat,
          lng,
          placeId: place.id,
        });
        setResolvedAddress(parsed);
        setSearchInput(place.formattedAddress || place.displayName || '');
      }
      resetSession();
    } catch (err: any) {
      reportGmpQuotaIfApplicable(err);
      setStatusMessage(err?.message || 'Unable to load place details. Please try clicking the map pin.');
    } finally {
      setResolving(false);
    }
  };

  const handleMapClick = (ev: MapMouseEvent) => {
    const latLng = ev.detail.latLng;
    if (!latLng) return;
    setPinPosition(latLng);
    setCameraCenter(latLng);
    if (cameraZoom < 15) setCameraZoom(16);
    void reverseGeocodeCoordinates(latLng.lat, latLng.lng);
  };

  const handleMarkerDragEnd = (ev: google.maps.MapMouseEvent) => {
    if (!ev.latLng) return;
    const next = { lat: ev.latLng.lat(), lng: ev.latLng.lng() };
    setPinPosition(next);
    setCameraCenter(next);
    void reverseGeocodeCoordinates(next.lat, next.lng);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setStatusMessage(
        'Geolocation is not supported by your browser. Search your address or click on the map instead.'
      );
      return;
    }
    setGeoLoading(true);
    setStatusMessage('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPinPosition(next);
        setCameraCenter(next);
        setCameraZoom(17);
        setGeoLoading(false);
        void reverseGeocodeCoordinates(next.lat, next.lng);
      },
      (geoErr) => {
        setGeoLoading(false);
        if (geoErr.code === geoErr.PERMISSION_DENIED) {
          setStatusMessage(
            'Location permission was denied. You can still search Indian addresses above, drop a pin on the map, or enter your address manually.'
          );
        } else {
          setStatusMessage(
            'Unable to detect your GPS location right now. Please search your area or click on the map.'
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleCameraChanged = (ev: MapCameraChangedEvent) => {
    setCameraCenter(ev.detail.center);
    setCameraZoom(ev.detail.zoom);
  };

  const handleConfirmLocation = () => {
    if (resolvedAddress) {
      onConfirm(resolvedAddress);
      onClose();
      return;
    }
    onConfirm({
      houseNo: '',
      street: '',
      locality: '',
      landmark: '',
      city: 'Vijayawada',
      district: 'NTR District',
      state: 'Andhra Pradesh',
      pincode: '',
      lat: Number(pinPosition.lat.toFixed(6)),
      lng: Number(pinPosition.lng.toFixed(6)),
    });
    onClose();
  };

  const apiFailed =
    apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE;

  return (
    <div className="space-y-4">
      {/* Address Search + Current Location Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchInput}
            onFocus={() => setDropdownOpen(true)}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setDropdownOpen(true);
            }}
            placeholder="Search Indian area, building, street or PIN code..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/25 focus:border-[#2563EB]"
          />

          {dropdownOpen && (suggestions.length > 0 || suggestionsLoading) && (
            <ul
              role="listbox"
              className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100"
            >
              {suggestionsLoading && suggestions.length === 0 && (
                <li className="px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
                  Searching Indian addresses...
                </li>
              )}
              {suggestions.map((s, idx) => (
                <li key={s.placePrediction?.placeId || idx}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-blue-50/70 transition-colors flex items-start gap-2.5"
                  >
                    <MapPin className="w-4 h-4 text-[#2563EB] shrink-0 mt-0.5" />
                    <span className="text-xs text-[#1F2937] leading-snug">
                      {s.placePrediction?.text.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={geoLoading}
          className="px-4 py-2.5 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60"
        >
          {geoLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Crosshair className="w-4 h-4" />
          )}
          Use Current Location
        </button>
      </div>

      {searchErr && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {searchErr}
        </p>
      )}

      {statusMessage && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Map Canvas */}
      <div className="relative w-full h-[320px] sm:h-[380px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
        {apiFailed ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2 bg-slate-50">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <p className="font-bold text-sm text-[#14213D]">Google Map could not be loaded</p>
            <p className="text-xs text-slate-600 max-w-md">
              Verify your Google Maps JavaScript API &amp; Places API (New) key restrictions or quota, or close this dialog to enter your delivery address manually.
            </p>
          </div>
        ) : apiStatus !== APILoadingStatus.LOADED ? (
          <div className="w-full h-full flex items-center justify-center gap-2 text-xs font-medium text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
            Loading interactive Google Map...
          </div>
        ) : (
          <GoogleMap
            mapId="DEMO_MAP_ID"
            center={cameraCenter}
            zoom={cameraZoom}
            onCameraChanged={handleCameraChanged}
            onClick={handleMapClick}
            gestureHandling="greedy"
            streetViewControl={false}
            mapTypeControl={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            className="w-full h-full"
          >
            {VMC_BOUNDARY_PATHS.map((paths, idx) => (
              <Polygon
                key={idx}
                paths={paths}
                strokeColor="#2563EB"
                strokeOpacity={0.85}
                strokeWeight={2}
                fillColor="#2563EB"
                fillOpacity={0.08}
                clickable={false}
              />
            ))}
            <AdvancedMarker
              position={pinPosition}
              draggable={true}
              onDragEnd={handleMarkerDragEnd}
              title="Drag pin or click map to adjust delivery location"
            >
              <Pin background="#14213D" borderColor="#FCA311" glyphColor="#FCA311" scale={1.15} />
            </AdvancedMarker>
          </GoogleMap>
        )}

        <div className="absolute bottom-3 left-3 right-3 sm:right-auto bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow border border-slate-200 text-[11px] text-[#14213D] flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#FCA311] shrink-0" />
          <span>Click anywhere or drag the pin to fine-tune your exact doorstep location.</span>
        </div>
      </div>

      {/* Resolved Address Preview */}
      <div className="rounded-2xl bg-[#F8FAFC] border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#14213D]">Selected Delivery Pin</span>
            <span className="text-[11px] font-mono text-slate-500">
              {pinPosition.lat.toFixed(6)}, {pinPosition.lng.toFixed(6)}
            </span>
          </div>
          {resolving ? (
            <p className="text-xs text-[#2563EB] flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching address details...
            </p>
          ) : resolvedAddress?.formattedAddress ? (
            <p className="text-xs text-slate-600 leading-relaxed">
              {resolvedAddress.formattedAddress}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Search an Indian address, tap the map, or use Current Location to auto-fill address details.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={resolving}
            onClick={handleConfirmLocation}
            className="px-5 py-2.5 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            Confirm Selected Location
          </button>
        </div>
      </div>
    </div>
  );
};

export const DeliveryLocationPicker: React.FC<DeliveryLocationPickerProps> = ({
  isOpen,
  onClose,
  apiKey,
  initialLocation,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#14213D]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Select Delivery Location"
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl p-5 sm:p-6 space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-extrabold text-[#14213D] flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#2563EB]" />
              Select Delivery Location
            </h3>
            <p className="text-xs text-slate-500">
              Search via Google Places or drop a pin to auto-fill your Indian delivery address
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location picker"
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#14213D] hover:bg-slate-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!apiKey ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 space-y-3 text-xs text-amber-950">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-bold text-sm">Google Maps API Credentials Required</p>
                <p className="leading-relaxed">
                  The interactive Google Map and Places Autocomplete are prepared, but <code>VITE_GOOGLE_MAPS_API_KEY</code> is not configured in this environment yet.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-amber-900">
                  <li>
                    Enable <strong>Maps JavaScript API</strong>, <strong>Places API (New)</strong>, and <strong>Geocoding API</strong> in Google Cloud Console.
                  </li>
                  <li>
                    Restrict your browser API key to your website HTTP referrers and those APIs, then set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your environment secrets.
                  </li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#14213D] text-white font-semibold text-xs"
              >
                Enter Address Manually
              </button>
            </div>
          </div>
        ) : (
          <APIProvider apiKey={apiKey} libraries={['places', 'marker']} language="en" region="IN">
            <PickerMapInner
              initialLocation={initialLocation}
              onConfirm={onConfirm}
              onClose={onClose}
            />
          </APIProvider>
        )}
      </div>
    </div>
  );
};
