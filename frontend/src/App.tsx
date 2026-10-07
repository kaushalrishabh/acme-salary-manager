import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import Typography from '@mui/material/Typography'

function App() {
  return (
    <>
      <CssBaseline />
      <Container sx={{ py: 4 }}>
        <Typography variant="h4" component="h1">
          ACME Salary Manager
        </Typography>
      </Container>
    </>
  )
}

export default App
