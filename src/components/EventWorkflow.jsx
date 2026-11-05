import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const FIELD = 'w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus:border-primary focus:outline-none'

export default function EventWorkflow({ eventId, eventName, eventTier = 'standard', userId, isManager, isEvaluator, joined }) {
  const tierRank = ({ standard: 1, advanced: 2, complex: 3 })[eventTier] || 1
  const maxStages = eventTier === 'standard' ? 3 : eventTier === 'advanced' ? 10 : Infinity
  const canUseTeams = tierRank >= 2
  const canUseAutomation = tierRank >= 2
  const canUseWeightedRubric = tierRank >= 3
  const [stages, setStages] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [evaluationRows, setEvaluationRows] = useState([])
  const [certificates, setCertificates] = useState([])
  const [teams, setTeams] = useState([])
  const [teamChoices, setTeamChoices] = useState({})
  const [reviews, setReviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [stageForm, setStageForm] = useState({ title: '', description: '', starts_at: '', deadline_at: '', advancement_mode: 'manual', advancement_rule: 'score_threshold', advancement_threshold: '70', advancement_top_n: '10', evaluation_criteria: '', allow_edits: false })
  const [activityForms, setActivityForms] = useState({})
  const [answers, setAnswers] = useState({})
  const [files, setFiles] = useState({})

  async function load() {
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('event_stages')
      .select('*, event_activities(*)')
      .eq('event_id', eventId)
      .order('stage_order')
    if (loadError) setError(loadError.message)
    setStages(data || [])
    const { data: submissionRows, error: submissionError } = await supabase
      .from('event_submissions').select('*, student_profiles(name)').eq('event_id', eventId).order('submitted_at', { ascending: false })
    if (submissionError && isEvaluator) setError(submissionError.message)
    setSubmissions(submissionRows || [])
    const submissionIds = (submissionRows || []).map((row) => row.id)
    const { data: evaluationData, error: evaluationError } = submissionIds.length
      ? await supabase.from('event_evaluations').select('submission_id,score,decision,feedback,evaluator_id,created_at').in('submission_id', submissionIds)
      : { data: [], error: null }
    if (evaluationError && isEvaluator) setError(evaluationError.message)
    setEvaluationRows(evaluationData || [])
    const { data: certificateRows } = await supabase.from('event_certificates').select('*').eq('event_id', eventId).order('issued_at', { ascending: false })
    setCertificates(certificateRows || [])
    const { data: teamRows } = await supabase.from('event_teams')
      .select('id,event_team_members(student_id)').eq('event_id', eventId)
    setTeams((teamRows || []).filter((team) => team.event_team_members?.some((member) => member.student_id === userId)))
    setLoading(false)
  }

  useEffect(() => { load() }, [eventId, isManager])

  async function addStage(e) {
    e.preventDefault()
    setError(''); setNotice('')
    const title = stageForm.title.trim()
    if (title.length < 2) return setError('Enter a stage name.')
    if (stages.length >= maxStages) return setError(`${eventTier[0].toUpperCase()}${eventTier.slice(1)} allows ${maxStages} stages per event.`)
    if (stageForm.advancement_mode === 'automatic' && !canUseAutomation) return setError('Automatic advancement requires the Advanced or Complex Event Pass.')
    if (stageForm.advancement_mode === 'automatic' && stageForm.advancement_rule === 'score_threshold' && (!Number.isFinite(Number(stageForm.advancement_threshold)) || Number(stageForm.advancement_threshold) < 0 || Number(stageForm.advancement_threshold) > 100)) return setError('Set a score threshold between 0 and 100.')
    if (stageForm.advancement_mode === 'automatic' && stageForm.advancement_rule === 'top_n' && (!Number.isInteger(Number(stageForm.advancement_top_n)) || Number(stageForm.advancement_top_n) < 1)) return setError('Set a whole number of participants to advance.')
    let evaluationCriteria = []
    if (stageForm.evaluation_criteria.trim()) {
      try { evaluationCriteria = JSON.parse(stageForm.evaluation_criteria) } catch { return setError('Evaluation criteria must be valid JSON.') }
      if (!Array.isArray(evaluationCriteria) || evaluationCriteria.length < 2 || evaluationCriteria.some((c) => !c.label || !Number.isFinite(Number(c.weight)) || Number(c.weight) <= 0)) return setError('Use at least two criteria with a label and positive weight.')
      const weightTotal = evaluationCriteria.reduce((sum, c) => sum + Number(c.weight), 0)
      if (Math.abs(weightTotal - 100) > 0.01) return setError('Evaluation criteria weights must add up to 100%.')
      if (!canUseWeightedRubric) return setError('Weighted judging rubrics require the Complex Event Pass.')
    }
    setBusy(true)
    const { error: insertError } = await supabase.from('event_stages').insert({
      event_id: eventId,
      title,
      description: stageForm.description.trim() || null,
      stage_order: Math.max(0, ...stages.map((stage) => stage.stage_order || 0)) + 1,
      starts_at: stageForm.starts_at ? new Date(stageForm.starts_at).toISOString() : null,
      deadline_at: stageForm.deadline_at ? new Date(stageForm.deadline_at).toISOString() : null,
      advancement_mode: stageForm.advancement_mode,
      advancement_rule: stageForm.advancement_rule,
      advancement_threshold: stageForm.advancement_mode === 'automatic' && stageForm.advancement_rule === 'score_threshold' ? Number(stageForm.advancement_threshold) : null,
      advancement_top_n: stageForm.advancement_mode === 'automatic' && stageForm.advancement_rule === 'top_n' ? Number(stageForm.advancement_top_n) : null,
      evaluation_criteria: evaluationCriteria,
      allow_edits: !!stageForm.allow_edits,
      status: 'draft',
    })
    if (insertError) setError(insertError.message)
    else {
      setStageForm({ title: '', description: '', starts_at: '', deadline_at: '', advancement_mode: 'manual', advancement_rule: 'score_threshold', advancement_threshold: '70', advancement_top_n: '10', evaluation_criteria: '', allow_edits: false })
      setNotice('Stage created.')
      await load()
    }
    setBusy(false)
  }

  async function addActivity(stage, e) {
    e.preventDefault()
    const f = activityForms[stage.id] || {}
    if (!f.title?.trim()) return setError('Enter an activity name.')
    if (f.team_submission && !canUseTeams) return setError('Team submissions require the Advanced or Complex Event Pass.')
    let config = {}
    try { config = f.config?.trim() ? JSON.parse(f.config) : {} }
    catch { return setError('Activity configuration must be valid JSON.') }
    setBusy(true); setError(''); setNotice('')
    const { error: insertError } = await supabase.from('event_activities').insert({
      stage_id: stage.id,
      title: f.title.trim(),
      instructions: f.instructions?.trim() || null,
      activity_type: f.type || 'form',
      required: f.required !== false,
      team_submission: !!f.team_submission,
      config,
      activity_order: Math.max(0, ...(stage.event_activities || []).map((activity) => activity.activity_order || 0)) + 1,
    })
    if (insertError) setError(insertError.message)
    else {
      setActivityForms((all) => ({ ...all, [stage.id]: { title: '', instructions: '', type: 'form', config: '', required: true, team_submission: false } }))
      setNotice('Activity added.')
      await load()
    }
    setBusy(false)
  }

  async function renameStage(stage) {
    const title = window.prompt('Stage name', stage.title)
    if (!title?.trim() || title.trim() === stage.title) return
    const { error: updateError } = await supabase.from('event_stages').update({ title: title.trim() }).eq('id', stage.id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  async function deleteStage(stage) {
    if (!window.confirm(`Delete stage "${stage.title}" and its activities/submissions?`)) return
    const { error: deleteError } = await supabase.from('event_stages').delete().eq('id', stage.id)
    if (deleteError) setError(deleteError.message)
    else { setNotice('Stage deleted.'); await load() }
  }

  async function renameActivity(activity) {
    const title = window.prompt('Activity name', activity.title)
    if (!title?.trim() || title.trim() === activity.title) return
    const { error: updateError } = await supabase.from('event_activities').update({ title: title.trim() }).eq('id', activity.id)
    if (updateError) setError(updateError.message)
    else await load()
  }

  async function deleteActivity(activity) {
    if (!window.confirm(`Delete activity "${activity.title}" and its submissions?`)) return
    const { error: deleteError } = await supabase.from('event_activities').delete().eq('id', activity.id)
    if (deleteError) setError(deleteError.message)
    else { setNotice('Activity deleted.'); await load() }
  }

  async function setStageStatus(stage, status) {
    if (status === 'results_published' && stage.advancement_mode === 'automatic' && stages.some((next) => next.stage_order > stage.stage_order)) {
      const { data: existing } = await supabase.from('event_stage_advancements').select('id').eq('from_stage_id', stage.id).limit(1)
      if (!existing?.length) return setError('Run automatic advancement before publishing results for this stage.')
    }
    setBusy(true); setError(''); setNotice('')
    const { error: updateError } = await supabase.from('event_stages').update({ status }).eq('id', stage.id)
    if (updateError) setError(updateError.message)
    else { setNotice(`Stage ${status === 'open' ? 'opened' : status === 'closed' ? 'closed' : 'updated'}.`); await load() }
    setBusy(false)
  }

  async function submitActivity(stage, activity) {
    setBusy(true); setError(''); setNotice('')
    const val = answers[activity.id] || ''
    const selectedFile = files[activity.id]
    if (activity.activity_type === 'file_submission' && !selectedFile) {
      setError('Choose a file before submitting.')
      setBusy(false)
      return
    }
    if (activity.activity_type === 'link_submission' && !/^https?:\/\//i.test(String(val || ''))) {
      setError('Enter a valid http or https link.')
      setBusy(false)
      return
    }
    if (activity.team_submission && !teamChoices[activity.id]) {
      setError('Select your team before submitting this activity.')
      setBusy(false)
      return
    }
    let fileUrl = null
    if (selectedFile) {
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${eventId}/${userId}/${activity.id}-${Date.now()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('event-submissions').upload(path, selectedFile, { upsert: false })
      if (uploadError) { setError(uploadError.message); setBusy(false); return }
      fileUrl = path
    }
    const payload = {
      activity_id: activity.id, event_id: eventId, stage_id: stage.id,
      submitted_by: userId,
      team_id: activity.team_submission ? (teamChoices[activity.id] || null) : null,
      response: { answer: val },
      file_url: fileUrl,
      external_url: activity.activity_type === 'link_submission' ? val : null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    }
    let existingQuery = supabase.from('event_submissions').select('id,submitted_by')
      .eq('activity_id', activity.id)
    existingQuery = activity.team_submission
      ? existingQuery.eq('team_id', teamChoices[activity.id])
      : existingQuery.eq('submitted_by', userId)
    const { data: existing } = await existingQuery.maybeSingle()
    if (activity.team_submission && existing && existing.submitted_by !== userId) {
      setError('Your team has already submitted this activity.')
      setBusy(false)
      return
    }
    const result = existing?.id
      ? await supabase.from('event_submissions').update(payload).eq('id', existing.id)
      : await supabase.from('event_submissions').insert(payload)
    if (result.error) setError(result.error.message)
    else { setNotice('Your submission was saved.'); setAnswers((a) => ({ ...a, [activity.id]: '' })); setFiles((f) => ({ ...f, [activity.id]: null })); await load() }
    setBusy(false)
  }

  async function issueCertificates() {
    if (!window.confirm('Issue certificates to all registered participants? This cannot be undone from the participant view.')) return
    setBusy(true); setError(''); setNotice('')
    const { data: participants, error: participantError } = await supabase.from('event_participants').select('student_id').eq('event_id', eventId)
    if (participantError) { setError(participantError.message); setBusy(false); return }
    const existingIds = new Set(certificates.map((c) => c.participant_id))
    const rows = (participants || []).filter((p) => !existingIds.has(p.student_id)).map((p) => ({
      event_id: eventId, participant_id: p.student_id, issued_by: userId,
      certificate_number: `COLL-${crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase()}`,
      title: `${eventName} — Certificate of Participation`,
    }))
    if (rows.length) {
      const { error: issueError } = await supabase.from('event_certificates').insert(rows)
      if (issueError) setError(issueError.message)
      else { setNotice(`Issued ${rows.length} certificate(s).`); await load() }
    } else setNotice('All registered participants already have certificates.')
    setBusy(false)
  }

  async function reviewSubmission(submission) {
    const review = reviews[submission.id] || {}
    const currentStageForReview = stages.find((stage) => stage.id === submission.stage_id)
    const rubric = Array.isArray(currentStageForReview?.evaluation_criteria) ? currentStageForReview.evaluation_criteria : []
    const criteriaScores = review.criteriaScores || {}
    const score = rubric.length ? null : (review.score === '' || review.score == null ? null : Number(review.score))
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setError('Score must be between 0 and 100.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    const { error: evalError } = await supabase.from('event_evaluations').upsert({
      submission_id: submission.id, evaluator_id: userId, score,
      criteria_scores: rubric.length ? criteriaScores : {},
      feedback: review.feedback || null, decision: currentStageForReview?.advancement_mode === 'automatic' ? 'hold' : (review.decision || 'hold'),
    }, { onConflict: 'submission_id,evaluator_id' })
    if (evalError) setError(evalError.message)
    else {
      const { error: updateError } = await supabase.from('event_submissions').update({
        status: currentStageForReview?.advancement_mode === 'automatic' ? 'reviewed' : review.decision === 'advance' ? 'accepted' : review.decision === 'reject' ? 'rejected' : 'reviewed',
      }).eq('id', submission.id)
      if (updateError) setError(updateError.message)
      else {
        const currentStage = currentStageForReview
        const nextStage = stages.find((stage) => stage.event_id === submission.event_id && stage.stage_order > (currentStage?.stage_order || 0))
        if (isManager && currentStage?.advancement_mode === 'manual' && nextStage && review.decision !== 'hold') {
          let participantIds = [submission.submitted_by]
          if (submission.team_id) {
            const { data: members, error: membersError } = await supabase.from('event_team_members').select('student_id').eq('event_team_id', submission.team_id)
            if (membersError) setError(membersError.message)
            participantIds = (members || []).map((member) => member.student_id)
          }
          const advancementRows = participantIds.map((participantId) => ({
            event_id: submission.event_id,
            from_stage_id: submission.stage_id,
            to_stage_id: nextStage.id,
            participant_id: participantId,
            decision: review.decision === 'advance' ? 'advanced' : 'not_advanced',
            decided_by: userId,
            decided_at: new Date().toISOString(),
          }))
          const { error: advanceError } = await supabase.from('event_stage_advancements').upsert(advancementRows, { onConflict: 'from_stage_id,to_stage_id,participant_id' })
          if (advanceError) setError(advanceError.message)
        }
        setNotice('Evaluation saved.')
        await load()
      }
    }
    setBusy(false)
  }

  async function finalizeAutomaticStage(stage) {
    if (!window.confirm(`Calculate ${stage.advancement_rule === 'top_n' ? `the top ${stage.advancement_top_n}` : `everyone scoring ${stage.advancement_threshold}+`} and advance qualifying participants from ${stage.title}?`)) return
    setBusy(true); setError(''); setNotice('')
    const { data, error: finalizeError } = await supabase.rpc('finalize_event_stage_advancement', { p_stage_id: stage.id })
    if (finalizeError) setError(finalizeError.message)
    else { setNotice(`Automatic advancement completed. ${data?.advanced_count ?? 0} participant(s) advanced.`); await load() }
    setBusy(false)
  }

  async function openFile(path) {
    const { data, error: signedError } = await supabase.storage.from('event-submissions').createSignedUrl(path, 300)
    if (signedError) return setError(signedError.message)
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (loading) return <section className="mt-8 rounded-xl border border-border bg-surface p-5"><div className="skeleton h-8 w-1/3" /></section>

  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text">Event timeline & activities</h2>
          <p className="mt-1 text-sm text-muted">Stages, deadlines, forms, quizzes and submissions for this event.</p>
        </div>
        <span className="rounded-full bg-surface2 px-3 py-1 text-xs text-textSecondary">{stages.length} stages</span>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</p>}

      {isManager && (
        <form onSubmit={addStage} className="mt-5 rounded-xl border border-dashed border-borderStrong p-4">
          <h3 className="text-sm font-semibold text-text">Add a stage</h3><p className="mt-1 text-xs text-muted">{eventTier === 'complex' ? 'Unlimited stages · Complex pass' : `${stages.length}/${maxStages} stages used · ${eventTier[0].toUpperCase()}${eventTier.slice(1)} pass`}</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <input className={FIELD} placeholder="Stage name (e.g. Round 1)" value={stageForm.title} onChange={(e) => setStageForm((f) => ({ ...f, title: e.target.value }))} required />
            <select className={FIELD} value={stageForm.advancement_mode} onChange={(e) => setStageForm((f) => ({ ...f, advancement_mode: e.target.value }))}>
              <option value="manual">Manual advancement — organiser selects participants</option>
              {canUseAutomation && <option value="automatic">Automatic advancement — system applies a rule</option>}
            </select>
            {stageForm.advancement_mode === 'automatic' && <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 md:col-span-2">
              <label className="block text-xs font-semibold text-text">Automatic qualification rule
                <select className={`${FIELD} mt-1`} value={stageForm.advancement_rule} onChange={(e) => setStageForm((f) => ({ ...f, advancement_rule: e.target.value }))}><option value="score_threshold">Advance everyone meeting a score threshold</option><option value="top_n">Advance the top N participants</option></select>
              </label>
              {stageForm.advancement_rule === 'score_threshold' ? <label className="mt-2 block text-xs text-muted">Minimum average score (0–100)<input className={`${FIELD} mt-1`} type="number" min="0" max="100" value={stageForm.advancement_threshold} onChange={(e) => setStageForm((f) => ({ ...f, advancement_threshold: e.target.value }))} /></label> : <label className="mt-2 block text-xs text-muted">Number of participants to advance<input className={`${FIELD} mt-1`} type="number" min="1" value={stageForm.advancement_top_n} onChange={(e) => setStageForm((f) => ({ ...f, advancement_top_n: e.target.value }))} /></label>}
              <p className="mt-2 text-xs text-muted">Scores are averaged across submitted activities and evaluator reviews. Close the stage, then run advancement to apply this rule.</p>
            </div>}
            {canUseWeightedRubric && <label className="text-xs text-muted md:col-span-2">Weighted judging rubric (Complex only; JSON weights must total 100%)<textarea className={`${FIELD} mt-1`} rows={2} value={stageForm.evaluation_criteria} onChange={(e) => setStageForm((f) => ({ ...f, evaluation_criteria: e.target.value }))} placeholder='[{"label":"Technical quality","weight":60},{"label":"Presentation","weight":40}]' /></label>}
            <input className={FIELD} placeholder="Description" value={stageForm.description} onChange={(e) => setStageForm((f) => ({ ...f, description: e.target.value }))} />
            <label className="text-xs text-muted">Starts at<input className={FIELD} type="datetime-local" value={stageForm.starts_at} onChange={(e) => setStageForm((f) => ({ ...f, starts_at: e.target.value }))} /></label>
            <label className="text-xs text-muted">Deadline<input className={FIELD} type="datetime-local" value={stageForm.deadline_at} onChange={(e) => setStageForm((f) => ({ ...f, deadline_at: e.target.value }))} /></label>
            <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={stageForm.allow_edits} onChange={(e) => setStageForm((f) => ({ ...f, allow_edits: e.target.checked }))} /> Allow participants to edit submitted work before the deadline</label>
          </div>
          <button disabled={busy || stages.length >= maxStages} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving...' : stages.length >= maxStages ? 'Stage limit reached' : 'Add stage'}</button>
        </form>
      )}

      {stages.length === 0 ? <p className="mt-5 text-sm text-muted">No stages have been added yet.</p> : (
        <div className="mt-5 space-y-4">
          {stages.map((stage, index) => (
            <article key={stage.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">Stage {index + 1} · {stage.status}</p>
                  <h3 className="mt-1 font-semibold text-text">{stage.title}</h3>
                  {stage.description && <p className="mt-1 text-sm text-textSecondary">{stage.description}</p>}
                  <p className="mt-2 text-xs text-muted">{stage.advancement_mode === 'automatic' ? `Automatic · ${stage.advancement_rule === 'top_n' ? `Top ${stage.advancement_top_n}` : `Score ≥ ${stage.advancement_threshold}`} ` : 'Manual · organiser decides'}{' · '}
                    {stage.starts_at ? `Starts ${new Date(stage.starts_at).toLocaleString()}` : 'Start date not set'}
                    {' · '}
                    {stage.deadline_at ? `Deadline ${new Date(stage.deadline_at).toLocaleString()}` : 'No deadline'}
                  </p>
                </div>
                {isManager && <div className="flex flex-wrap gap-2">
                  <button onClick={() => renameStage(stage)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text">Rename</button>
                  <button onClick={() => deleteStage(stage)} className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger">Delete</button>
                  {stage.status !== 'open' && <button disabled={busy} onClick={() => setStageStatus(stage, 'open')} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Open stage</button>}
                   {stage.status === 'open' && <button disabled={busy} onClick={() => setStageStatus(stage, 'closed')} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text">Close stage</button>}
                  {stage.status === 'closed' && stage.advancement_mode === 'automatic' && stages.some((next) => next.stage_order > stage.stage_order) && <button disabled={busy} onClick={() => finalizeAutomaticStage(stage)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white">Run automatic advancement</button>}
                  {stage.status === 'closed' && <button disabled={busy} onClick={() => setStageStatus(stage, 'results_published')} className="rounded-lg border border-border px-3 py-1.5 text-xs text-text">Publish results</button>}
                </div>}
              </div>

              <div className="mt-4 space-y-3">
                {(stage.event_activities || []).sort((a,b) => a.activity_order-b.activity_order).map((activity) => (
                  <div key={activity.id} className="rounded-lg bg-surface2 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-text">{activity.title}</p>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] uppercase text-muted">{activity.activity_type.replace('_',' ')}</span>
                      {activity.required && <span className="text-[10px] text-danger">Required</span>}
                      {isManager && <button onClick={() => renameActivity(activity)} className="ml-auto text-xs text-primary">Rename</button>}
                      {isManager && <button onClick={() => deleteActivity(activity)} className="text-xs text-danger">Delete</button>}
                    </div>
                    {activity.instructions && <p className="mt-1 text-sm text-textSecondary">{activity.instructions}</p>}
                    {isManager ? (
                      <p className="mt-2 text-xs text-muted">Participant submissions will appear in the event submission records for review.</p>
                    ) : joined && stage.status === 'open' && (
                      <div className="mt-3 space-y-2">
                        {activity.team_submission && (
                          <select className={FIELD} value={teamChoices[activity.id] || ''} onChange={(e) => setTeamChoices((all) => ({ ...all, [activity.id]: e.target.value }))}>
                            <option value="">Select your team</option>
                            {teams.map((team) => <option key={team.id} value={team.id}>Team {team.id.slice(0,8)}</option>)}
                          </select>
                        )}
                        {(activity.activity_type === 'form' || activity.activity_type === 'quiz') && (
                          <div className="space-y-3">
                            {activity.activity_type === 'form' && Array.isArray(activity.config?.fields) && activity.config.fields.length > 0
                              ? activity.config.fields.map((field, fieldIndex) => (
                                <label key={field.name || fieldIndex} className="block text-xs font-medium text-textSecondary">
                                  {field.label || field.name || `Field ${fieldIndex + 1}`}
                                  {field.type === 'textarea'
                                    ? <textarea className={FIELD} rows={3} value={answers[activity.id]?.[field.name || `field_${fieldIndex}`] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [activity.id]: { ...(a[activity.id] || {}), [field.name || `field_${fieldIndex}`]: e.target.value } }))} />
                                    : <input className={FIELD} type={['text','email','url','number','date'].includes(field.type) ? field.type : 'text'} value={answers[activity.id]?.[field.name || `field_${fieldIndex}`] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [activity.id]: { ...(a[activity.id] || {}), [field.name || `field_${fieldIndex}`]: e.target.value } }))} />}
                                </label>
                              ))
                              : activity.activity_type === 'quiz' && Array.isArray(activity.config?.questions) && activity.config.questions.length > 0
                                ? activity.config.questions.map((q, qi) => (
                                  <div key={qi}>
                                    <p className="mb-1 text-sm font-medium text-text">{q.question || `Question ${qi + 1}`}</p>
                                    {(Array.isArray(q.options) ? q.options : []).map((option, oi) => <label key={oi} className="flex items-center gap-2 py-1 text-sm text-textSecondary"><input type="radio" name={`${activity.id}-${qi}`} checked={answers[activity.id]?.[qi] === option} onChange={() => setAnswers((a) => ({ ...a, [activity.id]: { ...(a[activity.id] || {}), [qi]: option } }))} />{option}</label>)}
                                  </div>
                                ))
                                : <textarea className={FIELD} rows={3} placeholder={activity.activity_type === 'quiz' ? 'Enter your quiz answers' : 'Enter your response'} value={answers[activity.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [activity.id]: e.target.value }))} />}
                          </div>
                        )}
                        {activity.activity_type === 'presentation' && <textarea className={FIELD} rows={3} placeholder="Presentation notes or demo details" value={answers[activity.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [activity.id]: e.target.value }))} />}
                        {activity.activity_type === 'link_submission' && <input className={FIELD} placeholder="https://..." value={answers[activity.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [activity.id]: e.target.value }))} />}
                        {activity.activity_type === 'file_submission' && <input type="file" onChange={(e) => setFiles((f) => ({ ...f, [activity.id]: e.target.files?.[0] || null }))} className="text-sm text-muted" />}
                        {activity.activity_type === 'evaluation' && <p className="text-xs text-muted">Evaluation is performed by the event organiser after submission.</p>}
                        {!['evaluation','announcement'].includes(activity.activity_type) && <button disabled={busy} onClick={() => submitActivity(stage, activity)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Submit activity</button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {isManager && (
                <form onSubmit={(e) => addActivity(stage, e)} className="mt-4 rounded-lg border border-dashed border-borderStrong p-3">
                  <p className="text-xs font-semibold text-text">Add activity to this stage</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <input className={FIELD} placeholder="Activity title" value={activityForms[stage.id]?.title || ''} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], title: e.target.value } }))} required />
                    <select className={FIELD} value={activityForms[stage.id]?.type || 'form'} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], type: e.target.value } }))}>
                      <option value="form">Form</option><option value="quiz">Quiz</option><option value="file_submission">File submission</option><option value="link_submission">Link submission</option><option value="presentation">Presentation</option><option value="evaluation">Evaluation</option><option value="announcement">Announcement</option>
                    </select>
                    <input className={FIELD} placeholder="Instructions" value={activityForms[stage.id]?.instructions || ''} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], instructions: e.target.value } }))} />
                    <textarea className={FIELD} rows={2} placeholder='Optional activity config JSON, e.g. {"fields":[{"label":"Idea","type":"textarea"}]}' value={activityForms[stage.id]?.config || ''} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], config: e.target.value } }))} />
                    <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={activityForms[stage.id]?.required !== false} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], required: e.target.checked } }))} /> Required activity</label>
                    {canUseTeams ? <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={!!activityForms[stage.id]?.team_submission} onChange={(e) => setActivityForms((all) => ({ ...all, [stage.id]: { ...all[stage.id], team_submission: e.target.checked } }))} /> One submission per team</label> : <p className="text-xs text-muted">Team submissions unlock with Advanced and Complex passes.</p>}
                  </div>
                  <button disabled={busy} className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text">Add activity</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}

      {stages.length > 0 && stages[stages.length - 1].status === 'results_published' && (
        <section className="mt-6 rounded-xl border border-border bg-surface p-4">
          <h3 className="text-base font-bold text-text">Published results</h3>
          <p className="mt-1 text-xs text-muted">Scores are based on submitted work and saved organiser evaluations.</p>
          {(() => {
            const participantScores = new Map()
            for (const submission of submissions) {
              const scores = evaluationRows.filter((row) => row.submission_id === submission.id && row.score !== null).map((row) => Number(row.score))
              if (!scores.length) continue
              const current = participantScores.get(submission.submitted_by) || { name: submission.student_profiles?.name || 'Participant', total: 0, count: 0 }
              current.total += scores.reduce((sum, score) => sum + score, 0)
              current.count += scores.length
              participantScores.set(submission.submitted_by, current)
            }
            const rows = [...participantScores.entries()].map(([participantId, row]) => ({ participantId, ...row, average: row.total / row.count }))
              .filter((row) => isManager || row.participantId === userId)
              .sort((a, b) => b.average - a.average)
            return rows.length ? (
              <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted"><th className="py-2">Rank</th><th>Participant</th><th className="text-right">Average score</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.participantId} className="border-b border-border/60"><td className="py-2">{index + 1}</td><td>{row.name}</td><td className="text-right font-semibold">{row.average.toFixed(1)} / 100</td></tr>)}</tbody></table></div>
            ) : <p className="mt-3 text-sm text-muted">No scored submissions are available in the published results yet.</p>
          })()}
        </section>
      )}

      {isManager && stages.length > 0 && stages[stages.length - 1].status === 'results_published' && (
        <div className="mt-6 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-text">Certificates</p><p className="text-xs text-muted">{certificates.length} issued</p></div>
            <button disabled={busy} onClick={issueCertificates} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Issue certificates to participants</button>
          </div>
        </div>
      )}
      {certificates.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-text">Your event certificates</h3>
          {certificates.filter((c) => isManager || c.participant_id === userId).map((c) => (
            <a key={c.id} href={`/certificates/${c.id}`} className="mr-2 inline-block rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-surface2">{c.title} · View</a>
          ))}
        </div>
      )}

      {isEvaluator && submissions.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 text-sm font-bold text-text">Participant submissions ({submissions.length})</h3>
          <div className="space-y-3">
            {submissions.map((submission) => (
              <div key={submission.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-text">{submission.student_profiles?.name || 'Participant'}</p>
                  <span className="text-xs text-muted">{submission.status} · {submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'Draft'}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-textSecondary">{submission.response?.answer == null ? 'No text response' : typeof submission.response.answer === 'string' ? submission.response.answer : JSON.stringify(submission.response.answer, null, 2)}</p>
                {submission.external_url && <a className="mt-1 block text-sm text-primary underline" href={submission.external_url} target="_blank" rel="noreferrer">Open submitted link</a>}
                {submission.file_url && <button onClick={() => openFile(submission.file_url)} className="mt-1 text-sm text-primary underline">Open uploaded file</button>}
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {(stages.find((stage) => stage.id === submission.stage_id)?.evaluation_criteria || []).length > 0 ? (stages.find((stage) => stage.id === submission.stage_id).evaluation_criteria.map((criterion, ci) => <label key={ci} className="text-xs text-muted">{criterion.label} ({criterion.weight}%)<input className={FIELD} type="number" min="0" max="100" placeholder="0–100" value={reviews[submission.id]?.criteriaScores?.[criterion.label] ?? ''} onChange={(e) => setReviews((r) => ({ ...r, [submission.id]: { ...r[submission.id], criteriaScores: { ...(r[submission.id]?.criteriaScores || {}), [criterion.label]: e.target.value } } }))} /></label>)) : <input className={FIELD} type="number" min="0" max="100" placeholder="Score (0-100)" value={reviews[submission.id]?.score ?? ''} onChange={(e) => setReviews((r) => ({ ...r, [submission.id]: { ...r[submission.id], score: e.target.value } }))} />}
                  {stages.find((stage) => stage.id === submission.stage_id)?.advancement_mode === 'manual' ? <select className={FIELD} value={reviews[submission.id]?.decision || 'hold'} onChange={(e) => setReviews((r) => ({ ...r, [submission.id]: { ...r[submission.id], decision: e.target.value } }))}><option value="advance">Advance</option><option value="hold">Hold</option><option value="reject">Reject</option></select> : <p className="self-center text-xs text-muted">Automatic rule decides after the stage is closed.</p>}
                  <input className={FIELD} placeholder="Feedback" value={reviews[submission.id]?.feedback || ''} onChange={(e) => setReviews((r) => ({ ...r, [submission.id]: { ...r[submission.id], feedback: e.target.value } }))} />
                </div>
                <button disabled={busy} onClick={() => reviewSubmission(submission)} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Save evaluation</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
