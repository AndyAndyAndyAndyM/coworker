// ===== STATE =====
let projects = [], currentProject = null, currentEditingItem = null, currentEditingType = null;
let draggedItem = null, draggedItemType = null, draggedGlobalTask = null;
let showArchived = false, autosaveTimeout = null, hasUnsavedChanges = false;
let globalTaskOrder = { topThree: [], other: [] };
let pomodoroTimer = null, pomodoroTimeLeft = 25 * 60, pomodoroIsRunning = false;
let pomodoroIsBreak = false, pomodoroSessionCount = 0, pomodoroDailyCount = 0;
let workContext = { breadcrumbs: [], currentContext: null, projectContexts: new Map() };
let confirmCallback = null, confirmData = null, nextLinkColorIndex = 0;

const colorThemes = ['blue', 'green', 'purple', 'pink', 'orange', 'teal', 'indigo', 'red'];
const linkColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#F97316', '#84CC16'];
const itemTypes = {
    brief: { plural: 'briefs', name: 'Brief', color: 'type-brief' },
    note: { plural: 'notes', name: 'Note', color: 'type-note' },
    copy: { plural: 'copy', name: 'Copy', color: 'type-copy' },
    task: { plural: 'tasks', name: 'Task', color: 'type-task' }
};

// ===== UTILITIES =====
const getNextTheme = () => colorThemes[projects.length % colorThemes.length];
const getNextColor = () => linkColors[nextLinkColorIndex++ % linkColors.length];
const getTimeAgo = (timestamp) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
    return mins < 60 ? `${mins}m ago` : hours < 24 ? `${hours}h ago` : `${days}d ago`;
};

const notify = (msg) => {
    const n = document.createElement('div');
    n.className = 'notification';
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 100);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, 3000);
};

const confirm = (title, msg, callback, data) => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = msg;
    document.getElementById('confirmModal').style.display = 'block';
    confirmCallback = callback; confirmData = data;
};

// ===== ITEM MANAGEMENT =====
const findItem = (id, type) => currentProject?.[itemTypes[type].plural]?.find(item => item.id == id);
const getAllItems = (type) => currentProject?.[itemTypes[type].plural] || [];

const createItem = (type, data) => ({
    id: Date.now(), type, createdAt: new Date().toISOString(), order: 0,
    ...(type === 'brief' ? { linkColor: getNextColor(), proposition: '', clientBrief: '' } : {}),
    ...(type === 'task' ? { completed: false } : {}),
    ...data
});

const addItem = (item, type) => {
    const items = currentProject[itemTypes[type].plural] ||= [];
    items.forEach(i => i.order = (i.order || 0) + 1);
    items.unshift(item);
    saveProjects();
};

const deleteItem = (id, type) => {
    confirm(`Delete ${itemTypes[type].name}`, 'Are you sure?', () => {
        const parsedId = parseInt(id);
        currentProject[itemTypes[type].plural] = currentProject[itemTypes[type].plural].filter(i => i.id !== parsedId);
        
        if (type === 'brief') {
            currentProject.notes = currentProject.notes.filter(n => n.linkedBriefId !== parsedId);
            currentProject.copy = currentProject.copy.filter(c => c.linkedBriefId !== parsedId);
        }
        
        projects.forEach(p => p.tasks = p.tasks?.filter(t => !(t.sourceItemType === type && t.sourceItemId === parsedId)) || []);
        
        workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== `${currentProject.id}-${parsedId}-${type}`);
        
        saveProjects(); renderProject(); renderGlobalTasks();
        notify(`${itemTypes[type].name} deleted`);
    }, id);
};

const addQuickItem = (type) => {
    if (!currentProject) return alert('Select a project first');
    const title = document.getElementById(`${type}Title`).value.trim();
    if (title) {
        addItem(createItem(type, { title }), type);
        renderItems(type);
        document.getElementById(`${type}Title`).value = '';
    }
};

