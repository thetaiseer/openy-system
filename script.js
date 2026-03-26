
        // ==========================================================================
        // 1. STATE & CONSTANTS
        // ==========================================================================
        const PLATFORMS_LIST = ['IG', 'Snap', 'TikTok', 'Google', 'Salla'];
        let invCustomServices = [];
        let currentInvoiceRef = null;

        const STORAGE_KEY = 'openy_quotation_editor_state'; 
        const QUOTE_COUNTER_KEY = 'openy_last_quote_num';

        // ===========================================================================
        // FIREBASE CONFIGURATION — FILL IN YOUR WEB APP CREDENTIALS BELOW
        // Steps:
        //   1. Go to Firebase Console → https://console.firebase.google.com/
        //   2. Select your project → Project Settings → General
        //   3. Under "Your apps", click "Add app" → Web (</>)
        //   4. Register the app and copy the firebaseConfig values here
        //   5. In Firebase Console → Firestore Database → Rules, set:
        //        allow read, write: if request.auth != null;
        //
        // SECURITY NOTE: Only use Firebase Web SDK config here.
        // NEVER put Admin SDK private keys or service account JSON in this file.
        // ===========================================================================
        const FIREBASE_WEB_CONFIG = {
            apiKey:            "YOUR_API_KEY",
            authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
            projectId:         "YOUR_PROJECT_ID",
            storageBucket:     "YOUR_PROJECT_ID.appspot.com",
            messagingSenderId: "YOUR_SENDER_ID",
            appId:             "YOUR_APP_ID"
        };
        // Set to true after filling in FIREBASE_WEB_CONFIG above
        const FIREBASE_ENABLED = FIREBASE_WEB_CONFIG.apiKey !== "YOUR_API_KEY";
        
        let allHistoryRecords = [];
        let allInvHistoryRecords = [];
        
        let currentEditingHistoryId = null;
        let currentEditingInvHistoryId = null;
        
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
                    "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"
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
            const records = await cloudDB.getAll('inv_history');
            let maxNum = 0;
            records.forEach(r => {
                if (r.ref && r.ref.startsWith(prefix)) {
                    const n = parseInt(r.ref.slice(prefix.length), 10);
                    if (!isNaN(n) && n > maxNum) maxNum = n;
                }
            });
            currentInvoiceRef = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
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
                localStorage.removeItem(STORAGE_KEY);
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
        };

        window.switchMainModule = function(moduleName) {
            const invMod = document.getElementById('invoice-module');
            const quoMod = document.getElementById('quotation-module');
            const ctMod = document.getElementById('contract-module');
            const ecMod = document.getElementById('empcontract-module');
            const empMod = document.getElementById('employees-module');
            const navInv = document.getElementById('nav-invoice');
            const navQuo = document.getElementById('nav-quotation');
            const navCt = document.getElementById('nav-contract');
            const navEc = document.getElementById('nav-empcontract');
            const navEmp = document.getElementById('nav-employees');

            [invMod, quoMod, ctMod, ecMod, empMod].forEach(m => { if(m) m.style.display = 'none'; });
            [navInv, navQuo, navCt, navEc, navEmp].forEach(b => { if(b) b.classList.remove('active'); });
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
            } else if (moduleName === 'employees') {
                if(empMod) empMod.style.display = 'flex';
                if(navEmp) navEmp.classList.add('active');
                setTimeout(() => {
                    if (typeof window.refreshEmployeesModule === 'function') window.refreshEmployeesModule();
                }, 80);
            }

            // Sync mobile nav active states
            ['invoice','quotation','contract','empcontract','employees'].forEach(function(m) {
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

        // ── Theme Management ──────────────────────────────────────────────────────
        (function() {
            const THEME_KEY = 'openy_theme';
            // Themes: 'light' (default) | 'dark'
            function applyTheme(theme) {
                const html = document.documentElement;
                if (theme === 'dark') {
                    html.setAttribute('data-theme', 'dark');
                } else {
                    html.removeAttribute('data-theme');
                }
                // Update all theme icon buttons
                const isDark = theme === 'dark';
                const sunPath = 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z';
                const moonPath = 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z';
                const iconPath = isDark ? sunPath : moonPath;
                const label = isDark ? 'Light Mode' : 'Dark Mode';
                ['theme-icon-nav', 'theme-icon-more'].forEach(function(id) {
                    const el = document.getElementById(id);
                    if (el) {
                        el.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="' + iconPath + '"/>';
                    }
                });
                const labelMore = document.getElementById('theme-label-more');
                if (labelMore) labelMore.textContent = label;
            }

            window.cycleTheme = function() {
                const current = localStorage.getItem(THEME_KEY) || 'light';
                const next = current === 'dark' ? 'light' : 'dark';
                localStorage.setItem(THEME_KEY, next);
                applyTheme(next);
            };

            // Init on load
            function initTheme() {
                let saved = localStorage.getItem(THEME_KEY);
                if (!saved) {
                    // Follow system preference by default
                    saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                applyTheme(saved);
            }
            initTheme();

            // Respond to system preference changes if user hasn't set a preference
            if (window.matchMedia) {
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
                    if (!localStorage.getItem(THEME_KEY)) {
                        applyTheme(e.matches ? 'dark' : 'light');
                    }
                });
            }
        }());

        // ── Bottom Glass Nav ─────────────────────────────────────────────────────
        window.setBottomNavActive = function(moduleName) {
            // moduleName: 'home' | 'invoice' | 'quotation' | 'contract' | 'empcontract' | 'employees'
            const items = ['home', 'invoice', 'quotation', 'employees', 'more'];
            items.forEach(function(id) {
                const btn = document.getElementById('bnav-' + id);
                if (btn) btn.classList.remove('active');
            });
            // Also clear more-menu active items
            ['bmore-contract', 'bmore-empcontract'].forEach(function(id) {
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
            } else if (moduleName === 'contract' || moduleName === 'empcontract') {
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
        // 4. STORAGE / DB (Robust LocalStorage + Cloud Sync)
        // ==========================================================================
        const localStore = {
            getAll(storeName) {
                try { return JSON.parse(localStorage.getItem('openy_' + storeName)) || []; } catch(e) { return []; }
            },
            put(record, storeName) {
                try {
                    let records = this.getAll(storeName);
                    const idx = records.findIndex(r => r.id === record.id);
                    if (idx > -1) records[idx] = record; else records.push(record);
                    localStorage.setItem('openy_' + storeName, JSON.stringify(records));
                } catch(e) {}
            },
            delete(id, storeName) {
                try {
                    let records = this.getAll(storeName);
                    records = records.filter(r => r.id !== id);
                    localStorage.setItem('openy_' + storeName, JSON.stringify(records));
                } catch(e) {}
            },
            clear(storeName) {
                try { localStorage.removeItem('openy_' + storeName); } catch(e) {}
            }
        };

        // All known store names – extend here when adding new document types
        const ALL_STORES = ['history', 'inv_history', 'ct_history', 'ec_history', 'employees', 'salary_history'];

        const cloudDB = {
            unsubscribers: {},
            db: null,
            _ready: false,
            async init() {
                try {
                    if (!FIREBASE_ENABLED) return; // No config provided yet
                    if (!window.FB) return;

                    const app = window.FB.initializeApp(FIREBASE_WEB_CONFIG);
                    this.db = window.FB.getFirestore(app);
                    const auth = window.FB.getAuth(app);

                    // Keep session alive across page reloads on the same browser
                    try { await window.FB.setPersistence(auth, window.FB.browserLocalPersistence); } catch(e) {}

                    // Anonymous sign-in so Firestore rules can use `request.auth != null`
                    await window.FB.signInAnonymously(auth);

                    window.FB.onAuthStateChanged(auth, async (user) => {
                        if (user) {
                            this._ready = true;
                            // Push any offline-written records to Firestore concurrently
                            await Promise.all(ALL_STORES.map(s => this.syncUp(s)));
                            // Then subscribe to live updates for each store
                            for (const s of ALL_STORES) this.setupRealtime(s);
                        } else {
                            this._ready = false;
                            ALL_STORES.forEach(s => {
                                if (this.unsubscribers[s]) { this.unsubscribers[s](); delete this.unsubscribers[s]; }
                            });
                        }
                    });
                } catch(e) { console.error("Firebase init failed:", e); }
            },
            async syncUp(storeName) {
                if (!this.db) return;
                const records = localStore.getAll(storeName);
                for (const rec of records) {
                    try {
                        const docRef = window.FB.doc(this.db, storeName, rec.id);
                        await window.FB.setDoc(docRef, rec, { merge: true });
                    } catch(e) {}
                }
            },
            setupRealtime(storeName) {
                if (!this.db) return;
                try {
                    if (this.unsubscribers[storeName]) this.unsubscribers[storeName]();
                    const colRef = window.FB.collection(this.db, storeName);
                    this.unsubscribers[storeName] = window.FB.onSnapshot(colRef, (snapshot) => {
                        const cloudRecords = snapshot.docs.map(d => d.data());
                        cloudRecords.forEach(rec => localStore.put(rec, storeName));
                        const merged = localStore.getAll(storeName);
                        if (storeName === 'history') {
                            allHistoryRecords = merged;
                            if (document.getElementById('tab-history')?.classList.contains('active')) window.renderHistoryList();
                        } else if (storeName === 'inv_history') {
                            allInvHistoryRecords = merged;
                            if (document.getElementById('inv-tab-history')?.classList.contains('active')) window.renderInvHistoryList();
                        } else if (storeName === 'ct_history') {
                            if (document.getElementById('ct-tab-history')?.classList.contains('active')) window.renderCtHistoryList();
                        } else if (storeName === 'ec_history') {
                            if (document.getElementById('ec-tab-history')?.classList.contains('active')) window.renderEcHistoryList();
                        }
                    }, (error) => console.error(`Firestore sync error for ${storeName}:`, error));
                } catch(e) { console.error(`Failed to setup realtime for ${storeName}:`, e); }
            },
            async getAll(storeName = "history") {
                return localStore.getAll(storeName);
            },
            async put(record, storeName = "history") {
                localStore.put(record, storeName); // instant local write
                if (!this.db) return;
                try {
                    const docRef = window.FB.doc(this.db, storeName, record.id);
                    await window.FB.setDoc(docRef, record);
                } catch(e) { console.error("Failed to save to Firestore:", e); }
            },
            async delete(id, storeName = "history") {
                localStore.delete(id, storeName);
                if (!this.db) return;
                try {
                    const docRef = window.FB.doc(this.db, storeName, id);
                    await window.FB.deleteDoc(docRef);
                } catch(e) { console.error("Failed to delete from Firestore:", e); }
            },
            async clear(storeName = "history") {
                localStore.clear(storeName);
                if (!this.db) return;
                try {
                    const colRef = window.FB.collection(this.db, storeName);
                    const snap = await window.FB.getDocs(colRef);
                    await Promise.all(snap.docs.map(d => window.FB.deleteDoc(d.ref)));
                } catch(e) { console.error("Failed to clear Firestore:", e); }
            }
        };

        // ==========================================================================
        // 5. APP INITIALIZATION
        // ==========================================================================
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
                
                // Silent state load
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) {
                    appState = JSON.parse(saved);
                } else {
                    document.getElementById('in-date').value = new Date().toISOString().split('T')[0];
                    document.getElementById('in-currency').value = 'EGP';
                    document.getElementById('in-final-price').value = appState.finalPrice;
                    let lastQuote = parseInt(localStorage.getItem(QUOTE_COUNTER_KEY)) || 100;
                    lastQuote++;
                    document.getElementById('in-quote-num').value = `Q-${new Date().getFullYear()}-${lastQuote}`;
                    localStorage.setItem(QUOTE_COUNTER_KEY, lastQuote.toString());
                }

                // Silent form populate
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
                
                // Unlock heavy rendering after UI has safely painted (Mobile specific fix)
                setTimeout(async () => { 
                    isAppBooting = false;
                    await initInvoiceNumber();
                    if(typeof window.updateAllocations === 'function') window.updateAllocations(); 
                    if(typeof window.saveAndRender === 'function') window.saveAndRender(); 
                    if(typeof window.adjustLayout === 'function') window.adjustLayout();
                    window.scrollTo(0, 0);
                }, 600);

            } catch(e) { console.error("Initialization error", e); }

            // Initialize Contract Modules (separate try/catch to be resilient to other errors)
            try { if (typeof initContractModules === 'function') initContractModules(); } catch(e) { console.error("Contract module init error", e); }
        });

        // Initialize Firebase safely when the module loads (Deferred)
        window.addEventListener('firebaseLoaded', async () => {
            setTimeout(async () => {
                try {
                    await cloudDB.init();
                    if(typeof window.renderHistoryList === 'function') window.renderHistoryList(); 
                    if(typeof window.renderInvHistoryList === 'function') window.renderInvHistoryList();
                    if(typeof window.renderCtHistoryList === 'function') window.renderCtHistoryList();
                    if(typeof window.renderEcHistoryList === 'function') window.renderEcHistoryList();
                } catch(e) {
                    console.warn("Cloud init error", e);
                }
            }, 1200); // Wait 1.2s before touching databases to prevent mobile thread locking
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
                parts.push(`</tbody></table><div style="display: flex; justify-content: flex-end; margin-top: 16px;"><table style="width: 300px; border-collapse: collapse;"><tr><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 14px; font-weight: bold; text-align: right; background: #111; color: #fff;">TOTAL AMOUNT:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 14px; font-weight: bold; text-align: center; background: #111; color: #fff;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr></table></div></div>`);
            } else if (data.type === 'simple') {
                parts.push(`<div class="invoice-section avoid-break"><table class="invoice-table" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead><tr style="background: #111; color: #fff;"><th class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Description</th><th class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 10px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; text-align: left;">Amount (${data.currency})</th></tr></thead>
                    <tbody>
                        <tr><td style="border: 1px solid #111; padding: 12px; font-size: 11px; text-align: left; background: #fff;">Service Fees - ${data.month}</td><td style="border: 1px solid #111; padding: 12px; font-size: 11px; text-align: left; font-weight: bold; background: #fff; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
                        <tr><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 12px; font-size: 12px; text-align: right; font-weight: bold; background: #111; color: #fff;">GRAND TOTAL:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 12px; font-size: 12px; text-align: left; font-weight: bold; background: #111; color: #fff; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
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
                    <tr><td class="no-wrap-text" style="border: 1px solid #111; border-right: 1px solid white; padding: 6px; font-size: 12px; font-weight: bold; text-align: right; background: #111; color: #fff;">GRAND TOTAL:</td><td class="no-wrap-text" style="border: 1px solid #111; padding: 6px; font-size: 12px; font-weight: bold; text-align: center; background: #111; color: #fff; white-space: nowrap;">${data.totalBudget.toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency}</td></tr>
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
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                appState = JSON.parse(saved);
            } else {
                document.getElementById('in-date').value = new Date().toISOString().split('T')[0];
                document.getElementById('in-currency').value = 'EGP';
                document.getElementById('in-final-price').value = appState.finalPrice;
                let lastQuote = parseInt(localStorage.getItem(QUOTE_COUNTER_KEY)) || 100;
                lastQuote++;
                document.getElementById('in-quote-num').value = `Q-${new Date().getFullYear()}-${lastQuote}`;
                localStorage.setItem(QUOTE_COUNTER_KEY, lastQuote.toString());
            }
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
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
            
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
                await html2pdf().set(opt).from(element).save();
                showToast("PDF Downloaded successfully!");
                
                const _now = new Date();
                const record = {
                    id: Date.now().toString(),
                    client: appState['client-name'],
                    ref: appState['quote-num'],
                    date: appState.date,
                    amount: appState.finalPrice,
                    currency: appState.currency,
                    status: 'unpaid',
                    timestamp: Date.now(),
                    type: 'quote',
                    year: _now.getFullYear(),
                    month: _now.getMonth() + 1,
                    day: _now.getDate(),
                    source: 'web'
                };
                await cloudDB.put(record, 'history');
            } catch (e) {
                console.error(e);
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
                saveAs(blob, filename);
                showToast("Excel Downloaded successfully!");
                
                const _now2 = new Date();
                const record = {
                    id: Date.now().toString(),
                    client: appState['client-name'],
                    ref: appState['quote-num'],
                    date: appState.date,
                    amount: appState.finalPrice,
                    currency: appState.currency,
                    status: 'unpaid',
                    timestamp: Date.now(),
                    type: 'quote',
                    year: _now2.getFullYear(),
                    month: _now2.getMonth() + 1,
                    day: _now2.getDate(),
                    source: 'web'
                };
                await cloudDB.put(record, 'history');
            } catch (e) {
                console.error(e);
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
                await html2pdf().set(opt).from(element).save();
                showToast("Invoice PDF Downloaded!");
                
                const _now3 = new Date();
                const record = {
                    id: Date.now().toString(),
                    client: invoiceData.client,
                    ref: invoiceRef,
                    date: invoiceData.invoiceDate,
                    amount: invoiceData.totalBudget,
                    currency: invoiceData.currency,
                    status: 'unpaid',
                    timestamp: Date.now(),
                    type: 'invoice',
                    year: _now3.getFullYear(),
                    month: _now3.getMonth() + 1,
                    day: _now3.getDate(),
                    source: 'web'
                };
                await cloudDB.put(record, 'inv_history');
                await initInvoiceNumber();
                if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
            } catch (e) {
                console.error(e);
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
                saveAs(blob, filename);
                showToast("Invoice Excel Downloaded!");

                const _now4 = new Date();
                const record = {
                    id: Date.now().toString(),
                    client: invoiceData.client,
                    ref: invoiceRef,
                    date: invoiceData.invoiceDate,
                    amount: invoiceData.totalBudget,
                    currency: invoiceData.currency,
                    status: 'unpaid',
                    timestamp: Date.now(),
                    type: 'invoice',
                    year: _now4.getFullYear(),
                    month: _now4.getMonth() + 1,
                    day: _now4.getDate(),
                    source: 'web'
                };
                await cloudDB.put(record, 'inv_history');
                await initInvoiceNumber();
                if (typeof window.debouncedUpdateAllocations === 'function') window.debouncedUpdateAllocations();
            } catch (e) {
                console.error(e);
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
            const canToggle = ['history', 'inv_history'].includes(storeName);
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

            const allRecords = await cloudDB.getAll('history');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchStatus = currentHistoryFilter === 'all' || r.status === currentHistoryFilter;
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
            _renderHistoryRecords(records, 'history', container, sortVal);
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

            const allRecords = await cloudDB.getAll('inv_history');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('inv-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchStatus = currentInvHistoryFilter === 'all' || r.status === currentInvHistoryFilter;
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
            _renderHistoryRecords(records, 'inv_history', container, sortVal);
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

            const allRecords = await cloudDB.getAll('ct_history');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('ct-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                const matchStatus = !filterStatus || r.status === filterStatus;
                return matchSearch && matchClient && matchYear && matchMonth && matchDay && matchStatus;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'ct-hist-stat-total', active:'ct-hist-stat-active', draft:'ct-hist-stat-draft', expired:'ct-hist-stat-expired', value:'ct-hist-stat-value'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'ct_history', container, sortVal);
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

            const allRecords = await cloudDB.getAll('ec_history');

            const uniqueClients = [...new Set(allRecords.map(r => r.client).filter(Boolean))].sort();
            _populateHistorySelect('ec-history-filter-client', uniqueClients, 'All Clients');

            let records = allRecords.filter(r => {
                const matchSearch = !searchVal || (r.client?.toLowerCase().includes(searchVal) || r.ref?.toLowerCase().includes(searchVal));
                const matchClient = !filterClient || r.client === filterClient;
                const matchYear = !filterYear || String(r.year || new Date(r.timestamp || 0).getFullYear()) === filterYear;
                const matchMonth = !filterMonth || String(r.month || (new Date(r.timestamp || 0).getMonth() + 1)) === filterMonth;
                const matchDay = !filterDay || String(r.day || new Date(r.timestamp || 0).getDate()) === filterDay;
                const matchStatus = !filterStatus || r.status === filterStatus;
                return matchSearch && matchClient && matchYear && matchMonth && matchDay && matchStatus;
            });
            records = _sortHistoryRecords(records, sortVal);

            _updateHistorySummary(records, {total:'ec-hist-stat-total', active:'ec-hist-stat-active', draft:'ec-hist-stat-draft', expired:'ec-hist-stat-expired'});
            container.innerHTML = '';
            if (records.length === 0) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
            if (emptyEl) emptyEl.classList.add('hidden');
            _renderHistoryRecords(records, 'ec_history', container, sortVal);
        };

        window.toggleStatus = async function(id, storeName, currentStatus) {
            const records = await cloudDB.getAll(storeName);
            const record = records.find(r => r.id === id);
            if (record) {
                record.status = currentStatus === 'paid' ? 'unpaid' : 'paid';
                await cloudDB.put(record, storeName);
                if (storeName === 'history') window.renderHistoryList();
                else if (storeName === 'inv_history') window.renderInvHistoryList();
            }
        };

        window.deleteRecord = async function(id, storeName) {
            window.openConfirmModal("Delete Record", "Are you sure you want to delete this record? This action cannot be undone.", async () => {
                await cloudDB.delete(id, storeName);
                if (storeName === 'history') window.renderHistoryList();
                else if (storeName === 'inv_history') window.renderInvHistoryList();
                else if (storeName === 'ct_history') window.renderCtHistoryList();
                else if (storeName === 'ec_history') window.renderEcHistoryList();
                showToast("Record deleted.");
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


        window.clearHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Quotation records?", async () => {
                await cloudDB.clear('history');
                window.renderHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearInvHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Invoice records?", async () => {
                await cloudDB.clear('inv_history');
                window.renderInvHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearCtHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Contract records?", async () => {
                await cloudDB.clear('ct_history');
                window.renderCtHistoryList();
                showToast("History cleared.");
            });
        };

        window.clearEcHistory = async function() {
            window.openConfirmModal("Clear History", "Are you sure you want to clear all Employee Contract records?", async () => {
                await cloudDB.clear('ec_history');
                window.renderEcHistoryList();
                showToast("History cleared.");
            });
        };

        window.exportBackup = async function() {
            const records = await cloudDB.getAll('history');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_quote_backup.json");
            dlAnchorElem.click();
        };

        window.exportInvBackup = async function() {
            const records = await cloudDB.getAll('inv_history');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_inv_backup.json");
            dlAnchorElem.click();
        };

        window.exportCtBackup = async function() {
            const records = await cloudDB.getAll('ct_history');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "openy_contract_backup.json");
            dlAnchorElem.click();
        };

        window.exportEcBackup = async function() {
            const records = await cloudDB.getAll('ec_history');
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
                            await cloudDB.put(item, 'history');
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
                            await cloudDB.put(item, 'inv_history');
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
                        for (const item of data) await cloudDB.put(item, 'ct_history');
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
                        for (const item of data) await cloudDB.put(item, 'ec_history');
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
                { id: _cid(), title: 'التمهيد', text: 'بناءً على رغبة الطرفين في التعاون المثمر وتحقيق المصالح المشتركة، فقد اتفق الطرف الأول (الشركة) والطرف الثاني (العميل) على إبرام هذا العقد بالشروط والأحكام الواردة أدناه، وذلك اعتباراً من تاريخ التوقيع عليه.' },
                { id: _cid(), title: 'موضوع العقد', text: 'يتعهد الطرف الأول بتقديم خدمات التسويق الرقمي المتكاملة للطرف الثاني، وتشمل هذه الخدمات الخدمات المنصوص عليها في هذا العقد، وذلك وفقاً للمواصفات والمعايير المتفق عليها ومستوى الجودة المطلوب.' },
                { id: _cid(), title: 'نطاق العمل والخدمات', text: 'يقدم الطرف الأول خدمات التسويق الرقمي المشمولة في هذا العقد، بما يتضمن التخطيط والتنفيذ والإشراف على جميع الأنشطة التسويقية الرقمية المتفق عليها، وذلك وفقاً للخطة المعتمدة من الطرفين.' },
                { id: _cid(), title: 'مدة العقد', text: 'تسري أحكام هذا العقد اعتباراً من تاريخ توقيعه ولمدة محددة في بيانات العقد، وفي حال رغبة أي من الطرفين في إنهاء العقد أو تجديده، يتعين إخطار الطرف الآخر كتابياً قبل انتهاء مدة العقد بثلاثين (30) يوم عمل على الأقل.' },
                { id: _cid(), title: 'المقابل المالي', text: 'مقابل الخدمات المقدمة، يلتزم الطرف الثاني بدفع القيمة الإجمالية للعقد المنصوص عليها في التفاصيل المالية من هذا العقد، شاملاً جميع الخدمات المتفق عليها.' },
                { id: _cid(), title: 'آلية السداد', text: 'يتم السداد وفقاً لطريقة الدفع والشروط المحددة في التفاصيل المالية من هذا العقد. تُعدّ المدفوعات مستحقة في مواعيدها المحددة، وأي تأخير في السداد يُخضع الطرف الثاني لأحكام البند الخاص بالتأخير في هذا العقد.' },
                { id: _cid(), title: 'التأخير في السداد', text: 'في حال التأخر في سداد أي دفعة في موعدها المحدد، يحق للطرف الأول تعليق تقديم الخدمات حتى يتم استيفاء المبلغ المستحق بالكامل، مع الاحتفاظ بحق المطالبة بالتعويض عن أي أضرار ناجمة عن هذا التأخير.' },
                { id: _cid(), title: 'التزامات الطرف الأول', text: 'يلتزم الطرف الأول بتقديم الخدمات المتفق عليها بأعلى معايير الجودة المهنية، والحفاظ على سرية معلومات الطرف الثاني، وتقديم التقارير الدورية حول الأداء والنتائج في المواعيد المحددة.' },
                { id: _cid(), title: 'التزامات الطرف الثاني', text: 'يلتزم الطرف الثاني بتزويد الطرف الأول بجميع المعلومات والمواد اللازمة لتنفيذ الخدمات في الوقت المناسب، والالتزام بمواعيد السداد المتفق عليها، وعدم التعامل مع طرف ثالث لتقديم نفس الخدمات المشمولة في هذا العقد خلال مدة سريانه.' },
                { id: _cid(), title: 'التعديلات', text: 'لا يجوز إجراء أي تعديل على بنود هذا العقد إلا بموافقة كتابية مسبقة من كلا الطرفين، وتُعدّ التعديلات المتفق عليها ملحقاً رسمياً للعقد وجزءاً لا يتجزأ منه.' },
                { id: _cid(), title: 'الأعمال الإضافية', text: 'أي أعمال أو خدمات تطلبها الطرف الثاني وتتجاوز النطاق المحدد في هذا العقد تُعدّ أعمالاً إضافية، وتستوجب إعداد ملحق اتفاقية منفصل يحدد طبيعة هذه الأعمال والتكلفة الإضافية المترتبة عليها.' },
                { id: _cid(), title: 'الملكية الفكرية', text: 'تنتقل ملكية جميع المواد الإبداعية والمحتوى المنتج في إطار هذا العقد إلى الطرف الثاني فور استيفاء قيمة العقد بالكامل. يحتفظ الطرف الأول بحق الإشارة إلى هذه الأعمال في محفظته المهنية ما لم يُتفق على خلاف ذلك كتابياً.' },
                { id: _cid(), title: 'السرية وعدم الإفصاح', text: 'يلتزم كلا الطرفين بالحفاظ على سرية جميع المعلومات التجارية والاستراتيجية المتبادلة في إطار تنفيذ هذا العقد، وعدم الإفصاح عنها لأي طرف ثالث دون موافقة كتابية مسبقة. يظل هذا الالتزام سارياً لمدة ثلاث (3) سنوات بعد انتهاء العقد.' },
                { id: _cid(), title: 'حدود المسؤولية', text: 'لا يتحمل الطرف الأول المسؤولية عن أي خسائر أو أضرار غير مباشرة أو ناجمة عن ظروف خارج نطاق سيطرته. تقتصر مسؤولية الطرف الأول على قيمة الخدمات المقدمة فعلياً في حال ثبوت الإخلال بالتزاماته التعاقدية.' },
                { id: _cid(), title: 'إنهاء العقد', text: 'يحق لأي من الطرفين إنهاء هذا العقد قبل انتهاء مدته في حالة إخلال الطرف الآخر بالتزاماته الجوهرية، وعدم تداركه لهذا الإخلال خلال خمسة عشر (15) يوم عمل من تاريخ الإخطار الكتابي. في حال الإنهاء المبكر من قبل الطرف الثاني دون مبرر مقبول، يستحق الطرف الأول تعويضاً يعادل ثلاثة أشهر من قيمة العقد.' },
                { id: _cid(), title: 'القوة القاهرة', text: 'لا يُعدّ أي من الطرفين مخلاً بالتزاماته التعاقدية إذا كان الإخلال ناجماً عن أسباب خارجة عن إرادته كالكوارث الطبيعية والأوبئة والحروب والقرارات الحكومية. يلتزم الطرف المتأثر بالإخطار الفوري للطرف الآخر.' },
                { id: _cid(), title: 'الإشعارات والمراسلات', text: 'تُوجّه جميع الإشعارات والمراسلات الرسمية بين الطرفين كتابياً إلى عناوين البريد الإلكتروني أو العناوين البريدية المحددة في هذا العقد، وتُعدّ مُستلمة خلال (48) ساعة من إرسالها.' },
                { id: _cid(), title: 'القانون الواجب التطبيق', text: 'يخضع هذا العقد لأحكام القانون المعمول به في جمهورية مصر العربية، وفي حال نشوء أي نزاع يتعلق بتفسير أو تنفيذ هذا العقد، يسعى الطرفان أولاً إلى تسويته وداً، وإن تعذر ذلك يُلجأ إلى القضاء المختص في مصر.' },
                { id: _cid(), title: 'الإقرار', text: 'يقرّ الطرفان بأنهما قرأا هذا العقد وفهما جميع بنوده وشروطه، وأنهما يوقّعانه طوعاً دون أي إكراه أو ضغط، وأن الممثل عن كل طرف مخوّل قانونياً بالتوقيع نيابة عنه.' }
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
                { id: _cid(), title: 'التعيين', text: 'يُعيَّن الموظف في الوظيفة المحددة في بيانات العقد ابتداءً من تاريخ بدء العمل المنصوص عليه، وذلك خاضعاً للشروط والأحكام الواردة في هذا العقد ولوائح الشركة الداخلية المعمول بها.' },
                { id: _cid(), title: 'فترة التجربة', text: 'تسري على الموظف فترة اختبار محددة في بيانات العقد، وخلال هذه الفترة يحق لأي من الطرفين إنهاء عقد العمل بإشعار كتابي مسبق مدته أسبوعان (14) يوماً، دون الحاجة إلى تبرير.' },
                { id: _cid(), title: 'الراتب', text: 'يتقاضى الموظف راتباً شهرياً إجمالياً كما هو محدد في تفاصيل التوظيف، ويُراجع هذا الراتب سنوياً وفقاً لتقييم الأداء وسياسات الشركة. يُمثل هذا الراتب التعويض الكامل للموظف عن جميع ساعات العمل المعتادة.' },
                { id: _cid(), title: 'ساعات العمل', text: 'تكون ساعات العمل المعتادة كما هو محدد في هذا العقد. قد يُطلب من الموظف في بعض الأحيان العمل لساعات إضافية وفقاً لمتطلبات العمل، وذلك بالتنسيق مع مديره المباشر ووفق السياسات المعتمدة.' },
                { id: _cid(), title: 'الإجازات', text: 'يستحق الموظف الإجازات المنصوص عليها في هذا العقد وفقاً للسياسة المعتمدة في الشركة. تُطلب الإجازات مسبقاً وتُعتمد من المدير المباشر وفق احتياجات العمل.' },
                { id: _cid(), title: 'السرية', text: 'يلتزم الموظف بالحفاظ على سرية جميع المعلومات التجارية والمالية والتشغيلية التي يطّلع عليها بحكم عمله، وعدم الإفصاح عنها لأي طرف خارجي. يستمر هذا الالتزام لمدة ثلاث (3) سنوات بعد انتهاء العلاقة الوظيفية.' },
                { id: _cid(), title: 'عدم المنافسة', text: 'يلتزم الموظف خلال فترة عمله في الشركة وبعد انتهاء عقده بمدة سنة كاملة بعدم العمل لدى أو تقديم استشارات لأي منشأة منافسة مباشرة، وعدم إقامة مشروع يتنافس مع نشاط الشركة الرئيسي.' },
                { id: _cid(), title: 'السلوك الوظيفي', text: 'يلتزم الموظف بالانضباط المهني والالتزام بمواعيد العمل وقواعد السلوك المهني، واحترام الزملاء والعملاء، والحفاظ على سمعة الشركة، وتطبيق السياسات والإجراءات المعتمدة في كل الأوقات.' },
                { id: _cid(), title: 'الجزاءات', text: 'في حال مخالفة الموظف للوائح والأنظمة الداخلية، تُطبق عليه الجزاءات التأديبية المقررة وفقاً لسياسة الشركة، بدءاً من التنبيه الكتابي وصولاً إلى الفصل من الخدمة حسب جسامة المخالفة.' },
                { id: _cid(), title: 'إنهاء العقد', text: 'يحق لأي من الطرفين إنهاء هذا العقد بإشعار كتابي مسبق وفق المدة المنصوص عليها. يحق للشركة الإنهاء الفوري في حالات الإخلال الجسيم أو السلوك المخالف لأخلاقيات المهنة دون الحاجة لفترة إشعار.' },
                { id: _cid(), title: 'التعويضات', text: 'عند انتهاء خدمة الموظف، تُحتسب مستحقاته النهائية وفقاً للقانون المعمول به وسياسة الشركة، شاملةً أي إجازات مستحقة ومكافآت متفق عليها، وذلك بعد تسوية أي التزامات مالية متبادلة.' },
                { id: _cid(), title: 'فترة الإخطار', text: 'يلتزم كلا الطرفين بتقديم إشعار كتابي مسبق وفق المدة المتفق عليها في حال رغبة أي منهما في إنهاء العقد. في حال عدم الالتزام بفترة الإخطار، يحق للطرف المتضرر المطالبة بتعويض مالي مناسب.' },
                { id: _cid(), title: 'القانون المنظم', text: 'يخضع هذا العقد لأحكام قانون العمل والقوانين المعمول بها في جمهورية مصر العربية، وفي حال نشوء أي نزاع، يسعى الطرفان إلى حله ودياً أولاً، ثم عبر القنوات القانونية المختصة.' }
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
                await html2pdf().set(opt).from(element).save();
                showToast('PDF Downloaded successfully!');
                // Save record to Firebase history
                const _nowCt = new Date();
                const ctRecord = {
                    id: Date.now().toString(),
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
                    source: 'web'
                };
                await cloudDB.put(ctRecord, isEmp ? 'ec_history' : 'ct_history');
            } catch (e) {
                console.error(e);
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
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename; a.click();
                URL.revokeObjectURL(url);
                showToast('Word document downloaded!');
                // Save record to Firebase history
                const _nowCtW = new Date();
                const ctWRecord = {
                    id: Date.now().toString(),
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
                    source: 'web'
                };
                await cloudDB.put(ctWRecord, isEmp ? 'ec_history' : 'ct_history');
            } catch(e) {
                console.error(e);
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
            localStorage.setItem('openy_lang', lang);
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
            const map = { 'Active': 'active', 'On Leave': 'onleave', 'Resigned': 'resigned', 'Terminated': 'terminated', 'Archived': 'archived' };
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
            const salaryHistory = localStore.getAll('salary_history');
            const active = employees.filter(e => e.status === 'Active');
            const onLeave = employees.filter(e => e.status === 'On Leave');
            const inactive = employees.filter(e => ['Archived', 'Resigned', 'Terminated'].includes(e.status));
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
            const filterDept = document.getElementById('emp-filter-dept')?.value || '';
            const filterStatus = document.getElementById('emp-filter-status')?.value || '';
            const filterType = document.getElementById('emp-filter-type')?.value || '';

            // Populate dept filter
            const deptSelect = document.getElementById('emp-filter-dept');
            if (deptSelect) {
                const depts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
                const currentVal = deptSelect.value;
                deptSelect.innerHTML = '<option value="">All Departments</option>' + depts.map(d => `<option value="${d}"${d === currentVal ? ' selected' : ''}>${d}</option>`).join('');
            }

            // Populate dept datalist for form
            const datalist = document.getElementById('emp-dept-datalist');
            if (datalist) {
                const depts = [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
                datalist.innerHTML = depts.map(d => `<option value="${d}">`).join('');
            }

            let filtered = employees.filter(e => {
                if (search && !`${e.fullName} ${e.employeeId} ${e.jobTitle} ${e.department} ${e.phone} ${e.email}`.toLowerCase().includes(search)) return false;
                if (filterDept && e.department !== filterDept) return false;
                if (filterStatus && e.status !== filterStatus) return false;
                if (filterType && e.employmentType !== filterType) return false;
                return true;
            });

            // Sort: active first, then by hire date desc
            filtered.sort((a, b) => {
                const statusOrder = ['Active', 'On Leave', 'Resigned', 'Terminated', 'Archived'];
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
            const salaryHistory = localStore.getAll('salary_history');
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();

            const active = employees.filter(e => e.status === 'Active');
            const allActive = employees.filter(e => ['Active', 'On Leave'].includes(e.status));
            const totalMonthly = allActive.reduce((s, e) => s + (parseFloat(e.currentSalary) || 0), 0);
            const totalAnnual = totalMonthly * 12;
            const activeOnly = active.reduce((s, e) => s + (parseFloat(e.currentSalary) || 0), 0);
            const incMonth = salaryHistory.filter(s => { const d = new Date(s.effectiveDate); return d.getMonth() === thisMonth && d.getFullYear() === thisYear && s.changeType === 'Increase'; })
                .reduce((s, r) => s + Math.abs(parseFloat(r.changeAmount) || 0), 0);
            const incYear = salaryHistory.filter(s => { const d = new Date(s.effectiveDate); return d.getFullYear() === thisYear && s.changeType === 'Increase'; })
                .reduce((s, r) => s + Math.abs(parseFloat(r.changeAmount) || 0), 0);

            const currency = active[0]?.currency || allActive[0]?.currency || 'EGP';
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
                // Show all non-archived employees sorted by department then name
                const payrollEmps = [...employees]
                    .filter(e => !['Archived'].includes(e.status))
                    .sort((a, b) => {
                        const dCmp = (a.department || '').localeCompare(b.department || '');
                        return dCmp !== 0 ? dCmp : (a.fullName || '').localeCompare(b.fullName || '');
                    });
                if (payrollEmps.length === 0) {
                    tbody2.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:#94A3B8;">No employees found.</td></tr>';
                    if (tfoot) tfoot.innerHTML = '';
                } else {
                    // Group totals by currency to handle mixed-currency payrolls
                    const currencyTotals = {};
                    tbody2.innerHTML = payrollEmps.map(e => {
                        const base = parseFloat(e.currentSalary) || 0;
                        const allowances = parseFloat(e.allowances) || 0;
                        const bonuses = parseFloat(e.bonuses) || 0;
                        const monthlyCost = base + allowances + bonuses;
                        const cur = e.currency || 'EGP';
                        if (!currencyTotals[cur]) currencyTotals[cur] = { base: 0, allowances: 0, bonuses: 0, cost: 0, count: 0 };
                        currencyTotals[cur].base += base;
                        currencyTotals[cur].allowances += allowances;
                        currencyTotals[cur].bonuses += bonuses;
                        currencyTotals[cur].cost += monthlyCost;
                        currencyTotals[cur].count++;
                        const isActive = e.status === 'Active';
                        return `<tr style="${!isActive ? 'opacity:0.6;' : ''}">
                            <td class="emp-name">${e.fullName}</td>
                            <td>${e.department || '—'}</td>
                            <td>${e.jobTitle || '—'}</td>
                            <td>${empStatusBadge(e.status)}</td>
                            <td style="font-weight:600;">${empFmtCurrency(base, cur)}</td>
                            <td style="color:#059669;">${allowances > 0 ? empFmtCurrency(allowances, cur) : '—'}</td>
                            <td style="color:#7C3AED;">${bonuses > 0 ? empFmtCurrency(bonuses, cur) : '—'}</td>
                            <td style="font-weight:800;color:#0F172A;">${empFmtCurrency(monthlyCost, cur)}</td>
                        </tr>`;
                    }).join('');
                    if (tfoot) {
                        const currencies = Object.keys(currencyTotals);
                        tfoot.innerHTML = currencies.map((cur, i) => {
                            const t = currencyTotals[cur];
                            const label = currencies.length > 1
                                ? `Total — ${cur} (${t.count} employee${t.count !== 1 ? 's' : ''})`
                                : `Total (${payrollEmps.length} employee${payrollEmps.length !== 1 ? 's' : ''})`;
                            return `<tr style="background:#F8FAFC;border-top:${i === 0 ? '2px' : '1px'} solid #E2E8F0;">
                                <td colspan="4" style="font-weight:700;color:#0F172A;padding:10px 12px;">${label}</td>
                                <td style="font-weight:700;">${empFmtCurrency(t.base, cur)}</td>
                                <td style="font-weight:700;color:#059669;">${empFmtCurrency(t.allowances, cur)}</td>
                                <td style="font-weight:700;color:#7C3AED;">${empFmtCurrency(t.bonuses, cur)}</td>
                                <td style="font-weight:800;color:#2563EB;">${empFmtCurrency(t.cost, cur)}</td>
                            </tr>`;
                        }).join('');
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
            ['ef-fullName','ef-employeeId','ef-nationalId','ef-phone','ef-email','ef-dob','ef-nationality','ef-address',
             'ef-jobTitle','ef-department','ef-manager','ef-workLocation','ef-probation','ef-workDays','ef-dailyHours',
             'ef-currentSalary','ef-allowances','ef-bonuses','ef-linkedContractId','ef-linkedContractNumber','ef-contractDuration','ef-salaryNote'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('ef-maritalStatus').value = '';
            document.getElementById('ef-employmentType').value = 'Full-time';
            document.getElementById('ef-status').value = 'Active';
            document.getElementById('ef-currency').value = 'EGP';
            document.getElementById('ef-paymentMethod').value = 'Bank Transfer';
            document.getElementById('ef-payrollCycle').value = 'Monthly';
            document.getElementById('ef-hireDate').value = new Date().toISOString().split('T')[0];
            // Auto-generate ID
            const existing = localStore.getAll('employees');
            document.getElementById('ef-employeeId').value = empGenerateId(existing);
            // Show salary note for new employee
            const noteWrap = document.getElementById('ef-salary-note-wrap');
            if (noteWrap) noteWrap.style.display = '';
            // Populate contract datalist
            _populateContractDatalist();
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
            sv('ef-nationalId', emp.nationalId);
            sv('ef-phone', emp.phone);
            sv('ef-email', emp.email);
            sv('ef-dob', emp.dob);
            sv('ef-nationality', emp.nationality);
            sv('ef-maritalStatus', emp.maritalStatus);
            sv('ef-address', emp.address);
            sv('ef-jobTitle', emp.jobTitle);
            sv('ef-department', emp.department);
            sv('ef-manager', emp.manager);
            sv('ef-employmentType', emp.employmentType);
            sv('ef-hireDate', emp.hireDate);
            sv('ef-status', emp.status);
            sv('ef-workLocation', emp.workLocation);
            sv('ef-probation', emp.probation);
            sv('ef-workDays', emp.workDays);
            sv('ef-dailyHours', emp.dailyHours);
            sv('ef-currentSalary', emp.currentSalary);
            sv('ef-currency', emp.currency);
            sv('ef-paymentMethod', emp.paymentMethod);
            sv('ef-payrollCycle', emp.payrollCycle);
            sv('ef-allowances', emp.allowances);
            sv('ef-bonuses', emp.bonuses);
            sv('ef-linkedContractId', emp.linkedContractId);
            sv('ef-linkedContractNumber', emp.linkedContractNumber);
            sv('ef-contractDuration', emp.contractDuration);
            // Hide salary note on edit (use salary adjustment for that)
            const noteWrap = document.getElementById('ef-salary-note-wrap');
            if (noteWrap) noteWrap.style.display = 'none';
            _populateContractDatalist();
            document.getElementById('emp-form-modal').classList.remove('hidden');
        };

        window.closeEmpFormModal = function() {
            document.getElementById('emp-form-modal').classList.add('hidden');
            empCurrentEditId = null;
        };

        window.saveEmployee = async function() {
            const fullName = document.getElementById('ef-fullName').value.trim();
            if (!fullName) { showToast('Full Name is required.'); return; }
            const hireDate = document.getElementById('ef-hireDate').value;
            if (!hireDate) { showToast('Hire Date is required.'); return; }
            const currentSalary = parseFloat(document.getElementById('ef-currentSalary').value) || 0;

            const isNew = !empCurrentEditId;
            const existingId = document.getElementById('emp-form-id').value;
            const id = isNew ? ('emp-' + Date.now() + '-' + Math.floor(Math.random() * 10000)) : existingId;

            const emp = {
                id,
                employeeId: document.getElementById('ef-employeeId').value.trim(),
                fullName,
                nationalId: document.getElementById('ef-nationalId').value.trim(),
                phone: document.getElementById('ef-phone').value.trim(),
                email: document.getElementById('ef-email').value.trim(),
                dob: document.getElementById('ef-dob').value,
                nationality: document.getElementById('ef-nationality').value.trim(),
                maritalStatus: document.getElementById('ef-maritalStatus').value,
                address: document.getElementById('ef-address').value.trim(),
                jobTitle: document.getElementById('ef-jobTitle').value.trim(),
                department: document.getElementById('ef-department').value.trim(),
                manager: document.getElementById('ef-manager').value.trim(),
                employmentType: document.getElementById('ef-employmentType').value,
                hireDate,
                status: document.getElementById('ef-status').value,
                workLocation: document.getElementById('ef-workLocation').value.trim(),
                probation: document.getElementById('ef-probation').value,
                workDays: document.getElementById('ef-workDays').value.trim(),
                dailyHours: document.getElementById('ef-dailyHours').value,
                currentSalary,
                currency: document.getElementById('ef-currency').value,
                paymentMethod: document.getElementById('ef-paymentMethod').value,
                payrollCycle: document.getElementById('ef-payrollCycle').value,
                allowances: parseFloat(document.getElementById('ef-allowances').value) || 0,
                bonuses: parseFloat(document.getElementById('ef-bonuses').value) || 0,
                linkedContractId: document.getElementById('ef-linkedContractId').value.trim(),
                linkedContractNumber: document.getElementById('ef-linkedContractNumber').value.trim(),
                contractDuration: parseInt(document.getElementById('ef-contractDuration').value, 10) || 0,
                updatedAt: new Date().toISOString(),
                createdAt: isNew ? new Date().toISOString() : (localStore.getAll('employees').find(e => e.id === id)?.createdAt || new Date().toISOString())
            };

            // If new employee and salary > 0, create initial salary history entry
            if (isNew && currentSalary > 0) {
                const note = document.getElementById('ef-salaryNote').value.trim() || 'Starting salary at hire';
                const sh = {
                    id: 'sh-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
                    employeeId: id,
                    oldSalary: 0,
                    newSalary: currentSalary,
                    changeAmount: currentSalary,
                    changeType: 'Increase',
                    effectiveDate: hireDate,
                    note,
                    createdAt: new Date().toISOString()
                };
                await cloudDB.put(sh, 'salary_history');
            }

            // If editing and salary changed, record salary history
            if (!isNew) {
                const oldEmp = localStore.getAll('employees').find(e => e.id === id);
                const oldSalary = parseFloat(oldEmp?.currentSalary) || 0;
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
                    await cloudDB.put(sh, 'salary_history');
                }
            }

            await cloudDB.put(emp, 'employees');
            window.closeEmpFormModal();
            window.refreshEmployeesModule();
            showToast(isNew ? 'Employee added ✓' : 'Employee updated ✓');
        };

        // ── Contract Datalist ──
        function _populateContractDatalist() {
            const contracts = localStore.getAll('ec_history');
            const dl = document.getElementById('emp-contract-datalist');
            if (!dl) return;
            dl.innerHTML = contracts.map(c => `<option value="${c.id}" data-ref="${c.ref || ''}">${c.ref || c.id} — ${c.client || ''}</option>`).join('');
        }

        window.onContractSearch = function(val) {
            const contracts = localStore.getAll('ec_history');
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
            const salaryHistory = localStore.getAll('salary_history').filter(s => s.employeeId === id).sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate));

            const pf = (label, val) => `<div class="emp-profile-field"><label>${label}</label><p>${val || '—'}</p></div>`;

            let contractSection = '';
            if (emp.linkedContractNumber) {
                contractSection = `
                    <div class="emp-profile-field col-span-2">
                        <label>Linked Contract</label>
                        <p style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span class="emp-contract-linked"
                                onclick="window.openLinkedContract('${emp.linkedContractId || ''}', '${id}')"
                                title="View & Download HR Contract">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:13px;height:13px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                ${emp.linkedContractNumber}
                            </span>
                            <button onclick="window.openLinkedContract('${emp.linkedContractId || ''}', '${id}')" class="ui-button" style="font-size:0.75rem;padding:3px 10px;background:rgba(37,99,235,0.08);color:#2563EB;border:1px solid rgba(37,99,235,0.2);">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:12px;height:12px;display:inline;margin-right:3px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                View / Download
                            </button>
                        </p>
                    </div>`;
            } else {
                contractSection = `<div class="emp-profile-field col-span-2"><label>Linked Contract</label><p class="emp-no-contract">No contract linked</p></div>`;
            }

            const content = document.getElementById('emp-profile-content');
            if (content) {
                content.innerHTML = `
                    <!-- Header -->
                    <div style="display:flex;align-items:center;gap:1rem;padding:0.5rem 0 1.25rem;border-bottom:1px solid #F1F5F9;margin-bottom:1.25rem;">
                        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#2563EB);display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.25rem;font-weight:800;flex-shrink:0;">${empInitials(emp.fullName)}</div>
                        <div>
                            <div style="font-size:1.15rem;font-weight:800;color:#0F172A;">${emp.fullName}</div>
                            <div style="font-size:0.83rem;color:#64748B;">${emp.jobTitle || ''}${emp.department ? ' · ' + emp.department : ''}</div>
                            <div style="margin-top:4px;">${empStatusBadge(emp.status)} <span style="font-size:0.75rem;color:#94A3B8;margin-left:6px;">ID: ${emp.employeeId || '—'}</span></div>
                        </div>
                    </div>

                    <!-- Basic Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Basic Info</div>
                        <div class="emp-profile-grid">
                            ${pf('Phone', emp.phone)}
                            ${pf('Email', emp.email)}
                            ${pf('Nationality', emp.nationality)}
                            ${pf('Marital Status', emp.maritalStatus)}
                            ${pf('Date of Birth', empFmtDate(emp.dob))}
                            ${pf('National ID', emp.nationalId)}
                            <div class="emp-profile-field col-span-2">${pf('Address', emp.address)}</div>
                        </div>
                    </div>

                    <!-- Job Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Job Info</div>
                        <div class="emp-profile-grid">
                            ${pf('Job Title', emp.jobTitle)}
                            ${pf('Department', emp.department)}
                            ${pf('Direct Manager', emp.manager)}
                            ${pf('Employment Type', emp.employmentType)}
                            ${pf('Hire Date', empFmtDate(emp.hireDate))}
                            ${pf('Probation Period', emp.probation ? emp.probation + ' months' : '—')}
                            ${pf('Work Location', emp.workLocation)}
                            ${pf('Work Days', emp.workDays)}
                            ${pf('Daily Hours', emp.dailyHours ? emp.dailyHours + ' hrs' : '—')}
                        </div>
                    </div>

                    <!-- Salary Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Salary Info</div>
                        <div class="emp-profile-grid">
                            ${pf('Current Salary', `<strong style="font-size:1.05rem;">${empFmtCurrency(emp.currentSalary, emp.currency)}</strong>`)}
                            ${pf('Currency', emp.currency)}
                            ${pf('Payment Method', emp.paymentMethod)}
                            ${pf('Payroll Cycle', emp.payrollCycle)}
                            ${pf('Allowances', empFmtCurrency(emp.allowances, emp.currency))}
                            ${pf('Bonuses', empFmtCurrency(emp.bonuses, emp.currency))}
                            ${pf('Last Updated', empFmtDate(emp.updatedAt?.split('T')[0]))}
                        </div>
                    </div>

                    <!-- Contract Info -->
                    <div class="emp-profile-section">
                        <div class="emp-profile-section-title">Contract Info</div>
                        <div class="emp-profile-grid">${contractSection}</div>
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
                .filter(e => !['Archived'].includes(e.status))
                .sort((a, b) => {
                    const dCmp = (a.department || '').localeCompare(b.department || '');
                    return dCmp !== 0 ? dCmp : (a.fullName || '').localeCompare(b.fullName || '');
                });
            if (payrollEmps.length === 0) { showToast('No employees to export.'); return; }
            const header = ['Employee ID', 'Full Name', 'Department', 'Job Title', 'Status', 'Currency', 'Base Salary', 'Allowances', 'Bonuses', 'Total Monthly Cost'];
            const rows = payrollEmps.map(e => {
                const base = parseFloat(e.currentSalary) || 0;
                const allowances = parseFloat(e.allowances) || 0;
                const bonuses = parseFloat(e.bonuses) || 0;
                return [
                    e.employeeId || '',
                    e.fullName || '',
                    e.department || '',
                    e.jobTitle || '',
                    e.status || '',
                    e.currency || 'EGP',
                    base.toFixed(2),
                    allowances.toFixed(2),
                    bonuses.toFixed(2),
                    (base + allowances + bonuses).toFixed(2)
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
            const history = localStore.getAll('salary_history').filter(s => s.employeeId === employeeId)
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
            await cloudDB.put(sh, 'salary_history');

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
            if (emp.status === 'Archived') { showToast('Employee is already archived.'); return; }
            window.openConfirmModal(
                'Archive Employee',
                `Archive ${emp.fullName}? They will be excluded from active payroll.`,
                async () => {
                    const updated = { ...emp, status: 'Archived', updatedAt: new Date().toISOString() };
                    await cloudDB.put(updated, 'employees');
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
                    const salaryHistory = localStore.getAll('salary_history');
                    const relatedIds = salaryHistory.filter(s => s.employeeId === id).map(s => s.id);
                    await Promise.all(relatedIds.map(shId => cloudDB.delete(shId, 'salary_history')));
                    // Remove the employee record
                    await cloudDB.delete(id, 'employees');
                    window.refreshEmployeesModule();
                    showToast('Employee deleted ✓');
                }
            );
        };

        // ── Firebase realtime sync for employees stores ──
        (function _patchCloudDBForEmployees() {
            const origSetup = cloudDB.setupRealtime.bind(cloudDB);
            cloudDB.setupRealtime = function(storeName) {
                origSetup(storeName);
                // employees and salary_history stores handled by the snapshot callback below
            };
            // Patch onSnapshot handler to also handle employees/salary_history
            const origInit = cloudDB.init.bind(cloudDB);
            cloudDB.init = async function() {
                await origInit();
            };
        }());

        // ── Export dock: always visible while active (no scroll-based hide) ──

    