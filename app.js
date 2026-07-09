/**
 * 价值投资估值助手 - 应用逻辑
 * 基于段永平10年现金流折现估值模型
 * 后端：Supabase（优先）+ localStorage（兜底）
 */

// ==================== Supabase 配置 ====================
const SUPABASE_URL = 'https://sgdcztoirqpuitjwdrzl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZGN6dG9pcnFwdWl0andkcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTk4MzAsImV4cCI6MjA5OTEzNTgzMH0.8Ju0fe3iFGkP80Wqqx3QNhQWujQ8xr-Ai1LJHo2JYQM';

// ==================== 状态标记 ====================
let supabase = null;
let useSupabase = false;  // 是否使用 Supabase（连不上则用 localStorage）

// ==================== 工具函数 ====================

function sha256(text) {
    if (!text) return '';
    return new Promise(function(resolve) {
        var encoder = new TextEncoder();
        var data = encoder.encode(text);
        crypto.subtle.digest('SHA-256', data).then(function(hashBuffer) {
            var hashArray = Array.from(new Uint8Array(hashBuffer));
            resolve(hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join(''));
        });
    });
}

// localStorage 键名
const STORAGE_KEYS = {
    currentUser: 'valuation_current_user',
    localUsers: 'valuation_local_users',
    localInvites: 'valuation_local_invites'
};

// ==================== 动态加载 Supabase CDN ====================
function loadSupabaseCDN() {
    return new Promise(function(resolve) {
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.onload = function() { resolve(true); };
        script.onerror = function() { resolve(false); };
        document.head.appendChild(script);
    });
}

// ==================== 初始化 Supabase ====================
async function initSupabase() {
    // index.html 已优先加载本地 supabase.min.js
    if (window.supabase && window.supabase.createClient) {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            useSupabase = true;
            console.log('Supabase connected');
            return true;
        } catch(e) {
            console.warn('Supabase init error:', e.message);
        }
    }

    // 本地未加载成功，再尝试 CDN
    var cdnLoaded = await loadSupabaseCDN();
    if (!cdnLoaded) {
        console.warn('Supabase CDN failed to load, using localStorage');
        return false;
    }

    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        useSupabase = true;
        console.log('Supabase connected via CDN');
        return true;
    } catch(e) {
        console.warn('Supabase init error:', e.message);
        return false;
    }
}

// ==================== 会话管理 ====================
function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.currentUser) || 'null');
    } catch(e) { return null; }
}

function setCurrentUser(user) {
    if (user) {
        localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
    } else {
        localStorage.removeItem(STORAGE_KEYS.currentUser);
    }
}

// ==================== 本地存储模式的用户管理 ====================
function getLocalUsers() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.localUsers) || '{}');
    } catch(e) { return {}; }
}

function saveLocalUser(username, passwordHash, inviteCode) {
    var users = getLocalUsers();
    users[username.toLowerCase()] = {
        username: username,
        passwordHash: passwordHash,
        inviteCode: inviteCode
    };
    localStorage.setItem(STORAGE_KEYS.localUsers, JSON.stringify(users));
}

function getLocalInvites() {
    try {
        var invites = JSON.parse(localStorage.getItem(STORAGE_KEYS.localInvites));
        if (!invites || !Array.isArray(invites)) {
            // 初始化默认邀请码
            invites = [
                { code: 'ZS2026', is_used: false },
                { code: 'VALUE1', is_used: false },
                { code: 'DUANYP', is_used: false },
                { code: 'ZJJM66', is_used: false },
                { code: 'BUFFET', is_used: false }
            ];
            localStorage.setItem(STORAGE_KEYS.localInvites, JSON.stringify(invites));
        }
        return invites;
    } catch(e) {
        return [];
    }
}

function validateLocalInvite(code) {
    var invites = getLocalInvites();
    var found = false;
    for (var i = 0; i < invites.length; i++) {
        if (invites[i].code === code && !invites[i].is_used) {
            found = true;
            invites[i].is_used = true;
            invites[i].used_by = '';
            invites[i].used_at = new Date().toISOString();
            break;
        }
    }
    if (found) {
        localStorage.setItem(STORAGE_KEYS.localInvites, JSON.stringify(invites));
    }
    return found;
}

