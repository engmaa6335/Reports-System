// js/auth.js

// ==================== متغيرات عامة ====================
let authInitialized = false;

// ==================== التحقق من حالة المستخدم ====================

document.addEventListener('DOMContentLoaded', async () => {
    // انتظار تحميل supabaseClient
    if (typeof window.supabaseClient === 'undefined') {
        console.log('Waiting for supabaseClient...');
        setTimeout(() => initAuth(), 200);
        return;
    }
    
    await initAuth();
});

async function initAuth() {
    if (authInitialized) return;
    authInitialized = true;
    
    try {
        const currentUser = await getCurrentUser();
        
        // تحديد الصفحة الحالية
        const currentPath = window.location.pathname;
        const isLoginPage = currentPath.includes('login.html');
        const isProtectedPage = isProtectedPageRequired(currentPath);
        
        // إذا كان المستخدم على صفحة الدخول ومتصل، نوجهه للوحة التحكم
        if (isLoginPage && currentUser) {
            window.location.href = 'dashboard.html';
            return;
        }
        
        // إذا كان المستخدم على صفحة محمية وغير متصل، نوجهه للدخول
        if (isProtectedPage && !currentUser) {
            window.location.href = 'login.html';
            return;
        }
        
        // إذا كان المستخدم متصل وعلى صفحة محمية، تحديث واجهة المستخدم
        if (currentUser && isProtectedPage) {
            await updateUIForCurrentUser(currentUser);
        }
        
    } catch (error) {
        console.error('Error in auth initialization:', error);
    }
}

// تحديد الصفحات المحمية
function isProtectedPageRequired(path) {
    const protectedPages = [
        'dashboard.html', 
        'reports.html', 
        'analytics.html', 
        'districts-management.html', 
        'users-management.html'
    ];
    return protectedPages.some(page => path.includes(page));
}

// ==================== دوال المستخدم ====================

