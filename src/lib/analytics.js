import { invoke } from './api'

export const getAnalytics = () => invoke('analytics-summary', {})