// ===== RENDERING =====
const getLinkColor = (item, type) => {
    if (type === 'brief') return item.linkColor;
    if (['note', 'copy'].includes(type) && item.linkedBriefId) {
        return currentProject.briefs.find(b => b.id === item.linkedBriefId)?.linkColor;
    }
    if (type === 'task' && item.sourceItemId) {
        const source = findItem(item.sourceItemId, item.sourceItemType);
        return source ? getLinkColor(source, item.sourceItemType) : null;
    }
    return null;
};

const renderItem = (item, type) => {
    const color = getLinkColor(item, type) || '#a3a3a3';
    const isLinked = item.linkedBriefId || (type === 'brief' && getLinkedCount(item.id) > 0);
    
    let content = '';
    if (type === 'brief') {
        if (item.proposition) content += `<div class="brief-section proposition">${item.proposition.substring(0, 120)}${item.proposition.length > 120 ? '...' : ''}</div>`;
        if (item.clientBrief) content += `<div class="brief-section client">${item.clientBrief.substring(0, 120)}${item.clientBrief.length > 120 ? '...' : ''}</div>`;
        const linked = getLinkedCount(item.id);
        if (linked) content += `<div class="item-meta">${linked} linked</div>`;
    } else if (item.content) {
        content = `<div class="item-content">${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}</div>`;
    }
    
    if (type === 'task' && item.sourceItemId) {
        const source = findItem(item.sourceItemId, item.sourceItemType);
        if (source) content += `<div class="task-source">From: ${source.title}</div>`;
    }
    
    return `<div class="item ${type}-item ${isLinked ? 'linked' : ''}" draggable="true" 
                  data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}' data-type="${type}"
                  ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)"
                  ondblclick="openEditor(findItem('${item.id}', '${type}'), '${type}')"
                  style="border-left: 3px solid ${color}">
                <div class="grab-handle"></div>
                <div class="item-type ${itemTypes[type].color}">${itemTypes[type].name}</div>
                <div class="item-title">${item.title}</div>
                <div class="item-meta">Created: ${new Date(item.createdAt).toLocaleDateString()}</div>
                ${content}
                <div class="item-actions">
                    <span class="action-hint">Double-click to edit • Drag to link</span>
                    <button class="delete-btn" data-delete-type="${type}" data-delete-id="${item.id}">×</button>
                </div>
            </div>`;
};

const renderItems = (type) => {
    const list = document.getElementById(`${type}${type === 'copy' ? 'List' : 'sList'}`);
    if (!list) return;
    
    const items = getAllItems(type);
    if (!items.length) {
        list.innerHTML = `<div class="empty-state">No ${type}s yet</div>`;
        return;
    }
    
    items.forEach((item, i) => item.order ??= i);
    const sorted = type === 'task' ? sortTasks(items) : items.sort((a, b) => (a.order || 0) - (b.order || 0));
    list.innerHTML = sorted.map(item => renderItem(item, type)).join('');
};

const sortTasks = (tasks) => tasks.sort((a, b) => a.completed - b.completed || (a.order || 0) - (b.order || 0));
const getLinkedCount = (briefId) => (currentProject.notes?.filter(n => n.linkedBriefId === briefId).length || 0) +
                                    (currentProject.copy?.filter(c => c.linkedBriefId === briefId).length || 0);

const renderProject = () => ['brief', 'note', 'copy', 'task'].forEach(renderItems);

// ===== DRAG & DROP =====
const handleDragStart = (e) => {
    draggedItem = JSON.parse(e.currentTarget.getAttribute('data-item'));
    draggedItemType = e.currentTarget.getAttribute('data-type');
    e.currentTarget.classList.add('dragging');
};

const handleDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); draggedItem = draggedItemType = null; };
const handleDragOver = (e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); };
const handleDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over'); };

