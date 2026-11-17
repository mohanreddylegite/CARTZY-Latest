import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DEFAULT_PUBLIC_DRIVERS,
  DEFAULT_PUBLIC_SHOPS,
  DEFAULT_VIJAYAWADA_CITY,
  DEFAULT_VIJAYAWADA_WARDS,
  DEFAULT_VIJAYAWADA_ZONES,
} from '../data/vijayawadaDefaults';
import type {
  DeliveryPartner,
  PublicDriver,
  PublicShop,
  SellerProfile,
  ServiceCity,
  ServiceWard,
  ServiceZone,
} from '../types';
import { writeAuditLog } from './marketplaceService';
import type { ServiceabilityDataset } from './serviceabilityService';

export async function fetchServiceabilityDataset(): Promise<Required<ServiceabilityDataset>> {
  const [citySnap, zoneSnap, wardSnap, shopSnap, driverSnap] = await Promise.all([
    getDocs(collection(db, 'serviceCities')).catch(() => null),
    getDocs(collection(db, 'serviceZones')).catch(() => null),
    getDocs(collection(db, 'serviceWards')).catch(() => null),
    getDocs(collection(db, 'publicShops')).catch(() => null),
    getDocs(collection(db, 'publicDrivers')).catch(() => null),
  ]);

  const cities =
    citySnap && !citySnap.empty
      ? citySnap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceCity))
      : [DEFAULT_VIJAYAWADA_CITY];

  const zones =
    zoneSnap && !zoneSnap.empty
      ? zoneSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceZone))
      : DEFAULT_VIJAYAWADA_ZONES;

  const wards =
    wardSnap && !wardSnap.empty
      ? wardSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ServiceWard))
          .sort((a, b) => a.wardNumber - b.wardNumber)
      : DEFAULT_VIJAYAWADA_WARDS;

  const publicShops =
    shopSnap && !shopSnap.empty
      ? shopSnap.docs.map((d) => ({ shopId: d.id, ...d.data() } as PublicShop))
      : DEFAULT_PUBLIC_SHOPS;

  const publicDrivers =
    driverSnap && !driverSnap.empty
      ? driverSnap.docs.map((d) => ({ partnerId: d.id, ...d.data() } as PublicDriver))
      : DEFAULT_PUBLIC_DRIVERS;

  return { cities, zones, wards, publicShops, publicDrivers };
}

export async function seedVijayawadaServiceArea(actorUid: string, actorEmail: string): Promise<void> {
  const now = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'serviceCities', DEFAULT_VIJAYAWADA_CITY.id), {
      ...DEFAULT_VIJAYAWADA_CITY,
      updatedAt: now,
    });
    for (const z of DEFAULT_VIJAYAWADA_ZONES) {
      batch.set(doc(db, 'serviceZones', z.id), { ...z, updatedAt: now });
    }
    for (const shop of DEFAULT_PUBLIC_SHOPS) {
      batch.set(doc(db, 'publicShops', shop.shopId), { ...shop, updatedAt: now });
    }
    for (const drv of DEFAULT_PUBLIC_DRIVERS) {
      batch.set(doc(db, 'publicDrivers', drv.partnerId), { ...drv, updatedAt: now });
    }
    await batch.commit();

    // Seed 86 configurable wards in batches of 45 (Firestore limit safe)
    for (let start = 0; start < DEFAULT_VIJAYAWADA_WARDS.length; start += 45) {
      const wardBatch = writeBatch(db);
      for (const ward of DEFAULT_VIJAYAWADA_WARDS.slice(start, start + 45)) {
        wardBatch.set(doc(db, 'serviceWards', ward.id), { ...ward, updatedAt: now });
      }
      await wardBatch.commit();
    }

    await writeAuditLog({
      actorUid,
      actorEmail,
      action: 'SEED_VIJAYAWADA_SERVICE_AREA',
      targetType: 'serviceCities',
      targetId: 'vijayawada',
      summary: 'Initialized Vijayawada Municipal Corporation service city, 4 operational zones, 86 configurable wards, and Bhavanipuram hub.',
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'serviceCities/vijayawada');
  }
}