// ==================== Toast 提示 ====================
function showToast(message, duration) {
    duration = duration || 2000;
    var toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(function() {
        toast.classList.add('hidden');
    }, duration);
}

// ==================== 屏幕切换 ====================
function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.add('hidden');
    }
    var target = document.getElementById('screen-' + name);
    if (target) {
        target.classList.remove('hidden');
    }
}

// ==================== 登录 ====================
async function handleLogin() {
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value.trim();

    if (!username) { showToast('请输入用户名'); return; }
    if (!password) { showToast('请输入密码'); return; }

    showToast('登录中...', 10000);

    var passwordHash = await sha256(password);

    try {
        if (useSupabase && supabase) {
            // Supabase 模式
            var { data, error } = await supabase.rpc('login_user', {
                p_username: username,
                p_password_hash: passwordHash
            });

            if (error) throw error;

            if (data && data.length > 0) {
                setCurrentUser({
                    username: data[0].username,
                    passwordHash: passwordHash,
                    inviteCode: data[0].invite_code,
                    createdAt: data[0].created_at
                });
                showToast('登录成功');
                setTimeout(function() { showScreen('main'); calculate(); }, 500);
            } else {
                showToast('用户名或密码错误');
            }
        } else {
            // localStorage 模式
            var users = getLocalUsers();
            var key = username.toLowerCase();
            if (users[key] && users[key].passwordHash === passwordHash) {
                setCurrentUser({
                    username: users[key].username,
                    passwordHash: passwordHash,
                    inviteCode: users[key].inviteCode
                });
                showToast('登录成功（离线模式）');
                setTimeout(function() { showScreen('main'); calculate(); }, 500);
            } else {
                showToast('用户名或密码错误');
            }
        }
    } catch (err) {
        console.error('登录失败:', err);
        // Supabase 失败则降级到 localStorage
        if (useSupabase) {
            useSupabase = false;
            showToast('云端连接失败，尝试本地登录...');
            handleLogin();
            return;
        }
        showToast('登录失败：' + (err.message || '网络错误'));
    }
}

// ==================== 注册 ====================
async function handleRegister() {
    var inviteCode = document.getElementById('register-invite').value.trim().toUpperCase();
    var username = document.getElementById('register-username').value.trim();
    var password = document.getElementById('register-password').value.trim();
    var password2 = document.getElementById('register-password2').value.trim();

    if (!inviteCode) { showToast('请输入邀请码'); return; }
    if (!username) { showToast('请设置用户名'); return; }
    if (username.length < 2) { showToast('用户名至少2个字符'); return; }
    if (username.toLowerCase() === 'admin') { showToast('该用户名不可用'); return; }
    if (!password) { showToast('请设置密码'); return; }
    if (password.length < 6) { showToast('密码至少6位'); return; }
    if (password !== password2) { showToast('两次密码不一致'); return; }

    showToast('注册中...', 10000);

    var passwordHash = await sha256(password);

    try {
        if (useSupabase && supabase) {
            // 验证邀请码
            var { data: validData, error: validErr } = await supabase.rpc('validate_invite_code', {
                p_code: inviteCode
            });

            if (validErr) throw validErr;
            if (!validData) {
                showToast('邀请码无效或已使用');
                return;
            }

            // 注册
            var { data: regData, error: regErr } = await supabase.rpc('register_user', {
                p_username: username,
                p_password_hash: passwordHash,
                p_code: inviteCode
            });

            if (regErr) throw regErr;
            if (!regData) {
                showToast('注册失败：用户名已存在或邀请码已使用');
                return;
            }

            showToast('注册成功！请登录');
            setTimeout(function() { showScreen('login'); }, 1000);

        } else {
            // localStorage 模式
            var users = getLocalUsers();
            if (users[username.toLowerCase()]) {
                showToast('用户名已存在');
                return;
            }

            var ok = validateLocalInvite(inviteCode);
            if (!ok) {
                showToast('邀请码无效或已使用');
                return;
            }

            saveLocalUser(username, passwordHash, inviteCode);
            showToast('注册成功！请登录（离线模式）');
            setTimeout(function() { showScreen('login'); }, 1000);
        }
    } catch (err) {
        console.error('注册失败:', err);
        if (useSupabase) {
            useSupabase = false;
            showToast('云端连接失败，尝试本地注册...');
            handleRegister();
            return;
        }
        showToast('注册失败：' + (err.message || '网络错误'));
    }
}