// الحصول على المستخدم الحالي (من supabase.js)
async function getCurrentUser() {
    try {
        // محاولة جلب من localStorage أولاً
        const localUser = localStorage.getItem('currentUser');
        if (localUser) {
            return JSON.parse(localUser);
        }
        
        // محاولة جلب من Supabase Auth
        if (window.supabaseClient) {
            const { data: { user: authUser } } = await window.supabaseClient.auth.getUser();
            if (authUser) {
                const { data: userData } = await window.supabaseClient
                    .from('users')
                    .select('*')
                    .eq('id', authUser.id)
                    .single();
                
                if (userData) {
                    return saveUserToStorage(userData);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return null;
    }
}

// حفظ المستخدم في localStorage مع البيانات الكاملة
function saveUserToStorage(user) {
    const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name || user.full_name || user.username,
        role: user.role,
        district_id: user.district_id,
        district: null,
        district_name: null,
        school_id: user.school_id,
        school: null,
        school_name: null,
        created_at: user.created_at
    };
    
    localStorage.setItem('currentUser', JSON.stringify(userData));
    return userData;
}

// ==================== تحديث واجهة المستخدم ====================

async function updateUIForCurrentUser(user) {
    if (!user) return;
    
    try {
        // جلب البيانات الكاملة للمستخدم مع المنطقة والمدرسة
        const { data: fullUser, error } = await window.supabaseClient
            .from('users')
            .select(`
                *,
                districts:district_id (id, name),
                schools:school_id (id, name)
            `)
            .eq('id', user.id)
            .single();
        
        if (error) {
            console.error('Error fetching full user data:', error);
            return;
        }
        
        // تحديث البيانات في localStorage
        const updatedUserData = {
            id: fullUser.id,
            username: fullUser.username,
            email: fullUser.email,
            name: fullUser.name || fullUser.username,
            role: fullUser.role,
            district_id: fullUser.district_id,
            district: fullUser.districts?.name || null,
            district_name: fullUser.districts?.name || null,
            school_id: fullUser.school_id,
            school: fullUser.schools?.name || null,
            school_name: fullUser.schools?.name || null,
            created_at: fullUser.created_at
        };
        
        localStorage.setItem('currentUser', JSON.stringify(updatedUserData));
        
        // تحديث اسم المستخدم في القائمة الجانبية
        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => {
            el.textContent = updatedUserData.name || updatedUserData.username || 'مستخدم';
        });
        
        // تحديث الدور
        const userRoleElements = document.querySelectorAll('.user-role');
        userRoleElements.forEach(el => {
            el.textContent = getRoleName(updatedUserData.role);
        });
        
        // تحديث المنطقة/المدرسة
        const userDistrictElements = document.querySelectorAll('.user-district');
        userDistrictElements.forEach(el => {
            if (updatedUserData.role === 'spuser' && updatedUserData.school) {
                el.textContent = updatedUserData.school;
            } else if (updatedUserData.district) {
                el.textContent = updatedUserData.district;
            } else {
                el.textContent = 'لا يوجد';
            }
        });
        
        // تحديث القائمة الجانبية حسب الدور
        updateNavigationByRole(updatedUserData);
        
    } catch (error) {
        console.error('Error updating UI:', error);
    }
}

// ==================== تحديث القائمة الجانبية حسب الدور ====================

function updateNavigationByRole(user) {
    if (!user) return;
    
    const role = user.role;
    
    // إظهار/إخفاء روابط الإدارة
    const adminLinks = document.getElementById('adminLinks');
    if (adminLinks) {
        adminLinks.style.display = (role === 'admin' || role === 'support') ? 'block' : 'none';
    }
    
    // إدارة المناطق - تظهر لـ admin و support
    const districtsLink = document.getElementById('districtsManagementLink');
    if (districtsLink) {
        districtsLink.style.display = (role === 'admin' || role === 'support') ? 'flex' : 'none';
    }
    
    // إدارة المستخدمين - تظهر للدعم الفني فقط
    const usersLink = document.getElementById('usersManagementLink');
    if (usersLink) {
        usersLink.style.display = role === 'support' ? 'flex' : 'none';
    }
    
    // التحليلات - تظهر لـ admin, support, manger
    const analyticsLink = document.getElementById('navAnalytics');
    if (analyticsLink) {
        analyticsLink.style.display = (role === 'admin' || role === 'support' || role === 'manger') ? 'flex' : 'none';
    }
    
    // أزرار إضافة التقارير - تظهر لـ admin, support, user
    const addReportBtns = document.querySelectorAll('.add-report-btn');
    addReportBtns.forEach(btn => {
        btn.style.display = (role === 'admin' || role === 'support' || role === 'user') ? 'inline-flex' : 'none';
    });
    
    // إخفاء عناصر إدارة المستخدمين إذا كان المستخدم ليس support
    if (role !== 'support') {
        const usersManagementBtn = document.getElementById('usersManagementLink');
        if (usersManagementBtn) usersManagementBtn.style.display = 'none';
    }
}

// ==================== دوال تسجيل الدخول والخروج ====================

// تسجيل الدخول
async function login(usernameOrEmail, password) {
    try {
        if (!window.supabaseClient) {
            throw new Error('Supabase client not initialized');
        }
        
        // البحث عن المستخدم باستخدام اسم المستخدم أو البريد الإلكتروني
        const { data: users, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .or(`username.eq.${usernameOrEmail},email.eq.${usernameOrEmail}`)
            .eq('password', password);
        
        if (error) throw error;
        
        if (!users || users.length === 0) {
            return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
        }
        
        const user = users[0];
        
        // جلب البيانات الكاملة مع المنطقة والمدرسة
        const { data: fullUser } = await window.supabaseClient
            .from('users')
            .select(`
                *,
                districts:district_id (id, name),
                schools:school_id (id, name)
            `)
            .eq('id', user.id)
            .single();
        
        // حفظ بيانات المستخدم
        const userData = {
            id: fullUser.id,
            username: fullUser.username,
            email: fullUser.email,
            name: fullUser.name || fullUser.username,
            role: fullUser.role,
            district_id: fullUser.district_id,
            district: fullUser.districts?.name || null,
            district_name: fullUser.districts?.name || null,
            school_id: fullUser.school_id,
            school: fullUser.schools?.name || null,
            school_name: fullUser.schools?.name || null,
            created_at: fullUser.created_at
        };
        
        localStorage.setItem('currentUser', JSON.stringify(userData));
        
        return { success: true, user: userData };
        
    } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
    }
}

// تسجيل الخروج
async function logout() {
    localStorage.removeItem('currentUser');
    try {
        if (typeof window.supabaseClient !== 'undefined') {
            await window.supabaseClient.auth.signOut();
        }
    } catch (error) {
        console.log('Supabase logout error:', error);
    }
    window.location.href = 'login.html';
}

// ==================== دوال مساعدة ====================

function getRoleName(role) {
    const roles = {
        'admin': 'مدير النظام',
        'support': 'دعم فني',
        'manger': 'مدير منطقة',
        'spuser': 'مدير مدرسة',
        'user': 'مختص تربوي'
    };
    return roles[role] || role;
}

function hasPermission(user, permission) {
    if (!user) return false;
    
    const permissions = {
        'admin': ['view_all', 'create', 'edit', 'delete', 'manage_users', 'manage_districts', 'view_analytics'],
        'support': ['view_all', 'create', 'edit', 'delete', 'manage_users', 'manage_districts', 'view_analytics'],
        'manger': ['view_district', 'view_analytics'],
        'spuser': ['view_school'],
        'user': ['view_own', 'create', 'edit_own']
    };
    
    return permissions[user.role]?.includes(permission) || false;
}

// ==================== ربط نموذج تسجيل الدخول ====================

// انتظار تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usernameOrEmail = document.getElementById('usernameOrEmail')?.value || 
                                    document.getElementById('username')?.value || 
                                    document.getElementById('email')?.value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('errorMessage');
            const errorText = document.getElementById('errorText');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            if (!usernameOrEmail || !password) {
                if (errorText) errorText.textContent = 'الرجاء إدخال اسم المستخدم/البريد الإلكتروني وكلمة المرور';
                if (errorMessage) errorMessage.classList.remove('hidden');
                return;
            }
            
            // إخفاء رسالة الخطأ السابقة
            if (errorMessage) errorMessage.classList.add('hidden');
            
            // إظهار مؤشر التحميل
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تسجيل الدخول...';
            submitBtn.disabled = true;
            
            const result = await login(usernameOrEmail, password);
            
            if (result.success) {
                window.location.href = 'dashboard.html';
            } else {
                if (errorText) errorText.textContent = result.error;
                if (errorMessage) errorMessage.classList.remove('hidden');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
});

// ==================== تصدير الدوال للاستخدام العالمي ====================

window.auth = {
    login,
    logout,
    getCurrentUser,
    updateUIForCurrentUser,
    getRoleName,
    hasPermission
};

window.logout = logout;
window.getRoleName = getRoleName;
window.updateUIForCurrentUser = updateUIForCurrentUser;
window.hasPermission = hasPermission;