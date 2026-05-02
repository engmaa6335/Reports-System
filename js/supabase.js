// js/supabase.js
// تهيئة Supabase
const SUPABASE_URL = 'https://anztmacxegbzppixifvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuenRtYWN4ZWdienBwaXhpZnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzE0NDEsImV4cCI6MjA4NzkwNzQ0MX0.Q3wh6e00vUSgTgsoCXFh4ay6X4CSgUaETwIG3L105q4';

// إنشاء عميل Supabase
if (typeof window.supabase !== 'undefined') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client created successfully');
} else {
    console.error('Supabase library not loaded!');
}

// تعريف الأدوار
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manger',
    USER: 'user',
    SUPPORT: 'support',
    SPUSER: 'spuser'
};

const ROLE_NAMES = {
    [ROLES.ADMIN]: 'إدارة عليا',
    [ROLES.MANAGER]: 'مدير منطقة',
    [ROLES.USER]: 'مختص تربوي',
    [ROLES.SUPPORT]: 'دعم فني',
    [ROLES.SPUSER]: 'مدير مدرسة'
};

// ==================== دوال المستخدم ====================

function saveUserToStorage(user) {
    const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name || user.full_name || user.username,
        role: user.role,
        district_id: user.district_id || null,
        district: user.district || user.district_name || null,
        district_name: user.district_name || user.district || null,
        school_id: user.school_id || null,
        school: user.school || user.school_name || null,
        school_name: user.school_name || user.school || null,
        created_at: user.created_at
    };
    localStorage.setItem('currentUser', JSON.stringify(userData));
    return userData;
}

function loadUserFromStorage() {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
}

function getRoleName(role) {
    return ROLE_NAMES[role] || role;
}

async function getCurrentUser() {
    try {
        const storedUser = loadUserFromStorage();
        if (storedUser && storedUser.id) {
            return storedUser;
        }
        return null;
    } catch (error) {
        console.error('Error getting current user:', error);
        return loadUserFromStorage();
    }
}

// ==================== دوال الإشعارات ====================

async function createNotification(userId, title, message, type = 'info', reportId = null, reportType = null) {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const { data, error } = await window.supabaseClient
            .from('notifications')
            .insert([{
                user_id: userId,
                title: title,
                message: message,
                type: type,
                related_report_id: reportId,
                related_report_type: reportType,
                is_read: false
            }])
            .select();
        
        if (error) throw error;
        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: error.message };
    }
}

async function sendVisitReportNotifications(reportData, reportId, reportType, specialistName, actionType = 'create') {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false };
        }
        
        const { data: school, error: schoolError } = await window.supabaseClient
            .from('schools')
            .select('id, name, district_id')
            .eq('id', reportData.school_id)
            .single();
        
        if (schoolError) throw schoolError;
        
        const { data: users, error: usersError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id, school_id')
            .in('role', ['admin', 'support', 'manger', 'spuser']);
        
        if (usersError) throw usersError;
        
        const reportTypeName = reportType === 'in_person' ? 'وجاهي' : 'عن بعد';

        let title, message;

        if (actionType === 'update') {
            title = `✏️ تم تعديل تقرير ${reportTypeName}`;
            message = `تم تعديل تقرير في مدرسة ${school.name} بواسطة ${specialistName}`;
        } else {
            title = `📄 تقرير ${reportTypeName} جديد`;
            message = `تم إضافة تقرير في مدرسة ${school.name} بواسطة ${specialistName}`;
        }
        
        for (const user of users) {
            let shouldNotify = false;

            if (user.role === 'admin' || user.role === 'support') {
                shouldNotify = true;
            } 
            else if (user.role === 'manger' && user.district_id === school.district_id) {
                shouldNotify = true;
            } 
            else if (user.role === 'spuser' && user.school_id === reportData.school_id) {
                shouldNotify = true;
            }
            
            if (shouldNotify) {
                await createNotification(
                    user.id,
                    title,
                    message,
                    'info',
                    reportId,
                    reportType
                );
            }
        }
        
        return { success: true };

    } catch (error) {
        console.error('Error sending visit report notifications:', error);
        return { success: false, error: error.message };
    }
}

async function sendSummaryReportNotifications(reportData, reportId, specialistName, actionType = 'create') {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const { data: district, error: districtError } = await window.supabaseClient
            .from('districts')
            .select('id, name')
            .eq('id', reportData.district_id)
            .single();
        
        if (districtError) throw districtError;
        
        const { data: users, error: usersError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id')
            .in('role', ['admin', 'support', 'manger']);
        
        if (usersError) throw usersError;
        
        const reportTypeName = reportData.report_type === 'in_person' ? 'وجاهي' : 'عن بعد';
        
        let title, message;
        
        if (actionType === 'update') {
            title = `✏️ تم تعديل تقرير تجميعي (${reportTypeName})`;
            message = `تم تعديل التقرير التجميعي لمنطقة ${district.name} بواسطة ${specialistName}`;
        } else {
            title = `📊 تقرير تجميعي جديد (${reportTypeName})`;
            message = `تم إضافة تقرير تجميعي جديد لمنطقة ${district.name} بواسطة ${specialistName}`;
        }
        
        for (const user of users) {
            let shouldNotify = false;
            
            if (user.role === 'admin' || user.role === 'support') {
                shouldNotify = true;
            } 
            else if (user.role === 'manger' && user.district_id === reportData.district_id) {
                shouldNotify = true;
            }
            
            if (shouldNotify) {
                await createNotification(
                    user.id, 
                    title, 
                    message, 
                    'info', 
                    reportId, 
                    'summary'
                );
            }
        }
        
        console.log(`Summary report notification sent for ${actionType} action`);
        return { success: true };
        
    } catch (error) {
        console.error('Error sending summary report notifications:', error);
        return { success: false, error: error.message };
    }
}

