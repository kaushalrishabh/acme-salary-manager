import EditIcon from '@mui/icons-material/Edit'
import InsightsIcon from '@mui/icons-material/Insights'
import LockIcon from '@mui/icons-material/Lock'
import PersonIcon from '@mui/icons-material/Person'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { Link as RouterLink, Navigate, useLocation } from 'react-router-dom'

import { useLogin } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'

interface LocationState {
  from?: string
  sessionExpired?: boolean
}

const BRAND_POINTS = [
  { Icon: VisibilityIcon, text: 'Browse salaries without logging in' },
  { Icon: EditIcon, text: 'Add, edit and delete as HR' },
  { Icon: InsightsIcon, text: 'Insights by country, department and job title' },
]

// 401 means wrong credentials -- shown as one generic message that never
// says which field was wrong. Anything else (network failure, a 500) is a
// different, equally generic message, since that isn't a credentials
// problem at all and telling them apart helps the person decide whether
// retyping their password is even worth trying again.
function errorMessage(error: ApiError | null): string | null {
  if (!error) return null
  if (error.status === 401) return 'Incorrect username or password'
  return 'Something went wrong logging in. Please try again.'
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { isLoggedIn, login } = useAuth()
  const loginMutation = useLogin()
  const location = useLocation()
  const state = location.state as LocationState | null

  // One redirect path, not two: driving the post-login return-to-origin
  // navigation from this same isLoggedIn check (rather than also calling
  // navigate() by hand in onSuccess) avoids a race between the two --
  // login() updates authStore synchronously, which re-renders this
  // component with isLoggedIn now true, before an imperative navigate()
  // call from onSuccess would've taken effect, so a second navigation call
  // was silently overriding this one and always landing on "/" instead of
  // state.from.
  if (isLoggedIn) {
    return <Navigate to={state?.from ?? '/'} replace />
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    loginMutation.mutate(
      { username, password },
      {
        onSuccess: (response) => {
          login(response.token)
        },
        onError: () => {
          setPassword('')
        },
      },
    )
  }

  const message = errorMessage(loginMutation.error as ApiError | null)

  return (
    <Box
      sx={{
        flexGrow: 1,
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        width: '100%',
      }}
    >
      <Box
        sx={(theme) => ({
          display: { xs: 'none', md: 'flex' },
          flex: '0 0 42%',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 3,
          p: 6,
          color: '#ffffff',
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
        })}
      >
        <Typography variant="h4" component="p" sx={{ fontWeight: 600 }}>
          HR Salary Manager
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          One place for every employee's salary, across every country.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
          {BRAND_POINTS.map(({ Icon, text }) => (
            <Box key={text} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Icon fontSize="small" />
              <Typography variant="body2">{text}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
        }}
      >
        <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 420 }}>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Log in to add, edit or delete employees. Browsing stays public.
          </Typography>

          {state?.sessionExpired && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Session expired, please log in again.
            </Alert>
          )}

          {message && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {message}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Username"
              fullWidth
              margin="normal"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((previous) => !previous)}
                        edge="end"
                        size="small"
                      >
                        {showPassword ? (
                          <VisibilityOffIcon fontSize="small" />
                        ) : (
                          <VisibilityIcon fontSize="small" />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 2 }}
              loading={loginMutation.isPending}
            >
              Log in
            </Button>
          </Box>

          <Link
            component={RouterLink}
            to="/"
            underline="hover"
            sx={{ display: 'block', textAlign: 'center', mt: 2 }}
          >
            Continue browsing read-only
          </Link>
        </Paper>
      </Box>
    </Box>
  )
}
