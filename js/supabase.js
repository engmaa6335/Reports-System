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
        console.log(`✅ إشعار مرسل للمستخدم ${userId}: ${title}`);
        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error creating notification:', error);
        return { success: false, error: error.message };
    }
}

// دالة sendCustomNotification (الأساسية للإشعارات)
async function sendCustomNotification({ userId, email, title, message, related_report_type, related_report_id }) {
    console.log('📢 sendCustomNotification called:', { userId, email, title, related_report_type, related_report_id });
    
    try {
        let targetUserId = userId;
        
        if (!targetUserId && email) {
            const { data: user, error: userError } = await window.supabaseClient
                .from('users')
                .select('id')
                .eq('email', email)
                .maybeSingle();
            
            if (userError) {
                console.error('Error finding user by email:', userError);
                return { success: false, error: userError.message };
            }
            
            if (user) {
                targetUserId = user.id;
                console.log(`Found user by email: ${email} -> ID: ${targetUserId}`);
            } else {
                console.log(`No user found for email: ${email}`);
                return { success: true, note: 'No user found for this email' };
            }
        }
        
        if (!targetUserId) {
            console.error('No userId or valid email provided');
            return { success: false, error: 'No valid recipient' };
        }
        
        const result = await createNotification(targetUserId, title, message, 'info', related_report_id, related_report_type);
        return result;
        
    } catch (error) {
        console.error('Error in sendCustomNotification:', error);
        return { success: false, error: error.message };
    }
}

