// متغيرات عامة
let currentReports = [];
let deleteReportId = null;
let viewReportId = null;
let currentUser = null;

// قائمة المهارات
const skillsList = [
    'التخطيط للدرس',
    'إدارة الصف',
    'التفاعل مع الطلاب',
    'استخدام الوسائل التعليمية',
    'التقويم والقياس',
    'تنويع الأنشطة',
    'مراعاة الفروق الفردية',
    'الربط بالحياة الواقعية',
    'وضوح الأهداف',
    'تنظيم الوقت',
    'تحفيز الطلاب',
    'استراتيجيات التدريس'
];

// ==================== دوال الصلاحيات ====================

// التحقق من صلاحية إضافة تقرير
function canCreateReports(user) {
    if (!user) return false;
    // admin, support, user (مختص) يمكنهم إدخال التقارير
    return ['admin', 'support', 'user'].includes(user.role);
}

// التحقق من صلاحية تعديل التقرير
function canEditReport(user, report) {
    if (!user || !report) return false;
    // admin و support يمكنهم تعديل أي تقرير
    if (['admin', 'support'].includes(user.role)) return true;
    // user (مختص) يمكنه تعديل تقاريره فقط التي أدخلها
    if (user.role === 'user' && report.specialist_id == user.id) return true;
    return false;
}

// التحقق من صلاحية حذف التقرير
function canDeleteReport(user, report) {
    if (!user || !report) return false;
    // admin و support فقط يمكنهم الحذف
    return ['admin', 'support'].includes(user.role);
}

// الحصول على التقارير المرئية حسب صلاحية المستخدم
function getVisibleReportsForUser(user, allReports) {
    if (!user || !allReports) return [];
    
    // admin و support يرون كل التقارير
    if (['admin', 'support'].includes(user.role)) return allReports;
    
    // manger (مدير منطقة) يرى تقارير منطقته فقط
    if (user.role === 'manger' && user.district) {
        return allReports.filter(r => r.district === user.district);
    }
    
    // spuser (مدير مدرسة) يرى تقارير مدرسته فقط
    if (user.role === 'spuser' && user.school_id) {
        return allReports.filter(r => r.school_id == user.school_id);
    }
    
    // user (مختص) يرى تقاريره فقط التي أدخلها
    if (user.role === 'user') {
        return allReports.filter(r => r.specialist_id == user.id);
    }
    
    return [];
}

// ==================== تحميل الصفحة ====================
document.addEventListener('DOMContentLoaded', async () => {
    // جلب المستخدم الحالي
    currentUser = await getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    
    // تحديث واجهة المستخدم حسب الصلاحيات
    updateUIByPermissions();
    
    await loadSchools();
    await loadReports();
    setupEventListeners();
});

// تحديث واجهة المستخدم حسب الصلاحيات
function updateUIByPermissions() {
    // إظهار/إخفاء أزرار إضافة التقارير
    const showAddButtons = canCreateReports(currentUser);
    document.querySelectorAll('.add-report-btn, .only-specialist').forEach(el => {
        if (el.classList.contains('add-report-btn')) {
            el.style.display = showAddButtons ? 'inline-flex' : 'none';
        }
    });
    
    // إظهار/إخفاء أزرار التصدير حسب الصلاحية
    if (currentUser.role === 'spuser') {
        // مدير المدرسة يرى فقط تقارير مدرسته
        const exportBtns = document.querySelectorAll('.export-btn');
        exportBtns.forEach(btn => btn.style.display = 'inline-flex');
    }
}

// إعداد مستمعي الأحداث
function setupEventListeners() {
    document.getElementById('searchInput').addEventListener('input', filterReports);
    document.getElementById('dateFrom').addEventListener('change', filterReports);
    document.getElementById('dateTo').addEventListener('change', filterReports);
    document.getElementById('reportTypeFilter').addEventListener('change', filterReports);
    document.getElementById('districtFilter').addEventListener('change', filterReports);
    
    document.getElementById('reportForm').addEventListener('submit', saveReport);
}

