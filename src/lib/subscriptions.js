import { invoke } from './api'

export const getBillingConfig = () => invoke('subscription-manage', { action: 'config' })
export const activateSubscription = (subscriptionId, planKey) => invoke('subscription-manage', { action: 'activate', subscriptionId, planKey })
export const syncSubscription = () => invoke('subscription-manage', { action: 'sync' })
export const cancelSubscription = (subscriptionId) => invoke('subscription-manage', { action: 'cancel', subscriptionId })
export const createSubscription = (planKey) =>
  invoke('subscription-manage', { action: 'create', planKey })