// ✅ دالة الإشعارات الرئيسية (مع دعم التعديل والإضافة)
async function sendVisitReportNotifications(reportData, reportId, reportType, specialistName, actionType = 'create') {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false };
        }
        
        // ✅ تحديد نوع العملية بشكل صريح
        const isEdit = (actionType === 'update' || actionType === 'edit');
        
        console.log(`📢 إرسال إشعار: actionType=${actionType} (isEdit=${isEdit}) - reportType=${reportType}`);
        
        let entityName = '';
        let entityDistrictId = null;
        let entityManagerEmail = null;
        let entityManagerName = '';
        
        // تحديد نوع التقرير وجلب البيانات
        if (reportType === 'in_person') {
            const centerId = reportData.educational_center_id;
            if (!centerId) {
                console.error('لا يوجد educational_center_id');
                return { success: false, error: 'Missing educational_center_id' };
            }
            
            const { data: center, error: centerError } = await window.supabaseClient
                .from('educational_centers')
                .select('id, name_ar, name_en, district_id, manager_name_ar, email')
                .eq('id', centerId)
                .single();
            
            if (centerError) throw centerError;
            
            entityName = center.name_ar || center.name_en || 'المركز';
            entityDistrictId = center.district_id;
            entityManagerEmail = center.email;
            entityManagerName = center.manager_name_ar || 'مدير المركز';
        } else {
            const schoolId = reportData.school_id;
            if (!schoolId) {
                console.error('لا يوجد school_id');
                return { success: false, error: 'Missing school_id' };
            }
            
            const { data: school, error: schoolError } = await window.supabaseClient
                .from('schools')
                .select('id, name, district_id, schoolPrincipal, schoolPrincipalEmail')
                .eq('id', schoolId)
                .single();
            
            if (schoolError) throw schoolError;
            
            entityName = school.name;
            entityDistrictId = school.district_id;
            entityManagerEmail = school.schoolPrincipalEmail;
            entityManagerName = school.schoolPrincipal || 'مدير المدرسة';
        }
        
        const reportTypeName = reportType === 'in_person' ? 'وجاهي' : 'عن بعد';
        
        // ✅ بناء عنوان ورسالة مختلفين للتعديل والإضافة
        let title, message;
        if (isEdit) {
            title = `✏️ تعديل تقرير ${reportTypeName}`;
            message = `تم تعديل التقرير ${reportTypeName} في ${entityName} بواسطة ${specialistName}`;
        } else {
            title = `📄 إضافة تقرير ${reportTypeName}`;
            message = `تم إضافة تقرير ${reportTypeName} في ${entityName} بواسطة ${specialistName}`;
        }
        
        // إضافة تفاصيل إضافية
        if (reportData.teacher_name) message += `\nالمعلم: ${reportData.teacher_name}`;
        if (reportData.visit_date) {
            const date = new Date(reportData.visit_date).toLocaleDateString('ar-SA');
            message += `\nالتاريخ: ${date}`;
        }
        
        console.log(`📢 عنوان الإشعار: ${title}`);
        
        // جلب المستخدمين المستهدفين
        const { data: users, error: usersError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id, school_id, email');
        
        if (usersError) throw usersError;
        
        let sentCount = 0;
        const notifiedUserIds = new Set();
        
        for (const user of users) {
            let shouldNotify = false;
            
            if (user.role === 'admin' || user.role === 'support') {
                shouldNotify = true;
            }
            else if (user.role === 'manger' && user.district_id === entityDistrictId) {
                shouldNotify = true;
            }
            else if (reportType === 'remote' && user.role === 'spuser' && user.school_id === reportData.school_id) {
                shouldNotify = true;
            }
            
            if (shouldNotify && !notifiedUserIds.has(user.id)) {
                await createNotification(user.id, title, message, 'info', reportId, reportType);
                notifiedUserIds.add(user.id);
                sentCount++;
                console.log(`✅ إشعار ${isEdit ? 'تعديل' : 'إضافة'} للمستخدم ${user.id} (${user.role})`);
            }
        }
        
        // إشعار لمدير المركز (للتقارير الوجاهية)
        if (reportType === 'in_person' && entityManagerEmail) {
            const { data: managerUser, error: managerError } = await window.supabaseClient
                .from('users')
                .select('id')
                .eq('email', entityManagerEmail)
                .maybeSingle();
            
            if (managerUser && !notifiedUserIds.has(managerUser.id)) {
                const managerTitle = isEdit ? `✏️ تعديل تقرير في ${entityName}` : `📋 إضافة تقرير في ${entityName}`;
                const managerMessage = isEdit 
                    ? `تم تعديل تقرير وجاهي في مركزك (${entityName}) بواسطة ${specialistName}`
                    : `تم إضافة تقرير وجاهي في مركزك (${entityName}) بواسطة ${specialistName}`;
                await createNotification(managerUser.id, managerTitle, managerMessage, 'info', reportId, reportType);
                notifiedUserIds.add(managerUser.id);
                sentCount++;
                console.log(`✅ إشعار ${isEdit ? 'تعديل' : 'إضافة'} لمدير المركز (${entityManagerName})`);
            }
        }
        
        console.log(`✅ تم إرسال ${sentCount} إشعار (${isEdit ? 'تعديل' : 'إضافة'}) للتقرير ${reportTypeName} (ID: ${reportId})`);
        return { success: true, sentCount: sentCount };
        
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
        
        const isUpdate = (actionType === 'update' || actionType === 'edit');
        
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
        if (isUpdate) {
            title = `✏️ تحديث تقرير تجميعي (${reportTypeName})`;
            message = `تم تحديث التقرير التجميعي لمنطقة ${district.name} بواسطة ${specialistName}`;
        } else {
            title = `📊 إضافة تقرير تجميعي (${reportTypeName})`;
            message = `تم إضافة تقرير تجميعي لمنطقة ${district.name} بواسطة ${specialistName}`;
        }
        
        let sentCount = 0;
        
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
                sentCount++;
            }
        }
        
        console.log(`✅ تم إرسال ${sentCount} إشعار ${isUpdate ? 'تحديث' : 'إضافة'} للتقرير التجميعي`);
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

// ==================== دالة موحدة لفتح الإشعارات من أي صفحة (محسنة) ====================

