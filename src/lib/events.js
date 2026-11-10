import { invoke } from './api'

export const createPayPalOrder = (eventId) => invoke('paypal-create-order', { eventId })
export const capturePayPalOrder = (orderId) => invoke('paypal-capture-order', { orderId })
export const formEventTeams = (eventId) => invoke('form-event-teams', { eventId })
