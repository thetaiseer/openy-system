import { supabase } from '../lib/supabase';

// Types

export type InvoiceFormData = {
  id?: string;
  invoiceNumber?: string;
  clientName?: string;
  currency?: string;
  totalBudget?: number | string;
  campaignMonth?: string;
  invoiceDate?: string;
  status?: string;
  [key: string]: unknown;
};

// buildInvoicePayload
// Maps an InvoiceFormData object to the invoices table columns.
function buildInvoicePayload(form: InvoiceFormData) {
  const grandTotal = Number(form.totalBudget || 0);
  const fees = Number((form as { fees?: number | string }).fees || 0);
  const finalBudget = Math.max(0, grandTotal - fees);
  return {
    invoice_number: form.invoiceNumber || `INV-${Date.now()}`,
    client_name:    form.clientName    || 'Unknown',
    currency:       form.currency      || 'EGP',
    final_budget:   finalBudget,
    fees,
    grand_total:    grandTotal,
    campaign_month: form.campaignMonth || '',
    invoice_date:   form.invoiceDate   || '',
    status:         form.status        || 'draft',
    form_snapshot:  form,
    invoice_data:   form,
    archived:       false,
    updated_at:     new Date().toISOString(),
  };
}

// createInvoice
// Inserts a new invoice row. Supabase auto-generates the UUID.
export async function createInvoice(form: InvoiceFormData) {
  const payload = buildInvoicePayload(form);

  const { data, error } = await supabase
    .schema('public')
    .from('docs_invoices')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

// getInvoices
// Fetches all non-archived invoice rows ordered by newest first.
export async function getInvoices() {
  const { data, error } = await supabase
    .schema('public')
    .from('docs_invoices')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// uploadInvoicePdf
// Uploads a PDF File/Blob to the "documents" storage bucket and returns the
// public URL, or throws on failure.
export async function uploadInvoicePdf(file: File | Blob, id: string): Promise<string> {
  const path = `invoices/${id}.pdf`;

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, file, { upsert: true, contentType: 'application/pdf' });

  if (error) throw error;

  const { data } = supabase.storage.from('documents').getPublicUrl(path);
  return data.publicUrl;
}

// savePdfUrl
// Updates the pdf_url column of an existing invoice row.
export async function savePdfUrl(id: string, url: string): Promise<void> {
  const { error } = await supabase
    .schema('public')
    .from('docs_invoices')
    .update({ pdf_url: url, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

// logHistory
// Inserts a row into `activity_logs` to record invoice activity.
export async function logHistory(params: {
  recordId: string;
  action: 'created' | 'updated' | 'exported' | 'archived';
  title: string;
  details?: string;
}): Promise<void> {
  const { error } = await supabase.schema('public').from('activity_logs').insert([
    {
      module:    'invoice',
      record_id: params.recordId,
      action:    params.action,
      title:     params.title,
      details:   params.details || '',
    },
  ]);

  if (error) throw error;
}

// getHistory
// Fetches the 200 most-recent `activity_logs` rows for the invoice module.
export async function getHistory() {
  const { data, error } = await supabase
    .schema('public')
    .from('activity_logs')
    .select('*')
    .eq('module', 'invoice')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return data || [];
}

// archiveInvoice
// Marks an invoice as archived and logs the action.
export async function archiveInvoice(id: string): Promise<void> {
  const { error } = await supabase
    .schema('public')
    .from('docs_invoices')
    .update({ archived: true, status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;

  await logHistory({ recordId: id, action: 'archived', title: 'Invoice archived' });
}
