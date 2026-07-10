/**
 * 价值投资估值助手 - 应用逻辑
 * 基于段永平10年现金流折现估值模型
 * 后端：Supabase（优先）+ localStorage（兜底）
 */

// ==================== Supabase 配置 ====================
const SUPABASE_URL = 'https://sgdcztoirqpuitjwdrzl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnZGN6dG9pcnFwdWl0andkcnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NTk4MzAsImV4cCI6MjA5OTEzNTgzMH0.8Ju0fe3iFGkP80Wqqx3QNhQWujQ8xr-Ai1LJHo2JYQM';

// ==================== 状态标记 ====================
var supabase = null;
var useSupabase = false;  // 是否使用 Supabase（连不上则用 localStorage）

// 轻量级 Supabase RPC 备用：直接用 fetch，不依赖 206KB 外部库
function createRpcClient() {
    return {
        rpc: function(functionName, params) {
            return fetch(SUPABASE_URL + '/rest/v1/rpc/' + functionName, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(params || {})
            }).then(function(response) {
                return response.text().then(function(text) {
                    var data = null;
                    if (text) {
                        try { data = JSON.parse(text); } catch (e) { data = text; }
                    }
                    if (!response.ok) {
                        var message = (data && data.message) ? data.message : ('请求失败 ' + response.status);
                        return { data: null, error: { message: message } };
                    }
                    return { data: data, error: null };
                });
            }).catch(function(err) {
                return { data: null, error: { message: err.message || '网络错误' } };
            });
        }
    };
}

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

    // 本地库未加载/解析失败，使用轻量级 fetch 备用
    console.warn('Supabase.min.js not loaded, using fetch RPC fallback');
    try {
        supabase = createRpcClient();
        useSupabase = true;
        console.log('Supabase connected via fetch fallback');
        return true;
    } catch(e) {
        console.warn('Fetch fallback error:', e.message);
    }

    console.warn('Supabase unavailable, using localStorage');
    return false;
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

    // ===== 估值参数实时更新（JS 事件监听，双保险） =====
    // 数字输入框
    var numberInputs = ['param-profit', 'param-shares', 'param-price'];
    for (var i = 0; i < numberInputs.length; i++) {
        var inputEl = document.getElementById(numberInputs[i]);
        if (inputEl) {
            inputEl.addEventListener('input', function() { calculate(); });
            inputEl.addEventListener('change', function() { calculate(); });
        }
    }

    // 滑块
    var sliderConfigs = [
        { id: 'param-growth', display: 'param-growth-display' },
        { id: 'param-perpetual', display: 'param-perpetual-display' },
        { id: 'param-riskfree', display: 'param-riskfree-display' },
        { id: 'param-riskpremium', display: 'param-riskpremium-display' },
        { id: 'param-margin', display: 'param-margin-display' }
    ];
    for (var j = 0; j < sliderConfigs.length; j++) {
        (function(config) {
            var sliderEl = document.getElementById(config.id);
            if (sliderEl) {
                sliderEl.addEventListener('input', function() {
                    updateSliderDisplay(sliderEl, config.display);
                    calculate();
                });
                sliderEl.addEventListener('change', function() {
                    updateSliderDisplay(sliderEl, config.display);
                    calculate();
                });
            }
        })(sliderConfigs[j]);
    }

    // 搜索框回车查询
    var searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') searchStock();
        });
    }
}

// 启动
document.addEventListener('DOMContentLoaded', function() {
    initApp().catch(function(err) {
        console.error('App init error:', err);
        showScreen('login');
    });
});

// ==================== 快速查询（自动获取股票数据） ====================

var STOCK_DATA_URL = 'https://sgdcztoirqpuitjwdrzl.supabase.co/functions/v1/stock-data';