async function handleNotificationClick(notificationId) {
    try {
        console.log(`🔔 النقر على الإشعار: ${notificationId}`);
        
        // جلب بيانات الإشعار
        const { data: notification, error } = await window.supabaseClient
            .from('notifications')
            .select('related_report_id, related_report_type')
            .eq('id', notificationId)
            .single();
        
        if (error) throw error;
        
        // تحديث حالة الإشعار كمقروء
        await markNotificationAsRead(notificationId);
        
        const reportId = notification?.related_report_id;
        const reportType = notification?.related_report_type;
        
        if (reportId && reportType && reportId !== 'null') {
            const timestamp = Date.now();
            
            // تخزين البيانات في localStorage و sessionStorage
            localStorage.setItem('pendingReportId', reportId);
            localStorage.setItem('pendingReportType', reportType);
            localStorage.setItem('pendingReportTimestamp', timestamp.toString());
            sessionStorage.setItem('pendingReportId', reportId);
            sessionStorage.setItem('pendingReportType', reportType);
            sessionStorage.setItem('pendingReportTimestamp', timestamp.toString());
            
            console.log(`📌 تم تخزين التقرير: ${reportType} - ${reportId}`);
            
            // تحديد الصفحة المستهدفة
            let targetPage = '';
            if (reportType === 'summary') {
                targetPage = 'summary-reports.html';
                window.location.href = `${targetPage}?view=${reportId}&t=${timestamp}`;
            } else {
                targetPage = 'reports.html';
                window.location.href = `${targetPage}?view=${reportId}&type=${reportType}&t=${timestamp}`;
            }
        } else {
            console.log('إشعار بدون تقرير');
        }
        
        return { success: true };
        
    } catch (error) {
        console.error('Error in handleNotificationClick:', error);
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

// ==================== دوال حذف الإشعارات القديمة مع تحديد الوقت ====================

function shouldRunCleanup(userId) {
    const lastCleanupKey = `lastCleanup_${userId}`;
    const lastCleanup = localStorage.getItem(lastCleanupKey);
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    if (!lastCleanup) {
        return true;
    }
    
    const timeSinceLastCleanup = now - parseInt(lastCleanup);
    return timeSinceLastCleanup >= TWENTY_FOUR_HOURS;
}

function updateLastCleanupTime(userId) {
    const lastCleanupKey = `lastCleanup_${userId}`;
    localStorage.setItem(lastCleanupKey, Date.now().toString());
}

async function deleteOldUserNotificationsAndReorder(userId) {
    try {
        if (!shouldRunCleanup(userId)) {
            const lastCleanup = localStorage.getItem(`lastCleanup_${userId}`);
            const lastDate = lastCleanup ? new Date(parseInt(lastCleanup)).toLocaleString('ar-SA') : 'غير معروف';
            console.log(`⏭️ تم التنظيف آخر مرة في ${lastDate} - تخطي`);
            return { success: true, skipped: true, deletedCount: 0 };
        }
        
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        console.log(`🔍 جاري فحص الإشعارات القديمة للمستخدم ${userId}...`);
        
        const { data: oldNotifications, error: fetchError } = await window.supabaseClient
            .from('notifications')
            .select('id, created_at')
            .eq('user_id', userId)
            .lt('created_at', fifteenDaysAgo.toISOString());
        
        if (fetchError) throw fetchError;
        
        const deletedCount = oldNotifications?.length || 0;
        
        if (deletedCount > 0) {
            const { error: deleteError } = await window.supabaseClient
                .from('notifications')
                .delete()
                .eq('user_id', userId)
                .lt('created_at', fifteenDaysAgo.toISOString());
            
            if (deleteError) throw deleteError;
            
            console.log(`✅ تم حذف ${deletedCount} إشعار قديم للمستخدم ${userId}`);
            await reorderUserNotificationsSequential(userId);
            updateLastCleanupTime(userId);
        } else {
            console.log(`📭 لا توجد إشعارات قديمة للمستخدم ${userId}`);
            updateLastCleanupTime(userId);
        }
        
        return { success: true, deletedCount: deletedCount, skipped: false };
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        return { success: false, error: error.message, deletedCount: 0 };
    }
}

async function reorderUserNotificationsSequential(userId) {
    try {
        const { data: userNotifications, error: fetchError } = await window.supabaseClient
            .from('notifications')
            .select('id, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });
        
        if (fetchError) throw fetchError;
        
        if (!userNotifications || userNotifications.length === 0) {
            return { success: true, reorderedCount: 0 };
        }
        
        let updateCount = 0;
        
        for (let i = 0; i < userNotifications.length; i++) {
            const newId = i + 1;
            const currentId = userNotifications[i].id;
            
            if (currentId !== newId) {
                const { error: updateError } = await window.supabaseClient
                    .from('notifications')
                    .update({ id: newId })
                    .eq('id', currentId);
                
                if (!updateError) {
                    updateCount++;
                }
            }
        }
        
        try {
            const { data: maxIdResult } = await window.supabaseClient
                .from('notifications')
                .select('id')
                .order('id', { ascending: false })
                .limit(1);
            
            const maxId = maxIdResult && maxIdResult.length > 0 ? maxIdResult[0].id : userNotifications.length;
            await window.supabaseClient.rpc('restart_notifications_sequence', { max_id: maxId });
        } catch (rpcError) {
            console.warn('⚠️ لا يمكن إعادة تعيين الـ sequence:', rpcError);
        }
        
        return { success: true, reorderedCount: updateCount };
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        return { success: false, error: error.message, reorderedCount: 0 };
    }
}

async function initUserSessionCleanup(showNotification = true) {
    const currentUser = await getCurrentUser();
    
    if (!currentUser || !currentUser.id) {
        return { success: false, message: 'لا يوجد مستخدم مسجل الدخول', deletedCount: 0 };
    }
    
    try {
        console.log(`👤 تهيئة الجلسة للمستخدم: ${currentUser.name || currentUser.username}`);
        const cleanupResult = await deleteOldUserNotificationsAndReorder(currentUser.id);
        
        if (typeof window.updateUnreadBadge === 'function') {
            try { await window.updateUnreadBadge(); } catch(e) {}
        }
        
        return {
            success: true,
            deletedCount: cleanupResult.deletedCount || 0,
            skipped: cleanupResult.skipped || false,
            userId: currentUser.id
        };
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        return { success: false, error: error.message, deletedCount: 0 };
    }
}

// ==================== دوال الحفاظ على نشاط المشروع ====================

let keepAliveInterval = null;
let isKeepAliveRunning = false;

async function keepProjectAlive() {
    if (isKeepAliveRunning) {
        return { success: false, message: 'Already running' };
    }
    
    isKeepAliveRunning = true;
    
    try {
        const now = new Date();
        console.log(`🔄 [${now.toLocaleString('ar-SA')}] تنشيط المشروع...`);
        
        const { error } = await window.supabaseClient
            .from('users')
            .select('*', { count: 'exact', head: true })
            .limit(1);
        
        if (error) throw error;
        
        const activityCount = parseInt(localStorage.getItem('activityCount') || '0') + 1;
        localStorage.setItem('lastProjectActivity', now.toISOString());
        localStorage.setItem('activityCount', activityCount.toString());
        
        console.log(`✅ تم تنشيط المشروع بنجاح (النشاط رقم ${activityCount})`);
        
        return { success: true };
        
    } catch (error) {
        console.error('❌ فشل تنشيط المشروع:', error);
        return { success: false, error: error.message };
    } finally {
        isKeepAliveRunning = false;
    }
}

function startAutoKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    setTimeout(() => { keepProjectAlive(); }, 10000);
    
    const FORTY_SEVEN_HOURS = 47 * 60 * 60 * 1000;
    
    keepAliveInterval = setInterval(async () => {
        console.log('🚀 تنفيذ الصيانة الدورية للمشروع...');
        await keepProjectAlive();
        
        const currentUser = await getCurrentUser();
        if (currentUser && currentUser.id) {
            await deleteOldUserNotificationsAndReorder(currentUser.id);
        }
    }, FORTY_SEVEN_HOURS);
    
    console.log('✅ تم تفعيل نظام الحفاظ على النشاط (كل 47 ساعة)');
    
    return keepAliveInterval;
}

function stopAutoKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
        console.log('⏹️ تم إيقاف نظام الحفاظ على النشاط');
    }
}

