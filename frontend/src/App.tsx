import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EmployeeTable } from './components/EmployeeTable'
import { theme } from './theme'

const queryClient = new QueryClient()

function App() {
  return (
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <CssBaseline />
        <AppBar position="static">
          <Toolbar sx={{ gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
              <PeopleAltIcon fontSize="small" />
            </Avatar>
            <Typography variant="h6" component="h1">
              HR Salary Manager
            </Typography>
            {/* Nav links and Login/Logout land here in S7. */}
            <Box sx={{ flexGrow: 1 }} />
          </Toolbar>
        </AppBar>
        {/* Future slices (forms, insights) render as further sections or
            routes inside this container. maxWidth={false} + sx.maxWidth
            (not maxWidth="xl", which caps at 1536px): the table's content
            needs ~1680px to lay out without a horizontal scrollbar at
            1920px, and Container's own responsive gutters still apply
            regardless of maxWidth. */}
        <Container component="main" maxWidth={false} sx={{ maxWidth: 1680, py: 4 }}>
          <EmployeeTable />
        </Container>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
