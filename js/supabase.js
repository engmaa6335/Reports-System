console.log('%c🔖 SYSTEM_FIX_VERSION: 2026-08-11-v5', 'color:#2e9b54;font-weight:bold;font-size:14px');
// js/supabase.js
// تهيئة Supabase
const SUPABASE_URL = 'https://anztmacxegbzppixifvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuenRtYWN4ZWdienBwaXhpZnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzE0NDEsImV4cCI6MjA4NzkwNzQ0MX0.Q3wh6e00vUSgTgsoCXFh4ay6X4CSgUaETwIG3L105q4';

// إنشاء عميل Supabase
if (typeof window.supabase !== 'undefined') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client created successfully');
} else {
    console.error('❌ Supabase library not loaded!');
}

// تعريف الأدوار - تم إضافة دور center
const ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manger',
    USER: 'user',
    SUPPORT: 'support',
    SPUSER: 'spuser',
    CENTER: 'center'  // مدير مركز تعليمي
};

const ROLE_NAMES = {
    [ROLES.ADMIN]: 'إدارة عليا',
    [ROLES.MANAGER]: 'مدير منطقة',
    [ROLES.USER]: 'مختص تربوي',
    [ROLES.SUPPORT]: 'دعم فني',
    [ROLES.SPUSER]: 'مدير مدرسة',
    [ROLES.CENTER]: 'مدير مركز تعليمي'
};

// ترتيب الأدوار حسب الصلاحية (من الأعلى إلى الأقل) - تم إضافة center
const ROLE_PRIORITY = {
    'admin': 5,
    'support': 4,
    'manger': 3,
    'spuser': 2,
    'center': 2,  // مدير المركز له نفس صلاحية مدير المدرسة
    'user': 1
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
        educational_center_id: user.educational_center_id || null,
        educational_center_name: user.educational_center_name || null,
        is_active: user.is_active !== false,
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

// ==================== دوال إدارة الكيانات والصلاحيات ====================

function getRolePriority(role) {
    return ROLE_PRIORITY[role] || 0;
}

function getRoleFromAssignments(assignments, currentRole) {
    if (!assignments || assignments.length === 0) return currentRole;
    
    const possibleRoles = [];
    
    for (const assignment of assignments) {
        let role = null;
        if (assignment.entity_type === 'district') {
            role = 'manger';
        } else if (assignment.entity_type === 'school') {
            role = 'spuser';
        } else if (assignment.entity_type === 'educational_center') {
            role = 'center';  // المركز يعطي دور center
        }
        if (role) possibleRoles.push(role);
    }
    
    if (possibleRoles.length === 0) return currentRole;
    
    let highestRole = possibleRoles[0];
    let highestPriority = getRolePriority(highestRole);
    
    for (const role of possibleRoles) {
        const priority = getRolePriority(role);
        if (priority > highestPriority) {
            highestPriority = priority;
            highestRole = role;
        }
    }
    
    return highestRole;
}

async function updateUserRoleFromAssignments(userId, assignments = null) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        let userAssignments = assignments;
        if (!userAssignments) {
            const { data, error } = await window.supabaseClient
                .from('user_assignments')
                .select('*')
                .eq('user_id', userId)
                .eq('is_active', true);
            
            if (error) throw error;
            userAssignments = data || [];
        }
        
        const { data: user, error: userError } = await window.supabaseClient
            .from('users')
            .select('id, role, name, username, email')
            .eq('id', userId)
            .single();
        
        if (userError) throw userError;
        
        const newRole = getRoleFromAssignments(userAssignments, user.role);
        
        if (newRole !== user.role) {
            console.log(`🔄 تحديث دور المستخدم ${user.name}: ${user.role} → ${newRole}`);
            
            const { error: updateError } = await window.supabaseClient
                .from('users')
                .update({ role: newRole })
                .eq('id', userId);
            
            if (updateError) throw updateError;
            
            const currentUser = await getCurrentUser();
            if (currentUser && currentUser.id == userId) {
                currentUser.role = newRole;
                saveUserToStorage(currentUser);
            }
            
            return { 
                success: true, 
                oldRole: user.role, 
                newRole: newRole,
                changed: true,
                userId: userId
            };
        }
        
        return { 
            success: true, 
            oldRole: user.role, 
            newRole: user.role,
            changed: false,
            userId: userId
        };
        
    } catch (error) {
        console.error('❌ خطأ في تحديث دور المستخدم:', error);
        return { success: false, error: error.message };
    }
}

function getEntityRoleInfo(entityType, entityId, user) {
    const roleMap = {
        'district': { role: 'manger', label: 'مدير منطقة', icon: 'fa-map-marked-alt' },
        'school': { role: 'spuser', label: 'مدير مدرسة', icon: 'fa-school' },
        'educational_center': { role: 'center', label: 'مدير مركز تعليمي', icon: 'fa-university' }
    };
    
    const info = roleMap[entityType] || { role: 'user', label: 'مستخدم', icon: 'fa-user' };
    
    let entityName = '';
    if (entityType === 'district') {
        const d = window.districts?.find(x => x.id == entityId);
        entityName = d ? d.name : '';
    } else if (entityType === 'school') {
        const s = window.schools?.find(x => x.id == entityId);
        entityName = s ? s.name : '';
    } else if (entityType === 'educational_center') {
        const c = window.centers?.find(x => x.id == entityId);
        entityName = c ? (c.name_en || c.name_ar || '') : '';
    }
    
    const userPriority = user ? getRolePriority(user.role) : 0;
    const entityPriority = getRolePriority(info.role);
    
    return {
        ...info,
        entityName: entityName,
        isHigherThanCurrent: entityPriority > userPriority,
        isLowerThanCurrent: entityPriority < userPriority,
        isSameAsCurrent: entityPriority === userPriority
    };
}

async function addAssignmentWithRoleUpdate(userId, entityType, entityId) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const { data: existing, error: checkError } = await window.supabaseClient
            .from('user_assignments')
            .select('id')
            .eq('user_id', userId)
            .eq('entity_type', entityType)
            .eq('entity_id', entityId)
            .maybeSingle();
        
        if (checkError) throw checkError;
        
        if (existing) {
            return { success: false, error: 'هذا الكيان مضاف مسبقاً' };
        }
        
        const { error: insertError } = await window.supabaseClient
            .from('user_assignments')
            .insert({
                user_id: userId,
                entity_type: entityType,
                entity_id: entityId,
                is_active: true
            });
        
        if (insertError) throw insertError;
        
        const roleUpdateResult = await updateUserRoleFromAssignments(userId);
        
        return {
            success: true,
            roleUpdated: roleUpdateResult.changed,
            oldRole: roleUpdateResult.oldRole,
            newRole: roleUpdateResult.newRole,
            userId: userId
        };
        
    } catch (error) {
        console.error('❌ خطأ في إضافة التعيين:', error);
        return { success: false, error: error.message };
    }
}

async function removeAssignmentWithRoleUpdate(userId, assignmentId) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        const { error: deleteError } = await window.supabaseClient
            .from('user_assignments')
            .delete()
            .eq('id', assignmentId)
            .eq('user_id', userId);
        
        if (deleteError) throw deleteError;
        
        const { data: remainingAssignments, error: fetchError } = await window.supabaseClient
            .from('user_assignments')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true);
        
        if (fetchError) throw fetchError;
        
        const roleUpdateResult = await updateUserRoleFromAssignments(userId, remainingAssignments);
        
        return {
            success: true,
            roleUpdated: roleUpdateResult.changed,
            oldRole: roleUpdateResult.oldRole,
            newRole: roleUpdateResult.newRole,
            userId: userId
        };
        
    } catch (error) {
        console.error('❌ خطأ في حذف التعيين:', error);
        return { success: false, error: error.message };
    }
}

// ==================== دوال التعيينات (user_assignments) ====================

async function getUserEntityIds(userId, entityType) {
    try {
        if (!window.supabaseClient) return [];
        
        const { data, error } = await window.supabaseClient
            .from('user_assignments')
            .select('entity_id')
            .eq('user_id', userId)
            .eq('entity_type', entityType)
            .eq('is_active', true);
        
        if (error) throw error;
        return (data || []).map(item => parseInt(item.entity_id));
    } catch (error) {
        console.error(`Error getting user ${entityType} ids:`, error);
        return [];
    }
}

async function getAllUserEntities(user) {
    if (!user || !user.id) return { districts: [], schools: [], centers: [] };
    
    try {
        const [districts, schools, centers] = await Promise.all([
            getUserEntityIds(user.id, 'district'),
            getUserEntityIds(user.id, 'school'),
            getUserEntityIds(user.id, 'educational_center')
        ]);
        
        // إضافة الكيانات المباشرة من user
        if (user.district_id && !districts.includes(parseInt(user.district_id))) {
            districts.push(parseInt(user.district_id));
        }
        if (user.school_id && !schools.includes(parseInt(user.school_id))) {
            schools.push(parseInt(user.school_id));
        }
        if (user.educational_center_id && !centers.includes(parseInt(user.educational_center_id))) {
            centers.push(parseInt(user.educational_center_id));
        }
        
        console.log('📋 الكيانات المستخرجة:', { districts, schools, centers });
        
        return { districts, schools, centers };
    } catch (error) {
        console.error('Error getting user entities:', error);
        return { districts: [], schools: [], centers: [] };
    }
}

async function getUsersByEntity(entityType, entityId) {
    try {
        if (!window.supabaseClient) return [];
        
        const { data, error } = await window.supabaseClient
            .from('user_assignments')
            .select('user_id')
            .eq('entity_type', entityType)
            .eq('entity_id', entityId)
            .eq('is_active', true);
        
        if (error) throw error;
        return (data || []).map(item => item.user_id);
    } catch (error) {
        console.error(`Error getting users for ${entityType} ${entityId}:`, error);
        return [];
    }
}

// ==================== دوال إدارة الكيان الحالي ====================

