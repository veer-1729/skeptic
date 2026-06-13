export function jwtSecret(): string {
  return process.env.JWT_SECRET || process.env.JWT_SECRET_BACKUP;
}
