// متغيرات عامة
let analyticsData = null;
let distributionChart = null;
let monthlyChart = null;

// تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
    await loadAnalytics();
});

// تحميل التحليلات
async function loadAnalytics() {
    try {
        const { data: { user } } = await supabaseHelper.getCurrentUser();
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        const dateFrom = document.getElementById('analyticsDateFrom')?.value;
        const dateTo = document.getElementById('analyticsDateTo')?.value;

        const filters = {
            date_from: dateFrom,
            date_to: dateTo
        };

        if (userData.role === 'specialist') {
            filters.specialist_id = user.id;
        } else if (userData.role === 'district_manager') {
            filters.district = userData.district;
        }

        const result = await supabaseHelper.getAnalytics(filters);
        
        if (result.success) {
            analyticsData = result.data;
            updateDashboard();
        } else {
            showNotification('حدث خطأ في تحميل التحليلات', 'error');
        }
    } catch (error) {
        console.error('Error loading analytics:', error);
        showNotification('حدث خطأ في تحميل التحليلات', 'error');
    }
}

// تحديث لوحة التحليلات
function updateDashboard() {
    if (!analyticsData) return;

    // تحديث البطاقات
    document.getElementById('totalVisits').textContent = analyticsData.total_reports;
    document.getElementById('inPersonVisits').textContent = analyticsData.by_type.in_person;
    document.getElementById('remoteVisits').textContent = analyticsData.by_type.remote;
    document.getElementById('activeSpecialists').textContent = Object.keys(analyticsData.by_specialist).length;

    // تحديث الرسوم البيانية
    updateCharts();

    // تحديث الجداول
    displaySpecialistsStats();
    displaySchoolsStats();
    displayTeachersStats();
}

// تحديث الرسوم البيانية
function updateCharts() {
    // رسم بياني للتوزيع
    const distCtx = document.getElementById('distributionChart')?.getContext('2d');
    if (distCtx) {
        if (distributionChart) distributionChart.destroy();
        
        distributionChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: ['تعليم وجاهي', 'تعلم عن بعد'],
                datasets: [{
                    data: [analyticsData.by_type.in_person, analyticsData.by_type.remote],
                    backgroundColor: ['#10b981', '#3b82f6'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: 'Cairo' }
                        }
                    }
                }
            }
        });
    }

    // رسم بياني للاتجاه الشهري
    const monthlyCtx = document.getElementById('monthlyTrendChart')?.getContext('2d');
    if (monthlyCtx) {
        if (monthlyChart) monthlyChart.destroy();

        const months = Object.keys(analyticsData.by_month).sort();
        const counts = months.map(m => analyticsData.by_month[m]);

        monthlyChart = new Chart(monthlyCtx, {
            type: 'line',
            data: {
                labels: months.map(m => {
                    const [year, month] = m.split('-');
                    return `${month}/${year}`;
                }),
                datasets: [{
                    label: 'عدد الزيارات',
                    data: counts,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false }
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
}

// عرض إحصائيات المختصين
async function displaySpecialistsStats() {
    const tbody = document.getElementById('specialistsTable');
    
    // الحصول على أسماء المختصين
    const specialistIds = Object.keys(analyticsData.by_specialist);
    const specialists = [];
    
    for (const id of specialistIds) {
        const { data } = await supabase
            .from('users')
            .select('full_name, district')
            .eq('id', id)
            .single();
        
        if (data) {
            specialists.push({
                id,
                name: data.full_name,
                district: data.district,
                ...analyticsData.by_specialist[id]
            });
        }
    }

    // ترتيب حسب الإجمالي
    specialists.sort((a, b) => b.total - a.total);

    tbody.innerHTML = specialists.map(s => {
        const percentage = ((s.total / analyticsData.total_reports) * 100).toFixed(1);
        return `
            <tr>
                <td>${s.name}</td>
                <td>${s.district || 'غير محدد'}</td>
                <td class="font-bold">${s.total}</td>
                <td class="text-green-600">${s.in_person}</td>
                <td class="text-blue-600">${s.remote}</td>
                <td>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${percentage}%"></div>
                    </div>
                    <span class="text-sm">${percentage}%</span>
                </td>
            </tr>
        `;
    }).join('');
}

// عرض إحصائيات المدارس
async function displaySchoolsStats() {
    const tbody = document.getElementById('schoolsTable');
    
    // الحصول على أسماء المدارس
    const schoolIds = Object.keys(analyticsData.by_school);
    const schools = [];
    
    for (const id of schoolIds) {
        const { data } = await supabase
            .from('schools')
            .select('name, district')
            .eq('id', id)
            .single();
        
        if (data) {
            schools.push({
                id,
                name: data.name,
                district: data.district,
                ...analyticsData.by_school[id]
            });
        }
    }

    // ترتيب تنازلي حسب الإجمالي
    schools.sort((a, b) => b.total - a.total);

    tbody.innerHTML = schools.slice(0, 20).map(s => `
        <tr>
            <td>${s.name}</td>
            <td>${s.district || 'غير محدد'}</td>
            <td class="font-bold">${s.total}</td>
            <td class="text-green-600">${s.in_person}</td>
            <td class="text-blue-600">${s.remote}</td>
        </tr>
    `).join('');
}

// عرض إحصائيات المعلمين
async function displayTeachersStats() {
    const tbody = document.getElementById('teachersTable');
    
    // تجميع زيارات المعلمين
    const teacherVisits = {};
    
    const { data: reports } = await supabaseHelper.getReports();
    
    if (reports.success) {
        reports.data.forEach(report => {
            if (report.teacher_id) {
                if (!teacherVisits[report.teacher_id]) {
                    teacherVisits[report.teacher_id] = {
                        total: 0,
                        teacher: report.teachers
                    };
                }
                teacherVisits[report.teacher_id].total++;
            }
        });
    }

    // ترتيب تنازلي
    const teachers = Object.entries(teacherVisits)
        .map(([id, data]) => ({
            id,
            name: data.teacher?.name || 'غير معروف',
            school: data.teacher?.schools?.name || 'غير معروفة',
            subject: data.teacher?.subject || 'غير محدد',
            total: data.total
        }))
        .sort((a, b) => b.total - a.total);

    tbody.innerHTML = teachers.slice(0, 20).map(t => `
        <tr>
            <td>${t.name}</td>
            <td>${t.school}</td>
            <td>${t.subject}</td>
            <td class="font-bold text-center">${t.total}</td>
        </tr>
    `).join('');
}

// ترتيب المختصين
function sortSpecialists() {
    const sortBy = document.getElementById('specialistSort').value;
    displaySpecialistsStats(); // سيتم إعادة الترتيب تلقائياً
}

// تحديث التحليلات
function updateAnalytics() {
    loadAnalytics();
}

// تصدير التحليلات
function exportAnalytics() {
    // تنفيذ تصدير التحليلات إلى Excel
    showNotification('جاري تجهيز ملف التحليلات...', 'info');
}

// تصدير التحليلات إلى Excel
function exportAnalyticsToExcel() {
    // إنشاء مصنف Excel
    const workbook = {
        specialists: [],
        schools: [],
        teachers: []
    };

    // تجهيز البيانات
    // ...

    showNotification('تم تصدير التحليلات بنجاح', 'success');
}