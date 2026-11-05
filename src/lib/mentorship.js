import { invoke } from './api'

export const listMentors = (projectId) => invoke('mentorship-manage', { action: 'list', projectId })
export const matchMentors = (projectId) => invoke('mentorship-manage', { action: 'match', projectId })
export const requestMentor = ({ mentorId, projectId, message }) => invoke('mentorship-manage', { action: 'request', mentorId, projectId, message })
export const respondMentorship = (requestId, accept) => invoke('mentorship-manage', { action: 'respond', requestId, accept })
export const cancelMentorship = (requestId) => invoke('mentorship-manage', { action: 'cancel', requestId })