// تحميل المدارس
async function loadSchools() {
    try {
        const user = currentUser;
        
        let query = supabase.from('schools').select('*');
        
        // إذا كان المستخدم مدير منطقة، جلب مدارس منطقته فقط
        if (user.role === 'manger' && user.district) {
            query = query.eq('district', user.district);
        }
        // إذا كان المستخدم مدير مدرسة، جلب مدرسته فقط
        else if (user.role === 'spuser' && user.school_id) {
            query = query.eq('id', user.school_id);
        }
        
        const { data, error } = await query.order('name');
        
        if (error) throw error;
        
        const schoolSelect = document.getElementById('schoolId');
        if (schoolSelect) {
            schoolSelect.innerHTML = '<option value="">اختر المدرسة</option>' +
                (data || []).map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        }
        
        // تعبئة فلتر المناطق في صفحة التقارير
        const districtFilter = document.getElementById('districtFilter');
        if (districtFilter && user.role !== 'manger') {
            const { data: districts } = await supabase.from('districts').select('name').order('name');
            districtFilter.innerHTML = '<option value="">جميع المناطق</option>' +
                (districts || []).map(d => `<option value="${d.name}">${d.name}</option>`).join('');
        } else if (user.role === 'manger' && user.district) {
            districtFilter.innerHTML = `<option value="${user.district}">${user.district}</option>`;
            districtFilter.disabled = true;
        }
        
    } catch (error) {
        console.error('Error loading schools:', error);
    }
}

// تحميل المعلمين حسب المدرسة
async function loadTeachers() {
    const schoolId = document.getElementById('schoolId').value;
    if (!schoolId) return;

    try {
        const teachers = await supabaseHelper.getTeachers(schoolId);
        
        if (teachers.success) {
            const teacherSelect = document.getElementById('teacherId');
            teacherSelect.innerHTML = '<option value="">اختر المعلم</option>' +
                teachers.data.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading teachers:', error);
    }
}

// تحميل التقارير
async function loadReports() {
    try {
        const user = currentUser;
        
        let query = supabase
            .from('reports')
            .select(`
                *,
                schools!inner (id, name, district),
                teachers (id, name)
            `);
        
        // تطبيق الفلاتر حسب صلاحية المستخدم
        if (user.role === 'user') {
            // مختص - يرى تقاريره فقط
            query = query.eq('specialist_id', user.id);
        } else if (user.role === 'manger' && user.district) {
            // مدير منطقة - يرى تقارير منطقته فقط
            query = query.eq('schools.district', user.district);
        } else if (user.role === 'spuser' && user.school_id) {
            // مدير مدرسة - يرى تقارير مدرسته فقط
            query = query.eq('school_id', user.school_id);
        }
        
        const { data, error } = await query.order('visit_date', { ascending: false });
        
        if (error) throw error;
        
        currentReports = data || [];
        displayReports(currentReports);
        
    } catch (error) {
        console.error('Error loading reports:', error);
        showNotification('حدث خطأ في تحميل التقارير', 'error');
    }
}

// عرض التقارير (معدل لإظهار الأزرار حسب الصلاحيات)
function displayReports(reports) {
    const tbody = document.getElementById('reportsTableBody');
    
    // تطبيق فلترة التقارير حسب صلاحية المستخدم (طبقة أمان إضافية)
    const visibleReports = getVisibleReportsForUser(currentUser, reports);
    
    if (!visibleReports || visibleReports.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-12 text-gray-500">
                    <i class="fas fa-folder-open text-5xl mb-4"></i>
                    <p>لا توجد تقارير لعرضها</p>
                 </td>
             </tr>
        `;
        document.getElementById('resultsCount').textContent = 'عدد النتائج: 0';
        return;
    }

    tbody.innerHTML = visibleReports.map(report => {
        // تحديد الصلاحيات لكل تقرير
        const canEdit = canEditReport(currentUser, report);
        const canDelete = canDeleteReport(currentUser, report);
        
        return `
         <tr>
             <td>${new Date(report.visit_date).toLocaleDateString('ar-SA')}</td>
             <td>${report.schools?.name || 'غير محدد'}</td>
             <td>${report.teachers?.name || 'غير محدد'}</td>
             <td>${report.class_name || 'غير محدد'}</td>
             <td>${report.section || 'غير محدد'}</td>
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
             <td>
                <div class="flex gap-2">
                    <button onclick="viewReport('${report.id}')" class="text-blue-600 hover:text-blue-800" title="عرض">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${canEdit ? `
                    <button onclick="editReport('${report.id}')" class="text-green-600 hover:text-green-800" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ` : ''}
                    ${canDelete ? `
                    <button onclick="openDeleteModal('${report.id}')" class="text-red-600 hover:text-red-800" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
             </td>
         </tr>
        `;
    }).join('');

    document.getElementById('resultsCount').textContent = `عدد النتائج: ${visibleReports.length}`;
}

// تصفية التقارير (معدل)
function filterReports() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const reportType = document.getElementById('reportTypeFilter').value;
    const districtFilter = document.getElementById('districtFilter')?.value;

    // أولاً: التقارير المرئية للمستخدم حسب صلاحيته
    let filtered = getVisibleReportsForUser(currentUser, currentReports);
    
    // ثانياً: تطبيق الفلاتر الإضافية
    filtered = filtered.filter(report => {
        // فلتر البحث
        if (searchTerm) {
            const schoolName = report.schools?.name?.toLowerCase() || '';
            const teacherName = report.teachers?.name?.toLowerCase() || '';
            const subject = report.subject?.toLowerCase() || '';
            
            if (!schoolName.includes(searchTerm) && 
                !teacherName.includes(searchTerm) && 
                !subject.includes(searchTerm)) {
                return false;
            }
        }

        // فلتر التاريخ من
        if (dateFrom && report.visit_date < dateFrom) {
            return false;
        }

        // فلتر التاريخ إلى
        if (dateTo && report.visit_date > dateTo) {
            return false;
        }

        // فلتر نوع التقرير
        if (reportType && report.report_type !== reportType) {
            return false;
        }
        
        // فلتر المنطقة (للمستخدمين الذين ليسوا مديري مناطق)
        if (districtFilter && districtFilter !== '' && currentUser.role !== 'manger') {
            if (report.schools?.district !== districtFilter) {
                return false;
            }
        }

        return true;
    });

    displayReports(filtered);
}

