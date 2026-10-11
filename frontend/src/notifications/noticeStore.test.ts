import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearNotice, getNotice, showNotice, subscribeNotice } from './noticeStore'

beforeEach(() => {
  clearNotice()
})

describe('noticeStore', () => {
  it('starts with no notice', () => {
    expect(getNotice()).toBeNull()
  })

  it('showNotice sets the message and severity', () => {
    showNotice('Employee created', 'success')

    expect(getNotice()).toMatchObject({ message: 'Employee created', severity: 'success' })
  })

  it('defaults to success severity when not given', () => {
    showNotice('Saved')

    expect(getNotice()?.severity).toBe('success')
  })

  it('clearNotice resets to null', () => {
    showNotice('Employee created')

    clearNotice()

    expect(getNotice()).toBeNull()
  })

  it('notifies subscribers on show and clear', () => {
    const listener = vi.fn()
    subscribeNotice(listener)

    showNotice('Employee created')
    clearNotice()

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('each notice gets a distinct id, so two identical messages in a row both show', () => {
    showNotice('Saved')
    const first = getNotice()?.id
    showNotice('Saved')
    const second = getNotice()?.id

    expect(first).not.toBe(second)
  })
})
