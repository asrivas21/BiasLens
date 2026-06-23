import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Auth-aware Supabase client that reads the session from cookies.
// Use this in Server Components and Route Handlers that need the current user.
// For cache/admin operations, continue using getSupabase() (service role).
export async function getSupabaseAuth() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll is called from Server Components where cookies can't be
            // mutated. The middleware handles refreshing the session.
          }
        },
      },
    },
  );
}

export async function getCurrentUser() {
  const supabase = await getSupabaseAuth();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
