import { supabase } from './supabaseClient'
import { invoke } from './api'

const COLUMNS =
  'id, invoice_number, source_type, source_ref, transaction_id, description, plan_key, amount, currency, payment_method, status, paid_at, customer_name, customer_email, customer_organisation, account_type'

// Row level security limits this query to the signed-in user's own invoices; the user_id
// filter is only a convenience and is not what protects the data.
export async function listInvoices(userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('paid_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load your invoices.')
  return data || []
}

// Asks the server to import subscription payments that PayPal has confirmed but that have no invoice yet.
export const syncInvoices = () => invoke('invoice-manage', { action: 'sync' })
