# CARTZY Firestore Security Specification

## 1. Data Invariants
1. Default-deny catch-all at root prevents access to any unmapped collection.
2. Users cannot escalate their `role` or `suspended` status on `users/{userId}` creation or update; `role` must start as `'customer'` or `'seller'` and remain immutable for non-admins.
3. Only the bootstrapped owner (`mohanreddy86417@gmail.com` with `email_verified == true`) or UIDs present in `/admins/{uid}` have `isAdmin()` privileges.
4. PII (`users`, `addresses`, `orders`, `payments`, `notifications`, `supportTickets`, `sellers`, `deliveryPartners`, `deliveryAssignments`, `orderSecrets`, `rewards`) is strictly scoped to owners, authorized order participants, or `isAdmin()`. Public storefront discovery reads only non-PII `publicShops`, `publicDrivers`, `serviceCities`, `serviceZones`, and `serviceWards`.
5. `orders` cannot be created for another user (`userId == request.auth.uid`), cannot mark online payments `'Paid'` without a Razorpay payment ID, and cannot be deleted.
6. Order status transitions are strictly partitioned by role: customers can only cancel within the pre-dispatch window or submit returns after `'Delivered'`; approved sellers can only advance `'Accepted'..'Shipped'` or pre-dispatch `'Cancelled'` (never `'Delivered'`); approved drivers can only mark `'Out for Delivery'` or `'Delivered'` after matching `otpSubmittedHash == otpHash`.
7. `orderItems`, `payments`, `sellerSettlements`, and product stock mutations enforce relational consistency via `exists()` / `existsAfter()` / `getAfter()`.
8. `rewards/{userId}` owner updates lock `userId` and `referralCode`, whitelist mutable keys, and enforce conservation (`pointsBalance` cannot increase faster than `totalEarned`, capped per order).
9. Every document ID on single-document operations passes `isValidId(id)` (`^[a-zA-Z0-9_\-]+$`, max 128 chars).

## 2. Adversarial "Dirty Dozen" Payloads (Must Return PERMISSION_DENIED)
1. **Privilege Escalation on Signup**: `create /users/u1` with `{ uid: 'u1', role: 'admin', ... }` -> Denied.
2. **Role Tampering on Update**: `update /users/u1` by `u1` changing `role` to `'admin'` or `suspended` to `false` -> Denied.
3. **Cross-User PII Read**: `get /users/u2` or `get /orderSecrets/o2` by `u1` -> Denied.
4. **Blanket User List**: `list /users` or `list /sellers` by non-admin `u1` -> Denied.
5. **Unverified Admin Spoof**: `isAdmin()` check when `email == 'mohanreddy86417@gmail.com'` and `email_verified == false` -> Denied.
6. **Unapproved Seller Product Write**: `create /products/p1` by seller whose `approvalStatus != 'Approved'` -> Denied.
7. **Shadow Field Injection**: `create /addresses/a1` with extra ghost key `{ ..., isAdminAddress: true }` -> Denied (`hasOnly()` check).
8. **Seller Self-Delivery Bypass**: `update /orders/o1` by approved seller setting `orderStatus: 'Delivered'` -> Denied.
9. **Fake Paid Order**: `create /orders/o1` with `paymentMethod: 'UPI'`, `paymentStatus: 'Paid'`, missing `razorpayPaymentId` -> Denied.
10. **Driver Delivery Without Matching OTP**: `update /deliveryAssignments/o1` setting `status: 'Delivered'` when `otpSubmittedHash != otpHash` -> Denied.
11. **Rewards Points Inflation**: `update /rewards/u1` by `u1` increasing `pointsBalance` without matching `totalEarned` or modifying `referralCode` -> Denied.
12. **Orphaned OrderItem / Settlement**: `create /orderItems/i1` or `create /sellerSettlements/s1` referencing non-existent `orderId` -> Denied (`existsAfter` check).