const handleDrop = (e, targetType) => {
    e.preventDefault(); e.currentTarget.classList.remove('drag-over');
    if (!draggedItem || draggedItemType === targetType) return;
    
    let content = draggedItemType === 'brief' && targetType === 'task' 
        ? [draggedItem.proposition, draggedItem.clientBrief].filter(Boolean).join('\n\n')
        : draggedItem.content || '';
    
    const newItem = createItem(targetType, { title: draggedItem.title, content });
    
    if (targetType === 'task') {
        newItem.sourceItemId = draggedItem.id;
        newItem.sourceItemType = draggedItemType;
        const existing = currentProject.tasks.findIndex(t => t.sourceItemId === draggedItem.id && t.sourceItemType === draggedItemType);
        if (existing !== -1) currentProject.tasks.splice(existing, 1);
    } else if (draggedItemType === 'brief' && ['note', 'copy'].includes(targetType)) {
        newItem.linkedBriefId = draggedItem.id;
        newItem.title = `${draggedItem.title} - ${targetType}`;
        if (targetType === 'note' && draggedItem.proposition) {
            newItem.richContent = `<p><strong>Prop:</strong> <em>${draggedItem.proposition}</em></p><br><p></p>`;
            newItem.content = `Prop: ${draggedItem.proposition}\n\n`;
        }
    }
    
    addItem(newItem, targetType);
    renderItems(targetType);
    notify(`Created ${targetType} from ${draggedItemType}`);
};

// ===== GLOBAL TASKS =====
const getAllTasks = () => projects.flatMap(p => (p.tasks || []).map(t => ({ ...t, projectName: p.name, projectId: p.id })));

const renderGlobalTasks = () => {
    const tasks = getAllTasks();
    const taskMap = new Map(tasks.map(t => [`${t.projectId}-${t.id}`, t]));
    
    const topThree = globalTaskOrder.topThree.map(id => taskMap.get(id)).filter(t => t && !t.completed).slice(0, 3);
    const otherIds = new Set(globalTaskOrder.other);
    const topIds = new Set(globalTaskOrder.topThree);
    const other = [...globalTaskOrder.other.map(id => taskMap.get(id)).filter(Boolean),
                   ...tasks.filter(t => !topIds.has(`${t.projectId}-${t.id}`) && !otherIds.has(`${t.projectId}-${t.id}`))];
    
    renderTaskSection('topThreeTasks', topThree, true);
    renderTaskSection('otherTasks', sortTasks(other), false);
};

const renderTaskSection = (containerId, tasks, isTop) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (!tasks.length) {
        container.innerHTML = `<div class="task-drop-zone">${isTop ? 'Drop important tasks here' : 'Other tasks appear here'}</div>`;
        return;
    }
    
    container.innerHTML = tasks.map(task => {
        const color = getLinkColor(task, 'task') || '#10b981';
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDive = hasSource && ['note', 'copy'].includes(task.sourceItemType);
        
        return `<div class="global-task ${isTop ? 'priority' : ''}" draggable="true"
                     data-unique-id="${task.projectId}-${task.id}"
                     ondragstart="handleGlobalDragStart(event)" ondragend="handleGlobalDragEnd(event)"
                     style="border-left: 3px solid ${color}; ${task.completed ? 'opacity: 0.6;' : ''}">
                    <div class="task-header">
                        <input type="checkbox" ${task.completed ? 'checked' : ''} 
                               onclick="toggleGlobalTask('${task.projectId}', '${task.id}')">
                        <span class="task-title ${task.completed ? 'completed' : ''}">${task.title}</span>
                    </div>
                    <div class="task-meta">${task.projectName} • ${new Date(task.createdAt).toLocaleDateString()}</div>
                    ${task.content ? `<div class="task-content">${task.content.substring(0, 100)}</div>` : ''}
                    <div class="task-actions">
                        <button onclick="openGlobalSource('${task.projectId}', '${task.id}')">${hasSource ? 'Open' : 'Edit'}</button>
                        ${canDive ? `<button onclick="diveIn('${task.projectId}', '${task.id}')" class="dive-btn">Dive In</button>` : ''}
                    </div>
                </div>`;
    }).join('');
};

