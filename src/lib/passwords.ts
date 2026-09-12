import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password.trim(), ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string | null | undefined,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await bcrypt.compare(password.trim(), passwordHash);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): string | null {
  if (password.trim().length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères";
  }
  return null;
}
