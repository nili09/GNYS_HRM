import { SignJWT, jwtVerify } from "jose";

const EXPIRY = "12h";

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

export async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyToken(token) {
  // Pin the algorithm so a forged token can't request a different one
  // (defence-in-depth against alg-confusion / "alg:none").
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
  return payload;
}