export async function saveServiceCity(
  city: ServiceCity,
  actorUid: string,
  actorEmail: string
): Promise<ServiceCity> {
  const now = new Date().toISOString();
  const payload: ServiceCity = {
    ...city,
    id: city.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    updatedAt: now,
    createdAt: city.createdAt || now,
  };
  try {
    await setDoc(doc(db, 'serviceCities', payload.id), payload, { merge: true });
    await writeAuditLog({
      actorUid,
      actorEmail,
      action: 'SAVE_SERVICE_CITY',
      targetType: 'serviceCities',
      targetId: payload.id,
      summary: `Saved city ${payload.name} (active=${payload.active}, hub=${payload.hubLocality})`,
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceCities/${payload.id}`);
  }
}

export async function saveServiceZone(
  zone: ServiceZone,
  actorUid: string,
  actorEmail: string
): Promise<ServiceZone> {
  const now = new Date().toISOString();
  const payload: ServiceZone = {
    ...zone,
    id: zone.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'serviceZones', payload.id), payload, { merge: true });
    await writeAuditLog({
      actorUid,
      actorEmail,
      action: 'SAVE_SERVICE_ZONE',
      targetType: 'serviceZones',
      targetId: payload.id,
      summary: `Saved zone ${payload.name} (enabled=${payload.enabled}, fee=₹${payload.deliveryCharge}, min=₹${payload.minOrderAmount})`,
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceZones/${payload.id}`);
  }
}

export async function saveServiceWard(
  ward: ServiceWard,
  actorUid: string,
  actorEmail: string
): Promise<ServiceWard> {
  const now = new Date().toISOString();
  const payload: ServiceWard = {
    ...ward,
    id: ward.id || `${ward.cityId}_ward_${ward.wardNumber}`,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'serviceWards', payload.id), payload, { merge: true });
    await writeAuditLog({
      actorUid,
      actorEmail,
      action: 'UPDATE_SERVICE_WARD',
      targetType: 'serviceWards',
      targetId: payload.id,
      summary: `Updated Ward #${payload.wardNumber} (${payload.wardName}) · zone=${payload.zoneId} · enabled=${payload.enabled}`,
    });
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceWards/${payload.id}`);
  }
}

export async function batchToggleWards(params: {
  wards: ServiceWard[];
  enabled: boolean;
  actorUid: string;
  actorEmail: string;
}) {
  const now = new Date().toISOString();
  try {
    for (let i = 0; i < params.wards.length; i += 45) {
      const batch = writeBatch(db);
      for (const w of params.wards.slice(i, i + 45)) {
        batch.set(
          doc(db, 'serviceWards', w.id),
          { ...w, enabled: params.enabled, updatedAt: now },
          { merge: true }
        );
      }
      await batch.commit();
    }
    await writeAuditLog({
      actorUid: params.actorUid,
      actorEmail: params.actorEmail,
      action: 'BATCH_TOGGLE_WARDS',
      targetType: 'serviceWards',
      targetId: params.wards[0]?.cityId || 'vijayawada',
      summary: `${params.enabled ? 'Activated' : 'Deactivated'} ${params.wards.length} wards`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'serviceWards');
  }
}

export async function savePublicShop(
  shop: PublicShop,
  actorUid?: string,
  actorEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const payload: PublicShop = { ...shop, updatedAt: now };
  try {
    await setDoc(doc(db, 'publicShops', shop.shopId), payload, { merge: true });
    if (actorUid && actorEmail) {
      await writeAuditLog({
        actorUid,
        actorEmail,
        action: 'UPDATE_PUBLIC_SHOP_COVERAGE',
        targetType: 'publicShops',
        targetId: shop.shopId,
        summary: `Updated shop ${shop.shopName} zones=[${shop.serviceZones.join(',')}] open=${!shop.operatingHours?.temporarilyClosed}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicShops/${shop.shopId}`);
  }
}

export async function syncSellerToPublicShop(seller: SellerProfile): Promise<void> {
  const payload: PublicShop = {
    shopId: seller.sellerId,
    shopName: seller.businessName,
    cityId: seller.cityId || 'vijayawada',
    locality: seller.pickupAddress.locality,
    addressText: `${seller.pickupAddress.houseNo}, ${seller.pickupAddress.street}, ${seller.pickupAddress.locality}, ${seller.pickupAddress.city}, ${seller.pickupAddress.state} ${seller.pickupAddress.pincode}`,
    pincode: seller.pickupAddress.pincode,
    lat: seller.pickupAddress.lat ?? 16.5336501,
    lng: seller.pickupAddress.lng ?? 80.5992125,
    serviceZones: seller.serviceZones && seller.serviceZones.length > 0 ? seller.serviceZones : ['vja-north'],
    ...(seller.wardNumbers ? { wardNumbers: seller.wardNumbers } : {}),
    operatingHours: seller.operatingHours || {
      openTime: '08:00',
      closeTime: '22:00',
      daysOpen: [0, 1, 2, 3, 4, 5, 6],
      is24x7: false,
      temporarilyClosed: false,
    },
    approvalStatus: seller.approvalStatus,
    isHub: false,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'publicShops', payload.shopId), payload, { merge: true });
}

export async function savePublicDriver(
  driver: PublicDriver,
  actorUid?: string,
  actorEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const payload: PublicDriver = { ...driver, updatedAt: now };
  try {
    await setDoc(doc(db, 'publicDrivers', driver.partnerId), payload, { merge: true });
    if (actorUid && actorEmail) {
      await writeAuditLog({
        actorUid,
        actorEmail,
        action: 'UPDATE_PUBLIC_DRIVER_ZONES',
        targetType: 'publicDrivers',
        targetId: driver.partnerId,
        summary: `Updated driver ${driver.partnerId} online=${driver.isOnline} zones=[${driver.assignedZones.join(',')}]`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicDrivers/${driver.partnerId}`);
  }
}

