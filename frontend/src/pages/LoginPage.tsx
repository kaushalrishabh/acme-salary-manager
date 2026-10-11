import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useLogin } from '../api/auth'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/useAuth'

interface LocationState {
  from?: string
  sessionExpired?: boolean
}

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const { login } = useAuth()
  const loginMutation = useLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    loginMutation.mutate(
      { username, password },
      {
        onSuccess: (response) => {
          login(response.token)
          navigate(state?.from ?? '/', { replace: true })
        },
      },
    )
  }

  const error = loginMutation.error as ApiError | null

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
      <Paper variant="outlined" sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          Log in
        </Typography>

        {state?.sessionExpired && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Session expired, please log in again.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error.message}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Username"
            fullWidth
            margin="normal"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
      </Paper>
    </Box>
  )
}