// ==================== دوال التنظيف لجميع المستخدمين ====================

async function cleanupAllUsersNotifications() {
    try {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        const { data: oldNotifications, error: fetchError } = await window.supabaseClient
            .from('notifications')
            .select('user_id, id')
            .lt('created_at', fifteenDaysAgo.toISOString());
        
        if (fetchError) throw fetchError;
        
        if (!oldNotifications || oldNotifications.length === 0) {
            return { success: true, deletedCount: 0, affectedUsers: 0 };
        }
        
        const uniqueUserIds = [...new Set(oldNotifications.map(n => n.user_id))];
        const deletedCount = oldNotifications.length;
        
        const { error: deleteError } = await window.supabaseClient
            .from('notifications')
            .delete()
            .lt('created_at', fifteenDaysAgo.toISOString());
        
        if (deleteError) throw deleteError;
        
        let reorderedCount = 0;
        for (const userId of uniqueUserIds) {
            const reorderResult = await reorderUserNotificationsSequential(userId);
            if (reorderResult.success && reorderResult.reorderedCount) {
                reorderedCount += reorderResult.reorderedCount;
            }
            localStorage.setItem(`lastCleanup_${userId}`, Date.now().toString());
        }
        
        return { 
            success: true, 
            deletedCount: deletedCount, 
            affectedUsers: uniqueUserIds.length,
            reorderedCount: reorderedCount
        };
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        return { success: false, error: error.message };
    }
}

