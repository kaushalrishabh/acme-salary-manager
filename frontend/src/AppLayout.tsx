import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Link as RouterLink, Outlet } from 'react-router-dom'

export function AppLayout() {
  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
            <PeopleAltIcon fontSize="small" />
          </Avatar>
          <Typography variant="h6" component="h1">
            HR Salary Manager
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button component={RouterLink} to="/" color="inherit">
            Employees
          </Button>
          <Button component={RouterLink} to="/insights" color="inherit">
            Insights
          </Button>
        </Toolbar>
      </AppBar>
      {/* maxWidth={false} + sx.maxWidth (not maxWidth="xl", which caps at
          1536px): the employee table needs ~1680px to lay out without a
          horizontal scrollbar at 1920px; Container's own responsive
          gutters still apply regardless of maxWidth. */}
      <Container component="main" maxWidth={false} sx={{ maxWidth: 1680, py: 4 }}>
        <Outlet />
      </Container>
    </>
  )
}
