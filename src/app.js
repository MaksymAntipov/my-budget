import {
  escapeHtml,
  escapeAttr,
  newId,
  sameId,
  formatMoney,
  roundMoney,
  addMoney,
  formatNumberShort,
  countDaysInMonth,
  countWeekdaysInMonth,
} from './utils.js';
import { API_URL } from './config.js';
import {
  IGNORED_TARGET,
  categoryKey,
  dropEmptySystemCategories,
  ensureCategoryKeys,
  isLegacyMonoCategory,
  isLinkedItem,
  isMonoItem,
  isOwnCategory,
  isUnassigned,
  placeOperation,
  removeCardOperations,
  summarizeMerchants,
  txKey,
} from './mono/routing.js';
import { apiFetch } from './api.js';
import { syncFamilyTreeNavVisibility, openFamilyTree, closeFamilyTree } from './family-tree/index.js';
import {
  syncYearTracksNavVisibility,
  openYearTracks,
  closeYearTracks,
  getYearTracksDocSnapshot,
} from './year-tracks/index.js';
import {
  buildYearTracksAiSection,
  loadYearTracksForAiExport,
} from './year-tracks/export-prompt.js';
import {
  buildMarketAiSection,
  getBand,
  inferLevelFromJob,
  inferRoleFamilyForProfile,
  parseUsdAmount,
} from './growth/market-bands.js';
import {
  firstId,
  inferDomainFromJob,
  inferOperationFromJob,
  migrateLegacyVectorIds,
  mobilityLabel,
  vectorLabel,
} from './growth/trajectory.js';
import { closeOpenDropdowns, registerUiActions } from './bind-ui.js';
import { openRunway, closeRunway } from './runway/index.js';
import {
  debtRemainingInMonth,
  forecastFinish,
  listRunwayMonths,
  monthLabel as runwayMonthLabel,
  reconstructDrawdown,
  reconstructStock,
  sumDebtPayments,
  sumEmergencyDeposits,
  trailingAverage,
} from './runway/model.js';
import { hasLlmKey } from './ai/settings.js';
import {
  initAiChat,
  openAiChat,
  closeAiChat,
  toggleAiChatExpand,
  sendAiChatMessage,
  stopAiChat,
  startAiBriefing,
  hydrateAiChat,
  unloadAiChat,
  resetAiChat,
  copyLastAiPrompt,
  sendAiSuggestion,
  openLlmSettings,
  closeLlmSettings,
  saveLlmSettingsFromForm,
  clearLlmSettingsFromForm,
  selectLlmProvider,
  selectLlmModel,
  syncAiEntryButtons,
  launchAiAgent,
} from './ai/chat-ui.js';

// ==========================================
    // НОВИНИ / CHANGELOG
    // ==========================================
    const changelogData = [
        {
            date: "Жовтень 2026",
            version: "v1.5.0",
            changes: [
                "Операції Монобанку розкладаються по ваших категоріях: правило для магазину задається один раз, нове потрапляє в «Нерозподілене».",
                "Операцію можна прив'язати до конверта або боргу; доларовий борг рахується за курсом НБУ на день операції.",
                "Ліміт категорії задається у самій категорії: фіксована сума або % доходу. У «Зведенні» видно, скільки доходу вже розплановано.",
                "Для рахунків ФОП показуються тип рахунку та IBAN, для операцій — час."
            ]
        },
        {
            date: "Вересень 2026",
            version: "v1.4.0",
            changes: [
                "Підключення Монобанку: витрати підтягуються автоматично."
            ]
        },
        {
            date: "Серпень 2026",
            version: "v1.3.0",
            changes: [
                "ШІ-чат у Скрині: власний API-ключ (Gemini, OpenAI, Anthropic, OpenRouter) замість копіювання промпта."
            ]
        },
        {
            date: "Липень 2026",
            version: "v1.2.0",
            changes: [
                "Точніша бізнес-математика: інвойси, закупівлі й зарплати правильно впливають на прибуток."
            ]
        },
        {
            date: "Березень 2026",
            version: "v1.1",
            changes: [
                "Графік погашення боргів і фактичний баланс у бізнес-кабінеті.",
                "Платежі по боргах у валюті боргу ($ або ₴) з автоматичним перерахунком за курсом НБУ.",
                "Віджет «Залишок до оплати» і позначка «Оплачено» для витрат."
            ]
        }
    ];

    // ==========================================
    // 1. КОНСТАНТИ ТА ГЛОБАЛЬНІ ЗМІННІ
    // ==========================================
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    const appleColors = [ '#ff453a', '#ff9f0a', '#ffd60a', '#2ea043', '#66d4cf', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#32ade6' ];

    let globalData = { jars: {}, debts: {}, suppliers: {} };
    let currentUser = null;
    let defaultCategories = []; 
    let appData = {}; 
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth(); 
    let expenses = [];
    let monobankLink = null;
    let monobankBusy = false;
    let monoQueue = null;
    let monoQueueGen = 0;
    let monoLiveTimer = null;
    let undoTimer = null;
    let undoRestore = null; 
    let myChart = null;
    let analyticsChart = null; 
    let currentExchangeRate = 0;
    let currentIncomeUah = 0; 
    let activeCategoryId = null;
    let pendingConfirmAction = null; 
    let tempAuthData = null; 
    let otpTimer = null;
    let saveTimeout = null;
    let saveTimeoutTarget = null;
    let saveQueue = Promise.resolve();
    // Profile id whose data finished loading. Saves are blocked until then, so an
    // empty, not-yet-loaded month is never sent over the server copy.
    let dataLoadedFor = null;
    // Server data version this tab last loaded or saved; the server rejects saves from an older one.
    let dataVersion = 0;
    const saveClientId = newId();
    // "year-month" -> number of the latest save request not yet confirmed by the server.
    const pendingSaves = new Map();
    let saveRequestSeq = 0;
    let saveFailed = false;
    let saveRetryTimer = null;
    let saveRetryAttempt = 0;
    let saveStatusTimer = null;
    let availableProfiles = [];

    const VIEW_PERIOD_KEY = 'budget_view_period';
    const SKRYNIA_MODULE_KEY = 'budget_skrynia_module';
    const SKRYNIA_MODULE_LABELS = {
        budget: 'Бюджет',
        tracks: 'Мої треки',
        runway: 'Внески',
        tree: 'Сімейне дерево',
    };
    let currentSkryniaModule = 'budget';
    // Modules beyond the budget the server opened for this account (/api/data → modules).
    let extraModules = [];
    let suppressSkryniaCloseHook = false;

    function persistViewedPeriod() {
        if (!currentUser?.id) return;
        try {
            localStorage.setItem(
                VIEW_PERIOD_KEY,
                JSON.stringify({ userId: currentUser.id, year: currentYear, month: currentMonth })
            );
        } catch (e) {}
    }

    function restoreViewedPeriod() {
        if (!currentUser?.id) return false;
        try {
            const raw = localStorage.getItem(VIEW_PERIOD_KEY);
            if (!raw) return false;
            const saved = JSON.parse(raw);
            if (!saved || saved.userId !== currentUser.id) return false;
            const y = Number(saved.year);
            const m = Number(saved.month);
            if (!Number.isFinite(y) || !Number.isFinite(m) || m < 0 || m > 11) return false;
            currentYear = y;
            currentMonth = m;
            return true;
        } catch (e) {
            return false;
        }
    }

function loadAuthStats() { /* /api/stats removed */ }


    function renderChangelog() {
        const list = document.getElementById('changelog-list');
        list.innerHTML = '';
        
        changelogData.forEach(item => {
            let lis = item.changes.map(c => `<li>${c}</li>`).join('');
            list.innerHTML += `
                <div class="changelog-item">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="changelog-date">${item.date}</div>
                        <div style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 8px; color: white; font-weight: 700;">${item.version}</div>
                    </div>
                    <ul class="changelog-content">
                        ${lis}
                    </ul>
                </div>
            `;
        });
    }

    function openChangelogModal() {
        renderChangelog();
        document.getElementById('changelog-modal').classList.add('active');
    }

    function closeChangelogModal(e) {
        if (!e || e.target.id === 'changelog-modal' || e.target.className === 'btn-close-modal' || (e.target.tagName.toLowerCase() === 'button' && e.target.innerText === 'Зрозуміло')) {
            document.getElementById('changelog-modal').classList.remove('active');
        }
    }

    // ==========================================
    // 2. УТИЛІТИ ТА БАЗОВІ ФУНКЦІЇ
    // ==========================================

    window.addEventListener('click', function(e) {
        if (e.target.closest('.custom-dropdown')) return;
        document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
    });

    function stableHash(str) {
        return String(str || '').split('').reduce((hash, ch) => ((hash << 5) - hash + ch.charCodeAt(0)) | 0, 0);
    }

    function getStableAppleColor(user) {
        const key = user?.id || user?.email || `${user?.name || ''}${user?.surname || ''}`;
        const idx = Math.abs(stableHash(key)) % appleColors.length;
        return appleColors[idx];
    }

    function createDefaultExpenseCategories() {
        return [
            { id: newId(), name: "Житло", items: [], isEssential: true },
            { id: newId(), name: "Їжа", items: [], isEssential: true },
            { id: newId(), name: "Транспорт", items: [], isEssential: true },
            { id: newId(), name: "Розваги", items: [], isEssential: false },
            { id: newId(), name: "Інше", items: [], isEssential: false }
        ];
    }

    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const parts = String(dateStr).split('-').map(Number);
        if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    function getMonthlyInterestEstimate(debt, remaining) {
        const rate = parseFloat(debt?.interest_rate) || 0;
        const amount = parseFloat(remaining) || 0;
        return amount > 0 && rate > 0 ? amount * (rate / 100) : 0;
    }

    // ==========================================
    // 3. ІНІЦІАЛІЗАЦІЯ
    // ==========================================
    async function init() {
        fetchExchangeRate();
        initChart();
        
        // --- БЕЗПЕЧНЕ ГЛОБАЛЬНЕ БЛОКУВАННЯ СКРОЛУ ---
        // Замість спостереження за всім DOM (що "вішало" сторінку), 
        // стежимо тільки за самими модальними вікнами.
        const modals = document.querySelectorAll('.modal-overlay, .auth-glass-overlay, .serenity-overlay');
        const observer = new MutationObserver(() => {
            const hasActiveModal = document.querySelector('.modal-overlay.active, .auth-glass-overlay.active, .serenity-overlay.active') !== null;
            document.body.style.overflow = hasActiveModal ? 'hidden' : '';
        });
        
        modals.forEach(modal => {
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        });
        // ----------------------------------------------

        document.addEventListener('click', (e) => {
            closeProfileSwitcher(e);
            closeSkryniaSwitcher(e);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSerenityEasterEgg();
        });

        function flushSaveKeepalive() {
            if (!isDataLoaded() || pendingSaves.size === 0) return;
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            // Sync expenses into appData before building payload (same as saveData).
            if (appData[currentYear]?.[currentMonth]?.initialized) {
                appData[currentYear][currentMonth].expenses = expenses;
            }
            for (const [key, seq] of pendingSaves) {
                const [year, month] = key.split('-').map(Number);
                try {
                    apiFetch('/api/data', {
                        method: 'POST',
                        body: JSON.stringify(buildSavePayload(year, month)),
                        keepalive: true
                    })
                        .then((response) => handleSaveResponse(response, year, month, seq))
                        .catch(() => {});
                } catch (e) {}
            }
        }

        window.addEventListener('beforeunload', (e) => {
            flushSaveKeepalive();
            if (saveFailed && pendingSaves.size > 0) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        window.addEventListener('online', () => {
            if (saveFailed) retryFailedSaves();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flushSaveKeepalive();
        });

        const savedUserId = localStorage.getItem('budget_saved_user_id');
        const savedUserInfo = localStorage.getItem('budget_saved_user_info');
        // Session cookie is HttpOnly — restore UI from saved profile; 401 clears it.
        let savedUser = null;
        try {
            savedUser = savedUserId && savedUserInfo ? JSON.parse(savedUserInfo) : null;
        } catch (e) {
            savedUser = null;
        }
        if (savedUser?.id) {
            await performLogin(savedUser, { openHub: false });
        } else {
            localStorage.removeItem('budget_saved_user_id');
            localStorage.removeItem('budget_saved_user_info');
            showAuthScreen();
        }

        initAiChat({
            getUserId: () => currentUser?.id,
            isLoggedIn: () => Boolean(currentUser?.id),
            buildAnalyticsPrompt,
            buildAiSkryniaDataDump,
            buildGrowthPrompt,
            getAiFocusCatalog,
            hasGrowthProfile: () => Boolean(currentUser?.growthProfile?.job),
            hasTracks: hasTracksModule,
            openGrowthModal,
        });
    }

    // ==========================================
    // 4. АВТОРИЗАЦІЯ ТА API
    // ==========================================
    function startOtpCountdown(btnId, seconds) {
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const total = Math.max(1, Math.floor(Number(seconds) || 0));
        let timeLeft = total;

        if (otpTimer) clearInterval(otpTimer);

        const paint = () => {
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.classList.add('otp-resend--waiting');
            btn.style.display = 'block';
            btn.innerText = `Повторна відправка через ${timeLeft} с`;
        };

        paint();

        otpTimer = setInterval(() => {
            timeLeft -= 1;
            if (timeLeft <= 0) {
                clearInterval(otpTimer);
                otpTimer = null;
                btn.disabled = false;
                btn.removeAttribute('aria-disabled');
                btn.classList.remove('otp-resend--waiting');
                btn.innerText = 'Відправити повторно';
                const subtitle = document.getElementById('otp-subtitle');
                if (subtitle) subtitle.innerText = 'Термін дії коду минув. Відправте новий.';
                return;
            }
            paint();
        }, 1000);
    }

    function showAuthScreen() {
        document.getElementById('auth-overlay').classList.add('active');
        document.getElementById('login-email').value = '';
        document.getElementById('login-error').style.display = 'none';
        
    }

    function showCreateProfile() {
        document.getElementById('create-profile-overlay').classList.add('active');
        document.getElementById('new-user-name').value = '';
        document.getElementById('new-user-surname').value = '';
        document.getElementById('new-user-email').value = '';
        document.getElementById('create-error').style.display = 'none';
        selectProfileType('personal'); 
    }

    function showCreateProfileFromAuth() {
        document.getElementById('auth-overlay').classList.remove('active');
        showCreateProfile();
    }

    function hideCreateProfile() {
        document.getElementById('create-profile-overlay').classList.remove('active');
        if (!currentUser) showAuthScreen();
    }

    function selectProfileType(type) {
        document.getElementById('new-user-type').value = type;
        document.getElementById('btn-type-personal').classList.toggle('active', type === 'personal');
        document.getElementById('btn-type-business').classList.toggle('active', type === 'business');
    }

    async function sendAuthOtp(isRegister) {
        const errorDiv = document.getElementById(isRegister ? 'create-error' : 'login-error');
        const btnId = isRegister ? 'btn-create-send' : 'btn-login-send';
        const btn = document.getElementById(btnId);
        
        let payload = { isRegister };
        
        if (isRegister) {
            payload.name = document.getElementById('new-user-name').value.trim();
            payload.surname = document.getElementById('new-user-surname').value.trim();
            payload.email = document.getElementById('new-user-email').value.trim();
            payload.account_type = document.getElementById('new-user-type').value;
            if (!payload.name || !payload.email) return showError(errorDiv, 'Заповніть обов\'язкові поля');
        } else {
            payload.email = document.getElementById('login-email').value.trim();
            if (!payload.email) return showError(errorDiv, 'Введіть email');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(payload.email)) {
            return showError(errorDiv, 'Введіть коректний email');
        }

        try {
            btn.innerText = 'Відправка...';
            btn.disabled = true;

            const response = await apiFetch('/api/auth/send-otp', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 429 && (data.retryAfter || (data.error && data.error.includes('через')))) {
                    tempAuthData = payload;
                    document.getElementById('auth-overlay').classList.remove('active');
                    document.getElementById('create-profile-overlay').classList.remove('active');
                    
                    const seconds = Number(data.retryAfter) || parseInt((data.error.match(/\d+/) || [])[0], 10) || 600;
                    document.getElementById('otp-subtitle').innerText = isRegister
                        ? `Код вже був відправлений на ${payload.email}. Він ще діє.`
                        : `Якщо акаунт з ${payload.email} існує, попередній код ще діє. Перевірте пошту.`;
                    document.getElementById('otp-input').value = '';
                    document.getElementById('otp-error').style.display = 'none';
                    startOtpCountdown('btn-otp-resend', seconds);
                    document.getElementById('otp-overlay').classList.add('active');
                    
                } else {
                    showError(errorDiv, data.error || 'Помилка');
                }
                
                btn.innerText = 'Отримати код';
                btn.disabled = false;
            } else {
                tempAuthData = payload;
                document.getElementById('auth-overlay').classList.remove('active');
                document.getElementById('create-profile-overlay').classList.remove('active');
                
                document.getElementById('otp-subtitle').innerText = isRegister
                    ? `Код відправлено на ${payload.email}`
                    : `Якщо акаунт з ${payload.email} існує, код надіслано на пошту. Перевірте вхідні та «Спам».`;
                document.getElementById('otp-input').value = '';
                document.getElementById('otp-error').style.display = 'none';
                startOtpCountdown('btn-otp-resend', 600);
                document.getElementById('otp-overlay').classList.add('active');
                btn.innerText = 'Отримати код';
                btn.disabled = false;
            }
        } catch (err) {
            showError(errorDiv, 'Помилка з\'єднання');
            btn.innerText = 'Отримати код';
            btn.disabled = false;
        }
    }

    async function verifyAuthOtp() {
        const otp = document.getElementById('otp-input').value.trim();
        const errorDiv = document.getElementById('otp-error');
        const btn = document.getElementById('btn-otp-verify');

        if (!otp || otp.length !== 6) return showError(errorDiv, 'Введіть 6 цифр');

        try {
            btn.innerText = 'Перевірка...';
            btn.disabled = true;

            const response = await apiFetch('/api/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ email: tempAuthData.email, otp })
            });
            const data = await response.json();
            
            if (!response.ok) {
                showError(errorDiv, data.error || 'Невірний код');
                btn.innerText = 'Підтвердити';
                btn.disabled = false;
            } else {
                if (otpTimer) clearInterval(otpTimer);
                document.getElementById('otp-overlay').classList.remove('active');
                btn.innerText = 'Підтвердити';
                btn.disabled = false;
                
                                if (data.users) {
                    availableProfiles = data.users;
                    localStorage.setItem('budget_available_profiles', JSON.stringify(availableProfiles));
                }

                if (data.users && data.users.length > 1) {
                    showAccountSelect(data.users);
                } else {
                    await performLogin(data.users ? data.users[0] : data.user, { openHub: true });
                }
            }
        } catch (err) {
            showError(errorDiv, 'Помилка з\'єднання');
            btn.innerText = 'Підтвердити';
            btn.disabled = false;
        }
    }

    function showAccountSelect(users) {
        const list = document.getElementById('account-select-list');
        list.innerHTML = '';
        
        users.forEach(u => {
            const isBiz = u.account_type === 'business';
            const iconSvg = isBiz
                ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sys-green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>'
                : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sys-blue)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';

            const typeName = isBiz ? 'Бізнес профіль' : 'Особистий профіль';
            
            const btn = document.createElement('button');
            btn.className = 'btn-init-secondary';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'flex-start';
            btn.style.gap = '16px';
            btn.style.padding = '18px';
            btn.style.margin = '0';
            btn.style.background = 'rgba(255,255,255,0.05)';
            btn.style.border = '1px solid rgba(255,255,255,0.1)';
            btn.style.color = 'white';
            
            btn.innerHTML = `
                <div style="background: rgba(0,0,0,0.3); width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: 14px; border: 1px solid rgba(255,255,255,0.05);">${iconSvg}</div>
                <div style="text-align: left;">
                    <div style="font-weight: 700; font-size: 16px;">${typeName}</div>
                    <div style="font-size: 14px; color: #a1a1a6; margin-top: 4px;">${escapeHtml(u.name)} ${escapeHtml(u.surname)}</div>
                </div>
            `;
            
            btn.onclick = () => {
                document.getElementById('account-select-overlay').classList.remove('active');
                performLogin(u, { openHub: true });
            };
            
            btn.onmouseover = () => { btn.style.transform = 'scale(1.02)'; btn.style.background = 'rgba(255,255,255,0.1)'; };
            btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.background = 'rgba(255,255,255,0.05)'; };
            
            list.appendChild(btn);
        });
        
        document.getElementById('account-select-overlay').classList.add('active');
    }

    function cancelAccountSelect() {
        document.getElementById('account-select-overlay').classList.remove('active');
        localStorage.removeItem('budget_saved_user_id');
        localStorage.removeItem('budget_saved_user_info');
        localStorage.removeItem('budget_available_profiles');
        showAuthScreen();
    }

    function resendOtp() {
        if (tempAuthData) {
            sendAuthOtp(tempAuthData.isRegister);
        }
    }

    function sanitizeOtpInput(value) {
        const el = document.getElementById('otp-input');
        if (!el) return;
        const cleaned = String(value ?? '').replace(/[^0-9]/g, '');
        if (el.value !== cleaned) el.value = cleaned;
    }

    function cancelOtp() {
        if (otpTimer) clearInterval(otpTimer);
        otpTimer = null;
        const resendBtn = document.getElementById('btn-otp-resend');
        if (resendBtn) {
            resendBtn.classList.remove('otp-resend--waiting');
            resendBtn.style.display = 'none';
            resendBtn.disabled = true;
            resendBtn.innerText = 'Відправити повторно';
        }
        document.getElementById('otp-overlay').classList.remove('active');
        if (tempAuthData && tempAuthData.isRegister) {
            document.getElementById('create-profile-overlay').classList.add('active');
        } else {
            document.getElementById('auth-overlay').classList.add('active');
        }
        tempAuthData = null;
    }

    function showError(element, text) {
        element.innerText = text;
        element.style.display = 'block';
        element.style.animation = 'shake 0.4s';
        setTimeout(() => element.style.animation = '', 400);
    }

async function fetchAvailableProfiles() {
        const cached = localStorage.getItem('budget_available_profiles');
        if (cached) {
            try { availableProfiles = JSON.parse(cached); } catch (e) { availableProfiles = []; }
        }

        try {
            const response = await apiFetch('/api/profiles');
            if (response.status === 401) {
                logout();
                return [];
            }
            if (response.ok) {
                const data = await response.json();
                availableProfiles = data.profiles || [];
                localStorage.setItem('budget_available_profiles', JSON.stringify(availableProfiles));
            }
        } catch (e) {
            console.error('Помилка завантаження профілів', e);
        }

        return availableProfiles;
    }

    function updateProfileSwitcherUI() {
        const badge = document.getElementById('account-type-badge');
        const dropdown = document.getElementById('profile-switcher-dropdown');
        if (!badge || !dropdown) return;

        dropdown.classList.remove('open');
        dropdown.innerHTML = '';

        const otherProfiles = availableProfiles.filter(p => String(p.id) !== String(currentUser?.id));

        if (otherProfiles.length === 0) {
            badge.classList.remove('badge-type--switchable');
            badge.disabled = true;
            badge.removeAttribute('title');
            return;
        }

        badge.disabled = false;
        badge.title = 'Перемкнути профіль';
        badge.classList.add('badge-type--switchable');
        otherProfiles.forEach(p => {
            const isBiz = p.account_type === 'business';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'profile-switcher-item ' + (isBiz ? 'profile-switcher-item--biz' : 'profile-switcher-item--personal');
            btn.innerHTML = `
                <span>${isBiz ? 'Бізнес' : 'Фіз. особа'}</span>
                <span style="font-size: 11px; opacity: 0.6; font-weight: 500;">${escapeHtml(p.name)}</span>
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                switchProfile(p);
            });
            dropdown.appendChild(btn);
        });
    }

    function toggleProfileSwitcher(e) {
        if (e) e.stopPropagation();
        if (availableProfiles.filter(p => String(p.id) !== String(currentUser?.id)).length === 0) return;
        document.getElementById('profile-switcher-dropdown').classList.toggle('open');
    }

    // Must ignore clicks inside the switcher: toggle + this listener both sit on document
    // (delegated data-action), so stopPropagation alone does not keep the menu open.
    function closeProfileSwitcher(e) {
        if (e?.target?.closest?.('#profile-type-container')) return;
        const dropdown = document.getElementById('profile-switcher-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    function isPersonalSkrynia() {
        return !(currentUser && currentUser.account_type === 'business');
    }

    /** «Мої треки» is open to this account, so the AI may read and suggest tracks. */
    function hasTracksModule() {
        return getSkryniaModules().some((m) => m.id === 'tracks');
    }

    function getSkryniaModules() {
        const ids = isPersonalSkrynia()
            ? ['budget', ...['tracks', 'runway', 'tree'].filter((id) => extraModules.includes(id))]
            : ['budget'];
        return ids.map((id) => ({ id, label: SKRYNIA_MODULE_LABELS[id] }));
    }

    function readLastSkryniaModule() {
        try {
            const saved = localStorage.getItem(SKRYNIA_MODULE_KEY);
            if (saved && SKRYNIA_MODULE_LABELS[saved]) return saved;
        } catch (e) {}
        return 'budget';
    }

    function persistSkryniaModule(moduleId) {
        currentSkryniaModule = moduleId;
        try { localStorage.setItem(SKRYNIA_MODULE_KEY, moduleId); } catch (e) {}
    }

    function updateSkryniaSwitcherUI() {
        const switchers = document.querySelectorAll('[data-skrynia-switcher]');
        if (!switchers.length) return;

        const modules = getSkryniaModules();
        const showSwitcher = Boolean(currentUser) && modules.length > 1;
        const activeLabel = SKRYNIA_MODULE_LABELS[currentSkryniaModule] || SKRYNIA_MODULE_LABELS.budget;

        switchers.forEach((wrap) => {
            const btn = wrap.querySelector('.skrynia-switcher-btn');
            const dropdown = wrap.querySelector('.skrynia-switcher-dropdown');
            if (!btn || !dropdown) return;

            wrap.style.display = showSwitcher ? '' : 'none';
            if (!showSwitcher) {
                dropdown.classList.remove('open');
                dropdown.innerHTML = '';
                return;
            }

            btn.innerHTML = `Скриня · ${activeLabel} <span style="opacity:0.7;font-size:10px;">▾</span>`;
            dropdown.innerHTML = '';
            modules.forEach((mod) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'skrynia-switcher-item' + (mod.id === currentSkryniaModule ? ' is-active' : '');
                item.textContent = mod.label;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openSkryniaModule(mod.id);
                });
                dropdown.appendChild(item);
            });
        });
    }

    function toggleSkryniaSwitcher(e) {
        if (e) e.stopPropagation();
        closeProfileSwitcher();
        if (!currentUser || getSkryniaModules().length < 2) return;

        const wrap = e?.target?.closest?.('[data-skrynia-switcher]');
        const dropdown = wrap?.querySelector('.skrynia-switcher-dropdown');
        if (!dropdown) return;

        document.querySelectorAll('.skrynia-switcher-dropdown.open').forEach((el) => {
            if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
    }

    function closeSkryniaSwitcher(e) {
        if (e?.target?.closest?.('[data-skrynia-switcher]')) return;
        document.querySelectorAll('.skrynia-switcher-dropdown.open').forEach((el) => {
            el.classList.remove('open');
        });
    }

    function syncSkryniaHubCards() {
        const allowed = getSkryniaModules().map((m) => m.id);
        document.querySelectorAll('#skrynia-hub-cards [data-module]').forEach((el) => {
            el.style.display = allowed.includes(el.dataset.module) ? '' : 'none';
        });

        const userEl = document.getElementById('skrynia-hub-user');
        if (userEl && currentUser) {
            const type = currentUser.account_type === 'business' ? 'Бізнес' : 'Фіз. особа';
            userEl.textContent = `${currentUser.name} ${currentUser.surname} · ${type}`;
        }
    }

    function showSkryniaHub() {
        if (!currentUser) return;
        // Nothing to choose from: the budget is the whole Skrynia.
        if (getSkryniaModules().length < 2) {
            openSkryniaModule('budget');
            return;
        }
        closeSkryniaSwitcher();
        closeProfileSwitcher();
        suppressSkryniaCloseHook = true;
        try {
            closeYearTracks();
            closeFamilyTree();
            closeRunway();
        } catch (e) {
        } finally {
            suppressSkryniaCloseHook = false;
        }
        syncSkryniaHubCards();
        updateSkryniaSwitcherUI();
        const hub = document.getElementById('skrynia-hub-overlay');
        if (hub) hub.classList.add('active');
    }

    function hideSkryniaHub() {
        const hub = document.getElementById('skrynia-hub-overlay');
        if (hub) hub.classList.remove('active');
    }

    function openSkryniaModule(moduleId) {
        if (!currentUser) return;
        const allowed = getSkryniaModules().map((m) => m.id);
        const next = allowed.includes(moduleId) ? moduleId : 'budget';

        closeSkryniaSwitcher();
        hideSkryniaHub();
        suppressSkryniaCloseHook = true;
        try {
            closeYearTracks();
            closeFamilyTree();
            closeRunway();
        } catch (e) {
        } finally {
            suppressSkryniaCloseHook = false;
        }

        persistSkryniaModule(next);
        updateSkryniaSwitcherUI();

        if (next === 'tracks') openYearTracks();
        else if (next === 'runway') openRunway();
        else if (next === 'tree') openFamilyTree();
    }

    async function switchProfile(user) {
        if (!user || !currentUser || user.id === currentUser.id) return;
        closeProfileSwitcher();
        await saveData(true);
        appData = {};
        expenses = [];
        await performLogin(user, { openHub: false });
    }

async function performLogin(user, { openHub = false } = {}) {
        currentUser = user;
        
        localStorage.setItem('budget_saved_user_id', user.id);
        localStorage.setItem('budget_saved_user_info', JSON.stringify(user));
        
        document.getElementById('current-user-name-display').innerText = `${user.name} ${user.surname}`;
        
        const color = getStableAppleColor(user);
        document.getElementById('nav-avatar').innerText = user.name.charAt(0).toUpperCase();
        document.getElementById('nav-avatar').style.background = `linear-gradient(135deg, ${color}, #000)`;
        
        const appContainer = document.getElementById('app-container');
        appContainer.style.display = 'flex';
        setTimeout(() => {
            appContainer.style.opacity = '1';
            appContainer.style.pointerEvents = 'auto';
        }, 50);

        await fetchAvailableProfiles();
        applyUIForAccountType();
        updateProfileSwitcherUI();
        await loadDataFromServer(user.id);
        await refreshMonobankStatus();
        startMonoLiveWatch();

        hideSkryniaHub();
        updateSkryniaSwitcherUI();
        hydrateAiChat();

        if (openHub && getSkryniaModules().length > 1) {
            showSkryniaHub();
            return;
        }

        const last = readLastSkryniaModule();
        const allowed = getSkryniaModules().some((m) => m.id === last);
        openSkryniaModule(allowed ? last : 'budget');
    }

    function applyUIForAccountType() {
        const isBiz = currentUser && currentUser.account_type === 'business';
        
        const badge = document.getElementById('account-type-badge');
        const canSwitch = availableProfiles.some(p => String(p.id) !== String(currentUser?.id));
        badge.style.display = 'inline-flex';
        badge.innerHTML = (isBiz ? 'Бізнес' : 'Фіз. особа') + (canSwitch ? ' <span style="opacity:0.7;font-size:9px;">▾</span>' : '');
        badge.className = isBiz ? 'badge-type badge-business' : 'badge-type';
        badge.disabled = !canSwitch;
        if (canSwitch) {
            badge.classList.add('badge-type--switchable');
            badge.title = 'Перемкнути профіль';
        } else {
            badge.removeAttribute('title');
        }

        document.getElementById('title-sources').innerText = isBiz ? 'Обіг за рахунками за місяць' : 'Джерела доходу';
        document.getElementById('title-incomes').innerText = isBiz ? 'Обіг' : 'Доходи';
        
        document.getElementById('label-daily').innerText = isBiz ? 'Середній обіг за день:' : 'У робочий день:';
        document.getElementById('label-hourly').innerText = isBiz ? 'Середній обіг за годину:' : 'Вартість 1 години:';
        document.getElementById('daily-rate-usd-container').style.display = isBiz ? 'none' : 'inline';
        document.getElementById('hourly-rate-usd-container').style.display = isBiz ? 'none' : 'inline';
        document.getElementById('yearly-income-usd-container').style.display = isBiz ? 'none' : 'inline';

        document.getElementById('title-remaining').innerText = isBiz ? 'Чистий прибуток:' : 'Залишається в міс:';
        document.getElementById('label-yearly-remaining').innerText = isBiz ? 'Чистий прибуток за рік' : 'Чистими за рік';
        document.getElementById('text-transfer').innerText = isBiz ? 'Розподілити прибуток' : 'Відкласти в конверт';
        
        document.getElementById('savings-title').innerText = isBiz ? 'Фонди бізнесу:' : 'Мої заощадження:';
        document.getElementById('transfer-modal-title').innerText = isBiz ? 'Поповнити фонд' : 'Відкласти в конверт';
        document.getElementById('jars-modal-title').innerText = isBiz ? 'Фонди бізнесу' : 'Мої конверти';

        const cogsBlock = document.getElementById('cogs-block');
        if (cogsBlock) cogsBlock.style.display = 'none';
        
        const cogsFlow = document.getElementById('cogs-flow');
        if (cogsFlow) cogsFlow.style.display = isBiz ? 'flex' : 'none';
        
        const invBlock = document.getElementById('invoices-block');
        if (invBlock) invBlock.style.display = isBiz ? 'block' : 'none';
        const payrollBlock = document.getElementById('payroll-block');
        if (payrollBlock) payrollBlock.style.display = isBiz ? 'block' : 'none';

        const payrollFlow = document.getElementById('payroll-flow');
        if (payrollFlow) payrollFlow.style.display = isBiz ? 'flex' : 'none';
        const reconBox = document.getElementById('recon-box');
        if(reconBox) reconBox.style.display = isBiz ? 'flex' : 'none';

        const bHoursRow = document.getElementById('business-hours-row');
        if (bHoursRow) bHoursRow.style.display = 'flex';

        const jarTypeWrap = document.getElementById('new-jar-type-wrap');
        if (jarTypeWrap) jarTypeWrap.style.display = isBiz ? 'none' : 'block';

        const growthBtn = document.getElementById('btn-growth-strategy');
        if (growthBtn) growthBtn.style.display = isBiz ? 'none' : 'flex';
        const growthRunBtn = document.getElementById('btn-ai-growth-run');
        if (growthRunBtn) growthRunBtn.style.display = isBiz ? 'none' : '';
        syncAiEntryButtons();

        syncFamilyTreeNavVisibility();
        syncYearTracksNavVisibility();
        updateSkryniaSwitcherUI();

        // Показуємо cashflow-box для всіх
        const cfRowInvoices = document.getElementById('cf-row-invoices');
        const cfDivInvoices = document.getElementById('cf-divider-invoices');
        const cfRowGross = document.getElementById('cf-row-gross'); // НОВОЕ

        if (cfRowInvoices) cfRowInvoices.style.display = isBiz ? 'flex' : 'none';
        if (cfDivInvoices) cfDivInvoices.style.display = isBiz ? 'block' : 'none';
        if (cfRowGross) cfRowGross.style.display = isBiz ? 'flex' : 'none'; // НОВОЕ
        
        // Приховуємо old-expenses-box для всіх (щоб не дублювати "План витрат")
        const oldExpBox = document.getElementById('old-expenses-box');
        if(oldExpBox) {
            oldExpBox.style.display = 'none';
            // Робимо так, щоб віджет "Чистими за рік" розтягнувся на весь рядок
            oldExpBox.parentElement.style.gridTemplateColumns = '1fr';
        }

        renderFinancialPlanBlock();
    }

    function isDataLoaded() {
        return Boolean(currentUser) && dataLoadedFor === currentUser.id;
    }

    async function loadDataFromServer(userId) {
        dataLoadedFor = null;
        pendingSaves.clear();
        clearSaveFailure();
        try {
            const response = await apiFetch(`/api/data?userId=${encodeURIComponent(userId)}`);
            const data = await response.json();

            if (response.status === 401) {
                logout();
                return;
            }

            if (!response.ok) {
                console.error("Помилка завантаження:", data.error);
                alert(`Не вдалося завантажити дані: ${data.error || 'невідома помилка'}`);
                return;
            }

            dataVersion = Number(data.dataVersion) || 0;
            extraModules = Array.isArray(data.modules) ? data.modules : [];
            if (!globalData.jars) globalData.jars = {};
            // Older saves may hold string or drifted amounts; keep jars as rounded numbers.
            globalData.jars[userId] = (data.jars || []).map((jar) => ({
                ...jar,
                balance: roundMoney(jar.balance),
                goal: roundMoney(jar.goal),
            }));
            if (!globalData.suppliers) globalData.suppliers = {};
        globalData.suppliers[userId] = data.suppliers || [];

if (!globalData.debts) globalData.debts = {};
            // ПАРСИНГ: Розшифровуємо schedule_json у нормальний об'єкт
            globalData.debts[userId] = (data.debts || []).map(d => {
                let schedule = {};
                try { schedule = d.schedule_json ? JSON.parse(d.schedule_json) : {}; } catch (e) {}
                return { ...d, schedule };
            });

                        // ЗАВАНТАЖЕННЯ АНКЕТИ "СТРАТЕГІЯ РОСТУ"
            if (data.growthProfile) {
                try { currentUser.growthProfile = JSON.parse(data.growthProfile); } catch(e) {}
            }

            if (globalData.jars[userId].length === 0) {
                const isBiz = currentUser.account_type === 'business';
                globalData.jars[userId] = [{
                    id: newId(), name: isBiz ? "Основний фонд" : "Мої заощадження", goal: 0, balance: 0, isMain: true
                }];
            }

            appData = {};
            const syncedAt = Number(data.serverTime) || Math.floor(Date.now() / 1000);
            if (data.monthsData) {
                data.monthsData.forEach(row => {
                    if (!appData[row.year]) appData[row.year] = {};
                    
                    const parsedIncomes = JSON.parse(row.incomes_json || '[]');
                    const parsedExpenses = JSON.parse(row.expenses_json || '[]');
                    let monoIgnored = [];
                    try { monoIgnored = JSON.parse(row.mono_ignored_json || '[]'); } catch (e) {}
                    ensureCategoryKeys(parsedExpenses, newId);

                 appData[row.year][row.month] = {
                        // Trust DB flag (clear month now persists is_initialized=0).
                        monoSyncedAt: syncedAt,
                        initialized: Number(row.is_initialized) === 1,
                        incomes: ensureIncomeIds(parsedIncomes),
                        expenses: parsedExpenses,
                        monoIgnored: Array.isArray(monoIgnored) ? monoIgnored : [],
                        cogs: JSON.parse(row.cogs_json || '{"type":"percent","value":0}'),
                        payroll: row.payroll_json ? JSON.parse(row.payroll_json) : []
                    };
                });
            }

            if (data.invoices) {
                data.invoices.forEach(inv => {
                    if (!appData[inv.year]) appData[inv.year] = {};
                    if (!appData[inv.year][inv.month]) {
                        appData[inv.year][inv.month] = createEmptyMonth({ invoices: [] });
                    }
                    if (!appData[inv.year][inv.month].invoices) appData[inv.year][inv.month].invoices = [];
                    appData[inv.year][inv.month].invoices.push(inv);
                });
            }

            if (!appData[currentYear]) appData[currentYear] = {};
            if (!appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth] = createEmptyMonth();
            }

            // Restore last viewed month/year for this profile (avoid landing on "today"
            // after editing a copied future/past month and refreshing).
            restoreViewedPeriod();
            if (!appData[currentYear]) appData[currentYear] = {};
            if (!appData[currentYear][currentMonth]) {
                appData[currentYear][currentMonth] = createEmptyMonth();
            }

            hydrateUserDebtsOutsidePaid(userId);
            dataLoadedFor = userId;
            renderCalendar();
            applyMonthData();
            updateSavingsDisplay();
            persistViewedPeriod();
        } catch (e) {
            console.error("Помилка з'єднання з сервером під час завантаження даних", e);
            alert("Не вдалося з'єднатися із сервером. Перевірте інтернет і спробуйте ще раз.");
        }
    }

async function flushSaveToServer(year, month) {
        if (!isDataLoaded()) return;
        const seq = pendingSaves.get(saveKey(year, month));
        // Already saved, or dropped by a reload after a conflict.
        if (seq === undefined) return;

        let response;
        try {
            response = await apiFetch('/api/data', {
                method: 'POST',
                body: JSON.stringify(buildSavePayload(year, month))
            });
        } catch (e) {
            console.error("Помилка збереження на сервер:", e);
            reportSaveFailure("немає з'єднання із сервером");
            return;
        }
        await handleSaveResponse(response, year, month, seq);
    }

    async function handleSaveResponse(response, year, month, seq) {
        if (response.status === 401) {
            logout();
            return;
        }
        if (!isDataLoaded()) return;
        const data = await response.json().catch(() => ({}));

        if (response.status === 409 && (data.code === 'stale_data' || data.code === 'month_reset_rejected')) {
            await reloadAfterConflict();
            return;
        }
        if (!response.ok) {
            console.error("СЕРВЕР ВІДХИЛИВ ДАНІ:", data);
            // 4xx will fail the same way again; only server and network errors retry on their own.
            reportSaveFailure(data.error || `помилка сервера (${response.status})`, response.status >= 500);
            return;
        }

        if (typeof data.dataVersion === 'number') dataVersion = Math.max(dataVersion, data.dataVersion);
        if (appData[year]?.[month] && typeof data.serverTime === 'number') {
            appData[year][month].monoSyncedAt = data.serverTime;
        }
        if (Array.isArray(data.monoAdded)) {
            data.monoAdded.forEach((event) => {
                if (event?.kind === 'income') appendLocalMonoIncome(year, month, event);
                else appendLocalMonoEvent(year, month, event);
            });
        }
        const key = saveKey(year, month);
        if (pendingSaves.get(key) === seq) pendingSaves.delete(key);
        if (saveFailed && pendingSaves.size === 0) clearSaveFailure();
    }

    async function reloadAfterConflict() {
        pendingSaves.clear();
        clearSaveFailure();
        showSaveStatus('Дані змінено на іншому пристрої. Завантажено актуальну версію, останню зміну не збережено.', { tone: 'info', autoHideMs: 7000 });
        if (currentUser) await loadDataFromServer(currentUser.id);
    }

    function saveKey(year, month) {
        return `${year}-${month}`;
    }

    function reportSaveFailure(message, retry = true) {
        saveFailed = true;
        showSaveStatus(`Не збережено: ${message}`, { tone: 'error', canRetry: true });
        if (retry) scheduleSaveRetry();
    }

    function scheduleSaveRetry() {
        if (saveRetryTimer) return;
        const delays = [3000, 10000, 30000, 60000];
        const delay = delays[Math.min(saveRetryAttempt, delays.length - 1)];
        saveRetryAttempt++;
        saveRetryTimer = setTimeout(() => {
            saveRetryTimer = null;
            retryFailedSaves();
        }, delay);
    }

    function retryFailedSaves() {
        if (saveRetryTimer) {
            clearTimeout(saveRetryTimer);
            saveRetryTimer = null;
        }
        if (appData[currentYear]?.[currentMonth]?.initialized) {
            appData[currentYear][currentMonth].expenses = expenses;
        }
        for (const key of [...pendingSaves.keys()]) {
            const [year, month] = key.split('-').map(Number);
            enqueueSave(year, month);
        }
    }

    function clearSaveFailure() {
        saveFailed = false;
        saveRetryAttempt = 0;
        if (saveRetryTimer) {
            clearTimeout(saveRetryTimer);
            saveRetryTimer = null;
        }
        hideSaveStatus({ only: 'error' });
    }

    function showSaveStatus(message, { tone = 'error', canRetry = false, autoHideMs = 0 } = {}) {
        const box = document.getElementById('save-status');
        const text = document.getElementById('save-status-text');
        const retryBtn = document.getElementById('save-status-retry');
        if (!box || !text) return;
        if (saveStatusTimer) {
            clearTimeout(saveStatusTimer);
            saveStatusTimer = null;
        }
        text.textContent = message;
        box.dataset.tone = tone;
        if (retryBtn) retryBtn.hidden = !canRetry;
        box.hidden = false;
        if (autoHideMs > 0) saveStatusTimer = setTimeout(() => hideSaveStatus(), autoHideMs);
    }

    function hideSaveStatus({ only } = {}) {
        const box = document.getElementById('save-status');
        if (!box || (only && box.dataset.tone !== only)) return;
        if (saveStatusTimer) {
            clearTimeout(saveStatusTimer);
            saveStatusTimer = null;
        }
        box.hidden = true;
    }

    function buildSavePayload(year, month) {
        const currentMonthData = appData[year]?.[month] || {};
        // Rules point at category keys; every own category needs one before the server sees it.
        ensureCategoryKeys(currentMonthData.expenses || (year === currentYear && month === currentMonth ? expenses : []), newId);
        syncPercentLimits(currentMonthData.expenses || (year === currentYear && month === currentMonth ? expenses : []), getMonthIncomeUah(year, month));
        const jars = globalData.jars[currentUser.id] || [];
        const debtsLoaded = Array.isArray(globalData.debts[currentUser.id]);
        const suppliersLoaded = Array.isArray(globalData.suppliers[currentUser.id]);
        const invoicesLoaded = Array.isArray(currentMonthData.invoices);
        return {
            userId: currentUser.id,
            year, month,
            incomes: currentMonthData.incomes || [],
            expenses: currentMonthData.expenses || (year === currentYear && month === currentMonth ? expenses : []) || [],
            cogs: normalizeCogs(currentMonthData.cogs),
            payroll: currentMonthData.payroll || [],
            jars: jars.length > 0 ? jars : undefined,
            // undefined = not loaded yet (skip server wipe); [] = intentional clear
            debts: debtsLoaded ? globalData.debts[currentUser.id] : undefined,
            suppliers: suppliersLoaded ? globalData.suppliers[currentUser.id] : undefined,
            invoices: invoicesLoaded ? currentMonthData.invoices : undefined,
            is_initialized: currentMonthData.initialized ? 1 : 0,
            clear_month: currentMonthData.cleared === true,
            baseVersion: dataVersion,
            clientId: saveClientId,
            monoSyncedAt: typeof currentMonthData.monoSyncedAt === 'number' ? currentMonthData.monoSyncedAt : undefined
        };
    }

    function enqueueSave(year, month) {
        pendingSaves.set(saveKey(year, month), ++saveRequestSeq);
        saveQueue = saveQueue
            .then(() => flushSaveToServer(year, month))
            .catch((e) => console.error("Помилка черги збереження:", e));
        return saveQueue;
    }

    function scheduleSaveToServer() {
        if (!currentUser) return;

        const year = currentYear;
        const month = currentMonth;
        // Mark now so a tab hidden during the debounce still sends this edit.
        pendingSaves.set(saveKey(year, month), ++saveRequestSeq);

        if (saveTimeout) {
            clearTimeout(saveTimeout);
            // A debounced save for another month must not be dropped by this one.
            const prev = saveTimeoutTarget;
            if (prev && (prev.year !== year || prev.month !== month)) enqueueSave(prev.year, prev.month);
        }

        saveTimeoutTarget = { year, month };
        saveTimeout = setTimeout(() => {
            saveTimeout = null;
            saveTimeoutTarget = null;
            enqueueSave(year, month);
        }, 1000);
    }

    function saveDataToServer() {
        scheduleSaveToServer();
    }

    async function saveData(immediate = false) {
        if (!appData[currentYear]) appData[currentYear] = {};
        if (appData[currentYear][currentMonth] && appData[currentYear][currentMonth].initialized) {
            appData[currentYear][currentMonth].expenses = expenses;
        }
        if (immediate) {
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
            }
            await enqueueSave(currentYear, currentMonth);
        } else {
            scheduleSaveToServer();
        }
        updateSavingsDisplay();
    }

    async function saveGlobalData(immediate = false) {
        await saveData(immediate);
    }

function logout() {
        try {
            apiFetch('/api/auth/logout', {
                method: 'POST',
                keepalive: true,
            }).catch(() => {});
        } catch (e) {}

        try { unloadAiChat({ forget: true }); } catch (e) {}

        currentUser = null;
        dataLoadedFor = null;
        dataVersion = 0;
        extraModules = [];
        pendingSaves.clear();
        clearSaveFailure();
        hideSaveStatus();
        stopMonoQueue();
        stopMonoLiveWatch();
        monobankLink = null;
        appData = {};
        availableProfiles = [];
        
        localStorage.removeItem('budget_saved_user_id');
        localStorage.removeItem('budget_saved_user_info');
        localStorage.removeItem('budget_available_profiles');
        try { localStorage.removeItem(VIEW_PERIOD_KEY); } catch (e) {}
        
        closeProfileSwitcher();
        closeSkryniaSwitcher();
        hideSkryniaHub();
        try { closeYearTracks(); } catch (e) {}
        try { closeFamilyTree(); } catch (e) {}
        
        const appContainer = document.getElementById('app-container');
        appContainer.style.opacity = '0';
        appContainer.style.pointerEvents = 'none';
        
        setTimeout(() => {
            appContainer.style.display = 'none';
            showAuthScreen();
        }, 500);
    }

    function deleteProfile() {
        showConfirm(
            "Видалити поточний профіль?", 
            "Буде видалено лише поточний профіль (особистий або бізнес) та його дані. Інші профілі на цю пошту залишаться. Цю дію неможливо скасувати. Ви впевнені?", 
            async () => {
                try {
                    const response = await apiFetch('/api/user', {
                        method: 'DELETE',
                        body: JSON.stringify({ userId: currentUser.id })
                    });
                    
                    if (response.ok) {
                        logout(); 
                    } else {
                        const data = await response.json();
                        alert("Помилка під час видалення: " + (data.error || "Невідома помилка"));
                    }
                } catch (e) {
                    console.error("Помилка мережі під час видалення акаунта", e);
                    alert("Не вдалося з'єднатися із сервером для видалення даних.");
                }
            }
        );
    }

    // ==========================================
    // 5. КАЛЕНДАРЬ И МЕСЯЦЫ
    // ==========================================
    function getLastInitializedData() {
        let checkYear = currentYear;
        let checkMonth = currentMonth - 1;
        for (let i = 0; i < 24; i++) { 
            if (checkMonth < 0) { checkMonth = 11; checkYear--; }
            if (appData[checkYear] && appData[checkYear][checkMonth] && appData[checkYear][checkMonth].initialized) {
                return { monthName: monthNames[checkMonth], year: checkYear, data: appData[checkYear][checkMonth] };
            }
            checkMonth--;
        }
        return null;
    }

    async function initializeMonth(usePrev) {
        if (!appData[currentYear]) appData[currentYear] = {};

        const prev = usePrev ? getLastInitializedData() : null;
        
        if (usePrev && prev) {
                let copiedExpenses = JSON.parse(JSON.stringify(prev.data.expenses || []));
                
                copiedExpenses = copiedExpenses.filter(cat => cat.name !== "Погашення боргів" && !cat.isSavings && isOwnCategory(cat));
                // Bank operations belong to the month they happened in; categories and limits carry over.
                copiedExpenses.forEach(cat => { cat.items = (cat.items || []).filter(item => !isMonoItem(item)); });
                
                copiedExpenses.forEach(cat => {
                    cat.items.forEach(item => item.isPaid = false);
                });

                let copiedPayroll = [];
                if (prev.data.payroll) {
                    copiedPayroll = JSON.parse(JSON.stringify(prev.data.payroll));
                    // Обнуляємо годинник і гроші для нового місяця, залишаємо лише суть
                    copiedPayroll.forEach(emp => {
                        if (getEmployeePayType(emp) !== 'fixed') emp.hours = 0;
                        emp.bonus = 0;
                        emp.penalty = 0;
                        emp.advance = 0;
                        emp.paid_part = 0;
                        emp.paid_amount = 0;
                        emp.is_paid = false;
                    });
                }

                if (globalData.debts && globalData.debts[currentUser.id]) {
                    let debtsChanged = false;
                    const newMonthDate = currentYear * 100 + currentMonth;
                    
                    let prevYear = currentYear;
                    let prevMonth = currentMonth - 1;
                    if (prevMonth < 0) { prevMonth = 11; prevYear--; }

                    globalData.debts[currentUser.id].forEach(debt => {
                        const prevRemaining = getHistoricalDebtBalance(debt.id, prevYear, prevMonth);

                        if ((!debt.is_archived || debt.is_archived === 0) && prevRemaining <= 0) {
                            debt.is_archived = newMonthDate;
                            debtsChanged = true;
                        }
                    });
                    if (debtsChanged) saveGlobalData();
                }

                const copiedInvoices = JSON.parse(JSON.stringify(prev.data.invoices || [])).map(inv => ({
                    ...inv,
                    id: newId(),
                    year: currentYear,
                    month: currentMonth
                }));

                // Fresh ids so copied month is fully independent from the source month.
                const copiedIncomes = JSON.parse(JSON.stringify(prev.data.incomes || [{ id: newId(), name: "Основний", amount: prev.data.usd || 0, currency: "USD" }])).map(inc => ({
                    ...inc,
                    id: newId()
                })).filter(inc => inc.source !== 'monobank');
                copiedExpenses.forEach(cat => {
                    cat.id = newId();
                    (cat.items || []).forEach(item => { item.id = newId(); });
                });
                copiedPayroll.forEach(emp => { emp.id = newId(); });
                
                appData[currentYear][currentMonth] = {
                    monoSyncedAt: 0,
                    initialized: true,
                    incomes: copiedIncomes,
                    expenses: copiedExpenses,
                    cogs: normalizeCogs(prev.data.cogs),
                    payroll: copiedPayroll,
                    invoices: copiedInvoices
                };
        } else {
            appData[currentYear][currentMonth] = {
                monoSyncedAt: 0,
                initialized: true,
                incomes: [{id: newId(), name: "Основний", amount: 0, currency: "UAH"}],
                expenses: createDefaultExpenseCategories(),
                cogs: normalizeCogs(),
                payroll: [],
                invoices: []
            };
        }
        
        renderCalendar(); 
        applyMonthData();
        persistViewedPeriod();
        await saveData(true);
    }

    function clearCurrentMonth() {
        showConfirm("Очистити місяць", "Ви впевнені, що хочете повністю очистити дані за цей місяць? Дію неможливо скасувати.", () => {
            appData[currentYear][currentMonth] = createEmptyMonth({ cleared: true, invoices: [] });
            
            const viewDate = currentYear * 100 + currentMonth;
            if (globalData.debts && globalData.debts[currentUser.id]) {
                let debtsChanged = false;
                globalData.debts[currentUser.id].forEach(debt => {
                    if (Math.abs(debt.is_archived) === viewDate) {
                        debt.is_archived = 0;
                        debtsChanged = true;
                    }
                    syncGlobalDebtBalance(debt.id);
                });
                if (debtsChanged) saveGlobalData();
            }
            
            saveData(true);
            renderCalendar(); 
            applyMonthData(); 
        });
    }

    function renderCalendar() {
        document.getElementById('display-year').innerText = currentYear;
        const container = document.getElementById('months-container');
        container.innerHTML = '';

        monthNames.forEach((name, index) => {
            const btn = document.createElement('button');
            const isFilled = appData[currentYear] && appData[currentYear][index] && appData[currentYear][index].initialized;
            
            btn.className = `month-pill ${isFilled ? 'filled' : ''} ${index === currentMonth ? 'active' : ''}`;
            btn.innerText = name;
            btn.onclick = () => selectMonth(index, btn);
            container.appendChild(btn);
            
            if (index === currentMonth) {
                setTimeout(() => btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 50);
            }
        });
    }

    async function changeYear(delta) {
        await saveData(true);
        currentYear += delta;
        if (!appData[currentYear]) appData[currentYear] = {};
        if (!appData[currentYear][currentMonth]) appData[currentYear][currentMonth] = createEmptyMonth();
        persistViewedPeriod();
        renderCalendar();
        applyMonthData();
        refreshMonobankStatus();
    }

    async function selectMonth(m, btnElement) {
        if (m === currentMonth) return;
        await saveData(true);
        currentMonth = m;
        if (!appData[currentYear][currentMonth]) appData[currentYear][currentMonth] = createEmptyMonth();
        persistViewedPeriod();
        renderCalendar();
        applyMonthData();
        if (btnElement && typeof btnElement.scrollIntoView === 'function') {
            btnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        refreshMonobankStatus();
    }

    function applyMonthData() {
        const data = appData[currentYear][currentMonth] || createEmptyMonth();
        
        if (data.initialized) {
            document.getElementById('main-dashboard').classList.remove('blurred');
            document.getElementById('init-overlay').classList.remove('active');
            
            if (!data.incomes) data.incomes = [{ id: newId(), name: "Основний", amount: data.usd || 0, currency: "USD" }];

            expenses = data.expenses || [];

            data.cogs = normalizeCogs(data.cogs);
            syncBusinessHoursInput(data.cogs);
            
            // Безпечна перевірка, бо старі інпути ми замінили на модуль Інвойсів
            const cogsValEl = document.getElementById('cogs-value');
            if (cogsValEl) {
                cogsValEl.value = data.cogs.value || '';
                document.getElementById('cogs-type-display').innerText = data.cogs.type === 'percent' ? '%' : 'Фікс (₴)';
            }
            if (!appData[currentYear][currentMonth].payroll) appData[currentYear][currentMonth].payroll = [];
            renderPayroll();
            renderIncomes();
            renderExpenses();
            renderMonobankButton();
            convertCurrency();
            pullMonoLive(); 
        } else {
            document.getElementById('main-dashboard').classList.add('blurred');
            document.getElementById('init-overlay').classList.add('active');
            
            if(data.incomes) data.incomes = [];
            expenses = [];
            renderIncomes();
            renderExpenses();
            renderMonobankButton();
            currentIncomeUah = 0;
            data.cogs = normalizeCogs(data.cogs);
            syncBusinessHoursInput(data.cogs);
            updateAll();
            
            const prev = getLastInitializedData();
            const copyBtn = document.getElementById('btn-copy-prev');
            const subtitle = document.getElementById('init-subtitle-text');
            
            if (prev) {
                copyBtn.style.display = 'block';
                copyBtn.innerText = `Перенести з: ${prev.monthName} ${prev.year}`;
                subtitle.innerText = "У цьому місяці ще немає записів. Хочете перенести структуру та цифри з минулого місяця?";
            } else {
                copyBtn.style.display = 'none';
                subtitle.innerText = "Почніть планування бюджету, створивши порожню структуру. Минулих даних не знайдено.";
            }
        }
        updateDebtsDisplay();
    }

    // ==========================================
    // 6. ДОХОДЫ И КУРС
    // ==========================================

    const RULE_502030_ITEMS = [
        { pct: 50, share: 0.5, label: 'Потреби', color: 'var(--sys-blue)', bucket: 'needs', title: 'Базові потребності (Needs)', desc: 'Житло, комуналка, базові продукти, транспорт, мінімальні платежі по кредитах. Те, без чого не можна прожити.' },
        { pct: 30, share: 0.3, label: 'Бажання', color: '#ff9f0a', bucket: 'wants', title: 'Бажання (Wants)', desc: 'Ресторани, хобі, підписки, шопінг, розваги. Вільні гроші на радість без провини.' },
        { pct: 20, share: 0.2, label: 'Збереження', color: 'var(--sys-green)', bucket: 'savings', title: 'Збереження та борги (Savings)', desc: 'Дострокове погашення кредитів, фінансова подушка, інвестиції. Платите «майбутньому собі».' },
    ];

    const JAR_TYPE_LABELS = {
        regular: 'Звичайний',
        emergency: 'Подушка',
        investment: 'Інвестиції',
    };

    const BUDGET_BUCKET_LABELS = {
        needs: 'Потреби 50%',
        wants: 'Бажання 30%',
        savings: 'Заощадж. 20%',
        unassigned: 'Група',
    };

    function getJarTypeOptions() {
        return Object.entries(JAR_TYPE_LABELS).map(([value, label]) => ({ value, label }));
    }

    function buildDropdownOptionsHtml(items, selectedValue, actionBuilder) {
        return items.map(item => `
            <div class="custom-dropdown-option ${selectedValue === item.value ? 'selected' : ''}" ${actionBuilder(item.value)}>
                <span class="option-check">${selectedValue === item.value ? '✓' : ''}</span>
                <span class="option-label">${escapeHtml(item.label)}</span>
            </div>
        `).join('');
    }

    function buildJarTypeDropdownHtml(jarId, selectedValue, sizeClass) {
        const selectedLabel = JAR_TYPE_LABELS[selectedValue] || JAR_TYPE_LABELS.regular;
        const cls = sizeClass === 'compact' ? 'compact' : 'compact-xs';
        return `
            <div class="custom-dropdown ${cls}" data-stop-propagation="1" data-toggle-open="1">
                <div class="custom-dropdown-selected">${escapeHtml(selectedLabel)}</div>
                <div class="custom-dropdown-options">
                    ${buildDropdownOptionsHtml(getJarTypeOptions(), selectedValue, (val) => `data-action="selectJarTypeDropdown" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([jarId, val]))}"`)}
                </div>
            </div>
        `;
    }

    function buildBucketDropdownHtml(categoryId, selectedValue, disabled) {
        if (disabled) {
            return `<div class="custom-dropdown compact-xs bucket-dropdown is-disabled" aria-disabled="true">
                <div class="custom-dropdown-selected">${escapeHtml(BUDGET_BUCKET_LABELS[selectedValue] || BUDGET_BUCKET_LABELS.savings)}</div>
            </div>`;
        }
        const items = [
            { value: 'unassigned', label: 'Без групи' },
            { value: 'needs', label: BUDGET_BUCKET_LABELS.needs },
            { value: 'wants', label: BUDGET_BUCKET_LABELS.wants },
            { value: 'savings', label: BUDGET_BUCKET_LABELS.savings },
        ];
        const selectedLabel = selectedValue && selectedValue !== 'unassigned'
            ? (BUDGET_BUCKET_LABELS[selectedValue] || BUDGET_BUCKET_LABELS.unassigned)
            : 'Група';
        return `
            <div class="custom-dropdown compact-xs bucket-dropdown" data-stop-propagation="1" data-toggle-open="1">
                <div class="custom-dropdown-selected">${escapeHtml(selectedLabel)}</div>
                <div class="custom-dropdown-options">
                    ${buildDropdownOptionsHtml(items, selectedValue || 'unassigned', (val) => `data-action="selectCategoryBucket" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([categoryId, val]))}"`)}
                </div>
            </div>
        `;
    }

    function initNewJarTypeDropdown() {
        const optionsEl = document.getElementById('new-jar-type-options');
        if (!optionsEl) return;
        const current = document.getElementById('new-jar-type-value')?.value || 'regular';
        optionsEl.innerHTML = buildDropdownOptionsHtml(getJarTypeOptions(), current, (val) => `data-action="selectNewJarType" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([val]))}"`);
    }

    function selectNewJarType(event, value) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const valueEl = document.getElementById('new-jar-type-value');
        const displayEl = document.getElementById('new-jar-type-display');
        if (valueEl) valueEl.value = value;
        if (displayEl) displayEl.innerText = JAR_TYPE_LABELS[value] || JAR_TYPE_LABELS.regular;
        initNewJarTypeDropdown();
        event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
    }

    function selectJarTypeDropdown(event, jarId, value) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        setJarType(jarId, value);
        event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
    }

    function selectCategoryBucket(event, categoryId, bucket) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        setCategoryBudgetBucket(categoryId, bucket);
        event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
    }

    function recommendedSaveUah(incomeUah) {
        return Math.max(0, (Number(incomeUah) || 0) * 0.2);
    }

    function calc502030(incomeUah) {
        const income = Math.max(0, Number(incomeUah) || 0);
        return {
            needs: income * 0.5,
            wants: income * 0.3,
            savings: recommendedSaveUah(income),
        };
    }

    function monthExpenseTotalUah(expenseList) {
        const list = expenseList || expenses || [];
        return list.reduce((sum, exp) => {
            if (!exp?.items) return sum;
            return sum + getCategoryTotal(exp);
        }, 0);
    }

    function isEssentialCategory(cat) {
        return Boolean(cat?.isEssential) && !cat?.isSavings;
    }

    function hasEssentialCategories(expenseList) {
        const list = expenseList || expenses || [];
        return list.some(isEssentialCategory);
    }

    function monthEssentialTotalUah(expenseList) {
        const list = expenseList || expenses || [];
        return list.reduce((sum, exp) => {
            if (!isEssentialCategory(exp) || !exp.items) return sum;
            return sum + getCategoryTotal(exp);
        }, 0);
    }

    function monthWantsTotalUah(expenseList) {
        const list = expenseList || expenses || [];
        return list.reduce((sum, exp) => {
            if (!exp.items || exp.isSavings || isEssentialCategory(exp)) return sum;
            return sum + getCategoryTotal(exp);
        }, 0);
    }

    /** Cushion base = this month's essential (обов'язкові) spend. No silent income fallback. */
    function monthlyCushionBaseUah(_incomeUah, expenseList) {
        if (!hasEssentialCategories(expenseList)) return 0;
        return monthEssentialTotalUah(expenseList);
    }

    function getFinancialPlan() {
        if (!currentUser) return { desiredMonthlyUsd: 1500, brokerBalanceUsd: 0, returnRatePct: 7, jarTypes: {} };
        if (!currentUser.growthProfile) currentUser.growthProfile = {};
        if (!currentUser.growthProfile.financialPlan) {
            currentUser.growthProfile.financialPlan = {
                desiredMonthlyUsd: 1500,
                brokerBalanceUsd: 0,
                returnRatePct: 7,
                jarTypes: {},
            };
        }
        if (!currentUser.growthProfile.financialPlan.jarTypes) {
            currentUser.growthProfile.financialPlan.jarTypes = {};
        }
        return currentUser.growthProfile.financialPlan;
    }

    let financialPlanSaveTimer = null;
    function updateFinancialPlanField(field, value) {
        const fp = getFinancialPlan();
        fp[field] = parseFloat(value) || 0;
        if (financialPlanSaveTimer) clearTimeout(financialPlanSaveTimer);
        financialPlanSaveTimer = setTimeout(() => saveFinancialPlan(), 600);
        renderFinancialPlanBlock();
    }

    async function saveFinancialPlan() {
        if (!currentUser) return;
        const fp = getFinancialPlan();
        const profile = { ...(currentUser.growthProfile || {}), financialPlan: fp };
        currentUser.growthProfile = profile;
        try {
            const response = await apiFetch('/api/profile', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, growthProfile: profile }),
            });
            if (!response.ok) {
                let data = {};
                try { data = await response.json(); } catch (e) {}
                alert(`Не вдалося зберегти фінансовий план: ${data.error || 'помилка сервера'}`);
            }
        } catch (e) {
            console.error('Помилка збереження фінплану', e);
            alert("Не вдалося зберегти фінансовий план через помилку з'єднання.");
        }
    }

    function getJarType(jar) {
        const fp = getFinancialPlan();
        return fp.jarTypes[String(jar.id)] || 'regular';
    }

    function setJarType(jarId, type) {
        const fp = getFinancialPlan();
        fp.jarTypes[String(jarId)] = type;
        saveFinancialPlan();
        renderEnvelopes();
        renderFinancialPlanBlock();
        updateSavingsDisplay();
    }

    function getCategoryBudgetBucket(cat) {
        if (cat.budgetBucket) return cat.budgetBucket;
        if (cat.isSavings) return 'savings';
        if (cat.name === "Погашення боргів") return 'savings';
        return 'unassigned';
    }

    function setCategoryBudgetBucket(categoryId, bucket) {
        const cat = findExpenseById(categoryId);
        if (!cat) return;
        if (bucket === 'unassigned') delete cat.budgetBucket;
        else cat.budgetBucket = bucket;
        saveData();
        renderExpenses();
        renderFinancialPlanBlock();
    }

    function get502030Actuals() {
        return get502030ActualsFromExpenses(expenses);
    }

    function get502030ActualsFromExpenses(expenseList) {
        const actuals = { needs: 0, wants: 0, savings: 0, unassigned: 0 };
        (expenseList || []).forEach(exp => {
            const bucket = getCategoryBudgetBucket(exp);
            if (bucket === 'needs' || bucket === 'wants' || bucket === 'savings') {
                actuals[bucket] += getCategoryTotal(exp);
            } else {
                actuals.unassigned += getCategoryTotal(exp);
            }
        });
        return actuals;
    }

    function getCushionBalanceUah() {
        const jars = globalData.jars[currentUser?.id] || [];
        return jars.filter(j => getJarType(j) === 'emergency').reduce((sum, j) => sum + (parseFloat(j.balance) || 0), 0);
    }

    function listRunwayMonthsChrono() {
        const now = new Date();
        return listRunwayMonths(appData, now.getFullYear(), now.getMonth());
    }

    function monthPillowDepositUah(year, month) {
        if (!currentUser) return 0;
        const data = appData[year]?.[month];
        if (!data) return 0;
        const jars = (globalData.jars[currentUser.id] || []).filter((j) => getJarType(j) === 'emergency');
        return sumEmergencyDeposits(data.expenses, jars);
    }

    function monthDebtPaidUah(year, month) {
        const data = appData[year]?.[month];
        if (!data) return 0;
        return sumDebtPayments(data.expenses);
    }

    function monthDebtRemainingUah(year, month, todayStamp) {
        if (!currentUser) return 0;
        const debts = globalData.debts[currentUser.id] || [];
        let uah = 0;
        debts.forEach((d) => {
            const remaining = debtRemainingInMonth(
              d,
              year,
              month,
              getDebtPaidThrough(d.id, year, month),
              todayStamp,
            );
            if (d.currency === 'USD') {
                if (currentExchangeRate > 0) uah += remaining * currentExchangeRate;
            } else {
                uah += remaining;
            }
        });
        return uah;
    }

    function buildRunwaySnapshot() {
        if (!currentUser || currentUser.account_type === 'business') {
            return { points: [], pillowTarget: 0, pillowNow: 0, pillowAvg: 0, pillowNowLabel: '—', pillowForecast: { kind: 'stalled' }, hasDebts: false, debtNow: 0, debtAvg: 0, debtNowLabel: '—', debtForecast: { kind: 'stalled' }, incomeUah: 0, essentialsUah: 0, wantsUah: 0 };
        }
        const months = listRunwayMonthsChrono();
        const pillowNow = getCushionBalanceUah();
        const essentialsMarked = hasEssentialCategories();
        const pillowTarget = essentialsMarked ? monthlyCushionBaseUah(currentIncomeUah) * 6 : 0;
        const deposits = months.map((p) => monthPillowDepositUah(p.year, p.month));
        const stocks = reconstructStock(pillowNow, deposits);
        const payments = months.map((p) => monthDebtPaidUah(p.year, p.month));
        const debts = globalData.debts[currentUser.id] || [];
        const hasDebts = debts.length > 0;
        const last = months[months.length - 1] || { year: currentYear, month: currentMonth };
        const todayStamp = last.year * 100 + last.month;
        const fromDebts = months.map((p) => monthDebtRemainingUah(p.year, p.month, todayStamp));
        const debtNow = hasDebts ? monthDebtRemainingUah(last.year, last.month, todayStamp) : 0;
        const fromPaydowns = reconstructDrawdown(debtNow, payments);
        const remainings = months.map((_, i) => Math.max(fromDebts[i] ?? 0, fromPaydowns[i] ?? 0));
        const points = months.map((p, i) => ({
            year: p.year,
            month: p.month,
            label: runwayMonthLabel(p.year, p.month),
            pillow: stocks[i] ?? 0,
            debt: remainings[i] ?? 0,
        }));
        const pillowAvg = trailingAverage(deposits, 3);
        const debtAvg = trailingAverage(payments, 3);
        const pillowForecast = pillowTarget > 0
            ? forecastFinish(Math.max(0, pillowTarget - pillowNow), pillowAvg, last.year, last.month)
            : { kind: 'no-target' };
        const debtForecast = hasDebts
            ? forecastFinish(debtNow, debtAvg, last.year, last.month)
            : { kind: 'done' };
        return {
            points,
            pillowTarget,
            pillowNow,
            pillowAvg,
            pillowNowLabel: pillowTarget > 0
                ? `${formatMoney(pillowNow)} / ${formatMoney(pillowTarget)} ₴`
                : `${formatMoney(pillowNow)} ₴`,
            pillowForecast,
            hasDebts,
            debtNow,
            debtAvg,
            debtNowLabel: `${formatMoney(debtNow)} ₴`,
            debtForecast,
            incomeUah: currentIncomeUah || 0,
            essentialsUah: monthEssentialTotalUah(),
            wantsUah: monthWantsTotalUah(),
        };
    }

    window.__getRunwaySnapshot = buildRunwaySnapshot;

    function getInvestmentJarsBalanceUah() {
        const jars = globalData.jars[currentUser?.id] || [];
        return jars.filter(j => getJarType(j) === 'investment').reduce((sum, j) => sum + (parseFloat(j.balance) || 0), 0);
    }

    function uahToUsd(uah) {
        return currentExchangeRate > 0 ? uah / currentExchangeRate : 0;
    }

    function usdToUah(usd) {
        return usd * (currentExchangeRate || 0);
    }

    function calcYearsToCapital(fvUsd, pvUsd, monthlyPmtUsd, ratePct) {
        const r = (ratePct || 7) / 100;
        const pmtAnnual = monthlyPmtUsd * 12;
        if (fvUsd <= 0) return null;
        if (pvUsd >= fvUsd) return 0;
        if (pmtAnnual <= 0 && pvUsd <= 0) return null;

        if (Math.abs(r) < 0.0001) {
            return (fvUsd - pvUsd) / pmtAnnual;
        }

        const numerator = fvUsd * r + pmtAnnual;
        const denominator = pvUsd * r + pmtAnnual;
        if (numerator <= 0 || denominator <= 0 || numerator <= denominator) return null;

        return Math.log(numerator / denominator) / Math.log(1 + r);
    }

    function formatYearsLabel(years) {
        if (years === null || years === undefined || !isFinite(years)) return '—';
        if (years <= 0) return 'Досягнуто';
        if (years < 1) return '< 1 року';
        return `~${Math.round(years)} ${years >= 5 ? 'років' : years >= 2 ? 'роки' : 'рік'}`;
    }

    function fpProgressBar(pct, color) {
        const w = Math.min(100, Math.max(0, pct));
        return `<div class="fp-progress"><div class="fp-progress-fill" style="width:${w}%;background:${color}"></div></div>`;
    }

    function toggleRule502030Details(e) {
        if (e) e.stopPropagation();
        const panel = document.getElementById('rule-502030-details');
        if (panel) panel.classList.toggle('open');
    }

    function toggleFinancialPlanSettings(e) {
        if (e) e.stopPropagation();
        const panel = document.getElementById('fp-settings-panel');
        if (panel) panel.classList.toggle('open');
    }

    function renderFinancialPlanBlock() {
        const block = document.getElementById('rule-502030-block');
        if (!block) return;

        const isBiz = currentUser && currentUser.account_type === 'business';
        const initialized = appData[currentYear]?.[currentMonth]?.initialized;

        if (isBiz || !initialized || !currentUser) {
            block.style.display = 'none';
            return;
        }

        block.style.display = 'block';
        const income = currentIncomeUah || 0;
        const fp = getFinancialPlan();

        if (income <= 0) {
            block.innerHTML = `
                <div class="rule-502030-header">
                    <span class="rule-502030-title">Фінансовий план</span>
                </div>
                <div class="rule-502030-empty">Додайте доходи, щоб побачити, скільки варто відкласти цього місяця.</div>
            `;
            return;
        }

        const saveRec = recommendedSaveUah(income);
        const essentialsMarked = hasEssentialCategories();
        const monthlyNeedsForCushion = monthlyCushionBaseUah(income);
        const cushionTarget = essentialsMarked ? monthlyNeedsForCushion * 6 : 0;
        const cushionActual = getCushionBalanceUah();
        const cushionPct = cushionTarget > 0 ? (cushionActual / cushionTarget) * 100 : 0;
        const cushionBasisLabel = essentialsMarked
            ? `6 × обов'язкові витрати цього місяця (${formatMoney(monthlyNeedsForCushion)} ₴/міс)`
            : `Позначте обов'язкові витрати в категоріях — тоді з'явиться ціль подушки (6 місяців).`;
        const cushionTargetLabel = essentialsMarked ? `${formatMoney(cushionTarget)} ₴` : '—';

        const capitalTargetUsd = (fp.desiredMonthlyUsd || 0) * 12 * 25;
        const capitalCurrentUsd = (fp.brokerBalanceUsd || 0) + uahToUsd(getInvestmentJarsBalanceUah());
        const capitalPct = capitalTargetUsd > 0 ? (capitalCurrentUsd / capitalTargetUsd) * 100 : 0;

        const monthlyInvestUsd = uahToUsd(saveRec);
        const yearsToCapital = calcYearsToCapital(capitalTargetUsd, capitalCurrentUsd, monthlyInvestUsd, fp.returnRatePct);

        block.innerHTML = `
            <div class="rule-502030-header">
                <span class="rule-502030-title">Фінансовий план</span>
                <div style="display:flex;gap:6px;">
                    <button type="button" class="rule-502030-info-btn" data-action="toggleFinancialPlanSettings" data-pass-event="1" title="Налаштування">⚙</button>
                </div>
            </div>
            <div class="rule-502030-row">
                <span class="rule-502030-row-label">Рекомендовано відкласти цього місяця</span>
                <span class="rule-502030-row-amount tabular">${formatMoney(saveRec)} ₴</span>
            </div>

            <div id="fp-settings-panel" class="rule-502030-details">
                <div class="fp-input-row">
                    <div class="fp-input-wrap">
                        <label>Бажані витрати на місяць ($)</label>
                        <input type="number" value="${fp.desiredMonthlyUsd || ''}" data-change-action="updateFinancialPlanField" data-args="${escapeAttr(JSON.stringify(['desiredMonthlyUsd']))}">
                    </div>
                    <div class="fp-input-wrap">
                        <label>Брокерський рахунок ($)</label>
                        <input type="number" value="${fp.brokerBalanceUsd || ''}" data-change-action="updateFinancialPlanField" data-args="${escapeAttr(JSON.stringify(['brokerBalanceUsd']))}">
                    </div>
                    <div class="fp-input-wrap">
                        <label>Очікувана дохідність (%/рік)</label>
                        <input type="number" value="${fp.returnRatePct || 7}" data-change-action="updateFinancialPlanField" data-args="${escapeAttr(JSON.stringify(['returnRatePct']))}">
                    </div>
                </div>
                <div class="rule-502030-detail-item"><strong>Правило ×25:</strong> ${formatMoney(fp.desiredMonthlyUsd || 0)} × 12 × 25 = ${formatMoney(capitalTargetUsd)} $ цільовий капітал</div>
            </div>

            <div class="fp-section">
                <div class="fp-section-title">Подушка безпеки (6 міс. обов'язкових витрат)</div>
                <div class="fp-stat-row">
                    <span class="fp-stat-label">Накопичено / ціль</span>
                    <span class="fp-stat-value tabular">${formatMoney(cushionActual)} / ${cushionTargetLabel}</span>
                </div>
                ${essentialsMarked ? fpProgressBar(cushionPct, 'var(--sys-blue)') : ''}
                <div class="rule-502030-detail-item" style="margin:0;">${cushionBasisLabel}</div>
                <div class="rule-502030-detail-item" style="margin:0;"><strong>Недоторканна:</strong> конверти типу «Подушка безпеки»</div>
            </div>

            <div class="fp-section">
                <div class="fp-section-title">Особистий капітал (правило ×25)</div>
                <div class="fp-stat-row">
                    <span class="fp-stat-label">Накопичено / ціль</span>
                    <span class="fp-stat-value tabular">${formatMoney(capitalCurrentUsd)} / ${formatMoney(capitalTargetUsd)} $</span>
                </div>
                ${fpProgressBar(capitalPct, 'var(--sys-green)')}
                <div class="fp-stat-row">
                    <span class="fp-stat-label">При ${formatMoney(monthlyInvestUsd)} $/міс (рекомендовано відкласти)</span>
                    <span class="fp-stat-value">${formatYearsLabel(yearsToCapital)}</span>
                </div>
                ${currentExchangeRate > 0 ? `<div class="fp-stat-row"><span class="fp-stat-label">≈ в ₴</span><span class="fp-stat-value tabular">${formatMoney(usdToUah(capitalTargetUsd))} ₴</span></div>` : ''}
            </div>

        `;
    }

    const render502030Guide = renderFinancialPlanBlock;

    async function fetchExchangeRate() {
        const rateEl = document.getElementById('rate-info');
        try {
            const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json');
            const data = await response.json();
            if (data && data.length > 0 && data[0].rate) {
                currentExchangeRate = data[0].rate;
                const dateStr = data[0].exchangedate || '';
                if (rateEl) {
                    rateEl.style.color = '';
                    rateEl.innerText = `НБУ: ${formatMoney(currentExchangeRate)} ₴ ${dateStr ? '• ' + dateStr : ''}`;
                }
                convertCurrency();
                return;
            }
            currentExchangeRate = 0;
            updateMissingRateBanner();
        } catch (error) {
            currentExchangeRate = 0;
            updateMissingRateBanner();
        }
    }

    function monthHasUsdIncome() {
        const incomes = appData[currentYear]?.[currentMonth]?.incomes || [];
        return incomes.some(inc => inc.currency === 'USD' && (parseFloat(inc.amount) || 0) > 0);
    }

    function updateMissingRateBanner() {
        const rateEl = document.getElementById('rate-info');
        if (!rateEl || currentExchangeRate > 0) return;
        rateEl.style.color = 'var(--sys-red)';
        rateEl.innerText = monthHasUsdIncome()
            ? 'Немає курсу НБУ — доходи в $ = 0 ₴'
            : 'Курс НБУ недоступний';
    }

    function selectCurrency(event, incId, currencyCode) {
        if(event) event.stopPropagation();
        updateIncome(incId, 'currency', currencyCode);
    }

    function ensureIncomeIds(incomes) {
        if (!Array.isArray(incomes)) return [];
        incomes.forEach((inc) => {
            if (!inc.id && inc.id !== 0) inc.id = newId();
        });
        return incomes;
    }

    function bindIncomeField(el, inc, field) {
        if (!el) return;
        el.addEventListener('input', () => {
            if (field === 'amount' || field === 'actual_balance') {
                inc[field] = parseFloat(el.value) || 0;
            } else {
                inc[field] = el.value;
            }
            saveData();
            convertCurrency();
            if (field === 'currency') renderIncomes();
        });
    }

function renderIncomes() {
        const container = document.getElementById('incomes-container');
        if(!container) return;
        container.innerHTML = '';
        if(!appData[currentYear] || !appData[currentYear][currentMonth] || !appData[currentYear][currentMonth].initialized) return;

        const isBiz = currentUser && currentUser.account_type === 'business';
        const incomes = ensureIncomeIds(appData[currentYear][currentMonth].incomes || []);
        appData[currentYear][currentMonth].incomes = incomes;
        
        incomes.forEach(inc => {
            if (inc.source === 'monobank') {
                if (!inc.currency) inc.currency = 'UAH';
                const row = document.createElement('div');
                row.className = 'expense-item income-mono';
                row.style = 'padding: 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;';
                row.innerHTML = `
                    <div class="income-mono-main">
                        <span class="mono-mark" role="img" aria-label="Монобанк">m</span>
                        <input type="text" class="input-name income-name" value="${escapeHtml(inc.name || '')}" readonly tabindex="-1">
                    </div>
                    <input type="text" class="input-name tabular income-amount" value="${escapeHtml(formatMoney(parseFloat(inc.amount) || 0))}" readonly tabindex="-1" style="text-align: right; width: 120px; flex-shrink: 0;">
                    <span class="income-currency-lock">UAH</span>
                    <button type="button" class="btn-delete income-delete" style="width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
                const delBtn = row.querySelector('.income-delete');
                if (delBtn) {
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        deleteIncome(inc.id);
                    });
                }
                container.appendChild(row);
                return;
            }
            if (!inc.currency) inc.currency = 'UAH';
            const div = document.createElement('div');
            div.className = 'expense-item'; 
            
if (isBiz) {
                // НОВЫЙ ДИЗАЙН ДЛЯ БИЗНЕСА (Красивая карточка)
                div.style = "padding: 16px; margin-bottom: 16px; flex-direction: column; align-items: stretch; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);";
                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%;">
                        <input type="text" class="input-name income-name" value="${escapeHtml(inc.name || '')}" placeholder="Назва рахунку (напр. ФОП)" style="flex: 1; height: 48px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 0 16px; font-size: 16px; font-weight: 600; color: white; outline: none; transition: 0.3s;">
                        
                        <div style="display: flex; gap: 8px; flex-shrink: 0;">
                            <div class="custom-dropdown income-currency-dd" data-stop-propagation="1" data-toggle-open="1" style="width: 85px;">
                                <div class="custom-dropdown-selected" style="height: 48px; padding: 0 28px 0 12px; border-radius: 14px; font-size: 14px;">${escapeHtml(inc.currency)}</div>
                                <div class="custom-dropdown-options" style="min-width: 85px;">
                                    <div class="custom-dropdown-option ${inc.currency === 'UAH' ? 'selected' : ''}" data-action="selectIncomeCurrency" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([inc.id, 'UAH']))}"><span class="option-check">${inc.currency === 'UAH' ? '✓' : ''}</span><span class="option-label">UAH</span></div>
                                    <div class="custom-dropdown-option ${inc.currency === 'USD' ? 'selected' : ''}" data-action="selectIncomeCurrency" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([inc.id, 'USD']))}"><span class="option-check">${inc.currency === 'USD' ? '✓' : ''}</span><span class="option-label">USD</span></div>
                                </div>
                            </div>
                            <button type="button" class="btn-delete income-delete" style="width: 48px; height: 48px; border-radius: 14px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; width: 100%;">
                        <div style="flex: 1; background: rgba(0,0,0,0.3); padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-size: 12px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Обіг</div>
                                <div id="inc-percent-${escapeAttr(String(inc.id))}" style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px;">0.0%</div>
                            </div>
                            <input type="number" class="tabular income-amount" value="${inc.amount || ''}" placeholder="0" style="width: 100%; background: transparent; border: none; outline: none; font-size: 22px; font-weight: 700; color: white; padding: 0;">
                        </div>
                        <div style="flex: 1; background: linear-gradient(135deg, rgba(10, 132, 255, 0.1), rgba(10, 132, 255, 0.05)); padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(10, 132, 255, 0.2); transition: 0.3s;">
                            <div style="font-size: 12px; color: var(--sys-blue); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Факт. залишок</div>
                            <input type="number" class="tabular income-actual" value="${inc.actual_balance || ''}" placeholder="0" style="width: 100%; background: transparent; border: none; outline: none; font-size: 22px; font-weight: 700; color: var(--sys-blue); padding: 0;">
                        </div>
                    </div>
                `;
            } else {
                // СТАРЫЙ ДИЗАЙН ДЛЯ ФИЗЛИЦ (Компактная строка)
                div.style = "padding: 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;";
                div.innerHTML = `
                    <input type="text" class="input-name income-name" value="${escapeHtml(inc.name || '')}" placeholder="Назва" style="flex: 1; min-width: 100px;">
                    <input type="number" class="input-name tabular income-amount" value="${inc.amount || ''}" placeholder="0" style="text-align: right; margin: 0 8px; width: 100px;">
                    
                    <div class="custom-dropdown income-currency-dd" data-stop-propagation="1" data-toggle-open="1" style="width: 90px; flex-shrink: 0;">
                        <div class="custom-dropdown-selected" style="height: 48px; padding: 0 30px 0 12px; border-radius: 14px; font-size: 14px;">${escapeHtml(inc.currency)}</div>
                        <div class="custom-dropdown-options" style="min-width: 90px;">
                            <div class="custom-dropdown-option ${inc.currency === 'UAH' ? 'selected' : ''}" data-action="selectIncomeCurrency" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([inc.id, 'UAH']))}"><span class="option-check">${inc.currency === 'UAH' ? '✓' : ''}</span><span class="option-label">UAH</span></div>
                            <div class="custom-dropdown-option ${inc.currency === 'USD' ? 'selected' : ''}" data-action="selectIncomeCurrency" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([inc.id, 'USD']))}"><span class="option-check">${inc.currency === 'USD' ? '✓' : ''}</span><span class="option-label">USD</span></div>
                        </div>
                    </div>
                    <button type="button" class="btn-delete income-delete" style="width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
            }

            // Bind by object reference — no fragile id lookup via inline handlers.
            bindIncomeField(div.querySelector('.income-name'), inc, 'name');
            bindIncomeField(div.querySelector('.income-amount'), inc, 'amount');
            bindIncomeField(div.querySelector('.income-actual'), inc, 'actual_balance');

            const delBtn = div.querySelector('.income-delete');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteIncome(inc.id);
                });
            }

            container.appendChild(div);
        });
    }

 function addIncome() {
        if(!appData[currentYear][currentMonth].incomes) appData[currentYear][currentMonth].incomes = [];
        appData[currentYear][currentMonth].incomes.push({id: newId(), name: 'Новий', amount: 0, actual_balance: 0, currency: 'UAH'});
        saveData();
        renderIncomes();
        convertCurrency();
    }

    function updateIncome(id, field, value) {
        const list = ensureIncomeIds(appData[currentYear]?.[currentMonth]?.incomes || []);
        if (appData[currentYear]?.[currentMonth]) appData[currentYear][currentMonth].incomes = list;
        const inc = list.find(i => sameId(i.id, id));
        if (!inc || inc.source === 'monobank') {
            if (!inc) console.warn('updateIncome: income not found', id, field, value);
            return;
        }
        inc[field] = (field === 'amount' || field === 'actual_balance') ? parseFloat(value) || 0 : value;
        saveData();
        convertCurrency();
        if (field === 'currency') renderIncomes();
    }

    function selectIncomeCurrency(event, incomeId, code) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        const list = appData[currentYear]?.[currentMonth]?.incomes || [];
        const inc = list.find(i => sameId(i.id, incomeId));
        if (!inc || inc.source === 'monobank' || !code) return;
        inc.currency = code;
        event?.target?.closest?.('.custom-dropdown')?.classList.remove('open');
        saveData();
        convertCurrency();
        renderIncomes();
    }

    /**
     * A month the user has not started. Pass `invoices: []` only when the month's invoices are
     * known to be empty: an `invoices` array is synced (and replaces the server list) on save.
     */
    function createEmptyMonth(extra = {}) {
        return { initialized: false, incomes: [], expenses: [], cogs: normalizeCogs(), payroll: [], ...extra };
    }

    function normalizeCogs(cogs) {
        const src = cogs && typeof cogs === 'object' ? cogs : {};
        const hours = parseFloat(src.businessHours);
        return {
            type: src.type === 'fixed' ? 'fixed' : 'percent',
            value: parseFloat(src.value) || 0,
            businessHours: Number.isFinite(hours) && hours > 0 ? hours : 8,
        };
    }

    function getHoursPerDay(cogs) {
        const hours = parseFloat(cogs?.businessHours);
        return Number.isFinite(hours) && hours > 0 ? hours : 8;
    }

    function getRateWorkingDays() {
        const isBiz = currentUser && currentUser.account_type === 'business';
        return isBiz
            ? countDaysInMonth(currentYear, currentMonth)
            : countWeekdaysInMonth(currentYear, currentMonth);
    }

    function syncBusinessHoursInput(cogs) {
        const input = document.getElementById('business-hours-input');
        if (input) input.value = String(getHoursPerDay(cogs));
    }

    function updateRateCalcHint(workingDays, hoursPerDay) {
        const hint = document.getElementById('rate-calc-hint');
        if (!hint) return;
        const days = workingDays || getRateWorkingDays();
        const hours = hoursPerDay || getHoursPerDay(appData[currentYear]?.[currentMonth]?.cogs);
        const isBiz = currentUser && currentUser.account_type === 'business';
        if (isBiz) {
            hint.innerText = `День = обіг ÷ ${days} дн. місяця (бізнес без вихідних).\nГодина = обіг ÷ (${days} × ${hours}).`;
        } else {
            hint.innerText = `День = дохід ÷ ${days} будніх (пн–пт цього місяця).\nГодина = дохід ÷ (${days} × ${hours}).`;
        }
    }

    function updateBusinessHours(val) {
        if (!appData[currentYear][currentMonth].cogs) {
            appData[currentYear][currentMonth].cogs = normalizeCogs();
        }
        const hours = parseFloat(val);
        if (!Number.isFinite(hours) || hours <= 0) return;
        appData[currentYear][currentMonth].cogs.businessHours = hours;
        saveData();
        updateAll();
    }

    function deleteIncome(id) {
        appData[currentYear][currentMonth].incomes = appData[currentYear][currentMonth].incomes.filter(i => !sameId(i.id, id));
        saveData();
        renderIncomes();
        convertCurrency();
    }

function convertCurrency() {
        if(!appData[currentYear] || !appData[currentYear][currentMonth] || !appData[currentYear][currentMonth].initialized) {
            updateMissingRateBanner();
            return;
        }

        let totalUah = 0;
        let totalUsdEquivalent = 0;

        const incomes = appData[currentYear][currentMonth].incomes || [];
        incomes.forEach(inc => {
            const amt = parseFloat(inc.amount) || 0;
            if (inc.currency === 'USD') {
                totalUah += (amt * currentExchangeRate);
                totalUsdEquivalent += amt;
            } else {
                totalUah += amt;
                totalUsdEquivalent += (currentExchangeRate > 0 ? amt / currentExchangeRate : 0);
            }
        });
        
        currentIncomeUah = totalUah; 
        window.currentIncomeUsd = totalUsdEquivalent; 
        
        // ОНОВЛЮЄМО ВІДСОТКИ У РЕАЛЬНОМУ ЧАСІ
        incomes.forEach(inc => {
            const amt = parseFloat(inc.amount) || 0;
            const incAmountUah = inc.currency === 'USD' ? (amt * currentExchangeRate) : amt;
            const percent = totalUah > 0 ? ((incAmountUah / totalUah) * 100).toFixed(1) : 0;
            
            const badge = document.getElementById(`inc-percent-${inc.id}`);
            if (badge) badge.innerText = percent + '%';
        });

        updateMissingRateBanner();
        updateDebtsDisplay();
        updateAll(); 
    }

    function updateCOGS(val) {
        if (!appData[currentYear][currentMonth].cogs) appData[currentYear][currentMonth].cogs = normalizeCogs();
        appData[currentYear][currentMonth].cogs.value = parseFloat(val) || 0;
        saveData();
        updateAll();
    }

    function selectCOGSType(event, type) {
        if(event) event.stopPropagation();
        if (!appData[currentYear][currentMonth].cogs) appData[currentYear][currentMonth].cogs = normalizeCogs();
        appData[currentYear][currentMonth].cogs.type = type;
        document.getElementById('cogs-type-display').innerText = type === 'percent' ? '%' : 'Фікс (₴)';
        document.getElementById('cogs-type-display').closest('.custom-dropdown').classList.remove('open');
        saveData();
        updateAll();
    }

    // ==========================================
    // 7. РАСХОДЫ И МАТЕМАТИКА
    // ==========================================
    function getCategoryTotal(category) {
        return (category.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }

    /** 'percent' (of the month's income), 'fixed' (₴) or 'none'. */
    function categoryLimitMode(category) {
        if (category?.limitType === 'percent' && Number(category.limitPct) > 0) return 'percent';
        const limit = Number(category?.limit);
        return Number.isFinite(limit) && limit > 0 ? 'fixed' : 'none';
    }

    /** The cap in ₴. A percent limit follows the month's income: 0 ₴ while there is no income. */
    function categoryLimitNumber(category, incomeUah = getMonthIncomeUah(currentYear, currentMonth)) {
        const mode = categoryLimitMode(category);
        if (mode === 'percent') return roundMoney((Math.max(0, incomeUah) * Number(category.limitPct)) / 100);
        if (mode === 'fixed') return Number(category.limit);
        return 0;
    }

    function categoryIsOverLimit(category) {
        if (categoryLimitMode(category) === 'none') return false;
        return getCategoryTotal(category) > categoryLimitNumber(category);
    }

    /** Stores each percent limit's current ₴ value, so the server's limit alerts need no exchange rate. */
    function syncPercentLimits(list, incomeUah) {
        (list || []).forEach((category) => {
            if (categoryLimitMode(category) === 'percent') category.limit = categoryLimitNumber(category, incomeUah);
        });
    }

    function formatLimitMoney(value) {
        return `${formatMoney(value).replace(/,00$/, '')} ₴`;
    }

    function formatLimitPercent(value) {
        return `${String(Math.round(value * 10) / 10).replace('.', ',')}%`;
    }

    /** Card label for a limit, plus the other unit shown on hover (tap on phones). */
    function categoryLimitLabels(category) {
        const mode = categoryLimitMode(category);
        if (mode === 'none') return null;
        const income = getMonthIncomeUah(currentYear, currentMonth);
        const amount = categoryLimitNumber(category, income);
        if (mode === 'percent') {
            return {
                main: `Ліміт ${formatLimitPercent(Number(category.limitPct))} доходу`,
                alt: income > 0 ? `≈ ${formatLimitMoney(amount)}` : 'дохід не внесено — 0 ₴',
            };
        }
        return {
            main: `Ліміт ${formatLimitMoney(amount)}`,
            alt: income > 0 ? `≈ ${formatLimitPercent((amount / income) * 100)} доходу` : 'дохід ще не внесено',
        };
    }

    function limitChipHtml(category) {
        const labels = categoryLimitLabels(category);
        if (!labels) return '<span class="expense-limit-chip is-empty">Без ліміту</span>';
        return `<button type="button" class="expense-limit-chip" data-action="toggleLimitView" data-pass-event="1" title="${escapeHtml(labels.alt)}" aria-label="${escapeHtml(`${labels.main}, ${labels.alt}`)}">`
            + `<span class="limit-main">${escapeHtml(labels.main)}</span><span class="limit-alt">${escapeHtml(labels.alt)}</span></button>`;
    }

    /** Phones have no hover: a tap flips the label between ₴ and %. */
    function toggleLimitView(event) {
        event?.stopPropagation?.();
        event?.target?.closest?.('.expense-limit-chip')?.classList.toggle('show-alt');
    }

    function syncCategoryLimitState(category) {
        if (!category) return;
        const card = document.querySelector(`.expense-card-pro[data-category-id="${CSS.escape(String(category.id))}"]`);
        if (!card) return;
        const chip = card.querySelector('.expense-limit-chip');
        if (chip) chip.outerHTML = limitChipHtml(category);
        const over = categoryIsOverLimit(category);
        card.classList.toggle('is-over-limit', over);
        let note = card.querySelector('.expense-limit-over');
        if (over && !note) {
            note = document.createElement('div');
            note.className = 'expense-limit-over';
            note.textContent = 'Вийшли за ліміт';
            card.querySelector('.expense-pro-title-group')?.append(note);
        } else if (!over && note) {
            note.remove();
        }
    }

    function getEmployeePayType(emp) {
        return emp && emp.pay_type === 'fixed' ? 'fixed' : 'hourly';
    }

    function getEmployeeAccrued(emp) {
        if (!emp) return 0;
        const bonus = parseFloat(emp.bonus) || 0;
        const penalty = parseFloat(emp.penalty) || 0;
        const rate = parseFloat(emp.rate) || 0;
        const base = getEmployeePayType(emp) === 'fixed'
            ? rate
            : rate * (parseFloat(emp.hours) || 0);
        return base + bonus - penalty;
    }

    function getEmployeeAlreadyPaid(emp) {
        if (!emp) return 0;
        if (emp.paid_amount !== undefined && emp.paid_amount !== null && emp.paid_amount !== '') {
            return parseFloat(emp.paid_amount) || 0;
        }
        return (parseFloat(emp.advance) || 0) + (parseFloat(emp.paid_part) || 0);
    }

    function getEmployeePaidCash(emp) {
        if (!emp) return 0;
        const accrued = getEmployeeAccrued(emp);
        return emp.is_paid ? accrued : getEmployeeAlreadyPaid(emp);
    }

    function getPayrollAccruedFromList(payroll) {
        if (!Array.isArray(payroll)) return 0;
        return payroll.reduce((sum, emp) => sum + getEmployeeAccrued(emp), 0);
    }

    function getMonthIncomeUahFromData(data) {
        if (!data) return 0;
        if (data.incomes && data.incomes.length > 0) {
            return data.incomes.reduce((sum, inc) => {
                const amt = parseFloat(inc.amount) || 0;
                return sum + (inc.currency === 'USD' ? amt * currentExchangeRate : amt);
            }, 0);
        }
        return (parseFloat(data.usd) || 0) * currentExchangeRate;
    }

    function getMonthPurchasesUah(data, incomeUah = 0) {
        if (!data) return 0;
        if (data.invoices && data.invoices.length > 0) {
            return data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        }
        if (data.cogs) {
            return data.cogs.type === 'percent'
                ? incomeUah * ((parseFloat(data.cogs.value) || 0) / 100)
                : (parseFloat(data.cogs.value) || 0);
        }
        return 0;
    }

    function getMonthExpensesUahFromData(data) {
        if (!data?.expenses) return 0;
        return data.expenses.reduce(
            (sum, exp) => sum + (exp.items || []).reduce((s, item) => s + (parseFloat(item.amount) || 0), 0),
            0
        );
    }

    function getMonthNetProfit(year, month) {
        if (!appData[year] || !appData[year][month] || !appData[year][month].initialized) return 0;
        const data = appData[year][month];
        const isBiz = currentUser && currentUser.account_type === 'business';
        const income = getMonthIncomeUahFromData(data);
        const purchases = isBiz ? getMonthPurchasesUah(data, income) : 0;
        const expensesTotal = getMonthExpensesUahFromData(data);
        const payroll = isBiz ? getPayrollAccruedFromList(data.payroll) : 0;
        return income - purchases - expensesTotal - payroll;
    }

    function getHistoricalCogs(year, month) {
        if (!appData[year] || !appData[year][month] || !appData[year][month].initialized) return 0;
        const data = appData[year][month];
        return getMonthPurchasesUah(data, getMonthIncomeUahFromData(data));
    }

    function getHistoricalProfit(year, month) {
        return getMonthNetProfit(year, month);
    }

    function generateProfitSparklineHTML(currentTotal) {
        const monthsBack = 3;
        const dataPoints = [];
        const labels = [];
        
        let tempY = currentYear;
        let tempM = currentMonth;
        
        for (let i = 0; i < monthsBack; i++) {
            labels.unshift(monthNames[tempM].substring(0, 3));
            if (i === 0) {
                dataPoints.unshift(currentTotal);
            } else {
                dataPoints.unshift(getHistoricalProfit(tempY, tempM));
            }
            tempM--;
            if (tempM < 0) { tempM = 11; tempY--; }
        }
        
        const prevTotal = dataPoints[monthsBack - 2];
        let trendHtml = '';
        let colorMain = currentTotal >= 0 ? '#32d74b' : '#ffffff'; 
        
        // Вираховуємо різницю в грошах
        const rawDiff = currentTotal - prevTotal;
        const diffSign = rawDiff > 0 ? '+' : '';
        const diffMoneyText = `${diffSign}${formatMoney(rawDiff)} ₴`;

        if (prevTotal === 0 && currentTotal !== 0) {
            trendHtml = ``;
        } else if (currentTotal > prevTotal) {
            let diffText = '';
            if (prevTotal !== 0) {
                const diff = Math.abs(((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1);
                diffText = `+${diff}%`;
            }
            trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; color: #32d74b; background: rgba(50, 215, 75, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
                            <span class="trend-main-text">↑ ${diffText}</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else if (currentTotal < prevTotal) {
            let diffText = '';
            if (prevTotal !== 0) {
                const diff = Math.abs(((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1);
                diffText = `-${diff}%`;
            }
            trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; color: #ff453a; background: rgba(255, 69, 58, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
                            <span class="trend-main-text">↓ ${diffText}</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = currentTotal >= 0 ? '#ff453a' : '#ffffff';
        } else {
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; background: rgba(255,255,255,0.1); color: inherit; opacity: 0.8; padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px;">= Без змін</div>`;
        }

        const maxVal = Math.max(...dataPoints); 
        const minVal = Math.min(...dataPoints); 
        let range = maxVal - minVal;
        if (range === 0) range = 1; 
        
        const width = 100; 
        const height = 30; 
        
        let points = '';
        dataPoints.forEach((val, i) => {
            const x = (i / (monthsBack - 1)) * width;
            const normalized = (val - minVal) / range;
            const y = height - (normalized * height) + 1;
            points += `${x},${y} `;
        });
        
        const gradientId = `grad-prof-spark`;
        const sparklineSvg = `
            <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="overflow: visible;">
                <defs>
                    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorMain}" stop-opacity="0.4" />
                        <stop offset="100%" stop-color="${colorMain}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polyline points="0,32 ${points} 100,32" fill="url(#${gradientId})" />
                <polyline points="${points}" fill="none" stroke="${colorMain}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
        
        const labelsHtml = labels.map(l => `<span>${l}</span>`).join('');
        return { trendHtml, sparklineSvg, labelsHtml };
    }

    function generateInvoicesSparklineHTML(currentTotal) {
        const monthsBack = 3;
        const dataPoints = [];
        const labels = [];
        
        let tempY = currentYear;
        let tempM = currentMonth;
        
        for (let i = 0; i < monthsBack; i++) {
            labels.unshift(monthNames[tempM].substring(0, 3));
            if (i === 0) {
                dataPoints.unshift(currentTotal);
            } else {
                dataPoints.unshift(getHistoricalCogs(tempY, tempM));
            }
            tempM--;
            if (tempM < 0) { tempM = 11; tempY--; }
        }
        
        const prevTotal = dataPoints[monthsBack - 2];
        let trendHtml = '';
        let colorMain = '#ff453a'; 

        // Вираховуємо різницю в грошах
        const rawDiff = currentTotal - prevTotal;
        const diffSign = rawDiff > 0 ? '+' : '';
        const diffMoneyText = `${diffSign}${formatMoney(rawDiff)} ₴`;
        
        if (prevTotal === 0 && currentTotal > 0) {
            trendHtml = ``; 
            colorMain = '#ff453a'; 
        } else if (currentTotal > prevTotal) {
            const diff = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-up" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; cursor:pointer;">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#ff453a';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-down" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; cursor:pointer;">
                            <span class="trend-main-text">↓ -${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else {
            trendHtml = `<div class="trend-badge" style="background: rgba(255,255,255,0.1); color: #a1a1a6; margin-bottom:0;">= Без змін</div>`;
            colorMain = '#a1a1a6';
        }

        const maxVal = Math.max(...dataPoints, 100); 
        const width = 100; 
        const height = 30; 
        
        let points = '';
        dataPoints.forEach((val, i) => {
            const x = (i / (monthsBack - 1)) * width;
            const y = height - ((val / maxVal) * height) + 1;
            points += `${x},${y} `;
        });
        
        const gradientId = `grad-inv-spark`;
        const sparklineSvg = `
            <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="overflow: visible;">
                <defs>
                    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorMain}" stop-opacity="0.4" />
                        <stop offset="100%" stop-color="${colorMain}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polyline points="0,32 ${points} 100,32" fill="url(#${gradientId})" />
                <polyline points="${points}" fill="none" stroke="${colorMain}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
        
        const labelsHtml = labels.map(l => `<span>${l}</span>`).join('');
        return { trendHtml, sparklineSvg, labelsHtml };
    }

function getHistoricalIncome(year, month) {
        if (!appData[year] || !appData[year][month] || !appData[year][month].initialized) return 0;
        const data = appData[year][month];
        let income = 0;
        if (data.incomes && data.incomes.length > 0) {
            data.incomes.forEach(inc => {
                income += (inc.currency === 'USD' ? (parseFloat(inc.amount) || 0) * currentExchangeRate : (parseFloat(inc.amount) || 0));
            });
        } else {
            income = (parseFloat(data.usd) || 0) * currentExchangeRate;
        }
        return income;
    }

    function generateIncomeSparklineHTML(currentTotal) {
        const monthsBack = 3;
        const dataPoints = [];
        const labels = [];
        
        let tempY = currentYear;
        let tempM = currentMonth;
        
        for (let i = 0; i < monthsBack; i++) {
            labels.unshift(monthNames[tempM].substring(0, 3));
            if (i === 0) {
                dataPoints.unshift(currentTotal);
            } else {
                dataPoints.unshift(getHistoricalIncome(tempY, tempM));
            }
            tempM--;
            if (tempM < 0) { tempM = 11; tempY--; }
        }
        
        const prevTotal = dataPoints[monthsBack - 2];
        let trendHtml = '';
        let colorMain = '#32d74b';
        
        // Вираховуємо різницю в грошах
        const rawDiff = currentTotal - prevTotal;
        const diffSign = rawDiff > 0 ? '+' : '';
        const diffMoneyText = `${diffSign}${formatMoney(rawDiff)} ₴`;

        if (prevTotal === 0 && currentTotal > 0) {
            trendHtml = ``; 
            colorMain = '#32d74b'; 
        } else if (currentTotal > prevTotal) {
            const diff = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; color: #32d74b; background: rgba(50, 215, 75, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="margin-bottom:0; color: #ff453a; background: rgba(255, 69, 58, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
                            <span class="trend-main-text">↓ -${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#ff453a';
        } else {
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; background: rgba(255,255,255,0.1); color: #a1a1a6; padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px;">= Без змін</div>`;
            colorMain = '#a1a1a6';
        }

        const maxVal = Math.max(...dataPoints, 100); 
        const width = 100; 
        const height = 30; 
        
        let points = '';
        dataPoints.forEach((val, i) => {
            const x = (i / (monthsBack - 1)) * width;
            const y = height - ((val / maxVal) * height) + 1;
            points += `${x},${y} `;
        });
        
        const gradientId = `grad-inc-spark`;
        const sparklineSvg = `
            <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="overflow: visible;">
                <defs>
                    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorMain}" stop-opacity="0.4" />
                        <stop offset="100%" stop-color="${colorMain}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polyline points="0,32 ${points} 100,32" fill="url(#${gradientId})" />
                <polyline points="${points}" fill="none" stroke="${colorMain}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
        
        const labelsHtml = labels.map(l => `<span>${l}</span>`).join('');
        return { trendHtml, sparklineSvg, labelsHtml };
    }


    function generateSparklineHTML(categoryId, currentTotal) {
        const monthsBack = 3; // Фікс: скоротили до 3 місяців
        const dataPoints = [];
        const labels = [];
        
        let tempY = currentYear;
        let tempM = currentMonth;
        
        for (let i = 0; i < monthsBack; i++) {
            labels.unshift(monthNames[tempM].substring(0, 3)); // Пишемо перші 3 літери місяця (Бер, Кві...)
            
            if (i === 0) {
                dataPoints.unshift(currentTotal);
            } else {
                let historicalTotal = 0;
                if (appData[tempY] && appData[tempY][tempM] && appData[tempY][tempM].initialized) {
                    let pastCat = appData[tempY][tempM].expenses.find(e => sameId(e.id, categoryId));
                    
                    // РОЗУМНИЙ ПОШУК (ФІКС ДЛЯ БОРГІВ ТА ЗАОЩАДЖЕНЬ):
                    const currentCat = findExpenseById(categoryId);
                    
                     if (!pastCat && currentCat) {
                        const isDebtCategory = currentCat.items && currentCat.items.some(item => item.debtId);
                        const isSavingsCategory = currentCat.isSavings;
                        const currentName = (currentCat.name || '').trim().toLowerCase(); // <-- ОСЬ ЦЕЙ РЯДОК ЗАГУБИВСЯ

                        if (isDebtCategory) {
                            pastCat = appData[tempY][tempM].expenses.find(e => e.items && e.items.some(item => item.debtId));
                        } else if (isSavingsCategory) {
                            pastCat = appData[tempY][tempM].expenses.find(e => e.isSavings);
                        } else if (currentName) {
                            // Якщо це звичайна категорія, але ID не збігся - шукаємо за назвою (ігноруючи регістр)
                            pastCat = appData[tempY][tempM].expenses.find(e => (e.name || '').trim().toLowerCase() === currentName);
                        }
                    }

                    if (pastCat) {
                        historicalTotal = getCategoryTotal(pastCat);
                    }
                }
                dataPoints.unshift(historicalTotal);
            }
            
            tempM--;
            if (tempM < 0) { tempM = 11; tempY--; }
        }
        
        const prevTotal = dataPoints[monthsBack - 2];
        let trendHtml = '';
        let colorMain = '#a1a1a6';

        // Перевіряємо, чи це заощадження, щоб інвертувати кольори
        const currentCatForColor = findExpenseById(categoryId);
        const isSavings = currentCatForColor ? currentCatForColor.isSavings : false;
        
        // Рахуємо різницю в грошах для підміни тексту
        const rawDiff = currentTotal - prevTotal;
        const diffSign = rawDiff > 0 ? '+' : '';
        const diffMoneyText = `${diffSign}${formatMoney(rawDiff)} ₴`;
        
        if (prevTotal === 0 && currentTotal > 0) {
            trendHtml = `<div class="trend-badge trend-new">Нова</div>`;
            colorMain = '#ffd60a';
        } else if (currentTotal > prevTotal) {
            const diff = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 100;
            if (isSavings) {
                trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="color: #32d74b; background: rgba(50, 215, 75, 0.15);">
                                <span class="trend-main-text">↑ +${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#32d74b';
            } else {
                trendHtml = `<div class="trend-badge trend-up" data-stop-propagation="1" data-toggle-expanded="1">
                                <span class="trend-main-text">↑ +${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#ff453a';
            }
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            if (isSavings) {
                trendHtml = `<div class="trend-badge" data-stop-propagation="1" data-toggle-expanded="1" style="color: #ff453a; background: rgba(255, 69, 58, 0.15);">
                                <span class="trend-main-text">↓ -${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#ff453a';
            } else {
                trendHtml = `<div class="trend-badge trend-down" data-stop-propagation="1" data-toggle-expanded="1">
                                <span class="trend-main-text">↓ -${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#32d74b';
            }
        } else {
            trendHtml = `<div class="trend-badge" style="background: rgba(255,255,255,0.1); color: #a1a1a6;">= Без змін</div>`;
            colorMain = '#a1a1a6';
        }

        const maxVal = Math.max(...dataPoints, 100); 
        const minVal = 0; 
        const width = 100; 
        const height = 30; // Фікс: зменшили висоту графіка
        
        let points = '';
        dataPoints.forEach((val, i) => {
            const x = (i / (monthsBack - 1)) * width;
            const y = height - ((val / maxVal) * height) + 1;
            points += `${x},${y} `;
        });
        
        const gradientId = `grad-${categoryId}`;
        const sparklineSvg = `
            <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="overflow: visible;">
                <defs>
                    <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="${colorMain}" stop-opacity="0.4" />
                        <stop offset="100%" stop-color="${colorMain}" stop-opacity="0.0" />
                    </linearGradient>
                </defs>
                <polyline points="0,32 ${points} 100,32" fill="url(#${gradientId})" />
                <polyline points="${points}" fill="none" stroke="${colorMain}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
        `;
        
        const labelsHtml = labels.map(l => `<span>${l}</span>`).join('');
        return { trendHtml, sparklineSvg, labelsHtml };
    }


    function renderExpenses() {
        const list = document.getElementById('expenses-list');
        list.innerHTML = '';
        
        const isBiz = currentUser && currentUser.account_type === 'business';
        let displayIncome = currentIncomeUah;
        if (isBiz && appData[currentYear] && appData[currentYear][currentMonth].cogs) {
            const cogs = appData[currentYear][currentMonth].cogs;
            const cogsAmount = cogs.type === 'percent' ? currentIncomeUah * (cogs.value / 100) : cogs.value;
            displayIncome = currentIncomeUah - cogsAmount;
        }
        
        let totals = expenses.filter(e => !isUnassigned(e)).map(e => getCategoryTotal(e)).filter(t => t > 0);
        let uniqueTotals = [...new Set(totals)].sort((a,b) => b - a);
        let top1 = uniqueTotals[0] || -1, top2 = uniqueTotals[1] || -1, top3 = uniqueTotals[2] || -1;

        expenses.forEach(exp => {
            if (isUnassigned(exp)) {
                list.appendChild(renderUnassignedCard(exp));
                return;
            }
            const totalAmount = getCategoryTotal(exp);
            const sparkData = generateSparklineHTML(exp.id, totalAmount);
            
            // 1. Повертаємо математику для 10 років та перевірки на оплату
            const cost10Years = totalAmount * 120;
            const allItemsPaid = exp.items.length > 0 && exp.items.every(item => item.isPaid === true);
            const paidHtml = allItemsPaid ? `<div style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; background: var(--sys-green); border-radius: 50%; margin-left: 10px; box-shadow: 0 2px 8px rgba(46, 160, 67, 0.4); flex-shrink: 0;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>` : '';
            
            // 2. Повертаємо тултип з підкатегоріями
            let tooltipHtml = exp.items.length > 0 
                ? exp.items.map(i => `<div class="preview-item"><span class="preview-item-name">${escapeHtml(i.name || 'Без назви')}</span><span class="preview-item-amount">${formatMoney(parseFloat(i.amount)||0)} ₴${i.isPaid ? '<span style="color: var(--sys-green); margin-left:4px;">✓</span>' : ''}</span></div>`).join('')
                : '<div style="opacity:0.7;">Немає доданих статей</div>';
            
            let rankClass = '', badgeHtml = '';
            if (totalAmount > 0) {
                if (totalAmount === top1) { rankClass = 'card-top-1'; badgeHtml = '<div class="top-expense-badge top-badge-1" style="position:static; margin-bottom:4px; display:inline-block;">🥇 1 МІСЦЕ</div>'; }
                else if (totalAmount === top2) { rankClass = 'card-top-2'; badgeHtml = '<div class="top-expense-badge top-badge-2" style="position:static; margin-bottom:4px; display:inline-block;">🥈 2 МІСЦЕ</div>'; }
                else if (totalAmount === top3) { rankClass = 'card-top-3'; badgeHtml = '<div class="top-expense-badge top-badge-3" style="position:static; margin-bottom:4px; display:inline-block;">🥉 3 МІСЦЕ</div>'; }
            }

            const isSavingsClass = exp.isSavings ? 'color: var(--sys-green);' : '';
            const paidCardClass = allItemsPaid ? 'paid-card' : '';
            const essentialCheckHtml = (!isBiz && !exp.isSavings)
                ? `<label class="expense-essential-check" data-stop-propagation="1">
                        <input type="checkbox" ${exp.isEssential ? 'checked' : ''} data-change-action="toggleCategoryEssential" data-args="${escapeAttr(JSON.stringify([exp.id]))}">
                        <span class="expense-essential-box" aria-hidden="true">
                            <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </span>
                        <span class="expense-essential-label">Обов'язкові</span>
                   </label>`
                : '';

            const overLimit = categoryIsOverLimit(exp);
            const div = document.createElement('div');
            div.className = `expense-card-pro ${rankClass} ${paidCardClass}${overLimit ? ' is-over-limit' : ''}`;
            div.dataset.categoryId = String(exp.id);
            div.innerHTML = `
                <div class="expense-pro-main" data-action="handleExpenseCardClick" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([exp.id]))}" style="cursor: pointer; position: relative;">
                    <div class="expense-pro-header">
                        <div class="expense-pro-title-group">
                            ${badgeHtml}
                            <div class="expense-pro-name-row">
                                ${exp.source === 'monobank' ? '<span class="mono-mark" role="img" aria-label="Монобанк">m</span>' : ''}
                                <input class="expense-pro-input" type="text" value="${escapeHtml(exp.name || '')}" placeholder="Назва категорії" data-input-action="updateCategoryName" data-args="${escapeAttr(JSON.stringify([exp.id]))}" data-stop-propagation="1" style="${isSavingsClass}">
                            </div>
                            ${essentialCheckHtml}
                            ${isLedgerCategory(exp) ? '' : limitChipHtml(exp)}
                            ${overLimit ? '<div class="expense-limit-over">Вийшли за ліміт</div>' : ''}
                        </div>
                        <div class="expense-pro-trend">
                            ${sparkData.trendHtml}
                            <div class="expense-10y tabular" style="position: static; text-align: right; margin-bottom: 2px; font-size: 11px;"><span class="val-10y">${formatNumberShort(cost10Years)}</span> за 10 років</div>
                            <div class="expense-pro-amount tabular">
                                ${formatMoney(totalAmount)} ₴
                                ${paidHtml}
                            </div>
                        </div>
                    </div>
                    
                    <div class="expense-pro-sparkline">
                        ${sparkData.sparklineSvg}
                        <div class="sparkline-labels">${sparkData.labelsHtml}</div>
                    </div>
                    
                    <div class="preview-tooltip">${tooltipHtml}</div>
                </div>
                
                <div class="expense-pro-actions">
                    <button class="btn-pro-action btn-pro-add" data-action="openModal" data-args="${escapeAttr(JSON.stringify([exp.id]))}" title="Додати статті">+</button>
                    <button class="btn-pro-action btn-pro-del" data-action="deleteCategory" data-args="${escapeAttr(JSON.stringify([exp.id]))}" title="Видалити категорію">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    /** «Нерозподілене»: Monobank purchases no rule placed yet — the inbox to sort out. */
    function renderUnassignedCard(category) {
        const count = (category.items || []).length;
        const total = getCategoryTotal(category);
        const div = document.createElement('div');
        div.className = 'expense-card-pro mr-inbox';
        div.dataset.categoryId = String(category.id);
        div.innerHTML = `
            <div class="mr-inbox-main" data-action="openModal" data-args="${escapeAttr(JSON.stringify([category.id]))}">
                <div class="mr-inbox-icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                </div>
                <div class="mr-inbox-info">
                    <div class="mr-inbox-title">Нерозподілене <span class="mr-inbox-count">${count}</span></div>
                    <div class="mr-inbox-hint">${count} ${pluralUk(count, 'покупка', 'покупки', 'покупок')} з Монобанку без категорії</div>
                </div>
                <div class="mr-inbox-amount tabular">${formatMoney(total)} ₴</div>
            </div>
            <div class="mr-inbox-actions">
                <button type="button" class="mr-inbox-btn is-primary" data-action="openModal" data-args="${escapeAttr(JSON.stringify([category.id]))}">Розподілити</button>
                <button type="button" class="mr-inbox-btn" data-action="openMonoRules">Правила</button>
            </div>`;
        return div;
    }

    function findExpenseById(id) {
        return expenses.find(e => sameId(e.id, id));
    }

    function findSubItemById(category, subId) {
        return category?.items?.find(i => sameId(i.id, subId));
    }

    function updateCategoryName(id, val) {
        const cat = findExpenseById(id);
        if (cat) { cat.name = val; saveData(); updateChart(); renderFinancialPlanBlock(); }
    }

    function limitFromInput(val) {
        const num = parseFloat(String(val ?? '').replace(',', '.'));
        return Number.isFinite(num) && num > 0 ? num : 0;
    }

    /** «Ліміти»: how much of the month's income the category limits already plan, and what is free. */
    function renderLimitPlan() {
        const box = document.getElementById('limit-plan');
        if (!box) return;
        const limited = (expenses || []).filter((cat) => !isUnassigned(cat) && !isLedgerCategory(cat) && categoryLimitMode(cat) !== 'none');
        box.hidden = !limited.length;
        if (!limited.length) return;
        const income = getMonthIncomeUah(currentYear, currentMonth);
        const fixed = limited.filter((cat) => categoryLimitMode(cat) === 'fixed').reduce((sum, cat) => sum + Number(cat.limit), 0);
        const pct = limited.filter((cat) => categoryLimitMode(cat) === 'percent').reduce((sum, cat) => sum + Number(cat.limitPct), 0);
        const pctEl = document.getElementById('limit-plan-pct');
        const fill = document.getElementById('limit-plan-fill');
        const text = document.getElementById('limit-plan-text');
        const bar = box.querySelector('.limit-plan-bar');
        if (!(income > 0)) {
            // Money has not come in yet: show the plan in the units it is set in.
            const parts = [fixed > 0 ? formatLimitMoney(fixed) : '', pct > 0 ? `${formatLimitPercent(pct)} доходу` : ''].filter(Boolean);
            pctEl.textContent = '';
            fill.style.width = '0%';
            bar.setAttribute('aria-valuenow', '0');
            box.classList.remove('is-over');
            text.textContent = `Розплановано ${parts.join(' + ')} · дохід ще не внесено`;
            return;
        }
        const planned = fixed + (income * pct) / 100;
        const share = (planned / income) * 100;
        const free = income - planned;
        pctEl.textContent = `${formatLimitPercent(share)} доходу`;
        fill.style.width = `${Math.min(100, share)}%`;
        bar.setAttribute('aria-valuenow', String(Math.round(share)));
        box.classList.toggle('is-over', free < -0.005);
        text.textContent = free >= -0.005
            ? `Розплановано ${formatLimitMoney(planned)} · вільно ${formatLimitMoney(free)}`
            : `Розплановано ${formatLimitMoney(planned)} · більше за дохід на ${formatLimitMoney(-free)}`;
    }

    /** Sets (or clears, with 0) a category limit as ₴ or as % of the month's income. */
    function applyCategoryLimit(category, mode, value) {
        delete category.limitType;
        delete category.limitPct;
        category.limit = 0;
        if (!(value > 0)) return;
        if (mode === 'percent') {
            category.limitType = 'percent';
            category.limitPct = Math.min(999, Math.round(value * 10) / 10);
            category.limit = categoryLimitNumber(category);
        } else {
            category.limit = roundMoney(value);
        }
    }

    function modalLimitHint(category) {
        const mode = categoryLimitMode(category);
        const income = getMonthIncomeUah(currentYear, currentMonth);
        const spent = getCategoryTotal(category);
        if (mode === 'none') return income > 0 ? `Дохід місяця ${formatLimitMoney(income)}` : 'Дохід цього місяця ще не внесено';
        const amount = categoryLimitNumber(category, income);
        const share = mode === 'percent'
            ? (income > 0 ? `≈ ${formatLimitMoney(amount)}` : 'дохід не внесено — ліміт 0 ₴')
            : (income > 0 ? `≈ ${formatLimitPercent((amount / income) * 100)} доходу` : 'дохід ще не внесено');
        const left = amount - spent;
        return `${share} · ${left >= 0 ? `залишилось ${formatLimitMoney(left)}` : `перевищено на ${formatLimitMoney(-left)}`}`;
    }

    function renderModalLimit() {
        const box = document.getElementById('modal-limit');
        const category = findExpenseById(activeCategoryId);
        if (!box) return;
        const editable = Boolean(category) && !isUnassigned(category) && !isLedgerCategory(category);
        box.hidden = !editable;
        if (!editable) return;
        const mode = categoryLimitMode(category);
        // The editor's choice wins (openModal resets it to the saved mode).
        const shown = box.dataset.mode || (mode === 'none' ? 'fixed' : mode);
        box.dataset.mode = shown;
        box.querySelectorAll('.limit-mode-btn').forEach((btn) => {
            const active = btn.dataset.mode === shown;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-checked', String(active));
        });
        const input = document.getElementById('modal-limit-input');
        if (document.activeElement !== input) {
            input.value = mode === shown ? String(mode === 'percent' ? category.limitPct : category.limit) : '';
        }
        input.placeholder = shown === 'percent' ? 'Напр. 10' : 'Без ліміту';
        input.step = shown === 'percent' ? '0.1' : '1';
        document.getElementById('modal-limit-unit').textContent = shown === 'percent' ? '% доходу' : '₴';
        document.getElementById('modal-limit-clear').hidden = mode === 'none';
        document.getElementById('modal-limit-hint').textContent = modalLimitHint(category);
        box.classList.toggle('is-over', categoryIsOverLimit(category));
    }

    function previewModalLimit(val) {
        const category = findExpenseById(activeCategoryId);
        const box = document.getElementById('modal-limit');
        if (!category || !box) return;
        const draft = { ...category };
        applyCategoryLimit(draft, box.dataset.mode, limitFromInput(val));
        document.getElementById('modal-limit-hint').textContent = modalLimitHint(draft);
        box.classList.toggle('is-over', categoryIsOverLimit(draft));
        syncCategoryLimitState(draft);
    }

    function saveModalLimit(val) {
        const category = findExpenseById(activeCategoryId);
        const box = document.getElementById('modal-limit');
        if (!category || !box) return;
        applyCategoryLimit(category, box.dataset.mode, limitFromInput(val));
        saveData();
        syncCategoryLimitState(category);
        renderModalLimit();
    }

    /** Switching ₴ ↔ % keeps the same cap in ₴ when the month has income. */
    function setLimitMode(mode) {
        const category = findExpenseById(activeCategoryId);
        const box = document.getElementById('modal-limit');
        if (!category || !box || box.dataset.mode === mode) return;
        box.dataset.mode = mode;
        const income = getMonthIncomeUah(currentYear, currentMonth);
        // Without income a ₴ cap has no % equivalent: keep it until the user types a percent.
        if (categoryLimitMode(category) !== 'none' && (mode === 'fixed' || income > 0)) {
            const amount = categoryLimitNumber(category, income);
            applyCategoryLimit(category, mode, mode === 'percent' ? (amount / income) * 100 : amount);
            saveData();
            syncCategoryLimitState(category);
        }
        const input = document.getElementById('modal-limit-input');
        const now = categoryLimitMode(category);
        input.value = now === mode ? String(now === 'percent' ? category.limitPct : category.limit) : '';
        renderModalLimit();
        input.focus();
    }

    function clearModalLimit() {
        const category = findExpenseById(activeCategoryId);
        if (!category) return;
        applyCategoryLimit(category, 'fixed', 0);
        document.getElementById('modal-limit-input').value = '';
        saveData();
        syncCategoryLimitState(category);
        renderModalLimit();
    }

    function toggleCategoryEssential(categoryId, checked) {
        const cat = findExpenseById(categoryId);
        if (!cat || cat.isSavings) return;
        cat.isEssential = Boolean(checked);
        saveData();
        renderFinancialPlanBlock();
    }

    function handleExpenseCardClick(event, categoryId) {
        if (event.target.closest('.custom-dropdown, .expense-pro-input, button, a, input, select, textarea')) return;
        openModal(categoryId);
    }

    function addCategory() {
        expenses.push({ id: newId(), key: newId(), name: "", items: [], isEssential: false });
        renderExpenses(); saveData(); updateAll();
    }

    function openModal(categoryId) {
        const category = findExpenseById(categoryId);
        if (!category) return;
        activeCategoryId = category.id;
        document.getElementById('modal-category-name').innerText = category.name || 'Без назви';
        const inbox = isUnassigned(category);
        const hint = document.getElementById('modal-category-hint');
        if (hint) hint.hidden = !inbox;
        const addItem = document.getElementById('modal-add-subitem');
        if (addItem) addItem.hidden = inbox;
        const limitBox = document.getElementById('modal-limit');
        if (limitBox) delete limitBox.dataset.mode;
        renderModalLimit();
        renderModalItems();
        document.getElementById('category-modal').classList.add('active');
    }

    function closeModal(event) {
        if (event && event.target.id !== 'category-modal' && event.target.className !== 'btn-close-modal' && event.target.className !== 'btn-modal-done') return;
        document.getElementById('category-modal').classList.remove('active');
        activeCategoryId = null; renderExpenses(); updateAll(); saveData();
    }

    function getTop3SubItems(category) {
        // The inbox is a to-do list, not a ranking.
        if (isUnassigned(category)) return { top1: -1, top2: -1, top3: -1 };
        let totals = (category?.items || []).map(i => parseFloat(i.amount) || 0).filter(t => t > 0);
        let unique = [...new Set(totals)].sort((a,b) => b - a);
        return { top1: unique[0] || -1, top2: unique[1] || -1, top3: unique[2] || -1 };
    }

    function renderModalItems() {
        const category = findExpenseById(activeCategoryId);
        const list = document.getElementById('modal-subitems-list');
        if (!category || !list) return;
        list.innerHTML = '';
        const tops = getTop3SubItems(category);

        category.items.forEach(item => {
            let amt = parseFloat(item.amount) || 0, rankClass = '', badgeClass = '', badgeText = '';
            if (amt > 0) {
                if (amt === tops.top1) { rankClass = 'top-subitem-1'; badgeClass = 'top-badge-1'; badgeText = '🥇 1 місце'; }
                else if (amt === tops.top2) { rankClass = 'top-subitem-2'; badgeClass = 'top-badge-2'; badgeText = '🥈 2 місце'; }
                else if (amt === tops.top3) { rankClass = 'top-subitem-3'; badgeClass = 'top-badge-3'; badgeText = '🥉 3 місце'; }
            }
            const badgeHtml = badgeText ? `<div class="badge-wrapper" style="display:flex; justify-content: flex-end; margin-bottom: -4px;"><span class="top-subitem-badge ${badgeClass}">${badgeText}</span></div>` : `<div class="badge-wrapper" style="display:none; justify-content: flex-end; margin-bottom: -4px;"><span class="top-subitem-badge"></span></div>`;
            const isChecked = item.isPaid ? 'checked' : '';
            const paidClass = item.isPaid ? 'paid-amount' : '';
            const checkboxHtml = `<div class="check-container ${isChecked}" data-action="togglePaidStatus" data-args="${escapeAttr(JSON.stringify([item.id]))}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`;

            const mono = isMonoItem(item);
            const linkedTo = item.envelopeId
                ? `конверт «${findUserJar(item.envelopeId)?.name || '—'}»`
                : item.debtId ? `борг «${findUserDebt(item.debtId)?.name || '—'}»` : '';
            const monoMeta = mono ? [monoOperationDate(item), linkedTo].filter(Boolean).join(' · ') : '';
            const moveHtml = mono
                ? `<button type="button" class="btn-sub-move" data-action="openMonoMove" data-args="${escapeAttr(JSON.stringify([item.id]))}" title="Перенести в іншу категорію" aria-label="Перенести в іншу категорію"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M13 6l6 6-6 6"></path></svg></button>`
                : '';

            const div = document.createElement('div');
            div.className = `sub-item ${rankClass}${mono ? ' is-mono' : ''}`;
            div.innerHTML = `
                ${badgeHtml}
                ${mono ? `<div class="sub-item-meta"><span class="mono-mark mono-mark-sm" aria-hidden="true">m</span><span>${escapeHtml(monoMeta || 'Монобанк')}</span></div>` : ''}
                <div class="sub-item-row">
                    ${checkboxHtml}
                    <input type="text" class="sub-item-name" value="${escapeHtml(item.name || '')}" title="${escapeHtml(item.name || '')}" placeholder="Назва статті" data-input-action="updateSubItemName" data-args="${escapeAttr(JSON.stringify([item.id]))}">
                    <input type="number" class="sub-item-amount ${paidClass}" id="sub-amount-${item.id}" value="${item.amount || ''}" placeholder="0" data-input-action="updateSubItemAmount" data-args="${escapeAttr(JSON.stringify([item.id]))}">
                    ${moveHtml}
                    <button class="btn-sub-delete" data-action="deleteSubItem" data-args="${escapeAttr(JSON.stringify([item.id]))}"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            `;
            list.appendChild(div);
        });
        document.getElementById('modal-category-total').innerText = formatMoney(getCategoryTotal(category));
    }

    function updateTopSubItemBadges(category) {
        const list = document.getElementById('modal-subitems-list');
        const subItems = list.querySelectorAll('.sub-item');
        const tops = getTop3SubItems(category);

        category.items.forEach((item, index) => {
            const domItem = subItems[index];
            if (!domItem) return;
            let amt = parseFloat(item.amount) || 0;
            domItem.classList.remove('top-subitem-1', 'top-subitem-2', 'top-subitem-3');
            const badgeWrap = domItem.querySelector('.badge-wrapper');
            const badgeSpan = domItem.querySelector('.top-subitem-badge');
            
            if (amt > 0 && (amt === tops.top1 || amt === tops.top2 || amt === tops.top3)) {
                badgeWrap.style.display = 'flex'; badgeSpan.className = 'top-subitem-badge'; 
                if (amt === tops.top1) { domItem.classList.add('top-subitem-1'); badgeSpan.classList.add('top-badge-1'); badgeSpan.innerText = '🥇 1 місце'; }
                else if (amt === tops.top2) { domItem.classList.add('top-subitem-2'); badgeSpan.classList.add('top-badge-2'); badgeSpan.innerText = '🥈 2 місце'; }
                else if (amt === tops.top3) { domItem.classList.add('top-subitem-3'); badgeSpan.classList.add('top-badge-3'); badgeSpan.innerText = '🥉 3 місце'; }
            } else {
                if (badgeWrap) badgeWrap.style.display = 'none';
            }
        });
    }

    function addSubItem() {
        const category = findExpenseById(activeCategoryId);
        if (!category) return;
        if (!Array.isArray(category.items)) category.items = [];
        category.items.push({ id: newId(), name: "", amount: null, isPaid: false });
        renderModalItems();
    }

    function updateSubItemName(subId, val) {
        const item = findSubItemById(findExpenseById(activeCategoryId), subId);
        if (item) { item.name = val; saveData(); }
    }

    function deleteCategory(id) {
        showConfirm("Видалити категорію", "Видалити цю категорію з усіма витратами?", () => {
            const index = expenses.findIndex(e => sameId(e.id, id));
            const category = index >= 0 ? expenses[index] : null;
            if (!category) return;
            const snapshot = JSON.parse(JSON.stringify(category));
            const year = currentYear;
            const month = currentMonth;
            const jarDeltas = [];
            const debtIds = new Set();

            (category.items || []).forEach(item => {
                if (category.isSavings && item.envelopeId && currentUser) {
                    const jar = (globalData.jars[currentUser.id] || []).find(j => j.id == item.envelopeId);
                    if (jar) {
                        const amount = parseFloat(item.amount) || 0;
                        jar.balance = addMoney(jar.balance, -amount);
                        jarDeltas.push({ jarId: jar.id, amount });
                    }
                }
                if (item.debtId) debtIds.add(item.debtId);
            });

            expenses = expenses.filter(e => !sameId(e.id, id));
            if (appData[year] && appData[year][month]) appData[year][month].expenses = expenses;

            debtIds.forEach(debtId => syncGlobalDebtBalance(debtId));
            renderExpenses();
            updateAll();
            updateSavingsDisplay();
            updateDebtsDisplay();
            saveDataToServer();

            showUndo('Категорію видалено', () => {
                restoreExpenseSnapshot(year, month, (list) => {
                    list.splice(Math.min(index, list.length), 0, snapshot);
                });
                if (currentUser) {
                    jarDeltas.forEach(({ jarId, amount }) => {
                        const jar = (globalData.jars[currentUser.id] || []).find(j => j.id == jarId);
                        if (jar) jar.balance = addMoney(jar.balance, amount);
                    });
                }
                debtIds.forEach(debtId => syncGlobalDebtBalance(debtId));
                if (year === currentYear && month === currentMonth) {
                    renderExpenses();
                    updateAll();
                    updateSavingsDisplay();
                    updateDebtsDisplay();
                    if (sameId(activeCategoryId, snapshot.id)) renderModalItems();
                }
                persistUndoMonth(year, month);
            });
        });
    }

    function updateSubItemAmount(subId, val) {
        const category = findExpenseById(activeCategoryId);
        const item = findSubItemById(category, subId);
        if (item) {
            const newVal = parseFloat(val) || 0;
            if (category.isSavings && item.envelopeId) {
                const jar = globalData.jars[currentUser.id].find(j => j.id == item.envelopeId);
                if (jar) { jar.balance = addMoney(jar.balance, newVal - (item.amount || 0)); updateSavingsDisplay(); }
            }

            item.amount = newVal;

            if (item.debtId) {
                const debt = globalData.debts[currentUser.id].find(d => d.id == item.debtId);
                let newDeduction = newVal;
                if (debt && debt.currency === 'USD') newDeduction = newVal / currentExchangeRate; 
                item.debtDeduction = newDeduction;
                
                if (appData[currentYear] && appData[currentYear][currentMonth]) {
                    appData[currentYear][currentMonth].expenses = expenses;
                }
                
                syncGlobalDebtBalance(item.debtId);
                updateDebtsDisplay();
            }
            document.getElementById('modal-category-total').innerText = formatMoney(getCategoryTotal(category));
            renderModalLimit();
            updateTopSubItemBadges(category);
            syncCategoryLimitState(category);
            saveData();
        }
    }

    function deleteSubItem(subId) {
        const category = findExpenseById(activeCategoryId);
        if (!category) return;
        const index = (category.items || []).findIndex(i => sameId(i.id, subId));
        const item = index >= 0 ? category.items[index] : null;
        if (!item) return;
        const snapshot = JSON.parse(JSON.stringify(item));
        const categoryId = category.id;
        const year = currentYear;
        const month = currentMonth;
        const debtIdToSync = item.debtId || null;
        let jarDelta = null;

        if (category.isSavings && item.envelopeId && currentUser) {
            const jar = (globalData.jars[currentUser.id] || []).find(j => j.id == item.envelopeId);
            if (jar) {
                const amount = parseFloat(item.amount) || 0;
                jar.balance = addMoney(jar.balance, -amount);
                jarDelta = { jarId: jar.id, amount };
                updateSavingsDisplay();
            }
        }

        category.items = category.items.filter(i => !sameId(i.id, subId));

        if (appData[year] && appData[year][month]) {
            appData[year][month].expenses = expenses;
        }

        if (debtIdToSync) {
            syncGlobalDebtBalance(debtIdToSync);
            updateDebtsDisplay();
        }
        renderModalItems();
        saveData();

        showUndo('Статтю видалено', () => {
            restoreExpenseSnapshot(year, month, (list) => {
                const cat = list.find(entry => sameId(entry.id, categoryId));
                if (!cat) return;
                if (!Array.isArray(cat.items)) cat.items = [];
                cat.items.splice(Math.min(index, cat.items.length), 0, snapshot);
            });
            if (jarDelta && currentUser) {
                const jar = (globalData.jars[currentUser.id] || []).find(j => j.id == jarDelta.jarId);
                if (jar) jar.balance = addMoney(jar.balance, jarDelta.amount);
            }
            if (debtIdToSync) {
                syncGlobalDebtBalance(debtIdToSync);
                updateDebtsDisplay();
            }
            if (year === currentYear && month === currentMonth) {
                renderExpenses();
                updateAll();
                updateSavingsDisplay();
                if (sameId(activeCategoryId, categoryId)) {
                    renderModalItems();
                    const totalEl = document.getElementById('modal-category-total');
                    const cat = findExpenseById(categoryId);
                    if (totalEl && cat) totalEl.innerText = formatMoney(getCategoryTotal(cat));
                }
            }
            persistUndoMonth(year, month);
        });
    }

    function restoreExpenseSnapshot(year, month, mutate) {
        if (!appData[year]) appData[year] = {};
        if (!appData[year][month]) appData[year][month] = { initialized: true, incomes: [], expenses: [] };
        const list = appData[year][month].expenses || [];
        mutate(list);
        appData[year][month].expenses = list;
        if (year === currentYear && month === currentMonth) expenses = list;
    }

    function persistUndoMonth(year, month) {
        if (year === currentYear && month === currentMonth) saveData();
        else enqueueSave(year, month);
    }

    function showUndo(message, restore) {
        if (undoTimer) {
            clearTimeout(undoTimer);
            undoTimer = null;
            undoRestore = null;
        }
        undoRestore = restore;
        const toast = document.getElementById('undo-toast');
        const text = document.getElementById('undo-toast-text');
        const bar = document.getElementById('undo-toast-bar');
        if (!toast || !text) {
            undoRestore = null;
            return;
        }
        text.textContent = message;
        toast.classList.add('active');
        toast.hidden = false;
        if (bar) {
            bar.style.animation = 'none';
            void bar.offsetWidth;
            bar.style.animation = '';
        }
        undoTimer = setTimeout(hideUndoToast, 3000);
    }

    function hideUndoToast() {
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = null;
        undoRestore = null;
        const toast = document.getElementById('undo-toast');
        if (toast) {
            toast.classList.remove('active');
            toast.hidden = true;
        }
    }

    function undoLastDelete() {
        const restore = undoRestore;
        hideUndoToast();
        if (restore) restore();
    }

    function togglePaidStatus(subId) {
        const category = findExpenseById(activeCategoryId);
        const item = findSubItemById(category, subId);
        if (item) { 
            item.isPaid = !item.isPaid; 
            
            if (appData[currentYear] && appData[currentYear][currentMonth]) {
                appData[currentYear][currentMonth].expenses = expenses;
            }

            if (item.debtId) {
                syncGlobalDebtBalance(item.debtId);
                updateDebtsDisplay();
            }
            renderModalItems(); 
            renderExpenses(); 
            updateAll(); 
            saveDataToServer(); 
        }
    }

    function updateAll() {
        const isBiz = currentUser && currentUser.account_type === 'business';
        let totalExp = 0, paidExp = 0, cogsAmount = 0;
        
        expenses.forEach(exp => {
            exp.items.forEach(item => {
                const amt = parseFloat(item.amount) || 0;
                totalExp += amt;
                if (item.isPaid) paidExp += amt;
            });
        });
        
let payrollAccruedTotal = 0;
        let payrollPaidTotal = 0;

        if (isBiz) {
            const monthInvoices = appData[currentYear]?.[currentMonth]?.invoices || [];
            if (monthInvoices.length > 0) {
                cogsAmount = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            } else {
                const cogs = appData[currentYear]?.[currentMonth]?.cogs || { type: 'percent', value: 0 };
                cogsAmount = cogs.type === 'percent' ? currentIncomeUah * (cogs.value / 100) : (parseFloat(cogs.value) || 0);
            }
            
            const invTotalEl = document.getElementById('invoices-total-amount');
            if (invTotalEl) invTotalEl.innerText = formatMoney(cogsAmount);

            const invSparkData = generateInvoicesSparklineHTML(cogsAmount);
            const trendBadgeEl = document.getElementById('invoices-trend-badge');
            const sparkContainerEl = document.getElementById('invoices-sparkline-container');
            if (trendBadgeEl) trendBadgeEl.innerHTML = invSparkData.trendHtml;
            if (sparkContainerEl) sparkContainerEl.innerHTML = invSparkData.sparklineSvg + `<div class="sparkline-labels">${invSparkData.labelsHtml}</div>`;

            const cogsPercent = currentIncomeUah > 0 ? ((cogsAmount / currentIncomeUah) * 100).toFixed(1) : 0;
            const grossProfit = currentIncomeUah - cogsAmount;
            const grossMarginPercent = currentIncomeUah > 0 ? ((grossProfit / currentIncomeUah) * 100).toFixed(1) : 0;

            const cfInvoicesEl = document.getElementById('cf-invoices');
            if (cfInvoicesEl) cfInvoicesEl.innerHTML = `-${formatMoney(cogsAmount)} ₴ <span style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 6px; margin-left: 6px; vertical-align: middle;">${cogsPercent}%</span>`;

            const cfGrossEl = document.getElementById('cf-gross-profit');
            if (cfGrossEl) {
                if (grossProfit >= 0) {
                    cfGrossEl.style.color = 'var(--sys-green)';
                    cfGrossEl.innerHTML = `${formatMoney(grossProfit)} ₴ <span style="font-size: 11px; font-weight: 700; color: var(--sys-green); background: rgba(46, 160, 67, 0.15); padding: 2px 6px; border-radius: 6px; margin-left: 6px; vertical-align: middle;">${grossMarginPercent}%</span>`;
                } else {
                    cfGrossEl.style.color = 'var(--sys-red)';
                    cfGrossEl.innerHTML = `${formatMoney(grossProfit)} ₴ <span style="font-size: 11px; font-weight: 700; color: var(--sys-red); background: rgba(255, 69, 58, 0.15); padding: 2px 6px; border-radius: 6px; margin-left: 6px; vertical-align: middle;">${grossMarginPercent}%</span>`;
                }
            }

            // РАХУЄМО ЗАРПЛАТИ В ЗАГАЛЬНІ ВИТРАТИ
            const payroll = appData[currentYear]?.[currentMonth]?.payroll || [];
            payroll.forEach(emp => {
                payrollAccruedTotal += getEmployeeAccrued(emp);
                payrollPaidTotal += getEmployeePaidCash(emp);
            });
        }
        
        // ДОДАЄМО ЗАРПЛАТИ ДО ЗАГАЛЬНОЇ СТАТИСТИКИ
        totalExp += payrollAccruedTotal;
        paidExp += payrollPaidTotal;

        const displayIncomeUah = currentIncomeUah;
        const displayIncomeUsd = window.currentIncomeUsd || 0;

        document.getElementById('income-display').innerText = formatMoney(displayIncomeUah);
        document.getElementById('yearly-income-display').innerText = formatMoney(displayIncomeUah * 12);

        if (!isBiz) document.getElementById('yearly-income-usd').innerText = formatMoney(displayIncomeUsd * 12);
        const mainAmountEl = document.getElementById('payroll-total-amount');
            if (mainAmountEl) mainAmountEl.innerText = formatMoney(payrollAccruedTotal);
            const sparkData = generatePayrollSparklineHTML(payrollAccruedTotal);
            const trendBadgeEl = document.getElementById('payroll-trend-badge');
            const sparkContainerEl = document.getElementById('payroll-sparkline-container');
            if (trendBadgeEl) trendBadgeEl.innerHTML = sparkData.trendHtml;
            if (sparkContainerEl) sparkContainerEl.innerHTML = sparkData.sparklineSvg + `<div class="sparkline-labels">${sparkData.labelsHtml}</div>`;    
        // НОВИЙ КОД: Рендер графіка доходів (обігу)
        const incSparkData = generateIncomeSparklineHTML(displayIncomeUah);
        const incTrendBadgeEl = document.getElementById('income-trend-badge');
        const incSparkContainerEl = document.getElementById('income-sparkline-container');
        if (incTrendBadgeEl) incTrendBadgeEl.innerHTML = incSparkData.trendHtml;
        if (incSparkContainerEl) incSparkContainerEl.innerHTML = incSparkData.sparklineSvg + `<div class="sparkline-labels">${incSparkData.labelsHtml}</div>`;

        renderFinancialPlanBlock();

        let workingDays = getRateWorkingDays();
        const hoursPerDay = getHoursPerDay(appData[currentYear]?.[currentMonth]?.cogs);
        const workingHours = workingDays * hoursPerDay;
        document.getElementById('daily-rate-uah').innerText = formatMoney(displayIncomeUah > 0 ? (displayIncomeUah / workingDays) : 0);
        document.getElementById('hourly-rate-uah').innerText = formatMoney(displayIncomeUah > 0 ? (displayIncomeUah / workingHours) : 0);
        updateRateCalcHint(workingDays, hoursPerDay);

        if (!isBiz) {
            document.getElementById('daily-rate-usd').innerText = formatMoney(displayIncomeUsd > 0 ? (displayIncomeUsd / workingDays) : 0);
            document.getElementById('hourly-rate-usd').innerText = formatMoney(displayIncomeUsd > 0 ? (displayIncomeUsd / workingHours) : 0);
        }

        const remaining = displayIncomeUah - cogsAmount - totalExp;
        const percent = displayIncomeUah > 0 ? ((remaining / displayIncomeUah) * 100).toFixed(1) : 0;

        // Оновлюємо віджет "План витрат / Оплачено / Залишок" для всіх типів акаунтів
        document.getElementById('total-expenses').innerText = formatMoney(totalExp);
        const leftToPay = totalExp - paidExp;
        document.getElementById('cf-plan').innerText = formatMoney(totalExp) + ' ₴';
        document.getElementById('cf-paid').innerText = formatMoney(paidExp) + ' ₴';
        document.getElementById('cf-left').innerText = formatMoney(leftToPay) + ' ₴';

        document.getElementById('remaining-money').innerText = formatMoney(remaining);
        document.getElementById('remaining-percent').innerText = percent;
        // НОВИЙ КОД: Рендер графіка Чистого прибутку
        const profSparkData = generateProfitSparklineHTML(remaining);
        const profTrendBadgeEl = document.getElementById('profit-trend-badge');
        const profSparkContainerEl = document.getElementById('profit-sparkline-container');
        if (profTrendBadgeEl) profTrendBadgeEl.innerHTML = profSparkData.trendHtml;
        if (profSparkContainerEl) profSparkContainerEl.innerHTML = profSparkData.sparklineSvg + `<div class="sparkline-labels" style="color: inherit; opacity: 0.7;">${profSparkData.labelsHtml}</div>`;
        document.getElementById('yearly-remaining').innerText = formatMoney(remaining * 12);
        if (isBiz) {
            let totalActualUah = 0;
            const incomes = appData[currentYear][currentMonth].incomes || [];
            
            incomes.forEach(inc => {
                const actBal = parseFloat(inc.actual_balance) || 0;
                totalActualUah += (inc.currency === 'USD' ? actBal * currentExchangeRate : actBal);
            });

            // Реальний рух грошей (Cash Flow) за поточний місяць: обігу - Закупівлі - ВЖЕ оплачені витрати
            const theoretical = currentIncomeUah - cogsAmount - paidExp;
            const actual = totalActualUah;

            const reconBox = document.getElementById('recon-box');
            if (reconBox) {
                document.getElementById('recon-theoretical').innerText = formatMoney(theoretical) + ' ₴';
                document.getElementById('recon-actual').innerText = formatMoney(actual) + ' ₴';
            }
        }

        const summaryCard = document.getElementById('summary-card');
        if (remaining < 0) summaryCard.classList.add('danger');
        else summaryCard.classList.remove('danger');

        const progressWidth = Math.max(0, Math.min(100, displayIncomeUah > 0 ? ((remaining / displayIncomeUah) * 100) : 0));
        document.getElementById('summary-progress').style.width = progressWidth + '%';

        const percentElements = document.querySelectorAll('.expense-info.tabular');
        expenses.forEach((exp, index) => {
            const catPercent = displayIncomeUah > 0 ? ((getCategoryTotal(exp) / displayIncomeUah) * 100).toFixed(1) : 0;
            if (percentElements[index]) percentElements[index].innerText = catPercent + '%';
        });

        // Percent limits follow income: refresh every card's label and over-limit state.
        expenses.forEach((exp) => syncCategoryLimitState(exp));
        renderLimitPlan();
        if (document.getElementById('category-modal')?.classList.contains('active')) renderModalLimit();

        updateChart();
    }

    // ==========================================
    // 8. МОДАЛКА ПОДТВЕРЖДЕНИЯ (Confirm)
    // ==========================================
    function showConfirm(title, message, callback, buttons) {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-text').innerText = message;
        const cancelBtn = document.getElementById('confirm-btn-cancel');
        const okBtn = document.getElementById('confirm-btn-ok');
        if (cancelBtn) cancelBtn.innerText = (buttons && buttons.cancel) || 'Назад';
        if (okBtn) okBtn.innerText = (buttons && buttons.confirm) || 'Підтвердити';
        pendingConfirmAction = callback;
        document.getElementById('confirm-modal').classList.add('active');
    }

    function closeConfirmModal(e) {
        if (e && e.target.id !== 'confirm-modal' && !e.target.closest('.btn-init-secondary')) return;
        document.getElementById('confirm-modal').classList.remove('active');
        pendingConfirmAction = null;
    }

    function executeConfirm() {
        if (pendingConfirmAction) pendingConfirmAction();
        document.getElementById('confirm-modal').classList.remove('active');
        pendingConfirmAction = null;
    }

    // ==========================================
    // 9. СБЕРЕЖЕНИЯ И КОНВЕРТЫ
    // ==========================================
    function updateSavingsDisplay() {
        if (!currentUser) return;
        const total = (globalData.jars[currentUser.id] || []).reduce((sum, jar) => sum + jar.balance, 0);
        document.getElementById('total-savings-display').innerText = formatMoney(total);
    }

    function openEnvelopesModal() {
        initNewJarTypeDropdown();
        renderEnvelopes();
        document.getElementById('jars-modal').classList.add('active');
    }
    function closeEnvelopesModal(e) { if (!e || e.target.id === 'jars-modal' || e.target.className === 'btn-close-modal') document.getElementById('jars-modal').classList.remove('active'); }

function renderEnvelopes() {
        const list = document.getElementById('jars-list');
        list.innerHTML = '';
        const userJars = globalData.jars[currentUser.id] || [];
        
        if (userJars.length === 0) return list.innerHTML = '<div style="color: var(--text-tertiary); text-align: center; padding: 20px; font-weight: 500;">Немає створених конвертів</div>';

        const jarInputStyle = (color) =>
            `background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: ${color}; font-size: 16px; font-weight: 700; width: 120px; padding: 6px 10px; outline: none; transition: 0.3s; text-align: left; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);`;

        const jarAmountInput = (jarId, action, value, color) =>
            `<div style="display: flex; align-items: center; gap: 6px;">
                <input type="number" min="0" step="0.01" value="${value || 0}"
                    data-change-action="${action}"
                    data-args="${escapeAttr(JSON.stringify([jarId]))}"
                    style="${jarInputStyle(color)}">
                <span>₴</span>
            </div>`;

        userJars.forEach(jar => {
            const percent = jar.goal > 0 ? Math.min(100, (jar.balance / jar.goal) * 100) : 0;
            const jarType = getJarType(jar);
            const isPersonal = currentUser && currentUser.account_type !== 'business';
            
            // Кнопка видалення у стилі карток боргів (хрестик у квадраті)
            const deleteBtn = jar.isMain ? '' : `<button data-action="deleteEnvelope" data-args="${escapeAttr(JSON.stringify([jar.id]))}" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-tertiary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0;">✕</button>`;
            
            // Бейджик для основного рахунку
            const mainBadge = jar.isMain ? `<span style="font-size: 11px; background: rgba(10, 132, 255, 0.15); padding: 2px 6px; border-radius: 6px; color: var(--sys-blue); flex-shrink: 0;">Основний</span>` : '';
            const typeBadge = isPersonal && jarType !== 'regular' ? `<span style="font-size: 11px; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 6px; color: var(--text-secondary); flex-shrink: 0;">${JAR_TYPE_LABELS[jarType]}</span>` : '';
            const typeSelect = isPersonal && !jar.isMain ? buildJarTypeDropdownHtml(jar.id, jarType, 'compact-xs') : '';

            list.innerHTML += `
            <div class="jar-card" data-jar-id="${escapeHtml(String(jar.id))}" style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <div style="font-weight: 700; font-size: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap;">
                        <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(jar.name)}</span>
                        ${mainBadge}
                        ${typeBadge}
                    </div>
                    ${deleteBtn}
                </div>
                ${typeSelect}

                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="overflow: hidden; padding-right: 8px; width: 100%;">
                        <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Зібрано / Ціль</div>
                        <div style="font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            ${jarAmountInput(jar.id, 'updateJarBalance', jar.balance, 'var(--sys-green)')}
                            <span style="color: var(--text-tertiary); font-weight: 500;">/</span>
                            ${jarAmountInput(jar.id, 'updateJarGoal', jar.goal, 'var(--text-primary)')}
                        </div>
                    </div>
                </div>

                ${jar.goal > 0 ? `
                <div class="jar-progress-bg" style="background: rgba(255, 255, 255, 0.05); height: 6px; border-radius: 3px; margin-top: 4px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);">
                    <div class="jar-progress-fill" style="width: ${percent}%; background: linear-gradient(90deg, var(--sys-green), #1e702e); box-shadow: 0 0 10px rgba(46, 160, 67, 0.5); border-radius: 3px; height: 100%;"></div>
                </div>` : ''}
            </div>`;
        });
    }

    function createNewEnvelope() {
        const name = document.getElementById('new-jar-name').value, goal = parseFloat(document.getElementById('new-jar-goal').value) || 0;
        const jarType = document.getElementById('new-jar-type-value')?.value || 'regular';
        if(!name) return;
        if(!globalData.jars[currentUser.id]) globalData.jars[currentUser.id] = [];
        const jarNewId = newId();
        globalData.jars[currentUser.id].push({ id: jarNewId, name, goal, balance: 0, isMain: false });
        if (jarType !== 'regular') {
            const fp = getFinancialPlan();
            fp.jarTypes[String(jarNewId)] = jarType;
            saveFinancialPlan();
        }
        document.getElementById('new-jar-name').value = '';
        document.getElementById('new-jar-goal').value = '';
        selectNewJarType({ stopPropagation: () => {} }, 'regular');
        saveGlobalData(); renderEnvelopes(); updateSavingsDisplay(); renderFinancialPlanBlock();
    }

    function findUserJar(id) {
        return (globalData.jars[currentUser.id] || []).find((j) => j.id == id) || null;
    }

    function refreshJarProgress(id) {
        const jar = findUserJar(id);
        const card = document.querySelector(`[data-jar-id="${CSS.escape(String(id))}"]`);
        if (!jar || !card) return;
        const bar = card.querySelector('.jar-progress-bg');
        const percent = jar.goal > 0 ? Math.min(100, (jar.balance / jar.goal) * 100) : 0;
        if (jar.goal > 0) {
            if (!bar) {
                renderEnvelopes();
                return;
            }
            const fill = bar.querySelector('.jar-progress-fill');
            if (fill) fill.style.width = `${percent}%`;
            return;
        }
        if (bar) bar.remove();
    }

    function updateJarBalance(id, val) {
        const jar = findUserJar(id);
        if (!jar) return;
        const next = Math.max(0, roundMoney(parseFloat(val) || 0));
        const prev = roundMoney(jar.balance);
        jar.balance = next;
        recordJarBalanceDelta(jar, next - prev);
        updateSavingsDisplay();
        refreshJarProgress(id);
        renderFinancialPlanBlock();
        saveData();
    }

    function recordJarBalanceDelta(jar, delta) {
        if (!jar || jar.isMain || Math.abs(delta) < 0.005) return;
        if (!appData[currentYear]?.[currentMonth]?.initialized) return;
        let savingsCat = expenses.find((e) => e.isSavings);
        if (!savingsCat) {
            savingsCat = { id: newId(), name: 'Заощадження', isSavings: true, items: [] };
            expenses.push(savingsCat);
        }
        const item = {
            id: newId(),
            name: `${delta >= 0 ? 'У конверт' : 'З конверта'}: ${jar.name}`,
            amount: delta,
            envelopeId: jar.id,
        };
        savingsCat.items.push(item);
        appData[currentYear][currentMonth].expenses = expenses;
    }

    function updateJarGoal(id, val) {
        const jar = findUserJar(id);
        if (!jar) return;
        jar.goal = Math.max(0, roundMoney(parseFloat(val) || 0));
        refreshJarProgress(id);
        renderFinancialPlanBlock();
        saveData();
    }

    function updateMainJarBalance(id, val) {
        updateJarBalance(id, val);
    }

    function deleteEnvelope(id) {
        showConfirm(
            "Видалити конверт?",
            "Накопичення з минулих періодів перейдуть в основний конверт. Суми цього місяця повернуться у вільний залишок.",
            () => {
            const jars = globalData.jars[currentUser.id] || [];
            const jar = jars.find(j => j.id == id);
            if (!jar || jar.isMain) return;

            const savingsCat = expenses.find(e => e.isSavings);
            const monthItems = savingsCat
                ? savingsCat.items.filter(item => item.envelopeId == id)
                : [];
            const thisMonthAmount = monthItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            const jarBalance = parseFloat(jar.balance) || 0;
            const priorBalance = Math.max(0, jarBalance - thisMonthAmount);

            const mainJar = jars.find(j => j.isMain) || jars.find(j => j.id != id);
            if (mainJar && priorBalance > 0) {
                mainJar.balance = addMoney(mainJar.balance, priorBalance);
            }

            globalData.jars[currentUser.id] = jars.filter(j => j.id != id);
            const fp = getFinancialPlan();
            delete fp.jarTypes[String(id)];
            saveFinancialPlan();
            if (savingsCat) {
                savingsCat.items = savingsCat.items.filter(item => item.envelopeId != id);
                if (savingsCat.items.length === 0) {
                    expenses = expenses.filter(e => e.id !== savingsCat.id);
                }
            }
            if (appData[currentYear] && appData[currentYear][currentMonth]) {
                appData[currentYear][currentMonth].expenses = expenses;
            }
            renderEnvelopes(); renderExpenses(); updateAll(); updateSavingsDisplay();
            saveData(true);
        });
    }

    function openTransferModal() {
        const monthData = appData[currentYear]?.[currentMonth] || {};
        const isBiz = currentUser && currentUser.account_type === 'business';
        const totalExp = expenses.reduce((sum, exp) => sum + getCategoryTotal(exp), 0);
        const purchases = isBiz ? getMonthPurchasesUah(monthData, currentIncomeUah) : 0;
        const payroll = isBiz ? getPayrollAccruedFromList(monthData.payroll) : 0;
        const remaining = currentIncomeUah - purchases - totalExp - payroll;
        
        const optionsContainer = document.getElementById('transfer-jar-options');
        optionsContainer.innerHTML = '';
        const userJars = globalData.jars[currentUser.id] || [];
        
        if (userJars.length === 0) {
            document.getElementById('transfer-jar-selected').innerHTML = "Немає конвертів"; document.getElementById('transfer-jar-select').value = "";
        } else {
            let firstJarId = null, firstJarName = '';
            userJars.forEach((jar, index) => {
                const text = `${jar.name} (зараз ${formatMoney(jar.balance)} ₴)`;
                if (index === 0) { firstJarId = jar.id; firstJarName = text; }
                optionsContainer.innerHTML += `<div class="custom-dropdown-option" data-action="selectTransferJar" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([jar.id, text]))}">${escapeHtml(text)}</div>`;
            });
            selectTransferJar(null, firstJarId, firstJarName);
        }

        document.getElementById('transfer-amount').value = remaining > 0 ? parseFloat(remaining.toFixed(2)) : '';
        document.getElementById('transfer-modal').classList.add('active');
        setTimeout(() => document.getElementById('transfer-amount').focus(), 300);
    }

    function closeTransferModal(e) { if (!e || e.target.id === 'transfer-modal' || e.target.className === 'btn-close-modal') document.getElementById('transfer-modal').classList.remove('active'); }

    function selectTransferJar(event, id, text) {
        if(event) event.stopPropagation();
        document.getElementById('transfer-jar-select').value = id;
        document.getElementById('transfer-jar-selected').innerHTML = escapeHtml(text);
        document.getElementById('transfer-jar-dropdown').classList.remove('open');
    }

    function executeTransfer() {
        const val = parseFloat(document.getElementById('transfer-amount').value), jarId = document.getElementById('transfer-jar-select').value;
        if (!val || val <= 0 || !jarId) return;

        let savingsCat = expenses.find(e => e.isSavings);
        if (!savingsCat) { savingsCat = { id: newId(), name: "Заощадження", isSavings: true, items: [] }; expenses.push(savingsCat); }
        
        const jar = globalData.jars[currentUser.id].find(j => j.id == jarId);
        if(jar) { jar.balance = addMoney(jar.balance, val); savingsCat.items.push({ id: newId(), name: "У конверт: " + jar.name, amount: val, envelopeId: jarId }); }
        
        if (appData[currentYear] && appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth].expenses = expenses;
        }

        renderExpenses(); updateAll(); updateSavingsDisplay(); closeTransferModal();
        saveDataToServer(); 
    }

    // ==========================================
    // 10. ДОЛГИ И КРЕДИТЫ
    // ==========================================
    function getDebtPaidThrough(debtId, targetYear, targetMonth) {
        const targetDate = targetYear * 100 + targetMonth;
        let totalPaid = 0;

        for (const y in appData) {
            for (const m in appData[y]) {
                const monthDate = parseInt(y) * 100 + parseInt(m);
                if (monthDate <= targetDate && appData[y][m]?.expenses) {
                    appData[y][m].expenses.forEach(cat => {
                        if (cat.items) {
                            cat.items.forEach(item => {
                                if (item.debtId == debtId && item.isPaid) totalPaid += (parseFloat(item.debtDeduction) || 0);
                            });
                        }
                    });
                }
            }
        }
        return totalPaid;
    }

    function getAppPaidAllTime(debtId) {
        return getDebtPaidThrough(debtId, 9999, 12);
    }

    function getDebtOutsidePaid(debt) {
        return Math.max(0, parseFloat(debt?.outside_paid) || 0);
    }

    function hydrateDebtOutsidePaid(debt) {
        if (!debt) return;
        const appPaid = getAppPaidAllTime(debt.id);
        const total = parseFloat(debt.total_amount) || 0;
        const remaining = parseFloat(debt.remaining_amount);
        const knownRemaining = Number.isFinite(remaining) ? remaining : Math.max(0, total - appPaid);
        debt.outside_paid = Math.max(0, total - knownRemaining - appPaid);
    }

    function hydrateUserDebtsOutsidePaid(userId) {
        (globalData.debts[userId] || []).forEach(hydrateDebtOutsidePaid);
    }

    function getHistoricalDebtBalance(debtId, targetYear, targetMonth) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return 0;
        return Math.max(0, debt.total_amount - getDebtPaidThrough(debtId, targetYear, targetMonth) - getDebtOutsidePaid(debt));
    }

    function findUserDebt(id) {
        return (globalData.debts[currentUser.id] || []).find((d) => d.id == id) || null;
    }

    function parseDebtAmountInput(val) {
        return Math.max(0, parseFloat(String(val).replace(',', '.')) || 0);
    }

    function getDebtItemDeduction(item) {
        const deduction = parseFloat(item?.debtDeduction);
        if (Number.isFinite(deduction)) return Math.max(0, deduction);
        return Math.max(0, parseFloat(item?.amount) || 0);
    }

    function setDebtItemDeduction(item, debt, deduction) {
        const value = Math.max(0, deduction);
        item.debtDeduction = value;
        item.amount = debt?.currency === 'USD' ? value * currentExchangeRate : value;
    }

    function listDebtPaymentEntries(debtId, { currentMonthOnly = false, unpaidOnly = false } = {}) {
        const entries = [];
        const visitMonth = (year, month, cats) => {
            (cats || []).forEach((cat) => {
                (cat.items || []).forEach((item, index) => {
                    if (item.debtId != debtId) return;
                    if (unpaidOnly && item.isPaid) return;
                    entries.push({ year, month, cat, item, index });
                });
            });
        };
        if (currentMonthOnly) {
            visitMonth(currentYear, currentMonth, expenses);
            entries.sort((a, b) => b.index - a.index);
            return entries;
        }
        for (const y of Object.keys(appData)) {
            for (const m of Object.keys(appData[y] || {})) {
                const monthData = appData[y][m];
                if (!monthData?.initialized || !monthData.expenses) continue;
                visitMonth(Number(y), Number(m), monthData.expenses);
            }
        }
        entries.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month) || b.index - a.index);
        return entries;
    }

    function reduceDebtPaymentEntriesToCap(entries, debt, cap) {
        let sum = entries.reduce((s, e) => s + getDebtItemDeduction(e.item), 0);
        if (sum <= cap + 0.005) return [];
        let excess = sum - cap;
        const touched = [];
        const seen = new Set();
        for (const entry of entries) {
            if (excess <= 0.005) break;
            const cur = getDebtItemDeduction(entry.item);
            if (cur <= 0) continue;
            const next = Math.max(0, cur - excess);
            excess -= (cur - next);
            if (next <= 0.005) {
                entry.cat.items = (entry.cat.items || []).filter((it) => it !== entry.item);
            } else {
                setDebtItemDeduction(entry.item, debt, next);
            }
            const key = `${entry.year}-${entry.month}`;
            if (!seen.has(key)) {
                seen.add(key);
                touched.push({ year: entry.year, month: entry.month });
            }
        }
        return touched;
    }

    function persistTouchedDebtMonths(touched) {
        if (appData[currentYear]?.[currentMonth]) {
            appData[currentYear][currentMonth].expenses = expenses;
        }
        (touched || []).forEach(({ year, month }) => {
            if (year === currentYear && month === currentMonth) return;
            enqueueSave(year, month);
        });
    }

    function refreshBudgetAfterDebtEdit(debtId) {
        renderExpenses();
        updateAll();
        const categoryModal = document.getElementById('category-modal');
        if (categoryModal?.classList.contains('active')) {
            const cat = findExpenseById(activeCategoryId);
            if (cat && (cat.name === "Погашення боргів" || (cat.items || []).some((item) => item.debtId == debtId))) {
                renderModalItems();
            }
        }
    }

    function reconcileDebtCategoryToAmounts(debtId, newTotal, newRemaining, { trimCurrentPaidToRemaining = false } = {}) {
        const debt = findUserDebt(debtId);
        if (!debt) return false;
        const paidEntries = listDebtPaymentEntries(debtId).filter((e) => e.item.isPaid);
        const unpaidCurrent = listDebtPaymentEntries(debtId, { currentMonthOnly: true, unpaidOnly: true });
        const touched = [
            ...reduceDebtPaymentEntriesToCap(paidEntries, debt, newTotal),
            ...reduceDebtPaymentEntriesToCap(unpaidCurrent, debt, newRemaining),
        ];
        if (trimCurrentPaidToRemaining) {
            const paidCurrent = listDebtPaymentEntries(debtId, { currentMonthOnly: true }).filter((e) => e.item.isPaid);
            touched.push(...reduceDebtPaymentEntriesToCap(paidCurrent, debt, newRemaining));
        }
        const unique = [];
        const seen = new Set();
        touched.forEach((t) => {
            const key = `${t.year}-${t.month}`;
            if (seen.has(key)) return;
            seen.add(key);
            unique.push(t);
        });
        if (unique.length === 0) return false;
        persistTouchedDebtMonths(unique);
        return true;
    }

    function debtCategoryOverflow(debtId, newTotal, newRemaining) {
        const paid = getAppPaidAllTime(debtId);
        const currentEntries = listDebtPaymentEntries(debtId, { currentMonthOnly: true });
        const currentSum = currentEntries.reduce((s, e) => s + getDebtItemDeduction(e.item), 0);
        const unpaidSum = currentEntries.filter((e) => !e.item.isPaid).reduce((s, e) => s + getDebtItemDeduction(e.item), 0);
        return {
            paid,
            currentSum,
            unpaidSum,
            hasOverflow: paid > newTotal + 0.005 || currentSum > newRemaining + 0.005 || unpaidSum > newRemaining + 0.005
        };
    }

    function confirmDebtCategoryTrim(debt, overflow, newTotal, newRemaining, onConfirm) {
        const symbol = debt.currency === 'USD' ? '$' : '₴';
        let message = 'У категорії «Погашення боргів» сума більша за новий борг. Платежі в категорії буде зменшено, щоб вони збігалися з відредагованою сумою.';
        if (overflow.paid > newTotal + 0.005 && overflow.currentSum > newRemaining + 0.005) {
            message = `У «Погашення боргів» уже є ${formatMoney(Math.max(overflow.paid, overflow.currentSum))} ${symbol}, а нова сума боргу менша. Зменшити платежі в категорії до ${formatMoney(newRemaining)} ${symbol} залишку / ${formatMoney(newTotal)} ${symbol} всього?`;
        } else if (overflow.paid > newTotal + 0.005) {
            message = `У «Погашення боргів» уже проведено ${formatMoney(overflow.paid)} ${symbol}, а нова сума боргу ${formatMoney(newTotal)} ${symbol}. Зменшити платежі в категорії до нової суми?`;
        } else {
            message = `У «Погашення боргів» цього місяця ${formatMoney(overflow.currentSum)} ${symbol}, а новий залишок ${formatMoney(newRemaining)} ${symbol}. Зменшити платіж у категорії до залишку?`;
        }
        showConfirm("Зменшити платежі в категорії?", message, onConfirm);
    }

    function syncGlobalDebtBalance(debtId) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return;

        const totalPaid = getAppPaidAllTime(debtId);
        debt.remaining_amount = Math.max(0, roundMoney(debt.total_amount - totalPaid - getDebtOutsidePaid(debt)));
        
        if (debt.remaining_amount > 0 && debt.is_archived > 0) debt.is_archived = 0;
    }

    function openDebtsModal() { renderDebts(); document.getElementById('debts-modal').classList.add('active'); }
    function closeDebtsModal(e) { if (!e || e.target.id === 'debts-modal' || e.target.className === 'btn-close-modal') document.getElementById('debts-modal').classList.remove('active'); }

    function selectDebtCurrency(event, curr) {
        if (event) event.stopPropagation();
        document.getElementById('new-debt-currency').innerText = curr;
        event.target.closest('.custom-dropdown').classList.remove('open');
    }

    function isDebtActiveInCurrentMonth(debt) {
        if (debt.start_year === undefined || debt.start_month === undefined) return true;
        const viewDate = currentYear * 100 + currentMonth; 
        const startDate = debt.start_year * 100 + debt.start_month;
        return viewDate >= startDate; 
    }

    function createNewDebt() {
        const name = document.getElementById('new-debt-name').value;
        const amount = parseFloat(document.getElementById('new-debt-amount').value) || 0;
        const interest = parseFloat(document.getElementById('new-debt-interest').value) || 0;
        const currency = document.getElementById('new-debt-currency').innerText;

        if (!name || amount <= 0) return;
        if (!globalData.debts[currentUser.id]) globalData.debts[currentUser.id] = [];

        globalData.debts[currentUser.id].push({
            id: newId(),
            user_id: currentUser.id,
            name: name,
            total_amount: amount,
            remaining_amount: amount,
            currency: currency,
            interest_rate: interest,
            type: interest > 0 ? 'percent' : 'fix',
            is_archived: 0, 
            start_year: currentYear,
            start_month: currentMonth,
            outside_paid: 0
        });

        document.getElementById('new-debt-name').value = '';
        document.getElementById('new-debt-amount').value = '';
        document.getElementById('new-debt-interest').value = '';

        saveGlobalData();
        renderDebts();
        updateDebtsDisplay();
    }

    function renderDebts() {
        const list = document.getElementById('debts-list'); list.innerHTML = '';
        const viewDate = currentYear * 100 + currentMonth;
        const allUserDebts = globalData.debts[currentUser.id] || [];
        const userDebts = allUserDebts.filter(isDebtActiveInCurrentMonth);

        const activeDebts = userDebts.filter(d => !d.is_archived || d.is_archived === 0 || viewDate < Math.abs(d.is_archived));
        const archivedDebts = userDebts.filter(d => d.is_archived !== 0 && viewDate >= Math.abs(d.is_archived));

        // --- ДОДАНО СОРТУВАННЯ ---
        // Тепер список карток буде шикуватися за тим самим порядком, що й у Календарі
        activeDebts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        archivedDebts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        // -------------------------

        if (userDebts.length === 0) return list.innerHTML = '<div style="color: var(--text-tertiary); text-align: center; padding: 20px; font-weight: 500;">У цьому місяці зобов\'язань немає. Ви чудові!</div>';

        activeDebts.forEach(debt => {
            const historicalRemaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
            const percent = debt.total_amount > 0 ? Math.min(100, ((debt.total_amount - historicalRemaining) / debt.total_amount) * 100) : 0;
            const currencySymbol = debt.currency === 'USD' ? '$' : '₴';
            const interestTag = debt.interest_rate > 0 ? `<span style="font-size: 11px; background: rgba(255, 69, 58, 0.2); padding: 2px 6px; border-radius: 6px; color: #ff453a;">${debt.interest_rate}% / міс.</span>` : '';
            const monthlyInterest = getMonthlyInterestEstimate(debt, historicalRemaining);
            const interestEstimateTag = monthlyInterest > 0 ? `<span style="font-size: 11px; color: var(--text-secondary); background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 6px; flex-shrink: 0;">≈ ${formatMoney(monthlyInterest)} ${currencySymbol} / міс нарахування</span>` : '';

            const isPaidOff = historicalRemaining <= 0;
            const payBtnHtml = debtPayButtonHtml(debt.id, isPaidOff);

            const debtInputStyle =
                `background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: var(--text-primary); font-size: 16px; font-weight: 700; width: 132px; max-width: 100%; padding: 6px 10px; outline: none; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);`;

            list.innerHTML += `
            <div data-debt-id="${escapeHtml(String(debt.id))}" style="background: var(--item-bg); border: 1px solid rgba(255, 69, 58, 0.2); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                    <div style="min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 8px;">
                        <div style="font-weight: 700; font-size: 16px; color: #ff453a; overflow-wrap: anywhere; word-break: break-word; line-height: 1.3;">${escapeHtml(debt.name)}</div>
                        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px;">
                            <span style="font-size: 11px; background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 6px; color: var(--text-primary);">${escapeHtml(debt.currency)}</span>${interestTag}<span data-debt-interest-estimate>${interestEstimateTag}</span>
                        </div>
                    </div>
                    <button data-action="deleteDebt" data-args="${escapeAttr(JSON.stringify([debt.id]))}" style="background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); color: var(--text-tertiary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0;">✕</button>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 8px;">
                    <div style="overflow: hidden; padding-right: 8px; min-width: 0; flex: 1;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Залишок / Сума боргу</div>
                        <div style="font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span data-debt-remaining style="${isPaidOff ? 'color: var(--sys-green);' : 'color: var(--text-primary)'}">${formatMoney(historicalRemaining)} ${currencySymbol}</span>
                            <span style="color: var(--text-tertiary); font-weight: 500;">/</span>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <input type="number" min="0" step="0.01" value="${debt.total_amount || 0}" aria-label="Сума боргу"
                                    data-change-action="updateDebtTotal"
                                    data-args="${escapeAttr(JSON.stringify([debt.id]))}"
                                    style="${debtInputStyle}">
                                <span>${currencySymbol}</span>
                            </div>
                        </div>
                    </div>
                    <div data-debt-pay-slot style="flex-shrink: 0;">${payBtnHtml}</div>
                </div>
                <div class="jar-progress-bg" style="background: rgba(255, 69, 58, 0.1); height: 6px; border-radius: 3px; margin-top: 4px;"><div class="jar-progress-fill" style="width: ${percent}%; background: linear-gradient(90deg, #ff453a, #d70015); box-shadow: 0 0 10px rgba(255, 69, 58, 0.5); border-radius: 3px;"></div></div>
            </div>`;
        });

        if (archivedDebts.length > 0) {
            list.innerHTML += `<div style="margin-top: 16px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Архів (закрито / скасовано)</div>`;
            archivedDebts.forEach(debt => {
                const historicalRemaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
                const isPaidOff = historicalRemaining <= 0;
                const statusText = isPaidOff ? '✓ Виплачено' : 'Скасовано';
                const statusColor = isPaidOff ? 'var(--sys-green)' : 'var(--text-secondary)';
                const currencySymbol = debt.currency === 'USD' ? '$' : '₴';
                let deleteBtnHtml = '';
                if (historicalRemaining === debt.total_amount) {
                    deleteBtnHtml = `<button data-action="hardDeleteDebt" data-args="${escapeAttr(JSON.stringify([debt.id]))}" style="background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); color: var(--text-secondary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0; margin-left: 12px;">✕</button>`;
                }
                list.innerHTML += `
                <div style="background: var(--item-bg); border: 1px solid var(--glass-border); border-radius: 16px; opacity: 0.7; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="width: 100%; overflow: hidden;">
                            <div style="color: var(--text-secondary); font-size: 15px; font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 8px;"><span style="overflow-wrap: anywhere; word-break: break-word; line-height: 1.3;">${escapeHtml(debt.name)}</span> <span style="font-size: 11px; background: var(--btn-secondary-bg); padding: 2px 6px; border-radius: 6px; color: var(--text-primary); flex-shrink: 0;">${escapeHtml(debt.currency)}</span></div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 10px;"><div style="color: ${statusColor}; font-size: 13px; font-weight: 700; white-space: nowrap;">${statusText}</div><div style="font-size: 13px; color: var(--text-tertiary); font-weight: 500; white-space: nowrap;">Сума: ${formatMoney(debt.total_amount)} ${currencySymbol}</div></div>
                        </div>
                        ${deleteBtnHtml}
                    </div>
                </div>`;
            });
        }
    }

    function deleteDebt(id) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == id);
        if (!debt) return;

        const viewDate = currentYear * 100 + currentMonth;
        const startDate = (debt.start_year !== undefined) ? (debt.start_year * 100 + debt.start_month) : 0;
        const historicalRemaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);

        if (historicalRemaining === debt.total_amount && viewDate === startDate) {
            showConfirm("Видалити борг?", "Ви впевнені? За боргом не було платежів, його буде видалено назавжди.", () => {
                globalData.debts[currentUser.id] = globalData.debts[currentUser.id].filter(d => d.id != id);
                saveGlobalData(); renderDebts(); updateDebtsDisplay();
            });
        } else {
            showConfirm("Відправити в архів?", "Починаючи з цього місяця борг піде в архів, а в минулих місяцях залишиться активним для збереження історії.", () => {
                debt.is_archived = -viewDate; 
                saveGlobalData(); renderDebts(); updateDebtsDisplay();
            });
        }
    }

    function hardDeleteDebt(id) {
        showConfirm("Видалити назавжди?", "За цим боргом не залишилося платежів. Його буде повністю видалено з бази.", () => {
            globalData.debts[currentUser.id] = globalData.debts[currentUser.id].filter(d => d.id != id);
            saveGlobalData(); renderDebts(); updateDebtsDisplay();
        });
    }

    function debtPayButtonHtml(debtId, isPaidOff) {
        return isPaidOff
            ? `<div style="color: var(--sys-green); font-weight: 700; font-size: 13px; padding: 8px 0;">✓ Виплачено</div>`
            : `<button data-action="payDebt" data-args="${escapeAttr(JSON.stringify([debtId]))}" style="background-color: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.2); padding: 8px 16px; border-radius: 12px; color: #ff453a; font-weight: 700; font-size: 13px; cursor: pointer; transition: background-color 0.2s ease; flex-shrink: 0;">Оплатити</button>`;
    }

    function refreshDebtCard(id) {
        const debt = findUserDebt(id);
        const card = document.querySelector(`[data-debt-id="${CSS.escape(String(id))}"]`);
        if (!debt || !card) return;

        const remaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
        const isPaidOff = remaining <= 0;
        const currencySymbol = debt.currency === 'USD' ? '$' : '₴';
        const active = document.activeElement;

        const remainingEl = card.querySelector('[data-debt-remaining]');
        if (remainingEl) {
            remainingEl.textContent = `${formatMoney(remaining)} ${currencySymbol}`;
            remainingEl.style.color = isPaidOff ? 'var(--sys-green)' : 'var(--text-primary)';
        }
        const totalInput = card.querySelector('[data-change-action="updateDebtTotal"]');
        if (totalInput && totalInput !== active) {
            totalInput.value = debt.total_amount || 0;
        }

        const percent = debt.total_amount > 0 ? Math.min(100, ((debt.total_amount - remaining) / debt.total_amount) * 100) : 0;
        const fill = card.querySelector('.jar-progress-fill');
        if (fill) fill.style.width = `${percent}%`;

        const paySlot = card.querySelector('[data-debt-pay-slot]');
        if (paySlot) paySlot.innerHTML = debtPayButtonHtml(debt.id, isPaidOff);

        const estimateEl = card.querySelector('[data-debt-interest-estimate]');
        if (estimateEl) {
            const monthlyInterest = getMonthlyInterestEstimate(debt, remaining);
            estimateEl.innerHTML = monthlyInterest > 0
                ? `<span style="font-size: 11px; color: var(--text-secondary); background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 6px; flex-shrink: 0;">≈ ${formatMoney(monthlyInterest)} ${currencySymbol} / міс нарахування</span>`
                : '';
        }
    }

    function updateDebtRemaining(id, val) {
        const debt = findUserDebt(id);
        if (!debt) return;
        const remaining = parseDebtAmountInput(val);
        const appPaid = getDebtPaidThrough(id, currentYear, currentMonth);
        const total = parseFloat(debt.total_amount) || 0;
        const newTotal = remaining > total - appPaid ? remaining + appPaid : total;
        const overflow = debtCategoryOverflow(id, newTotal, remaining);

        const apply = () => {
            reconcileDebtCategoryToAmounts(id, newTotal, remaining, { trimCurrentPaidToRemaining: true });
            const paidNow = getDebtPaidThrough(id, currentYear, currentMonth);
            const currentTotal = parseFloat(debt.total_amount) || 0;
            if (remaining > currentTotal - paidNow) {
                debt.total_amount = remaining + paidNow;
                debt.outside_paid = 0;
            } else {
                debt.outside_paid = Math.max(0, currentTotal - remaining - paidNow);
            }
            syncGlobalDebtBalance(id);
            refreshDebtCard(id);
            updateDebtsDisplay();
            refreshBudgetAfterDebtEdit(id);
            saveGlobalData();
        };

        if (overflow.hasOverflow) {
            confirmDebtCategoryTrim(debt, overflow, newTotal, remaining, apply);
            refreshDebtCard(id);
            return;
        }
        apply();
    }

    function updateDebtTotal(id, val) {
        const debt = findUserDebt(id);
        if (!debt) return;
        const appPaid = getAppPaidAllTime(id);
        const newTotal = parseDebtAmountInput(val);
        const paidThrough = getDebtPaidThrough(id, currentYear, currentMonth);
        const newOutside = Math.min(getDebtOutsidePaid(debt), Math.max(0, newTotal - appPaid));
        const newRemaining = Math.max(0, newTotal - paidThrough - newOutside);
        const overflow = debtCategoryOverflow(id, newTotal, newRemaining);

        const apply = () => {
            reconcileDebtCategoryToAmounts(id, newTotal, newRemaining);
            const paidNow = getAppPaidAllTime(id);
            debt.total_amount = Math.max(newTotal, 0);
            if (getDebtOutsidePaid(debt) > debt.total_amount - paidNow) {
                debt.outside_paid = Math.max(0, debt.total_amount - paidNow);
            }
            syncGlobalDebtBalance(id);
            refreshDebtCard(id);
            updateDebtsDisplay();
            refreshBudgetAfterDebtEdit(id);
            saveGlobalData();
        };

        if (overflow.hasOverflow) {
            confirmDebtCategoryTrim(debt, overflow, newTotal, newRemaining, apply);
            refreshDebtCard(id);
            return;
        }
        apply();
    }

    function updateDebtsDisplay() {
        if (!currentUser) return;
        const allUserDebts = globalData.debts[currentUser.id] || [];
        let totalInUah = 0;
        const viewDate = currentYear * 100 + currentMonth;

        allUserDebts.forEach(debt => {
            if (!isDebtActiveInCurrentMonth(debt)) return; 
            
            const isActive = !debt.is_archived || debt.is_archived === 0 || viewDate < Math.abs(debt.is_archived);
            
            if (isActive) {
                const historicalRemaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
                if (debt.currency === 'USD') {
                    totalInUah += (historicalRemaining * currentExchangeRate); 
                } else {
                    totalInUah += historicalRemaining;
                }
            }
        });

        document.getElementById('total-debts-display').innerText = formatMoney(totalInUah);
        document.getElementById('debt-minus-sign').style.display = totalInUah > 0 ? 'inline' : 'none';
    }

    function payDebt(id) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == id);
        if (!debt) return;

        document.getElementById('pay-debt-currency-symbol').innerText = debt.currency === 'USD' ? '$' : '₴';
        
        document.getElementById('pay-debt-id').value = id;
        document.getElementById('pay-debt-amount').value = '';
        document.getElementById('pay-debt-modal').classList.add('active');
        setTimeout(() => document.getElementById('pay-debt-amount').focus(), 300);
    }

    function closePayDebtModal(e) {
        if (!e || e.target.id === 'pay-debt-modal' || e.target.className === 'btn-close-modal') {
            document.getElementById('pay-debt-modal').classList.remove('active');
        }
    }

    function executeDebtPayment() {
        const id = document.getElementById('pay-debt-id').value;
        const amountStr = document.getElementById('pay-debt-amount').value;
        const inputAmount = parseFloat(amountStr.replace(',', '.')) || 0; 
        
        if (!id || inputAmount <= 0) return;

        const debt = globalData.debts[currentUser.id].find(d => d.id == id);
        if (!debt) return;

        let amountToDeduct = inputAmount; 
        let amountInUah = inputAmount;    

        if (debt.currency === 'USD') {
            amountInUah = inputAmount * currentExchangeRate; 
        }

        let debtCat = expenses.find(e => e.name === "Погашення боргів");
        if (!debtCat) {
            debtCat = { id: newId(), name: "Погашення боргів", items: [] };
            expenses.push(debtCat);
        }

        debtCat.items.push({
            id: newId(),
            name: `Платіж: ${debt.name}`,
            amount: amountInUah,          
            isPaid: true,
            debtId: debt.id,
            debtDeduction: amountToDeduct 
        });

        if (appData[currentYear] && appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth].expenses = expenses;
        }

        syncGlobalDebtBalance(debt.id); 
        
        closePayDebtModal();
        
        renderDebts();
        updateDebtsDisplay();
        renderExpenses();
        updateAll(); 
        
        saveDataToServer();
    }

    // ==========================================
    // 11. ГРАФИКИ И ДИНАМИКА
    // ==========================================
    let googleChartsLoaded = false;

    function bootGoogleCharts() {
        if (typeof google === 'undefined' || !google.charts) {
            console.error('Google Charts loader is unavailable (CSP or network)');
            return;
        }
        google.charts.load('current', { packages: ['sankey'] });
        google.charts.setOnLoadCallback(() => {
            googleChartsLoaded = true;
            if (appData && Object.keys(appData).length > 0) updateChart();
        });
    }
    bootGoogleCharts();

    window.addEventListener('resize', () => {
        if (googleChartsLoaded && document.getElementById('sankey_basic').innerHTML !== '') updateChart();
    });

    function initChart() {
        Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        Chart.defaults.color = '#86868b'; 
    }

    function updateChart() {
        if (!googleChartsLoaded) return;
        
        const container = document.getElementById('sankey_basic');
        if (!container) return;

        let totalIncome = 0;
        const currentMonthData = appData[currentYear] ? appData[currentYear][currentMonth] : null;
        
        if (!currentMonthData || !currentMonthData.initialized) {
            container.innerHTML = '';
            return;
        }

        const data = new google.visualization.DataTable();
        data.addColumn('string', 'Звідки');
        data.addColumn('string', 'Куди');
        data.addColumn('number', 'Сума (₴)');

        const rows = [];
        const isBiz = currentUser && currentUser.account_type === 'business';

        const roundNum = (num) => Math.round(num);

        if (currentMonthData.incomes) {
            currentMonthData.incomes.forEach(inc => {
                let amt = inc.currency === 'USD' ? inc.amount * currentExchangeRate : inc.amount;
                if (amt > 0) {
                    rows.push([inc.name + ' (Дохід)', 'Ваш Бюджет', roundNum(amt)]); 
                    totalIncome += amt;
                }
            });
        }

        if (totalIncome <= 0) {
            container.innerHTML = '<div style="color:var(--text-secondary); text-align:center; padding-top:150px; font-weight:600;">Додайте доходи для графіка</div>';
            return;
        }

let cogsAmount = 0;
        let payTotal = 0;
        if (isBiz) {
            const monthInvoices = currentMonthData.invoices || [];
            cogsAmount = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            if (cogsAmount <= 0 && currentMonthData.cogs) {
                cogsAmount = getMonthPurchasesUah(currentMonthData, totalIncome);
            }
            if (cogsAmount > 0) {
                rows.push(['Ваш Бюджет', 'Закупівлі', roundNum(cogsAmount)]);
            }
        }

        let totalExp = 0;
        expenses.forEach(exp => {
            const catTotal = getCategoryTotal(exp);
            if (catTotal > 0) {
                rows.push(['Ваш Бюджет', exp.name, roundNum(catTotal)]);
                totalExp += catTotal;
            }
        });

        if (isBiz) {
            payTotal = getPayrollAccruedFromList(currentMonthData.payroll);
            if (payTotal > 0) rows.push(['Ваш Бюджет', 'Зарплати', roundNum(payTotal)]);
        }

        const remaining = totalIncome - cogsAmount - totalExp - payTotal;
        if (remaining > 0) {
            rows.push(['Ваш Бюджет', 'Вільний залишок', roundNum(remaining)]);
        } else if (remaining < 0) {
             rows.push(['Дефіцит', 'Ваш Бюджет', roundNum(Math.abs(remaining))]);
        }

        if (rows.length === 0) return;
        data.addRows(rows);

        const formatter = new google.visualization.NumberFormat({
            fractionDigits: 0, 
            groupingSymbol: ' ' 
        });
        formatter.format(data, 2); 

        const colors = ['#0a84ff', '#32d74b', '#ff9f0a', '#ff453a', '#ffd60a', '#5e5ce6', '#bf5af2', '#66d4cf', '#8e8e93'];

        const options = {
            backgroundColor: 'transparent',
            sankey: {
                node: {
                    colors: colors,
                    nodePadding: 24,
                    width: 12,
                    label: { color: '#ffffff', fontSize: 13, bold: true, fontName: '-apple-system' }
                },
                link: {
                    colorMode: 'gradient',
                    colors: colors
                }
            }
        };

        const chart = new google.visualization.Sankey(container);
        chart.draw(data, options);
    }

    function openAnalyticsModal() { document.getElementById('analytics-modal').classList.add('active'); renderAnalyticsChart(); }
    function closeAnalyticsModal(e) { if (!e || e.target.id === 'analytics-modal' || e.target.className === 'btn-close-modal') document.getElementById('analytics-modal').classList.remove('active'); }

    function renderAnalyticsChart() {
        const labels = [], freeMoneyData = [], incomeData = [], expenseData = [];
        const years = Object.keys(appData).map(Number).sort((a, b) => a - b);
        const isBiz = currentUser && currentUser.account_type === 'business';
        
        years.forEach(year => {
            const months = Object.keys(appData[year]).map(Number).sort((a, b) => a - b);
            months.forEach(month => {
                const data = appData[year][month];
                if (data && data.initialized) {
                    labels.push(`${monthNames[month].substring(0,3)} ${year}`);
                    const income = getMonthIncomeUahFromData(data);
                    const purchases = isBiz ? getMonthPurchasesUah(data, income) : 0;
                    const expensesTotal = getMonthExpensesUahFromData(data);
                    const payroll = isBiz ? getPayrollAccruedFromList(data.payroll) : 0;

                    const displayIncome = income - purchases;
                    incomeData.push(displayIncome);
                    expenseData.push(expensesTotal + payroll);
                    freeMoneyData.push(displayIncome - expensesTotal - payroll);
                }
            });
        });

        if (analyticsChart) analyticsChart.destroy();
        
        const canvas = document.getElementById('analyticsChartCanvas');
        const ctx = canvas.getContext('2d');
        const maxTurnover = Math.max(...incomeData, ...expenseData, 0);

        const gradientGreen = ctx.createLinearGradient(0, 0, 0, 400);
        gradientGreen.addColorStop(0, 'rgba(46, 160, 67, 0.9)');
        gradientGreen.addColorStop(1, 'rgba(46, 160, 67, 0.1)');

        const gradientRed = ctx.createLinearGradient(0, 0, 0, 400);
        gradientRed.addColorStop(0, 'rgba(255, 69, 58, 0.9)');
        gradientRed.addColorStop(1, 'rgba(255, 69, 58, 0.1)');

        const gradientBlue = ctx.createLinearGradient(0, 0, 0, 400);
        gradientBlue.addColorStop(0, 'rgba(10, 132, 255, 0.3)');
        gradientBlue.addColorStop(1, 'rgba(10, 132, 255, 0.0)');

        const gradientOrange = ctx.createLinearGradient(0, 0, 0, 400);
        gradientOrange.addColorStop(0, 'rgba(255, 159, 10, 0.3)');
        gradientOrange.addColorStop(1, 'rgba(255, 159, 10, 0.0)');

        const dynamicBarColors = freeMoneyData.map(val => val < 0 ? gradientRed : gradientGreen);

        analyticsChart = new Chart(ctx, {
            data: { 
                labels, 
                datasets: [ 
                    { 
                        type: 'bar', 
                        label: isBiz ? 'Чистий прибуток' : 'Чистий залишок', 
                        data: freeMoneyData, 
                        backgroundColor: dynamicBarColors, 
                        borderRadius: 12, 
                        borderSkipped: false,
                        borderWidth: 0, 
                        yAxisID: 'y', 
                        order: 2 
                    }, 
                    { 
                        type: 'line', 
                        label: isBiz ? 'Обіг (маржа)' : 'Дохід', 
                        data: incomeData, 
                        borderColor: '#0a84ff', 
                        backgroundColor: gradientBlue, 
                        fill: true, 
                        borderWidth: 4, 
                        tension: 0.4, 
                        pointRadius: 4, 
                        pointHoverRadius: 8, 
                        pointBackgroundColor: '#1c1c1e', 
                        pointBorderColor: '#0a84ff', 
                        pointBorderWidth: 3, 
                        yAxisID: 'y1', 
                        order: 1 
                    }, 
                    { 
                        type: 'line', 
                        label: 'Витрата', 
                        data: expenseData, 
                        borderColor: '#ff9f0a', 
                        backgroundColor: gradientOrange, 
                        fill: true, 
                        borderWidth: 4, 
                        tension: 0.4, 
                        pointRadius: 4, 
                        pointHoverRadius: 8, 
                        pointBackgroundColor: '#1c1c1e', 
                        pointBorderColor: '#ff9f0a', 
                        pointBorderWidth: 3, 
                        yAxisID: 'y1', 
                        order: 1 
                    } 
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                interaction: { mode: 'index', intersect: false }, 
                plugins: { 
                    legend: { 
                        display: true, 
                        position: 'top', 
                        labels: { 
                            usePointStyle: true, 
                            padding: 20,
                            boxWidth: 12, 
                            font: {family: '-apple-system', size: 14, weight: '600'},
                            color: '#a1a1a6'
                        } 
                    }, 
                    tooltip: { 
                        backgroundColor: 'rgba(28, 28, 30, 0.95)', 
                        titleColor: '#a1a1a6', 
                        titleFont: { size: 14, weight: '500' }, 
                        bodyFont: { size: 16, weight: 'bold' }, 
                        bodySpacing: 8,
                        padding: 18, 
                        cornerRadius: 16, 
                        borderColor: 'rgba(255,255,255,0.1)', 
                        borderWidth: 1,
                        callbacks: { 
                            label: function(context) { 
                                let prefix = (context.dataset.label === 'Чистий прибуток' || context.dataset.label === 'Чистий залишок') && context.parsed.y > 0 ? '+' : ''; 
                                return context.dataset.label + ': ' + prefix + formatMoney(context.parsed.y) + ' ₴'; 
                            } 
                        } 
                    } 
                }, 
                scales: { 
                    x: { 
                        grid: { display: false }, 
                        ticks: { font: { size: 13, family: '-apple-system', weight: '600' }, color: '#a1a1a6', padding: 10 } 
                    }, 
                    y: { 
                        type: 'linear', 
                        position: 'left', 
                        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, 
                        ticks: { 
                            color: '#a1a1a6', 
                            font: { size: 13, family: '-apple-system', weight: '500' }, 
                            padding: 10,
                            callback: function(value) { 
                                if (value >= 1000000 || value <= -1000000) return formatMoney(value / 1000000) + 'M'; 
                                if (value >= 1000 || value <= -1000) return formatMoney(value / 1000) + 'k'; 
                                return formatMoney(value); 
                            } 
                        } 
                    }, 
                    y1: { type: 'linear', position: 'right', display: false, suggestedMin: 0, suggestedMax: maxTurnover * 1.3 } 
                } 
            } 
        });
    }
   // ==========================================
    // 12. ГРАФІК ПЛАТЕЖІВ (НЕЗАЛЕЖНИЙ ПЛАНУВАЛЬНИК)
    // ==========================================
    let draggedScheduleDebtId = null;

    function openScheduleModal() {
        document.getElementById('schedule-modal').classList.add('active');
        renderScheduleModal();
    }

    function isDebtArchivedInView(debt) {
        const viewDate = currentYear * 100 + currentMonth;
        return !!(debt.is_archived && Number(debt.is_archived) !== 0 && viewDate >= Math.abs(debt.is_archived));
    }

    function isDebtOpenInSchedule(debt) {
        if (isDebtArchivedInView(debt)) return false;
        return getHistoricalDebtBalance(debt.id, currentYear, currentMonth) > 0;
    }

    function getOpenScheduleDebts() {
        return (globalData.debts[currentUser.id] || []).filter(isDebtOpenInSchedule);
    }

    function parseDebtSchedule(debt) {
        if (typeof debt.schedule === 'string') {
            try { debt.schedule = JSON.parse(debt.schedule); } catch (e) { debt.schedule = {}; }
        }
        if (!debt.schedule || typeof debt.schedule !== 'object') debt.schedule = {};
        return debt.schedule;
    }

    function getScheduleEntry(debt, monthKey) {
        const schedule = parseDebtSchedule(debt);
        const cur = schedule[monthKey];
        if (cur == null) return { amount: 0, isPaid: false };
        if (typeof cur === 'object') {
            return { amount: parseFloat(cur.amount) || 0, isPaid: !!cur.isPaid };
        }
        return { amount: parseFloat(cur) || 0, isPaid: false };
    }

    function setScheduleEntry(debt, monthKey, amount, isPaid) {
        const schedule = parseDebtSchedule(debt);
        const amt = parseFloat(amount) || 0;
        if (amt <= 0 && !isPaid) {
            delete schedule[monthKey];
            return;
        }
        schedule[monthKey] = { amount: amt, isPaid: !!isPaid };
    }

    function closeScheduleModal(e) {
        if (!e || e.target.id === 'schedule-modal' || e.target.className === 'btn-close-modal') {
            document.getElementById('schedule-modal').classList.remove('active');
            
            // СИНХРОНИЗАЦИЯ: при закрытии обновляем основной список и суммы
            renderDebts();          // Перерисовывает карточки в новом порядке
            updateDebtsDisplay();   // Обновляет общую сумму долгов в шапке
        }
    }
    function updateGlobalScheduleRemaining() {
        if (!currentUser || !globalData.debts[currentUser.id]) return;
        const activeDebts = getOpenScheduleDebts();
        
        let globalUnplannedUah = 0;
        activeDebts.forEach(debt => {
            let totalPlanned = 0;
            const schedule = debt.schedule || {};
            Object.values(schedule).forEach(v => {
                let amt = typeof v === 'object' ? (v.amount || 0) : (v || 0);
                totalPlanned += parseFloat(amt);
            });
            let rem = debt.total_amount - totalPlanned;
            globalUnplannedUah += (debt.currency === 'USD' ? rem * currentExchangeRate : rem);
        });

        const globalSpan = document.getElementById('schedule-global-remaining');
        if (globalSpan) {
            globalSpan.innerText = `${formatMoney(globalUnplannedUah)} ₴`;
            globalSpan.style.color = globalUnplannedUah < 0 ? 'var(--sys-red)' : 'var(--text-primary)';
        }
    }

    function generateScheduleMonths(activeDebts) {
        // Знаходимо найстарішу дату початку серед усіх боргів
        let startY = currentYear;
        let startM = currentMonth;

        activeDebts.forEach(d => {
            if (d.start_year !== undefined && d.start_month !== undefined) {
                if (d.start_year < startY || (d.start_year === startY && d.start_month < startM)) {
                    startY = d.start_year;
                    startM = d.start_month;
                }
            }
        });

        // Генеруємо сітку від найстарішого місяця до +2 роки від ПОТОЧНОГО
        const monthsList = [];
        let y = startY;
        let m = startM;
        const endY = currentYear + 2;
        const endM = currentMonth;

        while (y < endY || (y === endY && m <= endM)) {
            const monthStr = `${y}-${String(m + 1).padStart(2, '0')}`;
            monthsList.push({ year: y, month: m, key: monthStr, label: `${monthNames[m].substring(0,3)} ${y}` });
            m++; if (m > 11) { m = 0; y++; }
        }
        return monthsList;
    }

    function renderScheduleModal() {
        const container = document.getElementById('schedule-matrix-container');
        if (!currentUser || !globalData.debts[currentUser.id]) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Немає боргів для відображення</div>';
            return;
        }

        const activeDebts = getOpenScheduleDebts();
        activeDebts.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        if (activeDebts.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Немає активних боргів</div>';
            return;
        }

        const months = generateScheduleMonths(activeDebts);

        let html = '<table class="schedule-table"><thead><tr>';
        html += '<th class="calendar-debt-name-col">Борг</th>';
        months.forEach(m => html += `<th>${m.label}</th>`);
        html += '</tr></thead><tbody>';

        let globalUnplannedUah = 0; // Додаємо лічильник для глобального залишку

        activeDebts.forEach(debt => {
            const currencySymbol = debt.currency === 'USD' ? '$' : '₴';
            
            if (typeof debt.schedule === 'string') { try { debt.schedule = JSON.parse(debt.schedule); } catch(e) { debt.schedule = {}; } }
            const schedule = debt.schedule || {};

            let totalPlanned = 0;
            Object.values(schedule).forEach(val => {
                let amt = typeof val === 'object' ? (val.amount || 0) : (val || 0);
                totalPlanned += parseFloat(amt);
            });
            let dynamicRemaining = debt.total_amount - totalPlanned;
            
            // Плюсуємо залишок в еквіваленті ₴ до глобальної суми
            globalUnplannedUah += (debt.currency === 'USD' ? dynamicRemaining * currentExchangeRate : dynamicRemaining);

            html += `<tr class="schedule-row" draggable="true" data-id="${debt.id}" 
                        data-action="handleScheduleDragStart" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([debt.id]))}" draggable="true" 
                        data-drag-over="handleScheduleDragOver" 
                        data-drag-leave="handleScheduleDragLeave" 
                        data-drag-drop="handleScheduleDrop" data-args="${escapeAttr(JSON.stringify([debt.id]))}"
                        data-drag-end="handleScheduleDragEnd">`;
            
            html += `<td class="calendar-debt-name-col">
                        <div style="display: flex; align-items: flex-start; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">
                            <span class="drag-handle" title="Перетягніть, щоб змінити порядок">≡</span>
                            <span style="font-weight: 700; color: var(--sys-red); overflow-wrap: anywhere; word-break: break-word; line-height: 1.3; min-width: 0; flex: 1;">${escapeHtml(debt.name)}</span>
                            <span style="font-size: 11px; background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 6px; flex-shrink: 0;">${escapeHtml(debt.currency)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); padding-left: 20px;">
                            Залишок плану: <span style="font-weight: 700; color: ${dynamicRemaining < 0 ? 'var(--sys-red)' : 'var(--text-primary)'};">${formatMoney(dynamicRemaining)} ${currencySymbol}</span>
                        </div>
                     </td>`;

            months.forEach(m => {
                const entry = getScheduleEntry(debt, m.key);
                const planVal = entry.amount > 0 ? entry.amount : '';
                const checkedAttr = entry.isPaid ? 'checked' : '';
                const inputClass = entry.isPaid ? 'schedule-input is-paid' : 'schedule-input';

                html += `<td>
                            <div class="schedule-input-group">
                                <input type="checkbox" class="schedule-checkbox" ${checkedAttr} 
                                       title="Позначити у плані графіка (не фіксує фактичну оплату)"
                                       data-change-action="toggleSchedulePaid" data-args="${escapeAttr(JSON.stringify([debt.id, m.key]))}">
                                <input type="number" class="${inputClass}" value="${planVal}" placeholder="0" 
                                       data-input-action="updateScheduleAmount" data-args="${escapeAttr(JSON.stringify([debt.id, m.key]))}">
                            </div>
                         </td>`;
            });
            html += '</tr>';
        });

html += '</tbody></table>';
        container.innerHTML = html;
        
        // Оновлюємо глобальну суму у фіксованому блоці під таблицею
        updateGlobalScheduleRemaining();

        setTimeout(() => {
            const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
            const headerIndex = months.findIndex(m => m.key === currentMonthKey);
            if (headerIndex !== -1) {
                const th = container.querySelectorAll('th')[headerIndex + 1];
                if (th) container.scrollLeft = th.offsetLeft - 220;
            }
        }, 100);
    }

    function toggleSchedulePaid(debtId, monthKey, isChecked) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return;

        const entry = getScheduleEntry(debt, monthKey);
        setScheduleEntry(debt, monthKey, entry.amount, isChecked);
        saveGlobalData();
        renderScheduleModal();
    }

    function updateScheduleAmount(debtId, monthKey, val) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return;

        const entry = getScheduleEntry(debt, monthKey);
        const numVal = parseFloat(val);
        setScheduleEntry(debt, monthKey, isNaN(numVal) ? 0 : numVal, entry.isPaid);

        saveGlobalData();
        
        // Оновлюємо текст "Залишок" у колонці зліва без повного перемалювання (щоб інпут не втрачав фокус)
        let totalPlanned = 0;
        Object.values(debt.schedule).forEach(v => {
            let amt = typeof v === 'object' ? (v.amount || 0) : (v || 0);
            totalPlanned += parseFloat(amt);
        });
        const dynamicRemaining = debt.total_amount - totalPlanned;
        
        const row = document.querySelector(`tr[data-id="${debtId}"]`);
        if (row) {
            const remainingSpan = row.querySelector('.calendar-debt-name-col div:nth-child(2) span');
            if (remainingSpan) {
                remainingSpan.innerText = `${formatMoney(dynamicRemaining)} ${debt.currency === 'USD' ? '$' : '₴'}`;
                remainingSpan.style.color = dynamicRemaining < 0 ? 'var(--sys-red)' : 'var(--text-primary)';
            }
        }
        updateGlobalScheduleRemaining();
    }

    // --- Розумний Drag and Drop з Індикаторами ---
function handleScheduleDragStart(e, id) {
        draggedScheduleDebtId = id;
        // Мікрозатримка, щоб браузер сфотографував нормальний рядок для "привида"
        setTimeout(() => {
            if (e.target && e.target.classList) e.target.classList.add('dragging');
        }, 0);
        e.dataTransfer.effectAllowed = 'move';
    }

    // Нова функція для надійного очищення стилів, коли ми відпускаємо мишку
    function handleScheduleDragEnd(e) {
        if (e.target && e.target.classList) e.target.classList.remove('dragging');
        document.querySelectorAll('.schedule-row').forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        draggedScheduleDebtId = null;
    }

    function handleScheduleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const tr = e.target.closest('tr.schedule-row');
        
        // Очищаємо попередні лінії
        document.querySelectorAll('.schedule-row').forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        if (tr && tr.dataset.id != draggedScheduleDebtId) {
            const rect = tr.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            
            // Якщо миша у верхній половині рядка - показуємо лінію зверху, якщо в нижній - знизу
            if (relY < rect.height / 2) {
                tr.classList.add('drag-over-top');
            } else {
                tr.classList.add('drag-over-bottom');
            }
        }
        return false;
    }

    function handleScheduleDragLeave(e) {
        const tr = e.target.closest('tr');
        if (tr) tr.classList.remove('drag-over-top', 'drag-over-bottom');
    }

    function handleScheduleDrop(e, targetId) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetRow = e.target.closest('tr.schedule-row');
        let insertAfter = false;

        if (targetRow) {
            insertAfter = targetRow.classList.contains('drag-over-bottom');
        }

        // Очищаємо класи
        document.querySelectorAll('.schedule-row').forEach(row => {
            row.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
        });

        if (!draggedScheduleDebtId || draggedScheduleDebtId == targetId) return;

        const debtsArray = globalData.debts[currentUser.id];
        
        const fromIndex = debtsArray.findIndex(d => d.id == draggedScheduleDebtId);
        let toIndex = debtsArray.findIndex(d => d.id == targetId);

        if (fromIndex === -1 || toIndex === -1) return;

        // Витягуємо елемент
        const movedItem = debtsArray.splice(fromIndex, 1)[0];
        
        // Коригуємо індекс вставки
        if (insertAfter) {
            toIndex = fromIndex < toIndex ? toIndex : toIndex + 1;
        } else {
            toIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        }

        // Вставляємо елемент
        debtsArray.splice(toIndex, 0, movedItem);

        // Переписуємо sort_order
        let orderCounter = 1;
        debtsArray.forEach(debt => {
            const isActive = !debt.is_archived || debt.is_archived === 0 || (currentYear * 100 + currentMonth) < Math.abs(debt.is_archived);
            if (isActive) debt.sort_order = orderCounter++;
        });

        saveGlobalData();
        renderScheduleModal();
        draggedScheduleDebtId = null;
    }

    // ==========================================
    // 13. НАКЛАДНЫЕ И ПОСТАВЩИКИ (INVOICES)
    // ==========================================
    function openInvoicesModal() {
        document.getElementById('new-invoice-date').valueAsDate = new Date();
        renderSuppliersDropdown();
        renderInvoices();
        switchInvoiceTab('invoices');
        document.getElementById('invoices-modal').classList.add('active');
    }
    
    function closeInvoicesModal(e) {
        if (!e || e.target.id === 'invoices-modal' || e.target.className === 'btn-close-modal') {
            document.getElementById('invoices-modal').classList.remove('active');
        }
    }
    
    function switchInvoiceTab(tab) {
        document.getElementById('btn-tab-invoices').classList.toggle('active', tab === 'invoices');
        document.getElementById('btn-tab-suppliers').classList.toggle('active', tab === 'suppliers');

        document.getElementById('tab-invoices-content').style.display = tab === 'invoices' ? 'flex' : 'none';
        document.getElementById('tab-suppliers-content').style.display = tab === 'suppliers' ? 'flex' : 'none';

        if (tab === 'suppliers') renderSuppliersTurnover();
        else renderInvoices();
    }
    
    function selectInvoicePayment(type) {
        document.getElementById('btn-inv-cash').classList.toggle('active', type === 'cash');
        document.getElementById('btn-inv-card').classList.toggle('active', type === 'card');
        document.getElementById('new-invoice-payment').value = type;
    }
    

    // --- КАСТОМНЫЙ ДРОПДАУН И МОДАЛКА ПОСТАВЩИКА ---
    function getMonthInvoices() {
        return appData[currentYear]?.[currentMonth]?.invoices || [];
    }

    function getInvoiceTotals(invoices) {
        let total = 0;
        let cash = 0;
        let card = 0;
        (invoices || []).forEach(inv => {
            const amt = parseFloat(inv.amount) || 0;
            total += amt;
            if (inv.payment_method === 'cash') cash += amt;
            else card += amt;
        });
        return { total, cash, card };
    }

    function updateInvoicesModalStats(invoices) {
        const { total, cash, card } = getInvoiceTotals(invoices || getMonthInvoices());
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.innerText = formatMoney(value) + ' ₴';
        };
        setText('modal-invoices-total', total);
        setText('modal-invoices-cash', cash);
        setText('modal-invoices-card', card);
        setText('suppliers-total-stat', total);
        setText('suppliers-total-cash', cash);
        setText('suppliers-total-card', card);
    }

    function formatInvoiceDate(dateStr) {
        const dObj = parseLocalDate(dateStr);
        return dObj ? `${dObj.getDate()} ${monthNames[dObj.getMonth()]}` : (dateStr || '—');
    }

    function formatInvoiceAddedTime(createdAt) {
        if (!createdAt) return '';
        const d = new Date(createdAt);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    function invoiceAddedTimestamp(inv) {
        if (inv?.created_at) {
            const t = Date.parse(inv.created_at);
            if (!Number.isNaN(t)) return t;
        }
        const d = parseLocalDate(inv?.date);
        // Legacy invoices have no add-time: keep date order, always below timestamped rows.
        return d ? d.getTime() - 1e15 : Number.NEGATIVE_INFINITY;
    }

    function normalizeInvoiceAmountQuery(query) {
        return String(query || '').replace(/\s/g, '').replace(',', '.').toLowerCase();
    }

    function invoiceMatchesAmountQuery(inv, query) {
        const q = normalizeInvoiceAmountQuery(query);
        if (!q) return true;
        const amount = Number(inv.amount) || 0;
        const formatted = formatMoney(amount);
        const compact = formatted.replace(/\s/g, '');
        const compactDot = compact.replace(',', '.');
        const raw = String(amount);
        return raw.includes(q) || compact.includes(query.replace(/\s/g, '')) || compactDot.includes(q) || normalizeInvoiceAmountQuery(formatted).includes(q);
    }

    function filterInvoicesByAmount() {
        renderInvoices();
    }

    function openNewSupplierModal() {
        document.getElementById('supplier-dropdown-container')?.classList.remove('open');
        document.getElementById('supplier-edit-id').value = '';
        document.getElementById('new-supplier-name-input').value = '';
        const title = document.getElementById('supplier-modal-title');
        const hint = document.getElementById('supplier-modal-hint');
        const saveBtn = document.getElementById('supplier-save-btn');
        if (title) title.innerText = 'Новий постачальник';
        if (hint) hint.innerText = 'Введіть назву компанії або ФОП';
        if (saveBtn) saveBtn.innerText = 'Додати';
        document.getElementById('new-supplier-modal').classList.add('active');
        setTimeout(() => document.getElementById('new-supplier-name-input').focus(), 100);
    }

    function openEditSupplierModal(id) {
        const sup = (globalData.suppliers[currentUser.id] || []).find(s => s.id == id);
        if (!sup) return;
        document.getElementById('supplier-dropdown-container')?.classList.remove('open');
        document.getElementById('supplier-edit-id').value = String(sup.id);
        document.getElementById('new-supplier-name-input').value = sup.name || '';
        const title = document.getElementById('supplier-modal-title');
        const hint = document.getElementById('supplier-modal-hint');
        const saveBtn = document.getElementById('supplier-save-btn');
        if (title) title.innerText = 'Редагувати постачальника';
        if (hint) hint.innerText = 'Нова назва компанії або ФОП';
        if (saveBtn) saveBtn.innerText = 'Зберегти';
        document.getElementById('new-supplier-modal').classList.add('active');
        setTimeout(() => document.getElementById('new-supplier-name-input').focus(), 100);
    }

    function closeNewSupplierModal(e) {
        if (!e || e.target.id === 'new-supplier-modal' || e.target.closest('.btn-init-secondary')) {
            document.getElementById('new-supplier-modal').classList.remove('active');
        }
    }

    function confirmAddSupplier() {
        const name = document.getElementById('new-supplier-name-input').value;
        const cleanName = (name || '').trim();
        if (!cleanName) return;

        if (!globalData.suppliers) globalData.suppliers = {};
        if (!globalData.suppliers[currentUser.id]) globalData.suppliers[currentUser.id] = [];

        const editId = document.getElementById('supplier-edit-id')?.value;
        if (editId) {
            const sup = globalData.suppliers[currentUser.id].find(s => s.id == editId);
            if (sup) sup.name = cleanName;
            saveGlobalData();
            renderSuppliersDropdown();
            renderInvoices();
            renderSuppliersTurnover();
            closeNewSupplierModal();
            return;
        }

        const createdId = newId();
        globalData.suppliers[currentUser.id].push({ id: createdId, name: cleanName });
        saveGlobalData();
        renderSuppliersDropdown();
        const invoicesTab = document.getElementById('tab-invoices-content');
        if (invoicesTab && invoicesTab.style.display !== 'none') {
            selectSupplier(null, createdId, cleanName);
        }
        renderSuppliersTurnover();
        closeNewSupplierModal();
    }

    function deleteSupplier(id) {
        showConfirm(
            'Видалити постачальника?',
            'Інвойси залишаться, але назва в них зникне. Скасувати дію буде неможливо.',
            () => {
                globalData.suppliers[currentUser.id] = (globalData.suppliers[currentUser.id] || []).filter(s => s.id != id);
                saveGlobalData();
                renderSuppliersDropdown();
                renderInvoices();
                renderSuppliersTurnover();
            }
        );
    }
    
function renderSuppliersDropdown() {
        const container = document.getElementById('new-invoice-supplier-options');
        container.innerHTML = '';
        const suppliers = globalData.suppliers[currentUser.id] || [];
        
        if (suppliers.length === 0) {
            container.innerHTML = '<div class="custom-dropdown-option" style="color: var(--text-tertiary); justify-content: center;">Немає постачальників</div>';
            return;
        }

        // Додаємо поле пошуку на початок списку
        let html = `<input type="text" class="dropdown-search-input" placeholder="🔍 Пошук постачальника..." data-stop-propagation="1" data-input-action="filterSuppliers">`;

        suppliers.forEach(s => {
            const safeName = escapeAttr(s.name);
            html += `<div class="custom-dropdown-option supplier-item" data-action="selectSupplier" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([String(s.id), s.name]))}">${escapeHtml(s.name)}</div>`;
        });
        
        container.innerHTML = html;
    }

    // НОВА ФУНКЦІЯ: Відкриття дропдауну та фокус на пошуку
    function toggleSupplierDropdown(e) {
        e.stopPropagation();
        const container = document.getElementById('supplier-dropdown-container');
        if (!container) return;
        const willOpen = !container.classList.contains('open');
        closeOpenDropdowns(container);
        container.classList.toggle('open', willOpen);
        
        if (container.classList.contains('open')) {
            const searchInput = container.querySelector('.dropdown-search-input');
            if (searchInput) {
                searchInput.value = ''; // Очищаємо попередній пошук
                filterSuppliers('');    // Показуємо весь список
                setTimeout(() => searchInput.focus(), 50); // Автофокус
            }
        }
    }

    // НОВА ФУНКЦІЯ: Фільтрація списку на льоту
    function filterSuppliers(keyword) {
        const lowerKeyword = keyword.toLowerCase();
        const items = document.querySelectorAll('#new-invoice-supplier-options .supplier-item');
        
        items.forEach(item => {
            const text = item.innerText.toLowerCase();
            if (text.includes(lowerKeyword)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

function selectSupplier(event, id, name) {
        if(event) event.stopPropagation();
        document.getElementById('new-invoice-supplier-value').value = id;
        const display = document.getElementById('new-invoice-supplier-display');
        display.innerText = name;
        display.style.color = 'white';
        display.style.fontWeight = '600';
        display.style.borderColor = 'rgba(255,255,255,0.1)'; // Скидаємо червону рамку, якщо була помилка
        document.getElementById('supplier-dropdown-container').classList.remove('open');
    }
    
function addInvoice() {
        const supplierIdVal = document.getElementById('new-invoice-supplier-value').value;
        const dateEl = document.getElementById('new-invoice-date');
        const amountEl = document.getElementById('new-invoice-amount');
        const supplierDisplayEl = document.getElementById('new-invoice-supplier-display');
        
        const date = dateEl.value;
        const amount = parseFloat(amountEl.value);
        const paymentMethod = document.getElementById('new-invoice-payment').value;
        
        // Скидаємо підсвічування помилок
        supplierDisplayEl.style.borderColor = "rgba(255,255,255,0.1)";
        dateEl.style.borderColor = "rgba(255,255,255,0.1)";
        amountEl.style.borderColor = "rgba(255,255,255,0.1)";
        
        let hasError = false;

        // Перевіряємо поля і підсвічуємо порожні
        if (!supplierIdVal) {
            supplierDisplayEl.style.borderColor = "var(--sys-red)";
            supplierDisplayEl.style.animation = 'shake 0.4s';
            hasError = true;
        }
        if (!date) {
            dateEl.style.borderColor = "var(--sys-red)";
            dateEl.style.animation = 'shake 0.4s';
            hasError = true;
        }
        if (isNaN(amount) || amount <= 0) {
            amountEl.style.borderColor = "var(--sys-red)";
            amountEl.style.animation = 'shake 0.4s';
            hasError = true;
        }
        
        // Якщо є помилка - прибираємо класи анімації через 400мс і зупиняємось
        if (hasError) {
            setTimeout(() => {
                supplierDisplayEl.style.animation = '';
                dateEl.style.animation = '';
                amountEl.style.animation = '';
            }, 400);
            return;
        }
        
        if (!appData[currentYear][currentMonth].invoices) appData[currentYear][currentMonth].invoices = [];
        
        appData[currentYear][currentMonth].invoices.push({
            id: newId(),
            supplier_id: supplierIdVal,
            amount: amount,
            date: date,
            payment_method: paymentMethod,
            year: currentYear,
            month: currentMonth,
            created_at: new Date().toISOString()
        });
        
        document.getElementById('new-invoice-amount').value = '';
        saveData(); 
        renderInvoices();
        renderSuppliersTurnover();
        updateAll();
    }

    function renderInvoices() {
        const list = document.getElementById('invoices-list');
        if (!list) return;
        const invoices = getMonthInvoices();
        const suppliers = globalData.suppliers[currentUser.id] || [];
        updateInvoicesModalStats(invoices);

        if (invoices.length === 0) {
            list.innerHTML = '<div class="payroll-empty">Немає накладних за цей місяць</div>';
            return;
        }

        const amountQuery = document.getElementById('invoice-amount-search')?.value || '';
        const matched = invoices.filter(inv => invoiceMatchesAmountQuery(inv, amountQuery));
        if (matched.length === 0) {
            list.innerHTML = '<div class="payroll-empty">Немає інвойсів з такою сумою</div>';
            return;
        }

        const sorted = [...matched].sort((a, b) => invoiceAddedTimestamp(b) - invoiceAddedTimestamp(a));
        const rowsHtml = sorted.map(inv => {
            const sup = suppliers.find(s => s.id == inv.supplier_id);
            const supName = sup ? sup.name : 'Видалений постачальник';
            const isCash = inv.payment_method === 'cash';
            const amountVal = Number(inv.amount) || 0;
            const addedTime = formatInvoiceAddedTime(inv.created_at);
            return `
                <tr class="payroll-row">
                    <td class="tabular">
                        <span class="invoice-date-cell">
                            <span>${escapeHtml(formatInvoiceDate(inv.date))}</span>
                            ${addedTime ? `<span class="invoice-date-time">${escapeHtml(addedTime)}</span>` : ''}
                        </span>
                    </td>
                    <td><span class="sheet-name" title="${escapeAttr(supName)}">${escapeHtml(supName)}</span></td>
                    <td>
                        <div class="invoice-pay-edit">
                            <button type="button" class="invoice-pay-edit__btn ${isCash ? 'is-active is-cash' : ''}" data-action="setInvoicePayment" data-args="${escapeAttr(JSON.stringify([String(inv.id), 'cash']))}">Готівка</button>
                            <button type="button" class="invoice-pay-edit__btn ${!isCash ? 'is-active is-card' : ''}" data-action="setInvoicePayment" data-args="${escapeAttr(JSON.stringify([String(inv.id), 'card']))}">Безготівка</button>
                        </div>
                    </td>
                    <td class="payroll-th-num">
                        <label class="invoice-amount-edit">
                            <input type="number" min="0.01" step="0.01" class="invoice-amount-input tabular" value="${amountVal}" data-change-action="updateInvoiceAmount" data-args="${escapeAttr(JSON.stringify([String(inv.id)]))}">
                            <span>₴</span>
                        </label>
                    </td>
                    <td class="payroll-col-actions">
                        <button type="button" class="payroll-emp-btn payroll-emp-btn--del" data-action="deleteInvoice" data-args="${escapeAttr(JSON.stringify([String(inv.id)]))}" title="Видалити">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        list.innerHTML = `
            <div class="payroll-table-wrap">
                <table class="payroll-table invoices-table">
                    <thead>
                        <tr>
                            <th>Дата</th>
                            <th>Постачальник</th>
                            <th>Оплата</th>
                            <th class="payroll-th-num">Сума</th>
                            <th class="payroll-th-num">Дії</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

    function findMonthInvoice(id) {
        return getMonthInvoices().find(i => i.id == id);
    }

    function setInvoicePayment(id, type) {
        const inv = findMonthInvoice(id);
        if (!inv) return;
        const next = type === 'cash' ? 'cash' : 'card';
        if (inv.payment_method === next) return;
        inv.payment_method = next;
        saveData();
        renderInvoices();
        renderSuppliersTurnover();
        updateAll();
    }

    function updateInvoiceAmount(id, val) {
        const inv = findMonthInvoice(id);
        if (!inv) return;
        const amount = parseFloat(val);
        if (!Number.isFinite(amount) || amount <= 0) {
            renderInvoices();
            return;
        }
        if (Number(inv.amount) === amount) return;
        inv.amount = amount;
        saveData();
        updateInvoicesModalStats();
        renderSuppliersTurnover();
        updateAll();
    }

    function deleteInvoice(id) {
        showConfirm("Видалити накладну?", "Ви впевнені, що хочете видалити цю накладну? Скасувати дію буде неможливо.", () => {
            appData[currentYear][currentMonth].invoices = appData[currentYear][currentMonth].invoices.filter(i => i.id != id);
            saveData();
            renderInvoices();
            renderSuppliersTurnover();
            updateAll();
        });
    }

    function renderSuppliersTurnover() {
        const list = document.getElementById('suppliers-turnover-list');
        if (!list) return;

        const invoices = getMonthInvoices();
        const suppliers = globalData.suppliers[currentUser.id] || [];
        updateInvoicesModalStats(invoices);
        const { total } = getInvoiceTotals(invoices);

        const stats = {};
        suppliers.forEach(s => {
            stats[s.id] = { name: s.name, total: 0, cash: 0, card: 0, count: 0, known: true };
        });
        invoices.forEach(inv => {
            if (!stats[inv.supplier_id]) {
                stats[inv.supplier_id] = { name: 'Видалений постачальник', total: 0, cash: 0, card: 0, count: 0, known: false };
            }
            const amt = parseFloat(inv.amount) || 0;
            stats[inv.supplier_id].total += amt;
            stats[inv.supplier_id].count += 1;
            if (inv.payment_method === 'cash') stats[inv.supplier_id].cash += amt;
            else stats[inv.supplier_id].card += amt;
        });

        const rows = Object.entries(stats).sort((a, b) => {
            if (b[1].total !== a[1].total) return b[1].total - a[1].total;
            return String(a[1].name).localeCompare(String(b[1].name), 'uk');
        });

        if (rows.length === 0) {
            list.innerHTML = '<div class="payroll-empty">Немає постачальників</div>';
            return;
        }

        const rowsHtml = rows.map(([supId, data]) => {
            const percent = total > 0 ? ((data.total / total) * 100).toFixed(1) : '0.0';
            const actions = data.known ? `
                <button type="button" class="payroll-emp-btn" data-action="openEditSupplierModal" data-args="${escapeAttr(JSON.stringify([String(supId)]))}" title="Редагувати">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button type="button" class="payroll-emp-btn payroll-emp-btn--del" data-action="deleteSupplier" data-args="${escapeAttr(JSON.stringify([String(supId)]))}" title="Видалити">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            ` : '<span class="payroll-muted">—</span>';
            return `
                <tr class="payroll-row">
                    <td><span class="sheet-name" title="${escapeAttr(data.name)}">${escapeHtml(data.name)}</span></td>
                    <td class="tabular">${data.count}</td>
                    <td class="tabular" style="color: #ff9f0a;">${formatMoney(data.cash)} ₴</td>
                    <td class="tabular" style="color: var(--sys-blue);">${formatMoney(data.card)} ₴</td>
                    <td class="payroll-col-remain tabular">${formatMoney(data.total)} ₴</td>
                    <td class="tabular">${percent}%</td>
                    <td class="payroll-col-actions"><div class="payroll-emp-card__actions">${actions}</div></td>
                </tr>
            `;
        }).join('');

        list.innerHTML = `
            <div class="payroll-table-wrap">
                <table class="payroll-table suppliers-table">
                    <thead>
                        <tr>
                            <th>Постачальник</th>
                            <th>Інвойси</th>
                            <th>Готівка</th>
                            <th>Безготівка</th>
                            <th class="payroll-th-num">Всього</th>
                            <th>Частка</th>
                            <th class="payroll-th-num">Дії</th>
                        </tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    }

 // ==========================================
    // 14. РОЗРАХУНОК ЗАРПЛАТ (PAYROLL)
    // ==========================================
    
    function openPayrollModal() {
        document.getElementById('payroll-modal').classList.add('active');
        renderPayroll();
    }

    function closePayrollModal(e) {
        if (!e || e.target.id === 'payroll-modal' || e.target.className === 'btn-close-modal') {
            document.getElementById('payroll-modal').classList.remove('active');
            updateAll(); // Оновлюємо головний дашборд при закритті
        }
    }

    function getHistoricalPayroll(year, month) {
        if (!appData[year] || !appData[year][month] || !appData[year][month].initialized) return 0;
        return getPayrollAccruedFromList(appData[year][month].payroll);
    }

function generatePayrollSparklineHTML(currentTotal) {
        const monthsBack = 3; const dataPoints = []; const labels = [];
        let tempY = currentYear; let tempM = currentMonth;
        for (let i = 0; i < monthsBack; i++) {
            labels.unshift(monthNames[tempM].substring(0, 3));
            if (i === 0) dataPoints.unshift(currentTotal);
            else dataPoints.unshift(getHistoricalPayroll(tempY, tempM));
            tempM--; if (tempM < 0) { tempM = 11; tempY--; }
        }
        const prevTotal = dataPoints[monthsBack - 2];
        let trendHtml = ''; let colorMain = '#ff453a';
        
        // Вираховуємо різницю в грошах
        const rawDiff = currentTotal - prevTotal; 
        const diffSign = rawDiff > 0 ? '+' : '';
        const diffMoneyText = `${diffSign}${formatMoney(rawDiff)} ₴`; 

        if (prevTotal === 0 && currentTotal > 0) { 
            trendHtml = ``; 
            colorMain = '#ff453a'; 
        } else if (currentTotal > prevTotal) {
            const diff = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-up" style="cursor: pointer; margin-bottom: 0;" data-stop-propagation="1" data-toggle-expanded="1">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#ff453a';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-down" style="cursor: pointer; margin-bottom: 0;" data-stop-propagation="1" data-toggle-expanded="1">
                            <span class="trend-main-text">↓ -${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else { 
            trendHtml = `<div class="trend-badge" style="background: rgba(255,255,255,0.1); color: #a1a1a6; margin-bottom: 0;" data-stop-propagation="1">= Без змін</div>`; 
            colorMain = '#a1a1a6'; 
        }

        const maxVal = Math.max(...dataPoints, 100); const width = 100; const height = 30; let points = '';
        dataPoints.forEach((val, i) => { const x = (i / (monthsBack - 1)) * width; const y = height - ((val / maxVal) * height) + 1; points += `${x},${y} `; });
        const gradientId = `grad-pay-spark`;
        const sparklineSvg = `<svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" style="overflow: visible;"><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colorMain}" stop-opacity="0.4" /><stop offset="100%" stop-color="${colorMain}" stop-opacity="0.0" /></linearGradient></defs><polyline points="0,32 ${points} 100,32" fill="url(#${gradientId})" /><polyline points="${points}" fill="none" stroke="${colorMain}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
        const labelsHtml = labels.map(l => `<span>${l}</span>`).join('');
        return { trendHtml, sparklineSvg, labelsHtml };
    }

    function renderPayroll() {
        const container = document.getElementById('payroll-list');
        if (!container) return;
        container.innerHTML = '';
        if (!appData[currentYear] || !appData[currentYear][currentMonth]) return;
        const payroll = appData[currentYear][currentMonth].payroll || [];
        let totalRemainingToPay = 0; let totalAccruedGlobal = 0;

        if (payroll.length === 0) {
            container.innerHTML = '<div class="payroll-empty">Немає співробітників</div>';
        } else {
            let rowsHtml = '';
            payroll.forEach(emp => {
                const rate = parseFloat(emp.rate) || 0;
                const hours = parseFloat(emp.hours) || 0;
                const bonus = parseFloat(emp.bonus) || 0;
                const penalty = parseFloat(emp.penalty) || 0;
                const accrued = getEmployeeAccrued(emp);
                const alreadyPaid = getEmployeeAlreadyPaid(emp);
                let remaining = Math.max(0, accrued - alreadyPaid);

                totalAccruedGlobal += accrued;
                if (!emp.is_paid && remaining > 0) totalRemainingToPay += remaining;
                else remaining = 0;

                const tagsHtml = [
                    bonus > 0 ? `<span class="payroll-tag payroll-tag--bonus">Премія +${formatMoney(bonus)}</span>` : '',
                    penalty > 0 ? `<span class="payroll-tag payroll-tag--penalty">Штраф -${formatMoney(penalty)}</span>` : '',
                ].join('') || '<span class="payroll-muted">—</span>';

                const accountHtml = emp.account
                    ? `<button type="button" class="payroll-account" data-action="copyAccountToClipboard" data-pass-event="1" data-args="${escapeAttr(JSON.stringify([emp.account]))}" title="Натисніть, щоб скопіювати">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span class="acc-text">${escapeHtml(emp.account)}</span>
                       </button>`
                    : '<span class="payroll-muted">—</span>';

                const metaHtml = getEmployeePayType(emp) === 'fixed'
                    ? `Фікс ${formatMoney(rate)} ₴`
                    : `${hours} год × ${rate} ₴`;

                const empId = escapeAttr(String(emp.id));
                const position = String(emp.position || '').trim();
                const positionHtml = position
                    ? `<span class="payroll-position" title="${escapeAttr(position)}">${escapeHtml(position)}</span>`
                    : '<span class="payroll-muted">—</span>';
                rowsHtml += `
                    <tr class="payroll-row ${emp.is_paid ? 'is-paid' : ''}" draggable="true" data-id="${empId}"
                        data-drag-start="handlePayrollDragStart"
                        data-drag-over="handlePayrollDragOver"
                        data-drag-leave="handlePayrollDragLeave"
                        data-drag-drop="handlePayrollDrop"
                        data-drag-end="handlePayrollDragEnd"
                        data-args="${escapeAttr(JSON.stringify([emp.id]))}">
                        <td class="payroll-col-drag">
                            <span class="drag-handle" title="Перетягніть, щоб змінити порядок">≡</span>
                        </td>
                        <td class="payroll-col-name">
                            <div class="payroll-name">${escapeHtml(emp.name || 'Без імені')}</div>
                        </td>
                        <td class="payroll-col-position">${positionHtml}</td>
                        <td class="payroll-col-meta tabular">${metaHtml}</td>
                        <td class="payroll-col-tags">${tagsHtml}</td>
                        <td class="payroll-col-account">${accountHtml}</td>
                        <td class="payroll-col-remain tabular" style="color: ${emp.is_paid ? 'var(--sys-green)' : 'var(--sys-red)'};">${formatMoney(remaining)} ₴</td>
                        <td class="payroll-col-accrued tabular">${formatMoney(accrued)} ₴</td>
                        <td class="payroll-col-actions">
                            <div class="payroll-emp-card__actions">
                                <button type="button" class="payroll-emp-btn" data-action="downloadPayrollPdfForEmployee" data-args="${escapeAttr(JSON.stringify([empId]))}" title="PDF розрахунковий листок">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </button>
                                <button type="button" class="payroll-emp-btn" data-action="openEmployeeModal" data-args="${escapeAttr(JSON.stringify([empId]))}" title="Редагувати">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button type="button" class="payroll-emp-btn payroll-emp-btn--del" data-action="deleteEmployee" data-args="${escapeAttr(JSON.stringify([empId]))}" title="Видалити">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                                <button type="button" class="payroll-emp-btn payroll-emp-btn--paid ${emp.is_paid ? 'is-paid' : ''}" data-stop-propagation="1" data-action="toggleEmployeePaid" data-args="${escapeAttr(JSON.stringify([empId]))}" title="${emp.is_paid ? 'Скасувати оплату' : 'Відмітити як оплачено'}">
                                    ${emp.is_paid
                                        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--sys-green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                                        : '<span class="payroll-emp-btn__box"></span>'}
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            });

            container.innerHTML = `
                <div class="payroll-table-wrap">
                    <table class="payroll-table">
                        <thead>
                            <tr>
                                <th class="payroll-col-drag"></th>
                                <th>ПІБ</th>
                                <th>Посада</th>
                                <th>Оплата</th>
                                <th>Премія / штраф</th>
                                <th>Рахунок</th>
                                <th class="payroll-th-num">Залишок</th>
                                <th class="payroll-th-num">Нараховано</th>
                                <th class="payroll-th-num">Дії</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            `;
        }

        const modalAccrued = document.getElementById('modal-payroll-accrued');
        const modalRemaining = document.getElementById('modal-payroll-remaining');
        if (modalAccrued) modalAccrued.innerText = formatMoney(totalAccruedGlobal) + ' ₴';
        if (modalRemaining) modalRemaining.innerText = formatMoney(totalRemainingToPay) + ' ₴';

        const mainAmountEl = document.getElementById('payroll-total-amount');
        if (mainAmountEl) mainAmountEl.innerText = formatMoney(totalAccruedGlobal);

        const sparkData = generatePayrollSparklineHTML(totalAccruedGlobal);
        const trendBadgeEl = document.getElementById('payroll-trend-badge');
        const sparkContainerEl = document.getElementById('payroll-sparkline-container');
        if (trendBadgeEl) trendBadgeEl.innerHTML = sparkData.trendHtml;
        if (sparkContainerEl) sparkContainerEl.innerHTML = sparkData.sparklineSvg + `<div class="sparkline-labels">${sparkData.labelsHtml}</div>`;
    }

    let draggedPayrollEmpId = null;

    function getPayrollList() {
        if (!appData[currentYear] || !appData[currentYear][currentMonth]) return null;
        if (!Array.isArray(appData[currentYear][currentMonth].payroll)) {
            appData[currentYear][currentMonth].payroll = [];
        }
        return appData[currentYear][currentMonth].payroll;
    }

    function handlePayrollDragStart(e, id) {
        const origin = e.target instanceof Element ? e.target : e.target.parentElement;
        if (origin?.closest('button, input, a, textarea, select')) {
            e.preventDefault();
            return;
        }
        draggedPayrollEmpId = id;
        setTimeout(() => {
            const row = origin?.closest?.('.payroll-row');
            if (row) row.classList.add('dragging');
        }, 0);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(id));
    }

    function handlePayrollDragEnd(e) {
        const row = e.target.closest?.('.payroll-row') || e.target;
        if (row && row.classList) row.classList.remove('dragging');
        document.querySelectorAll('.payroll-row').forEach(r => {
            r.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
        });
        draggedPayrollEmpId = null;
    }

    function handlePayrollDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const tr = e.target.closest('tr.payroll-row');

        document.querySelectorAll('.payroll-row').forEach(row => {
            row.classList.remove('drag-over-top', 'drag-over-bottom');
        });

        if (tr && tr.dataset.id != draggedPayrollEmpId) {
            const rect = tr.getBoundingClientRect();
            const relY = e.clientY - rect.top;
            if (relY < rect.height / 2) tr.classList.add('drag-over-top');
            else tr.classList.add('drag-over-bottom');
        }
        return false;
    }

    function handlePayrollDragLeave(e) {
        const tr = e.target.closest('tr.payroll-row');
        if (tr) tr.classList.remove('drag-over-top', 'drag-over-bottom');
    }

    function handlePayrollDrop(e, targetId) {
        e.preventDefault();
        e.stopPropagation();

        const targetRow = e.target.closest('tr.payroll-row');
        let insertAfter = false;
        if (targetRow) insertAfter = targetRow.classList.contains('drag-over-bottom');

        document.querySelectorAll('.payroll-row').forEach(row => {
            row.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom');
        });

        if (!draggedPayrollEmpId || draggedPayrollEmpId == targetId) return;

        const payroll = getPayrollList();
        if (!payroll) return;

        const fromIndex = payroll.findIndex(emp => emp.id == draggedPayrollEmpId);
        let toIndex = payroll.findIndex(emp => emp.id == targetId);
        if (fromIndex === -1 || toIndex === -1) return;

        const movedItem = payroll.splice(fromIndex, 1)[0];
        if (insertAfter) {
            toIndex = fromIndex < toIndex ? toIndex : toIndex + 1;
        } else {
            toIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        }
        payroll.splice(toIndex, 0, movedItem);

        draggedPayrollEmpId = null;
        saveDataToServer();
        renderPayroll();
    }

    function selectEmpPayType(type) {
        const payType = type === 'fixed' ? 'fixed' : 'hourly';
        const typeInput = document.getElementById('emp-edit-pay-type');
        if (typeInput) typeInput.value = payType;

        const hourlyBtn = document.getElementById('btn-emp-pay-hourly');
        const fixedBtn = document.getElementById('btn-emp-pay-fixed');
        if (hourlyBtn) hourlyBtn.classList.toggle('active', payType === 'hourly');
        if (fixedBtn) fixedBtn.classList.toggle('active', payType === 'fixed');

        const hoursWrap = document.getElementById('emp-hours-wrap');
        const rateLabel = document.getElementById('emp-edit-rate-label');
        if (hoursWrap) hoursWrap.style.display = payType === 'fixed' ? 'none' : '';
        if (rateLabel) rateLabel.innerText = payType === 'fixed' ? 'Фікс ставка (₴)' : 'Ставка / год (₴)';
    }

    function buildEmployeePayslipModel(emp) {
        const isHourly = getEmployeePayType(emp) !== 'fixed';
        const rate = parseFloat(emp.rate) || 0;
        const hours = parseFloat(emp.hours) || 0;
        const bonus = parseFloat(emp.bonus) || 0;
        const penalty = parseFloat(emp.penalty) || 0;
        const base = isHourly ? rate * hours : rate;
        const accrued = getEmployeeAccrued(emp);
        const advance = getEmployeeAlreadyPaid(emp);
        const isPaid = !!emp.is_paid;
        const toPay = Math.max(0, accrued - advance);

        return {
            name: emp.name || 'Без імені',
            taxId: emp.tax_id || '',
            account: emp.account || '',
            isHourly,
            payTypeLabel: isHourly ? 'Погодинна' : 'Фікс ставка',
            hours,
            rate,
            base,
            baseLabel: isHourly ? `База (${hours} × ${rate})` : 'База (фікс)',
            bonus,
            penalty,
            accrued,
            advance,
            isPaid,
            toPay,
        };
    }

    function getPayrollPdfMeta() {
        const periodLabel = `${monthNames[currentMonth].toLowerCase()} ${currentYear}`;
        const now = new Date();
        const dateLabel = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
        return { periodLabel, dateLabel };
    }

    async function downloadPayrollPdfForEmployee(empId) {
        const emp = appData[currentYear]?.[currentMonth]?.payroll?.find(e => e.id == empId);
        if (!emp) return;
        try {
            const { downloadPayrollPayslips } = await import('./payroll-pdf.js');
            const { periodLabel, dateLabel } = getPayrollPdfMeta();
            const safeName = String(emp.name || 'spivrobitnyk').replace(/[\\/:*?"<>|]+/g, '_').trim();
            downloadPayrollPayslips([buildEmployeePayslipModel(emp)], {
                periodLabel,
                dateLabel,
                fileName: `rozrahunkovyj-lystok_${safeName}.pdf`,
            });
        } catch (err) {
            console.error(err);
            alert(`Не вдалося сформувати PDF${err?.message ? `: ${err.message}` : ''}`);
        }
    }

    function openEmployeeModal(empId) {
        document.getElementById('payroll-modal').classList.remove('active');
        document.getElementById('employee-modal').classList.add('active');
        
        let emp = null;
        if (empId) {
            emp = appData[currentYear][currentMonth].payroll.find(e => e.id == empId);
            document.getElementById('employee-modal-title').innerText = "Редагувати";
        } else {
            document.getElementById('employee-modal-title').innerText = "Новий співробітник";
        }

        const alreadyPaid = emp ? getEmployeeAlreadyPaid(emp) : 0;

        document.getElementById('emp-edit-id').value = emp ? emp.id : '';
        document.getElementById('emp-edit-name').value = emp ? emp.name : '';
        const positionInput = document.getElementById('emp-edit-position');
        if (positionInput) positionInput.value = emp ? (emp.position || '') : '';
        document.getElementById('emp-edit-tax').value = emp ? emp.tax_id : '';
        document.getElementById('emp-edit-rate').value = emp ? emp.rate : '';
        document.getElementById('emp-edit-hours').value = emp ? emp.hours : '';
        document.getElementById('emp-edit-bonus').value = emp && emp.bonus != 0 ? emp.bonus : '';
        document.getElementById('emp-edit-penalty').value = emp && emp.penalty != 0 ? emp.penalty : '';
        document.getElementById('emp-edit-paid').value = alreadyPaid ? alreadyPaid : '';
        document.getElementById('emp-edit-account').value = emp ? emp.account : '';
        selectEmpPayType(emp ? getEmployeePayType(emp) : 'hourly');
    }

    function closeEmployeeModal(e) {
        if (!e || e.target.id === 'employee-modal' || e.target.closest('.btn-close-modal')) {
            document.getElementById('employee-modal').classList.remove('active');
            openPayrollModal();
        }
    }

    function saveEmployee() {
        const id = document.getElementById('emp-edit-id').value;
        const name = document.getElementById('emp-edit-name').value;
        if (!name.trim()) return alert("Введіть ПІБ співробітника");

        const payType = document.getElementById('emp-edit-pay-type')?.value === 'fixed' ? 'fixed' : 'hourly';
        const paidAmount = parseFloat(document.getElementById('emp-edit-paid').value) || 0;
        const data = {
            name: name,
            position: (document.getElementById('emp-edit-position')?.value || '').trim(),
            tax_id: document.getElementById('emp-edit-tax').value,
            pay_type: payType,
            rate: document.getElementById('emp-edit-rate').value,
            hours: payType === 'fixed' ? 0 : document.getElementById('emp-edit-hours').value,
            bonus: document.getElementById('emp-edit-bonus').value,
            penalty: document.getElementById('emp-edit-penalty').value,
            paid_amount: paidAmount,
            advance: 0,
            paid_part: 0,
            account: document.getElementById('emp-edit-account').value
        };

        if (id) {
            const emp = appData[currentYear][currentMonth].payroll.find(e => e.id == id);
            if (emp) Object.assign(emp, data);
        } else {
            data.id = newId();
            data.is_paid = false;
            if (!appData[currentYear][currentMonth].payroll) appData[currentYear][currentMonth].payroll = [];
            appData[currentYear][currentMonth].payroll.push(data);
        }

        saveDataToServer();
        closeEmployeeModal();
    }

    function deleteEmployee(id, evt) {
        if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
        showConfirm("Видалити співробітника?", "Ви впевнені, що хочете видалити цей запис з розрахунків?", () => {
            appData[currentYear][currentMonth].payroll = appData[currentYear][currentMonth].payroll.filter(e => e.id != id);
            saveDataToServer();
            renderPayroll();
            updateAll();
        });
    }

    function copyAccountToClipboard(event, text) {
        if (event) event.stopPropagation();

        const container =
            event?.target?.closest?.('[data-action="copyAccountToClipboard"]') ||
            event?.target?.closest?.('.payroll-account') ||
            null;
        const textSpan = container?.querySelector?.('.acc-text') || null;
        const iconSvg = container?.querySelector?.('svg') || null;
        const copyText =
            (typeof text === 'string' && text.trim()) ||
            textSpan?.innerText?.trim() ||
            '';
        if (!copyText) return;

        const originalText = textSpan ? textSpan.innerText : copyText;
        const originalBg = container ? container.style.background : '';
        const originalColor = container ? container.style.color : '';
        const originalIcon = iconSvg ? iconSvg.innerHTML : '';

        const showSuccess = () => {
            if (textSpan) textSpan.innerText = 'Скопійовано!';
            if (container) {
                container.style.background = 'rgba(46, 160, 67, 0.15)';
                container.style.color = 'var(--sys-green)';
            }
            if (iconSvg) iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            setTimeout(() => {
                if (textSpan) textSpan.innerText = originalText;
                if (container) {
                    container.style.background = originalBg;
                    container.style.color = originalColor;
                }
                if (iconSvg) iconSvg.innerHTML = originalIcon;
            }, 1500);
        };

        const fallbackCopy = () => {
            const textArea = document.createElement('textarea');
            textArea.value = copyText;
            textArea.style.position = 'fixed';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showSuccess();
            } catch (err) {
                console.error('Fallback failed', err);
            }
            document.body.removeChild(textArea);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(copyText).then(showSuccess).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }

    function toggleEmployeePaid(id) {
        const emp = appData[currentYear][currentMonth].payroll.find(e => e.id == id);
        if (!emp) return;

        const willPay = !emp.is_paid;
        const name = emp.name || 'співробітника';
        showConfirm(
            willPay ? 'Відмітити як оплачено?' : 'Скасувати оплату?',
            willPay
                ? `Ви впевнені, що хочете позначити виплату для «${name}» як оплачену?`
                : `Ви впевнені, що хочете зняти позначку оплати для «${name}»?`,
            () => {
                emp.is_paid = willPay;
                saveDataToServer();
                renderPayroll();
                updateAll();
            },
            {
                cancel: 'Назад',
                confirm: willPay ? 'Так, оплачено' : 'Так, зняти оплату',
            }
        );
    }

    // ==========================================
    // 15. ЕКСПОРТ ДЛЯ ШІ (AI ANALYTICS)
    // ==========================================

    function generateAiFinancialPlanSection(incomeUah) {
        if (!currentUser || currentUser.account_type === 'business') return '';
        if (!incomeUah || incomeUah <= 0) return '';

        const fp = getFinancialPlan();
        const saveRec = recommendedSaveUah(incomeUah);
        const monthlyForCushion = monthlyCushionBaseUah(incomeUah);

        let str = `\n### ФІНАНСОВИЙ ПЛАН\n`;
        if (currentExchangeRate > 0) {
            str += `Курс НБУ: ${formatMoney(currentExchangeRate)} ₴/$\n\n`;
        }

        str += `Рекомендовано відкласти цього місяця: ${formatMoney(saveRec)} ₴\n`;

        const essentialsMarked = hasEssentialCategories();
        const cushionActual = getCushionBalanceUah();

        str += `\nПодушка безпеки (6 міс. обов'язкових витрат):\n`;
        if (essentialsMarked) {
            const cushionTarget = monthlyForCushion * 6;
            const cushionRemaining = Math.max(0, cushionTarget - cushionActual);
            const cushionPctDone = cushionTarget > 0 ? ((cushionActual / cushionTarget) * 100).toFixed(1) : '0';
            str += `  - База: обов'язкові категорії цього місяця — ${formatMoney(monthlyForCushion)} ₴/міс\n`;
            str += `  - Ціль: ${formatMoney(cushionTarget)} ₴\n`;
            str += `  - Накопичено (конверти «Подушка»): ${formatMoney(cushionActual)} ₴\n`;
            str += `  - Залишилось: ${formatMoney(cushionRemaining)} ₴ (${cushionPctDone}% виконано)\n`;
        } else {
            str += `  - Користувач ще не позначив обов'язкові категорії. НЕ рахуй ціль подушки від усіх витрат і НЕ підставляй % від доходу.\n`;
            str += `  - Накопичено (конверти «Подушка»): ${formatMoney(cushionActual)} ₴\n`;
            str += `  - Ціль: немає, поки не позначені обов'язкові витрати.\n`;
        }

        const capitalTargetUsd = (fp.desiredMonthlyUsd || 0) * 12 * 25;
        const investmentJarsUah = getInvestmentJarsBalanceUah();
        const capitalCurrentUsd = (fp.brokerBalanceUsd || 0) + uahToUsd(investmentJarsUah);
        const monthlyInvestUsd = uahToUsd(saveRec);
        const yearsToCapital = calcYearsToCapital(capitalTargetUsd, capitalCurrentUsd, monthlyInvestUsd, fp.returnRatePct);

        str += `\nОсобистий капітал (правило ×25):\n`;
        str += `  - Бажані витрати: ${formatMoney(fp.desiredMonthlyUsd || 0)} $/міс\n`;
        str += `  - Цільовий капітал: ${formatMoney(capitalTargetUsd)} $ (${formatMoney(fp.desiredMonthlyUsd || 0)} × 12 × 25)\n`;
        str += `  - Накопичено: ${formatMoney(capitalCurrentUsd)} $ (брокер ${formatMoney(fp.brokerBalanceUsd || 0)} $ + інвест-конверти ≈${formatMoney(uahToUsd(investmentJarsUah))} $)\n`;
        if (currentExchangeRate > 0) str += `  - Ціль ≈ ${formatMoney(usdToUah(capitalTargetUsd))} ₴\n`;
        str += `  - Очікувана дохідність: ${fp.returnRatePct || 7}%/рік\n`;
        str += `  - При рекомендованому відкладанні (${formatMoney(monthlyInvestUsd)} $/міс): ${formatYearsLabel(yearsToCapital)} до цілі\n`;

        return str;
    }

    function getMonthIncomeUah(year, month) {
        const data = appData[year]?.[month];
        if (!data?.incomes) return 0;
        return data.incomes.reduce((sum, inc) => {
            const amt = parseFloat(inc.amount) || 0;
            return sum + (inc.currency === 'USD' ? amt * currentExchangeRate : amt);
        }, 0);
    }

    /** Latest initialized month with income > 0, converted to USD. */
    function getLatestPersonalIncomeUsd() {
        const years = Object.keys(appData).map(Number).sort((a, b) => b - a);
        for (const y of years) {
            const months = Object.keys(appData[y] || {}).map(Number).sort((a, b) => b - a);
            for (const m of months) {
                if (!appData[y][m]?.initialized) continue;
                const uah = getMonthIncomeUah(y, m);
                if (uah > 0) {
                    const usd = uahToUsd(uah);
                    if (usd > 0) return usd;
                }
            }
        }
        return null;
    }
    
    function openAiExportModal() {
        launchAiAnalytics();
    }

    function closeAiExportModal(e) {
        closeAiChat(e);
    }

    function selectAiExportType() {
        /* period chips removed — full history is always in context */
    }

    async function copyTextToClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
        }
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
    }

    function flashAiButtonLabel(labelId, okText) {
        const el = document.getElementById(labelId);
        if (!el) return;
        el.textContent = okText;
        setTimeout(() => syncAiEntryButtons(), 1800);
    }

    async function launchAiAnalytics() {
        if (hasLlmKey()) {
            openAiChat({ starter: 'analytics' });
            return;
        }
        try {
            const prompt = await buildAnalyticsPrompt('all');
            await copyTextToClipboard(prompt);
            flashAiButtonLabel('ai-analytics-label', 'Промпт скопійовано');
        } catch (e) {
            console.error(e);
            flashAiButtonLabel('ai-analytics-label', 'Не вдалося скопіювати');
        }
    }

    async function launchAiGrowth() {
        if (!currentUser || !currentUser.growthProfile || !currentUser.growthProfile.job) {
            openGrowthModal();
            return;
        }
        if (hasLlmKey()) {
            openAiChat({ starter: 'growth' });
            return;
        }
        try {
            const prompt = await buildGrowthPrompt('all');
            if (!prompt) {
                openGrowthModal();
                return;
            }
            await copyTextToClipboard(prompt);
            flashAiButtonLabel('ai-growth-run-label', 'Промпт скопійовано');
        } catch (e) {
            console.error(e);
            flashAiButtonLabel('ai-growth-run-label', 'Не вдалося скопіювати');
        }
    }

    async function buildAiSkryniaDataDump(opts = {}) {
        if (!currentUser) return '';
        const compact = Boolean(opts.compact);
        const isBiz = currentUser.account_type === 'business';
        await ensureExchangeRateForAi();
        let prompt = generateAiFxSection();
        prompt += generateAiNowSection();

        prompt += `### ПОТОЧНИЙ СТАН КАПІТАЛУ\n`;
        const jars = globalData.jars[currentUser.id] || [];
        const totalJars = jars.reduce((sum, j) => sum + j.balance, 0);
        prompt += `- Всього накопичень: ${totalJars.toFixed(2)} ₴\n`;
        jars.forEach(j => {
            prompt += formatAiJarLine(j);
        });

        const debts = globalData.debts[currentUser.id] || [];
        const activeDebts = debts.filter(d => !d.is_archived || d.is_archived === 0);
        if (activeDebts.length > 0) {
            prompt += `\n### АКТИВНІ БОРГОВІ ЗОБОВ'ЯЗАННЯ\n`;
            activeDebts.forEach(d => {
                prompt += formatAiDebtLine(d);
            });
        }

        if (!isBiz) {
            prompt += generateAiFinancialPlanSection(getMonthIncomeUah(currentYear, currentMonth));
            prompt += await buildAiYearTracksSection({ compact });
            prompt += buildGrowthCourseSnapshot({ compact: true });
        }

        const years = Object.keys(appData).map(Number).sort((a,b) => a-b);
        if (compact) {
            prompt += `\n### РУХ КОШТІВ (знімок для чату)\n`;
            prompt += `Поточний місяць — категорії без окремих статей (є ₴/міс, частка доходу, топ, за 10 років = ×120). Інші місяці — один рядок. Якщо нижче є блок «ДЕТАЛІЗАЦІЯ ПІД ПИТАННЯ» — рахуй саме його.\n`;
            if (appData[currentYear]?.[currentMonth]?.initialized) {
                prompt += generateAiDataForMonth(currentYear, currentMonth, isBiz, { lineItems: false });
            }
            let others = '';
            years.forEach(y => {
                const months = Object.keys(appData[y] || {}).map(Number).sort((a,b) => a-b);
                months.forEach(m => {
                    if (!appData[y][m].initialized) return;
                    if (y === currentYear && m === currentMonth) return;
                    others += generateAiMonthOneLiner(y, m, isBiz);
                });
            });
            if (others) prompt += `\nІнші ініціалізовані місяці:\n${others}`;
            prompt += buildAiFocusDump(opts, isBiz);
            return prompt;
        }

        prompt += `\n### РУХ КОШТІВ (CASH FLOW)\n`;
        prompt += `Нижче — усі ініціалізовані місяці. У категоріях: ₴/міс, частка доходу, місце, «за 10 років» (= місяць × 120). Якщо питають про конкретний період (останній місяць, квартал, рік) — рахуй лише відповідні блоки «ПЕРІОД». Блок «ПОТОЧНИЙ МІСЯЦЬ» — стан зараз; блоки «історія» — минуле.\n`;
        years.forEach(y => {
            const months = Object.keys(appData[y]).map(Number).sort((a,b) => a-b);
            months.forEach(m => {
                if (appData[y][m].initialized) {
                    prompt += generateAiDataForMonth(y, m, isBiz);
                }
            });
        });
        return prompt;
    }

    /** Capital-analysis line for an envelope: type and balance only — envelope goals belong to growth. */
    function formatCapitalJarLine(jar) {
        const jarType = getJarType(jar);
        const typeLabel = JAR_TYPE_LABELS[jarType] || 'Звичайний';
        return `  * ${jar.name} [${typeLabel}]: ${formatMoney(parseFloat(jar.balance) || 0)} ₴\n`;
    }

    /** Where a month's money went: consumption vs. capital moves (envelopes, debt payments). */
    function capitalFlowForMonth(year, month, isBiz) {
        const data = appData[year]?.[month];
        if (!data?.initialized) return null;
        const income = getMonthIncomeUah(year, month);
        let consumption = 0;
        let toEnvelopes = 0;
        let debtPaid = 0;
        (data.expenses || []).forEach((cat) => {
            (cat.items || []).forEach((item) => {
                const amount = parseFloat(item.amount) || 0;
                if (item.debtId) debtPaid += amount;
                else if (cat.isSavings) toEnvelopes += amount;
                else consumption += amount;
            });
        });
        if (isBiz) {
            if (data.invoices && data.invoices.length > 0) {
                consumption += data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            } else if (data.cogs) {
                consumption += data.cogs.type === 'percent' ? income * (data.cogs.value / 100) : (parseFloat(data.cogs.value) || 0);
            }
            (data.payroll || []).forEach((emp) => { consumption += getEmployeeAccrued(emp); });
        }
        const free = income - consumption - toEnvelopes - debtPaid;
        const savingRate = income > 0 ? ((toEnvelopes + debtPaid) / income) * 100 : 0;
        return { income, consumption, toEnvelopes, debtPaid, free, savingRate };
    }

    /** Initialized months, oldest first. */
    function initializedMonthsAsc() {
        const list = [];
        Object.keys(appData).map(Number).sort((a, b) => a - b).forEach((y) => {
            Object.keys(appData[y] || {}).map(Number).sort((a, b) => a - b).forEach((m) => {
                if (appData[y][m]?.initialized) list.push({ y, m });
            });
        });
        return list;
    }

    /** Business month split: revenue, cost of goods, payroll, other operating costs. */
    function businessBreakdown(year, month) {
        const data = appData[year]?.[month];
        const revenue = getMonthIncomeUah(year, month);
        let cogs = 0;
        if (data?.invoices?.length) cogs = data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        else if (data?.cogs) cogs = data.cogs.type === 'percent' ? revenue * (data.cogs.value / 100) : (parseFloat(data.cogs.value) || 0);
        const payroll = (data?.payroll || []).reduce((sum, emp) => sum + getEmployeeAccrued(emp), 0);
        let opex = 0;
        (data?.expenses || []).forEach((cat) => {
            if (cat.isSavings || cat.name === DEBT_CATEGORY_NAME) return;
            (cat.items || []).forEach((item) => { if (!item.debtId) opex += parseFloat(item.amount) || 0; });
        });
        return { revenue, cogs, payroll, opex, profit: revenue - cogs - payroll - opex };
    }

    /**
     * Months to clear a debt at a steady payment, and the interest still to pay
     * (monthly rate). null when the payment does not even cover the interest.
     */
    function debtPayoffForecast(remaining, monthlyRatePct, payment) {
        const r = (parseFloat(monthlyRatePct) || 0) / 100;
        let balance = remaining;
        let interest = 0;
        let months = 0;
        if (!(payment > 0)) return null;
        while (balance > 0.005 && months < 600) {
            const due = balance * r;
            if (payment <= due) return null;
            interest += due;
            balance = balance + due - payment;
            months += 1;
        }
        return months < 600 ? { months, interest } : null;
    }

    const pctOf = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
    const avgOf = (list) => (list.length ? list.reduce((sum, v) => sum + v, 0) / list.length : 0);

    /**
     * Data for «Аналіз капіталу». Code computes the metrics (LLMs are poor at arithmetic);
     * the model only interprets them. No goals, tracks, point B or ×25.
     */
    function buildCapitalDump(isBiz) {
        const jars = globalData.jars[currentUser.id] || [];
        const debts = (globalData.debts[currentUser.id] || []).filter((d) => !d.is_archived || d.is_archived === 0);
        const fp = getFinancialPlan();
        const months = initializedMonthsAsc();
        const flows = months
            .map(({ y, m }) => ({ y, m, ...capitalFlowForMonth(y, m, isBiz) }))
            .filter((f) => f.income > 0 || f.consumption > 0 || f.toEnvelopes !== 0 || f.debtPaid > 0);
        // The running calendar month is incomplete: early in the month rent is simply not paid yet.
        // Averages and trends use complete months; the running one is shown apart as «so far».
        const today = new Date();
        const isRunning = (f) => f.y === today.getFullYear() && f.m === today.getMonth();
        const complete = flows.filter((f) => !isRunning(f));
        const base = complete.length ? complete : flows;
        const recent = base.slice(-3);
        const current = appData[currentYear]?.[currentMonth];
        const currentFlow = current?.initialized ? capitalFlowForMonth(currentYear, currentMonth, isBiz) : null;
        const currentRunning = isRunning({ y: currentYear, m: currentMonth });
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const monthLabel = (f) => `${monthNames[f.m]} ${f.y}`;

        let prompt = generateAiFxSection();
        prompt += generateAiNowSection();

        // ---- Assets, liabilities, net capital
        const jarsTotal = jars.reduce((sum, j) => sum + (parseFloat(j.balance) || 0), 0);
        const brokerUsd = isBiz ? 0 : (parseFloat(fp.brokerBalanceUsd) || 0);
        const brokerUah = brokerUsd > 0 && currentExchangeRate > 0 ? brokerUsd * currentExchangeRate : 0;
        prompt += `### АКТИВИ\n`;
        prompt += `- Конверти разом: ${formatMoney(jarsTotal)} ₴\n`;
        jars.forEach((j) => { prompt += formatCapitalJarLine(j); });
        if (brokerUsd > 0) {
            prompt += `- Брокерський рахунок: ${formatMoney(brokerUsd)} $${brokerUah ? ` (≈ ${formatMoney(brokerUah)} ₴)` : ' — курсу немає, у ₴ не перераховуй'}\n`;
        }

        let debtUah = 0;
        let usdUnconverted = 0;
        let interestUah = 0;
        prompt += `\n### ЗОБОВ'ЯЗАННЯ\n`;
        if (!debts.length) prompt += `- Активних боргів немає\n`;
        debts.forEach((d) => {
            const remaining = getHistoricalDebtBalance(d.id, currentYear, currentMonth);
            const part = debtRemainingToUah(d);
            debtUah += part.uah;
            usdUnconverted += part.usdUnconverted;
            const interest = getMonthlyInterestEstimate(d, remaining);
            interestUah += d.currency === 'USD' ? (currentExchangeRate > 0 ? interest * currentExchangeRate : 0) : interest;
            const sign = d.currency === 'USD' ? '$' : '₴';
            const rate = parseFloat(d.interest_rate) || 0;
            const yearly = rate > 0 ? (Math.pow(1 + rate / 100, 12) - 1) * 100 : 0;
            // Average payment over the recent months, in the debt's currency.
            const paid = recent.reduce((sum, f) => {
                const monthData = appData[f.y]?.[f.m];
                (monthData?.expenses || []).forEach((cat) => (cat.items || []).forEach((item) => {
                    if (String(item.debtId) === String(d.id)) sum += getDebtItemDeduction(item);
                }));
                return sum;
            }, 0);
            const payment = recent.length ? paid / recent.length : 0;
            let line = `- ${d.name}: залишок ${formatMoney(remaining)} ${sign} з ${formatMoney(parseFloat(d.total_amount) || 0)} ${sign}`;
            line += rate > 0 ? `; ставка ${rate}% / міс (≈ ${yearly.toFixed(1)}% річних); відсотки ≈ ${formatMoney(interest)} ${sign}/міс` : '; без відсотків';
            if (payment > 0) {
                const forecast = debtPayoffForecast(remaining, rate, payment);
                line += forecast
                    ? `; платите в середньому ${formatMoney(payment)} ${sign}/міс → закриєте приблизно за ${forecast.months} міс., ще ≈ ${formatMoney(forecast.interest)} ${sign} відсотків`
                    : `; платите в середньому ${formatMoney(payment)} ${sign}/міс — це не покриває відсотків, борг не зменшується`;
            } else {
                line += `; платежів за останні місяці не було`;
            }
            if (d.currency === 'USD') line += ' (борг у доларах)';
            prompt += `${line}\n`;
        });
        if (debts.length) {
            prompt += `- Боргів разом: ${formatMoney(debtUah)} ₴${usdUnconverted > 0 ? ` + ${formatMoney(usdUnconverted)} $ без курсу` : ''}; відсотки ≈ ${formatMoney(interestUah)} ₴/міс\n`;
        }
        const net = jarsTotal + brokerUah - debtUah;
        prompt += `\n### ЧИСТИЙ КАПІТАЛ\n- Активи − борги: ${formatMoney(net)} ₴${usdUnconverted > 0 ? ' (без доларових сум, яких не вдалося перерахувати)' : ''}\n`;

        // ---- Metrics computed here, so the model does not have to
        prompt += `\n### МЕТРИКИ (пораховано Скринею — бери як є, не перераховуй)\n`;
        if (!flows.length) {
            prompt += `- Даних про доходи й витрати ще немає\n`;
        } else {
            const incomeAvg = avgOf(recent.map((f) => f.income));
            const consumptionAvg = avgOf(recent.map((f) => f.consumption));
            const freeList = recent.map((f) => f.free);
            const savedRecent = recent.reduce((sum, f) => sum + f.toEnvelopes + f.debtPaid, 0);
            const incomeRecent = recent.reduce((sum, f) => sum + f.income, 0);
            const window = complete.length
                ? (recent.length === 1 ? 'за 1 повний місяць' : `за останні ${recent.length} повні міс.`)
                : 'лише за поточний неповний місяць';
            if (currentFlow && complete.length) {
                prompt += `- Норма заощаджень цього місяця${currentRunning ? ' (поки що, місяць триває)' : ''}: ${pctOf(currentFlow.toEnvelopes + currentFlow.debtPaid, currentFlow.income)}\n`;
            }
            prompt += `- Норма заощаджень ${window}: ${pctOf(savedRecent, incomeRecent)}\n`;
            prompt += `- Вільний залишок ${window}: у середньому ${formatMoney(avgOf(freeList))} ₴/міс (від ${formatMoney(Math.min(...freeList))} до ${formatMoney(Math.max(...freeList))} ₴)\n`;
            prompt += `- Середній дохід ${window}: ${formatMoney(incomeAvg)} ₴; середнє споживання: ${formatMoney(consumptionAvg)} ₴\n`;
            const incomes = base.map((f) => f.income).filter((v) => v > 0);
            if (incomes.length >= 2) {
                const spread = ((Math.max(...incomes) - Math.min(...incomes)) / avgOf(incomes)) * 100;
                prompt += `- Стабільність доходу (${incomes.length} повних міс.): від ${formatMoney(Math.min(...incomes))} до ${formatMoney(Math.max(...incomes))} ₴, розкид ${Math.round(spread)}% від середнього\n`;
            }
            if (current?.initialized) {
                const total = getMonthIncomeUah(currentYear, currentMonth);
                const usd = (current.incomes || []).reduce((sum, inc) => sum + (inc.currency === 'USD' ? (parseFloat(inc.amount) || 0) * currentExchangeRate : 0), 0);
                if (usd > 0) prompt += `- Дохід у валюті цього місяця: ${pctOf(usd, total)}\n`;
            }
            if (consumptionAvg > 0) {
                prompt += `- Усіх конвертів вистачить на ${(jarsTotal / consumptionAvg).toFixed(1)} міс. звичного споживання\n`;
            }
            if (debts.length && incomeAvg > 0) {
                prompt += `- Боргове навантаження: платежі ${pctOf(avgOf(recent.map((f) => f.debtPaid)), incomeAvg)} доходу, з них відсотки ≈ ${pctOf(interestUah, incomeAvg)} доходу\n`;
            }
            if (!isBiz && incomeAvg > 0) {
                prompt += `- Норма Скрині: відкладати 20% доходу ≈ ${formatMoney(recommendedSaveUah(incomeAvg))} ₴/міс\n`;
            }
        }

        if (!isBiz) {
            // Essential spending of complete months: early in a month nothing is paid yet.
            const essentialList = recent
                .map((f) => monthlyCushionBaseUah(0, appData[f.y][f.m].expenses))
                .filter((v) => v > 0);
            const essentialMonthly = essentialList.length
                ? avgOf(essentialList)
                : (current?.initialized ? monthlyCushionBaseUah(0, current.expenses) : 0);
            const cushion = getCushionBalanceUah();
            prompt += `\n### ПОДУШКА\n`;
            prompt += `- У конвертах «Подушка»: ${formatMoney(cushion)} ₴\n`;
            if (essentialMonthly > 0) {
                prompt += `- Обов'язкові витрати${essentialList.length ? ` (у середньому за ${essentialList.length} повні міс.)` : ''}: ${formatMoney(essentialMonthly)} ₴/міс → подушки вистачить на ${(cushion / essentialMonthly).toFixed(1)} міс. (норма Скрині — 6, тобто ${formatMoney(essentialMonthly * 6)} ₴)\n`;
            } else if (current?.initialized && hasEssentialCategories(current.expenses)) {
                prompt += `- Обов'язкові категорії позначені, але витрат по них цього місяця ще немає: тривалість подушки в місяцях не рахуй\n`;
            } else {
                prompt += `- Обов'язкові категорії не позначені: тривалість подушки в місяцях не рахуй і ціль не вигадуй\n`;
            }
        } else if (flows.length) {
            const recentBiz = recent.map((f) => businessBreakdown(f.y, f.m)).filter((b) => b.revenue > 0);
            if (recentBiz.length) {
                const sum = (key) => recentBiz.reduce((acc, b) => acc + b[key], 0);
                const revenue = sum('revenue');
                prompt += `\n### БІЗНЕС-МЕТРИКИ (останні ${recentBiz.length} міс.)\n`;
                prompt += `- Маржа (прибуток / виручка): ${pctOf(sum('profit'), revenue)}\n`;
                prompt += `- Собівартість: ${pctOf(sum('cogs'), revenue)} виручки; зарплати: ${pctOf(sum('payroll'), revenue)}; інші операційні витрати: ${pctOf(sum('opex'), revenue)}\n`;
            }
        }

        // ---- Capital flow per month
        prompt += `\n### РУХ КАПІТАЛУ ПО МІСЯЦЯХ\n`;
        prompt += `Споживання — звичайні категорії${isBiz ? ' + собівартість і зарплати' : ''}. Конверти й платежі по боргах — це рух капіталу, не споживання.\n`;
        flows.forEach((f) => {
            const mark = isRunning(f) ? ` (триває: ${today.getDate()}-й день з ${daysInMonth}, суми поки що)` : '';
            prompt += `- ${monthLabel(f)}${mark}: дохід ${formatMoney(f.income)} ₴; споживання ${formatMoney(f.consumption)} ₴; у конверти ${formatMoney(f.toEnvelopes)} ₴; на борги ${formatMoney(f.debtPaid)} ₴; вільний залишок ${formatMoney(f.free)} ₴\n`;
        });

        // ---- Category trends across months (stable category keys join the same category)
        const trendMonths = base.slice(-6);
        if (trendMonths.length >= 2) {
            const series = new Map();
            trendMonths.forEach((f, idx) => {
                (appData[f.y][f.m].expenses || []).forEach((cat) => {
                    if (isUnassigned(cat) || isLedgerCategory(cat)) return;
                    const total = getCategoryTotal(cat);
                    if (!(total > 0)) return;
                    const key = categoryKey(cat);
                    if (!series.has(key)) series.set(key, { name: cat.name || 'Без назви', values: new Array(trendMonths.length).fill(0) });
                    const entry = series.get(key);
                    entry.values[idx] += total;
                    entry.name = cat.name || entry.name;
                });
            });
            const rows = [...series.values()]
                .sort((a, b) => b.values[b.values.length - 1] - a.values[a.values.length - 1] || avgOf(b.values) - avgOf(a.values))
                .slice(0, 12);
            if (rows.length) {
                prompt += `\n### ТРЕНДИ КАТЕГОРІЙ (₴/міс: ${trendMonths.map(monthLabel).join(' → ')})\n`;
                rows.forEach((row) => {
                    prompt += `- ${row.name}: ${row.values.map((v) => formatMoney(Math.round(v)).replace(/,00$/, '')).join(' → ')}\n`;
                });
            }
        }

        // ---- Current month: spending by category, unsorted bank purchases apart
        if (current?.initialized) {
            const income = getMonthIncomeUah(currentYear, currentMonth);
            prompt += `\n### ПОТОЧНИЙ МІСЯЦЬ — ${monthNames[currentMonth]} ${currentYear}${currentRunning ? ` (триває: ${today.getDate()}-й день з ${daysInMonth}; суми поки що, частину платежів ще не внесено)` : ''}\n`;
            prompt += `- Дохід: ${formatMoney(income)} ₴\n`;
            const cats = (current.expenses || [])
                .filter((cat) => !isUnassigned(cat) && !isLedgerCategory(cat))
                .map((cat) => ({ cat, total: getCategoryTotal(cat) }))
                .filter((row) => row.total > 0)
                .sort((a, b) => b.total - a.total);
            cats.forEach(({ cat, total }) => {
                const tag = cat.isEssential ? ' [обов\'язкові]' : '';
                prompt += `- ${cat.name || 'Без назви'}${tag}: ${formatMoney(total)} ₴ (${pctOf(total, income)} доходу; за 10 років ${formatMoney(total * 120)} ₴)\n`;
            });
            const inbox = (current.expenses || []).find(isUnassigned);
            if (inbox && (inbox.items || []).length) {
                prompt += `- Не розкладено: ${inbox.items.length} ${pluralUk(inbox.items.length, 'покупка', 'покупки', 'покупок')} Монобанку на ${formatMoney(getCategoryTotal(inbox))} ₴ — це ще не окрема стаття витрат, не ранжуй її\n`;
            }
            const prev = flows.filter((f) => !(f.y === currentYear && f.m === currentMonth)).slice(-1)[0];
            if (prev) {
                const nowKeys = new Set(cats.map(({ cat }) => categoryKey(cat)));
                const gone = (appData[prev.y][prev.m].expenses || [])
                    .filter((cat) => !isUnassigned(cat) && !isLedgerCategory(cat) && getCategoryTotal(cat) > 0 && !nowKeys.has(categoryKey(cat)))
                    .map((cat) => cat.name)
                    .filter(Boolean);
                if (gone.length) {
                    prompt += currentRunning
                        ? `- Поки без витрат цього місяця (минулого місяця були): ${gone.join(', ')} — місяць триває, це не означає, що статтю закрито\n`
                        : `- Закрито / без витрат цього місяця (минулого місяця були): ${gone.join(', ')}\n`;
                }
            }
        }
        return prompt;
    }

    async function buildAnalyticsPrompt(_type = 'all') {
        const isBiz = currentUser && currentUser.account_type === 'business';
        const profileTypeStr = isBiz ? 'Бізнес' : 'Особистий (фіз. особа)';
        let prompt = `Виступи як мій фінансовий аналітик. Тип профілю: ${profileTypeStr}.\n`;
        prompt += `Тема — лише капітал: що в мене є, куди воно тече і наскільки це стійко. Цілі, треки, точку Б, анкету росту, ×25 і цілі конвертів не аналізуй — це «Стратегія росту».\n`;
        prompt += `Цифри — лише з даних нижче. Блок «МЕТРИКИ» вже пораховано: бери звідти, не перераховуй. Дохідність, курси й ціни ринку не вигадуй.\n`;
        prompt += `Пиши людською мовою, як аналітик пояснює клієнту: коротко, без таблиць, цифри — прямо в реченнях. Без загальних порад («складіть бюджет», «відмовтеся від кави», «інвестуйте в себе») — лише те, що випливає з моїх цифр.\n\n`;
        prompt += `СТРУКТУРА (саме ці заголовки, в такому порядку; кожен розділ є, але якщо даних для нього замало — один чесний рядок, без води):\n`;
        prompt += `## ГОЛОВНЕ — 3 пункти: стан капіталу; куди він рухається; одна головна дія з сумою і терміном.\n`;
        prompt += `## КАПІТАЛ ЗАРАЗ — що є і що винен, чистий капітал; яка частина ліквідна, яка працює.\n`;
        prompt += `## ДИНАМІКА — капітал росте чи тане і за рахунок чого (рух по місяцях, норма заощаджень, вільний залишок).\n`;
        prompt += `## РИЗИКИ — лише реальні з цих цифр: подушка, дорогі борги, нестабільний дохід, валютний ризик, від'ємний залишок.\n`;
        prompt += `## КУДИ СПРЯМУВАТИ ГРОШІ — не більше 3 дій; у кожної сума, термін і цифра з даних, на яку вона спирається.\n`;
        prompt += `## ДЕ КАПІТАЛ ВИТІКАЄ — 1–3 найбільші потоки споживання; якщо є тренд у блоці «ТРЕНДИ КАТЕГОРІЙ» — назви його. Підміну капіталу (оренда vs житло, таксі vs авто) — лише якщо цифри це тримають.\n\n`;

        await ensureExchangeRateForAi();
        prompt += buildCapitalDump(isBiz);
        return prompt;
    }

    function generateAiFxSection() {
        if (currentExchangeRate > 0) {
            const rate = Number(currentExchangeRate);
            return (
                `### КУРС ВАЛЮТ\n` +
                `- USD/UAH: ${rate} (1 $ = ${formatMoney(rate)} ₴)\n\n`
            );
        }
        return (
            `### КУРС ВАЛЮТ\n` +
            `Курс НБУ зараз недоступний. Не вигадуй курс і не бери його з інтернету.\n\n`
        );
    }

    async function ensureExchangeRateForAi() {
        if (!(currentExchangeRate > 0)) {
            await fetchExchangeRate();
        }
    }

    /** Anchor for the LLM: which «ПЕРІОД» block is now and which are history. */
    function generateAiNowSection() {
        const now = new Date();
        const today = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
        const initialized = Boolean(appData[currentYear]?.[currentMonth]?.initialized);
        let out = `### ЗАРАЗ\n`;
        out += `- Сьогодні: ${today}\n`;
        out += `- Поточний місяць: ${monthNames[currentMonth]} ${currentYear}${initialized ? '' : ' — ще не ініціалізований, витрат цього місяця немає'}\n`;
        out += `Поточний стан = блок «ПОТОЧНИЙ МІСЯЦЬ». Блоки з міткою «історія» — минуле: не описуй витрату чи ціль як діючу, якщо її немає в поточному місяці. Якщо категорія була раніше, а тепер її немає — вона в рядку «Закрито / без витрат цього місяця».\n\n`;
        return out;
    }

    /** @param {{ name: string, balance: number, goal?: number }} jar */
    /** One debt line for AI prompts. The rate is monthly (see getMonthlyInterestEstimate). */
    function formatAiDebtLine(debt) {
        const remaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
        return `- ${debt.name}: Залишок ${remaining.toFixed(2)} ${debt.currency} із загальної суми ${debt.total_amount} ${debt.currency} (Ставка: ${debt.interest_rate}% / міс)\n`;
    }

    function formatAiJarLine(jar) {
        const jarType = getJarType(jar);
        const typeLabel = jarType !== 'regular' ? ` [${JAR_TYPE_LABELS[jarType] || jarType}]` : '';
        const goal = parseFloat(jar.goal) || 0;
        const balance = parseFloat(jar.balance) || 0;
        if (!(goal > 0)) return `  * ${jar.name}${typeLabel}: ${jar.balance} ₴\n`;
        const progress = Math.round((balance / goal) * 100);
        const state = balance >= goal
            ? 'досягнуто, ціль закрита (не пропонуй її як відкриту)'
            : `виконано ${progress}%`;
        return `  * ${jar.name}${typeLabel}: ${jar.balance} ₴ (Ціль: ${jar.goal} ₴ — ${state})\n`;
    }

    async function generateAndCopyAiPrompt() {
        const prompt = await buildAnalyticsPrompt('all');
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(prompt);
        }
        return prompt;
    }

    /**
     * @param {'month' | 'all' | string} exportType
     * @returns {Promise<string>}
     */
    async function buildAiYearTracksSection(opts = {}) {
        if (!currentUser || !hasTracksModule()) return '';
        try {
            const live = getYearTracksDocSnapshot();
            let tracksDoc = yearTracksDocHasTracks(live) ? live : null;
            if (!tracksDoc) {
                tracksDoc = await loadYearTracksForAiExport({
                    apiUrl: API_URL,
                    userId: currentUser.id,
                    authenticated: true,
                });
            }
            return buildYearTracksAiSection(tracksDoc, {
                preferYear: currentYear,
                compact: Boolean(opts.compact),
            });
        } catch (e) {
            console.warn('Year tracks AI section skipped', e);
            return '';
        }
    }

    function yearTracksDocHasTracks(doc) {
        const boards = doc?.boards;
        if (!boards || typeof boards !== 'object') return false;
        return Object.values(boards).some((board) => Array.isArray(board?.tracks) && board.tracks.length > 0);
    }

    function generateAiMonthOneLiner(year, month, isBiz) {
        const data = appData[year]?.[month];
        if (!data?.initialized) return '';
        const income = getMonthIncomeUah(year, month);
        let expenses = 0;
        (data.expenses || []).forEach(cat => {
            expenses += (cat.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
        });
        let extra = 0;
        if (isBiz) {
            if (data.invoices && data.invoices.length > 0) {
                extra += data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            } else if (data.cogs) {
                extra += data.cogs.type === 'percent' ? income * (data.cogs.value / 100) : (parseFloat(data.cogs.value) || 0);
            }
            (data.payroll || []).forEach(emp => { extra += getEmployeeAccrued(emp); });
        }
        const spent = expenses + extra;
        if (income === 0 && spent === 0) return '';
        return `- ${monthNames[month]} ${year}: дохід ${income.toFixed(0)} ₴, витрати ${spent.toFixed(0)} ₴, ${isBiz ? 'прибуток' : 'залишок'} ${(income - spent).toFixed(0)} ₴\n`;
    }

    function getAiFocusCatalog() {
        const names = new Set();
        const initializedMonths = [];
        const years = Object.keys(appData).map(Number).sort((a, b) => a - b);
        years.forEach((y) => {
            Object.keys(appData[y] || {}).map(Number).sort((a, b) => a - b).forEach((m) => {
                if (!appData[y][m]?.initialized) return;
                initializedMonths.push({ year: y, month: m });
                (appData[y][m].expenses || []).forEach((cat) => {
                    if (cat.name) names.add(cat.name);
                    (cat.items || []).forEach((item) => {
                        if (item.name) names.add(item.name);
                    });
                });
                (appData[y][m].incomes || []).forEach((inc) => {
                    if (inc.name) names.add(inc.name);
                });
            });
        });
        const userId = currentUser?.id;
        (globalData.jars[userId] || []).forEach((j) => {
            if (j.name) names.add(j.name);
        });
        (globalData.debts[userId] || []).forEach((d) => {
            if (d.name) names.add(d.name);
        });
        return {
            currentYear,
            currentMonth,
            initializedMonths,
            names: [...names],
        };
    }

    function matchFocusName(hay, needles) {
        if (!needles?.length) return true;
        const h = String(hay || '').toLowerCase();
        return needles.some((n) => {
            const needle = String(n || '').toLowerCase();
            if (!needle) return false;
            const stem = needle.length >= 4 ? needle.slice(0, -1) : needle;
            return h.includes(needle) || needle.includes(h) || (stem.length >= 3 && h.includes(stem));
        });
    }

    function monthHasFocusNames(data, needles) {
        if (!needles?.length) return true;
        if ((data.incomes || []).some((inc) => matchFocusName(inc.name, needles))) return true;
        return (data.expenses || []).some((cat) => {
            if (matchFocusName(cat.name, needles)) return true;
            return (cat.items || []).some((item) => matchFocusName(item.name, needles));
        });
    }

    function findMonthsWithFocusNames(needles, cap = 3) {
        const hits = [];
        if (appData[currentYear]?.[currentMonth]?.initialized && monthHasFocusNames(appData[currentYear][currentMonth], needles)) {
            hits.push({ year: currentYear, month: currentMonth });
        }
        const years = Object.keys(appData).map(Number).sort((a, b) => b - a);
        for (const y of years) {
            const months = Object.keys(appData[y] || {}).map(Number).sort((a, b) => b - a);
            for (const m of months) {
                if (!appData[y][m]?.initialized) continue;
                if (y === currentYear && m === currentMonth) continue;
                if (!monthHasFocusNames(appData[y][m], needles)) continue;
                hits.push({ year: y, month: m });
                if (hits.length >= cap) return hits;
            }
        }
        return hits;
    }

    function findPastMonthCategory(expensesList, cat) {
        if (!expensesList?.length || !cat) return null;
        if (cat.items && cat.items.some((item) => item.debtId)) {
            return expensesList.find((e) => e.items && e.items.some((item) => item.debtId)) || null;
        }
        if (cat.isSavings) {
            return expensesList.find((e) => e.isSavings) || null;
        }
        const byId = expensesList.find((e) => sameId(e.id, cat.id));
        if (byId) return byId;
        const name = (cat.name || '').trim().toLowerCase();
        if (!name) return null;
        return expensesList.find((e) => (e.name || '').trim().toLowerCase() === name) || null;
    }

    function getPrevMonthCategoryTotal(year, month, cat) {
        let y = year;
        let m = month - 1;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        const prev = appData[y]?.[m];
        if (!prev?.initialized) return { kind: 'none' };
        const pastCat = findPastMonthCategory(prev.expenses, cat);
        if (!pastCat) return { kind: 'new' };
        return { kind: 'cmp', total: getCategoryTotal(pastCat) };
    }

    function formatAiCategoryTrend(currentTotal, prev) {
        if (prev.kind === 'none') return 'динаміка: немає попереднього місяця';
        if (prev.kind === 'new' || ((prev.total || 0) === 0 && currentTotal > 0)) return 'динаміка: нова';
        const prevTotal = prev.total || 0;
        if (currentTotal > prevTotal) {
            const pct = prevTotal > 0 ? (((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1) : '100.0';
            return `динаміка: ↑ +${pct}% (було ${prevTotal.toFixed(0)} ₴)`;
        }
        if (currentTotal < prevTotal) {
            const pct = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : '100.0';
            return `динаміка: ↓ −${pct}% (було ${prevTotal.toFixed(0)} ₴)`;
        }
        return 'динаміка: без змін';
    }

    function expenseRankMap(expenseList) {
        const totals = (expenseList || [])
            .map((c) => (c.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0))
            .filter((t) => t > 0);
        const unique = [...new Set(totals)].sort((a, b) => b - a);
        return {
            top1: unique[0] || -1,
            top2: unique[1] || -1,
            top3: unique[2] || -1,
        };
    }

    function rankLabelForTotal(total, ranks) {
        if (!(total > 0)) return '';
        if (total === ranks.top1) return '1 місце';
        if (total === ranks.top2) return '2 місце';
        if (total === ranks.top3) return '3 місце';
        return '';
    }

    function buildAiFocusDump(opts, isBiz) {
        const months = Array.isArray(opts?.focusMonths)
            ? opts.focusMonths
                .map((m) => ({ year: Number(m.year), month: Number(m.month) }))
                .filter((m) => Number.isFinite(m.year) && Number.isFinite(m.month) && m.month >= 0 && m.month <= 11)
                .slice(0, 3)
            : [];
        const categories = Array.isArray(opts?.focusCategories)
            ? opts.focusCategories.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 6)
            : [];
        if (!months.length && !categories.length) return '';

        let targets = months;
        const onlyNames = months.length ? [] : categories;
        if (!targets.length && categories.length) {
            targets = findMonthsWithFocusNames(categories, 3);
            if (!targets.length) targets = [{ year: currentYear, month: currentMonth }];
        }

        let out = `\n### ДЕТАЛІЗАЦІЯ ПІД ПИТАННЯ\n`;
        out += `Повний розклад зі статтями. Якщо питають про цей період або категорію — рахуй цей блок, не однорядкові підсумки вище.\n`;
        const seen = new Set();
        for (const t of targets) {
            const key = `${t.year}-${t.month}`;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!appData[t.year]?.[t.month]?.initialized) continue;
            out += generateAiDataForMonth(t.year, t.month, isBiz, {
                lineItems: true,
                onlyNames: onlyNames.length ? onlyNames : undefined,
            });
        }
        return out;
    }

    /** @returns {'ПОТОЧНИЙ МІСЯЦЬ' | 'історія' | 'майбутній місяць'} */
    function monthTimeLabel(year, month) {
        const ord = year * 12 + month;
        const now = currentYear * 12 + currentMonth;
        if (ord === now) return 'ПОТОЧНИЙ МІСЯЦЬ';
        return ord < now ? 'історія' : 'майбутній місяць';
    }

    /** Current month + last month with data: where «closed» still means «now». */
    function isRecentAiMonth(year, month) {
        const ord = year * 12 + month;
        if (ord === currentYear * 12 + currentMonth) return true;
        let latest = -1;
        Object.keys(appData).forEach((y) => {
            Object.keys(appData[y] || {}).forEach((m) => {
                if (!appData[y][m]?.initialized) return;
                const o = Number(y) * 12 + Number(m);
                if (o > latest) latest = o;
            });
        });
        return ord === latest;
    }

    /**
     * Categories that had money last month and have none now — otherwise a closed
     * expense just vanishes from the dump and the LLM keeps it alive.
     */
    function listClosedCategoriesVsPrev(year, month, data) {
        let y = year;
        let m = month - 1;
        if (m < 0) {
            m = 11;
            y -= 1;
        }
        const prev = appData[y]?.[m];
        if (!prev?.initialized) return [];
        const out = [];
        (prev.expenses || []).forEach((prevCat) => {
            const prevTotal = (prevCat.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            if (!(prevTotal > 0)) return;
            const nowCat = findPastMonthCategory(data.expenses || [], prevCat);
            const nowTotal = nowCat
                ? (nowCat.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0)
                : 0;
            if (nowTotal > 0) return;
            out.push({
                name: prevCat.name || 'Без назви',
                prevTotal,
                prevLabel: `${monthNames[m]} ${y}`,
                gone: !nowCat,
            });
        });
        return out;
    }

    function generateAiDataForMonth(year, month, isBiz, opts = {}) {
        const data = appData[year]?.[month];
        if (!data) return '';
        const lineItems = opts.lineItems !== false;
        const onlyNames = Array.isArray(opts.onlyNames) && opts.onlyNames.length ? opts.onlyNames : null;
        if (onlyNames && !monthHasFocusNames(data, onlyNames)) return '';
        const monthName = monthNames[month];
        let str = `\n==== ПЕРІОД: ${monthName} ${year} — ${monthTimeLabel(year, month)}${onlyNames ? ' (зріз під питання)' : ''} ====\n`;
        if (onlyNames) str += `Зріз: ${onlyNames.join(', ')}\n`;

        let totalIncomeUah = 0;
        str += `Доходи:\n`;
        if (data.incomes && data.incomes.length > 0) {
            data.incomes.forEach(inc => {
                const amtUah = inc.currency === 'USD' ? (parseFloat(inc.amount) || 0) * currentExchangeRate : (parseFloat(inc.amount) || 0);
                totalIncomeUah += amtUah;
                if (!onlyNames || matchFocusName(inc.name, onlyNames)) {
                    str += `  - ${inc.name}: ${inc.amount} ${inc.currency}\n`;
                }
            });
        }
        str += `  Загалом дохід: ${totalIncomeUah.toFixed(2)} ₴\n`;

        let totalCogs = 0;
        let totalPayroll = 0;
        
        if (isBiz && !onlyNames) {
            str += `Собівартість / Закупівлі:\n`;
            if (data.invoices && data.invoices.length > 0) {
                totalCogs = data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount)||0), 0);
            } else if (data.cogs) {
                totalCogs = data.cogs.type === 'percent' ? totalIncomeUah * (data.cogs.value / 100) : (parseFloat(data.cogs.value)||0);
            }
            str += `  - Витрати на закупівлі: ${totalCogs.toFixed(2)} ₴\n`;
            str += `  - Валовий прибуток: ${(totalIncomeUah - totalCogs).toFixed(2)} ₴\n`;

            if (data.payroll && data.payroll.length > 0) {
                str += `Зарплатний фонд:\n`;
                data.payroll.forEach(emp => {
                    totalPayroll += getEmployeeAccrued(emp);
                });
                str += `  - Всього нараховано ЗП: ${totalPayroll.toFixed(2)} ₴\n`;
            }
        } else if (isBiz) {
            if (data.invoices && data.invoices.length > 0) {
                totalCogs = data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount)||0), 0);
            } else if (data.cogs) {
                totalCogs = data.cogs.type === 'percent' ? totalIncomeUah * (data.cogs.value / 100) : (parseFloat(data.cogs.value)||0);
            }
            (data.payroll || []).forEach(emp => {
                totalPayroll += getEmployeeAccrued(emp);
            });
        }

        let totalExpenses = 0;
        let sliceExpenses = 0;
        let essentialTotal = 0;
        let optionalTotal = 0;
        let essentialMarked = 0;
        const ranks = expenseRankMap(data.expenses);
        str += `Витрати (Операційні / Особисті):\n`;
        str += `  (поле «за 10 років» = місяць × 120, якщо звичка не зміниться; не інфляційний прогноз)\n`;
        if (data.expenses && data.expenses.length > 0) {
            data.expenses.forEach(cat => {
                const allItems = cat.items || [];
                const catMatches = !onlyNames || matchFocusName(cat.name, onlyNames);
                const items = onlyNames
                    ? (catMatches ? allItems : allItems.filter((item) => matchFocusName(item.name, onlyNames)))
                    : allItems;
                const catTotal = allItems.reduce((sum, item) => sum + (parseFloat(item.amount)||0), 0);
                const sliceTotal = items.reduce((sum, item) => sum + (parseFloat(item.amount)||0), 0);
                const essential = !isBiz && isEssentialCategory(cat);
                if (essential) essentialMarked += 1;
                if (catTotal > 0) {
                    totalExpenses += catTotal;
                    if (!isBiz) {
                        if (essential) essentialTotal += catTotal;
                        else if (!cat.isSavings) optionalTotal += catTotal;
                    }
                }
                if (onlyNames && !items.length && !catMatches) return;
                if (sliceTotal > 0 || (catMatches && catTotal > 0)) {
                    sliceExpenses += onlyNames ? sliceTotal : catTotal;
                    const shown = onlyNames ? sliceTotal : catTotal;
                    const tag = isBiz
                        ? ''
                        : (cat.isSavings ? ' [заощадження]' : (essential ? ' [обов\'язкові]' : ' [не обов\'язкові]'));
                    const rank = rankLabelForTotal(catTotal, ranks);
                    const rankTag = rank ? ` [${rank}]` : '';
                    const share = totalIncomeUah > 0
                        ? `${((shown / totalIncomeUah) * 100).toFixed(1)}% доходу`
                        : 'частка н/д';
                    const cost10y = shown * 120;
                    const trend = formatAiCategoryTrend(shown, getPrevMonthCategoryTotal(year, month, cat));
                    const paidAll = items.length > 0 && items.every((item) => item.isPaid === true);
                    const paidBit = paidAll ? ' | оплачено' : '';
                    str += `  - Категорія "${cat.name}"${tag}${rankTag}: ${shown.toFixed(2)} ₴/міс | ${share} | ${cost10y.toFixed(0)} ₴ за 10 років | ${trend}${paidBit}\n`;
                    if (lineItems) {
                        items.forEach(item => {
                            const paidMark = item.isPaid ? ' ✓' : '';
                            str += `      * ${item.name}: ${item.amount} ₴${paidMark}\n`;
                        });
                    }
                }
            });
            if (!onlyNames) {
                const top10y = (data.expenses || [])
                    .map((c) => {
                        const t = (c.items || []).reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
                        return { name: c.name, t, y10: t * 120, savings: Boolean(c.isSavings) };
                    })
                    .filter((x) => x.t > 0)
                    .sort((a, b) => b.t - a.t)
                    .slice(0, 3);
                if (top10y.length) {
                    str += `  Найбільші потоки за 10 років: ${top10y.map((x) => `${x.name} ${x.y10.toFixed(0)} ₴${x.savings ? ' (заощадження)' : ''}`).join('; ')}\n`;
                }
            }
            if (!isBiz && !onlyNames) {
                if (essentialMarked > 0) {
                    str += `  Обов'язкові цього місяця: ${essentialTotal.toFixed(2)} ₴ (${essentialMarked} категорій позначено)\n`;
                    str += `  Необов'язкові цього місяця: ${optionalTotal.toFixed(2)} ₴\n`;
                } else {
                    str += `  Обов'язкові категорії не позначені — не вигадуй базу подушки з усіх витрат.\n`;
                }
            }
        } else {
            str += `  - Немає витрат\n`;
        }

        if (!onlyNames && isRecentAiMonth(year, month)) {
            const listed = listClosedCategoriesVsPrev(year, month, data);
            // Early in the running month rent is simply not paid yet: only a removed category is closed.
            const now = new Date();
            const running = year === now.getFullYear() && month === now.getMonth();
            const waiting = running ? listed.filter((c) => !c.gone) : [];
            const closed = running ? listed.filter((c) => c.gone) : listed;
            if (closed.length) {
                str += `  Закрито / без витрат цього місяця (0 ₴ — не рахуй як діючу витрату і не бери суму з минулих місяців):\n`;
                closed.forEach((c) => {
                    str += `    - "${c.name}": 0 ₴ (було ${c.prevTotal.toFixed(0)} ₴ у ${c.prevLabel}${c.gone ? ', категорію прибрано' : ''})\n`;
                });
            }
            if (waiting.length) {
                str += `  Поки без витрат цього місяця (місяць триває, ${now.getDate()}-й день — це не означає, що статтю закрито):\n`;
                waiting.forEach((c) => {
                    str += `    - "${c.name}" (у ${c.prevLabel} було ${c.prevTotal.toFixed(0)} ₴)\n`;
                });
            }
        }

        if (!isBiz && totalIncomeUah > 0 && !onlyNames) {
            str += `Рекомендовано відкласти цього місяця: ${recommendedSaveUah(totalIncomeUah).toFixed(2)} ₴\n`;
        }

        const netProfit = totalIncomeUah - totalCogs - totalPayroll - totalExpenses;
        str += `Підсумок місяця:\n`;
        if (onlyNames) str += `  - Зріз під питання: ${sliceExpenses.toFixed(2)} ₴\n`;
        str += `  - Всього витрачено (витрати + закупівлі + ЗП): ${(totalCogs + totalPayroll + totalExpenses).toFixed(2)} ₴\n`;
        str += `  - Чистий ${isBiz ? 'прибуток' : 'залишок'}: ${netProfit.toFixed(2)} ₴\n`;
        str += `===================================\n`;
        
        return str;
    }

        // ==========================================
    // 16. СТРАТЕГІЯ РОСТУ (WIZARD ТА ПРОМПТ)
    // ==========================================

    let currentGrowthStep = 1;
    const totalGrowthSteps = 7;

    // Логіка для кастомних селектів (карток)
    function toggleChoice(el, isMultiple) {
        if (!isMultiple) {
            const group = el.closest('.choice-group');
            group.querySelectorAll('.choice-item').forEach(item => item.classList.remove('selected'));
            el.classList.add('selected');
        } else {
            el.classList.toggle('selected');
        }
    }

    /** CSP-safe wrapper for data-action + data-pass-event. */
    function toggleChoiceFromEl(event, isMultiple) {
        const el = event?.target?.closest?.('[data-action]');
        if (el) toggleChoice(el, isMultiple);
    }

    function getChoiceValues(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return '';
        const selected = Array.from(group.querySelectorAll('.choice-item.selected'));
        return selected.map(el => el.dataset.value).join('|');
    }

    function setChoiceValues(groupId, valuesStr) {
        const group = document.getElementById(groupId);
        if (!group) return;
        const values = valuesStr ? String(valuesStr).split('|') : [];
        group.querySelectorAll('.choice-item').forEach(item => {
            if (values.includes(item.dataset.value)) item.classList.add('selected');
            else item.classList.remove('selected');
        });
    }

    function checkGrowthPromptButtonState() {}

    function showGrowthStep(step) {
        const progress = (step / totalGrowthSteps) * 100;
        document.getElementById('growth-progress-bar').style.width = `${progress}%`;

        for (let i = 1; i <= totalGrowthSteps; i++) {
            document.getElementById(`growth-step-${i}`).style.display = 'none';
        }
        document.getElementById(`growth-step-${step}`).style.display = 'block';
        if (step === totalGrowthSteps) paintGrowthFinalButton('save');
    }

    function nextGrowthStep(current) {
        // Валідація
        if (current === 1 && !document.getElementById('growth-job').value.trim()) {
            document.getElementById('growth-job').style.animation = 'shake 0.4s';
            setTimeout(() => document.getElementById('growth-job').style.animation = '', 400);
            return;
        }
        if (current === 1 && !getChoiceValues('growth-income-type')) { return; } // Хоча б 1 вибраний
        
        if (current === 2 && !document.getElementById('growth-target-income').value.trim()) {
            document.getElementById('growth-target-income').style.animation = 'shake 0.4s';
            setTimeout(() => document.getElementById('growth-target-income').style.animation = '', 400);
            return;
        }

        if (current === 3 && !document.getElementById('growth-skills').value.trim()) {
            document.getElementById('growth-skills').style.animation = 'shake 0.4s';
            setTimeout(() => document.getElementById('growth-skills').style.animation = '', 400);
            return;
        }

        if (current === 4 && !getChoiceValues('growth-vector-primary')) { return; }
        if (current === 4 && !getChoiceValues('growth-mobility')) { return; }
        if (current === 4 && !getChoiceValues('growth-market')) { return; }

        if (current < totalGrowthSteps) {
            currentGrowthStep++;
            showGrowthStep(currentGrowthStep);
        }
    }

    function prevGrowthStep(current) {
        if (current > 1) {
            currentGrowthStep--;
            showGrowthStep(currentGrowthStep);
        }
    }

    function openGrowthModal() {
        if (currentUser && currentUser.account_type === 'business') return;
        document.getElementById('growth-modal').classList.add('active');
        currentGrowthStep = 1;
        showGrowthStep(currentGrowthStep);

        setChoiceValues('growth-age', '');
        setChoiceValues('growth-vector-primary', '');
        setChoiceValues('growth-vector-extra', '');
        setChoiceValues('growth-mobility', '');
        setChoiceValues('growth-market', '');
        const lifeB = document.getElementById('growth-life-b');
        if (lifeB) lifeB.value = '';
        if (currentUser && currentUser.growthProfile) {
            const gp = currentUser.growthProfile;
            document.getElementById('growth-job').value = gp.job || '';
            document.getElementById('growth-target-income').value = gp.targetIncome || '';
            document.getElementById('growth-skills').value = gp.skills || '';
            document.getElementById('growth-barrier').value = gp.barrier || '';
            if (lifeB) lifeB.value = gp.lifeAtB || '';
            
            if (gp.ageRange) setChoiceValues('growth-age', gp.ageRange);
            if (gp.incomeType) setChoiceValues('growth-income-type', gp.incomeType);
            if (gp.period) setChoiceValues('growth-period', gp.period);
            if (gp.market) setChoiceValues('growth-market', gp.market);
            if (gp.time) setChoiceValues('growth-time', gp.time);
            if (gp.investment) setChoiceValues('growth-investment', gp.investment);
            if (gp.environment) setChoiceValues('growth-environment', gp.environment);
            if (gp.mobility) setChoiceValues('growth-mobility', gp.mobility);

            const migrated = migrateLegacyVectorIds(gp.vectorPrimary || gp.vector);
            const primary = migrated[0] || '';
            const extraFromNew = String(gp.vectorExtra || '').split('|').map((s) => s.trim()).filter(Boolean);
            const extra = extraFromNew.length ? extraFromNew : migrated.slice(1);
            if (primary) setChoiceValues('growth-vector-primary', primary);
            if (extra.length) {
                setChoiceValues('growth-vector-extra', extra.filter((id) => id !== primary).join('|'));
            }
        }
    }

    function closeGrowthModal(e) {
        if (!e || e.target.id === 'growth-modal' || e.target.closest('.btn-close-modal')) {
            document.getElementById('growth-modal').classList.remove('active');
        }
    }

    async function saveGrowthProfile() {
        if (!currentUser) return;
        
        if (!document.getElementById('growth-barrier').value.trim()) {
            document.getElementById('growth-barrier').style.animation = 'shake 0.4s';
            setTimeout(() => document.getElementById('growth-barrier').style.animation = '', 400);
            return;
        }

        const finalBtn = document.getElementById('btn-growth-final');
        if (finalBtn) finalBtn.disabled = true;

        const primary = firstId(getChoiceValues('growth-vector-primary'));
        const extra = getChoiceValues('growth-vector-extra')
            .split('|')
            .map((s) => s.trim())
            .filter((id) => id && id !== primary)
            .join('|');
        const job = document.getElementById('growth-job').value;
        const domain = inferDomainFromJob(job);
        const profile = {
            job,
            domain,
            roleFamily: inferRoleFamilyForProfile(job, domain),
            level: inferLevelFromJob(job),
            ageRange: getChoiceValues('growth-age'),
            incomeType: getChoiceValues('growth-income-type'),
            targetIncome: document.getElementById('growth-target-income').value,
            lifeAtB: (document.getElementById('growth-life-b')?.value || '').trim(),
            period: getChoiceValues('growth-period'),
            skills: document.getElementById('growth-skills').value,
            vectorPrimary: primary,
            vectorExtra: extra,
            vector: [primary, extra].filter(Boolean).join('|'),
            mobility: getChoiceValues('growth-mobility'),
            operation: inferOperationFromJob(job),
            market: getChoiceValues('growth-market'),
            time: getChoiceValues('growth-time'),
            investment: getChoiceValues('growth-investment'),
            environment: getChoiceValues('growth-environment'),
            barrier: document.getElementById('growth-barrier').value,
            financialPlan: (currentUser.growthProfile && currentUser.growthProfile.financialPlan) || getFinancialPlan(),
            // Lets the AI see how old the answers are (a stale profile once kept a sold business «running»).
            updatedAt: new Date().toISOString(),
        };
        currentUser.growthProfile = profile;
        
        try {
            const response = await apiFetch('/api/profile', { 
                method: 'POST', 
                body: JSON.stringify({ userId: currentUser.id, growthProfile: profile }) 
            });
            if (!response.ok) {
                let data = {};
                try { data = await response.json(); } catch (e) {}
                alert(`Не вдалося зберегти стратегію росту: ${data.error || 'помилка сервера'}`);
                if (finalBtn) finalBtn.disabled = false;
                return;
            }
        } catch (e) {
            console.error("Помилка збереження профілю", e);
            alert("Не вдалося зберегти стратегію росту через помилку з'єднання.");
            if (finalBtn) finalBtn.disabled = false;
            return;
        }
        
        paintGrowthFinalButton('analyze');
        try { syncAiEntryButtons(); } catch (e) {}
    }

    function paintGrowthFinalButton(mode) {
        const btn = document.getElementById('btn-growth-final');
        if (!btn) return;
        btn.disabled = false;
        if (mode === 'analyze') {
            btn.textContent = 'Проаналізувати у ШІ';
            btn.setAttribute('data-action', 'runGrowthAiFromModal');
        } else {
            btn.textContent = 'Зберегти';
            btn.setAttribute('data-action', 'saveGrowthProfile');
        }
    }

    function runGrowthAiFromModal() {
        closeGrowthModal();
        if (hasLlmKey()) openAiChat({ starter: 'growth' });
        else void launchAiGrowth();
    }

    function generateAndCopyGrowthPrompt() {
        launchAiGrowth();
    }

    function formatGrowthAnswers(str) {
        return str ? String(str).split('|').join(', ') : '';
    }

    function buildGrowthCourseSnapshot(opts = {}) {
        const gp = currentUser?.growthProfile;
        if (!gp?.job) return '';
        const compact = Boolean(opts.compact);
        const includeMarket = Boolean(opts.includeMarket);
        const migratedVectors = migrateLegacyVectorIds(gp.vectorPrimary || gp.vector);
        const primaryVector = firstId(gp.vectorPrimary) || migratedVectors[0] || '';
        const extraVectorIds = (gp.vectorExtra
            ? String(gp.vectorExtra).split('|')
            : migratedVectors.slice(1)
        ).map((s) => s.trim()).filter((id) => id && id !== primaryVector);

        const updated = gp.updatedAt ? new Date(gp.updatedAt) : null;
        const ageMonths = updated && !Number.isNaN(updated.getTime())
            ? Math.max(0, Math.round((Date.now() - updated.getTime()) / (30.4 * 24 * 3600 * 1000)))
            : null;
        let out = `### АНКЕТА (${ageMonths === null ? 'дата оновлення невідома' : `оновлено ${updated.toLocaleDateString('uk-UA')}${ageMonths >= 1 ? `, ${ageMonths} міс. тому` : ''}`})\n`;
        if (ageMonths === null || ageMonths >= 3) out += `Анкета може бути застарілою: якщо факт важливий для висновку — спершу перевір його з треками.\n`;
        out += `- Точка А: ${gp.job}\n`;
        if (gp.ageRange) out += `- Віковий діапазон: ${formatGrowthAnswers(gp.ageRange)}\n`;
        if (gp.incomeType) out += `- Джерела доходу: ${formatGrowthAnswers(gp.incomeType)}\n`;
        if (gp.mobility) out += `- Мобільність: ${mobilityLabel(firstId(gp.mobility))}\n`;
        out += `- Точка Б (цільовий чистий дохід): ${gp.targetIncome || 'не вказано'}`;
        if (gp.period) out += `, горизонт: ${formatGrowthAnswers(gp.period)}`;
        out += `\n`;
        if (gp.lifeAtB) out += `- Життя в точці Б: ${gp.lifeAtB}\n`;
        out += `- Головний вектор: ${primaryVector ? `${vectorLabel(primaryVector)} [${primaryVector}]` : 'не вказано'}\n`;
        out += `- Додаткові вектори: ${extraVectorIds.length ? extraVectorIds.map((id) => vectorLabel(id)).join(', ') : 'немає'}\n`;
        if (gp.market) out += `- Цільовий ринок: ${formatGrowthAnswers(gp.market)}\n`;
        if (compact) {
            if (gp.skills) out += `- Навички: ${gp.skills}\n`;
            if (gp.time) out += `- Час на розвиток: ${formatGrowthAnswers(gp.time)} / тиждень\n`;
            if (gp.barrier) out += `- Бар'єр: ${gp.barrier}\n`;
        } else {
            out += `- Навички і про себе: ${gp.skills || 'не вказано'}\n`;
            out += `- Час на розвиток: ${formatGrowthAnswers(gp.time)} на тиждень; бюджет: ${formatGrowthAnswers(gp.investment)}\n`;
            out += `- Оточення: ${formatGrowthAnswers(gp.environment)}\n`;
            out += `- Головна перешкода: ${gp.barrier || 'не вказано'}\n`;
        }
        if (includeMarket) {
            const roleId = firstId(gp.roleFamily);
            const levelId = firstId(gp.level);
            if (getBand(roleId, levelId, 'ua')) {
                out += `\n`;
                out += buildMarketAiSection({
                    roleFamily: roleId,
                    level: levelId,
                    market: gp.market,
                    mobility: gp.mobility,
                    domain: firstId(gp.domain),
                    // Same income the growth metrics use (complete months), so the model sees one number.
                    currentIncomeUsd: Number.isFinite(opts.currentIncomeUsd) ? opts.currentIncomeUsd : getLatestPersonalIncomeUsd(),
                    targetIncomeUsd: parseUsdAmount(gp.targetIncome, currentExchangeRate),
                    jobTitle: gp.job,
                });
                out += `Зарплати з таблиці — орієнтир можливої стелі, не нова ціль і не привід міняти головний напрям.\n`;
            } else {
                out += `\nРинок: у внутрішній таблиці немає бенду для цієї посади. Не вигадуй зарплати. Стелю оцінюй з каси, навичок, вектора і точки Б.\n`;
            }
        }
        out += `\n`;
        return out;
    }

    function debtRemainingToUah(debt) {
        const remaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
        if (debt.currency === 'USD') {
            if (!(currentExchangeRate > 0)) return { uah: 0, usdUnconverted: remaining };
            return { uah: remaining * currentExchangeRate, usdUnconverted: 0 };
        }
        return { uah: remaining, usdUnconverted: 0 };
    }

    /** Horizon of the growth answers in months (lower bound for ranges). */
    function growthHorizonMonths(period) {
        const text = formatGrowthAnswers(period) || String(period || '');
        const months = text.match(/(\d+)\s*міс/);
        if (months) return Number(months[1]);
        const years = text.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*рок/);
        return years ? Number(years[1]) * 12 : null;
    }

    /**
     * Money in a few lines for the growth strategist, over complete months (the running month is
     * incomplete early on). The full review is «Аналіз капіталу».
     */
    function growthMoneySummary(isBiz) {
        const jars = globalData.jars[currentUser.id] || [];
        const debts = (globalData.debts[currentUser.id] || []).filter((d) => !d.is_archived || d.is_archived === 0);
        const fp = getFinancialPlan();
        const jarsTotal = jars.reduce((sum, j) => sum + (parseFloat(j.balance) || 0), 0);
        const brokerUsd = isBiz ? 0 : (parseFloat(fp.brokerBalanceUsd) || 0);
        const brokerUah = brokerUsd > 0 && currentExchangeRate > 0 ? brokerUsd * currentExchangeRate : 0;
        let debtUah = 0;
        debts.forEach((d) => { debtUah += debtRemainingToUah(d).uah; });

        const today = new Date();
        const flows = initializedMonthsAsc()
            .map(({ y, m }) => ({ y, m, ...capitalFlowForMonth(y, m, isBiz) }))
            .filter((f) => f.income > 0 || f.consumption > 0);
        const complete = flows.filter((f) => !(f.y === today.getFullYear() && f.m === today.getMonth()));
        const recent = (complete.length ? complete : flows).slice(-3);
        const incomeAvg = avgOf(recent.map((f) => f.income));
        const freeAvg = avgOf(recent.map((f) => f.free));
        const toEnvelopesAvg = avgOf(recent.map((f) => f.toEnvelopes));
        const saved = recent.reduce((sum, f) => sum + f.toEnvelopes + f.debtPaid, 0);
        const incomeSum = recent.reduce((sum, f) => sum + f.income, 0);
        const essentialList = recent.map((f) => monthlyCushionBaseUah(0, appData[f.y][f.m].expenses)).filter((v) => v > 0);
        const essentialAvg = avgOf(essentialList);
        const cushion = getCushionBalanceUah();

        // Biggest spending lines on average, the same category joined across months by its key.
        const byKey = new Map();
        recent.forEach((f) => (appData[f.y][f.m].expenses || []).forEach((cat) => {
            if (isUnassigned(cat) || isLedgerCategory(cat)) return;
            const key = categoryKey(cat);
            const row = byKey.get(key) || { name: cat.name || 'Без назви', total: 0 };
            row.total += getCategoryTotal(cat);
            byKey.set(key, row);
        }));
        const top = [...byKey.values()].sort((a, b) => b.total - a.total).slice(0, 3)
            .map((row) => `${row.name} ${formatMoney(row.total / Math.max(1, recent.length))} ₴`);

        const window = complete.length ? `за ${recent.length} повні міс.` : 'лише поточний неповний місяць';
        let text = `### ГРОШІ КОРОТКО (пораховано Скринею, ${window}; детально — «Аналіз капіталу»)\n`;
        text += `- Чистий капітал: ${formatMoney(jarsTotal + brokerUah - debtUah)} ₴ (конверти ${formatMoney(jarsTotal)} ₴${brokerUah ? `, брокер ${formatMoney(brokerUah)} ₴` : ''}, борги ${formatMoney(debtUah)} ₴)\n`;
        if (recent.length) {
            text += `- Середній дохід: ${formatMoney(incomeAvg)} ₴/міс; вільний залишок: ${formatMoney(freeAvg)} ₴/міс; норма заощаджень ${pctOf(saved, incomeSum)}\n`;
        }
        text += essentialAvg > 0
            ? `- Подушка: ${formatMoney(cushion)} ₴ — вистачить на ${(cushion / essentialAvg).toFixed(1)} міс. обов'язкових витрат (норма 6)\n`
            : `- Подушка: ${formatMoney(cushion)} ₴ (обов'язкові витрати не позначені — у місяцях не рахуй)\n`;
        if (top.length) text += `- Найбільші витрати в середньому: ${top.join(', ')}\n`;
        return { text, incomeAvg, toEnvelopesAvg, months: recent.length };
    }

    /** The numbers a growth verdict rests on: gap to point B, ×25 at the real pace, time and budget. */
    function growthMetrics(money, activeTracks) {
        const gp = currentUser.growthProfile || {};
        const fp = getFinancialPlan();
        let out = `### РОЗРИВ ДО ЦІЛІ (пораховано Скринею — не перераховуй)\n`;
        const target = parseUsdAmount(gp.targetIncome, currentExchangeRate);
        const incomeUsd = money.incomeAvg > 0 ? uahToUsd(money.incomeAvg) : 0;
        const horizon = growthHorizonMonths(gp.period);
        if (incomeUsd > 0) out += `- Дохід зараз: ≈ ${formatMoney(incomeUsd)} $/міс (${formatMoney(money.incomeAvg)} ₴)\n`;
        if (target > 0 && incomeUsd > 0) {
            const ratio = target / incomeUsd;
            out += `- Ціль: ${formatMoney(target)} $/міс — це ×${ratio.toFixed(1)} до нинішнього доходу (+${formatMoney(Math.max(0, target - incomeUsd))} $/міс)`;
            if (horizon) {
                const monthly = ratio > 1 ? (Math.pow(ratio, 1 / horizon) - 1) * 100 : 0;
                out += `; за ${horizon} міс. потрібно рости ≈ ${monthly.toFixed(1)}% щомісяця`;
            }
            out += `\n`;
        } else if (target > 0) {
            out += `- Ціль: ${formatMoney(target)} $/міс; поточний дохід невідомий — розрив не рахуй\n`;
        } else {
            out += `- Ціль у доларах не вказана — розрив не рахуй\n`;
        }
        const desired = parseFloat(fp.desiredMonthlyUsd) || 0;
        if (desired > 0) {
            const capitalTarget = desired * 12 * 25;
            const capitalNow = (parseFloat(fp.brokerBalanceUsd) || 0) + uahToUsd(getInvestmentJarsBalanceUah());
            const realYears = calcYearsToCapital(capitalTarget, capitalNow, uahToUsd(money.toEnvelopesAvg), fp.returnRatePct);
            const normYears = calcYearsToCapital(capitalTarget, capitalNow, uahToUsd(recommendedSaveUah(money.incomeAvg)), fp.returnRatePct);
            out += `- Капітал ×25 на ${formatMoney(desired)} $/міс = ${formatMoney(capitalTarget)} $; зараз ${formatMoney(capitalNow)} $. `;
            out += `При фактичних відкладаннях (≈ ${formatMoney(uahToUsd(money.toEnvelopesAvg))} $/міс): ${formatYearsLabel(realYears)}; при нормі 20% доходу: ${formatYearsLabel(normYears)}\n`;
        }
        const hours = Number((formatGrowthAnswers(gp.time) || '').match(/\d+/)?.[0]) || 0;
        if (gp.time) {
            out += `- Час на розвиток: ${formatGrowthAnswers(gp.time)} на тиждень`;
            out += activeTracks > 0 && hours > 0 ? `; активних треків ${activeTracks} → ≈ ${(hours / activeTracks).toFixed(1)} год на трек\n` : `\n`;
        }
        const budgetPct = Number((formatGrowthAnswers(gp.investment) || '').match(/(\d+)\s*%/)?.[1]) || 0;
        if (budgetPct > 0 && money.incomeAvg > 0) {
            out += `- Бюджет на розвиток: до ${budgetPct}% доходу ≈ ${formatMoney((money.incomeAvg * budgetPct) / 100)} ₴/міс\n`;
        }
        return out;
    }

    async function buildGrowthPrompt(_type = 'all') {
        if (!currentUser || !currentUser.growthProfile || !currentUser.growthProfile.job) return;
        const isBiz = currentUser && currentUser.account_type === 'business';
        const tracks = hasTracksModule();

        let prompt = `Виступи як мій стратег росту. Питання одне: чи реально дійти до моєї цілі за вказаний горизонт і що найсильніше мене до неї наближає.\n`;
        prompt += `Спирайся на анкету, ${tracks ? 'треки, ' : ''}ринок і короткі цифри нижче. Блоки «пораховано Скринею» — бери як є, не перераховуй. Детальний розбір грошей — окремий «Аналіз капіталу», не повторюй його.\n`;
        prompt += `Правила: ${tracks ? 'завершений трек новіший за анкету — вір треку; гео, remote і релокацію пропонуй, лише якщо вони є в анкеті чи треках' : 'гео, remote і релокацію пропонуй, лише якщо вони є в анкеті'}; поточна роль — де я зараз, не ціль; вік — горизонт, не ярлик; зарплати — лише з блоку ринку.\n`;
        prompt += `Пиши простими словами, як наставник: коротко, без таблиць і без внутрішніх слів («каса», «гра», «стеля», «бенд», «вектор», «точка А/Б» — кажи «гроші», «ціль», «зараз»).\n\n`;
        prompt += `СТРУКТУРА (саме ці заголовки, кожен обов'язковий; якщо нема що сказати — один рядок):\n`;
        prompt += `## HELICOPTER VIEW — 3 пункти: вердикт (досяжно чи ні за цей горизонт — з цифрою розриву), головна причина, головна ставка на 90 днів.\n`;
        prompt += `## ТАКТИКА — план на 90 днів: до 3 кроків, у кожного вимірюваний результат і скільки годин та грошей на тиждень він забирає (з урахуванням мого часу й бюджету на розвиток); перший крок — що зробити цього тижня.${tracks ? ' Треки — лише заблоковані й ризикові, по рядку: чи перешкода реальна і як її зняти.' : ''}\n`;
        prompt += `## НА ПОДУМАТИ — сильніша чи реалістичніша альтернатива одним абзацом, лише якщо ціль нереальна або є явно кращий шлях; інакше один рядок, чому альтернатива не потрібна.\n\n`;

        await ensureExchangeRateForAi();
        prompt += generateAiFxSection();
        prompt += generateAiNowSection();
        const money = growthMoneySummary(isBiz);

        let tracksSection = '';
        let activeTracks = 0;
        if (!isBiz) {
            tracksSection = await buildAiYearTracksSection({ compact: true });
            activeTracks = (tracksSection.match(/^Трек: .*\n  Статус: (Активний|Заблокований|Заблоковано)/gm) || []).length;
        }
        prompt += growthMetrics(money, activeTracks);
        prompt += `\n${money.text}\n`;
        prompt += buildGrowthCourseSnapshot({
            includeMarket: true,
            currentIncomeUsd: money.incomeAvg > 0 ? uahToUsd(money.incomeAvg) : undefined,
        });
        if (tracksSection) prompt += `${tracksSection}\n`;
        return prompt;
    }

// Session bridge for isolated modules (family-tree, year-tracks). Finance state stays in this file.
    window.__getBudgetSession = function () {
        return {
            userId: currentUser?.id,
            name: currentUser?.name,
            surname: currentUser?.surname,
            accountType: currentUser?.account_type,
            // Cookie session — modules use credentials:include, not a JS-readable token.
            authenticated: Boolean(currentUser?.id),
            apiUrl: API_URL,
        };
    };

    // When tracks/tree overlays close, return switcher state to budget.
    window.__onSkryniaOverlayClosed = function () {
        if (suppressSkryniaCloseHook || !currentUser) return;
        if (currentSkryniaModule === 'budget') {
            updateSkryniaSwitcherUI();
            return;
        }
        persistSkryniaModule('budget');
        updateSkryniaSwitcherUI();
    };

    function serenityOverlayEl() {
        return document.getElementById('serenity-overlay');
    }

    function serenityAvatarEl() {
        return document.getElementById('nav-avatar');
    }

    function openSerenityEasterEgg() {
        const overlay = serenityOverlayEl();
        const avatar = serenityAvatarEl();
        if (!overlay) return;
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('serenity-open');
        if (avatar) avatar.setAttribute('aria-expanded', 'true');
    }

    function closeSerenityEasterEgg() {
        const overlay = serenityOverlayEl();
        const avatar = serenityAvatarEl();
        if (!overlay?.classList.contains('active')) return;
        overlay.classList.remove('active');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('serenity-open');
        if (avatar) avatar.setAttribute('aria-expanded', 'false');
    }

    function toggleSerenityEasterEgg() {
        const overlay = serenityOverlayEl();
        if (overlay?.classList.contains('active')) closeSerenityEasterEgg();
        else openSerenityEasterEgg();
    }

    function selectedAccountIds() {
        const ids = Array.isArray(monobankLink?.accountIds) ? monobankLink.accountIds.filter(Boolean) : [];
        if (ids.length) return ids;
        return monobankLink?.accountId ? [monobankLink.accountId] : [];
    }

    function cardCountLabel(count) {
        const mod10 = count % 10;
        const mod100 = count % 100;
        if (mod10 === 1 && mod100 !== 11) return `${count} картка`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} картки`;
        return `${count} карток`;
    }

    function renderMonobankButton() {
        const btn = document.getElementById('btn-monobank');
        const manage = document.getElementById('btn-monobank-manage');
        if (!btn) return;
        const connected = Boolean(monobankLink?.connected);
        const selected = selectedAccountIds();
        const imported = new Set(monobankLink?.importedAccountIds || []);
        const pending = selected.filter((id) => !imported.has(id));
        let label = 'Підключити Монобанк';
        if (monoQueue) label = 'Підтягуємо…';
        else if (monobankBusy) label = 'Завантаження…';
        else if (connected && pending.length && pending.length < selected.length) label = 'Продовжити';
        else if (connected) label = 'Підтягнути з Моно';
        btn.textContent = label;
        btn.disabled = monobankBusy || Boolean(monoQueue);
        if (manage) manage.hidden = !connected;
        const rules = document.getElementById('btn-mono-rules');
        if (rules) rules.hidden = !connected;
    }

    function syncMonobankModal() {
        const status = document.getElementById('mono-status-text');
        const connectBlock = document.getElementById('mono-connect-block');
        const disconnectBtn = document.getElementById('btn-monobank-disconnect');
        if (!status) return;
        if (monobankLink?.connected) {
            const ids = selectedAccountIds();
            const cards = ids.length > 1 ? cardCountLabel(ids.length) : monobankLink.maskedPan;
            const who = [monobankLink.clientName, cards].filter(Boolean).join(' · ');
            status.textContent = who ? `Підключено: ${who}` : 'Підключено';
            if (connectBlock) connectBlock.hidden = true;
            if (disconnectBtn) disconnectBtn.hidden = false;
        } else {
            status.textContent = 'Токен зберігається лише для цього профілю і не повертається в браузер.';
            if (connectBlock) connectBlock.hidden = false;
            if (disconnectBtn) disconnectBtn.hidden = true;
            renderMonobankCards([]);
        }
    }

    async function refreshMonobankStatus() {
        if (!currentUser) {
            monobankLink = null;
            renderMonobankButton();
            return;
        }
        try {
            const response = await apiFetch(`/api/monobank/status?userId=${encodeURIComponent(currentUser.id)}&year=${currentYear}&month=${currentMonth + 1}`);
            const data = await response.json();
            if (response.ok && data.connected) {
                const previousAccounts = monobankLink?.accounts;
                monobankLink = {
                    connected: true,
                    clientName: data.clientName || '',
                    maskedPan: data.maskedPan || '',
                    accountId: data.accountId || '',
                    accountIds: Array.isArray(data.accountIds) ? data.accountIds : [],
                    importedAccountIds: Array.isArray(data.importedAccountIds) ? data.importedAccountIds : [],
                    accounts: previousAccounts,
                };
            } else if (response.ok) {
                monobankLink = null;
            }
        } catch {
            /* keep the last known connection if the status request failed */
        }
        renderMonobankButton();
        syncMonobankModal();
    }

    function openMonobankModal() {
        const err = document.getElementById('mono-form-error');
        if (err) err.textContent = '';
        const input = document.getElementById('mono-token-input');
        if (input) input.value = '';
        syncMonobankModal();
        document.getElementById('monobank-modal')?.classList.add('active');
        if (monobankLink?.connected) loadMonobankAccounts();
    }

    function closeMonobankModal(event) {
        if (event && event.target?.id !== 'monobank-modal' && !event.target?.closest?.('.btn-close-modal')) return;
        document.getElementById('monobank-modal')?.classList.remove('active');
    }

    /** A Monobank operation as stored in a month: the server's routing fields stay for later re-routing. */
    function monoOperationItem(source, accountId) {
        return {
            id: source.monoId || source.id || newId(),
            name: source.name || 'Операція',
            amount: Number(source.amount) || 0,
            isPaid: true,
            monoId: source.monoId || source.id,
            accountId: accountId || source.accountId || '',
            time: source.time,
            mcc: source.mcc ?? null,
            mccGroup: source.mccGroup || '',
        };
    }

    /** Re-renders the month after Monobank operations changed (unless the user is typing in it). */
    function refreshMonthAfterMono(year, monthIndex, category) {
        if (year !== currentYear || monthIndex !== currentMonth) return;
        expenses = appData[year][monthIndex].expenses;
        const modalOpen = document.getElementById('category-modal')?.classList.contains('active');
        const editing = modalOpen || document.getElementById('expenses-list')?.contains(document.activeElement);
        if (!editing) {
            renderExpenses();
            updateAll();
        } else if (category) {
            syncCategoryLimitState(category);
        }
    }

    /** A fresh statement for one card replaces that card's operations, each in its routed category. */
    function mergeMonobankCard(year, monthIndex, accountId, incoming) {
        if (!appData[year]) appData[year] = {};
        if (!appData[year][monthIndex]) appData[year][monthIndex] = { initialized: true, incomes: [], expenses: [] };
        const bucket = appData[year][monthIndex];
        const list = bucket.expenses || [];
        removeCardOperations(list, accountId, monobankLink?.accountId || accountId);
        (incoming || []).forEach((operation) => {
            placeOperation(list, monoOperationItem(operation, accountId), operation.target, newId);
        });
        bucket.expenses = dropEmptySystemCategories(list);
        if (year === currentYear && monthIndex === currentMonth) {
            expenses = bucket.expenses;
            renderExpenses();
            updateAll();
        }
    }

    // ==========================================
    // MONOBANK → ВЛАСНІ КАТЕГОРІЇ: перенесення операцій і правила
    // ==========================================
    let monoRules = [];
    let monoRulesPending = [];
    let monoRulesLoading = false;
    let monoPicker = null;
    let monoRulesQuery = '';

    const MONO_PICK_NONE = '__none__';
    const MONO_PICK_NEW = '__new__';

    const MONO_JAR = 'jar:';
    const MONO_DEBT = 'debt:';
    const DEBT_CATEGORY_NAME = 'Погашення боргів';

    /** «Заощадження» and «Погашення боргів» belong to envelopes and debts, not to category rules. */
    function isLedgerCategory(category) {
        return Boolean(category?.isSavings) || category?.name === DEBT_CATEGORY_NAME;
    }

    function ownCategoriesOfMonth() {
        return (expenses || []).filter((category) => isOwnCategory(category) && !isLedgerCategory(category));
    }

    function isLinkTarget(value) {
        return typeof value === 'string' && (value.startsWith(MONO_JAR) || value.startsWith(MONO_DEBT));
    }

    function linkTargetOf(item) {
        if (item?.envelopeId) return MONO_JAR + item.envelopeId;
        if (item?.debtId) return MONO_DEBT + item.debtId;
        return null;
    }

    function currencySign(currency) {
        return currency === 'USD' ? '$' : '₴';
    }

    const nbuRateCache = new Map();

    /** NBU official rate (₴ per unit) on the operation's day. */
    async function nbuRateOn(currency, unixTime) {
        const day = new Date((Number(unixTime) || Math.floor(Date.now() / 1000)) * 1000);
        const ymd = `${day.getFullYear()}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
        const key = `${currency}:${ymd}`;
        if (nbuRateCache.has(key)) return nbuRateCache.get(key);
        const response = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${encodeURIComponent(currency)}&date=${ymd}&json`);
        if (!response.ok) throw new Error(`NBU ${response.status}`);
        const rate = Number((await response.json())?.[0]?.rate);
        if (!(rate > 0)) throw new Error('NBU: no rate');
        const result = { rate, date: day };
        nbuRateCache.set(key, result);
        return result;
    }

    function findItemCategory(item) {
        return (expenses || []).find((category) => (category.items || []).includes(item)) || null;
    }

    /** Undoes the envelope top-up / debt payment an operation was turned into; it goes back to «Нерозподілене». */
    function unlinkMonoOperation(item) {
        if (item.envelopeId) {
            const jar = findUserJar(item.envelopeId);
            if (jar) jar.balance = addMoney(jar.balance, -(parseFloat(item.amount) || 0));
        }
        const debtId = item.debtId;
        delete item.envelopeId;
        delete item.debtId;
        delete item.debtDeduction;
        const from = findItemCategory(item);
        if (from) from.items = from.items.filter((entry) => entry !== item);
        placeOperation(expenses, item, null, newId);
        if (debtId) syncGlobalDebtBalance(debtId);
    }

    /** Turns a Monobank operation into an envelope top-up or a debt payment — one record, no double count. */
    function linkMonoOperation(item, target, deduction) {
        if (isLinkedItem(item)) unlinkMonoOperation(item);
        const from = findItemCategory(item);
        if (from) from.items = from.items.filter((entry) => entry !== item);
        if (target.startsWith(MONO_JAR)) {
            const jar = findUserJar(target.slice(MONO_JAR.length));
            let savings = expenses.find((category) => category.isSavings);
            if (!savings) {
                savings = { id: newId(), name: 'Заощадження', isSavings: true, items: [] };
                expenses.push(savings);
            }
            item.envelopeId = jar.id;
            if (!Array.isArray(savings.items)) savings.items = [];
            savings.items.push(item);
            jar.balance = addMoney(jar.balance, parseFloat(item.amount) || 0);
            return `Поповнено конверт «${jar.name}» на ${formatMoney(parseFloat(item.amount) || 0)} ₴`;
        }
        const debt = findUserDebt(target.slice(MONO_DEBT.length));
        let debtCategory = expenses.find((category) => category.name === DEBT_CATEGORY_NAME);
        if (!debtCategory) {
            debtCategory = { id: newId(), name: DEBT_CATEGORY_NAME, items: [] };
            expenses.push(debtCategory);
        }
        item.debtId = debt.id;
        item.debtDeduction = deduction;
        item.isPaid = true;
        if (!Array.isArray(debtCategory.items)) debtCategory.items = [];
        debtCategory.items.push(item);
        syncGlobalDebtBalance(debt.id);
        return `Платіж по боргу «${debt.name}»: −${formatMoney(deduction)} ${currencySign(debt.currency)}`;
    }

    /** Re-renders and saves after an operation was linked to or unlinked from an envelope or debt. */
    async function afterMonoLinkChange() {
        expenses = dropEmptySystemCategories(expenses);
        if (appData[currentYear]?.[currentMonth]) appData[currentYear][currentMonth].expenses = expenses;
        renderExpenses();
        updateAll();
        updateSavingsDisplay();
        updateDebtsDisplay();
        renderEnvelopes();
        if (document.getElementById('category-modal')?.classList.contains('active')) {
            if (findExpenseById(activeCategoryId)) renderModalItems();
            else document.getElementById('category-modal').classList.remove('active');
        }
        await saveData(true);
    }

    function categoryNameByKey(key) {
        if (key === IGNORED_TARGET) return 'Не враховувати';
        const own = ownCategoriesOfMonth().find((category) => categoryKey(category) === key);
        if (own) return own.name || 'Без назви';
        for (const year of Object.keys(appData)) {
            for (const month of Object.keys(appData[year] || {})) {
                const found = (appData[year][month]?.expenses || []).find((category) => isOwnCategory(category) && categoryKey(category) === key);
                if (found) return found.name || 'Без назви';
            }
        }
        return 'Категорія видалена';
    }

    function monoOperationDate(item) {
        const time = Number(item?.time);
        if (!time) return '';
        const at = new Date(time * 1000);
        const day = at.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
        const clock = at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
        return `${day} · ${clock}`;
    }

    function pluralUk(n, one, few, many) {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    }

    /** Rules re-route months on the server, so local edits must reach it first. */
    async function flushSavesBeforeMonoRules() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
            saveTimeoutTarget = null;
        }
        if (appData[currentYear]?.[currentMonth]?.initialized) {
            appData[currentYear][currentMonth].expenses = expenses;
        }
        for (const key of [...pendingSaves.keys()]) {
            const [year, month] = key.split('-').map(Number);
            enqueueSave(year, month);
        }
        await saveQueue;
        return pendingSaves.size === 0;
    }

    function applyMonoRulesResponse(data) {
        if (Array.isArray(data.rules)) monoRules = data.rules;
        if (Array.isArray(data.pending)) monoRulesPending = data.pending;
        if (typeof data.dataVersion === 'number') dataVersion = Math.max(dataVersion, data.dataVersion);
        let currentChanged = false;
        (data.months || []).forEach(({ year, month, expenses: monthExpenses, ignored }) => {
            const bucket = appData[year]?.[month];
            if (!bucket || !Array.isArray(monthExpenses)) return;
            ensureCategoryKeys(monthExpenses, newId);
            bucket.expenses = monthExpenses;
            if (Array.isArray(ignored)) bucket.monoIgnored = ignored;
            if (year === currentYear && month === currentMonth) {
                expenses = monthExpenses;
                currentChanged = true;
            }
        });
        if (!currentChanged) return;
        renderExpenses();
        updateAll();
        if (document.getElementById('category-modal')?.classList.contains('active')) {
            // The open category may have emptied («Нерозподілене» disappears when sorted out).
            if (findExpenseById(activeCategoryId)) renderModalItems();
            else document.getElementById('category-modal').classList.remove('active');
        }
    }

    async function postMonoRules(change) {
        if (!currentUser) return null;
        if (!(await flushSavesBeforeMonoRules())) {
            showSaveStatus('Спершу мають зберегтися поточні зміни. Спробуйте ще раз за мить.', { tone: 'error', canRetry: true });
            return null;
        }
        let response;
        let data = {};
        try {
            response = await apiFetch('/api/monobank/rules', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, clientId: saveClientId, baseVersion: dataVersion, ...change }),
            });
            data = await response.json().catch(() => ({}));
        } catch (e) {
            showSaveStatus("Немає з'єднання із сервером. Зміну не збережено.", { tone: 'error', autoHideMs: 6000 });
            return null;
        }
        if (response.status === 401) {
            logout();
            return null;
        }
        if (response.status === 409 && data.code === 'stale_data') {
            await reloadAfterConflict();
            return null;
        }
        if (!response.ok) {
            showSaveStatus(data.error || 'Не вдалося зберегти правило', { tone: 'error', autoHideMs: 6000 });
            return null;
        }
        applyMonoRulesResponse(data);
        return data;
    }

    /** Rules re-route only the running calendar month; earlier months keep their layout. */
    function runningMonth() {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    }

    function isViewingRunningMonth() {
        const running = runningMonth();
        return currentYear === running.year && currentMonth === running.month;
    }

    function runningMonthReroute() {
        const { year, month } = runningMonth();
        return appData[year]?.[month]?.initialized ? [{ year, month }] : [];
    }

    function pendingCount(pending) {
        return pending.reduce((sum, month) => sum + month.count, 0);
    }

    // ---------- Picker: where an operation, a type or a code goes ----------

    function openMonoMove(itemId) {
        const category = findExpenseById(activeCategoryId);
        const item = findSubItemById(category, itemId);
        if (!category || !item || !isMonoItem(item)) return;
        monoPicker = {
            mode: 'move',
            item,
            current: linkTargetOf(item) || (isUnassigned(category) || isLegacyMonoCategory(category) || isLedgerCategory(category) ? null : categoryKey(category)),
            selected: null,
            rate: null,
        };
        showMonoPicker();
    }

    function openMonoRulePicker(match, name) {
        const rule = monoRules.find((entry) => entry.kind === 'merchant' && entry.match === match);
        const label = name || rule?.label || match;
        const current = rule?.target || MONO_PICK_NONE;
        monoPicker = { mode: 'rule', kind: 'merchant', match, label, current, selected: current };
        showMonoPicker();
    }

    function showMonoPicker() {
        const newInput = document.getElementById('mono-pick-new-name');
        if (newInput) newInput.value = '';
        document.getElementById('mono-pick-error').textContent = '';
        renderMonoPicker();
        document.getElementById('mono-pick-modal')?.classList.add('active');
    }

    function closeMonoPicker(event) {
        if (event && event.target?.id !== 'mono-pick-modal' && !event.target?.closest?.('.btn-close-modal')) return;
        document.getElementById('mono-pick-modal')?.classList.remove('active');
        monoPicker = null;
    }

    function monoPickerOptions() {
        const picker = monoPicker;
        const options = [];
        if (picker.mode === 'rule') {
            options.push({ value: MONO_PICK_NONE, name: 'Без категорії', meta: 'у «Нерозподілене»', tone: 'muted' });
        }
        ownCategoriesOfMonth().forEach((category) => {
            const key = categoryKey(category);
            options.push({
                value: key,
                name: category.name || 'Без назви',
                meta: key === picker.current ? (picker.mode === 'move' ? 'зараз тут' : 'зараз') : '',
            });
        });
        options.push({ value: MONO_PICK_NEW, name: 'Нова категорія', tone: 'new' });
        options.push({ value: IGNORED_TARGET, name: 'Не враховувати', meta: 'не впливає на суми й ліміти', tone: 'muted' });
        if (picker.mode !== 'move' || !currentUser) return options;

        const here = (value) => (value === picker.current ? ' · зараз тут' : '');
        const jars = (globalData.jars[currentUser.id] || []).filter((jar) => !jar.isMain);
        if (jars.length) {
            options.push({ section: 'Поповнити конверт' });
            jars.forEach((jar) => {
                const balance = parseFloat(jar.balance) || 0;
                const goal = parseFloat(jar.goal) || 0;
                options.push({
                    value: MONO_JAR + jar.id,
                    name: jar.name || 'Конверт',
                    meta: (goal > 0 ? `${formatMoney(balance)} / ${formatMoney(goal)} ₴` : `${formatMoney(balance)} ₴`) + here(MONO_JAR + jar.id),
                });
            });
        }
        const debts = (globalData.debts[currentUser.id] || []).filter((debt) =>
            String(debt.id) === String(picker.item?.debtId) ||
            ((!debt.is_archived || debt.is_archived === 0) && (parseFloat(debt.remaining_amount) || 0) > 0)
        );
        if (debts.length) {
            options.push({ section: 'Сплатити борг' });
            debts.forEach((debt) => {
                options.push({
                    value: MONO_DEBT + debt.id,
                    name: debt.name || 'Борг',
                    meta: `залишок ${formatMoney(parseFloat(debt.remaining_amount) || 0)} ${currencySign(debt.currency)}${here(MONO_DEBT + debt.id)}`,
                });
            });
        }
        return options;
    }

    /** The debt a picker selection points at, when it is in a foreign currency (needs the NBU rate). */
    function pickerForeignDebt(picker) {
        if (!picker?.selected?.startsWith(MONO_DEBT)) return null;
        const debt = findUserDebt(picker.selected.slice(MONO_DEBT.length));
        return debt && debt.currency && debt.currency !== 'UAH' ? debt : null;
    }

    function renderMonoPickerConvert(picker) {
        const box = document.getElementById('mono-pick-convert');
        if (!box) return;
        const debt = pickerForeignDebt(picker);
        box.hidden = !debt;
        if (!debt) return;
        const amount = parseFloat(picker.item.amount) || 0;
        const rate = picker.rate;
        if (!rate || rate.status === 'loading') {
            box.textContent = 'Отримуємо курс НБУ на день операції…';
        } else if (rate.status === 'error') {
            box.textContent = 'Не вдалося отримати курс НБУ. Спробуйте ще раз.';
        } else {
            const deduction = roundMoney(amount / rate.rate);
            const day = rate.date.toLocaleDateString('uk-UA');
            box.textContent = `З боргу спишеться ${formatMoney(deduction)} ${currencySign(debt.currency)} · курс НБУ ${rate.rate.toFixed(4)} ₴ на ${day}`;
        }
    }

    function renderMonoPicker() {
        const picker = monoPicker;
        if (!picker) return;
        const title = document.getElementById('mono-pick-title');
        const subtitle = document.getElementById('mono-pick-subtitle');
        const context = document.getElementById('mono-pick-context');
        const remember = document.getElementById('mono-pick-remember');
        const submit = document.getElementById('mono-pick-submit');

        if (picker.mode === 'move') {
            const item = picker.item;
            const meta = monoOperationDate(item);
            title.textContent = 'Перенести операцію';
            subtitle.textContent = 'Оберіть категорію для цієї покупки';
            context.innerHTML = `
                <div class="mr-op">
                    <span class="mono-mark" aria-hidden="true">m</span>
                    <div class="mr-op-info">
                        <div class="mr-op-name">${escapeHtml(item.name || 'Операція')}</div>
                        <div class="mr-op-meta">${escapeHtml(meta)}</div>
                    </div>
                    <div class="mr-op-amount tabular">−${formatMoney(parseFloat(item.amount) || 0)} ₴</div>
                </div>`;
            const merchant = String(item.name || '').trim();
            remember.hidden = !merchant;
            document.getElementById('mono-pick-remember-title').textContent = `Запам'ятати для «${merchant}»`;
            document.getElementById('mono-pick-remember-hint').textContent = isViewingRunningMonth()
                ? 'Покупки цього продавця в поточному місяці й нові підуть сюди'
                : 'Цю покупку перенесемо, а нові покупки цього продавця підуть сюди. Інші покупки минулого місяця не зміняться';
            submit.textContent = 'Перенести';
        } else {
            title.textContent = `«${picker.label}»`;
            subtitle.textContent = 'Куди йдуть покупки цього магазину';
            const seen = monoRulesSummary().find((row) => row.key === picker.match);
            context.innerHTML = seen
                ? `<div class="mr-context">Цього місяця: ${seen.count} ${pluralUk(seen.count, 'покупка', 'покупки', 'покупок')} · ${formatMoney(seen.total)} ₴. Вони й нові покупки підуть у вибрану категорію.</div>`
                : '';
            remember.hidden = true;
            submit.textContent = 'Зберегти';
        }

        const list = document.getElementById('mono-pick-list');
        list.innerHTML = monoPickerOptions().map((option) => {
            if (option.section) return `<div class="mr-list-section">${escapeHtml(option.section)}</div>`;
            const selected = picker.selected === option.value;
            return `
                <button type="button" class="mr-option${option.tone ? ` is-${option.tone}` : ''}${selected ? ' is-selected' : ''}" role="radio" aria-checked="${selected}"
                    data-action="pickMonoTarget" data-args="${escapeAttr(JSON.stringify([option.value]))}">
                    <span class="mr-option-radio" aria-hidden="true">${option.tone === 'new' ? '+' : ''}</span>
                    <span class="mr-option-name">${escapeHtml(option.name)}</span>
                    ${option.meta ? `<span class="mr-option-meta">${escapeHtml(option.meta)}</span>` : ''}
                </button>`;
        }).join('');
        const newRow = document.getElementById('mono-pick-new');
        newRow.hidden = picker.selected !== MONO_PICK_NEW;
        renderMonoPickerConvert(picker);
        const linking = picker.mode === 'move' && isLinkTarget(picker.selected);
        // Envelope and debt links are made by hand for each operation, never remembered.
        if (picker.mode === 'move') remember.hidden = remember.hidden || linking;
        if (linking) submit.textContent = picker.selected.startsWith(MONO_JAR) ? 'Поповнити конверт' : 'Зарахувати платіж';
        const waitingRate = Boolean(pickerForeignDebt(picker)) && picker.rate?.status !== 'ready';
        submit.disabled = !picker.selected || picker.selected === picker.current || waitingRate;
    }

    function pickMonoTarget(value) {
        const picker = monoPicker;
        if (!picker) return;
        picker.selected = value;
        document.getElementById('mono-pick-error').textContent = '';
        const debt = pickerForeignDebt(picker);
        if (debt) {
            picker.rate = { status: 'loading' };
            nbuRateOn(debt.currency, picker.item.time)
                .then(({ rate, date }) => { picker.rate = { status: 'ready', rate, date }; })
                .catch(() => { picker.rate = { status: 'error' }; })
                .finally(() => { if (monoPicker === picker && picker.selected === value) renderMonoPicker(); });
        }
        renderMonoPicker();
        if (value === MONO_PICK_NEW) document.getElementById('mono-pick-new-name')?.focus();
    }

    function createCategoryForMono(name) {
        const category = { id: newId(), key: newId(), name, items: [], isEssential: false };
        expenses.push(category);
        renderExpenses();
        updateAll();
        saveData();
        return category;
    }

    async function submitMonoPicker() {
        const picker = monoPicker;
        if (!picker?.selected) return;
        const submit = document.getElementById('mono-pick-submit');
        const error = document.getElementById('mono-pick-error');
        let target = picker.selected;
        if (target === MONO_PICK_NEW) {
            const name = document.getElementById('mono-pick-new-name')?.value.trim() || '';
            if (!name) {
                error.textContent = 'Вкажіть назву нової категорії';
                document.getElementById('mono-pick-new-name')?.focus();
                return;
            }
            target = categoryKey(createCategoryForMono(name));
        }

        if (picker.mode === 'move' && isLinkTarget(target)) {
            const debt = pickerForeignDebt(picker);
            const amount = parseFloat(picker.item.amount) || 0;
            const deduction = debt ? roundMoney(amount / picker.rate.rate) : amount;
            const message = linkMonoOperation(picker.item, target, deduction);
            document.getElementById('mono-pick-modal')?.classList.remove('active');
            monoPicker = null;
            await afterMonoLinkChange();
            showSaveStatus(message, { tone: 'info', autoHideMs: 4000 });
            return;
        }
        if (picker.mode === 'move' && isLinkedItem(picker.item)) {
            unlinkMonoOperation(picker.item);
            await afterMonoLinkChange();
        }

        let change;
        let remembered = '';
        if (picker.mode === 'move') {
            const merchant = String(picker.item.name || '').trim();
            const remember = Boolean(merchant) && document.getElementById('mono-pick-remember-input')?.checked;
            remembered = remember ? merchant : '';
            change = remember
                ? { set: [{ kind: 'merchant', match: merchant, target, label: merchant }], remove: [{ kind: 'tx', match: txKey(picker.item) }] }
                : { set: [{ kind: 'tx', match: txKey(picker.item), target }] };
        } else if (target === MONO_PICK_NONE) {
            change = { remove: [{ kind: picker.kind, match: picker.match }] };
        } else {
            change = { set: [{ kind: picker.kind, match: picker.match, target, label: picker.kind === 'merchant' ? picker.label : null }] };
        }
        if (picker.mode === 'move' && !isViewingRunningMonth()) {
            // A past month is history: only the operation the user moved changes there.
            change.reroute = [{ year: currentYear, month: currentMonth, only: [txKey(picker.item)] }];
            if (remembered) change.reroute.push(...runningMonthReroute());
        } else {
            change.reroute = runningMonthReroute();
        }

        submit.disabled = true;
        submit.classList.add('is-busy');
        const data = await postMonoRules(change);
        submit.classList.remove('is-busy');
        if (!data) {
            submit.disabled = false;
            return;
        }
        const mode = picker.mode;
        document.getElementById('mono-pick-modal')?.classList.remove('active');
        monoPicker = null;

        const placeName = target === MONO_PICK_NONE ? 'Нерозподілене' : categoryNameByKey(target);
        if (mode === 'move') {
            const where = target === IGNORED_TARGET ? 'Операцію більше не враховано' : `Перенесено в «${placeName}»`;
            showSaveStatus(remembered ? `${where} · запам'ятали «${remembered}»` : where, { tone: 'info', autoHideMs: 4000 });
        } else {
            showSaveStatus('Правило збережено', { tone: 'info', autoHideMs: 2500 });
        }
        if (document.getElementById('mono-rules-modal')?.classList.contains('active')) renderMonoRules();
    }

    // ---------- Rules screen: MCC types and codes → own categories ----------

    /** Stores of the running month only: earlier months are history and never re-routed. */
    function monoRulesSummary() {
        const { year, month } = runningMonth();
        const bucket = appData[year]?.[month];
        if (!bucket?.initialized) return [];
        return summarizeMerchants([{ expenses: bucket.expenses, ignored: bucket.monoIgnored, running: true }]);
    }

    async function openMonoRules() {
        if (!currentUser) return;
        document.getElementById('mono-rules-modal')?.classList.add('active');
        monoRulesQuery = '';
        const search = document.getElementById('mono-rules-search');
        if (search) search.value = '';
        monoRulesLoading = true;
        renderMonoRules();
        try {
            const response = await apiFetch(`/api/monobank/rules?userId=${encodeURIComponent(currentUser.id)}`);
            if (response.status === 401) {
                logout();
                return;
            }
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                monoRules = Array.isArray(data.rules) ? data.rules : [];
                monoRulesPending = Array.isArray(data.pending) ? data.pending : [];
            }
        } catch (e) {
            /* rendered from what we have */
        }
        monoRulesLoading = false;
        renderMonoRules();
    }

    function closeMonoRules(event) {
        if (event && event.target?.id !== 'mono-rules-modal' && !event.target?.closest?.('.btn-close-modal, .btn-modal-done')) return;
        document.getElementById('mono-rules-modal')?.classList.remove('active');
    }

    function filterMonoRules(value) {
        monoRulesQuery = String(value || '').trim().toLowerCase();
        renderMonoRules();
    }

    function monoRuleChip(match, name, rule) {
        const tone = rule ? (rule.target === IGNORED_TARGET ? 'is-ignored' : '') : 'is-empty';
        const label = rule ? categoryNameByKey(rule.target) : 'Обрати категорію';
        return `
            <button type="button" class="mr-chip ${tone}" data-action="openMonoRulePicker" data-args="${escapeAttr(JSON.stringify([match, name]))}">
                <span>${escapeHtml(label)}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>`;
    }

    function renderMonoRules() {
        const body = document.getElementById('mono-rules-body');
        if (!body) return;
        const rules = new Map(monoRules.filter((rule) => rule.kind === 'merchant').map((rule) => [rule.match, rule]));
        const rows = monoRulesSummary();
        // Stores known only from a rule (no purchases loaded yet) still belong in the list.
        rules.forEach((rule, key) => {
            if (!rows.some((row) => row.key === key)) rows.push({ key, name: rule.label || key, total: 0, count: 0, unassigned: 0 });
        });
        const search = document.getElementById('mono-rules-search');
        if (search) search.hidden = rows.length < 8;
        const visible = monoRulesQuery ? rows.filter((row) => row.name.toLowerCase().includes(monoRulesQuery)) : rows;

        if (monoRulesLoading && !rows.length) {
            body.innerHTML = '<div class="mr-empty">Завантаження…</div>';
        } else if (!rows.length) {
            body.innerHTML = `
                <div class="mr-empty">
                    <div class="mr-empty-title">Цього місяця ще немає покупок з Монобанку</div>
                    Щойно з’являться покупки цього місяця, тут буде список магазинів — і ви вирішите, у які категорії йдуть їхні покупки.
                </div>`;
        } else if (!visible.length) {
            body.innerHTML = '<div class="mr-empty">Нічого не знайдено</div>';
        } else {
            const needs = (row) => row.unassigned > 0 && !rules.has(row.key);
            body.innerHTML = `
                <p class="mr-section-hint">Магазини з покупками цього місяця. Призначте категорію — покупки магазину в цьому місяці й нові підуть туди. Новий магазин спершу з’явиться в «Нерозподілене».</p>
                ${visible.map((row) => `
                    <div class="mr-group${needs(row) ? ' needs-attention' : ''}">
                        <div class="mr-group-row">
                            <div class="mr-group-info">
                                <div class="mr-group-name"><span class="mr-merchant-name">${escapeHtml(row.name)}</span>${needs(row) ? `<span class="mr-badge">${row.unassigned} без категорії</span>` : ''}</div>
                                <div class="mr-group-meta tabular">${row.count ? `${row.count} ${pluralUk(row.count, 'покупка', 'покупки', 'покупок')} · ${formatMoney(row.total)} ₴` : 'цього місяця покупок ще не було'}</div>
                            </div>
                            ${monoRuleChip(row.key, row.name, rules.get(row.key))}
                        </div>
                    </div>`).join('')}`;
        }

        const pendingBox = document.getElementById('mono-rules-pending');
        const count = pendingCount(monoRulesPending);
        pendingBox.hidden = count === 0;
        if (count) {
            document.getElementById('mono-rules-pending-text').textContent =
                `${count} ${pluralUk(count, 'операція', 'операції', 'операцій')} цього місяця ще не ${pluralUk(count, 'розкладена', 'розкладені', 'розкладені')} за правилами`;
        }
    }

    /** Lays out the running month by the rules (e.g. the old Monobank categories). */
    async function applyMonoRulesPending() {
        const months = runningMonthReroute();
        const count = pendingCount(monoRulesPending);
        if (!months.length || !count) return;
        const button = document.getElementById('mono-rules-pending-btn');
        if (button) button.disabled = true;
        const data = await postMonoRules({ reroute: months });
        if (button) button.disabled = false;
        if (!data) return;
        showSaveStatus(`Розкладено ${count} ${pluralUk(count, 'операцію', 'операції', 'операцій')}`, { tone: 'info', autoHideMs: 3000 });
        if (document.getElementById('mono-rules-modal')?.classList.contains('active')) renderMonoRules();
    }

    function mergeMonobankIncomes(year, monthIndex, accountId, incoming) {
        if (!appData[year]) appData[year] = {};
        if (!appData[year][monthIndex]) appData[year][monthIndex] = { initialized: true, incomes: [], expenses: [] };
        const bucket = appData[year][monthIndex];
        const kept = (bucket.incomes || []).filter((inc) => !(inc?.source === 'monobank' && inc.accountId === accountId));
        const added = (incoming || []).map((item) => ({
            id: item.monoId || item.id || newId(),
            name: item.name || 'Дохід',
            amount: Number(item.amount) || 0,
            currency: 'UAH',
            source: 'monobank',
            monoId: item.monoId || item.id,
            accountId,
            time: item.time,
        }));
        bucket.incomes = [...kept, ...added];
        if (year === currentYear && monthIndex === currentMonth) {
            const editing = document.getElementById('incomes-container')?.contains(document.activeElement);
            if (!editing) {
                renderIncomes();
                convertCurrency();
            }
        }
    }

    const MONO_SYNC_TEXT = 'Синхронізація карток';
    const MONO_SYNC_DONE = 'Синхронізацію завершено';

    function showMonoQueue(text, progress) {
        const el = document.getElementById('mono-queue');
        const label = document.getElementById('mono-queue-text');
        const bar = document.getElementById('mono-queue-bar');
        if (!el || !label) return;
        if (text) {
            label.textContent = text;
            el.classList.toggle('is-done', text === MONO_SYNC_DONE);
        }
        if (bar && typeof progress === 'number') {
            const value = Math.max(0, Math.min(1, progress));
            const floor = monoQueue && typeof monoQueue.progress === 'number' ? monoQueue.progress : 0;
            const next = Math.max(floor, value);
            if (monoQueue) monoQueue.progress = next;
            bar.style.transform = `scaleX(${next})`;
        }
        el.hidden = false;
        el.classList.add('active');
    }

    function hideMonoQueue() {
        const el = document.getElementById('mono-queue');
        const bar = document.getElementById('mono-queue-bar');
        if (!el) return;
        el.classList.remove('active', 'is-done');
        el.hidden = true;
        if (bar) bar.style.transform = 'scaleX(0)';
    }

    function failMonoQueue(text) {
        showMonoQueue(text);
        const gen = monoQueueGen;
        if (monoQueue?.timer) clearTimeout(monoQueue.timer);
        monoQueue = null;
        monobankBusy = false;
        renderMonobankButton();
        if (monobankLink?.accounts) renderMonobankCards(monobankLink.accounts);
        setTimeout(() => {
            if (gen === monoQueueGen) hideMonoQueue();
        }, 4000);
    }

    function showMonoSnack(event) {
        const host = document.getElementById('mono-snacks');
        if (!host) return;
        const card = document.createElement('div');
        card.className = 'mono-snack';
        card.setAttribute('role', 'status');

        const icon = document.createElement('div');
        icon.className = 'mono-snack-icon';
        icon.textContent = 'm';

        const body = document.createElement('div');
        body.className = 'mono-snack-body';
        const head = document.createElement('div');
        head.className = 'mono-snack-head';
        const app = document.createElement('span');
        app.textContent = 'monobank';
        const when = document.createElement('span');
        when.className = 'mono-snack-time';
        when.textContent = 'зараз';
        head.append(app, when);

        const text = document.createElement('div');
        text.className = 'mono-snack-text';
        const sum = document.createElement('span');
        const income = event?.kind === 'income';
        sum.className = income ? 'mono-snack-amount is-income' : 'mono-snack-amount';
        sum.textContent = `${income ? '+' : '−'}${formatMoney(Number(event?.amount) || 0)} ₴`;
        const name = document.createElement('span');
        name.className = 'mono-snack-name';
        name.textContent = event?.name || 'Операція';
        text.append(sum, name);

        body.append(head, text);
        const place = document.createElement('div');
        place.className = 'mono-snack-category';
        place.textContent = income
            ? 'У джерела доходу'
            : event?.unassigned
                ? 'У «Нерозподілене» — призначте категорію'
                : (event?.categoryName ? `У категорію «${event.categoryName}»` : '');
        if (place.textContent) body.append(place);

        card.append(icon, body);
        const close = () => {
            if (card.classList.contains('leaving')) return;
            card.classList.add('leaving');
            setTimeout(() => card.remove(), 260);
        };
        card.addEventListener('click', close);
        host.prepend(card);
        while (host.children.length > 3) host.lastElementChild.remove();
        let timer = setTimeout(close, 7000);
        card.addEventListener('mouseenter', () => clearTimeout(timer));
        card.addEventListener('mouseleave', () => {
            timer = setTimeout(close, 2500);
        });
    }

    /** A live webhook operation; returns the category it landed in (null when ignored or known). */
    function appendLocalMonoEvent(year, monthIndex, event) {
        if (!event?.monoId || !appData[year]?.[monthIndex]) return null;
        const bucket = appData[year][monthIndex];
        const list = bucket.expenses || [];
        const category = placeOperation(list, monoOperationItem(event), event.target, newId);
        if (!category) return null;
        bucket.expenses = list;
        refreshMonthAfterMono(year, monthIndex, category);
        return category;
    }

    function appendLocalMonoIncome(year, monthIndex, event) {
        if (!event?.monoId || !appData[year]?.[monthIndex]) return false;
        const bucket = appData[year][monthIndex];
        const list = bucket.incomes || [];
        const key = `${event.accountId || ''}:${event.monoId}`;
        const exists = list.some((inc) => `${inc.accountId || ''}:${inc.monoId || ''}` === key);
        if (exists) return false;
        list.push({
            id: event.monoId,
            monoId: event.monoId,
            accountId: event.accountId,
            name: event.name || 'Дохід',
            amount: Number(event.amount) || 0,
            currency: 'UAH',
            source: 'monobank',
            time: event.time,
        });
        bucket.incomes = list;
        if (year === currentYear && monthIndex === currentMonth) {
            const editing = document.getElementById('incomes-container')?.contains(document.activeElement);
            if (!editing) {
                renderIncomes();
                convertCurrency();
            }
        }
        return true;
    }

    async function pullMonoLive() {
        if (!currentUser || !monobankLink?.connected || monoQueue) return;
        const monthData = appData[currentYear]?.[currentMonth];
        if (!monthData?.initialized) return;
        try {
            const response = await apiFetch(
                `/api/monobank/live?userId=${encodeURIComponent(currentUser.id)}&year=${currentYear}&month=${currentMonth}`
            );
            if (response.status === 401) return;
            const data = await response.json().catch(() => ({}));
            const events = Array.isArray(data.events) ? data.events : [];
            if (!events.length) return;
            events.forEach((event) => {
                if (event.kind === 'income') {
                    appendLocalMonoIncome(currentYear, currentMonth, event);
                    showMonoSnack(event);
                    return;
                }
                if (event.target === IGNORED_TARGET) return;
                const landed = appendLocalMonoEvent(currentYear, currentMonth, event);
                if (landed) showMonoSnack({ ...event, categoryName: landed.name, unassigned: isUnassigned(landed) });
            });
            if (typeof data.serverTime === 'number' && appData[currentYear]?.[currentMonth]) {
                appData[currentYear][currentMonth].monoSyncedAt = data.serverTime;
            }
            await apiFetch('/api/monobank/live/ack', {
                method: 'POST',
                body: JSON.stringify({
                    userId: currentUser.id,
                    events: events.map((event) => ({ accountId: event.accountId, monoId: event.monoId })),
                }),
            });
        } catch {
            /* the next poll retries */
        }
    }

    function startMonoLiveWatch() {
        if (!startMonoLiveWatch.listening) {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') pullMonoLive();
            });
            startMonoLiveWatch.listening = true;
        }
        if (monoLiveTimer) clearInterval(monoLiveTimer);
        monoLiveTimer = setInterval(() => {
            if (document.visibilityState === 'visible') pullMonoLive();
        }, 30000);
        pullMonoLive();
    }

    function stopMonoLiveWatch() {
        if (monoLiveTimer) clearInterval(monoLiveTimer);
        monoLiveTimer = null;
        document.getElementById('mono-snacks')?.replaceChildren();
    }

    function stopMonoQueue() {
        monoQueueGen += 1;
        if (monoQueue?.timer) clearTimeout(monoQueue.timer);
        monoQueue = null;
        monobankBusy = false;
        hideMonoQueue();
        renderMonobankButton();
        if (monobankLink?.accounts) renderMonobankCards(monobankLink.accounts);
    }

    function waitMonoProgress(seconds, from, to, text = MONO_SYNC_TEXT) {
        const start = Date.now();
        const span = Math.max(1, seconds) * 1000;
        showMonoQueue(text, from);
        return new Promise((resolve) => {
            const tick = () => {
                if (!monoQueue) return resolve(false);
                const t = Math.min(1, (Date.now() - start) / span);
                showMonoQueue(null, from + (to - from) * t);
                if (t >= 1) return resolve(true);
                monoQueue.timer = setTimeout(tick, 100);
            };
            tick();
        });
    }

    async function persistMonoMonth(year, monthIndex) {
        if (year === currentYear && monthIndex === currentMonth) await saveData(true);
        else await enqueueSave(year, monthIndex);
    }

    /** Joins statement pages; the inclusive page cursor can repeat items at the boundary second. */
    function combineMonoPages(pages) {
        const seen = new Set();
        const fresh = (item) => {
            const key = String(item?.monoId || item?.id || '');
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        };
        const expenses = [];
        const incomes = [];
        pages.forEach((page) => {
            expenses.push(...page.expenses.filter(fresh));
            incomes.push(...page.incomes.filter(fresh));
        });
        return { expenses, incomes };
    }

    async function runMonoQueue(year, monthIndex, accountIds) {
        const gen = ++monoQueueGen;
        if (monoQueue?.timer) clearTimeout(monoQueue.timer);
        // pages: earlier pages of the current card's statement (Monobank sends 500 items per call).
        monoQueue = { year, monthIndex, accountIds, index: 0, timer: null, progress: 0, pageTo: null, pages: [] };
        monobankBusy = true;
        renderMonobankButton();
        if (monobankLink?.accounts) renderMonobankCards(monobankLink.accounts);
        const total = accountIds.length;
        const still = () => monoQueue && gen === monoQueueGen;
        showMonoQueue(MONO_SYNC_TEXT, 0);

        while (still() && monoQueue.index < total) {
            const accountId = monoQueue.accountIds[monoQueue.index];
            showMonoQueue(MONO_SYNC_TEXT, monoQueue.index / total);
            let data = {};
            let response;
            try {
                response = await apiFetch('/api/monobank/import', {
                    method: 'POST',
                    body: JSON.stringify({
                        userId: currentUser.id,
                        year,
                        month: monthIndex + 1,
                        accountId,
                        ...(monoQueue.pageTo != null ? { to: monoQueue.pageTo } : {}),
                    }),
                });
                data = await response.json().catch(() => ({}));
            } catch {
                if (!still()) return;
                failMonoQueue("Не вдалося з'єднатися із сервером.");
                return;
            }
            if (!still()) return;
            if (response.status === 401) {
                stopMonoQueue();
                logout();
                return;
            }
            if (response.status === 429) {
                const wait = Math.max(1, Number(data.retryAfter) || 60);
                const from = monoQueue.index / total;
                const ready = await waitMonoProgress(wait, from, from + 0.85 / total);
                if (!ready) return;
                continue;
            }
            if (!response.ok) {
                failMonoQueue(data.error || 'Не вдалося підтягнути виписку');
                return;
            }

            monoQueue.pages.push({ expenses: data.expenses || [], incomes: data.incomes || [] });
            if (typeof data.nextTo === 'number') {
                // More of this card's month is left: fetch the next (older) page after Monobank's pause.
                monoQueue.pageTo = data.nextTo;
                const from = monoQueue.index / total;
                const wait = Math.max(1, Number(data.retryAfter) || 60);
                const ready = await waitMonoProgress(wait, from, from + 0.85 / total);
                if (!ready) return;
                continue;
            }
            const pages = combineMonoPages(monoQueue.pages);
            monoQueue.pages = [];
            monoQueue.pageTo = null;

            const pulledId = data.accountId || accountId;
            mergeMonobankCard(year, monthIndex, pulledId, pages.expenses);
            mergeMonobankIncomes(year, monthIndex, pulledId, pages.incomes);
            await persistMonoMonth(year, monthIndex);
            if (!still()) return;
            if (year === currentYear && monthIndex === currentMonth && monobankLink) {
                const imported = new Set(monobankLink.importedAccountIds || []);
                imported.add(pulledId);
                monobankLink.importedAccountIds = [...imported];
            }
            monoQueue.index += 1;
            if (monoQueue.index < total) {
                const done = monoQueue.index;
                const wait = Math.max(1, Number(data.retryAfter) || 60);
                const ready = await waitMonoProgress(wait, done / total, (done + 1) / total);
                if (!ready) return;
            } else {
                const ready = await waitMonoProgress(3, 1, 1, MONO_SYNC_DONE);
                if (!ready) return;
            }
        }
        if (!still()) return;
        if (monoQueue?.timer) clearTimeout(monoQueue.timer);
        monoQueue = null;
        monobankBusy = false;
        hideMonoQueue();
        renderMonobankButton();
        if (monobankLink?.accounts) renderMonobankCards(monobankLink.accounts);
    }

    function onMonobankClick() {
        if (!currentUser || monobankBusy || monoQueue) return;
        const monthData = appData[currentYear]?.[currentMonth];
        if (!monthData?.initialized) return;
        if (!monobankLink?.connected) {
            openMonobankModal();
            return;
        }
        const selected = selectedAccountIds();
        if (!selected.length) {
            openMonobankModal();
            const err = document.getElementById('mono-cards-error');
            if (err) err.textContent = 'Оберіть хоча б одну картку';
            return;
        }
        const imported = new Set(monobankLink.importedAccountIds || []);
        const pending = selected.filter((id) => !imported.has(id));
        runMonoQueue(currentYear, currentMonth, pending.length ? pending : selected);
    }

    async function connectMonobank() {
        if (!currentUser || monobankBusy) return;
        const input = document.getElementById('mono-token-input');
        const err = document.getElementById('mono-form-error');
        const token = (input?.value || '').trim();
        if (!token) {
            if (err) err.textContent = 'Вставте токен з api.monobank.ua';
            return;
        }
        if (err) err.textContent = '';
        monobankBusy = true;
        renderMonobankButton();
        try {
            const response = await apiFetch('/api/monobank/connect', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, token }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) {
                if (err) err.textContent = data.error || 'Не вдалося підключити Монобанк';
                return;
            }
            if (input) input.value = '';
            monobankLink = {
                connected: true,
                clientName: data.clientName || '',
                maskedPan: data.maskedPan || '',
                accountId: data.accountId || '',
                accountIds: Array.isArray(data.accountIds) ? data.accountIds : (data.accountId ? [data.accountId] : []),
                importedAccountIds: [],
                accounts: data.accounts || [],
            };
            renderMonobankCards(data.accounts || []);
            syncMonobankModal();
            renderMonobankButton();
        } catch {
            if (err) err.textContent = "Не вдалося з'єднатися із сервером.";
        } finally {
            monobankBusy = false;
            renderMonobankButton();
        }
    }

    function renderMonobankCards(accounts) {
        const block = document.getElementById('mono-cards-block');
        const list = document.getElementById('mono-card-list');
        if (!block || !list) return;
        if (!accounts?.length) {
            block.hidden = true;
            list.innerHTML = '';
            return;
        }
        block.hidden = false;
        const selectedIds = new Set(selectedAccountIds());
        const locked = Boolean(monoQueue);
        list.innerHTML = accounts.map((account) => {
            const selected = selectedIds.has(account.id);
            // Accounts without a card number (ФОП) differ only by IBAN.
            const iban = !account.maskedPan && account.iban ? account.iban.replace(/(.{4})(?=.)/g, '$1 ') : '';
            return `<button type="button" class="mono-card-option${selected ? ' is-selected' : ''}" data-action="toggleMonobankAccount" data-args="${escapeAttr(JSON.stringify([account.id]))}" ${locked ? 'disabled' : ''}>
                <span class="mono-card-text">
                    <span class="mono-card-label">${escapeHtml(account.label || account.maskedPan || 'Картка')}</span>
                    ${iban ? `<small class="mono-card-iban">${escapeHtml(iban)}</small>` : ''}
                </span>
                <span>${selected ? 'Обрано' : ''}</span>
            </button>`;
        }).join('');
    }

    async function loadMonobankAccounts() {
        if (!currentUser || !monobankLink?.connected) return;
        if (monobankLink.accounts?.length) {
            renderMonobankCards(monobankLink.accounts);
            return;
        }
        const err = document.getElementById('mono-cards-error');
        if (err) err.textContent = '';
        try {
            const response = await apiFetch(`/api/monobank/accounts?userId=${encodeURIComponent(currentUser.id)}`);
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) {
                if (err) err.textContent = data.error || 'Не вдалося отримати картки';
                return;
            }
            if (Array.isArray(data.accountIds) && data.accountIds.length) monobankLink.accountIds = data.accountIds;
            if (data.accountId) monobankLink.accountId = data.accountId;
            monobankLink.accounts = data.accounts || [];
            syncMonobankModal();
            renderMonobankCards(monobankLink.accounts);
        } catch {
            if (err) err.textContent = "Не вдалося з'єднатися із сервером.";
        }
    }

    async function toggleMonobankAccount(accountId) {
        if (!currentUser || !accountId || !monobankLink || monoQueue) return;
        const err = document.getElementById('mono-cards-error');
        if (err) err.textContent = '';
        const current = selectedAccountIds();
        const next = current.includes(accountId)
            ? current.filter((id) => id !== accountId)
            : [...current, accountId];
        if (!next.length) {
            if (err) err.textContent = 'Залиште хоча б одну картку';
            return;
        }
        try {
            const response = await apiFetch('/api/monobank/account', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id, accountIds: next }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok) {
                if (err) err.textContent = data.error || 'Не вдалося змінити картки';
                return;
            }
            monobankLink.accountIds = Array.isArray(data.accountIds) ? data.accountIds : next;
            monobankLink.accountId = data.accountId || monobankLink.accountIds[0] || '';
            monobankLink.maskedPan = data.maskedPan || monobankLink.maskedPan;
            syncMonobankModal();
            renderMonobankCards(monobankLink.accounts || []);
            renderMonobankButton();
        } catch {
            if (err) err.textContent = "Не вдалося з'єднатися із сервером.";
        }
    }

    function disconnectMonobank() {
        if (!currentUser) return;
        showConfirm('Відключити Монобанк', 'Токен буде видалено з цього профілю. Уже імпортовані категорії залишаться.', async () => {
            try {
                const response = await apiFetch('/api/monobank/connect', {
                    method: 'DELETE',
                    body: JSON.stringify({ userId: currentUser.id }),
                });
                if (response.status === 401) {
                    logout();
                    return;
                }
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    alert(data.error || 'Не вдалося відключити Монобанк');
                    return;
                }
                monobankLink = null;
                stopMonoQueue();
                syncMonobankModal();
                renderMonobankButton();
                closeMonobankModal();
            } catch {
                alert("Не вдалося з'єднатися із сервером.");
            }
        }, { confirm: 'Відключити', cancel: 'Назад' });
    }

    let telegramStatusTimer = null;
    let telegramLinkCode = '';

    function stopTelegramStatusPoll() {
        if (!telegramStatusTimer) return;
        clearInterval(telegramStatusTimer);
        telegramStatusTimer = null;
    }

    function closeTelegramModal(event) {
        if (event && event.target?.id !== 'telegram-modal' && !event.target?.closest?.('.btn-close-modal')) return;
        stopTelegramStatusPoll();
        document.getElementById('telegram-modal')?.classList.remove('active');
    }

    async function refreshTelegramModal() {
        const status = document.getElementById('telegram-status-text');
        const error = document.getElementById('telegram-form-error');
        const connect = document.getElementById('btn-telegram-connect');
        const disconnect = document.getElementById('btn-telegram-disconnect');
        const codeBlock = document.getElementById('telegram-code-block');
        const codeEl = document.getElementById('telegram-link-code');
        if (!status || !currentUser) return;
        if (error) error.textContent = '';
        try {
            const response = await apiFetch(`/api/telegram/status?userId=${encodeURIComponent(currentUser.id)}`);
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                logout();
                return;
            }
            telegramLinkCode = data.code || '';
            if (codeEl) codeEl.textContent = telegramLinkCode || '—';
            if (codeBlock) codeBlock.hidden = !telegramLinkCode;
            if (!data.configured) {
                status.textContent = 'Бот ще не налаштований на сервері. Ліміти на картках уже працюють, сповіщення ввімкнуться після підключення бота.';
                if (connect) connect.hidden = true;
                if (disconnect) disconnect.hidden = true;
                return;
            }
            if (connect) connect.hidden = false;
            if (data.connected) {
                status.textContent = 'Підключено. Бот напише один раз, коли категорія вперше вийде за ліміт.';
                if (disconnect) disconnect.hidden = false;
                stopTelegramStatusPoll();
                return;
            }
            status.textContent = 'Відкрийте бота, натисніть «Старт» і надішліть код нижче.';
            if (disconnect) disconnect.hidden = true;
        } catch {
            if (error) error.textContent = "Не вдалося з'єднатися із сервером.";
        }
    }

    async function copyTelegramLinkCode() {
        if (!telegramLinkCode) return;
        const button = document.getElementById('btn-telegram-copy');
        try {
            await navigator.clipboard.writeText(telegramLinkCode);
            if (button) {
                const previous = button.textContent;
                button.textContent = 'Скопійовано';
                setTimeout(() => {
                    if (button.textContent === 'Скопійовано') button.textContent = previous;
                }, 1500);
            }
        } catch {
            const error = document.getElementById('telegram-form-error');
            if (error) error.textContent = 'Не вдалося скопіювати код';
        }
    }

    function openTelegramModal() {
        if (!currentUser) return;
        document.getElementById('telegram-modal')?.classList.add('active');
        refreshTelegramModal();
        stopTelegramStatusPoll();
        telegramStatusTimer = setInterval(refreshTelegramModal, 2000);
        setTimeout(stopTelegramStatusPoll, 60000);
    }

    async function connectTelegram() {
        if (!currentUser) return;
        const error = document.getElementById('telegram-form-error');
        if (error) error.textContent = '';
        try {
            const response = await apiFetch('/api/telegram/connect', {
                method: 'POST',
                body: JSON.stringify({ userId: currentUser.id }),
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) {
                logout();
                return;
            }
            if (!response.ok || !data.url) {
                if (error) error.textContent = data.error || 'Не вдалося відкрити бота';
                return;
            }
            if (data.code) {
                telegramLinkCode = data.code;
                const codeEl = document.getElementById('telegram-link-code');
                const codeBlock = document.getElementById('telegram-code-block');
                if (codeEl) codeEl.textContent = data.code;
                if (codeBlock) codeBlock.hidden = false;
            }
            window.open(data.url, '_blank', 'noopener');
        } catch {
            if (error) error.textContent = "Не вдалося з'єднатися із сервером.";
        }
    }

    function disconnectTelegram() {
        if (!currentUser) return;
        showConfirm('Відключити Telegram', 'Бот більше не писатиме про ліміти цього профілю.', async () => {
            try {
                const response = await apiFetch('/api/telegram/connect', {
                    method: 'DELETE',
                    body: JSON.stringify({ userId: currentUser.id }),
                });
                if (response.status === 401) {
                    logout();
                    return;
                }
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    alert(data.error || 'Не вдалося відключити Telegram');
                    return;
                }
                refreshTelegramModal();
            } catch {
                alert("Не вдалося з'єднатися із сервером.");
            }
        }, { confirm: 'Відключити', cancel: 'Назад' });
    }

// Handlers for data-action / data-*-action markup (bind-ui.js). Also kept on window
// for the console and QA scripts.
const uiActions = {
  addCategory,
  addIncome,
  addInvoice,
  addSubItem,
  applyMonthData,
  applyUIForAccountType,
  buildBucketDropdownHtml,
  buildDropdownOptionsHtml,
  buildJarTypeDropdownHtml,
  calc502030,
  calcYearsToCapital,
  cancelAccountSelect,
  cancelOtp,
  changeYear,
  checkGrowthPromptButtonState,
  clearCurrentMonth,
  closeAiExportModal,
  closeAnalyticsModal,
  closeChangelogModal,
  closeConfirmModal,
  closeDebtsModal,
  closeEmployeeModal,
  closeEnvelopesModal,
  closeGrowthModal,
  closeInvoicesModal,
  closeModal,
  closeTelegramModal,
  closeMonobankModal,
  closeNewSupplierModal,
  closePayDebtModal,
  closePayrollModal,
  closeProfileSwitcher,
  closeScheduleModal,
  closeSerenityEasterEgg,
  closeSkryniaSwitcher,
  closeTransferModal,
  confirmAddSupplier,
  connectMonobank,
  connectTelegram,
  copyTelegramLinkCode,
  convertCurrency,
  copyAccountToClipboard,
  createNewDebt,
  createNewEnvelope,
  deleteCategory,
  deleteDebt,
  deleteEmployee,
  deleteEnvelope,
  deleteIncome,
  deleteInvoice,
  setInvoicePayment,
  updateInvoiceAmount,
  deleteProfile,
  deleteSubItem,
  undoLastDelete,
  disconnectMonobank,
  disconnectTelegram,
  enqueueSave,
  escapeAttr,
  escapeHtml,
  executeConfirm,
  executeDebtPayment,
  executeTransfer,
  fetchAvailableProfiles,
  fetchExchangeRate,
  filterSuppliers,
  filterInvoicesByAmount,
  flushSaveToServer,
  retryFailedSaves,
  openMonoMove,
  openMonoRulePicker,
  closeMonoPicker,
  pickMonoTarget,
  submitMonoPicker,
  openMonoRules,
  closeMonoRules,
  filterMonoRules,
  applyMonoRulesPending,
  formatMoney,
  formatNumberShort,
  formatYearsLabel,
  fpProgressBar,
  generateAiDataForMonth,
  generateAiFinancialPlanSection,
  generateAndCopyAiPrompt,
  generateAndCopyGrowthPrompt,
  generateIncomeSparklineHTML,
  generateInvoicesSparklineHTML,
  generatePayrollSparklineHTML,
  generateProfitSparklineHTML,
  generateScheduleMonths,
  generateSparklineHTML,
  get502030Actuals,
  get502030ActualsFromExpenses,
  getCategoryBudgetBucket,
  getCategoryTotal,
  getChoiceValues,
  getCushionBalanceUah,
  getFinancialPlan,
  getHistoricalCogs,
  getHistoricalDebtBalance,
  getHistoricalIncome,
  getHistoricalPayroll,
  getHistoricalProfit,
  getInvestmentJarsBalanceUah,
  getJarType,
  getJarTypeOptions,
  getLastInitializedData,
  getMonthIncomeUah,
  getTop3SubItems,
  handlePayrollDragEnd,
  handlePayrollDragLeave,
  handlePayrollDragOver,
  handlePayrollDragStart,
  handlePayrollDrop,
  handleScheduleDragEnd,
  handleScheduleDragLeave,
  handleScheduleDragOver,
  handleScheduleDragStart,
  handleScheduleDrop,
  hardDeleteDebt,
  hideCreateProfile,
  hideSkryniaHub,
  init,
  initChart,
  initNewJarTypeDropdown,
  initializeMonth,
  isDebtActiveInCurrentMonth,
  loadAuthStats,
  loadDataFromServer,
  logout,
  newId,
  nextGrowthStep,
  onMonobankClick,
  openAiExportModal,
  launchAiAnalytics,
  launchAiGrowth,
  launchAiAgent,
  openAiChat,
  closeAiChat,
  toggleAiChatExpand,
  sendAiChatMessage,
  sendAiSuggestion,
  toggleMonobankAccount,
  stopAiChat,
  startAiBriefing,
  resetAiChat,
  copyLastAiPrompt,
  openLlmSettings,
  closeLlmSettings,
  saveLlmSettingsFromForm,
  clearLlmSettingsFromForm,
  selectLlmProvider,
  selectLlmModel,
  syncAiEntryButtons,
  openAnalyticsModal,
  openChangelogModal,
  openDebtsModal,
  openEmployeeModal,
  openEnvelopesModal,
  openFamilyTree,
  openSkryniaModule,
  openYearTracks,
  closeFamilyTree,
  closeYearTracks,
  closeRunway,
  openRunway,
  openGrowthModal,
  openInvoicesModal,
  handleExpenseCardClick,
  openModal,
  openMonobankModal,
  openTelegramModal,
  openNewSupplierModal,
  openEditSupplierModal,
  deleteSupplier,
  openPayrollModal,
  openScheduleModal,
  openSerenityEasterEgg,
  openTransferModal,
  payDebt,
  performLogin,
  prevGrowthStep,
  renderAnalyticsChart,
  renderCalendar,
  renderChangelog,
  renderDebts,
  renderEnvelopes,
  renderExpenses,
  renderFinancialPlanBlock,
  renderIncomes,
  renderInvoices,
  renderModalItems,
  renderPayroll,
  renderScheduleModal,
  renderSuppliersDropdown,
  renderSuppliersTurnover,
  resendOtp,
  saveData,
  saveDataToServer,
  saveEmployee,
  selectEmpPayType,
  downloadPayrollPdfForEmployee,
  saveFinancialPlan,
  saveGlobalData,
  saveGrowthProfile,
  paintGrowthFinalButton,
  runGrowthAiFromModal,
  scheduleSaveToServer,
  selectAiExportType,
  selectCOGSType,
  selectCategoryBucket,
  selectCurrency,
  selectDebtCurrency,
  selectInvoicePayment,
  selectIncomeCurrency,
  selectJarTypeDropdown,
  selectMonth,
  selectNewJarType,
  selectProfileType,
  selectSupplier,
  selectTransferJar,
  sanitizeOtpInput,
  sendAuthOtp,
  setCategoryBudgetBucket,
  setChoiceValues,
  setJarType,
  showAccountSelect,
  showAuthScreen,
  showConfirm,
  showCreateProfile,
  showCreateProfileFromAuth,
  showError,
  showGrowthStep,
  showSkryniaHub,
  startOtpCountdown,
  switchInvoiceTab,
  switchProfile,
  syncGlobalDebtBalance,
  toggleChoice,
  toggleChoiceFromEl,
  toggleCategoryEssential,
  toggleEmployeePaid,
  toggleFinancialPlanSettings,
  togglePaidStatus,
  toggleProfileSwitcher,
  toggleRule502030Details,
  toggleSchedulePaid,
  toggleSkryniaSwitcher,
  toggleSerenityEasterEgg,
  toggleSupplierDropdown,
  uahToUsd,
  updateAll,
  updateBusinessHours,
  updateCOGS,
  toggleLimitView,
  previewModalLimit,
  saveModalLimit,
  setLimitMode,
  clearModalLimit,
  updateCategoryName,
  updateChart,
  updateDebtsDisplay,
  updateDebtRemaining,
  updateDebtTotal,
  updateFinancialPlanField,
  updateGlobalScheduleRemaining,
  updateIncome,
  updateJarBalance,
  updateJarGoal,
  updateMainJarBalance,
  updateProfileSwitcherUI,
  updateSkryniaSwitcherUI,
  updateSavingsDisplay,
  updateScheduleAmount,
  updateSubItemAmount,
  updateSubItemName,
  updateTopSubItemBadges,
  usdToUah,
  verifyAuthOtp
};
registerUiActions(uiActions);
Object.assign(window, uiActions);

document.addEventListener('DOMContentLoaded', () => {
  init();
});