// ==================== 退出登录 ====================
function handleLogout() {
    setCurrentUser(null);
    showScreen('login');
}

// ==================== 滑块显示 ====================
function updateSliderDisplay(slider, displayId) {
    var display = document.getElementById(displayId);
    var value = parseFloat(slider.value);
    display.textContent = value + '%';
}

// ==================== 详情表格展开/收起 ====================
function toggleDetail() {
    var table = document.getElementById('detail-table');
    var toggle = document.getElementById('toggle-detail');
    if (table.classList.contains('hidden')) {
        table.classList.remove('hidden');
        toggle.textContent = '收起';
    } else {
        table.classList.add('hidden');
        toggle.textContent = '展开';
    }
}

// ==================== 核心估值计算 ====================
function calculate() {
    var profit = parseFloat(document.getElementById('param-profit').value) || 0;
    var shares = parseFloat(document.getElementById('param-shares').value) || 0;
    var price = parseFloat(document.getElementById('param-price').value) || 0;
    var growth = parseFloat(document.getElementById('param-growth').value) / 100;
    var perpetual = parseFloat(document.getElementById('param-perpetual').value) / 100;
    var riskFree = parseFloat(document.getElementById('param-riskfree').value) / 100;
    var riskPremium = parseFloat(document.getElementById('param-riskpremium').value) / 100;
    var margin = parseFloat(document.getElementById('param-margin').value) / 100;

    var discountRate = riskFree + riskPremium;
    document.getElementById('discount-rate').textContent = (discountRate * 100).toFixed(1) + '%';

    var yearlyData = [];
    var totalPV = 0;

    for (var year = 1; year <= 10; year++) {
        var yearProfit = profit * Math.pow(1 + growth, year);
        var discountFactor = 1 / Math.pow(1 + discountRate, year);
        var presentValue = yearProfit * discountFactor;
        totalPV += presentValue;
        yearlyData.push({
            year: year,
            profit: yearProfit,
            factor: discountFactor,
            pv: presentValue
        });
    }

    var year10Profit = yearlyData[9].profit;
    var year11Profit = year10Profit * (1 + perpetual);
    var perpetualValue = 0;
    var perpetualPV = 0;

    if (discountRate > perpetual) {
        perpetualValue = year11Profit / (discountRate - perpetual);
        perpetualPV = perpetualValue / Math.pow(1 + discountRate, 10);
    }

    var totalValue = totalPV + perpetualPV;
    var intrinsicValuePerShare = shares > 0 ? totalValue / shares : 0;
    var safeBuyPrice = intrinsicValuePerShare * margin;
    var premiumRate = intrinsicValuePerShare > 0 ? (price - intrinsicValuePerShare) / intrinsicValuePerShare : 0;

    document.getElementById('result-intrinsic-value').textContent = formatMoney(intrinsicValuePerShare);
    document.getElementById('result-safe-price').textContent = formatMoney(safeBuyPrice);
    document.getElementById('result-current-price').textContent = formatMoney(price);
    document.getElementById('result-premium').textContent = formatPercent(premiumRate);

    updateDetailTable(yearlyData, totalPV, perpetualPV);
    updateEvaluation(premiumRate, price, safeBuyPrice, intrinsicValuePerShare);
}

function formatMoney(value) {
    return '\u00A5' + value.toFixed(2);
}

