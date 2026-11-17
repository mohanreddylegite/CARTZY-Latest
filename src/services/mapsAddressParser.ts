import { INDIAN_STATES } from './indianValidation';

export interface ParsedGoogleAddress {
  houseNo: string;
  street: string;
  locality: string;
  landmark: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
  placeId?: string;
  formattedAddress?: string;
}

export interface RawAddressComponent {
  longText?: string | null;
  shortText?: string | null;
  types?: string[];
}

const STATE_ALIASES: Record<string, string> = {
  'nct of delhi': 'Delhi',
  'national capital territory of delhi': 'Delhi',
  'new delhi': 'Delhi',
  orissa: 'Odisha',
  pondicherry: 'Puducherry',
  'jammu & kashmir': 'Jammu and Kashmir',
  'andaman & nicobar islands': 'Andaman and Nicobar Islands',
  'andaman & nicobar': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'the dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  uttaranchal: 'Uttarakhand',
};

export function matchIndianState(rawState?: string | null): string {
  if (!rawState) return '';
  const cleaned = rawState.trim();
  const lower = cleaned.toLowerCase();
  if (STATE_ALIASES[lower]) return STATE_ALIASES[lower];
  const exact = INDIAN_STATES.find((s) => s.toLowerCase() === lower);
  if (exact) return exact;
  const partial = INDIAN_STATES.find(
    (s) => lower.includes(s.toLowerCase()) || s.toLowerCase().includes(lower)
  );
  return partial || '';
}

function getComponentText(components: RawAddressComponent[], typeList: string[]): string {
  for (const t of typeList) {
    const match = components.find((c) => Array.isArray(c.types) && c.types.includes(t));
    if (match?.longText) return match.longText.trim();
  }
  return '';
}

export function parseGoogleAddressComponents(params: {
  addressComponents?: RawAddressComponent[];
  formattedAddress?: string;
  displayName?: string;
  lat: number;
  lng: number;
  placeId?: string;
}): ParsedGoogleAddress {
  const { addressComponents = [], formattedAddress = '', displayName = '', lat, lng, placeId } = params;

  const subpremise = getComponentText(addressComponents, ['subpremise', 'floor', 'room']);
  const premise = getComponentText(addressComponents, ['premise', 'establishment', 'point_of_interest']);
  const streetNumber = getComponentText(addressComponents, ['street_number']);
  const route = getComponentText(addressComponents, ['route']);

  const sublocality2 = getComponentText(addressComponents, ['sublocality_level_2', 'sublocality_level_3']);
  const sublocality1 = getComponentText(addressComponents, ['sublocality_level_1', 'sublocality', 'neighborhood']);
  const landmark = getComponentText(addressComponents, ['landmark', 'point_of_interest']);

  const city =
    getComponentText(addressComponents, ['locality', 'postal_town', 'administrative_area_level_3']) ||
    sublocality1;
  const rawDistrict = getComponentText(addressComponents, ['administrative_area_level_2']);
  const district = rawDistrict.replace(/\s+District$/i, '').trim() || city;

  const rawState = getComponentText(addressComponents, ['administrative_area_level_1']);
  const matchedState = matchIndianState(rawState) || 'Karnataka';

  const rawPostal = getComponentText(addressComponents, ['postal_code']).replace(/\D/g, '');
  const pincode = /^[1-9][0-9]{5}$/.test(rawPostal) ? rawPostal : '';

  const houseParts = [subpremise, premise, !route && streetNumber ? streetNumber : ''].filter(Boolean);
  let houseNo = houseParts.join(', ');
  if (!houseNo && displayName && !formattedAddress.startsWith(displayName)) {
    houseNo = displayName;
  } else if (!houseNo && displayName) {
    houseNo = displayName;
  }

  const streetParts = [streetNumber && route ? streetNumber : '', route].filter(Boolean);
  const street = streetParts.join(' ') || sublocality2 || '';
  const locality = [sublocality2, sublocality1].filter((v, i, arr) => v && arr.indexOf(v) === i).join(', ') || city;

  return {
    houseNo: houseNo.slice(0, 100),
    street: street.slice(0, 150),
    locality: locality.slice(0, 150),
    landmark: (landmark && landmark !== premise ? landmark : '').slice(0, 150),
    city: city.slice(0, 100),
    district: district.slice(0, 100),
    state: matchedState,
    pincode,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    ...(placeId ? { placeId } : {}),
    ...(formattedAddress ? { formattedAddress } : {}),
  };
}

export function getBrowserMapsApiKey(serverConfigKey?: string | null): string {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  return envKey || serverConfigKey?.trim() || '';
}

export function reportGmpQuotaIfApplicable(errOrStatus: unknown): boolean {
  const text =
    typeof errOrStatus === 'string'
      ? errOrStatus
      : errOrStatus instanceof Error
      ? errOrStatus.message
      : JSON.stringify(errOrStatus || '');

  if (
    text.includes('RESOURCE_EXHAUSTED') ||
    text.includes('OVER_QUERY_LIMIT') ||
    text.includes('OverQuotaMapError') ||
    text.includes('QuotaExceededError') ||
    text.includes('QUOTA_EXCEEDED') ||
    text.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    return true;
  }
  return false;
}
