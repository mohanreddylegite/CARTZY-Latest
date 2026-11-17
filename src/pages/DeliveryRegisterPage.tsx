import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldAlert, Truck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchMyDeliveryPartnerProfile,
  submitDeliveryPartnerApplication,
} from '../services/marketplaceService';
import { INDIAN_STATES, isValidIndianMobile } from '../services/indianValidation';
import { DEFAULT_VIJAYAWADA_ZONES } from '../data/vijayawadaDefaults';
import { fetchServiceabilityDataset } from '../services/serviceAreaStore';
import { DeliveryPartner, ServiceZone } from '../types';

export const DeliveryRegisterPage: React.FC = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<DeliveryPartner | null>(null);
  const [availableZones, setAvailableZones] = useState<ServiceZone[]>(DEFAULT_VIJAYAWADA_ZONES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    fullName: profile?.fullName || '',
    mobile: profile?.mobile || '',
    email: profile?.email || user?.email || '',
    vehicleType: 'Bike' as DeliveryPartner['vehicleType'],
    vehicleNumber: '',
    licenseNumber: '',
    cityId: 'vijayawada',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    assignedZones: ['vja-north', 'vja-central'],
  });

  useEffect(() => {
    fetchServiceabilityDataset()
      .then((dataset) => {
        const enabledZones = dataset.zones.filter((z) => z.enabled);
        if (enabledZones.length > 0) setAvailableZones(enabledZones);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchMyDeliveryPartnerProfile(user.uid)
      .then(setExisting)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        fullName: prev.fullName || profile.fullName || '',
        mobile: prev.mobile || profile.mobile || '',
        email: prev.email || profile.email || user?.email || '',
      }));
    }
  }, [profile, user?.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError('');

    if (form.fullName.trim().length < 2) {
      setError('Enter your full legal name.');
      return;
    }
    if (!isValidIndianMobile(form.mobile)) {
      setError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (form.vehicleNumber.trim().length < 2) {
      setError('Enter your vehicle registration number.');
      return;
    }
    if (form.licenseNumber.trim().length < 4) {
      setError('Enter a valid Driving License / ID number (minimum 4 characters).');
      return;
    }
    if (!form.city.trim()) {
      setError('Enter your operating city.');
      return;
    }
    if (form.assignedZones.length === 0) {
      setError('Select at least one Vijayawada delivery zone.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await submitDeliveryPartnerApplication(user.uid, form);
      setExisting(created);
    } catch (err: any) {
      setError(err?.message || 'Unable to submit delivery partner registration.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Checking delivery partner status...</div>;
  }

  if (existing) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4">
          {existing.verificationStatus === 'Approved' ? (
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
          ) : existing.verificationStatus === 'Suspended' ? (
            <ShieldAlert className="w-12 h-12 text-red-600 mx-auto" />
          ) : (
            <Clock className="w-12 h-12 text-[#FCA311] mx-auto" />
          )}

          <h1 className="text-2xl font-extrabold text-[#14213D]">{existing.fullName}</h1>
          <p className="text-sm text-slate-600">
            Fleet Verification Status:{' '}
            <strong
              className={
                existing.verificationStatus === 'Approved'
                  ? 'text-emerald-700'
                  : existing.verificationStatus === 'Suspended'
                  ? 'text-red-700'
                  : 'text-amber-700'
              }
            >
              {existing.verificationStatus}
            </strong>
          </p>
          <p className="text-xs text-slate-500 leading-relaxed">
            {existing.verificationStatus === 'Approved'
              ? `Your ${existing.vehicleType} (${existing.vehicleNumber}) in ${existing.city} is approved. Open your Delivery Console to go online and accept dispatches.`
              : existing.verificationStatus === 'Suspended'
              ? 'Your delivery partner profile is currently suspended. Contact support@cartzy.in.'
              : 'Your KYC & vehicle details are pending verification by CARTZY Admin.'}
          </p>
          <div className="bg-[#F8FAFC] border border-slate-200 rounded-2xl p-4 text-left text-xs space-y-1.5">
            <p><strong className="text-[#14213D]">Mobile:</strong> <span className="font-mono">+91 {existing.mobile}</span></p>
            <p><strong className="text-[#14213D]">Vehicle &amp; DL:</strong> <span className="font-mono">{existing.vehicleType} · {existing.vehicleNumber} · {existing.licenseNumber}</span></p>
            {existing.assignedZones && existing.assignedZones.length > 0 && (
              <p>
                <strong className="text-[#14213D]">Assigned Zones:</strong>{' '}
                {existing.assignedZones
                  .map((zid) => availableZones.find((z) => z.id === zid)?.name || zid)
                  .join(', ')}
              </p>
            )}
          </div>
          <div className="pt-2 flex flex-wrap justify-center gap-3">
            <Link
              to="/delivery"
              className="px-5 py-2.5 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white text-xs font-bold"
            >
              Open Delivery Console
            </Link>
            <Link
              to="/"
              className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold"
            >
              Back to Store
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-3.5 sm:px-4 md:px-6 py-6 sm:py-8 pb-24 md:pb-10">
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 md:p-8 space-y-6">
        <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
          <div className="w-11 h-11 rounded-2xl bg-[#14213D] text-[#FCA311] flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#14213D]">Deliver with CARTZY</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Register as a verified local delivery partner for doorstep OTP-secured deliveries across India
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">Full Name *</label>
              <input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Full Name as on License"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">
                Mobile Number (+91) *
              </label>
              <input
                required
                maxLength={10}
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })}
                placeholder="9876543210"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">Email Address *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">Vehicle Type *</label>
              <select
                value={form.vehicleType}
                onChange={(e) =>
                  setForm({ ...form, vehicleType: e.target.value as DeliveryPartner['vehicleType'] })
                }
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
              >
                <option value="Bike">Motorbike</option>
                <option value="Scooter">Scooter / EV Two-Wheeler</option>
                <option value="Cycle">Bicycle / E-Cycle</option>
                <option value="Van">Mini Van / Tempo</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">
                Vehicle Registration Number *
              </label>
              <input
                required
                value={form.vehicleNumber}
                onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value.toUpperCase() })}
                placeholder="e.g. AP16AB1234"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">
                Driving License / Govt ID No. *
              </label>
              <input
                required
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value.toUpperCase() })}
                placeholder="e.g. AP1620200012345"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">Operating City *</label>
              <input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. Vijayawada"
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#14213D] mb-1">State *</label>
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm bg-white"
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-[#14213D]">
              Preferred Vijayawada Delivery Zones *
            </label>
            <div className="grid sm:grid-cols-2 gap-2">
              {availableZones.map((z) => {
                const checked = form.assignedZones.includes(z.id);
                return (
                  <label
                    key={z.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer ${
                      checked ? 'border-[#2563EB] bg-blue-50/50 font-semibold text-[#14213D]' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          assignedZones: e.target.checked
                            ? [...prev.assignedZones, z.id]
                            : prev.assignedZones.filter((id) => id !== z.id),
                        }));
                      }}
                    />
                    <span>{z.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-[#14213D] hover:bg-[#2563EB] text-white font-bold text-sm transition-colors disabled:opacity-60"
          >
            {submitting ? 'Submitting Registration...' : 'Submit Delivery Partner Application'}
          </button>
        </form>
      </div>
    </div>
  );
};
