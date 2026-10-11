// Money fields from the API are exact major-unit strings. This formats
// them for display only -- never used in arithmetic. Intl.NumberFormat
// already knows each currency's minor-unit convention (e.g. JPY has no
// decimal places), so there is no currency-specific logic here at all.
//
// The locale is fixed to 'en-US', not the browser's default: passing
// `undefined` uses whichever locale the runtime happens to have (an Indian
// digit-grouping locale, in one environment this was tested in), which
// would make the same salary display differently depending on who's
// viewing it, not on whose salary it is.
export function formatMoney(amountMajor: string, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(amountMajor))
}
