// The two-letter country code is the source of truth everywhere (API
// params, filter values); this only formats it for display. Falls back to
// the code itself when Intl has no English name for it, or the code is
// malformed (Intl.DisplayNames.of throws on an ill-formed region subtag).
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

export function formatCountryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}
