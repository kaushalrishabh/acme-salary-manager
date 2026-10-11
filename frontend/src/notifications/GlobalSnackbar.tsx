import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import { useSyncExternalStore } from 'react'

import { clearNotice, getNotice, subscribeNotice } from './noticeStore'

export function GlobalSnackbar() {
  const notice = useSyncExternalStore(subscribeNotice, getNotice)

  return (
    <Snackbar
      open={notice !== null}
      autoHideDuration={4000}
      onClose={clearNotice}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      {notice ? (
        <Alert severity={notice.severity} onClose={clearNotice} sx={{ width: '100%' }}>
          {notice.message}
        </Alert>
      ) : undefined}
    </Snackbar>
  )
}
