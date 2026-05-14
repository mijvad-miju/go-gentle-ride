import jwt from 'jsonwebtoken';

const JWT_FALLBACK = 'your-secret-key-change-in-production';

export function getBearerPayload(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET || JWT_FALLBACK);
  } catch {
    return null;
  }
}
