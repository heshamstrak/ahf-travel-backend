import { generateKeyPairSync, sign as edSign } from "crypto";
import { EdDsaJwt, InvalidTokenError } from "./jwt";

const pair = generateKeyPairSync("ed25519");
const privateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" });
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });

const options = {
  privateKeyPem,
  publicKeyPem,
  issuer: "egypt-beyond-api",
  audience: "egypt-beyond-web",
  ttlSeconds: 600,
};

const claims = { sub: "11111111-1111-4111-8111-111111111111", role: "CUSTOMER", sid: "22222222-2222-4222-8222-222222222222" };

function resign(parts: { header?: object; payload?: object }, key = privateKeyPem): string {
  const [h, p] = signedParts();
  const header = Buffer.from(JSON.stringify(parts.header ?? JSON.parse(Buffer.from(h, "base64url").toString()))).toString("base64url");
  const payload = Buffer.from(JSON.stringify(parts.payload ?? JSON.parse(Buffer.from(p, "base64url").toString()))).toString("base64url");
  const input = `${header}.${payload}`;
  const sig = edSign(null, Buffer.from(input), key).toString("base64url");
  return `${input}.${sig}`;
}

function signedParts(): [string, string] {
  const token = new EdDsaJwt(options).signAccessToken(claims);
  const [h, p] = token.split(".");
  return [h, p];
}

describe("EdDsaJwt", () => {
  const jwt = new EdDsaJwt(options);

  it("round-trips the claims it signs", () => {
    const token = jwt.signAccessToken(claims);
    const verified = jwt.verifyAccessToken(token);
    expect(verified).toMatchObject({ ...claims, iss: options.issuer, aud: options.audience });
    expect(verified.exp - verified.iat).toBe(600);
  });

  it("rejects a token whose payload was altered", () => {
    const [h, p, s] = jwt.signAccessToken(claims).split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), role: "ADMIN" })).toString("base64url");
    expect(() => jwt.verifyAccessToken(`${h}.${forged}.${s}`)).toThrow(new InvalidTokenError("bad signature").message);
  });

  it("rejects a token signed with a different key", () => {
    const other = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" });
    expect(() => jwt.verifyAccessToken(resign({}, other))).toThrow(InvalidTokenError);
  });

  it("rejects the none algorithm and any non-EdDSA algorithm", () => {
    const [, p] = signedParts();
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
    expect(() => jwt.verifyAccessToken(none)).toThrow(/unsupported algorithm/);
    expect(() => jwt.verifyAccessToken(resign({ header: { alg: "HS256", typ: "JWT" } }))).toThrow(/unsupported algorithm/);
  });

  it("rejects an expired token", () => {
    const token = jwt.signAccessToken(claims, 1_000_000);
    expect(() => jwt.verifyAccessToken(token, 1_000_000 + 601)).toThrow(/expired/);
  });

  it("rejects a token for another audience or issuer", () => {
    const otherAudience = new EdDsaJwt({ ...options, audience: "someone-else" }).signAccessToken(claims);
    expect(() => jwt.verifyAccessToken(otherAudience)).toThrow(/bad audience/);
    const otherIssuer = new EdDsaJwt({ ...options, issuer: "impostor" }).signAccessToken(claims);
    expect(() => jwt.verifyAccessToken(otherIssuer)).toThrow(/bad issuer/);
  });

  it("rejects malformed input without throwing unexpected errors", () => {
    expect(() => jwt.verifyAccessToken("not-a-jwt")).toThrow(InvalidTokenError);
    expect(() => jwt.verifyAccessToken("a.b.c")).toThrow(InvalidTokenError);
  });

  it("refuses keys that are not Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
    expect(
      () =>
        new EdDsaJwt({
          ...options,
          privateKeyPem: rsa.privateKey.export({ type: "pkcs8", format: "pem" }),
          publicKeyPem: rsa.publicKey.export({ type: "spki", format: "pem" }),
        }),
    ).toThrow(/must be Ed25519/);
  });
});
