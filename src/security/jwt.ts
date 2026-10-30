import { createPrivateKey, createPublicKey, KeyObject, sign, verify } from "crypto";

/*
 * Minimal EdDSA (Ed25519) JWT implementation (RFC 7519 / RFC 8037) on Node's crypto module.
 * Only EdDSA is accepted; "none" and any other algorithm are rejected on verification.
 */

export interface AccessTokenClaims {
  sub: string;
  role: string;
  sid: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface JwtOptions {
  privateKeyPem: string;
  publicKeyPem: string;
  issuer: string;
  audience: string;
  ttlSeconds: number;
}

export class InvalidTokenError extends Error {}

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString("base64url");

export class EdDsaJwt {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(private readonly options: JwtOptions) {
    this.privateKey = createPrivateKey(options.privateKeyPem);
    this.publicKey = createPublicKey(options.publicKeyPem);
    if (this.privateKey.asymmetricKeyType !== "ed25519" || this.publicKey.asymmetricKeyType !== "ed25519") {
      throw new Error("JWT keys must be Ed25519");
    }
  }

  signAccessToken(input: { sub: string; role: string; sid: string }, nowSeconds = Math.floor(Date.now() / 1000)): string {
    const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT" }));
    const payload: AccessTokenClaims = {
      sub: input.sub,
      role: input.role,
      sid: input.sid,
      iss: this.options.issuer,
      aud: this.options.audience,
      iat: nowSeconds,
      exp: nowSeconds + this.options.ttlSeconds,
    };
    const body = b64url(JSON.stringify(payload));
    const signingInput = `${header}.${body}`;
    const signature = sign(null, Buffer.from(signingInput), this.privateKey).toString("base64url");
    return `${signingInput}.${signature}`;
  }

  verifyAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): AccessTokenClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new InvalidTokenError("malformed");
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    let header: { alg?: unknown; typ?: unknown };
    let payload: Partial<AccessTokenClaims>;
    try {
      header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8")) as typeof header;
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<AccessTokenClaims>;
    } catch {
      throw new InvalidTokenError("malformed");
    }
    if (header.alg !== "EdDSA") throw new InvalidTokenError("unsupported algorithm");

    const valid = verify(null, Buffer.from(`${headerB64}.${payloadB64}`), this.publicKey, Buffer.from(signatureB64, "base64url"));
    if (!valid) throw new InvalidTokenError("bad signature");

    if (payload.iss !== this.options.issuer) throw new InvalidTokenError("bad issuer");
    if (payload.aud !== this.options.audience) throw new InvalidTokenError("bad audience");
    if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new InvalidTokenError("expired");
    if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60) throw new InvalidTokenError("issued in the future");
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || typeof payload.role !== "string") {
      throw new InvalidTokenError("missing claims");
    }
    return payload as AccessTokenClaims;
  }
}
