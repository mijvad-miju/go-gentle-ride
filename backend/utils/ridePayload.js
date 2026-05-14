/** Remove sensitive fields from API/socket payloads (never expose to drivers, public GETs, or shared trips). */
export function sanitizeRideDoc(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete o.pickupOtp;
  delete o.pickupOtpExpiresAt;
  delete o.shareToken;
  delete o.shareExpiresAt;
  return o;
}
