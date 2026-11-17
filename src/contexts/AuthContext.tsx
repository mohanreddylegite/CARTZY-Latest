import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, googleProvider, handleFirestoreError, OperationType, storage } from '../lib/firebase';
import { BUSINESS_CONFIG } from '../config/businessConfig';
import { PrivacySettings, UserProfile } from '../types';

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  orderUpdatesSms: true,
  promotionalOffers: false,
  personalizedRecommendations: true,
  shareLocationForDelivery: true,
};

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  isSuspended: boolean;
  loading: boolean;
  registerCustomer: (data: {
    fullName: string;
    email: string;
    mobile: string;
    password: string;
  }) => Promise<void>;
  registerSeller: (data: {
    fullName: string;
    email: string;
    mobile: string;
    password: string;
  }) => Promise<User>;
  loginCustomer: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  syncPhoneAuthUser: (
    firebaseUser: User,
    defaultRole?: 'customer' | 'seller'
  ) => Promise<{ isNewUser: boolean }>;
  completePhoneOnboarding: (data: {
    fullName: string;
    email?: string;
    photoFile?: File | null;
  }) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  updateCustomerProfile: (
    updates: Partial<
      Pick<
        UserProfile,
        | 'fullName'
        | 'email'
        | 'mobile'
        | 'photoUrl'
        | 'emailVerified'
        | 'phoneVerified'
        | 'defaultPincode'
        | 'onboardingCompleted'
        | 'privacySettings'
      >
    >
  ) => Promise<void>;
  updateCustomerEmail: (newEmail: string, currentPassword?: string) => Promise<{ verificationSent: boolean }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<'updated' | 'linked'>;
  uploadProfilePhoto: (file: File) => Promise<string>;
  removeProfilePhoto: () => Promise<void>;
  deleteCustomerAccount: (currentPassword?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function extractIndianMobile(phoneNumber?: string | null): string {
  if (!phoneNumber) return '';
  const digits = phoneNumber.replace(/\D/g, '');
  const tenDigit = digits.length >= 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(tenDigit) ? tenDigit : '';
}

async function compressAvatar(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, or WebP).');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to read the selected image.'));
      el.src = objectUrl;
    });

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas image processing is unavailable.');

    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    if (dataUrl.length > 55000) {
      throw new Error('Processed photo is still too large. Please select a smaller image.');
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode profile photo.'))),
        'image/jpeg',
        0.78
      );
    });

    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const upsertInFlightRef = React.useRef<
    Map<string, Promise<{ profile: UserProfile; isNewUser: boolean }>>
  >(new Map());

  const upsertUserProfileFromFirebase = async (
    firebaseUser: User,
    defaultRole: 'customer' | 'seller' = 'customer'
  ): Promise<{ profile: UserProfile; isNewUser: boolean }> => {
    const existingPromise = upsertInFlightRef.current.get(firebaseUser.uid);
    if (existingPromise) {
      return existingPromise;
    }

    const work = (async (): Promise<{ profile: UserProfile; isNewUser: boolean }> => {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      const phoneDigits = extractIndianMobile(firebaseUser.phoneNumber);
      const hasVerifiedPhone = Boolean(firebaseUser.phoneNumber);

      if (snap.exists()) {
        const existing = snap.data() as UserProfile;
        const needsMobileSync = Boolean(phoneDigits && !existing.mobile);
        const needsPhoneVerifiedSync = Boolean(hasVerifiedPhone && !existing.phoneVerified);
        const needsEmailVerifiedSync = Boolean(firebaseUser.emailVerified && !existing.emailVerified);
        const needsEmailAuthSync = Boolean(
          firebaseUser.email &&
            firebaseUser.emailVerified &&
            existing.email !== firebaseUser.email
        );
        const needsPhotoSync = Boolean(firebaseUser.photoURL && !existing.photoUrl);

        let mergedProfile = existing;
        if (
          needsMobileSync ||
          needsPhoneVerifiedSync ||
          needsEmailVerifiedSync ||
          needsEmailAuthSync ||
          needsPhotoSync
        ) {
          const now = new Date().toISOString();
          const patch: Partial<UserProfile> = {
            updatedAt: now,
            ...(needsMobileSync ? { mobile: phoneDigits } : {}),
            ...(needsPhoneVerifiedSync ? { phoneVerified: true } : {}),
            ...(needsEmailVerifiedSync ? { emailVerified: true } : {}),
            ...(needsEmailAuthSync && firebaseUser.email ? { email: firebaseUser.email } : {}),
            ...(needsPhotoSync && firebaseUser.photoURL ? { photoUrl: firebaseUser.photoURL } : {}),
          };
          try {
            await updateDoc(userRef, patch);
            mergedProfile = { ...existing, ...patch };
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `users/${firebaseUser.uid}`);
          }
        }
        setProfile(mergedProfile);
        const needsOnboarding =
          mergedProfile.onboardingCompleted === false ||
          (!mergedProfile.onboardingCompleted &&
            (!mergedProfile.fullName || mergedProfile.fullName === 'CARTZY Shopper'));
        return { profile: mergedProfile, isNewUser: needsOnboarding };
      }

      const now = new Date().toISOString();
      const hasDisplayName = Boolean(
        firebaseUser.displayName && firebaseUser.displayName.trim() !== 'CARTZY Shopper'
      );
      const newProfile: UserProfile = {
        uid: firebaseUser.uid,
        fullName: firebaseUser.displayName || 'CARTZY Shopper',
        email: firebaseUser.email || '',
        mobile: phoneDigits,
        role: defaultRole,
        emailVerified: firebaseUser.emailVerified,
        phoneVerified: hasVerifiedPhone,
        onboardingCompleted: hasDisplayName,
        privacySettings: DEFAULT_PRIVACY_SETTINGS,
        suspended: false,
        referralCode: `CZ${firebaseUser.uid.slice(0, 6).toUpperCase()}`,
        ...(firebaseUser.photoURL ? { photoUrl: firebaseUser.photoURL } : {}),
        createdAt: now,
        updatedAt: now,
      };
      try {
        await setDoc(userRef, newProfile);
        setProfile(newProfile);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${firebaseUser.uid}`);
      }
      return { profile: newProfile, isNewUser: !newProfile.onboardingCompleted };
    })();

    upsertInFlightRef.current.set(firebaseUser.uid, work);
    try {
      return await work;
    } finally {
      upsertInFlightRef.current.delete(firebaseUser.uid);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const isBootstrappedAdmin =
            firebaseUser.email === BUSINESS_CONFIG.bootstrappedAdminEmail &&
            firebaseUser.emailVerified;

          let hasAdminDoc = false;
          try {
            const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
            hasAdminDoc = adminSnap.exists();
          } catch {
            hasAdminDoc = false;
          }

          setIsAdmin(isBootstrappedAdmin || hasAdminDoc);
          await upsertUserProfileFromFirebase(firebaseUser);
        } catch (err) {
          console.error('Error syncing user profile:', err);
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  const registerCustomer = async (data: {
    fullName: string;
    email: string;
    mobile: string;
    password: string;
  }) => {
    const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    await updateProfile(cred.user, { displayName: data.fullName.trim() });
    await sendEmailVerification(cred.user);

    const now = new Date().toISOString();
    const userProfile: UserProfile = {
      uid: cred.user.uid,
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      mobile: data.mobile.trim(),
      role: 'customer',
      emailVerified: false,
      phoneVerified: false,
      onboardingCompleted: true,
      privacySettings: DEFAULT_PRIVACY_SETTINGS,
      suspended: false,
      referralCode: `CZ${cred.user.uid.slice(0, 6).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'users', cred.user.uid), userProfile);
      setProfile(userProfile);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${cred.user.uid}`);
    }
  };

  const registerSeller = async (data: {
    fullName: string;
    email: string;
    mobile: string;
    password: string;
  }): Promise<User> => {
    const cred = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
    await updateProfile(cred.user, { displayName: data.fullName.trim() });
    await sendEmailVerification(cred.user).catch(() => {});

    const now = new Date().toISOString();
    const userProfile: UserProfile = {
      uid: cred.user.uid,
      fullName: data.fullName.trim(),
      email: data.email.trim(),
      mobile: data.mobile.trim(),
      role: 'seller',
      emailVerified: false,
      phoneVerified: false,
      onboardingCompleted: true,
      privacySettings: DEFAULT_PRIVACY_SETTINGS,
      suspended: false,
      referralCode: `CZ${cred.user.uid.slice(0, 6).toUpperCase()}`,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await setDoc(doc(db, 'users', cred.user.uid), userProfile);
      setProfile(userProfile);
      setUser(cred.user);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${cred.user.uid}`);
    }
    return cred.user;
  };

  const loginCustomer = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const syncPhoneAuthUser = async (
    firebaseUser: User,
    defaultRole: 'customer' | 'seller' = 'customer'
  ): Promise<{ isNewUser: boolean }> => {
    setUser(firebaseUser);
    const { isNewUser } = await upsertUserProfileFromFirebase(firebaseUser, defaultRole);
    return { isNewUser };
  };

  const completePhoneOnboarding = async (data: {
    fullName: string;
    email?: string;
    photoFile?: File | null;
  }) => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('Please verify your mobile number first.');
    const cleanName = data.fullName.trim();
    if (cleanName.length < 2) {
      throw new Error('Please enter your full name (at least 2 characters).');
    }

    const cleanEmail = (data.email || '').trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Please enter a valid email address or leave it blank.');
    }

    let finalPhotoUrl = '';
    if (data.photoFile) {
      const { blob, dataUrl } = await compressAvatar(data.photoFile);
      finalPhotoUrl = dataUrl;
      try {
        const storageRef = ref(storage, `users/${currentUser.uid}/avatar_${Date.now()}.jpg`);
        const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }).then(() =>
          getDownloadURL(storageRef)
        );
        const timeoutTask = new Promise<never>((_, reject) =>
          window.setTimeout(() => reject(new Error('Storage upload timed out')), 4500)
        );
        finalPhotoUrl = await Promise.race([uploadTask, timeoutTask]);
      } catch {
        finalPhotoUrl = dataUrl;
      }
    }

    const now = new Date().toISOString();
    const updates: Partial<UserProfile> = {
      fullName: cleanName,
      onboardingCompleted: true,
      privacySettings: profile?.privacySettings || DEFAULT_PRIVACY_SETTINGS,
      updatedAt: now,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(finalPhotoUrl ? { photoUrl: finalPhotoUrl } : {}),
    };

    try {
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
      await updateProfile(currentUser, {
        displayName: cleanName,
        ...(finalPhotoUrl && !finalPhotoUrl.startsWith('data:') ? { photoURL: finalPhotoUrl } : {}),
      }).catch(() => {});
      setProfile((prev) =>
        prev
          ? { ...prev, ...updates }
          : {
              uid: currentUser.uid,
              fullName: cleanName,
              email: cleanEmail,
              mobile: extractIndianMobile(currentUser.phoneNumber),
              role: 'customer',
              emailVerified: currentUser.emailVerified,
              phoneVerified: Boolean(currentUser.phoneNumber),
              onboardingCompleted: true,
              privacySettings: DEFAULT_PRIVACY_SETTINGS,
              ...(finalPhotoUrl ? { photoUrl: finalPhotoUrl } : {}),
              createdAt: now,
              updatedAt: now,
            }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const updateCustomerProfile = async (
    updates: Partial<
      Pick<
        UserProfile,
        | 'fullName'
        | 'email'
        | 'mobile'
        | 'photoUrl'
        | 'emailVerified'
        | 'phoneVerified'
        | 'defaultPincode'
        | 'onboardingCompleted'
        | 'privacySettings'
      >
    >
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: now,
      });
      if (updates.fullName && auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: updates.fullName }).catch(() => {});
      }
      setProfile((prev) => (prev ? { ...prev, ...updates, updatedAt: now } : null));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const updateCustomerEmail = async (
    newEmail: string,
    currentPassword?: string
  ): Promise<{ verificationSent: boolean }> => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    const cleanEmail = newEmail.trim();
    const currentUser = auth.currentUser;
    const hasPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');

    let verificationSent = false;
    if (currentUser.email && currentUser.email !== cleanEmail) {
      if (hasPasswordProvider && currentPassword) {
        const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, cred);
      }
      await verifyBeforeUpdateEmail(currentUser, cleanEmail);
      verificationSent = true;
    }

    await updateCustomerProfile({
      email: cleanEmail,
      emailVerified: currentUser.email === cleanEmail ? currentUser.emailVerified : false,
    });

    return { verificationSent };
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<'updated' | 'linked'> => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    const currentUser = auth.currentUser;
    const hasPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');

    if (hasPasswordProvider) {
      if (!currentUser.email) {
        throw new Error('Account email is required to update password.');
      }
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, cred);
      await updatePassword(currentUser, newPassword);
      return 'updated';
    }

    if (!currentUser.email) {
      throw new Error(
        'Please save a verified email address to your account before setting a password.'
      );
    }
    const emailCred = EmailAuthProvider.credential(currentUser.email, newPassword);
    await linkWithCredential(currentUser, emailCred);
    return 'linked';
  };

  const uploadProfilePhoto = async (file: File): Promise<string> => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    const currentUser = auth.currentUser;
    const { blob, dataUrl } = await compressAvatar(file);

    let finalPhotoUrl = dataUrl;
    try {
      const storageRef = ref(storage, `users/${currentUser.uid}/avatar_${Date.now()}.jpg`);
      const uploadTask = uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }).then(() =>
        getDownloadURL(storageRef)
      );
      const timeoutTask = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Storage upload timed out')), 4500)
      );
      finalPhotoUrl = await Promise.race([uploadTask, timeoutTask]);
      await updateProfile(currentUser, { photoURL: finalPhotoUrl }).catch(() => {});
    } catch {
      finalPhotoUrl = dataUrl;
    }

    await updateCustomerProfile({ photoUrl: finalPhotoUrl });
    return finalPhotoUrl;
  };

  const removeProfilePhoto = async () => {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, { photoURL: '' }).catch(() => {});
    await updateCustomerProfile({ photoUrl: '' });
  };

  const deleteCustomerAccount = async (currentPassword?: string) => {
    if (!auth.currentUser) throw new Error('Please sign in first.');
    const currentUser = auth.currentUser;
    const uid = currentUser.uid;
    const hasPasswordProvider = currentUser.providerData.some((p) => p.providerId === 'password');
    const hasGoogleProvider = currentUser.providerData.some((p) => p.providerId === 'google.com');

    if (hasPasswordProvider && currentUser.email) {
      if (!currentPassword) {
        throw new Error('Please enter your current password to confirm account deletion.');
      }
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, cred);
    } else {
      const lastSignInMs = currentUser.metadata?.lastSignInTime
        ? new Date(currentUser.metadata.lastSignInTime).getTime()
        : 0;
      const isStaleSession = !lastSignInMs || Date.now() - lastSignInMs > 4 * 60 * 1000;
      if (isStaleSession) {
        if (hasGoogleProvider) {
          await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
        } else {
          throw new Error(
            'For security, Firebase requires a recent sign-in before deleting your account. Please log out, sign in again via Mobile OTP, and retry deletion.'
          );
        }
      }
    }

    // Delete personal Firestore records BEFORE deleting Auth user so owner rules succeed
    const [addrSnap, notifSnap] = await Promise.all([
      getDocs(query(collection(db, 'addresses'), where('userId', '==', uid))).catch(() => null),
      getDocs(query(collection(db, 'notifications'), where('userId', '==', uid))).catch(() => null),
    ]);

    const deleteOps: Promise<unknown>[] = [
      deleteDoc(doc(db, 'carts', uid)).catch(() => {}),
      deleteDoc(doc(db, 'wishlists', uid)).catch(() => {}),
      deleteDoc(doc(db, 'rewards', uid)).catch(() => {}),
      deleteDoc(doc(db, 'users', uid)).catch(() => {}),
    ];
    if (addrSnap) {
      addrSnap.docs.forEach((d) => deleteOps.push(deleteDoc(d.ref).catch(() => {})));
    }
    if (notifSnap) {
      notifSnap.docs.forEach((d) => deleteOps.push(deleteDoc(d.ref).catch(() => {})));
    }
    await Promise.all(deleteOps);

    try {
      await deleteUser(currentUser);
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        if (hasGoogleProvider) {
          await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
          await deleteUser(currentUser);
        } else {
          throw new Error(
            'For security, please log out and sign in again with Mobile OTP before deleting your account.'
          );
        }
      } else {
        throw err;
      }
    }
    setUser(null);
    setProfile(null);
    setIsAdmin(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        isSuspended: Boolean(profile?.suspended),
        loading,
        registerCustomer,
        registerSeller,
        loginCustomer,
        loginWithGoogle,
        syncPhoneAuthUser,
        completePhoneOnboarding,
        logout,
        resetPassword,
        resendVerification,
        updateCustomerProfile,
        updateCustomerEmail,
        changePassword,
        uploadProfilePhoto,
        removeProfilePhoto,
        deleteCustomerAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