function formatPercent(value) {
    var pct = (value * 100).toFixed(1);
    return value > 0 ? '+' + pct + '%' : pct + '%';
}

function updateDetailTable(yearlyData, totalPV, perpetualPV) {
    var container = document.getElementById('detail-rows');
    var html = '';
    for (var i = 0; i < yearlyData.length; i++) {
        var d = yearlyData[i];
        html += '<div class="detail-row">';
        html += '<span class="col-year">第' + d.year + '年</span>';
        html += '<span class="col-profit">' + d.profit.toFixed(2) + '</span>';
        html += '<span class="col-factor">' + (d.factor * 100).toFixed(2) + '%</span>';
        html += '<span class="col-pv">' + d.pv.toFixed(2) + '</span>';
        html += '</div>';
    }
    container.innerHTML = html;
    document.getElementById('detail-total').textContent = totalPV.toFixed(2);
    document.getElementById('detail-perpetual').textContent = perpetualPV.toFixed(2);
}

function updateEvaluation(premiumRate, price, safeBuyPrice, intrinsicValue) {
    var card = document.getElementById('evaluation-card');
    var icon = document.getElementById('eval-icon');
    var label = document.getElementById('eval-label');
    var icon2 = document.getElementById('eval-icon2');
    var action = document.getElementById('eval-action');
    var advice = document.getElementById('eval-advice');

    card.className = 'result-card evaluation-card';
    var evalText, actionText, adviceText, colorClass;

    if (premiumRate <= -0.2) {
        evalText = '估值偏低，有安全边际';
        colorClass = 'eval-low';
        adviceText = '建议：可分批买入，长期持有，享受公司成长收益';
    } else if (premiumRate <= 0) {
        evalText = '估值合理，处于合理区间';
        colorClass = 'eval-reasonable';
        adviceText = '建议：可小仓位买入，设置好止损，长期跟踪公司业绩';
    } else if (premiumRate <= 0.2) {
        evalText = '估值轻度偏高';
        colorClass = 'eval-high';
        adviceText = '建议：暂时观望，等待股价回落至合理区间再考虑';
    } else if (premiumRate <= 0.5) {
        evalText = '估值中度偏高';
        colorClass = 'eval-high';
        adviceText = '建议：避免买入，已持有的可考虑减仓';
    } else {
        evalText = '估值严重偏高';
        colorClass = 'eval-high';
        adviceText = '建议：坚决不买入，已持有的建议清仓规避风险';
    }

    if (price <= safeBuyPrice) {
        actionText = '非常适合，已进入安全边际区间';
    } else if (price <= intrinsicValue) {
        actionText = '可以买入，估值处于合理区间';
    } else {
        actionText = '不适合买入，估值已偏高';
    }

    label.textContent = evalText;
    action.textContent = actionText;
    advice.textContent = adviceText;
    card.classList.add(colorClass);
    icon.textContent = '\u25CF';
    icon2.textContent = '\u25CF';
}

// ==================== 初始化 ====================
async function initApp() {
    // 尝试连接 Supabase（5秒超时）
    var connected = await initSupabase();

    if (!connected) {
        console.log('Supabase unavailable, running in offline mode');
        useSupabase = false;
    }

    // 检查登录状态
    var currentUser = getCurrentUser();
    if (currentUser && currentUser.username) {
        showScreen('main');
        calculate();
    } else {
        showScreen('login');
    }

    // 回车键登录
    var loginPassword = document.getElementById('login-password');
    if (loginPassword) {
        loginPassword.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }

    var registerPassword2 = document.getElementById('register-password2');
    if (registerPassword2) {
        registerPassword2.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleRegister();
        });
    }

    // 邀请码自动大写
    var registerInvite = document.getElementById('register-invite');
    if (registerInvite) {
        registerInvite.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    }
}

// 启动
document.addEventListener('DOMContentLoaded', function() {
    initApp().catch(function(err) {
        console.error('App init error:', err);
        // 兜底：直接显示登录页
        showScreen('login');
    });
});
