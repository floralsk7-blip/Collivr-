import { invoke } from './api'

// AI project analysis (counted against the monthly plan limit; falls back to a rule-based result).
export const analyzeProject = (data) => invoke('analyze-project', data)

// Explainable matching and team suggestions (instant, no AI quota).
export const matchStudents = (data) => invoke('match-students', data)
export const suggestTeam = (data) => invoke('suggest-team', data)
