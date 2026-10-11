// hire_date is a date-only string ("YYYY-MM-DD"). `new Date("YYYY-MM-DD")`
// parses that as UTC midnight, which displays as the day *before* in any
// timezone west of UTC -- so we parse the parts and build a local date
// directly instead.
const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })

export function formatDateOnly(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return DATE_ONLY_FORMATTER.format(new Date(year, month - 1, day))
}

// created_at/updated_at have no timezone suffix but are UTC. Appending "Z"
// before parsing tells the browser that, instead of assuming local time.
export function formatUtcTimestamp(timestamp: string): string {
  const withZ = timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`
  return new Date(withZ).toLocaleString()
}
