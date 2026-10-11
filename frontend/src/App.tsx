import AppBar from '@mui/material/AppBar'
import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EmployeeTable } from './components/EmployeeTable'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <CssBaseline />
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="h1">
            ACME Salary Manager
          </Typography>
        </Toolbar>
      </AppBar>
      {/* Future slices (login, forms, insights) render as further sections
          or routes inside this container. */}
      <Container component="main" sx={{ py: 4 }}>
        <EmployeeTable />
      </Container>
    </QueryClientProvider>
  )
}

export default App
