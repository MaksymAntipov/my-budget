import {
  escapeHtml,
  escapeAttr,
  newId,
  jsId,
  formatMoney,
  formatNumberShort,
} from './utils.js';
import { API_URL } from './config.js';

// ==========================================
    // НОВИНИ / CHANGELOG
    // ==========================================
    const changelogData = [  
        {
            date: "30 Березня 2026",
            version: "v1.1.4",
            changes: [
                "Доданий графік погашення зобов'язань: тепер можна візуально відстежувати прогрес по кожному боргу та планувати майбутні платежі.",
                "Доопрацювання бізнес кабінету, доданий фактичний баланс"
            ]
        },
    
        {
            date: "29 Березня 2026",
            version: "v1.1.3",
            changes: [
                "Правки по UI",
                "Оптимізація роботи з даними та швидкодії застосунку"
            ]
        },
        {
            date: "27 Березня 2026",
            version: "v1.1.2",
            changes: [
                "Платежі по боргах тепер зручно вносити в оригінальній валюті ($ або ₴). У бюджет сума конвертується автоматично за курсом НБУ.",
                "Оновлено дизайн скролбарів: тепер вони тонкі та стильні по всьому застосунку."
            ]
        },
        {
            date: "25 Березня 2026",
            version: "v1.1.1",
            changes: [
                "Додано віджет 'Залишок до оплати' для особистих профілів.",
                "Запущено можливість відмічати витрати як 'Оплачені' (✓)."
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
    let myChart = null;
    let analyticsChart = null; 
    let currentExchangeRate = 0;
    let currentIncomeUah = 0; 
    let activeCategoryId = null;
    let pendingConfirmAction = null; 
    let tempAuthData = null; 
    let otpTimer = null;
    let saveTimeout = null;
    let saveQueue = Promise.resolve();
    let availableProfiles = [];

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

    window.addEventListener('click', function() {
        document.querySelectorAll('.custom-dropdown').forEach(el => el.classList.remove('open'));
    });

    // ==========================================
    // 3. ІНІЦІАЛІЗАЦІЯ
    // ==========================================
    async function init() {
        fetchExchangeRate();
        initChart();
        
        // --- БЕЗПЕЧНЕ ГЛОБАЛЬНЕ БЛОКУВАННЯ СКРОЛУ ---
        // Замість спостереження за всім DOM (що "вішало" сторінку), 
        // стежимо тільки за самими модальними вікнами.
        const modals = document.querySelectorAll('.modal-overlay, .auth-glass-overlay');
        const observer = new MutationObserver(() => {
            const hasActiveModal = document.querySelector('.modal-overlay.active, .auth-glass-overlay.active') !== null;
            document.body.style.overflow = hasActiveModal ? 'hidden' : '';
        });
        
        modals.forEach(modal => {
            observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
        });
        // ----------------------------------------------

        document.addEventListener('click', closeProfileSwitcher);

        window.addEventListener('beforeunload', () => {
            if (currentUser && saveTimeout) {
                clearTimeout(saveTimeout);
                saveTimeout = null;
                // keepalive best-effort flush for debounced edits
                const year = currentYear;
                const month = currentMonth;
                const currentMonthData = appData[year]?.[month] || {};
                const jars = globalData.jars[currentUser.id] || [];
                const token = localStorage.getItem('budget_auth_token');
                if (!token) return;
                const payload = {
                    userId: currentUser.id,
                    year, month,
                    incomes: currentMonthData.incomes || [],
                    expenses: currentMonthData.expenses || expenses || [],
                    cogs: currentMonthData.cogs || { type: 'percent', value: 0 },
                    payroll: currentMonthData.payroll || [],
                    jars: jars.length > 0 ? jars : undefined,
                    debts: globalData.debts[currentUser.id] || [],
                    suppliers: globalData.suppliers[currentUser.id] || [],
                    invoices: currentMonthData.invoices || []
                };
                try {
                    fetch(`${API_URL}/api/data`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(payload),
                        keepalive: true
                    });
                } catch (e) {}
            }
        });

        const savedUserId = localStorage.getItem('budget_saved_user_id');
        const savedUserInfo = localStorage.getItem('budget_saved_user_info');
        const savedToken = localStorage.getItem('budget_auth_token');
        
        if (savedUserId && savedUserInfo && savedToken) {
            const user = JSON.parse(savedUserInfo);
            await performLogin(user);
        } else {
            if (savedUserId || savedUserInfo || savedToken) {
                localStorage.removeItem('budget_saved_user_id');
                localStorage.removeItem('budget_saved_user_info');
                localStorage.removeItem('budget_auth_token');
            }
            showAuthScreen();
        }
    }

    // ==========================================
    // 4. АВТОРИЗАЦІЯ ТА API
    // ==========================================
    function startOtpCountdown(btnId, seconds) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        
        btn.style.display = 'block'; 
        btn.disabled = true;
        let timeLeft = seconds;

        if (otpTimer) clearInterval(otpTimer);

        otpTimer = setInterval(() => {
            timeLeft--;
            btn.innerText = `Повторна відправка через ${timeLeft} с`;
            
            if (timeLeft <= 0) {
                clearInterval(otpTimer);
                btn.disabled = false;
                btn.innerText = 'Відправити повторно';
                document.getElementById('otp-subtitle').innerText = `Термін дії коду минув. Відправте новий.`;
            }
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
            return showError(errorDiv, 'Введіть коректный email');
        }

        try {
            btn.innerText = 'Відправка...';
            btn.disabled = true;

            const response = await fetch(`${API_URL}/api/auth/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 429 && (data.retryAfter || (data.error && data.error.includes('через')))) {
                    tempAuthData = payload;
                    document.getElementById('auth-overlay').classList.remove('active');
                    document.getElementById('create-profile-overlay').classList.remove('active');
                    
                    const seconds = Number(data.retryAfter) || parseInt((data.error.match(/\d+/) || [])[0], 10) || 300;
                    document.getElementById('otp-subtitle').innerText = `Код вже був відправлений на ${payload.email}. Він ще діє.`;
                    document.getElementById('otp-input').value = '';
                    document.getElementById('otp-error').style.display = 'none';
                    document.getElementById('otp-overlay').classList.add('active');
                    
                    startOtpCountdown('btn-otp-resend', seconds);
                } else {
                    showError(errorDiv, data.error || 'Помилка');
                }
                
                btn.innerText = 'Отримати код';
                btn.disabled = false;
            } else {
                tempAuthData = payload;
                document.getElementById('auth-overlay').classList.remove('active');
                document.getElementById('create-profile-overlay').classList.remove('active');
                
                document.getElementById('otp-subtitle').innerText = `Код відправлено на ${payload.email}`;
                document.getElementById('otp-input').value = '';
                document.getElementById('otp-error').style.display = 'none';
                document.getElementById('otp-overlay').classList.add('active');
                
                startOtpCountdown('btn-otp-resend', 300); 
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

            const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                
                if (data.token) {
                    localStorage.setItem('budget_auth_token', data.token);
                }

                if (data.users) {
                    availableProfiles = data.users;
                    localStorage.setItem('budget_available_profiles', JSON.stringify(availableProfiles));
                }

                if (data.users && data.users.length > 1) {
                    showAccountSelect(data.users);
                } else {
                    await performLogin(data.users ? data.users[0] : data.user);
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
                performLogin(u);
            };
            
            btn.onmouseover = () => { btn.style.transform = 'scale(1.02)'; btn.style.background = 'rgba(255,255,255,0.1)'; };
            btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.background = 'rgba(255,255,255,0.05)'; };
            
            list.appendChild(btn);
        });
        
        document.getElementById('account-select-overlay').classList.add('active');
    }

    function cancelAccountSelect() {
        document.getElementById('account-select-overlay').classList.remove('active');
        showAuthScreen();
    }

    function resendOtp() {
        if (tempAuthData) {
            sendAuthOtp(tempAuthData.isRegister);
        }
    }

    function cancelOtp() {
        if (otpTimer) clearInterval(otpTimer);
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

        const token = localStorage.getItem('budget_auth_token');
        if (!token) return availableProfiles;

        try {
            const response = await fetch(`${API_URL}/api/profiles`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
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

        const otherProfiles = availableProfiles.filter(p => p.id !== currentUser?.id);

        if (otherProfiles.length === 0) {
            badge.classList.remove('badge-type--switchable');
            badge.disabled = false;
            return;
        }

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
            btn.onclick = (e) => {
                e.stopPropagation();
                switchProfile(p);
            };
            dropdown.appendChild(btn);
        });
    }

    function toggleProfileSwitcher(e) {
        if (e) e.stopPropagation();
        if (availableProfiles.filter(p => p.id !== currentUser?.id).length === 0) return;
        document.getElementById('profile-switcher-dropdown').classList.toggle('open');
    }

    function closeProfileSwitcher() {
        const dropdown = document.getElementById('profile-switcher-dropdown');
        if (dropdown) dropdown.classList.remove('open');
    }

    async function switchProfile(user) {
        if (!user || !currentUser || user.id === currentUser.id) return;
        closeProfileSwitcher();
        await saveData(true);
        appData = {};
        expenses = [];
        await performLogin(user);
    }

async function performLogin(user) {
        currentUser = user;
        
        localStorage.setItem('budget_saved_user_id', user.id);
        localStorage.setItem('budget_saved_user_info', JSON.stringify(user));
        
        document.getElementById('current-user-name-display').innerText = `${user.name} ${user.surname}`;
        
        const color = appleColors[Math.floor(Math.random() * appleColors.length)];
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
    }

    function applyUIForAccountType() {
        const isBiz = currentUser && currentUser.account_type === 'business';
        
        const badge = document.getElementById('account-type-badge');
        badge.style.display = 'inline-flex';
        badge.innerHTML = (isBiz ? 'Бізнес' : 'Фіз. особа') + (availableProfiles.filter(p => p.id !== currentUser?.id).length > 0 ? ' <span style="opacity:0.7;font-size:9px;">▾</span>' : '');
        badge.className = isBiz ? 'badge-type badge-business' : 'badge-type';
        if (availableProfiles.filter(p => p.id !== currentUser?.id).length > 0) {
            badge.classList.add('badge-type--switchable');
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
        if(bHoursRow) bHoursRow.style.display = isBiz ? 'flex' : 'none';

        const jarTypeWrap = document.getElementById('new-jar-type-wrap');
        if (jarTypeWrap) jarTypeWrap.style.display = isBiz ? 'none' : 'block';

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

        if (isBiz) {
            document.getElementById('daily-limit-box').style.display = 'none';
        } else {
            document.getElementById('daily-limit-box').style.display = 'flex';
        }

        renderFinancialPlanBlock();
    }

    async function loadDataFromServer(userId) {
        try {
            const token = localStorage.getItem('budget_auth_token');
            const response = await fetch(`${API_URL}/api/data?userId=${userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();

            if (response.status === 401) {
                logout();
                return;
            }

            if (!response.ok) return console.error("Помилка завантаження:", data.error);

            if (!globalData.jars) globalData.jars = {};
            globalData.jars[userId] = data.jars || [];
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
            if (data.monthsData) {
                data.monthsData.forEach(row => {
                    if (!appData[row.year]) appData[row.year] = {};
                    
                    const parsedIncomes = JSON.parse(row.incomes_json || '[]');
                    const parsedExpenses = JSON.parse(row.expenses_json || '[]');
                    
                    const isCleared = parsedIncomes.length === 0 && parsedExpenses.length === 0;

                 appData[row.year][row.month] = {
                        initialized: (row.is_initialized === 1) && !isCleared,
                        incomes: parsedIncomes,
                        expenses: parsedExpenses,
                        cogs: JSON.parse(row.cogs_json || '{"type":"percent","value":0}'),
                        payroll: row.payroll_json ? JSON.parse(row.payroll_json) : []
                    };
                });
            }

            if (data.invoices) {
                data.invoices.forEach(inv => {
                    if (!appData[inv.year]) appData[inv.year] = {};
                    if (!appData[inv.year][inv.month]) {
                        appData[inv.year][inv.month] = { initialized: false, incomes: [], expenses: [], cogs: {type: 'percent', value: 0, businessHours: 8}, invoices: [] };
                    }
                    if (!appData[inv.year][inv.month].invoices) appData[inv.year][inv.month].invoices = [];
                    appData[inv.year][inv.month].invoices.push(inv);
                });
            }

            if (!appData[currentYear]) appData[currentYear] = {};
            if (!appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth] = { initialized: false, incomes: [], expenses: [], cogs: {type:'percent', value:0}, payroll: [] };
            }

            renderCalendar();
            applyMonthData();
            updateSavingsDisplay();
        } catch (e) {
            console.error("Помилка з'єднання з сервером під час завантаження даних", e);
        }
    }

async function flushSaveToServer(year, month) {
        if (!currentUser) return;

        const currentMonthData = appData[year]?.[month] || {};
        const jars = globalData.jars[currentUser.id] || [];
        const payload = {
            userId: currentUser.id,
            year, month,
            incomes: currentMonthData.incomes || [],
            expenses: currentMonthData.expenses || (year === currentYear && month === currentMonth ? expenses : []) || [],
            cogs: currentMonthData.cogs || {type: 'percent', value: 0},
            payroll: currentMonthData.payroll || [],
            // Never send empty jars — backend skips wipe, and UI always keeps a main jar.
            jars: jars.length > 0 ? jars : undefined,
            debts: globalData.debts[currentUser.id] || [],
            suppliers: globalData.suppliers[currentUser.id] || [],
            invoices: currentMonthData.invoices || []
        };

        try {
            const token = localStorage.getItem('budget_auth_token');
            const response = await fetch(`${API_URL}/api/data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (response.status === 401) {
                logout();
                return;
            }

            if (!response.ok) {
                const errData = await response.json();
                console.error("СЕРВЕР ВІДХИЛИВ ДАНІ:", errData);
                alert(`Помилка бази даних: ${errData.error}`);
            }
        } catch (e) {
            console.error("Помилка збереження на сервер:", e);
        }
    }

    function enqueueSave(year, month) {
        saveQueue = saveQueue
            .then(() => flushSaveToServer(year, month))
            .catch((e) => console.error("Помилка черги збереження:", e));
        return saveQueue;
    }

    function scheduleSaveToServer() {
        if (!currentUser) return;

        const year = currentYear;
        const month = currentMonth;

        if (saveTimeout) clearTimeout(saveTimeout);

        saveTimeout = setTimeout(() => {
            saveTimeout = null;
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
        currentUser = null;
        appData = {};
        availableProfiles = [];
        
        localStorage.removeItem('budget_saved_user_id');
        localStorage.removeItem('budget_saved_user_info');
        localStorage.removeItem('budget_auth_token');
        localStorage.removeItem('budget_available_profiles');
        
        closeProfileSwitcher();
        
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
            "Видалити акаунт та дані?", 
            "Всі ваші дані (доходи, витрати, конверти) будуть видалені із сервера назавжди. Цю дію неможливо скасувати. Ви впевнені?", 
            async () => {
                try {
                    const token = localStorage.getItem('budget_auth_token');
                    const response = await fetch(`${API_URL}/api/user`, {
                        method: 'DELETE',
                        headers: { 
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
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

    function initializeMonth(usePrev) {
        if (!appData[currentYear]) appData[currentYear] = {};
        
        if (usePrev) {
            const prev = getLastInitializedData();
            if (prev) {
                let copiedExpenses = JSON.parse(JSON.stringify(prev.data.expenses || []));
                
                copiedExpenses = copiedExpenses.filter(cat => cat.name !== "Погашення боргів" && !cat.isSavings);
                
                copiedExpenses.forEach(cat => {
                    cat.items.forEach(item => item.isPaid = false);
                });

                let copiedPayroll = [];
                if (prev.data.payroll) {
                    copiedPayroll = JSON.parse(JSON.stringify(prev.data.payroll));
                    // Обнуляємо годинник і гроші для нового місяця, залишаємо лише суть
                    copiedPayroll.forEach(emp => {
                        emp.hours = 0;
                        emp.bonus = 0;
                        emp.penalty = 0;
                        emp.advance = 0;
                        emp.paid_part = 0;
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
                
                appData[currentYear][currentMonth] = {
                    initialized: true,
                    incomes: JSON.parse(JSON.stringify(prev.data.incomes || [{ id: newId(), name: "Основний", amount: prev.data.usd || 0, currency: "USD" }])),
                    expenses: copiedExpenses,
                    cogs: JSON.parse(JSON.stringify(prev.data.cogs || {type:'percent', value:0})),
                    payroll: copiedPayroll // <-- ДОДАНО СЮДИ
                };
            }
        } else {
            appData[currentYear][currentMonth] = {
                initialized: true,
                incomes: [{id: newId(), name: "Основний", amount: 0, currency: "UAH"}],
                expenses: JSON.parse(JSON.stringify(defaultCategories)),
                cogs: {type: 'percent', value: 0},
                payroll: [] // Додали масив для чистого місяця
            };
        }
        
        renderCalendar(); 
        applyMonthData(); 
    }

    function clearCurrentMonth() {
        showConfirm("Очистити місяць", "Ви впевнені, що хочете повністю очистити дані за цей місяць? Дію неможливо скасувати.", () => {
            appData[currentYear][currentMonth] = { initialized: false, incomes: [], expenses: [], cogs: {type:'percent', value:0} };
            
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
            
            saveData();
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
        if (!appData[currentYear][currentMonth]) appData[currentYear][currentMonth] = { initialized: false, incomes: [], expenses: [] };
        renderCalendar();
        applyMonthData();
    }

    async function selectMonth(m, btnElement) {
        if (m === currentMonth) return;
        await saveData(true);
        currentMonth = m;
        if (!appData[currentYear][currentMonth]) appData[currentYear][currentMonth] = { initialized: false, incomes: [], expenses: [] };
        renderCalendar();
        applyMonthData();
        btnElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    function applyMonthData() {
        const data = appData[currentYear][currentMonth] || { initialized: false, incomes: [], expenses: [], cogs: {type:'percent', value:0} };
        
        if (data.initialized) {
            document.getElementById('main-dashboard').classList.remove('blurred');
            document.getElementById('init-overlay').classList.remove('active');
            
            if (!data.incomes) data.incomes = [{ id: newId(), name: "Основний", amount: data.usd || 0, currency: "USD" }];

            expenses = data.expenses || [];

if (!data.cogs) data.cogs = { type: 'percent', value: 0, businessHours: 8 };
            if (data.cogs.businessHours === undefined) data.cogs.businessHours = 8;
            
            // Безпечна перевірка, бо старі інпути ми замінили на модуль Інвойсів
            const cogsValEl = document.getElementById('cogs-value');
            if (cogsValEl) {
                cogsValEl.value = data.cogs.value || '';
                const bHoursInput = document.getElementById('business-hours-input');
                if(bHoursInput) bHoursInput.value = data.cogs.businessHours;
                document.getElementById('cogs-type-display').innerText = data.cogs.type === 'percent' ? '%' : 'Фікс (₴)';
            }
            if (!appData[currentYear][currentMonth].payroll) appData[currentYear][currentMonth].payroll = [];
            renderPayroll();
            renderIncomes();
            renderExpenses(); 
            convertCurrency(); 
        } else {
            document.getElementById('main-dashboard').classList.add('blurred');
            document.getElementById('init-overlay').classList.add('active');
            
            if(data.incomes) data.incomes = [];
            expenses = [];
            renderIncomes();
            renderExpenses(); 
            currentIncomeUah = 0;
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
        savings: 'Збереж. 20%',
    };

    function getJarTypeOptions() {
        return Object.entries(JAR_TYPE_LABELS).map(([value, label]) => ({ value, label }));
    }

    function buildDropdownOptionsHtml(items, selectedValue, onclickBuilder) {
        return items.map(item => `
            <div class="custom-dropdown-option ${selectedValue === item.value ? 'selected' : ''}" onclick="${onclickBuilder(item.value)}">
                <span class="option-check">${selectedValue === item.value ? '✓' : ''}</span>
                <span class="option-label">${escapeHtml(item.label)}</span>
            </div>
        `).join('');
    }

    function buildJarTypeDropdownHtml(jarId, selectedValue, sizeClass) {
        const selectedLabel = JAR_TYPE_LABELS[selectedValue] || JAR_TYPE_LABELS.regular;
        const cls = sizeClass === 'compact' ? 'compact' : 'compact-xs';
        return `
            <div class="custom-dropdown ${cls}" onclick="event.stopPropagation(); this.classList.toggle('open')">
                <div class="custom-dropdown-selected">${escapeHtml(selectedLabel)}</div>
                <div class="custom-dropdown-options">
                    ${buildDropdownOptionsHtml(getJarTypeOptions(), selectedValue, (val) => `selectJarTypeDropdown(event, ${jsId(jarId)}, '${val}')`)}
                </div>
            </div>
        `;
    }

    function buildBucketDropdownHtml(categoryId, selectedValue, disabled) {
        if (disabled) {
            return `<div class="custom-dropdown compact-xs" style="opacity: 0.7; pointer-events: none;">
                <div class="custom-dropdown-selected">${escapeHtml(BUDGET_BUCKET_LABELS[selectedValue] || BUDGET_BUCKET_LABELS.savings)}</div>
            </div>`;
        }
        const items = Object.entries(BUDGET_BUCKET_LABELS).map(([value, label]) => ({ value, label }));
        return `
            <div class="custom-dropdown compact-xs" onclick="event.stopPropagation(); this.classList.toggle('open')">
                <div class="custom-dropdown-selected">${escapeHtml(BUDGET_BUCKET_LABELS[selectedValue] || BUDGET_BUCKET_LABELS.needs)}</div>
                <div class="custom-dropdown-options">
                    ${buildDropdownOptionsHtml(items, selectedValue, (val) => `selectCategoryBucket(event, ${jsId(categoryId)}, '${val}')`)}
                </div>
            </div>
        `;
    }

    function initNewJarTypeDropdown() {
        const optionsEl = document.getElementById('new-jar-type-options');
        if (!optionsEl) return;
        const current = document.getElementById('new-jar-type-value')?.value || 'regular';
        optionsEl.innerHTML = buildDropdownOptionsHtml(getJarTypeOptions(), current, (val) => `selectNewJarType(event, '${val}')`);
    }

    function selectNewJarType(event, value) {
        event.stopPropagation();
        const valueEl = document.getElementById('new-jar-type-value');
        const displayEl = document.getElementById('new-jar-type-display');
        if (valueEl) valueEl.value = value;
        if (displayEl) displayEl.innerText = JAR_TYPE_LABELS[value] || JAR_TYPE_LABELS.regular;
        initNewJarTypeDropdown();
        event.target.closest('.custom-dropdown')?.classList.remove('open');
    }

    function selectJarTypeDropdown(event, jarId, value) {
        event.stopPropagation();
        setJarType(jarId, value);
        event.target.closest('.custom-dropdown')?.classList.remove('open');
    }

    function selectCategoryBucket(event, categoryId, bucket) {
        event.stopPropagation();
        setCategoryBudgetBucket(categoryId, bucket);
        event.target.closest('.custom-dropdown')?.classList.remove('open');
    }

    function calc502030(incomeUah) {
        return {
            needs: incomeUah * 0.5,
            wants: incomeUah * 0.3,
            savings: incomeUah * 0.2,
        };
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
            const token = localStorage.getItem('budget_auth_token');
            await fetch(`${API_URL}/api/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ userId: currentUser.id, growthProfile: profile }),
            });
        } catch (e) {
            console.error('Помилка збереження фінплану', e);
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
        return 'needs';
    }

    function setCategoryBudgetBucket(categoryId, bucket) {
        const cat = expenses.find(e => e.id === categoryId);
        if (!cat) return;
        cat.budgetBucket = bucket;
        saveData();
        renderExpenses();
        renderFinancialPlanBlock();
    }

    function get502030Actuals() {
        return get502030ActualsFromExpenses(expenses);
    }

    function get502030ActualsFromExpenses(expenseList) {
        const actuals = { needs: 0, wants: 0, savings: 0 };
        (expenseList || []).forEach(exp => {
            const bucket = getCategoryBudgetBucket(exp);
            actuals[bucket] += getCategoryTotal(exp);
        });
        return actuals;
    }

    function getCushionBalanceUah() {
        const jars = globalData.jars[currentUser?.id] || [];
        return jars.filter(j => getJarType(j) === 'emergency').reduce((sum, j) => sum + (parseFloat(j.balance) || 0), 0);
    }

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
                <div class="rule-502030-empty">Додайте доходи, щоб побачити рекомендації 50/30/20 та довгострокові цілі.</div>
            `;
            return;
        }

        const amounts = calc502030(income);
        const actuals = get502030Actuals();
        const amountKeys = ['needs', 'wants', 'savings'];

        const rowsHtml = RULE_502030_ITEMS.map((item, i) => {
            const rec = amounts[amountKeys[i]];
            const act = actuals[item.bucket];
            const delta = act - rec;
            const deltaHtml = act > 0
                ? `<div class="fp-compare-row"><span style="color:var(--text-tertiary)">факт: ${formatMoney(act)} ₴</span><span class="${delta > 0 ? 'fp-over' : 'fp-ok'}">${delta > 0 ? '+' : ''}${formatMoney(delta)}</span></div>`
                : '';
            return `
            <div class="rule-502030-row">
                <span class="rule-502030-row-label">
                    <span class="rule-502030-dot" style="background: ${item.color};"></span>
                    <span>${item.label} (${item.pct}%)</span>
                </span>
                <span class="rule-502030-row-amount tabular">${formatMoney(rec)} ₴</span>
            </div>${deltaHtml}`;
        }).join('');

        const detailsHtml = RULE_502030_ITEMS.map(item => `
            <div class="rule-502030-detail-item">
                <strong>${item.pct}% — ${item.title}:</strong> ${item.desc}
            </div>
        `).join('');

        const monthlyNeedsForCushion = actuals.needs > 0 ? actuals.needs : amounts.needs;
        const cushionBasisLabel = actuals.needs > 0
            ? `6 × фактичні потреби (${formatMoney(actuals.needs)} ₴/міс)`
            : `6 × рекомендовані 50% (${formatMoney(amounts.needs)} ₴/міс)`;
        const cushionTarget = monthlyNeedsForCushion * 6;
        const cushionActual = getCushionBalanceUah();
        const cushionPct = cushionTarget > 0 ? (cushionActual / cushionTarget) * 100 : 0;

        const capitalTargetUsd = (fp.desiredMonthlyUsd || 0) * 12 * 25;
        const capitalCurrentUsd = (fp.brokerBalanceUsd || 0) + uahToUsd(getInvestmentJarsBalanceUah());
        const capitalPct = capitalTargetUsd > 0 ? (capitalCurrentUsd / capitalTargetUsd) * 100 : 0;

        const monthlyInvestUsd = uahToUsd(amounts.savings);
        const yearsToCapital = calcYearsToCapital(capitalTargetUsd, capitalCurrentUsd, monthlyInvestUsd, fp.returnRatePct);

        block.innerHTML = `
            <div class="rule-502030-header">
                <span class="rule-502030-title">Рекомендація 50/30/20</span>
                <div style="display:flex;gap:6px;">
                    <button type="button" class="rule-502030-info-btn" onclick="toggleFinancialPlanSettings(event)" title="Налаштування">⚙</button>
                    <button type="button" class="rule-502030-info-btn" onclick="toggleRule502030Details(event)" title="Пояснення">i</button>
                </div>
            </div>
            <div class="rule-502030-bar">
                <div class="rule-502030-bar-seg" style="width: 50%; background: var(--sys-blue);"></div>
                <div class="rule-502030-bar-seg" style="width: 30%; background: #ff9f0a;"></div>
                <div class="rule-502030-bar-seg" style="width: 20%; background: var(--sys-green);"></div>
            </div>
            ${rowsHtml}
            <div id="rule-502030-details" class="rule-502030-details">${detailsHtml}</div>

            <div id="fp-settings-panel" class="rule-502030-details">
                <div class="fp-input-row">
                    <div class="fp-input-wrap">
                        <label>Бажані витрати на місяць ($)</label>
                        <input type="number" value="${fp.desiredMonthlyUsd || ''}" onchange="updateFinancialPlanField('desiredMonthlyUsd', this.value)">
                    </div>
                    <div class="fp-input-wrap">
                        <label>Брокерський рахунок ($)</label>
                        <input type="number" value="${fp.brokerBalanceUsd || ''}" onchange="updateFinancialPlanField('brokerBalanceUsd', this.value)">
                    </div>
                    <div class="fp-input-wrap">
                        <label>Очікувана дохідність (%/рік)</label>
                        <input type="number" value="${fp.returnRatePct || 7}" onchange="updateFinancialPlanField('returnRatePct', this.value)">
                    </div>
                </div>
                <div class="rule-502030-detail-item"><strong>Правило ×25:</strong> ${formatMoney(fp.desiredMonthlyUsd || 0)} × 12 × 25 = ${formatMoney(capitalTargetUsd)} $ цільовий капітал</div>
            </div>

            <div class="fp-section">
                <div class="fp-section-title">Подушка безпеки (6 міс. потреб)</div>
                <div class="fp-stat-row">
                    <span class="fp-stat-label">Накопичено / ціль</span>
                    <span class="fp-stat-value tabular">${formatMoney(cushionActual)} / ${formatMoney(cushionTarget)} ₴</span>
                </div>
                ${fpProgressBar(cushionPct, 'var(--sys-blue)')}
                <div class="rule-502030-detail-item" style="margin:0;">${cushionBasisLabel}</div>
                <div class="rule-502030-detail-item" style="margin:0;"><strong>Неприкосновенна:</strong> конверти типу «Подушка безпеки»</div>
            </div>

            <div class="fp-section">
                <div class="fp-section-title">Особистий капітал (правило ×25)</div>
                <div class="fp-stat-row">
                    <span class="fp-stat-label">Накопичено / ціль</span>
                    <span class="fp-stat-value tabular">${formatMoney(capitalCurrentUsd)} / ${formatMoney(capitalTargetUsd)} $</span>
                </div>
                ${fpProgressBar(capitalPct, 'var(--sys-green)')}
                <div class="fp-stat-row">
                    <span class="fp-stat-label">При ${formatMoney(monthlyInvestUsd)} $/міс (20%)</span>
                    <span class="fp-stat-value">${formatYearsLabel(yearsToCapital)}</span>
                </div>
                ${currentExchangeRate > 0 ? `<div class="fp-stat-row"><span class="fp-stat-label">≈ в ₴</span><span class="fp-stat-value tabular">${formatMoney(usdToUah(capitalTargetUsd))} ₴</span></div>` : ''}
            </div>

        `;
    }

    const render502030Guide = renderFinancialPlanBlock;

    async function fetchExchangeRate() {
        try {
            const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json');
            const data = await response.json();
            if (data && data.length > 0) {
                currentExchangeRate = data[0].rate;
                const dateStr = data[0].exchangedate || '';
                document.getElementById('rate-info').innerText = `НБУ: ${formatMoney(currentExchangeRate)} ₴ ${dateStr ? '• ' + dateStr : ''}`;
                convertCurrency(); 
            }
        } catch (error) {
            document.getElementById('rate-info').innerText = "Курс недоступний";
        }
    }

    function selectCurrency(event, incId, currencyCode) {
        if(event) event.stopPropagation();
        updateIncome(incId, 'currency', currencyCode);
    }

function renderIncomes() {
        const container = document.getElementById('incomes-container');
        if(!container) return;
        container.innerHTML = '';
        if(!appData[currentYear] || !appData[currentYear][currentMonth] || !appData[currentYear][currentMonth].initialized) return;

        const isBiz = currentUser && currentUser.account_type === 'business';
        const incomes = appData[currentYear][currentMonth].incomes || [];
        
        incomes.forEach(inc => {
            const div = document.createElement('div');
            div.className = 'expense-item'; 
            
if (isBiz) {
                // НОВЫЙ ДИЗАЙН ДЛЯ БИЗНЕСА (Красивая карточка)
                div.style = "padding: 16px; margin-bottom: 16px; flex-direction: column; align-items: stretch; gap: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);";
                div.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%;">
                        <input type="text" class="input-name" value="${escapeHtml(inc.name)}" oninput="updateIncome(${jsId(inc.id)}, 'name', this.value)" placeholder="Назва рахунку (напр. ФОП)" style="flex: 1; height: 48px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 0 16px; font-size: 16px; font-weight: 600; color: white; outline: none; transition: 0.3s;" onfocus="this.style.backgroundColor='rgba(0,0,0,0.3)'; this.style.borderColor='var(--sys-blue)';">
                        
                        <div style="display: flex; gap: 8px; flex-shrink: 0;">
                            <div class="custom-dropdown" style="width: 85px;" onclick="event.stopPropagation(); this.classList.toggle('open')">
                                <div class="custom-dropdown-selected" style="height: 48px; padding: 0 28px 0 12px; border-radius: 14px; font-size: 14px;">${inc.currency}</div>
                                <div class="custom-dropdown-options" style="min-width: 85px;">
                                    <div class="custom-dropdown-option" onclick="selectCurrency(event, ${jsId(inc.id)}, 'UAH'); this.closest('.custom-dropdown').classList.remove('open');">UAH ${inc.currency === 'UAH' ? '✓' : ''}</div>
                                    <div class="custom-dropdown-option" onclick="selectCurrency(event, ${jsId(inc.id)}, 'USD'); this.closest('.custom-dropdown').classList.remove('open');">USD ${inc.currency === 'USD' ? '✓' : ''}</div>
                                </div>
                            </div>
                            <button class="btn-delete" onclick="deleteIncome(${jsId(inc.id)})" style="width: 48px; height: 48px; border-radius: 14px;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; width: 100%;">
                        <div style="flex: 1; background: rgba(0,0,0,0.3); padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); transition: 0.3s;" onfocusin="this.style.borderColor='var(--text-secondary)'; this.style.backgroundColor='rgba(0,0,0,0.5)';" onfocusout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.backgroundColor='rgba(0,0,0,0.3)';">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-size: 12px; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Обіг</div>
                                <div id="inc-percent-${inc.id}" style="font-size: 11px; font-weight: 700; color: var(--text-tertiary); background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 6px;">0.0%</div>
                            </div>
                            <input type="number" class="tabular" value="${inc.amount || ''}" placeholder="0" oninput="updateIncome(${jsId(inc.id)}, 'amount', this.value)" style="width: 100%; background: transparent; border: none; outline: none; font-size: 22px; font-weight: 700; color: white; padding: 0;">
                        </div>
                        <div style="flex: 1; background: linear-gradient(135deg, rgba(10, 132, 255, 0.1), rgba(10, 132, 255, 0.05)); padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(10, 132, 255, 0.2); transition: 0.3s;" onfocusin="this.style.borderColor='var(--sys-blue)'; this.style.backgroundColor='rgba(10, 132, 255, 0.15)';" onfocusout="this.style.borderColor='rgba(10, 132, 255, 0.2)'; this.style.background='linear-gradient(135deg, rgba(10, 132, 255, 0.1), rgba(10, 132, 255, 0.05))';">
                            <div style="font-size: 12px; color: var(--sys-blue); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Факт. залишок</div>
                            <input type="number" class="tabular" value="${inc.actual_balance || ''}" placeholder="0" oninput="updateIncome(${jsId(inc.id)}, 'actual_balance', this.value)" style="width: 100%; background: transparent; border: none; outline: none; font-size: 22px; font-weight: 700; color: var(--sys-blue); padding: 0;">
                        </div>
                    </div>
                `;
            } else {
                // СТАРЫЙ ДИЗАЙН ДЛЯ ФИЗЛИЦ (Компактная строка)
                div.style = "padding: 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;";
                div.innerHTML = `
                    <input type="text" class="input-name" value="${escapeHtml(inc.name)}" oninput="updateIncome(${jsId(inc.id)}, 'name', this.value)" placeholder="Назва" style="flex: 1; min-width: 100px;">
                    <input type="number" class="input-name tabular" value="${inc.amount || ''}" placeholder="0" oninput="updateIncome(${jsId(inc.id)}, 'amount', this.value)" style="text-align: right; margin: 0 8px; width: 100px;">
                    
                    <div class="custom-dropdown" style="width: 90px; flex-shrink: 0;" onclick="event.stopPropagation(); this.classList.toggle('open')">
                        <div class="custom-dropdown-selected" style="height: 48px; padding: 0 30px 0 12px; border-radius: 14px; font-size: 14px;">${inc.currency}</div>
                        <div class="custom-dropdown-options" style="min-width: 90px;">
                            <div class="custom-dropdown-option" onclick="selectCurrency(event, ${jsId(inc.id)}, 'UAH'); this.closest('.custom-dropdown').classList.remove('open');">UAH ${inc.currency === 'UAH' ? '✓' : ''}</div>
                            <div class="custom-dropdown-option" onclick="selectCurrency(event, ${jsId(inc.id)}, 'USD'); this.closest('.custom-dropdown').classList.remove('open');">USD ${inc.currency === 'USD' ? '✓' : ''}</div>
                        </div>
                    </div>
                    <button class="btn-delete" onclick="deleteIncome(${jsId(inc.id)})" style="width: 48px; height: 48px; flex-shrink: 0; border-radius: 14px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                `;
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
        const inc = appData[currentYear][currentMonth].incomes.find(i => i.id === id);
        if (inc) {
            inc[field] = (field === 'amount' || field === 'actual_balance') ? parseFloat(value) || 0 : value;
            saveData();
            convertCurrency();
            if (field === 'currency') renderIncomes(); 
        }
    }

    function updateBusinessHours(val) {
        if (!appData[currentYear][currentMonth].cogs) {
            appData[currentYear][currentMonth].cogs = { type: 'percent', value: 0, businessHours: 8 };
        }
        appData[currentYear][currentMonth].cogs.businessHours = parseFloat(val) || 0;
        saveData();
        updateAll();
    }

    function deleteIncome(id) {
        appData[currentYear][currentMonth].incomes = appData[currentYear][currentMonth].incomes.filter(i => i.id !== id);
        saveData();
        renderIncomes();
        convertCurrency();
    }