async function searchStock() {
    var input = document.getElementById('search-input');
    var query = input.value.trim();
    if (!query) {
        showToast('请输入公司名称或股票代码');
        return;
    }

    var btnEl = document.getElementById('btn-search');
    var loadingEl = document.getElementById('search-loading');
    var errorEl = document.getElementById('search-error');
    var resultEl = document.getElementById('search-result');

    // 显示加载状态
    btnEl.disabled = true;
    btnEl.textContent = '查询中';
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');

    try {
        var response = await fetch(STOCK_DATA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ query: query })
        });

        var data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        if (!data.success) {
            throw new Error('获取数据失败');
        }

        // 自动填充三个参数
        if (data.price) {
            var priceInput = document.getElementById('param-price');
            priceInput.value = data.price;
        }
        if (data.shares) {
            var sharesInput = document.getElementById('param-shares');
            sharesInput.value = data.shares;
        }
        if (data.profit) {
            var profitInput = document.getElementById('param-profit');
            profitInput.value = data.profit;
        }

        // 触发计算
        calculate();

        // 显示查询结果
        var nameEl = document.getElementById('search-result-name');
        var codeEl = document.getElementById('search-result-code');
        nameEl.textContent = data.name || query;
        codeEl.textContent = data.code + ' · ' + data.market;

        resultEl.classList.remove('hidden');

        // 净利润数据缺失提示
        if (!data.profit) {
            var errEl = document.getElementById('search-error-msg');
            errEl.textContent = '股价和总股本已自动填入，净利润数据暂未获取到，请手动输入';
            errorEl.classList.remove('hidden');
        }

        showToast('数据已自动填入');

    } catch (err) {
        console.error('searchStock error:', err);
        var errEl = document.getElementById('search-error-msg');
        errEl.textContent = err.message || '查询失败，请稍后重试';
        errorEl.classList.remove('hidden');
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = '查询';
        loadingEl.classList.add('hidden');
    }
}

// ==================== AI 智能分析 ====================

// 边缘函数代理地址（管理员配置后所有人都能用）
var AI_EDGE_FUNCTION_URL = 'https://sgdcztoirqpuitjwdrzl.supabase.co/functions/v1/ai-analyze';

// 个人 API Key 备用存储
var AI_KEYS = {
    apiKey: 'dyp_ai_apikey',
    model: 'dyp_ai_model'
};

function getAiConfig() {
    return {
        apiKey: localStorage.getItem(AI_KEYS.apiKey) || '',
        model: localStorage.getItem(AI_KEYS.model) || 'deepseek-chat'
    };
}

function saveAiConfig(apiKey, model) {
    localStorage.setItem(AI_KEYS.apiKey, apiKey);
    localStorage.setItem(AI_KEYS.model, model);
}

// 打开设置
function openSettings() {
    var config = getAiConfig();
    document.getElementById('settings-apikey').value = config.apiKey;
    document.getElementById('settings-model').value = config.model;
    document.getElementById('settings-status').textContent = '';
    document.getElementById('settings-status-info').classList.remove('hidden');
    document.getElementById('modal-settings').classList.remove('hidden');
}

// 关闭设置
function closeSettings() {
    document.getElementById('modal-settings').classList.add('hidden');
}

// 保存设置
function saveSettings() {
    var apiKey = document.getElementById('settings-apikey').value.trim();
    var model = document.getElementById('settings-model').value;

    // 允许清空（使用边缘函数模式）
    if (!apiKey) {
        saveAiConfig('', model);
        document.getElementById('settings-status').textContent = '✅ 已切换为云端模式（所有用户共用管理员配置）';
        document.getElementById('settings-status').className = 'modal-status modal-status-success';
        setTimeout(function() { closeSettings(); }, 1500);
        return;
    }
    if (apiKey.indexOf('sk-') !== 0) {
        document.getElementById('settings-status').textContent = 'API Key 格式错误，应以 sk- 开头';
        document.getElementById('settings-status').className = 'modal-status modal-status-error';
        return;
    }

    saveAiConfig(apiKey, model);
    document.getElementById('settings-status').textContent = '✅ 已切换为个人 Key 模式（仅本设备生效）';
    document.getElementById('settings-status').className = 'modal-status modal-status-success';
    setTimeout(function() { closeSettings(); }, 1500);
}

