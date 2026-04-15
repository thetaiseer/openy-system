// ============================================================
// OPENY — Supabase Client
// ============================================================
(function () {
    'use strict';

    const TABLES = {
        invoices:  'docs_invoices',
        branches:  'docs_invoice_branches',
        platforms: 'docs_invoice_platforms',
        rows:      'docs_invoice_rows'
    };

    let _client = null;
    let _ready = false;
    let _schemaWarned = false;

    function _isUUID(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || ''));
    }

    function _toNumber(val) {
        const n = Number(val);
        return Number.isFinite(n) ? n : 0;
    }

    function _notifyUser(message) {
        if (typeof window.showToast === 'function') window.showToast(message);
    }

    function _friendlyErrorMessage(err, fallback) {
        const msg = String((err && (err.message || err.details || err.hint)) || '').toLowerCase();
        if (msg.includes('could not find table public.docs_invoices') || msg.includes('relation "public.docs_invoices" does not exist')) {
            return 'Invoice database tables are missing. Run supabase-schema.sql, then refresh schema cache and reload.';
        }
        if (msg.includes('row-level security')) return 'Permission denied by database security policy. Please review Supabase RLS settings.';
        return fallback;
    }

    function _surfaceError(err, fallback, options) {
        const message = _friendlyErrorMessage(err, fallback);
        if (!(options && options.silent)) _notifyUser(message);
        if (message.includes('Invoice database tables are missing') && !_schemaWarned) {
            _schemaWarned = true;
            console.error('[OPENY] Supabase schema issue detected:', err);
        } else {
            console.warn('[OPENY] Supabase operation failed:', err && err.message ? err.message : err);
        }
        return message;
    }

    function _normalizeInvoiceData(raw) {
        const data = raw && typeof raw === 'object' ? structuredClone(raw) : {};
        data.type = data.type || 'detailed';
        data.client = data.client || '';
        data.month = data.month || '';
        data.invoiceDate = data.invoiceDate || '';
        data.currency = data.currency || 'EGP';
        data.fees = _toNumber(data.fees);
        data.finalBudget = _toNumber(data.finalBudget || data.netBudget);
        data.branches = Array.isArray(data.branches) ? data.branches : [];

        let finalBudget = 0;
        const normalizedBranches = [];

        data.branches.forEach((branch, branchIdx) => {
            const b = branch && typeof branch === 'object' ? branch : {};
            const platforms = Array.isArray(b.platforms) ? b.platforms : [];
            const legacyItems = Array.isArray(b.items) ? b.items : [];
            const normalizedPlatforms = platforms.map((platform) => {
                const p = platform && typeof platform === 'object' ? platform : {};
                const rows = Array.isArray(p.rows) ? p.rows : [];
                const normalizedRows = rows.map((row, rowIdx) => {
                    const r = row && typeof row === 'object' ? row : {};
                    const cost = _toNumber(r.cost);
                    return {
                        id: r.id || `${branchIdx}-${p.name || 'platform'}-${rowIdx}`,
                        branchName: r.branchName || (b.name ? b.name.split(' ')[0] : ''),
                        platform: p.name || r.platform || '',
                        adName: r.adName || '',
                        dateStr: r.dateStr || '',
                        results: r.results || '',
                        cost
                    };
                });
                const subtotal = normalizedRows.reduce((sum, row) => sum + _toNumber(row.cost), 0);
                return {
                    id: p.id || `${branchIdx}-${p.name || 'platform'}`,
                    name: p.name || '',
                    rows: normalizedRows,
                    subtotal
                };
            });

            if (!normalizedPlatforms.length && legacyItems.length) {
                const grouped = {};
                legacyItems.forEach((item) => {
                    const key = item.platform || 'Unknown';
                    grouped[key] = grouped[key] || [];
                    grouped[key].push(item);
                });
                Object.keys(grouped).forEach((platformName, pIdx) => {
                    const rows = grouped[platformName].map((item, rowIdx) => ({
                        id: item.id || `${branchIdx}-${platformName}-${rowIdx}`,
                        branchName: item.branchName || (b.name ? b.name.split(' ')[0] : ''),
                        platform: platformName,
                        adName: item.adName || '',
                        dateStr: item.dateStr || '',
                        results: item.results || '',
                        cost: _toNumber(item.cost)
                    }));
                    normalizedPlatforms.push({
                        id: `${branchIdx}-${platformName}-${pIdx}`,
                        name: platformName,
                        rows,
                        subtotal: rows.reduce((sum, row) => sum + row.cost, 0)
                    });
                });
            }

            const subtotal = normalizedPlatforms.reduce((sum, p) => sum + _toNumber(p.subtotal), 0);
            finalBudget += subtotal;
            normalizedBranches.push({
                id: b.id || `${branchIdx}-${b.name || 'branch'}`,
                name: b.name || `Branch ${branchIdx + 1}`,
                platforms: normalizedPlatforms,
                subtotal,
                total: subtotal,
                items: normalizedPlatforms.flatMap((p) => p.rows)
            });
        });

        const fallbackGrand = _toNumber(data.totalBudget || data.grandTotal || data.total || data.amount);
        const fallbackFinal = _toNumber(data.finalBudget || data.netBudget || (fallbackGrand - _toNumber(data.fees || 0)));
        if (!normalizedBranches.length) finalBudget = Math.max(0, fallbackFinal);
        const fees = _toNumber(data.fees || (fallbackGrand > finalBudget ? fallbackGrand - finalBudget : 500));
        const computedGrand = finalBudget + fees;

        data.branches = normalizedBranches;
        data.finalBudget = finalBudget;
        data.netBudget = finalBudget;
        data.fees = fees;
        data.grandTotal = computedGrand;
        data.totalBudget = data.type === 'detailed' ? computedGrand : (fallbackGrand || computedGrand);
        return data;
    }

    function _extractInvoiceData(form) {
        if (form && form.invoiceData && typeof form.invoiceData === 'object') return _normalizeInvoiceData(form.invoiceData);
        if (form && form.invoiceStructure && typeof form.invoiceStructure === 'object') return _normalizeInvoiceData(form.invoiceStructure);
        if (form && form.form_data_json && form.form_data_json.invoiceStructure) return _normalizeInvoiceData(form.form_data_json.invoiceStructure);
        if (form && form.formSnapshot && form.formSnapshot.invoiceStructure) return _normalizeInvoiceData(form.formSnapshot.invoiceStructure);
        return _normalizeInvoiceData({
            type: 'simple',
            client: form.client || form.client_name || '',
            month: form.campaignMonth || form.campaign_month || '',
            invoiceDate: form.invoiceDate || form.invoice_date || form.date || '',
            currency: form.currency || 'EGP',
            totalBudget: _toNumber(form.total || form.amount || form.total_budget || form.grand_total || 0),
            fees: _toNumber(form.fees || 0),
            finalBudget: _toNumber(form.final_budget || form.netBudget || form.total || form.amount || 0),
            branches: []
        });
    }

    async function _replaceNestedRows(invoiceId, invoiceData) {
        const { error: delError } = await _client.schema('public').from(TABLES.branches).delete().eq('invoice_id', invoiceId);
        if (delError) throw delError;

        for (let bIdx = 0; bIdx < invoiceData.branches.length; bIdx++) {
            const branch = invoiceData.branches[bIdx];
            const { data: branchRow, error: branchError } = await _client
                .schema('public')
                .from(TABLES.branches)
                .insert([{
                    invoice_id: invoiceId,
                    name: branch.name,
                    position: bIdx,
                    subtotal: _toNumber(branch.subtotal)
                }])
                .select()
                .single();
            if (branchError) throw branchError;

            for (let pIdx = 0; pIdx < branch.platforms.length; pIdx++) {
                const platform = branch.platforms[pIdx];
                const { data: platformRow, error: platformError } = await _client
                    .schema('public')
                    .from(TABLES.platforms)
                    .insert([{
                        branch_id: branchRow.id,
                        name: platform.name,
                        position: pIdx,
                        subtotal: _toNumber(platform.subtotal)
                    }])
                    .select()
                    .single();
                if (platformError) throw platformError;

                if (!platform.rows.length) continue;
                const rowsPayload = platform.rows.map((row, rowIdx) => ({
                    platform_id: platformRow.id,
                    position: rowIdx,
                    branch_name: row.branchName || branch.name,
                    ad_name: row.adName || '',
                    date_str: row.dateStr || '',
                    results: row.results || '',
                    cost: _toNumber(row.cost)
                }));
                const { error: rowsError } = await _client.schema('public').from(TABLES.rows).insert(rowsPayload);
                if (rowsError) throw rowsError;
            }
        }
    }

    async function _getNestedData(invoiceIds) {
        if (!invoiceIds.length) return { branchesByInvoice: {} };
        const { data: branchRows, error: branchErr } = await _client
            .schema('public')
            .from(TABLES.branches)
            .select('*')
            .in('invoice_id', invoiceIds)
            .order('position', { ascending: true });
        if (branchErr) throw branchErr;

        const branchIds = (branchRows || []).map((b) => b.id);
        const { data: platformRows, error: platformErr } = branchIds.length
            ? await _client.schema('public').from(TABLES.platforms).select('*').in('branch_id', branchIds).order('position', { ascending: true })
            : { data: [], error: null };
        if (platformErr) throw platformErr;

        const platformIds = (platformRows || []).map((p) => p.id);
        const { data: rowRows, error: rowErr } = platformIds.length
            ? await _client.schema('public').from(TABLES.rows).select('*').in('platform_id', platformIds).order('position', { ascending: true })
            : { data: [], error: null };
        if (rowErr) throw rowErr;

        const rowsByPlatform = {};
        (rowRows || []).forEach((row) => {
            rowsByPlatform[row.platform_id] = rowsByPlatform[row.platform_id] || [];
            rowsByPlatform[row.platform_id].push({
                id: row.id,
                branchName: row.branch_name || '',
                platform: '',
                adName: row.ad_name || '',
                dateStr: row.date_str || '',
                results: row.results || '',
                cost: _toNumber(row.cost)
            });
        });

        const platformsByBranch = {};
        (platformRows || []).forEach((platform) => {
            const rows = rowsByPlatform[platform.id] || [];
            const subtotal = rows.reduce((sum, r) => sum + _toNumber(r.cost), 0);
            rows.forEach((r) => { r.platform = platform.name; });
            platformsByBranch[platform.branch_id] = platformsByBranch[platform.branch_id] || [];
            platformsByBranch[platform.branch_id].push({
                id: platform.id,
                name: platform.name,
                subtotal,
                rows
            });
        });

        const branchesByInvoice = {};
        (branchRows || []).forEach((branch) => {
            const platforms = platformsByBranch[branch.id] || [];
            const subtotal = platforms.reduce((sum, p) => sum + _toNumber(p.subtotal), 0);
            branchesByInvoice[branch.invoice_id] = branchesByInvoice[branch.invoice_id] || [];
            branchesByInvoice[branch.invoice_id].push({
                id: branch.id,
                name: branch.name,
                subtotal,
                total: subtotal,
                platforms,
                items: platforms.flatMap((p) => p.rows)
            });
        });

        return { branchesByInvoice };
    }

    function _rowToRecord(row, nestedBranches) {
        const ts = new Date(row.created_at || Date.now());
        const invoiceData = _normalizeInvoiceData(Object.assign({}, row.invoice_data || {}, {
            client: row.client_name,
            month: row.campaign_month || '',
            invoiceDate: row.invoice_date || '',
            currency: row.currency,
            fees: _toNumber(row.fees),
            finalBudget: _toNumber(row.final_budget),
            grandTotal: _toNumber(row.grand_total),
            totalBudget: _toNumber(row.grand_total),
            branches: Array.isArray(nestedBranches) ? nestedBranches : (row.invoice_data && row.invoice_data.branches) || []
        }));

        return {
            id: row.id,
            client: row.client_name,
            client_name: row.client_name,
            ref: row.invoice_number,
            amount: _toNumber(row.grand_total),
            total: _toNumber(row.grand_total),
            currency: row.currency || 'EGP',
            status: row.status || 'draft',
            year: ts.getFullYear(),
            month: ts.getMonth() + 1,
            day: ts.getDate(),
            timestamp: ts.getTime(),
            date: row.invoice_date || '',
            fileUrl: row.pdf_url || '',
            pdf_url: row.pdf_url || '',
            excel_url: row.excel_url || '',
            archived: !!row.archived,
            _created_at: row.created_at,
            _updated_at: row.updated_at,
            fees: _toNumber(row.fees),
            final_budget: _toNumber(row.final_budget),
            grand_total: _toNumber(row.grand_total),
            campaign_month: row.campaign_month || '',
            formSnapshot: row.form_snapshot || null,
            form_data_json: row.form_snapshot || null,
            invoiceStructure: invoiceData,
            invoiceData
        };
    }

    async function _validateDocsSchema() {
        const { error } = await _client.schema('public').from(TABLES.invoices).select('id').limit(1);
        if (error) throw error;
    }

    function _init() {
        const url = window.SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY;
        const isPlaceholder = (v) => !v || /^YOUR_/.test(String(v));

        if (isPlaceholder(url) || isPlaceholder(key)) {
            console.warn('[OPENY] Supabase not configured — open supabase-config.js and set SUPABASE_URL / SUPABASE_ANON_KEY.');
            return;
        }
        if (typeof window.supabase === 'undefined' || typeof window.supabase.createClient !== 'function') {
            console.error('[OPENY] ❌ Supabase JS SDK not found. Ensure the CDN script is loaded before supabase-client.js.');
            return;
        }
        try {
            _client = window.supabase.createClient(url, key);
            _ready = true;
            _validateDocsSchema().then(() => {
                console.log('[OPENY] ✅ Supabase client initialized (docs invoice schema detected)');
            }).catch((err) => {
                _surfaceError(err, 'Supabase invoice schema check failed.', { silent: false });
            });
            _startRealtime();
        } catch (e) {
            console.error('[OPENY] ❌ Supabase init error:', e.message);
        }
    }

    async function saveInvoice(form) {
        if (!_ready) return null;
        try {
            const invoiceData = _extractInvoiceData(form || {});
            const payload = {
                invoice_number: form.ref || form.invoice_number || ('INV-' + Date.now()),
                client_name: form.client || form.client_name || invoiceData.client || 'Unknown',
                currency: form.currency || invoiceData.currency || 'EGP',
                final_budget: _toNumber(invoiceData.finalBudget),
                fees: _toNumber(invoiceData.fees),
                grand_total: _toNumber(invoiceData.grandTotal),
                campaign_month: form.campaignMonth || form.campaign_month || invoiceData.month || form.date || '',
                invoice_date: form.invoiceDate || form.invoice_date || invoiceData.invoiceDate || form.date || '',
                status: form.archived ? 'archived' : (form.status || 'draft'),
                form_snapshot: form.formSnapshot || form.form_data_json || null,
                invoice_data: invoiceData,
                archived: !!form.archived,
                updated_at: new Date().toISOString()
            };

            let data, error;
            if (_isUUID(form.id)) {
                ({ data, error } = await _client.schema('public').from(TABLES.invoices).update(payload).eq('id', form.id).select().single());
            } else {
                ({ data, error } = await _client.schema('public').from(TABLES.invoices).insert([payload]).select().single());
            }
            if (error) throw error;

            await _replaceNestedRows(data.id, invoiceData);
            const nested = await _getNestedData([data.id]);
            return _rowToRecord(data, (nested.branchesByInvoice[data.id] || []));
        } catch (e) {
            _surfaceError(e, 'Unable to save invoice right now. Please try again.');
            throw e;
        }
    }

    async function uploadInvoicePdf(file, invoiceId) {
        if (!_ready) return null;
        try {
            const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
            const name = file.name || ('invoice-' + invoiceId + '.pdf');
            const path = 'invoices/' + Date.now() + '-' + uid + '-' + name;
            const { data, error } = await _client.storage.from('documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
            if (error) throw error;
            const { data: urlData } = _client.storage.from('documents').getPublicUrl(data.path);
            return urlData.publicUrl;
        } catch (e) {
            _surfaceError(e, 'Unable to upload invoice PDF right now.');
            return null;
        }
    }

    async function attachPdfUrl(invoiceId, pdfUrl) {
        if (!_ready || !pdfUrl) return;
        try {
            const { error } = await _client.schema('public').from(TABLES.invoices).update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() }).eq('id', invoiceId);
            if (error) throw error;
        } catch (e) {
            _surfaceError(e, 'Invoice saved, but linking the PDF failed.');
        }
    }

    async function attachExcelUrl(invoiceId, excelUrl) {
        if (!_ready || !excelUrl) return;
        try {
            const { error } = await _client.schema('public').from(TABLES.invoices).update({ excel_url: excelUrl, updated_at: new Date().toISOString() }).eq('id', invoiceId);
            if (error) throw error;
        } catch (e) {
            _surfaceError(e, 'Invoice saved, but linking the Excel file failed.');
        }
    }

    async function logHistory(recordId, title, action, details) {
        if (!_ready) return;
        try {
            const entry = { module: 'invoice', record_id: recordId, action: action || 'created', title: title || recordId || '', details: details || '' };
            const { error } = await _client.schema('public').from('activity_logs').insert([entry]);
            if (error) throw error;
        } catch (e) {
            _surfaceError(e, 'Invoice saved, but history logging failed.', { silent: true });
        }
    }

    async function getInvoices() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .schema('public')
                .from(TABLES.invoices)
                .select('*')
                .eq('archived', false)
                .order('created_at', { ascending: false });
            if (error) throw error;

            const invoiceRows = data || [];
            const nested = await _getNestedData(invoiceRows.map((row) => row.id));
            return invoiceRows.map((row) => _rowToRecord(row, nested.branchesByInvoice[row.id] || []));
        } catch (e) {
            _surfaceError(e, 'Unable to load invoices right now. Please refresh and try again.');
            return [];
        }
    }

    async function getInvoiceHistory() {
        if (!_ready) return [];
        try {
            const { data, error } = await _client
                .schema('public')
                .from('activity_logs')
                .select('*')
                .eq('module', 'invoice')
                .order('created_at', { ascending: false })
                .limit(200);
            if (error) throw error;
            return (data || []).map((row) => ({
                id: row.id,
                record_id: row.record_id,
                title: row.title || '',
                details: row.details || '',
                action_type: row.action || 'created',
                module_name: row.module || 'invoice',
                _created_at: row.created_at
            }));
        } catch (e) {
            _surfaceError(e, 'Unable to load invoice history right now.');
            return [];
        }
    }

    function _startRealtime() {
        _client
            .channel('openy-invoices-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.invoices }, function() {
                if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                if (typeof window.updateAllocations === 'function') window.updateAllocations();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, function() {
                if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
            })
            .subscribe(function(status) {
                if (status === 'SUBSCRIBED') console.log('[OPENY] ✅ Supabase realtime active — docs_invoices + activity_logs');
            });
    }

    _init();

    window.supabaseDB = {
        saveInvoice,
        uploadInvoicePdf,
        attachPdfUrl,
        attachExcelUrl,
        logHistory,
        getInvoices,
        getInvoiceHistory,
        get ready() { return _ready; }
    };

    console.log('[OPENY] supabaseDB module loaded');
}());
