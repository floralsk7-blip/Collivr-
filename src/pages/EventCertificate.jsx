import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import AppShell from '../components/AppShell'

export default function EventCertificate() {
  const { id } = useParams()
  const { user } = useAuth()
  const [certificate, setCertificate] = useState(null)
  const [event, setEvent] = useState(null)
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: certError } = await supabase.from('event_certificates').select('*').eq('id', id).maybeSingle()
      if (certError || !data) { setError(certError?.message || 'Certificate not found or you do not have access.'); return }
      const [{ data: ev }, { data: person }] = await Promise.all([
        supabase.from('events').select('name,domain').eq('id', data.event_id).maybeSingle(),
        supabase.from('student_profiles').select('name').eq('id', data.participant_id).maybeSingle(),
      ])
      setCertificate(data); setEvent(ev); setProfile(person)
    }
    if (user) load()
  }, [id,user?.id])

  return (
    <AppShell breadcrumb={<span>Certificate</span>}>
      <div className="mx-auto max-w-3xl px-6 py-8">
        {error && <p className="text-sm text-danger">{error}</p>}
        {certificate && (
          <>
            <div id="certificate-print" className="border-4 border-double border-primary bg-surface px-8 py-16 text-center shadow-card">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">COLLIVRA</p>
              <h1 className="mt-8 font-display text-4xl font-bold text-text">Certificate of Participation</h1>
              <p className="mt-8 text-sm text-textSecondary">This certificate is proudly presented to</p>
              <p className="mt-3 text-3xl font-semibold text-primary">{profile?.name || 'Participant'}</p>
              <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-textSecondary">for successfully participating in</p>
              <p className="mt-2 text-xl font-bold text-text">{event?.name || certificate.title}</p>
              <p className="mt-8 text-xs text-muted">Certificate ID: {certificate.certificate_number}</p>
              <p className="mt-2 text-xs text-muted">Issued {new Date(certificate.issued_at).toLocaleDateString()}</p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button onClick={() => window.print()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Print / Save as PDF</button>
              <Link to={`/events/${certificate.event_id}`} className="rounded-lg border border-border px-4 py-2.5 text-sm text-text">Back to event</Link>
            </div>
          </>
        )}
      </div>
      <style>{`@media print { body * { visibility: hidden !important; } #certificate-print, #certificate-print * { visibility: visible !important; } #certificate-print { position: absolute; inset: 0; width: 100%; box-shadow: none; } }`}</style>
    </AppShell>
  )
}
