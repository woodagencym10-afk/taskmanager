// Твій персональний URL від Google Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbwAjlrE0c9qYwGLj2QK4q-nJqHq-AZtquWiYxslNLbPRoidExKAzPJpWqFsrKRkUe45/exec';

let globalTasks = [];

// Перевірка при завантаженні: чи ми вже залогінені?
window.onload = () => {
    const user = localStorage.getItem('currentUser');
    const role = localStorage.getItem('currentRole');
    if (user) {
        showBoard(user, role);
    }
};

// ==========================================
// 1. АВТОРИЗАЦІЯ
// ==========================================
async function loginUser() {
    const userInp = document.getElementById('login-username').value;
    const passInp = document.getElementById('login-password').value;
    const errObj = document.getElementById('login-error');
    errObj.innerText = "Перевіряємо...";

    const payload = { action: 'login', username: userInp, password: passInp };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            // text/plain обходить проблему CORS у Google Apps Script
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success') {
            localStorage.setItem('currentUser', result.name);
            localStorage.setItem('currentRole', result.role);
            showBoard(result.name, result.role);
        } else {
            errObj.innerText = result.message;
        }
    } catch (e) {
        errObj.innerText = "Помилка зв'язку з сервером.";
    }
}

function logoutUser() {
    localStorage.clear();
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('login-password').value = '';
}

function showBoard(name, role) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';
    document.getElementById('current-user-name').innerText = name;
    document.getElementById('current-user-role').innerText = role === 'owner' ? '(Керівник)' : '(Менеджер)';
    
    // Автоматично підставляємо ім'я в створення задачі
    document.getElementById('task-assignee').value = name;
    
    loadTasks();
}

// ==========================================
// 2. ОТРИМАННЯ ТА ВІДОБРАЖЕННЯ ЗАДАЧ
// ==========================================
async function loadTasks() {
    try {
        const response = await fetch(API_URL);
        const tasks = await response.json();
        globalTasks = tasks;
        renderTasks();
        initDragAndDrop();
    } catch (error) {
        console.error("Помилка завантаження задач:", error);
    }
}

function renderTasks() {
    const cols = { 'В черзі': 'list-queue', 'В роботі': 'list-progress', 'Готово': 'list-done' };
    const counts = { 'В черзі': 0, 'В роботі': 0, 'Готово': 0 };
    
    // Очищаємо колонки
    Object.values(cols).forEach(id => document.getElementById(id).innerHTML = '');

    const role = localStorage.getItem('currentRole');

    globalTasks.forEach(task => {
        if(!cols[task.Status]) return; // Якщо статус якийсь битий
        
        counts[task.Status]++;
        
        let delBtn = '';
        if (role === 'owner') {
            delBtn = `<button class="btn-delete" onclick="deleteTask('${task.ID}')">Видалити</button>`;
        }

        const cardHTML = `
            <div class="task-card" data-id="${task.ID}">
                <div class="task-title">${task.Title || 'Без назви'}</div>
                <div class="task-desc">${task.Description || ''}</div>
                <div class="task-meta">
                    <span>👤 ${task.Assignee || '?'} | 📂 ${task.Project || '?'}</span>
                    <span>📅 ${task.Deadline || 'Немає'}</span>
                </div>
                ${delBtn}
            </div>
        `;
        document.getElementById(cols[task.Status]).insertAdjacentHTML('beforeend', cardHTML);
    });

    // Оновлюємо лічильники
    document.getElementById('count-queue').innerText = counts['В черзі'];
    document.getElementById('count-progress').innerText = counts['В роботі'];
    document.getElementById('count-done').innerText = counts['Готово'];
}

// ==========================================
// 3. DRAG & DROP (Перетягування)
// ==========================================
function initDragAndDrop() {
    const columns = document.querySelectorAll('.task-list');
    columns.forEach(col => {
        new Sortable(col, {
            group: 'kanban',
            animation: 150,
            onEnd: async function (evt) {
                const itemEl = evt.item; // Перетягнута картка
                const newStatus = evt.to.getAttribute('data-status'); // Колонка куди кинули
                const taskId = itemEl.getAttribute('data-id');

                // Оновлюємо статус на сервері
                await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'update', ID: taskId, Status: newStatus })
                });
                
                // Перезавантажуємо, щоб оновити лічильники та дати закриття
                loadTasks(); 
            },
        });
    });
}

// ==========================================
// 4. СТВОРЕННЯ, ВИДАЛЕННЯ, РАНКОВИЙ ПЛАН
// ==========================================
async function createTask() {
    const btn = document.getElementById('btn-save-task');
    btn.innerText = 'Збереження...';
    btn.disabled = true;

    const payload = {
        action: 'add',
        Title: document.getElementById('task-title').value,
        Description: document.getElementById('task-desc').value,
        Project: document.getElementById('task-project').value,
        Assignee: document.getElementById('task-assignee').value,
        Deadline: document.getElementById('task-deadline').value,
        Status: 'В черзі'
    };

    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    });

    // Очищаємо форму
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    
    closeModal('task-modal');
    btn.innerText = 'Зберегти';
    btn.disabled = false;
    loadTasks();
}

async function deleteTask(taskId) {
    if (!confirm('Точно видалити цю задачу?')) return;
    
    const role = localStorage.getItem('currentRole');
    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', ID: taskId, role: role })
    });
    loadTasks();
}

async function sendMorningPlan() {
    const btn = document.getElementById('btn-send-plan');
    btn.innerText = 'Відправка...';
    
    const planText = document.getElementById('plan-details').value;
    const userName = localStorage.getItem('currentUser');

    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'morning_plan', Assignee: userName, PlanDetails: planText })
    });

    document.getElementById('plan-details').value = '';
    closeModal('plan-modal');
    btn.innerText = 'Відправити в Telegram';
    alert('План успішно відправлено!');
}

// ==========================================
// 5. КЕРУВАННЯ МОДАЛЬНИМИ ВІКНАМИ
// ==========================================
function openModal(id) { document.getElementById(id).style.display = 'block'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// Закриття вікна при кліку за його межами
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
}
