// MUI's TablePagination is 0-based; the API's page query param is 1-based.
// This is the one place that conversion happens.

export function muiPageToApiPage(muiPage: number): number {
  return muiPage + 1
}

export function apiPageToMuiPage(apiPage: number): number {
  return apiPage - 1
}