// AI 分析主函数：优先边缘函数 → 兜底个人 Key
async function analyzeCompany() {
    var company = document.getElementById('ai-company').value.trim();
    if (!company) {
        showToast('请输入公司名称或股票代码');
        return;
    }

    var loadingEl = document.getElementById('ai-loading');
    var resultEl = document.getElementById('ai-result');
    var errorEl = document.getElementById('ai-error');
    var btnEl = document.getElementById('btn-ai-analyze');

    loadingEl.classList.remove('hidden');
    resultEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    btnEl.disabled = true;
    btnEl.textContent = '分析中...';

    try {
        var response;

        // 策略1：优先走 Supabase 边缘函数（管理员配置后所有人都能用）
        response = await callEdgeFunction(company);
        if (response && !response.error) {
            // 边缘函数成功
            loadingEl.classList.add('hidden');
            resultEl.classList.remove('hidden');
            document.getElementById('ai-company-name').textContent = company;
            document.getElementById('ai-result-body').innerHTML = formatAiResponse(response.content);
            btnEl.disabled = false;
            btnEl.textContent = '分析';
            return;
        }

        // 策略2：边缘函数不通，尝试个人 API Key
        var config = getAiConfig();
        if (config.apiKey) {
            response = await callDeepSeekDirect(config.apiKey, config.model, company);
            if (response && !response.error) {
                loadingEl.classList.add('hidden');
                resultEl.classList.remove('hidden');
                document.getElementById('ai-company-name').textContent = company;
                document.getElementById('ai-result-body').innerHTML = formatAiResponse(response.content);
                btnEl.disabled = false;
                btnEl.textContent = '分析';
                return;
            }
            throw new Error(response.error || '个人 Key 调用失败');
        }

        // 两个都不通
        throw new Error('AI 服务暂不可用：云端未配置，且未设置个人 API Key。请联系管理员或点击右上角齿轮设置个人 Key。');

    } catch (err) {
        loadingEl.classList.add('hidden');
        errorEl.classList.remove('hidden');
        var errMsg = err.message || '未知错误';

        if (errMsg.indexOf('401') !== -1 || errMsg.indexOf('Authentication') !== -1) {
            errMsg = 'API Key 无效，请检查后重新设置';
        } else if (errMsg.indexOf('429') !== -1) {
            errMsg = 'API 调用频率超限或余额不足，请稍后再试';
        } else if (errMsg.indexOf('timeout') !== -1 || errMsg.indexOf('abort') !== -1) {
            errMsg = '请求超时，AI 分析需要较长时间，请重试';
        } else if (errMsg.indexOf('Failed to fetch') !== -1 || errMsg.indexOf('NetworkError') !== -1) {
            errMsg = '网络连接失败，请检查网络后重试';
        }

        document.getElementById('ai-error-msg').textContent = errMsg;
    } finally {
        btnEl.disabled = false;
        btnEl.textContent = '分析';
    }
}

// 策略1：调用 Supabase 边缘函数（管理员 Key，全员共享）
function callEdgeFunction(company) {
    return new Promise(function(resolve) {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 95000);

        fetch(AI_EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ company: company }),
            signal: controller.signal
        }).then(function(response) {
            clearTimeout(timeoutId);
            return response.json().then(function(data) {
                if (!response.ok || data.error) {
                    resolve({ error: data.error || ('HTTP ' + response.status) });
                    return;
                }
                resolve({ content: data.content, error: null });
            });
        }).catch(function(err) {
            clearTimeout(timeoutId);
            resolve({ error: err.message || '边缘函数不可用' });
        });
    });
}

