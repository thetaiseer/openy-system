
        // ==========================================================================
        // 1. STATE & CONSTANTS
        // ==========================================================================
        const PLATFORMS_LIST = ['IG', 'Snap', 'TikTok', 'Google', 'Salla'];
        let invCustomServices = [];
        let currentInvoiceRef = null;

        let allHistoryRecords = [];
        let allInvHistoryRecords = [];
        
        let currentEditingHistoryId = null;
        let currentEditingInvHistoryId = null;
        let currentEditingCtId = null;
        let currentEditingEcId = null;
        
        let currentHistoryFilter = 'all';
        let currentInvHistoryFilter = 'all';

        let appState = {
            services: [],
            finalPrice: 15000,
            currencyMap: { 'EGP': 'EGP', 'USD': 'USD', 'SAR': 'SAR', 'AED': 'AED', 'EUR': 'EUR', 'GBP': 'GBP' }, 
            currency: 'EGP'
        };

        // --- Performance Lazy Loading Setup ---
        let isExportLibrariesLoaded = false;
        async function loadExportLibraries() {
            if(isExportLibrariesLoaded) return true;
            return new Promise((resolve) => {
                const scripts = [
                    "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js",
                    "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js",
                    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
                    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js",
                    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js",
                    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
                ];
                let loadedCount = 0;
                scripts.forEach(src => {
                    const script = document.createElement('script');
                    script.src = src;
                    script.onload = () => {
                        loadedCount++;
                        if (loadedCount === scripts.length) {
                            isExportLibrariesLoaded = true;
                            resolve(true);
                        }
                    };
                    document.body.appendChild(script);
                });
            });
        }

        // ==========================================================================
        // 2. HELPER FUNCTIONS
        // ==========================================================================
        function containsArabic(text) { return typeof text === 'string' && /[\u0600-\u06FF]/.test(text); }
        function formatBilingualText(text, tag = 'span') {
            if (!text) return '';
            const strText = String(text);
            const isAr = containsArabic(strText);
            const className = isAr ? 'arabic-text' : 'english-text';
            const dir = isAr ? 'rtl' : 'ltr';
            const htmlText = strText.replace(/\n/g, '<br>');
            return `<${tag} class="${className}" dir="${dir}">${htmlText}</${tag}>`;
        }
        function generateInvoiceRef() {
            if (currentInvoiceRef) return currentInvoiceRef;
            const year = new Date().getFullYear();
            return `INV-${year}-001`;
        }
        async function initInvoiceNumber() {
            const year = new Date().getFullYear();
            const prefix = `INV-${year}-`;
            const records = (window.supabaseDB && window.supabaseDB.ready)
                ? await window.supabaseDB.getInvoices()
                : await cloudDB.getAll('invoices');
            let maxNum = 0;
            records.forEach(r => {
                if (r.ref && r.ref.startsWith(prefix)) {
                    const n = parseInt(r.ref.slice(prefix.length), 10);
                    if (!isNaN(n) && n > maxNum) maxNum = n;
                }
            });
            currentInvoiceRef = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
        }
        async function initQuoteNumber() {
            const year = new Date().getFullYear();
            const prefix = `Q-${year}-`;
            const records = await cloudDB.getAll('quotations');
            let maxNum = 100;
            records.forEach(r => {
                if (r.ref && r.ref.startsWith(prefix)) {
                    const n = parseInt(r.ref.slice(prefix.length), 10);
                    if (!isNaN(n) && n > maxNum) maxNum = n;
                }
            });
            const newNum = `${prefix}${maxNum + 1}`;
            if (!appState['quote-num'] || appState['quote-num'].endsWith('…')) {
                appState['quote-num'] = newNum;
                const el = document.getElementById('in-quote-num');
                if (el) el.value = newNum;
            }
        }
        function formatCurrency(amount) {
            const code = appState.currency || 'EGP';
            const sym = appState.currencyMap[code] || 'EGP';
            const numStr = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
            if(['EGP', 'SAR', 'AED'].includes(code)) return `${numStr} ${sym}`;
            return `${sym} ${numStr}`;
        }
        function formatDate(dateString) {
            if(!dateString) return '';
            const d = new Date(dateString);
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
        }
        function sanitizeFilename(client, ref) {
            let safeClient = (client || 'Document').trim();
            let safeRef = (ref || '').trim();
            safeClient = safeClient.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '-');
            safeRef = safeRef.replace(/[<>:"\/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '-');
            let combined = `${safeClient}_${safeRef}`.replace(/_+/g, '_');
            if(combined.length > 80) combined = combined.substring(0, 80);
            return `${combined}.pdf`;
        }
        function formatMonthForDisplay(yyyymm) {
            if (!yyyymm) return 'N/A';
            const parts = yyyymm.split('-');
            if (parts.length < 2) return yyyymm;
            const monthNum = parseInt(parts[1], 10);
            if (monthNum < 1 || monthNum > 12) return yyyymm;
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${months[monthNum - 1]}-${parts[0]}`;
        }
        function parseDateFilter(dateVal) {
            if (!dateVal) return { filterYear: '', filterMonth: '', filterDay: '' };
            const [y, m, d] = dateVal.split('-');
            return { filterYear: y, filterMonth: String(parseInt(m, 10)), filterDay: String(parseInt(d, 10)) };
        }
        function showToast(msg) {
            const div = document.createElement('div');
            div.style.cssText = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(15, 23, 42, 0.9); backdrop-filter: blur(12px); color:white; padding:12px 24px; border-radius:12px; border: 1px solid rgba(255,255,255,0.2); z-index:9999; font-weight:bold; box-shadow: 0 10px 25px rgba(0,0,0,0.2); transition: opacity 0.3s;";
            div.innerText = msg;
            document.body.appendChild(div);
            setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 300); }, 2000);
        }
        function formatGroupLabel(ym) {
            if (!ym) return "Other";
            const parts = ym.split('-');
            if (parts.length !== 2) return "Other";
            const year = parts[0];
            const date = new Date(year, parseInt(parts[1]) - 1);
            return `${year} • ${date.toLocaleString('en-US', { month: 'long' })}`;
        }

        // ==========================================================================
        // 2.5 AI GENERATION LOGIC (GEMINI)
        // ==========================================================================
        async function fetchGeminiText(prompt, retries = 5) {
            const apiKey = "";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: "You are an expert performance marketing copywriter. Provide concise, professional, and impactful text. Output ONLY the text to be inserted, without quotes or markdown asterisks. Use standard dashes (-) for bullet points if needed." }] }
            };

            const delays = [1000, 2000, 4000, 8000, 16000];

            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const data = await response.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return text.trim();
                    throw new Error("No text returned");
                } catch (error) {
                    if (i === retries - 1) {
                        showToast("AI Generation failed. Please try again later.");
                        console.error("Gemini API Error:", error);
                        return null;
                    }
                    await new Promise(res => setTimeout(res, delays[i]));
                }
            }
        }

        window.autoGenerateInvProjectDesc = async function() {
            const client = document.getElementById('inv-custom-client-name')?.value || 'a client';
            const project = document.getElementById('inv-custom-project')?.value || 'marketing campaign';
            const prompt = `Write a short, professional 1-2 sentence description for an invoice regarding a project titled "${project}" for client "${client}".`;
            
            const btn = document.getElementById('btn-inv-gemini-proj');
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳...'; btn.disabled = true;
            
            const text = await fetchGeminiText(prompt);
            if (text) {
                const el = document.getElementById('inv-custom-desc');
                if (el) {
                    el.value = text;
                    if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv();
                }
            }
            btn.innerHTML = originalText; btn.disabled = false;
        };

        window.autoGenerateInvScope = async function(id) {
            const name = document.getElementById(`inv-srv-name-${id}`)?.value || 'Service';
            const prompt = `Write a concise, professional scope of work (2-3 short bullet points) for a digital marketing service named "${name}".`;
            
            const btn = document.getElementById(`btn-inv-gemini-scope-${id}`);
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳...'; btn.disabled = true;
            
            const text = await fetchGeminiText(prompt);
            if (text) {
                const el = document.getElementById(`inv-srv-scope-${id}`);
                if (el) {
                    el.value = text;
                    if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv();
                }
            }
            btn.innerHTML = originalText; btn.disabled = false;
        };

        window.autoGenerateProjectDesc = async function() {
            const client = document.getElementById('in-client-name')?.value || 'a client';
            const project = document.getElementById('in-project')?.value || 'marketing campaign';
            const prompt = `Write a short, professional 1-2 sentence description for a quotation regarding a project titled "${project}" for client "${client}".`;
            
            const btn = document.getElementById('btn-gemini-proj');
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳...'; btn.disabled = true;
            
            const text = await fetchGeminiText(prompt);
            if (text) {
                const el = document.getElementById('in-project-desc');
                if (el) {
                    el.value = text;
                    if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
                }
            }
            btn.innerHTML = originalText; btn.disabled = false;
        };

        window.autoGenerateScope = async function(id) {
            const name = document.getElementById(`srv-name-${id}`)?.value || 'Service';
            const prompt = `Write a concise, professional scope of work (2-3 short bullet points) for a digital marketing service named "${name}".`;
            
            const btn = document.getElementById(`btn-gemini-scope-${id}`);
            const originalText = btn.innerHTML;
            btn.innerHTML = '⏳...'; btn.disabled = true;
            
            const text = await fetchGeminiText(prompt);
            if (text) {
                const el = document.getElementById(`srv-scope-${id}`);
                if (el) {
                    el.value = text;
                    if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
                }
            }
            btn.innerHTML = originalText; btn.disabled = false;
        };

        // ==========================================================================
        // 3. UI SWITCHERS & MODALS
        // ==========================================================================
        let confirmCallback = null;
        
        window.openConfirmModal = function(title, message, callback) {
            document.getElementById('confirm-title').innerText = title;
            document.getElementById('confirm-message').innerText = message;
            confirmCallback = callback;
            const modal = document.getElementById('confirm-modal');
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        };

        window.closeConfirmModal = function() {
            const modal = document.getElementById('confirm-modal');
            modal.classList.remove('flex');
            modal.classList.add('hidden');
            confirmCallback = null;
        };

        window.executeConfirm = function() {
            if (confirmCallback) confirmCallback();
            window.closeConfirmModal();
        };

        window.executeSuperReset = function() {
            window.openConfirmModal("Reset System", "This will restore the current working form to its default state. Are you sure?", () => {
                showToast("System restored to default state.");
                setTimeout(() => { window.location.reload(); }, 800);
            });
        };

        // Landing screen logic
        window.openModule = function(moduleName) {
            const landing = document.getElementById('landing-screen');
            if (landing) {
                landing.classList.add('fade-out');
                setTimeout(() => { landing.style.display = 'none'; }, 380);
            }
            if (typeof window.switchMainModule === 'function') window.switchMainModule(moduleName);
        };

        window.openLanding = function() {
            const landing = document.getElementById('landing-screen');
            if (landing) {
                landing.scrollTop = 0;
                landing.style.display = 'flex';
                landing.style.opacity = '0';
                landing.classList.remove('fade-out');
                requestAnimationFrame(() => { landing.style.opacity = '1'; });
            }
            // Hide all floating export docks when returning to the landing screen
            document.querySelectorAll('.export-dock').forEach(d => { d.style.display = 'none'; });
            // Sync bottom glass nav to home
            if (typeof window.setBottomNavActive === 'function') window.setBottomNavActive('home');
            window.scrollTo(0, 0);
            // Refresh analytics dashboard
            if (typeof window.renderLandingAnalytics === 'function') window.renderLandingAnalytics();
        };

        // ==========================================================================
        // LANDING ANALYTICS DASHBOARD
        // ==========================================================================
        (function() {
            const CURRENCY_RATES = { EGP: 1, SAR: 8.5, AED: 8.8, USD: 50, EUR: 55, GBP: 63 };
            function toEGP(amount, currency) {
                return (parseFloat(amount) || 0) * (CURRENCY_RATES[currency] || 1);
            }
            function fmtNum(n) {
                if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
                if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
                return new Intl.NumberFormat('en-US').format(Math.round(n));
            }
            // Get last N months in YYYY-MM format
            function lastNMonths(n) {
                const months = [];
                const now = new Date();
                for (let i = n - 1; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    months.push(`${d.getFullYear()}-${m}`);
                }
                return months;
            }
            function monthLabel(ym) {
                const [y, m] = ym.split('-');
                return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
            }


            window.renderLandingAnalytics = function() {};

        }());

        window.switchMainModule = function(moduleName) {
            const invMod = document.getElementById('invoice-module');
            const quoMod = document.getElementById('quotation-module');
            const ctMod = document.getElementById('contract-module');
            const ecMod = document.getElementById('empcontract-module');
            const empMod = document.getElementById('employees-module');
            const acctMod = document.getElementById('accounting-module');
            const navInv = document.getElementById('nav-invoice');
            const navQuo = document.getElementById('nav-quotation');
            const navCt = document.getElementById('nav-contract');
            const navEc = document.getElementById('nav-empcontract');
            const navEmp = document.getElementById('nav-employees');
            const navAcct = document.getElementById('nav-accounting');

            [invMod, quoMod, ctMod, ecMod, empMod, acctMod].forEach(m => { if(m) m.style.display = 'none'; });
            [navInv, navQuo, navCt, navEc, navEmp, navAcct].forEach(b => { if(b) b.classList.remove('active'); });
            // Hide all floating export docks; each module block below will show the correct one
            document.querySelectorAll('.export-dock').forEach(d => { d.style.display = 'none'; d.classList.remove('dock-hidden'); });

            if (moduleName === 'invoice') {
                if(invMod) invMod.style.display = 'flex';
                if(navInv) navInv.classList.add('active');
                // Show invoice dock only when the editor tab is active
                const invDock = document.getElementById('inv-export-section');
                if (invDock && invMod) {
                    const editorActive = invMod.querySelector('.ui-nav-pill[data-inv-tab="editor"].active');
                    if (editorActive) invDock.style.display = 'flex';
                }
                setTimeout(() => {
                    if (typeof window.updateAllocations === 'function') window.updateAllocations();
                    if (typeof window.adjustLayout === 'function') window.adjustLayout();
                }, 50);
                // Fetch fresh invoice data in background and re-render when ready
                cloudDB.getAll('invoices').then(() => {
                    if (typeof window.updateAllocations === 'function') window.updateAllocations();
                    const histTab = invMod && invMod.querySelector('.ui-nav-pill[data-inv-tab="history"].active');
                    if (histTab && typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                });
            } else if (moduleName === 'quotation') {
                if(quoMod) quoMod.style.display = 'flex';
                if(navQuo) navQuo.classList.add('active');
                // Show quotation dock only when the editor tab is active
                const quoDock = document.getElementById('export-section');
                if (quoDock && quoMod) {
                    const editorActive = quoMod.querySelector('.ui-nav-pill[data-tab="editor"].active');
                    if (editorActive) quoDock.style.display = 'flex';
                }
                setTimeout(() => { if (typeof window.adjustLayout === 'function') window.adjustLayout(); }, 50);
                // Fetch fresh quotation data in background and re-render when ready
                cloudDB.getAll('quotations').then(() => {
                    const histTab = quoMod && quoMod.querySelector('.ui-nav-pill[data-tab="history"].active');
                    if (histTab && typeof window.renderHistoryList === 'function') window.renderHistoryList();
                });
            } else if (moduleName === 'contract') {
                if(ctMod) ctMod.style.display = 'flex';
                if(navCt) navCt.classList.add('active');
                // Show contract dock only when the editor tab is active
                const ctDock = document.getElementById('ct-export-section');
                if (ctDock && ctMod) {
                    const editorActive = ctMod.querySelector('.ui-nav-pill[data-ctab="editor"].active');
                    if (editorActive) ctDock.style.display = 'flex';
                }
                setTimeout(() => {
                    if (typeof window.renderContractPreview === 'function') window.renderContractPreview();
                    if (typeof window.adjustLayout === 'function') window.adjustLayout();
                }, 80);
                // Fetch fresh client contract data in background and re-render when ready
                cloudDB.getAll('clientContracts').then(() => {
                    const histTab = ctMod && ctMod.querySelector('.ui-nav-pill[data-ctab="history"].active');
                    if (histTab && typeof window.renderCtHistoryList === 'function') window.renderCtHistoryList();
                });
            } else if (moduleName === 'empcontract') {
                if(ecMod) ecMod.style.display = 'flex';
                if(navEc) navEc.classList.add('active');
                // Show employee contract dock only when the editor tab is active
                const ecDock = document.getElementById('ec-export-section');
                if (ecDock && ecMod) {
                    const editorActive = ecMod.querySelector('.ui-nav-pill[data-ectab="editor"].active');
                    if (editorActive) ecDock.style.display = 'flex';
                }
                setTimeout(() => {
                    if (typeof window.renderEmpContractPreview === 'function') window.renderEmpContractPreview();
                    if (typeof window.adjustLayout === 'function') window.adjustLayout();
                }, 80);
                // Fetch fresh HR contract data in background and re-render when ready
                cloudDB.getAll('hrContracts').then(() => {
                    const histTab = ecMod && ecMod.querySelector('.ui-nav-pill[data-ectab="history"].active');
                    if (histTab && typeof window.renderEcHistoryList === 'function') window.renderEcHistoryList();
                });
            } else if (moduleName === 'employees') {
                if(empMod) empMod.style.display = 'flex';
                if(navEmp) navEmp.classList.add('active');
                // Render immediately with cached data (may be empty on first load — each render
                // function handles the empty state gracefully with a placeholder message).
                if (typeof window.refreshEmployeesModule === 'function') window.refreshEmployeesModule();
                if (typeof window.switchEmpTab === 'function') window.switchEmpTab('list');
                // Fetch fresh data in background and re-render when ready
                Promise.all([cloudDB.getAll('employees'), cloudDB.getAll('salaryHistory')]).then(() => {
                    if (typeof window.refreshEmployeesModule === 'function') window.refreshEmployeesModule();
                });
            } else if (moduleName === 'accounting') {
                if(acctMod) acctMod.style.display = 'flex';
                if(navAcct) navAcct.classList.add('active');
                const acctDock = document.getElementById('acct-export-section');
                if (acctDock) acctDock.style.display = 'flex';
                // Render immediately with cached data (may be empty on first load — render
                // functions handle the empty state gracefully with a placeholder message).
                // refreshAccountingModule renders all tabs directly, so no switchAcctTab is needed.
                if (typeof window.refreshAccountingModule === 'function') window.refreshAccountingModule();
                // Fetch fresh data in background and re-render when ready
                Promise.all([cloudDB.getAll('acctLedger'), cloudDB.getAll('acctExpenses')]).then(() => {
                    if (typeof window.refreshAccountingModule === 'function') window.refreshAccountingModule();
                });
            }

            // Sync mobile nav active states
            ['invoice','quotation','contract','empcontract','employees','accounting'].forEach(function(m) {
                const mBtn = document.getElementById('mnav-' + m);
                if (mBtn) mBtn.classList.toggle('active', m === moduleName);
            });
            // Sync bottom glass nav
            if (typeof window.setBottomNavActive === 'function') window.setBottomNavActive(moduleName);
            window.scrollTo(0, 0);
        };

        // ── Mobile hamburger menu ──
        window.toggleMobileMenu = function() {
            const dropdown = document.getElementById('mobile-nav-dropdown');
            const btn = document.getElementById('mobile-menu-btn');
            if (!dropdown || !btn) return;
            const isOpen = dropdown.classList.contains('open');
            if (isOpen) {
                dropdown.classList.remove('open');
                btn.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
                btn.setAttribute('aria-label', 'Open menu');
            } else {
                dropdown.classList.add('open');
                btn.classList.add('open');
                btn.setAttribute('aria-expanded', 'true');
                btn.setAttribute('aria-label', 'Close menu');
            }
        };

        window.closeMobileMenu = function() {
            const dropdown = document.getElementById('mobile-nav-dropdown');
            const btn = document.getElementById('mobile-menu-btn');
            if (dropdown) dropdown.classList.remove('open');
            if (btn) {
                btn.classList.remove('open');
                btn.setAttribute('aria-expanded', 'false');
                btn.setAttribute('aria-label', 'Open menu');
            }
        };

        // Close mobile menu when clicking outside — elements cached once after DOM ready
        (function() {
            var _dropdown = null, _btn = null;
            function getEls() {
                if (!_dropdown) _dropdown = document.getElementById('mobile-nav-dropdown');
                if (!_btn)      _btn      = document.getElementById('mobile-menu-btn');
            }
            document.addEventListener('click', function(e) {
                getEls();
                if (_dropdown && _dropdown.classList.contains('open')) {
                    if (!_dropdown.contains(e.target) && e.target !== _btn && !(_btn && _btn.contains(e.target))) {
                        window.closeMobileMenu();
                    }
                }
            });
        }());

        // ── Theme: always light mode ──────────────────────────────────────────────

        // ── Bottom Glass Nav ─────────────────────────────────────────────────────
        window.setBottomNavActive = function(moduleName) {
            // moduleName: 'home' | 'invoice' | 'quotation' | 'contract' | 'empcontract' | 'employees' | 'accounting'
            const items = ['home', 'invoice', 'quotation', 'employees', 'more'];
            items.forEach(function(id) {
                const btn = document.getElementById('bnav-' + id);
                if (btn) btn.classList.remove('active');
            });
            // Also clear more-menu active items
            ['bmore-contract', 'bmore-empcontract', 'bmore-accounting'].forEach(function(id) {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('active');
            });

            if (moduleName === 'home') {
                const homeBtn = document.getElementById('bnav-home');
                if (homeBtn) homeBtn.classList.add('active');
            } else if (moduleName === 'invoice') {
                const btn = document.getElementById('bnav-invoice');
                if (btn) btn.classList.add('active');
            } else if (moduleName === 'quotation') {
                const btn = document.getElementById('bnav-quotation');
                if (btn) btn.classList.add('active');
            } else if (moduleName === 'employees') {
                const btn = document.getElementById('bnav-employees');
                if (btn) btn.classList.add('active');
            } else if (moduleName === 'contract' || moduleName === 'empcontract' || moduleName === 'accounting') {
                const moreBtn = document.getElementById('bnav-more');
                if (moreBtn) moreBtn.classList.add('active');
                const subBtn = document.getElementById('bmore-' + moduleName);
                if (subBtn) subBtn.classList.add('active');
            }
        };

        window.toggleBottomMore = function(e) {
            if (e) e.stopPropagation();
            const popup = document.getElementById('bottom-more-popup');
            const btn = document.getElementById('bnav-more');
            if (!popup) return;
            const isOpen = popup.classList.contains('open');
            if (isOpen) {
                popup.classList.remove('open');
                if (btn) btn.setAttribute('aria-expanded', 'false');
            } else {
                popup.classList.add('open');
                if (btn) btn.setAttribute('aria-expanded', 'true');
            }
        };

        window.closeBottomMore = function() {
            const popup = document.getElementById('bottom-more-popup');
            const btn = document.getElementById('bnav-more');
            if (popup) popup.classList.remove('open');
            if (btn) btn.setAttribute('aria-expanded', 'false');
        };

        // Close bottom more popup when clicking outside
        document.addEventListener('click', function(e) {
            const popup = document.getElementById('bottom-more-popup');
            const btn = document.getElementById('bnav-more');
            if (popup && popup.classList.contains('open')) {
                if (!popup.contains(e.target) && e.target !== btn && !(btn && btn.contains(e.target))) {
                    window.closeBottomMore();
                }
            }
        });

        window.switchTab = function(tabId) {
            const mod = document.getElementById('quotation-module');
            mod.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            mod.querySelectorAll('.ui-sub-tabs .ui-nav-pill').forEach(b => b.classList.remove('active'));
            
            const targetTabContent = document.getElementById(`tab-${tabId}`);
            if (targetTabContent) targetTabContent.classList.add('active');
            
            const newActiveBtn = mod.querySelector(`.ui-sub-tabs .ui-nav-pill[data-tab="${tabId}"]`);
            if (newActiveBtn) newActiveBtn.classList.add('active');

            if(tabId === 'history' && typeof window.renderHistoryList === 'function') window.renderHistoryList();
            window.updateExportVisibility(tabId);
        };
        
        window.switchInvTab = function(tabId) {
            const mod = document.getElementById('invoice-module');
            mod.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            mod.querySelectorAll('.ui-sub-tabs .ui-nav-pill').forEach(b => b.classList.remove('active'));
            
            const targetTabContent = document.getElementById(`inv-tab-${tabId}`);
            if (targetTabContent) targetTabContent.classList.add('active');
            
            const newActiveBtn = mod.querySelector(`.ui-sub-tabs .ui-nav-pill[data-inv-tab="${tabId}"]`);
            if (newActiveBtn) newActiveBtn.classList.add('active');

            if(tabId === 'history' && typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
            
            const exportSection = document.getElementById('inv-export-section');
            if(exportSection) {
                exportSection.style.display = (tabId === 'editor') ? 'flex' : 'none';
                if (tabId === 'editor') exportSection.classList.remove('dock-hidden');
            }
        };

        window.updateExportVisibility = function(tabId = 'editor') {
            const exportSection = document.getElementById('export-section');
            if(exportSection) {
                exportSection.style.display = (tabId === 'editor') ? 'flex' : 'none';
                if (tabId === 'editor') exportSection.classList.remove('dock-hidden');
            }
        };

        window.adjustLayout = function() {
            window.adjustScreenScale();
        };

        window.adjustScreenScale = function() {
            const isMobile = window.innerWidth < 1024;
            const containers = document.querySelectorAll('.app-preview');
            containers.forEach(container => {
                if (container.offsetWidth === 0) return;

                // Use computed padding to correctly derive available content width
                // regardless of rem/font-size or future CSS changes
                const cs = window.getComputedStyle(container);
                const availableWidth = container.clientWidth
                    - parseFloat(cs.paddingLeft || 0)
                    - parseFloat(cs.paddingRight || 0);
                const scale = Math.min(availableWidth / 794, 1);

                // Apply transform + collapse vertical layout gap for every a4-page in this preview panel
                // (extra-preview-page pages also carry the a4-page class, so one selector covers all)
                container.querySelectorAll('.a4-page').forEach(function(page) {
                    if (scale < 1) {
                        page.style.transform = `scale(${scale})`;
                        page.style.transformOrigin = 'top center';
                        // Collapse the vertical whitespace left by scaling so pages don't float apart
                        const heightDiff = page.offsetHeight * (1 - scale);
                        page.style.marginBottom = `-${heightDiff}px`;
                    } else {
                        page.style.transform = '';
                        page.style.marginBottom = '';
                    }
                });

                // On mobile ensure the container height stays auto (CSS overflow-x:hidden is already set)
                if (isMobile) {
                    container.style.height = 'auto';
                    container.style.minHeight = '0';
                }
            });
        };

        window.fitContentToA4 = function(containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const wrapper = container.querySelector('.scale-wrapper');
            if (!wrapper) return;

            // إيقاف الضغط الرأسي والسماح للمحتوى بالتمدد لصفحات متعددة بشكل طبيعي
            wrapper.style.transform = 'scale(1)';
            wrapper.style.width = '100%';
            wrapper.style.marginBottom = '0px';
            wrapper.style.transformOrigin = 'top left';
        };

        // ==========================================================================
        // 4. STORAGE / DB (Firebase Firestore-backed with in-memory fallback)
        // ==========================================================================

        // ── Firebase client init ──────────────────────────────────────────────────
        const _fbConfig = (typeof window !== 'undefined' && window.FIREBASE_CONFIG) || {};
        let _db            = null;
        let _storage       = null;
        let _firebaseReady = false;
        let _appReady      = false; // set to true once DOMContentLoaded finishes

        const _hasPlaceholder = v => !v || /^YOUR_[A-Z_]+_HERE$/.test(String(v));
        if (!_hasPlaceholder(_fbConfig.apiKey) && !_hasPlaceholder(_fbConfig.projectId)) {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(_fbConfig);
                }
                _db            = firebase.firestore();
                _storage       = firebase.storage();
                _firebaseReady = true;
                console.log('[OPENY] ✅ Firebase client initialised:', _fbConfig.projectId);
            } catch (e) {
                console.error('[OPENY] ❌ Firebase init error — check firebase-config.js:', e.message);
            }
        } else {
            console.warn('[OPENY] ⚠️  Firebase not configured — running in-memory only. Data will be lost on page refresh.');
            console.info('[OPENY] Open firebase-config.js and replace the placeholder values with your Firebase project credentials.');
        }

        // Async connection test — runs once after init to verify Firestore is reachable
        if (_firebaseReady) {
            (async () => {
                try {
                    await _db.collection('invoices').limit(1).get();
                    console.log('[OPENY] ✅ Firebase connection test passed — Firestore accessible');
                } catch (e) {
                    console.error('[OPENY] ❌ Firebase connection test failed:', e.message);
                }
            })();
        }

        // camelCase store names → Firestore collection names
        const STORE_TO_TABLE = {
            quotations:             'quotations',
            invoices:               'invoices',
            clientContracts:        'client_contracts',
            hrContracts:            'hr_contracts',
            employees:              'employees',
            salaryHistory:          'salary_history',
            activityLogs:           'activity_logs',
            acctLedger:             'acct_ledger',
            acctExpenses:           'acct_expenses',
            acctClientCollections:  'acct_client_collections',
            acctEgyptCollections:   'acct_egypt_collections',
            acctCaptainCollections: 'acct_captain_collections',
        };

        // ── In-memory cache (primary store when Firebase is offline / unconfigured) ─
        const localStore = {
            _cache: {},
            getAll(storeName) {
                return this._cache[storeName] || [];
            },
            put(record, storeName) {
                if (!this._cache[storeName]) this._cache[storeName] = [];
                const records = this._cache[storeName];
                const idx = records.findIndex(r => r.id === record.id);
                if (idx > -1) records[idx] = record; else records.push(record);
            },
            delete(id, storeName) {
                if (!this._cache[storeName]) return;
                this._cache[storeName] = this._cache[storeName].filter(r => r.id !== id);
            },
            clear(storeName) {
                this._cache[storeName] = [];
            },
            invalidate(storeName) {
                this._cache[storeName] = null;
            }
        };

        // All known store names – extend here when adding new document types
        const ALL_STORES = ['quotations', 'invoices', 'clientContracts', 'hrContracts', 'employees', 'salaryHistory', 'activityLogs', 'acctLedger', 'acctExpenses',
            // Legacy stores kept for backward compatibility (data migration safety); no longer used as data-entry points
            'acctClientCollections', 'acctEgyptCollections', 'acctCaptainCollections'];

        // ── cloudDB: Firebase Firestore-backed operations with in-memory fallback ─
        const cloudDB = {
            _collection(storeName) {
                return STORE_TO_TABLE[storeName] || storeName;
            },
            // Fetch all records – tries Supabase first (for invoices / activityLogs),
            // then Firestore, then falls back to the local in-memory cache.
            async getAll(storeName = 'history') {
                // ── Supabase path (invoices and activityLogs) ──────────────────
                if (window.supabaseDB && window.supabaseDB.ready) {
                    if (storeName === 'invoices') {
                        const records = await window.supabaseDB.getInvoices();
                        localStore._cache[storeName] = records;
                        return records;
                    }
                    if (storeName === 'activityLogs') {
                        const records = await window.supabaseDB.getInvoiceHistory();
                        localStore._cache[storeName] = records;
                        return records;
                    }
                }
                // ── Firebase path ──────────────────────────────────────────────
                if (_firebaseReady) {
                    try {
                        const snapshot = await _db.collection(this._collection(storeName)).get();
                        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        localStore._cache[storeName] = records;
                        console.log(`[OPENY] Firestore getAll(${storeName}) — ${records.length} record(s)`);
                        return records;
                    } catch (e) {
                        console.error(`[OPENY] Firestore getAll(${storeName}) failed, using local cache:`, e.message);
                    }
                }
                const cached = localStore.getAll(storeName);
                console.log(`[OPENY] localStore getAll(${storeName}) — ${cached.length} record(s) (no cloud backend configured or the request failed)`);
                return cached;
            },
            // Upsert a record – writes to Supabase (for invoices / activityLogs) when ready,
            // otherwise syncs to Firestore; always updates the local in-memory cache.
            async put(record, storeName = 'history') {
                localStore.put(record, storeName);
                // ── Supabase path ──────────────────────────────────────────────
                if (window.supabaseDB && window.supabaseDB.ready) {
                    if (storeName === 'invoices') {
                        try { await window.supabaseDB.saveInvoice(record); } catch (e) { console.error('[OPENY] Supabase put(invoices) failed:', e.message); }
                        return;
                    }
                    if (storeName === 'activityLogs') {
                        try {
                            await window.supabaseDB.logHistory(record.record_id || record.id, record.title || record.id);
                        } catch (e) { console.error('[OPENY] Supabase put(activityLogs) failed:', e.message); }
                        return;
                    }
                }
                // ── Firebase path ──────────────────────────────────────────────
                if (_firebaseReady) {
                    try {
                        await _db.collection(this._collection(storeName)).doc(record.id).set(record);
                        console.log(`[OPENY] Firestore put(${storeName}) success — id:`, record.id);
                    } catch (e) {
                        console.error(`[OPENY] Firestore put(${storeName}) failed:`, e.message);
                    }
                } else {
                    console.log(`[OPENY] localStore put(${storeName}) — id:`, record.id, '(Firebase not configured)');
                }
            },
            // Hard-delete a record by id
            async delete(id, storeName = 'history') {
                localStore.delete(id, storeName);
                if (_firebaseReady) {
                    try {
                        await _db.collection(this._collection(storeName)).doc(id).delete();
                    } catch (e) {
                        console.error(`[OPENY] Firestore delete(${storeName}) failed:`, e.message);
                    }
                }
            },
            // Remove all records from a store
            async clear(storeName = 'history') {
                localStore.clear(storeName);
                if (_firebaseReady) {
                    try {
                        const snapshot = await _db.collection(this._collection(storeName)).get();
                        const docs = snapshot.docs;
                        // Firestore batch limit is 500 operations — process in chunks
                        for (let i = 0; i < docs.length; i += 500) {
                            const batch = _db.batch();
                            docs.slice(i, i + 500).forEach(doc => batch.delete(doc.ref));
                            await batch.commit();
                        }
                    } catch (e) {
                        console.error(`[OPENY] Firestore clear(${storeName}) failed:`, e.message);
                    }
                }
            }
        };

        // ── Firestore Realtime — sync UI across all devices without manual refresh ─
        if (_firebaseReady) {
            // Debounce helper to avoid redundant back-to-back refreshes
            function _debounce(fn, ms) {
                let t;
                return function() { clearTimeout(t); t = setTimeout(fn, ms); };
            }
            const _refreshAccounting = _debounce(() => { if (typeof window.refreshAccountingModule === 'function') window.refreshAccountingModule(); }, 150);

            const _realtimeMap = [
                { collection: 'invoices',         store: 'invoices',        refresh: () => { if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList(); if (typeof window.updateAllocations === 'function') window.updateAllocations(); } },
                { collection: 'quotations',       store: 'quotations',      refresh: () => { if (typeof window.renderHistoryList === 'function') window.renderHistoryList(); } },
                { collection: 'client_contracts', store: 'clientContracts', refresh: () => { if (typeof window.renderCtHistoryList === 'function') window.renderCtHistoryList(); } },
                { collection: 'hr_contracts',     store: 'hrContracts',     refresh: () => { if (typeof window.renderEcHistoryList === 'function') window.renderEcHistoryList(); } },
                { collection: 'employees',        store: 'employees',       refresh: () => { if (typeof window.refreshEmployeesModule === 'function') window.refreshEmployeesModule(); } },
                { collection: 'acct_ledger',      store: 'acctLedger',      refresh: _refreshAccounting },
                { collection: 'acct_expenses',    store: 'acctExpenses',    refresh: _refreshAccounting },
            ];
            _realtimeMap.forEach(({ collection, store, refresh }) => {
                _db.collection(collection).onSnapshot(
                    (snapshot) => {
                        // Keep local cache in sync with the live Firestore data
                        localStore._cache[store] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        // Skip refresh until the app is fully initialized to avoid
                        // accessing DOM elements before DOMContentLoaded completes
                        if (_appReady) refresh();
                    },
                    (err) => {
                        console.warn(`[OPENY] Firestore onSnapshot(${collection}) error:`, err.message);
                    }
                );
            });
            console.log('[OPENY] ✅ Firestore realtime listeners active');
        }

        async function uploadExportToStorage(blob, storeName, filename) {
            if (!_firebaseReady) return null;
            try {
                const uid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
                const path = `exports/${storeName}/${Date.now()}-${uid}-${filename}`;
                const ref = _storage.ref(path);
                await ref.put(blob, { contentType: blob.type || 'application/octet-stream' });
                const url = await ref.getDownloadURL();
                console.log('[OPENY] File uploaded to Firebase Storage:', url);
                return url;
            } catch (e) {
                console.warn('[OPENY] uploadExportToStorage failed (non-critical):', e.message);
                return null;
            }
        }

        // Log an activity entry to Firestore (activity_logs collection)
        async function logActivity(action, moduleName, recordId, details) {
            try {
                const entry = {
                    id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                    module_name: moduleName,
                    record_id: recordId,
                    action_type: action,
                    title: (details && (details.ref || details.client)) || recordId || '',
                    details: details || {},
                    created_at: new Date().toISOString()
                };
                await cloudDB.put(entry, 'activityLogs');
            } catch (e) {
                console.warn('[OPENY] logActivity failed:', e.message);
            }
        }
        let isAppBooting = true; // Flag to prevent heavy preview renders on initial load

        // Always scroll to top on page load, refresh, or back/forward navigation
        window.addEventListener('load', function() { window.scrollTo(0, 0); });
        window.addEventListener('pageshow', function(e) {
            // Double rAF ensures we run after the browser's own scroll restoration,
            // including when the page is restored from the back/forward cache (persisted).
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    window.scrollTo(0, 0);
                    const landing = document.getElementById('landing-screen');
                    if (landing) landing.scrollTop = 0;
                });
            });
        });

        document.addEventListener("DOMContentLoaded", () => {
            window.scrollTo(0, 0);
            try {
                // Don't auto-switch to invoice — landing screen handles initial module selection
                // but still initialize the invoice module in background so it's ready
                
                // Set native month inputs to current month
                const todayMonth = new Date().toISOString().slice(0, 7);
                const cmEl = document.getElementById('campaignMonth');
                const idEl = document.getElementById('invoiceDate');
                if (cmEl && !cmEl.value) cmEl.value = todayMonth;
                if (idEl && !idEl.value) idEl.value = todayMonth;

                // Set default form values
                document.getElementById('in-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('in-currency').value = 'EGP';
                document.getElementById('in-final-price').value = appState.finalPrice;
                // Placeholder — initQuoteNumber() below will derive the real next number from history
                document.getElementById('in-quote-num').value = `Q-${new Date().getFullYear()}-…`;

                const methodSelect = document.getElementById('in-terms-method-select');
                if (methodSelect) { methodSelect.value = 'Cash'; }
                appState['terms-method'] = 'Cash';

                const container = document.getElementById('services-container');
                if(container) {
                    container.innerHTML = '';
                    if (appState.services.length === 0) {
                         const id = Date.now().toString() + Math.floor(Math.random() * 100);
                         appState.services.push({id: id, name: "Performance Campaign Setup", scope: "Architecture and setup of conversion tracking."});
                    }
                    appState.services.forEach(s => {
                        if(typeof window.renderServiceInputRow === 'function') window.renderServiceInputRow(s.id, s.name, s.scope);
                    });
                }
                
                if(invCustomServices.length === 0){
                    const id = 'inv-' + Date.now().toString() + Math.floor(Math.random() * 100);
                    invCustomServices.push({id: id, name: "Performance Campaign Setup", scope: "Architecture and setup of conversion tracking."});
                    const invContainer = document.getElementById('inv-services-container');
                    if (invContainer) {
                         invContainer.innerHTML = '';
                         invCustomServices.forEach(s => {
                             if(typeof window.renderInvServiceRow === 'function') window.renderInvServiceRow(s.id, s.name, s.scope);
                         });
                    }
                }

                if(typeof window.updateExportVisibility === 'function') window.updateExportVisibility();

                // Signal app ready immediately so URL-based navigation fires without delay
                isAppBooting = false;
                window._openyReady = true;

                // Defer heavy initialization to the next event loop tick so the browser can
                // paint the initial UI (and URL routing can fire) before blocking work starts.
                setTimeout(async () => { 
                    await Promise.all([initInvoiceNumber(), initQuoteNumber()]);
                    if(typeof window.updateAllocations === 'function') window.updateAllocations(); 
                    if(typeof window.saveAndRender === 'function') window.saveAndRender(); 
                    if(typeof window.adjustLayout === 'function') window.adjustLayout();
                    window.scrollTo(0, 0);
                }, 0);

            } catch(e) { console.error("Initialization error", e); }

            // Initialize Contract Modules (separate try/catch to be resilient to other errors)
            try { if (typeof initContractModules === 'function') initContractModules(); } catch(e) { console.error("Contract module init error", e); }

            // Signal Firestore realtime listeners that the app is ready to handle refreshes
            _appReady = true;
        });

        // ==========================================================================
        // 6. INVOICE SYSTEM LOGIC
        // ==========================================================================
        window.addInvService = function(name = '', scope = '') {
            const id = 'inv-' + Date.now().toString() + Math.floor(Math.random() * 100);
            if(typeof window.renderInvServiceRow === 'function') window.renderInvServiceRow(id, name, scope);
            if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv();
        };

        window.removeInvService = function(id) {
            const row = document.getElementById(`inv-srv-wrapper-${id}`);
            if(row) row.remove();
            if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv();
        };

        window.renderInvServiceRow = function(id, name, scope) {
            const container = document.getElementById('inv-services-container');
            const div = document.createElement('div');
            div.className = 'inv-srv-row ui-inner-box !p-4 !mb-3';
            div.id = `inv-srv-wrapper-${id}`;
            div.dataset.id = id;

            div.innerHTML = `
                <div class="ui-form-group mb-3">
                    <input type="text" id="inv-srv-name-${id}" class="ui-input" placeholder="Service Name" value="${name}" oninput="if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv()">
                </div>
                <div class="ui-form-group mb-0 relative">
                    <div class="flex justify-between items-center mb-2 px-1">
                        <span class="text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">Scope of Work</span>
                    </div>
                    <textarea id="inv-srv-scope-${id}" class="ui-input text-sm leading-relaxed resize-y" rows="3" placeholder="Scope description..." oninput="if(typeof window.debouncedSaveAndRenderInv === 'function') window.debouncedSaveAndRenderInv()">${scope}</textarea>
                </div>
                <button onclick="if(typeof window.removeInvService === 'function') window.removeInvService('${id}')" class="ui-button ui-button-danger w-full mt-3 !py-2 !text-xs" type="button" title="Delete Deliverable">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Delete Deliverable
                </button>
            `;
            container.appendChild(div);
        };

        window.saveAndRenderInv = function() {
            invCustomServices = [];
            document.querySelectorAll('.inv-srv-row').forEach(row => {
                const id = row.dataset.id;
                const name = document.getElementById(`inv-srv-name-${id}`).value;
                const scope = document.getElementById(`inv-srv-scope-${id}`).value;
                invCustomServices.push({ id, name, scope });
            });
            const countEl = document.getElementById('inv-ui-items-count');
            if(countEl) countEl.innerText = invCustomServices.length;
            const emptyEl = document.getElementById('inv-empty-services');
            if(emptyEl) emptyEl.style.display = invCustomServices.length === 0 ? 'block' : 'none';
            if(typeof window.updateAllocations === 'function') window.updateAllocations(); 
        };

        window.toggleDetailedOptions = function() {
            const clientEl = document.getElementById('clientName');
            const platformsSection = document.getElementById('platformsSection');
            const customSection = document.getElementById('customClientSection');
            if (clientEl) {
                const val = clientEl.value;
                if (platformsSection) platformsSection.style.display = (val === 'Pro icon KSA') ? 'block' : 'none';
                if (customSection) customSection.style.display = (val === 'custom') ? 'block' : 'none';
            }
            if(typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
        };

        window.togglePlatform = function(toggledId) {
            const toggleEl = document.getElementById(`plat${toggledId}`);
            if (!toggleEl) return;
            const isEnabled = toggleEl.checked;

            // Cache all platform element states upfront to avoid repeated DOM queries inside loops
            const platChecked = {};
            const percValues = {};
            PLATFORMS_LIST.forEach(id => {
                platChecked[id] = document.getElementById(`plat${id}`)?.checked || false;
                percValues[id] = parseInt(document.getElementById(`percNum-${id}`)?.value || 0) || 0;
            });

            const enabledPlats = PLATFORMS_LIST.filter(id => platChecked[id]);
            const setPerc = (id, val) => {
                const slider = document.getElementById(`percSlider-${id}`);
                const num = document.getElementById(`percNum-${id}`);
                const lbl = document.getElementById(`percLabel-${id}`);
                if (slider) slider.value = val;
                if (num) num.value = val;
                if (lbl) lbl.innerText = `${val}%`;
            };

            if (enabledPlats.length === 0) PLATFORMS_LIST.forEach(id => setPerc(id, 0));
            else if (enabledPlats.length === 1) setPerc(enabledPlats[0], 100);
            else {
                if (isEnabled) {
                    let newShare = Math.floor(100 / enabledPlats.length);
                    let others = enabledPlats.filter(id => id !== toggledId);
                    setPerc(toggledId, newShare);
                    let remaining = 100 - newShare;
                    let othersTotal = others.reduce((sum, id) => sum + percValues[id], 0);
                    others.forEach((id, index) => {
                        let share = (index === others.length - 1) ? remaining : (othersTotal === 0 ? Math.floor((100 - newShare) / others.length) : Math.round((percValues[id] / othersTotal) * (100 - newShare)));
                        setPerc(id, share);
                        remaining -= share;
                    });
                } else {
                    let others = enabledPlats;
                    let othersTotal = others.reduce((sum, id) => sum + percValues[id], 0);
                    let remaining = 100;
                    others.forEach((id, index) => {
                        let share = (index === others.length - 1) ? remaining : (othersTotal === 0 ? Math.floor(100 / others.length) : Math.round((percValues[id] / othersTotal) * 100));
                        setPerc(id, share);
                        remaining -= share;
                    });
                }
            }
            // Reuse the cached platChecked map instead of re-querying the DOM
            PLATFORMS_LIST.forEach(id => { if (!platChecked[id]) setPerc(id, 0); });
            if(typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
        };

        window.syncPerc = function(changedId, newValue) {
            let val = parseInt(newValue) || 0;
            if (val < 0) val = 0;
            if (val > 100) val = 100;

            // Cache all platform element states upfront to avoid repeated DOM queries inside loops
            const platChecked = {};
            const percValues = {};
            PLATFORMS_LIST.forEach(id => {
                platChecked[id] = document.getElementById(`plat${id}`)?.checked || false;
                percValues[id] = parseInt(document.getElementById(`percNum-${id}`)?.value || 0) || 0;
            });

            const enabledPlats = PLATFORMS_LIST.filter(id => platChecked[id]);
            const setPerc = (id, val) => {
                const slider = document.getElementById(`percSlider-${id}`);
                const num = document.getElementById(`percNum-${id}`);
                const lbl = document.getElementById(`percLabel-${id}`);
                if (slider) slider.value = val;
                if (num) num.value = val;
                if (lbl) lbl.innerText = `${val}%`;
            };

            if (!enabledPlats.includes(changedId)) return setPerc(changedId, 0);
            if (enabledPlats.length === 1) { setPerc(changedId, 100); return window.debouncedUpdateAllocations(); }

            const others = enabledPlats.filter(id => id !== changedId);
            let currentOthersTotal = others.reduce((sum, id) => sum + percValues[id], 0);
            let newOthersTotal = 100 - val;
            setPerc(changedId, val);
            let remaining = newOthersTotal;

            others.forEach((id, index) => {
                let share = (index === others.length - 1) ? remaining : (currentOthersTotal === 0 ? Math.round(newOthersTotal / others.length) : Math.round((percValues[id] / currentOthersTotal) * newOthersTotal));
                setPerc(id, share);
                remaining -= share;
            });
            if(typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
        };

        window.splitBudget = function(total, parts) {
            if (parts <= 0) return [];
            if (parts === 1) return [total];
            let splits = [], remaining = total;
            for (let i = 0; i < parts - 1; i++) {
                let avg = remaining / (parts - i);
                let variance = avg * (Math.random() * 0.05 + 0.05) * (Math.random() > 0.5 ? 1 : -1);
                let current = Math.round(avg + variance);
                splits.push(current);
                remaining -= current;
            }
            splits.push(remaining);
            return splits.sort((a,b) => b-a);
        };

        // --- Performance Optimization: Debounce Render ---
        const isMobile = window.innerWidth < 768;
        const debounceDelay = isMobile ? 800 : 300; 

        let renderTimeout;
        window.debouncedSaveAndRender = function() {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => { if(typeof window.saveAndRender === 'function') window.saveAndRender(); }, debounceDelay); 
        };
        
        window.debouncedSaveAndRenderInv = function() {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => { if(typeof window.saveAndRenderInv === 'function') window.saveAndRenderInv(); }, debounceDelay); 
        };
        
        window.debouncedUpdateAllocations = function() {
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => { if(typeof window.updateAllocations === 'function') window.updateAllocations(); }, debounceDelay); 
        };

        window.updateAllocations = function() {
            if (isAppBooting) return; // Prevent heavy calc on mobile load
            
            const tbEl = document.getElementById('totalBudget');
            if (!tbEl) return;
            const totalBudget = parseFloat(tbEl.value) || 0;
            const currency = document.getElementById('currency')?.value || 'EGP';
            const netBudget = Math.max(0, totalBudget - 500); 
            const clientVal = document.getElementById('clientName')?.value || '';
            const summaryText = document.getElementById('allocationTotalText');
            const summaryCard = document.getElementById('allocationSummaryCard');
            const errText = document.getElementById('allocationError');
            const btnExcel = document.getElementById('invBtnExcel');
            const btnPDF = document.getElementById('invBtnPDF');

            // ALWAYS build the preview skeleton even if there is an error, so the error message has a place to live
            const invoiceData = window.calculateInvoiceData();
            
            if (clientVal === 'custom') {
                if (errText) errText.classList.add('hidden');
                if (summaryCard) summaryCard.style.display = 'none';
                if (btnExcel) btnExcel.disabled = false;
                if (btnPDF) btnPDF.disabled = false;
                
                const invEditorTab = document.getElementById('inv-tab-editor');
                if(invEditorTab && invEditorTab.classList.contains('active')) {
                    if(typeof window.renderInvoicePreview === 'function') window.renderInvoicePreview(invoiceData, true);
                }
                return;
            } else {
                if (summaryCard) summaryCard.style.display = 'block';
            }

            const platforms = [{ id: 'IG', elem: 'platIG' }, { id: 'Snap', elem: 'platSnap' }, { id: 'TikTok', elem: 'platTikTok' }, { id: 'Google', elem: 'platGoogle' }, { id: 'Salla', elem: 'platSalla' }];
            let totalPerc = 0;
            
            platforms.forEach(p => {
                const platElem = document.getElementById(p.elem);
                const body = document.getElementById(`platBody-${p.id}`);
                const budgetDisplay = document.getElementById(`budgetDisplay-${p.id}`);
                const percNumElem = document.getElementById(`percNum-${p.id}`);
                if (!platElem || !body || !budgetDisplay) return;
                if (platElem.checked) {
                    body.classList.remove('hidden');
                    const perc = parseFloat(percNumElem?.value || 0) || 0;
                    totalPerc += perc;
                    budgetDisplay.innerText = `${(netBudget * (perc / 100)).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} ${currency}`;
                    budgetDisplay.classList.replace('text-slate-400', 'text-blue-600');
                } else {
                    body.classList.add('hidden');
                    budgetDisplay.innerText = `0 ${currency}`;
                    budgetDisplay.classList.replace('text-blue-600', 'text-slate-400');
                }
            });
            
            if (summaryText) summaryText.innerText = `${totalPerc}%`;
            
            const isAllocationValid = Math.round(totalPerc) === 100;
            
            if (isAllocationValid) {
                if (summaryCard) { summaryCard.classList.remove('border-[rgba(254,202,202,0.9)]', 'bg-[rgba(254,242,242,0.85)]'); summaryCard.classList.add('border-[rgba(134,239,172,0.8)]', 'bg-[rgba(240,253,244,0.75)]'); }
                if (summaryText) { summaryText.classList.remove('text-red-600'); summaryText.classList.add('text-green-700'); }
                if (errText) errText.classList.add('hidden');
                if (btnExcel) btnExcel.disabled = false;
                if (btnPDF) btnPDF.disabled = false;
            } else {
                if (summaryCard) { summaryCard.classList.remove('border-[rgba(134,239,172,0.8)]', 'bg-[rgba(240,253,244,0.75)]'); summaryCard.classList.add('border-[rgba(254,202,202,0.9)]', 'bg-[rgba(254,242,242,0.85)]'); }
                if (summaryText) { summaryText.classList.remove('text-green-700'); summaryText.classList.add('text-red-600'); }
                if (errText) {
                    errText.classList.remove('hidden');
                    let diff = 100 - totalPerc;
                    errText.innerText = diff > 0 ? `Please allocate the remaining ${diff}% to reach exactly 100%.` : `You have exceeded 100% by ${Math.abs(diff)}%. Please reduce allocations.`;
                }
                if (btnExcel) btnExcel.disabled = true;
                if (btnPDF) btnPDF.disabled = true;
            }
            
            const invEditorTab = document.getElementById('inv-tab-editor');
            if(invEditorTab && invEditorTab.classList.contains('active')) {
                if(typeof window.renderInvoicePreview === 'function') window.renderInvoicePreview(invoiceData, isAllocationValid, totalPerc);
            }
        };

        window.calculateInvoiceData = function() {
            const tbEl = document.getElementById('totalBudget');
            if (!tbEl) return null;
            const totalBudget = parseFloat(tbEl.value) || 0;
            const clientVal = document.getElementById('clientName')?.value || '';
            const month = formatMonthForDisplay(document.getElementById('campaignMonth')?.value) || 'N/A';
            const invoiceDate = formatMonthForDisplay(document.getElementById('invoiceDate')?.value) || 'N/A';
            const currency = document.getElementById('currency')?.value || 'EGP';
            const fees = 500;
            const netBudget = totalBudget - fees;

            if (clientVal === 'custom') {
                return {
                    client: document.getElementById('inv-custom-client-name').value || 'New Client',
                    month, invoiceDate, currency, totalBudget, fees, netBudget, type: 'custom',
                    project: document.getElementById('inv-custom-project').value || '',
                    desc: document.getElementById('inv-custom-desc').value || '',
                    services: invCustomServices
                };
            }

            let invoice = { client: clientVal, month, invoiceDate, currency, totalBudget, fees, netBudget, type: 'detailed', branches: [] };
            if (clientVal !== 'Pro icon KSA') {
                invoice.type = 'simple';
                return invoice;
            }

            const branches = ['Riyadh Branch', 'Jeddah Branch', 'Khobar Branch'];
            const branchBudgets = window.splitBudget(netBudget, 3);
            const platforms = [];
            
            const checkPlatform = (elemId, countId, percId, name, resType, costMin, costMax) => {
                if (document.getElementById(elemId)?.checked) {
                    platforms.push({
                        name,
                        count: parseInt(document.getElementById(countId)?.value || 1) || 1,
                        perc: parseFloat(document.getElementById(percId)?.value || 0) || 0,
                        resType, costMin, costMax
                    });
                }
            };

            checkPlatform('platIG', 'countIG', 'percNum-IG', 'Instagram', 'Messages', 20, 25);
            checkPlatform('platSnap', 'countSnap', 'percNum-Snap', 'Snapchat', 'Visits', 2, 4);
            checkPlatform('platTikTok', 'countTikTok', 'percNum-TikTok', 'TikTok', 'Visits', 2, 4);
            checkPlatform('platGoogle', 'countGoogle', 'percNum-Google', 'Google Ads', 'Clicks', 2, 5);
            checkPlatform('platSalla', 'countSalla', 'percNum-Salla', 'Salla', 'Visits', 2, 4);

            if(platforms.length === 0) return invoice; 

            branches.forEach((branchName, bIdx) => {
                let branchBudget = branchBudgets[bIdx];
                let pAllocations = {};
                let allocated = 0;

                platforms.forEach((plat, i) => {
                    if (i === platforms.length - 1) { pAllocations[plat.name] = branchBudget - allocated; } 
                    else {
                        let amount = Math.round(branchBudget * (plat.perc / 100));
                        pAllocations[plat.name] = amount;
                        allocated += amount;
                    }
                });

                let branchData = { name: branchName, total: 0, items: [] };
                platforms.forEach((plat) => {
                    if (pAllocations[plat.name] <= 0) return;
                    const cBudgets = window.splitBudget(pAllocations[plat.name], plat.count);
                    let campaignDays = [];
                    if (plat.count === 1) campaignDays.push(1);
                    else {
                        let step = 14 / (plat.count - 1);
                        for(let i = 0; i < plat.count; i++) campaignDays.push(Math.max(1, Math.min(15, Math.round(1 + (i * step)) + (Math.floor(Math.random() * 3) - 1))));
                        campaignDays.sort((a, b) => a - b);
                    }

                    cBudgets.forEach((cBudget, cIdx) => {
                        let expectedCPA = plat.costMin + ((plat.count > 1 ? (cIdx / (plat.count - 1)) : 0) * (plat.costMax - plat.costMin));
                        let finalCPA = Math.max(plat.costMin, Math.min(plat.costMax, expectedCPA * (1 + (Math.random() * 0.2 - 0.1))));
                        branchData.items.push({
                            branchName: branchName.split(' ')[0],
                            platform: plat.name,
                            adName: `${branchName.split(' ')[0]} ${month} ${plat.name} ${cIdx + 1}`,
                            dateStr: `${campaignDays[cIdx].toString().padStart(2, '0')}-${month}`,
                            results: `${Math.floor(cBudget / finalCPA).toLocaleString()} ${plat.resType}`,
                            cost: cBudget
                        });
                        branchData.total += cBudget;
                    });
                });
                invoice.branches.push(branchData);
            });
            return invoice;
        };

        window.renderInvoicePreview = function(data, isValid = true, currentPerc = 0) {
            const contentDiv = document.getElementById('invoicePageContent');
            if (!contentDiv || !data) return;

            const invoiceRef = generateInvoiceRef(data.month);
            // Use an array of parts and join at the end to avoid repeated string re-allocation with +=
            const parts = [];
            parts.push(`
                <div class="scale-wrapper" style="transform-origin: top left; width: 100%;">
                <div class="avoid-break">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
                        <div style="display: flex; flex-direction: column;">
                            <img src="https://i.postimg.cc/PJ0fwSNY/OPENY.png" crossorigin="anonymous" alt="OPENY" style="height: 40px; width: auto; object-fit: contain; align-self: flex-start;">
                            <div style="font-size: 10.5px; color: #6B7280; margin-top: 6px; line-height: 1.45; font-family: 'Inter', sans-serif;">Villa 175, First District, Fifth Settlement, Cairo<br>info@openytalk.com</div>
                        </div>
                        <div style="text-align: right; font-family: 'Inter', sans-serif;">
                            <div style="font-size: 31px; font-weight: 900; letter-spacing: 2px; color: #111; line-height: 1; margin: 0 0 8px 0;">INVOICE</div>
                            <div style="font-size: 11px; color: #555; line-height: 1.6;"><div><span style="font-weight: 700; color: #111;">REF:</span> ${invoiceRef}</div><div><span style="font-weight: 700; color: #111;">DATE:</span> ${data.invoiceDate}</div></div>
                        </div>
                    </div>
                    <div style="height: 3px; background: #111; margin: 12px 0 16px 0;"></div>
                    <div style="display: flex; gap: 36px; margin-bottom: 16px;">
                        <div style="flex: 1;">
                            <div style="display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; color: #fff; background: #111; padding: 6px 10px; border-radius: 0; font-family: 'Inter', sans-serif;">BILLED TO</div>
                            <div style="display: flex; gap: 12px; margin-top: 10px; align-items: flex-start;">
                                <div style="width: 4px; height: 44px; background: #111;"></div>
                                <div style="font-family: 'Inter', sans-serif;">
                                    <div style="font-size: 18px; font-weight: 900; color: #111; line-height: 1.2;">${formatBilingualText(data.client)}</div>
                                    <div style="margin-top: 6px; color: #6B7280; font-size: 12px;">Campaign Month: ${data.month}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="invoice-dynamic-content" style="width: 100%; font-family: 'Inter', sans-serif;">
            `);

            if (!isValid && data.type !== 'custom') {
                parts.push(`<div style="text-align: center; margin-top: 40px; padding: 24px; background: #FEF2F2; color: #DC2626; font-weight: bold; border: 1px solid #FECACA; border-radius: 12px;">Cannot generate preview.<br>Total allocation must be exactly 100%.<br>Current: ${currentPerc}%</div></div>`);
            } else if (data.type === 'custom') {
                parts.push(`<div class="invoice-section avoid-break"><div style="margin-bottom: 15px;">`);
                if (data.project) parts.push(`<div style="font-weight: bold; font-size: 14px;">Project: ${formatBilingualText(data.project, 'span')}</div>`);
                if (data.desc) parts.push(`<div style="font-size: 11px; color: #555; margin-top: 4px;">${formatBilingualText(data.desc)}</div>`);
                parts.push(`</div><table class="invoice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead><tr style="background: #111; color: #fff;">
                    <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Service Name</th>
                    <th class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Scope of Work</th>
                </tr></thead><tbody>`);
                if (data.services.length === 0) { parts.push(`<tr><td colspan="2" style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; color: #666;">No services added.</td></tr>`); } 
                else { data.services.forEach(s => { parts.push(`<tr><td style="border: 1px solid #111; padding: 12px; font-size: 11px; font-weight: bold; vertical-align: top; width: 30%; background: #fff;">${formatBilingualText(s.name || '—')}</td><td style="border: 1px solid #111; padding: 12px; font-size: 11px; vertical-align: top; width: 70%; background: #fff;">${formatBilingualText(s.scope || '—')}</td></tr>`); }); }
                parts.push(`</tbody></table><div style="display: flex; justify-content: flex-end; margin-top: 16px;"><table style="width: 300px; border-collapse: collapse;"><tr style="background: #111; color: #fff;"><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 14px; font-weight: bold; text-align: right; background: #111;">TOTAL AMOUNT:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 14px; font-weight: bold; text-align: center; background: #111;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr></table></div></div>`);
            } else if (data.type === 'simple') {
                parts.push(`<div class="invoice-section avoid-break"><table class="invoice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead><tr style="background: #111; color: #fff;"><th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Description</th><th class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Amount (${data.currency})</th></tr></thead>
                    <tbody>
                        <tr><td style="border: 1px solid #111; padding: 12px; font-size: 11px; text-align: left; background: #fff;">Service Fees - ${data.month}</td><td style="border: 1px solid #111; padding: 12px; font-size: 11px; text-align: left; font-weight: bold; background: #fff; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                        <tr style="background: #111; color: #fff;"><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 12px; text-align: right; font-weight: bold; background: #111;">GRAND TOTAL:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 12px; text-align: left; font-weight: bold; background: #111; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                    </tbody></table></div>`);
            } else {
                data.branches.forEach((branch, bIdx) => {
                    // Force an immediate page break before every branch except the first one
                    let pageBreakHtml = bIdx > 0 ? `<div class="html2pdf__page-break"></div>` : ``;

                    parts.push(`${pageBreakHtml}<div class="invoice-section avoid-break"><table class="invoice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
                        <thead>
                            <tr style="background: #111; color: #fff;"><th colspan="6" class="no-wrap-text" style="border: 1px solid #111; border-bottom: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: center;">${formatBilingualText(branch.name)}</th></tr>
                            <tr style="background: #111; color: #fff;">
                                <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 12%;">Branch</th>
                                <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 13%;">Platform</th>
                                <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 33%;">Ad Name</th>
                                <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 12%;">Date</th>
                                <th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 14%;">Results</th>
                                <th class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left; width: 16%;">Cost (${data.currency})</th>
                            </tr>
                        </thead><tbody style="background: #FFFFFF;">`);
                    
                    let platformSpans = {}, currentPlatform = "", platStartIndex = 0;
                    for (let i = 0; i < branch.items.length; i++) {
                        if (branch.items[i].platform !== currentPlatform) { currentPlatform = branch.items[i].platform; platStartIndex = i; platformSpans[platStartIndex] = 1; } 
                        else { platformSpans[platStartIndex]++; }
                    }

                    for (let i = 0; i < branch.items.length; i++) {
                        let item = branch.items[i];
                        parts.push(`<tr style="page-break-inside: avoid;">`);
                        
                        // Real Rowspan for Branch
                        if (i === 0) {
                            parts.push(`<td style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; vertical-align: middle; background: #fff;" rowspan="${branch.items.length}">${formatBilingualText(item.branchName)}</td>`);
                        }

                        // Real Rowspan for Platform
                        if (platformSpans[i] !== undefined) {
                            parts.push(`<td style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; vertical-align: middle; background: #fff;" rowspan="${platformSpans[i]}">${formatBilingualText(item.platform)}</td>`);
                        }

                        // Regular Cells with strict white-space: nowrap on numbers
                        parts.push(`<td style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: left; background: #fff;">${formatBilingualText(item.adName)}</td>
                                 <td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; background: #fff; white-space: nowrap;">${item.dateStr}</td>
                                 <td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; background: #fff; white-space: nowrap;">${formatBilingualText(item.results)}</td>
                                 <td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center; background: #fff; white-space: nowrap;">${item.cost.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td>
                                 </tr>`);
                    }
                    parts.push(`<tr style="background: #E5E7EB; font-weight: bold;"><td colspan="5" style="border: 1px solid #111; padding: 6px; font-size: 11px; text-align: center;">${formatBilingualText(branch.name)} Total</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 3px 6px; font-size: 11px; text-align: center; white-space: nowrap;">${branch.total.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr></tbody></table></div>`);
                });
                
                parts.push(`<div class="avoid-break" style="page-break-inside: avoid; display: flex; justify-content: flex-end; margin-top: 16px;"><table style="width: 300px; border-collapse: collapse;"><tbody>
                    <tr><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 12px; font-weight: bold; text-align: right; width: 60%; background: #fff;">Final Budget (Ad Spend):</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 12px; font-weight: bold; text-align: center; width: 40%; background: #fff; white-space: nowrap;">${data.netBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                    <tr><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 12px; font-weight: bold; text-align: right; background: #fff;">Our Fees:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 12px; font-weight: bold; text-align: center; background: #fff; white-space: nowrap;">${data.fees.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                    <tr style="background: #111; color: #fff;"><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 12px; font-weight: bold; text-align: right; background: #111;">GRAND TOTAL:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 12px; font-weight: bold; text-align: center; background: #111; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                </tbody></table></div></div></div>`);
            }
            
            // Join all parts into one string for a single innerHTML parse, avoiding the extra tempDiv wrapper
            contentDiv.innerHTML = parts.join('');
            if (typeof window.adjustScreenScale === 'function') window.adjustScreenScale();
            setTimeout(() => { if (typeof window.fitContentToA4 === 'function') window.fitContentToA4('invoicePageContent'); }, 50);
        };

        // ==========================================================================
        // 7. QUOTATION SYSTEM LOGIC
        // ==========================================================================
        window.loadData = function() {
            // Data is loaded from local state; just populate the form
            if(typeof window.populateForm === 'function') window.populateForm();
        };

        window.populateForm = function() {
            const textInputs = ['date', 'quote-num', 'currency', 'client-name', 'company', 'project', 'project-desc', 'terms-days', 'terms-notes'];
            textInputs.forEach(id => {
                const el = document.getElementById(`in-${id}`);
                const stateKey = id === 'project-desc' ? 'projectDesc' : id;
                if(el && appState[stateKey] !== undefined) el.value = appState[stateKey];
            });
            if(document.getElementById('in-final-price')) document.getElementById('in-final-price').value = appState.finalPrice || 0;
            
            const methodSelect = document.getElementById('in-terms-method-select');
            const methodCustom = document.getElementById('in-terms-method-custom');
            if (appState['terms-method']) {
                const isStandard = Array.from(methodSelect.options).some(opt => opt.value === appState['terms-method'] && opt.value !== 'custom');
                if (isStandard) { methodSelect.value = appState['terms-method']; if(methodCustom) methodCustom.classList.add('hidden'); } 
                else { methodSelect.value = 'custom'; if(methodCustom) { methodCustom.value = appState['terms-method']; methodCustom.classList.remove('hidden'); } }
            } else {
                if(methodSelect) methodSelect.value = 'Cash';
                appState['terms-method'] = 'Cash';
            }

            const container = document.getElementById('services-container');
            if(container) {
                container.innerHTML = '';
                appState.services.forEach(s => {
                    if(typeof window.renderServiceInputRow === 'function') window.renderServiceInputRow(s.id, s.name, s.scope);
                });
            }
            if(typeof window.saveAndRender === 'function') window.saveAndRender();
        };

        window.toggleCustomMethod = function() {
            const select = document.getElementById('in-terms-method-select');
            const customInput = document.getElementById('in-terms-method-custom');
            if (select.value === 'custom') { customInput.classList.remove('hidden'); customInput.focus(); } 
            else { customInput.classList.add('hidden'); }
            if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
        };

        window.checkValidation = function() {
            const clientInput = document.getElementById('in-client-name');
            if (!clientInput) return true; 
            const clientName = clientInput.value.trim();
            const btnExportMain = document.getElementById('btn-export-main');
            const btnExportExcel = document.getElementById('btn-export-excel-quote');
            const errorMsg = document.getElementById('client-error');
            const emptyState = document.getElementById('empty-services');
            let isValid = true;

            if (!clientName) {
                isValid = false;
                if (errorMsg) errorMsg.classList.remove('hidden');
                clientInput.style.borderColor = 'var(--danger)';
            } else {
                if (errorMsg) errorMsg.classList.add('hidden');
                clientInput.style.borderColor = '';
            }

            if (appState.services.length === 0) { if (emptyState) emptyState.classList.remove('hidden'); } 
            else { if (emptyState) emptyState.classList.add('hidden'); }

            if (btnExportMain) btnExportMain.disabled = !isValid;
            if (btnExportExcel) btnExportExcel.disabled = !isValid;
            return isValid;
        };

        window.saveAndRender = function() {
            if (isAppBooting) return; // Prevent heavy calc on mobile load
            
            if(!document.getElementById('in-date')) return; 
            appState.date = document.getElementById('in-date').value;
            appState['quote-num'] = document.getElementById('in-quote-num').value;
            appState.currency = document.getElementById('in-currency').value;
            appState['client-name'] = document.getElementById('in-client-name').value;
            appState.company = document.getElementById('in-company').value;
            appState.project = document.getElementById('in-project').value;
            appState.projectDesc = document.getElementById('in-project-desc').value; 
            appState.finalPrice = parseFloat(document.getElementById('in-final-price').value) || 0;
            appState['terms-days'] = document.getElementById('in-terms-days').value;
            appState['terms-notes'] = document.getElementById('in-terms-notes').value;

            const methodSelect = document.getElementById('in-terms-method-select');
            if (methodSelect && methodSelect.value === 'custom') appState['terms-method'] = document.getElementById('in-terms-method-custom').value || 'Cash';
            else if (methodSelect) appState['terms-method'] = methodSelect.value;

            appState.services = [];
            document.querySelectorAll('.srv-row').forEach(row => {
                const id = row.dataset.id;
                const name = document.getElementById(`srv-name-${id}`).value;
                const scope = document.getElementById(`srv-scope-${id}`).value;
                appState.services.push({ id, name, scope });
            });
            
            const countEl = document.getElementById('ui-items-count');
            if(countEl) countEl.innerText = appState.services.length;
            
            // Sync draft state locally

            const editorTab = document.getElementById('tab-editor');
            if (editorTab && editorTab.classList.contains('active')) {
                if(typeof window.renderPreview === 'function') window.renderPreview();
            }
            if(typeof window.checkValidation === 'function') window.checkValidation();
        };

        window.addService = function(name = '', scope = '') {
            const id = Date.now().toString() + Math.floor(Math.random() * 100);
            if(typeof window.renderServiceInputRow === 'function') window.renderServiceInputRow(id, name, scope);
            if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
        };

        window.removeService = function(id) {
            const wrapper = document.getElementById(`srv-wrapper-${id}`);
            if(wrapper) wrapper.remove();
            if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
        };

        window.renderServiceInputRow = function(id, name, scope) {
            const container = document.getElementById('services-container');
            const div = document.createElement('div');
            div.className = 'srv-row ui-inner-box !p-4 !mb-3';
            div.id = `srv-wrapper-${id}`;
            div.dataset.id = id;

            div.innerHTML = `
                <div class="ui-form-group mb-3">
                    <input type="text" id="srv-name-${id}" class="ui-input font-bold" placeholder="Service Name" value="${name}" oninput="if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender()">
                </div>
                <div class="ui-form-group mb-0 relative">
                    <div class="flex justify-between items-center mb-2 px-1">
                        <span class="text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">Scope of Work</span>
                    </div>
                    <textarea id="srv-scope-${id}" class="ui-input text-sm leading-relaxed resize-y" rows="3" placeholder="Scope description..." oninput="if(typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender()">${scope}</textarea>
                </div>
                <button onclick="if(typeof window.removeService === 'function') window.removeService('${id}')" class="ui-button ui-button-danger w-full mt-3 !py-2 !text-xs" type="button" title="Delete Deliverable">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Delete Deliverable
                </button>
            `;
            container.appendChild(div);
        };

        window.renderPreview = function() {
            const contentDiv = document.getElementById('pageContent');
            if (!contentDiv) return;

            let html = `
                <div class="scale-wrapper" style="transform-origin: top left; width: 100%;">
                <div class="avoid-break">
                    <div class="quote-header premium">
                        <div class="company-section">
                            <img src="https://i.postimg.cc/PJ0fwSNY/OPENY.png" crossorigin="anonymous" class="quote-logo" alt="OPENY">
                            <div class="company-details">
                                Villa 175, First District, Fifth Settlement, Cairo<br>
                                info@openytalk.com
                            </div>
                        </div>
                        <div class="quotation-section">
                            <h1 class="quotation-title">QUOTATION</h1>
                            <div class="quotation-meta">
                                <div><span>DATE:</span> ${formatDate(appState.date) || 'DD/MM/YYYY'}</div>
                                <div><span>QUOTE #:</span> ${appState['quote-num'] || 'Q-YYYY-XXX'}</div>
                            </div>
                        </div>
                    </div>
                    <div class="header-divider"></div>
                    <div class="top-blocks">
                        <div class="block">
                            <div class="block-label">PREPARED FOR</div>
                            <div class="block-body">
                                <div class="block-divider"></div>
                                <div>
                                    <div class="block-title">${formatBilingualText(appState['client-name'] || 'Client Name')}</div>
                                    <div class="block-sub">${formatBilingualText(appState.company || '')}</div>
                                </div>
                            </div>
                        </div>
                        <div class="block">
                            <div class="block-label light">PROJECT</div>
                            <div class="block-body">
                                <div class="block-divider gray"></div>
                                <div>
                                    <div class="block-title">${formatBilingualText(appState.project || 'Digital Marketing')}</div>
                                    <div class="block-sub">${formatBilingualText(appState.projectDesc || '')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <table class="services-table">
                    <thead>
                        <tr>
                            <th class="col-service">Service Name</th>
                            <th class="col-scope">Scope of Work</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            if (appState.services.length === 0) {
                html += `<tr><td colspan="2" style="text-align:center; padding: 20px; color:#666;">No services added.</td></tr>`;
            } else {
                appState.services.forEach(s => {
                    html += `
                        <tr>
                            <td class="col-service">${formatBilingualText(s.name || '—')}</td>
                            <td class="col-scope">${formatBilingualText(s.scope || '—')}</td>
                        </tr>
                    `;
                });
            }

            html += `
                    </tbody>
                </table>
                <div class="avoid-break">
                    <div class="summary-row">
                        <div class="total-box">
                            <div class="total-label">TOTAL INVESTMENT</div>
                            <div class="total-value">${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(appState.finalPrice)}</div>
                            <div class="total-currency">${appState.currencyMap[appState.currency] || appState.currency}</div>
                        </div>
                    </div>
                    <div class="terms-section">
                        <div class="block-label" style="margin-bottom:8px;">TERMS & CONDITIONS</div>
                        <ul class="terms-list">
                            <li>Payment Method: <strong>${appState['terms-method'] || 'Cash'}</strong></li>
                            <li>Payment Due: <strong>${appState['terms-days'] || '0'} Days</strong></li>
                `;
                if (appState['terms-notes']) {
                    html += `<li>Notes: ${formatBilingualText(appState['terms-notes'], 'span')}</li>`;
                }
                html += `
                        </ul>
                    </div>
                </div>
                </div>
            `;

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            contentDiv.innerHTML = '';
            contentDiv.appendChild(tempDiv);
            
            if (typeof window.adjustScreenScale === 'function') window.adjustScreenScale();
            setTimeout(() => { if (typeof window.fitContentToA4 === 'function') window.fitContentToA4('pageContent'); }, 50);
        };

        // Scroll listener debounce for mobile performance
        let lastWindowWidth = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth === lastWindowWidth) return; // Prevent mobile scroll-bar resize lag
            lastWindowWidth = window.innerWidth;
            clearTimeout(renderTimeout);
            renderTimeout = setTimeout(() => {
                requestAnimationFrame(() => {
                    if (typeof window.adjustLayout === 'function') window.adjustLayout();
                });
            }, 250);
        }, { passive: true });


        // ==========================================================================
        // 8. PDF / EXCEL EXPORT LOGIC
        // ==========================================================================
        window.lazyGenerateQuotePDF = async function() {
            if (!window.checkValidation()) return showToast("Please fill all required fields");
            
            const btn = document.getElementById('btn-export-main');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating PDF...';
            btn.disabled = true;

            await loadExportLibraries();
            
            const element = document.getElementById('pageContent');
            const filename = sanitizeFilename(appState['client-name'], appState['quote-num']);

            // Prepare element for flawless export
            const origPadding = element.style.padding;
            const origWidth = element.style.width;
            const origMaxWidth = element.style.maxWidth;
            element.style.padding = '0px';
            element.style.width = '186mm'; // Exactly A4 width minus 12mm margins on both sides
            element.style.maxWidth = 'none';
            
            // Reset scale-wrapper for pristine export
            const wrapper = element.querySelector('.scale-wrapper');
            let origWrapperTransform = '', origWrapperWidth = '';
            if (wrapper) {
                origWrapperTransform = wrapper.style.transform;
                origWrapperWidth = wrapper.style.width;
                wrapper.style.transform = 'none';
                wrapper.style.width = '100%';
            }

            // Force DOM reflow and ensure Noto Sans Arabic font is ready before capture
            await Promise.all([new Promise(resolve => setTimeout(resolve, 300)), document.fonts.ready]);

            const opt = {
                margin:       12, // Uniform 12mm margin applied via jsPDF natively
                filename:     filename,
                image:        { type: 'jpeg', quality: 1 },
                html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0, letterRendering: true, allowTaint: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'], avoid: ['.avoid-break', 'thead', 'tr'] }
            };

            try {
                // ── 1. Save record FIRST (before generating file) ────────────────
                console.log('[OPENY] Quotation PDF save started');
                const _now = new Date();
                const _editingQuotationId = currentEditingHistoryId;
                // Preserve existing status when editing
                let quotPdfStatus = 'unpaid';
                if (_editingQuotationId) {
                    const existing = (await cloudDB.getAll('quotations')).find(r => r.id === _editingQuotationId);
                    if (existing && existing.status) quotPdfStatus = existing.status;
                }
                const record = {
                    id: _editingQuotationId || Date.now().toString(),
                    client: appState['client-name'],
                    ref: appState['quote-num'],
                    date: appState.date,
                    amount: appState.finalPrice,
                    currency: appState.currency,
                    status: quotPdfStatus,
                    timestamp: Date.now(),
                    type: 'quote',
                    year: _now.getFullYear(),
                    month: _now.getMonth() + 1,
                    day: _now.getDate(),
                    source: 'web',
                    formSnapshot: _captureQuoteSnapshot()
                };
                await cloudDB.put(record, 'quotations');
                console.log('[OPENY] Quotation save success — record ID:', record.id);
                await logActivity(_editingQuotationId ? 'updated' : 'created', 'quotation', record.id, { client: record.client, ref: record.ref, amount: record.amount, currency: record.currency });
                console.log('[OPENY] History insert success for record:', record.id);

                // ── 2. Generate and download the PDF ────────────────────────────
                const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
                const fileUrl = await uploadExportToStorage(pdfBlob, 'quotations', filename);
                if (fileUrl) {
                    record.fileUrl = fileUrl;
                    await cloudDB.put(record, 'quotations');
                }
                saveAs(pdfBlob, filename);
                console.log('[OPENY] Quotation PDF export success:', filename);
                showToast("PDF Downloaded successfully!");

                // ── 3. Post-save housekeeping ────────────────────────────────────
                if (_editingQuotationId) window.stopEditing();

                // ── 4. Refresh history immediately ───────────────────────────────
                if (typeof window.renderHistoryList === 'function') {
                    await window.renderHistoryList();
                }
            } catch (e) {
                console.error('[OPENY] Quotation PDF pipeline error:', e);
                showToast("Error generating PDF");
            } finally {
                element.style.padding = origPadding;
                element.style.width = origWidth;
                element.style.maxWidth = origMaxWidth;
                if (wrapper) {
                    wrapper.style.transform = origWrapperTransform;
                    wrapper.style.width = origWrapperWidth;
                }
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        window.lazyGenerateQuoteExcel = async function() {
            if (!window.checkValidation()) return showToast("Please fill all required fields");
            
            const btn = document.getElementById('btn-export-excel-quote');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating Excel...';
            btn.disabled = true;

            await loadExportLibraries();

            try {
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Quotation');

                worksheet.columns = [
                    { header: 'Service Name', key: 'name', width: 30 },
                    { header: 'Scope of Work', key: 'scope', width: 60 }
                ];

                worksheet.getRow(1).font = { bold: true };
                worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

                appState.services.forEach(s => {
                    worksheet.addRow({
                        name: s.name,
                        scope: s.scope
                    });
                });

                worksheet.addRow([]);
                worksheet.addRow({ name: 'Total Investment', scope: `${appState.finalPrice} ${appState.currency}` });
                worksheet.lastRow.font = { bold: true };

                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const filename = sanitizeFilename(appState['client-name'], appState['quote-num']).replace('.pdf', '.xlsx');

                // ── 1. Save record FIRST (before downloading file) ───────────────
                console.log('[OPENY] Quotation Excel save started');
                const _now2 = new Date();
                const _editingQuotationIdExcel = currentEditingHistoryId;
                // Preserve existing status when editing
                let quotXlsStatus = 'unpaid';
                if (_editingQuotationIdExcel) {
                    const existing = (await cloudDB.getAll('quotations')).find(r => r.id === _editingQuotationIdExcel);
                    if (existing && existing.status) quotXlsStatus = existing.status;
                }
                const record = {
                    id: _editingQuotationIdExcel || Date.now().toString(),
                    client: appState['client-name'],
                    ref: appState['quote-num'],
                    date: appState.date,
                    amount: appState.finalPrice,
                    currency: appState.currency,
                    status: quotXlsStatus,
                    timestamp: Date.now(),
                    type: 'quote',
                    year: _now2.getFullYear(),
                    month: _now2.getMonth() + 1,
                    day: _now2.getDate(),
                    source: 'web',
                    formSnapshot: _captureQuoteSnapshot()
                };
                const fileUrlExcel = await uploadExportToStorage(blob, 'quotations', filename);
                if (fileUrlExcel) record.fileUrl = fileUrlExcel;
                await cloudDB.put(record, 'quotations');
                console.log('[OPENY] Quotation save success — record ID:', record.id);
                await logActivity(_editingQuotationIdExcel ? 'updated' : 'created', 'quotation', record.id, { client: record.client, ref: record.ref, amount: record.amount, currency: record.currency });
                console.log('[OPENY] History insert success for record:', record.id);

                // ── 2. Download the Excel file ───────────────────────────────────
                saveAs(blob, filename);
                console.log('[OPENY] Quotation Excel export success:', filename);
                showToast("Excel Downloaded successfully!");

                // ── 3. Post-save housekeeping ────────────────────────────────────
                if (_editingQuotationIdExcel) window.stopEditing();

                // ── 4. Refresh history immediately ───────────────────────────────
                if (typeof window.renderHistoryList === 'function') {
                    await window.renderHistoryList();
                }
            } catch (e) {
                console.error('[OPENY] Quotation Excel pipeline error:', e);
                showToast("Error generating Excel");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        window.lazyGenerateInvoicePDF = async function() {
            const btn = document.getElementById('invBtnPDF');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating PDF...';
            btn.disabled = true;

            await loadExportLibraries();
            
            const invoiceData = window.calculateInvoiceData();
            const element = document.getElementById('invoicePageContent');
            const invoiceRef = generateInvoiceRef();
            const filename = sanitizeFilename(invoiceData.client, invoiceRef);

            // Prepare element for flawless export
            const origPadding = element.style.padding;
            const origWidth = element.style.width;
            const origMaxWidth = element.style.maxWidth;
            element.style.padding = '0px';
            element.style.width = '186mm'; // Exactly A4 width minus 12mm margins on both sides
            element.style.maxWidth = 'none';

            // Reset scale-wrapper for pristine export
            const wrapper = element.querySelector('.scale-wrapper');
            let origWrapperTransform = '', origWrapperWidth = '';
            if (wrapper) {
                origWrapperTransform = wrapper.style.transform;
                origWrapperWidth = wrapper.style.width;
                wrapper.style.transform = 'none';
                wrapper.style.width = '100%';
            }

            // Force DOM reflow and ensure Noto Sans Arabic font is ready before capture
            await Promise.all([new Promise(resolve => setTimeout(resolve, 300)), document.fonts.ready]);

            const opt = {
                margin:       12, // Uniform 12mm margin applied via jsPDF natively
                filename:     filename,
                image:        { type: 'jpeg', quality: 1 },
                html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0, letterRendering: true, allowTaint: true },
                jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak:    { mode: ['css', 'legacy'], avoid: ['.avoid-break'] } // Simplified to only avoid breaking explicit elements
            };

            try {
                // ── 1. Save invoice record ────────────────────────────────────
                console.log('saving invoice...');
                const _now3 = new Date();
                const _editingInvoiceId = currentEditingInvHistoryId;
                // Preserve existing status when editing an existing invoice
                let invPdfStatus = 'unpaid';
                if (_editingInvoiceId) {
                    if (window.supabaseDB && window.supabaseDB.ready) {
                        const existing = (await window.supabaseDB.getInvoices()).find(r => r.id === _editingInvoiceId);
                        if (existing && existing.status) invPdfStatus = existing.status;
                    } else {
                        const existing = (await cloudDB.getAll('invoices')).find(r => r.id === _editingInvoiceId);
                        if (existing && existing.status) invPdfStatus = existing.status;
                    }
                }
                const _invSnap = _captureInvoiceSnapshot();
                const _invClient = invoiceData.client || 'Unknown Client';
                let record = {
                    id: _editingInvoiceId || Date.now().toString(),
                    client: _invClient,
                    client_name: _invClient,
                    ref: invoiceRef,
                    date: invoiceData.invoiceDate || new Date().toISOString().slice(0, 7),
                    amount: invoiceData.totalBudget || 0,
                    total: invoiceData.totalBudget || 0,
                    currency: invoiceData.currency || 'USD',
                    status: invPdfStatus,
                    timestamp: Date.now(),
                    type: 'invoice',
                    year: _now3.getFullYear(),
                    month: _now3.getMonth() + 1,
                    day: _now3.getDate(),
                    source: 'web',
                    formSnapshot: _invSnap,
                    form_data_json: _invSnap
                };
                if (window.supabaseDB && window.supabaseDB.ready) {
                    const saved = await window.supabaseDB.saveInvoice(record);
                    if (saved) record = saved;
                } else {
                    await cloudDB.put(record, 'invoices');
                }
                console.log('invoice saved with id', record.id);

                // ── 2. Generate PDF ───────────────────────────────────────────
                const invPdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');

                // ── 3. Upload PDF to Supabase Storage ─────────────────────────
                let invPdfUrl = null;
                if (window.supabaseDB && window.supabaseDB.ready) {
                    const pdfFile = new File([invPdfBlob], filename, { type: 'application/pdf' });
                    invPdfUrl = await window.supabaseDB.uploadInvoicePdf(pdfFile, record.id);
                } else {
                    invPdfUrl = await uploadExportToStorage(invPdfBlob, 'invoices', filename);
                }

                // ── 4. Save pdf_url back into invoice ─────────────────────────
                if (invPdfUrl) {
                    if (window.supabaseDB && window.supabaseDB.ready) {
                        await window.supabaseDB.attachPdfUrl(record.id, invPdfUrl);
                    } else {
                        record.fileUrl = invPdfUrl;
                        await cloudDB.put(record, 'invoices');
                    }
                }

                // ── 5. Insert activity_logs row ───────────────────────────────
                if (window.supabaseDB && window.supabaseDB.ready) {
                    await window.supabaseDB.logHistory(record.id, record.ref || record.client, _editingInvoiceId ? 'updated' : 'created');
                    if (invPdfUrl) {
                        await window.supabaseDB.logHistory(record.id, record.ref || record.client, 'exported', invPdfUrl);
                    }
                } else {
                    await logActivity(_editingInvoiceId ? 'updated' : 'created', 'invoice', record.id, { client: record.client, ref: record.ref, amount: record.amount, currency: record.currency });
                }
                console.log('history inserted');

                // ── 6. Refresh invoice list and history ───────────────────────
                if (typeof window.renderInvHistoryList === 'function') {
                    await window.renderInvHistoryList();
                }

                // ── 7. Download file locally ──────────────────────────────────
                saveAs(invPdfBlob, filename);
                console.log('[OPENY] Invoice PDF export success:', filename);
                showToast("Invoice PDF Downloaded!");

                // ── Post-save housekeeping ────────────────────────────────────
                if (_editingInvoiceId) window.stopInvEditing();
                await initInvoiceNumber();
                if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
            } catch (e) {
                console.error('[OPENY] Invoice PDF pipeline error:', e);
                showToast("Error generating PDF");
            } finally {
                element.style.padding = origPadding;
                element.style.width = origWidth;
                element.style.maxWidth = origMaxWidth;
                if (wrapper) {
                    wrapper.style.transform = origWrapperTransform;
                    wrapper.style.width = origWrapperWidth;
                }
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        window.lazyGenerateExcel = async function() {
            const btn = document.getElementById('invBtnExcel');
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating Excel...';
            btn.disabled = true;

            await loadExportLibraries();
            
            try {
                const invoiceData = window.calculateInvoiceData();
                const invoiceRef = generateInvoiceRef();
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Invoice', {
                    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
                });

                // Set Column Widths to match PDF proportions
                worksheet.columns = [
                    { width: 14 }, // A: Branch
                    { width: 16 }, // B: Platform
                    { width: 42 }, // C: Ad Name
                    { width: 16 }, // D: Date
                    { width: 16 }, // E: Results
                    { width: 22 }  // F: Cost
                ];

                // Fetch Logo
                let logoId;
                try {
                    const response = await fetch('https://i.postimg.cc/PJ0fwSNY/OPENY.png');
                    const blob = await response.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    logoId = workbook.addImage({ base64: base64, extension: 'png' });
                } catch(e) { console.warn("Excel logo fetch failed", e); }

                // Header Section
                if (logoId) {
                    worksheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 140, height: 40 } });
                } else {
                    worksheet.mergeCells('A1:C2');
                    let logoCell = worksheet.getCell('A1');
                    logoCell.value = 'OPENY';
                    logoCell.font = { size: 24, bold: true, name: 'Arial' };
                    logoCell.alignment = { vertical: 'middle', horizontal: 'left' };
                }

                worksheet.mergeCells('E1:F2');
                let invTitle = worksheet.getCell('E1');
                invTitle.value = 'INVOICE';
                invTitle.font = { size: 26, bold: true, name: 'Arial' };
                invTitle.alignment = { vertical: 'middle', horizontal: 'right' };

                worksheet.getCell('E3').value = 'REF:';
                worksheet.getCell('E3').font = { bold: true, size: 10, name: 'Arial' };
                worksheet.getCell('E3').alignment = { horizontal: 'right' };
                worksheet.getCell('F3').value = invoiceRef;
                worksheet.getCell('F3').font = { size: 10, name: 'Arial' };
                worksheet.getCell('F3').alignment = { horizontal: 'right' };

                worksheet.getCell('E4').value = 'DATE:';
                worksheet.getCell('E4').font = { bold: true, size: 10, name: 'Arial' };
                worksheet.getCell('E4').alignment = { horizontal: 'right' };
                worksheet.getCell('F4').value = invoiceData.invoiceDate;
                worksheet.getCell('F4').font = { size: 10, name: 'Arial' };
                worksheet.getCell('F4').alignment = { horizontal: 'right' };

                worksheet.getCell('A4').value = 'Villa 175, First District, Fifth Settlement';
                worksheet.getCell('A4').font = { size: 9, color: { argb: 'FF555555' }, name: 'Arial' };
                worksheet.getCell('A5').value = 'info@openytalk.com';
                worksheet.getCell('A5').font = { size: 9, color: { argb: 'FF555555' }, name: 'Arial' };
                worksheet.getCell('A6').value = 'openytalk.com';
                worksheet.getCell('A6').font = { size: 9, color: { argb: 'FF555555' }, name: 'Arial' };

                // Divider Row
                worksheet.mergeCells('A7:F7');
                let divider = worksheet.getCell('A7');
                divider.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                worksheet.getRow(7).height = 3;

                // Billed To Section
                worksheet.getCell('A9').value = 'BILLED TO';
                worksheet.getCell('A9').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                worksheet.getCell('A9').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                worksheet.getCell('A9').alignment = { horizontal: 'center', vertical: 'middle' };

                worksheet.mergeCells('A10:C10');
                let clientNameCell = worksheet.getCell('A10');
                clientNameCell.value = invoiceData.client;
                clientNameCell.font = { bold: true, size: 14, name: 'Arial' };

                worksheet.mergeCells('A11:C11');
                let monthCell = worksheet.getCell('A11');
                monthCell.value = `Campaign Month: ${invoiceData.month}`;
                monthCell.font = { size: 10, color: { argb: 'FF666666' }, name: 'Arial' };

                let currentRow = 14;

                // Body Sections based on invoice type
                if (invoiceData.type === 'custom') {
                    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
                    let hc1 = worksheet.getCell(`A${currentRow}`);
                    hc1.value = 'SERVICE NAME';
                    hc1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                    hc1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                    hc1.alignment = { horizontal: 'left', vertical: 'middle' };
                    hc1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                    worksheet.mergeCells(`C${currentRow}:F${currentRow}`);
                    let hc2 = worksheet.getCell(`C${currentRow}`);
                    hc2.value = 'SCOPE OF WORK';
                    hc2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                    hc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                    hc2.alignment = { horizontal: 'left', vertical: 'middle' };
                    hc2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    currentRow++;

                    invoiceData.services.forEach(s => {
                        worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
                        let c1 = worksheet.getCell(`A${currentRow}`);
                        c1.value = s.name;
                        c1.font = { bold: true, size: 10, name: 'Arial' };
                        c1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        c1.alignment = { vertical: 'top', wrapText: true };

                        worksheet.mergeCells(`C${currentRow}:F${currentRow}`);
                        let c2 = worksheet.getCell(`C${currentRow}`);
                        c2.value = s.scope;
                        c2.font = { size: 10, name: 'Arial' };
                        c2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        c2.alignment = { vertical: 'top', wrapText: true };
                        currentRow++;
                    });
                } else if (invoiceData.type === 'simple') {
                    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
                    let hc1 = worksheet.getCell(`A${currentRow}`);
                    hc1.value = 'DESCRIPTION';
                    hc1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                    hc1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                    hc1.alignment = { horizontal: 'left', vertical: 'middle' };
                    hc1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                    let hc2 = worksheet.getCell(`F${currentRow}`);
                    hc2.value = `AMOUNT (${invoiceData.currency})`;
                    hc2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                    hc2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                    hc2.alignment = { horizontal: 'center', vertical: 'middle' };
                    hc2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    currentRow++;

                    worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
                    let c1 = worksheet.getCell(`A${currentRow}`);
                    c1.value = `Service Fees - ${invoiceData.month}`;
                    c1.font = { size: 10, name: 'Arial' };
                    c1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    c1.alignment = { vertical: 'middle' };

                    let c2 = worksheet.getCell(`F${currentRow}`);
                    c2.value = `${invoiceData.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;
                    c2.font = { bold: true, size: 10, name: 'Arial' };
                    c2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    c2.alignment = { horizontal: 'center', vertical: 'middle' };
                    currentRow++;
                } else {
                    // Detailed branches logic (Pro icon KSA)
                    invoiceData.branches.forEach(branch => {
                        // Branch Title Header
                        worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
                        let bTitle = worksheet.getCell(`A${currentRow}`);
                        bTitle.value = branch.name.toUpperCase();
                        bTitle.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Arial' };
                        bTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                        bTitle.alignment = { horizontal: 'center', vertical: 'middle' };
                        bTitle.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                        currentRow++;

                        // Sub Headers
                        const headers = ['BRANCH', 'PLATFORM', 'AD NAME', 'DATE', 'RESULTS', `COST (${invoiceData.currency})`];
                        headers.forEach((h, i) => {
                            let hc = worksheet.getCell(currentRow, i + 1);
                            hc.value = h;
                            hc.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Arial' };
                            hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                            hc.alignment = { horizontal: 'left', vertical: 'middle' };
                            hc.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                            if (i === 5) hc.alignment.horizontal = 'center';
                        });
                        currentRow++;

                        let branchStartRow = currentRow;
                        let platformStartRow = currentRow;
                        let currentPlatform = branch.items[0]?.platform;

                        branch.items.forEach((item, idx) => {
                            let row = worksheet.getRow(currentRow);
                            row.getCell(1).value = item.branchName;
                            row.getCell(2).value = item.platform;
                            row.getCell(3).value = item.adName;
                            row.getCell(4).value = item.dateStr;
                            row.getCell(5).value = item.results;
                            row.getCell(6).value = `${item.cost.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;

                            for (let c = 1; c <= 6; c++) {
                                let cell = row.getCell(c);
                                cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                                cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center', wrapText: true };
                                cell.font = { size: 10, name: 'Arial' };
                            }

                            // Dynamic Excel Cell Merging for Platform Column
                            if (idx > 0 && item.platform !== currentPlatform) {
                                if (currentRow - 1 > platformStartRow) {
                                    worksheet.mergeCells(`B${platformStartRow}:B${currentRow - 1}`);
                                }
                                platformStartRow = currentRow;
                                currentPlatform = item.platform;
                            }
                            currentRow++;
                        });

                        // Merge last platform cluster
                        if (currentRow - 1 > platformStartRow) {
                            worksheet.mergeCells(`B${platformStartRow}:B${currentRow - 1}`);
                        }
                        // Merge Branch Column
                        if (currentRow - 1 > branchStartRow) {
                            worksheet.mergeCells(`A${branchStartRow}:A${currentRow - 1}`);
                        }

                        // Branch Total
                        worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
                        let bt = worksheet.getCell(`A${currentRow}`);
                        bt.value = `${branch.name} Total`;
                        bt.font = { bold: true, size: 10, name: 'Arial' };
                        bt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
                        bt.alignment = { horizontal: 'center', vertical: 'middle' };
                        bt.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                        let bv = worksheet.getCell(`F${currentRow}`);
                        bv.value = `${branch.total.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;
                        bv.font = { bold: true, size: 10, name: 'Arial' };
                        bv.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
                        bv.alignment = { horizontal: 'center', vertical: 'middle' };
                        bv.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                        currentRow += 2;
                    });
                }

                // Bottom Totals (Fees and Grand Total)
                if (invoiceData.type !== 'simple') {
                    worksheet.mergeCells(`C${currentRow}:E${currentRow}`);
                    let fLabel = worksheet.getCell(`C${currentRow}`);
                    fLabel.value = "Final Budget (Ad Spend):";
                    fLabel.font = { bold: true, size: 10, name: 'Arial' };
                    fLabel.alignment = { horizontal: 'right', vertical: 'middle' };
                    fLabel.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                    let fVal = worksheet.getCell(`F${currentRow}`);
                    fVal.value = `${invoiceData.netBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;
                    fVal.font = { bold: true, size: 10, name: 'Arial' };
                    fVal.alignment = { horizontal: 'center', vertical: 'middle' };
                    fVal.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    currentRow++;

                    worksheet.mergeCells(`C${currentRow}:E${currentRow}`);
                    let feeLabel = worksheet.getCell(`C${currentRow}`);
                    feeLabel.value = "Our Fees:";
                    feeLabel.font = { bold: true, size: 10, name: 'Arial' };
                    feeLabel.alignment = { horizontal: 'right', vertical: 'middle' };
                    feeLabel.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                    let feeVal = worksheet.getCell(`F${currentRow}`);
                    feeVal.value = `${invoiceData.fees.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;
                    feeVal.font = { bold: true, size: 10, name: 'Arial' };
                    feeVal.alignment = { horizontal: 'center', vertical: 'middle' };
                    feeVal.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
                    currentRow++;
                }

                // Grand Total Row
                worksheet.mergeCells(`C${currentRow}:E${currentRow}`);
                let grandLabel = worksheet.getCell(`C${currentRow}`);
                grandLabel.value = "GRAND TOTAL:";
                grandLabel.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
                grandLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                grandLabel.alignment = { horizontal: 'right', vertical: 'middle' };
                grandLabel.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                let grandVal = worksheet.getCell(`F${currentRow}`);
                grandVal.value = `${invoiceData.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${invoiceData.currency}`;
                grandVal.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
                grandVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
                grandVal.alignment = { horizontal: 'center', vertical: 'middle' };
                grandVal.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

                const buffer = await workbook.xlsx.writeBuffer();
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const filename = sanitizeFilename(invoiceData.client, invoiceRef).replace('.pdf', '.xlsx');

                // ── 1. Save record FIRST (before downloading file) ───────────────
                console.log('saving invoice...');
                const _now4 = new Date();
                const _editingInvoiceIdExcel = currentEditingInvHistoryId;
                // Preserve existing status when editing an existing invoice
                let invXlsStatus = 'unpaid';
                if (_editingInvoiceIdExcel) {
                    if (window.supabaseDB && window.supabaseDB.ready) {
                        const existing = (await window.supabaseDB.getInvoices()).find(r => r.id === _editingInvoiceIdExcel);
                        if (existing && existing.status) invXlsStatus = existing.status;
                    } else {
                        const existing = (await cloudDB.getAll('invoices')).find(r => r.id === _editingInvoiceIdExcel);
                        if (existing && existing.status) invXlsStatus = existing.status;
                    }
                }
                const _invSnapXls = _captureInvoiceSnapshot();
                const _invClientXls = invoiceData.client || 'Unknown Client';
                let record = {
                    id: _editingInvoiceIdExcel || Date.now().toString(),
                    client: _invClientXls,
                    client_name: _invClientXls,
                    ref: invoiceRef,
                    date: invoiceData.invoiceDate || new Date().toISOString().slice(0, 7),
                    amount: invoiceData.totalBudget || 0,
                    total: invoiceData.totalBudget || 0,
                    currency: invoiceData.currency || 'USD',
                    status: invXlsStatus,
                    timestamp: Date.now(),
                    type: 'invoice',
                    year: _now4.getFullYear(),
                    month: _now4.getMonth() + 1,
                    day: _now4.getDate(),
                    source: 'web',
                    formSnapshot: _invSnapXls,
                    form_data_json: _invSnapXls
                };
                if (window.supabaseDB && window.supabaseDB.ready) {
                    const saved = await window.supabaseDB.saveInvoice(record);
                    if (saved) record = saved;
                    // Upload Excel to storage and attach url
                    const invXlsUrl = await uploadExportToStorage(blob, 'invoices', filename);
                    if (invXlsUrl) await window.supabaseDB.attachExcelUrl(record.id, invXlsUrl);
                    await window.supabaseDB.logHistory(record.id, record.ref || record.client, _editingInvoiceIdExcel ? 'updated' : 'created');
                } else {
                    const invXlsUrl = await uploadExportToStorage(blob, 'invoices', filename);
                    if (invXlsUrl) record.fileUrl = invXlsUrl;
                    await cloudDB.put(record, 'invoices');
                    await logActivity(_editingInvoiceIdExcel ? 'updated' : 'created', 'invoice', record.id, { client: record.client, ref: record.ref, amount: record.amount, currency: record.currency });
                }
                console.log('invoice saved with id', record.id);
                console.log('history inserted');

                // ── 2. Download the Excel file ───────────────────────────────────
                saveAs(blob, filename);
                console.log('[OPENY] Invoice Excel export success:', filename);
                showToast("Invoice Excel Downloaded!");

                // ── 3. Post-save housekeeping ────────────────────────────────────
                if (_editingInvoiceIdExcel) window.stopInvEditing();
                await initInvoiceNumber();
                if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();

                // ── 4. Refresh history immediately ───────────────────────────────
                if (typeof window.renderInvHistoryList === 'function') {
                    await window.renderInvHistoryList();
                }
            } catch (e) {
                console.error('[OPENY] Invoice Excel pipeline error:', e);
                showToast("Error generating Excel");
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        // ==========================================================================
        // 9. HISTORY MANAGEMENT (Render logic)
        // ==========================================================================

        // Helper: returns month name from month number (1-12)
        function _monthName(m) {
            return new Date(2000, m - 1).toLocaleString('en-US', { month: 'long' });
        }

        // Helper: group records array by year then month, sorted newest first
        function _updateHistorySummary(records, ids) {
            const now = new Date();
            const thisMonth = now.getMonth() + 1;
            const thisYear = now.getFullYear();
            const currencies = [...new Set(records.map(r => r.currency).filter(Boolean))];
            const currSuffix = currencies.length === 1 ? (' ' + currencies[0]) : '';
            const fmt = n => new Intl.NumberFormat('en-US', {minimumFractionDigits:0, maximumFractionDigits:0}).format(n);
            const totalValue = records.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
            const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            if (ids.total !== undefined) set(ids.total, records.length);
            if (ids.paid !== undefined) set(ids.paid, records.filter(r => r.status === 'paid').length);
            if (ids.unpaid !== undefined) set(ids.unpaid, records.filter(r => r.status === 'unpaid' || !r.status).length);
            if (ids.accepted !== undefined) set(ids.accepted, records.filter(r => r.status === 'paid' || r.status === 'accepted').length);
            if (ids.pending !== undefined) set(ids.pending, records.filter(r => r.status === 'unpaid' || r.status === 'pending' || !r.status).length);
            if (ids.value !== undefined) set(ids.value, fmt(totalValue) + currSuffix);
            if (ids.thisMonth !== undefined) {
                const monthTotal = records.filter(r => {
                    const ry = r.year || new Date(r.timestamp || 0).getFullYear();
                    const rm = r.month || (new Date(r.timestamp || 0).getMonth() + 1);
                    return String(ry) === String(thisYear) && String(rm) === String(thisMonth);
                }).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                set(ids.thisMonth, fmt(monthTotal) + currSuffix);
            }
            if (ids.active !== undefined) set(ids.active, records.filter(r => (r.status || '').toLowerCase() === 'active').length);
            if (ids.draft !== undefined) set(ids.draft, records.filter(r => (r.status || '').toLowerCase() === 'draft').length);
            if (ids.expired !== undefined) set(ids.expired, records.filter(r => ['completed', 'terminated'].includes((r.status || '').toLowerCase())).length);
        }

        function _groupByYearMonth(records) {
            const map = {};
            records.forEach(r => {
                const ts = r.timestamp || Date.now();
                const d = new Date(ts);
                const y = r.year  || d.getFullYear();
                const m = r.month || (d.getMonth() + 1);
                const key = `${y}-${String(m).padStart(2, '0')}`;
                if (!map[key]) map[key] = { year: y, month: m, records: [] };
                map[key].records.push(r);
            });
            return Object.values(map).sort((a, b) =>
                b.year !== a.year ? b.year - a.year : b.month - a.month
            );
        }

        // Helper: populate a select element with unique values from records, preserving current selection
        function _populateHistorySelect(selectId, values, defaultLabel) {
            const select = document.getElementById(selectId);
            if (!select) return;
            const currentVal = select.value;
            const optionValues = ['', ...values.map(String)];
            const currentOptions = Array.from(select.options).map(o => o.value);
            if (JSON.stringify(currentOptions) === JSON.stringify(optionValues)) return;
            select.innerHTML = `<option value="">${defaultLabel}</option>`;
            values.forEach(v => {
                const opt = document.createElement('option');
                opt.value = String(v);
                opt.textContent = String(v);
                select.appendChild(opt);
            });
            select.value = currentVal;
        }

        // Helper: sort records array by the given sort key
        function _sortHistoryRecords(records, sortVal) {
            const sorted = records.slice();
            switch (sortVal) {
                case 'oldest':      return sorted.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                case 'client-asc':  return sorted.sort((a, b) => (a.client || '').localeCompare(b.client || '', undefined, { sensitivity: 'base' }));
                case 'client-desc': return sorted.sort((a, b) => (b.client || '').localeCompare(a.client || '', undefined, { sensitivity: 'base' }));
                case 'amount-desc': return sorted.sort((a, b) => (b.amount || 0) - (a.amount || 0));
                case 'amount-asc':  return sorted.sort((a, b) => (a.amount || 0) - (b.amount || 0));
                default:            return sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }
        }

        // Helper: render a list of filtered+sorted records into a container, with optional year/month grouping
        function _renderHistoryRecords(records, storeName, container, sortVal) {
            if (sortVal === 'newest' || sortVal === 'oldest') {
                _groupByYearMonth(records).forEach(group => {
                    const divider = document.createElement('div');
                    divider.className = 'history-month-divider';
                    divider.innerHTML = `<div class="history-month-divider-line"></div><div class="history-month-divider-label">${group.year} &nbsp;·&nbsp; ${_monthName(group.month)}</div><div class="history-month-divider-line"></div>`;
                    container.appendChild(divider);
                    group.records.forEach(r => _renderHistoryCard(r, storeName, container));
                });
            } else {
                records.forEach(r => _renderHistoryCard(r, storeName, container));
            }
        }


        function _renderHistoryCard(r, storeName, container) {
            const canToggle = ['quotations', 'invoices'].includes(storeName);
            const statusLower = (r.status || 'unpaid').toLowerCase();
            let badgeClass = 'is-unpaid';
            if (statusLower === 'paid') badgeClass = 'is-paid';
            else if (statusLower === 'draft') badgeClass = 'is-draft';
            else if (statusLower === 'active') badgeClass = 'is-active';
            else if (statusLower === 'completed') badgeClass = 'is-completed';
            else if (statusLower === 'terminated') badgeClass = 'is-terminated';

            const toggleAttr = canToggle
                ? `onclick="window.toggleStatus('${r.id}', '${storeName}', '${r.status}')" title="Click to toggle status"`
                : '';

            const amountStr = r.amount > 0
                ? `${new Intl.NumberFormat('en-US').format(r.amount)}&nbsp;${r.currency || ''}`
                : '<span class="history-record-amount-zero">—</span>';

            const div = document.createElement('div');
            div.className = 'history-record-row';
            div.innerHTML = `
                <div class="history-record-main">
                    <div class="history-record-client">${r.client || '—'}</div>
                    <div class="history-record-meta">${r.ref || '—'} &nbsp;·&nbsp; ${r.date || '—'}</div>
                </div>
                <div class="history-record-amount">${amountStr}</div>
                <span class="history-status-badge ${badgeClass}${canToggle ? ' can-toggle' : ''}" ${toggleAttr}>${r.status || 'unpaid'}</span>
                <button onclick="window.editHistoryRecord('${r.id}', '${storeName}')" class="history-record-edit" title="Edit record">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <button onclick="window.deleteRecord('${r.id}', '${storeName}')" class="history-record-del" title="Delete record">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            container.appendChild(div);
        }

        window.renderHistoryList = async function() {
            const container = document.getElementById('history-list-container');
            const emptyEl = document.getElementById('history-empty');
            if (!container) return;

            const searchVal = (document.getElementById('history-search')?.value || '').toLowerCase();
            const filterClient = document.getElementById('history-filter-client')?.value || '';
            const filterDateVal = document.getElementById('history-filter-date')?.value || '';
            const { filterYear, filterMonth, filterDay } = parseDateFilter(filterDateVal);
            const sortVal = document.getElementById('history-sort')?.value || 'newest';

            // Show loading state while fetching
            container.innerHTML = '<div style="text-align:center;padding:32px;color:#94A3B8;">Loading…</div>';
            if (emptyEl) emptyEl.classList.add('hidden');

            const allRecords = await cloudDB.getAll('quotations');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchStatus = currentHistoryFilter === 'all' ? r.status !== 'archived' : r.status === currentHistoryFilter;
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                return matchSearch && matchStatus && matchClient && matchYear && matchMonth && matchDay;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'quot-hist-stat-total', value:'quot-hist-stat-value', accepted:'quot-hist-stat-accepted', pending:'quot-hist-stat-pending'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'quotations', container, sortVal);
        };

        window.renderInvHistoryList = async function() {
            const container = document.getElementById('inv-history-list-container');
            const emptyEl = document.getElementById('inv-history-empty');
            if (!container) return;

            const searchVal = (document.getElementById('inv-history-search')?.value || '').toLowerCase();
            const filterClient = document.getElementById('inv-history-filter-client')?.value || '';
            const filterDateVal = document.getElementById('inv-history-filter-date')?.value || '';
            const { filterYear, filterMonth, filterDay } = parseDateFilter(filterDateVal);
            const sortVal = document.getElementById('inv-history-sort')?.value || 'newest';

            // Show loading state while fetching
            container.innerHTML = '<div style="text-align:center;padding:32px;color:#94A3B8;">Loading…</div>';
            if (emptyEl) emptyEl.classList.add('hidden');

            const allRecords = (window.supabaseDB && window.supabaseDB.ready)
                ? await window.supabaseDB.getInvoices()
                : await cloudDB.getAll('invoices');
            console.log('fetched invoices count', allRecords.length);

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('inv-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchStatus = currentInvHistoryFilter === 'all' ? r.status !== 'archived' : r.status === currentInvHistoryFilter;
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                return matchSearch && matchStatus && matchClient && matchYear && matchMonth && matchDay;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'inv-hist-stat-total', paid:'inv-hist-stat-paid', unpaid:'inv-hist-stat-unpaid', value:'inv-hist-stat-value', thisMonth:'inv-hist-stat-month'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'invoices', container, sortVal);
        };

        window.renderCtHistoryList = async function() {
            const container = document.getElementById('ct-history-list-container');
            const emptyEl = document.getElementById('ct-history-empty');
            if (!container) return;

            const searchVal = (document.getElementById('ct-history-search')?.value || '').toLowerCase();
            const filterClient = document.getElementById('ct-history-filter-client')?.value || '';
            const filterDateVal = document.getElementById('ct-history-filter-date')?.value || '';
            const { filterYear, filterMonth, filterDay } = parseDateFilter(filterDateVal);
            const filterStatus = document.getElementById('ct-history-filter-status')?.value || '';
            const sortVal = document.getElementById('ct-history-sort')?.value || 'newest';

            // Show loading state while fetching
            container.innerHTML = '<div style="text-align:center;padding:32px;color:#94A3B8;">Loading…</div>';
            if (emptyEl) emptyEl.classList.add('hidden');

            const allRecords = await cloudDB.getAll('clientContracts');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('ct-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                const matchStatus = filterStatus ? r.status === filterStatus : r.status !== 'archived';
                return matchSearch && matchClient && matchYear && matchMonth && matchDay && matchStatus;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'ct-hist-stat-total', active:'ct-hist-stat-active', draft:'ct-hist-stat-draft', expired:'ct-hist-stat-expired', value:'ct-hist-stat-value'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'clientContracts', container, sortVal);
        };

        window.renderEcHistoryList = async function() {
            const container = document.getElementById('ec-history-list-container');
            const emptyEl = document.getElementById('ec-history-empty');
            if (!container) return;

            const searchVal = (document.getElementById('ec-history-search')?.value || '').toLowerCase();
            const filterClient = document.getElementById('ec-history-filter-client')?.value || '';
            const filterDateVal = document.getElementById('ec-history-filter-date')?.value || '';
            const { filterYear, filterMonth, filterDay } = parseDateFilter(filterDateVal);
            const filterStatus = document.getElementById('ec-history-filter-status')?.value || '';
            const sortVal = document.getElementById('ec-history-sort')?.value || 'newest';

            // Show loading state while fetching
            container.innerHTML = '<div style="text-align:center;padding:32px;color:#94A3B8;">Loading…</div>';
            if (emptyEl) emptyEl.classList.add('hidden');

            const allRecords = await cloudDB.getAll('hrContracts');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('ec-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                const matchStatus = filterStatus ? r.status === filterStatus : r.status !== 'archived';
                return matchSearch && matchClient && matchYear && matchMonth && matchDay && matchStatus;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'ec-hist-stat-total', active:'ec-hist-stat-active', draft:'ec-hist-stat-draft', expired:'ec-hist-stat-expired'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'hrContracts', container, sortVal);
        };

        window.toggleStatus = async function(id, storeName, currentStatus) {
            const newStatus = currentStatus === 'paid' ? 'unpaid' : 'paid';
            if (storeName === 'invoices' && window.supabaseDB && window.supabaseDB.ready) {
                try {
                    const existing = (await window.supabaseDB.getInvoices()).find(r => r.id === id);
                    if (existing) {
                        existing.status = newStatus;
                        await window.supabaseDB.saveInvoice(existing);
                    }
                } catch (e) {
                    console.warn('[OPENY] toggleStatus Supabase update failed:', e.message);
                }
                window.renderInvHistoryList();
                return;
            }
            const records = await cloudDB.getAll(storeName);
            const record = records.find(r => r.id === id);
            if (record) {
                record.status = newStatus;
                await cloudDB.put(record, storeName);
                if (storeName === 'quotations') window.renderHistoryList();
                else if (storeName === 'invoices') window.renderInvHistoryList();
            }
        };

        function _refreshHistoryList(storeName) {
            if (storeName === 'quotations') window.renderHistoryList();
            else if (storeName === 'invoices') window.renderInvHistoryList();
            else if (storeName === 'clientContracts') window.renderCtHistoryList();
            else if (storeName === 'hrContracts') window.renderEcHistoryList();
        }

        window.deleteRecord = async function(id, storeName) {
            const archivable = ['quotations', 'invoices', 'clientContracts', 'hrContracts'];
            const useArchive = archivable.includes(storeName);
            const title   = useArchive ? 'Archive Record' : 'Delete Record';
            const message = useArchive
                ? 'Archive this record? It will be hidden from the active list but is not permanently deleted.'
                : 'Are you sure you want to delete this record? This action cannot be undone.';
            window.openConfirmModal(title, message, async () => {
                try {
                    if (useArchive) {
                        const all = await cloudDB.getAll(storeName);
                        const rec = all.find(r => r.id === id);
                        if (rec) await cloudDB.put({ ...rec, status: 'archived' }, storeName);
                    } else {
                        await cloudDB.delete(id, storeName);
                    }
                    _refreshHistoryList(storeName);
                    showToast(useArchive ? 'Record archived.' : 'Record deleted.');
                } catch(e) {
                    console.error('Delete/archive failed:', e);
                    showToast('Operation failed. Please try again.');
                    _refreshHistoryList(storeName);
                }
            });
        };

        window.setHistoryFilter = function(filter) {
            currentHistoryFilter = filter;
            document.querySelectorAll('.filter-chip').forEach(btn => {
                btn.classList.remove('active', 'active-paid', 'active-unpaid');
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                    if (filter === 'paid') btn.classList.add('active-paid');
                    if (filter === 'unpaid') btn.classList.add('active-unpaid');
                }
            });
            window.renderHistoryList();
        };

        window.setInvHistoryFilter = function(filter) {
            currentInvHistoryFilter = filter;
            document.querySelectorAll('.filter-chip-inv').forEach(btn => {
                btn.classList.remove('active', 'active-paid', 'active-unpaid');
                if (btn.dataset.filter === filter) {
                    btn.classList.add('active');
                    if (filter === 'paid') btn.classList.add('active-paid');
                    if (filter === 'unpaid') btn.classList.add('active-unpaid');
                }
            });
            window.renderInvHistoryList();
        };

        window.resetHistoryFilters = function() {
            const el = id => document.getElementById(id);
            if (el('history-filter-client')) el('history-filter-client').value = '';
            if (el('history-filter-date')) el('history-filter-date').value = '';
            if (el('history-sort')) el('history-sort').value = 'newest';
            if (el('history-search')) el('history-search').value = '';
            window.setHistoryFilter('all');
        };

        window.resetInvHistoryFilters = function() {
            const el = id => document.getElementById(id);
            if (el('inv-history-filter-client')) el('inv-history-filter-client').value = '';
            if (el('inv-history-filter-date')) el('inv-history-filter-date').value = '';
            if (el('inv-history-sort')) el('inv-history-sort').value = 'newest';
            if (el('inv-history-search')) el('inv-history-search').value = '';
            window.setInvHistoryFilter('all');
        };

        window.resetCtHistoryFilters = function() {
            const el = id => document.getElementById(id);
            if (el('ct-history-search')) el('ct-history-search').value = '';
            if (el('ct-history-filter-client')) el('ct-history-filter-client').value = '';
            if (el('ct-history-filter-date')) el('ct-history-filter-date').value = '';
            if (el('ct-history-filter-status')) el('ct-history-filter-status').value = '';
            if (el('ct-history-sort')) el('ct-history-sort').value = 'newest';
            window.renderCtHistoryList();
        };

        window.resetEcHistoryFilters = function() {
            const el = id => document.getElementById(id);
            if (el('ec-history-search')) el('ec-history-search').value = '';
            if (el('ec-history-filter-client')) el('ec-history-filter-client').value = '';
            if (el('ec-history-filter-date')) el('ec-history-filter-date').value = '';
            if (el('ec-history-filter-status')) el('ec-history-filter-status').value = '';
            if (el('ec-history-sort')) el('ec-history-sort').value = 'newest';
            window.renderEcHistoryList();
        };


        // ==========================================================================
        // HISTORY EDIT FUNCTIONALITY
        // ==========================================================================

        // --- Snapshot capture helpers ---

        function _captureQuoteSnapshot() {
            return structuredClone(appState);
        }

        function _captureInvoiceSnapshot() {
            const v = id => document.getElementById(id)?.value || '';
            const c = id => document.getElementById(id)?.checked || false;
            const snapshot = {
                totalBudget: v('totalBudget'),
                currency: v('currency'),
                clientName: v('clientName'),
                campaignMonth: v('campaignMonth'),
                invoiceDate: v('invoiceDate'),
                invCustomClientName: v('inv-custom-client-name'),
                invCustomProject: v('inv-custom-project'),
                invCustomDesc: v('inv-custom-desc'),
                invCustomServices: structuredClone(invCustomServices),
                platIG: c('platIG'), countIG: v('countIG'), percIG: v('percNum-IG'),
                platSnap: c('platSnap'), countSnap: v('countSnap'), percSnap: v('percNum-Snap'),
                platTikTok: c('platTikTok'), countTikTok: v('countTikTok'), percTikTok: v('percNum-TikTok'),
                platGoogle: c('platGoogle'), countGoogle: v('countGoogle'), percGoogle: v('percNum-Google'),
                platSalla: c('platSalla'), countSalla: v('countSalla'), percSalla: v('percNum-Salla')
            };
            return snapshot;
        }

        function _captureCtSnapshot() {
            const v = id => document.getElementById(id)?.value || '';
            const services = _readCtServices();
            const clauses = _readClauses('#ct-clauses-container');
            return {
                num: v('ct-num'), date: v('ct-date'), duration: v('ct-duration'),
                status: v('ct-status'), currency: v('ct-currency'), lang: v('ct-lang'),
                p1Name: v('ct-p1-name'), p1Rep: v('ct-p1-rep'), p1Address: v('ct-p1-address'),
                p1Email: v('ct-p1-email'), p1Phone: v('ct-p1-phone'), p1Website: v('ct-p1-website'), p1Tax: v('ct-p1-tax'),
                p2Name: v('ct-p2-name'), p2Rep: v('ct-p2-rep'), p2Address: v('ct-p2-address'),
                p2Email: v('ct-p2-email'), p2Phone: v('ct-p2-phone'), p2Website: v('ct-p2-website'), p2Tax: v('ct-p2-tax'),
                totalValue: v('ct-total-value'), paymentMethod: v('ct-payment-method'),
                paymentTerms: v('ct-payment-terms'), financialNotes: v('ct-financial-notes'),
                sig1Name: v('ct-sig1-name'), sig2Name: v('ct-sig2-name'),
                sigDate: v('ct-sig-date'), sigPlace: v('ct-sig-place'),
                services: services, clauses: clauses
            };
        }

        function _captureEcSnapshot() {
            const v = id => document.getElementById(id)?.value || '';
            const clauses = _readClauses('#ec-clauses-container');
            return {
                num: v('ec-num'), date: v('ec-date'), duration: v('ec-duration'),
                status: v('ec-status'), currency: v('ec-currency'), lang: v('ec-lang'),
                coName: v('ec-co-name'), coRep: v('ec-co-rep'), coAddress: v('ec-co-address'),
                coEmail: v('ec-co-email'), coPhone: v('ec-co-phone'),
                empName: v('ec-emp-name'), empId: v('ec-emp-id'), empAddress: v('ec-emp-address'),
                empPhone: v('ec-emp-phone'), empEmail: v('ec-emp-email'),
                empNationality: v('ec-emp-nationality'), empMarital: v('ec-emp-marital'),
                jobTitle: v('ec-job-title'), jobDept: v('ec-job-dept'),
                jobManager: v('ec-job-manager'), jobType: v('ec-job-type'),
                startDate: v('ec-start-date'), empDuration: v('ec-emp-duration'),
                probation: v('ec-probation'), workplace: v('ec-workplace'),
                salary: v('ec-salary'), payMethod: v('ec-pay-method'),
                payDate: v('ec-pay-date'), benefits: v('ec-benefits'),
                dailyHours: v('ec-daily-hours'), workDays: v('ec-work-days'), vacations: v('ec-vacations'),
                sig1Name: v('ec-sig1-name'), sig2Name: v('ec-sig2-name'),
                sigDate: v('ec-sig-date'), sigPlace: v('ec-sig-place'),
                clauses: clauses
            };
        }

        // --- Snapshot restore helpers ---

        function _restoreQuoteSnapshot(snapshot) {
            if (!snapshot) return;
            appState = Object.assign({}, appState, snapshot);
            if (typeof window.populateForm === 'function') window.populateForm();
        }

        function _restoreInvoiceSnapshot(snapshot) {
            if (!snapshot) return;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
            set('totalBudget', snapshot.totalBudget);
            set('currency', snapshot.currency);
            set('clientName', snapshot.clientName);
            set('campaignMonth', snapshot.campaignMonth);
            set('invoiceDate', snapshot.invoiceDate);
            set('inv-custom-client-name', snapshot.invCustomClientName);
            set('inv-custom-project', snapshot.invCustomProject);
            set('inv-custom-desc', snapshot.invCustomDesc);

            if (snapshot.invCustomServices && snapshot.invCustomServices.length > 0) {
                const container = document.getElementById('inv-services-container');
                if (container) container.innerHTML = '';
                invCustomServices = [];
                snapshot.invCustomServices.forEach(s => {
                    if (typeof window.renderInvServiceRow === 'function') window.renderInvServiceRow(s.id, s.name, s.scope);
                    invCustomServices.push({ id: s.id, name: s.name, scope: s.scope });
                });
            }

            setCheck('platIG', snapshot.platIG); set('countIG', snapshot.countIG); set('percNum-IG', snapshot.percIG); set('percSlider-IG', snapshot.percIG);
            setCheck('platSnap', snapshot.platSnap); set('countSnap', snapshot.countSnap); set('percNum-Snap', snapshot.percSnap); set('percSlider-Snap', snapshot.percSnap);
            setCheck('platTikTok', snapshot.platTikTok); set('countTikTok', snapshot.countTikTok); set('percNum-TikTok', snapshot.percTikTok); set('percSlider-TikTok', snapshot.percTikTok);
            setCheck('platGoogle', snapshot.platGoogle); set('countGoogle', snapshot.countGoogle); set('percNum-Google', snapshot.percGoogle); set('percSlider-Google', snapshot.percGoogle);
            setCheck('platSalla', snapshot.platSalla); set('countSalla', snapshot.countSalla); set('percNum-Salla', snapshot.percSalla); set('percSlider-Salla', snapshot.percSalla);

            if (typeof window.toggleDetailedOptions === 'function') window.toggleDetailedOptions();
            if (typeof window.updateAllocations === 'function') window.updateAllocations();
        }

        function _restoreCtSnapshot(snapshot) {
            if (!snapshot) return;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            set('ct-num', snapshot.num); set('ct-date', snapshot.date); set('ct-duration', snapshot.duration);
            set('ct-status', snapshot.status); set('ct-currency', snapshot.currency); set('ct-lang', snapshot.lang);
            set('ct-p1-name', snapshot.p1Name); set('ct-p1-rep', snapshot.p1Rep); set('ct-p1-address', snapshot.p1Address);
            set('ct-p1-email', snapshot.p1Email); set('ct-p1-phone', snapshot.p1Phone); set('ct-p1-website', snapshot.p1Website); set('ct-p1-tax', snapshot.p1Tax);
            set('ct-p2-name', snapshot.p2Name); set('ct-p2-rep', snapshot.p2Rep); set('ct-p2-address', snapshot.p2Address);
            set('ct-p2-email', snapshot.p2Email); set('ct-p2-phone', snapshot.p2Phone); set('ct-p2-website', snapshot.p2Website); set('ct-p2-tax', snapshot.p2Tax);
            set('ct-total-value', snapshot.totalValue); set('ct-payment-method', snapshot.paymentMethod);
            set('ct-payment-terms', snapshot.paymentTerms); set('ct-financial-notes', snapshot.financialNotes);
            set('ct-sig1-name', snapshot.sig1Name); set('ct-sig2-name', snapshot.sig2Name);
            set('ct-sig-date', snapshot.sigDate); set('ct-sig-place', snapshot.sigPlace);

            if (snapshot.services) {
                const svcContainer = document.getElementById('ct-services-container');
                if (svcContainer) {
                    svcContainer.innerHTML = '';
                    snapshot.services.forEach(s => {
                        if (typeof window.addContractService === 'function') window.addContractService(s);
                    });
                }
            }

            if (snapshot.clauses) {
                const lang = snapshot.lang || 'ar';
                const clContainer = document.getElementById('ct-clauses-container');
                if (clContainer) {
                    clContainer.innerHTML = '';
                    snapshot.clauses.forEach(cl => {
                        _renderClauseRow('ct', { id: _cid(), title: cl.title, text: cl.text }, clContainer, lang);
                    });
                    const cc = document.getElementById('ct-clauses-count');
                    if (cc) cc.textContent = snapshot.clauses.length;
                }
            }

            if (typeof window.renderContractPreview === 'function') window.renderContractPreview();
        }

        function _restoreEcSnapshot(snapshot) {
            if (!snapshot) return;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            set('ec-num', snapshot.num); set('ec-date', snapshot.date); set('ec-duration', snapshot.duration);
            set('ec-status', snapshot.status); set('ec-currency', snapshot.currency); set('ec-lang', snapshot.lang);
            set('ec-co-name', snapshot.coName); set('ec-co-rep', snapshot.coRep); set('ec-co-address', snapshot.coAddress);
            set('ec-co-email', snapshot.coEmail); set('ec-co-phone', snapshot.coPhone);
            set('ec-emp-name', snapshot.empName); set('ec-emp-id', snapshot.empId); set('ec-emp-address', snapshot.empAddress);
            set('ec-emp-phone', snapshot.empPhone); set('ec-emp-email', snapshot.empEmail);
            set('ec-emp-nationality', snapshot.empNationality); set('ec-emp-marital', snapshot.empMarital);
            set('ec-job-title', snapshot.jobTitle); set('ec-job-dept', snapshot.jobDept);
            set('ec-job-manager', snapshot.jobManager); set('ec-job-type', snapshot.jobType);
            set('ec-start-date', snapshot.startDate); set('ec-emp-duration', snapshot.empDuration);
            set('ec-probation', snapshot.probation); set('ec-workplace', snapshot.workplace);
            set('ec-salary', snapshot.salary); set('ec-pay-method', snapshot.payMethod);
            set('ec-pay-date', snapshot.payDate); set('ec-benefits', snapshot.benefits);
            set('ec-daily-hours', snapshot.dailyHours); set('ec-work-days', snapshot.workDays); set('ec-vacations', snapshot.vacations);
            set('ec-sig1-name', snapshot.sig1Name); set('ec-sig2-name', snapshot.sig2Name);
            set('ec-sig-date', snapshot.sigDate); set('ec-sig-place', snapshot.sigPlace);

            if (snapshot.clauses) {
                const lang = snapshot.lang || 'ar';
                const clContainer = document.getElementById('ec-clauses-container');
                if (clContainer) {
                    clContainer.innerHTML = '';
                    snapshot.clauses.forEach(cl => {
                        _renderEmpClauseRow({ id: _cid(), title: cl.title, text: cl.text }, clContainer, lang);
                    });
                    const ec = document.getElementById('ec-clauses-count');
                    if (ec) ec.textContent = snapshot.clauses.length;
                }
            }

            if (typeof window.renderEmpContractPreview === 'function') window.renderEmpContractPreview();
        }

        // --- Edit dispatch ---

        window.editHistoryRecord = async function(id, storeName) {
            const allRecords = await cloudDB.getAll(storeName);
            const record = allRecords.find(r => r.id === id);
            if (!record) return showToast('Record not found.');

            if (storeName === 'quotations') {
                currentEditingHistoryId = id;
                if (record.formSnapshot) {
                    _restoreQuoteSnapshot(record.formSnapshot);
                } else {
                    appState['client-name'] = record.client || appState['client-name'];
                    appState['quote-num'] = record.ref || appState['quote-num'];
                    appState.date = record.date || appState.date;
                    appState.finalPrice = record.amount || appState.finalPrice;
                    appState.currency = record.currency || appState.currency;
                    if (typeof window.populateForm === 'function') window.populateForm();
                }
                window.switchMainModule('quotation');
                window.switchTab('editor');
                const banner = document.getElementById('edit-mode-banner');
                const bannerText = document.getElementById('edit-mode-text');
                if (banner) banner.classList.remove('hidden');
                if (bannerText) bannerText.textContent = `Editing: ${record.client || record.ref || 'record'}`;

            } else if (storeName === 'invoices') {
                currentEditingInvHistoryId = id;
                if (record.formSnapshot) {
                    _restoreInvoiceSnapshot(record.formSnapshot);
                } else {
                    const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val; };
                    set('totalBudget', record.amount);
                    set('currency', record.currency);
                    if (typeof window.toggleDetailedOptions === 'function') window.toggleDetailedOptions();
                    if (typeof window.updateAllocations === 'function') window.updateAllocations();
                }
                window.switchMainModule('invoice');
                window.switchInvTab('editor');
                const banner = document.getElementById('inv-edit-mode-banner');
                const bannerText = document.getElementById('inv-edit-mode-text');
                if (banner) banner.classList.remove('hidden');
                if (bannerText) bannerText.textContent = `Editing: ${record.client || record.ref || 'record'}`;

            } else if (storeName === 'clientContracts') {
                currentEditingCtId = id;
                if (record.formSnapshot) {
                    _restoreCtSnapshot(record.formSnapshot);
                } else {
                    const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val; };
                    set('ct-p2-name', record.client);
                    set('ct-num', record.ref);
                    set('ct-date', record.date);
                    set('ct-total-value', record.amount);
                    set('ct-currency', record.currency);
                    set('ct-status', record.status);
                    if (typeof window.renderContractPreview === 'function') window.renderContractPreview();
                }
                window.switchMainModule('contract');
                window.switchContractTab('editor');
                const banner = document.getElementById('ct-edit-mode-banner');
                const bannerText = document.getElementById('ct-edit-mode-text');
                if (banner) banner.classList.remove('hidden');
                if (bannerText) bannerText.textContent = `Editing: ${record.client || record.ref || 'record'}`;

            } else if (storeName === 'hrContracts') {
                currentEditingEcId = id;
                if (record.formSnapshot) {
                    _restoreEcSnapshot(record.formSnapshot);
                } else {
                    const set = (eid, val) => { const el = document.getElementById(eid); if (el) el.value = val; };
                    set('ec-emp-name', record.client);
                    set('ec-num', record.ref);
                    set('ec-date', record.date);
                    set('ec-salary', record.amount);
                    set('ec-currency', record.currency);
                    set('ec-status', record.status);
                    if (typeof window.renderEmpContractPreview === 'function') window.renderEmpContractPreview();
                }
                window.switchMainModule('empcontract');
                window.switchEmpContractTab('editor');
                const banner = document.getElementById('ec-edit-mode-banner');
                const bannerText = document.getElementById('ec-edit-mode-text');
                if (banner) banner.classList.remove('hidden');
                if (bannerText) bannerText.textContent = `Editing: ${record.client || record.ref || 'record'}`;
            }

            showToast('Record loaded for editing.');
            setTimeout(() => { if (typeof window.adjustLayout === 'function') window.adjustLayout(); }, 100);
        };

        // --- Stop editing ---

        window.stopEditing = function() {
            currentEditingHistoryId = null;
            const banner = document.getElementById('edit-mode-banner');
            if (banner) banner.classList.add('hidden');
        };

        window.stopInvEditing = function() {
            currentEditingInvHistoryId = null;
            const banner = document.getElementById('inv-edit-mode-banner');
            if (banner) banner.classList.add('hidden');
        };

        window.stopCtEditing = function() {
            currentEditingCtId = null;
            const banner = document.getElementById('ct-edit-mode-banner');
            if (banner) banner.classList.add('hidden');
        };

        window.stopEcEditing = function() {
            currentEditingEcId = null;
            const banner = document.getElementById('ec-edit-mode-banner');
            if (banner) banner.classList.add('hidden');
        };

        // --- Duplicate as New ---
        // Clears the current editing ID and generates a new reference number so
        // the next export saves as a brand-new independent record.

        window.duplicateAsNew = async function(storeName) {
            if (storeName === 'quotations') {
                currentEditingHistoryId = null;
                // Derive next quote number from existing records
                const year = new Date().getFullYear();
                const prefix = `Q-${year}-`;
                const records = await cloudDB.getAll('quotations');
                let maxNum = 100;
                records.forEach(r => {
                    if (r.ref && r.ref.startsWith(prefix)) {
                        const n = parseInt(r.ref.slice(prefix.length), 10);
                        if (!isNaN(n) && n > maxNum) maxNum = n;
                    }
                });
                const newQuoteNum = `${prefix}${maxNum + 1}`;
                appState['quote-num'] = newQuoteNum;
                const el = document.getElementById('in-quote-num');
                if (el) el.value = newQuoteNum;
                const banner = document.getElementById('edit-mode-banner');
                if (banner) banner.classList.add('hidden');
                showToast('Duplicate ready — export to save as a new record.');

            } else if (storeName === 'invoices') {
                currentEditingInvHistoryId = null;
                // Generate next invoice number
                await initInvoiceNumber();
                const el = document.getElementById('invoiceRef');
                if (el) el.value = currentInvoiceRef;
                const banner = document.getElementById('inv-edit-mode-banner');
                if (banner) banner.classList.add('hidden');
                showToast('Duplicate ready — export to save as a new invoice.');

            } else if (storeName === 'clientContracts') {
                currentEditingCtId = null;
                // Generate next contract number based on existing records
                const year = new Date().getFullYear();
                const prefix = `C-${year}-`;
                const records = await cloudDB.getAll('clientContracts');
                let maxNum = 0;
                records.forEach(r => {
                    if (r.ref && r.ref.startsWith(prefix)) {
                        const n = parseInt(r.ref.slice(prefix.length), 10);
                        if (!isNaN(n) && n > maxNum) maxNum = n;
                    }
                });
                const newCtNum = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
                const ctEl = document.getElementById('ct-num');
                if (ctEl) { ctEl.value = newCtNum; if (typeof window.renderContractPreview === 'function') window.renderContractPreview(); }
                const banner = document.getElementById('ct-edit-mode-banner');
                if (banner) banner.classList.add('hidden');
                showToast('Duplicate ready — export to save as a new contract.');

            } else if (storeName === 'hrContracts') {
                currentEditingEcId = null;
                // Generate next HR contract number based on existing records
                const year = new Date().getFullYear();
                const prefix = `EC-${year}-`;
                const records = await cloudDB.getAll('hrContracts');
                let maxNum = 0;
                records.forEach(r => {
                    if (r.ref && r.ref.startsWith(prefix)) {
                        const n = parseInt(r.ref.slice(prefix.length), 10);
                        if (!isNaN(n) && n > maxNum) maxNum = n;
                    }
                });
                const newEcNum = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
                const ecEl = document.getElementById('ec-num');
                if (ecEl) { ecEl.value = newEcNum; if (typeof window.renderEmpContractPreview === 'function') window.renderEmpContractPreview(); }
                const banner = document.getElementById('ec-edit-mode-banner');
                if (banner) banner.classList.add('hidden');
                showToast('Duplicate ready — export to save as a new HR contract.');
            }
        };

        window.clearHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Quotation records?", async () => {
                await cloudDB.clear('quotations');
                window.renderHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearInvHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Invoice records?", async () => {
                await cloudDB.clear('invoices');
                window.renderInvHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearCtHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Contract records?", async () => {
                await cloudDB.clear('clientContracts');
                window.renderCtHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearEcHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Employee Contract records?", async () => {
                await cloudDB.clear('hrContracts');
                window.renderEcHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearAllHistory = async function() {
            window.openConfirmModal(
                "Clear All System History",
                "This will permanently delete ALL history records across every module (Quotations, Invoices, Client Contracts, HR Contracts, Salary History, Activity Logs, and Accounting). This action cannot be undone.",
                async () => {
                    const stores = ['quotations', 'invoices', 'clientContracts', 'hrContracts', 'salaryHistory', 'activityLogs', 'acctLedger', 'acctExpenses'];
                    const failed = [];
                    await Promise.all(stores.map(s => cloudDB.clear(s).catch(() => failed.push(s))));
                    if (typeof window.renderHistoryList === 'function') window.renderHistoryList();
                    if (typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                    if (typeof window.renderCtHistoryList === 'function') window.renderCtHistoryList();
                    if (typeof window.renderEcHistoryList === 'function') window.renderEcHistoryList();
                    if (typeof window.renderEmployeesOverview === 'function') window.renderEmployeesOverview();
                    if (typeof window.renderEmployeesList === 'function') window.renderEmployeesList();
                    if (typeof window.renderAcctLedger === 'function') window.renderAcctLedger();
                    if (typeof window.renderAcctExpenses === 'function') window.renderAcctExpenses();
                    if (typeof window.renderAcctSummary === 'function') window.renderAcctSummary();
                    if (failed.length > 0) {
                        showToast("Some stores could not be cleared: " + failed.join(', '));
                    } else {
                        showToast("All system history has been cleared.");
                    }
                }
            );
        };

        window.exportBackup = async function() {
            const records = await cloudDB.getAll('quotations');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_quote_backup.json");
            dlAnchorElem.click();
        };

        window.exportInvBackup = async function() {
            const records = await cloudDB.getAll('invoices');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_inv_backup.json");
            dlAnchorElem.click();
        };

        window.exportCtBackup = async function() {
            const records = await cloudDB.getAll('clientContracts');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_contract_backup.json");
            dlAnchorElem.click();
        };

        window.exportEcBackup = async function() {
            const records = await cloudDB.getAll('hrContracts');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_empcontract_backup.json");
            dlAnchorElem.click();
        };

        window.importBackup = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (Array.isArray(data)) {
                        for(const item of data) {
                            await cloudDB.put(item, 'quotations');
                        }
                        window.renderHistoryList();
                        showToast("Backup restored successfully.");
                    }
                } catch (err) {
                    showToast("Invalid backup file.");
                }
            };
            reader.readAsText(file);
        };

        window.importInvBackup = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (Array.isArray(data)) {
                        for(const item of data) {
                            await cloudDB.put(item, 'invoices');
                        }
                        window.renderInvHistoryList();
                        showToast("Backup restored successfully.");
                    }
                } catch (err) {
                    showToast("Invalid backup file.");
                }
            };
            reader.readAsText(file);
        };

        window.importCtBackup = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (Array.isArray(data)) {
                        for (const item of data) await cloudDB.put(item, 'clientContracts');
                        window.renderCtHistoryList();
                        showToast("Backup restored successfully.");
                    }
                } catch (err) { showToast("Invalid backup file."); }
            };
            reader.readAsText(file);
        };

        window.importEcBackup = function(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (Array.isArray(data)) {
                        for (const item of data) await cloudDB.put(item, 'hrContracts');
                        window.renderEcHistoryList();
                        showToast("Backup restored successfully.");
                    }
                } catch (err) { showToast("Invalid backup file."); }
            };
            reader.readAsText(file);
        };

        // ==========================================================================
        // 10. CONTRACT SYSTEM — CLIENT CONTRACT (عقد العميل)
        // ==========================================================================

        let ctServices = [];
        let ctClauses = [];
        let ecClauses = [];
        let ctRenderTimeout, ecRenderTimeout;
        let contractLang = 'ar';
        let empContractLang = 'ar';

        // ==========================================================================
        // CONTRACT CONTENT TRANSLATIONS (Arabic / English)
        // ==========================================================================
        const CONTRACT_CONTENT = {
            ar: {
                clientContractTitle: 'عقد خدمات تسويق رقمي',
                clientContractSubtitle: 'Digital Marketing Services Agreement',
                empContractTitle: 'عقد توظيف',
                empContractSubtitle: 'Employment Contract',
                contractLabel: 'عقد',
                employmentContractLabel: 'عقد توظيف',
                noLabel: 'رقم:',
                dateLabel: 'التاريخ:',
                durationLabel: 'المدة:',
                monthsLabel: 'شهراً',
                party1Provider: 'الطرف الأول — مقدم الخدمة',
                party2Client: 'الطرف الثاني — العميل',
                employer: 'صاحب العمل',
                employee: 'الموظف',
                repLabel: 'المندوب:',
                taxLabel: 'السجل الضريبي:',
                idLabel: 'رقم الهوية:',
                nationalityLabel: 'الجنسية:',
                maritalLabel: 'الحالة الاجتماعية:',
                includedServices: 'الخدمات المشمولة',
                financialDetails: 'التفاصيل المالية',
                paymentMethod: 'طريقة الدفع',
                paymentTerms: 'شروط الدفع',
                notesLabel: 'ملاحظات',
                totalContractValue: 'إجمالي قيمة العقد',
                termsConditions: 'الشروط والأحكام',
                sigParty1: 'الطرف الأول',
                sigParty2: 'الطرف الثاني',
                authorizedRep: 'الممثل المفوض',
                companyRep: 'ممثل الشركة',
                clientNameDefault: 'اسم العميل',
                employeeNameDefault: 'اسم الموظف',
                sigDate: 'التاريخ:',
                sigPlace: 'المكان:',
                jobDetails: 'تفاصيل الوظيفة',
                jobTitle: 'المسمى الوظيفي',
                department: 'القسم',
                directManager: 'المدير المباشر',
                employmentType: 'نوع التوظيف',
                startDate: 'تاريخ البدء',
                duration: 'المدة',
                probation: 'فترة التجربة',
                workplace: 'مكان العمل',
                compensation: 'الراتب والمزايا',
                paymentDate: 'تاريخ الدفع',
                dailyHours: 'ساعات العمل اليومية',
                workDays: 'أيام العمل',
                annualLeave: 'الإجازة السنوية',
                benefits: 'المزايا',
                basicMonthlySalary: 'الراتب الشهري الأساسي',
                hrsPerDay: 'ساعة/يوم',
                defaultCompanyName: 'OPENY',
                clauseTitlePlaceholder: 'عنوان البند (عربي)',
                clauseTextPlaceholder: 'نص البند (عربي)...',
            },
            en: {
                clientContractTitle: 'Digital Marketing Services Agreement',
                clientContractSubtitle: 'عقد خدمات تسويق رقمي',
                empContractTitle: 'Employment Contract',
                empContractSubtitle: 'عقد توظيف',
                contractLabel: 'CONTRACT',
                employmentContractLabel: 'EMPLOYMENT CONTRACT',
                noLabel: 'NO:',
                dateLabel: 'DATE:',
                durationLabel: 'DURATION:',
                monthsLabel: 'Months',
                party1Provider: 'PARTY 1 — SERVICE PROVIDER',
                party2Client: 'PARTY 2 — CLIENT',
                employer: 'EMPLOYER',
                employee: 'EMPLOYEE',
                repLabel: 'Rep:',
                taxLabel: 'Tax Reg:',
                idLabel: 'ID:',
                nationalityLabel: 'Nationality:',
                maritalLabel: 'Status:',
                includedServices: 'INCLUDED SERVICES',
                financialDetails: 'FINANCIAL DETAILS',
                paymentMethod: 'Payment Method',
                paymentTerms: 'Payment Terms',
                notesLabel: 'Notes',
                totalContractValue: 'TOTAL CONTRACT VALUE',
                termsConditions: 'TERMS & CONDITIONS',
                sigParty1: 'Party 1',
                sigParty2: 'Party 2',
                authorizedRep: 'Authorized Representative',
                companyRep: 'Company Representative',
                clientNameDefault: 'Client Name',
                employeeNameDefault: 'Employee Name',
                sigDate: 'Date:',
                sigPlace: 'Place:',
                jobDetails: 'JOB DETAILS',
                jobTitle: 'Job Title',
                department: 'Department',
                directManager: 'Direct Manager',
                employmentType: 'Employment Type',
                startDate: 'Start Date',
                duration: 'Duration',
                probation: 'Probation Period',
                workplace: 'Workplace',
                compensation: 'COMPENSATION',
                paymentDate: 'Payment Date',
                dailyHours: 'Daily Hours',
                workDays: 'Work Days',
                annualLeave: 'Annual Leave',
                benefits: 'Benefits',
                basicMonthlySalary: 'BASIC MONTHLY SALARY',
                hrsPerDay: 'hrs/day',
                defaultCompanyName: 'OPENY',
                clauseTitlePlaceholder: 'Clause title (English)',
                clauseTextPlaceholder: 'Clause text (English)...',
            }
        };

        function getDefaultContractServices(lang) {
            if (lang === 'en') {
                return [
                    'Paid Advertising', 'Media Buying & Planning', 'Marketing Consulting',
                    'Graphic Design', 'Motion Graphics', 'Media Production',
                    'Content Creation', 'Digital Branding', 'Analytics & Reporting',
                    'Social Media Management'
                ];
            }
            return [
                'الإعلانات المدفوعة', 'الشراء الإعلامي والتخطيط', 'استشارات التسويق',
                'التصميم الجرافيكي', 'الموشن جرافيك', 'الإنتاج الإعلامي',
                'إنشاء المحتوى', 'العلامة التجارية الرقمية', 'التحليلات والتقارير',
                'إدارة وسائل التواصل الاجتماعي'
            ];
        }

        function getDefaultClientClauses(lang) {
            if (lang === 'en') {
                return [
                    { id: _cid(), title: 'Preamble', text: 'Both parties have agreed to enter into this contract with the terms and conditions set forth below, in consideration of their mutual desire for productive collaboration and achievement of shared objectives, effective from the date of signing.' },
                    { id: _cid(), title: 'Contract Subject', text: 'Party 1 (Service Provider) undertakes to provide integrated digital marketing services to Party 2 (Client), including the services specified in this contract, in accordance with the agreed-upon specifications, standards, and required quality level.' },
                    { id: _cid(), title: 'Scope of Work', text: 'Party 1 shall provide the digital marketing services covered by this contract, including planning, execution, and supervision of all agreed digital marketing activities, in accordance with the work plan approved by both parties.' },
                    { id: _cid(), title: 'Contract Duration', text: 'This contract shall be in effect from the date of signing for the period specified in the contract data. Should either party wish to terminate or renew the contract, they must provide written notice to the other party at least thirty (30) working days prior to the contract expiry date.' },
                    { id: _cid(), title: 'Financial Consideration', text: 'In consideration of the services rendered, Party 2 undertakes to pay the total contract value specified in the financial details of this contract, inclusive of all agreed-upon services.' },
                    { id: _cid(), title: 'Payment Mechanism', text: 'Payment shall be made in accordance with the payment method and terms specified in the financial details of this contract. Payments are due on their specified dates, and any delay in payment subjects Party 2 to the provisions of the late payment clause in this contract.' },
                    { id: _cid(), title: 'Late Payment', text: 'In the event of delay in paying any installment on its due date, Party 1 shall have the right to suspend the provision of services until the outstanding amount is paid in full, while retaining the right to claim compensation for any damages arising from such delay.' },
                    { id: _cid(), title: 'Party 1 Obligations', text: 'Party 1 undertakes to provide the agreed-upon services to the highest professional quality standards, maintain the confidentiality of Party 2\'s information, and provide periodic performance and results reports on schedule.' },
                    { id: _cid(), title: 'Party 2 Obligations', text: 'Party 2 undertakes to provide Party 1 with all necessary information and materials for service execution in a timely manner, adhere to the agreed payment schedule, and refrain from engaging a third party to provide the same services covered by this contract during its term.' },
                    { id: _cid(), title: 'Amendments', text: 'No amendment to the terms of this contract shall be made except with prior written consent from both parties. Agreed amendments shall constitute an official addendum to the contract and an integral part thereof.' },
                    { id: _cid(), title: 'Additional Works', text: 'Any works or services requested by Party 2 that exceed the scope defined in this contract shall be considered additional works, requiring a separate agreement addendum specifying the nature of such works and the additional cost incurred.' },
                    { id: _cid(), title: 'Intellectual Property', text: 'Ownership of all creative materials and content produced within the scope of this contract shall transfer to Party 2 upon full payment of the contract value. Party 1 retains the right to reference these works in its professional portfolio unless otherwise agreed in writing.' },
                    { id: _cid(), title: 'Confidentiality and Non-Disclosure', text: 'Both parties undertake to maintain the confidentiality of all commercial and strategic information exchanged in the course of executing this contract, and not to disclose it to any third party without prior written consent. This obligation shall remain in effect for three (3) years after the contract\'s termination.' },
                    { id: _cid(), title: 'Limitation of Liability', text: 'Party 1 shall not be held liable for any indirect losses or damages resulting from circumstances beyond its control. Party 1\'s liability is limited to the value of services actually rendered in the event of proven breach of its contractual obligations.' },
                    { id: _cid(), title: 'Contract Termination', text: 'Either party shall have the right to terminate this contract before its expiry in the event of a material breach by the other party that remains uncured within fifteen (15) working days of written notice. In the event of early termination by Party 2 without valid justification, Party 1 shall be entitled to compensation equal to three months of the contract value.' },
                    { id: _cid(), title: 'Force Majeure', text: 'Neither party shall be deemed in breach of its contractual obligations if such breach results from circumstances beyond its control, such as natural disasters, epidemics, wars, or government decisions. The affected party must immediately notify the other party.' },
                    { id: _cid(), title: 'Notices and Communications', text: 'All formal notices and communications between the parties shall be made in writing to the email addresses or postal addresses specified in this contract and shall be deemed received within (48) hours of dispatch.' },
                    { id: _cid(), title: 'Applicable Law', text: 'This contract shall be governed by the laws in force in the Arab Republic of Egypt. In the event of any dispute relating to the interpretation or execution of this contract, the parties shall first seek amicable settlement; failing that, recourse shall be made to the competent courts in Egypt.' },
                    { id: _cid(), title: 'Acknowledgment', text: 'Both parties acknowledge that they have read and understood all the terms and conditions of this contract, and that they are signing it voluntarily without any coercion or pressure, and that the representative of each party is legally authorized to sign on its behalf.' }
                ];
            }
            return [
                { id: _cid(), title: 'أولاً: المقدمة وتعريف الأطراف', text: 'بناءً على رغبة الطرفين في إقامة شراكة مهنية قائمة على الاحترام المتبادل والتعاون البنّاء لتحقيق الأهداف التسويقية المشتركة، أُبرم هذا العقد بين:\n\nالطرف الأول (وكالة التسويق / مزود الخدمة):\n• الاسم التجاري: ___________________________\n• رقم السجل التجاري: ___________________________\n• العنوان: ___________________________\n• البريد الإلكتروني: ___________________________\n• رقم الهاتف: ___________________________\n• الممثل القانوني / المفوّض بالتوقيع: ___________________________\n\nالطرف الثاني (العميل):\n• اسم الشخص / الشركة: ___________________________\n• رقم السجل التجاري (إن وجد): ___________________________\n• العنوان: ___________________________\n• البريد الإلكتروني: ___________________________\n• رقم الهاتف: ___________________________\n• الممثل القانوني / المفوّض بالتوقيع: ___________________________\n\nيُشار إليهما مجتمعَين بـ "الطرفان"، ويُشار إلى كلٍّ منهما بـ "الطرف" عند الإفراد.' },
                { id: _cid(), title: 'ثانياً: التعريفات والمصطلحات', text: 'لأغراض هذا العقد، تحمل المصطلحات التالية المعاني المحددة لها:\n\n• "العقد": اتفاقية خدمات التسويق الرقمي هذه بما تشمله من ملاحق ووثائق مرفقة.\n• "الخدمات": جميع خدمات التسويق الرقمي المتفق على تقديمها والمفصّلة في البند الثالث.\n• "الحملات": الأنشطة التسويقية المدفوعة أو العضوية المنفّذة عبر المنصات الرقمية المتفق عليها.\n• "المنصات": قنوات التواصل الاجتماعي والمنصات الإعلانية المشمولة في العقد (ميتا، جوجل، تيك توك وغيرها).\n• "المخرجات": جميع المنتجات والمحتويات والتقارير التي يُلتزم بتسليمها ضمن نطاق الخدمات.\n• "ميزانية الإعلانات": المبلغ المالي الذي يُخصّصه الطرف الثاني مباشرةً للإنفاق على الإعلانات المدفوعة عبر المنصات.\n• "الأتعاب": المقابل المالي المستحق للطرف الأول مقابل تقديم الخدمات المتفق عليها، ولا تشمل ميزانية الإعلانات.\n• "المحتوى": جميع المواد الإبداعية المنتجة ضمن نطاق الخدمات كالتصاميم والمقاطع المرئية والنصوص التسويقية.\n• "التقرير": الوثيقة الدورية التي تُعدّها الوكالة لاستعراض مؤشرات الأداء ونتائج الحملات.\n• "الاستراتيجية": الخطة الشاملة التي تُصمّمها الوكالة لتحقيق أهداف الطرف الثاني التسويقية.' },
                { id: _cid(), title: 'ثالثاً: نطاق الخدمات المقدمة', text: 'يلتزم الطرف الأول بتقديم الخدمات التسويقية الرقمية التالية بصورة احترافية وفق أعلى معايير الصناعة:\n\n١. إدارة الإعلانات المدفوعة:\n- إدارة حملات Meta Ads (فيسبوك وإنستغرام) شاملةً الاستهداف والميزانية والإشراف اليومي.\n- إدارة حملات Google Ads (بحث، عرض، يوتيوب) مع تحسين الكلمات المفتاحية ونقاط الجودة.\n- إدارة حملات TikTok Ads مع استهداف الجمهور وتحليل الأداء.\n- إعداد هياكل الحملات وإنشاء مجموعات الإعلانات واختيار أهداف التحويل المناسبة.\n\n٢. إدارة وسائل التواصل الاجتماعي:\n- تخطيط وجدولة ونشر المحتوى على المنصات المتفق عليها.\n- إدارة التعليقات والرسائل والتفاعل مع الجمهور.\n- مراقبة الأداء العضوي وتقديم التوصيات.\n\n٣. إنتاج المحتوى الإبداعي:\n- تصميم المواد البصرية (ملصقات، بانرات، صور المنتجات).\n- إنتاج مقاطع الفيديو القصيرة وتحرير الريلز والقصص.\n- كتابة النصوص والإعلانات والتعليقات (Copy Writing) بأسلوب يتناسب مع هوية العلامة التجارية.\n\n٤. إعداد الحملات وتحسينها:\n- تصميم بنية الحملة ومراحل التحويل (Funnel).\n- إجراء اختبارات A/B المستمرة على الإعلانات والجماهير.\n- تحسين تكلفة الاكتساب (CPA) وزيادة العائد على الإنفاق الإعلاني (ROAS).\n\n٥. التتبع والتحليل:\n- إعداد وتثبيت أدوات التتبع (Meta Pixel، Google Tag Manager، Conversions API).\n- رصد مؤشرات الأداء الرئيسية (KPIs) بصفة يومية.\n- تحليل البيانات واستخلاص التوصيات القابلة للتنفيذ.\n\n٦. التقارير الدورية:\n- تقرير أسبوعي موجز بأبرز مؤشرات الأداء.\n- تقرير شهري تفصيلي يستعرض النتائج والتحليلات والتوصيات للشهر القادم.\n\n٧. تطوير الاستراتيجية:\n- إعداد الاستراتيجية التسويقية الشاملة في بداية العقد وتحديثها دورياً.\n- تحليل المنافسين وتحديد الفرص والتوصية بالمبادرات.' },
                { id: _cid(), title: 'رابعاً: المخرجات والتسليمات', text: 'يلتزم الطرف الأول بتسليم المخرجات التالية خلال مدة العقد:\n\n١. المحتوى الشهري:\n- عدد المنشورات: وفق الباقة المتفق عليها (يُحدد العدد في ملحق الخدمات).\n- مقاطع الفيديو والريلز: وفق الباقة المتفق عليها.\n- قصص (Stories): وفق الباقة المتفق عليها.\n\n٢. الحملات الإعلانية:\n- إعداد وإطلاق الحملات المتفق عليها خلال 5 أيام عمل من استلام المواد والموافقات.\n- مراجعة أداء الحملات وتحسينها بصفة أسبوعية على الأقل.\n\n٣. التقارير:\n- تقرير أسبوعي يُرسل في بداية كل أسبوع عمل يشمل الأداء والإنفاق.\n- تقرير شهري تفصيلي يُرسل خلال 5 أيام عمل من بداية الشهر التالي.\n\n٤. الاستراتيجية:\n- وثيقة الاستراتيجية الأولية خلال 10 أيام عمل من تاريخ بدء العقد.\n- تحديثات ربع سنوية أو عند الحاجة.\n\n٥. ملفات التصميم والمحتوى:\n- تُسلَّم الملفات النهائية (بصيغ JPEG/PNG/MP4 أو ما يتفق عليه الطرفان) في المواعيد المحددة.\n- تُسلَّم الملفات المصدرية (PSD/AI/Premiere Project) فقط في حال النص عليها صراحةً في ملحق الخدمات.' },
                { id: _cid(), title: 'خامساً: مدة العقد والتجديد', text: 'أ. مدة العقد:\nتبدأ مدة هذا العقد من تاريخ: _______________ وتنتهي في تاريخ: _______________، وتكون المدة الإجمالية _______________ شهراً/أشهر.\n\nب. التجديد التلقائي:\nيُجدَّد هذا العقد تلقائياً لمدة مماثلة ما لم يُبلّغ أحد الطرفين الطرفَ الآخر كتابياً برغبته في عدم التجديد قبل انتهاء المدة بـ (30) يوم عمل على الأقل.\n\nج. الشروط عند التجديد:\nيحق للطرف الأول مراجعة الأتعاب عند كل تجديد، ويُبلّغ الطرف الثاني بأي تغييرات قبل (15) يوم عمل من تاريخ التجديد. في حال رفض الطرف الثاني الأتعاب المعدّلة، يعتبر ذلك إشعاراً بعدم التجديد.\n\nد. فترة الإعداد والإطلاق:\nيُمنح الطرف الأول فترة لا تتجاوز (10) أيام عمل من تاريخ توقيع العقد ومنح الوصول اللازم للبدء الفعلي في تقديم الخدمات.' },
                { id: _cid(), title: 'سادساً: الأتعاب وشروط الدفع', text: 'أ. قيمة الأتعاب الشهرية:\nتبلغ الأتعاب الشهرية للخدمات المتفق عليها: _______________ (_______________) فقط لا غير، بعملة _______________.\n\nب. جدول السداد:\n- تُسدَّد الأتعاب الشهرية مسبقاً في أو قبل اليوم الأول من كل شهر خدمة، ما لم يُتفق على خلاف ذلك كتابياً.\n- في حال العقود المبنية على مشاريع: تُسدَّد (50%) عند توقيع العقد، و(50%) عند تسليم المخرجات النهائية.\n\nج. طريقة الدفع:\nيتم السداد عبر: _______________ (تحويل بنكي / محفظة إلكترونية / غيره).\nبيانات الحساب البنكي: _______________.\n\nد. التأخر في السداد:\n- في حال تأخر الطرف الثاني عن سداد أي مبلغ مستحق لمدة تزيد على سبعة (7) أيام عمل من تاريخ الاستحقاق، يحق للطرف الأول:\n  * تعليق جميع الخدمات فوراً دون أي مسؤولية قانونية.\n  * احتساب غرامة تأخير بنسبة 5% من المبلغ المستحق عن كل أسبوع تأخير.\n- في حال استمر التأخر لأكثر من (30) يوماً، يحق للطرف الأول إنهاء العقد فوراً واستيفاء جميع مستحقاته المتبقية.\n\nهـ. سياسة عدم الاسترداد:\nجميع المبالغ المسددة للطرف الأول غير قابلة للاسترداد لأي سبب كان، نظراً لطبيعة الخدمات التي تُستهلك فور تقديمها ويترتب على بدء تقديمها تكاليف مباشرة. يستثنى من ذلك حالة إخلال الطرف الأول بالتزاماته الجوهرية المثبتة.' },
                { id: _cid(), title: 'سابعاً: ميزانية الإعلانات المدفوعة', text: 'أ. مسؤولية الإنفاق الإعلاني:\nميزانية الإعلانات المدفوعة عبر المنصات (Meta، Google، TikTok وغيرها) هي مسؤولية الطرف الثاني حصراً، وتُسدَّد مباشرةً للمنصات أو تُودَع في حسابات الإعلانات المخصصة، ولا تدخل ضمن أتعاب الطرف الأول.\n\nب. عدم تحكم الطرف الأول في رسوم المنصات:\nلا يتحمل الطرف الأول أي مسؤولية عن التغييرات في سياسات التسعير أو الرسوم التي تفرضها المنصات الإعلانية، ولا عن توقف المنصات أو تغيير خوارزمياتها أو رفض أي إعلان من طرف المنصة.\n\nج. قواعد اعتماد الميزانية:\n- يحق للطرف الأول تقديم توصية بالميزانية الإعلانية الملائمة بناءً على الأهداف، غير أن القرار النهائي يعود للطرف الثاني.\n- أي تغيير في الميزانية يجب أن يُبلَّغ به الطرف الأول كتابياً قبل (48) ساعة على الأقل.\n- الطرف الأول غير ملزم بضمان نتائج محددة في حال كانت الميزانية الإعلانية أقل من الحد الأدنى الموصى به.\n\nد. حسابات الإعلانات:\nتكون حسابات الإعلانات الرئيسية مملوكة للطرف الثاني، ويُمنح الطرف الأول صلاحيات الوصول اللازمة لإدارتها. في حال إنهاء العقد، تُسحب صلاحيات الطرف الأول فور انتهاء العلاقة التعاقدية.' },
                { id: _cid(), title: 'ثامناً: التزامات الطرف الثاني (العميل)', text: 'يلتزم الطرف الثاني بما يلي طوال مدة العقد:\n\n١. تزويد المواد والموارد:\n- تقديم جميع المواد اللازمة (صور، مقاطع فيديو، شعارات، ألوان الهوية، منتجات للتصوير) خلال (48) ساعة من طلبها.\n- تقديم معلومات دقيقة وشاملة عن المنتجات والخدمات والجمهور المستهدف.\n\n٢. الموافقات والردود:\n- الرد على الاستفسارات وطلبات الموافقة خلال (48) ساعة عمل كحد أقصى.\n- الموافقة على المحتوى المقدم أو رفضه مع توضيح أسباب الرفض خلال المهلة ذاتها.\n- أي تأخير في الموافقة من قِبل الطرف الثاني يترتب عليه تأجيل المواعيد المقابلة في التسليم دون أي مسؤولية على الطرف الأول.\n\n٣. منح الوصول:\n- منح الطرف الأول الوصول اللازم إلى جميع الحسابات والمنصات ذات الصلة (مدير الإعلانات، صفحات التواصل الاجتماعي، Google Analytics، الموقع الإلكتروني) خلال (3) أيام عمل من توقيع العقد.\n\n٤. الالتزام بالمواصفات القانونية:\n- ضمان أن جميع المنتجات والخدمات والمطالبات التسويقية التي يطلب الإعلان عنها مشروعة وتمتثل للأنظمة المعمول بها.\n- تحمّل المسؤولية الكاملة عن صحة المعلومات المقدمة.' },
                { id: _cid(), title: 'تاسعاً: التزامات الطرف الأول (الوكالة)', text: 'يلتزم الطرف الأول بما يلي طوال مدة العقد:\n\n١. التنفيذ المهني:\n- تنفيذ جميع الخدمات المتفق عليها وفق أعلى معايير الصناعة وبكوادر بشرية مؤهلة.\n- الالتزام بمواعيد التسليم المحددة في هذا العقد.\n\n٢. معايير الأداء:\n- العمل المستمر على تحسين أداء الحملات وتحقيق أفضل النتائج الممكنة ضمن الميزانية المتاحة.\n- التكيف مع التغييرات في خوارزميات المنصات وتحديث الاستراتيجيات وفقاً لذلك.\n\n٣. التقارير والتواصل:\n- تقديم التقارير الدورية في مواعيدها وفق ما نُصّ عليه في البند الرابع.\n- الرد على استفسارات الطرف الثاني خلال (24) ساعة عمل.\n- إبلاغ الطرف الثاني فوراً بأي مشكلة قد تؤثر على الأداء أو تستوجب اتخاذ قرار.\n\n٤. السرية المهنية:\n- الحفاظ على سرية معلومات الطرف الثاني وعدم مشاركتها مع أي طرف ثالث.\n- عدم العمل مع منافس مباشر للطرف الثاني في الفترة المتفق عليها ما لم يُوافق الطرف الثاني كتابياً.' },
                { id: _cid(), title: 'عاشراً: إخلاء مسؤولية النتائج', text: 'أ. عدم ضمان النتائج:\nيقرّ الطرف الثاني إقراراً صريحاً بأن الطرف الأول لا يضمن تحقيق نتائج تسويقية محددة كزيادة المبيعات أو الوصول إلى عدد معين من المشتركين أو تحقيق عائد استثمار (ROI) محدد. النتائج التسويقية تعتمد على عوامل متعددة خارج نطاق سيطرة الطرف الأول، منها:\n- جودة المنتج أو الخدمة وتسعيرها وتنافسيتها.\n- حجم ميزانية الإعلانات وانتظام الإنفاق.\n- ظروف السوق والمنافسة وسلوك الجمهور المستهدف.\n- سياسات المنصات الإعلانية ومتطلباتها المتغيرة.\n- سرعة استجابة الطرف الثاني وتعاونه في تقديم المواد والموافقات.\n\nب. النتائج المقيسة:\nيلتزم الطرف الأول بالعمل الجاد والمنهجي لتحقيق أفضل النتائج الممكنة، ويقيس أداءه بمؤشرات قابلة للقياس (Impressions، Reach، Clicks، CTR، CPC، ROAS) يستعرضها في التقارير الدورية.' },
                { id: _cid(), title: 'حادي عشر: سياسة المراجعات والتعديلات', text: 'أ. عدد المراجعات المضمّنة:\n- يحق للطرف الثاني طلب (جولتَين) من المراجعات على كل قطعة محتوى (تصميم، فيديو، نص) قبل اعتماده نهائياً، وذلك ضمن نطاق الأتعاب الشهرية المتفق عليها.\n- تُعدّ الجولة الثالثة فأكثر مراجعةً إضافية تُحتسب بتكلفة إضافية.\n\nب. تكلفة المراجعات الإضافية:\n- كل جولة مراجعة إضافية تُحتسب بـ _______________ (يُحدد في ملحق الأسعار)، وتُسدَّد مسبقاً.\n- التعديل الجوهري الذي يستلزم إعادة التصميم الكلية للقطعة يُعدّ طلباً جديداً وليس مراجعةً.\n\nج. المراجعات الخارجة عن النطاق:\nأي تعديل ناجم عن تغيير الطرف الثاني لمتطلباته أو هويته البصرية أو استراتيجيته بعد الاعتماد الأولي يُعدّ عملاً إضافياً ويُحتسب بتكلفة منفصلة.\n\nد. مهلة المراجعة:\nيلتزم الطرف الثاني بتقديم ملاحظات المراجعة خلال (48) ساعة من استلام المقترح. تجاوز هذه المهلة يُعدّ موافقةً ضمنيةً على المحتوى المقدم.' },
                { id: _cid(), title: 'ثاني عشر: الملكية الفكرية', text: 'أ. نقل الملكية:\nعند استيفاء الطرف الثاني لجميع المستحقات المالية المترتبة على هذا العقد، تنتقل إليه الملكية الكاملة لجميع المواد الإبداعية والمحتوى المنتج حصراً لصالحه في إطار هذا العقد (تصاميم، فيديوهات، نصوص، حملات).\n\nب. حق الطرف الأول في التوثيق:\nيحتفظ الطرف الأول بحق توثيق الأعمال المنجزة واستخدامها في عروضه التسويقية ومحفظته الإبداعية لأغراض التسويق الذاتي، ما لم يطلب الطرف الثاني كتابياً استثناء عمل بعينه من ذلك.\n\nج. حقوق المواد المقدمة من الطرف الثاني:\nيضمن الطرف الثاني أنه يمتلك الحقوق القانونية الكاملة لجميع المواد التي يزوّد بها الطرف الأول (صور، موسيقى، فيديوهات، شعارات)، ويتحمل المسؤولية الكاملة عن أي مطالبات تتعلق بانتهاك حقوق الملكية الفكرية لتلك المواد.\n\nد. ادوات وبرامج الطرف الأول:\nتظل جميع الأدوات والبرامج وقوالب التصميم الخاصة بالطرف الأول ملكيةً له حصراً، ولا ينطوي هذا العقد على نقل أي حق في هذه الأصول للطرف الثاني.' },
                { id: _cid(), title: 'ثالث عشر: السرية وحماية البيانات', text: 'أ. نطاق الالتزام بالسرية:\nيلتزم كلا الطرفين بحفظ وحماية جميع المعلومات السرية التي يطّلع عليها بموجب هذا العقد، بما يشمل (دون حصر): بيانات العملاء، الاستراتيجيات التسويقية، أرقام الأداء، بيانات المبيعات، المعلومات التنافسية، الأسعار والعقود.\n\nب. مدة الالتزام:\nيستمر الالتزام بالسرية خلال مدة العقد وبعد انتهائه لمدة (3) سنوات على الأقل.\n\nج. الاستثناءات:\nلا يسري التزام السرية على المعلومات التي:\n- كانت متاحة للعموم قبل الإفصاح عنها في إطار هذا العقد.\n- يُطلب الإفصاح عنها بموجب حكم قضائي أو أمر حكومي، مع الإخطار الفوري للطرف الآخر.\n\nد. حماية البيانات:\nيلتزم الطرف الأول بعدم تخزين أو مشاركة البيانات الشخصية لعملاء الطرف الثاني إلا في حدود ما تقتضيه الضرورة لتنفيذ الخدمات.' },
                { id: _cid(), title: 'رابع عشر: عدم التجاوز وعدم الإغراء', text: 'أ. عدم التجاوز:\nيلتزم الطرف الثاني بعدم التواصل المباشر مع أي عضو من فريق الطرف الأول (موظفين، مستقلين، مصورين، مصممين) لأغراض تتعلق بتقديم خدمات مماثلة للخدمات المشمولة في هذا العقد، سواء خلال مدته أو خلال (12) شهراً بعد انتهائه، إلا بموافقة كتابية مسبقة من الطرف الأول.\n\nب. عدم الإغراء:\nيحظر على الطرف الثاني استقطاب أو توظيف أي عضو من فريق الطرف الأول أو التعاقد معه بصورة فردية طوال فترة العقد وبعد انتهائه بمدة (12) شهراً.\n\nج. التعويض:\nفي حال ثبوت مخالفة هذه البنود، يلتزم الطرف الثاني بدفع تعويض فوري للطرف الأول لا يقل عن إجمالي أتعاب اثني عشر (12) شهراً من قيمة هذا العقد، وذلك تماشياً مع مدة القيد المنصوص عليها في هذا البند.' },
                { id: _cid(), title: 'خامس عشر: إنهاء العقد', text: 'أ. الإنهاء بالإشعار المسبق:\nيحق لأي من الطرفين إنهاء هذا العقد بتقديم إشعار كتابي للطرف الآخر قبل (30) يوم عمل من التاريخ المحدد للإنهاء، مع الوفاء بجميع الالتزامات المالية المتراكمة حتى تاريخ الإنهاء الفعلي.\n\nب. الإنهاء الفوري:\nيحق لأي من الطرفين إنهاء هذا العقد فوراً دون الحاجة إلى فترة إشعار في الحالات التالية:\n- إفلاس أو توقف الطرف الآخر عن ممارسة نشاطه.\n- ارتكاب الطرف الآخر جريمة جنائية أو تصرفاً مخلاً بالأخلاق المهنية.\n- تعمّد الطرف الآخر تضليل الطرف الأول أو إخفاء معلومات جوهرية.\n- تأخر الطرف الثاني في السداد لأكثر من (30) يوماً بعد المطالبة الكتابية.\n\nج. التزامات ما بعد الإنهاء:\n- يلتزم الطرف الأول بتسليم جميع الملفات والبيانات المتعلقة بخدمات الطرف الثاني خلال (7) أيام عمل من تاريخ الإنهاء.\n- يلتزم الطرف الثاني بتسوية جميع المستحقات المالية المتبقية خلال (7) أيام عمل من تاريخ الإنهاء.\n- لا يحق للطرف الثاني استرداد أي أتعاب مسبقة في حال الإنهاء بمبادرته.' },
                { id: _cid(), title: 'سادس عشر: تحديد المسؤولية', text: 'أ. استثناءات المسؤولية:\nلا يتحمل الطرف الأول المسؤولية عن:\n- أي خسائر في الإيرادات أو الأرباح أو فرص الأعمال الناجمة بصورة غير مباشرة عن تقديم الخدمات أو التوقف عنها.\n- أي قرارات تتخذها منصات الإعلانات (Meta، Google، TikTok) تتعلق بتعليق الحسابات أو رفض الإعلانات أو تغيير السياسات.\n- أي ضرر ناجم عن معلومات غير دقيقة أو غير مشروعة قدّمها الطرف الثاني للاستخدام في المحتوى أو الإعلانات.\n- أي خسائر ناجمة عن انقطاع الخدمات الرقمية التي تتحكم بها أطراف ثالثة.\n\nب. حد المسؤولية الأقصى:\nفي جميع الأحوال، تُحدَّد مسؤولية الطرف الأول القصوى عن أي مطالبة تعاقدية بمبلغ لا يتجاوز مجموع أتعاب الأشهر الثلاثة الأخيرة المسددة فعلاً.' },
                { id: _cid(), title: 'سابع عشر: القوة القاهرة', text: 'لا يُعدّ أيٌّ من الطرفين مسؤولاً عن أي تأخير أو إخفاق في تنفيذ التزاماته التعاقدية إذا كان ذلك ناجماً عن أحداث خارجة عن إرادته ولا يمكن توقعها أو منعها، بما يشمل (دون حصر): الكوارث الطبيعية، الزلازل، الفيضانات، الأوبئة والجوائح الصحية، الحروب والنزاعات المسلحة، أعمال الشغب والاضطرابات المدنية، القرارات والإجراءات الحكومية، انقطاع التيار الكهربائي الواسع النطاق، أو أي توقف جماعي لخدمات الإنترنت.\n\nيلتزم الطرف المتأثر بإخطار الطرف الآخر كتابياً خلال (48) ساعة من وقوع الحدث، مع تقديم ما يثبت ذلك، والعمل على استئناف التزاماته بأسرع وقت ممكن. إذا استمر حدث القوة القاهرة لأكثر من (60) يوماً متتالية، يحق لأي من الطرفين إنهاء العقد دون تعويض.' },
                { id: _cid(), title: 'ثامن عشر: القانون الواجب التطبيق وتسوية النزاعات', text: 'أ. القانون المنظِّم:\nيخضع هذا العقد ويُفسَّر وفقاً للقوانين واللوائح المعمول بها في _______________ (الدولة / المنطقة القانونية المتفق عليها).\n\nب. التسوية الودية:\nفي حال نشوء أي نزاع أو خلاف يتعلق بتفسير هذا العقد أو تنفيذه أو انتهائه، يتعهد الطرفان بالسعي الجاد نحو تسويته وداً عبر التفاوض المباشر خلال مدة لا تتجاوز (30) يوماً من تاريخ إخطار أحدهما للآخر بالنزاع.\n\nج. الوساطة والتحكيم:\nإذا تعذّرت التسوية الودية، يلجأ الطرفان إلى الوساطة أمام مركز وساطة معتمد. فإن تعذّرت الوساطة، يُحسم النزاع عبر التحكيم وفق قواعد مركز _______________، ويكون حكم المحكّم/المحكّمين نهائياً وملزماً للطرفين.\n\nد. الاختصاص القضائي الاحتياطي:\nفي حال اللجوء للقضاء، تكون المحاكم المختصة في _______________ هي صاحبة الولاية القضائية الحصرية للفصل في أي نزاع ينشأ عن هذا العقد.' },
                { id: _cid(), title: 'تاسع عشر: أحكام عامة وتوقيعات', text: 'أ. الأحكام العامة:\n- يُشكّل هذا العقد والملاحق المرفقة به الاتفاقية الكاملة بين الطرفين ويحل محل جميع الاتفاقيات السابقة الشفهية أو الكتابية المتعلقة بذات الموضوع.\n- لا يجوز التنازل عن أي حق أو التزام ينشأ عن هذا العقد لأي طرف ثالث دون موافقة كتابية مسبقة من الطرف الآخر.\n- إذا تبيّن أن أي بند من بنود هذا العقد غير قانوني أو غير قابل للتنفيذ، فإن ذلك لا يؤثر على صحة ونفاذ بقية البنود.\n- عناوين البنود وأرقامها لأغراض التنظيم فحسب ولا تُستخدم لتفسير مضمون البنود.\n\nب. توقيع الطرف الأول (الوكالة):\nالاسم: ___________________________\nالتوقيع: ___________________________\nالصفة: ___________________________\nالتاريخ: ___________________________\nالختم الرسمي (إن وجد): ___________________________\n\nج. توقيع الطرف الثاني (العميل):\nالاسم: ___________________________\nالتوقيع: ___________________________\nالصفة: ___________________________\nالتاريخ: ___________________________\nالختم الرسمي (إن وجد): ___________________________' }
            ];
        }

        function getDefaultEmpClauses(lang) {
            if (lang === 'en') {
                return [
                    { id: _cid(), title: 'Appointment', text: 'The employee is appointed to the position specified in the contract data effective from the start date stipulated therein, subject to the terms and conditions set out in this contract and the company\'s applicable internal regulations.' },
                    { id: _cid(), title: 'Probation Period', text: 'The employee shall be subject to a probation period as specified in the contract data. During this period, either party has the right to terminate the employment contract with a two-week (14 days) prior written notice, without the need for justification.' },
                    { id: _cid(), title: 'Salary', text: 'The employee shall receive a gross monthly salary as specified in the employment details. This salary shall be reviewed annually in accordance with performance evaluation and company policies. This salary represents full compensation for all regular working hours.' },
                    { id: _cid(), title: 'Working Hours', text: 'Regular working hours shall be as specified in this contract. The employee may occasionally be required to work overtime in accordance with business needs, in coordination with their direct manager and in accordance with approved policies.' },
                    { id: _cid(), title: 'Annual Leave', text: 'The employee shall be entitled to the leave specified in this contract in accordance with the company\'s approved policy. Leave must be requested in advance and approved by the direct manager based on business needs.' },
                    { id: _cid(), title: 'Confidentiality', text: 'The employee undertakes to maintain the confidentiality of all commercial, financial, and operational information accessed by virtue of their employment, and not to disclose it to any external party. This obligation shall continue for three (3) years after termination of employment.' },
                    { id: _cid(), title: 'Non-Competition', text: 'The employee undertakes, during their employment and for a period of one full year after the termination of their contract, not to work for or provide consulting services to any direct competitor, and not to establish a business that competes with the company\'s main activity.' },
                    { id: _cid(), title: 'Professional Conduct', text: 'The employee undertakes to maintain professional discipline, adhere to working hours and professional conduct standards, respect colleagues and clients, protect the company\'s reputation, and implement approved policies and procedures at all times.' },
                    { id: _cid(), title: 'Disciplinary Penalties', text: 'In the event of the employee violating internal regulations and rules, disciplinary sanctions shall be applied in accordance with the company\'s policy, ranging from written warning to termination of service depending on the severity of the violation.' },
                    { id: _cid(), title: 'Contract Termination', text: 'Either party shall have the right to terminate this contract with prior written notice as stipulated. The company has the right to immediate termination in cases of gross misconduct or behavior contrary to professional ethics without the need for a notice period.' },
                    { id: _cid(), title: 'End-of-Service Benefits', text: 'Upon termination of the employee\'s service, their final entitlements shall be calculated in accordance with applicable law and company policy, including any accrued leave and agreed bonuses, after settling any mutual financial obligations.' },
                    { id: _cid(), title: 'Notice Period', text: 'Both parties undertake to provide prior written notice for the period agreed upon in the event either party wishes to terminate the contract. If the notice period is not observed, the aggrieved party has the right to claim appropriate financial compensation.' },
                    { id: _cid(), title: 'Governing Law', text: 'This contract shall be governed by labor law and applicable laws in the Arab Republic of Egypt. In the event of any dispute, the parties shall seek to resolve it amicably first, then through the competent legal channels.' }
                ];
            }
            return [
                { id: _cid(), title: 'أولاً: مقدمة وبيانات الأطراف', text: 'أُبرم هذا العقد بين:\n\nصاحب العمل (الشركة / الوكالة):\n• الاسم التجاري: ___________________________\n• رقم السجل التجاري: ___________________________\n• العنوان: ___________________________\n• البريد الإلكتروني: ___________________________\n• رقم الهاتف: ___________________________\n• الممثل القانوني / المدير المفوّض: ___________________________\n\nالموظف:\n• الاسم الكامل: ___________________________\n• رقم الهوية / الإقامة: ___________________________\n• تاريخ الميلاد: ___________________________\n• العنوان الحالي: ___________________________\n• البريد الإلكتروني: ___________________________\n• رقم الهاتف: ___________________________\n\nاتفق الطرفان على إبرام عقد العمل هذا بالشروط والأحكام التالية، ويُشار إليهما مجتمعَين بـ "الطرفان" وإلى كلٍّ منهما بـ "الطرف" عند الإفراد.' },
                { id: _cid(), title: 'ثانياً: الوظيفة والمسمى الوظيفي', text: 'أ. المسمى الوظيفي:\nيُعيَّن الموظف في منصب: ___________________________\n\nب. القسم / الإدارة:\n___________________________\n\nج. المدير المباشر:\n___________________________\n\nد. مكان العمل الرئيسي:\n___________________________  (مكتب / عن بُعد / هجين)\n\nهـ. ملخص الوظيفة:\nتقع على عاتق الموظف المسؤولية الكاملة عن تنفيذ المهام التسويقية الرقمية المنوطة بمنصبه، والمساهمة في تحقيق الأهداف الاستراتيجية للشركة، وتقديم أداء احترافي يرتقي بمستوى الخدمة المقدمة للعملاء.\n\nو. ملاحظة على الوصف الوظيفي:\nيُعدّ هذا الوصف الوظيفي وثيقةً إرشادية وقابلاً للتحديث وفق متطلبات العمل، مع الحرص على عدم إلحاق تغييرات جوهرية بطبيعة الوظيفة دون اتفاق مسبق.' },
                { id: _cid(), title: 'ثالثاً: نوع العقد وطبيعة العمل', text: 'أ. نوع العقد:\nيُحدد نوع هذا العقد على النحو التالي: (يُعلَّم الخيار المنطبق)\n☐ دوام كامل (Full-time)\n☐ دوام جزئي (Part-time) — عدد ساعات الأسبوع: _____\n☐ عقد مستقل / فريلانس (Freelance)\n☐ عقد مشروع محدد\n\nب. طبيعة العلاقة التعاقدية:\n☐ عقد محدد المدة (Fixed-term): تنتهي مدته في _______________\n☐ عقد غير محدد المدة (Open-ended)\n\nج. مكان الأداء:\n☐ من مقر الشركة\n☐ عن بُعد (Remote)\n☐ نظام هجين (Hybrid): _______________ أيام بالمكتب أسبوعياً' },
                { id: _cid(), title: 'رابعاً: مدة العقد وفترة الاختبار', text: 'أ. مدة العقد:\nتبدأ مدة هذا العقد من تاريخ: _______________ وتنتهي في تاريخ: _______________ (في حال العقود محددة المدة).\nفي حال العقود غير محددة المدة، يظل العقد سارياً حتى إنهائه وفق أحكام هذا العقد.\n\nب. فترة الاختبار (Probation Period):\n- مدة فترة الاختبار: _______________ أشهر اعتباراً من تاريخ بدء العمل.\n- خلال فترة الاختبار، يحق لأي من الطرفين إنهاء العقد بإشعار كتابي مدته (14) يوماً دون الحاجة إلى تبرير.\n- تُقيَّم مستويات الأداء والالتزام والتكيّف مع بيئة العمل خلال هذه الفترة.\n- في حال اجتياز الاختبار بنجاح، يُتحوّل إلى العقد الدائم وتُحتسب فترة الاختبار ضمن سنوات الخدمة.\n- في حال الإخفاق، يحق للشركة إنهاء العقد فوراً مع صرف مستحقات الموظف المتراكمة فقط.' },
                { id: _cid(), title: 'خامساً: الراتب والتعويضات', text: 'أ. الراتب الأساسي:\nيتقاضى الموظف راتباً شهرياً إجمالياً قدره: _______________ (_______________) فقط لا غير، بعملة _______________.\n\nب. المكوّنات:\n- الراتب الأساسي: _______________\n- بدل السكن: _______________\n- بدل النقل: _______________\n- بدلات أخرى (تُحدد): _______________\n\nج. المكافآت والعمولات:\n- مكافأة الأداء السنوية: تُحتسب بنسبة ___% من الراتب السنوي، مشروطةً بتحقيق أهداف الأداء المعتمدة.\n- عمولة المبيعات / العملاء الجدد (إن انطبق): ___% من كل عقد جديد يُبرمه الموظف بصورة مباشرة.\n- شروط صرف المكافآت: يستوجب صرف أي مكافأة إتمام الموظف للسنة الكاملة وعدم وجود إجراءات تأديبية بحقه.\n\nد. طريقة ودورية الصرف:\n- يُصرف الراتب في: _______________ (تاريخ محدد من كل شهر).\n- طريقة الصرف: تحويل بنكي إلى حساب الموظف رقم: _______________\n- البنك: _______________\n\nهـ. مراجعة الراتب:\nيُراجع الراتب سنوياً في _______________ من كل عام استناداً إلى نتائج تقييم الأداء وأوضاع الشركة المالية، ولا يُعدّ إجراء المراجعة التزاماً بالزيادة.' },
                { id: _cid(), title: 'سادساً: ساعات العمل والعمل الإضافي', text: 'أ. ساعات العمل الرسمية:\n- عدد ساعات العمل اليومية: _______________ ساعات.\n- أيام العمل الأسبوعية: من _______________ إلى _______________.\n- إجمالي أيام العمل الأسبوعية: _______________ أيام.\n- وقت بدء الدوام: _______________ — وقت الانتهاء: _______________.\n\nب. فترات الاستراحة:\n- استراحة الغداء: _______________ دقيقة ولا تُحتسب من ساعات العمل.\n\nج. العمل الإضافي:\n- أي عمل يتجاوز ساعات الدوام الرسمية يُعدّ عملاً إضافياً ويستلزم طلباً مسبقاً معتمداً من المدير المباشر.\n- تُحتسب أجر الساعة الإضافية بنسبة (___%) فوق الأجر الأساسي للساعة وفق ما تنص عليه أحكام قانون العمل المعمول به.\n- في حال وجود مرونة في ساعات العمل (Flexible Hours)، يُحدد ذلك في ملحق مستقل.' },
                { id: _cid(), title: 'سابعاً: المهام والمسؤوليات الوظيفية التفصيلية', text: 'يلتزم الموظف بأداء جميع المهام المرتبطة بمنصبه على أكمل وجه، وتشمل (دون حصر):\n\n١. تنفيذ المهام الأساسية:\n- تنفيذ المهام التسويقية الموكلة إليه وفق الوصف الوظيفي المحدد في ملحق المهام.\n- الالتزام بمستويات الجودة المطلوبة والمعايير المهنية المعتمدة في الشركة.\n- إتمام المهام المسندة إليه في المواعيد المحددة دون تأخير.\n\n٢. الالتزام بالمواعيد:\n- احترام جميع مواعيد التسليم الداخلية والمتعلقة بالعملاء.\n- إبلاغ المدير المباشر فوراً في حال تعذّر الوفاء بأي موعد مع تقديم خطة بديلة.\n\n٣. التواصل والتنسيق:\n- المشاركة الفاعلة في اجتماعات الفريق والعصف الذهني.\n- إبقاء جميع الأطراف المعنية على اطلاع دائم بمستجدات العمل.\n- استخدام قنوات التواصل المعتمدة (البريد الإلكتروني، برامج إدارة المشاريع) بصورة منتظمة.\n\n٤. التقارير والمتابعة:\n- إعداد تقارير أداء أسبوعية أو شهرية وفق توجيهات الإدارة.\n- توثيق الأعمال المنجزة في الأنظمة والمنصات المعتمدة.\n- المساهمة في إعداد عروض تقديمية للعملاء عند الطلب.\n\n٥. التطوير المستمر:\n- مواكبة أحدث التطورات في مجال التسويق الرقمي وأدواته.\n- المشاركة في دورات التدريب والتطوير التي تُنظمها الشركة.\n- مشاركة المعرفة وأفضل الممارسات مع أعضاء الفريق.' },
                { id: _cid(), title: 'ثامناً: السرية وحماية المعلومات', text: 'أ. نطاق الالتزام:\nيلتزم الموظف بالحفاظ التام على سرية جميع المعلومات السرية والحساسة التي يطّلع عليها بحكم وظيفته أو خلال تأديته لمهامه، بما في ذلك:\n- بيانات العملاء وأسماؤهم وعقودهم وميزانياتهم.\n- استراتيجيات التسويق والخطط التشغيلية والأفكار الإبداعية.\n- بيانات الأداء ونتائج الحملات والتحليلات.\n- قوائم الموردين والشركاء والأسعار التفاوضية.\n- أي معلومات تجارية أو مالية أو تنظيمية غير معلنة.\n\nب. الالتزامات التفصيلية:\n- عدم مشاركة أي معلومات سرية مع أطراف خارجية تحت أي ظرف دون إذن كتابي صريح.\n- عدم استخدام المعلومات السرية لأغراض شخصية أو لصالح طرف آخر.\n- إبلاغ الإدارة فوراً في حال الاشتباه في تسرب أي معلومات سرية.\n- إعادة جميع الوثائق والملفات والبيانات السرية للشركة فور انتهاء العلاقة الوظيفية.\n\nج. مدة الالتزام:\nيستمر هذا الالتزام خلال فترة العمل وبعد انتهاء العلاقة الوظيفية بمدة (3) سنوات على الأقل.\n\nد. العقوبات:\nيترتب على أي انتهاك لهذا الالتزام الحق في رفع دعوى مدنية وجنائية ضد الموظف وإلزامه بتعويض الأضرار التي تلحق بالشركة.' },
                { id: _cid(), title: 'تاسعاً: عدم المنافسة والتعارض في المصالح', text: 'أ. حظر العمل لدى المنافسين:\nيلتزم الموظف خلال فترة عمله في الشركة وبعد انتهاء عقده بمدة (12) شهراً بعدم:\n- العمل لدى أي شركة أو وكالة تقدم خدمات مماثلة أو منافسة لنشاط الشركة الرئيسي.\n- تقديم استشارات أو خدمات بصفة مستقلة لعملاء الشركة الحاليين أو السابقين (خلال 24 شهراً من انتهاء التعاون).\n- إنشاء أو المشاركة في تأسيس مشروع ينافس نشاط الشركة.\n\nب. الإفصاح عن تعارض المصالح:\n- يلتزم الموظف بالإفصاح الكتابي الفوري لصاحب العمل عن أي نشاط جانبي (دوام جزئي، مشروع شخصي) قبل مزاولته، للتأكد من عدم تعارضه مع مصالح الشركة.\n- يحق للشركة الاعتراض على أي نشاط يراه صاحب العمل متعارضاً مع مصالحها.\n\nج. التعويض:\nفي حال ثبوت مخالفة هذه البنود، يلتزم الموظف بتعويض الشركة عن الأضرار المباشرة وغير المباشرة الناجمة عن ذلك، ويحق للشركة اللجوء إلى القضاء للمطالبة بالتعويض المناسب.' },
                { id: _cid(), title: 'عاشراً: الملكية الفكرية وحقوق الإنتاج', text: 'أ. ملكية مخرجات العمل:\nجميع الأعمال والإنتاجات والابتكارات والمحتوى (تصاميم، فيديوهات، نصوص، أكواد برمجية، استراتيجيات، أدوات، نماذج) التي ينتجها الموظف أو يساهم في إنتاجها بصفته الوظيفية أو باستخدام موارد الشركة، تُعدّ ملكاً حصرياً لصاحب العمل، وتنتقل إليه جميع الحقوق المرتبطة بها تلقائياً دون الحاجة إلى إجراءات إضافية.\n\nب. الاستمرار بعد الانتهاء:\nيسري هذا الحكم على جميع الأعمال المنجزة خلال فترة العمل، حتى في حال الانتهاء من أي مشروع بعد انتهاء العقد.\n\nج. المواد الشخصية السابقة:\nأي أعمال أو ابتكارات أنتجها الموظف قبل انضمامه إلى الشركة تظل ملكاً له شخصياً، ويلتزم بالإفصاح عنها كتابياً عند التوقيع على هذا العقد لتجنب أي تداخل مستقبلي.' },
                { id: _cid(), title: 'حادي عشر: سياسة الإجازات والغياب', text: 'أ. الإجازة السنوية:\n- يستحق الموظف إجازة سنوية مدفوعة الأجر مدتها _______________ يوماً في السنة.\n- تُحتسب الإجازة بعد اجتياز فترة الاختبار بنجاح.\n- يُقدَّم طلب الإجازة قبل (7) أيام عمل على الأقل للموافقة من المدير المباشر.\n- الإجازات غير المستخدمة: يجوز ترحيل ما لا يزيد على (5) أيام للسنة التالية، وما زاد يسقط ما لم يتفق على خلاف ذلك.\n\nب. الإجازة المرضية:\n- يستحق الموظف إجازة مرضية مدفوعة الأجر وفق أحكام قانون العمل المعمول به.\n- يلتزم الموظف بإخطار الشركة قبل بدء دوامه وتقديم تقرير طبي معتمد في حال تجاوز الغياب يومَين متتاليَين.\n\nج. الإجازات الرسمية:\n- يستفيد الموظف من أيام العطل الرسمية المعلنة في الدولة.\n- في حال اضطر الموظف للعمل في يوم رسمي بناءً على طلب الشركة، يستحق يوم بديلاً أو تعويضاً وفق القانون.\n\nد. الغياب غير المبرر:\n- أي غياب دون إذن مسبق أو ما يثبته من عذر مقبول يُعدّ غياباً غير مبرر ويخضع للخصم من الراتب وللإجراءات التأديبية المقررة.' },
                { id: _cid(), title: 'ثاني عشر: قواعد السلوك والآداب المهنية', text: 'يلتزم الموظف بالمعايير المهنية والأخلاقية التالية:\n\n١. الانضباط والالتزام:\n- الحضور في المواعيد المحددة والإخطار المسبق عن أي تأخر أو غياب.\n- الالتزام باللباس المهني اللائق وفق سياسة الشركة.\n- إتمام المهام الموكلة في الوقت المحدد بجودة عالية.\n\n٢. الاحترام والتعاون:\n- التعامل باحترام ومهنية مع جميع الزملاء والعملاء والشركاء بصرف النظر عن أي اختلافات.\n- المساهمة في بيئة عمل إيجابية وداعمة.\n- الامتناع عن أي شكل من أشكال التحرش أو التنمر أو التمييز.\n\n٣. استخدام الموارد:\n- استخدام معدات وبرامج وأنظمة الشركة للأغراض المهنية حصراً.\n- عدم الوصول إلى محتوى غير لائق أو محظور من خلال شبكة الشركة.\n- الحفاظ على المعدات وإبلاغ الإدارة فوراً عن أي عطل أو تلف.\n\n٤. وسائل التواصل الاجتماعي:\n- الامتناع عن نشر أي محتوى يمس سمعة الشركة أو يكشف معلوماتها السرية.\n- الحصول على موافقة مسبقة قبل الإفصاح عن أي معلومة تتعلق بالشركة أو عملائها على المنصات العامة.\n\n٥. الحياد والنزاهة:\n- الامتناع عن قبول أي هدايا أو مزايا من عملاء أو موردين دون علم الإدارة وموافقتها.' },
                { id: _cid(), title: 'ثالث عشر: الجزاءات والإجراءات التأديبية', text: 'أ. التدرج في الجزاءات:\nتُطبَّق الجزاءات التأديبية بصورة متدرجة وفق جسامة المخالفة وتكرارها:\n\nالمرحلة الأولى — الإنذار الشفهي:\nتُوجَّه للمخالفات الخفيفة (التأخر، الإهمال البسيط).\n\nالمرحلة الثانية — الإنذار الكتابي:\nيُصدر بعد تكرار المخالفة أو ارتكاب مخالفة متوسطة. يُدوَّن في ملف الموظف.\n\nالمرحلة الثالثة — الخصم من الراتب:\nيُطبَّق في حال تكرار المخالفات أو التقصير الموثق، بنسب تتناسب مع حجم التقصير وفق أحكام قانون العمل.\n\nالمرحلة الرابعة — الإنهاء الفوري:\nيُطبَّق في حالات الإخلال الجسيم كالاختلاس، الإضرار المتعمد، الإفصاح عن أسرار الشركة، التزوير، السلوك العدائي.\n\nب. إجراءات التحقيق:\n- لا يُطبَّق أي جزاء دون إجراء تحقيق عادل يُمنح فيه الموظف فرصة الدفاع عن نفسه كتابياً.\n- تُوثَّق جميع الجزاءات في ملف الموظف.' },
                { id: _cid(), title: 'رابع عشر: إنهاء العقد', text: 'أ. الإنهاء المعتاد بالإشعار المسبق:\n- يحق لأي من الطرفين إنهاء هذا العقد بتقديم إشعار كتابي مسبق لا يقل عن (30) يوم عمل.\n- خلال فترة الإشعار، يلتزم الموظف بأداء مهامه بصورة طبيعية وتسليم أعماله للخلف.\n\nب. الإنهاء الفوري من قِبل الشركة:\nيحق للشركة إنهاء العقد فوراً دون الحاجة لفترة إشعار في الحالات التالية:\n- الاختلاس أو السرقة أو ثبوت الغش والتزوير.\n- الإفصاح المتعمد عن أسرار الشركة لجهات منافسة.\n- الغياب غير المبرر لمدة تزيد على (5) أيام عمل متتالية.\n- ارتكاب جريمة جنائية تمس الشرف والأمانة.\n- الإساءة الجسدية أو اللفظية الموثقة لزميل أو عميل.\n\nج. الإنهاء بمبادرة الموظف:\n- يحق للموظف الاستقالة بتقديم إشعار كتابي مسبق وفق المدة المنصوص عليها.\n- في حال عدم الالتزام بفترة الإشعار، يحق للشركة خصم ما يعادل راتب الفترة غير المُلتزم بها.\n\nد. التسوية النهائية:\n- تُحتسب المستحقات النهائية للموظف خلال (7) أيام عمل من تاريخ إنهاء العقد، شاملةً الراتب المستحق والإجازات المتراكمة ومكافأة نهاية الخدمة وفق القانون.\n- لا تُصرف المستحقات قبل تسليم الموظف لجميع ممتلكات الشركة وإتمام إجراءات التسليم والتسلّم.' },
                { id: _cid(), title: 'خامس عشر: المعدات والأصول والممتلكات', text: 'أ. تزويد الموظف بالأدوات:\nتلتزم الشركة بتزويد الموظف بالأدوات والمعدات اللازمة لأداء مهامه، وقد تشمل:\n- حاسوب محمول / جهاز كمبيوتر.\n- هاتف عمل (في حال الاقتضاء).\n- اشتراكات البرامج والأنظمة المطلوبة.\n- وصول لحسابات العمل والمنصات الرقمية.\n\nب. مسؤوليات الموظف:\n- الحفاظ على ممتلكات الشركة وصونها من الضياع أو التلف.\n- استخدامها للأغراض المهنية حصراً وعدم إتاحتها لطرف ثالث.\n- إبلاغ الشركة فوراً في حال فقدان أي معدة أو تعرضها للسرقة أو التلف.\n- إعادة جميع ممتلكات الشركة فور انتهاء العقد، بما فيها الأجهزة والوثائق والبيانات.\n\nج. المسؤولية عن الأضرار:\nيتحمل الموظف المسؤولية المالية عن أي تلف أو فقدان ناجم عن إهماله أو سوء استخدامه المتعمد لممتلكات الشركة، وتُخصم التكاليف المرتبطة بذلك من راتبه بعد التحقيق والتثبت.' },
                { id: _cid(), title: 'سادس عشر: القانون الواجب التطبيق وتسوية النزاعات', text: 'أ. القانون المنظِّم:\nيخضع هذا العقد ويُفسَّر وفقاً لأحكام قانون العمل واللوائح المعمول بها في _______________.\n\nب. التسوية الودية:\nفي حال نشوء أي خلاف بين الطرفين يتعلق بتفسير هذا العقد أو تطبيقه أو إنهائه، يتعهد الطرفان بالسعي الجاد نحو تسويته وداً عبر التفاوض المباشر خلال (15) يوم عمل من تاريخ نشوء الخلاف.\n\nج. إجراءات التقاضي:\nفي حال تعذّرت التسوية الودية، يحق لأي من الطرفين اللجوء إلى الجهات القضائية المختصة ومحاكم العمل في _______________ للفصل في النزاع.\n\nد. استمرار العمل:\nلا يُعفي نشوء أي نزاع بين الطرفين أياً منهما من الاستمرار في الوفاء بالتزاماته التعاقدية الأخرى ما لم يُقرر بخلاف ذلك.' },
                { id: _cid(), title: 'سابع عشر: أحكام ختامية وتوقيعات', text: 'أ. الأحكام الختامية:\n- يُشكّل هذا العقد والوثائق المرفقة به الاتفاقية الكاملة بين الطرفين ويحل محل جميع الاتفاقيات والوعود الشفهية أو الكتابية السابقة.\n- لا يجوز تعديل أي بند من بنود هذا العقد إلا بموافقة كتابية موقعة من الطرفين.\n- إذا تبيّن أن أي بند غير قانوني أو غير قابل للتنفيذ، فإن ذلك لا يؤثر على سريان بقية البنود.\n- يقرّ الموظف بأنه قرأ هذا العقد بعناية وفهم جميع بنوده، وأنه يوقّعه طوعاً دون أي إكراه.\n\nب. توقيع صاحب العمل:\nالاسم: ___________________________\nالصفة: ___________________________\nالتوقيع: ___________________________\nالتاريخ: ___________________________\nختم الشركة: ___________________________\n\nج. توقيع الموظف:\nالاسم الكامل: ___________________________\nرقم الهوية: ___________________________\nالتوقيع: ___________________________\nالتاريخ: ___________________________' }
            ];
        }

        function _cid() { return 'cl-' + Date.now() + '-' + Math.floor(Math.random() * 10000); }

        // Shared utility for contract date formatting
        function formatContractDate(d) {
            if (!d) return '___________';
            try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' }); } catch(e) { return d; }
        }

        // --- Contract: Tab Switcher ---
        window.switchContractTab = function(tabId) {
            const editorTab = document.getElementById('ct-tab-editor');
            const historyTab = document.getElementById('ct-tab-history');
            const exportDock = document.getElementById('ct-export-section');
            const pills = document.querySelectorAll('#contract-module .ui-sub-tabs .ui-nav-pill');
            if (editorTab) editorTab.classList.toggle('active', tabId === 'editor');
            if (historyTab) historyTab.classList.toggle('active', tabId === 'history');
            if (exportDock) {
                exportDock.style.display = tabId === 'editor' ? '' : 'none';
                if (tabId === 'editor') exportDock.classList.remove('dock-hidden');
            }
            pills.forEach(btn => btn.classList.toggle('active', btn.dataset.ctab === tabId));
            if (tabId === 'history') window.renderCtHistoryList();
        };
        window.switchEmpContractTab = function(tabId) {
            const editorTab = document.getElementById('ec-tab-editor');
            const historyTab = document.getElementById('ec-tab-history');
            const exportDock = document.getElementById('ec-export-section');
            const pills = document.querySelectorAll('#empcontract-module .ui-sub-tabs .ui-nav-pill');
            if (editorTab) editorTab.classList.toggle('active', tabId === 'editor');
            if (historyTab) historyTab.classList.toggle('active', tabId === 'history');
            if (exportDock) {
                exportDock.style.display = tabId === 'editor' ? '' : 'none';
                if (tabId === 'editor') exportDock.classList.remove('dock-hidden');
            }
            pills.forEach(btn => btn.classList.toggle('active', btn.dataset.ectab === tabId));
            if (tabId === 'history') window.renderEcHistoryList();
        };

        // --- Contract: Services ---
        window.addContractService = function(name) {
            const id = 'cts-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
            const container = document.getElementById('ct-services-container');
            if (!container) return;
            const row = document.createElement('div');
            row.className = 'ct-service-editor-row';
            row.id = id;
            row.dataset.id = id;
            row.innerHTML = `
                <span class="text-slate-400 cursor-grab text-lg leading-none select-none">⠿</span>
                <input type="text" class="ui-input flex-1 !py-2 !text-sm" placeholder="Service name" value="${name || ''}" oninput="window.debouncedRenderContract()">
                <button onclick="document.getElementById('${id}').remove(); window.debouncedRenderContract();" class="ui-button ui-button-danger !py-1.5 !px-2.5 !text-xs shrink-0" title="Remove">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>`;
            container.appendChild(row);
            ctServices = _readCtServices();
            const countEl = document.getElementById('ct-services-count');
            if (countEl) countEl.textContent = ctServices.length;
            window.debouncedRenderContract();
        };

        function _readCtServices() {
            const rows = document.querySelectorAll('#ct-services-container .ct-service-editor-row');
            return Array.from(rows).map(r => r.querySelector('input').value).filter(v => v.trim());
        }

        // --- Contract: Clauses ---
        function _renderClauseRow(prefix, clause, container, lang) {
            const isArabic = (lang || contractLang) !== 'en';
            const C = CONTRACT_CONTENT[isArabic ? 'ar' : 'en'];
            const clauseDir = isArabic ? 'rtl' : 'ltr';
            const clauseAlign = isArabic ? 'right' : 'left';
            const clauseFont = isArabic ? "'Noto Sans Arabic',sans-serif" : 'inherit';
            const row = document.createElement('div');
            row.className = 'ct-clause-editor-row';
            row.id = 'row-' + clause.id;
            row.dataset.clauseId = clause.id;
            row.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <input type="text" class="ui-input !py-1.5 !text-sm font-bold flex-1 mr-2" placeholder="${C.clauseTitlePlaceholder}" value="${clause.title || ''}" dir="${clauseDir}" style="text-align:${clauseAlign};" oninput="window.debouncedRenderContract()">
                    <div class="flex gap-1 shrink-0">
                        <button class="ui-button-ghost !py-1 !px-2 text-xs" title="Move Up" onclick="(function(el){const prev=el.previousElementSibling;if(prev)el.parentNode.insertBefore(el,prev);})(document.getElementById('row-${clause.id}')); window.debouncedRenderContract();">↑</button>
                        <button class="ui-button-ghost !py-1 !px-2 text-xs" title="Move Down" onclick="(function(el){const next=el.nextElementSibling;if(next)next.parentNode.insertBefore(next,el);})(document.getElementById('row-${clause.id}')); window.debouncedRenderContract();">↓</button>
                        <button class="ui-button-ghost !py-1 !px-2 text-xs !text-red-500 hover:!bg-red-50" title="Delete" onclick="document.getElementById('row-${clause.id}').remove(); window.debouncedRenderContract();">✕</button>
                    </div>
                </div>
                <textarea class="ui-input text-sm resize-y w-full" rows="3" dir="${clauseDir}" style="text-align:${clauseAlign};font-family:${clauseFont};" placeholder="${C.clauseTextPlaceholder}" oninput="window.debouncedRenderContract()">${clause.text || ''}</textarea>`;
            container.appendChild(row);
        }

        function _renderEmpClauseRow(clause, container, lang) {
            const isArabic = (lang || empContractLang) !== 'en';
            const C = CONTRACT_CONTENT[isArabic ? 'ar' : 'en'];
            const clauseDir = isArabic ? 'rtl' : 'ltr';
            const clauseAlign = isArabic ? 'right' : 'left';
            const clauseFont = isArabic ? "'Noto Sans Arabic',sans-serif" : 'inherit';
            const row = document.createElement('div');
            row.className = 'ct-clause-editor-row';
            row.id = 'erow-' + clause.id;
            row.dataset.clauseId = clause.id;
            row.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <input type="text" class="ui-input !py-1.5 !text-sm font-bold flex-1 mr-2" placeholder="${C.clauseTitlePlaceholder}" value="${clause.title || ''}" dir="${clauseDir}" style="text-align:${clauseAlign};" oninput="window.debouncedRenderEmpContract()">
                    <div class="flex gap-1 shrink-0">
                        <button class="ui-button-ghost !py-1 !px-2 text-xs" title="Move Up" onclick="(function(el){const prev=el.previousElementSibling;if(prev)el.parentNode.insertBefore(el,prev);})(document.getElementById('erow-${clause.id}')); window.debouncedRenderEmpContract();">↑</button>
                        <button class="ui-button-ghost !py-1 !px-2 text-xs" title="Move Down" onclick="(function(el){const next=el.nextElementSibling;if(next)next.parentNode.insertBefore(next,el);})(document.getElementById('erow-${clause.id}')); window.debouncedRenderEmpContract();">↓</button>
                        <button class="ui-button-ghost !py-1 !px-2 text-xs !text-red-500 hover:!bg-red-50" title="Delete" onclick="document.getElementById('erow-${clause.id}').remove(); window.debouncedRenderEmpContract();">✕</button>
                    </div>
                </div>
                <textarea class="ui-input text-sm resize-y w-full" rows="3" dir="${clauseDir}" style="text-align:${clauseAlign};font-family:${clauseFont};" placeholder="${C.clauseTextPlaceholder}" oninput="window.debouncedRenderEmpContract()">${clause.text || ''}</textarea>`;
            container.appendChild(row);
        }

        window.addContractClause = function() {
            const container = document.getElementById('ct-clauses-container');
            if (!container) return;
            const clause = { id: _cid(), title: '', text: '' };
            _renderClauseRow('ct', clause, container);
            window.debouncedRenderContract();
        };

        window.addEmpContractClause = function() {
            const container = document.getElementById('ec-clauses-container');
            if (!container) return;
            const clause = { id: _cid(), title: '', text: '' };
            _renderEmpClauseRow(clause, container);
            window.debouncedRenderEmpContract();
        };

        function _readClauses(containerSelector) {
            const rows = document.querySelectorAll(containerSelector + ' .ct-clause-editor-row');
            return Array.from(rows).map(r => ({
                title: r.querySelector('input')?.value || '',
                text: r.querySelector('textarea')?.value || ''
            }));
        }

        // --- Debounced Render ---
        window.debouncedRenderContract = function() {
            clearTimeout(ctRenderTimeout);
            ctRenderTimeout = setTimeout(() => window.renderContractPreview(), debounceDelay);
        };
        window.debouncedRenderEmpContract = function() {
            clearTimeout(ecRenderTimeout);
            ecRenderTimeout = setTimeout(() => window.renderEmpContractPreview(), debounceDelay);
        };

        // --- Contract Language Switcher ---
        window.setContractLang = function(type, lang) {
            const isEmp = type === 'empcontract';
            if (isEmp) {
                empContractLang = lang;
                // Reload default clauses in the selected language
                const ecClContainer = document.getElementById('ec-clauses-container');
                if (ecClContainer) {
                    ecClContainer.innerHTML = '';
                    getDefaultEmpClauses(lang).forEach(cl => _renderEmpClauseRow(cl, ecClContainer, lang));
                    const ec = document.getElementById('ec-clauses-count');
                    if (ec) ec.textContent = getDefaultEmpClauses(lang).length;
                }
                window.renderEmpContractPreview();
            } else {
                contractLang = lang;
                // Reload default services in the selected language
                const ctSvcContainer = document.getElementById('ct-services-container');
                if (ctSvcContainer) {
                    ctSvcContainer.innerHTML = '';
                    getDefaultContractServices(lang).forEach(s => window.addContractService(s));
                }
                // Reload default clauses in the selected language
                const ctClContainer = document.getElementById('ct-clauses-container');
                if (ctClContainer) {
                    ctClContainer.innerHTML = '';
                    getDefaultClientClauses(lang).forEach(cl => _renderClauseRow('ct', cl, ctClContainer, lang));
                    const cc = document.getElementById('ct-clauses-count');
                    if (cc) cc.textContent = getDefaultClientClauses(lang).length;
                }
                window.renderContractPreview();
            }
        };

        // --- Contract Preview Render ---
        window.renderContractPreview = function() {
            const content = document.getElementById('contractPageContent');
            if (!content) return;

            const v = id => document.getElementById(id)?.value || '';
            const lang = document.getElementById('ct-lang')?.value || contractLang;
            const C = CONTRACT_CONTENT[lang] || CONTRACT_CONTENT['ar'];
            const isArabic = lang === 'ar';
            const dir = isArabic ? 'rtl' : 'ltr';
            const fontFamily = isArabic ? "'Noto Sans Arabic',sans-serif" : "'Inter',sans-serif";
            const alignStyle = isArabic ? 'right' : 'left';

            const currency = v('ct-currency') || 'EGP';
            const totalVal = parseFloat(v('ct-total-value')) || 0;
            const services = _readCtServices();
            const clauses = _readClauses('#ct-clauses-container');
            const countEl = document.getElementById('ct-services-count');
            if (countEl) countEl.textContent = _readCtServices().length;
            const clauseCountEl = document.getElementById('ct-clauses-count');
            if (clauseCountEl) clauseCountEl.textContent = clauses.length;

            const fmtDate = (d) => {
                if (!d) return '___________';
                try {
                    const locale = isArabic ? 'ar-EG' : 'en-GB';
                    return new Date(d + 'T12:00:00').toLocaleDateString(locale, { day:'2-digit', month:'long', year:'numeric' });
                } catch(e) { return d; }
            };

            let html = `<div style="font-family:${fontFamily};direction:${dir};">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;${isArabic ? 'flex-direction:row-reverse;' : ''}">
                    <div>
                        <img src="https://i.postimg.cc/PJ0fwSNY/OPENY.png" crossorigin="anonymous" alt="OPENY" style="height:40px;width:auto;object-fit:contain;display:block;">
                        <div style="font-size:10.5px;color:#6B7280;margin-top:6px;line-height:1.45;font-family:'Inter',sans-serif;direction:ltr;">Villa 175, First District, Fifth Settlement, Cairo<br>info@openytalk.com</div>
                    </div>
                    <div style="text-align:${isArabic ? 'left' : 'right'};">
                        <div style="font-size:28px;font-weight:900;letter-spacing:3px;color:#111;margin:0 0 6px 0;font-family:${fontFamily};">${C.contractLabel}</div>
                        <div style="font-size:11px;color:#555;line-height:1.7;font-family:${fontFamily};text-align:${isArabic ? 'left' : 'right'};">
                            <div><span style="font-weight:700;color:#111;">${C.noLabel}</span> ${v('ct-num') || '___'}</div>
                            <div><span style="font-weight:700;color:#111;">${C.dateLabel}</span> ${fmtDate(v('ct-date'))}</div>
                            <div><span style="font-weight:700;color:#111;">${C.durationLabel}</span> ${v('ct-duration') || '___'} ${C.monthsLabel}</div>
                        </div>
                    </div>
                </div>
                <div class="ct-header-divider"></div>

                <!-- Title Band -->
                <div style="text-align:center;margin:12px 0;padding:10px;background:#111;color:#fff;">
                    <div style="font-size:18px;font-weight:900;letter-spacing:1px;font-family:'Noto Sans Arabic',sans-serif;direction:${dir};">${C.clientContractTitle}</div>
                    <div style="font-size:11px;opacity:0.8;margin-top:3px;font-family:'Noto Sans Arabic',sans-serif;direction:${dir};">${C.clientContractSubtitle}</div>
                </div>

                <!-- Parties -->
                <div class="ct-party-grid" style="margin:14px 0;">
                    <div class="ct-party-box">
                        <div class="ct-party-header">${C.party1Provider}</div>
                        <div class="ct-party-body">
                            <div class="ct-party-name" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ct-p1-name') || C.defaultCompanyName}</div>
                            ${v('ct-p1-rep') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.repLabel} ${v('ct-p1-rep')}</div>` : ''}
                            ${v('ct-p1-address') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ct-p1-address')}</div>` : ''}
                            ${v('ct-p1-email') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ct-p1-email')}</div>` : ''}
                            ${v('ct-p1-phone') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ct-p1-phone')}</div>` : ''}
                            ${v('ct-p1-tax') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.taxLabel} ${v('ct-p1-tax')}</div>` : ''}
                        </div>
                    </div>
                    <div class="ct-party-box">
                        <div class="ct-party-header">${C.party2Client}</div>
                        <div class="ct-party-body">
                            <div class="ct-party-name" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ct-p2-name') || C.clientNameDefault}</div>
                            ${v('ct-p2-rep') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.repLabel} ${v('ct-p2-rep')}</div>` : ''}
                            ${v('ct-p2-address') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ct-p2-address')}</div>` : ''}
                            ${v('ct-p2-email') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ct-p2-email')}</div>` : ''}
                            ${v('ct-p2-phone') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ct-p2-phone')}</div>` : ''}
                            ${v('ct-p2-tax') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.taxLabel} ${v('ct-p2-tax')}</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Included Services -->
                ${services.length > 0 ? `
                <div style="margin-bottom:14px;page-break-inside:avoid;">
                    <div class="ct-section-label">${C.includedServices}</div>
                    <ul class="ct-services-list" style="direction:${dir};text-align:${alignStyle};font-family:${fontFamily};">${services.map(s => `<li>${s}</li>`).join('')}</ul>
                </div>` : ''}

                <!-- Financial Details -->
                <div style="margin-bottom:14px;page-break-inside:avoid;">
                    <div class="ct-section-label">${C.financialDetails}</div>
                    <div class="ct-financial-box" style="direction:${dir};font-family:${fontFamily};">
                        <div class="ct-financial-row"><span>${C.paymentMethod}</span><span>${v('ct-payment-method') || '—'}</span></div>
                        ${v('ct-payment-terms') ? `<div class="ct-financial-row"><span>${C.paymentTerms}</span><span>${v('ct-payment-terms')}</span></div>` : ''}
                        ${v('ct-financial-notes') ? `<div class="ct-financial-row" style="flex-direction:column;gap:3px;"><span style="font-weight:600;">${C.notesLabel}</span><span style="color:#555;font-size:10.5px;">${v('ct-financial-notes')}</span></div>` : ''}
                        <div class="ct-financial-total" style="font-family:${fontFamily};">
                            <span>${C.totalContractValue}</span>
                            <span>${totalVal > 0 ? new Intl.NumberFormat('en-US',{minimumFractionDigits:2}).format(totalVal) + ' ' + currency : '___________'}</span>
                        </div>
                    </div>
                </div>

                <!-- Legal Clauses -->
                ${clauses.length > 0 ? `
                <div style="margin-bottom:14px;">
                    <div class="ct-section-label">${C.termsConditions}</div>
                    ${clauses.map((cl, i) => `
                    <div class="ct-clause" style="direction:${dir};">
                        <div style="text-align:${alignStyle};"><span class="ct-clause-num">${i+1}</span> <span class="ct-clause-title-text" style="font-family:${fontFamily};direction:${dir};text-align:${alignStyle};">${cl.title}</span></div>
                        <div class="ct-clause-body" style="margin-top:3px;${isArabic ? 'padding-right:24px;' : 'padding-left:24px;'}direction:${dir};text-align:${alignStyle};font-family:${fontFamily};">${cl.text.replace(/\n/g,'<br>')}</div>
                    </div>`).join('')}
                </div>` : ''}

                <!-- Signatures -->
                <div class="ct-sig-grid" style="page-break-inside:avoid;">
                    <div class="ct-sig-block">
                        <div class="ct-sig-party-label" style="font-family:${fontFamily};">${C.sigParty1}</div>
                        <div class="ct-sig-name-line"></div>
                        <div class="ct-sig-name-text" style="font-family:${fontFamily};">${v('ct-sig1-name') || C.authorizedRep}</div>
                        <div class="ct-sig-role-text" style="font-family:${fontFamily};">${v('ct-p1-name') || C.defaultCompanyName}</div>
                        ${v('ct-sig-date') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigDate} ${fmtDate(v('ct-sig-date'))}</div>` : ''}
                        ${v('ct-sig-place') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigPlace} ${v('ct-sig-place')}</div>` : ''}
                    </div>
                    <div class="ct-sig-block">
                        <div class="ct-sig-party-label" style="font-family:${fontFamily};">${C.sigParty2}</div>
                        <div class="ct-sig-name-line"></div>
                        <div class="ct-sig-name-text" style="font-family:${fontFamily};">${v('ct-sig2-name') || C.authorizedRep}</div>
                        <div class="ct-sig-role-text" style="font-family:${fontFamily};">${v('ct-p2-name') || C.clientNameDefault}</div>
                        ${v('ct-sig-date') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigDate} ${fmtDate(v('ct-sig-date'))}</div>` : ''}
                        ${v('ct-sig-place') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigPlace} ${v('ct-sig-place')}</div>` : ''}
                    </div>
                </div>
            </div>`;

            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            content.innerHTML = '';
            content.appendChild(tmp);
            if (typeof window.adjustScreenScale === 'function') window.adjustScreenScale();
            setTimeout(() => {
                if (typeof window.fitContentToA4 === 'function') window.fitContentToA4('contractPageContent');
                paginateContractPreview('contractPageContent', 'contract-a4', 'contract-preview-area');
            }, 100);
        };

        // ==========================================================================
        // 11. CONTRACT SYSTEM — EMPLOYEE CONTRACT (عقد موظف)
        // ==========================================================================
        window.renderEmpContractPreview = function() {
            const content = document.getElementById('empContractPageContent');
            if (!content) return;

            const v = id => document.getElementById(id)?.value || '';
            const lang = document.getElementById('ec-lang')?.value || empContractLang;
            const C = CONTRACT_CONTENT[lang] || CONTRACT_CONTENT['ar'];
            const isArabic = lang === 'ar';
            const dir = isArabic ? 'rtl' : 'ltr';
            const fontFamily = isArabic ? "'Noto Sans Arabic',sans-serif" : "'Inter',sans-serif";
            const alignStyle = isArabic ? 'right' : 'left';

            const currency = v('ec-currency') || 'EGP';
            const salary = parseFloat(v('ec-salary')) || 0;
            const clauses = _readClauses('#ec-clauses-container');
            const clauseCountEl = document.getElementById('ec-clauses-count');
            if (clauseCountEl) clauseCountEl.textContent = clauses.length;

            const fmtDate = (d) => {
                if (!d) return '___________';
                try {
                    const locale = isArabic ? 'ar-EG' : 'en-GB';
                    return new Date(d + 'T12:00:00').toLocaleDateString(locale, { day:'2-digit', month:'long', year:'numeric' });
                } catch(e) { return d; }
            };

            let html = `<div style="font-family:${fontFamily};direction:${dir};">
                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;${isArabic ? 'flex-direction:row-reverse;' : ''}">
                    <div>
                        <img src="https://i.postimg.cc/PJ0fwSNY/OPENY.png" crossorigin="anonymous" alt="OPENY" style="height:40px;width:auto;object-fit:contain;display:block;">
                        <div style="font-size:10.5px;color:#6B7280;margin-top:6px;line-height:1.45;font-family:'Inter',sans-serif;direction:ltr;">Villa 175, First District, Fifth Settlement, Cairo<br>info@openytalk.com</div>
                    </div>
                    <div style="text-align:${isArabic ? 'left' : 'right'};">
                        <div style="font-size:26px;font-weight:900;letter-spacing:2px;color:#111;margin:0 0 6px 0;font-family:${fontFamily};">${C.employmentContractLabel}</div>
                        <div style="font-size:11px;color:#555;line-height:1.7;font-family:${fontFamily};text-align:${isArabic ? 'left' : 'right'};">
                            <div><span style="font-weight:700;color:#111;">${C.noLabel}</span> ${v('ec-num') || '___'}</div>
                            <div><span style="font-weight:700;color:#111;">${C.dateLabel}</span> ${fmtDate(v('ec-date'))}</div>
                        </div>
                    </div>
                </div>
                <div class="ct-header-divider"></div>

                <!-- Title Band -->
                <div style="text-align:center;margin:12px 0;padding:10px;background:#111;color:#fff;">
                    <div style="font-size:18px;font-weight:900;letter-spacing:1px;font-family:'Noto Sans Arabic',sans-serif;direction:${dir};">${C.empContractTitle}</div>
                    <div style="font-size:11px;opacity:0.8;margin-top:3px;font-family:'Noto Sans Arabic',sans-serif;direction:${dir};">${C.empContractSubtitle}</div>
                </div>

                <!-- Parties -->
                <div class="ct-party-grid" style="margin:14px 0;">
                    <div class="ct-party-box">
                        <div class="ct-party-header">${C.employer}</div>
                        <div class="ct-party-body">
                            <div class="ct-party-name" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ec-co-name') || C.defaultCompanyName}</div>
                            ${v('ec-co-rep') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.repLabel} ${v('ec-co-rep')}</div>` : ''}
                            ${v('ec-co-address') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ec-co-address')}</div>` : ''}
                            ${v('ec-co-email') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ec-co-email')}</div>` : ''}
                            ${v('ec-co-phone') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ec-co-phone')}</div>` : ''}
                        </div>
                    </div>
                    <div class="ct-party-box">
                        <div class="ct-party-header">${C.employee}</div>
                        <div class="ct-party-body">
                            <div class="ct-party-name" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ec-emp-name') || C.employeeNameDefault}</div>
                            ${v('ec-emp-id') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.idLabel} ${v('ec-emp-id')}</div>` : ''}
                            ${v('ec-emp-address') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${v('ec-emp-address')}</div>` : ''}
                            ${v('ec-emp-phone') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ec-emp-phone')}</div>` : ''}
                            ${v('ec-emp-email') ? `<div class="ct-party-detail" style="direction:ltr;text-align:${alignStyle};font-family:'Inter',sans-serif;">${v('ec-emp-email')}</div>` : ''}
                            ${v('ec-emp-nationality') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.nationalityLabel} ${v('ec-emp-nationality')}</div>` : ''}
                            ${v('ec-emp-marital') ? `<div class="ct-party-detail" style="font-family:${fontFamily};text-align:${alignStyle};">${C.maritalLabel} ${v('ec-emp-marital')}</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- Job & Employment Details -->
                <div style="margin-bottom:14px;page-break-inside:avoid;">
                    <div class="ct-section-label">${C.jobDetails}</div>
                    <div class="ct-financial-box" style="direction:${dir};font-family:${fontFamily};">
                        ${v('ec-job-title') ? `<div class="ct-financial-row"><span>${C.jobTitle}</span><span style="font-weight:700;">${v('ec-job-title')}</span></div>` : ''}
                        ${v('ec-job-dept') ? `<div class="ct-financial-row"><span>${C.department}</span><span>${v('ec-job-dept')}</span></div>` : ''}
                        ${v('ec-job-manager') ? `<div class="ct-financial-row"><span>${C.directManager}</span><span>${v('ec-job-manager')}</span></div>` : ''}
                        ${v('ec-job-type') ? `<div class="ct-financial-row"><span>${C.employmentType}</span><span>${v('ec-job-type')}</span></div>` : ''}
                        ${v('ec-start-date') ? `<div class="ct-financial-row"><span>${C.startDate}</span><span>${fmtDate(v('ec-start-date'))}</span></div>` : ''}
                        ${v('ec-emp-duration') ? `<div class="ct-financial-row"><span>${C.duration}</span><span>${v('ec-emp-duration')}</span></div>` : ''}
                        ${v('ec-probation') ? `<div class="ct-financial-row"><span>${C.probation}</span><span>${v('ec-probation')}</span></div>` : ''}
                        ${v('ec-workplace') ? `<div class="ct-financial-row"><span>${C.workplace}</span><span>${v('ec-workplace')}</span></div>` : ''}
                    </div>
                </div>

                <!-- Salary & Hours -->
                <div style="margin-bottom:14px;page-break-inside:avoid;">
                    <div class="ct-section-label">${C.compensation}</div>
                    <div class="ct-financial-box" style="direction:${dir};font-family:${fontFamily};">
                        ${v('ec-pay-method') ? `<div class="ct-financial-row"><span>${C.paymentMethod}</span><span>${v('ec-pay-method')}</span></div>` : ''}
                        ${v('ec-pay-date') ? `<div class="ct-financial-row"><span>${C.paymentDate}</span><span>${v('ec-pay-date')}</span></div>` : ''}
                        ${v('ec-daily-hours') ? `<div class="ct-financial-row"><span>${C.dailyHours}</span><span>${v('ec-daily-hours')} ${C.hrsPerDay}</span></div>` : ''}
                        ${v('ec-work-days') ? `<div class="ct-financial-row"><span>${C.workDays}</span><span>${v('ec-work-days')}</span></div>` : ''}
                        ${v('ec-vacations') ? `<div class="ct-financial-row"><span>${C.annualLeave}</span><span>${v('ec-vacations')}</span></div>` : ''}
                        ${v('ec-benefits') ? `<div class="ct-financial-row"><span>${C.benefits}</span><span>${v('ec-benefits')}</span></div>` : ''}
                        <div class="ct-financial-total" style="font-family:${fontFamily};">
                            <span>${C.basicMonthlySalary}</span>
                            <span>${salary > 0 ? new Intl.NumberFormat('en-US',{minimumFractionDigits:2}).format(salary) + ' ' + currency : '___________'}</span>
                        </div>
                    </div>
                </div>

                <!-- Legal Clauses -->
                ${clauses.length > 0 ? `
                <div style="margin-bottom:14px;">
                    <div class="ct-section-label">${C.termsConditions}</div>
                    ${clauses.map((cl, i) => `
                    <div class="ct-clause" style="direction:${dir};">
                        <div style="text-align:${alignStyle};"><span class="ct-clause-num">${i+1}</span> <span class="ct-clause-title-text" style="font-family:${fontFamily};direction:${dir};text-align:${alignStyle};">${cl.title}</span></div>
                        <div class="ct-clause-body" style="margin-top:3px;${isArabic ? 'padding-right:24px;' : 'padding-left:24px;'}direction:${dir};text-align:${alignStyle};font-family:${fontFamily};">${cl.text.replace(/\n/g,'<br>')}</div>
                    </div>`).join('')}
                </div>` : ''}

                <!-- Signatures -->
                <div class="ct-sig-grid" style="page-break-inside:avoid;">
                    <div class="ct-sig-block">
                        <div class="ct-sig-party-label" style="font-family:${fontFamily};">${C.empEmployer}</div>
                        <div class="ct-sig-name-line"></div>
                        <div class="ct-sig-name-text" style="font-family:${fontFamily};">${v('ec-sig1-name') || C.companyRep}</div>
                        <div class="ct-sig-role-text" style="font-family:${fontFamily};">${v('ec-co-name') || C.defaultCompanyName}</div>
                        ${v('ec-sig-date') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigDate} ${fmtDate(v('ec-sig-date'))}</div>` : ''}
                        ${v('ec-sig-place') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigPlace} ${v('ec-sig-place')}</div>` : ''}
                    </div>
                    <div class="ct-sig-block">
                        <div class="ct-sig-party-label" style="font-family:${fontFamily};">${C.empEmployee}</div>
                        <div class="ct-sig-name-line"></div>
                        <div class="ct-sig-name-text" style="font-family:${fontFamily};">${v('ec-sig2-name') || v('ec-emp-name') || C.employeeNameDefault}</div>
                        <div class="ct-sig-role-text" style="font-family:${fontFamily};">${v('ec-job-title') || ''}</div>
                        ${v('ec-sig-date') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigDate} ${fmtDate(v('ec-sig-date'))}</div>` : ''}
                        ${v('ec-sig-place') ? `<div class="ct-sig-date-place" style="font-family:${fontFamily};">${C.sigPlace} ${v('ec-sig-place')}</div>` : ''}
                    </div>
                </div>
            </div>`;

            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            content.innerHTML = '';
            content.appendChild(tmp);
            if (typeof window.adjustScreenScale === 'function') window.adjustScreenScale();
            setTimeout(() => {
                if (typeof window.fitContentToA4 === 'function') window.fitContentToA4('empContractPageContent');
                paginateContractPreview('empContractPageContent', 'empcontract-a4', 'empcontract-preview-area');
            }, 100);
        };

        // ==========================================================================
        // 11b. CONTRACT PAGED PREVIEW — Split into A4 pages
        // ==========================================================================
        function paginateContractPreview(contentId, a4PageId, previewAreaId) {
            const content = document.getElementById(contentId);
            const a4Page = document.getElementById(a4PageId);
            const previewArea = document.getElementById(previewAreaId);
            if (!content || !a4Page || !previewArea) return;

            // Remove any extra pages from previous render
            previewArea.querySelectorAll('.extra-preview-page').forEach(function(el) { el.remove(); });

            // Reset first page to natural dimensions
            a4Page.style.height = '';
            a4Page.style.overflow = '';

            // A4 natural dimensions: 297mm height, 12mm padding each side → 273mm usable
            // Use offsetHeight to get the current px value (accounts for any zoom/dpi)
            const pageHPx = a4Page.offsetHeight;    // e.g. ~1122px at 96dpi
            const padMm = 12;
            const pageMm = 297;
            const pxPerMm = pageHPx / pageMm;
            const usableHPx = (pageMm - 2 * padMm) * pxPerMm; // 273mm in px

            const contentH = content.scrollHeight;
            if (contentH <= usableHPx + 20) return; // single page, nothing to do

            const numPages = Math.ceil(contentH / usableHPx);

            // Clip first page to exactly A4 height
            a4Page.style.height = pageHPx + 'px';
            a4Page.style.overflow = 'hidden';

            // Capture the rendered HTML
            const innerHtml = content.innerHTML;

            // Get current scale from the first page (set by adjustScreenScale)
            const existingTransform = a4Page.style.transform || '';

            for (let i = 1; i < numPages; i++) {
                const shift = i * usableHPx;
                const newA4 = document.createElement('div');
                newA4.className = 'a4-page contract-root extra-preview-page';
                newA4.style.height = pageHPx + 'px';
                newA4.style.overflow = 'hidden';
                if (existingTransform) {
                    newA4.style.transform = existingTransform;
                    newA4.style.transformOrigin = 'top center';
                }

                const newContent = document.createElement('div');
                newContent.className = 'page-content';
                newContent.style.fontFamily = "'Inter',sans-serif";
                newContent.style.height = usableHPx + 'px';
                newContent.style.overflow = 'hidden';

                const shiftDiv = document.createElement('div');
                shiftDiv.style.marginTop = '-' + shift + 'px';
                shiftDiv.innerHTML = innerHtml;

                newContent.appendChild(shiftDiv);
                newA4.appendChild(newContent);

                // Insert after the last page in the preview area
                const lastPage = previewArea.querySelector('.extra-preview-page:last-child') || a4Page;
                lastPage.insertAdjacentElement('afterend', newA4);
            }
        }
        // ==========================================================================
        window.lazyGenerateContractPDF = async function(type) {
            const isEmp = type === 'empcontract';
            const btnId = isEmp ? 'ecBtnPDF' : 'ctBtnPDF';
            const elementId = isEmp ? 'empContractPageContent' : 'contractPageContent';
            const btn = document.getElementById(btnId);
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating PDF...';
            btn.disabled = true;

            await loadExportLibraries();

            const element = document.getElementById(elementId);
            const clientName = isEmp ? (document.getElementById('ec-emp-name')?.value || 'Employee') : (document.getElementById('ct-p2-name')?.value || 'Client');
            const refNum = isEmp ? (document.getElementById('ec-num')?.value || 'EC-001') : (document.getElementById('ct-num')?.value || 'C-001');
            const filename = sanitizeFilename(clientName, refNum);

            const origPadding = element.style.padding;
            const origWidth = element.style.width;
            const origMaxWidth = element.style.maxWidth;
            element.style.padding = '0px';
            element.style.width = '186mm';
            element.style.maxWidth = 'none';

            const wrapper = element.querySelector('.scale-wrapper');
            let origWrapperTransform = '', origWrapperWidth = '';
            if (wrapper) { origWrapperTransform = wrapper.style.transform; origWrapperWidth = wrapper.style.width; wrapper.style.transform = 'none'; wrapper.style.width = '100%'; }

            // Force DOM reflow and ensure Noto Sans Arabic font is ready before capture
            await Promise.all([new Promise(resolve => setTimeout(resolve, 300)), document.fonts.ready]);

            const opt = {
                margin: 12,
                filename: filename,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, letterRendering: true, allowTaint: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: ['.ct-clause', '.ct-sig-grid', '.ct-party-grid', '.avoid-break'] }
            };

            try {
                // ── 1. Save record FIRST (before generating file) ────────────────
                const contractType = isEmp ? 'HR contract' : 'client contract';
                console.log(`[OPENY] ${contractType} PDF save started`);
                const _nowCt = new Date();
                const _editingContractId = isEmp ? currentEditingEcId : currentEditingCtId;
                const ctStoreName = isEmp ? 'hrContracts' : 'clientContracts';
                const ctRecord = {
                    id: _editingContractId || Date.now().toString(),
                    client: clientName,
                    ref: refNum,
                    date: (isEmp ? document.getElementById('ec-date') : document.getElementById('ct-date'))?.value || _nowCt.toISOString().split('T')[0],
                    amount: parseFloat((isEmp ? document.getElementById('ec-salary') : document.getElementById('ct-total-value'))?.value || 0) || 0,
                    currency: (isEmp ? document.getElementById('ec-currency') : document.getElementById('ct-currency'))?.value || 'EGP',
                    status: (isEmp ? document.getElementById('ec-status') : document.getElementById('ct-status'))?.value || 'Draft',
                    timestamp: Date.now(),
                    type: isEmp ? 'empcontract' : 'contract',
                    year: _nowCt.getFullYear(),
                    month: _nowCt.getMonth() + 1,
                    day: _nowCt.getDate(),
                    source: 'web',
                    formSnapshot: isEmp ? _captureEcSnapshot() : _captureCtSnapshot()
                };
                await cloudDB.put(ctRecord, ctStoreName);
                console.log(`[OPENY] ${contractType} save success — record ID:`, ctRecord.id);
                await logActivity(_editingContractId ? 'updated' : 'created', isEmp ? 'hrcontract' : 'clientcontract', ctRecord.id, { client: ctRecord.client, ref: ctRecord.ref, amount: ctRecord.amount, currency: ctRecord.currency });
                console.log('[OPENY] History insert success for record:', ctRecord.id);

                // ── 2. Generate and download the PDF ────────────────────────────
                const ctPdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');
                const ctPdfUrl = await uploadExportToStorage(ctPdfBlob, ctStoreName, filename);
                if (ctPdfUrl) {
                    ctRecord.fileUrl = ctPdfUrl;
                    await cloudDB.put(ctRecord, ctStoreName);
                }
                saveAs(ctPdfBlob, filename);
                console.log(`[OPENY] ${contractType} PDF export success:`, filename);
                showToast('PDF Downloaded successfully!');

                // ── 3. Post-save housekeeping ────────────────────────────────────
                if (_editingContractId) { if (isEmp) window.stopEcEditing(); else window.stopCtEditing(); }

                // ── 4. Refresh history immediately ───────────────────────────────
                const renderFn = isEmp ? window.renderEcHistoryList : window.renderCtHistoryList;
                if (typeof renderFn === 'function') {
                    await renderFn();
                }
            } catch (e) {
                console.error('[OPENY] Contract PDF pipeline error:', e);
                showToast('Error generating PDF');
            } finally {
                element.style.padding = origPadding;
                element.style.width = origWidth;
                element.style.maxWidth = origMaxWidth;
                if (wrapper) { wrapper.style.transform = origWrapperTransform; wrapper.style.width = origWrapperWidth; }
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        window.lazyGenerateContractWord = async function(type) {
            const isEmp = type === 'empcontract';
            const btnId = isEmp ? 'ecBtnWord' : 'ctBtnWord';
            const elementId = isEmp ? 'empContractPageContent' : 'contractPageContent';
            const btn = document.getElementById(btnId);
            const originalText = btn.innerHTML;
            btn.innerHTML = 'Generating Word...';
            btn.disabled = true;

            await loadExportLibraries();

            const element = document.getElementById(elementId);
            const clientName = isEmp ? (document.getElementById('ec-emp-name')?.value || 'Employee') : (document.getElementById('ct-p2-name')?.value || 'Client');
            const refNum = isEmp ? (document.getElementById('ec-num')?.value || 'EC-001') : (document.getElementById('ct-num')?.value || 'C-001');
            const filename = sanitizeFilename(clientName, refNum).replace('.pdf', '.doc');

            try {
                const ctLang = isEmp ? (document.getElementById('ec-lang')?.value || empContractLang) : (document.getElementById('ct-lang')?.value || contractLang);
                const isCtArabic = ctLang === 'ar';
                const bodyFont = isCtArabic ? "'Noto Sans Arabic', sans-serif" : "'Arial', 'Calibri', sans-serif";
                const styleBlock = `<style>
                    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800;900&display=swap');
                    body { font-family: ${bodyFont}; font-size: 11pt; color: #111; direction: ${isCtArabic ? 'rtl' : 'ltr'}; }
                    .ct-header-divider { border-top: 3px solid #111; margin: 10pt 0 14pt; }
                    .ct-section-label { background: #111; color: #fff; font-size: 9pt; font-weight: bold; letter-spacing: 1pt; text-transform: uppercase; padding: 5pt 8pt; display: inline-block; margin-bottom: 8pt; }
                    .ct-party-grid { display: table; width: 100%; border-collapse: separate; border-spacing: 10pt; }
                    .ct-party-box { display: table-cell; border: 1.5pt solid #111; padding: 8pt; width: 50%; vertical-align: top; }
                    .ct-party-header { background: #111; color: #fff; font-size: 8pt; font-weight: bold; padding: 5pt 8pt; margin: -8pt -8pt 8pt; display: block; }
                    .ct-party-name { font-size: 14pt; font-weight: bold; font-family: ${bodyFont}; }
                    .ct-party-detail { font-size: 9pt; color: #555; margin-top: 2pt; font-family: ${bodyFont}; }
                    .ct-financial-box { border: 1pt solid #ddd; padding: 10pt; background: #f9f9f9; }
                    .ct-financial-row { display: flex; justify-content: space-between; font-size: 10pt; padding: 4pt 0; border-bottom: 1pt solid #eee; }
                    .ct-financial-total { background: #111; color: #fff; padding: 8pt 10pt; font-size: 11pt; font-weight: bold; display: flex; justify-content: space-between; margin: 6pt -10pt -10pt; }
                    .ct-clause { margin-bottom: 10pt; page-break-inside: avoid; }
                    .ct-clause-num { background: #111; color: #fff; font-size: 8pt; font-weight: bold; padding: 2pt 6pt; }
                    .ct-clause-title-text { font-size: 11pt; font-weight: bold; direction: ${isCtArabic ? 'rtl' : 'ltr'}; text-align: ${isCtArabic ? 'right' : 'left'}; font-family: ${bodyFont}; }
                    .ct-clause-body { font-size: 10pt; line-height: 1.8; direction: ${isCtArabic ? 'rtl' : 'ltr'}; text-align: ${isCtArabic ? 'right' : 'left'}; padding-${isCtArabic ? 'right' : 'left'}: 20pt; color: #333; font-family: ${bodyFont}; }
                    .ct-sig-grid { display: table; width: 100%; margin-top: 24pt; border-top: 2pt solid #111; padding-top: 14pt; }
                    .ct-sig-block { display: table-cell; width: 50%; text-align: center; padding: 0 20pt; }
                    .ct-sig-party-label { background: #111; color: #fff; font-size: 8pt; font-weight: bold; padding: 3pt 7pt; }
                    .ct-sig-name-line { border-bottom: 1.5pt solid #111; margin: 20pt 0 6pt; }
                    .ct-sig-name-text { font-size: 10pt; font-weight: bold; font-family: ${bodyFont}; }
                    .arabic-text { font-family: 'Noto Sans Arabic', sans-serif !important; direction: rtl; text-align: right; unicode-bidi: embed; }
                </style>`;
                const htmlContent = element.innerHTML;
                const dir = isCtArabic ? 'rtl' : 'ltr';
                const fullHtml = `<!DOCTYPE html><html dir="${dir}" lang="${ctLang}"><head><meta charset="UTF-8">${styleBlock}</head><body style="direction:${dir};">${htmlContent}</body></html>`;
                const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword' });

                // ── 1. Save record FIRST (before downloading file) ───────────────
                const contractTypeWord = isEmp ? 'HR contract' : 'client contract';
                console.log(`[OPENY] ${contractTypeWord} Word save started`);
                const _nowCtW = new Date();
                const _editingContractIdWord = isEmp ? currentEditingEcId : currentEditingCtId;
                const ctWStoreName = isEmp ? 'hrContracts' : 'clientContracts';
                const ctWRecord = {
                    id: _editingContractIdWord || Date.now().toString(),
                    client: clientName,
                    ref: refNum,
                    date: (isEmp ? document.getElementById('ec-date') : document.getElementById('ct-date'))?.value || _nowCtW.toISOString().split('T')[0],
                    amount: parseFloat((isEmp ? document.getElementById('ec-salary') : document.getElementById('ct-total-value'))?.value || 0) || 0,
                    currency: (isEmp ? document.getElementById('ec-currency') : document.getElementById('ct-currency'))?.value || 'EGP',
                    status: (isEmp ? document.getElementById('ec-status') : document.getElementById('ct-status'))?.value || 'Draft',
                    timestamp: Date.now(),
                    type: isEmp ? 'empcontract' : 'contract',
                    year: _nowCtW.getFullYear(),
                    month: _nowCtW.getMonth() + 1,
                    day: _nowCtW.getDate(),
                    source: 'web',
                    formSnapshot: isEmp ? _captureEcSnapshot() : _captureCtSnapshot()
                };
                const ctWordUrl = await uploadExportToStorage(blob, ctWStoreName, filename);
                if (ctWordUrl) ctWRecord.fileUrl = ctWordUrl;
                await cloudDB.put(ctWRecord, ctWStoreName);
                console.log(`[OPENY] ${contractTypeWord} save success — record ID:`, ctWRecord.id);
                await logActivity(_editingContractIdWord ? 'updated' : 'created', isEmp ? 'hrcontract' : 'clientcontract', ctWRecord.id, { client: ctWRecord.client, ref: ctWRecord.ref, amount: ctWRecord.amount, currency: ctWRecord.currency });
                console.log('[OPENY] History insert success for record:', ctWRecord.id);

                // ── 2. Download the Word file ────────────────────────────────────
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; a.click();
                URL.revokeObjectURL(url);
                console.log(`[OPENY] ${contractTypeWord} Word export success:`, filename);
                showToast('Word document downloaded!');

                // ── 3. Post-save housekeeping ────────────────────────────────────
                if (_editingContractIdWord) { if (isEmp) window.stopEcEditing(); else window.stopCtEditing(); }

                // ── 4. Refresh history immediately ───────────────────────────────
                const renderWordFn = isEmp ? window.renderEcHistoryList : window.renderCtHistoryList;
                if (typeof renderWordFn === 'function') {
                    await renderWordFn();
                }
            } catch(e) {
                console.error('[OPENY] Contract Word pipeline error:', e);
                showToast('Error generating Word document');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        };

        // --- Contract Module Init (called on DOMContentLoaded) ---
        function initContractModules() {
            // Set default dates
            const today = new Date().toISOString().split('T')[0];
            const ctDate = document.getElementById('ct-date');
            const ctSigDate = document.getElementById('ct-sig-date');
            const ecDate = document.getElementById('ec-date');
            const ecSigDate = document.getElementById('ec-sig-date');
            if (ctDate && !ctDate.value) ctDate.value = today;
            if (ctSigDate && !ctSigDate.value) ctSigDate.value = today;
            if (ecDate && !ecDate.value) ecDate.value = today;
            if (ecSigDate && !ecSigDate.value) ecSigDate.value = today;

            // Set default contract number
            const ctNum = document.getElementById('ct-num');
            if (ctNum && !ctNum.value) { ctNum.value = `C-${new Date().getFullYear()}-001`; }
            const ecNum = document.getElementById('ec-num');
            if (ecNum && !ecNum.value) { ecNum.value = `EC-${new Date().getFullYear()}-001`; }

            // Load default services for client contract
            const ctSvcContainer = document.getElementById('ct-services-container');
            if (ctSvcContainer && ctSvcContainer.children.length === 0) {
                getDefaultContractServices(contractLang).forEach(s => window.addContractService(s));
            }

            // Load default clauses for client contract
            const ctClContainer = document.getElementById('ct-clauses-container');
            if (ctClContainer && ctClContainer.children.length === 0) {
                getDefaultClientClauses(contractLang).forEach(cl => _renderClauseRow('ct', cl, ctClContainer, contractLang));
                const cc = document.getElementById('ct-clauses-count');
                if (cc) cc.textContent = getDefaultClientClauses(contractLang).length;
            }

            // Load default clauses for employee contract
            const ecClContainer = document.getElementById('ec-clauses-container');
            if (ecClContainer && ecClContainer.children.length === 0) {
                getDefaultEmpClauses(empContractLang).forEach(cl => _renderEmpClauseRow(cl, ecClContainer, empContractLang));
                const ec = document.getElementById('ec-clauses-count');
                if (ec) ec.textContent = getDefaultEmpClauses(empContractLang).length;
            }
        }

        // ==========================================================================
        // LANGUAGE SUPPORT & i18n
        // ==========================================================================
        let appLang = 'en';

        const i18n = {
            ar: {
                invoice: 'فاتورة', quotation: 'عرض سعر', contract: 'عقد عميل', empcontract: 'عقد توظيف',
                editor: 'المحرر', history: 'السجل',
                downloadExcel: 'تنزيل Excel', downloadPDF: 'تنزيل PDF',
                exportPDF: 'تصدير PDF', exportWord: 'تصدير Word',
                aiAssistant: 'المساعد الذكي ✨', aiGenerate: 'توليد ✨', aiApply: 'تطبيق على النموذج',
                aiRegenerate: 'إعادة التوليد', aiClear: 'مسح',
                aiGlobalTitle: 'المساعد الذكي — إنشاء مستند',
                aiGlobalPlaceholder: 'اكتب ما تريده... مثال: أريد فاتورة لشركة Pro icon KSA بقيمة 50000 جنيه عن حملة مارس 2026',
                generating: 'جارٍ التوليد...',
            },
            en: {
                invoice: 'Invoice', quotation: 'Quotation', contract: 'Contract', empcontract: 'Employee Contract',
                editor: 'Editor', history: 'History',
                downloadExcel: 'Download Excel', downloadPDF: 'Download PDF',
                exportPDF: 'Export PDF', exportWord: 'Export Word',
                aiAssistant: 'AI Assistant ✨', aiGenerate: 'Generate ✨', aiApply: 'Apply to Form',
                aiRegenerate: 'Regenerate', aiClear: 'Clear',
                aiGlobalTitle: 'AI Assistant — Create Document',
                aiGlobalPlaceholder: 'Describe what you want... e.g.: Invoice for Pro icon KSA worth 50,000 EGP for March 2026 campaign',
                generating: 'Generating...',
            }
        };

        function t(key) { return i18n[appLang]?.[key] || i18n['en'][key] || key; }

        window.toggleLanguage = function() {
            window.setLanguage(appLang === 'ar' ? 'en' : 'ar');
        };

        window.setLanguage = function(lang) {
            appLang = lang;
            const isRTL = lang === 'ar';
            const dir = isRTL ? 'rtl' : 'ltr';

            // Update language toggle button label
            const btn = document.getElementById('lang-toggle-btn');
            if (btn) btn.textContent = lang === 'ar' ? 'EN' : 'عربي';

            // Update nav module labels
            const navMap = { 'nav-invoice': 'invoice', 'nav-quotation': 'quotation', 'nav-contract': 'contract', 'nav-empcontract': 'empcontract' };
            Object.entries(navMap).forEach(([id, key]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = t(key);
            });

            // Update module directions
            ['invoice-module', 'quotation-module', 'contract-module', 'empcontract-module'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.dir = dir;
            });

            // Update a4 page styles for RTL
            document.querySelectorAll('.a4-page').forEach(el => {
                if (isRTL) { el.classList.add('rtl-mode'); el.dir = 'rtl'; }
                else { el.classList.remove('rtl-mode'); el.dir = 'ltr'; }
            });

            // Update all data-i18n elements
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.dataset.i18n;
                const val = t(key);
                if (val) el.textContent = val;
            });

            // Update placeholders
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                const key = el.dataset.i18nPlaceholder;
                const val = t(key);
                if (val) el.placeholder = val;
            });

            // Re-render active preview
            setTimeout(() => {
                // Find active module by checking display property
                const moduleIds = ['invoice','quotation','contract','empcontract'];
                const activeId = moduleIds.find(id => {
                    const el = document.getElementById(id + '-module');
                    return el && el.style.display !== 'none' && el.style.display !== '';
                });
                if (activeId) {
                    if (activeId === 'invoice' && typeof window.updateAllocations === 'function') window.updateAllocations();
                    else if (activeId === 'quotation' && typeof window.renderPreview === 'function') window.renderPreview();
                    else if (activeId === 'contract' && typeof window.renderContractPreview === 'function') window.renderContractPreview();
                    else if (activeId === 'empcontract' && typeof window.renderEmpContractPreview === 'function') window.renderEmpContractPreview();
                }
            }, 100);
        };

        // Initialize language on load
        document.addEventListener('DOMContentLoaded', function() {
            // Language is always English — nothing to do
        }, { once: true });

        // ==========================================================================
        // ARABIC PDF FIX HELPER
        // Wait for fonts and set proper direction before export
        // ==========================================================================
        async function prepareElementForExport(element, langOverride) {
            // Wait for all fonts (including Noto Sans Arabic) to load
            try { await document.fonts.ready; } catch(e) {}
            // Additional stabilization delay
            await new Promise(r => setTimeout(r, 250));
            // Apply correct direction for Arabic
            const lang = langOverride || appLang;
            if (lang === 'ar') {
                element.style.direction = 'rtl';
                element.setAttribute('dir', 'rtl');
                // Ensure Noto Sans Arabic font is applied for proper Arabic shaping
                if (!element.style.fontFamily || !element.style.fontFamily.includes('Noto Sans Arabic')) {
                    element.style.fontFamily = "'Noto Sans Arabic', sans-serif";
                }
            } else {
                element.style.direction = 'ltr';
                element.setAttribute('dir', 'ltr');
            }
        }

        function resetElementAfterExport(element, origStyle) {
            element.style.direction = origStyle.direction || '';
            element.style.fontFamily = origStyle.fontFamily || '';
            if (origStyle.dir !== null) element.setAttribute('dir', origStyle.dir || '');
            else element.removeAttribute('dir');
        }

        // Patch the export functions to add Arabic fix
        const _origLazyPDF = window.lazyGenerateQuotePDF;
        window.lazyGenerateQuotePDF = async function() {
            const element = document.getElementById('pageContent');
            if (element) {
                const origDir = element.style.direction;
                const origFont = element.style.fontFamily;
                const origAttrDir = element.getAttribute('dir');
                await prepareElementForExport(element);
                try { await _origLazyPDF.call(this); } finally {
                    element.style.direction = origDir;
                    element.style.fontFamily = origFont;
                    if (origAttrDir !== null) element.setAttribute('dir', origAttrDir); else element.removeAttribute('dir');
                }
            } else { await _origLazyPDF.call(this); }
        };

        const _origLazyInvPDF = window.lazyGenerateInvoicePDF;
        window.lazyGenerateInvoicePDF = async function() {
            const element = document.getElementById('invoicePageContent');
            if (element) {
                const origDir = element.style.direction;
                const origFont = element.style.fontFamily;
                const origAttrDir = element.getAttribute('dir');
                await prepareElementForExport(element);
                try { await _origLazyInvPDF.call(this); } finally {
                    element.style.direction = origDir;
                    element.style.fontFamily = origFont;
                    if (origAttrDir !== null) element.setAttribute('dir', origAttrDir); else element.removeAttribute('dir');
                }
            } else { await _origLazyInvPDF.call(this); }
        };

        const _origLazyCtPDF = window.lazyGenerateContractPDF;
        window.lazyGenerateContractPDF = async function(type) {
            const isEmp = type === 'empcontract';
            const elementId = isEmp ? 'empContractPageContent' : 'contractPageContent';
            const ctLang = isEmp ? (document.getElementById('ec-lang')?.value || empContractLang) : (document.getElementById('ct-lang')?.value || contractLang);
            const element = document.getElementById(elementId);
            if (element) {
                const origDir = element.style.direction;
                const origFont = element.style.fontFamily;
                const origAttrDir = element.getAttribute('dir');
                await prepareElementForExport(element, ctLang);
                try { await _origLazyCtPDF.call(this, type); } finally {
                    element.style.direction = origDir;
                    element.style.fontFamily = origFont;
                    if (origAttrDir !== null) element.setAttribute('dir', origAttrDir); else element.removeAttribute('dir');
                }
            } else { await _origLazyCtPDF.call(this, type); }
        };

        // Word export uses Noto Sans Arabic font via the embedded style block — no additional patching needed

        // ==========================================================================
        // SHARED AI HELPERS
        // ==========================================================================
        /** Parse AI JSON response, stripping markdown code fences if present */
        function parseAIResponse(text) {
            if (!text) return null;
            try {
                return JSON.parse(text.replace(/```json\n?|```\n?/g, '').trim());
            } catch(e) {
                return null;
            }
        }

        /** Set a form field value if it has meaningful content */
        function setFieldValue(id, value) {
            const el = document.getElementById(id);
            if (el && value !== undefined && value !== null && String(value).trim() !== '') {
                el.value = value;
            }
        }

        /** Run an AI generation with standard loading state management */
        async function runAIGeneration(opts) {
            const { promptId, outputId, btnId, systemPrompt, onSuccess, onError } = opts;
            const promptEl = document.getElementById(promptId);
            const outputEl = document.getElementById(outputId);
            const btn = document.getElementById(btnId);
            if (!promptEl || !btn) return;
            const prompt = promptEl.value.trim();
            if (!prompt) { showToast(appLang === 'ar' ? 'الرجاء كتابة وصف' : 'Please enter a description'); return; }

            const origText = btn.innerHTML;
            btn.innerHTML = t('generating'); btn.disabled = true;
            if (outputEl) outputEl.style.display = 'none';

            const text = await fetchGeminiText(`${systemPrompt}\n\nRequest: ${prompt}`);
            if (text) {
                const json = parseAIResponse(text);
                if (json) { onSuccess(json, outputEl); }
                else { if (onError) onError(text, outputEl); else if (outputEl) { outputEl.style.display = 'block'; outputEl.textContent = text.substring(0, 300); } }
            }
            btn.innerHTML = origText; btn.disabled = false;
        }

        // ==========================================================================
        // AI ASSISTANT — INVOICE
        // ==========================================================================
        window.aiInvoiceContext = null;

        window.runInvAI = function() {
            runAIGeneration({
                promptId: 'ai-inv-prompt', outputId: 'ai-inv-output', btnId: 'ai-inv-generate-btn',
                systemPrompt: `You are an invoice assistant. Analyze the request and return ONLY a valid JSON object (no markdown):\n{"client":"","totalBudget":0,"currency":"EGP","campaignMonth":"2026-03","project":"","desc":""}\nSupported currencies: EGP, SAR, AED, USD. campaignMonth format: YYYY-MM like 2026-03.`,
                onSuccess: (json, outputEl) => {
                    window.aiInvoiceContext = json;
                    if (outputEl) {
                        outputEl.style.display = 'block';
                        outputEl.innerHTML = `<b>${appLang==='ar'?'العميل':'Client'}:</b> ${json.client||''} &nbsp; <b>${appLang==='ar'?'المبلغ':'Amount'}:</b> ${json.totalBudget||''} ${json.currency||''}<br><b>${appLang==='ar'?'الشهر':'Month'}:</b> ${json.campaignMonth||''}`;
                    }
                }
            });
        };

        window.applyInvAI = function() {
            const ctx = window.aiInvoiceContext;
            if (!ctx) { showToast(appLang==='ar'?'لم يتم التوليد بعد':'Nothing to apply'); return; }
            if (ctx.client) {
                const cl = document.getElementById('clientName');
                const presets = cl ? Array.from(cl.options).map(o => o.value) : [];
                if (presets.includes(ctx.client)) { setFieldValue('clientName', ctx.client); }
                else { setFieldValue('clientName', 'custom'); setFieldValue('inv-custom-client-name', ctx.client); if (ctx.project) setFieldValue('inv-custom-project', ctx.project); if (ctx.desc) setFieldValue('inv-custom-desc', ctx.desc); }
                if (typeof window.toggleDetailedOptions === 'function') window.toggleDetailedOptions();
            }
            setFieldValue('totalBudget', ctx.totalBudget);
            if (ctx.currency) setFieldValue('currency', ctx.currency);
            if (ctx.campaignMonth) setFieldValue('campaignMonth', ctx.campaignMonth);
            if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
            showToast(appLang==='ar'?'تم التطبيق ✓':'Applied ✓');
        };

        // ==========================================================================
        // AI ASSISTANT — QUOTATION
        // ==========================================================================
        window.aiQuoteContext = null;

        window.runQuoteAI = function() {
            runAIGeneration({
                promptId: 'ai-quote-prompt', outputId: 'ai-quote-output', btnId: 'ai-quote-generate-btn',
                systemPrompt: `You are a quotation assistant. Return ONLY valid JSON:\n{"clientName":"","company":"","project":"","projectDesc":"","finalPrice":0,"currency":"EGP","services":[{"name":"","scope":""}]}\nReturn 2-4 relevant services based on the project description.`,
                onSuccess: (json, outputEl) => {
                    window.aiQuoteContext = json;
                    if (outputEl) {
                        outputEl.style.display = 'block';
                        outputEl.innerHTML = `<b>${appLang==='ar'?'العميل':'Client'}:</b> ${json.clientName||''}<br><b>${appLang==='ar'?'المشروع':'Project'}:</b> ${json.project||''}<br><b>${appLang==='ar'?'الإجمالي':'Total'}:</b> ${json.finalPrice||''} ${json.currency||''}<br><b>${appLang==='ar'?'الخدمات':'Services'}:</b> ${(json.services||[]).length}`;
                    }
                }
            });
        };

        window.applyQuoteAI = function() {
            const ctx = window.aiQuoteContext;
            if (!ctx) { showToast(appLang==='ar'?'لم يتم التوليد بعد':'Nothing to apply'); return; }
            setFieldValue('in-client-name', ctx.clientName); setFieldValue('in-company', ctx.company);
            setFieldValue('in-project', ctx.project); setFieldValue('in-project-desc', ctx.projectDesc);
            setFieldValue('in-final-price', ctx.finalPrice);
            if (ctx.currency) { setFieldValue('in-currency', ctx.currency); appState.currency = ctx.currency; }
            if (ctx.services && ctx.services.length > 0) {
                const container = document.getElementById('services-container');
                if (container) { container.innerHTML = ''; appState.services = []; }
                ctx.services.forEach(s => { if (typeof window.addService === 'function') window.addService(s.name||'', s.scope||''); });
            }
            if (typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();
            showToast(appLang==='ar'?'تم التطبيق ✓':'Applied ✓');
        };

        // ==========================================================================
        // AI ASSISTANT — CLIENT CONTRACT
        // ==========================================================================
        window.aiContractContext = null;

        window.runContractAI = function() {
            runAIGeneration({
                promptId: 'ai-ct-prompt', outputId: 'ai-ct-output', btnId: 'ai-ct-generate-btn',
                systemPrompt: `You are a client contract assistant. Return ONLY valid JSON:\n{"p2name":"","p2email":"","p2phone":"","p2address":"","totalValue":0,"currency":"EGP","duration":12,"paymentMethod":"Bank Transfer","paymentTerms":"Monthly","contractServices":["Service 1","Service 2"],"notes":""}`,
                onSuccess: (json, outputEl) => {
                    window.aiContractContext = json;
                    if (outputEl) {
                        outputEl.style.display = 'block';
                        outputEl.innerHTML = `<b>${appLang==='ar'?'العميل':'Client'}:</b> ${json.p2name||''}<br><b>${appLang==='ar'?'القيمة':'Value'}:</b> ${json.totalValue||''} ${json.currency||''}<br><b>${appLang==='ar'?'المدة':'Duration'}:</b> ${json.duration||''} ${appLang==='ar'?'شهر':'months'}`;
                    }
                }
            });
        };

        window.applyContractAI = function() {
            const ctx = window.aiContractContext;
            if (!ctx) { showToast(appLang==='ar'?'لم يتم التوليد بعد':'Nothing to apply'); return; }
            setFieldValue('ct-p2-name', ctx.p2name); setFieldValue('ct-p2-email', ctx.p2email);
            setFieldValue('ct-p2-phone', ctx.p2phone); setFieldValue('ct-p2-address', ctx.p2address);
            setFieldValue('ct-total-value', ctx.totalValue);
            if (ctx.currency) setFieldValue('ct-currency', ctx.currency);
            setFieldValue('ct-duration', ctx.duration);
            if (ctx.paymentMethod) setFieldValue('ct-payment-method', ctx.paymentMethod);
            setFieldValue('ct-payment-terms', ctx.paymentTerms); setFieldValue('ct-financial-notes', ctx.notes);
            if (ctx.contractServices && ctx.contractServices.length > 0) {
                const container = document.getElementById('ct-services-container');
                if (container) container.innerHTML = '';
                ctx.contractServices.forEach(s => { if (typeof window.addContractService === 'function' && s) window.addContractService(String(s)); });
            }
            if (typeof window.debouncedRenderContract === 'function') window.debouncedRenderContract();
            showToast(appLang==='ar'?'تم التطبيق ✓':'Applied ✓');
        };

        // ==========================================================================
        // AI ASSISTANT — EMPLOYEE CONTRACT
        // ==========================================================================
        window.aiEmpContractContext = null;

        window.runEmpContractAI = function() {
            runAIGeneration({
                promptId: 'ai-ec-prompt', outputId: 'ai-ec-output', btnId: 'ai-ec-generate-btn',
                systemPrompt: `You are an employment contract assistant. Return ONLY valid JSON:\n{"empName":"","jobTitle":"","jobDept":"","salary":0,"currency":"EGP","jobType":"Full-time","probation":"3 months","workDays":"Sunday – Thursday","dailyHours":8,"benefits":"","payMethod":"Bank Transfer","empDuration":"1 Year","workplace":"Office"}`,
                onSuccess: (json, outputEl) => {
                    window.aiEmpContractContext = json;
                    if (outputEl) {
                        outputEl.style.display = 'block';
                        outputEl.innerHTML = `<b>${appLang==='ar'?'الموظف':'Employee'}:</b> ${json.empName||''}<br><b>${appLang==='ar'?'الوظيفة':'Title'}:</b> ${json.jobTitle||''}<br><b>${appLang==='ar'?'الراتب':'Salary'}:</b> ${json.salary||''} ${json.currency||''}`;
                    }
                }
            });
        };

        window.applyEmpContractAI = function() {
            const ctx = window.aiEmpContractContext;
            if (!ctx) { showToast(appLang==='ar'?'لم يتم التوليد بعد':'Nothing to apply'); return; }
            setFieldValue('ec-emp-name', ctx.empName); setFieldValue('ec-job-title', ctx.jobTitle); setFieldValue('ec-job-dept', ctx.jobDept);
            setFieldValue('ec-salary', ctx.salary);
            if (ctx.currency) setFieldValue('ec-currency', ctx.currency);
            if (ctx.jobType) setFieldValue('ec-job-type', ctx.jobType);
            setFieldValue('ec-probation', ctx.probation); setFieldValue('ec-work-days', ctx.workDays);
            if (ctx.dailyHours) setFieldValue('ec-daily-hours', ctx.dailyHours);
            setFieldValue('ec-benefits', ctx.benefits);
            if (ctx.payMethod) setFieldValue('ec-pay-method', ctx.payMethod);
            setFieldValue('ec-emp-duration', ctx.empDuration); setFieldValue('ec-workplace', ctx.workplace);
            if (typeof window.debouncedRenderEmpContract === 'function') window.debouncedRenderEmpContract();
            showToast(appLang==='ar'?'تم التطبيق ✓':'Applied ✓');
        };

        // ==========================================================================
        // GLOBAL AI DOCUMENT GENERATOR
        // ==========================================================================
        window.globalAIContext = null;

        window.openGlobalAI = function() {
            const modal = document.getElementById('global-ai-modal');
            if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        };

        window.closeGlobalAI = function() {
            const modal = document.getElementById('global-ai-modal');
            if (modal) { modal.classList.remove('flex'); modal.classList.add('hidden'); }
        };

        window.runGlobalAI = async function() {
            const promptEl = document.getElementById('global-ai-prompt');
            const outputEl = document.getElementById('global-ai-output');
            const typeEl = document.getElementById('global-ai-type');
            const btn = document.getElementById('global-ai-generate-btn');
            if (!promptEl || !btn) return;
            const prompt = promptEl.value.trim();
            if (!prompt) { showToast(appLang==='ar'?'الرجاء كتابة وصف':'Please enter a description'); return; }

            const origText = btn.innerHTML;
            btn.innerHTML = (appLang==='ar'?'جارٍ التحليل...':'Analyzing...') + ' ⏳';
            btn.disabled = true;
            if (outputEl) outputEl.style.display = 'none';
            if (typeEl) typeEl.style.display = 'none';

            // Note: quoteServices = array of {name,scope} objects, contractServices = array of strings
            const sysPrompt = `You are an intelligent document system. Analyze the user request and return ONLY a valid JSON object. Use this exact structure:
{"documentType":"invoice|quotation|contract|empcontract","data":{"clientName":"","company":"","project":"","projectDesc":"","finalPrice":0,"currency":"EGP","quoteServices":[{"name":"","scope":""}],"totalBudget":0,"campaignMonth":"2026-03","p2name":"","totalValue":0,"duration":12,"paymentMethod":"Bank Transfer","contractServices":[""],"empName":"","jobTitle":"","jobDept":"","salary":0,"jobType":"Full-time","probation":"3 months"}}
Only fill fields relevant to the detected document type. Return ONLY valid JSON.`;

            const text = await fetchGeminiText(`${sysPrompt}\n\nUser request: ${prompt}`);
            if (text) {
                const json = parseAIResponse(text);
                if (json) {
                    window.globalAIContext = json;
                    if (typeEl) {
                        const typeLabels = { invoice: t('invoice'), quotation: t('quotation'), contract: t('contract'), empcontract: t('empcontract') };
                        typeEl.textContent = '📄 ' + (typeLabels[json.documentType] || json.documentType);
                        typeEl.style.display = 'inline-block';
                    }
                    if (outputEl) {
                        outputEl.style.display = 'block';
                        const d = json.data || {};
                        const rows = [];
                        if (d.clientName) rows.push((appLang==='ar'?'العميل: ':'Client: ') + d.clientName);
                        if (d.p2name) rows.push((appLang==='ar'?'العميل: ':'Client: ') + d.p2name);
                        if (d.empName) rows.push((appLang==='ar'?'الموظف: ':'Employee: ') + d.empName);
                        if (d.project) rows.push((appLang==='ar'?'المشروع: ':'Project: ') + d.project);
                        if (d.finalPrice) rows.push((appLang==='ar'?'الإجمالي: ':'Total: ') + d.finalPrice + ' ' + (d.currency||'EGP'));
                        if (d.totalBudget) rows.push((appLang==='ar'?'الميزانية: ':'Budget: ') + d.totalBudget + ' ' + (d.currency||'EGP'));
                        if (d.totalValue) rows.push((appLang==='ar'?'قيمة العقد: ':'Contract Value: ') + d.totalValue + ' ' + (d.currency||'EGP'));
                        if (d.salary) rows.push((appLang==='ar'?'الراتب: ':'Salary: ') + d.salary + ' ' + (d.currency||'EGP'));
                        outputEl.innerHTML = rows.join('<br>') || JSON.stringify(d, null, 2);
                    }
                } else {
                    window.globalAIContext = null;
                    if (outputEl) { outputEl.style.display = 'block'; outputEl.textContent = text.substring(0, 400); }
                    showToast(appLang==='ar'?'خطأ في التحليل':'Parse error');
                }
            }
            btn.innerHTML = origText; btn.disabled = false;
        };

        window.applyGlobalAI = function() {
            const ctx = window.globalAIContext;
            if (!ctx) { showToast(appLang==='ar'?'لم يتم التوليد بعد':'Nothing to apply'); return; }
            const type = ctx.documentType;
            const data = ctx.data || {};

            window.closeGlobalAI();
            if (typeof window.switchMainModule === 'function') window.switchMainModule(type);

            setTimeout(() => {
                if (type === 'invoice') {
                    const clientToSet = data.clientName || data.p2name;
                    if (clientToSet) {
                        const cl = document.getElementById('clientName');
                        const presets = cl ? Array.from(cl.options).map(o => o.value) : [];
                        if (presets.includes(clientToSet)) { setFieldValue('clientName', clientToSet); }
                        else { setFieldValue('clientName', 'custom'); setFieldValue('inv-custom-client-name', clientToSet); if (data.project) setFieldValue('inv-custom-project', data.project); }
                        if (typeof window.toggleDetailedOptions === 'function') window.toggleDetailedOptions();
                    }
                    setFieldValue('totalBudget', data.totalBudget); setFieldValue('currency', data.currency);
                    if (data.campaignMonth) setFieldValue('campaignMonth', data.campaignMonth);
                    if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();

                } else if (type === 'quotation') {
                    setFieldValue('in-client-name', data.clientName); setFieldValue('in-company', data.company);
                    setFieldValue('in-project', data.project); setFieldValue('in-project-desc', data.projectDesc);
                    setFieldValue('in-final-price', data.finalPrice); setFieldValue('in-currency', data.currency);
                    if (Array.isArray(data.quoteServices) && data.quoteServices.length > 0) {
                        const container = document.getElementById('services-container');
                        if (container) { container.innerHTML = ''; appState.services = []; }
                        data.quoteServices.forEach(s => { if (typeof window.addService === 'function') window.addService(s.name||'', s.scope||''); });
                    }
                    if (typeof window.debouncedSaveAndRender === 'function') window.debouncedSaveAndRender();

                } else if (type === 'contract') {
                    setFieldValue('ct-p2-name', data.p2name || data.clientName); setFieldValue('ct-total-value', data.totalValue || data.finalPrice);
                    setFieldValue('ct-currency', data.currency); setFieldValue('ct-duration', data.duration);
                    if (data.paymentMethod) setFieldValue('ct-payment-method', data.paymentMethod);
                    if (Array.isArray(data.contractServices) && data.contractServices.length > 0) {
                        const container = document.getElementById('ct-services-container');
                        if (container) container.innerHTML = '';
                        data.contractServices.forEach(s => { if (typeof window.addContractService === 'function' && s) window.addContractService(String(s)); });
                    }
                    if (typeof window.debouncedRenderContract === 'function') window.debouncedRenderContract();

                } else if (type === 'empcontract') {
                    setFieldValue('ec-emp-name', data.empName); setFieldValue('ec-job-title', data.jobTitle); setFieldValue('ec-job-dept', data.jobDept);
                    setFieldValue('ec-salary', data.salary); setFieldValue('ec-currency', data.currency);
                    if (data.jobType) setFieldValue('ec-job-type', data.jobType);
                    setFieldValue('ec-probation', data.probation); setFieldValue('ec-work-days', data.workDays);
                    if (data.dailyHours) setFieldValue('ec-daily-hours', data.dailyHours);
                    if (data.payMethod) setFieldValue('ec-pay-method', data.payMethod);
                    if (typeof window.debouncedRenderEmpContract === 'function') window.debouncedRenderEmpContract();
                }

                showToast(appLang==='ar'?'تم تطبيق البيانات ✓':'Data applied ✓');
            }, 400);
        };

        // ==========================================================================
        // EMPLOYEES MODULE
        // ==========================================================================

        // ── State ──
        let empCurrentEditId = null;
        let empSalaryHistoryTargetId = null;

        // ── Helpers ──
        function empFmtCurrency(amount, currency) {
            const code = currency || 'EGP';
            const num = parseFloat(amount) || 0;
            const numStr = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
            if (['EGP', 'SAR', 'AED'].includes(code)) return `${numStr} ${code}`;
            return `${code} ${numStr}`;
        }
        function empFmtDate(d) {
            if (!d) return '—';
            try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
            catch(e) { return d; }
        }
        function empInitials(name) {
            if (!name) return '?';
            const parts = name.trim().split(/\s+/);
            return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
        }
        function empStatusBadge(status) {
            const map = { 'Active': 'active', 'Inactive': 'archived', 'On Leave': 'onleave', 'Resigned': 'resigned', 'Terminated': 'terminated', 'Archived': 'archived' };
            const key = map[status] || 'archived';
            return `<span class="emp-badge emp-badge-${key}">${status || '—'}</span>`;
        }
        function empGenerateId(existing) {
            const year = new Date().getFullYear();
            const prefix = `EMP-${year}-`;
            let maxNum = 0;
            existing.forEach(e => {
                if (e.employeeId && e.employeeId.startsWith(prefix)) {
                    const n = parseInt(e.employeeId.slice(prefix.length), 10);
                    if (!isNaN(n) && n > maxNum) maxNum = n;
                }
            });
            return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
        }

        // ── Tab switcher ──
        window.switchEmpTab = function(tabId) {
            const mod = document.getElementById('employees-module');
            if (!mod) return;
            mod.querySelectorAll('.emp-tab-content').forEach(c => c.classList.remove('active'));
            mod.querySelectorAll('.emp-tabs-bar .ui-nav-pill').forEach(b => b.classList.remove('active'));
            const tab = document.getElementById(`emp-tab-${tabId}`);
            if (tab) tab.classList.add('active');
            const btn = mod.querySelector(`.emp-tabs-bar .ui-nav-pill[data-emptab="${tabId}"]`);
            if (btn) btn.classList.add('active');
            if (tabId === 'overview') window.renderEmployeesOverview();
            if (tabId === 'list') window.renderEmployeesList();
            if (tabId === 'payroll') window.renderPayrollSummary();
        };

        // ── Refresh entire module ──
        window.refreshEmployeesModule = function() {
            window.renderEmployeesOverview();
            window.renderEmployeesList();
            window.renderPayrollSummary();
        };

        // ── Overview ──
        window.renderEmployeesOverview = function() {
            const employees = localStore.getAll('employees');
            const salaryHistory = localStore.getAll('salaryHistory');
            const active = employees.filter(e => e.status === 'Active');
            const onLeave = employees.filter(e => e.status === 'On Leave');
            const inactive = employees.filter(e => ['Inactive', 'Archived', 'Resigned', 'Terminated'].includes(e.status));
            const totalMonthly = active.reduce((sum, e) => sum + (parseFloat(e.currentSalary) || 0), 0);
            const totalAnnual = totalMonthly * 12;

            const sv = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            sv('stat-total-emp', employees.length);
            sv('stat-active-emp', active.length);
            sv('stat-onleave-emp', onLeave.length);
            sv('stat-inactive-emp', inactive.length);
            sv('stat-monthly-payroll', empFmtCurrency(totalMonthly, active[0]?.currency || 'EGP'));
            sv('stat-annual-payroll', empFmtCurrency(totalAnnual, active[0]?.currency || 'EGP'));

            // Recent hires (last 5)
            const sorted = [...employees].sort((a, b) => new Date(b.hireDate) - new Date(a.hireDate)).slice(0, 5);
            const hiresEl = document.getElementById('emp-recent-hires');
            if (hiresEl) {
                if (sorted.length === 0) {
                    hiresEl.innerHTML = '<div class="emp-empty-state">No employees added yet.</div>';
                } else {
                    hiresEl.innerHTML = sorted.map(e => `
                        <div class="emp-recent-item">
                            <div class="emp-avatar">${empInitials(e.fullName)}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;color:#0F172A;font-size:0.85rem;">${e.fullName}</div>
                                <div style="color:#94A3B8;font-size:0.75rem;">${e.jobTitle || '—'} · ${empFmtDate(e.hireDate)}</div>
                            </div>
                            ${empStatusBadge(e.status)}
                        </div>`).join('');
                }
            }

            // Recent salary changes (last 5)
            const recentSalary = [...salaryHistory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
            const salaryEl = document.getElementById('emp-recent-salary-changes');
            if (salaryEl) {
                if (recentSalary.length === 0) {
                    salaryEl.innerHTML = '<div class="emp-empty-state">No salary changes recorded yet.</div>';
                } else {
                    salaryEl.innerHTML = recentSalary.map(s => {
                        const emp = employees.find(e => e.id === s.employeeId);
                        const changeColor = s.changeType === 'Increase' ? '#059669' : s.changeType === 'Decrease' ? '#DC2626' : '#D97706';
                        const sign = s.changeType === 'Increase' ? '+' : s.changeType === 'Decrease' ? '-' : '~';
                        return `<div class="emp-recent-item">
                            <div class="emp-avatar" style="background:linear-gradient(135deg,#059669,#10B981);">${empInitials(emp?.fullName || '?')}</div>
                            <div style="flex:1;min-width:0;">
                                <div style="font-weight:600;color:#0F172A;font-size:0.85rem;">${emp?.fullName || 'Unknown'}</div>
                                <div style="color:#94A3B8;font-size:0.75rem;">${s.changeType} · ${empFmtDate(s.effectiveDate)}</div>
                            </div>
                            <div style="font-weight:700;color:${changeColor};font-size:0.85rem;">${sign}${empFmtCurrency(Math.abs(s.changeAmount), s.currency || emp?.currency || 'EGP')}</div>
                        </div>`;
                    }).join('');
                }
            }
        };

        // ── Employees List ──
        window.renderEmployeesList = function() {
            const employees = localStore.getAll('employees');
            const search = (document.getElementById('emp-search')?.value || '').toLowerCase();
            const filterStatus = document.getElementById('emp-filter-status')?.value || '';
            const filterType = document.getElementById('emp-filter-type')?.value || '';

            let filtered = employees.filter(e => {
                if (search && !`${e.fullName} ${e.employeeId} ${e.jobTitle} ${e.phone}`.toLowerCase().includes(search)) return false;
                if (filterStatus && e.status !== filterStatus) return false;
                if (filterType && e.employmentType !== filterType) return false;
                return true;
            });

            // Sort: active first, then by hire date desc
            filtered.sort((a, b) => {
                const statusOrder = ['Active', 'On Leave', 'Inactive', 'Resigned', 'Terminated', 'Archived'];
                const aIdx = statusOrder.indexOf(a.status);
                const bIdx = statusOrder.indexOf(b.status);
                if (aIdx !== bIdx) return aIdx - bIdx;
                return new Date(b.hireDate) - new Date(a.hireDate);
            });

            const tbody = document.getElementById('emp-table-body');
            if (!tbody) return;
            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;padding:32px;color:#94A3B8;">No employees found.</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(e => {
                return `<tr>
                    <td class="emp-cell-id">${e.employeeId || '—'}</td>
                    <td class="emp-name">${e.fullName}</td>
                    <td>${e.jobTitle || '—'}</td>
                    <td>${e.employmentType || '—'}</td>
                    <td>${empFmtDate(e.dob)}</td>
                    <td class="emp-cell-phone">${e.phone || '—'}</td>
                    <td class="emp-cell-addr" title="${e.address || ''}">${e.address || '—'}</td>
                    <td>${empFmtDate(e.hireDate)}</td>
                    <td class="emp-cell-num">${e.contractDuration ? e.contractDuration + ' mo' : '—'}</td>
                    <td>${empStatusBadge(e.status)}</td>
                    <td class="emp-cell-num">${e.dailyHours ? e.dailyHours + ' hrs' : '—'}</td>
                    <td class="emp-cell-salary">${empFmtCurrency(e.currentSalary, e.currency)}</td>
                    <td>
                        <div class="emp-actions-cell">
                            <button class="emp-action-btn emp-action-btn-view" onclick="window.openEmployeeProfile('${e.id}')">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                View
                            </button>
                            <button class="emp-action-btn emp-action-btn-edit" onclick="window.openEditEmployeeModal('${e.id}')">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                Edit
                            </button>
                            <button class="emp-action-btn emp-action-btn-salary" onclick="window.openSalaryHistory('${e.id}')">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>
                                Salary
                            </button>
                            <button class="emp-action-btn emp-action-btn-danger" onclick="window.archiveEmployee('${e.id}')">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                                Archive
                            </button>
                            <button class="emp-action-btn emp-action-btn-delete" onclick="window.deleteEmployee('${e.id}')">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>`;
            }).join('');
        };

        // ── Payroll Summary ──
        window.renderPayrollSummary = function() {
            const employees = localStore.getAll('employees');
            const salaryHistory = localStore.getAll('salaryHistory');
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();

            const active = employees.filter(e => e.status === 'Active');
            const totalMonthly = active.reduce((s, e) => s + (parseFloat(e.currentSalary) || 0), 0);
            const totalAnnual = totalMonthly * 12;
            const activeOnly = totalMonthly;
            const incMonth = salaryHistory.filter(s => { const d = new Date(s.effectiveDate); return d.getMonth() === thisMonth && d.getFullYear() === thisYear && s.changeType === 'Increase'; })
                .reduce((s, r) => s + Math.abs(parseFloat(r.changeAmount) || 0), 0);
            const incYear = salaryHistory.filter(s => { const d = new Date(s.effectiveDate); return d.getFullYear() === thisYear && s.changeType === 'Increase'; })
                .reduce((s, r) => s + Math.abs(parseFloat(r.changeAmount) || 0), 0);

            const currency = active[0]?.currency || 'EGP';
            const sv = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            sv('pr-monthly', empFmtCurrency(totalMonthly, currency));
            sv('pr-annual', empFmtCurrency(totalAnnual, currency));
            sv('pr-active', empFmtCurrency(activeOnly, currency));
            sv('pr-increases-month', empFmtCurrency(incMonth, currency));
            sv('pr-increases-year', empFmtCurrency(incYear, currency));

            // Employees with recent salary changes (last 30 days)
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            const recentChanges = salaryHistory.filter(s => new Date(s.createdAt).getTime() > cutoff)
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const listEl = document.getElementById('pr-recent-changes-list');
            if (listEl) {
                if (recentChanges.length === 0) {
                    listEl.innerHTML = '<div class="emp-empty-state">No recent salary changes in the last 30 days.</div>';
                } else {
                    listEl.innerHTML = `<div class="emp-salary-timeline">${recentChanges.map(s => {
                        const emp = employees.find(e => e.id === s.employeeId);
                        const typeKey = (s.changeType || 'adjustment').toLowerCase();
                        return `<div class="emp-salary-entry">
                            <div class="emp-salary-entry-dot emp-salary-entry-dot-${typeKey}" style="margin-top:6px;"></div>
                            <div>
                                <div style="font-weight:700;font-size:0.88rem;color:#0F172A;">${emp?.fullName || 'Unknown'}</div>
                                <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">
                                    ${empFmtCurrency(s.oldSalary, emp?.currency || 'EGP')} → ${empFmtCurrency(s.newSalary, emp?.currency || 'EGP')}
                                    ${s.note ? `<span style="margin-left:6px;color:#94A3B8;">· ${s.note}</span>` : ''}
                                </div>
                                <div style="font-size:0.75rem;color:#94A3B8;margin-top:2px;">Effective: ${empFmtDate(s.effectiveDate)}</div>
                            </div>
                            <span class="emp-salary-entry-badge emp-salary-entry-badge-${typeKey}">${s.changeType}</span>
                        </div>`;
                    }).join('')}</div>`;
                }
            }

            // Per-employee payroll breakdown table
            const tbody2 = document.getElementById('pr-breakdown-body');
            const tfoot = document.getElementById('pr-breakdown-foot');
            if (tbody2) {
                const inactiveStatuses = ['Inactive', 'Archived', 'Resigned', 'Terminated'];
                const payrollEmps = [...employees]
                    .sort((a, b) => {
                        const aInactive = inactiveStatuses.includes(a.status);
                        const bInactive = inactiveStatuses.includes(b.status);
                        if (aInactive !== bInactive) return aInactive ? 1 : -1;
                        return (a.fullName || '').localeCompare(b.fullName || '');
                    });
                if (payrollEmps.length === 0) {
                    tbody2.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:#94A3B8;">No employees found.</td></tr>';
                    if (tfoot) tfoot.innerHTML = '';
                } else {
                    let activeTotal = 0;
                    let activeCount = 0;
                    tbody2.innerHTML = payrollEmps.map(e => {
                        const salary = parseFloat(e.currentSalary) || 0;
                        const isActive = e.status === 'Active';
                        if (isActive) { activeTotal += salary; activeCount++; }
                        return `<tr style="${!isActive ? 'opacity:0.5;text-decoration:line-through;' : ''}">
                            <td class="emp-name">${e.fullName}</td>
                            <td>${e.jobTitle || '—'}</td>
                            <td>${e.employmentType || '—'}</td>
                            <td>${empStatusBadge(e.status)}</td>
                            <td style="font-weight:600;">${isActive ? empFmtCurrency(salary, e.currency) : '—'}</td>
                        </tr>`;
                    }).join('');
                    if (tfoot) {
                        if (activeCount === 0) {
                            tfoot.innerHTML = `<tr style="background:#F8FAFC;border-top:2px solid #E2E8F0;"><td colspan="5" style="font-weight:700;color:#94A3B8;padding:10px 12px;">No active employees in payroll</td></tr>`;
                        } else {
                            tfoot.innerHTML = `<tr style="background:#F0FDF4;border-top:2px solid #BBF7D0;">
                                <td colspan="3" style="font-weight:700;color:#065F46;padding:10px 12px;">Active Payroll Total (${activeCount} active employee${activeCount !== 1 ? 's' : ''})</td>
                                <td></td>
                                <td style="font-weight:800;color:#059669;">${empFmtCurrency(activeTotal, active[0]?.currency || 'EGP')}</td>
                            </tr>`;
                        }
                    }
                }
            }
        };

        // ── Add Employee Modal ──
        window.openAddEmployeeModal = function() {
            empCurrentEditId = null;
            document.getElementById('emp-form-modal-title').textContent = 'Add Employee';
            document.getElementById('emp-form-id').value = '';
            // Reset fields
            ['ef-fullName','ef-employeeId','ef-phone','ef-dob','ef-address',
             'ef-jobTitle','ef-dailyHours','ef-currentSalary','ef-contractDuration'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('ef-employmentType').value = 'Full-time';
            document.getElementById('ef-status').value = 'Active';
            document.getElementById('ef-hireDate').value = new Date().toISOString().split('T')[0];
            // Auto-generate ID
            const existing = localStore.getAll('employees');
            document.getElementById('ef-employeeId').value = empGenerateId(existing);
            document.getElementById('emp-form-modal').classList.remove('hidden');
        };

        window.openEditEmployeeModal = function(id) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === id);
            if (!emp) return;
            empCurrentEditId = id;
            document.getElementById('emp-form-modal-title').textContent = 'Edit Employee';
            document.getElementById('emp-form-id').value = id;
            const sv = (fId, val) => { const el = document.getElementById(fId); if (el) el.value = val || ''; };
            sv('ef-fullName', emp.fullName);
            sv('ef-employeeId', emp.employeeId);
            sv('ef-phone', emp.phone);
            sv('ef-dob', emp.dob);
            sv('ef-address', emp.address);
            sv('ef-jobTitle', emp.jobTitle);
            sv('ef-employmentType', emp.employmentType);
            sv('ef-hireDate', emp.hireDate);
            sv('ef-status', emp.status);
            sv('ef-dailyHours', emp.dailyHours);
            sv('ef-contractDuration', emp.contractDuration);
            sv('ef-currentSalary', emp.currentSalary);
            document.getElementById('emp-form-modal').classList.remove('hidden');
        };

        window.closeEmpFormModal = function() {
            document.getElementById('emp-form-modal').classList.add('hidden');
            empCurrentEditId = null;
        };

        window.saveEmployee = async function() {
            // Collect all field values upfront
            const fullName        = document.getElementById('ef-fullName').value.trim();
            const jobTitle        = document.getElementById('ef-jobTitle').value.trim();
            const employmentType  = document.getElementById('ef-employmentType').value;
            const dob             = document.getElementById('ef-dob').value;
            const phone           = document.getElementById('ef-phone').value.trim();
            const employeeId      = document.getElementById('ef-employeeId').value.trim();
            const address         = document.getElementById('ef-address').value.trim();
            const hireDate        = document.getElementById('ef-hireDate').value;
            const contractDur     = document.getElementById('ef-contractDuration').value;
            const status          = document.getElementById('ef-status').value;
            const dailyHours      = document.getElementById('ef-dailyHours').value;
            const salaryRaw       = document.getElementById('ef-currentSalary').value;

            // Validate all required fields
            if (!fullName)       { showToast('Full Name is required.'); return; }
            if (!jobTitle)       { showToast('Job Title is required.'); return; }
            if (!employmentType) { showToast('Employment Type is required.'); return; }
            if (!dob)            { showToast('Date of Birth is required.'); return; }
            if (!phone)          { showToast('Phone Number is required.'); return; }
            if (!employeeId)     { showToast('Employee ID is required.'); return; }
            if (!address)        { showToast('Address is required.'); return; }
            if (!hireDate)       { showToast('Hire Date is required.'); return; }
            if (contractDur === '' || contractDur === null || contractDur === undefined) { showToast('Contract Duration is required.'); return; }
            if (!status)         { showToast('Status is required.'); return; }
            if (dailyHours === '' || dailyHours === null || dailyHours === undefined) { showToast('Daily Working Hours is required.'); return; }
            if (salaryRaw === '' || salaryRaw === null || salaryRaw === undefined) {
                showToast('Salary is required.'); return;
            }

            const currentSalary   = parseFloat(salaryRaw) || 0;
            const contractDuration = parseInt(contractDur, 10) || 0;

            const isNew = !empCurrentEditId;
            const existingId = document.getElementById('emp-form-id').value;
            const id = isNew ? ('emp-' + Date.now() + '-' + Math.floor(Math.random() * 10000)) : existingId;

            const existingEmployees = localStore.getAll('employees');
            const oldEmpRecord = isNew ? null : existingEmployees.find(e => e.id === id);

            const emp = {
                id,
                employeeId,
                fullName,
                phone,
                dob,
                address,
                jobTitle,
                employmentType,
                hireDate,
                status,
                dailyHours,
                contractDuration,
                currentSalary,
                updatedAt: new Date().toISOString(),
                createdAt: isNew ? new Date().toISOString() : (oldEmpRecord?.createdAt || new Date().toISOString()),
                hiredAt: isNew ? new Date().toISOString() : (oldEmpRecord?.hiredAt || null)
            };

            // Preserve deactivatedAt / leftAt if already set; update if status is now inactive/archived
            const inactiveStatuses = ['Inactive', 'Archived', 'Resigned', 'Terminated'];
            if (!isNew) {
                if (oldEmpRecord?.deactivatedAt) emp.deactivatedAt = oldEmpRecord.deactivatedAt;
                if (oldEmpRecord?.leftAt) emp.leftAt = oldEmpRecord.leftAt;
                // If status just changed to inactive, record the deactivation time
                if (inactiveStatuses.includes(emp.status) && oldEmpRecord && !inactiveStatuses.includes(oldEmpRecord.status)) {
                    emp.deactivatedAt = new Date().toISOString();
                    emp.leftAt = new Date().toISOString();
                }
            }

            try {
                // If new employee and salary > 0, create initial salary history entry
                if (isNew && currentSalary > 0) {
                    const sh = {
                        id: 'sh-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                        employeeId: id,
                        oldSalary: 0,
                        newSalary: currentSalary,
                        changeAmount: currentSalary,
                        changeType: 'Increase',
                        effectiveDate: hireDate,
                        note: 'Starting salary at hire',
                        createdAt: new Date().toISOString()
                    };
                    await cloudDB.put(sh, 'salaryHistory');
                }

                // If editing and salary changed, record salary history
                if (!isNew) {
                    const oldSalary = parseFloat(oldEmpRecord?.currentSalary) || 0;
                    if (oldSalary !== currentSalary) {
                        const diff = currentSalary - oldSalary;
                        const sh = {
                            id: 'sh-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                            employeeId: id,
                            oldSalary,
                            newSalary: currentSalary,
                            changeAmount: Math.abs(diff),
                            changeType: diff > 0 ? 'Increase' : 'Decrease',
                            effectiveDate: new Date().toISOString().split('T')[0],
                            note: 'Updated via employee edit',
                            createdAt: new Date().toISOString()
                        };
                        await cloudDB.put(sh, 'salaryHistory');
                    }
                }

                await cloudDB.put(emp, 'employees');
                await logActivity(isNew ? 'created' : 'updated', 'employee', emp.id, { client: emp.fullName, ref: emp.employeeId, amount: parseFloat(emp.currentSalary) || 0, currency: emp.currency || 'EGP' });
                window.closeEmpFormModal();
                window.refreshEmployeesModule();
                showToast(isNew ? 'Employee added ✓' : 'Employee updated ✓');
            } catch (err) {
                console.error('Failed to save employee:', err);
                showToast('Failed to save employee. Please try again.');
            }
        };

        // ── Contract Datalist ──
        function _populateContractDatalist() {
            const contracts = localStore.getAll('hrContracts');
            const dl = document.getElementById('emp-contract-datalist');
            if (!dl) return;
            dl.innerHTML = contracts.map(c => `<option value="${c.id}" data-ref="${c.ref || ''}">${c.ref || c.id} — ${c.client || ''}</option>`).join('');
        }

        window.onContractSearch = function(val) {
            const contracts = localStore.getAll('hrContracts');
            const match = contracts.find(c => c.id === val || c.ref === val || c.ref?.toLowerCase().includes(val.toLowerCase()));
            const numEl = document.getElementById('ef-linkedContractNumber');
            if (match && numEl) {
                numEl.value = match.ref || match.id;
            }
        };

        // ── Employee Profile ──
        window.openEmployeeProfile = function(id) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === id);
            if (!emp) return;
            const salaryHistory = localStore.getAll('salaryHistory').filter(s => s.employeeId === id).sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

            const pf = (label, val) => `<div class="emp-profile-field"><label>${label}</label><p>${val || '—'}</p></div>`;

            const content = document.getElementById('emp-profile-content');
            if (content) {
                content.innerHTML = `
                    <!-- Header -->
                    <div style="display:flex;align-items:center;gap:1rem;padding:0.5rem 0 1.25rem;border-bottom:1px solid #F1F5F9;margin-bottom:1.25rem;">
                        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#2563EB);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.25rem;font-weight:800;flex-shrink:0;">${empInitials(emp.fullName)}</div>
                        <div>
                            <div style="font-size:1.15rem;font-weight:800;color:#0F172A;">${emp.fullName}</div>
                            <div style="font-size:0.83rem;color:#64748B;">${emp.jobTitle || ''}</div>
                            <div style="margin-top:4px;">${empStatusBadge(emp.status)} <span style="font-size:0.75rem;color:#94A3B8;margin-left:6px;">ID: ${emp.employeeId || '—'}</span></div>
                        </div>
                    </div>

                    <!-- Basic Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Basic Info</div>
                        <div class="emp-profile-grid">
                            ${pf('Phone Number', emp.phone)}
                            ${pf('Date of Birth', empFmtDate(emp.dob))}
                            <div class="emp-profile-field col-span-2">${pf('Address', emp.address)}</div>
                        </div>
                    </div>

                    <!-- Job Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Job Info</div>
                        <div class="emp-profile-grid">
                            ${pf('Job Title', emp.jobTitle)}
                            ${pf('Employment Type', emp.employmentType)}
                            ${pf('Hire Date', empFmtDate(emp.hireDate))}
                            ${pf('Status', emp.status)}
                            ${pf('Daily Working Hours', emp.dailyHours ? emp.dailyHours + ' hrs' : '—')}
                            ${pf('Contract Duration', emp.contractDuration ? emp.contractDuration + ' months' : '—')}
                        </div>
                    </div>

                    <!-- Salary -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Salary</div>
                        <div class="emp-profile-grid">
                            ${pf('Salary', `<strong style="font-size:1.05rem;">${empFmtCurrency(emp.currentSalary, emp.currency)}</strong>`)}
                            ${pf('Last Updated', empFmtDate(emp.updatedAt?.split('T')[0]))}
                        </div>
                    </div>

                    <!-- Activity Timeline -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Activity Timeline</div>
                        <div class="emp-salary-timeline">
                            <div class="emp-salary-entry">
                                <div class="emp-salary-entry-dot emp-salary-entry-dot-increase" style="margin-top:6px;"></div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:0.88rem;color:#0F172A;">Hired</div>
                                    <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">Hire Date: ${empFmtDate(emp.hireDate)}</div>
                                </div>
                                <span class="emp-salary-entry-badge emp-salary-entry-badge-increase">Hired</span>
                            </div>
                            ${(function() {
                                const firstSalaryEntry = [...salaryHistory].filter(s => s.changeType === 'Increase').sort((a,b) => new Date(a.effectiveDate) - new Date(b.effectiveDate))[0];
                                if (!firstSalaryEntry) return '';
                                return `<div class="emp-salary-entry">
                                    <div class="emp-salary-entry-dot emp-salary-entry-dot-increase" style="margin-top:6px;"></div>
                                    <div style="flex:1;">
                                        <div style="font-weight:700;font-size:0.88rem;color:#0F172A;">Became Active</div>
                                        <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">Starting salary recorded: ${empFmtDate(firstSalaryEntry.effectiveDate)}</div>
                                    </div>
                                    <span class="emp-salary-entry-badge emp-salary-entry-badge-increase">Active</span>
                                </div>`;
                            })()}
                            ${salaryHistory.filter(s => s.changeType === 'Increase').map(s => `
                            <div class="emp-salary-entry">
                                <div class="emp-salary-entry-dot emp-salary-entry-dot-increase" style="margin-top:6px;"></div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:0.88rem;color:#0F172A;">Salary Increase</div>
                                    <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">${empFmtCurrency(s.oldSalary, emp.currency)} → ${empFmtCurrency(s.newSalary, emp.currency)} · ${s.note || ''}</div>
                                    <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">${empFmtDate(s.effectiveDate)}</div>
                                </div>
                                <span class="emp-salary-entry-badge emp-salary-entry-badge-increase">+${empFmtCurrency(s.changeAmount, emp.currency)}</span>
                            </div>`).join('')}
                            ${salaryHistory.filter(s => s.changeType === 'Decrease').map(s => `
                            <div class="emp-salary-entry">
                                <div class="emp-salary-entry-dot emp-salary-entry-dot-decrease" style="margin-top:6px;"></div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:0.88rem;color:#0F172A;">Salary Decrease</div>
                                    <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">${empFmtCurrency(s.oldSalary, emp.currency)} → ${empFmtCurrency(s.newSalary, emp.currency)} · ${s.note || ''}</div>
                                    <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">${empFmtDate(s.effectiveDate)}</div>
                                </div>
                                <span class="emp-salary-entry-badge emp-salary-entry-badge-decrease">-${empFmtCurrency(s.changeAmount, emp.currency)}</span>
                            </div>`).join('')}
                            ${emp.deactivatedAt ? `
                            <div class="emp-salary-entry" style="border-color:#EF4444;">
                                <div class="emp-salary-entry-dot emp-salary-entry-dot-decrease" style="margin-top:6px;"></div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:0.88rem;color:#DC2626;">Status Changed to Inactive / Archived</div>
                                    <div style="font-size:0.78rem;color:#64748B;margin-top:2px;">Removed from active payroll</div>
                                    <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Deactivated: ${empFmtDate(emp.deactivatedAt.slice(0,10))}</div>
                                </div>
                                <span class="emp-salary-entry-badge emp-salary-entry-badge-decrease">Archived</span>
                            </div>` : ''}
                            ${emp.leftAt ? `
                            <div class="emp-salary-entry" style="border-color:#6B7280;">
                                <div class="emp-salary-entry-dot" style="margin-top:6px;background:#6B7280;width:10px;height:10px;border-radius:50%;flex-shrink:0;"></div>
                                <div style="flex:1;">
                                    <div style="font-weight:700;font-size:0.88rem;color:#374151;">Left / Terminated</div>
                                    <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Left at: ${empFmtDate(emp.leftAt.slice(0,10))}</div>
                                </div>
                                <span style="font-size:0.72rem;background:#F3F4F6;color:#374151;padding:2px 8px;border-radius:999px;font-weight:700;">Left</span>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Salary History Preview -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Recent Salary History</div>
                        ${salaryHistory.length === 0
                            ? '<div class="emp-empty-state">No salary changes recorded.</div>'
                            : `<div class="emp-salary-timeline">${salaryHistory.slice(0, 3).map(s => {
                                const typeKey = (s.changeType || 'adjustment').toLowerCase();
                                const sign = s.changeType === 'Increase' ? '+' : s.changeType === 'Decrease' ? '-' : '~';
                                const clr = s.changeType === 'Increase' ? '#059669' : s.changeType === 'Decrease' ? '#DC2626' : '#D97706';
                                return `<div class="emp-salary-entry">
                                    <div class="emp-salary-entry-dot emp-salary-entry-dot-${typeKey}" style="margin-top:6px;"></div>
                                    <div>
                                        <div style="font-size:0.85rem;font-weight:600;color:#0F172A;">${empFmtCurrency(s.oldSalary, emp.currency)} → ${empFmtCurrency(s.newSalary, emp.currency)}</div>
                                        <div style="font-size:0.75rem;color:#64748B;margin-top:2px;">${s.note || '—'} · ${empFmtDate(s.effectiveDate)}</div>
                                    </div>
                                    <div style="font-weight:700;color:${clr};font-size:0.85rem;">${sign}${empFmtCurrency(Math.abs(s.changeAmount), emp.currency)}</div>
                                </div>`;
                              }).join('')}</div>`
                        }
                    </div>
                `;
            }

            const actionsEl = document.getElementById('emp-profile-actions');
            if (actionsEl) {
                actionsEl.innerHTML = `
                    <button class="ui-button ui-button-secondary" onclick="window.closeEmpProfileModal()">Close</button>
                    <button class="ui-button" style="background:rgba(16,185,129,0.1);color:#059669;border:1px solid rgba(16,185,129,0.25);" onclick="window.closeEmpProfileModal();window.openSalaryHistory('${id}')">
                        Salary History
                    </button>
                    <button class="ui-button ui-button-primary" onclick="window.closeEmpProfileModal();window.openEditEmployeeModal('${id}')">Edit Employee</button>
                `;
            }

            document.getElementById('emp-profile-modal').classList.remove('hidden');
        };

        window.closeEmpProfileModal = function() {
            document.getElementById('emp-profile-modal').classList.add('hidden');
        };

        window.openLinkedContract = function(contractId, empId) {
            const employees = localStore.getAll('employees');
            const emp = empId ? employees.find(e => e.id === empId) : null;
            window.closeEmpProfileModal();
            showToast('Opening HR Contract module…');
            setTimeout(() => {
                window.switchMainModule('empcontract');
                if (emp) {
                    setTimeout(() => {
                        const setV = (elId, val) => { const el = document.getElementById(elId); if (el && val !== undefined && val !== null && val !== '') el.value = val; };
                        setV('ec-emp-name', emp.fullName);
                        setV('ec-job-title', emp.jobTitle);
                        setV('ec-job-dept', emp.department);
                        setV('ec-salary', emp.currentSalary);
                        setV('ec-currency', emp.currency);
                        if (emp.linkedContractNumber) setV('ec-num', emp.linkedContractNumber);
                        if (typeof window.debouncedRenderEmpContract === 'function') window.debouncedRenderEmpContract();
                        showToast('Employee data loaded in HR Contract ✓');
                    }, 500);
                }
            }, 300);
        };

        // ── Export Payroll CSV ──
        window.exportPayrollCSV = function() {
            const employees = localStore.getAll('employees');
            const payrollEmps = [...employees]
                .filter(e => e.status === 'Active')
                .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
            if (payrollEmps.length === 0) { showToast('No active employees to export.'); return; }
            const header = ['Employee ID', 'Full Name', 'Job Title', 'Employment Type', 'Status', 'Salary'];
            const rows = payrollEmps.map(e => {
                const salary = parseFloat(e.currentSalary) || 0;
                return [
                    e.employeeId || '',
                    e.fullName || '',
                    e.jobTitle || '',
                    e.employmentType || '',
                    e.status || '',
                    salary.toFixed(2)
                ];
            });
            const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `payroll_summary_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Payroll CSV exported ✓');
        };

        // ── Salary History Modal ──
        window.openSalaryHistory = function(employeeId) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === employeeId);
            if (!emp) return;
            empSalaryHistoryTargetId = employeeId;

            document.getElementById('emp-salary-history-title').textContent = `Salary History — ${emp.fullName}`;
            const btn = document.getElementById('btn-add-salary-adj');
            if (btn) btn.onclick = function() { window.openAddSalaryAdjustment(employeeId); };

            _renderSalaryHistoryContent(employeeId, emp);
            document.getElementById('emp-salary-history-modal').classList.remove('hidden');
        };

        function _renderSalaryHistoryContent(employeeId, emp) {
            const history = localStore.getAll('salaryHistory').filter(s => s.employeeId === employeeId)
                .sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

            const container = document.getElementById('emp-salary-history-content');
            if (!container) return;

            if (history.length === 0) {
                container.innerHTML = '<div class="emp-empty-state" style="padding:2rem;">No salary history recorded.</div>';
                return;
            }

            // Summary stats
            const totalIncrease = history.filter(s => s.changeType === 'Increase').reduce((sum, s) => sum + (parseFloat(s.changeAmount) || 0), 0);
            const increaseCount = history.filter(s => s.changeType === 'Increase').length;
            const firstSalary = history[history.length - 1];
            const latestSalary = history[0];

            container.innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:1.25rem;">
                    <div style="background:#F8FAFC;border-radius:12px;padding:0.75rem 1rem;text-align:center;">
                        <div style="font-size:1rem;font-weight:800;color:#0F172A;">${empFmtCurrency(emp.currentSalary, emp.currency)}</div>
                        <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Current Salary</div>
                    </div>
                    <div style="background:#F0FDF4;border-radius:12px;padding:0.75rem 1rem;text-align:center;">
                        <div style="font-size:1rem;font-weight:800;color:#059669;">+${empFmtCurrency(totalIncrease, emp.currency)}</div>
                        <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Total Increases</div>
                    </div>
                    <div style="background:#F8FAFC;border-radius:12px;padding:0.75rem 1rem;text-align:center;">
                        <div style="font-size:1rem;font-weight:800;color:#7C3AED;">${increaseCount}</div>
                        <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Raise Count</div>
                    </div>
                </div>
                <div class="emp-salary-timeline">
                    ${history.map((s, idx) => {
                        const typeKey = (s.changeType || 'adjustment').toLowerCase();
                        const sign = s.changeType === 'Increase' ? '+' : s.changeType === 'Decrease' ? '-' : '~';
                        const clr = s.changeType === 'Increase' ? '#059669' : s.changeType === 'Decrease' ? '#DC2626' : '#D97706';
                        const isLatest = idx === 0;
                        return `<div class="emp-salary-entry" style="${isLatest ? 'border-color:#2563EB;background:rgba(37,99,235,0.02);' : ''}">
                            <div class="emp-salary-entry-dot emp-salary-entry-dot-${typeKey}" style="margin-top:6px;"></div>
                            <div style="flex:1;">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <span style="font-weight:700;font-size:0.88rem;color:#0F172A;">${empFmtCurrency(s.oldSalary, emp.currency)} → ${empFmtCurrency(s.newSalary, emp.currency)}</span>
                                    <span class="emp-salary-entry-badge emp-salary-entry-badge-${typeKey}">${s.changeType}</span>
                                    ${isLatest ? '<span style="font-size:0.7rem;background:#DBEAFE;color:#1D4ED8;padding:2px 7px;border-radius:999px;font-weight:700;">Latest</span>' : ''}
                                </div>
                                <div style="font-size:0.78rem;color:#64748B;margin-top:3px;">${s.note || '—'}</div>
                                <div style="font-size:0.73rem;color:#94A3B8;margin-top:2px;">Effective: ${empFmtDate(s.effectiveDate)} · Recorded: ${empFmtDate(s.createdAt?.split('T')[0])}</div>
                            </div>
                            <div style="font-weight:800;color:${clr};font-size:0.9rem;white-space:nowrap;">${sign}${empFmtCurrency(Math.abs(s.changeAmount), emp.currency)}</div>
                        </div>`;
                    }).join('')}
                </div>`;
        }

        window.closeEmpSalaryHistoryModal = function() {
            document.getElementById('emp-salary-history-modal').classList.add('hidden');
            empSalaryHistoryTargetId = null;
        };

        // ── Add Salary Adjustment ──
        window.openAddSalaryAdjustment = function(employeeId) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === employeeId);
            if (!emp) return;

            document.getElementById('sa-employee-id').value = employeeId;
            document.getElementById('sa-employee-name').value = emp.fullName;
            document.getElementById('sa-current-salary').value = empFmtCurrency(emp.currentSalary, emp.currency);
            document.getElementById('sa-new-salary').value = '';
            document.getElementById('sa-change-amount').value = '';
            document.getElementById('sa-change-type').value = 'Increase';
            document.getElementById('sa-effective-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('sa-note').value = '';

            // Close salary history modal first, then open adjustment
            document.getElementById('emp-salary-history-modal').classList.add('hidden');
            document.getElementById('emp-salary-adj-modal').classList.remove('hidden');
        };

        window.calcSalaryDiff = function() {
            const empId = document.getElementById('sa-employee-id').value;
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            const current = parseFloat(emp.currentSalary) || 0;
            const newSal = parseFloat(document.getElementById('sa-new-salary').value) || 0;
            const diff = newSal - current;
            document.getElementById('sa-change-amount').value = empFmtCurrency(Math.abs(diff), emp.currency);
            // Auto-set change type
            const typeSelect = document.getElementById('sa-change-type');
            if (typeSelect) {
                if (diff > 0) typeSelect.value = 'Increase';
                else if (diff < 0) typeSelect.value = 'Decrease';
                else typeSelect.value = 'Adjustment';
            }
        };

        window.closeEmpSalaryAdjModal = function() {
            document.getElementById('emp-salary-adj-modal').classList.add('hidden');
            // Re-open salary history if it was open
            if (empSalaryHistoryTargetId) {
                document.getElementById('emp-salary-history-modal').classList.remove('hidden');
            }
        };

        window.saveSalaryAdjustment = async function() {
            const empId = document.getElementById('sa-employee-id').value;
            const newSalary = parseFloat(document.getElementById('sa-new-salary').value);
            const effectiveDate = document.getElementById('sa-effective-date').value;
            if (!empId || isNaN(newSalary) || !effectiveDate) {
                showToast('Please fill in all required fields.');
                return;
            }
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;
            const oldSalary = parseFloat(emp.currentSalary) || 0;
            const diff = newSalary - oldSalary;
            const changeType = document.getElementById('sa-change-type').value;
            const note = document.getElementById('sa-note').value.trim();

            // Save salary history
            const sh = {
                id: 'sh-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                employeeId: empId,
                oldSalary,
                newSalary,
                changeAmount: Math.abs(diff),
                changeType,
                effectiveDate,
                note,
                createdAt: new Date().toISOString()
            };
            await cloudDB.put(sh, 'salaryHistory');

            // Update employee current salary
            const updatedEmp = { ...emp, currentSalary: newSalary, updatedAt: new Date().toISOString() };
            await cloudDB.put(updatedEmp, 'employees');

            window.closeEmpSalaryAdjModal();
            document.getElementById('emp-salary-history-modal').classList.add('hidden');
            empSalaryHistoryTargetId = null;
            window.refreshEmployeesModule();
            showToast('Salary adjustment saved ✓');
        };

        // ── Archive Employee ──
        window.archiveEmployee = function(id) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === id);
            if (!emp) return;
            const alreadyInactive = ['Inactive', 'Archived', 'Resigned', 'Terminated'].includes(emp.status);
            if (alreadyInactive) { showToast('Employee is already inactive / archived.'); return; }
            window.openConfirmModal(
                'Archive Employee',
                `Archive ${emp.fullName}? They will be marked as Inactive/Archived and excluded from active payroll. Their record and history will be preserved.`,
                async () => {
                    const now = new Date().toISOString();
                    const updated = {
                        ...emp,
                        status: 'Archived',
                        deactivatedAt: now,
                        leftAt: now,
                        updatedAt: now
                    };
                    await cloudDB.put(updated, 'employees');
                    // Record a status-change event in salary_history for activity tracking
                    const lastSalary = parseFloat(emp.currentSalary) || 0;
                    const activityEntry = {
                        id: 'sh-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                        employeeId: id,
                        oldSalary: lastSalary,
                        newSalary: lastSalary,
                        changeAmount: 0,
                        changeType: 'Archived',
                        effectiveDate: now.slice(0, 10),
                        note: 'Employee archived — removed from active payroll',
                        createdAt: now
                    };
                    await cloudDB.put(activityEntry, 'salaryHistory');
                    window.refreshEmployeesModule();
                    showToast('Employee archived ✓');
                }
            );
        };

        // DELETE - Permanent hard delete
        window.deleteEmployee = function(id) {
            const employees = localStore.getAll('employees');
            const emp = employees.find(e => e.id === id);
            if (!emp) return;
            window.openConfirmModal(
                'Delete Employee',
                `Permanently delete ${emp.fullName}? This will also remove all their salary history and cannot be undone.`,
                async () => {
                    // Remove all related salary history records first
                    const salaryHistory = localStore.getAll('salaryHistory');
                    const relatedIds = salaryHistory.filter(s => s.employeeId === id).map(s => s.id);
                    await Promise.all(relatedIds.map(shId => cloudDB.delete(shId, 'salaryHistory')));
                    // Remove the employee record
                    await cloudDB.delete(id, 'employees');
                    window.refreshEmployeesModule();
                    showToast('Employee deleted ✓');
                }
            );
        };

        // ── Export dock: always visible while active (no scroll-based hide) ──

        // ==========================================================================
        // ACCOUNTING MODULE
        // ==========================================================================
        (function() {
            // ── State ──
            let acctCurrentStore = null;   // which store is being edited
            let acctEditingId = null;      // null = new record, string = edit existing

            // ── Currency conversion rates to EGP (approximate; update periodically as exchange rates change) ──
            const ACCT_CURRENCY_RATES = { EGP: 1, SAR: 8.5, AED: 8.8 };

            // ── Helpers ──
            function acctFmt(num) {
                const n = parseFloat(num) || 0;
                return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
            }
            function acctFmtDate(d) {
                if (!d) return '';
                try {
                    // Handle YYYY-MM format (month-only stored value)
                    if (/^\d{4}-\d{2}$/.test(d)) return acctFmtMonth(d);
                    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00') : new Date(d);
                    if (isNaN(parsed.getTime())) return d;
                    return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
                } catch(e) { return d; }
            }
            function acctFmtMonth(m) {
                if (!m) return '';
                try {
                    const [year, month] = m.split('-');
                    const d = new Date(parseInt(year), parseInt(month) - 1, 1);
                    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
                } catch(e) { return m; }
            }
            function acctEscape(s) {
                return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            }
            // Extract YYYY-MM key from a date string (handles YYYY-MM and YYYY-MM-DD)
            function acctMonthKey(d) {
                if (!d || typeof d !== 'string') return '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.substring(0, 7);
                if (/^\d{4}-\d{2}$/.test(d)) return d;
                return '';
            }
            function acctActionsHTML(id, store) {
                return `<div style="display:flex;gap:6px;justify-content:flex-end;">
                    <button class="ui-button ui-button-secondary" style="font-size:0.75rem;padding:0.3rem 0.65rem;" onclick="window.openAcctModal('${store}','${id}')">Edit</button>
                    <button class="ui-button ui-button-danger" style="font-size:0.75rem;padding:0.3rem 0.65rem;" onclick="window.deleteAcctRecord('${store}','${id}')">Delete</button>
                </div>`;
            }
            function acctToEGP(amount, currency) {
                const rate = ACCT_CURRENCY_RATES[currency] || 1;
                return (parseFloat(amount) || 0) * rate;
            }
            function acctGetActiveMonth(filterId) {
                const el = document.getElementById(filterId);
                return el ? el.value : '';
            }

            // ── Populate month dropdowns from ledger data ──
            function acctPopulateMonthDropdowns() {
                const ledgerRecs = localStore.getAll('acctLedger');
                const months = [...new Set(ledgerRecs.map(r => r.month).filter(Boolean))].sort().reverse();
                ['acct-ledger-month', 'acct-summary-month'].forEach(id => {
                    const sel = document.getElementById(id);
                    if (!sel) return;
                    const cur = sel.value;
                    sel.innerHTML = '<option value="">All Months</option>' + months.map(m =>
                        `<option value="${acctEscape(m)}"${m === cur ? ' selected' : ''}>${acctEscape(acctFmtMonth(m))}</option>`
                    ).join('');
                    if (cur && months.includes(cur)) sel.value = cur;
                });
            }

            // ── Render: Clients Ledger (grouped by month/year) ──
            window.renderAcctLedger = function() {
                acctPopulateMonthDropdowns();
                const q = (document.getElementById('acct-ledger-search') || {}).value || '';
                const selectedMonth = acctGetActiveMonth('acct-ledger-month');
                let records = localStore.getAll('acctLedger')
                    .sort((a, b) => (b.month || '').localeCompare(a.month || ''));
                if (selectedMonth) records = records.filter(r => r.month === selectedMonth);
                if (q) records = records.filter(r =>
                    (r.clientName || '').toLowerCase().includes(q.toLowerCase()) ||
                    (r.service || '').toLowerCase().includes(q.toLowerCase()) ||
                    (r.notes || '').toLowerCase().includes(q.toLowerCase())
                );
                const container = document.getElementById('acct-ledger-container');
                if (!container) return;
                if (records.length === 0) {
                    container.innerHTML = `<div class="emp-empty-state" style="text-align:center;padding:32px;">No entries found. Click "Add Entry" to get started.</div>`;
                } else {
                    // Group by month
                    const groups = {};
                    records.forEach(r => {
                        const key = r.month || '';
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(r);
                    });
                    const sortedMonths = Object.keys(groups).sort().reverse();
                    container.innerHTML = sortedMonths.map(month => {
                        const groupRecs = groups[month];
                        const groupTotal = groupRecs.reduce((s, r) => s + acctToEGP(r.amount, r.currency), 0);
                        const rowsHTML = groupRecs.map((r, i) => {
                            const isTaiseer = r.paymentType === 'Taiseer Mahmoud';
                            const badgeColor = isTaiseer ? '#059669' : '#7C3AED';
                            const badgeBg = isTaiseer ? 'rgba(5,150,105,0.1)' : 'rgba(124,58,237,0.1)';
                            return `<tr>
                                <td class="emp-cell-num">${i + 1}</td>
                                <td class="emp-name">${acctEscape(r.clientName)}</td>
                                <td>${acctEscape(r.service)}</td>
                                <td><span style="font-weight:600;">${acctEscape(r.currency)}</span></td>
                                <td class="emp-cell-salary">${acctFmt(r.amount)}</td>
                                <td><span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.78rem;font-weight:600;background:${badgeBg};color:${badgeColor};">${acctEscape(r.paymentType)}</span></td>
                                <td>${acctFmtDate(r.paymentDate)}</td>
                                <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${acctEscape(r.notes)}">${acctEscape(r.notes)}</td>
                                <td>${acctActionsHTML(r.id, 'ledger')}</td>
                            </tr>`;
                        }).join('');
                        return `<details class="acct-month-group" open>
                            <summary class="acct-month-summary">
                                <span class="acct-month-label">${acctEscape(acctFmtMonth(month))}</span>
                                <span class="acct-month-badge">${groupRecs.length} entr${groupRecs.length === 1 ? 'y' : 'ies'}</span>
                                <span class="acct-month-total">Total: ${acctFmt(groupTotal)} EGP</span>
                            </summary>
                            <div class="acct-month-body emp-table-wrap">
                                <table class="emp-table">
                                    <thead><tr>
                                        <th>#</th><th>Client Name</th><th>Service / Project</th>
                                        <th>Currency</th><th>Amount</th><th>Collected By</th>
                                        <th>Payment Date</th><th>Notes</th><th>Actions</th>
                                    </tr></thead>
                                    <tbody>${rowsHTML}</tbody>
                                </table>
                            </div>
                        </details>`;
                    }).join('');
                }
                // Also render ledger-tab expenses
                acctRenderExpensesGrouped('acct-ledger-expenses-container', null);
            };

            // ── Render: Accounting Summary (auto-calculated from ledger) ──
            window.renderAcctSummary = function() {
                acctPopulateMonthDropdowns();
                const selectedMonth = acctGetActiveMonth('acct-summary-month');
                let ledgerRecs = localStore.getAll('acctLedger');
                if (selectedMonth) ledgerRecs = ledgerRecs.filter(r => r.month === selectedMonth);

                // ── 1. Income ──
                const incomeBody = document.getElementById('acct-income-body');
                const incomeFoot = document.getElementById('acct-income-foot');
                let totalIncome = 0;
                if (incomeBody) {
                    if (ledgerRecs.length === 0) {
                        incomeBody.innerHTML = `<tr><td colspan="8" class="emp-empty-state" style="text-align:center;padding:20px;">No income entries for selected period.</td></tr>`;
                        if (incomeFoot) incomeFoot.innerHTML = '';
                    } else {
                        incomeBody.innerHTML = ledgerRecs.map((r, i) => {
                            const egpAmt = acctToEGP(r.amount, r.currency);
                            totalIncome += egpAmt;
                            const isTaiseer = r.paymentType === 'Taiseer Mahmoud';
                            const badgeColor = isTaiseer ? '#059669' : '#7C3AED';
                            const badgeBg = isTaiseer ? 'rgba(5,150,105,0.1)' : 'rgba(124,58,237,0.1)';
                            return `<tr>
                                <td class="emp-cell-num">${i + 1}</td>
                                <td class="emp-name">${acctEscape(r.clientName)}</td>
                                <td>${acctEscape(r.service)}</td>
                                <td><span style="font-weight:600;">${acctEscape(r.currency)}</span></td>
                                <td class="emp-cell-salary">${acctFmt(r.amount)}</td>
                                <td class="emp-cell-salary" style="color:#059669;">${acctFmt(egpAmt)}</td>
                                <td><span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:0.78rem;font-weight:600;background:${badgeBg};color:${badgeColor};">${acctEscape(r.paymentType)}</span></td>
                                <td>${acctFmtDate(r.paymentDate)}</td>
                            </tr>`;
                        }).join('');
                        if (incomeFoot) incomeFoot.innerHTML = `<tr style="background:rgba(5,150,105,0.05);font-weight:700;">
                            <td colspan="5" style="padding:0.7rem 1rem;text-align:right;font-size:0.83rem;">Total Income (EGP)</td>
                            <td colspan="3" style="padding:0.7rem 1rem;color:#059669;">${acctFmt(totalIncome)} EGP</td>
                        </tr>`;
                    }
                }

                // ── 2. Taiseer Mahmoud Collections (auto-filtered from ledger) ──
                const egyptRecs = ledgerRecs.filter(r => r.paymentType === 'Taiseer Mahmoud');
                const egyptBody = document.getElementById('acct-egypt-body');
                const egyptFoot = document.getElementById('acct-egypt-foot');
                let totalEgypt = 0;
                if (egyptBody) {
                    if (egyptRecs.length === 0) {
                        egyptBody.innerHTML = `<tr><td colspan="7" class="emp-empty-state" style="text-align:center;padding:20px;">No Taiseer Mahmoud collections for selected period.</td></tr>`;
                        if (egyptFoot) egyptFoot.innerHTML = '';
                    } else {
                        egyptBody.innerHTML = egyptRecs.map((r, i) => {
                            const egpAmt = acctToEGP(r.amount, r.currency);
                            totalEgypt += egpAmt;
                            return `<tr>
                                <td class="emp-cell-num">${i + 1}</td>
                                <td class="emp-name">${acctEscape(r.clientName)}</td>
                                <td>${acctEscape(r.service)}</td>
                                <td><span style="font-weight:600;">${acctEscape(r.currency)}</span></td>
                                <td class="emp-cell-salary">${acctFmt(r.amount)}</td>
                                <td class="emp-cell-salary" style="color:#059669;">${acctFmt(egpAmt)}</td>
                                <td>${acctFmtDate(r.paymentDate)}</td>
                            </tr>`;
                        }).join('');
                        if (egyptFoot) egyptFoot.innerHTML = `<tr style="background:rgba(15,118,110,0.05);font-weight:700;">
                            <td colspan="5" style="padding:0.7rem 1rem;text-align:right;font-size:0.83rem;">Total Taiseer Mahmoud (EGP)</td>
                            <td colspan="2" style="padding:0.7rem 1rem;color:#0F766E;">${acctFmt(totalEgypt)} EGP</td>
                        </tr>`;
                    }
                }

                // ── 3. Ahmed Mansour Collections (auto-filtered from ledger) ──
                const ahmedRecs = ledgerRecs.filter(r => r.paymentType === 'Ahmed Mansour');
                const ahmedBody = document.getElementById('acct-ahmed-body');
                const ahmedFoot = document.getElementById('acct-ahmed-foot');
                let totalAhmed = 0;
                if (ahmedBody) {
                    if (ahmedRecs.length === 0) {
                        ahmedBody.innerHTML = `<tr><td colspan="7" class="emp-empty-state" style="text-align:center;padding:20px;">No Ahmed Mansour collections for selected period.</td></tr>`;
                        if (ahmedFoot) ahmedFoot.innerHTML = '';
                    } else {
                        ahmedBody.innerHTML = ahmedRecs.map((r, i) => {
                            const egpAmt = acctToEGP(r.amount, r.currency);
                            totalAhmed += egpAmt;
                            return `<tr>
                                <td class="emp-cell-num">${i + 1}</td>
                                <td class="emp-name">${acctEscape(r.clientName)}</td>
                                <td>${acctEscape(r.service)}</td>
                                <td><span style="font-weight:600;">${acctEscape(r.currency)}</span></td>
                                <td class="emp-cell-salary">${acctFmt(r.amount)}</td>
                                <td class="emp-cell-salary" style="color:#7C3AED;">${acctFmt(egpAmt)}</td>
                                <td>${acctFmtDate(r.paymentDate)}</td>
                            </tr>`;
                        }).join('');
                        if (ahmedFoot) ahmedFoot.innerHTML = `<tr style="background:rgba(124,58,237,0.05);font-weight:700;">
                            <td colspan="5" style="padding:0.7rem 1rem;text-align:right;font-size:0.83rem;">Total Ahmed Mansour (EGP)</td>
                            <td colspan="2" style="padding:0.7rem 1rem;color:#7C3AED;">${acctFmt(totalAhmed)} EGP</td>
                        </tr>`;
                    }
                }

                // ── 4. Expenses ──
                let expenseRecs = localStore.getAll('acctExpenses');
                if (selectedMonth) expenseRecs = expenseRecs.filter(r => r.date && acctMonthKey(r.date) === selectedMonth);
                acctRenderExpensesGrouped('acct-ex-container', selectedMonth);
                const totalExpenses = expenseRecs.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

                // ── 5. Summary Stats ──
                const netProfit = totalIncome - totalExpenses;
                const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = acctFmt(val); };
                setVal('summary-total-income', totalIncome);
                setVal('summary-total-egypt', totalEgypt);
                setVal('summary-total-ahmed', totalAhmed);
                setVal('summary-total-expenses', totalExpenses);
                const netEl = document.getElementById('summary-net-profit');
                if (netEl) {
                    netEl.textContent = acctFmt(netProfit);
                    netEl.style.color = netProfit >= 0 ? '#059669' : '#DC2626';
                }

                // ── 6. Partner Settlement ──
                const settlementEl = document.getElementById('acct-settlement-body');
                if (settlementEl) {
                    if (totalIncome === 0 && totalExpenses === 0) {
                        settlementEl.innerHTML = `<div class="emp-empty-state">Select a month and add ledger entries &amp; expenses to calculate the settlement.</div>`;
                    } else {
                        const eachShare = netProfit / 2;
                        const diff = totalEgypt - eachShare; // positive = Tayseer transfers to Ahmed; negative = Ahmed transfers to Tayseer
                        const absAmt = Math.abs(diff);

                        // 0.005 EGP tolerance for floating-point precision
                        const directionHTML = diff > 0.005
                            ? `<div style="margin-top:1.25rem;padding:1rem 1.25rem;border-radius:10px;background:linear-gradient(135deg,rgba(37,99,235,0.07),rgba(124,58,237,0.07));border:1.5px solid #2563EB;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                                <svg fill="none" stroke="#2563EB" viewBox="0 0 24 24" style="width:32px;height:32px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                                <div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-bottom:3px;">Settlement Result — نتيجة التسوية</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#2563EB;">
                                        Tayseer transfers <span style="font-size:1.3rem;color:#DC2626;">${acctFmt(absAmt)} EGP</span> → to Ahmed Mansour
                                    </div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-top:3px;">تيسير يحول لأحمد منصور ${acctFmt(absAmt)} ج.م</div>
                                </div>
                               </div>`
                            : diff < -0.005
                            ? `<div style="margin-top:1.25rem;padding:1rem 1.25rem;border-radius:10px;background:linear-gradient(135deg,rgba(5,150,105,0.07),rgba(15,118,110,0.07));border:1.5px solid #059669;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                                <svg fill="none" stroke="#059669" viewBox="0 0 24 24" style="width:32px;height:32px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 17h-12m0 0l4-4m-4 4l4 4m4-10h12m0 0l-4-4m4 4l-4 4"></path></svg>
                                <div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-bottom:3px;">Settlement Result — نتيجة التسوية</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#059669;">
                                        Ahmed Mansour transfers <span style="font-size:1.3rem;color:#DC2626;">${acctFmt(absAmt)} EGP</span> → to Tayseer
                                    </div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-top:3px;">أحمد منصور يحول لتيسير ${acctFmt(absAmt)} ج.م</div>
                                </div>
                               </div>`
                            : `<div style="margin-top:1.25rem;padding:1rem 1.25rem;border-radius:10px;background:rgba(5,150,105,0.06);border:1.5px solid #10B981;display:flex;align-items:center;gap:14px;">
                                <svg fill="none" stroke="#059669" viewBox="0 0 24 24" style="width:32px;height:32px;flex-shrink:0;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-bottom:3px;">Settlement Result — نتيجة التسوية</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#059669;">Perfectly balanced — No transfer needed ✓</div>
                                    <div style="font-size:0.82rem;color:#6B7280;margin-top:3px;">الحسابات متساوية — لا يوجد تحويل مطلوب</div>
                                </div>
                               </div>`;

                        settlementEl.innerHTML = `
                            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;">
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(5,150,105,0.06);border:1px solid rgba(5,150,105,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Total Revenue — إجمالي الإيرادات</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#059669;">${acctFmt(totalIncome)} EGP</div>
                                </div>
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(239,68,68,0.05);border:1px solid rgba(239,68,68,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Total Expenses — المصاريف</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#DC2626;">${acctFmt(totalExpenses)} EGP</div>
                                </div>
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(217,119,6,0.06);border:1px solid rgba(217,119,6,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Net Profit — صافي الربح</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:${netProfit >= 0 ? '#D97706' : '#DC2626'};">${acctFmt(netProfit)} EGP</div>
                                </div>
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Each Partner's Share (50%) — نصيب كل شريك</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#2563EB;">${acctFmt(eachShare)} EGP</div>
                                </div>
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(15,118,110,0.06);border:1px solid rgba(15,118,110,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Taiseer Mahmoud Collected — تيسير محمود حصّل</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#0F766E;">${acctFmt(totalEgypt)} EGP</div>
                                </div>
                                <div style="padding:0.85rem 1rem;border-radius:8px;background:rgba(124,58,237,0.06);border:1px solid rgba(124,58,237,0.18);">
                                    <div style="font-size:0.75rem;color:#6B7280;margin-bottom:4px;">Ahmed Mansour Collected — أحمد منصور حصّل</div>
                                    <div style="font-size:1.1rem;font-weight:700;color:#7C3AED;">${acctFmt(totalAhmed)} EGP</div>
                                </div>
                            </div>
                            ${directionHTML}`;
                    }
                }
            };

            // ── Render: Expenses (grouped by month/year) ──
            // containerId: target container element id; monthFilter: optional YYYY-MM string to filter
            function acctRenderExpensesGrouped(containerId, monthFilter) {
                const container = document.getElementById(containerId);
                if (!container) return;
                let records = localStore.getAll('acctExpenses')
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                if (monthFilter) records = records.filter(r => r.date && acctMonthKey(r.date) === monthFilter);
                if (records.length === 0) {
                    container.innerHTML = `<div class="emp-empty-state" style="text-align:center;padding:24px;">No expenses yet.</div>`;
                    return;
                }
                // Group by month
                const groups = {};
                records.forEach(r => {
                    const key = acctMonthKey(r.date);
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(r);
                });
                const sortedMonths = Object.keys(groups).sort().reverse();
                container.innerHTML = sortedMonths.map(month => {
                    const groupRecs = groups[month];
                    const groupTotal = groupRecs.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
                    const rowsHTML = groupRecs.map((r, i) => `<tr>
                        <td class="emp-cell-num">${i + 1}</td>
                        <td>${acctFmtDate(r.date)}</td>
                        <td>${acctEscape(r.category)}</td>
                        <td>${acctEscape(r.description)}</td>
                        <td class="emp-cell-salary" style="color:#DC2626;">${acctFmt(r.amount)}</td>
                        <td>${acctEscape(r.paidBy)}</td>
                        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${acctEscape(r.notes)}">${acctEscape(r.notes)}</td>
                        <td>${acctActionsHTML(r.id, 'expenses')}</td>
                    </tr>`).join('');
                    return `<details class="acct-month-group" open>
                        <summary class="acct-month-summary acct-month-summary-expense">
                            <span class="acct-month-label">${acctEscape(acctFmtMonth(month))}</span>
                            <span class="acct-month-badge">${groupRecs.length} expense${groupRecs.length === 1 ? '' : 's'}</span>
                            <span class="acct-month-total" style="color:#DC2626;">Total: ${acctFmt(groupTotal)} EGP</span>
                        </summary>
                        <div class="acct-month-body emp-table-wrap">
                            <table class="emp-table">
                                <thead><tr>
                                    <th>#</th><th>Date</th><th>Category</th><th>Description</th>
                                    <th style="text-align:right;">Amount</th><th>Paid By</th><th>Notes</th><th>Actions</th>
                                </tr></thead>
                                <tbody>${rowsHTML}</tbody>
                            </table>
                        </div>
                    </details>`;
                }).join('');
            }

            // ── Render: Expenses (legacy wrapper — kept for compatibility) ──
            window.renderAcctExpenses = function() {
                acctRenderExpensesGrouped('acct-ex-container', null);
                acctRenderExpensesGrouped('acct-ledger-expenses-container', null);
            };

            // ── Tab Switching ──
            window.switchAcctTab = function(tab) {
                const tabs = ['ledger', 'summary'];
                tabs.forEach(t => {
                    const content = document.getElementById('acct-tab-' + t);
                    if (content) content.classList.toggle('active', t === tab);
                });
                const mod = document.getElementById('accounting-module');
                if (mod) {
                    mod.querySelectorAll('.emp-tabs-bar .ui-nav-pill').forEach(btn => {
                        btn.classList.toggle('active', btn.dataset.acctab === tab);
                    });
                }
                if (tab === 'ledger') {
                    acctPopulateMonthDropdowns();
                    window.renderAcctLedger();
                } else if (tab === 'summary') {
                    window.renderAcctSummary();
                }
            };

            // ── Refresh all ──
            window.refreshAccountingModule = function() {
                acctPopulateMonthDropdowns();
                window.renderAcctLedger();
                window.renderAcctSummary();
            };

            // ── Modal: field definitions per store ──
            const ACCT_FIELDS = {
                ledger: [
                    { key: 'clientName',  label: 'Client Name',       type: 'text',     required: true,  placeholder: 'e.g. Acme Corp' },
                    { key: 'service',     label: 'Service / Project', type: 'text',     required: false, placeholder: 'e.g. Social Media Management' },
                    { key: 'month',       label: 'Month',             type: 'month',    required: true,  placeholder: '' },
                    { key: 'currency',    label: 'Currency',          type: 'select',   required: true,
                      options: ['EGP', 'SAR', 'AED'] },
                    { key: 'amount',      label: 'Amount',            type: 'number',   required: true,  placeholder: '0.00' },
                    { key: 'paymentType', label: 'Collected By',      type: 'select',   required: true,
                      options: ['Taiseer Mahmoud', 'Ahmed Mansour'] },
                    { key: 'paymentDate', label: 'Payment Date',      type: 'date',     required: false, placeholder: '' },
                    { key: 'notes',       label: 'Notes',             type: 'textarea', required: false, placeholder: 'Optional notes…', span2: true }
                ],
                expenses: [
                    { key: 'date',        label: 'Month / Year',     type: 'month',    required: true,  placeholder: 'e.g. March 2026' },
                    { key: 'category',    label: 'Expense Category', type: 'select',   required: true,
                      options: ['Office Supplies', 'Software & Tools', 'Marketing', 'Travel', 'Utilities', 'Salaries', 'Rent', 'Maintenance', 'Legal & Compliance', 'Other'] },
                    { key: 'description', label: 'Description',      type: 'text',     required: false, placeholder: 'Brief description…', span2: true },
                    { key: 'amount',      label: 'Amount',           type: 'number',   required: true,  placeholder: '0.00' },
                    { key: 'paidBy',      label: 'Paid By',          type: 'text',     required: false, placeholder: 'e.g. Taiseer Mahmoud' },
                    { key: 'notes',       label: 'Notes',            type: 'textarea', required: false, placeholder: 'Optional notes…', span2: true }
                ]
            };

            const STORE_LABELS = {
                ledger:   'Clients Ledger Entry',
                expenses: 'Expense'
            };

            const STORE_NAMES = {
                ledger:   'acctLedger',
                expenses: 'acctExpenses'
            };

            // ── Open Modal ──
            window.openAcctModal = function(storeKey, editId) {
                acctCurrentStore = storeKey;
                acctEditingId = editId || null;

                const titleEl = document.getElementById('acct-modal-title');
                if (titleEl) titleEl.textContent = (acctEditingId ? 'Edit' : 'Add') + ' — ' + (STORE_LABELS[storeKey] || storeKey);

                const fields = ACCT_FIELDS[storeKey] || [];
                let existingData = {};
                if (acctEditingId) {
                    const rec = localStore.getAll(STORE_NAMES[storeKey]).find(r => r.id === acctEditingId);
                    if (rec) existingData = rec;
                }

                const container = document.getElementById('acct-modal-fields');
                if (!container) return;
                container.innerHTML = fields.map(f => {
                    const val = existingData[f.key] || '';
                    const spanClass = f.span2 ? ' col-span-2' : '';
                    let input = '';
                    if (f.type === 'textarea') {
                        input = `<textarea id="acct-field-${f.key}" class="ui-input" rows="3" placeholder="${acctEscape(f.placeholder || '')}" style="resize:vertical;">${acctEscape(val)}</textarea>`;
                    } else if (f.type === 'select') {
                        const opts = (f.options || []).map(o => `<option value="${acctEscape(o)}"${val === o ? ' selected' : ''}>${acctEscape(o)}</option>`).join('');
                        input = `<select id="acct-field-${f.key}" class="ui-input"><option value="">— Select —</option>${opts}</select>`;
                    } else {
                        input = `<input type="${f.type}" id="acct-field-${f.key}" class="ui-input" value="${acctEscape(val)}" placeholder="${acctEscape(f.placeholder || '')}"${f.required ? ' required' : ''}>`;
                    }
                    return `<div class="emp-form-section${spanClass}" style="display:flex;flex-direction:column;gap:6px;">
                        <label style="font-size:0.82rem;font-weight:600;color:var(--text-main);">${acctEscape(f.label)}${f.required ? ' <span style="color:#EF4444;">*</span>' : ''}</label>
                        ${input}
                    </div>`;
                }).join('');

                const modal = document.getElementById('acct-form-modal');
                if (modal) modal.classList.remove('hidden');
            };

            // ── Close Modal ──
            window.closeAcctModal = function() {
                const modal = document.getElementById('acct-form-modal');
                if (modal) modal.classList.add('hidden');
                acctCurrentStore = null;
                acctEditingId = null;
            };

            // ── Save Record ──
            window.saveAcctRecord = async function() {
                const storeKey = acctCurrentStore;
                const storeName = STORE_NAMES[storeKey];
                if (!storeName) return;

                const fields = ACCT_FIELDS[storeKey] || [];
                const record = { id: acctEditingId || Date.now().toString(), timestamp: Date.now() };

                let valid = true;
                fields.forEach(f => {
                    const el = document.getElementById('acct-field-' + f.key);
                    const val = el ? el.value.trim() : '';
                    if (f.required && !val) {
                        valid = false;
                        if (el) el.style.borderColor = '#EF4444';
                    } else if (f.type === 'number' && val && isNaN(parseFloat(val))) {
                        valid = false;
                        if (el) el.style.borderColor = '#EF4444';
                    } else {
                        if (el) el.style.borderColor = '';
                    }
                    record[f.key] = val;
                });

                if (!valid) { showToast('Please fill in all required fields.'); return; }

                localStore.put(record, storeName);
                try {
                    await cloudDB.put(record, storeName);
                } catch (e) {
                    console.error('Accounting sync failed:', e);
                }
                await logActivity(acctEditingId ? 'updated' : 'created', storeKey, record.id, { client: record.clientName || record.description || '', ref: record.month || '', amount: parseFloat(record.amount) || 0, currency: record.currency || '' });

                window.closeAcctModal();
                window.refreshAccountingModule();
                showToast('Entry saved ✓');
            };

            // ── Delete Record ──
            window.deleteAcctRecord = function(storeKey, id) {
                const storeName = STORE_NAMES[storeKey];
                if (!storeName) return;
                window.openConfirmModal(
                    'Delete Entry',
                    'Permanently delete this entry? This cannot be undone.',
                    async () => {
                        await cloudDB.delete(id, storeName);
                        window.refreshAccountingModule();
                        showToast('Entry deleted ✓');
                    }
                );
            };

            // ── Export to Excel (multi-sheet workbook) ──
            window.exportAccountingExcel = async function() {
                const btn = document.getElementById('acctBtnExcel');
                if (btn) { btn.disabled = true; btn.innerHTML = 'Generating…'; }
                try {
                    await loadExportLibraries();
                    const wb = new ExcelJS.Workbook();
                    wb.creator = 'OPENY Accounting';
                    wb.created = new Date();

                    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
                    const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
                    const TOTAL_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };
                    const TOTAL_FONT  = { bold: true, size: 10 };
                    const BORDER = { style: 'thin', color: { argb: 'FFD1D5DB' } };
                    const CELL_BORDER = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
                    function applyBorder(row) { row.eachCell({ includeEmpty: true }, c => { c.border = CELL_BORDER; }); }
                    function numFmt(cell) { cell.numFmt = '#,##0.00'; }

                    const ledger = localStore.getAll('acctLedger')
                        .sort((a, b) => (b.paymentDate || b.month || '').localeCompare(a.paymentDate || a.month || ''));

                    // ── Sheet 1: Clients Ledger ──
                    const ws1 = wb.addWorksheet('Clients Ledger', { pageSetup: { paperSize: 9, orientation: 'landscape' } });
                    ws1.columns = [
                        { header: '#',            key: 'num',         width: 5 },
                        { header: 'Client Name',  key: 'clientName',  width: 25 },
                        { header: 'Service',      key: 'service',     width: 28 },
                        { header: 'Month',        key: 'month',       width: 15 },
                        { header: 'Currency',     key: 'currency',    width: 10 },
                        { header: 'Amount',       key: 'amount',      width: 16 },
                        { header: 'Amount (EGP)', key: 'amountEGP',   width: 16 },
                        { header: 'Collected By', key: 'paymentType', width: 18 },
                        { header: 'Payment Date', key: 'paymentDate', width: 15 },
                        { header: 'Notes',        key: 'notes',       width: 30 }
                    ];
                    const hRow1 = ws1.getRow(1);
                    hRow1.fill = HEADER_FILL; hRow1.font = HEADER_FONT; hRow1.height = 20;
                    applyBorder(hRow1);
                    let totalLedgerEGP = 0;
                    ledger.forEach((r, i) => {
                        const egpAmt = acctToEGP(r.amount, r.currency);
                        totalLedgerEGP += egpAmt;
                        const row = ws1.addRow({
                            num: i + 1, clientName: r.clientName, service: r.service,
                            month: acctFmtMonth(r.month), currency: r.currency,
                            amount: parseFloat(r.amount) || 0, amountEGP: egpAmt,
                            paymentType: r.paymentType, paymentDate: r.paymentDate, notes: r.notes
                        });
                        numFmt(row.getCell('amount')); numFmt(row.getCell('amountEGP'));
                        row.getCell('amountEGP').font = { color: { argb: 'FF059669' } };
                        applyBorder(row);
                    });
                    const tRow1 = ws1.addRow({ num: '', clientName: '', service: '', month: '', currency: 'TOTAL EGP', amount: '', amountEGP: totalLedgerEGP });
                    tRow1.fill = TOTAL_FILL; tRow1.font = TOTAL_FONT;
                    numFmt(tRow1.getCell('amountEGP')); applyBorder(tRow1);

                    // ── Sheet 2: Taiseer Mahmoud Collections (auto-filtered) ──
                    const egyptRecs = ledger.filter(r => r.paymentType === 'Taiseer Mahmoud');
                    const ws2 = wb.addWorksheet('Taiseer Collections');
                    ws2.columns = [
                        { header: '#',               key: 'num',        width: 5 },
                        { header: 'Client Name',     key: 'clientName', width: 25 },
                        { header: 'Service',         key: 'service',    width: 28 },
                        { header: 'Currency',        key: 'currency',   width: 10 },
                        { header: 'Amount',          key: 'amount',     width: 16 },
                        { header: 'Amount (EGP)',    key: 'amountEGP',  width: 16 },
                        { header: 'Payment Date',    key: 'date',       width: 15 },
                        { header: 'Notes',           key: 'notes',      width: 35 }
                    ];
                    const hRow2 = ws2.getRow(1);
                    hRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
                    hRow2.font = HEADER_FONT; hRow2.height = 20; applyBorder(hRow2);
                    let totalEg = 0;
                    egyptRecs.forEach((r, i) => {
                        const egpAmt = acctToEGP(r.amount, r.currency);
                        totalEg += egpAmt;
                        const row = ws2.addRow({ num: i + 1, clientName: r.clientName, service: r.service, currency: r.currency,
                            amount: parseFloat(r.amount) || 0, amountEGP: egpAmt, date: r.paymentDate, notes: r.notes });
                        numFmt(row.getCell('amount')); numFmt(row.getCell('amountEGP'));
                        row.getCell('amountEGP').font = { color: { argb: 'FF059669' } };
                        applyBorder(row);
                    });
                    const tRow2 = ws2.addRow({ num: '', clientName: '', service: '', currency: 'TOTAL EGP', amount: '', amountEGP: totalEg });
                    tRow2.fill = TOTAL_FILL; tRow2.font = TOTAL_FONT; numFmt(tRow2.getCell('amountEGP')); applyBorder(tRow2);

                    // ── Sheet 3: Ahmed Mansour Collections (auto-filtered) ──
                    const ahmedRecs = ledger.filter(r => r.paymentType === 'Ahmed Mansour');
                    const ws3 = wb.addWorksheet('Ahmed Mansour Collections');
                    ws3.columns = [
                        { header: '#',               key: 'num',        width: 5 },
                        { header: 'Client Name',     key: 'clientName', width: 25 },
                        { header: 'Service',         key: 'service',    width: 28 },
                        { header: 'Currency',        key: 'currency',   width: 10 },
                        { header: 'Amount',          key: 'amount',     width: 16 },
                        { header: 'Amount (EGP)',    key: 'amountEGP',  width: 16 },
                        { header: 'Payment Date',    key: 'date',       width: 15 },
                        { header: 'Notes',           key: 'notes',      width: 35 }
                    ];
                    const hRow3 = ws3.getRow(1);
                    hRow3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } };
                    hRow3.font = HEADER_FONT; hRow3.height = 20; applyBorder(hRow3);
                    let totalCa = 0;
                    ahmedRecs.forEach((r, i) => {
                        const egpAmt = acctToEGP(r.amount, r.currency);
                        totalCa += egpAmt;
                        const row = ws3.addRow({ num: i + 1, clientName: r.clientName, service: r.service, currency: r.currency,
                            amount: parseFloat(r.amount) || 0, amountEGP: egpAmt, date: r.paymentDate, notes: r.notes });
                        numFmt(row.getCell('amount')); numFmt(row.getCell('amountEGP'));
                        row.getCell('amountEGP').font = { color: { argb: 'FF7C3AED' } };
                        applyBorder(row);
                    });
                    const tRow3 = ws3.addRow({ num: '', clientName: '', service: '', currency: 'TOTAL EGP', amount: '', amountEGP: totalCa });
                    tRow3.fill = TOTAL_FILL; tRow3.font = TOTAL_FONT; numFmt(tRow3.getCell('amountEGP')); applyBorder(tRow3);

                    // ── Sheet 4: Expenses ──
                    const ws4 = wb.addWorksheet('Expenses');
                    ws4.columns = [
                        { header: '#',           key: 'num',         width: 5 },
                        { header: 'Date',        key: 'date',        width: 14 },
                        { header: 'Category',    key: 'category',    width: 22 },
                        { header: 'Description', key: 'description', width: 30 },
                        { header: 'Amount',      key: 'amount',      width: 16 },
                        { header: 'Paid By',     key: 'paidBy',      width: 18 },
                        { header: 'Notes',       key: 'notes',       width: 35 }
                    ];
                    const hRow4 = ws4.getRow(1);
                    hRow4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
                    hRow4.font = HEADER_FONT; hRow4.height = 20; applyBorder(hRow4);
                    const ex = localStore.getAll('acctExpenses').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                    let totalEx = 0;
                    ex.forEach((r, i) => {
                        totalEx += parseFloat(r.amount) || 0;
                        const row = ws4.addRow({ num: i + 1, date: r.date, category: r.category, description: r.description,
                            amount: parseFloat(r.amount) || 0, paidBy: r.paidBy, notes: r.notes });
                        numFmt(row.getCell('amount')); row.getCell('amount').font = { color: { argb: 'FFDC2626' } };
                        applyBorder(row);
                    });
                    const tRow4 = ws4.addRow({ num: '', date: '', category: '', description: 'TOTAL', amount: totalEx });
                    tRow4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
                    tRow4.font = TOTAL_FONT; numFmt(tRow4.getCell('amount')); applyBorder(tRow4);

                    // ── Sheet 5: Summary ──
                    const ws5 = wb.addWorksheet('Summary');
                    ws5.columns = [
                        { header: 'Category', key: 'cat',    width: 40 },
                        { header: 'Amount (EGP)', key: 'amount', width: 22 },
                        { header: 'Entries',  key: 'entries', width: 12 }
                    ];
                    const sHRow = ws5.getRow(1);
                    sHRow.fill = HEADER_FILL; sHRow.font = HEADER_FONT; sHRow.height = 22; applyBorder(sHRow);
                    const netBalance = totalLedgerEGP - totalEx;
                    const summaryRows = [
                        { cat: 'Total Income (All Ledger)',    amount: totalLedgerEGP, entries: ledger.length },
                        { cat: 'Taiseer Mahmoud Collections',   amount: totalEg,        entries: egyptRecs.length },
                        { cat: 'Ahmed Mansour Collections',     amount: totalCa,        entries: ahmedRecs.length },
                        { cat: 'Total Expenses',               amount: totalEx,        entries: ex.length },
                        { cat: 'Net Profit',                   amount: netBalance,     entries: '-' }
                    ];
                    summaryRows.forEach(r => {
                        const row = ws5.addRow(r);
                        numFmt(row.getCell('amount'));
                        if (r.cat === 'Net Profit') {
                            row.font = { bold: true, size: 12, color: { argb: netBalance >= 0 ? 'FF059669' : 'FFDC2626' } };
                            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netBalance >= 0 ? 'FFF0FDF4' : 'FFFEF2F2' } };
                        } else if (r.cat === 'Total Expenses') {
                            row.font = { bold: true, color: { argb: 'FFDC2626' } };
                        } else if (r.cat === 'Total Income (All Ledger)') {
                            row.font = TOTAL_FONT; row.fill = TOTAL_FILL;
                        }
                        applyBorder(row);
                    });

                    const buf = await wb.xlsx.writeBuffer();
                    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const fname = `OPENY_Accounting_${new Date().toISOString().split('T')[0]}.xlsx`;
                    saveAs(blob, fname);
                    await uploadExportToStorage(blob, 'acctLedger', fname);
                    showToast('Accounting workbook exported ✓');
                } catch(e) {
                    console.error(e);
                    showToast('Error exporting Excel');
                } finally {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#22c55e"/><path d="M14 2v6h6" fill="#86efac"/><text x="12" y="18" text-anchor="middle" font-size="5.5" font-weight="800" fill="white" font-family="Arial,Helvetica,sans-serif">XLS</text></svg>'; }
                }
            };

            // ── Export to PDF (html2canvas + jsPDF) ──
            window.exportAccountingPDF = async function() {
                const btn = document.getElementById('acctBtnPDF');
                if (btn) { btn.disabled = true; btn.innerHTML = 'Generating…'; }
                try {
                    const element = document.getElementById('accounting-export');
                    if (!element) {
                        alert('Export area not found. Please open the Accounting Summary tab first.');
                        return;
                    }

                    await loadExportLibraries();

                    const { jsPDF } = window.jspdf;

                    const canvas = await window.html2canvas(element, {
                        scale: 2,
                        useCORS: true,
                        backgroundColor: '#ffffff',
                        logging: false
                    });

                    const imgData = canvas.toDataURL('image/png');
                    const pdf = new jsPDF('p', 'mm', 'a4');

                    const pageWidth = 210;
                    const pageHeight = 297;
                    const imgWidth = pageWidth;
                    const imgHeight = (canvas.height * imgWidth) / canvas.width;

                    let heightLeft = imgHeight;
                    let position = 0;

                    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                    heightLeft -= pageHeight;

                    while (heightLeft > 0) {
                        position -= pageHeight;
                        pdf.addPage();
                        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                        heightLeft -= pageHeight;
                    }

                    const acctPdfBlob = pdf.output('blob');
                    saveAs(acctPdfBlob, 'OPENY-Accounting.pdf');
                    await uploadExportToStorage(acctPdfBlob, 'acctLedger', 'OPENY-Accounting.pdf');
                    showToast('Accounting PDF exported ✓');
                } catch(e) {
                    console.error('PDF export failed:', e);
                    alert('PDF export failed: ' + (e && e.message ? e.message : 'Unknown error'));
                    showToast('Error exporting PDF');
                } finally {
                    if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" fill="#ef4444"/><path d="M14 2v6h6" fill="#fca5a5"/><text x="12" y="18" text-anchor="middle" font-size="5.5" font-weight="800" fill="white" font-family="Arial,Helvetica,sans-serif">PDF</text></svg>'; }
                }
            };

        }()); // end accounting IIFE

    
        // ==========================================================================
        // URL ROUTING — HTML5 History API
        // Maps URL paths to internal module names and keeps the address bar in sync.
        // ==========================================================================
        (function () {
            var MODULE_ROUTES = {
                'invoice':     '/invoice',
                'quotation':   '/quotation',
                'contract':    '/client-contract',
                'empcontract': '/hr-contract',
                'employees':   '/employees',
                'accounting':  '/accounting'
            };

            // Reverse map: path → module name
            var ROUTE_MODULES = {};
            Object.keys(MODULE_ROUTES).forEach(function (m) {
                ROUTE_MODULES[MODULE_ROUTES[m]] = m;
            });

            // Flag to skip pushing a new history entry when navigating from popstate
            var _skipPush = false;

            // Cache original functions before patching
            var _origSwitch  = null;
            var _origLanding = null;

            function patchFunctions() {
                if (_origSwitch) return; // already patched
                if (!window.switchMainModule || !window.openLanding) {
                    console.warn('[Router] switchMainModule / openLanding not ready yet');
                    return;
                }

                _origSwitch  = window.switchMainModule;
                _origLanding = window.openLanding;

                // Patch switchMainModule — push route URL when switching modules
                window.switchMainModule = function (moduleName) {
                    if (!_skipPush) {
                        var route = MODULE_ROUTES[moduleName];
                        if (route && window.location.pathname !== route) {
                            history.pushState({ module: moduleName }, '', route);
                        }
                    }
                    _origSwitch(moduleName);
                };

                // Patch openLanding — push '/' when going home
                window.openLanding = function () {
                    if (!_skipPush && window.location.pathname !== '/') {
                        history.pushState({ page: 'home' }, '', '/');
                    }
                    _origLanding();
                };
            }

            // Handle browser back / forward navigation
            window.addEventListener('popstate', function () {
                patchFunctions();
                _skipPush = true;
                var path = window.location.pathname;
                var mod  = ROUTE_MODULES[path];
                if (mod) {
                    var landing = document.getElementById('landing-screen');
                    if (landing) landing.style.display = 'none';
                    _origSwitch(mod);
                } else {
                    _origLanding();
                }
                _skipPush = false;
            });

            // Delegated click handler — intercepts all internal nav <a> clicks so
            // navigation is handled via JS without a full page reload.
            document.addEventListener('click', function (e) {
                var link = e.target.closest('a[href]');
                if (!link) return;
                var href = link.getAttribute('href');
                // Only intercept same-origin relative paths that start with '/'
                if (!href || href.indexOf('//') !== -1 || href.charAt(0) !== '/') return;

                e.preventDefault();

                // Close the mobile dropdown if it's open
                if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();

                var mod = ROUTE_MODULES[href];
                if (mod) {
                    if (typeof window.switchMainModule === 'function') window.switchMainModule(mod);
                } else if (href === '/') {
                    if (typeof window.openLanding === 'function') window.openLanding();
                }
            });

            // Poll for app readiness then navigate to the module matching the URL path.
            // window._openyReady is set to true at the end of the main init sequence.
            function navigateOnReady(mod) {
                if (window._openyReady) {
                    _skipPush = true;
                    if (_origSwitch) _origSwitch(mod);
                    _skipPush = false;
                } else {
                    setTimeout(function () { navigateOnReady(mod); }, 50);
                }
            }

            document.addEventListener('DOMContentLoaded', function () {
                patchFunctions();

                var path = window.location.pathname;
                var mod  = ROUTE_MODULES[path];

                if (mod) {
                    history.replaceState({ module: mod }, '', path);
                    // Hide landing screen immediately to prevent a flash
                    var landing = document.getElementById('landing-screen');
                    if (landing) landing.style.display = 'none';
                    // Wait for the app boot sequence to complete before rendering the module
                    navigateOnReady(mod);
                } else {
                    history.replaceState({ page: 'home' }, '', '/');
                }
            });
        }());