export async function syncDeliveryPartnerToPublicDriver(partner: DeliveryPartner): Promise<void> {
  const payload: PublicDriver = {
    partnerId: partner.partnerId,
    cityId: partner.cityId || 'vijayawada',
    assignedZones:
      partner.assignedZones && partner.assignedZones.length > 0 ? partner.assignedZones : ['vja-north'],
    isOnline: partner.isOnline,
    verificationStatus: partner.verificationStatus,
    ...(typeof partner.currentLat === 'number' ? { currentLat: partner.currentLat } : {}),
    ...(typeof partner.currentLng === 'number' ? { currentLng: partner.currentLng } : {}),
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, 'publicDrivers', payload.partnerId), payload, { merge: true });
}

export async function adminAssignDriverZones(params: {
  partner: DeliveryPartner;
  cityId: string;
  assignedZones: string[];
  adminUid: string;
  adminEmail: string;
}) {
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'deliveryPartners', params.partner.partnerId), {
      cityId: params.cityId,
      assignedZones: params.assignedZones,
      updatedAt: now,
    });
    await syncDeliveryPartnerToPublicDriver({
      ...params.partner,
      cityId: params.cityId,
      assignedZones: params.assignedZones,
      updatedAt: now,
    });
    await writeAuditLog({
      actorUid: params.adminUid,
      actorEmail: params.adminEmail,
      action: 'ASSIGN_DRIVER_ZONES',
      targetType: 'deliveryPartner',
      targetId: params.partner.partnerId,
      summary: `Assigned ${params.partner.fullName} to zones [${params.assignedZones.join(', ')}]`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `deliveryPartners/${params.partner.partnerId}`);
  }
}
