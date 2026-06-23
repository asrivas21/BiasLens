'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export type TimelinePoint = {
  id: string;
  date: string;
  biasScore: number;
  hfScore: number | null;
  leaning: string;
  contentType: string;
  inputPreview: string;
};

interface BiasTimelineProps {
  points: TimelinePoint[];
}

export function BiasTimeline({ points }: BiasTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || points.length < 2) return;

    const width = svgRef.current.clientWidth || 600;
    const height = 240;
    const m = { top: 20, right: 20, bottom: 40, left: 44 };

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const x = d3
      .scaleTime()
      .domain(d3.extent(sorted, (d) => new Date(d.date)) as [Date, Date])
      .range([m.left, width - m.right]);

    // biasScore is signed -1..+1; map to absolute 0..1 for the chart.
    const y = d3.scaleLinear().domain([0, 1]).range([height - m.bottom, m.top]);

    const absScore = (d: TimelinePoint) => Math.abs(d.biasScore);

    const biasLine = d3
      .line<TimelinePoint>()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(absScore(d)))
      .curve(d3.curveMonotoneX);

    // Axes
    svg
      .append('g')
      .attr('transform', `translate(0,${height - m.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat('%b %d') as (d: Date | d3.NumberValue) => string))
      .attr('font-size', '11px')
      .attr('color', 'var(--color-ink-muted, #888)');

    svg
      .append('g')
      .attr('transform', `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format('.0%')))
      .attr('font-size', '11px')
      .attr('color', 'var(--color-ink-muted, #888)');

    // LLM bias line
    svg
      .append('path')
      .datum(sorted)
      .attr('fill', 'none')
      .attr('stroke', '#6366f1')
      .attr('stroke-width', 2)
      .attr('d', biasLine);

    // HF classifier line (dashed) — only if any points have hf_score
    const hfPoints = sorted.filter((d) => d.hfScore !== null);
    if (hfPoints.length >= 2) {
      const hfLine = d3
        .line<TimelinePoint>()
        .x((d) => x(new Date(d.date)))
        .y((d) => y(d.hfScore!))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(hfPoints)
        .attr('fill', 'none')
        .attr('stroke', '#f59e0b')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 3')
        .attr('d', hfLine);
    }

    // Dots on bias line
    svg
      .selectAll<SVGCircleElement, TimelinePoint>('.dot')
      .data(sorted)
      .join('circle')
      .attr('class', 'dot')
      .attr('cx', (d) => x(new Date(d.date)))
      .attr('cy', (d) => y(absScore(d)))
      .attr('r', 4)
      .attr('fill', (d) => {
        if (d.leaning === 'far-left' || d.leaning === 'far-right') return '#ef4444';
        if (d.leaning === 'center') return '#22c55e';
        return '#6366f1';
      })
      .append('title')
      .text((d) => `${d.inputPreview}\n${d.date.slice(0, 10)}`);

    // Legend
    const lg = svg.append('g').attr('transform', `translate(${m.left + 8},${m.top})`);
    lg.append('line').attr('x2', 16).attr('stroke', '#6366f1').attr('stroke-width', 2);
    lg.append('text').attr('x', 20).attr('y', 4).attr('font-size', '11px').attr('fill', 'currentColor').text('LLM bias score');
    if (hfPoints.length >= 2) {
      lg.append('line').attr('x2', 16).attr('y1', 16).attr('y2', 16).attr('stroke', '#f59e0b').attr('stroke-width', 2).attr('stroke-dasharray', '5 3');
      lg.append('text').attr('x', 20).attr('y', 20).attr('font-size', '11px').attr('fill', 'currentColor').text('Classifier score');
    }
  }, [points]);

  if (points.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Run at least 2 analyses to see the bias timeline.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-ink-muted">
        Bias score over time · {points.length} analyses
      </p>
      <svg ref={svgRef} width="100%" height={240} className="overflow-visible" />
    </div>
  );
}