async function getEntityListWithNames(user = null) {
    const currentUser = user || await getCurrentUser();
    if (!currentUser) return [];

    console.log('👤 جلب الكيانات للمستخدم:', currentUser.name, 'الدور:', currentUser.role);

    if (currentUser.role === 'admin' || currentUser.role === 'support') {
        console.log('👑 مستخدم إداري/دعم: لا يحتاج كيانات، يرى كل شيء');
        return [];
    }

    // ملاحظة مهمة: يجب أن تعرض القائمة فقط الكيانات المُسندة فعليًا للمستخدم
    // من إدارة المستخدمين (جدول user_assignments) + الكيان المباشر المخزّن على المستخدم.
    // لا يتم اشتقاق أي كيانات إضافية (مثل "كل مدارس نفس المنطقة").
    const entities = await getAllUserEntities(currentUser);
    console.log('📋 الكيانات المسندة من user_assignments:', entities);

    const result = [];

    // ====== المناطق المسندة (تُعطي صلاحيات مدير منطقة عند التبديل إليها) ======
    const districtIds = [...new Set(entities.districts || [])].filter(id => id);
    if (districtIds.length > 0) {
        const { data: districts, error } = await window.supabaseClient
            .from('districts')
            .select('id, name')
            .in('id', districtIds);
        if (error) {
            console.error('❌ خطأ في جلب المناطق المسندة:', error);
        } else if (districts) {
            districts.forEach(d => {
                result.push({
                    id: d.id,
                    name: d.name,
                    type: 'district',
                    typeLabel: 'منطقة',
                    role: 'manger',
                    icon: 'fa-map-marked-alt',
                    priority: 3
                });
            });
        }
    }

    // ====== المدارس المسندة (تُعطي صلاحيات مدير مدرسة عند التبديل إليها) ======
    const schoolIds = [...new Set(entities.schools || [])].filter(id => id);
    if (schoolIds.length > 0) {
        const { data: schools, error } = await window.supabaseClient
            .from('schools')
            .select('id, name')
            .in('id', schoolIds);
        if (error) {
            console.error('❌ خطأ في جلب المدارس المسندة:', error);
        } else if (schools) {
            schools.forEach(s => {
                result.push({
                    id: s.id,
                    name: s.name,
                    type: 'school',
                    typeLabel: 'مدرسة',
                    role: 'spuser',
                    icon: 'fa-school',
                    priority: 2
                });
            });
        }
    }

    // ====== المراكز التعليمية المسندة (تُعطي صلاحيات مدير مركز عند التبديل إليها) ======
    const centerIds = [...new Set(entities.centers || [])].filter(id => id);
    if (centerIds.length > 0) {
        const { data: centers, error } = await window.supabaseClient
            .from('educational_centers')
            .select('id, name_en, name_ar, district_id')
            .in('id', centerIds);
        if (error) {
            console.error('❌ خطأ في جلب المراكز التعليمية المسندة:', error);
        } else if (centers) {
            centers.forEach(c => {
                const name = c.name_en || c.name_ar || 'مركز تعليمي';
                result.push({
                    id: c.id,
                    name: name,
                    type: 'educational_center',
                    typeLabel: 'مركز تعليمي',
                    role: 'center',
                    icon: 'fa-university',
                    priority: 2,
                    district_id: c.district_id
                });
            });
        }
    }

    if (result.length === 0 && currentUser.role === 'user') {
        console.log('👨‍🏫 مختص بدون أي كيانات مسندة: سيعمل بدون تبديل كيان (صلاحياته الافتراضية فقط)');
    }

    console.log(`✅ تم جلب ${result.length} كيان مُسند (منطقة: ${districtIds.length}، مدرسة: ${schoolIds.length}، مركز: ${centerIds.length})`);
    return result;
}

async function getCurrentEntity() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return null;
    
    if (currentUser.role === 'admin' || currentUser.role === 'support') {
        return null;
    }
    
    const entityKey = localStorage.getItem('currentEntityKey');
    if (!entityKey) {
        const entities = await getEntityListWithNames(currentUser);
        if (entities && entities.length > 0) {
            const entity = entities[0];
            localStorage.setItem('currentEntityKey', `${entity.type}_${entity.id}`);
            return entity;
        }
        return null;
    }
    
    const parts = entityKey.split('_');
    let type, id;
    if (parts.length === 3 && parts[0] === 'educational' && parts[1] === 'center') {
        type = 'educational_center';
        id = parseInt(parts[2]);
    } else {
        type = parts[0];
        id = parseInt(parts[1]);
    }
    
    const entities = await getEntityListWithNames(currentUser);
    return entities.find(e => e.type === type && e.id == id) || null;
}

async function getCurrentEntityIds() {
    const entity = await getCurrentEntity();
    if (!entity) return { districtIds: [], schoolIds: [], centerIds: [] };
    
    const result = { districtIds: [], schoolIds: [], centerIds: [] };
    
    if (entity.type === 'district') {
        result.districtIds = [entity.id];
        const { data: schools } = await window.supabaseClient
            .from('schools')
            .select('id')
            .eq('district_id', entity.id);
        if (schools) result.schoolIds = schools.map(s => s.id);
        
        const { data: centers } = await window.supabaseClient
            .from('educational_centers')
            .select('id')
            .eq('district_id', entity.id);
        if (centers) result.centerIds = centers.map(c => c.id);
        
    } else if (entity.type === 'school') {
        result.schoolIds = [entity.id];
        const { data: school } = await window.supabaseClient
            .from('schools')
            .select('district_id')
            .eq('id', entity.id)
            .single();
        if (school && school.district_id) {
            result.districtIds = [school.district_id];
        }
        
    } else if (entity.type === 'educational_center') {
        result.centerIds = [entity.id];
        const { data: center } = await window.supabaseClient
            .from('educational_centers')
            .select('district_id')
            .eq('id', entity.id)
            .single();
        if (center && center.district_id) {
            result.districtIds = [center.district_id];
        }
    }
    
    return result;
}

// ==================== دوال المراكز التعليمية ====================

async function getAllEducationalCenters() {
    try {
        if (!window.supabaseClient) return [];
        
        const { data, error } = await window.supabaseClient
            .from('educational_centers')
            .select(`
                *,
                districts:district_id (id, name, mangerEmail, supportEmail)
            `)
            .order('name_en', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting educational centers:', error);
        return [];
    }
}

async function getCentersByDistrict(districtId) {
    try {
        if (!window.supabaseClient) return [];
        
        const { data, error } = await window.supabaseClient
            .from('educational_centers')
            .select('*')
            .eq('district_id', districtId)
            .order('name_en', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error getting centers by district:', error);
        return [];
    }
}

// ==================== دوال IndexedDB للكاش ====================

let db = null;
let DB_NAME = 'ReportsCacheDB';
let DB_VERSION = 5;
let STORE_NAME = 'reports';
let CACHE_STORE_NAME = 'cache_metadata';
let PENDING_STORE_NAME = 'pending_reports';

function openDatabase() {
    return new Promise((resolve, reject) => {
        if (db && db.name === DB_NAME) {
            resolve(db);
            return;
        }
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('✅ IndexedDB opened successfully');
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('report_type', 'report_type', { unique: false });
                store.createIndex('visit_date', 'visit_date', { unique: false });
            }
            if (!database.objectStoreNames.contains(CACHE_STORE_NAME)) {
                database.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
            }
            if (!database.objectStoreNames.contains(PENDING_STORE_NAME)) {
                const pendingStore = database.createObjectStore(PENDING_STORE_NAME, { keyPath: 'id', autoIncrement: true });
                pendingStore.createIndex('type', 'type', { unique: false });
                pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
                pendingStore.createIndex('synced', 'synced', { unique: false });
                pendingStore.createIndex('syncing', 'syncing', { unique: false });
            }
        };
    });
}

