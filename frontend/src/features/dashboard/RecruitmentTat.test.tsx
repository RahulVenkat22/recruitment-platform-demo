import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { RecruitmentTat } from './RecruitmentTat'
import type { DashboardInsights, DashboardMetric } from '@/types/domain'

// The browser animates headline numbers on entry; jsdom has no viewport observer.
beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterAll(() => vi.unstubAllGlobals())

const metric: DashboardMetric = {
  value: 12,
  delta: -2,
  unit: 'days',
  detail: 'Candidate added → onboarding · 2 hires',
  series: null,
}

function show(tat: DashboardInsights['tat'], onCandidates = vi.fn()) {
  render(
    <RecruitmentTat
      tat={tat}
      candidateMetric={metric}
      rangeDays={30}
      active={false}
      loading={false}
      onCandidates={onCandidates}
    />,
  )
  return onCandidates
}

describe('dashboard turnaround time', () => {
  it('shows stage durations with their sample sizes and opens completed candidates', () => {
    const onCandidates = show({
      hires: 2,
      incomplete_histories: 0,
      stages: [
        { key: 'hr_review', label: 'TA Review', avg_days: 3.5, hires: 2 },
        { key: 'on_hold', label: 'On Hold', avg_days: 1, hires: 1 },
      ],
    })
    expect(screen.getByText('3.5d')).toBeInTheDocument()
    expect(screen.getByText('2 hires visited this stage')).toBeInTheDocument()
    expect(screen.getByText('1 hire visited this stage')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Candidate TAT/i }))
    expect(onCandidates).toHaveBeenCalledOnce()
  })

  it('explains empty periods without displaying zero stage durations', () => {
    show({ hires: 0, incomplete_histories: 0, stages: [] })
    expect(screen.getByText(/No completed hires in this period/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('explains why hires with incomplete histories have no stage averages', () => {
    show({ hires: 2, incomplete_histories: 2, stages: [] })
    expect(screen.getByText(/2 hires have incomplete stage history/)).toBeInTheDocument()
    expect(screen.getByText(/No complete stage histories are available/)).toBeInTheDocument()
  })
})
