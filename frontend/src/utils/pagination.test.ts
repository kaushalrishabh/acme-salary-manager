import { describe, expect, it } from 'vitest'

import { apiPageToMuiPage, muiPageToApiPage } from './pagination'

describe('muiPageToApiPage', () => {
  it('converts MUI 0-based page to the API 1-based page', () => {
    expect(muiPageToApiPage(0)).toBe(1)
    expect(muiPageToApiPage(1)).toBe(2)
    expect(muiPageToApiPage(9)).toBe(10)
  })
})

describe('apiPageToMuiPage', () => {
  it('converts the API 1-based page to MUI 0-based page', () => {
    expect(apiPageToMuiPage(1)).toBe(0)
    expect(apiPageToMuiPage(2)).toBe(1)
    expect(apiPageToMuiPage(10)).toBe(9)
  })
})

describe('muiPageToApiPage and apiPageToMuiPage', () => {
  it('round-trip for any non-negative MUI page', () => {
    for (const muiPage of [0, 1, 5, 42]) {
      expect(apiPageToMuiPage(muiPageToApiPage(muiPage))).toBe(muiPage)
    }
  })
})
