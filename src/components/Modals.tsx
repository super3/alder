import { useEffect, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import type { ModalKind } from '../data'
import { api } from '../api'
import { LogoLeaf } from './icons'

interface ModalHostProps {
  modal: ModalKind | null
  onClose: () => void
  onBankConnected?: () => void
}

// Opens Plaid Link as soon as the token is ready (Link renders its own UI).
function PlaidLinkOpener({
  token,
  onSuccess,
  onExit,
}: {
  token: string
  onSuccess: (publicToken: string) => void
  onExit: () => void
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (publicToken) => onSuccess(publicToken),
    onExit: () => onExit(),
  })
  useEffect(() => {
    if (ready) open()
  }, [ready, open])
  return null
}

// Plaid Link in update mode: the user signs back in to an existing
// connection. No token exchange follows — the item keeps its access token —
// so success just means "sync again".
export function ReconnectLink({
  itemId,
  onDone,
  onError,
}: {
  itemId: string
  onDone: (reconnected: boolean) => void
  onError: (message: string) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .createLinkToken(itemId)
      .then((res) => {
        if (!cancelled) setToken(res.link_token)
      })
      .catch(() => {
        if (cancelled) return
        onError("Couldn't start reconnecting that bank. Try again in a moment.")
        onDone(false)
      })
    return () => {
      cancelled = true
    }
    // Callbacks are fresh closures each render; only a new item restarts Link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])
  if (!token) return null
  return <PlaidLinkOpener token={token} onSuccess={() => onDone(true)} onExit={() => onDone(false)} />
}

export function ModalHost({ modal, onClose, onBankConnected }: ModalHostProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Reset the Plaid Link flow whenever the modal opens/closes.
  useEffect(() => {
    setLinkToken(null)
    setConnecting(false)
    setConnectError(null)
  }, [modal])

  if (!modal) return null

  const connectBank = async () => {
    if (connecting) return
    setConnectError(null)
    setConnecting(true)
    try {
      const { link_token: token } = await api.createLinkToken()
      setLinkToken(token)
    } catch (err) {
      setConnectError(
        (err as Error).message === 'Not signed in'
          ? 'Log in first to connect a bank.'
          : 'Could not reach the Alder API — try again in a moment.',
      )
      setConnecting(false)
    }
  }

  const handleLinkSuccess = async (publicToken: string) => {
    try {
      await api.exchangePublicToken(publicToken)
      onBankConnected?.()
      onClose()
    } catch {
      setConnectError('Connecting the bank failed — try again.')
    } finally {
      setLinkToken(null)
      setConnecting(false)
    }
  }

  const handleLinkExit = () => {
    setLinkToken(null)
    setConnecting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add account</span>
          <div className="modal-close" onClick={onClose}>
            ✕
          </div>
        </div>
        <div className="modal-body">
          {linkToken && (
            <PlaidLinkOpener token={linkToken} onSuccess={handleLinkSuccess} onExit={handleLinkExit} />
          )}
          <div style={{ fontSize: 14.5, color: 'var(--muted)', lineHeight: 1.55 }}>
            Alder connects to your bank through Plaid with read-only access — your credentials are never
            stored here.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div className="institution-row" onClick={connectBank}>
              <div
                className="avatar"
                style={{ width: 34, height: 34, background: 'var(--accent)', flexShrink: 0 }}
              >
                <LogoLeaf size={16} />
              </div>
              <span className="institution-name">
                {connecting ? 'Opening Plaid Link…' : 'Connect a bank with Plaid'}
              </span>
              <span style={{ color: 'var(--fainter)' }}>›</span>
            </div>
            {connectError && (
              <div style={{ padding: '2px 12px 6px 12px', fontSize: 13.5, color: 'oklch(0.5 0.16 25)' }}>
                {connectError}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <div className="modal-btn" onClick={onClose}>
            Cancel
          </div>
        </div>
      </div>
    </div>
  )
}