function convertCurrency() {
        if(!appData[currentYear] || !appData[currentYear][currentMonth] || !appData[currentYear][currentMonth].initialized) return;

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
        
        saveData(); 

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

        updateDebtsDisplay();
        updateAll(); 
    }

    function updateCOGS(val) {
        if (!appData[currentYear][currentMonth].cogs) appData[currentYear][currentMonth].cogs = { type: 'percent', value: 0 };
        appData[currentYear][currentMonth].cogs.value = parseFloat(val) || 0;
        saveData();
        updateAll();
    }

    function selectCOGSType(event, type) {
        if(event) event.stopPropagation();
        if (!appData[currentYear][currentMonth].cogs) appData[currentYear][currentMonth].cogs = { type: 'percent', value: 0 };
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
        return category.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }

    function getHistoricalCogs(year, month) {
        if (!appData[year] || !appData[year][month] || !appData[year][month].initialized) return 0;
        const data = appData[year][month];
        let cogsAmount = 0;
        
        if (data.invoices && data.invoices.length > 0) {
            cogsAmount = data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
        } else if (data.cogs) {
            // Фолбек для старих даних (якщо такі залишилися)
            let income = data.incomes ? data.incomes.reduce((s, inc) => s + (inc.currency === 'USD' ? inc.amount * currentExchangeRate : inc.amount), 0) : (data.usd || 0) * currentExchangeRate;
            cogsAmount = data.cogs.type === 'percent' ? income * (data.cogs.value / 100) : (data.cogs.value || 0);
        }
        return cogsAmount;
    }

    function getHistoricalProfit(year, month) {
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

        let cogsAmount = 0;
        const isBiz = currentUser && currentUser.account_type === 'business';
        if (isBiz) {
            if (data.invoices && data.invoices.length > 0) {
                cogsAmount = data.invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
            } else if (data.cogs) {
                cogsAmount = data.cogs.type === 'percent' ? income * (data.cogs.value / 100) : (parseFloat(data.cogs.value) || 0);
            }
        }

        let expTotal = 0;
        if (data.expenses) {
            data.expenses.forEach(exp => {
                expTotal += exp.items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
            });
        }

        return income - cogsAmount - expTotal;
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
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; color: #32d74b; background: rgba(50, 215, 75, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
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
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; color: #ff453a; background: rgba(255, 69, 58, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
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
            trendHtml = `<div class="trend-badge trend-up" style="margin-bottom:0; cursor:pointer;">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#ff453a';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-down" style="margin-bottom:0; cursor:pointer;">
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
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; color: #32d74b; background: rgba(50, 215, 75, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge" style="margin-bottom:0; color: #ff453a; background: rgba(255, 69, 58, 0.15); padding: 2px 6px; border-radius: 6px; font-weight: 700; font-size: 11px; cursor: pointer;">
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
                    let pastCat = appData[tempY][tempM].expenses.find(e => e.id === categoryId);
                    
                    // РОЗУМНИЙ ПОШУК (ФІКС ДЛЯ БОРГІВ ТА ЗАОЩАДЖЕНЬ):
                    const currentCat = expenses.find(e => e.id === categoryId);
                    
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
        const currentCatForColor = expenses.find(e => e.id === categoryId);
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
                trendHtml = `<div class="trend-badge" style="color: #32d74b; background: rgba(50, 215, 75, 0.15);">
                                <span class="trend-main-text">↑ +${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#32d74b';
            } else {
                trendHtml = `<div class="trend-badge trend-up">
                                <span class="trend-main-text">↑ +${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#ff453a';
            }
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            if (isSavings) {
                trendHtml = `<div class="trend-badge" style="color: #ff453a; background: rgba(255, 69, 58, 0.15);">
                                <span class="trend-main-text">↓ -${diff}%</span>
                                <span class="trend-hover-text">${diffMoneyText}</span>
                             </div>`;
                colorMain = '#ff453a';
            } else {
                trendHtml = `<div class="trend-badge trend-down">
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
        
        let totals = expenses.map(e => getCategoryTotal(e)).filter(t => t > 0);
        let uniqueTotals = [...new Set(totals)].sort((a,b) => b - a);
        let top1 = uniqueTotals[0] || -1, top2 = uniqueTotals[1] || -1, top3 = uniqueTotals[2] || -1;

        expenses.forEach(exp => {
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
            const bucket = getCategoryBudgetBucket(exp);
            const bucketSelectHtml = !isBiz ? buildBucketDropdownHtml(exp.id, bucket, !!exp.isSavings) : '';

            const div = document.createElement('div');
            div.className = `expense-card-pro ${rankClass} ${paidCardClass}`;
            div.innerHTML = `
                <div class="expense-pro-main" onclick="openModal(${jsId(exp.id)})" style="cursor: pointer; position: relative;">
                    <div class="expense-pro-header">
                        <div class="expense-pro-title-group">
                            ${badgeHtml}
                            <input class="expense-pro-input" type="text" value="${escapeHtml(exp.name || '')}" placeholder="Назва категорії" oninput="updateCategoryName(${jsId(exp.id)}, this.value)" onclick="event.stopPropagation()" style="${isSavingsClass}">
                            ${bucketSelectHtml}
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
                    <button class="btn-pro-action btn-pro-add" onclick="openModal(${jsId(exp.id)})" title="Додати статті">+</button>
                    <button class="btn-pro-action btn-pro-del" onclick="deleteCategory(${jsId(exp.id)})" title="Видалити категорію">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
            list.appendChild(div);
        });
    }

    function updateCategoryName(id, val) {
        const cat = expenses.find(e => e.id === id);
        if (cat) { cat.name = val; saveData(); updateChart(); renderFinancialPlanBlock(); }
    }

    function addCategory() {
        expenses.push({ id: newId(), name: "", items: [] });
        renderExpenses(); saveData(); updateAll();
    }

    function openModal(categoryId) {
        activeCategoryId = categoryId;
        const category = expenses.find(e => e.id === categoryId);
        document.getElementById('modal-category-name').innerText = category.name || 'Без назви';
        renderModalItems();
        document.getElementById('category-modal').classList.add('active');
    }

    function closeModal(event) {
        if (event && event.target.id !== 'category-modal' && event.target.className !== 'btn-close-modal' && event.target.className !== 'btn-modal-done') return;
        document.getElementById('category-modal').classList.remove('active');
        activeCategoryId = null; renderExpenses(); updateAll(); saveData();
    }

    function getTop3SubItems(category) {
        let totals = category.items.map(i => parseFloat(i.amount) || 0).filter(t => t > 0);
        let unique = [...new Set(totals)].sort((a,b) => b - a);
        return { top1: unique[0] || -1, top2: unique[1] || -1, top3: unique[2] || -1 };
    }

    function renderModalItems() {
        const category = expenses.find(e => e.id === activeCategoryId);
        const list = document.getElementById('modal-subitems-list');
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
            const checkboxHtml = `<div class="check-container ${isChecked}" onclick="togglePaidStatus(${jsId(item.id)})"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`;

            const div = document.createElement('div');
            div.className = `sub-item ${rankClass}`;
            div.innerHTML = `
                ${badgeHtml}
                <div class="sub-item-row">
                    ${checkboxHtml}
                    <input type="text" class="sub-item-name" value="${escapeHtml(item.name || '')}" placeholder="Назва статті" oninput="updateSubItemName(${jsId(item.id)}, this.value)">
                    <input type="number" class="sub-item-amount ${paidClass}" id="sub-amount-${item.id}" value="${item.amount || ''}" placeholder="0" oninput="updateSubItemAmount(${jsId(item.id)}, this.value)">
                    <button class="btn-sub-delete" onclick="deleteSubItem(${jsId(item.id)})"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
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
        expenses.find(e => e.id === activeCategoryId).items.push({ id: newId(), name: "", amount: null, isPaid: false });
        renderModalItems();
    }

    function updateSubItemName(subId, val) {
        const item = expenses.find(e => e.id === activeCategoryId).items.find(i => i.id === subId);
        if (item) { item.name = val; saveData(); }
    }

    function deleteCategory(id) {
        showConfirm("Видалити категорію", "Видалити цю категорію з усіма витратами?", () => {
            const category = expenses.find(e => e.id === id);
            let debtsToSync = new Set();
            
            if (category) {
                category.items.forEach(item => {
                    if (category.isSavings && item.envelopeId) {
                        const jar = globalData.jars[currentUser.id].find(j => j.id == item.envelopeId);
                        if (jar) jar.balance -= (item.amount || 0);
                    }
                    if (item.debtId) debtsToSync.add(item.debtId);
                });
            }
            
            expenses = expenses.filter(e => e.id !== id);
            
            if (appData[currentYear] && appData[currentYear][currentMonth]) {
                appData[currentYear][currentMonth].expenses = expenses;
            }
            
            debtsToSync.forEach(debtId => syncGlobalDebtBalance(debtId));

            renderExpenses(); 
            updateAll(); 
            updateSavingsDisplay(); 
            updateDebtsDisplay();
            
            saveDataToServer(); 
        });
    }

    function updateSubItemAmount(subId, val) {
        const category = expenses.find(e => e.id === activeCategoryId);
        const item = category.items.find(i => i.id === subId);
        if (item) {
            const newVal = parseFloat(val) || 0;
            if (category.isSavings && item.envelopeId) {
                const jar = globalData.jars[currentUser.id].find(j => j.id == item.envelopeId);
                if (jar) { jar.balance += (newVal - (item.amount || 0)); updateSavingsDisplay(); }
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
            updateTopSubItemBadges(category);
            saveData();
        }
    }

    function deleteSubItem(subId) {
        const category = expenses.find(e => e.id === activeCategoryId);
        const item = category.items.find(i => i.id === subId);
        const debtIdToSync = item && item.debtId ? item.debtId : null;
        
        if (category.isSavings && item && item.envelopeId) {
            const jar = globalData.jars[currentUser.id].find(j => j.id == item.envelopeId);
            if (jar) { jar.balance -= (item.amount || 0); updateSavingsDisplay(); }
        }
        
        category.items = category.items.filter(i => i.id !== subId);
        
        if (appData[currentYear] && appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth].expenses = expenses;
        }
        
        if (debtIdToSync) {
            syncGlobalDebtBalance(debtIdToSync);
            updateDebtsDisplay();
        }
        renderModalItems();
    }

    function togglePaidStatus(subId) {
        const category = expenses.find(e => e.id === activeCategoryId);
        const item = category.items.find(i => i.id === subId);
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
                const rate = parseFloat(emp.rate) || 0;
                const hours = parseFloat(emp.hours) || 0;
                const bonus = parseFloat(emp.bonus) || 0;
                const penalty = parseFloat(emp.penalty) || 0;
                const advance = parseFloat(emp.advance) || 0;
                const paidPart = parseFloat(emp.paid_part) || 0;
                
                const accrued = (rate * hours) + bonus - penalty; // Загальна сума витрати на співробітника
                const paidCash = emp.is_paid ? accrued : (advance + paidPart); // Скільки реально видали з каси
                
                payrollAccruedTotal += accrued;
                payrollPaidTotal += paidCash;
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

let workingDays = 21;
        let hoursPerDay = 8;
        if (isBiz) {
            workingDays = new Date(currentYear, currentMonth + 1, 0).getDate();
            const currentCogs = appData[currentYear]?.[currentMonth]?.cogs || {};
            hoursPerDay = currentCogs.businessHours > 0 ? currentCogs.businessHours : 8;
        }
        const workingHours = workingDays * hoursPerDay;        document.getElementById('daily-rate-uah').innerText = formatMoney(displayIncomeUah > 0 ? (displayIncomeUah / workingDays) : 0);
        document.getElementById('hourly-rate-uah').innerText = formatMoney(displayIncomeUah > 0 ? (displayIncomeUah / workingHours) : 0);

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

        const dailyLimitVal = document.getElementById('daily-limit-val');
        if (!isBiz) {
            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
            if (remaining > 0) {
                dailyLimitVal.innerText = formatMoney(remaining / daysInMonth);
                dailyLimitVal.style.color = 'var(--sys-green)';
            } else {
                dailyLimitVal.innerText = '0.00';
                dailyLimitVal.style.color = 'var(--sys-red)';
            }
        }


        const percentElements = document.querySelectorAll('.expense-info.tabular');
        expenses.forEach((exp, index) => {
            const catPercent = displayIncomeUah > 0 ? ((getCategoryTotal(exp) / displayIncomeUah) * 100).toFixed(1) : 0;
            if (percentElements[index]) percentElements[index].innerText = catPercent + '%';
        });

        updateChart();
    }

    // ==========================================
    // 8. МОДАЛКА ПОДТВЕРЖДЕНИЯ (Confirm)
    // ==========================================
    function showConfirm(title, message, callback) {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-text').innerText = message;
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

        userJars.forEach(jar => {
            const percent = jar.goal > 0 ? Math.min(100, (jar.balance / jar.goal) * 100) : 0;
            const goalText = jar.goal > 0 ? `/ ${formatMoney(jar.goal)} ₴` : '';
            const jarType = getJarType(jar);
            const isPersonal = currentUser && currentUser.account_type !== 'business';
            
            const balanceDisplay = jar.isMain 
                ? `<div style="display: flex; align-items: center; gap: 6px;"><input type="number" value="${jar.balance}" onchange="updateMainJarBalance(${jsId(jar.id)}, this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: var(--sys-green); font-size: 16px; font-weight: 700; width: 110px; padding: 6px 10px; outline: none; transition: 0.3s; text-align: left; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);" onfocus="this.style.background='rgba(255,255,255,0.1)'" onblur="this.style.background='rgba(255,255,255,0.05)'"> <span>₴</span></div>`
                : `<span style="color: var(--sys-green);">${formatMoney(jar.balance)} ₴</span>`;
            
            // Кнопка видалення у стилі карток боргів (хрестик у квадраті)
            const deleteBtn = jar.isMain ? '' : `<button onclick="deleteEnvelope(${jsId(jar.id)})" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-tertiary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0;" onmouseover="this.style.background='rgba(255,69,58,0.2)'; this.style.color='#ff453a'; border-color: transparent;" onmouseout="this.style.background='rgba(255,255,255,0.05)'; this.style.color='var(--text-tertiary)'; border-color: rgba(255,255,255,0.1);">✕</button>`;
            
            // Бейджик для основного рахунку
            const mainBadge = jar.isMain ? `<span style="font-size: 11px; background: rgba(10, 132, 255, 0.15); padding: 2px 6px; border-radius: 6px; color: var(--sys-blue); flex-shrink: 0;">Основний</span>` : '';
            const typeBadge = isPersonal && jarType !== 'regular' ? `<span style="font-size: 11px; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 6px; color: var(--text-secondary); flex-shrink: 0;">${JAR_TYPE_LABELS[jarType]}</span>` : '';
            const typeSelect = isPersonal && !jar.isMain ? buildJarTypeDropdownHtml(jar.id, jarType, 'compact-xs') : '';

            list.innerHTML += `
            <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
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
                    <div style="overflow: hidden; padding-right: 8px;">
                        <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: 4px;">Зібрано ${jar.goal > 0 ? '/ Ціль' : ''}</div>
                        <div style="font-size: 16px; font-weight: 700; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;">
                            ${balanceDisplay}
                            ${goalText ? `<span style="font-size: 13px; color: var(--text-tertiary); font-weight: 500;">${goalText}</span>` : ''}
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

    function updateMainJarBalance(id, val) {
        const jar = globalData.jars[currentUser.id].find(j => j.id == id);
        if (jar) { jar.balance = parseFloat(val) || 0; updateSavingsDisplay(); saveData(); }
    }

    function deleteEnvelope(id) {
        showConfirm("Видалити конверт?", "Кошти, відкладені цього місяця, повернуться у вільний залишок.", () => {
            globalData.jars[currentUser.id] = globalData.jars[currentUser.id].filter(j => j.id != id);
            const fp = getFinancialPlan();
            delete fp.jarTypes[String(id)];
            saveFinancialPlan();
            let savingsCat = expenses.find(e => e.isSavings);
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
            saveDataToServer(); 
        });
    }

    function openTransferModal() {
        const totalExp = expenses.reduce((sum, exp) => sum + getCategoryTotal(exp), 0);
        let cogsAmount = currentUser && currentUser.account_type === 'business' ? (appData[currentYear][currentMonth].cogs?.type === 'percent' ? currentIncomeUah * (appData[currentYear][currentMonth].cogs.value / 100) : (appData[currentYear][currentMonth].cogs?.value || 0)) : 0;
        const remaining = currentIncomeUah - cogsAmount - totalExp;
        
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
                optionsContainer.innerHTML += `<div class="custom-dropdown-option" onclick="selectTransferJar(event, ${jsId(jar.id)}, '${escapeAttr(text)}')">${escapeHtml(text)}</div>`;
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
        if(jar) { jar.balance += val; savingsCat.items.push({ id: newId(), name: "У конверт: " + jar.name, amount: val, envelopeId: jarId }); }
        
        if (appData[currentYear] && appData[currentYear][currentMonth]) {
            appData[currentYear][currentMonth].expenses = expenses;
        }

        renderExpenses(); updateAll(); updateSavingsDisplay(); closeTransferModal();
        saveDataToServer(); 
    }

    // ==========================================
    // 10. ДОЛГИ И КРЕДИТЫ
    // ==========================================
    function getHistoricalDebtBalance(debtId, targetYear, targetMonth) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return 0;

        const targetDate = targetYear * 100 + targetMonth;
        let totalPaid = 0;

        for (const y in appData) {
            for (const m in appData[y]) {
                const monthDate = parseInt(y) * 100 + parseInt(m);
                if (monthDate <= targetDate && appData[y][m].initialized && appData[y][m].expenses) {
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
        return Math.max(0, debt.total_amount - totalPaid);
    }

    function syncGlobalDebtBalance(debtId) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return;
        
        let totalPaid = 0;
        for (const y in appData) {
            for (const m in appData[y]) {
                if (appData[y][m].initialized && appData[y][m].expenses) {
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
        debt.remaining_amount = Math.max(0, debt.total_amount - totalPaid);
        
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
            start_month: currentMonth
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
            const interestTag = debt.interest_rate > 0 ? `<span style="font-size: 11px; background: rgba(255, 69, 58, 0.2); padding: 2px 6px; border-radius: 6px; color: #ff453a; margin-left: 6px; flex-shrink: 0;">${debt.interest_rate}% / міс.</span>` : '';

            const isPaidOff = historicalRemaining <= 0;
            const payBtnHtml = isPaidOff 
                ? `<div style="color: var(--sys-green); font-weight: 700; font-size: 13px; padding: 8px 0;">✓ Виплачено</div>`
                : `<button onclick="payDebt(${jsId(debt.id)})" style="background-color: rgba(255, 69, 58, 0.1); border: 1px solid rgba(255, 69, 58, 0.2); padding: 8px 16px; border-radius: 12px; color: #ff453a; font-weight: 700; font-size: 13px; cursor: pointer; transition: background-color 0.2s ease; flex-shrink: 0;" onmouseover="this.style.backgroundColor='rgba(255, 69, 58, 0.2)'" onmouseout="this.style.backgroundColor='rgba(255, 69, 58, 0.1)'">Оплатити</button>`;

            list.innerHTML += `
            <div style="background: var(--item-bg); border: 1px solid rgba(255, 69, 58, 0.2); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <div style="font-weight: 700; font-size: 16px; color: #ff453a; display: flex; align-items: center; gap: 8px; overflow: hidden; white-space: nowrap;">
                        <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(debt.name)}</span><span style="font-size: 11px; background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 6px; color: var(--text-primary); flex-shrink: 0;">${escapeHtml(debt.currency)}</span>${interestTag}
                    </div>
                    <button onclick="deleteDebt(${jsId(debt.id)})" style="background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); color: var(--text-tertiary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0;" onmouseover="this.style.background='rgba(255,69,58,0.2)'; this.style.color='#ff453a'; this.style.borderColor='transparent';" onmouseout="this.style.background='var(--btn-secondary-bg)'; this.style.color='var(--text-tertiary)'; this.style.borderColor='var(--glass-border)';">✕</button>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="overflow: hidden; padding-right: 8px;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Залишок / Всього</div>
                        <div style="font-size: 16px; font-weight: 700; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;"><span style="${isPaidOff ? 'color: var(--sys-green);' : 'color: var(--text-primary)'}">${formatMoney(historicalRemaining)} ${currencySymbol}</span><span style="font-size: 13px; color: var(--text-tertiary); font-weight: 500;">/ ${formatMoney(debt.total_amount)} ${currencySymbol}</span></div>
                    </div>
                    ${payBtnHtml}
                </div>
                <div class="jar-progress-bg" style="background: rgba(255, 69, 58, 0.1); height: 6px; border-radius: 3px; margin-top: 4px;"><div class="jar-progress-fill" style="width: ${percent}%; background: linear-gradient(90deg, #ff453a, #d70015); box-shadow: 0 0 10px rgba(255, 69, 58, 0.5); border-radius: 3px;"></div></div>
            </div>`;
        });

        if (archivedDebts.length > 0) {
            list.innerHTML += `<div style="margin-top: 16px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Архів (закрито / скасовано)</div>`;
            archivedDebts.forEach(debt => {
                const historicalRemaining = getHistoricalDebtBalance(debt.id, currentYear, currentMonth);
                const isAutoArchived = debt.is_archived > 0;
                const statusText = isAutoArchived ? '✓ Виплачено' : 'Скасовано'; const statusColor = isAutoArchived ? 'var(--sys-green)' : 'var(--text-secondary)'; const currencySymbol = debt.currency === 'USD' ? '$' : '₴';
                let deleteBtnHtml = '';
                if (historicalRemaining === debt.total_amount) {
                    deleteBtnHtml = `<button onclick="hardDeleteDebt(${jsId(debt.id)})" style="background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); color: var(--text-secondary); border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.3s; flex-shrink: 0; margin-left: 12px;" onmouseover="this.style.background='rgba(255,69,58,0.8)'; this.style.color='#ffffff'; this.style.borderColor='transparent';" onmouseout="this.style.background='var(--btn-secondary-bg)'; this.style.color='var(--text-secondary)'; this.style.borderColor='var(--glass-border)';">✕</button>`;
                }
                list.innerHTML += `
                <div style="background: var(--item-bg); border: 1px solid var(--glass-border); border-radius: 16px; opacity: 0.7; padding: 12px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="width: 100%; overflow: hidden;">
                            <div style="color: var(--text-secondary); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(debt.name)}</span> <span style="font-size: 11px; background: var(--btn-secondary-bg); padding: 2px 6px; border-radius: 6px; color: var(--text-primary); flex-shrink: 0;">${escapeHtml(debt.currency)}</span></div>
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
    google.charts.load('current', {'packages':['sankey']});
    let googleChartsLoaded = false;
    
    google.charts.setOnLoadCallback(() => {
        googleChartsLoaded = true;
        if (appData && Object.keys(appData).length > 0) updateChart();
    });

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
        if (isBiz) {
            const monthInvoices = currentMonthData.invoices || [];
            cogsAmount = monthInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
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

        if (isBiz && appData[currentYear][currentMonth].payroll) {
            let payTotal = 0;
            appData[currentYear][currentMonth].payroll.forEach(emp => {
                payTotal += (parseFloat(emp.rate)||0)*(parseFloat(emp.hours)||0) + (parseFloat(emp.bonus)||0) - (parseFloat(emp.penalty)||0);
            });
            if (payTotal > 0) rows.push(['Ваш Бюджет', 'Зарплати', roundNum(payTotal)]);
        }

        const remaining = totalIncome - cogsAmount - totalExp;
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
                    let income = data.incomes ? data.incomes.reduce((s, inc) => s + (inc.currency === 'USD' ? inc.amount * currentExchangeRate : inc.amount), 0) : (data.usd || 0) * currentExchangeRate;
                    let cogsAmount = isBiz && data.cogs ? (data.cogs.type === 'percent' ? income * (data.cogs.value / 100) : data.cogs.value) : 0;
                    
                    const displayIncome = income - cogsAmount;
                    incomeData.push(displayIncome);

                    let expensesTotal = data.expenses ? data.expenses.reduce((sum, exp) => sum + exp.items.reduce((s, item) => s + (parseFloat(item.amount) || 0), 0), 0) : 0;
                    expenseData.push(expensesTotal);
                    
                    const freeMoney = displayIncome - expensesTotal;
                    freeMoneyData.push(freeMoney);
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
        const viewDate = currentYear * 100 + currentMonth;
        const activeDebts = globalData.debts[currentUser.id].filter(d => !d.is_archived || d.is_archived === 0 || viewDate < Math.abs(d.is_archived));
        
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

        const allDebts = globalData.debts[currentUser.id];
        const viewDate = currentYear * 100 + currentMonth;
        
        const activeDebts = allDebts.filter(d => !d.is_archived || d.is_archived === 0 || viewDate < Math.abs(d.is_archived));
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
                        ondragstart="handleScheduleDragStart(event, ${jsId(debt.id)})" 
                        ondragover="handleScheduleDragOver(event)" 
                        ondragleave="handleScheduleDragLeave(event)" 
                        ondrop="handleScheduleDrop(event, ${jsId(debt.id)})"
                        ondragend="handleScheduleDragEnd(event)">`;
            
            html += `<td class="calendar-debt-name-col">
                        <div style="display: flex; align-items: center; margin-bottom: 6px;">
                            <span class="drag-handle" title="Перетягніть, щоб змінити порядок">≡</span>
                            <span style="font-weight: 700; color: var(--sys-red); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(debt.name)}</span>
                            <span style="font-size: 11px; background: var(--btn-secondary-bg); border: 1px solid var(--glass-border); padding: 2px 6px; border-radius: 6px; margin-left: 6px; flex-shrink: 0;">${escapeHtml(debt.currency)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); padding-left: 20px;">
                            Залишок плану: <span style="font-weight: 700; color: ${dynamicRemaining < 0 ? 'var(--sys-red)' : 'var(--text-primary)'};">${formatMoney(dynamicRemaining)} ${currencySymbol}</span>
                        </div>
                     </td>`;

            months.forEach(m => {
                let planData = schedule[m.key];
                let planVal = '';
                let isPaid = false;

                if (planData !== undefined) {
                    if (typeof planData === 'object') {
                        planVal = planData.amount;
                        isPaid = planData.isPaid;
                    } else {
                        planVal = planData;
                        schedule[m.key] = { amount: planVal, isPaid: false };
                    }
                }

                const checkedAttr = isPaid ? 'checked' : '';
                const inputClass = isPaid ? 'schedule-input is-paid' : 'schedule-input';

                html += `<td>
                            <div class="schedule-input-group">
                                <input type="checkbox" class="schedule-checkbox" ${checkedAttr} 
                                       title="Відмітити як оплачене"
                                       onchange="toggleSchedulePaid(${jsId(debt.id)}, '${m.key}', this.checked)">
                                <input type="number" class="${inputClass}" value="${planVal}" placeholder="0" 
                                       oninput="updateScheduleAmount(${jsId(debt.id)}, '${m.key}', this.value)">
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
        if (!debt || !debt.schedule || !debt.schedule[monthKey]) return;

        if (typeof debt.schedule[monthKey] !== 'object') {
            debt.schedule[monthKey] = { amount: debt.schedule[monthKey], isPaid: isChecked };
        } else {
            debt.schedule[monthKey].isPaid = isChecked;
        }
        
        saveGlobalData();
        renderScheduleModal(); // Перемальовуємо, щоб оновити кольори
    }

    function updateScheduleAmount(debtId, monthKey, val) {
        const debt = globalData.debts[currentUser.id].find(d => d.id == debtId);
        if (!debt) return;

        if (typeof debt.schedule === 'string') { try { debt.schedule = JSON.parse(debt.schedule); } catch(e) { debt.schedule = {}; } }
        if (!debt.schedule) debt.schedule = {};

        const numVal = parseFloat(val);
        const currentIsPaid = debt.schedule[monthKey] && debt.schedule[monthKey].isPaid;

        if (isNaN(numVal) || numVal <= 0) {
            delete debt.schedule[monthKey];
        } else {
            debt.schedule[monthKey] = { amount: numVal, isPaid: currentIsPaid || false };
        }
        
        saveGlobalData(); // Тихо зберігаємо на сервер
        
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
        
        document.getElementById('tab-invoices-content').style.display = tab === 'invoices' ? 'block' : 'none';
        document.getElementById('tab-suppliers-content').style.display = tab === 'suppliers' ? 'block' : 'none';
        
        if (tab === 'suppliers') renderSuppliersTurnover();
    }
    
    function selectInvoicePayment(type) {
        document.getElementById('btn-inv-cash').classList.toggle('active', type === 'cash');
        document.getElementById('btn-inv-card').classList.toggle('active', type === 'card');
        document.getElementById('new-invoice-payment').value = type;
    }
    

    // --- КАСТОМНЫЙ ДРОПДАУН И МОДАЛКА ПОСТАВЩИКА ---
    function openNewSupplierModal() {
        document.getElementById('supplier-dropdown-container').classList.remove('open');
        document.getElementById('new-supplier-name-input').value = '';
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
        if (name && name.trim()) {
            if (!globalData.suppliers) globalData.suppliers = {};
            if (!globalData.suppliers[currentUser.id]) globalData.suppliers[currentUser.id] = [];
            
            const createdId = newId();
            const cleanName = name.trim();
            globalData.suppliers[currentUser.id].push({ id: createdId, name: cleanName });
            saveGlobalData(); 
            renderSuppliersDropdown();
            selectSupplier(null, createdId, cleanName);
            closeNewSupplierModal();
        }
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
        let html = `<input type="text" class="dropdown-search-input" placeholder="🔍 Пошук постачальника..." onclick="event.stopPropagation()" oninput="filterSuppliers(this.value)">`;

        suppliers.forEach(s => {
            const safeName = escapeAttr(s.name);
            html += `<div class="custom-dropdown-option supplier-item" onclick="selectSupplier(event, '${escapeAttr(String(s.id))}', '${safeName}')">${escapeHtml(s.name)}</div>`;
        });
        
        container.innerHTML = html;
    }

    // НОВА ФУНКЦІЯ: Відкриття дропдауну та фокус на пошуку
    function toggleSupplierDropdown(e) {
        e.stopPropagation();
        const container = document.getElementById('supplier-dropdown-container');
        container.classList.toggle('open');
        
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
            month: currentMonth
        });
        
        document.getElementById('new-invoice-amount').value = '';
        saveData(); 
        renderInvoices();
        updateAll();
    }

    // --- УМНАЯ ГРУППИРОВКА НАКЛАДНЫХ ---
    function renderInvoices() {
        const list = document.getElementById('invoices-list');
        list.innerHTML = '';
        const invoices = appData[currentYear]?.[currentMonth]?.invoices || [];
        const suppliers = globalData.suppliers[currentUser.id] || [];
        
        if (invoices.length === 0) {
            list.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px; font-weight: 500;">Немає накладних за цей місяць</div>';
            return;
        }
        
        // Сортировка от новых к старым
        const sorted = [...invoices].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        // Группировка по дате
        const grouped = {};
        sorted.forEach(inv => {
            if (!grouped[inv.date]) grouped[inv.date] = [];
            grouped[inv.date].push(inv);
        });

        // Отрисовка
        for (const [dateStr, invs] of Object.entries(grouped)) {
            // Красивая дата (напр. 30 Березня)
            const dObj = new Date(dateStr);
            const formattedDate = `${dObj.getDate()} ${monthNames[dObj.getMonth()]}`;

            // Заголовок группы
            list.innerHTML += `
                <div style="font-size: 12px; font-weight: 800; color: var(--text-tertiary); margin: 12px 0 6px 4px; text-transform: uppercase; letter-spacing: 1px;">
                    📅 ${formattedDate}
                </div>
            `;

            // Накладные внутри даты
            invs.forEach(inv => {
                const sup = suppliers.find(s => s.id == inv.supplier_id);
                const supName = escapeHtml(sup ? sup.name : 'Видалений постачальник');
                const isCash = inv.payment_method === 'cash';
                const payColor = isCash ? '#ff9f0a' : 'var(--sys-blue)';
                const payText = isCash ? 'Готівка' : 'Безготівка';
                    
                list.innerHTML += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.03); padding: 12px 16px; border-radius: 16px; margin-bottom: 6px; box-shadow: inset 0 2px 4px rgba(255,255,255,0.02);">
                        <div style="flex: 1; overflow: hidden; padding-right: 12px;">
                            <div style="font-weight: 600; font-size: 15px; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">${supName}</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${payColor};">${payText}</div>
                        </div>
                        <div style="text-align: right; margin-right: 12px; flex-shrink: 0;">
                            <div class="tabular" style="font-weight: 800; font-size: 16px; color: var(--text-primary);">${formatMoney(inv.amount)} ₴</div>
                        </div>
                        <button class="btn-delete" style="width: 32px; height: 32px; border-radius: 10px; background: rgba(255,69,58,0.1); color: var(--sys-red); border-color: rgba(255,69,58,0.2); padding: 0;" onclick="deleteInvoice('${escapeAttr(String(inv.id))}')">✕</button>
                    </div>
                `;
            });
        }
    }

    

    
function deleteInvoice(id) {
        showConfirm("Видалити накладну?", "Ви впевнені, що хочете видалити цю накладну? Скасувати дію буде неможливо.", () => {
            appData[currentYear][currentMonth].invoices = appData[currentYear][currentMonth].invoices.filter(i => i.id != id);
            saveData();
            renderInvoices();
            updateAll();
        });
    }
    

    
    function renderSuppliersTurnover() {
        const list = document.getElementById('suppliers-turnover-list');
        list.innerHTML = '';
        
        const invoices = appData[currentYear]?.[currentMonth]?.invoices || [];
        const suppliers = globalData.suppliers[currentUser.id] || [];
        
        if (invoices.length === 0) {
            list.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">Немає даних для аналітики</div>';
            document.getElementById('suppliers-total-stat').innerText = '0.00 ₴';
            if (document.getElementById('suppliers-total-cash')) document.getElementById('suppliers-total-cash').innerText = '0.00 ₴';
            if (document.getElementById('suppliers-total-card')) document.getElementById('suppliers-total-card').innerText = '0.00 ₴';
            return;
        }
        
        let total = 0;
        let totalCash = 0;
        let totalCard = 0;
        const stats = {};
        
        invoices.forEach(inv => {
            if (!stats[inv.supplier_id]) stats[inv.supplier_id] = { total: 0, cash: 0, card: 0 };
            const amt = parseFloat(inv.amount) || 0;
            stats[inv.supplier_id].total += amt;
            
            if (inv.payment_method === 'cash') {
                stats[inv.supplier_id].cash += amt;
                totalCash += amt;
            } else {
                stats[inv.supplier_id].card += amt;
                totalCard += amt;
            }
            total += amt;
        });
        
        document.getElementById('suppliers-total-stat').innerText = formatMoney(total) + ' ₴';
        if (document.getElementById('suppliers-total-cash')) document.getElementById('suppliers-total-cash').innerText = formatMoney(totalCash) + ' ₴';
        if (document.getElementById('suppliers-total-card')) document.getElementById('suppliers-total-card').innerText = formatMoney(totalCard) + ' ₴';
        
        const sortedStats = Object.entries(stats).sort((a,b) => b[1].total - a[1].total);
        
        sortedStats.forEach(([supId, data]) => {
            const sup = suppliers.find(s => s.id == supId);
            const supName = escapeHtml(sup ? sup.name : 'Невідомий постачальник');
            const percent = ((data.total / total) * 100).toFixed(1);
            
            list.innerHTML += `
                <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: 700; font-size: 16px; color: white;">${supName}</span>
                        <span style="font-weight: 800; font-size: 16px; color: var(--sys-red);">${formatMoney(data.total)} ₴</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
                        <span>Частка: ${percent}%</span>
                        <div style="display: flex; gap: 12px;">
                            <span>Готівка: <span style="color: #ff9f0a;">${formatMoney(data.cash)}</span></span>
                            <span>Безготівка: <span style="color: var(--sys-blue);">${formatMoney(data.card)}</span></span>
                        </div>
                    </div>
                    <div class="jar-progress-bg" style="height: 6px; border-radius: 3px;">
                        <div class="jar-progress-fill" style="width: ${percent}%; background: linear-gradient(90deg, #ff453a, #d70015); box-shadow: none;"></div>
                    </div>
                </div>
            `;
        });
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
        const payroll = appData[year][month].payroll || [];
        let totalAccrued = 0;
        payroll.forEach(emp => {
            const rate = parseFloat(emp.rate) || 0;
            const hours = parseFloat(emp.hours) || 0;
            const bonus = parseFloat(emp.bonus) || 0;
            const penalty = parseFloat(emp.penalty) || 0;
            totalAccrued += (rate * hours) + bonus - penalty;
        });
        return totalAccrued;
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
            trendHtml = `<div class="trend-badge trend-up" style="cursor: pointer; margin-bottom: 0;" onclick="event.stopPropagation()">
                            <span class="trend-main-text">↑ +${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#ff453a';
        } else if (currentTotal < prevTotal) {
            const diff = prevTotal > 0 ? (((prevTotal - currentTotal) / prevTotal) * 100).toFixed(1) : 100;
            trendHtml = `<div class="trend-badge trend-down" style="cursor: pointer; margin-bottom: 0;" onclick="event.stopPropagation()">
                            <span class="trend-main-text">↓ -${diff}%</span>
                            <span class="trend-hover-text">${diffMoneyText}</span>
                         </div>`;
            colorMain = '#32d74b';
        } else { 
            trendHtml = `<div class="trend-badge" style="background: rgba(255,255,255,0.1); color: #a1a1a6; margin-bottom: 0;" onclick="event.stopPropagation()">= Без змін</div>`; 
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
            container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">Немає співробітників</div>';
        }

        payroll.forEach(emp => {
            const rate = parseFloat(emp.rate) || 0; const hours = parseFloat(emp.hours) || 0; const bonus = parseFloat(emp.bonus) || 0;
            const penalty = parseFloat(emp.penalty) || 0; const advance = parseFloat(emp.advance) || 0; const paidPart = parseFloat(emp.paid_part) || 0;
            
            const accrued = (rate * hours) + bonus - penalty;
            let remaining = Math.max(0, accrued - advance - paidPart);
            
            totalAccruedGlobal += accrued;
            if (!emp.is_paid && remaining > 0) totalRemainingToPay += remaining;
            else remaining = 0;

            const paidClass = emp.is_paid ? 'background: rgba(46, 160, 67, 0.1); border-color: rgba(46, 160, 67, 0.3);' : 'background: rgba(0,0,0,0.3); border-color: rgba(255,255,255,0.05);';
            const bonusTag = bonus > 0 ? `<span style="font-size: 11px; background: rgba(50, 215, 75, 0.15); color: #32d74b; padding: 2px 6px; border-radius: 6px; margin-right: 4px;">Премія +${formatMoney(bonus)}</span>` : '';
            const penaltyTag = penalty > 0 ? `<span style="font-size: 11px; background: rgba(255, 69, 58, 0.15); color: #ff453a; padding: 2px 6px; border-radius: 6px;">Штраф -${formatMoney(penalty)}</span>` : '';

            const accountHtml = emp.account ? `
                <div style="font-size: 12px; font-weight: 600; color: var(--sys-blue); background: rgba(10, 132, 255, 0.1); padding: 6px 10px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; cursor: pointer; max-width: 100%; box-sizing: border-box;" onclick="copyAccountToClipboard(event, '${escapeAttr(emp.account)}')" title="Натисніть, щоб скопіювати">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span class="acc-text" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(emp.account)}</span>
                </div>
            ` : '';

            container.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: stretch; padding: 16px; border-radius: 16px; border: 1px solid transparent; ${paidClass} transition: 0.2s; min-height: 100px;">
                    <div style="flex: 1; min-width: 0; padding-right: 16px; display: flex; flex-direction: column; justify-content: center;">
                        <div style="font-weight: 700; color: white; font-size: 16px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(emp.name || 'Без імені')}</span>
                        </div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 6px;">${hours} год × ${rate} ₴</div>
                        <div style="display: flex; gap: 4px; flex-wrap: wrap;">${bonusTag}${penaltyTag}</div>
                        ${accountHtml}
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 16px; flex-shrink: 0;">
                        <div style="text-align: right; display: flex; flex-direction: column; justify-content: center;">
                            <div class="tabular" style="font-weight: 800; font-size: 18px; color: white; margin-bottom: 4px;">${formatMoney(accrued)} ₴</div>
                            <div class="tabular" style="font-size: 12px; color: ${emp.is_paid ? 'var(--sys-green)' : 'var(--sys-red)'}; font-weight: 600;">Залишок: ${formatMoney(remaining)} ₴</div>
                        </div>
                        
                        <div style="display: flex; gap: 8px; flex-direction: column; justify-content: center;">
                            <button class="btn-init-secondary" style="margin: 0; width: 44px; height: 44px; padding: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-primary);" onclick="openEmployeeModal('${escapeAttr(String(emp.id))}')" title="Редагувати">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            </button>
                            
                            <div class="schedule-input-group" style="margin: 0; width: 44px; height: 44px; background: ${emp.is_paid ? 'rgba(46, 160, 67, 0.15)' : 'rgba(255,255,255,0.05)'}; border-radius: 12px; border: 1px solid ${emp.is_paid ? 'rgba(46,160,67,0.3)' : 'rgba(255,255,255,0.1)'}; cursor: pointer; transition: 0.3s; display: flex; align-items: center; justify-content: center; box-sizing: border-box;" onclick="event.stopPropagation(); toggleEmployeePaid('${escapeAttr(String(emp.id))}')" title="${emp.is_paid ? 'Скасувати оплату' : 'Відмітити як оплачено'}">
                                ${emp.is_paid 
                                    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sys-green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' 
                                    : '<div style="width: 16px; height: 16px; border: 2px solid var(--text-secondary); border-radius: 4px; opacity: 0.5;"></div>'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        const modalAccrued = document.getElementById('modal-payroll-accrued');
        const modalRemaining = document.getElementById('modal-payroll-remaining');
        if(modalAccrued) modalAccrued.innerText = formatMoney(totalAccruedGlobal) + ' ₴';
        if(modalRemaining) modalRemaining.innerText = formatMoney(totalRemainingToPay) + ' ₴';

        const mainAmountEl = document.getElementById('payroll-total-amount');
        if (mainAmountEl) mainAmountEl.innerText = formatMoney(totalAccruedGlobal);
        
        const sparkData = generatePayrollSparklineHTML(totalAccruedGlobal);
        const trendBadgeEl = document.getElementById('payroll-trend-badge');
        const sparkContainerEl = document.getElementById('payroll-sparkline-container');
        if (trendBadgeEl) trendBadgeEl.innerHTML = sparkData.trendHtml;
        if (sparkContainerEl) sparkContainerEl.innerHTML = sparkData.sparklineSvg + `<div class="sparkline-labels">${sparkData.labelsHtml}</div>`;
    }

    function openEmployeeModal(empId) {
        document.getElementById('payroll-modal').classList.remove('active');
        document.getElementById('employee-modal').classList.add('active');
        
        let emp = null;
        if (empId) {
            emp = appData[currentYear][currentMonth].payroll.find(e => e.id === empId);
            document.getElementById('employee-modal-title').innerText = "Редагувати";
        } else {
            document.getElementById('employee-modal-title').innerText = "Новий співробітник";
        }

        document.getElementById('emp-edit-id').value = emp ? emp.id : '';
        document.getElementById('emp-edit-name').value = emp ? emp.name : '';
        document.getElementById('emp-edit-tax').value = emp ? emp.tax_id : '';
        document.getElementById('emp-edit-rate').value = emp ? emp.rate : '';
        document.getElementById('emp-edit-hours').value = emp ? emp.hours : '';
        document.getElementById('emp-edit-bonus').value = emp && emp.bonus != 0 ? emp.bonus : '';
        document.getElementById('emp-edit-penalty').value = emp && emp.penalty != 0 ? emp.penalty : '';
        document.getElementById('emp-edit-advance').value = emp && emp.advance != 0 ? emp.advance : '';
        document.getElementById('emp-edit-paidpart').value = emp && emp.paid_part != 0 ? emp.paid_part : '';
        document.getElementById('emp-edit-account').value = emp ? emp.account : '';
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

        const data = {
            name: name,
            tax_id: document.getElementById('emp-edit-tax').value,
            rate: document.getElementById('emp-edit-rate').value,
            hours: document.getElementById('emp-edit-hours').value,
            bonus: document.getElementById('emp-edit-bonus').value,
            penalty: document.getElementById('emp-edit-penalty').value,
            advance: document.getElementById('emp-edit-advance').value,
            paid_part: document.getElementById('emp-edit-paidpart').value,
            account: document.getElementById('emp-edit-account').value
        };

        if (id) {
            const emp = appData[currentYear][currentMonth].payroll.find(e => e.id === id);
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

    function deleteEmployee(id) {
        event.stopPropagation();
        showConfirm("Видалити співробітника?", "Ви впевнені, що хочете видалити цей запис з розрахунків?", () => {
            appData[currentYear][currentMonth].payroll = appData[currentYear][currentMonth].payroll.filter(e => e.id !== id);
            saveDataToServer();
            renderPayroll();
        });
    }

    function copyAccountToClipboard(event, text) {
        event.stopPropagation();
        const container = event.currentTarget;
        const textSpan = container.querySelector('.acc-text');
        const iconSvg = container.querySelector('svg');
        
        const originalText = textSpan.innerText;
        const originalBg = container.style.background;
        const originalColor = container.style.color;
        const originalIcon = iconSvg.innerHTML;
        
        const showSuccess = () => {
            textSpan.innerText = 'Скопійовано!';
            container.style.background = 'rgba(46, 160, 67, 0.15)'; 
            container.style.color = 'var(--sys-green)';
            iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
            setTimeout(() => { 
                textSpan.innerText = originalText; 
                container.style.background = originalBg;
                container.style.color = originalColor;
                iconSvg.innerHTML = originalIcon;
            }, 1500);
        };

        const fallbackCopy = () => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
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
            navigator.clipboard.writeText(text).then(showSuccess).catch(fallbackCopy);
        } else {
            fallbackCopy();
        }
    }

    function toggleEmployeePaid(id) {
        const emp = appData[currentYear][currentMonth].payroll.find(e => e.id === id);
        if (emp) {
            emp.is_paid = !emp.is_paid;
            saveDataToServer();
            renderPayroll();
        }
    }

    // ==========================================
    // 15. ЕКСПОРТ ДЛЯ ШІ (AI ANALYTICS)
    // ==========================================

    function generateAiFinancialPlanSection(incomeUah) {
        if (!currentUser || currentUser.account_type === 'business') return '';
        if (!incomeUah || incomeUah <= 0) return '';

        const fp = getFinancialPlan();
        const amounts = calc502030(incomeUah);
        const actuals = get502030ActualsFromExpenses(expenses);

        let str = `\n### ФІНАНСОВИЙ ПЛАН (50/30/20 та довгострокові цілі)\n`;
        if (currentExchangeRate > 0) {
            str += `Курс НБУ: ${formatMoney(currentExchangeRate)} ₴/$\n\n`;
        }

        str += `Правило 50/30/20 (рекомендовано vs факт):\n`;
        RULE_502030_ITEMS.forEach(item => {
            const rec = amounts[item.bucket];
            const act = actuals[item.bucket];
            const delta = act - rec;
            str += `  - ${item.label} (${item.pct}%): рекомендовано ${formatMoney(rec)} ₴, факт ${formatMoney(act)} ₴`;
            if (act > 0) str += ` (${delta > 0 ? '+' : ''}${formatMoney(delta)} ₴)`;
            str += `\n`;
        });

        const catsWithSpend = (expenses || []).filter(c => getCategoryTotal(c) > 0);
        if (catsWithSpend.length > 0) {
            str += `\nКатегорії витрат за групами 50/30/20:\n`;
            catsWithSpend.forEach(cat => {
                const bucket = getCategoryBudgetBucket(cat);
                str += `  - [${BUDGET_BUCKET_LABELS[bucket] || bucket}] ${cat.name}: ${formatMoney(getCategoryTotal(cat))} ₴\n`;
            });
        }

        const monthlyNeedsForCushion = actuals.needs > 0 ? actuals.needs : amounts.needs;
        const cushionBasis = actuals.needs > 0 ? 'фактичні потреби' : 'рекомендовані 50%';
        const cushionTarget = monthlyNeedsForCushion * 6;
        const cushionActual = getCushionBalanceUah();
        const cushionRemaining = Math.max(0, cushionTarget - cushionActual);
        const cushionPctDone = cushionTarget > 0 ? ((cushionActual / cushionTarget) * 100).toFixed(1) : '0';

        str += `\nПодушка безпеки (6 міс. потреб):\n`;
        str += `  - База: ${cushionBasis} — ${formatMoney(monthlyNeedsForCushion)} ₴/міс\n`;
        str += `  - Ціль: ${formatMoney(cushionTarget)} ₴\n`;
        str += `  - Накопичено (конверти «Подушка»): ${formatMoney(cushionActual)} ₴\n`;
        str += `  - Залишилось: ${formatMoney(cushionRemaining)} ₴ (${cushionPctDone}% виконано)\n`;

        const capitalTargetUsd = (fp.desiredMonthlyUsd || 0) * 12 * 25;
        const investmentJarsUah = getInvestmentJarsBalanceUah();
        const capitalCurrentUsd = (fp.brokerBalanceUsd || 0) + uahToUsd(investmentJarsUah);
        const monthlyInvestUsd = uahToUsd(amounts.savings);
        const yearsToCapital = calcYearsToCapital(capitalTargetUsd, capitalCurrentUsd, monthlyInvestUsd, fp.returnRatePct);

        str += `\nОсобистий капітал (правило ×25):\n`;
        str += `  - Бажані витрати: ${formatMoney(fp.desiredMonthlyUsd || 0)} $/міс\n`;
        str += `  - Цільовий капітал: ${formatMoney(capitalTargetUsd)} $ (${formatMoney(fp.desiredMonthlyUsd || 0)} × 12 × 25)\n`;
        str += `  - Накопичено: ${formatMoney(capitalCurrentUsd)} $ (брокер ${formatMoney(fp.brokerBalanceUsd || 0)} $ + інвест-конверти ≈${formatMoney(uahToUsd(investmentJarsUah))} $)\n`;
        if (currentExchangeRate > 0) str += `  - Ціль ≈ ${formatMoney(usdToUah(capitalTargetUsd))} ₴\n`;
        str += `  - Очікувана дохідність: ${fp.returnRatePct || 7}%/рік\n`;
        str += `  - При 20% (${formatMoney(monthlyInvestUsd)} $/міс): ${formatYearsLabel(yearsToCapital)} до цілі\n`;

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
    
    function openAiExportModal() {
        document.getElementById('ai-export-modal').classList.add('active');
        selectAiExportType('month');
        document.getElementById('ai-copy-text').innerText = "Скопіювати промпт для ШІ";
    }

    function closeAiExportModal(e) {
        if (!e || e.target.id === 'ai-export-modal' || e.target.closest('.btn-close-modal')) {
            document.getElementById('ai-export-modal').classList.remove('active');
        }
    }

    function selectAiExportType(type) {
        document.getElementById('ai-export-type').value = type;
        document.getElementById('btn-ai-month').classList.toggle('active', type === 'month');
        document.getElementById('btn-ai-all').classList.toggle('active', type === 'all');
    }

    function generateAndCopyAiPrompt() {
        const type = document.getElementById('ai-export-type').value;
        const isBiz = currentUser && currentUser.account_type === 'business';
        const profileTypeStr = isBiz ? 'Бізнес' : 'Особистий (фіз. особа)';
        
        let prompt = `Виступи в ролі професійного фінансового аналітика. Проаналізуй мої фінансові дані (Тип профілю: ${profileTypeStr}) та надай детальний звіт.\n`;
        prompt += `Зверни увагу на співвідношення доходів і витрат, правило 50/30/20 (потреби / бажання / збереження), фінансову подушку (6 міс. потреб), цільовий особистий капітал (правило ×25), типи конвертів та швидкість погашення боргів. Оціни, наскільки фактичні витрати відповідають рекомендаціям. Надай 3-5 конкретних і практичних рекомендацій щодо оптимізації бюджету та збільшення вільного капіталу.\n\n`;
        
        prompt += `### ПОТОЧНИЙ СТАН КАПІТАЛУ\n`;
        
        const jars = globalData.jars[currentUser.id] || [];
        const totalJars = jars.reduce((sum, j) => sum + j.balance, 0);
        prompt += `- Всього накопичень: ${totalJars.toFixed(2)} ₴\n`;
        jars.forEach(j => {
            const jarType = getJarType(j);
            const typeLabel = jarType !== 'regular' ? ` [${JAR_TYPE_LABELS[jarType] || jarType}]` : '';
            prompt += `  * ${j.name}${typeLabel}: ${j.balance} ₴ ${j.goal > 0 ? `(Ціль: ${j.goal} ₴)` : ''}\n`;
        });

        const debts = globalData.debts[currentUser.id] || [];
        const activeDebts = debts.filter(d => !d.is_archived || d.is_archived === 0);
        if (activeDebts.length > 0) {
            prompt += `\n### АКТИВНІ БОРГОВІ ЗОБОВ'ЯЗАННЯ\n`;
            activeDebts.forEach(d => {
                const remaining = getHistoricalDebtBalance(d.id, currentYear, currentMonth);
                prompt += `- ${d.name}: Залишок ${remaining.toFixed(2)} ${d.currency} із загальної суми ${d.total_amount} ${d.currency} (Ставка: ${d.interest_rate}%)\n`;
            });
        }

        if (!isBiz) {
            prompt += generateAiFinancialPlanSection(getMonthIncomeUah(currentYear, currentMonth));
        }

        prompt += `\n### РУХ КОШТІВ (CASH FLOW)\n`;

        if (type === 'month') {
            prompt += generateAiDataForMonth(currentYear, currentMonth, isBiz);
        } else {
            const years = Object.keys(appData).map(Number).sort((a,b) => a-b);
            years.forEach(y => {
                const months = Object.keys(appData[y]).map(Number).sort((a,b) => a-b);
                months.forEach(m => {
                    if (appData[y][m].initialized) {
                        prompt += generateAiDataForMonth(y, m, isBiz);
                    }
                });
            });
        }

        prompt += `\nНа основі цих даних, напиши свій висновок. Окремо проаналізуй дотримання правила 50/30/20, стан подушки безпеки та прогрес до особистого капіталу (×25). Вкажи на слабкі місця та дай поради.`;

        const btn = document.getElementById('btn-ai-copy');
        const btnText = document.getElementById('ai-copy-text');
        const originalBg = btn.style.background;

        const fallbackCopy = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                btnText.innerText = "Успішно скопійовано!";
                btn.style.background = 'linear-gradient(135deg, var(--sys-green), #1e702e)';
            } catch (err) {
                btnText.innerText = "Помилка копіювання";
            }
            document.body.removeChild(textArea);
            setTimeout(() => { closeAiExportModal(); btnText.innerText = "Скопіювати промпт для ШІ"; btn.style.background = originalBg; }, 2000);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(prompt).then(() => {
                btnText.innerText = "Успішно скопійовано!";
                btn.style.background = 'linear-gradient(135deg, var(--sys-green), #1e702e)';
                setTimeout(() => { closeAiExportModal(); btnText.innerText = "Скопіювати промпт для ШІ"; btn.style.background = originalBg; }, 2000);
            }).catch(() => fallbackCopy(prompt));
        } else {
            fallbackCopy(prompt);
        }
    }

    function generateAiDataForMonth(year, month, isBiz) {
        const data = appData[year][month];
        const monthName = monthNames[month];
        let str = `\n==== ПЕРІОД: ${monthName} ${year} ====\n`;

        let totalIncomeUah = 0;
        str += `Доходи:\n`;
        if (data.incomes && data.incomes.length > 0) {
            data.incomes.forEach(inc => {
                const amtUah = inc.currency === 'USD' ? (parseFloat(inc.amount) || 0) * currentExchangeRate : (parseFloat(inc.amount) || 0);
                totalIncomeUah += amtUah;
                str += `  - ${inc.name}: ${inc.amount} ${inc.currency}\n`;
            });
        }
        str += `  Загалом дохід: ${totalIncomeUah.toFixed(2)} ₴\n`;

        let totalCogs = 0;
        let totalPayroll = 0;
        
        if (isBiz) {
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
                    const accrued = ((parseFloat(emp.rate)||0) * (parseFloat(emp.hours)||0)) + (parseFloat(emp.bonus)||0) - (parseFloat(emp.penalty)||0);
                    totalPayroll += accrued;
                });
                str += `  - Всього нараховано ЗП: ${totalPayroll.toFixed(2)} ₴\n`;
            }
        }

        let totalExpenses = 0;
        str += `Витрати (Операційні / Особисті):\n`;
        if (data.expenses && data.expenses.length > 0) {
            data.expenses.forEach(cat => {
                const catTotal = cat.items.reduce((sum, item) => sum + (parseFloat(item.amount)||0), 0);
                if (catTotal > 0) {
                    totalExpenses += catTotal;
                    const bucketLabel = !isBiz ? `[${BUDGET_BUCKET_LABELS[getCategoryBudgetBucket(cat)] || '—'}] ` : '';
                    str += `  - ${bucketLabel}Категорія "${cat.name}": ${catTotal.toFixed(2)} ₴\n`;
                    cat.items.forEach(item => {
                        str += `      * ${item.name}: ${item.amount} ₴\n`;
                    });
                }
            });
        } else {
            str += `  - Немає витрат\n`;
        }

        if (!isBiz && totalIncomeUah > 0) {
            const amounts = calc502030(totalIncomeUah);
            const actuals = get502030ActualsFromExpenses(data.expenses || []);
            str += `Розподіл 50/30/20 за місяць:\n`;
            RULE_502030_ITEMS.forEach(item => {
                const rec = amounts[item.bucket];
                const act = actuals[item.bucket];
                const delta = act - rec;
                str += `  - ${item.label} (${item.pct}%): рекомендовано ${rec.toFixed(2)} ₴, факт ${act.toFixed(2)} ₴`;
                if (act > 0) str += ` (${delta > 0 ? '+' : ''}${delta.toFixed(2)} ₴)`;
                str += `\n`;
            });
        }

        const netProfit = totalIncomeUah - totalCogs - totalPayroll - totalExpenses;
        str += `Підсумок місяця:\n`;
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

    function getChoiceValues(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return '';
        const selected = Array.from(group.querySelectorAll('.choice-item.selected'));
        return selected.map(el => el.dataset.value).join('|');
    }

    function setChoiceValues(groupId, valuesStr) {
        const group = document.getElementById(groupId);
        if (!group || !valuesStr) return;
        const values = valuesStr.split('|');
        group.querySelectorAll('.choice-item').forEach(item => {
            if (values.includes(item.dataset.value)) item.classList.add('selected');
            else item.classList.remove('selected');
        });
    }

    function checkGrowthPromptButtonState() {
        const btn = document.getElementById('btn-ai-growth-copy');
        if (!btn) return;
        if (!currentUser || !currentUser.growthProfile || !currentUser.growthProfile.job) {
            btn.style.opacity = '0.5';
            btn.onclick = () => {
                closeAiExportModal();
                openGrowthModal();
            };
            document.getElementById('ai-growth-copy-text').innerText = "Спочатку заповніть анкету";
        } else {
            btn.style.opacity = '1';
            btn.onclick = generateAndCopyGrowthPrompt;
            document.getElementById('ai-growth-copy-text').innerText = "Промпт: Стратегія Росту";
        }
    }

    const oldOpenAiModal = openAiExportModal;
    openAiExportModal = function() {
        oldOpenAiModal();
        checkGrowthPromptButtonState();
    };

    function showGrowthStep(step) {
        const progress = (step / totalGrowthSteps) * 100;
        document.getElementById('growth-progress-bar').style.width = `${progress}%`;

        for (let i = 1; i <= totalGrowthSteps; i++) {
            document.getElementById(`growth-step-${i}`).style.display = 'none';
        }
        document.getElementById(`growth-step-${step}`).style.display = 'block';
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

        if (current === 4 && !getChoiceValues('growth-vector')) { return; }

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
        document.getElementById('growth-modal').classList.add('active');
        currentGrowthStep = 1;
        showGrowthStep(currentGrowthStep);

        if (currentUser && currentUser.growthProfile) {
            const gp = currentUser.growthProfile;
            document.getElementById('growth-job').value = gp.job || '';
            document.getElementById('growth-target-income').value = gp.targetIncome || '';
            document.getElementById('growth-skills').value = gp.skills || '';
            document.getElementById('growth-barrier').value = gp.barrier || '';
            
            if (gp.incomeType) setChoiceValues('growth-income-type', gp.incomeType);
            if (gp.period) setChoiceValues('growth-period', gp.period);
            if (gp.vector) setChoiceValues('growth-vector', gp.vector);
            if (gp.market) setChoiceValues('growth-market', gp.market);
            if (gp.time) setChoiceValues('growth-time', gp.time);
            if (gp.investment) setChoiceValues('growth-investment', gp.investment);
            if (gp.environment) setChoiceValues('growth-environment', gp.environment);
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

        const profile = {
            job: document.getElementById('growth-job').value,
            incomeType: getChoiceValues('growth-income-type'),
            targetIncome: document.getElementById('growth-target-income').value,
            period: getChoiceValues('growth-period'),
            skills: document.getElementById('growth-skills').value,
            vector: getChoiceValues('growth-vector'),
            market: getChoiceValues('growth-market'),
            time: getChoiceValues('growth-time'),
            investment: getChoiceValues('growth-investment'),
            environment: getChoiceValues('growth-environment'),
            barrier: document.getElementById('growth-barrier').value,
            financialPlan: (currentUser.growthProfile && currentUser.growthProfile.financialPlan) || getFinancialPlan(),
        };
        currentUser.growthProfile = profile;
        
        try {
            const token = localStorage.getItem('budget_auth_token');
            await fetch(`${API_URL}/api/profile`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                body: JSON.stringify({ userId: currentUser.id, growthProfile: profile }) 
            });
        } catch (e) { console.error("Помилка збереження профілю", e); }
        
        closeGrowthModal();
        openAiExportModal();
        setTimeout(generateAndCopyGrowthPrompt, 300);
    }

        function generateAndCopyGrowthPrompt() {
        if (!currentUser || !currentUser.growthProfile || !currentUser.growthProfile.job) return;
        const gp = currentUser.growthProfile;
        
        // Беремо період з перемикача модалки (За місяць чи За весь час)
        const type = document.getElementById('ai-export-type').value || 'month';
        const isBiz = currentUser && currentUser.account_type === 'business';
        
        let prompt = `Виступи в ролі топового кар'єрного Executive-коуча та фінансового стратега.\n`;
        prompt += `Моя мета: кардинально збільшити свій чистий дохід, оптимізувати поточні фінанси та отримати покроковий Roadmap (план дій).\n\n`;
        
        const formatAnswers = (str) => str ? str.split('|').join(', ') : '';

        prompt += `### ТОЧКА А (Хто я зараз)\n`;
        prompt += `- Моя поточна роль / ніша: ${gp.job}\n`;
        prompt += `- Джерела мого доходу: ${formatAnswers(gp.incomeType)}\n\n`;

        prompt += `### ТОЧКА Б (Куди я йду)\n`;
        prompt += `- Цільовий чистий дохід: ${gp.targetIncome} на місяць\n`;
        prompt += `- Дедлайн досягнення (мій горизонт): ${formatAnswers(gp.period)}\n`;
        prompt += `- Головний фокус зростання (Вектори): ${formatAnswers(gp.vector)}\n`;
        prompt += `- Цільовий ринок: ${formatAnswers(gp.market)}\n\n`;

        prompt += `### МІЙ АРСЕНАЛ (Суперсила та Ресурси)\n`;
        prompt += `- Що я роблю краще за інших (Топ-навички): ${gp.skills}\n`;
        prompt += `- Скільки часу можу приділяти розвитку: ${formatAnswers(gp.time)} на тиждень\n`;
        prompt += `- Мій бюджет на розвиток: ${formatAnswers(gp.investment)}\n`;
        prompt += `- Моє оточення зараз: ${formatAnswers(gp.environment)}\n\n`;

        prompt += `### ГОЛОВНИЙ БАР'ЄР (Саботаж)\n`;
        prompt += `- Відверто про те, що мені заважає діяти прямо зараз: ${gp.barrier}\n\n`;

        // ==== ДОДАЄМО ПОВНУ ФІНАНСОВУ МАТЕМАТИКУ ====
        prompt += `### МІЙ ФІНАНСОВИЙ ФУНДАМЕНТ (Тил)\n`;
        
        const jars = globalData.jars[currentUser.id] || [];
        const totalJars = jars.reduce((sum, j) => sum + j.balance, 0);
        prompt += `- Всього накопичень: ${totalJars.toFixed(2)} ₴\n`;
        jars.forEach(j => {
            const jarType = getJarType(j);
            const typeLabel = jarType !== 'regular' ? ` [${JAR_TYPE_LABELS[jarType] || jarType}]` : '';
            prompt += `  * ${j.name}${typeLabel}: ${j.balance} ₴ ${j.goal > 0 ? `(Ціль: ${j.goal} ₴)` : ''}\n`;
        });

        const debts = globalData.debts[currentUser.id] || [];
        const activeDebts = debts.filter(d => !d.is_archived || d.is_archived === 0);
        if (activeDebts.length > 0) {
            prompt += `\n- АКТИВНІ БОРГОВІ ЗОБОВ'ЯЗАННЯ:\n`;
            activeDebts.forEach(d => {
                const remaining = getHistoricalDebtBalance(d.id, currentYear, currentMonth);
                prompt += `  * ${d.name}: Залишок ${remaining.toFixed(2)} ${d.currency} із загальної суми ${d.total_amount} ${d.currency} (Ставка: ${d.interest_rate}% / міс)\n`;
            });
        }

        if (!isBiz) {
            prompt += generateAiFinancialPlanSection(getMonthIncomeUah(currentYear, currentMonth));
        }

        prompt += `\n### РУХ КОШТІВ (CASH FLOW)\n`;
        if (type === 'month') {
            prompt += generateAiDataForMonth(currentYear, currentMonth, isBiz);
        } else {
            const years = Object.keys(appData).map(Number).sort((a,b) => a-b);
            years.forEach(y => {
                const months = Object.keys(appData[y]).map(Number).sort((a,b) => a-b);
                months.forEach(m => {
                    if (appData[y][m].initialized) {
                        prompt += generateAiDataForMonth(y, m, isBiz);
                    }
                });
            });
        }

        prompt += `ВИМОГИ ДО ВІДПОВІДІ:\n`;
        prompt += `1. Не пиши воду і банальності. Дій як наставник, що бере $1000/год.\n`;
        prompt += `2. Проаналізуй мої витрати та борги. Якщо там є "дірки", які заважають мені інвестувати в ріст — прямо вкажи на них.\n`;
        prompt += `3. Проаналізуй мій бар'єр і дай жорстку, але дієву пораду, як його пробити.\n`;
        prompt += `4. Запропонуй конкретні моделі монетизації моїх навичок згідно з обраним вектором росту.\n`;
        prompt += `5. Побудуй Roadmap розбитий на ключові етапи.\n`;
        prompt += `6. Дай мені 3 задачі (Action steps) на найближчі 48 годин.\n`;
        prompt += `7. Врахуй фінансовий план (50/30/20, подушка 6 міс., капітал ×25): не пропонуй ризиковані кроки, поки подушка не закрита; вкажи, які категорії витрат порушують баланс.\n`;

        const btn = document.getElementById('btn-ai-growth-copy');
        const btnText = document.getElementById('ai-growth-copy-text');
        const originalBg = btn.style.background;

        const fallbackCopy = (text) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                btnText.innerText = "Успішно скопійовано!";
                btn.style.background = 'linear-gradient(135deg, var(--sys-green), #1e702e)';
            } catch (err) {}
            document.body.removeChild(textArea);
            setTimeout(() => { closeAiExportModal(); btnText.innerText = "Промпт: Стратегія Росту"; btn.style.background = originalBg; }, 2000);
        };

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(prompt).then(() => {
                btnText.innerText = "Успішно скопійовано!";
                btn.style.background = 'linear-gradient(135deg, var(--sys-green), #1e702e)';
                setTimeout(() => { closeAiExportModal(); btnText.innerText = "Промпт: Стратегія Росту"; btn.style.background = originalBg; }, 2000);
            }).catch(() => fallbackCopy(prompt));
        } else {
            fallbackCopy(prompt);
        }
    }