async function saveReportsToIndexedDB(reports) {
    try {
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        await new Promise((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = (e) => reject(e.target.error);
        });
        
        const batchSize = 500;
        for (let i = 0; i < reports.length; i += batchSize) {
            const batch = reports.slice(i, i + batchSize);
            for (const report of batch) {
                await new Promise((resolve, reject) => {
                    const request = store.put(report);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e.target.error);
                });
            }
            console.log(`📦 تم حفظ ${Math.min(i + batchSize, reports.length)}/${reports.length} تقرير في IndexedDB`);
        }
        
        const metaTransaction = database.transaction([CACHE_STORE_NAME], 'readwrite');
        const metaStore = metaTransaction.objectStore(CACHE_STORE_NAME);
        await new Promise((resolve, reject) => {
            const request = metaStore.put({ key: 'reports_cache_metadata', timestamp: Date.now(), count: reports.length });
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
        
        console.log(`✅ تم حفظ ${reports.length} تقرير في IndexedDB`);
        return true;
    } catch (error) {
        console.error('Error saving to IndexedDB:', error);
        return false;
    }
}

async function loadReportsFromIndexedDB() {
    try {
        const database = await openDatabase();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        const reports = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
        
        const metaTransaction = database.transaction([CACHE_STORE_NAME], 'readonly');
        const metaStore = metaTransaction.objectStore(CACHE_STORE_NAME);
        const metadata = await new Promise((resolve) => {
            const request = metaStore.get('reports_cache_metadata');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        });
        
        const isFresh = metadata && (Date.now() - metadata.timestamp) < 10 * 60 * 1000;
        const expectedCount = metadata?.count || reports.length;
        
        console.log(`📦 تم تحميل ${reports.length} تقرير من IndexedDB (المتوقع: ${expectedCount})`);
        
        return { data: reports, isFresh: isFresh, timestamp: metadata?.timestamp || 0, expectedCount: expectedCount };
    } catch (error) {
        console.error('Error loading from IndexedDB:', error);
        return { data: [], isFresh: false, timestamp: 0, expectedCount: 0 };
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

async function sendCustomNotification({ userId, email, title, message, related_report_type, related_report_id }) {
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

async function sendVisitReportNotifications(reportData, reportId, reportType, specialistName, actionType = 'create') {
    try {
        if (!window.supabaseClient) {
            console.error('supabaseClient not available');
            return { success: false };
        }
        
        const isEdit = (actionType === 'update' || actionType === 'edit');
        console.log(`📢 إرسال إشعار: actionType=${actionType} (isEdit=${isEdit}) - reportType=${reportType}`);
        
        let entityName = '';
        let entityDistrictId = null;
        let entityManagerEmail = null;
        let entityManagerName = '';
        
        if (reportType === 'in_person') {
            const centerId = reportData.educational_center_id;
            if (!centerId) {
                console.warn('⚠️ لا يوجد educational_center_id، استمرار بدون تفاصيل المركز');
                entityName = 'مركز تعليمي';
            } else {
                try {
                    const { data: center, error: centerError } = await window.supabaseClient
                        .from('educational_centers')
                        .select('id, name_ar, name_en, district_id, manager_name_ar, email')
                        .eq('id', centerId)
                        .maybeSingle();
                    
                    if (!centerError && center) {
                        entityName = center.name_ar || center.name_en || 'المركز';
                        entityDistrictId = center.district_id;
                        entityManagerEmail = center.email;
                        entityManagerName = center.manager_name_ar || 'مدير المركز';
                    } else {
                        entityName = 'مركز تعليمي';
                        console.warn(`⚠️ لم يتم العثور على المركز ID: ${centerId}`);
                    }
                } catch(e) {
                    console.warn('⚠️ فشل جلب بيانات المركز:', e);
                    entityName = 'مركز تعليمي';
                }
            }
        } else {
            const schoolId = reportData.school_id;
            if (!schoolId) {
                console.warn('⚠️ لا يوجد school_id، استمرار بدون تفاصيل المدرسة');
                entityName = 'مدرسة';
            } else {
                try {
                    const { data: school, error: schoolError } = await window.supabaseClient
                        .from('schools')
                        .select('id, name, district_id, schoolPrincipal, schoolPrincipalEmail')
                        .eq('id', schoolId)
                        .maybeSingle();
                    
                    if (!schoolError && school) {
                        entityName = school.name;
                        entityDistrictId = school.district_id;
                        entityManagerEmail = school.schoolPrincipalEmail;
                        entityManagerName = school.schoolPrincipal || 'مدير المدرسة';
                    } else {
                        entityName = 'مدرسة';
                        console.warn(`⚠️ لم يتم العثور على المدرسة ID: ${schoolId}`);
                    }
                } catch(e) {
                    console.warn('⚠️ فشل جلب بيانات المدرسة:', e);
                    entityName = 'مدرسة';
                }
            }
        }
        
        const reportTypeName = reportType === 'in_person' ? 'وجاهي' : 'عن بعد';
        
        let title, message;
        if (isEdit) {
            title = `✏️ تعديل تقرير ${reportTypeName}`;
            message = `تم تعديل التقرير ${reportTypeName} في ${entityName} بواسطة ${specialistName}`;
        } else {
            title = `📄 إضافة تقرير ${reportTypeName}`;
            message = `تم إضافة تقرير ${reportTypeName} في ${entityName} بواسطة ${specialistName}`;
        }
        
        if (reportData.teacher_name) message += `\nالمعلم: ${reportData.teacher_name}`;
        if (reportData.visit_date) {
            const date = new Date(reportData.visit_date).toLocaleDateString('ar-SA');
            message += `\nالتاريخ: ${date}`;
        }
        
        console.log(`📢 عنوان الإشعار: ${title}`);
        
        let usersToNotify = [];
        
        const { data: adminUsers, error: adminError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id, school_id, email')
            .in('role', ['admin', 'support']);
        
        if (!adminError && adminUsers) {
            usersToNotify = [...usersToNotify, ...adminUsers];
        }
        
        if (entityDistrictId) {
            const assignedUsers = await getUsersByEntity('district', entityDistrictId);
            
            if (assignedUsers.length > 0) {
                const { data: managerUsers, error: managerError } = await window.supabaseClient
                    .from('users')
                    .select('id, role, district_id, school_id, email')
                    .in('id', assignedUsers)
                    .eq('role', 'manger');
                
                if (!managerError && managerUsers) {
                    usersToNotify = [...usersToNotify, ...managerUsers];
                }
            }
            
            const { data: directManager, error: directError } = await window.supabaseClient
                .from('users')
                .select('id, role, district_id, school_id, email')
                .eq('district_id', entityDistrictId)
                .eq('role', 'manger')
                .maybeSingle();
            
            if (!directError && directManager) {
                const exists = usersToNotify.some(u => u.id === directManager.id);
                if (!exists) usersToNotify.push(directManager);
            }
        }
        
        if (reportType === 'remote' && reportData.school_id) {
            const assignedSchoolUsers = await getUsersByEntity('school', reportData.school_id);
            
            if (assignedSchoolUsers.length > 0) {
                const { data: schoolUsers, error: schoolUserError } = await window.supabaseClient
                    .from('users')
                    .select('id, role, district_id, school_id, email')
                    .in('id', assignedSchoolUsers)
                    .eq('role', 'spuser');
                
                if (!schoolUserError && schoolUsers) {
                    usersToNotify = [...usersToNotify, ...schoolUsers];
                }
            }
            
            const { data: directSchoolManager, error: directSchoolError } = await window.supabaseClient
                .from('users')
                .select('id, role, district_id, school_id, email')
                .eq('school_id', reportData.school_id)
                .eq('role', 'spuser')
                .maybeSingle();
            
            if (!directSchoolError && directSchoolManager) {
                const exists = usersToNotify.some(u => u.id === directSchoolManager.id);
                if (!exists) usersToNotify.push(directSchoolManager);
            }
        }
        
        if (reportType === 'in_person' && reportData.educational_center_id) {
            const assignedCenterUsers = await getUsersByEntity('educational_center', reportData.educational_center_id);
            
            if (assignedCenterUsers.length > 0) {
                const { data: centerUsers, error: centerUserError } = await window.supabaseClient
                    .from('users')
                    .select('id, role, district_id, school_id, email')
                    .in('id', assignedCenterUsers)
                    .eq('role', 'center');
                
                if (!centerUserError && centerUsers) {
                    usersToNotify = [...usersToNotify, ...centerUsers];
                }
            }
            
            // إضافة مدير المركز المباشر
            const { data: directCenterManager, error: directCenterError } = await window.supabaseClient
                .from('users')
                .select('id, role, district_id, school_id, email')
                .eq('educational_center_id', reportData.educational_center_id)
                .eq('role', 'center')
                .maybeSingle();
            
            if (!directCenterError && directCenterManager) {
                const exists = usersToNotify.some(u => u.id === directCenterManager.id);
                if (!exists) usersToNotify.push(directCenterManager);
            }
            
            if (entityManagerEmail) {
                const { data: managerUser, error: managerUserError } = await window.supabaseClient
                    .from('users')
                    .select('id, role, district_id, school_id, email')
                    .eq('email', entityManagerEmail)
                    .maybeSingle();
                
                if (!managerUserError && managerUser) {
                    const exists = usersToNotify.some(u => u.id === managerUser.id);
                    if (!exists) usersToNotify.push(managerUser);
                }
            }
        }
        
        const uniqueUsers = [];
        const seenIds = new Set();
        for (const user of usersToNotify) {
            if (!seenIds.has(user.id)) {
                seenIds.add(user.id);
                uniqueUsers.push(user);
            }
        }
        
        let sentCount = 0;
        for (const user of uniqueUsers) {
            await createNotification(user.id, title, message, 'info', reportId, reportType);
            sentCount++;
            console.log(`✅ إشعار ${isEdit ? 'تعديل' : 'إضافة'} للمستخدم ${user.id} (${user.role})`);
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
            .maybeSingle();
        
        if (districtError) throw districtError;
        
        let usersToNotify = [];
        
        const { data: adminUsers, error: adminError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id')
            .in('role', ['admin', 'support']);
        
        if (!adminError && adminUsers) {
            usersToNotify = [...usersToNotify, ...adminUsers];
        }
        
        if (reportData.district_id) {
            const assignedUsers = await getUsersByEntity('district', reportData.district_id);
            
            if (assignedUsers.length > 0) {
                const { data: managerUsers, error: managerError } = await window.supabaseClient
                    .from('users')
                    .select('id, role, district_id')
                    .in('id', assignedUsers)
                    .eq('role', 'manger');
                
                if (!managerError && managerUsers) {
                    usersToNotify = [...usersToNotify, ...managerUsers];
                }
            }
            
            const { data: directManager, error: directError } = await window.supabaseClient
                .from('users')
                .select('id, role, district_id')
                .eq('district_id', reportData.district_id)
                .eq('role', 'manger')
                .maybeSingle();
            
            if (!directError && directManager) {
                const exists = usersToNotify.some(u => u.id === directManager.id);
                if (!exists) usersToNotify.push(directManager);
            }
        }
        
        const uniqueUsers = [];
        const seenIds = new Set();
        for (const user of usersToNotify) {
            if (!seenIds.has(user.id)) {
                seenIds.add(user.id);
                uniqueUsers.push(user);
            }
        }
        
        const reportTypeName = reportData.report_type === 'in_person' ? 'وجاهي' : 'عن بعد';
        
        let title, message;
        if (isUpdate) {
            title = `✏️ تحديث تقرير تجميعي (${reportTypeName})`;
            message = `تم تحديث التقرير التجميعي لمنطقة ${district?.name || 'المنطقة'} بواسطة ${specialistName}`;
        } else {
            title = `📊 إضافة تقرير تجميعي (${reportTypeName})`;
            message = `تم إضافة تقرير تجميعي لمنطقة ${district?.name || 'المنطقة'} بواسطة ${specialistName}`;
        }
        
        let sentCount = 0;
        for (const user of uniqueUsers) {
            await createNotification(user.id, title, message, 'info', reportId, 'summary');
            sentCount++;
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
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notificationId)
            .select();

        if (error) throw error;
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

// ==================== دوال فتح التقرير من الإشعار ====================
async function handleNotificationClick(notificationId) {
    try {
        console.log(`🔔 النقر على الإشعار: ${notificationId}`);
        
        const { data: notification, error } = await window.supabaseClient
            .from('notifications')
            .select('related_report_id, related_report_type')
            .eq('id', notificationId)
            .single();
        
        if (error) throw error;
        
        await markNotificationAsRead(notificationId);
        
        const reportId = notification?.related_report_id;
        const reportType = notification?.related_report_type;
        
        if (reportId && reportType && reportId !== 'null') {
            const timestamp = Date.now();
            
            localStorage.setItem('pendingReportId', reportId);
            localStorage.setItem('pendingReportType', reportType);
            localStorage.setItem('pendingReportTimestamp', timestamp.toString());
            sessionStorage.setItem('pendingReportId', reportId);
            sessionStorage.setItem('pendingReportType', reportType);
            sessionStorage.setItem('pendingReportTimestamp', timestamp.toString());
            
            console.log(`📌 تم تخزين التقرير: ${reportType} - ${reportId}`);
            
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

window.openReportFromNotification = async function(reportId, reportType) {
    console.log(`📌 فتح التقرير مباشرة: ${reportType} - ${reportId}`);
    
    const timestamp = Date.now();
    localStorage.setItem('pendingReportId', reportId);
    localStorage.setItem('pendingReportType', reportType);
    localStorage.setItem('pendingReportTimestamp', timestamp.toString());
    sessionStorage.setItem('pendingReportId', reportId);
    sessionStorage.setItem('pendingReportType', reportType);
    sessionStorage.setItem('pendingReportTimestamp', timestamp.toString());
    
    const currentPath = window.location.pathname;
    const isReportsPage = currentPath.includes('reports.html') || currentPath === '/' || currentPath.endsWith('/reports');
    const isSummaryPage = currentPath.includes('summary-reports.html') || currentPath.endsWith('/summary-reports');
    
    if (reportType === 'summary' && isSummaryPage && typeof window.viewSummaryReport === 'function') {
        window.viewSummaryReport(reportId);
        return;
    }
    
    if ((reportType === 'in_person' || reportType === 'remote') && isReportsPage && typeof window.viewReport === 'function') {
        window.viewReport(reportType, reportId);
        return;
    }
    
    let targetPage = '';
    if (reportType === 'summary') {
        targetPage = 'summary-reports.html';
        window.location.href = `${targetPage}?view=${reportId}&t=${timestamp}`;
    } else {
        targetPage = 'reports.html';
        window.location.href = `${targetPage}?view=${reportId}&type=${reportType}&t=${timestamp}`;
    }
};

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

// ==================== دوال حذف الإشعارات القديمة ====================

function shouldRunCleanup(userId) {
    const lastCleanupKey = `lastCleanup_${userId}`;
    const lastCleanup = localStorage.getItem(lastCleanupKey);
    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    
    if (!lastCleanup) return true;
    return (now - parseInt(lastCleanup)) >= TWENTY_FOUR_HOURS;
}

function updateLastCleanupTime(userId) {
    localStorage.setItem(`lastCleanup_${userId}`, Date.now().toString());
}

async function deleteOldUserNotificationsAndReorder(userId) {
    try {
        if (!shouldRunCleanup(userId)) {
            return { success: true, skipped: true, deletedCount: 0 };
        }
        
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
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
                
                if (!updateError) updateCount++;
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
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    
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

// ==================== جلب التقارير مع البيانات المرتبطة ====================

async function fetchAllReportsWithDetails() {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'No user logged in', data: [] };
        }
        
        console.log('🔄 جلب التقارير مع البيانات المرتبطة...');
        console.log('👤 المستخدم الحالي:', { 
            id: currentUser.id, 
            role: currentUser.role, 
            school_id: currentUser.school_id, 
            district_id: currentUser.district_id,
            educational_center_id: currentUser.educational_center_id
        });
        
        // جلب المناطق
        const { data: districts, error: districtsError } = await window.supabaseClient
            .from('districts')
            .select('id, name, mangerEmail, supportEmail');
        
        if (districtsError) throw districtsError;
        
        const districtsMap = {};
        (districts || []).forEach(d => { districtsMap[d.id] = d.name; });
        
        // جلب جميع المدارس
        const { data: schools, error: schoolsError } = await window.supabaseClient
            .from('schools')
            .select('id, name, district_id, schoolPrincipal, schoolPrincipalEmail');
        
        if (schoolsError) throw schoolsError;
        
        const schoolsMap = new Map();
        if (schools) {
            schools.forEach(s => {
                schoolsMap.set(s.id, {
                    id: s.id,
                    name: s.name || 'مدرسة غير محددة',
                    district_id: s.district_id,
                    schoolPrincipal: s.schoolPrincipal || '',
                    schoolPrincipalEmail: s.schoolPrincipalEmail || ''
                });
            });
        }
        
        // جلب جميع المراكز التعليمية
        const { data: centers, error: centersError } = await window.supabaseClient
            .from('educational_centers')
            .select('id, name_en, name_ar, manager_name_ar, email, district_id');
        
        if (centersError) throw centersError;
        
        const centersMap = new Map();
        if (centers) {
            centers.forEach(c => {
                centersMap.set(c.id, {
                    id: c.id,
                    name_en: c.name_en || c.name_ar || 'مركز غير محدد',
                    name_ar: c.name_ar || c.name_en || 'مركز غير محدد',
                    manager_name_ar: c.manager_name_ar || 'غير محدد',
                    email: c.email || '',
                    district_id: c.district_id
                });
            });
        }
        
        // ====== جلب الكيانات المرتبطة بالمستخدم ======
        const userEntities = await getAllUserEntities(currentUser);
        let { districts: userDistricts, schools: userSchools, centers: userCenters } = userEntities;
        
        // ====== معالجة خاصة لمدير المدرسة (spuser) ======
        if (currentUser.role === 'spuser' && currentUser.school_id) {
            if (!userSchools.includes(parseInt(currentUser.school_id))) {
                userSchools.push(parseInt(currentUser.school_id));
                console.log(`🏫 إضافة school_id المباشر ${currentUser.school_id} إلى قائمة مدارس المستخدم`);
            }
            
            const school = schoolsMap.get(parseInt(currentUser.school_id));
            if (school && school.district_id) {
                if (!userDistricts.includes(parseInt(school.district_id))) {
                    userDistricts.push(parseInt(school.district_id));
                    console.log(`📍 إضافة district_id ${school.district_id} من مدرسة المستخدم`);
                }
            }
        }
        
        // ====== معالجة خاصة لمدير المركز (center) ======
        if (currentUser.role === 'center' && currentUser.educational_center_id) {
            if (!userCenters.includes(parseInt(currentUser.educational_center_id))) {
                userCenters.push(parseInt(currentUser.educational_center_id));
                console.log(`🏢 إضافة educational_center_id المباشر ${currentUser.educational_center_id} إلى قائمة مراكز المستخدم`);
            }
            
            const center = centersMap.get(parseInt(currentUser.educational_center_id));
            if (center && center.district_id) {
                if (!userDistricts.includes(parseInt(center.district_id))) {
                    userDistricts.push(parseInt(center.district_id));
                    console.log(`📍 إضافة district_id ${center.district_id} من مركز المستخدم`);
                }
            }
        }
        
        console.log('👤 كيانات المستخدم النهائية:', { userDistricts, userSchools, userCenters });
        
        const isAdminOrSupport = ['admin', 'support'].includes(currentUser.role);
        const isManagerOrCenter = ['manger', 'center'].includes(currentUser.role);
        
        // ====== جلب جميع التقارير الوجاهية ======
        let allInPersonReports = [];
        let inPersonPage = 0;
        const PAGE_SIZE = 1000;
        
        console.log('📊 جلب التقارير الوجاهية...');
        
        let inPersonQuery = window.supabaseClient
            .from('in_person_reports')
            .select('*', { count: 'exact' })
            .order('visit_date', { ascending: false });
        
        if (isAdminOrSupport) {
            console.log('👑 مستخدم إداري/دعم: جلب جميع التقارير الوجاهية');
        } else if (currentUser.role === 'user') {
            inPersonQuery = inPersonQuery.eq('specialist_id', currentUser.id);
            console.log('🔒 مختص: تصفية التقارير الوجاهية حسب specialist_id =', currentUser.id);
        } else if (isManagerOrCenter) {
            const allDistrictIds = [...new Set(userDistricts)];
            
            if (currentUser.role === 'center') {
                // مدير مركز: إضافة المراكز المباشرة
                const allCenterIds = [...new Set(userCenters)];
                
                if (allCenterIds.length > 0) {
                    inPersonQuery = inPersonQuery.in('educational_center_id', allCenterIds);
                    console.log('🏢 مدير مركز: تصفية التقارير الوجاهية حسب المراكز:', allCenterIds);
                } else {
                    inPersonQuery = inPersonQuery.eq('educational_center_id', -1);
                }
            } else if (currentUser.role === 'manger') {
                if (allDistrictIds.length > 0) {
                    const { data: centersInDistricts } = await window.supabaseClient
                        .from('educational_centers')
                        .select('id')
                        .in('district_id', allDistrictIds);
                    
                    const centerIds = centersInDistricts?.map(c => c.id) || [];
                    const allCenterIds = [...new Set([...userCenters, ...centerIds])];
                    
                    if (allCenterIds.length > 0) {
                        inPersonQuery = inPersonQuery.in('educational_center_id', allCenterIds);
                        console.log('🏢 مدير منطقة: تصفية التقارير الوجاهية حسب المراكز:', allCenterIds);
                    } else {
                        inPersonQuery = inPersonQuery.eq('educational_center_id', -1);
                    }
                } else {
                    inPersonQuery = inPersonQuery.eq('educational_center_id', -1);
                }
            }
        } else if (currentUser.role === 'spuser') {
            // مدير مدرسة: يجلب تقارير المراكز في منطقته
            const allDistrictIds = [...new Set(userDistricts)];
            
            console.log('🏫 مدير مدرسة - المناطق المرتبطة للتقارير الوجاهية:', allDistrictIds);
            
            if (allDistrictIds.length > 0) {
                const { data: centersInDistricts } = await window.supabaseClient
                    .from('educational_centers')
                    .select('id')
                    .in('district_id', allDistrictIds);
                
                const centerIds = centersInDistricts?.map(c => c.id) || [];
                const allCenterIds = [...new Set([...userCenters, ...centerIds])];
                
                if (allCenterIds.length > 0) {
                    inPersonQuery = inPersonQuery.in('educational_center_id', allCenterIds);
                    console.log('📊 تصفية التقارير الوجاهية حسب المراكز:', allCenterIds);
                } else {
                    inPersonQuery = inPersonQuery.eq('educational_center_id', -1);
                    console.log('⚠️ لا توجد مراكز في المنطقة، لن تظهر تقارير وجاهية');
                }
            } else {
                inPersonQuery = inPersonQuery.eq('educational_center_id', -1);
                console.log('⚠️ لا توجد مناطق مرتبطة، لن تظهر تقارير وجاهية');
            }
        }
        
        const { count: totalInPerson, error: countInPersonError } = await inPersonQuery;
        if (countInPersonError) {
            console.error('❌ خطأ في جلب عدد التقارير الوجاهية:', countInPersonError);
            throw countInPersonError;
        }
        console.log(`📊 إجمالي التقارير الوجاهية: ${totalInPerson}`);
        
        let hasMoreInPerson = true;
        let totalFetchedInPerson = 0;
        
        while (hasMoreInPerson) {
            const start = inPersonPage * PAGE_SIZE;
            const end = start + PAGE_SIZE - 1;
            
            console.log(`📊 جلب التقارير الوجاهية: الصفحة ${inPersonPage + 1} (${start} - ${end})`);
            
            const { data, error } = await inPersonQuery.range(start, end);
            if (error) {
                console.error('❌ خطأ في جلب التقارير الوجاهية:', error);
                throw error;
            }
            
            if (data && data.length > 0) {
                allInPersonReports = [...allInPersonReports, ...data];
                totalFetchedInPerson += data.length;
                inPersonPage++;
                console.log(`📊 تم جلب ${totalFetchedInPerson}/${totalInPerson} تقرير وجاهي (${data.length} في هذه الدفعة)`);
                
                if (data.length < PAGE_SIZE) {
                    hasMoreInPerson = false;
                }
            } else {
                hasMoreInPerson = false;
            }
        }
        
        // ====== جلب جميع التقارير عن بعد ======
        let allRemoteReports = [];
        let remotePage = 0;
        
        console.log('📊 جلب التقارير عن بعد...');
        
        let remoteQuery = window.supabaseClient
            .from('remote_reports')
            .select('*', { count: 'exact' })
            .order('visit_date', { ascending: false });
        
        if (isAdminOrSupport) {
            console.log('👑 مستخدم إداري/دعم: جلب جميع التقارير عن بعد');
        } else if (currentUser.role === 'user') {
            remoteQuery = remoteQuery.eq('specialist_id', currentUser.id);
            console.log('🔒 مختص: تصفية التقارير عن بعد حسب specialist_id =', currentUser.id);
        } else if (isManagerOrCenter) {
            const allDistrictIds = [...new Set(userDistricts)];
            
            if (currentUser.role === 'center') {
                // مدير مركز: يرى مدارس منطقته فقط
                if (allDistrictIds.length > 0) {
                    const { data: schoolsInDistricts } = await window.supabaseClient
                        .from('schools')
                        .select('id')
                        .in('district_id', allDistrictIds);
                    
                    const schoolIds = schoolsInDistricts?.map(s => s.id) || [];
                    const allSchoolIds = [...new Set([...userSchools, ...schoolIds])];
                    
                    if (allSchoolIds.length > 0) {
                        remoteQuery = remoteQuery.in('school_id', allSchoolIds);
                        console.log('🏢 مدير مركز: تصفية التقارير عن بعد حسب المدارس في منطقته:', allSchoolIds);
                    } else {
                        remoteQuery = remoteQuery.eq('school_id', -1);
                    }
                } else {
                    remoteQuery = remoteQuery.eq('school_id', -1);
                }
            } else if (currentUser.role === 'manger') {
                if (allDistrictIds.length > 0) {
                    const { data: schoolsInDistricts } = await window.supabaseClient
                        .from('schools')
                        .select('id')
                        .in('district_id', allDistrictIds);
                    
                    const schoolIds = schoolsInDistricts?.map(s => s.id) || [];
                    const allSchoolIds = [...new Set([...userSchools, ...schoolIds])];
                    
                    if (allSchoolIds.length > 0) {
                        remoteQuery = remoteQuery.in('school_id', allSchoolIds);
                        console.log('🏢 مدير منطقة: تصفية التقارير عن بعد حسب المدارس:', allSchoolIds);
                    } else {
                        remoteQuery = remoteQuery.eq('school_id', -1);
                    }
                } else {
                    remoteQuery = remoteQuery.eq('school_id', -1);
                }
            }
        } else if (currentUser.role === 'spuser') {
            const allSchoolIds = [...new Set(userSchools)];
            
            if (currentUser.school_id && !allSchoolIds.includes(parseInt(currentUser.school_id))) {
                allSchoolIds.push(parseInt(currentUser.school_id));
                console.log(`🏫 إضافة school_id المباشر ${currentUser.school_id} إلى فلتر التقارير عن بعد`);
            }
            
            console.log('🏫 مدير مدرسة - المدارس المرتبطة للتقارير عن بعد:', allSchoolIds);
            
            if (allSchoolIds.length > 0) {
                remoteQuery = remoteQuery.in('school_id', allSchoolIds);
                console.log('📊 تصفية التقارير عن بعد حسب المدارس:', allSchoolIds);
            } else {
                remoteQuery = remoteQuery.eq('school_id', -1);
                console.log('⚠️ لا توجد مدارس مرتبطة، لن تظهر أي تقارير عن بعد');
            }
        }
        
        const { count: totalRemote, error: countRemoteError } = await remoteQuery;
        if (countRemoteError) {
            console.error('❌ خطأ في جلب عدد التقارير عن بعد:', countRemoteError);
            throw countRemoteError;
        }
        console.log(`📊 إجمالي التقارير عن بعد: ${totalRemote}`);
        
        let hasMoreRemote = true;
        let totalFetchedRemote = 0;
        
        while (hasMoreRemote) {
            const start = remotePage * PAGE_SIZE;
            const end = start + PAGE_SIZE - 1;
            
            console.log(`📊 جلب التقارير عن بعد: الصفحة ${remotePage + 1} (${start} - ${end})`);
            
            const { data, error } = await remoteQuery.range(start, end);
            if (error) {
                console.error('❌ خطأ في جلب التقارير عن بعد:', error);
                throw error;
            }
            
            if (data && data.length > 0) {
                allRemoteReports = [...allRemoteReports, ...data];
                totalFetchedRemote += data.length;
                remotePage++;
                console.log(`📊 تم جلب ${totalFetchedRemote}/${totalRemote} تقرير عن بعد (${data.length} في هذه الدفعة)`);
                
                if (data.length < PAGE_SIZE) {
                    hasMoreRemote = false;
                }
            } else {
                hasMoreRemote = false;
            }
        }
        
        console.log(`✅ تم جلب ${allInPersonReports.length} تقرير وجاهي و ${allRemoteReports.length} تقرير عن بعد`);
        console.log(`📊 المجموع الكلي: ${allInPersonReports.length + allRemoteReports.length} تقرير`);
        
        // جلب أسماء المستخدمين
        const specialistIds = new Set();
        allInPersonReports.forEach(r => r.specialist_id && specialistIds.add(r.specialist_id));
        allRemoteReports.forEach(r => r.specialist_id && specialistIds.add(r.specialist_id));
        
        const usersMap = new Map();
        if (specialistIds.size > 0) {
            const { data: users, error: usersError } = await window.supabaseClient
                .from('users')
                .select('id, name, email')
                .in('id', Array.from(specialistIds));
            if (!usersError && users) {
                users.forEach(u => usersMap.set(u.id, u));
            }
        }
        
        // ====== معالجة التقارير الوجاهية ======
        const processedInPerson = allInPersonReports.map(r => {
            let center = null;
            let districtName = '-';
            let centerName = '-';
            let managerName = '';
            let centerEmail = '';
            
            // ====== التأكد من أن educational_center_id موجود ======
            const centerId = r.educational_center_id ? parseInt(r.educational_center_id) : null;
            
            if (centerId && centersMap.has(centerId)) {
                center = centersMap.get(centerId);
                centerName = center.name_en || center.name_ar || 'مركز غير محدد';
                managerName = center.manager_name_ar || '';
                centerEmail = center.email || '';
                
                if (center.district_id && districtsMap[center.district_id]) {
                    districtName = districtsMap[center.district_id];
                }
            }
            
            // إذا لم يتم العثور على المركز، نحاول البحث عن طريق school_id
            if (!center && r.school_id && schoolsMap.has(r.school_id)) {
                const school = schoolsMap.get(r.school_id);
                if (school.district_id && districtsMap[school.district_id]) {
                    districtName = districtsMap[school.district_id];
                }
            }
            
            const principalName = r.principal_name || managerName || '';
            const principalEmail = r.principal_Email || centerEmail || '';
            
            return {
                ...r,
                report_type: 'in_person',
                users: usersMap.get(r.specialist_id) || { name: 'غير معروف', email: null },
                educational_centers: center || { 
                    name_en: centerName, 
                    name_ar: centerName, 
                    manager_name_ar: managerName, 
                    email: centerEmail, 
                    district_id: null 
                },
                district_name: districtName,
                principal_name: principalName,
                principal_Email: principalEmail,
                center_name: centerName,
                educational_center_id: centerId,
                school_id: r.school_id ? parseInt(r.school_id) : null,
                specialist_id: r.specialist_id ? parseInt(r.specialist_id) : null,
                district_id: center?.district_id ? parseInt(center.district_id) : null
            };
        });
        
        // ====== معالجة التقارير عن بعد ======
        const processedRemote = allRemoteReports.map(r => {
            const school = schoolsMap.get(r.school_id);
            let districtName = '-';
            
            if (school) {
                if (school.district_id && districtsMap[school.district_id]) {
                    districtName = districtsMap[school.district_id];
                }
                const principalName = r.principal_name || school.schoolPrincipal || '';
                const principalEmail = r.principal_Email || school.schoolPrincipalEmail || '';
                
                return {
                    ...r,
                    report_type: 'remote',
                    users: usersMap.get(r.specialist_id) || { name: 'غير معروف', email: null },
                    schools: school || { 
                        name: 'مدرسة غير محددة', 
                        district_id: null, 
                        schoolPrincipal: '', 
                        schoolPrincipalEmail: '' 
                    },
                    district_name: districtName,
                    principal_name: principalName,
                    principal_Email: principalEmail,
                    school_id: r.school_id ? parseInt(r.school_id) : null,
                    specialist_id: r.specialist_id ? parseInt(r.specialist_id) : null,
                    district_id: school?.district_id ? parseInt(school.district_id) : null
                };
            }
            
            return {
                ...r,
                report_type: 'remote',
                users: usersMap.get(r.specialist_id) || { name: 'غير معروف', email: null },
                schools: { 
                    name: 'مدرسة غير محددة', 
                    district_id: null, 
                    schoolPrincipal: '', 
                    schoolPrincipalEmail: '' 
                },
                district_name: districtName,
                principal_name: r.principal_name || '',
                principal_Email: r.principal_Email || '',
                school_id: r.school_id ? parseInt(r.school_id) : null,
                specialist_id: r.specialist_id ? parseInt(r.specialist_id) : null,
                district_id: null
            };
        });
        
        // دمج وترتيب النتائج حسب التاريخ
        const allReports = [...processedInPerson, ...processedRemote].sort((a, b) => {
            const dateA = new Date(a.visit_date);
            const dateB = new Date(b.visit_date);
            if (dateA > dateB) return -1;
            if (dateA < dateB) return 1;
            return (a.id > b.id) ? -1 : 1;
        });
        
        console.log(`✅ تم جلب ${allReports.length} تقرير مع البيانات المرتبطة (${processedInPerson.length} وجاهي، ${processedRemote.length} عن بعد)`);
        
        return { success: true, data: allReports, count: allReports.length };
        
    } catch (error) {
        console.error('❌ فشل جلب التقارير مع البيانات:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// ==================== دوال الكاش الموحد ====================

let globalReportsCache = null;
let lastCacheUpdate = null;
const CACHE_TTL = 10 * 60 * 1000;

function sortReportsByDate(reports) {
    if (!reports || reports.length === 0) return reports;
    return [...reports].sort((a, b) => {
        const dateA = new Date(a.visit_date);
        const dateB = new Date(b.visit_date);
        if (dateA > dateB) return -1;
        if (dateA < dateB) return 1;
        return (a.id > b.id) ? -1 : 1;
    });
}

async function refreshFullReportsCache() {
    console.log('🔄 تحديث الكاش الموحد بالبيانات الكاملة...');
    try {
        const result = await fetchAllReportsWithDetails();
        
        if (result.success && result.data) {
            globalReportsCache = sortReportsByDate(result.data);
            lastCacheUpdate = Date.now();
            
            await saveReportsToIndexedDB(globalReportsCache);
            
            try {
                const metadata = {
                    timestamp: lastCacheUpdate,
                    count: globalReportsCache.length,
                    version: '3.0-full'
                };
                localStorage.setItem('reportsCacheMetadata', JSON.stringify(metadata));
            } catch(e) {
                console.warn('⚠️ لا يمكن حفظ الميتاداتا في localStorage:', e.message);
            }
            
            console.log(`✅ تم تحديث الكاش الموحد بالبيانات الكاملة: ${globalReportsCache.length} تقرير`);
            notifyReportsChanged('refresh', null, null);
            return { success: true, count: globalReportsCache.length, data: globalReportsCache };
        }
        
        return result;
        
    } catch (error) {
        console.error('❌ فشل تحديث الكاش الموحد:', error);
        return { success: false, error: error.message };
    }
}

async function getFullReportsCache(forceRefresh = false) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        return { success: false, error: 'No user logged in', data: [] };
    }
    
    const now = Date.now();
    
    if (!forceRefresh && globalReportsCache && lastCacheUpdate && (now - lastCacheUpdate) < CACHE_TTL) {
        console.log(`📦 استخدام الكاش في الذاكرة: ${globalReportsCache.length} تقرير`);
        return { success: true, data: globalReportsCache, fromCache: true };
    }
    
    if (!forceRefresh) {
        const cached = await loadReportsFromIndexedDB();
        if (cached.data && cached.data.length > 0) {
            globalReportsCache = sortReportsByDate(cached.data);
            lastCacheUpdate = cached.timestamp || Date.now();
            console.log(`📦 تم تحميل الكاش من IndexedDB: ${globalReportsCache.length} تقرير`);
            
            if (cached.expectedCount && cached.expectedCount !== globalReportsCache.length) {
                console.log(`⚠️ عدد التقارير في IndexedDB (${globalReportsCache.length}) لا يتطابق مع العدد المتوقع (${cached.expectedCount})، جاري الانتظار حتى اكتمال التحديث قبل العرض...`);
                // لا نعرض بيانات ناقصة معروفة للمستخدم؛ ننتظر الجلب الصحيح الكامل قبل الإرجاع
                return await refreshFullReportsCache();
            }
            
            return { success: true, data: globalReportsCache, fromCache: true };
        }
    }
    
    return await refreshFullReportsCache();
}

async function refreshGlobalReportsCache() {
    return await refreshFullReportsCache();
}

async function getGlobalReportsCache(forceRefresh = false) {
    return await getFullReportsCache(forceRefresh);
}

function addReportToGlobalCache(report) {
    if (!globalReportsCache) globalReportsCache = [];
    
    const exists = globalReportsCache.some(r => r.id == report.id && r.report_type == report.report_type);
    if (!exists) {
        globalReportsCache.push(report);
        globalReportsCache = sortReportsByDate(globalReportsCache);
        lastCacheUpdate = Date.now();
        saveReportsToIndexedDB(globalReportsCache).catch(e => console.warn('⚠️ فشل حفظ في IndexedDB:', e));
        console.log(`➕ تم إضافة تقرير إلى الكاش الموحد: ${report.id}`);
        notifyReportsChanged('create', report.id, report.report_type);
    }
}

function removeReportFromGlobalCache(reportId, reportType) {
    if (globalReportsCache) {
        const beforeCount = globalReportsCache.length;
        globalReportsCache = globalReportsCache.filter(r => !(r.id == reportId && r.report_type == reportType));
        if (beforeCount !== globalReportsCache.length) {
            globalReportsCache = sortReportsByDate(globalReportsCache);
            lastCacheUpdate = Date.now();
            saveReportsToIndexedDB(globalReportsCache).catch(e => console.warn('⚠️ فشل حفظ في IndexedDB:', e));
            console.log(`🗑️ تم حذف تقرير من الكاش الموحد: ${reportId}`);
            notifyReportsChanged('delete', reportId, reportType);
        }
    }
}

function updateReportInGlobalCache(report) {
    if (globalReportsCache) {
        const index = globalReportsCache.findIndex(r => r.id == report.id && r.report_type == report.report_type);
        if (index !== -1) {
            globalReportsCache[index] = report;
            globalReportsCache = sortReportsByDate(globalReportsCache);
            lastCacheUpdate = Date.now();
            saveReportsToIndexedDB(globalReportsCache).catch(e => console.warn('⚠️ فشل حفظ في IndexedDB:', e));
            console.log(`✏️ تم تحديث تقرير في الكاش الموحد: ${report.id}`);
            notifyReportsChanged('update', report.id, report.report_type);
        }
    }
}

function notifyReportsChanged(action, reportId, reportType) {
    console.log(`📢 إشعار بتغيير التقارير: ${action} - ${reportType} - ${reportId}`);
    const notification = {
        action: action,
        reportId: reportId,
        reportType: reportType,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem('reportsChangedNotification', JSON.stringify(notification));
    } catch(e) {
        console.warn('⚠️ لا يمكن حفظ إشعار التغيير:', e);
    }
    setTimeout(() => {
        try {
            const current = localStorage.getItem('reportsChangedNotification');
            if (current) {
                const parsed = JSON.parse(current);
                if (parsed.timestamp === notification.timestamp) {
                    localStorage.removeItem('reportsChangedNotification');
                }
            }
        } catch(e) {}
    }, 5000);
}

function checkReportsChangedNotification() {
    try {
        const notification = localStorage.getItem('reportsChangedNotification');
        if (notification) {
            const parsed = JSON.parse(notification);
            if (Date.now() - parsed.timestamp < 10000) {
                console.log(`📢 تم استلام إشعار: ${parsed.action} - ${parsed.reportType} - ${parsed.reportId}`);
                localStorage.removeItem('reportsChangedNotification');
                return { action: parsed.action, reportId: parsed.reportId, reportType: parsed.reportType };
            }
            localStorage.removeItem('reportsChangedNotification');
        }
    } catch(e) {}
    return null;
}

// ==================== صلاحيات القائمة الجانبية (موحّدة لكل صفحات النظام) ====================
// تُخفي روابط القائمة الجانبية التي لا يملك المستخدم صلاحية الوصول إليها، حسب دوره الحالي (أو دور الكيان المُبدَّل إليه)
function applySidebarPermissions(user) {
    if (!user || !user.role) return;
    const role = user.role;

    const setVisible = (id, visible) => {
        const el = document.getElementById(id);
        if (el) el.style.display = visible ? '' : 'none';
    };

    // الأنشطة الصيفية: يظهر لكل الأدوار ما عدا مدير المدرسة (spuser)
    setVisible('navSummerReports', role !== 'spuser');

    // التقارير التجميعية: يظهر لكل الأدوار ما عدا مدير المدرسة (spuser) ومدير المركز (center)
    setVisible('navSummaryReports', role !== 'spuser' && role !== 'center');

    // التحليلات: admin, support, manger فقط
    setVisible('navAnalytics', ['admin', 'support', 'manger'].includes(role));

    // إدارة المستخدمين وإدارة المناطق: admin, support فقط
    const isAdmin = ['admin', 'support'].includes(role);
    setVisible('navUsersManagement', isAdmin);
    setVisible('navDistrictsManagement', isAdmin);
}
window.applySidebarPermissions = applySidebarPermissions;

function clearGlobalReportsCache() {
    globalReportsCache = null;
    lastCacheUpdate = null;
    localStorage.removeItem('globalReportsCache');
    localStorage.removeItem('reportsCacheMetadata');
    localStorage.removeItem('reportsChangedNotification');
    saveReportsToIndexedDB([]).catch(e => console.warn('⚠️ فشل مسح IndexedDB:', e));
    console.log('🗑️ تم مسح الكاش الموحد للتقارير');
}

// ==================== دوال الكاش الموحد للتقارير التجميعية ====================

let globalSummaryReportsCache = null;
let lastSummaryCacheUpdate = null;
let summaryCacheObservers = [];
const SUMMARY_CACHE_TTL = 5 * 60 * 1000;
const SUMMARY_CACHE_STORAGE_KEY = 'globalSummaryReportsCache';
const SUMMARY_CACHE_NOTIFICATION_KEY = 'summaryReportsChangedNotification';

async function getGlobalSummaryReportsCache(forceRefresh = false) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        console.warn('⚠️ لا يوجد مستخدم حالياً');
        return { success: false, error: 'No user logged in', data: [] };
    }
    
    const now = Date.now();
    const isExpired = !lastSummaryCacheUpdate || (now - lastSummaryCacheUpdate) > SUMMARY_CACHE_TTL;
    
    if (!forceRefresh && globalSummaryReportsCache && !isExpired) {
        console.log(`📦 استخدام الكاش في الذاكرة: ${globalSummaryReportsCache.length} تقرير تجميعي`);
        return { success: true, data: globalSummaryReportsCache, fromCache: true };
    }
    
    if (!forceRefresh && !isExpired) {
        try {
            const saved = localStorage.getItem(SUMMARY_CACHE_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.data && parsed.data.length > 0 && 
                    (now - parsed.timestamp) < SUMMARY_CACHE_TTL &&
                    parsed.userId === currentUser.id &&
                    parsed.userRole === currentUser.role) {
                    
                    globalSummaryReportsCache = parsed.data;
                    lastSummaryCacheUpdate = parsed.timestamp;
                    console.log(`📦 تم تحميل الكاش من localStorage: ${globalSummaryReportsCache.length} تقرير تجميعي`);
                    return { success: true, data: globalSummaryReportsCache, fromCache: true };
                }
            }
        } catch(e) {
            console.warn('⚠️ فشل تحليل الكاش من localStorage:', e);
        }
    }
    
    console.log('🔄 تحديث الكاش من الخادم (التقارير التجميعية)...');
    const result = await refreshGlobalSummaryReportsCache();
    return { ...result, fromCache: false };
}

async function refreshGlobalSummaryReportsCache() {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return { success: false, error: 'No user logged in', count: 0, data: [] };
        }
        
        let query = window.supabaseClient
            .from('summary_reports')
            .select(`
                *,
                users:specialist_id(id, name, email),
                districts:district_id(id, name, mangerEmail, supportEmail)
            `)
            .order('created_at', { ascending: false });
        
        if (currentUser.role === 'manger' || currentUser.role === 'center') {
            const userEntities = await getAllUserEntities(currentUser);
            const districtIds = userEntities.districts;
            
            if (districtIds.length > 0) {
                query = query.in('district_id', districtIds);
            } else {
                query = query.eq('district_id', -1);
            }
        } else if (currentUser.role === 'user') {
            query = query.eq('specialist_id', currentUser.id);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        const processedData = (data || []).map(report => ({
            ...report,
            users: report.users || { id: report.specialist_id, name: 'غير معروف', email: null },
            districts: report.districts || { id: report.district_id, name: 'غير معروف', mangerEmail: null, supportEmail: null }
        }));
        
        globalSummaryReportsCache = processedData;
        lastSummaryCacheUpdate = Date.now();
        
        try {
            localStorage.setItem(SUMMARY_CACHE_STORAGE_KEY, JSON.stringify({
                data: globalSummaryReportsCache,
                timestamp: lastSummaryCacheUpdate,
                userRole: currentUser.role,
                userId: currentUser.id,
                version: '2.0'
            }));
        } catch(e) {
            console.warn('⚠️ لا يمكن حفظ كاش التقارير التجميعية في localStorage:', e);
        }
        
        console.log(`✅ تم تحديث كاش التقارير التجميعية: ${globalSummaryReportsCache.length} تقرير`);
        
        notifySummaryReportsChanged('refresh', null);
        
        return { 
            success: true, 
            count: globalSummaryReportsCache.length, 
            data: globalSummaryReportsCache 
        };
        
    } catch (error) {
        console.error('❌ فشل تحديث كاش التقارير التجميعية:', error);
        return { success: false, error: error.message, count: 0, data: [] };
    }
}

function addSummaryReportToGlobalCache(report) {
    if (!globalSummaryReportsCache) {
        globalSummaryReportsCache = [];
    }
    
    const exists = globalSummaryReportsCache.some(r => r.id == report.id);
    if (!exists) {
        globalSummaryReportsCache.unshift(report);
        globalSummaryReportsCache.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        lastSummaryCacheUpdate = Date.now();
        updateSummaryCacheStorage();
        
        console.log(`➕ تم إضافة تقرير تجميعي إلى الكاش: ${report.id}`);
        notifySummaryReportsChanged('create', report.id);
        
        sendSummaryReportNotifications(report, report.id, report.users?.name || 'مستخدم', 'create')
            .catch(e => console.warn('⚠️ فشل إرسال إشعارات التقرير:', e));
    }
}

function updateSummaryReportInGlobalCache(report) {
    if (globalSummaryReportsCache) {
        const index = globalSummaryReportsCache.findIndex(r => r.id == report.id);
        if (index !== -1) {
            globalSummaryReportsCache[index] = { ...globalSummaryReportsCache[index], ...report };
            globalSummaryReportsCache.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            lastSummaryCacheUpdate = Date.now();
            updateSummaryCacheStorage();
            
            console.log(`✏️ تم تحديث تقرير تجميعي في الكاش: ${report.id}`);
            notifySummaryReportsChanged('update', report.id);
        }
    }
}

function removeSummaryReportFromGlobalCache(reportId) {
    if (globalSummaryReportsCache) {
        const beforeCount = globalSummaryReportsCache.length;
        globalSummaryReportsCache = globalSummaryReportsCache.filter(r => r.id != reportId);
        
        if (beforeCount !== globalSummaryReportsCache.length) {
            lastSummaryCacheUpdate = Date.now();
            updateSummaryCacheStorage();
            
            console.log(`🗑️ تم حذف تقرير تجميعي من الكاش: ${reportId}`);
            notifySummaryReportsChanged('delete', reportId);
        }
    }
}

function updateSummaryCacheStorage() {
    const currentUser = loadUserFromStorage();
    if (currentUser && globalSummaryReportsCache) {
        try {
            localStorage.setItem(SUMMARY_CACHE_STORAGE_KEY, JSON.stringify({
                data: globalSummaryReportsCache,
                timestamp: lastSummaryCacheUpdate,
                userRole: currentUser.role,
                userId: currentUser.id,
                version: '2.0'
            }));
        } catch(e) {
            console.warn('⚠️ لا يمكن حفظ كاش التقارير التجميعية في localStorage:', e);
        }
    }
}

function notifySummaryReportsChanged(action, reportId) {
    console.log(`📢 إشعار بتغيير التقارير التجميعية: ${action} - ${reportId || 'جميع'}`);
    
    const notification = {
        action: action,
        reportId: reportId,
        reportType: 'summary',
        timestamp: Date.now(),
        version: Date.now()
    };
    
    try {
        localStorage.setItem(SUMMARY_CACHE_NOTIFICATION_KEY, JSON.stringify(notification));
    } catch(e) {
        console.warn('⚠️ لا يمكن حفظ إشعار التغيير:', e);
    }
    
    summaryCacheObservers.forEach(observer => {
        try {
            observer(notification);
        } catch(e) {
            console.warn('⚠️ فشل إشعار المراقب:', e);
        }
    });
    
    setTimeout(() => {
        try {
            const current = localStorage.getItem(SUMMARY_CACHE_NOTIFICATION_KEY);
            if (current) {
                const parsed = JSON.parse(current);
                if (parsed.timestamp === notification.timestamp) {
                    localStorage.removeItem(SUMMARY_CACHE_NOTIFICATION_KEY);
                }
            }
        } catch(e) {}
    }, 10000);
}

function checkSummaryReportsChangedNotification() {
    try {
        const notification = localStorage.getItem(SUMMARY_CACHE_NOTIFICATION_KEY);
        if (notification) {
            const parsed = JSON.parse(notification);
            if (Date.now() - parsed.timestamp < 10000) {
                console.log(`📢 تم استلام إشعار للتقارير التجميعية: ${parsed.action} - ${parsed.reportId}`);
                return parsed;
            } else {
                localStorage.removeItem(SUMMARY_CACHE_NOTIFICATION_KEY);
            }
        }
    } catch(e) {
        console.warn('⚠️ فشل تحليل إشعار التقارير التجميعية:', e);
        localStorage.removeItem(SUMMARY_CACHE_NOTIFICATION_KEY);
    }
    return null;
}

function subscribeToSummaryCacheChanges(observer) {
    if (typeof observer === 'function') {
        summaryCacheObservers.push(observer);
        return () => {
            const index = summaryCacheObservers.indexOf(observer);
            if (index !== -1) summaryCacheObservers.splice(index, 1);
        };
    }
    return () => {};
}

function clearGlobalSummaryReportsCache() {
    globalSummaryReportsCache = null;
    lastSummaryCacheUpdate = null;
    localStorage.removeItem(SUMMARY_CACHE_STORAGE_KEY);
    console.log('🗑️ تم مسح كاش التقارير التجميعية');
}

async function refreshSummaryCacheAfterSave() {
    console.log('🔄 تحديث الكاش بعد حفظ تقرير تجميعي...');
    const result = await refreshGlobalSummaryReportsCache();
    if (result.success) {
        notifySummaryReportsChanged('refresh', null);
    }
    return result;
}

function getSummaryReportFromCache(reportId) {
    if (globalSummaryReportsCache) {
        return globalSummaryReportsCache.find(r => r.id == reportId) || null;
    }
    return null;
}

function setupSummaryCacheCrossTabSync() {
    window.addEventListener('storage', (event) => {
        if (event.key === SUMMARY_CACHE_NOTIFICATION_KEY && event.newValue) {
            try {
                const notification = JSON.parse(event.newValue);
                if (notification && notification.reportType === 'summary') {
                    console.log(`📢 [Cross-tab] تم استلام إشعار: ${notification.action}`);
                    
                    if (notification.action === 'refresh') {
                        refreshGlobalSummaryReportsCache().catch(console.error);
                    } else if (notification.action === 'delete' && notification.reportId) {
                        if (globalSummaryReportsCache) {
                            globalSummaryReportsCache = globalSummaryReportsCache.filter(r => r.id != notification.reportId);
                            updateSummaryCacheStorage();
                        }
                    } else if (notification.action === 'create' || notification.action === 'update') {
                        refreshGlobalSummaryReportsCache().catch(console.error);
                    }
                }
            } catch(e) {
                console.warn('⚠️ فشل معالجة الإشعار من علامة تبويب أخرى:', e);
            }
        }
    });
    
    console.log('✅ تم إعداد المزامنة بين الصفحات للتقارير التجميعية');
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

// دوال إدارة الكيانات والصلاحيات
window.getRolePriority = getRolePriority;
window.getRoleFromAssignments = getRoleFromAssignments;
window.updateUserRoleFromAssignments = updateUserRoleFromAssignments;
window.getEntityRoleInfo = getEntityRoleInfo;
window.addAssignmentWithRoleUpdate = addAssignmentWithRoleUpdate;
window.removeAssignmentWithRoleUpdate = removeAssignmentWithRoleUpdate;

// دوال التعيينات
window.getUserEntityIds = getUserEntityIds;
window.getAllUserEntities = getAllUserEntities;
window.getUsersByEntity = getUsersByEntity;

// دوال إدارة الكيان الحالي
window.getEntityListWithNames = getEntityListWithNames;
window.getCurrentEntity = getCurrentEntity;
window.getCurrentEntityIds = getCurrentEntityIds;

window.getAllEducationalCenters = getAllEducationalCenters;
window.getCentersByDistrict = getCentersByDistrict;

window.openDatabase = openDatabase;
window.saveReportsToIndexedDB = saveReportsToIndexedDB;
window.loadReportsFromIndexedDB = loadReportsFromIndexedDB;

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
window.openReportFromNotification = window.openReportFromNotification;

window.deleteOldUserNotificationsAndReorder = deleteOldUserNotificationsAndReorder;
window.reorderUserNotificationsSequential = reorderUserNotificationsSequential;
window.initUserSessionCleanup = initUserSessionCleanup;
window.cleanupAllUsersNotifications = cleanupAllUsersNotifications;

window.keepProjectAlive = keepProjectAlive;
window.startAutoKeepAlive = startAutoKeepAlive;
window.stopAutoKeepAlive = stopAutoKeepAlive;

window.globalReportsCache = globalReportsCache;
window.refreshGlobalReportsCache = refreshGlobalReportsCache;
window.getGlobalReportsCache = getGlobalReportsCache;
window.addReportToGlobalCache = addReportToGlobalCache;
window.removeReportFromGlobalCache = removeReportFromGlobalCache;
window.updateReportInGlobalCache = updateReportInGlobalCache;
window.notifyReportsChanged = notifyReportsChanged;
window.checkReportsChangedNotification = checkReportsChangedNotification;
window.clearGlobalReportsCache = clearGlobalReportsCache;

window.fetchAllReportsWithDetails = fetchAllReportsWithDetails;
window.refreshFullReportsCache = refreshFullReportsCache;
window.getFullReportsCache = getFullReportsCache;
window.sortReportsByDate = sortReportsByDate;

window.globalSummaryReportsCache = globalSummaryReportsCache;
window.refreshGlobalSummaryReportsCache = refreshGlobalSummaryReportsCache;
window.getGlobalSummaryReportsCache = getGlobalSummaryReportsCache;
window.addSummaryReportToGlobalCache = addSummaryReportToGlobalCache;
window.removeSummaryReportFromGlobalCache = removeSummaryReportFromGlobalCache;
window.updateSummaryReportInGlobalCache = updateSummaryReportInGlobalCache;
window.notifySummaryReportsChanged = notifySummaryReportsChanged;
window.checkSummaryReportsChangedNotification = checkSummaryReportsChangedNotification;
window.clearGlobalSummaryReportsCache = clearGlobalSummaryReportsCache;
window.refreshSummaryCacheAfterSave = refreshSummaryCacheAfterSave;
window.subscribeToSummaryCacheChanges = subscribeToSummaryCacheChanges;
window.getSummaryReportFromCache = getSummaryReportFromCache;
window.setupSummaryCacheCrossTabSync = setupSummaryCacheCrossTabSync;

if (typeof window !== 'undefined') {
    setupSummaryCacheCrossTabSync();
}

// ==================== دوال تقارير الأنشطة الصيفية ====================

// جلب تقارير الأنشطة الصيفية
async function getSummerActivityReports(filters = {}) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available', data: [] };
        }
        
        let query = window.supabaseClient
            .from('summer_activity_reports')
            .select(`
                *,
                users:created_by(id, name, email),
                districts:district_id(id, name, manger, mangerEmail, supportEmail)
            `)
            .order('created_at', { ascending: false });
        
        const currentUser = await getCurrentUser();
        
        if (currentUser) {
            if (currentUser.role === 'user') {
                // المختص يرى فقط التقارير التي أدخلها هو
                query = query.eq('created_by', currentUser.id);
            } else if (currentUser.role === 'manger') {
                const entities = await getAllUserEntities(currentUser);
                const districtIds = [...new Set([currentUser.district_id, ...(entities.districts || [])].filter(id => id))];
                if (districtIds.length > 0) {
                    query = query.in('district_id', districtIds);
                } else {
                    query = query.eq('district_id', -1);
                }
            } else if (currentUser.role === 'center') {
                // مدير المركز يرى الأنشطة الصيفية الخاصة بمنطقة مركزه فقط
                const entities = await getAllUserEntities(currentUser);
                const centerIds = [...new Set([currentUser.educational_center_id, ...(entities.centers || [])].filter(id => id))];
                let centerDistrictIds = [];
                if (centerIds.length > 0) {
                    const { data: centersData } = await window.supabaseClient
                        .from('educational_centers')
                        .select('district_id')
                        .in('id', centerIds);
                    centerDistrictIds = [...new Set((centersData || []).map(c => c.district_id).filter(id => id))];
                }
                if (centerDistrictIds.length > 0) {
                    query = query.in('district_id', centerDistrictIds);
                } else {
                    query = query.eq('district_id', -1);
                }
            }
        }
        
        if (filters.district_id) {
            query = query.eq('district_id', filters.district_id);
        }
        if (filters.week_number) {
            query = query.eq('week_number', filters.week_number);
        }
        if (filters.period_from) {
            query = query.gte('period_from', filters.period_from);
        }
        if (filters.period_to) {
            query = query.lte('period_to', filters.period_to);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return { success: true, data: data || [] };
    } catch (error) {
        console.error('Error getting summer activity reports:', error);
        return { success: false, error: error.message, data: [] };
    }
}

// حفظ تقرير الأنشطة الصيفية
async function saveSummerActivityReport(reportData, reportId = null) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        let result;
        if (reportId) {
            result = await window.supabaseClient
                .from('summer_activity_reports')
                .update(reportData)
                .eq('id', reportId)
                .select();
        } else {
            result = await window.supabaseClient
                .from('summer_activity_reports')
                .insert([reportData])
                .select();
        }
        
        if (result.error) throw result.error;
        
        const savedReport = result.data?.[0];
        if (savedReport) {
            await sendSummerReportNotifications(reportData, savedReport.id, reportId ? 'update' : 'create');
        }
        
        return { success: true, data: savedReport };
    } catch (error) {
        console.error('Error saving summer activity report:', error);
        return { success: false, error: error.message };
    }
}

// حذف تقرير الأنشطة الصيفية
async function deleteSummerActivityReport(reportId) {
    try {
        if (!window.supabaseClient) {
            return { success: false, error: 'supabaseClient not available' };
        }
        
        await window.supabaseClient
            .from('notifications')
            .delete()
            .eq('related_report_id', reportId)
            .eq('related_report_type', 'summer');
        
        const { error } = await window.supabaseClient
            .from('summer_activity_reports')
            .delete()
            .eq('id', reportId);
        
        if (error) throw error;
        
        return { success: true };
    } catch (error) {
        console.error('Error deleting summer activity report:', error);
        return { success: false, error: error.message };
    }
}

// إرسال إشعارات تقرير الأنشطة الصيفية
async function sendSummerReportNotifications(reportData, reportId, actionType = 'create') {
    try {
        if (!window.supabaseClient) {
            return { success: false };
        }
        
        const isEdit = actionType === 'update';
        
        const { data: district, error: districtError } = await window.supabaseClient
            .from('districts')
            .select('id, name, manger, mangerEmail, supportEmail')
            .eq('id', reportData.district_id)
            .maybeSingle();
        
        if (districtError) throw districtError;
        
        let usersToNotify = [];
        
        const { data: adminUsers, error: adminError } = await window.supabaseClient
            .from('users')
            .select('id, role, district_id')
            .in('role', ['admin', 'support']);
        
        if (!adminError && adminUsers) {
            usersToNotify = [...usersToNotify, ...adminUsers];
        }
        
        if (reportData.district_id) {
            const { data: districtManagers, error: managerError } = await window.supabaseClient
                .from('users')
                .select('id, role, district_id')
                .eq('district_id', reportData.district_id)
                .eq('role', 'manger');
            
            if (!managerError && districtManagers) {
                usersToNotify = [...usersToNotify, ...districtManagers];
            }
        }
        
        const uniqueUsers = [];
        const seenIds = new Set();
        for (const user of usersToNotify) {
            if (!seenIds.has(user.id)) {
                seenIds.add(user.id);
                uniqueUsers.push(user);
            }
        }
        
        let title, message;
        if (isEdit) {
            title = `✏️ تحديث تقرير الأنشطة الصيفية (الأسبوع ${reportData.week_number})`;
            message = `تم تحديث تقرير الأنشطة الصيفية في ${district?.name || 'المنطقة'} (الأسبوع ${reportData.week_number})`;
        } else {
            title = `📊 إضافة تقرير الأنشطة الصيفية (الأسبوع ${reportData.week_number})`;
            message = `تم إضافة تقرير الأنشطة الصيفية في ${district?.name || 'المنطقة'} (الأسبوع ${reportData.week_number})`;
        }
        
        let sentCount = 0;
        for (const user of uniqueUsers) {
            await createNotification(user.id, title, message, 'info', reportId, 'summer');
            sentCount++;
        }
        
        console.log(`✅ تم إرسال ${sentCount} إشعار ${isEdit ? 'تحديث' : 'إضافة'} للتقرير الصيفي (ID: ${reportId})`);
        return { success: true, sentCount };
    } catch (error) {
        console.error('Error sending summer report notifications:', error);
        return { success: false, error: error.message };
    }
}

// تصدير الدوال الجديدة
window.getSummerActivityReports = getSummerActivityReports;
window.saveSummerActivityReport = saveSummerActivityReport;
window.deleteSummerActivityReport = deleteSummerActivityReport;
window.sendSummerReportNotifications = sendSummerReportNotifications;

console.log('✅ Supabase.js loaded successfully');
console.log('✅ Entity management functions loaded:');
console.log('  - getEntityListWithNames(user)');
console.log('  - getCurrentEntity()');
console.log('  - getCurrentEntityIds()');
console.log('✅ Educational center support added for spuser role');
console.log('✅ Center role (مدير مركز) added with full support');