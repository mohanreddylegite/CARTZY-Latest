import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  Navigation,
  Phone,
  Power,
  Radio,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getServerConfigStatus } from '../services/storeService';
import {
  driverCompleteDeliveryWithOtp,
  driverUpdateAssignmentStatus,
  fetchDriverAssignments,
  fetchMyDeliveryPartnerProfile,
  updateDeliveryPartnerOnlineStatus,
  updateDriverLiveCoordinates,
} from '../services/marketplaceService';
import { getBrowserMapsApiKey } from '../services/mapsAddressParser';
import { haversineDistanceKm } from '../services/serviceabilityService';
import { formatINR } from '../services/indianValidation';
import { DeliveryAssignment, DeliveryPartner, ServerConfigStatus } from '../types';
import { OrderLocationMapModal } from '../components/maps/OrderLocationMapModal';

export const DeliveryDashboard: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<DeliveryPartner | null>(null);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [taskFilter, setTaskFilter] = useState<'active' | 'completed' | 'all'>('active');
  const [serverConfig, setServerConfig] = useState<ServerConfigStatus | null>(null);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'active' | 'denied' | 'error'>('idle');
  const [mapAssignment, setMapAssignment] = useState<DeliveryAssignment | null>(null);

  const lastGpsPushRef = useRef<number>(0);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [pData, list, cfg] = await Promise.all([
        fetchMyDeliveryPartnerProfile(user.uid),
        fetchDriverAssignments(user.uid),
        getServerConfigStatus(),
      ]);
      setPartner(pData);
      setAssignments(list);
      setServerConfig(cfg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubPartner = onSnapshot(
      doc(db, 'deliveryPartners', user.uid),
      (snap) => {
        if (snap.exists()) {
          setPartner(snap.data() as DeliveryPartner);
        }
      },
      () => {}
    );
    const unsubAssignments = onSnapshot(
      query(collection(db, 'deliveryAssignments'), where('driverId', '==', user.uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as DeliveryAssignment))
          .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
        setAssignments(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'deliveryAssignments');
        } catch {
          // ignore snapshot permission error while partner not approved
        }
      }
    );
    return () => {
      unsubPartner();
      unsubAssignments();
    };
  }, [user]);

  const activeOutForDeliveryIds = useMemo(
    () => assignments.filter((a) => a.status === 'Out for Delivery').map((a) => a.id),
    [assignments]
  );

  // Active-delivery-only GPS sharing: watches geolocation strictly when driver is Online AND has an Out for Delivery task
  useEffect(() => {
    if (!user || !partner?.isOnline || partner.verificationStatus !== 'Approved' || activeOutForDeliveryIds.length === 0) {
      setGpsStatus('idle');
      return;
    }

    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('active');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastGpsPushRef.current < 10000) return;
        lastGpsPushRef.current = now;
        void updateDriverLiveCoordinates({
          driverId: user.uid,
          activeAssignmentIds: activeOutForDeliveryIds,
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
      },
      (geoErr) => {
        setGpsStatus(geoErr.code === geoErr.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [user, partner?.isOnline, partner?.verificationStatus, activeOutForDeliveryIds]);

  const earnings = useMemo(() => {
    const completed = assignments.filter((a) => a.status === 'Delivered');
    const todayKey = new Date().toISOString().slice(0, 10);
    const monthKey = new Date().toISOString().slice(0, 7);
    const weekCutoff = Date.now() - 7 * 86400000;

    const today = completed
      .filter((a) => (a.deliveredAt || a.updatedAt).startsWith(todayKey))
      .reduce((s, a) => s + (a.deliveryFeeEarning || 0), 0);
    const week = completed
      .filter((a) => new Date(a.deliveredAt || a.updatedAt).getTime() >= weekCutoff)
      .reduce((s, a) => s + (a.deliveryFeeEarning || 0), 0);
    const month = completed
      .filter((a) => (a.deliveredAt || a.updatedAt).startsWith(monthKey))
      .reduce((s, a) => s + (a.deliveryFeeEarning || 0), 0);
    const total = completed.reduce((s, a) => s + (a.deliveryFeeEarning || 0), 0);

    return { today, week, month, total, count: completed.length };
  }, [assignments]);

  const activeTasks = useMemo(
    () => assignments.filter((a) => !['Delivered', 'Rejected'].includes(a.status)),
    [assignments]
  );
  const completedTasks = useMemo(
    () => assignments.filter((a) => ['Delivered', 'Rejected'].includes(a.status)),
    [assignments]
  );
  const visibleAssignments = useMemo(() => {
    if (taskFilter === 'active') return activeTasks;
    if (taskFilter === 'completed') return completedTasks;
    return assignments;
  }, [assignments, activeTasks, completedTasks, taskFilter]);

  const handleToggleOnline = async () => {
    if (!user || !partner || togglingOnline) return;
    setError('');
    setFeedback('');
    setTogglingOnline(true);
    try {
      const next = !partner.isOnline;
      await updateDeliveryPartnerOnlineStatus(user.uid, next);
      setPartner({ ...partner, isOnline: next });
      setFeedback(next ? 'You are now ONLINE and visible for dispatches.' : 'You are now OFFLINE.');
    } catch (err: any) {
      setError(err?.message || 'Unable to update availability status.');
    } finally {
      setTogglingOnline(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading Delivery Console...</div>;
  }

  if (!partner) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          <Truck className="w-12 h-12 text-[#2563EB] mx-auto" />
          <h1 className="text-2xl font-extrabold text-[#14213D]">Delivery Partner Portal</h1>
          <p className="text-sm text-slate-600">
            Register your vehicle and driving license to deliver CARTZY orders in your city.
          </p>
          <Link
            to="/delivery/register"
            className="inline-block px-6 py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-sm font-bold"
          >
            Register as Delivery Partner
          </Link>
        </div>
      </div>
    );
  }

  if (partner.verificationStatus !== 'Approved') {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          {partner.verificationStatus === 'Suspended' ? (
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          ) : (
            <Clock className="w-12 h-12 text-[#FCA311] mx-auto" />
          )}
          <h1 className="text-2xl font-extrabold text-[#14213D]">{partner.fullName}</h1>
          <p className="text-sm text-slate-600">
            Verification Status: <strong>{partner.verificationStatus}</strong>
          </p>
          <p className="text-xs text-slate-500">
            {partner.verificationStatus === 'Pending'
              ? 'CARTZY Admin is reviewing your vehicle & license documents. Once approved, you can go online and accept deliveries.'
              : 'Your delivery account is currently suspended. Reach out to support@cartzy.in.'}
          </p>
          <Link to="/" className="inline-block px-5 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold">
            Return to Storefront
          </Link>
        </div>
      </div>
    );
  }

  const mapsApiKey = getBrowserMapsApiKey(serverConfig?.googleMapsApiKey);

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200">
        <div>
          <p className="text-xs font-bold text-[#2563EB] uppercase tracking-wider">CARTZY Delivery Fleet</p>
          <h1 className="text-2xl font-extrabold text-[#14213D]">{partner.fullName}</h1>
          <p className="text-xs text-slate-500">
            {partner.vehicleType} · <span className="font-mono">{partner.vehicleNumber}</span> · {partner.city}, {partner.state}
            {partner.assignedZones && partner.assignedZones.length > 0 && (
              <> · Zones: <strong className="text-[#14213D]">{partner.assignedZones.join(', ')}</strong></>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {gpsStatus === 'active' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Active Delivery GPS Sharing ON
            </span>
          )}
          {gpsStatus === 'denied' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
              Browser GPS permission denied — live pin sharing paused
            </span>
          )}

          <button
            type="button"
            disabled={togglingOnline}
            onClick={handleToggleOnline}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-colors disabled:opacity-60 cursor-pointer ${
              partner.isOnline
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
            }`}
          >
            <Power className="w-4 h-4" />
            {partner.isOnline ? 'ONLINE (Accepting Tasks)' : 'OFFLINE (Go Online)'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
      )}

      {/* Earnings Dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Today's Earnings", val: formatINR(earnings.today) },
          { label: 'Last 7 Days', val: formatINR(earnings.week) },
          { label: 'This Month', val: formatINR(earnings.month) },
          { label: 'Total Earnings', val: formatINR(earnings.total) },
          { label: 'Completed Deliveries', val: earnings.count },
        ].map((card) => (
          <div key={card.label} className="bg-white p-4 rounded-2xl border border-slate-200">
            <p className="text-xs text-slate-500">{card.label}</p>
            <p className="text-xl font-extrabold text-[#14213D] mt-1 font-mono tabular-nums">{card.val}</p>
          </div>
        ))}
      </div>

      {/* Assigned Deliveries Queue */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold text-[#14213D] mr-2">
              Deliveries ({assignments.length})
            </h2>
            {(['active', 'completed', 'all'] as const).map((tab) => {
              const count =
                tab === 'active'
                  ? activeTasks.length
                  : tab === 'completed'
                  ? completedTasks.length
                  : assignments.length;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTaskFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize cursor-pointer ${
                    taskFilter === tab
                      ? 'bg-[#14213D] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:text-[#14213D]'
                  }`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={loadData}
            className="text-xs font-bold text-[#2563EB] hover:underline cursor-pointer"
          >
            Refresh Tasks
          </button>
        </div>

        {visibleAssignments.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
            <Truck className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="font-bold text-sm text-[#14213D]">
              {assignments.length === 0
                ? 'No delivery tasks assigned yet'
                : `No ${taskFilter} delivery tasks`}
            </p>
            <p className="text-xs text-slate-500">
              Stay Online so CARTZY Admin can dispatch local customer orders to you.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {visibleAssignments.map((a) => {
              const hasCoords =
                typeof a.deliveryLat === 'number' && typeof a.deliveryLng === 'number';
              const navUrl = hasCoords
                ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${a.deliveryLat},${a.deliveryLng}`)}`
                : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.deliverySummary)}`;
              const distKm =
                hasCoords &&
                typeof (a.driverLat ?? partner.currentLat) === 'number' &&
                typeof (a.driverLng ?? partner.currentLng) === 'number'
                  ? haversineDistanceKm(
                      (a.driverLat ?? partner.currentLat)!,
                      (a.driverLng ?? partner.currentLng)!,
                      a.deliveryLat!,
                      a.deliveryLng!
                    )
                  : null;

              return (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <span className="font-mono font-extrabold text-[#14213D] text-base">
                          {a.orderNumber}
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Assigned {new Date(a.assignedAt).toLocaleString('en-IN')} · Fee:{' '}
                          <strong className="font-mono text-emerald-700">
                            {formatINR(a.deliveryFeeEarning)}
                          </strong>
                        </p>
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold ${
                          a.status === 'Delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : a.status === 'Rejected'
                            ? 'bg-red-100 text-red-800'
                            : a.status === 'Out for Delivery'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 text-xs bg-[#F8FAFC] p-3.5 rounded-xl border border-slate-200/70">
                      <div className="space-y-1">
                        <p className="font-bold text-[#14213D]">Pickup Hub</p>
                        <p className="text-slate-600">{a.pickupSummary}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold text-[#14213D]">Dropoff Customer</p>
                        <p className="font-semibold text-slate-800">{a.customerName}</p>
                        <p className="text-slate-600">{a.deliverySummary}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <a
                            href={`tel:+91${a.customerMobile}`}
                            className="font-mono text-[#2563EB] hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <Phone className="w-3 h-3" /> +91 {a.customerMobile}
                          </a>
                          {distKm !== null && (
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                              {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`} away
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {a.codAmountToCollect > 0 && a.status !== 'Delivered' && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-center justify-between">
                        <span className="font-bold">Cash on Delivery — Collect at Doorstep:</span>
                        <strong className="font-mono text-sm">{formatINR(a.codAmountToCollect)}</strong>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setMapAssignment(a)}
                        className="px-3 py-1.5 rounded-xl border border-[#2563EB] text-[#2563EB] hover:bg-blue-50 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5" /> Live Map View
                      </button>
                      <a
                        href={navUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Navigation className="w-3.5 h-3.5" /> Navigate in Google Maps
                      </a>
                    </div>
                  </div>

                  {/* Step Actions */}
                  {a.status === 'Assigned' && (
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={async () => {
                          if (!user) return;
                          setError('');
                          setFeedback('');
                          setBusyId(a.id);
                          try {
                            await driverUpdateAssignmentStatus({
                              assignment: a,
                              driverUid: user.uid,
                              status: 'Accepted',
                            });
                            setFeedback(`Accepted delivery task for ${a.orderNumber}.`);
                            await loadData();
                          } catch (err: any) {
                            setError(err?.message || 'Unable to accept delivery task.');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        Accept Task
                      </button>
                      <button
                        type="button"
                        disabled={busyId === a.id}
                        onClick={async () => {
                          if (!user) return;
                          setError('');
                          setFeedback('');
                          setBusyId(a.id);
                          try {
                            await driverUpdateAssignmentStatus({
                              assignment: a,
                              driverUid: user.uid,
                              status: 'Rejected',
                            });
                            setFeedback(`Task ${a.orderNumber} returned to Admin for reassignment.`);
                            await loadData();
                          } catch (err: any) {
                            setError(err?.message || 'Unable to reject delivery task.');
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {a.status === 'Accepted' && (
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={async () => {
                        if (!user) return;
                        setError('');
                        setFeedback('');
                        setBusyId(a.id);
                        try {
                          await driverUpdateAssignmentStatus({
                            assignment: a,
                            driverUid: user.uid,
                            status: 'Picked Up',
                          });
                          setFeedback(`Package picked up for ${a.orderNumber}.`);
                          await loadData();
                        } catch (err: any) {
                          setError(err?.message || 'Unable to update package pickup status.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      Confirm Package Picked Up
                    </button>
                  )}

                  {a.status === 'Picked Up' && (
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={async () => {
                        if (!user) return;
                        setError('');
                        setFeedback('');
                        setBusyId(a.id);
                        try {
                          await driverUpdateAssignmentStatus({
                            assignment: a,
                            driverUid: user.uid,
                            status: 'Out for Delivery',
                          });
                          setFeedback(
                            `Order ${a.orderNumber} is Out for Delivery. Live GPS updates shared while active.`
                          );
                          await loadData();
                        } catch (err: any) {
                          setError(err?.message || 'Unable to start delivery.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="w-full py-2.5 rounded-xl bg-[#FCA311] hover:bg-amber-500 text-[#14213D] text-xs font-extrabold cursor-pointer disabled:opacity-50"
                    >
                      Start Delivery (Out for Delivery &amp; Share GPS)
                    </button>
                  )}

                  {a.status === 'Out for Delivery' && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!user) return;
                        setError('');
                        setFeedback('');
                        setBusyId(a.id);
                        try {
                          await driverCompleteDeliveryWithOtp({
                            assignment: a,
                            driverUid: user.uid,
                            otpPin: otpInputs[a.id] || '',
                          });
                          setFeedback(`Order ${a.orderNumber} delivered and verified via 4-digit PIN!`);
                          await loadData();
                        } catch (err: any) {
                          setError(err?.message || 'OTP verification failed.');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="p-3.5 rounded-xl bg-[#14213D] text-white space-y-2.5"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <KeyRound className="w-4 h-4 text-[#FCA311]" />
                        Enter Customer&apos;s 4-Digit Delivery PIN to Complete
                      </div>
                      <div className="flex gap-2">
                        <input
                          required
                          maxLength={4}
                          inputMode="numeric"
                          placeholder="4-digit PIN"
                          value={otpInputs[a.id] || ''}
                          onChange={(e) =>
                            setOtpInputs({
                              ...otpInputs,
                              [a.id]: e.target.value.replace(/\D/g, '').slice(0, 4),
                            })
                          }
                          className="flex-1 rounded-xl px-3 py-2 text-sm font-mono tracking-widest text-[#14213D] bg-white"
                        />
                        <button
                          type="submit"
                          disabled={busyId === a.id}
                          className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold disabled:opacity-50"
                        >
                          {busyId === a.id ? 'Verifying...' : 'Verify & Deliver'}
                        </button>
                      </div>
                    </form>
                  )}

                  {a.status === 'Delivered' && (
                    <div className="pt-2 border-t border-slate-100 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Delivered on {new Date(a.deliveredAt || a.updatedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {mapAssignment && (
        <OrderLocationMapModal
          isOpen={Boolean(mapAssignment)}
          onClose={() => setMapAssignment(null)}
          apiKey={mapsApiKey}
          orderNumber={mapAssignment.orderNumber}
          recipientName={mapAssignment.customerName}
          addressText={mapAssignment.deliverySummary}
          lat={mapAssignment.deliveryLat}
          lng={mapAssignment.deliveryLng}
          driverLocation={
            typeof mapAssignment.driverLat === 'number' && typeof mapAssignment.driverLng === 'number'
              ? {
                  lat: mapAssignment.driverLat,
                  lng: mapAssignment.driverLng,
                  driverName: mapAssignment.driverName,
                  updatedAt: mapAssignment.driverLocationUpdatedAt,
                }
              : partner.currentLat && partner.currentLng
              ? {
                  lat: partner.currentLat,
                  lng: partner.currentLng,
                  driverName: partner.fullName,
                  updatedAt: partner.locationUpdatedAt,
                }
              : null
          }
          showNavigateButton
        />
      )}
    </div>
  );
};
