import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabase, USER_ANALYSES_TABLE } from '@/lib/supabase';

type Props = { params: Promise<{ slug: string }> };

export default async function SharePage({ params }: Props) {
  const { slug } = await params;
  const supabase = getSupabase();

  const { data } = await supabase
    .from(USER_ANALYSES_TABLE)
    .select(`
      share_slug,
      created_at,
      analyses (
        id,
        bias_score,
        leaning,
        hf_score,
        hf_label,
        input_text,
        content_type
      )
    `)
    .eq('share_slug', slug)
    .single();

  if (!data || !data.analyses) notFound();

  const a = data.analyses as unknown as {
    id: string;
    bias_score: number;
    leaning: string;
    hf_score: number | null;
    hf_label: string | null;
    input_text: string;
    content_type: string;
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-14">
      <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
        {a.content_type} · {new Date(data.created_at as string).toLocaleDateString()}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Bias analysis</h1>

      <div className="mt-6 rounded-xl border border-line bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">LLM leaning</span>
          <span className="text-sm font-semibold text-ink capitalize">{a.leaning}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">LLM bias score</span>
          <span className="text-sm font-semibold text-ink">{a.bias_score.toFixed(2)}</span>
        </div>
        {a.hf_score !== null && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Classifier verdict</span>
              <span className={`text-sm font-semibold ${a.hf_label === 'biased' ? 'text-lean-far-right' : 'text-green-600'}`}>
                {a.hf_label === 'biased' ? 'Biased' : 'Non-biased'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Classifier confidence</span>
              <span className="text-sm font-semibold text-ink">{Math.round(a.hf_score * 100)}%</span>
            </div>
          </>
        )}

        <div className="border-t border-line pt-4">
          <p className="text-xs text-ink-muted mb-2">Text analyzed</p>
          <p className="text-sm leading-relaxed text-ink line-clamp-6">{a.input_text}</p>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-muted">
        Analyzed with{' '}
        <Link href="/" className="text-accent hover:underline">
          BiasLens
        </Link>
      </p>
    </div>
  );
}