const toggleGlobalTask = (projectId, taskId) => {
    const project = projects.find(p => p.id == projectId);
    const task = project?.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date().toISOString() : undefined;
        if (task.completed) {
            const uid = `${projectId}-${taskId}`;
            globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uid);
            globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uid);
            saveGlobalOrder();
        }
        saveProjects(); renderGlobalTasks(); if (currentProject) renderItems('task');
    }
};

// ===== PROJECT MANAGEMENT =====
const renderProjectOverview = () => {
    const grid = document.getElementById('projectGrid');
    const visible = projects.filter(p => showArchived || !p.archived);
    
    grid.innerHTML = !visible.length ? '<div class="empty-projects">No projects yet</div>' :
        visible.map(p => `<div class="project-card project-theme-${p.colorTheme || 'blue'}" onclick="selectProject(${p.id})">
                            <h3>${p.name}</h3>
                            <p>${p.description || ''}</p>
                            <div class="project-stats">
                                ${['briefs', 'notes', 'copy', 'tasks'].map(type => 
                                    `<div><span>${(p[type] || []).length}</span><small>${type}</small></div>`
                                ).join('')}
                            </div>
                            <div class="project-actions">
                                <small>Created: ${new Date(p.createdAt).toLocaleDateString()}</small>
                                <div>
                                    <button onclick="event.stopPropagation(); openSettings(${p.id})">Settings</button>
                                    <button onclick="event.stopPropagation(); toggleArchive(${p.id})">${p.archived ? 'Restore' : 'Archive'}</button>
                                </div>
                            </div>
                        </div>`).join('');
};

const showOverview = () => {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('projectOverview').style.display = 'block';
    document.getElementById('projectSelect').value = '';
    currentProject = null;
    renderProjectOverview(); renderGlobalTasks();
};

const switchToProject = (id, callback) => {
    const project = projects.find(p => p.id == id);
    if (!project) return;
    
    currentProject = project;
    document.getElementById('projectSelect').value = id;
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('projectOverview').style.display = 'none';
    
    const dash = document.getElementById('dashboard');
    dash.className = `project-theme-${project.colorTheme || 'blue'} project-themed`;
    
    renderProject(); if (callback) callback();
};

const selectProject = (id) => { document.getElementById('projectSelect').value = id; switchProject(); };
const switchProject = () => { 
    const id = document.getElementById('projectSelect').value;
    id ? switchToProject(id) : showOverview();
};

// ===== EDITOR =====
const openEditor = (item, type) => {
    if (!item) return;
    if (currentEditingItem) saveContext();
    
    currentEditingItem = item; currentEditingType = type;
    addBreadcrumb(currentProject.id, item.id, type, item.title);
    
    document.getElementById('editorTitle').textContent = `Edit ${itemTypes[type].name}`;
    document.getElementById('editorItemTitle').value = item.title || '';
    
    const briefFields = document.getElementById('briefFields');
    const standardFields = document.getElementById('standardFields');
    
    if (type === 'brief') {
        briefFields.style.display = 'block'; standardFields.style.display = 'none';
        document.getElementById('editorProposition').value = item.proposition || '';
        document.getElementById('editorClientBrief').value = item.clientBrief || '';
    } else {
        briefFields.style.display = 'none'; standardFields.style.display = 'block';
        const rich = document.getElementById('richEditor'), text = document.getElementById('editorContent');
        
        if (['note', 'copy'].includes(type)) {
            rich.style.display = 'block'; text.style.display = 'none';
            rich.innerHTML = item.richContent || textToHtml(item.content || '');
        } else {
            rich.style.display = 'none'; text.style.display = 'block';
            text.value = item.content || '';
        }
    }
    
    document.getElementById('itemEditor').style.display = 'block';
    setTimeout(() => { setupAutosave(); setupPomodoro(type); }, 100);
};

const setupPomodoro = (type) => {
    const timer = document.getElementById('pomodoroTimer');
    if (timer) {
        timer.style.display = ['note', 'copy'].includes(type) ? 'flex' : 'none';
        if (['note', 'copy'].includes(type)) initPomodoro();
    }
};

