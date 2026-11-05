
import { useNavigate } from 'react-router-dom'
import { useConnections } from '../hooks/useConnections'
import { useAuth } from '../hooks/useAuth'

export default function ConnectButton({ studentId, fullWidth = true }) {
  const { user } = useAuth()
  const { statusWith, sendRequest } = useConnections()
  const navigate = useNavigate()

  // Never allow connection actions on your own profile.
  if (!user || !studentId || studentId === user.id) {
    return null
  }

  const status = statusWith(studentId)
  const widthClass = fullWidth ? 'w-full' : 'shrink-0'

  if (status === 'sent') {
    return (
      <button
        disabled
        className={`${widthClass} cursor-not-allowed rounded-[9px] border border-border bg-surface2 px-4 py-2 text-sm font-semibold text-muted`}
      >
        ✓ Request Sent
      </button>
    )
  }

  if (status === 'received') {
    return (
      <button
        onClick={() => navigate('/notifications')}
        className={`${widthClass} rounded-[9px] border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning hover:bg-warning/20`}
      >
        Respond to Request
      </button>
    )
  }

  if (status === 'connected') {
    return (
      <button
        onClick={() => navigate(`/messages/${studentId}`)}
        className={`${widthClass} rounded-[9px] border border-borderStrong bg-surface px-4 py-2 text-sm font-semibold text-primary hover:bg-surface2`}
      >
        💬 Message
      </button>
    )
  }

  return (
    <button
      onClick={() => sendRequest(studentId)}
      className={`${widthClass} rounded-[9px] bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryHover`}
    >
      Connect
    </button>
  )
}