// 策略2：直连 DeepSeek（个人 API Key，备用）
function callDeepSeekDirect(apiKey, model, company) {
    return new Promise(function(resolve) {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 95000);

        fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: '你是一位资深价值投资者，完全遵循巴菲特和段永平的投资哲学。请从商业模式护城河、财务健康、管理层、估值、风险等维度，深度分析用户指定的公司，给出综合评分和操作建议。用中文回答，结论明确。' },
                    { role: 'user', content: '请分析：' + company }
                ],
                temperature: 0.6,
                max_tokens: 4096,
                stream: false
            }),
            signal: controller.signal
        }).then(function(response) {
            clearTimeout(timeoutId);
            return response.json().then(function(data) {
                if (!response.ok) {
                    var errMsg = (data.error && data.error.message) ? data.error.message : ('HTTP ' + response.status);
                    resolve({ error: errMsg });
                    return;
                }
                if (data.choices && data.choices.length > 0) {
                    resolve({ content: data.choices[0].message.content, error: null });
                } else {
                    resolve({ error: 'AI 返回数据为空' });
                }
            });
        }).catch(function(err) {
            clearTimeout(timeoutId);
            resolve({ error: err.message || '网络错误' });
        });
    });
}

// 格式化 AI 回复（Markdown 简单渲染）
function formatAiResponse(text) {
    if (!text) return '<p>暂无分析结果</p>';

    // 转义 HTML
    var escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    var lines = escaped.split('\n');
    var html = '';
    var inList = false;
    var inOrderedList = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // 处理 ### 标题
        var h3Match = line.match(/^###\s+(.+)/);
        if (h3Match) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
            html += '<h3 class="ai-h3">' + h3Match[1] + '</h3>';
            continue;
        }

        // 处理 ## 标题
        var h2Match = line.match(/^##\s+(.+)/);
        if (h2Match) {
            if (inList) { html += '</ul>'; inList = false; }
            if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
            html += '<h2 class="ai-h2">' + h2Match[1] + '</h2>';
            continue;
        }

        // 处理无序列表项
        var ulMatch = line.match(/^[-*]\s+(.+)/);
        if (ulMatch) {
            if (!inList) { html += '<ul class="ai-ul">'; inList = true; }
            if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
            html += '<li>' + formatInlineMarkdown(ulMatch[1]) + '</li>';
            continue;
        }

        // 处理有序列表项
        var olMatch = line.match(/^\d+[\.\)]\s+(.+)/);
        if (olMatch) {
            if (inList) { html += '</ul>'; inList = false; }
            if (!inOrderedList) { html += '<ol class="ai-ol">'; inOrderedList = true; }
            html += '<li>' + formatInlineMarkdown(olMatch[1]) + '</li>';
            continue;
        }

        // 空行：关闭列表
        if (line.trim() === '') {
            if (inList) { html += '</ul>'; inList = false; }
            if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
            html += '<br>';
            continue;
        }

        // 普通段落
        if (inList) { html += '</ul>'; inList = false; }
        if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
        html += '<p class="ai-p">' + formatInlineMarkdown(line) + '</p>';
    }

    // 关闭未闭合的列表
    if (inList) { html += '</ul>'; }
    if (inOrderedList) { html += '</ol>'; }

    return html;
}

// 行内 Markdown 格式化（加粗、代码）
function formatInlineMarkdown(text) {
    // 加粗 **text**
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // 代码块（防止在已处理的 HTML 中出错）
    text = text.replace(/`([^`]+)`/g, '<code class="ai-code">$1</code>');

    // emoji 高亮 （🏆、📊、💡、⚠️ 等）
    text = text.replace(/([🏆📊💡⚠️✅❌📈📉🔴🟢🟡])/g, '<span class="ai-emoji">$1</span>');

    return text;
}

// 清除 AI 分析结果
function clearAiResult() {
    document.getElementById('ai-result').classList.add('hidden');
    document.getElementById('ai-error').classList.add('hidden');
    document.getElementById('ai-loading').classList.add('hidden');
    document.getElementById('ai-company').value = '';
}