// ==================== دوال إدارة التقارير ====================

async function createReport(reportData, reportType) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        const { data, error } = await window.supabaseClient
            .from(tableName)
            .insert([reportData])
            .select();
        
        if (error) throw error;
        
        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error creating report:', error);
        return { success: false, error: error.message };
    }
}

async function updateReport(reportId, reportData, reportType) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        const { data, error } = await window.supabaseClient
            .from(tableName)
            .update(reportData)
            .eq('id', reportId)
            .select();
        
        if (error) throw error;
        
        return { success: true, data: data?.[0] };
    } catch (error) {
        console.error('Error updating report:', error);
        return { success: false, error: error.message };
    }
}

async function deleteReport(reportId, reportType) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        const { error } = await window.supabaseClient
            .from(tableName)
            .delete()
            .eq('id', reportId);
        
        if (error) throw error;
        
        return { success: true };
    } catch (error) {
        console.error('Error deleting report:', error);
        return { success: false, error: error.message };
    }
}

async function getReportById(reportId, reportType) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        const { data, error } = await window.supabaseClient
            .from(tableName)
            .select('*')
            .eq('id', reportId)
            .single();
        
        if (error) throw error;
        
        return { success: true, data: data };
    } catch (error) {
        console.error('Error getting report:', error);
        return { success: false, error: error.message };
    }
}

async function getReportsByUser(userId, reportType, filters = {}) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available', data: [] };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        let query = window.supabaseClient
            .from(tableName)
            .select('*')
            .eq('specialist_id', userId)
            .order('visit_date', { ascending: false });
        
        if (filters.startDate) {
            query = query.gte('visit_date', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('visit_date', filters.endDate);
        }
        if (filters.educational_center_id) {
            query = query.eq('educational_center_id', filters.educational_center_id);
        }
        if (filters.school_id) {
            query = query.eq('school_id', filters.school_id);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Error getting user reports:', error);
        return { success: false, error: error.message, data: [] };
    }
}

async function getAllReports(reportType, filters = {}) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available', data: [] };
        }
        
        const tableName = reportType === 'in_person' ? 'in_person_reports' : 'remote_reports';
        
        let query = window.supabaseClient
            .from(tableName)
            .select('*')
            .order('visit_date', { ascending: false });
        
        if (filters.district_id) {
            if (reportType === 'in_person') {
                query = query.eq('educational_centers.district_id', filters.district_id);
            } else {
                query = query.eq('schools.district_id', filters.district_id);
            }
        }
        if (filters.startDate) {
            query = query.gte('visit_date', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('visit_date', filters.endDate);
        }
        if (filters.specialist_id) {
            query = query.eq('specialist_id', filters.specialist_id);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Error getting all reports:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// ==================== تصدير جميع الدوال ====================

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

// دوال الإشعارات
window.createNotification = createNotification;
window.sendCustomNotification = sendCustomNotification;
window.sendVisitReportNotifications = sendVisitReportNotifications;
window.sendSummaryReportNotifications = sendSummaryReportNotifications;
window.getUnreadNotificationsCount = getUnreadNotificationsCount;
window.getRecentNotifications = getRecentNotifications;
window.markNotificationAsRead = markNotificationAsRead;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;
window.deleteNotification = deleteNotification;
window.handleNotificationClick = handleNotificationClick;

// دوال التنظيف
window.deleteOldUserNotificationsAndReorder = deleteOldUserNotificationsAndReorder;
window.reorderUserNotificationsSequential = reorderUserNotificationsSequential;
window.initUserSessionCleanup = initUserSessionCleanup;
window.cleanupAllUsersNotifications = cleanupAllUsersNotifications;

// دوال الحفاظ على النشاط
window.keepProjectAlive = keepProjectAlive;
window.startAutoKeepAlive = startAutoKeepAlive;
window.stopAutoKeepAlive = stopAutoKeepAlive;

// دوال إدارة التقارير
window.createReport = createReport;
window.updateReport = updateReport;
window.deleteReport = deleteReport;
window.getReportById = getReportById;
window.getReportsByUser = getReportsByUser;
window.getAllReports = getAllReports;

console.log('✅ Supabase.js loaded successfully');