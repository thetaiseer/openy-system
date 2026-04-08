// ============================================================
// OPENY — Supabase Client
// ============================================================
// Requires:
//   1. Supabase JS CDN loaded (window.supabase)
//   2. supabase-config.js loaded first
//      (sets window.SUPABASE_URL and window.SUPABASE_ANON_KEY)
//
// Exposes window.supabaseDB with the following API:
//   saveInvoice(form)                 → upsert invoice row (returns record with Supabase UUID)
//   uploadInvoicePdf(file, invoiceId) → upload PDF to "documents" bucket
//   attachPdfUrl(invoiceId, pdfUrl)   → update pdf_url column in invoices
//   logHistory(recordId, title, action, details) → insert activity_logs row
//   getInvoices()                     → fetch all non-archived invoice records
//   getInvoiceHistory()               → fetch activity_logs records
//   ready                             → boolean, true when client is live
//
// Schema (invoices):
//   id uuid PK, invoice_number, client_name, currency, total_budget,
//   campaign_month, invoice_date, status, pdf_url, excel_url,
//   form_data jsonb, archived bool, created_at, updated_at
//
// Schema (activity_logs):
//   id uuid PK, module, record_id uuid, action, title, details, created_at
//
// Realtime subscriptions for "invoices" and "activity_logs" are
// started automatically when the client is ready.
// ============================================================

(function () {
    'use strict';

    let _client = null;
    let _ready  = false;

    // ── UUID check ────────────────────────────────────────────────────────
    function _isUUID(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));
    }

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
    // Upserts an invoice record using the column-based schema.
    // If form.id is a valid UUID, updates that row; otherwise inserts a new
    // row and lets Supabase generate the UUID.
    // Returns a flat record object with the Supabase UUID as `id`.
    async function saveInvoice(form) {
        if (!_ready) return null;

        const payload = {
            invoice_number: form.ref || form.invoice_number || ('INV-' + Date.now()),
            client_name:    form.client || form.client_name || 'Unknown',
            currency:       form.currency || 'EGP',
            total_budget:   Number(form.amount || form.total || form.total_budget || 0),
            campaign_month: form.campaignMonth || form.campaign_month || form.date || '',
            invoice_date:   form.invoiceDate || form.invoice_date || form.date || '',
            status:         form.archived ? 'archived' : (form.status || 'draft'),
            form_data:      form,
            archived:       form.archived || false,
            updated_at:     new Date().toISOString(),
        };

        let data, error;
        if (_isUUID(form.id)) {
            // UPDATE existing row
            ({ data, error } = await _client
                .from('invoices')
                .update(payload)
                .eq('id', form.id)
                .select()
                .single());
        } else {
            // INSERT new row — Supabase generates the UUID
            ({ data, error } = await _client
                .from('invoices')
                .insert([payload])
                .select()
                .single());
        }

        if (error) throw error;
        console.log('[OPENY] Supabase saveInvoice success — id:', data.id);

        // Return record in the flat format the rest of the app expects
        return _rowToRecord(data);
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
    // Updates the pdf_url column on an invoice row.
    async function attachPdfUrl(invoiceId, pdfUrl) {
        if (!_ready || !pdfUrl) return;
        try {
            const { error } = await _client
                .from('invoices')
                .update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() })
                .eq('id', invoiceId);
            if (error) throw error;
            console.log('[OPENY] Supabase attachPdfUrl success — id:', invoiceId);
        } catch (e) {
            console.warn('[OPENY] attachPdfUrl failed (non-critical):', e.message);
        }
    }

    // ── attachExcelUrl ────────────────────────────────────────────────────
    // Updates the excel_url column on an invoice row.
    async function attachExcelUrl(invoiceId, excelUrl) {
        if (!_ready || !excelUrl) return;
        try {
            const { error } = await _client
                .from('invoices')
                .update({ excel_url: excelUrl, updated_at: new Date().toISOString() })
                .eq('id', invoiceId);
            if (error) throw error;
            console.log('[OPENY] Supabase attachExcelUrl success — id:', invoiceId);
        } catch (e) {
            console.warn('[OPENY] attachExcelUrl failed (non-critical):', e.message);
        }
    }

    // ── logHistory ────────────────────────────────────────────────────────
    // Inserts a row into activity_logs for the given invoice UUID.
    async function logHistory(recordId, title, action, details) {
        if (!_ready) return;
        try {
            const entry = {
                module:    'invoice',
                record_id: recordId,
                action:    action || 'created',
                title:     title  || recordId || '',
                details:   details || '',
            };
            const { error } = await _client.from('activity_logs').insert([entry]);
            if (error) throw error;
            console.log('[OPENY] Supabase logHistory success — record:', recordId);
        } catch (e) {
            console.warn('[OPENY] logHistory failed (non-critical):', e.message);
        }
    }

    // ── getInvoices ───────────────────────────────────────────────────────
    // Fetches all non-archived invoice rows and returns them as flat record
    // objects compatible with the rest of the app (spreading form_data so
    // callers get the original field names alongside the column values).
    async function getInvoices() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .from('invoices')
                .select('*')
                .eq('archived', false)
                .order('created_at', { ascending: false });
            if (error) throw error;
            const records = (data || []).map(_rowToRecord);
            console.log('[OPENY] Supabase getInvoices — ' + records.length + ' record(s)');
            return records;
        } catch (e) {
            console.warn('[OPENY] getInvoices failed:', e.message);
            return [];
        }
    }

    // ── getInvoiceHistory ─────────────────────────────────────────────────
    // Fetches the 200 most-recent activity_logs rows for the invoice module.
    async function getInvoiceHistory() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .from('activity_logs')
                .select('*')
                .eq('module', 'invoice')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            const records = (data || []).map(function(row) {
                return {
                    id:          row.id,
                    record_id:   row.record_id,
                    title:       row.title   || '',
                    details:     row.details || '',
                    action_type: row.action  || 'created',
                    module_name: row.module  || 'invoice',
                    _created_at: row.created_at,
                };
            });
            console.log('[OPENY] Supabase getInvoiceHistory — ' + records.length + ' record(s)');
            return records;
        } catch (e) {
            console.warn('[OPENY] getInvoiceHistory failed:', e.message);
            return [];
        }
    }

    // ── _rowToRecord ──────────────────────────────────────────────────────
    // Maps a raw Supabase invoices row to the flat record object shape the
    // rest of the app expects (client, ref, amount, year, month, day, …).
    function _rowToRecord(row) {
        var ts = new Date(row.created_at);
        return Object.assign({}, row.form_data || {}, {
            id:           row.id,
            client:       row.client_name,
            client_name:  row.client_name,
            ref:          row.invoice_number,
            amount:       row.total_budget,
            total:        row.total_budget,
            currency:     row.currency,
            status:       row.status || 'draft',
            year:         ts.getFullYear(),
            month:        ts.getMonth() + 1,
            day:          ts.getDate(),
            timestamp:    ts.getTime(),
            date:         row.invoice_date || '',
            fileUrl:      row.pdf_url      || '',
            pdf_url:      row.pdf_url      || '',
            excel_url:    row.excel_url    || '',
            archived:     row.archived     || false,
            _created_at:  row.created_at,
        });
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
        saveInvoice:       saveInvoice,
        uploadInvoicePdf:  uploadInvoicePdf,
        attachPdfUrl:      attachPdfUrl,
        attachExcelUrl:    attachExcelUrl,
        logHistory:        logHistory,
        getInvoices:       getInvoices,
        getInvoiceHistory: getInvoiceHistory,
        get ready() { return _ready; }
    };

    console.log('[OPENY] supabaseDB module loaded');
}());

