import MenuIcon from '@mui/icons-material/Menu'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import AppBar from '@mui/material/AppBar'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import IconButton from '@mui/material/IconButton'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useEffect, useState, type MouseEvent } from 'react'
import { Link as RouterLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'

import { onSessionExpired } from './auth/authStore'
import { useAuth } from './auth/useAuth'
import { GlobalSnackbar } from './notifications/GlobalSnackbar'

const NAV_LINKS = [
  { to: '/', label: 'Employees' },
  { to: '/insights', label: 'Insights' },
]

// Shared between the desktop nav buttons and the xs menu items, so "the
// same active indicator" (brief, part 2) is one definition, not two drifting
// copies -- color + underline for a button-like element, color + weight for
// a menu item (an ::after bar reads oddly inside a list row).
function activeButtonSx(isActive: boolean) {
  return {
    position: 'relative' as const,
    color: isActive ? 'primary.main' : 'text.primary',
    '&::after': isActive
      ? {
          content: '""',
          position: 'absolute' as const,
          left: 10,
          right: 10,
          bottom: 6,
          height: 2,
          borderRadius: 1,
          backgroundColor: 'primary.main',
        }
      : undefined,
  }
}

function activeMenuItemSx(isActive: boolean) {
  return {
    color: isActive ? 'primary.main' : 'text.primary',
    fontWeight: isActive ? 600 : 400,
  }
}

export function AppLayout() {
  const { isLoggedIn, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)

  const isEmployeesActive = useMatch({ path: '/', end: true }) !== null
  const isInsightsActive = useMatch({ path: '/insights', end: true }) !== null
  const isLoginActive = useMatch({ path: '/login', end: true }) !== null
  const isActiveByPath: Record<string, boolean> = {
    '/': isEmployeesActive,
    '/insights': isInsightsActive,
  }

  useEffect(() => {
    // The API client calls notifySessionExpired() when a write's token is
    // rejected with 401; this is the one place that turns that into a
    // redirect, since it's the one component on every route that can use
    // useNavigate/useLocation.
    return onSessionExpired(() => {
      navigate('/login', {
        state: { from: location.pathname, sessionExpired: true },
        replace: true,
      })
    })
  }, [navigate, location.pathname])

  function handleOpenMenu(event: MouseEvent<HTMLElement>) {
    setMenuAnchor(event.currentTarget)
  }

  function handleCloseMenu() {
    setMenuAnchor(null)
  }

  return (
    // minHeight (not height): a page taller than the viewport (the
    // employee table, insights) still grows past 100vh and the page
    // scrolls normally; a short page (the login form) gets the full
    // remaining height to center itself in, via the Container below being
    // a flex child with flexGrow: 1.
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1.5 }}>
          <Box
            component={RouterLink}
            to="/"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
              <PeopleAltIcon fontSize="small" />
            </Avatar>
            <Typography variant="h6" component="h1" sx={{ display: { xs: 'none', sm: 'block' } }}>
              HR Salary Manager
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1.5 }}>
            {NAV_LINKS.map(({ to, label }) => {
              const isActive = isActiveByPath[to]
              return (
                <Button
                  key={to}
                  component={RouterLink}
                  to={to}
                  aria-current={isActive ? 'page' : undefined}
                  sx={activeButtonSx(isActive)}
                >
                  {label}
                </Button>
              )
            })}
          </Box>

          <Box sx={{ display: { xs: 'flex', sm: 'none' } }}>
            <IconButton
              color="inherit"
              aria-label="Open navigation menu"
              aria-controls={menuAnchor ? 'nav-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={menuAnchor ? 'true' : undefined}
              onClick={handleOpenMenu}
            >
              <MenuIcon />
            </IconButton>
            <Menu id="nav-menu" anchorEl={menuAnchor} open={!!menuAnchor} onClose={handleCloseMenu}>
              {NAV_LINKS.map(({ to, label }) => {
                const isActive = isActiveByPath[to]
                return (
                  <MenuItem
                    key={to}
                    component={RouterLink}
                    to={to}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={handleCloseMenu}
                    sx={activeMenuItemSx(isActive)}
                  >
                    {label}
                  </MenuItem>
                )
              })}
            </Menu>
          </Box>

          {isLoggedIn ? (
            <>
              <Chip label="Logged in" color="success" size="small" variant="outlined" />
              <Button color="inherit" onClick={logout}>
                Logout
              </Button>
            </>
          ) : (
            <Button
              component={RouterLink}
              to="/login"
              variant="contained"
              color="primary"
              aria-current={isLoginActive ? 'page' : undefined}
              sx={{ bgcolor: isLoginActive ? 'primary.dark' : 'primary.main' }}
            >
              Login
            </Button>
          )}
        </Toolbar>
      </AppBar>
      {/* maxWidth={false} + sx.maxWidth (not maxWidth="xl", which caps at
          1536px): the employee table needs ~1680px to lay out without a
          horizontal scrollbar at 1920px; Container's own responsive
          gutters still apply regardless of maxWidth. */}
      <Container
        component="main"
        maxWidth={false}
        sx={{ maxWidth: 1680, py: 4, flexGrow: 1, display: 'flex', flexDirection: 'column' }}
      >
        <Outlet />
      </Container>
      <GlobalSnackbar />
    </Box>
  )
}