// Inline HTML handlers (onclick/onload) need window globals in ES modules.
Object.assign(window, {
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
  closeNewSupplierModal,
  closePayDebtModal,
  closePayrollModal,
  closeProfileSwitcher,
  closeScheduleModal,
  closeTransferModal,
  confirmAddSupplier,
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
  deleteProfile,
  deleteSubItem,
  enqueueSave,
  escapeAttr,
  escapeHtml,
  executeConfirm,
  executeDebtPayment,
  executeTransfer,
  fetchAvailableProfiles,
  fetchExchangeRate,
  filterSuppliers,
  flushSaveToServer,
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
  handleScheduleDragEnd,
  handleScheduleDragLeave,
  handleScheduleDragOver,
  handleScheduleDragStart,
  handleScheduleDrop,
  hardDeleteDebt,
  hideCreateProfile,
  init,
  initChart,
  initNewJarTypeDropdown,
  initializeMonth,
  isDebtActiveInCurrentMonth,
  jsId,
  loadAuthStats,
  loadDataFromServer,
  logout,
  newId,
  nextGrowthStep,
  openAiExportModal,
  openAnalyticsModal,
  openChangelogModal,
  openDebtsModal,
  openEmployeeModal,
  openEnvelopesModal,
  openGrowthModal,
  openInvoicesModal,
  openModal,
  openNewSupplierModal,
  openPayrollModal,
  openScheduleModal,
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
  saveFinancialPlan,
  saveGlobalData,
  saveGrowthProfile,
  scheduleSaveToServer,
  selectAiExportType,
  selectCOGSType,
  selectCategoryBucket,
  selectCurrency,
  selectDebtCurrency,
  selectInvoicePayment,
  selectJarTypeDropdown,
  selectMonth,
  selectNewJarType,
  selectProfileType,
  selectSupplier,
  selectTransferJar,
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
  startOtpCountdown,
  switchInvoiceTab,
  switchProfile,
  syncGlobalDebtBalance,
  toggleChoice,
  toggleEmployeePaid,
  toggleFinancialPlanSettings,
  togglePaidStatus,
  toggleProfileSwitcher,
  toggleRule502030Details,
  toggleSchedulePaid,
  toggleSupplierDropdown,
  uahToUsd,
  updateAll,
  updateBusinessHours,
  updateCOGS,
  updateCategoryName,
  updateChart,
  updateDebtsDisplay,
  updateFinancialPlanField,
  updateGlobalScheduleRemaining,
  updateIncome,
  updateMainJarBalance,
  updateProfileSwitcherUI,
  updateSavingsDisplay,
  updateScheduleAmount,
  updateSubItemAmount,
  updateSubItemName,
  updateTopSubItemBadges,
  usdToUah,
  verifyAuthOtp
});

document.addEventListener('DOMContentLoaded', () => {
  init();
});

