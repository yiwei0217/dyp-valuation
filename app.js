/**
 * 价值投资估值助手 - 应用逻辑
 * 基于段永平10年现金流折现估值模型
 * 后端：Supabase
 */

// ==================== Supabase 配置 ====================
// 请替换为你自己的 Supabase 项目信息
const SUPABASE_URL = 'https://ufiqbjriueqchbkvnwr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmaXFianJiaXVlcWNoYmt2bndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1NDcwMjUsImV4cCI6MjA5OTEyMzAyNX0.e4o37LSsc8cdlXsClvqoUC9TO3UNMlc6sr7sm-CYU6Y';

// 初始化 Supabase 客户端
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==================== 工具函数 ====================

// SHA-256 哈希（用于密码）
async function sha256(text) {
    if (!text) return '';
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// localStorage 键名（仅用于保存当前登录会话）
const STORAGE_KEYS = {
    currentUser: 'valuation_current_user'
};

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

    if (!username) {
        showToast('请输入用户名');
        return;
    }
    if (!password) {
        showToast('请输入密码');
        return;
    }

    showToast('登录中...', 10000);

    try {
        var passwordHash = await sha256(password);
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
            setTimeout(function() {
                showScreen('main');
                calculate();
            }, 500);
        } else {
            showToast('用户名或密码错误');
        }
    } catch (err) {
        console.error('登录失败:', err);
        showToast('登录失败：' + (err.message || '网络错误'));
    }
}

// ==================== 注册 ====================
async function handleRegister() {
    var inviteCode = document.getElementById('register-invite').value.trim().toUpperCase();
    var username = document.getElementById('register-username').value.trim();
    var password = document.getElementById('register-password').value.trim();
    var password2 = document.getElementById('register-password2').value.trim();

    // 验证邀请码
    if (!inviteCode) {
        showToast('请输入邀请码');
        return;
    }

    // 验证用户名
    if (!username) {
        showToast('请设置用户名');
        return;
    }
    if (username.length < 2) {
        showToast('用户名至少2个字符');
        return;
    }
    if (username.toLowerCase() === 'admin') {
        showToast('该用户名不可用');
        return;
    }

    // 验证密码
    if (!password) {
        showToast('请设置密码');
        return;
    }
    if (password.length < 6) {
        showToast('密码至少6位');
        return;
    }
    if (password !== password2) {
        showToast('两次密码不一致');
        return;
    }

    showToast('注册中...', 10000);

    try {
        var passwordHash = await sha256(password);
        var { data, error } = await supabase.rpc('register_user', {
            p_username: username,
            p_password_hash: passwordHash,
            p_code: inviteCode
        });

        if (error) throw error;

        if (data === true) {
            showToast('注册成功，请登录');
            setTimeout(function() {
                document.getElementById('register-invite').value = '';
                document.getElementById('register-username').value = '';
                document.getElementById('register-password').value = '';
                document.getElementById('register-password2').value = '';
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').value = '';
                showScreen('login');
            }, 800);
        } else {
            showToast('邀请码无效或用户名已存在');
        }
    } catch (err) {
        console.error('注册失败:', err);
        showToast('注册失败：' + (err.message || '网络错误'));
    }
}

// ==================== 退出登录 ====================
function handleLogout() {
    setCurrentUser(null);
    showScreen('login');
    document.getElementById('login-password').value = '';
}

