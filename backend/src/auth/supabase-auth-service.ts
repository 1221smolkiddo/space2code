import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthenticatedUser, AuthService } from './auth-service.js'

export class SupabaseAuthService implements AuthService {
  constructor(private readonly client: SupabaseClient) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.client.auth.getUser(token)
    if (error || !data.user) throw new Error('Invalid or expired access token')

    return {
      id: data.user.id,
      email: data.user.email ?? null,
    }
  }
}
