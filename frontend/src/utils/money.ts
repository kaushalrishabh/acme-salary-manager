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

// For the insights chart's axis labels, where "never parseFloat or
// arithmetic" is a harder requirement than formatMoney's above: per
// ECMA-402, NumberFormat#format accepts a numeric string directly (it goes
// through ToIntlMathematicalValue, not Number()/parseFloat), so this
// passes amountMajor straight through with no intermediate float at all.
// TypeScript's own lib types only declare `format(value: number | bigint)`,
// lagging the spec, hence the cast.
export function formatCompactMoney(amountMajor: string, currencyCode: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(amountMajor as unknown as number)
}
