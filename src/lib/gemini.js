import { invoke } from './api.js'

// AI project analysis (counted against the monthly plan limit; falls back to a rule-based result).
export const analyzeProject = (data) => invoke('analyze-project', data)

// Explainable matching and team suggestions (instant, no AI quota).
export const matchStudents = (data) => invoke('match-students', data)
export const suggestTeam = (data) => invoke('suggest-team', data)

// AI mentor requirement analysis
export const analyzeMentorRequirements = (data) => invoke('analyze-mentor-requirements', data)
