import type { NextRequest } from "next/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export function webauthnConfig(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost";
  const proto =
    request.headers.get("x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const rpID = process.env.WEBAUTHN_RP_ID?.trim() || host.split(":")[0];
  const origin = process.env.WEBAUTHN_ORIGIN?.trim() || `${proto}://${host}`;
  const rpName = process.env.WEBAUTHN_RP_NAME?.trim() || "MKPK Inventaire";
  return { rpID, rpName, origin };
}

async function saveChallenge(input: {
  id: string;
  userId: string | null;
  purpose: "registration" | "authentication";
  challenge: string;
}) {
  const supabase = getSupabaseAdmin();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await supabase
    .from("webauthn_challenges")
    .delete()
    .lt("expires_at", new Date().toISOString());
  const { error } = await supabase.from("webauthn_challenges").upsert({
    id: input.id,
    user_id: input.userId,
    purpose: input.purpose,
    challenge: input.challenge,
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
}

async function consumeChallenge(
  id: string,
  purpose: "registration" | "authentication",
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("webauthn_challenges")
    .select("*")
    .eq("id", id)
    .eq("purpose", purpose)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("webauthn_challenges").delete().eq("id", id);
    return null;
  }
  await supabase.from("webauthn_challenges").delete().eq("id", id);
  return data as { id: string; user_id: string | null; challenge: string };
}

export async function listUserCredentials(userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("webauthn_credentials")
    .select(
      "id, credential_id, public_key, counter, transports, device_label, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createRegistrationOptions(input: {
  request: NextRequest;
  userId: string;
  userName: string;
  userDisplayName: string;
}): Promise<{
  options: PublicKeyCredentialCreationOptionsJSON;
  challengeId: string;
}> {
  const { rpID, rpName } = webauthnConfig(input.request);
  const existing = await listUserCredentials(input.userId);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: input.userName,
    userDisplayName: input.userDisplayName,
    userID: new TextEncoder().encode(input.userId),
    attestationType: "none",
    excludeCredentials: existing.map((cred) => ({
      id: cred.credential_id,
      transports: (cred.transports ?? []) as any,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });
  const challengeId = crypto.randomUUID();
  await saveChallenge({
    id: challengeId,
    userId: input.userId,
    purpose: "registration",
    challenge: options.challenge,
  });
  return { options, challengeId };
}

export async function verifyRegistration(input: {
  request: NextRequest;
  challengeId: string;
  userId: string;
  response: unknown;
  deviceLabel?: string;
}) {
  const challenge = await consumeChallenge(input.challengeId, "registration");
  if (!challenge || challenge.user_id !== input.userId) {
    throw new Error("Challenge biométrique invalide ou expiré");
  }
  const { rpID, origin } = webauthnConfig(input.request);
  const verification = await verifyRegistrationResponse({
    response: input.response as never,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Enregistrement biométrique refusé");
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("webauthn_credentials").insert({
    user_id: input.userId,
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_label:
      input.deviceLabel ||
      (credentialBackedUp
        ? "Appareil synchronisé"
        : credentialDeviceType === "singleDevice"
          ? "Cet appareil"
          : "Clé de sécurité"),
  });
  if (error) throw new Error(error.message);
}

export async function createAuthenticationOptions(input: {
  request: NextRequest;
  userId?: string;
}): Promise<{
  options: PublicKeyCredentialRequestOptionsJSON;
  challengeId: string;
}> {
  const { rpID } = webauthnConfig(input.request);
  const allowCredentials = input.userId
    ? (await listUserCredentials(input.userId)).map((cred) => ({
        id: cred.credential_id,
        transports: (cred.transports ?? []) as any,
      }))
    : undefined;

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "preferred",
    allowCredentials,
  });
  const challengeId = crypto.randomUUID();
  await saveChallenge({
    id: challengeId,
    userId: input.userId ?? null,
    purpose: "authentication",
    challenge: options.challenge,
  });
  return { options, challengeId };
}

export async function verifyAuthentication(input: {
  request: NextRequest;
  challengeId: string;
  response: { id: string };
}) {
  const challenge = await consumeChallenge(input.challengeId, "authentication");
  if (!challenge) throw new Error("Challenge biométrique invalide ou expiré");

  const supabase = getSupabaseAdmin();
  const { data: cred, error } = await supabase
    .from("webauthn_credentials")
    .select("*")
    .eq("credential_id", input.response.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!cred) throw new Error("Identifiant biométrique inconnu");

  const { rpID, origin } = webauthnConfig(input.request);
  const verification = await verifyAuthenticationResponse({
    response: input.response as never,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: cred.credential_id,
      publicKey: Buffer.from(cred.public_key, "base64url"),
      counter: Number(cred.counter),
      transports: (cred.transports ?? []) as any,
    },
  });

  if (!verification.verified) {
    throw new Error("Authentification biométrique refusée");
  }

  await supabase
    .from("webauthn_credentials")
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq("id", cred.id);

  const { data: user, error: userError } = await supabase
    .from("app_users")
    .select(
      "id, name, login, role, active, must_change_password, created_at, password_hash",
    )
    .eq("id", cred.user_id)
    .maybeSingle();
  if (userError) throw new Error(userError.message);
  if (!user?.login || user.active === false) {
    throw new Error("Compte inactif");
  }
  return user;
}
