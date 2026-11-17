import React, { useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
} from '@vis.gl/react-google-maps';
import { ExternalLink, Loader2, MapPin, AlertTriangle, Navigation, Truck, X } from 'lucide-react';
import { haversineDistanceKm } from '../../services/serviceabilityService';

interface DriverLocationInfo {
  lat: number;
  lng: number;
  driverName?: string;
  updatedAt?: string;
}

interface OrderLocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  orderNumber: string;
  recipientName: string;
  addressText: string;
  lat?: number;
  lng?: number;
  driverLocation?: DriverLocationInfo | null;
  showNavigateButton?: boolean;
}

const MapContent: React.FC<{
  lat: number;
  lng: number;
  orderNumber: string;
  recipientName: string;
  addressText: string;
  driverLocation?: DriverLocationInfo | null;
}> = ({ lat, lng, orderNumber, recipientName, addressText, driverLocation }) => {
  const status = useApiLoadingStatus();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [driverMarkerRef, driverMarker] = useAdvancedMarkerRef();
  const [infoOpen, setInfoOpen] = useState(true);
  const [driverInfoOpen, setDriverInfoOpen] = useState(Boolean(driverLocation));

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-2 bg-slate-50">
        <AlertTriangle className="w-7 h-7 text-amber-600" />
        <p className="font-bold text-sm text-[#14213D]">Unable to render interactive Google Map</p>
        <p className="text-xs text-slate-600">
          Use the &ldquo;Open in Google Maps&rdquo; button below or verify API key quota/restrictions.
        </p>
      </div>
    );
  }

  if (status !== APILoadingStatus.LOADED) {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
        Loading delivery pin on Google Maps...
      </div>
    );
  }

  const centerPoint = driverLocation
    ? {
        lat: (lat + driverLocation.lat) / 2,
        lng: (lng + driverLocation.lng) / 2,
      }
    : { lat, lng };

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={centerPoint}
      defaultZoom={driverLocation ? 14 : 16}
      gestureHandling="greedy"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      className="w-full h-full"
    >
      <AdvancedMarker
        ref={markerRef}
        position={{ lat, lng }}
        onClick={() => setInfoOpen((prev) => !prev)}
        title={`Order ${orderNumber} Delivery Location`}
      >
        <Pin background="#14213D" borderColor="#FCA311" glyphColor="#FCA311" scale={1.15} />
      </AdvancedMarker>
      {infoOpen && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={() => setInfoOpen(false)}>
          <div className="text-xs space-y-1 p-0.5">
            <p className="font-bold text-[#14213D]">
              {orderNumber} · {recipientName}
            </p>
            <p className="text-slate-600 leading-snug">{addressText}</p>
            <p className="font-mono text-[11px] text-slate-500">
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
          </div>
        </InfoWindow>
      )}

      {driverLocation && (
        <>
          <AdvancedMarker
            ref={driverMarkerRef}
            position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
            onClick={() => setDriverInfoOpen((prev) => !prev)}
            title="Live Delivery Partner Location"
          >
            <Pin background="#2563EB" borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={1.15} />
          </AdvancedMarker>
          {driverInfoOpen && driverMarker && (
            <InfoWindow
              anchor={driverMarker}
              maxWidth={240}
              onCloseClick={() => setDriverInfoOpen(false)}
            >
              <div className="text-xs space-y-1 p-0.5">
                <p className="font-bold text-[#2563EB]">
                  {driverLocation.driverName || 'CARTZY Delivery Partner'}
                </p>
                <p className="text-slate-600">Live active-delivery GPS pin</p>
                {driverLocation.updatedAt && (
                  <p className="text-[11px] text-slate-500">
                    Updated {new Date(driverLocation.updatedAt).toLocaleTimeString('en-IN')}
                  </p>
                )}
              </div>
            </InfoWindow>
          )}
        </>
      )}
    </GoogleMap>
  );
};

export const OrderLocationMapModal: React.FC<OrderLocationMapModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  orderNumber,
  recipientName,
  addressText,
  lat,
  lng,
  driverLocation,
  showNavigateButton = false,
}) => {
  if (!isOpen) return null;

  const hasCoords = typeof lat === 'number' && typeof lng === 'number';
  const externalMapsUrl = hasCoords
    ? showNavigateButton
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`
    : showNavigateButton
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;

  const effectiveLat = hasCoords ? lat : driverLocation?.lat;
  const effectiveLng = hasCoords ? lng : driverLocation?.lng;
  const canRenderMap = typeof effectiveLat === 'number' && typeof effectiveLng === 'number';

  return (
    <div
      className="fixed inset-0 z-50 bg-[#14213D]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Delivery Location for ${orderNumber}`}
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#14213D] flex items-center gap-2">
              {driverLocation ? (
                <Truck className="w-4 h-4 text-[#2563EB]" />
              ) : (
                <MapPin className="w-4 h-4 text-[#2563EB]" />
              )}
              {driverLocation ? 'Live Delivery Tracking' : 'Delivery Location'} ·{' '}
              <span className="font-mono">{orderNumber}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {recipientName} — {addressText}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close map modal"
            className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:text-[#14213D]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!canRenderMap ? (
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-6 text-center space-y-2 text-xs text-slate-600">
            <MapPin className="w-7 h-7 text-slate-400 mx-auto" />
            <p className="font-bold text-sm text-[#14213D]">No GPS Pin Saved With This Order</p>
            <p>
              This order was placed with manual text address fields only without selecting a Google Maps pin.
            </p>
          </div>
        ) : !apiKey ? (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 space-y-2 text-xs text-amber-900">
            <p className="font-bold text-sm">Google Maps Browser Key Not Configured</p>
            <p>
              Confirmed coordinates:{' '}
              <strong className="font-mono">
                {effectiveLat.toFixed(6)}, {effectiveLng.toFixed(6)}
              </strong>
              . Set <code>VITE_GOOGLE_MAPS_API_KEY</code> to render the embedded interactive map here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-full h-[340px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
              <APIProvider apiKey={apiKey} libraries={['marker']} language="en" region="IN">
                <MapContent
                  lat={effectiveLat}
                  lng={effectiveLng}
                  orderNumber={orderNumber}
                  recipientName={recipientName}
                  addressText={addressText}
                  driverLocation={hasCoords ? driverLocation : null}
                />
              </APIProvider>
            </div>
            {driverLocation && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-blue-50/70 border border-blue-200 rounded-xl px-3 py-2">
                <span>
                  <strong className="text-[#2563EB]">Blue Pin:</strong> {driverLocation.driverName || 'Driver'} live GPS ({driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)})
                  {hasCoords && typeof lat === 'number' && typeof lng === 'number' && (
                    <strong className="ml-1.5 text-emerald-700">
                      · {(() => {
                        const km = haversineDistanceKm(driverLocation.lat, driverLocation.lng, lat, lng);
                        return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(2)} km away`;
                      })()}
                    </strong>
                  )}
                </span>
                <span>
                  <strong className="text-[#14213D]">Orange/Navy Pin:</strong> Customer Doorstep
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {hasCoords ? (
            <span className="text-xs font-mono text-slate-500">
              Destination: {lat.toFixed(6)}, {lng.toFixed(6)}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Manual address order</span>
          )}
          <div className="flex items-center gap-2">
            <a
              href={externalMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-bold inline-flex items-center gap-1.5"
            >
              {showNavigateButton ? (
                <>
                  <Navigation className="w-3.5 h-3.5" /> Navigate in Google Maps
                </>
              ) : (
                <>
                  Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                </>
              )}
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-[#14213D] text-white text-xs font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