// مسح الفلاتر (معدل)
function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('reportTypeFilter').value = '';
    
    // لا نمسح فلتر المنطقة إذا كان المستخدم مدير منطقة
    if (currentUser.role !== 'manger') {
        const districtFilter = document.getElementById('districtFilter');
        if (districtFilter) districtFilter.value = '';
    }
    
    displayReports(currentReports);
}

// فتح مودال إضافة تقرير (مع التحقق من الصلاحية)
function openAddReportModal() {
    if (!canCreateReports(currentUser)) {
        showNotification('لا تملك صلاحية إضافة تقارير', 'error');
        return;
    }
    
    document.getElementById('modalTitle').textContent = 'إضافة تقرير جديد';
    document.getElementById('reportForm').reset();
    document.getElementById('reportId').value = '';
    
    // إعداد تقييم المهارات
    const skillsDiv = document.getElementById('skillsEvaluation');
    skillsDiv.innerHTML = skillsList.map(skill => `
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <span class="font-medium text-gray-700">${skill}</span>
            <div class="flex gap-4">
                <label class="flex items-center">
                    <input type="radio" name="skill_${skill}" value="high" class="ml-2" checked>
                    <span class="text-sm text-green-600">كبيرة</span>
                </label>
                <label class="flex items-center">
                    <input type="radio" name="skill_${skill}" value="medium" class="ml-2">
                    <span class="text-sm text-yellow-600">متوسطة</span>
                </label>
                <label class="flex items-center">
                    <input type="radio" name="skill_${skill}" value="low" class="ml-2">
                    <span class="text-sm text-red-600">قليلة</span>
                </label>
            </div>
        </div>
    `).join('');

    document.getElementById('reportModal').classList.remove('hidden');
    document.getElementById('reportModal').classList.add('flex');
}

