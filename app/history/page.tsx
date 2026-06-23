import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabase, USER_ANALYSES_TABLE } from '@/lib/supabase';
import { BiasTimeline, type TimelinePoint } from '@/components/timeline/bias-timeline';

const LEANING_COLOR: Record<string, string> = {
  'far-left': 'text-lean-far-left',
  left: 'text-lean-left',
  center: 'text-lean-center',
  right: 'text-lean-right',
  'far-right': 'text-lean-far-right',
};

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from(USER_ANALYSES_TABLE)
    .select(`
      id,
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
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  type Row = NonNullable<typeof rows>[number];
  type Analysis = {
    id: string;
    bias_score: number;
    leaning: string;
    hf_score: number | null;
    hf_label: string | null;
    input_text: string;
    content_type: string;
  };

  const items = (rows ?? []).map((r: Row) => {
    const a = r.analyses as unknown as Analysis | null;
    return {
      userAnalysisId: r.id as string,
      shareSlug: r.share_slug as string,
      createdAt: r.created_at as string,
      analysis: a,
    };
  }).filter((r) => r.analysis !== null);

  const timelinePoints: TimelinePoint[] = [...items]
    .reverse()
    .map((r) => ({
      id: r.userAnalysisId,
      date: r.createdAt,
      biasScore: r.analysis!.bias_score,
      hfScore: r.analysis!.hf_score,
      leaning: r.analysis!.leaning,
      contentType: r.analysis!.content_type,
      inputPreview: r.analysis!.input_text.slice(0, 60),
    }));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Your analyses</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          + New analysis
        </Link>
      </div>

      {timelinePoints.length >= 2 && (
        <div className="mt-8 rounded-xl border border-line bg-surface p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-ink-muted">
            Bias over time
          </h2>
          <BiasTimeline points={timelinePoints} />
        </div>
      )}

      <div className="mt-8 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-ink-muted">No analyses yet. Run one from the home page.</p>
        ) : (
          items.map((r) => (
            <div
              key={r.userAnalysisId}
              className="flex items-center justify-between rounded-lg border border-line bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {r.analysis!.input_text.slice(0, 80)}
                  {r.analysis!.input_text.length > 80 ? '…' : ''}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {r.analysis!.content_type} · {new Date(r.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-3">
                <span className={`text-sm font-medium ${LEANING_COLOR[r.analysis!.leaning] ?? 'text-ink'}`}>
                  {r.analysis!.leaning}
                </span>
                <Link
                  href={`/share/${r.shareSlug}`}
                  className="text-xs text-accent hover:underline"
                >
                  Share ↗
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
