// This file exports route config data, not just components, by design --
// react-refresh/only-export-components is for component files, so it's
// disabled for the whole file rather than worked around.
/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'

import { AppLayout } from './AppLayout'
import { EmployeesPage } from './pages/EmployeesPage'
import { LoginPage } from './pages/LoginPage'

// Lazy: the chart library (@mui/x-charts) only downloads once someone
// actually opens the dashboard, not on first load of the employee table.
const InsightsPage = lazy(() => import('./pages/InsightsPage'))

// A plain data structure, not a created router: the real app wraps this
// in createBrowserRouter (router.tsx); tests wrap it in createMemoryRouter
// instead, so each test gets its own fresh navigation history rather than
// sharing one router's state across every render(<App />) call.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <EmployeesPage /> },
      {
        path: 'insights',
        element: (
          <Suspense fallback={null}>
            <InsightsPage />
          </Suspense>
        ),
      },
      { path: 'login', element: <LoginPage /> },
    ],
  },
]
