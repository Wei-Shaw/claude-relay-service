const { createApp } = Vue;

const app = createApp({
    data() {
        return {
            isLoggedIn: false,
            authToken: localStorage.getItem('authToken'),
            activeTab: 'dashboard',
            
            // Toast 通知
            toasts: [],
            toastIdCounter: 0,
            
            // 登录相关
            loginForm: {
                username: '',
                password: ''
            },
            loginLoading: false,
            loginError: '',
            
            // 标签页
            tabs: [
                { key: 'dashboard', name: '仪表板', icon: 'fas fa-tachometer-alt' },
                { key: 'apiKeys', name: 'API Keys', icon: 'fas fa-key' },
                { key: 'accounts', name: 'Claude账户', icon: 'fas fa-user-circle' },
                { key: 'tutorial', name: '使用教程', icon: 'fas fa-graduation-cap' }
            ],
            
            // 教程系统选择
            activeTutorialSystem: 'windows',
            tutorialSystems: [
                { key: 'windows', name: 'Windows', icon: 'fab fa-windows' },
                { key: 'macos', name: 'macOS', icon: 'fab fa-apple' },
                { key: 'linux', name: 'Linux / WSL2', icon: 'fab fa-ubuntu' }
            ],
            
            // 模型统计
            modelStats: [],
            modelStatsLoading: false,
            modelStatsPeriod: 'daily',
            
            // 数据
            dashboardData: {
                totalApiKeys: 0,
                activeApiKeys: 0,
                totalAccounts: 0,
                activeAccounts: 0,
                todayRequests: 0,
                totalRequests: 0,
                todayTokens: 0,
                todayInputTokens: 0,
                todayOutputTokens: 0,
                totalTokens: 0,
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalCacheCreateTokens: 0,
                totalCacheReadTokens: 0,
                todayCacheCreateTokens: 0,
                todayCacheReadTokens: 0,
                systemRPM: 0,
                systemTPM: 0,
                systemStatus: '正常',
                uptime: 0
            },
            
            // 价格数据
            costsData: {
                todayCosts: { totalCost: 0, formatted: { totalCost: '$0.000000' } },
                totalCosts: { totalCost: 0, formatted: { totalCost: '$0.000000' } }
            },
            
            // 仪表盘模型统计
            dashboardModelStats: [],
            dashboardModelPeriod: 'daily',
            modelUsageChart: null,
            usageTrendChart: null,
            trendPeriod: 7,
            trendData: [],
            
            // 统一的日期筛选
            dateFilter: {
                type: 'preset', // preset 或 custom
                preset: '7days', // today, 7days, 30days
                customStart: '',
                customEnd: '',
                customRange: null, // Element Plus日期范围选择器的值
                presetOptions: [
                    { value: 'today', label: '今天', days: 1 },
                    { value: '7days', label: '近7天', days: 7 },
                    { value: '30days', label: '近30天', days: 30 }
                ]
            },
            showDateRangePicker: false, // 日期范围选择器显示状态
            dateRangeInputValue: '', // 日期范围显示文本
            
            // API Keys
            apiKeys: [],
            apiKeysLoading: false,
            showCreateApiKeyModal: false,
            createApiKeyLoading: false,
            apiKeyForm: {
                name: '',
                tokenLimit: '',
                description: '',
                concurrencyLimit: '',
                claudeAccountId: ''
            },
            apiKeyModelStats: {}, // 存储每个key的模型统计数据
            expandedApiKeys: {}, // 跟踪展开的API Keys
            apiKeyModelPeriod: 'monthly', // API Key模型统计期间
            
            // API Keys的日期筛选（每个API Key独立）
            apiKeyDateFilters: {}, // 存储每个API Key的独立日期筛选状态
            apiKeyDateFilterDefaults: {
                type: 'preset', // preset 或 custom
                preset: '7days', // today, 7days, 30days
                customStart: '',
                customEnd: '',
                customRange: null, // Element Plus日期范围选择器的值
                presetOptions: [
                    { value: 'today', label: '今天', days: 1 },
                    { value: '7days', label: '近7天', days: 7 },
                    { value: '30days', label: '近30天', days: 30 }
                ]
            },
            
            // 新创建的API Key展示弹窗
            showNewApiKeyModal: false,
            newApiKey: {
                key: '',
                name: '',
                description: '',
                showFullKey: false
            },

            // 编辑API Key
            showEditApiKeyModal: false,
            editApiKeyLoading: false,
            editApiKeyForm: {
                id: '',
                name: '',
                tokenLimit: '',
                concurrencyLimit: '',
                claudeAccountId: ''
            },
            
            // 账户
            accounts: [],
            accountsLoading: false,
            showCreateAccountModal: false,
            createAccountLoading: false,
            accountForm: {
                name: '',
                description: '',
                addType: 'oauth', // 'oauth' 或 'manual'
                accountType: 'shared', // 'shared' 或 'dedicated'
                accessToken: '',
                refreshToken: '',
                proxyType: '',
                proxyHost: '',
                proxyPort: '',
                proxyUsername: '',
                proxyPassword: ''
            },
            
            // 编辑账户相关
            showEditAccountModal: false,
            editAccountLoading: false,
            editAccountForm: {
                id: '',
                name: '',
                description: '',
                accountType: 'shared',
                originalAccountType: 'shared',
                accessToken: '',
                refreshToken: '',
                proxyType: '',
                proxyHost: '',
                proxyPort: '',
                proxyUsername: '',
                proxyPassword: ''
            },
            
            // OAuth 相关
            oauthStep: 1,
            authUrlLoading: false,
            oauthData: {
                sessionId: '',
                authUrl: '',
                callbackUrl: ''
            },
            
            // 用户菜单和账户修改相关
            userMenuOpen: false,
            currentUser: {
                username: ''
            },
            showChangePasswordModal: false,
            changePasswordLoading: false,
            changePasswordForm: {
                newUsername: '',
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            },
            
        }
    },
    
    computed: {
        // 动态计算BASE_URL
        currentBaseUrl() {
            return `${window.location.protocol}//${window.location.host}/api/`;
        },
        
        // 获取专属账号列表
        dedicatedAccounts() {
            return this.accounts.filter(account => 
                account.accountType === 'dedicated' && account.isActive === true
            );
        }
    },
    
    mounted() {
        console.log('Vue app mounted, authToken:', !!this.authToken, 'activeTab:', this.activeTab);
        
        // 初始化防抖函数
        this.setTrendPeriod = this.debounce(this._setTrendPeriod, 300);
        
        // 添加全局点击事件监听器，用于关闭用户菜单
        document.addEventListener('click', (event) => {
            // 检查点击是否在用户菜单区域外部
            const isClickInsideUserMenu = event.target.closest('.user-menu-container');
            
            if (!isClickInsideUserMenu) {
                this.userMenuOpen = false;
            }
        });
        
        if (this.authToken) {
            this.isLoggedIn = true;
            
            // 加载当前用户信息
            this.loadCurrentUser();
            
            // 初始化日期筛选器和图表数据
            this.initializeDateFilter();
            
            // 预加载账号列表，以便在API Keys页面能正确显示绑定账号名称
            this.loadAccounts().then(() => {
                // 根据当前活跃标签页加载数据
                this.loadCurrentTabData();
            });
            // 如果在仪表盘，等待Chart.js加载后初始化图表
            if (this.activeTab === 'dashboard') {
                this.waitForChartJS().then(() => {
                    this.loadDashboardModelStats();
                    this.loadUsageTrend();
                });
            }
        } else {
            console.log('No auth token found, user needs to login');
        }
    },
    
    beforeUnmount() {
        this.cleanupCharts();
    },
    
    watch: {
        activeTab: {
            handler(newTab, oldTab) {
                console.log('Tab changed from:', oldTab, 'to:', newTab);
                
                // 如果离开仪表盘标签页，清理图表
                if (oldTab === 'dashboard' && newTab !== 'dashboard') {
                    this.cleanupCharts();
                }
                
                this.loadCurrentTabData();
            },
            immediate: false
        }
    },
    
    methods: {
        // 获取绑定账号名称
        getBoundAccountName(accountId) {
            const account = this.accounts.find(acc => acc.id === accountId);
            return account ? account.name : '未知账号';
        },
        
        // 获取绑定到特定账号的API Key数量
        getBoundApiKeysCount(accountId) {
            return this.apiKeys.filter(key => key.claudeAccountId === accountId).length;
        },
        
        // Toast 通知方法
        showToast(message, type = 'info', title = null, duration = 5000) {
            const id = ++this.toastIdCounter;
            const toast = {
                id,
                message,
                type,
                title,
                show: false
            };
            
            this.toasts.push(toast);
            
            // 延迟显示动画
            setTimeout(() => {
                const toastIndex = this.toasts.findIndex(t => t.id === id);
                if (toastIndex !== -1) {
                    this.toasts[toastIndex].show = true;
                }
            }, 100);
            
            // 自动移除
            if (duration > 0) {
                setTimeout(() => {
                    this.removeToast(id);
                }, duration);
            }
        },
        
        removeToast(id) {
            const index = this.toasts.findIndex(t => t.id === id);
            if (index !== -1) {
                this.toasts[index].show = false;
                setTimeout(() => {
                    const currentIndex = this.toasts.findIndex(t => t.id === id);
                    if (currentIndex !== -1) {
                        this.toasts.splice(currentIndex, 1);
                    }
                }, 300);
            }
        },
        
        getToastIcon(type) {
            switch (type) {
                case 'success': return 'fas fa-check-circle';
                case 'error': return 'fas fa-exclamation-circle';
                case 'warning': return 'fas fa-exclamation-triangle';
                case 'info': return 'fas fa-info-circle';
                default: return 'fas fa-info-circle';
            }
        },
        
        // 打开创建API Key模态框
        openCreateApiKeyModal() {
            console.log('Opening API Key modal...');
            // 先关闭所有其他模态框
            this.showCreateAccountModal = false;
            // 使用nextTick确保状态更新
            this.$nextTick(() => {
                this.showCreateApiKeyModal = true;
            });
        },
        
        // 打开创建账户模态框  
        openCreateAccountModal() {
            console.log('Opening Account modal...');
            // 先关闭所有其他模态框
            this.showCreateApiKeyModal = false;
            // 使用nextTick确保状态更新
            this.$nextTick(() => {
                this.showCreateAccountModal = true;
                this.resetAccountForm();
            });
        },
        
        // 关闭创建账户模态框
        closeCreateAccountModal() {
            this.showCreateAccountModal = false;
            this.resetAccountForm();
        },
        
        // 打开编辑账户模态框
        openEditAccountModal(account) {
            this.editAccountForm = {
                id: account.id,
                name: account.name,
                description: account.description || '',
                accountType: account.accountType || 'shared',
                originalAccountType: account.accountType || 'shared',
                accessToken: '',
                refreshToken: '',
                proxyType: account.proxy ? account.proxy.type : '',
                proxyHost: account.proxy ? account.proxy.host : '',
                proxyPort: account.proxy ? account.proxy.port : '',
                proxyUsername: account.proxy ? account.proxy.username : '',
                proxyPassword: account.proxy ? account.proxy.password : ''
            };
            this.showEditAccountModal = true;
        },
        
        // 关闭编辑账户模态框
        closeEditAccountModal() {
            this.showEditAccountModal = false;
            this.editAccountForm = {
                id: '',
                name: '',
                description: '',
                accountType: 'shared',
                originalAccountType: 'shared',
                accessToken: '',
                refreshToken: '',
                proxyType: '',
                proxyHost: '',
                proxyPort: '',
                proxyUsername: '',
                proxyPassword: ''
            };
        },
        
        // 更新账户
        async updateAccount() {
            this.editAccountLoading = true;
            try {
                // 验证账户类型切换
                if (this.editAccountForm.accountType === 'shared' && 
                    this.editAccountForm.originalAccountType === 'dedicated') {
                    const boundKeysCount = this.getBoundApiKeysCount(this.editAccountForm.id);
                    if (boundKeysCount > 0) {
                        this.showToast(`无法切换到共享账户，该账户绑定了 ${boundKeysCount} 个API Key，请先解绑所有API Key`, 'error', '切换失败');
                        return;
                    }
                }

                // 构建更新数据
                let updateData = {
                    name: this.editAccountForm.name,
                    description: this.editAccountForm.description,
                    accountType: this.editAccountForm.accountType
                };
                
                // 只在有值时才更新 token
                if (this.editAccountForm.accessToken.trim()) {
                    // 构建新的 OAuth 数据
                    const newOauthData = {
                        accessToken: this.editAccountForm.accessToken,
                        refreshToken: this.editAccountForm.refreshToken || '',
                        expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 默认设置1年后过期
                        scopes: ['user:inference']
                    };
                    updateData.claudeAiOauth = newOauthData;
                }
                
                // 更新代理配置
                if (this.editAccountForm.proxyType) {
                    updateData.proxy = {
                        type: this.editAccountForm.proxyType,
                        host: this.editAccountForm.proxyHost,
                        port: parseInt(this.editAccountForm.proxyPort),
                        username: this.editAccountForm.proxyUsername || null,
                        password: this.editAccountForm.proxyPassword || null
                    };
                } else {
                    updateData.proxy = null;
                }
                
                const response = await fetch(`/admin/claude-accounts/${this.editAccountForm.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify(updateData)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showToast('账户更新成功！', 'success', '更新成功');
                    this.closeEditAccountModal();
                    await this.loadAccounts();
                } else {
                    this.showToast(data.message || 'Account update failed', 'error', 'Update Failed');
                }
            } catch (error) {
                console.error('Error updating account:', error);
                
                let errorMessage = '更新失败，请检查网络连接';
                
                if (error.response) {
                    try {
                        const errorData = await error.response.json();
                        errorMessage = errorData.message || errorMessage;
                    } catch (parseError) {
                        console.error('Failed to parse error response:', parseError);
                    }
                } else if (error.message) {
                    errorMessage = error.message;
                }
                
                this.showToast(errorMessage, 'error', '网络错误', 8000);
            } finally {
                this.editAccountLoading = false;
            }
        },
        
        // 重置账户表单
        resetAccountForm() {
            this.accountForm = {
                name: '',
                description: '',
                addType: 'oauth',
                accountType: 'shared',
                accessToken: '',
                refreshToken: '',
                proxyType: '',
                proxyHost: '',
                proxyPort: '',
                proxyUsername: '',
                proxyPassword: ''
            };
            this.oauthStep = 1;
            this.oauthData = {
                sessionId: '',
                authUrl: '',
                callbackUrl: ''
            };
        },
        
        // OAuth步骤前进
        nextOAuthStep() {
            if (this.oauthStep < 3) {
                this.oauthStep++;
            }
        },
        
        // 生成OAuth授权URL
        async generateAuthUrl() {
            this.authUrlLoading = true;
            try {
                // Build proxy configuration
                let proxy = null;
                if (this.accountForm.proxyType) {
                    proxy = {
                        type: this.accountForm.proxyType,
                        host: this.accountForm.proxyHost,
                        port: parseInt(this.accountForm.proxyPort),
                        username: this.accountForm.proxyUsername || null,
                        password: this.accountForm.proxyPassword || null
                    };
                }

                const response = await fetch('/admin/claude-accounts/generate-auth-url', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        proxy: proxy
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.oauthData.authUrl = data.data.authUrl;
                    this.oauthData.sessionId = data.data.sessionId;
                    this.showToast('授权链接生成成功！', 'success', '生成成功');
                } else {
                    this.showToast(data.message || '生成失败', 'error', '生成失败');
                }
            } catch (error) {
                console.error('Error generating auth URL:', error);
                this.showToast('生成失败，请检查网络连接', 'error', '网络错误');
            } finally {
                this.authUrlLoading = false;
            }
        },
        
        // 复制到剪贴板
        async copyToClipboard(text) {
            try {
                await navigator.clipboard.writeText(text);
                this.showToast('已复制到剪贴板', 'success', '复制成功');
            } catch (error) {
                console.error('Copy failed:', error);
                this.showToast('复制失败', 'error', '复制失败');
            }
        },
        
        // 创建OAuth账户
        async createOAuthAccount() {
            this.createAccountLoading = true;
            try {
                // 首先交换authorization code获取token
                const exchangeResponse = await fetch('/admin/claude-accounts/exchange-code', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        sessionId: this.oauthData.sessionId,
                        callbackUrl: this.oauthData.callbackUrl
                    })
                });
                
                const exchangeData = await exchangeResponse.json();
                
                if (!exchangeData.success) {
                    // Display detailed error information
                    const errorMsg = exchangeData.message || 'Token exchange failed';
                    this.showToast('Authorization failed: ' + errorMsg, 'error', 'Authorization Failed', 8000);
                    console.error('OAuth exchange failed:', exchangeData);
                    return;
                }
                
                // Build proxy configuration
                let proxy = null;
                if (this.accountForm.proxyType) {
                    proxy = {
                        type: this.accountForm.proxyType,
                        host: this.accountForm.proxyHost,
                        port: parseInt(this.accountForm.proxyPort),
                        username: this.accountForm.proxyUsername || null,
                        password: this.accountForm.proxyPassword || null
                    };
                }
                
                // 创建账户
                const createResponse = await fetch('/admin/claude-accounts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        name: this.accountForm.name,
                        description: this.accountForm.description,
                        claudeAiOauth: exchangeData.data.claudeAiOauth,
                        proxy: proxy,
                        accountType: this.accountForm.accountType
                    })
                });
                
                const createData = await createResponse.json();
                
                if (createData.success) {
                    this.showToast('OAuth账户创建成功！', 'success', '账户创建成功');
                    this.closeCreateAccountModal();
                    await this.loadAccounts();
                } else {
                    this.showToast(createData.message || 'Account creation failed', 'error', 'Creation Failed');
                }
            } catch (error) {
                console.error('Error creating OAuth account:', error);
                
                // 尝试从错误响应中提取更详细的信息
                let errorMessage = '创建失败，请检查网络连接';
                
                if (error.response) {
                    try {
                        const errorData = await error.response.json();
                        errorMessage = errorData.message || errorMessage;
                    } catch (parseError) {
                        // 如果无法解析JSON，使用默认消息
                        console.error('Failed to parse error response:', parseError);
                    }
                } else if (error.message) {
                    errorMessage = error.message;
                }
                
                this.showToast(errorMessage, 'error', '网络错误', 8000);
            } finally {
                this.createAccountLoading = false;
            }
        },
        
        // 创建手动账户
        async createManualAccount() {
            this.createAccountLoading = true;
            try {
                // 构建代理配置
                let proxy = null;
                if (this.accountForm.proxyType) {
                    proxy = {
                        type: this.accountForm.proxyType,
                        host: this.accountForm.proxyHost,
                        port: parseInt(this.accountForm.proxyPort),
                        username: this.accountForm.proxyUsername || null,
                        password: this.accountForm.proxyPassword || null
                    };
                }
                
                // 构建手动 OAuth 数据
                const manualOauthData = {
                    accessToken: this.accountForm.accessToken,
                    refreshToken: this.accountForm.refreshToken || '',
                    expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 默认设置1年后过期
                    scopes: ['user:inference'] // 默认权限
                };
                
                // 创建账户
                const createResponse = await fetch('/admin/claude-accounts', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        name: this.accountForm.name,
                        description: this.accountForm.description,
                        claudeAiOauth: manualOauthData,
                        proxy: proxy,
                        accountType: this.accountForm.accountType
                    })
                });
                
                const createData = await createResponse.json();
                
                if (createData.success) {
                    this.showToast('手动账户创建成功！', 'success', '账户创建成功');
                    this.closeCreateAccountModal();
                    await this.loadAccounts();
                } else {
                    this.showToast(createData.message || 'Account creation failed', 'error', 'Creation Failed');
                }
            } catch (error) {
                console.error('Error creating manual account:', error);
                
                let errorMessage = '创建失败，请检查网络连接';
                
                if (error.response) {
                    try {
                        const errorData = await error.response.json();
                        errorMessage = errorData.message || errorMessage;
                    } catch (parseError) {
                        console.error('Failed to parse error response:', parseError);
                    }
                } else if (error.message) {
                    errorMessage = error.message;
                }
                
                this.showToast(errorMessage, 'error', '网络错误', 8000);
            } finally {
                this.createAccountLoading = false;
            }
        },
        
        
        // 根据当前标签页加载数据
        loadCurrentTabData() {
            console.log('Loading current tab data for:', this.activeTab);
            switch (this.activeTab) {
                case 'dashboard':
                    this.loadDashboard();
                    // 加载图表数据，等待Chart.js
                    this.waitForChartJS().then(() => {
                        this.loadDashboardModelStats();
                        this.loadUsageTrend();
                    });
                    break;
                case 'apiKeys':
                    // 加载API Keys时同时加载账号列表，以便显示绑定账号名称
                    Promise.all([
                        this.loadApiKeys(),
                        this.loadAccounts()
                    ]);
                    break;
                case 'accounts':
                    this.loadAccounts();
                    break;
                case 'models':
                    this.loadModelStats();
                    break;
                case 'tutorial':
                    // 教程页面不需要加载数据
                    break;
            }
        },

        // 等待Chart.js加载完成
        waitForChartJS() {
            return new Promise((resolve) => {
                const checkChart = () => {
                    if (typeof Chart !== 'undefined') {
                        resolve();
                    } else {
                        setTimeout(checkChart, 100);
                    }
                };
                checkChart();
            });
        },
        
        // 清理所有图表实例
        cleanupCharts() {
            
            // 清理模型使用图表
            if (this.modelUsageChart) {
                try {
                    // 先停止所有动画
                    this.modelUsageChart.stop();
                    // 再销毁图表
                    this.modelUsageChart.destroy();
                } catch (error) {
                    console.warn('Error destroying model usage chart:', error);
                }
                this.modelUsageChart = null;
            }
            
            // 清理使用趋势图表
            if (this.usageTrendChart) {
                try {
                    // 先停止所有动画
                    this.usageTrendChart.stop();
                    // 再销毁图表
                    this.usageTrendChart.destroy();
                } catch (error) {
                    console.warn('Error destroying usage trend chart:', error);
                }
                this.usageTrendChart = null;
            }
        },
        
        // 检查DOM元素是否存在且有效
        isElementValid(elementId) {
            const element = document.getElementById(elementId);
            return element && element.isConnected && element.ownerDocument && element.parentNode;
        },
        
        // 防抖函数，防止快速点击
        debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        },
        
        async login() {
            this.loginLoading = true;
            this.loginError = '';
            
            try {
                const response = await fetch('/web/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.loginForm)
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.authToken = data.token;
                    localStorage.setItem('authToken', this.authToken);
                    this.isLoggedIn = true;
                    
                    // 记录当前用户名（使用服务器返回的真实用户名）
                    this.currentUser.username = data.username;
                    
                    this.loadDashboard();
                } else {
                    this.loginError = data.message;
                }
            } catch (error) {
                console.error('Login error:', error);
                this.loginError = '登录失败，请检查网络连接';
            } finally {
                this.loginLoading = false;
            }
        },
        
        // 加载当前用户信息
        async loadCurrentUser() {
            try {
                const response = await fetch('/web/auth/user', {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.currentUser.username = data.user.username;
                    console.log('Loaded current user:', data.user.username);
                } else {
                    console.warn('Failed to load current user:', data.message);
                }
            } catch (error) {
                console.error('Error loading current user:', error);
            }
        },
        
        // 用户菜单相关方法
        openChangePasswordModal() {
            this.userMenuOpen = false;
            this.showChangePasswordModal = true;
        },
        
        closeChangePasswordModal() {
            this.showChangePasswordModal = false;
            this.changePasswordForm = {
                newUsername: '',
                currentPassword: '',
                newPassword: '',
                confirmPassword: ''
            };
        },
        
        async changePassword() {
            // 验证表单
            if (this.changePasswordForm.newPassword !== this.changePasswordForm.confirmPassword) {
                this.showToast('新密码和确认密码不一致', 'error');
                return;
            }
            
            if (this.changePasswordForm.newPassword.length < 8) {
                this.showToast('新密码长度至少8位', 'error');
                return;
            }
            
            this.changePasswordLoading = true;
            try {
                const response = await fetch('/web/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        newUsername: this.changePasswordForm.newUsername || undefined,
                        currentPassword: this.changePasswordForm.currentPassword,
                        newPassword: this.changePasswordForm.newPassword
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.showToast('账户信息修改成功，即将退出登录', 'success');
                    this.closeChangePasswordModal();
                    
                    // 将新的用户名更新到本地状态
                    if (this.changePasswordForm.newUsername) {
                        this.currentUser.username = this.changePasswordForm.newUsername;
                    }
                    
                    // 延迟2秒后自动退出登录
                    setTimeout(() => {
                        this.logout();
                    }, 2000);
                } else {
                    this.showToast(result.message || '修改失败', 'error');
                }
            } catch (error) {
                console.error('Change password error:', error);
                this.showToast('网络错误，请稍后再试', 'error');
            } finally {
                this.changePasswordLoading = false;
            }
        },
        
        async logout() {
            if (this.authToken) {
                try {
                    await fetch('/web/auth/logout', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + this.authToken
                        }
                    });
                } catch (error) {
                    console.error('Logout error:', error);
                }
            }
            
            this.authToken = null;
            localStorage.removeItem('authToken');
            this.isLoggedIn = false;
            this.loginForm = { username: '', password: '' };
            this.loginError = '';
        },
        
        async loadDashboard() {
            try {
                const [dashboardResponse, costsResponse] = await Promise.all([
                    fetch('/admin/dashboard', {
                        headers: { 'Authorization': 'Bearer ' + this.authToken }
                    }),
                    Promise.all([
                        fetch('/admin/usage-costs?period=today', {
                            headers: { 'Authorization': 'Bearer ' + this.authToken }
                        }),
                        fetch('/admin/usage-costs?period=all', {
                            headers: { 'Authorization': 'Bearer ' + this.authToken }
                        })
                    ])
                ]);
                
                const dashboardData = await dashboardResponse.json();
                const [todayCostsResponse, totalCostsResponse] = costsResponse;
                const todayCostsData = await todayCostsResponse.json();
                const totalCostsData = await totalCostsResponse.json();
                
                if (dashboardData.success) {
                    const overview = dashboardData.data.overview || {};
                    const recentActivity = dashboardData.data.recentActivity || {};
                    const systemAverages = dashboardData.data.systemAverages || {};
                    const systemHealth = dashboardData.data.systemHealth || {};
                    
                    this.dashboardData = {
                        totalApiKeys: overview.totalApiKeys || 0,
                        activeApiKeys: overview.activeApiKeys || 0,
                        totalAccounts: overview.totalClaudeAccounts || 0,
                        activeAccounts: overview.activeClaudeAccounts || 0,
                        todayRequests: recentActivity.requestsToday || 0,
                        totalRequests: overview.totalRequestsUsed || 0,
                        todayTokens: recentActivity.tokensToday || 0,
                        todayInputTokens: recentActivity.inputTokensToday || 0,
                        todayOutputTokens: recentActivity.outputTokensToday || 0,
                        totalTokens: overview.totalTokensUsed || 0,
                        totalInputTokens: overview.totalInputTokensUsed || 0,
                        totalOutputTokens: overview.totalOutputTokensUsed || 0,
                        totalCacheCreateTokens: overview.totalCacheCreateTokensUsed || 0,
                        totalCacheReadTokens: overview.totalCacheReadTokensUsed || 0,
                        todayCacheCreateTokens: recentActivity.cacheCreateTokensToday || 0,
                        todayCacheReadTokens: recentActivity.cacheReadTokensToday || 0,
                        systemRPM: systemAverages.rpm || 0,
                        systemTPM: systemAverages.tpm || 0,
                        systemStatus: systemHealth.redisConnected ? '正常' : '异常',
                        uptime: systemHealth.uptime || 0
                    };
                }
                
                // 更新费用数据
                if (todayCostsData.success && totalCostsData.success) {
                    this.costsData = {
                        todayCosts: todayCostsData.data.totalCosts || { totalCost: 0, formatted: { totalCost: '$0.000000' } },
                        totalCosts: totalCostsData.data.totalCosts || { totalCost: 0, formatted: { totalCost: '$0.000000' } }
                    };
                }
            } catch (error) {
                console.error('Failed to load dashboard:', error);
            }
        },
        
        async loadApiKeys() {
            this.apiKeysLoading = true;
            console.log('Loading API Keys...');
            try {
                const response = await fetch('/admin/api-keys', {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                const data = await response.json();
                
                console.log('API Keys response:', data);
                
                if (data.success) {
                    // 确保每个 API key 都有必要的属性
                    this.apiKeys = (data.data || []).map(key => {
                        const processedKey = {
                            ...key,
                            apiKey: key.apiKey || '',
                            name: key.name || 'Unknown',
                            id: key.id || '',
                            isActive: key.isActive !== undefined ? key.isActive : true,
                            usage: key.usage || { tokensUsed: 0 },
                            tokenLimit: key.tokenLimit || null,
                            createdAt: key.createdAt || new Date().toISOString()
                        };
                        
                        // 为每个API Key初始化独立的日期筛选状态
                        if (!this.apiKeyDateFilters[processedKey.id]) {
                            this.initApiKeyDateFilter(processedKey.id);
                        }
                        
                        return processedKey;
                    });
                    console.log('Processed API Keys:', this.apiKeys);
                } else {
                    console.error('API Keys load failed:', data.message);
                    this.apiKeys = [];
                }
            } catch (error) {
                console.error('Failed to load API keys:', error);
                this.apiKeys = [];
            } finally {
                this.apiKeysLoading = false;
            }
        },
        
        async loadAccounts() {
            this.accountsLoading = true;
            try {
                const response = await fetch('/admin/claude-accounts', {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.accounts = data.data || [];
                    // 为每个账号计算绑定的API Key数量
                    this.accounts.forEach(account => {
                        account.boundApiKeysCount = this.apiKeys.filter(key => key.claudeAccountId === account.id).length;
                    });
                }
            } catch (error) {
                console.error('Failed to load accounts:', error);
            } finally {
                this.accountsLoading = false;
            }
        },
        
        
        async loadModelStats() {
            this.modelStatsLoading = true;
            try {
                const response = await fetch('/admin/model-stats?period=' + this.modelStatsPeriod, {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.modelStats = data.data || [];
                } else {
                    this.modelStats = [];
                }
            } catch (error) {
                console.error('Failed to load model stats:', error);
                this.modelStats = [];
            } finally {
                this.modelStatsLoading = false;
            }
        },
        
        async createApiKey() {
            this.createApiKeyLoading = true;
            try {
                const response = await fetch('/admin/api-keys', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        name: this.apiKeyForm.name,
                        tokenLimit: this.apiKeyForm.tokenLimit && this.apiKeyForm.tokenLimit.trim() ? parseInt(this.apiKeyForm.tokenLimit) : null,
                        description: this.apiKeyForm.description || '',
                        concurrencyLimit: this.apiKeyForm.concurrencyLimit && this.apiKeyForm.concurrencyLimit.trim() ? parseInt(this.apiKeyForm.concurrencyLimit) : 0,
                        claudeAccountId: this.apiKeyForm.claudeAccountId || null
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    // 设置新API Key数据并显示弹窗
                    this.newApiKey = {
                        key: data.data.apiKey,
                        name: data.data.name,
                        description: data.data.description || '无描述',
                        showFullKey: false
                    };
                    this.showNewApiKeyModal = true;
                    
                    // 关闭创建弹窗并清理表单
                    this.showCreateApiKeyModal = false;
                    this.apiKeyForm = { name: '', tokenLimit: '', description: '', concurrencyLimit: '', claudeAccountId: '' };
                    
                    // 重新加载API Keys列表
                    await this.loadApiKeys();
                } else {
                    this.showToast(data.message || '创建失败', 'error', '创建失败');
                }
            } catch (error) {
                console.error('Error creating API key:', error);
                this.showToast('创建失败，请检查网络连接', 'error', '网络错误');
            } finally {
                this.createApiKeyLoading = false;
            }
        },
        
        async deleteApiKey(keyId) {
            if (!confirm('确定要删除这个 API Key 吗？')) return;
            
            try {
                const response = await fetch('/admin/api-keys/' + keyId, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showToast('API Key 删除成功', 'success', '删除成功');
                    await this.loadApiKeys();
                } else {
                    this.showToast(data.message || '删除失败', 'error', '删除失败');
                }
            } catch (error) {
                console.error('Error deleting API key:', error);
                this.showToast('删除失败，请检查网络连接', 'error', '网络错误');
            }
        },

        openEditApiKeyModal(key) {
            this.editApiKeyForm = {
                id: key.id,
                name: key.name,
                tokenLimit: key.tokenLimit || '',
                concurrencyLimit: key.concurrencyLimit || '',
                claudeAccountId: key.claudeAccountId || ''
            };
            this.showEditApiKeyModal = true;
        },

        closeEditApiKeyModal() {
            this.showEditApiKeyModal = false;
            this.editApiKeyForm = {
                id: '',
                name: '',
                tokenLimit: '',
                concurrencyLimit: '',
                claudeAccountId: ''
            };
        },

        async updateApiKey() {
            this.editApiKeyLoading = true;
            try {
                const response = await fetch('/admin/api-keys/' + this.editApiKeyForm.id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + this.authToken
                    },
                    body: JSON.stringify({
                        tokenLimit: this.editApiKeyForm.tokenLimit && this.editApiKeyForm.tokenLimit.toString().trim() !== '' ? parseInt(this.editApiKeyForm.tokenLimit) : 0,
                        concurrencyLimit: this.editApiKeyForm.concurrencyLimit && this.editApiKeyForm.concurrencyLimit.toString().trim() !== '' ? parseInt(this.editApiKeyForm.concurrencyLimit) : 0,
                        claudeAccountId: this.editApiKeyForm.claudeAccountId || null
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showToast('API Key 更新成功', 'success', '更新成功');
                    this.closeEditApiKeyModal();
                    await this.loadApiKeys();
                } else {
                    this.showToast(data.message || '更新失败', 'error', '更新失败');
                }
            } catch (error) {
                console.error('Error updating API key:', error);
                this.showToast('更新失败，请检查网络连接', 'error', '网络错误');
            } finally {
                this.editApiKeyLoading = false;
            }
        },
        
        async deleteAccount(accountId) {
            // 检查是否有API Key绑定到此账号
            const boundKeysCount = this.getBoundApiKeysCount(accountId);
            if (boundKeysCount > 0) {
                this.showToast(`无法删除此账号，有 ${boundKeysCount} 个API Key绑定到此账号，请先解绑所有API Key`, 'error', '删除失败');
                return;
            }
            
            if (!confirm('确定要删除这个 Claude 账户吗？')) return;
            
            try {
                const response = await fetch('/admin/claude-accounts/' + accountId, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showToast('Claude 账户删除成功', 'success', '删除成功');
                    await this.loadAccounts();
                } else {
                    this.showToast(data.message || '删除失败', 'error', '删除失败');
                }
            } catch (error) {
                console.error('Error deleting account:', error);
                this.showToast('删除失败，请检查网络连接', 'error', '网络错误');
            }
        },
        
        // API Key 展示相关方法
        toggleApiKeyVisibility() {
            this.newApiKey.showFullKey = !this.newApiKey.showFullKey;
        },
        
        getDisplayedApiKey() {
            if (this.newApiKey.showFullKey) {
                return this.newApiKey.key;
            } else {
                // 显示前8个字符和后4个字符，中间用*代替
                const key = this.newApiKey.key;
                if (key.length <= 12) return key;
                return key.substring(0, 8) + '●'.repeat(Math.max(0, key.length - 12)) + key.substring(key.length - 4);
            }
        },
        
        async copyApiKeyToClipboard() {
            try {
                await navigator.clipboard.writeText(this.newApiKey.key);
                this.showToast('API Key 已复制到剪贴板', 'success', '复制成功');
            } catch (error) {
                console.error('Failed to copy:', error);
                // 降级方案：创建一个临时文本区域
                const textArea = document.createElement('textarea');
                textArea.value = this.newApiKey.key;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    this.showToast('API Key 已复制到剪贴板', 'success', '复制成功');
                } catch (fallbackError) {
                    this.showToast('复制失败，请手动复制', 'error', '复制失败');
                }
                document.body.removeChild(textArea);
            }
        },
        
        closeNewApiKeyModal() {
            // 显示确认提示
            if (confirm('关闭后将无法再次查看完整的API Key，请确保已经妥善保存。确定要关闭吗？')) {
                this.showNewApiKeyModal = false;
                this.newApiKey = { key: '', name: '', description: '', showFullKey: false };
            }
        },


        // 格式化数字，添加千分符
        formatNumber(num) {
            if (num === null || num === undefined) return '0';
            return Number(num).toLocaleString();
        },

        // 格式化运行时间
        formatUptime(seconds) {
            if (!seconds) return '0s';
            
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            
            if (days > 0) {
                return days + '天' + hours + '时';
            } else if (hours > 0) {
                return hours + '时' + mins + '分';
            } else {
                return mins + '分';
            }
        },

        // 计算百分比
        calculatePercentage(value, stats) {
            const total = stats.reduce((sum, stat) => sum + (stat.allTokens || 0), 0);
            if (total === 0) return 0;
            return ((value / total) * 100).toFixed(1);
        },

        // 加载仪表盘模型统计
        async loadDashboardModelStats() {
            console.log('Loading dashboard model stats, period:', this.dashboardModelPeriod, 'authToken:', !!this.authToken);
            try {
                const response = await fetch('/admin/model-stats?period=' + this.dashboardModelPeriod, {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                console.log('Model stats response status:', response.status);
                
                if (!response.ok) {
                    console.error('Model stats API error:', response.status, response.statusText);
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    this.dashboardModelStats = [];
                    return;
                }
                
                const data = await response.json();
                console.log('Model stats response data:', data);
                
                if (data.success) {
                    this.dashboardModelStats = data.data || [];
                    console.log('Loaded model stats:', this.dashboardModelStats.length, 'items');
                    this.updateModelUsageChart();
                } else {
                    console.warn('Model stats API returned success=false:', data);
                    this.dashboardModelStats = [];
                }
            } catch (error) {
                console.error('Failed to load dashboard model stats:', error);
                this.dashboardModelStats = [];
            }
        },

        // 更新模型使用饼图
        updateModelUsageChart() {
            
            if (!this.dashboardModelStats.length) {
                console.warn('No dashboard model stats data, skipping chart update');
                return;
            }
            
            // 检查Chart.js是否已加载
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded yet, retrying...');
                setTimeout(() => this.updateModelUsageChart(), 500);
                return;
            }
            
            // 严格检查DOM元素是否有效
            if (!this.isElementValid('modelUsageChart')) {
                console.error('Model usage chart canvas element not found or invalid');
                return;
            }
            
            const ctx = document.getElementById('modelUsageChart');
            
            // 安全销毁现有图表
            if (this.modelUsageChart) {
                try {
                    this.modelUsageChart.destroy();
                } catch (error) {
                    console.warn('Error destroying model usage chart:', error);
                }
                this.modelUsageChart = null;
            }
            
            // 再次验证元素在销毁后仍然有效
            if (!this.isElementValid('modelUsageChart')) {
                console.error('Model usage chart canvas element became invalid after cleanup');
                return;
            }
            
            const labels = this.dashboardModelStats.map(stat => stat.model);
            const data = this.dashboardModelStats.map(stat => stat.allTokens || 0);
            
            
            // 生成渐变色
            const colors = [
                'rgba(102, 126, 234, 0.8)',
                'rgba(118, 75, 162, 0.8)',
                'rgba(240, 147, 251, 0.8)',
                'rgba(16, 185, 129, 0.8)',
                'rgba(245, 158, 11, 0.8)',
                'rgba(239, 68, 68, 0.8)'
            ];
            
            try {
                // 最后一次检查元素有效性
                if (!this.isElementValid('modelUsageChart')) {
                    throw new Error('Canvas element is not valid for chart creation');
                }
                
                this.modelUsageChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: 'rgba(255, 255, 255, 1)',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false, // 禁用动画防止异步渲染问题
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((value / total) * 100).toFixed(1);
                                    return label + ': ' + value.toLocaleString() + ' (' + percentage + '%)';
                                }
                            }
                        }
                    }
                }
            });
            } catch (error) {
                console.error('Error creating model usage chart:', error);
                this.modelUsageChart = null;
            }
        },

        // 设置趋势图周期（添加防抖）
        setTrendPeriod: null, // 将在mounted中初始化为防抖函数
        
        // 实际的设置趋势图周期方法
        async _setTrendPeriod(days) {
            console.log('Setting trend period to:', days);
            
            // 先清理现有图表，防止竞态条件
            if (this.usageTrendChart) {
                try {
                    this.usageTrendChart.stop();
                    this.usageTrendChart.destroy();
                } catch (error) {
                    console.warn('Error cleaning trend chart:', error);
                }
                this.usageTrendChart = null;
            }
            
            this.trendPeriod = days;
            await this.loadUsageTrend();
        },

        // 加载使用趋势数据
        async loadUsageTrend() {
            console.log('Loading usage trend data, period:', this.trendPeriod, 'authToken:', !!this.authToken);
            try {
                const response = await fetch('/admin/usage-trend?days=' + this.trendPeriod, {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                console.log('Usage trend response status:', response.status);
                
                if (!response.ok) {
                    console.error('Usage trend API error:', response.status, response.statusText);
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    return;
                }
                
                const data = await response.json();
                console.log('Usage trend response data:', data);
                
                if (data.success) {
                    this.trendData = data.data || [];
                    console.log('Loaded trend data:', this.trendData.length, 'items');
                    this.updateUsageTrendChart();
                } else {
                    console.warn('Usage trend API returned success=false:', data);
                }
            } catch (error) {
                console.error('Failed to load usage trend:', error);
            }
        },

        // 更新使用趋势图
        updateUsageTrendChart() {
            
            // 检查Chart.js是否已加载
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js not loaded yet, retrying...');
                setTimeout(() => this.updateUsageTrendChart(), 500);
                return;
            }
            
            // 严格检查DOM元素是否有效
            if (!this.isElementValid('usageTrendChart')) {
                console.error('Usage trend chart canvas element not found or invalid');
                return;
            }
            
            const ctx = document.getElementById('usageTrendChart');
            
            // 安全销毁现有图表
            if (this.usageTrendChart) {
                try {
                    this.usageTrendChart.destroy();
                } catch (error) {
                    console.warn('Error destroying usage trend chart:', error);
                }
                this.usageTrendChart = null;
            }
            
            // 如果没有数据，不创建图表
            if (!this.trendData || this.trendData.length === 0) {
                console.warn('No trend data available, skipping chart creation');
                return;
            }
            
            // 再次验证元素在销毁后仍然有效
            if (!this.isElementValid('usageTrendChart')) {
                console.error('Usage trend chart canvas element became invalid after cleanup');
                return;
            }
            
            const labels = this.trendData.map(item => item.date);
            const inputData = this.trendData.map(item => item.inputTokens || 0);
            const outputData = this.trendData.map(item => item.outputTokens || 0);
            const cacheCreateData = this.trendData.map(item => item.cacheCreateTokens || 0);
            const cacheReadData = this.trendData.map(item => item.cacheReadTokens || 0);
            const requestsData = this.trendData.map(item => item.requests || 0);
            const costData = this.trendData.map(item => item.cost || 0);
            
            
            try {
                // 最后一次检查元素有效性
                if (!this.isElementValid('usageTrendChart')) {
                    throw new Error('Canvas element is not valid for chart creation');
                }
                
                this.usageTrendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '输入Token',
                            data: inputData,
                            borderColor: 'rgb(102, 126, 234)',
                            backgroundColor: 'rgba(102, 126, 234, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '输出Token',
                            data: outputData,
                            borderColor: 'rgb(240, 147, 251)',
                            backgroundColor: 'rgba(240, 147, 251, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '缓存创建Token',
                            data: cacheCreateData,
                            borderColor: 'rgb(59, 130, 246)',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '缓存读取Token',
                            data: cacheReadData,
                            borderColor: 'rgb(147, 51, 234)',
                            backgroundColor: 'rgba(147, 51, 234, 0.1)',
                            tension: 0.3
                        },
                        {
                            label: '费用 (USD)',
                            data: costData,
                            borderColor: 'rgb(34, 197, 94)',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            tension: 0.3,
                            yAxisID: 'y2'
                        },
                        {
                            label: '请求数',
                            data: requestsData,
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.3,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false, // 禁用动画防止异步渲染问题
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Token数量'
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: '请求数'
                            },
                            grid: {
                                drawOnChartArea: false,
                            }
                        },
                        y2: {
                            type: 'linear',
                            display: false, // 隐藏费用轴，在tooltip中显示
                            position: 'right'
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    let value = context.parsed.y;
                                    
                                    if (label === '费用 (USD)') {
                                        // 格式化费用显示
                                        if (value < 0.01) {
                                            return label + ': $' + value.toFixed(6);
                                        } else {
                                            return label + ': $' + value.toFixed(4);
                                        }
                                    } else if (label === '请求数') {
                                        return label + ': ' + value.toLocaleString();
                                    } else {
                                        return label + ': ' + value.toLocaleString() + ' tokens';
                                    }
                                }
                            }
                        }
                    }
                }
            });
            } catch (error) {
                console.error('Error creating usage trend chart:', error);
                this.usageTrendChart = null;
            }
        },

        // 切换API Key模型统计展开状态
        toggleApiKeyModelStats(keyId) {
            if (!keyId) {
                console.warn('toggleApiKeyModelStats: keyId is null or undefined');
                return;
            }
            
            console.log('Toggling API key model stats for:', keyId, 'current state:', this.expandedApiKeys[keyId]);
            
            if (this.expandedApiKeys[keyId]) {
                // 收起展开
                this.expandedApiKeys = {
                    ...this.expandedApiKeys
                };
                delete this.expandedApiKeys[keyId];
            } else {
                // 展开并加载数据
                this.expandedApiKeys = {
                    ...this.expandedApiKeys,
                    [keyId]: true
                };
                console.log('Expanded keys after toggle:', this.expandedApiKeys);
                this.loadApiKeyModelStats(keyId);
            }
        },

        // 加载API Key的模型统计
        async loadApiKeyModelStats(keyId, forceReload = false) {
            if (!keyId) {
                console.warn('loadApiKeyModelStats: keyId is null or undefined');
                return;
            }
            
            // 如果已经有数据且不为空，且不是强制重新加载，则跳过加载
            if (!forceReload && this.apiKeyModelStats[keyId] && this.apiKeyModelStats[keyId].length > 0) {
                console.log('API key model stats already loaded for:', keyId);
                return;
            }
            
            const filter = this.getApiKeyDateFilter(keyId);
            console.log('Loading API key model stats for:', keyId, 'period:', this.apiKeyModelPeriod, 'forceReload:', forceReload, 'authToken:', !!this.authToken);
            console.log('API Key date filter:', filter);
            
            // 清除现有数据以显示加载状态
            if (forceReload) {
                const newStats = { ...this.apiKeyModelStats };
                delete newStats[keyId];
                this.apiKeyModelStats = newStats;
            }
            
            try {
                // 构建API请求URL，根据筛选类型传递不同参数
                let url = '/admin/api-keys/' + keyId + '/model-stats';
                const params = new URLSearchParams();
                
                // 检查是否有具体的日期范围设置（包括快捷按钮设置的日期）
                if (filter.customStart && filter.customEnd) {
                    // 有具体日期范围，使用自定义时间范围方式
                    params.append('startDate', filter.customStart);
                    params.append('endDate', filter.customEnd);
                    params.append('period', 'custom');
                    console.log('Using custom date range:', filter.customStart, 'to', filter.customEnd);
                } else {
                    // 没有具体日期范围，使用预设期间（目前只有 today 会走这里）
                    const period = filter.preset === 'today' ? 'daily' : 'monthly';
                    params.append('period', period);
                    console.log('Using preset period:', period);
                }
                
                url += '?' + params.toString();
                console.log('API request URL:', url);
                
                const response = await fetch(url, {
                    headers: { 'Authorization': 'Bearer ' + this.authToken }
                });
                
                console.log('API key model stats response status:', response.status);
                
                if (!response.ok) {
                    console.error('API key model stats API error:', response.status, response.statusText);
                    const errorText = await response.text();
                    console.error('Error response:', errorText);
                    return;
                }
                
                const data = await response.json();
                console.log('API key model stats response data:', data);
                
                if (data.success) {
                    console.log('API response success, data:', data.data);
                    console.log('Setting apiKeyModelStats for keyId:', keyId);
                    
                    // 确保响应式更新 - 创建新对象
                    const newStats = { ...this.apiKeyModelStats };
                    newStats[keyId] = data.data || [];
                    this.apiKeyModelStats = newStats;
                    
                    console.log('Updated apiKeyModelStats:', this.apiKeyModelStats);
                    console.log('Data for keyId', keyId, ':', this.apiKeyModelStats[keyId]);
                    console.log('Data length:', this.apiKeyModelStats[keyId] ? this.apiKeyModelStats[keyId].length : 'undefined');
                    
                    // 确保Vue知道数据已经更新
                    this.$nextTick(() => {
                        console.log('Vue nextTick - stats should be visible now');
                    });
                } else {
                    console.warn('API key model stats API returned success=false:', data);
                }
            } catch (error) {
                console.error('Failed to load API key model stats:', error);
            }
        },

        // 计算API Key模型使用百分比
        calculateApiKeyModelPercentage(value, stats) {
            const total = stats.reduce((sum, stat) => sum + (stat.allTokens || 0), 0);
            if (total === 0) return 0;
            return Math.round((value / total) * 100);
        },

        // 计算单个模型费用
        calculateModelCost(stat) {
            // 优先使用后端返回的费用数据
            if (stat.formatted && stat.formatted.total) {
                return stat.formatted.total;
            }
            
            // 如果后端没有返回费用数据，则使用简单估算（备用方案）
            const inputTokens = stat.inputTokens || 0;
            const outputTokens = stat.outputTokens || 0;
            const cacheCreateTokens = stat.cacheCreateTokens || 0;
            const cacheReadTokens = stat.cacheReadTokens || 0;
            
            // 使用通用估算价格（Claude 3.5 Sonnet价格作为默认）
            const inputCost = (inputTokens / 1000000) * 3.00;
            const outputCost = (outputTokens / 1000000) * 15.00;
            const cacheCreateCost = (cacheCreateTokens / 1000000) * 3.75;
            const cacheReadCost = (cacheReadTokens / 1000000) * 0.30;
            
            const totalCost = inputCost + outputCost + cacheCreateCost + cacheReadCost;
            
            if (totalCost < 0.000001) return '$0.000000';
            if (totalCost < 0.01) return '$' + totalCost.toFixed(6);
            return '$' + totalCost.toFixed(4);
        },

        // 计算API Key费用
        calculateApiKeyCost(usage) {
            if (!usage || !usage.total) return '$0.000000';
            
            // 使用通用模型价格估算
            const totalInputTokens = usage.total.inputTokens || 0;
            const totalOutputTokens = usage.total.outputTokens || 0;
            const totalCacheCreateTokens = usage.total.cacheCreateTokens || 0;
            const totalCacheReadTokens = usage.total.cacheReadTokens || 0;
            
            // 简单估算（使用Claude 3.5 Sonnet价格）
            const inputCost = (totalInputTokens / 1000000) * 3.00;
            const outputCost = (totalOutputTokens / 1000000) * 15.00;
            const cacheCreateCost = (totalCacheCreateTokens / 1000000) * 3.75;
            const cacheReadCost = (totalCacheReadTokens / 1000000) * 0.30;
            
            const totalCost = inputCost + outputCost + cacheCreateCost + cacheReadCost;
            
            if (totalCost < 0.000001) return '$0.000000';
            if (totalCost < 0.01) return '$' + totalCost.toFixed(6);
            return '$' + totalCost.toFixed(4);
        },

        // 初始化日期筛选器
        initializeDateFilter() {
            console.log('Initializing date filter, default preset:', this.dateFilter.preset);
            
            // 根据默认的日期筛选设置正确的 dashboardModelPeriod
            if (this.dateFilter.preset === 'today') {
                this.dashboardModelPeriod = 'daily';
            } else {
                this.dashboardModelPeriod = 'monthly';
            }
            
            console.log('Set dashboardModelPeriod to:', this.dashboardModelPeriod);
        },

        // 日期筛选方法
        setDateFilterPreset(preset) {
            this.dateFilter.type = 'preset';
            this.dateFilter.preset = preset;
            // 清除自定义日期范围
            this.dateFilter.customStart = '';
            this.dateFilter.customEnd = '';
            
            // 根据预设计算并设置自定义时间框的值
            const option = this.dateFilter.presetOptions.find(opt => opt.value === preset);
            if (option) {
                const today = new Date();
                const startDate = new Date(today);
                startDate.setDate(today.getDate() - (option.days - 1));
                
                // 格式化为 Element Plus 需要的格式
                const formatDate = (date) => {
                    return date.getFullYear() + '-' + 
                           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(date.getDate()).padStart(2, '0') + ' 00:00:00';
                };
                
                this.dateFilter.customRange = [
                    formatDate(startDate),
                    formatDate(today)
                ];
            }
            
            this.refreshChartsData();
        },

        // 获取今日日期字符串
        getTodayDate() {
            return new Date().toISOString().split('T')[0];
        },

        // 获取自定义范围天数
        getCustomRangeDays() {
            if (!this.dateFilter.customStart || !this.dateFilter.customEnd) return 0;
            const start = new Date(this.dateFilter.customStart);
            const end = new Date(this.dateFilter.customEnd);
            return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        },

        // 验证并设置自定义日期范围
        validateAndSetCustomRange() {
            if (!this.dateFilter.customStart || !this.dateFilter.customEnd) return;
            
            const start = new Date(this.dateFilter.customStart);
            const end = new Date(this.dateFilter.customEnd);
            const today = new Date();
            
            // 确保结束日期不晚于今天
            if (end > today) {
                this.dateFilter.customEnd = this.getTodayDate();
                end.setTime(today.getTime());
            }
            
            // 确保开始日期不晚于结束日期
            if (start > end) {
                this.dateFilter.customStart = this.dateFilter.customEnd;
                start.setTime(end.getTime());
            }
            
            // 限制最大31天
            const daysDiff = this.getCustomRangeDays();
            if (daysDiff > 31) {
                // 自动调整开始日期，保持31天范围
                const newStart = new Date(end);
                newStart.setDate(end.getDate() - 30); // 31天范围
                this.dateFilter.customStart = newStart.toISOString().split('T')[0];
                
                this.showToast('日期范围已自动调整为最大31天', 'warning', '范围限制');
            }
            
            // 只有在都有效时才更新
            if (this.dateFilter.customStart && this.dateFilter.customEnd) {
                this.dateFilter.type = 'custom';
                this.refreshChartsData();
            }
        },

        setDateFilterCustom() {
            this.validateAndSetCustomRange();
        },

        // 一体化日期范围选择器相关方法
        toggleDateRangePicker() {
            this.showDateRangePicker = !this.showDateRangePicker;
        },

        getDateRangeDisplayText() {
            if (this.dateFilter.type === 'preset') {
                const option = this.dateFilter.presetOptions.find(opt => opt.value === this.dateFilter.preset);
                return option ? option.label : '自定义范围';
            } else if (this.dateFilter.customStart && this.dateFilter.customEnd) {
                const start = new Date(this.dateFilter.customStart).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                const end = new Date(this.dateFilter.customEnd).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                return start + ' - ' + end + ' (' + this.getCustomRangeDays() + '天)';
            }
            return '选择日期范围';
        },

        getCustomDateRangeText() {
            if (this.dateFilter.type === 'custom' && this.dateFilter.customStart && this.dateFilter.customEnd) {
                const start = new Date(this.dateFilter.customStart).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                const end = new Date(this.dateFilter.customEnd).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                return start + ' - ' + end;
            }
            return '自定义范围';
        },

        onDateRangeChange() {
            // 实时验证日期范围
            if (this.dateFilter.customStart && this.dateFilter.customEnd) {
                const start = new Date(this.dateFilter.customStart);
                const end = new Date(this.dateFilter.customEnd);
                const today = new Date();
                
                // 确保结束日期不晚于今天
                if (end > today) {
                    this.dateFilter.customEnd = this.getTodayDate();
                }
                
                // 确保开始日期不晚于结束日期
                if (start > end) {
                    this.dateFilter.customStart = this.dateFilter.customEnd;
                }
                
                // 限制最大31天
                const daysDiff = this.getCustomRangeDays();
                if (daysDiff > 31) {
                    const newStart = new Date(end);
                    newStart.setDate(end.getDate() - 30);
                    this.dateFilter.customStart = newStart.toISOString().split('T')[0];
                }
            }
        },

        clearDateRange() {
            this.dateFilter.customStart = '';
            this.dateFilter.customEnd = '';
            this.dateFilter.type = 'preset';
            this.dateFilter.preset = '7days'; // 恢复默认
        },

        applyDateRange() {
            if (this.dateFilter.customStart && this.dateFilter.customEnd) {
                this.dateFilter.type = 'custom';
                this.dateFilter.preset = ''; // 清除预设选择
                this.showDateRangePicker = false;
                this.refreshChartsData();
            } else {
                this.showToast('请选择完整的日期范围', 'warning', '日期范围');
            }
        },

        refreshChartsData() {
            // 根据当前日期筛选设置更新数据
            let days;
            if (this.dateFilter.type === 'preset') {
                const option = this.dateFilter.presetOptions.find(opt => opt.value === this.dateFilter.preset);
                days = option ? option.days : 7;
                
                // 设置模型统计期间
                if (this.dateFilter.preset === 'today') {
                    this.dashboardModelPeriod = 'daily';
                } else {
                    this.dashboardModelPeriod = 'monthly';
                }
            } else {
                // 自定义日期范围
                const start = new Date(this.dateFilter.customStart);
                const end = new Date(this.dateFilter.customEnd);
                days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                this.dashboardModelPeriod = 'daily'; // 自定义范围使用日统计
            }
            
            this.trendPeriod = days;
            
            // 重新加载数据
            this.loadDashboardModelStats();
            this.loadUsageTrend();
        },

        // API Keys 日期筛选方法
        setApiKeyDateFilterPreset(preset, keyId) {
            console.log('Setting API Key date filter preset:', preset, 'for keyId:', keyId);
            
            const filter = this.getApiKeyDateFilter(keyId);
            console.log('Before preset change - type:', filter.type, 'preset:', filter.preset);
            
            filter.type = 'preset';
            filter.preset = preset;
            
            // 根据预设计算并设置具体的日期范围
            const option = filter.presetOptions.find(opt => opt.value === preset);
            if (option) {
                const today = new Date();
                const startDate = new Date(today);
                startDate.setDate(today.getDate() - (option.days - 1));
                
                // 设置为日期字符串格式 YYYY-MM-DD
                filter.customStart = startDate.toISOString().split('T')[0];
                filter.customEnd = today.toISOString().split('T')[0];
                
                // 同时设置customRange，让日期选择器显示当前选中的范围
                // 格式化为 Element Plus 需要的格式
                const formatDate = (date) => {
                    return date.getFullYear() + '-' + 
                           String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                           String(date.getDate()).padStart(2, '0') + ' 00:00:00';
                };
                
                filter.customRange = [
                    formatDate(startDate),
                    formatDate(today)
                ];
                
                console.log('Set customStart to:', filter.customStart);
                console.log('Set customEnd to:', filter.customEnd);
                console.log('Set customRange to:', filter.customRange);
            }
            
            console.log('After preset change - type:', filter.type, 'preset:', filter.preset);
            
            // 立即加载数据
            this.loadApiKeyModelStats(keyId, true);
        },

        validateAndSetApiKeyCustomRange(keyId) {
            const filter = this.getApiKeyDateFilter(keyId);
            
            if (!filter.customStart || !filter.customEnd) return;
            
            const start = new Date(filter.customStart);
            const end = new Date(filter.customEnd);
            const today = new Date();
            
            // 确保结束日期不晚于今天
            if (end > today) {
                filter.customEnd = this.getTodayDate();
                end.setTime(today.getTime());
            }
            
            // 确保开始日期不晚于结束日期
            if (start > end) {
                filter.customStart = filter.customEnd;
                start.setTime(end.getTime());
            }
            
            // 限制最大31天
            const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            if (daysDiff > 31) {
                // 自动调整开始日期，保持31天范围
                const newStart = new Date(end);
                newStart.setDate(end.getDate() - 30); // 31天范围
                filter.customStart = newStart.toISOString().split('T')[0];
                
                this.showToast('日期范围已自动调整为最大31天', 'warning', '范围限制');
            }
            
            // 只有在都有效时才更新
            if (filter.customStart && filter.customEnd) {
                filter.type = 'custom';
                this.apiKeyModelPeriod = 'daily'; // 自定义范围使用日统计
                
                // 强制重新加载该API Key的数据
                this.loadApiKeyModelStats(keyId, true);
            }
        },

        // API Keys 一体化日期范围选择器相关方法
        toggleApiKeyDateRangePicker() {
            this.showApiKeyDateRangePicker = !this.showApiKeyDateRangePicker;
        },

        getApiKeyDateRangeDisplayText() {
            if (this.apiKeyDateFilter.type === 'preset') {
                const option = this.apiKeyDateFilter.presetOptions.find(opt => opt.value === this.apiKeyDateFilter.preset);
                return option ? option.label : '自定义';
            } else if (this.apiKeyDateFilter.customStart && this.apiKeyDateFilter.customEnd) {
                const start = new Date(this.apiKeyDateFilter.customStart).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                const end = new Date(this.apiKeyDateFilter.customEnd).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                return start + ' - ' + end;
            }
            return '自定义';
        },

        getApiKeyCustomDateRangeText() {
            if (this.apiKeyDateFilter.type === 'custom' && this.apiKeyDateFilter.customStart && this.apiKeyDateFilter.customEnd) {
                const start = new Date(this.apiKeyDateFilter.customStart).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                const end = new Date(this.apiKeyDateFilter.customEnd).toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
                return start + ' - ' + end;
            }
            return '自定义范围';
        },

        getApiKeyCustomRangeDays() {
            if (!this.apiKeyDateFilter.customStart || !this.apiKeyDateFilter.customEnd) return 0;
            const start = new Date(this.apiKeyDateFilter.customStart);
            const end = new Date(this.apiKeyDateFilter.customEnd);
            return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        },

        onApiKeyDateRangeChange() {
            if (this.apiKeyDateFilter.customStart && this.apiKeyDateFilter.customEnd) {
                const start = new Date(this.apiKeyDateFilter.customStart);
                const end = new Date(this.apiKeyDateFilter.customEnd);
                const today = new Date();
                
                // 确保结束日期不晚于今天
                if (end > today) {
                    this.apiKeyDateFilter.customEnd = this.getTodayDate();
                }
                
                // 确保开始日期不晚于结束日期
                if (start > end) {
                    this.apiKeyDateFilter.customStart = this.apiKeyDateFilter.customEnd;
                }
                
                // 限制最大31天
                const daysDiff = this.getApiKeyCustomRangeDays();
                if (daysDiff > 31) {
                    const newStart = new Date(end);
                    newStart.setDate(end.getDate() - 30);
                    this.apiKeyDateFilter.customStart = newStart.toISOString().split('T')[0];
                }
            }
        },

        clearApiKeyDateRange() {
            this.apiKeyDateFilter.customStart = '';
            this.apiKeyDateFilter.customEnd = '';
            this.apiKeyDateFilter.type = 'preset';
            this.apiKeyDateFilter.preset = '7days'; // 恢复默认
        },

        applyApiKeyDateRange(keyId) {
            if (this.apiKeyDateFilter.customStart && this.apiKeyDateFilter.customEnd) {
                this.apiKeyDateFilter.type = 'custom';
                this.apiKeyDateFilter.preset = ''; // 清除预设选择
                this.apiKeyModelPeriod = 'daily'; // 自定义范围使用日统计
                this.showApiKeyDateRangePicker = false;
                
                // 强制重新加载该API Key的数据
                this.loadApiKeyModelStats(keyId, true);
            } else {
                this.showToast('请选择完整的日期范围', 'warning', '日期范围');
            }
        },

        // Element Plus 日期选择器相关方法
        
        // 禁用未来日期
        disabledDate(date) {
            return date > new Date();
        },

        // 仪表盘自定义日期范围变化处理
        onCustomDateRangeChange(value) {
            if (value && value.length === 2) {
                // 清除快捷选择的焦点状态
                this.dateFilter.type = 'custom';
                this.dateFilter.preset = '';
                this.dateFilter.customStart = value[0].split(' ')[0];
                this.dateFilter.customEnd = value[1].split(' ')[0];
                
                // 检查日期范围限制
                const start = new Date(value[0]);
                const end = new Date(value[1]);
                const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                
                if (daysDiff > 31) {
                    this.showToast('日期范围不能超过31天', 'warning', '范围限制');
                    // 重置为默认7天
                    this.dateFilter.customRange = null;
                    this.dateFilter.type = 'preset';
                    this.dateFilter.preset = '7days';
                    return;
                }
                
                this.refreshChartsData();
            } else if (value === null) {
                // 清空时恢复默认
                this.dateFilter.type = 'preset';
                this.dateFilter.preset = '7days';
                this.dateFilter.customStart = '';
                this.dateFilter.customEnd = '';
                this.refreshChartsData();
            }
        },

        // API Keys自定义日期范围变化处理
        onApiKeyCustomDateRangeChange(keyId) {
            return (value) => {
                const filter = this.getApiKeyDateFilter(keyId);
                console.log('API Key custom date range change:', value, 'for keyId:', keyId);
                console.log('Before change - type:', filter.type, 'preset:', filter.preset);
                
                // 更新 customRange 值
                filter.customRange = value;
                
                if (value && value.length === 2) {
                    // 清除快捷选择的焦点状态
                    filter.type = 'custom';
                    filter.preset = '';  // 清空preset确保快捷按钮失去焦点
                    filter.customStart = value[0].split(' ')[0];
                    filter.customEnd = value[1].split(' ')[0];
                    
                    console.log('After change - type:', filter.type, 'preset:', filter.preset);
                    console.log('Set customStart to:', filter.customStart);
                    console.log('Set customEnd to:', filter.customEnd);
                    
                    // 检查日期范围限制
                    const start = new Date(value[0]);
                    const end = new Date(value[1]);
                    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                    
                    if (daysDiff > 31) {
                        this.showToast('日期范围不能超过31天', 'warning', '范围限制');
                        // 重置到默认7天
                        this.resetApiKeyDateFilterToDefault(keyId);
                        return;
                    }
                    
                    // 立即加载数据
                    console.log('Loading model stats after date range selection');
                    this.loadApiKeyModelStats(keyId, true);
                } else if (value === null || value === undefined) {
                    // 清空时恢复默认7天
                    this.resetApiKeyDateFilterToDefault(keyId);
                    
                    console.log('Cleared - type:', filter.type, 'preset:', filter.preset);
                    
                    // 加载数据
                    this.loadApiKeyModelStats(keyId, true);
                }
            };
        },

        // 初始化API Key的日期筛选器
        initApiKeyDateFilter(keyId) {
            const today = new Date();
            const startDate = new Date(today);
            startDate.setDate(today.getDate() - 6); // 7天前
            
            // Vue 3 直接赋值即可，不需要 $set
            this.apiKeyDateFilters[keyId] = {
                type: 'preset',
                preset: '7days',
                customStart: startDate.toISOString().split('T')[0],
                customEnd: today.toISOString().split('T')[0],
                customRange: null,
                presetOptions: this.apiKeyDateFilterDefaults.presetOptions
            };
        },
        
        // 获取API Key的日期筛选器状态
        getApiKeyDateFilter(keyId) {
            if (!this.apiKeyDateFilters[keyId]) {
                this.initApiKeyDateFilter(keyId);
            }
            return this.apiKeyDateFilters[keyId];
        },
        
        // 重置API Key日期筛选器为默认值（内部使用）
        resetApiKeyDateFilterToDefault(keyId) {
            const filter = this.getApiKeyDateFilter(keyId);
            
            // 重置为默认的7天预设
            filter.type = 'preset';
            filter.preset = '7days';
            filter.customRange = null;
            
            // 计算7天的具体日期范围
            const today = new Date();
            const startDate = new Date(today);
            startDate.setDate(today.getDate() - 6); // 7天前
            
            filter.customStart = startDate.toISOString().split('T')[0];
            filter.customEnd = today.toISOString().split('T')[0];
            
            console.log(`Reset API Key ${keyId} to default 7 days range:`, filter.customStart, 'to', filter.customEnd);
        },

        // 重置API Key日期筛选器并刷新
        resetApiKeyDateFilter(keyId) {
            console.log('Resetting API Key date filter for keyId:', keyId);
            
            this.resetApiKeyDateFilterToDefault(keyId);
            
            // 使用nextTick确保状态更新后再加载数据
            this.$nextTick(() => {
                this.loadApiKeyModelStats(keyId, true);
            });
            
            this.showToast('已重置筛选条件并刷新数据', 'info', '重置成功');
        }
    }
});

// 使用Element Plus，确保正确的语言包配置
if (typeof ElementPlus !== 'undefined') {
    app.use(ElementPlus, {
        locale: typeof ElementPlusLocaleZhCn !== 'undefined' ? ElementPlusLocaleZhCn : undefined
    });
} else {
    console.warn('Element Plus 未正确加载');
}

// 挂载应用
app.mount('#app');