// ==================== 滑块显示更新 ====================
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
    // 获取输入参数
    var profit = parseFloat(document.getElementById('param-profit').value) || 0;       // 当前净利润（亿元）
    var shares = parseFloat(document.getElementById('param-shares').value) || 0;       // 总股本（亿股）
    var price = parseFloat(document.getElementById('param-price').value) || 0;         // 当前股价（元/股）
    var growth = parseFloat(document.getElementById('param-growth').value) / 100;      // 10年复合增长率
    var perpetual = parseFloat(document.getElementById('param-perpetual').value) / 100;// 永续增长率
    var riskFree = parseFloat(document.getElementById('param-riskfree').value) / 100;  // 无风险折现率
    var riskPremium = parseFloat(document.getElementById('param-riskpremium').value) / 100; // 风险溢价
    var margin = parseFloat(document.getElementById('param-margin').value) / 100;      // 安全边际折扣

    // 合计折现率
    var discountRate = riskFree + riskPremium;
    document.getElementById('discount-rate').textContent = (discountRate * 100).toFixed(1) + '%';

    // 10年现金流折现计算
    var yearlyData = [];
    var totalPV = 0; // 10年现值合计（亿元）

    for (var year = 1; year <= 10; year++) {
        var yearProfit = profit * Math.pow(1 + growth, year);           // 当年净利润（亿元）
        var discountFactor = 1 / Math.pow(1 + discountRate, year);      // 折现系数
        var presentValue = yearProfit * discountFactor;                  // 当年净利润现值（亿元）
        totalPV += presentValue;
        yearlyData.push({
            year: year,
            profit: yearProfit,
            factor: discountFactor,
            pv: presentValue
        });
    }

    // 永续价值计算
    var year10Profit = yearlyData[9].profit;                                    // 第10年末净利润（亿元）
    var year11Profit = year10Profit * (1 + perpetual);                         // 第11年净利润（亿元）
    var perpetualValue = 0;
    var perpetualPV = 0;

    if (discountRate > perpetual) {
        perpetualValue = year11Profit / (discountRate - perpetual);            // 第10年末永续价值（亿元）
        perpetualPV = perpetualValue / Math.pow(1 + discountRate, 10);         // 永续价值折现到当前现值（亿元）
    }

    // 企业总内在价值现值（亿元）
    var totalValue = totalPV + perpetualPV;

    // 每股内在价值（元/股）
    var intrinsicValuePerShare = shares > 0 ? totalValue / shares : 0;

    // 安全边际买入价（元/股）
    var safeBuyPrice = intrinsicValuePerShare * margin;

    // 溢价率
    var premiumRate = intrinsicValuePerShare > 0 ? (price - intrinsicValuePerShare) / intrinsicValuePerShare : 0;

    // 更新结果显示
    document.getElementById('result-intrinsic-value').textContent = formatMoney(intrinsicValuePerShare);
    document.getElementById('result-safe-price').textContent = formatMoney(safeBuyPrice);
    document.getElementById('result-current-price').textContent = formatMoney(price);
    document.getElementById('result-premium').textContent = formatPercent(premiumRate);

    // 更新详情表格
    updateDetailTable(yearlyData, totalPV, perpetualPV);

    // 更新评价
    updateEvaluation(premiumRate, price, safeBuyPrice, intrinsicValuePerShare);
}

// ==================== 格式化工具 ====================
function formatMoney(value) {
    return '¥' + value.toFixed(2);
}

function formatPercent(value) {
    var pct = (value * 100).toFixed(1);
    if (value > 0) {
        return '+' + pct + '%';
    }
    return pct + '%';
}

// ==================== 更新详情表格 ====================
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

// ==================== 更新评价 ====================
function updateEvaluation(premiumRate, price, safeBuyPrice, intrinsicValue) {
    var card = document.getElementById('evaluation-card');
    var icon = document.getElementById('eval-icon');
    var label = document.getElementById('eval-label');
    var icon2 = document.getElementById('eval-icon2');
    var action = document.getElementById('eval-action');
    var advice = document.getElementById('eval-advice');

    // 清除旧的颜色类
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

    // 买入建议
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

    // 添加颜色类
    card.classList.add(colorClass);
    icon.textContent = '\u25CF';
    icon2.textContent = '\u25CF';
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
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

    // 邀请码输入自动大写
    var registerInvite = document.getElementById('register-invite');
    if (registerInvite) {
        registerInvite.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    }
});
