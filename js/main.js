// متغيرات عامة
let currentUser = null;
let currentReports = [];

// ==================== دوال الصلاحيات ====================

// التحقق من صلاحية إضافة تقرير
function canCreateReports(user) {
    if (!user) return false;
    // admin, support, user (مختص) فقط يمكنهم إدخال التقارير
    // manger و spuser لا يمكنهم إضافة تقارير
    return ['admin', 'support', 'user'].includes(user.role);
}

// التحقق من صلاحية تعديل التقرير
function canEditReport(user, report) {
    if (!user || !report) return false;
    // admin و support يمكنهم تعديل أي تقرير
    if (['admin', 'support'].includes(user.role)) return true;
    // user (مختص) يمكنه تعديل تقاريره فقط التي أدخلها
    if (user.role === 'user' && report.specialist_id == user.id) return true;
    // manger و spuser لا يمكنهم التعديل
    return false;
}

// التحقق من صلاحية حذف التقرير
function canDeleteReport(user, report) {
    if (!user || !report) return false;
    // admin و support فقط يمكنهم الحذف
    // user, manger, spuser لا يمكنهم الحذف
    return ['admin', 'support'].includes(user.role);
}

// الحصول على التقارير حسب صلاحية المستخدم
async function getReportsByUser(user) {
    if (!user || !window.supabaseClient) return [];
    
    try {
        let inPersonData = [];
        let remoteData = [];
        
        // جلب خريطة المناطق
        const { data: districts } = await window.supabaseClient
            .from('districts')
            .select('id, name');
        const districtsMap = {};
        districts?.forEach(d => { districtsMap[d.id] = d.name; });
        
        if (user.role === 'admin' || user.role === 'support') {
            // admin و support يرون جميع التقارير
            const { data: inPerson } = await window.supabaseClient
                .from('in_person_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .order('visit_date', { ascending: false });
            
            inPersonData = inPerson || [];
            
            const { data: remote } = await window.supabaseClient
                .from('remote_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .order('visit_date', { ascending: false });
            
            remoteData = remote || [];
            
        } else if (user.role === 'manger' && user.district_id) {
            // مدير المنطقة - يرى تقارير منطقته فقط
            const { data: schoolsInDistrict } = await window.supabaseClient
                .from('schools')
                .select('id')
                .eq('district_id', user.district_id);
            
            const schoolIds = schoolsInDistrict?.map(s => s.id) || [];
            
            if (schoolIds.length > 0) {
                const { data: inPerson } = await window.supabaseClient
                    .from('in_person_reports')
                    .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                    .in('school_id', schoolIds)
                    .order('visit_date', { ascending: false });
                
                inPersonData = inPerson || [];
                
                const { data: remote } = await window.supabaseClient
                    .from('remote_reports')
                    .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                    .in('school_id', schoolIds)
                    .order('visit_date', { ascending: false });
                
                remoteData = remote || [];
            }
            
        } else if (user.role === 'spuser' && user.school_id) {
            // مدير مدرسة - يرى تقارير مدرسته فقط
            const { data: inPerson } = await window.supabaseClient
                .from('in_person_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .eq('school_id', user.school_id)
                .order('visit_date', { ascending: false });
            
            inPersonData = inPerson || [];
            
            const { data: remote } = await window.supabaseClient
                .from('remote_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .eq('school_id', user.school_id)
                .order('visit_date', { ascending: false });
            
            remoteData = remote || [];
            
        } else if (user.role === 'user') {
            // مختص - يرى تقاريره فقط
            const { data: inPerson } = await window.supabaseClient
                .from('in_person_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .eq('specialist_id', user.id)
                .order('visit_date', { ascending: false });
            
            inPersonData = inPerson || [];
            
            const { data: remote } = await window.supabaseClient
                .from('remote_reports')
                .select(`*, schools:school_id (id, name, district_id), users:specialist_id (id, name)`)
                .eq('specialist_id', user.id)
                .order('visit_date', { ascending: false });
            
            remoteData = remote || [];
        }
        
        // دمج التقارير مع إضافة اسم المنطقة
        const inPersonReports = inPersonData.map(r => ({ 
            ...r, 
            report_type: 'in_person',
            schools: r.schools,
            users: r.users,
            district_name: districtsMap[r.schools?.district_id] || '-'
        }));
        
        const remoteReports = remoteData.map(r => ({ 
            ...r, 
            report_type: 'remote',
            schools: r.schools,
            users: r.users,
            district_name: districtsMap[r.schools?.district_id] || '-'
        }));
        
        return [...inPersonReports, ...remoteReports].sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
        
    } catch (error) {
        console.error('Error getting reports by user:', error);
        return [];
    }
}

// ==================== تهيئة الصفحة ====================
document.addEventListener('DOMContentLoaded', async () => {
    // جلب المستخدم الحالي
    currentUser = await getCurrentUser();
    
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // تحديث وقت آخر تحديث
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
        lastUpdate.textContent = new Date().toLocaleString('ar-SA');
    }
    
    // تحديث واجهة المستخدم حسب الدور
    updateUIByRole();
    
    // تحديث الإحصائيات في لوحة التحكم
    if (window.location.pathname.includes('dashboard.html')) {
        await loadDashboardStats();
    }
    
    // تحديث التحليلات
    if (window.location.pathname.includes('analytics.html')) {
        await loadAnalyticsPage();
    }
});

// تحديث واجهة المستخدم حسب الدور
function updateUIByRole() {
    if (!currentUser) return;
    
    // تحديث اسم المستخدم
    const userNameElements = document.querySelectorAll('.user-name');
    userNameElements.forEach(el => {
        el.textContent = currentUser.name || 'مستخدم';
    });
    
    // تحديث الصلاحية
    const userRoleElements = document.querySelectorAll('.user-role');
    userRoleElements.forEach(el => {
        el.textContent = getRoleName(currentUser.role);
    });
    
    // تحديث المنطقة/المدرسة
    const userDistrictElements = document.querySelectorAll('.user-district');
    userDistrictElements.forEach(el => {
        if (currentUser.role === 'spuser' && currentUser.school_name) {
            // مدير مدرسة - يظهر اسم المدرسة
            el.textContent = currentUser.school_name;
        } else if (currentUser.district_name) {
            // مدير منطقة أو غيره - يظهر اسم المنطقة
            el.textContent = currentUser.district_name;
        } else {
            el.textContent = 'لا يوجد';
        }
    });
    
    // إظهار/إخفاء أزرار إضافة التقارير (تظهر فقط لـ admin, support, user)
    const showAddButtons = canCreateReports(currentUser);
    const addButtons = document.querySelectorAll('.add-report-btn');
    addButtons.forEach(btn => {
        btn.style.display = showAddButtons ? 'inline-flex' : 'none';
    });
    
    // إظهار/إخفاء رابط التحليلات (يظهر لـ admin, support, manger فقط)
    const analyticsLink = document.getElementById('navAnalytics');
    if (analyticsLink) {
        const showAnalytics = ['admin', 'support', 'manger'].includes(currentUser.role);
        analyticsLink.style.display = showAnalytics ? 'flex' : 'none';
    }
    
    // إظهار/إخفاء روابط الإدارة (تظهر لـ admin, support فقط)
    const adminLinks = document.getElementById('adminLinks');
    if (adminLinks) {
        const showAdminLinks = ['admin', 'support'].includes(currentUser.role);
        adminLinks.style.display = showAdminLinks ? 'block' : 'none';
    }
    
    // إظهار/إخفاء رابط إدارة المستخدمين (يظهر للدعم الفني فقط)
    const usersLink = document.getElementById('usersManagementLink');
    if (usersLink) {
        usersLink.style.display = currentUser.role === 'support' ? 'block' : 'none';
    }
}

// ==================== تحميل إحصائيات لوحة التحكم ====================
async function loadDashboardStats() {
    try {
        // جلب التقارير حسب صلاحية المستخدم
        currentReports = await getReportsByUser(currentUser);
        
        // تحديث الأرقام
        const totalReports = document.getElementById('totalReports');
        const inPersonReports = document.getElementById('inPersonReports');
        const remoteReports = document.getElementById('remoteReports');
        const schoolsVisited = document.getElementById('schoolsVisited');
        
        if (totalReports) totalReports.textContent = currentReports.length;
        if (inPersonReports) inPersonReports.textContent = currentReports.filter(r => r.report_type === 'in_person').length;
        if (remoteReports) remoteReports.textContent = currentReports.filter(r => r.report_type === 'remote').length;
        
        // عدد المدارس المميزة
        const uniqueSchools = new Set(currentReports.map(r => r.school_id));
        if (schoolsVisited) schoolsVisited.textContent = uniqueSchools.size;
        
        // عرض آخر 5 تقارير
        const recentReportsContainer = document.getElementById('recentReports');
        if (recentReportsContainer) {
            displayRecentReports(currentReports.slice(0, 5));
        }
        
        // رسم المخططات
        createReportsChart(currentReports);
        createMonthlyChart(currentReports);
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        showNotification('حدث خطأ في تحميل البيانات', 'error');
    }
}

// عرض آخر التقارير في لوحة التحكم
function displayRecentReports(reports) {
    const tbody = document.getElementById('recentReports');
    
    if (!reports || reports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-gray-500">
                    <i class="fas fa-folder-open text-4xl mb-3"></i>
                    <p>لا توجد تقارير لعرضها</p>
                  </td
                </tr>
        `;
        return;
    }
    
    tbody.innerHTML = reports.map(report => `
        <tr>
            <td>${new Date(report.visit_date).toLocaleDateString('ar-SA')}</td>
            <td>${report.schools?.name || 'غير محدد'}</td>
            <td>${report.teacher_name || 'غير محدد'}</td>
            <td>${report.subject || 'غير محدد'}</td>
            <td>
                <span class="px-3 py-1 rounded-full text-sm ${
                    report.report_type === 'in_person' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                }">
                    ${report.report_type === 'in_person' ? 'وجاهي' : 'عن بعد'}
                </span>
            </td>
        </tr>
    `).join('');
}

// إنشاء مخطط التقارير (دائري)
function createReportsChart(reports) {
    const ctx = document.getElementById('reportsChart')?.getContext('2d');
    if (!ctx) return;
    
    // حذف المخطط السابق إذا وجد
    if (window.reportsChartInstance) {
        window.reportsChartInstance.destroy();
    }
    
    const inPerson = reports.filter(r => r.report_type === 'in_person').length;
    const remote = reports.filter(r => r.report_type === 'remote').length;
    
    window.reportsChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['تعليم وجاهي', 'تعلم عن بعد'],
            datasets: [{
                data: [inPerson, remote],
                backgroundColor: ['#2e9b54', '#1e3c72'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Inter' }
                    }
                }
            }
        }
    });
}

// إنشاء المخطط الشهري
function createMonthlyChart(reports) {
    const ctx = document.getElementById('monthlyChart')?.getContext('2d');
    if (!ctx) return;
    
    // حذف المخطط السابق إذا وجد
    if (window.monthlyChartInstance) {
        window.monthlyChartInstance.destroy();
    }
    
    // تجميع التقارير حسب الشهر
    const monthlyData = {};
    reports.forEach(report => {
        const month = report.visit_date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + 1;
    });
    
    const months = Object.keys(monthlyData).sort();
    const counts = months.map(m => monthlyData[m]);
    
    window.monthlyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(m => {
                const [year, month] = m.split('-');
                return `${month}/${year}`;
            }),
            datasets: [{
                label: 'عدد التقارير',
                data: counts,
                borderColor: '#1e3c72',
                backgroundColor: 'rgba(30, 60, 114, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ==================== صفحة التحليلات ====================
async function loadAnalyticsPage() {
    try {
        // جلب التقارير حسب صلاحية المستخدم
        currentReports = await getReportsByUser(currentUser);
        
        // تحديث الإحصائيات
        const totalVisits = document.getElementById('totalVisits');
        const inPersonVisits = document.getElementById('inPersonVisits');
        const remoteVisits = document.getElementById('remoteVisits');
        const activeSpecialists = document.getElementById('activeSpecialists');
        
        if (totalVisits) totalVisits.textContent = currentReports.length;
        if (inPersonVisits) inPersonVisits.textContent = currentReports.filter(r => r.report_type === 'in_person').length;
        if (remoteVisits) remoteVisits.textContent = currentReports.filter(r => r.report_type === 'remote').length;
        
        const uniqueSpecialists = new Set(currentReports.map(r => r.specialist_id));
        if (activeSpecialists) activeSpecialists.textContent = uniqueSpecialists.size;
        
        // رسم المخططات
        createAnalyticsChart(currentReports);
        createMonthlyTrendChart(currentReports);
        
        // عرض إحصائيات المختصين
        displaySpecialistsStats(currentReports);
        
        // عرض إحصائيات المدارس
        displaySchoolsStats(currentReports);
        
    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification('حدث خطأ في تحميل التحليلات', 'error');
    }
}

// إنشاء مخطط التحليلات
function createAnalyticsChart(reports) {
    const ctx = document.getElementById('distributionChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.distributionChartInstance) {
        window.distributionChartInstance.destroy();
    }
    
    const inPerson = reports.filter(r => r.report_type === 'in_person').length;
    const remote = reports.filter(r => r.report_type === 'remote').length;
    
    window.distributionChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['تعليم وجاهي', 'تعلم عن بعد'],
            datasets: [{
                data: [inPerson, remote],
                backgroundColor: ['#2e9b54', '#1e3c72'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

// إنشاء مخطط الاتجاه الشهري
function createMonthlyTrendChart(reports) {
    const ctx = document.getElementById('monthlyTrendChart')?.getContext('2d');
    if (!ctx) return;
    
    if (window.monthlyTrendChartInstance) {
        window.monthlyTrendChartInstance.destroy();
    }
    
    const monthlyData = {};
    reports.forEach(report => {
        const month = report.visit_date.substring(0, 7);
        monthlyData[month] = (monthlyData[month] || 0) + 1;
    });
    
    const months = Object.keys(monthlyData).sort();
    const counts = months.map(m => monthlyData[m]);
    
    window.monthlyTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months.map(m => `${m.split('-')[1]}/${m.split('-')[0]}`),
            datasets: [{
                label: 'عدد الزيارات',
                data: counts,
                borderColor: '#1e3c72',
                backgroundColor: 'rgba(30, 60, 114, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// عرض إحصائيات المختصين
function displaySpecialistsStats(reports) {
    const tbody = document.getElementById('specialistsTable');
    if (!tbody) return;
    
    const specialistStats = {};
    reports.forEach(report => {
        const specialistId = report.specialist_id;
        if (!specialistStats[specialistId]) {
            specialistStats[specialistId] = {
                id: specialistId,
                name: report.users?.name || 'غير معروف',
                total: 0,
                in_person: 0,
                remote: 0
            };
        }
        specialistStats[specialistId].total++;
        specialistStats[specialistId][report.report_type]++;
    });
    
    const specialists = Object.values(specialistStats).sort((a, b) => b.total - a.total);
    
    if (specialists.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8">لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = specialists.map(s => `
        <tr>
            <td>${s.name}</td>
            <td>${s.total}</td>
            <td class="text-green-600">${s.in_person}</td>
            <td class="text-blue-600">${s.remote}</td>
            <td>
                <div class="w-32 bg-gray-200 rounded-full h-2">
                    <div class="bg-primary h-2 rounded-full" style="width: ${(s.total / reports.length) * 100}%"></div>
                </div>
            </td>
        </tr>
    `).join('');
}

// عرض إحصائيات المدارس
function displaySchoolsStats(reports) {
    const tbody = document.getElementById('schoolsTable');
    if (!tbody) return;
    
    const schoolStats = {};
    reports.forEach(report => {
        const schoolId = report.school_id;
        if (!schoolStats[schoolId]) {
            schoolStats[schoolId] = {
                id: schoolId,
                name: report.schools?.name || 'غير معروف',
                district: report.district_name || '-',
                total: 0,
                in_person: 0,
                remote: 0
            };
        }
        schoolStats[schoolId].total++;
        schoolStats[schoolId][report.report_type]++;
    });
    
    const schools = Object.values(schoolStats).sort((a, b) => b.total - a.total).slice(0, 20);
    
    if (schools.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8">لا توجد بيانات</td></tr>`;
        return;
    }
    
    tbody.innerHTML = schools.map(s => `
        <tr>
            <td>${s.name}</td>
            <td>${s.district}</td>
            <td>${s.total}</td>
            <td class="text-green-600">${s.in_person}</td>
            <td class="text-blue-600">${s.remote}</td>
        </tr>
    `).join('');
}

// عرض الإشعارات
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} fixed top-4 left-4 z-50`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 
                        type === 'error' ? 'fa-exclamation-circle' : 
                        'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}