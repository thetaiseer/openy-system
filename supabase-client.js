// ============================================================
// OPENY — Supabase Client
// ============================================================
// Requires:
//   1. Supabase JS CDN loaded (window.supabase)
//   2. supabase-config.js loaded first
//      (sets window.SUPABASE_URL and window.SUPABASE_ANON_KEY)
//
// Exposes window.supabaseDB with the following API:
//   saveInvoice(form)                 → upsert invoice row
//   uploadInvoicePdf(file, invoiceId) → upload PDF to "documents" bucket
//   attachPdfUrl(invoiceId, pdfUrl)   → patch pdf_url inside invoice.data
//   logHistory(recordId, title)       → insert activity_logs row
//   getInvoices()                     → fetch all invoice records
//   getInvoiceHistory()               → fetch activity_logs records
//   ready                             → boolean, true when client is live
//
// Realtime subscriptions for "invoices" and "activity_logs" are
// started automatically when the client is ready.
// ============================================================

(function () {
    'use strict';

    let _client = null;
    let _ready  = false;

    // ── Initialise ────────────────────────────────────────────────────────
    function _init() {
        const url = window.SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY;

        const _isPlaceholder = function(v) {
            return !v || /^YOUR_/.test(String(v));
        };

        if (_isPlaceholder(url) || _isPlaceholder(key)) {
            console.warn('[OPENY] Supabase not configured — open supabase-config.js and set SUPABASE_URL / SUPABASE_ANON_KEY.');
            return;
        }

        if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
            console.error('[OPENY] ❌ Supabase JS SDK not found. Ensure the CDN script is loaded before supabase-client.js.');
            return;
        }

        try {
            _client = window.supabase.createClient(url, key);
            _ready  = true;
            console.log('[OPENY] ✅ Supabase client initialized');
            _startRealtime();
        } catch (e) {
            console.error('[OPENY] ❌ Supabase init error:', e.message);
        }
    }

    // ── saveInvoice ───────────────────────────────────────────────────────
    // Upserts a full invoice record. `form` must have an `id` field.
    // The entire form object is stored in the JSONB `data` column.
    async function saveInvoice(form) {
        if (!_ready) return null;
        const row = {
            id:         form.id,
            data:       form,
            updated_at: new Date().toISOString()
        };
        const { data, error } = await _client
            .from('invoices')
            .upsert(row, { onConflict: 'id' })
            .select()
            .single();
        if (error) throw error;
        console.log('[OPENY] Supabase saveInvoice success — id:', form.id);
        return data;
    }

    // ── uploadInvoicePdf ──────────────────────────────────────────────────
    // Uploads a PDF File/Blob to the "documents" storage bucket.
    // Returns the public URL of the uploaded file, or null on failure.
    async function uploadInvoicePdf(file, invoiceId) {
        if (!_ready) return null;
        try {
            const uid  = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID().slice(0, 8)
                : Date.now().toString(36);
            const name = file.name || ('invoice-' + invoiceId + '.pdf');
            const path = 'invoices/' + Date.now() + '-' + uid + '-' + name;

            const { data, error } = await _client.storage
                .from('documents')
                .upload(path, file, { contentType: 'application/pdf', upsert: false });
            if (error) throw error;

            const { data: urlData } = _client.storage.from('documents').getPublicUrl(data.path);
            console.log('[OPENY] Supabase uploadInvoicePdf success:', urlData.publicUrl);
            return urlData.publicUrl;
        } catch (e) {
            console.warn('[OPENY] uploadInvoicePdf failed (non-critical):', e.message);
            return null;
        }
    }

    // ── attachPdfUrl ──────────────────────────────────────────────────────
    // Patches the `pdf_url` key inside the JSONB data column of an invoice.
    async function attachPdfUrl(invoiceId, pdfUrl) {
        if (!_ready || !pdfUrl) return;
        try {
            // Fetch existing data first so we can merge cleanly
            const { data: existing, error: fetchErr } = await _client
                .from('invoices')
                .select('data')
                .eq('id', invoiceId)
                .single();
            if (fetchErr) throw fetchErr;

            const updatedData = Object.assign({}, existing.data, { pdf_url: pdfUrl });
            const { error } = await _client
                .from('invoices')
                .update({ data: updatedData, updated_at: new Date().toISOString() })
                .eq('id', invoiceId);
            if (error) throw error;
            console.log('[OPENY] Supabase attachPdfUrl success — id:', invoiceId);
        } catch (e) {
            console.warn('[OPENY] attachPdfUrl failed (non-critical):', e.message);
        }
    }

    // ── logHistory ────────────────────────────────────────────────────────
    // Inserts a row into activity_logs for the given invoice.
    async function logHistory(recordId, title) {
        if (!_ready) return;
        try {
            const uid = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : (Date.now().toString(36) + Math.random().toString(36).slice(2));
            const entry = {
                id:   'log-' + uid,
                data: {
                    record_id:   recordId,
                    title:       title || recordId || '',
                    action_type: 'created',
                    module_name: 'invoice',
                    created_at:  new Date().toISOString()
                }
            };
            const { error } = await _client.from('activity_logs').insert(entry);
            if (error) throw error;
            console.log('[OPENY] Supabase logHistory success — record:', recordId);
        } catch (e) {
            console.warn('[OPENY] logHistory failed (non-critical):', e.message);
        }
    }

    // ── getInvoices ───────────────────────────────────────────────────────
    // Fetches all invoice rows and returns them as flat record objects
    // (spreading the JSONB `data` column so callers get the same shape
    // that cloudDB.getAll('invoices') has always produced).
    async function getInvoices() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .from('invoices')
                .select('id, data, created_at, updated_at')
                .order('created_at', { ascending: false });
            if (error) throw error;
            const records = (data || []).map(function(row) {
                return Object.assign({ id: row.id }, row.data || {}, { _created_at: row.created_at });
            });
            console.log('[OPENY] Supabase getInvoices — ' + records.length + ' record(s)');
            return records;
        } catch (e) {
            console.warn('[OPENY] getInvoices failed:', e.message);
            return [];
        }
    }

    // ── getInvoiceHistory ─────────────────────────────────────────────────
    // Fetches the 200 most-recent activity_logs rows and returns them as
    // flat record objects.
    async function getInvoiceHistory() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .from('activity_logs')
                .select('id, data, created_at')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            const records = (data || []).map(function(row) {
                return Object.assign({ id: row.id }, row.data || {}, { _created_at: row.created_at });
            });
            console.log('[OPENY] Supabase getInvoiceHistory — ' + records.length + ' record(s)');
            return records;
        } catch (e) {
            console.warn('[OPENY] getInvoiceHistory failed:', e.message);
            return [];
        }
    }

    // ── Realtime subscriptions ────────────────────────────────────────────
    function _startRealtime() {
        _client
            .channel('openy-invoices-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'invoices' },
                function() {
                    if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                    if (typeof window.updateAllocations    === 'function') window.updateAllocations();
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'activity_logs' },
                function() {
                    if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                }
            )
            .subscribe(function(status) {
                if (status === 'SUBSCRIBED') {
                    console.log('[OPENY] ✅ Supabase realtime active — invoices + activity_logs');
                }
            });
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────
    _init();

    // ── Public API ────────────────────────────────────────────────────────
    window.supabaseDB = {
        saveInvoice:      saveInvoice,
        uploadInvoicePdf: uploadInvoicePdf,
        attachPdfUrl:     attachPdfUrl,
        logHistory:       logHistory,
        getInvoices:      getInvoices,
        getInvoiceHistory: getInvoiceHistory,
        get ready() { return _ready; }
    };

    console.log('[OPENY] supabaseDB module loaded');
}());
