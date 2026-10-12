import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { GlobalSnackbar } from '../notifications/GlobalSnackbar'
import { API_BASE_URL, makeEmployee } from '../test/handlers'
import { server } from '../test/server'
import { theme } from '../theme'
import { DeleteEmployeeDialog } from './DeleteEmployeeDialog'

function renderDialog(employee = makeEmployee({ id: 7, full_name: 'Grace Hopper' })) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <DeleteEmployeeDialog open onClose={onClose} employee={employee} />
        <GlobalSnackbar />
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { onClose, employee }
}

describe('DeleteEmployeeDialog', () => {
  it('names the employee in the confirmation text', () => {
    renderDialog()

    expect(screen.getByText(/grace hopper/i)).toBeInTheDocument()
  })

  it('cancelling closes without deleting', async () => {
    let requestCount = 0
    server.use(
      http.delete(`${API_BASE_URL}/employees/7`, () => {
        requestCount += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onClose).toHaveBeenCalled()
    expect(requestCount).toBe(0)
  })

  it('confirming deletes, shows a success notice, and closes', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/employees/7`, () => new HttpResponse(null, { status: 204 })),
    )
    const user = userEvent.setup()
    const { onClose } = renderDialog()

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    expect(await screen.findByText('Employee deleted')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows an error notice if the delete fails', async () => {
    server.use(
      http.delete(`${API_BASE_URL}/employees/7`, () =>
        HttpResponse.json({ detail: 'Employee 7 not found' }, { status: 404 }),
      ),
    )
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(screen.getByText('Employee 7 not found')).toBeInTheDocument())
  })
})