// ===== AUTOSAVE =====
const setupAutosave = () => {
    ['editorItemTitle', 'editorProposition', 'editorClientBrief', 'richEditor', 'editorContent']
        .forEach(id => document.getElementById(id)?.addEventListener('input', debouncedSave));
};

const debouncedSave = () => {
    clearTimeout(autosaveTimeout);
    hasUnsavedChanges = true;
    autosaveTimeout = setTimeout(autosave, 1500);
};

const autosave = () => {
    if (!currentEditingItem) return;
    const title = document.getElementById('editorItemTitle').value.trim();
    if (!title) return;
    
    const oldTitle = currentEditingItem.title;
    currentEditingItem.title = title;
    
    if (currentEditingType === 'brief') {
        currentEditingItem.proposition = document.getElementById('editorProposition').value;
        currentEditingItem.clientBrief = document.getElementById('editorClientBrief').value;
    } else {
        const rich = document.getElementById('richEditor'), text = document.getElementById('editorContent');
        if (rich && rich.style.display !== 'none') {
            currentEditingItem.content = htmlToText(rich.innerHTML);
            currentEditingItem.richContent = rich.innerHTML;
        } else if (text) {
            currentEditingItem.content = text.value;
        }
    }
    
    if (oldTitle !== title) moveToTop(currentEditingItem, currentEditingType);
    saveProjects(); hasUnsavedChanges = false;
    setTimeout(() => renderItems(currentEditingType), 100);
};

const moveToTop = (item, type) => {
    const items = currentProject[itemTypes[type].plural];
    items.forEach(i => i.id === item.id ? i.order = 0 : i.order = (i.order || 0) + 1);
};

// ===== POMODORO =====
const initPomodoro = () => {
    updateDisplay(); updateStatus();
    const timer = document.getElementById('pomodoroTimer');
    if (timer) timer.style.display = 'flex';
};

const startPomodoro = () => {
    pomodoroIsRunning = true;
    document.getElementById('pomodoroStart').style.display = 'none';
    document.getElementById('pomodoroPause').style.display = 'inline';
    if (!pomodoroIsBreak) enterFocus();
    
    pomodoroTimer = setInterval(() => {
        pomodoroTimeLeft--;
        updateDisplay();
        if (pomodoroTimeLeft <= 0) completePomodoro();
    }, 1000);
};

const pausePomodoro = () => {
    pomodoroIsRunning = false;
    clearInterval(pomodoroTimer);
    document.getElementById('pomodoroStart').style.display = 'inline';
    document.getElementById('pomodoroPause').style.display = 'none';
    exitFocus();
};

const resetPomodoro = () => {
    pausePomodoro(); pomodoroIsBreak = false; pomodoroTimeLeft = 25 * 60;
    updateDisplay(); updateStatus();
};

const completePomodoro = () => {
    pausePomodoro();
    if (pomodoroIsBreak) {
        pomodoroIsBreak = false; pomodoroTimeLeft = 25 * 60;
    } else {
        pomodoroSessionCount++; pomodoroDailyCount++;
        pomodoroIsBreak = true;
        pomodoroTimeLeft = pomodoroSessionCount % 4 === 0 ? 15 * 60 : 5 * 60;
    }
    updateDisplay(); updateStatus();
    notify(pomodoroIsBreak ? 'Break time!' : 'Back to work!');
};

