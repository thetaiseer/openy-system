import { supabase } from '../lib/supabase';

// ── createInvoice ─────────────────────────────────────────────────────────────
// Upserts a full invoice record into the `invoices` table.
// The entire record object is stored in the JSONB `data` column.
export async function createInvoice(record: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const row = {
    id: record.id,
    data: record,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('invoices')
    .upsert(row, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── getInvoices ───────────────────────────────────────────────────────────────
// Fetches all invoice rows, returning flat record objects by spreading the
// JSONB `data` column so callers receive the same shape the rest of the app
// already expects.
export async function getInvoices(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, data, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row) =>
    Object.assign({ id: row.id }, row.data || {}, { _created_at: row.created_at })
  );
}

// ── uploadInvoicePdf ──────────────────────────────────────────────────────────
// Uploads a PDF File/Blob to the "documents" storage bucket and returns the
// public URL of the uploaded file, or null on failure.
export async function uploadInvoicePdf(file: File, invoiceId: string): Promise<string | null> {
  const uid = crypto.randomUUID().slice(0, 8);
  const path = `invoices/${Date.now()}-${uid}-${file.name || `invoice-${invoiceId}.pdf`}`;

  const { data, error } = await supabase.storage
    .from('documents')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;

  const { data: urlData } = supabase.storage.from('documents').getPublicUrl(data.path);
  return urlData.publicUrl;
}

// ── savePdfUrl ────────────────────────────────────────────────────────────────
// Patches the `pdf_url` key inside the JSONB data column of an invoice row.
export async function savePdfUrl(invoiceId: string, pdfUrl: string): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('invoices')
    .select('data')
    .eq('id', invoiceId)
    .single();
  if (fetchErr) throw fetchErr;

  const updatedData = Object.assign({}, existing.data, { pdf_url: pdfUrl });
  const { error } = await supabase
    .from('invoices')
    .update({ data: updatedData, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);
  if (error) throw error;
}

// ── logHistory ────────────────────────────────────────────────────────────────
// Inserts a row into `activity_logs` to record invoice activity.
export async function logHistory(recordId: string, title: string): Promise<void> {
  const id = 'log-' + crypto.randomUUID();
  const entry = {
    id,
    data: {
      record_id: recordId,
      title: title || recordId || '',
      action_type: 'created',
      module_name: 'invoice',
      created_at: new Date().toISOString(),
    },
  };
  const { error } = await supabase.from('activity_logs').insert(entry);
  if (error) throw error;
}

// ── getHistory ────────────────────────────────────────────────────────────────
// Fetches the 200 most-recent `activity_logs` rows, returning flat record
// objects by spreading the JSONB `data` column.
export async function getHistory(): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('id, data, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row) =>
    Object.assign({ id: row.id }, row.data || {}, { _created_at: row.created_at })
  );
}