async function getUnreadNotificationsCount(userId) {
    try {
        if (!window.supabaseClient) {
            return { success: false, count: 0 };
        }
        
        const { count, error } = await window.supabaseClient
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        
        if (error) throw error;
        return { success: true, count: count || 0 };
    } catch (error) {
        console.error('Error getting unread count:', error);
        return { success: false, count: 0 };
    }
}

async function getRecentNotifications(userId, limit = 20) {
    try {
        if (!window.supabaseClient) {
            return { success: false, data: [] };
        }
        
        const { data, error } = await window.supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        if (error) throw error;
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Error fetching recent notifications:', error);
        return { success: false, data: [] };
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        if (!window.supabaseClient) {
            return { success: false };
        }
        
        const { data, error } = await window.supabaseClient
            .from('notifications')
            .update({ 
                is_read: true, 
                read_at: new Date().toISOString() 
            })
            .eq('id', notificationId)
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            console.warn('⚠️ لم يتم تحديث أي صف (غالباً مشكلة صلاحيات RLS)');
            return { success: false };
        }

        console.log('✅ تم تحديث الإشعار:', data);
        return { success: true };

    } catch (error) {
        console.error('Error marking notification as read:', error);
        return { success: false };
    }
}

async function markAllNotificationsAsRead(userId) {
    try {
        if (!window.supabaseClient) {
            return { success: false };
        }
        
        const { error } = await window.supabaseClient
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('is_read', false);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return { success: false };
    }
}

async function deleteNotification(notificationId) {
    try {
        if (!window.supabaseClient) {
            return { success: false };
        }
        
        const { error } = await window.supabaseClient
            .from('notifications')
            .delete()
            .eq('id', notificationId);
        
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Error deleting notification:', error);
        return { success: false };
    }
}

// ==================== دالة موحدة لفتح الإشعارات من أي صفحة ====================

async function handleNotificationClick(notificationId) {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false, error: 'supabaseClient not available' };
        }
        
        // جلب بيانات الإشعار
        const { data: notification, error } = await window.supabaseClient
            .from('notifications')
            .select('related_report_id, related_report_type, title, message')
            .eq('id', notificationId)
            .single();
        
        if (error) throw error;
        
        // تحديث حالة الإشعار كمقروء
        await markNotificationAsRead(notificationId);
        
        // تحديث العدد غير المقروء في الواجهة إذا كانت الدالة متوفرة
        if (typeof updateUnreadBadge === 'function') {
            try { await updateUnreadBadge(); } catch(e) {}
        }
        
        // التحقق من وجود تقرير مرتبط
        if (notification && notification.related_report_id && notification.related_report_type) {
            const reportId = notification.related_report_id;
            const reportType = notification.related_report_type;
            
            if (reportType === 'summary') {
                // فتح التقرير التجميعي
                window.location.href = `summary-reports.html?view=${reportId}`;
            } else if (reportType === 'in_person' || reportType === 'remote') {
                // فتح التقرير العادي
                window.location.href = `reports.html?view=${reportId}&type=${reportType}`;
            } else {
                console.warn('Unknown report type:', reportType);
                return { success: false, error: 'Unknown report type' };
            }
            
            return { success: true, redirected: true };
        } else {
            // إشعار بدون تقرير مرتبط
            console.log('Notification without related report');
            return { success: true, redirected: false };
        }
        
    } catch (error) {
        console.error('Error handling notification click:', error);
        return { success: false, error: error.message };
    }
}

// ==================== دوال إضافية ====================

function hasPermission(user, permission) {
    if (!user || !user.role) return false;
    return true;
}

function canEditReport(user, report) {
    if (!user || !report) return false;
    return true;
}

function canDeleteReport(user, report) {
    if (!user || !report) return false;
    return false;
}

async function getReportsByPermission(user) {
    return [];
}

async function login(usernameOrEmail, password) {
    return { success: false, error: 'Login function not implemented' };
}

async function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
}

// ==================== تصدير الدوال ====================

window.saveUserToStorage = saveUserToStorage;
window.loadUserFromStorage = loadUserFromStorage;
window.getCurrentUser = getCurrentUser;
window.getRoleName = getRoleName;
window.hasPermission = hasPermission;
window.canEditReport = canEditReport;
window.canDeleteReport = canDeleteReport;
window.getReportsByPermission = getReportsByPermission;
window.login = login;
window.logout = logout;
window.ROLES = ROLES;
window.ROLE_NAMES = ROLE_NAMES;

// تصدير دوال الإشعارات
window.createNotification = createNotification;
window.sendVisitReportNotifications = sendVisitReportNotifications;
window.sendSummaryReportNotifications = sendSummaryReportNotifications;
window.getUnreadNotificationsCount = getUnreadNotificationsCount;
window.getRecentNotifications = getRecentNotifications;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.deleteNotification = deleteNotification;
window.handleNotificationClick = handleNotificationClick;  // دالة موحدة لفتح الإشعارات

console.log('✅ Supabase.js loaded successfully');