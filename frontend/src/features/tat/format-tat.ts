export function formatTat(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds === 0) return '0m'
  if (seconds < 60) return '<1m'
  const minutes = Math.floor(seconds / 60)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
