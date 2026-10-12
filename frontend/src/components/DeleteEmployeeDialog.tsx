import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

import { useDeleteEmployee } from '../api/employees'
import type { ApiError } from '../api/client'
import { showNotice } from '../notifications/noticeStore'
import type { Employee } from '../types/employee'

export interface DeleteEmployeeDialogProps {
  open: boolean
  onClose: () => void
  employee: Employee | null
}

export function DeleteEmployeeDialog({ open, onClose, employee }: DeleteEmployeeDialogProps) {
  const deleteMutation = useDeleteEmployee()

  function handleConfirm() {
    if (!employee) return
    deleteMutation.mutate(employee.id, {
      onSuccess: () => {
        showNotice('Employee deleted')
        onClose()
      },
      onError: (error) => {
        showNotice((error as ApiError).message, 'error')
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete employee</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete {employee?.full_name}? This cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" onClick={handleConfirm} loading={deleteMutation.isPending}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  )
}