// فتح مودال تعديل تقرير (مع التحقق من الصلاحية)
async function editReport(reportId) {
    try {
        const report = currentReports.find(r => r.id === reportId);
        if (!report) return;
        
        // التحقق من صلاحية التعديل
        if (!canEditReport(currentUser, report)) {
            showNotification('لا تملك صلاحية تعديل هذا التقرير', 'error');
            return;
        }

        document.getElementById('modalTitle').textContent = 'تعديل التقرير';
        document.getElementById('reportId').value = report.id;
        document.getElementById('reportType').value = report.report_type;
        document.getElementById('visitDate').value = report.visit_date;
        document.getElementById('schoolId').value = report.school_id;
        
        await loadTeachers();
        
        setTimeout(() => {
            document.getElementById('teacherId').value = report.teacher_id;
        }, 500);
        
        document.getElementById('className').value = report.class_name;
        document.getElementById('section').value = report.section;
        document.getElementById('subject').value = report.subject;

        // تعبئة تقييم المهارات
        const skillsDiv = document.getElementById('skillsEvaluation');
        skillsDiv.innerHTML = skillsList.map(skill => {
            const value = report.skills_evaluation?.[skill] || 'medium';
            return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span class="font-medium text-gray-700">${skill}</span>
                    <div class="flex gap-4">
                        <label class="flex items-center">
                            <input type="radio" name="skill_${skill}" value="high" class="ml-2" ${value === 'high' ? 'checked' : ''}>
                            <span class="text-sm text-green-600">كبيرة</span>
                        </label>
                        <label class="flex items-center">
                            <input type="radio" name="skill_${skill}" value="medium" class="ml-2" ${value === 'medium' ? 'checked' : ''}>
                            <span class="text-sm text-yellow-600">متوسطة</span>
                        </label>
                        <label class="flex items-center">
                            <input type="radio" name="skill_${skill}" value="low" class="ml-2" ${value === 'low' ? 'checked' : ''}>
                            <span class="text-sm text-red-600">قليلة</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        // تعبئة الجوانب الإيجابية
        const positiveDiv = document.getElementById('positiveAspects');
        positiveDiv.innerHTML = '';
        if (report.positive_aspects && report.positive_aspects.length > 0) {
            report.positive_aspects.forEach(aspect => {
                addPositiveAspect(null, aspect);
            });
        } else {
            addPositiveAspect(null, '');
        }

        // تعبئة التوصيات
        const recommendationsDiv = document.getElementById('recommendations');
        recommendationsDiv.innerHTML = '';
        if (report.recommendations && report.recommendations.length > 0) {
            report.recommendations.forEach(rec => {
                addRecommendation(null, rec);
            });
        } else {
            addRecommendation(null, '');
        }

        document.getElementById('reportModal').classList.remove('hidden');
        document.getElementById('reportModal').classList.add('flex');
    } catch (error) {
        console.error('Error editing report:', error);
        showNotification('حدث خطأ في تحميل بيانات التقرير', 'error');
    }
}

// فتح مودال الحذف (مع التحقق من الصلاحية)
function openDeleteModal(reportId) {
    const report = currentReports.find(r => r.id === reportId);
    if (!report) return;
    
    if (!canDeleteReport(currentUser, report)) {
        showNotification('لا تملك صلاحية حذف هذا التقرير', 'error');
        return;
    }
    
    deleteReportId = reportId;
    document.getElementById('deleteModal').classList.remove('hidden');
    document.getElementById('deleteModal').classList.add('flex');
}

// باقي الدوال تبقى كما هي دون تغيير
// addPositiveAspect, addRecommendation, removeField, saveReport, 
// viewReport, confirmDelete, closeModal, closeViewModal, closeDeleteModal,
// exportToExcel, exportToWord, exportToPDF, downloadReportPDF, downloadReportWord

// ... (جميع الدوال الأخرى تبقى كما هي في ملفك الأصلي)

// دالة مساعدة لعرض الإشعارات
function showNotification(message, type) {
    // تنفيذ عرض الإشعارات حسب النظام المستخدم
    console.log(`${type}: ${message}`);
}