import { NextResponse } from 'next/server';
import { getSupabaseAuth } from '@/lib/supabase-server-auth';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await getSupabaseAuth();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(origin);
}