const updateDisplay = () => {
    const el = document.getElementById('pomodoroDisplay');
    if (el) {
        const mins = Math.floor(pomodoroTimeLeft / 60), secs = pomodoroTimeLeft % 60;
        el.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
};

const updateStatus = () => {
    const el = document.getElementById('pomodoroStatus');
    if (el) {
        el.textContent = pomodoroIsRunning 
            ? (pomodoroIsBreak ? 'Break time!' : 'Focus time!')
            : (pomodoroIsBreak ? 'Break paused' : 'Ready to focus');
    }
};

const enterFocus = () => {
    document.getElementById('itemEditor').classList.add('fullscreen');
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
};

const exitFocus = () => {
    document.getElementById('itemEditor').classList.remove('fullscreen');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
};

// ===== CONTEXT & BREADCRUMBS =====
const addBreadcrumb = (projectId, itemId, type, title) => {
    const id = `${projectId}-${itemId}-${type}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== id);
    workContext.breadcrumbs.push({ id, projectId, itemId, type, title, timestamp: Date.now() });
    if (workContext.breadcrumbs.length > 10) workContext.breadcrumbs.shift();
    saveBreadcrumbs(); renderBreadcrumbs();
};

const renderBreadcrumbs = () => {
    const container = document.getElementById('breadcrumbContainer');
    const trail = document.getElementById('breadcrumbTrail');
    
    if (!workContext.breadcrumbs.length) {
        container.style.display = 'none'; return;
    }
    
    container.style.display = 'block';
    trail.innerHTML = workContext.breadcrumbs.map((b, i) => 
        `<span class="breadcrumb ${i === workContext.breadcrumbs.length - 1 ? 'current' : ''}" 
               onclick="navigateBreadcrumb('${b.id}')">${b.title}</span>`
    ).join(' > ') + `<button onclick="clearBreadcrumbs()">Clear</button>`;
};

const navigateBreadcrumb = (id) => {
    const b = workContext.breadcrumbs.find(br => br.id === id);
    if (b && (!currentProject || currentProject.id != b.projectId)) {
        switchToProject(b.projectId, () => setTimeout(() => openEditor(findItem(b.itemId, b.type), b.type), 200));
    } else if (b) {
        openEditor(findItem(b.itemId, b.type), b.type);
    }
};

const saveContext = () => {
    if (!currentEditingItem || !currentProject) return;
    const context = { projectId: currentProject.id, itemId: currentEditingItem.id, 
                     itemType: currentEditingType, title: currentEditingItem.title, timestamp: Date.now() };
    workContext.currentContext = context;
    workContext.projectContexts.set(`project-${currentProject.id}`, context);
    saveWorkContext();
};

const clearBreadcrumbs = () => { workContext.breadcrumbs = []; saveBreadcrumbs(); renderBreadcrumbs(); };

// ===== STORAGE =====
const saveProjects = () => localStorage.setItem('projects', JSON.stringify(projects));
const saveGlobalOrder = () => localStorage.setItem('globalTaskOrder', JSON.stringify(globalTaskOrder));
const saveWorkContext = () => localStorage.setItem('workContext', JSON.stringify({
    breadcrumbs: workContext.breadcrumbs, currentContext: workContext.currentContext,
    projectContexts: Array.from(workContext.projectContexts.entries())
}));
const saveBreadcrumbs = () => localStorage.setItem('breadcrumbs', JSON.stringify(workContext.breadcrumbs));

const loadData = () => {
    // Load projects
    const saved = localStorage.getItem('projects');
    if (saved) {
        projects = JSON.parse(saved);
        projects.forEach(p => {
            Object.assign(p, { colorTheme: p.colorTheme || getNextTheme(), archived: p.archived || false,
                              briefs: p.briefs || [], notes: p.notes || [], copy: p.copy || [], tasks: p.tasks || [] });
            p.briefs.forEach(b => { if (!b.linkColor) b.linkColor = getNextColor(); });
        });
    }
    
    // Load global order
    const order = localStorage.getItem('globalTaskOrder');
    if (order) globalTaskOrder = { topThree: [], other: [], ...JSON.parse(order) };
    
    // Load context
    const context = localStorage.getItem('workContext');
    if (context) {
        const data = JSON.parse(context);
        workContext.breadcrumbs = data.breadcrumbs || [];
        workContext.currentContext = data.currentContext;
        workContext.projectContexts = new Map(data.projectContexts || []);
    }
};

// ===== UTILITIES =====
const htmlToText = (html) => { const div = document.createElement('div'); div.innerHTML = html; return div.textContent; };
const textToHtml = (text) => text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

const updateSelector = () => {
    document.getElementById('projectSelect').innerHTML = '<option value="">Select project...</option>' +
        projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
};

// ===== GLOBAL DRAG HANDLERS =====
const handleGlobalDragStart = (e) => {
    draggedGlobalTask = { uniqueId: e.currentTarget.getAttribute('data-unique-id') };
    e.currentTarget.classList.add('dragging');
};
const handleGlobalDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); draggedGlobalTask = null; };

// ===== WINDOW FUNCTIONS =====
Object.assign(window, {
    // Core
    openProjectModal: () => document.getElementById('projectModal').style.display = 'block',
    closeModal: (id) => document.getElementById(id).style.display = 'none',
    closeEditor: () => { saveContext(); pausePomodoro(); exitFocus(); 
                        document.getElementById('itemEditor').style.display = 'none'; 
                        currentEditingItem = currentEditingType = null; },
    
    // Project
    createProject: () => {
        const name = document.getElementById('newProjectName').value.trim();
        if (name) {
            projects.push(createItem('project', { name, description: document.getElementById('newProjectDescription').value,
                                                 briefs: [], notes: [], copy: [], tasks: [], colorTheme: getNextTheme() }));
            saveProjects(); updateSelector(); closeModal('projectModal');
            document.getElementById('newProjectName').value = '';
            document.getElementById('newProjectDescription').value = '';
            renderProjectOverview();
        }
    },
    showProjectOverview: showOverview, switchProject, selectProject,
    toggleArchivedProjects: () => { showArchived = !showArchived; renderProjectOverview(); },
    toggleArchiveProject: (id) => { const p = projects.find(pr => pr.id === id); if (p) { p.archived = !p.archived; saveProjects(); renderProjectOverview(); }},
    
    // Items
    addQuickBrief: () => addQuickItem('brief'), addQuickNote: () => addQuickItem('note'),
    addQuickCopy: () => addQuickItem('copy'), addQuickTask: () => addQuickItem('task'),
    openItemEditor: openEditor, findItem, deleteItem,
    
    // Drag
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
    handleGlobalDragStart, handleGlobalDragEnd,
    
    // Tasks
    toggleGlobalTask, openGlobalSource: (pid, tid) => { switchToProject(pid); setTimeout(() => openEditor(findItem(tid, 'task'), 'task'), 200); },
    diveIn: (pid, tid) => { switchToProject(pid); setTimeout(() => { 
        const t = findItem(tid, 'task'), s = findItem(t.sourceItemId, t.sourceItemType);
        if (s) { openEditor(s, t.sourceItemType); setTimeout(startPomodoro, 300); } }, 200); },
    
    // Pomodoro
    startPomodoro, pausePomodoro, resetPomodoro, exitFocusMode: exitFocus,
    
    // Context
    navigateToBreadcrumb: navigateBreadcrumb, clearBreadcrumbs,
    
    // Confirm
    showConfirm: confirm, proceedConfirm: () => { closeModal('confirmModal'); if (confirmCallback) confirmCallback(confirmData); },
    cancelConfirm: () => { closeModal('confirmModal'); confirmCallback = confirmData = null; },
    
    // Utility
    handleEnterKey: (e, type) => { if (e.key === 'Enter') addQuickItem(type); }
});

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadData(); updateSelector(); showOverview();
        document.addEventListener('click', e => {
            if (e.target.classList.contains('delete-btn')) {
                e.stopPropagation();
                deleteItem(e.target.getAttribute('data-delete-id'), e.target.getAttribute('data-delete-type'));
            }
        });
        renderBreadcrumbs();
    } catch (e) { console.error(e); }
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('confirmModal');
        if (modal.style.display === 'block') { cancelConfirm(); return; }
        document.querySelectorAll('.modal, .editor-modal').forEach(m => m.style.display = 'none');
    }
    if (e.key === 's' && e.ctrlKey) { e.preventDefault(); autosave(); }
});

window.onclick = e => {
    if ((e.target.classList.contains('modal') || e.target.classList.contains('editor-modal')) && 
        e.target.id !== 'confirmModal') e.target.style.display = 'none';
};
