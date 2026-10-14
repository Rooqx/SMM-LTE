export interface SignInMethod {
  id: string;
  providerId: string;
  createdAt?: Date;
}

export interface ActiveSession {
  id: string;
  token: string;
  expiresAt: Date;
  updatedAt?: Date;
  userAgent?: string;
}
