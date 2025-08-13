// ===== HELPER FUNCTIONS =====
const getEl = (id) => document.getElementById(id);
const setDisplay = (id, display) => { const el = getEl(id); if (el) el.style.display = display; };
const setValue = (id, value) => { const el = getEl(id); if (el) el.value = value; };
const getValue = (id) => { const el = getEl(id); return el ? el.value.trim() : ''; };
const setContent = (id, content) => { const el = getEl(id); if (el) el.textContent = content; };
const setHTML = (id, html) => { const el = getEl(id); if (el) el.innerHTML = html; };

const saveToStorage = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        if (!window.appStorage) window.appStorage = {};
        window.appStorage[key] = JSON.stringify(data);
    }
};

const loadFromStorage = (key, defaultValue = null) => {
    try {
        const saved = localStorage.getItem(key);
        if (saved) return JSON.parse(saved);
        if (window.appStorage && window.appStorage[key]) return JSON.parse(window.appStorage[key]);
        return defaultValue;
    } catch (error) {
        return defaultValue;
    }
};

const generateId = () => Date.now();
const getCurrentTimestamp = () => new Date().toISOString();
const formatDate = (dateString) => new Date(dateString).toLocaleDateString();
const truncateContent = (content, maxLength = 100) => content && content.length > maxLength ? content.substring(0, maxLength) + '...' : content || '';

const showNotification = (message) => {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => document.body.contains(notification) && document.body.removeChild(notification), 300);
    }, 3000);
};

// ===== GLOBAL STATE =====
let projects = [];
let currentProject = null;
let currentEditingItem = null;
let currentEditingType = null;
let draggedItem = null;
let draggedItemType = null;
let showArchived = false;
let autosaveTimeout = null;
let hasUnsavedChanges = false;
let globalTaskOrder = { topThree: [], other: [] };
let draggedGlobalTask = null;

let pomodoroTimer = null;
let pomodoroTimeLeft = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroIsBreak = false;
let pomodoroSessionCount = 0;
let pomodoroDailyCount = 0;

const colorThemes = ['blue', 'green', 'purple', 'pink', 'orange', 'teal', 'indigo', 'red'];
const linkColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1'];
let nextLinkColorIndex = 0;

let confirmCallback = null;
let confirmData = null;

let workContext = { breadcrumbs: [], currentContext: null, projectContexts: new Map(), globalContext: null };
let elementsWithListeners = new Set();
let mammothLibrary = null;

try {
    if (typeof mammoth !== 'undefined') mammothLibrary = mammoth;
} catch (e) {}

// ===== UTILITY FUNCTIONS =====
function getNextColorTheme() {
    if (!projects || projects.length === 0) return colorThemes[0];
    const usedThemes = projects.map(p => p.colorTheme).filter(Boolean);
    const availableThemes = colorThemes.filter(theme => !usedThemes.includes(theme));
    return availableThemes.length > 0 ? availableThemes[0] : colorThemes[projects.length % colorThemes.length];
}

function getNextLinkColor() {
    const color = linkColors[nextLinkColorIndex % linkColors.length];
    nextLinkColorIndex++;
    return color;
}

function initializeLinkColorIndex() {
    let maxIndex = 0;
    projects.forEach(project => {
        if (project.briefs) {
            project.briefs.forEach(brief => {
                if (brief.linkColor) {
                    const colorIndex = linkColors.indexOf(brief.linkColor);
                    if (colorIndex !== -1 && colorIndex > maxIndex) maxIndex = colorIndex;
                }
            });
        }
    });
    nextLinkColorIndex = maxIndex + 1;
}

function getLinkColor(item, itemType) {
    if (itemType === 'brief' && item.linkColor) return item.linkColor;
    if ((itemType === 'note' || itemType === 'copy') && item.linkedBriefId) {
        const brief = currentProject.briefs.find(b => b.id === item.linkedBriefId);
        return brief ? brief.linkColor : null;
    }
    if (itemType === 'task' && item.sourceItemId && item.sourceItemType) {
        const sourceItem = findItem(item.sourceItemId, item.sourceItemType);
        if (sourceItem) return getLinkColor(sourceItem, item.sourceItemType);
    }
    return null;
}

function getLinkedItemsCount(briefId) {
    let count = 0;
    if (currentProject && currentProject.notes) count += currentProject.notes.filter(note => note.linkedBriefId === briefId).length;
    if (currentProject && currentProject.copy) count += currentProject.copy.filter(copy => copy.linkedBriefId === briefId).length;
    return count;
}

// ===== GLOBAL TASKS =====
function getAllTasks() {
    let allTasks = [];
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks.forEach(task => {
                allTasks.push({ ...task, projectName: project.name, projectId: project.id, projectColorTheme: project.colorTheme });
            });
        }
    });
    return allTasks;
}

function getOrderedGlobalTasks() {
    const allTasks = getAllTasks();
    const taskMap = new Map();
    allTasks.forEach(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        taskMap.set(uniqueId, task);
    });
    
    const topThreeTasks = globalTaskOrder.topThree
        .map(id => taskMap.get(id))
        .filter(task => task && !task.completed)
        .slice(0, 3);
    
    const otherTaskIds = new Set(globalTaskOrder.other);
    const topThreeIds = new Set(globalTaskOrder.topThree.slice(0, 3));
    
    const otherTasks = [];
    globalTaskOrder.other.forEach(id => {
        const task = taskMap.get(id);
        if (task && !topThreeIds.has(id)) otherTasks.push(task);
    });
    
    allTasks.forEach(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        if (!topThreeIds.has(uniqueId) && !otherTaskIds.has(uniqueId)) otherTasks.push(task);
    });
    
    return { topThree: topThreeTasks, other: sortTasksWithCompletedAtBottom(otherTasks) };
}

function createTaskUniqueId(projectId, taskId) {
    return `${projectId}-${taskId}`;
}

function sortTasksWithCompletedAtBottom(tasks) {
    return [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const aOrder = a.order !== undefined ? a.order : 0;
        const bOrder = b.order !== undefined ? b.order : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

function renderGlobalTasks() {
    const { topThree, other } = getOrderedGlobalTasks();
    renderTaskSection('topThreeTasks', topThree, true);
    renderTaskSection('otherTasks', other, false);
}

function renderTaskSection(containerId, tasks, isTopThree) {
    const container = getEl(containerId);
    if (!container) return;
    
    if (tasks.length === 0) {
        const message = isTopThree ? 'Drop your most important tasks here' : 'All other tasks appear here';
        container.innerHTML = `<div class="task-drop-zone" style="border: 2px dashed #d1d5db; border-radius: 8px; padding: 40px; text-align: center; color: #6b7280; background: #f9fafb; margin: 8px 0;"><div style="font-size: 14px; margin-bottom: 4px;">${message}</div><div style="font-size: 12px; opacity: 0.7;">Drag tasks here to organize</div></div>`;
        container.className = 'task-drop-zone';
        return;
    }
    
    container.className = '';
    container.innerHTML = tasks.map(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        
        let linkColor = '#10b981';
        if (hasSource) {
            const project = projects.find(p => p.id == task.projectId);
            if (project) {
                let sourceItem = null;
                switch(task.sourceItemType) {
                    case 'brief': sourceItem = project.briefs?.find(b => b.id === task.sourceItemId); break;
                    case 'note': 
                        sourceItem = project.notes?.find(n => n.id === task.sourceItemId);
                        if (sourceItem?.linkedBriefId) {
                            const brief = project.briefs?.find(b => b.id === sourceItem.linkedBriefId);
                            linkColor = brief?.linkColor || linkColor;
                        }
                        break;
                    case 'copy':
                        sourceItem = project.copy?.find(c => c.id === task.sourceItemId);
                        if (sourceItem?.linkedBriefId) {
                            const brief = project.briefs?.find(b => b.id === sourceItem.linkedBriefId);
                            linkColor = brief?.linkColor || linkColor;
                        }
                        break;
                }
                if (sourceItem && task.sourceItemType === 'brief') linkColor = sourceItem.linkColor || linkColor;
            }
        }
        
        return `<div class="global-task-item ${isTopThree ? 'top-three-task' : ''}" draggable="true" data-unique-id="${uniqueId}" data-project-id="${task.projectId}" data-task-id="${task.id}" ondragstart="handleGlobalTaskDragStart(event)" ondragend="handleGlobalTaskDragEnd(event)" ondblclick="openGlobalTaskSource('${task.projectId}', '${task.id}')" style="background: white; border: 1px solid #e5e5e5; border-left: 3px solid ${linkColor}; border-radius: 4px; margin-bottom: 12px; padding: 0px; position: relative; cursor: grab; transition: all 0.2s ease; ${task.completed ? 'opacity: 0.6;' : ''} ${isTopThree ? 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);' : ''}">
            <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; align-items: center;">
                <div style="background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">${isTopThree ? 'Priority' : 'Task'}</div>
                ${!isTopThree ? `<button onclick="event.stopPropagation(); promoteToTopThree('${task.projectId}', '${task.id}')" style="background: #3b82f6; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer; font-weight: 600;" title="Add to Top 3">★</button>` : `<button onclick="event.stopPropagation(); removeTaskFromTopThree('${task.projectId}', '${task.id}')" style="background: #6b7280; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;" title="Remove from Top 3">×</button>`}
            </div>
            <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                <div style="background-color: transparent; border: none; margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); toggleGlobalTask('${task.projectId}', '${task.id}')" style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                </div>
                <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px; padding-right: 80px;">
                    <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                </div>
            </div>
            <div style="position: absolute; left: 8px; top: 16px;"><div class="grab-handle"></div></div>
            <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; padding-right: 80px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                <span class="global-task-project project-theme-${task.projectColorTheme || 'blue'}">${task.projectName}</span>
                Created: ${formatDate(task.createdAt)}
                ${hasSource ? ` • Has source` : ''}
                ${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
            </div>
            ${task.content ? `<div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; padding-right: 80px; ${task.completed ? 'text-decoration: line-through;' : ''}">${truncateContent(task.content)}</div>` : ''}
            <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span>${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to reorder</span>
                <div style="display: flex; gap: 8px;">
                    ${canDiveIn ? `<span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToGlobalSource('${task.projectId}', '${task.id}')" title="Open in focus mode with Pomodoro">Dive In</span>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

function addTaskToTopThree(projectId, taskId) {
    const uniqueId = createTaskUniqueId(projectId, taskId);
    globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    if (globalTaskOrder.topThree.length >= 3) {
        const lastTopThree = globalTaskOrder.topThree.pop();
        globalTaskOrder.other.unshift(lastTopThree);
    }
    globalTaskOrder.topThree.push(uniqueId);
    saveGlobalTaskOrder();
    renderGlobalTasks();
    showNotification('Task added to Top 3');
}

function removeTaskFromTopThree(projectId, taskId) {
    const uniqueId = createTaskUniqueId(projectId, taskId);
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    if (!globalTaskOrder.other.includes(uniqueId)) globalTaskOrder.other.unshift(uniqueId);
    saveGlobalTaskOrder();
    renderGlobalTasks();
    showNotification('Task removed from Top 3');
}

function promoteToTopThree(projectId, taskId) {
    const task = getAllTasks().find(t => t.projectId == projectId && t.id == taskId && !t.completed);
    if (!task) {
        showNotification('Task not found or is completed');
        return;
    }
    addTaskToTopThree(projectId, taskId);
}

function toggleGlobalTask(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (project) {
        const task = project.tasks.find(t => t.id == taskId);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = getCurrentTimestamp();
                const uniqueId = createTaskUniqueId(projectId, taskId);
                globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
                globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
                saveGlobalTaskOrder();
            } else {
                delete task.completedAt;
            }
            saveProjects();
            setTimeout(() => renderGlobalTasks(), 100);
            if (currentProject && currentProject.id == projectId) renderProjectTasks();
        }
    }
}

function openGlobalTaskSource(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    currentProject = project;
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    if (project.colorTheme) dashboard.classList.add(`project-theme-${project.colorTheme}`);
    dashboard.classList.add('project-themed');
    
    renderProject();
    setTimeout(() => {
        if (task.sourceItemId && task.sourceItemType) {
            openTaskSource(taskId);
        } else {
            openItemEditor(task, 'task');
        }
    }, 200);
}

function diveInToGlobalSource(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    if (!task.sourceItemId || !task.sourceItemType || (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    currentProject = project;
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    if (project.colorTheme) dashboard.classList.add(`project-theme-${project.colorTheme}`);
    dashboard.classList.add('project-themed');
    
    renderProject();
    setTimeout(() => {
        let sourceItem = null;
        switch(task.sourceItemType) {
            case 'note': sourceItem = project.notes.find(n => n.id === task.sourceItemId); break;
            case 'copy': sourceItem = project.copy.find(c => c.id === task.sourceItemId); break;
        }
        
        if (sourceItem) {
            openItemEditor(sourceItem, task.sourceItemType);
            setTimeout(() => {
                if (pomodoroIsBreak) {
                    pomodoroIsBreak = false;
                    pomodoroTimeLeft = 25 * 60;
                    updatePomodoroDisplay();
                    updatePomodoroStatus();
                }
                if (!pomodoroIsRunning) startPomodoro();
                showNotification(`Diving into "${sourceItem.title}" - Focus mode activated!`);
            }, 300);
        } else {
            showNotification('Source item not found');
        }
    }, 200);
}

function handleGlobalTaskDragStart(event) {
    const taskElement = event.currentTarget;
    const uniqueId = taskElement.getAttribute('data-unique-id');
    const projectId = taskElement.getAttribute('data-project-id');
    const taskId = taskElement.getAttribute('data-task-id');
    
    draggedGlobalTask = { uniqueId, projectId, taskId };
    taskElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
}

function handleGlobalTaskDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    draggedGlobalTask = null;
}

function setupTopTasksDropZones() {
    const topThreeContainer = getEl('topThreeTasks');
    const otherTasksContainer = getEl('otherTasks');
    
    if (topThreeContainer) {
        topThreeContainer.addEventListener('dragover', handleTaskDragOver);
        topThreeContainer.addEventListener('dragleave', handleTaskDragLeave);
        topThreeContainer.addEventListener('drop', (e) => handleTaskDrop(e, 'top-three'));
    }
    
    if (otherTasksContainer) {
        otherTasksContainer.addEventListener('dragover', handleTaskDragOver);
        otherTasksContainer.addEventListener('dragleave', handleTaskDragLeave);
        otherTasksContainer.addEventListener('drop', (e) => handleTaskDrop(e, 'other'));
    }
}

function handleTaskDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
    }
}

function handleTaskDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

function handleTaskDrop(event, targetSection) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!draggedGlobalTask) return;
    
    const { uniqueId } = draggedGlobalTask;
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
    
    if (targetSection === 'top-three') {
        if (globalTaskOrder.topThree.length >= 3) {
            const lastTopThree = globalTaskOrder.topThree.pop();
            globalTaskOrder.other.unshift(lastTopThree);
        }
        globalTaskOrder.topThree.push(uniqueId);
    } else {
        globalTaskOrder.other.push(uniqueId);
    }
    
    saveGlobalTaskOrder();
    renderGlobalTasks();
    showNotification(`Task moved to ${targetSection === 'top-three' ? 'Top 3' : 'Other Tasks'}`);
}

function saveGlobalTaskOrder() {
    saveToStorage('globalTaskOrder', globalTaskOrder);
}

function loadGlobalTaskOrder() {
    const saved = loadFromStorage('globalTaskOrder');
    if (saved) globalTaskOrder = { topThree: [], other: [], ...saved };
}

function cleanupGlobalTaskOrder() {
    const allTasks = getAllTasks();
    const validTaskIds = new Set(allTasks.map(task => createTaskUniqueId(task.projectId, task.id)));
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => validTaskIds.has(id));
    globalTaskOrder.other = globalTaskOrder.other.filter(id => validTaskIds.has(id));
    saveGlobalTaskOrder();
}

function autoPopulateTopThree() {
    if (globalTaskOrder.topThree.length === 0) {
        const allTasks = getAllTasks().filter(task => !task.completed);
        allTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const tasksToAdd = allTasks.slice(0, 3);
        tasksToAdd.forEach(task => {
            const uniqueId = createTaskUniqueId(task.projectId, task.id);
            globalTaskOrder.topThree.push(uniqueId);
        });
        saveGlobalTaskOrder();
    }
}

function cleanupOldCompletedTasks() {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    let hasChanges = false;
    
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            const originalLength = project.tasks.length;
            project.tasks = project.tasks.filter(task => {
                if (task.completed && task.completedAt) {
                    const completedTime = new Date(task.completedAt).getTime();
                    return completedTime > twentyFourHoursAgo;
                }
                return true;
            });
            if (project.tasks.length !== originalLength) hasChanges = true;
        }
    });
    
    if (hasChanges) {
        saveProjects();
        cleanupGlobalTaskOrder();
    }
}

// ===== DOCUMENT UPLOAD =====
function setupDocumentUpload() {
    const briefFields = getEl('briefFields');
    if (!briefFields) return;
    
    const existingUploadZone = briefFields.querySelector('.document-upload-zone');
    if (existingUploadZone) return;
    
    const clientBriefField = getEl('editorClientBrief');
    if (!clientBriefField) return;
    
    const uploadZone = document.createElement('div');
    uploadZone.className = 'document-upload-zone';
    uploadZone.style.cssText = 'border: 2px dashed #d1d5db; border-radius: 8px; padding: 20px; margin-bottom: 10px; text-align: center; color: #6b7280; background: #f9fafb; cursor: pointer; transition: all 0.2s ease;';
    
    const isLibraryAvailable = mammothLibrary !== null;
    uploadZone.innerHTML = `<div style="font-size: 14px; margin-bottom: 4px;">📄 ${isLibraryAvailable ? 'Drop Word document here' : 'Document upload'}</div><div style="font-size: 12px; opacity: 0.7;">${isLibraryAvailable ? 'Or click to browse files (.docx)' : 'Feature requires document processing library'}</div>${isLibraryAvailable ? '<input type="file" accept=".docx,.doc" style="display: none;" class="docx-file-input">' : ''}`;
    
    if (!isLibraryAvailable) {
        uploadZone.style.opacity = '0.5';
        uploadZone.style.cursor = 'not-allowed';
        uploadZone.title = 'Document processing not available in this environment';
        clientBriefField.parentNode.insertBefore(uploadZone, clientBriefField);
        return;
    }
    
    clientBriefField.parentNode.insertBefore(uploadZone, clientBriefField);
    const fileInput = uploadZone.querySelector('.docx-file-input');
    
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) processWordDocument(file); });
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#3b82f6';
        uploadZone.style.background = '#eff6ff';
    });
    
    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#d1d5db';
        uploadZone.style.background = '#f9fafb';
    });
    
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#d1d5db';
        uploadZone.style.background = '#f9fafb';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
                processWordDocument(file);
            } else {
                showNotification('Please select a .docx or .doc file');
            }
        }
    });
}

async function processWordDocument(file) {
    try {
        showNotification('Processing document...');
        if (!mammothLibrary) throw new Error('Document processing library not available');
        
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammothLibrary.convertToHtml({arrayBuffer: arrayBuffer});
        
        if (result.value && result.value.trim()) {
            const cleanedHtml = cleanupDocumentHtml(result.value);
            const clientBriefField = getEl('editorClientBrief');
            if (clientBriefField) {
                clientBriefField.innerHTML = cleanedHtml;
                debouncedAutosave();
                const textLength = htmlToText(cleanedHtml).length;
                showNotification(`Document imported successfully! (${Math.round(textLength / 1000)}k characters)`);
            }
        } else {
            showNotification('No content found in document');
        }
    } catch (error) {
        let errorMessage = 'Error processing document. ';
        if (error.message.includes('not available')) {
            errorMessage += 'Document processing feature is not available.';
        } else {
            errorMessage += 'Please try again or use copy/paste instead.';
        }
        showNotification(errorMessage);
        setTimeout(() => showNotification('Tip: You can also copy text from Word and paste it directly into the field'), 3000);
    }
}

function cleanupDocumentHtml(html) {
    if (!html) return '';
    return html
        .replace(/<p>\s*<\/p>/g, '')
        .replace(/<p><br\s*\/?><\/p>/g, '')
        .replace(/(<br\s*\/?>){3,}/g, '<br><br>')
        .replace(/>\s+</g, '><')
        .replace(/(<\/p>)\s*(<p>)/g, '$1$2')
        .replace(/<p>\s+/g, '<p>')
        .replace(/\s+<\/p>/g, '</p>')
        .replace(/(<\/li>)\s*(<li>)/g, '$1$2')
        .replace(/(<\/ul>)\s*(<ul>)/g, '$1$2')
        .replace(/(<\/ol>)\s*(<ol>)/g, '$1$2')
        .replace(/<li>\s*<\/li>/g, '')
        .trim();
}

// ===== BREADCRUMBS =====
function addToBreadcrumbs(projectId, itemId, itemType, title) {
    const breadcrumbId = `${projectId}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    workContext.breadcrumbs.push({
        id: breadcrumbId,
        projectId: projectId,
        itemId: itemId,
        itemType: itemType,
        title: title,
        timestamp: Date.now()
    });
    
    const maxBreadcrumbs = calculateMaxBreadcrumbs();
    if (workContext.breadcrumbs.length > maxBreadcrumbs) {
        workContext.breadcrumbs = workContext.breadcrumbs.slice(-maxBreadcrumbs);
    }
    
    saveBreadcrumbs();
    renderBreadcrumbs();
}

function calculateMaxBreadcrumbs() {
    const container = getEl('breadcrumbContainer');
    if (!container) return 5;
    const containerWidth = container.offsetWidth || 800;
    const availableWidth = containerWidth - 100;
    const maxItems = Math.floor(availableWidth / 140);
    return Math.max(3, Math.min(maxItems, 8));
}

function renderBreadcrumbs() {
    const container = getEl('breadcrumbContainer');
    const trail = getEl('breadcrumbTrail');
    
    if (!container || !trail) return;
    
    if (workContext.breadcrumbs.length === 0) {
        setDisplay('breadcrumbContainer', 'none');
        return;
    }
    
    setDisplay('breadcrumbContainer', 'block');
    
    const breadcrumbsHtml = workContext.breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === workContext.breadcrumbs.length - 1;
        const project = projects.find(p => p.id == breadcrumb.projectId);
        const projectName = project ? project.name : 'Unknown Project';
        
        return `<div class="breadcrumb-item ${isLast ? 'current' : ''}" onclick="navigateToBreadcrumb('${breadcrumb.id}')" title="${projectName} > ${breadcrumb.title}" style="padding: 4px 8px; background: ${isLast ? '#f3f4f6' : 'white'}; border: 1px solid #e5e7eb; border-radius: 4px; cursor: pointer; white-space: nowrap; max-width: 120px; overflow: hidden; text-overflow: ellipsis; font-size: 12px;"><span style="color: #a3a3a3; font-size: 10px; text-transform: uppercase;">${breadcrumb.itemType}</span><span style="display: block; font-weight: ${isLast ? '600' : '400'};">${breadcrumb.title}</span></div>${!isLast ? '<div class="breadcrumb-separator" style="color: #9ca3af; font-size: 12px; padding: 0 4px;">›</div>' : ''}`;
    }).join('');
    
    setHTML('breadcrumbTrail', `<div style="display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden;">${breadcrumbsHtml}<button class="breadcrumb-clear" onclick="clearBreadcrumbs()" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; margin-left: 8px; flex-shrink: 0;" title="Clear trail">Clear</button></div>`);
}

function navigateToBreadcrumb(breadcrumbId) {
    const breadcrumb = workContext.breadcrumbs.find(b => b.id === breadcrumbId);
    if (!breadcrumb) return;
    
    const project = projects.find(p => p.id == breadcrumb.projectId);
    if (!project) return;
    
    if (!currentProject || currentProject.id != breadcrumb.projectId) {
        switchToProject(breadcrumb.projectId, () => {
            setTimeout(() => openItemWithContext(breadcrumb.itemId, breadcrumb.itemType), 200);
        });
    } else {
        openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
    }
}

function clearBreadcrumbs() {
    workContext.breadcrumbs = [];
    saveBreadcrumbs();
    renderBreadcrumbs();
}

// ===== CONFIRMATION MODAL =====
function showConfirm(title, message, callback, data = null) {
    setContent('confirmTitle', title);
    setContent('confirmMessage', message);
    setDisplay('confirmModal', 'block');
    confirmCallback = callback;
    confirmData = data;
}

function proceedConfirm() {
    setDisplay('confirmModal', 'none');
    if (confirmCallback) confirmCallback(confirmData);
    confirmCallback = null;
    confirmData = null;
}

function cancelConfirm() {
    setDisplay('confirmModal', 'none');
    confirmCallback = null;
    confirmData = null;
}

// ===== DELETE FUNCTIONS =====
function deleteBrief(briefId) {
    showConfirm('Delete Brief', 'Are you sure you want to delete this brief? Any linked notes and copy will remain but lose their connection to this brief.', (id) => {
        const parsedId = parseInt(id);
        currentProject.briefs = currentProject.briefs.filter(item => item.id !== parsedId);
        
        currentProject.notes.forEach(note => {
            if (note.linkedBriefId === parsedId) delete note.linkedBriefId;
        });
        
        currentProject.copy.forEach(copy => {
            if (copy.linkedBriefId === parsedId) delete copy.linkedBriefId;
        });
        
        removeLinkedTasks('brief', parsedId);
        removeFromBreadcrumbs('brief', parsedId);
        saveProjects();
        renderBriefs();
        renderNotes();
        renderCopy();
        renderProjectTasks();
        renderGlobalTasks();
        showNotification('Brief deleted. Linked notes and copy preserved but unlinked.');
    }, briefId);
}

function deleteNote(noteId) {
    showConfirm('Delete Note', 'Are you sure you want to delete this note? This will also remove any linked tasks.', (id) => {
        const parsedId = parseInt(id);
        currentProject.notes = currentProject.notes.filter(item => item.id !== parsedId);
        removeLinkedTasks('note', parsedId);
        removeFromBreadcrumbs('note', parsedId);
        saveProjects();
        renderNotes();
        renderProjectTasks();
        renderGlobalTasks();
        showNotification('Note and linked tasks deleted successfully');
    }, noteId);
}

function deleteCopy(copyId) {
    showConfirm('Delete Copy', 'Are you sure you want to delete this copy? This will also remove any linked tasks.', (id) => {
        const parsedId = parseInt(id);
        currentProject.copy = currentProject.copy.filter(item => item.id !== parsedId);
        removeLinkedTasks('copy', parsedId);
        removeFromBreadcrumbs('copy', parsedId);
        saveProjects();
        renderCopy();
        renderProjectTasks();
        renderGlobalTasks();
        showNotification('Copy and linked tasks deleted successfully');
    }, copyId);
}

function removeLinkedTasks(sourceType, sourceId) {
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks = project.tasks.filter(task => !(task.sourceItemType === sourceType && task.sourceItemId === sourceId));
        }
    });
    cleanupGlobalTaskOrder();
}

function removeFromBreadcrumbs(itemType, itemId) {
    const breadcrumbId = `${currentProject.id}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    saveBreadcrumbs();
    renderBreadcrumbs();
}

// ===== DRAG AND DROP =====
function handleDragStart(event) {
    try {
        const itemElement = event.currentTarget;
        const itemDataString = itemElement.getAttribute('data-item');
        const itemType = itemElement.getAttribute('data-type');
        
        if (!itemDataString || !itemType) {
            event.preventDefault();
            return false;
        }
        
        let itemData;
        try {
            itemData = JSON.parse(itemDataString);
        } catch (parseError) {
            event.preventDefault();
            return false;
        }
        
        if (!itemData.id || !itemData.title) {
            event.preventDefault();
            return false;
        }
        
        draggedItem = itemData;
        draggedItemType = itemType;
        
        itemElement.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', '');
        return true;
    } catch (error) {
        event.preventDefault();
        return false;
    }
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    document.querySelectorAll('.drop-position-indicator').forEach(indicator => indicator.remove());
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
    }
    if (draggedItem && draggedItemType) showDropPositionIndicator(event);
}

function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
        document.querySelectorAll('.drop-position-indicator').forEach(indicator => indicator.remove());
    }
}

function handleDrop(event, targetType) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedItem || !draggedItemType) return;
    
    if (draggedItemType === 'task' && (targetType === 'brief' || targetType === 'note' || targetType === 'copy')) {
        showNotification('Tasks cannot be converted to briefs, notes, or copy. Tasks can only be reordered within the task column.');
        draggedItem = null;
        draggedItemType = null;
        return;
    }
    
    if (draggedItemType === targetType) {
        reorderItemInColumn(draggedItem, draggedItemType, event);
        draggedItem = null;
        draggedItemType = null;
        return;
    }
    
    if ((draggedItemType === 'note' && targetType === 'copy') || (draggedItemType === 'copy' && targetType === 'note')) {
        moveItemBetweenColumns(draggedItem, draggedItemType, targetType);
        draggedItem = null;
        draggedItemType = null;
        return;
    }
    
    createItemFromDrop(draggedItem, draggedItemType, targetType);
    draggedItem = null;
    draggedItemType = null;
}

function setupProjectDropZones() {
    setTimeout(() => {
        const columns = [
            { element: getEl('briefsColumn'), type: 'brief', message: 'Drop here to create brief' },
            { element: getEl('notesColumn'), type: 'note', message: 'Drop here to create note' },
            { element: getEl('copyColumn'), type: 'copy', message: 'Drop here to create copy' },
            { element: getEl('tasksColumn'), type: 'task', message: 'Drop here to create task' }
        ];
        
        columns.forEach(({ element, type, message }) => {
            if (element) {
                const elementId = element.id || `${type}-column`;
                if (!elementsWithListeners.has(elementId)) {
                    element.setAttribute('data-drop-type', type);
                    element.setAttribute('data-drop-message', message);
                    
                    const boundDragOver = handleColumnDragOver.bind(null);
                    const boundDragLeave = handleColumnDragLeave.bind(null);
                    const boundDrop = handleColumnDrop.bind(null);
                    
                    element._dropHandlers = {
                        dragover: boundDragOver,
                        dragleave: boundDragLeave,
                        drop: boundDrop
                    };
                    
                    element.addEventListener('dragover', boundDragOver);
                    element.addEventListener('dragleave', boundDragLeave);
                    element.addEventListener('drop', boundDrop);
                    
                    elementsWithListeners.add(elementId);
                }
            }
        });
    }, 50);
}

function cleanupProjectDropZones() {
    const columns = ['briefsColumn', 'notesColumn', 'copyColumn', 'tasksColumn'];
    columns.forEach(columnId => {
        const element = getEl(columnId);
        if (element && element._dropHandlers) {
            element.removeEventListener('dragover', element._dropHandlers.dragover);
            element.removeEventListener('dragleave', element._dropHandlers.dragleave);
            element.removeEventListener('drop', element._dropHandlers.drop);
            delete element._dropHandlers;
            elementsWithListeners.delete(columnId);
        }
    });
}

function handleColumnDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
    }
    if (draggedItem && draggedItemType) showDropPositionIndicator(event);
}

function handleColumnDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
        document.querySelectorAll('.drop-position-indicator').forEach(indicator => indicator.remove());
    }
}

function handleColumnDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    const targetType = event.currentTarget.getAttribute('data-drop-type');
    document.querySelectorAll('.drop-position-indicator').forEach(indicator => indicator.remove());
    handleDrop(event, targetType);
}

function reorderItemInColumn(item, itemType, event) {
    if (!currentProject) return;
    
    const dropTarget = event.currentTarget;
    const targetPosition = calculateDropPosition(dropTarget, event, itemType);
    
    let itemArray;
    switch(itemType) {
        case 'brief': itemArray = currentProject.briefs; break;
        case 'note': itemArray = currentProject.notes; break;
        case 'copy': itemArray = currentProject.copy; break;
        case 'task': itemArray = currentProject.tasks; break;
        default: return;
    }
    
    const currentIndex = itemArray.findIndex(arrayItem => arrayItem.id === item.id);
    if (currentIndex === -1) return;
    
    let newPosition;
    if (targetPosition === 'top') {
        newPosition = 0;
    } else if (targetPosition === 'bottom') {
        newPosition = itemArray.length - 1;
    } else if (typeof targetPosition === 'number') {
        newPosition = Math.max(0, Math.min(targetPosition, itemArray.length - 1));
    } else {
        newPosition = currentIndex;
    }
    
    if (currentIndex === newPosition) return;
    
    const movedItem = itemArray.splice(currentIndex, 1)[0];
    itemArray.splice(newPosition, 0, movedItem);
    
    itemArray.forEach((arrayItem, index) => {
        arrayItem.order = index;
    });
    
    saveProjects();
    
    switch(itemType) {
        case 'brief': renderBriefs(); break;
        case 'note': renderNotes(); break;
        case 'copy': renderCopy(); break;
        case 'task': renderProjectTasks(); break;
    }
    
    showNotification(`Reordered "${item.title}" in ${itemType}s`);
}

function calculateDropPosition(dropTarget, event, itemType) {
    let container;
    switch(itemType) {
        case 'brief': container = getEl('briefsList'); break;
        case 'note': container = getEl('notesList'); break;
        case 'copy': container = getEl('copyList'); break;
        case 'task': container = getEl('projectTaskContainer'); break;
        default: return 'bottom';
    }
    
    if (!container) return 'bottom';
    
    const itemElements = Array.from(container.children).filter(child => 
        child.classList.contains('item') || 
        child.classList.contains('project-task-item') ||
        child.classList.contains('sortable-item')
    );
    
    if (itemElements.length === 0) return 0;
    
    const mouseY = event.clientY;
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    itemElements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = Math.abs(mouseY - elementCenter);
        
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });
    
    const closestElement = itemElements[closestIndex];
    const rect = closestElement.getBoundingClientRect();
    const elementCenter = rect.top + rect.height / 2;
    
    if (mouseY < elementCenter) {
        return closestIndex;
    } else {
        return closestIndex + 1;
    }
}

function showDropPositionIndicator(event) {
    document.querySelectorAll('.drop-position-indicator').forEach(indicator => indicator.remove());
    
    const targetType = event.currentTarget.getAttribute('data-drop-type') || event.currentTarget.closest('[data-drop-type]')?.getAttribute('data-drop-type');
    if (draggedItemType !== targetType) return;
    
    let container;
    switch(draggedItemType) {
        case 'brief': container = getEl('briefsList'); break;
        case 'note': container = getEl('notesList'); break;
        case 'copy': container = getEl('copyList'); break;
        case 'task': container = getEl('projectTaskContainer'); break;
        default: return;
    }
    
    if (!container) return;
    
    const position = calculateDropPosition(event.currentTarget, event, draggedItemType);
    const itemElements = Array.from(container.children).filter(child => 
        child.classList.contains('item') || 
        child.classList.contains('project-task-item') ||
        child.classList.contains('sortable-item')
    );
    
    const indicator = document.createElement('div');
    indicator.className = 'drop-position-indicator';
    indicator.style.cssText = 'height: 2px; background: #3b82f6; margin: 2px 0; border-radius: 1px; opacity: 0.8; position: relative; z-index: 1000;';
    
    if (typeof position === 'number' && position < itemElements.length) {
        container.insertBefore(indicator, itemElements[position]);
    } else {
        container.appendChild(indicator);
    }
}

function moveItemBetweenColumns(item, fromType, toType) {
    if (!currentProject) return;
    
    if (fromType === 'note') {
        currentProject.notes = currentProject.notes.filter(n => n.id !== item.id);
    } else if (fromType === 'copy') {
        currentProject.copy = currentProject.copy.filter(c => c.id !== item.id);
    }
    
    item.type = toType;
    item.order = 0;
    
    if (toType === 'note') {
        currentProject.notes.forEach(note => {
            if (note.order !== undefined) note.order += 1;
        });
        currentProject.notes.unshift(item);
        renderNotes();
        showNotification(`Moved "${item.title}" to Notes`);
    } else if (toType === 'copy') {
        currentProject.copy.forEach(copy => {
            if (copy.order !== undefined) copy.order += 1;
        });
        currentProject.copy.unshift(item);
        renderCopy();
        showNotification(`Moved "${item.title}" to Copy`);
    }
    
    if (fromType === 'note') {
        renderNotes();
    } else if (fromType === 'copy') {
        renderCopy();
    }
    
    saveProjects();
}

function createItemFromDrop(sourceItem, sourceType, targetType) {
    if (!currentProject) return;
    
    let content = '';
    let title = sourceItem.title;
    
    if (sourceType === 'brief') {
        if (targetType === 'task') {
            const proposition = sourceItem.proposition || '';
            const clientBrief = sourceItem.clientBrief || sourceItem.content || '';
            content = [proposition, clientBrief].filter(Boolean).join('\n\n');
        } else {
            content = '';
        }
    } else {
        content = sourceItem.content || '';
    }
    
    const newItem = {
        id: generateId(),
        title: title,
        content: content,
        type: targetType,
        createdAt: getCurrentTimestamp()
    };
    
    if (targetType === 'task') {
        if (sourceItem.id && sourceType) {
            const existingTaskIndex = currentProject.tasks.findIndex(task => 
                task.sourceItemId === sourceItem.id && task.sourceItemType === sourceType
            );
            if (existingTaskIndex !== -1) currentProject.tasks.splice(existingTaskIndex, 1);
        }
        
        newItem.completed = false;
        newItem.sourceItemId = sourceItem.id;
        newItem.sourceItemType = sourceType;
        newItem.order = 0;
        
        currentProject.tasks.forEach(task => {
            if (task.order !== undefined) task.order += 1;
        });
        
        currentProject.tasks.unshift(newItem);
        renderProjectTasks();
        showNotification(`Created task "${newItem.title}" from ${sourceType}`);
    } else if (sourceType === 'brief' && (targetType === 'note' || targetType === 'copy')) {
        newItem.linkedBriefId = sourceItem.id;
        newItem.title = `${sourceItem.title} - ${targetType}`;
        
        if (targetType === 'note' && sourceItem.proposition && sourceItem.proposition.trim()) {
            const propText = sourceItem.proposition.trim();
            newItem.richContent = `<p><strong>Prop:</strong> <em>${propText}</em></p><br><p></p>`;
            newItem.content = `Prop: ${propText}\n\n`;
        } else {
            newItem.content = '';
            newItem.richContent = '<p></p>';
        }
        
        if (targetType === 'note') {
            newItem.order = 0;
            currentProject.notes.forEach(note => {
                if (note.order !== undefined) note.order += 1;
            });
            currentProject.notes.unshift(newItem);
            renderNotes();
            showNotification(`Created linked note "${newItem.title}"`);
        } else {
            newItem.order = 0;
            currentProject.copy.forEach(copy => {
                if (copy.order !== undefined) copy.order += 1;
            });
            currentProject.copy.unshift(newItem);
            renderCopy();
            showNotification(`Created linked copy "${newItem.title}"`);
        }
    } else if (targetType === 'brief') {
        newItem = {
            id: generateId(),
            title: title,
            proposition: '',
            clientBrief: content,
            type: 'brief',
            linkColor: getNextLinkColor(),
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        currentProject.briefs.forEach(brief => {
            if (brief.order !== undefined) brief.order += 1;
        });
        currentProject.briefs.unshift(newItem);
        renderBriefs();
        showNotification(`Created brief "${newItem.title}" from ${sourceType}`);
    } else {
        if (targetType === 'note') {
            newItem.order = 0;
            currentProject.notes.forEach(note => {
                if (note.order !== undefined) note.order += 1;
            });
            currentProject.notes.unshift(newItem);
            renderNotes();
            showNotification(`Created note "${newItem.title}" from ${sourceType}`);
        } else if (targetType === 'copy') {
            newItem.order = 0;
            currentProject.copy.forEach(copy => {
                if (copy.order !== undefined) copy.order += 1;
            });
            currentProject.copy.unshift(newItem);
            renderCopy();
            showNotification(`Created copy "${newItem.title}" from ${sourceType}`);
        }
    }
    
    saveProjects();
}

// ===== CONTEXT PRESERVATION =====
function createContextState(projectId, itemId, itemType) {
    return {
        projectId: projectId,
        itemId: itemId,
        itemType: itemType,
        timestamp: Date.now(),
        editorState: null,
        cursorPosition: null,
        scrollPosition: null,
        title: null
    };
}

function openItemEditor(item, itemType) {
    if (!item) return;
    
    if (currentEditingItem) saveCurrentContext();
    
    let actualItem = null;
    if (currentProject) {
        switch(itemType) {
            case 'brief': actualItem = currentProject.briefs.find(b => b.id === item.id); break;
            case 'note': actualItem = currentProject.notes.find(n => n.id === item.id); break;
            case 'copy': actualItem = currentProject.copy.find(c => c.id === item.id); break;
            case 'task': actualItem = currentProject.tasks.find(t => t.id === item.id); break;
        }
    }
    
    currentEditingItem = actualItem || item;
    currentEditingType = itemType;
    hasUnsavedChanges = false;
    
    if (currentProject) addToBreadcrumbs(currentProject.id, currentEditingItem.id, itemType, currentEditingItem.title);
    
    setContent('editorTitle', `Edit ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`);
    setValue('editorItemTitle', currentEditingItem.title || '');
    
    const briefFields = getEl('briefFields');
    const standardFields = getEl('standardFields');
    const insertHeadingsBtn = getEl('insertHeadingsBtn');
    const copyToClipboardBtn = getEl('copyToClipboardBtn');
    const richEditor = getEl('richEditor');
    const textEditor = getEl('editorContent');
    
    if (itemType === 'brief') {
        setDisplay('briefFields', 'block');
        setDisplay('standardFields', 'none');
        
        setValue('editorProposition', currentEditingItem.proposition || '');
        
        const clientBriefField = getEl('editorClientBrief');
        if (clientBriefField) {
            clientBriefField.contentEditable = true;
            clientBriefField.style.cssText = 'min-height: 200px; border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; font-family: inherit; font-size: 14px; line-height: 1.5;';
            
            if (currentEditingItem.clientBriefRich) {
                clientBriefField.innerHTML = currentEditingItem.clientBriefRich;
            } else if (currentEditingItem.clientBrief) {
                clientBriefField.innerHTML = textToHtml(currentEditingItem.clientBrief);
            } else if (currentEditingItem.content) {
                clientBriefField.innerHTML = textToHtml(currentEditingItem.content);
            } else {
                clientBriefField.innerHTML = '<p></p>';
            }
        }
        
        setTimeout(() => setupDocumentUpload(), 100);
    } else {
        setDisplay('briefFields', 'none');
        setDisplay('standardFields', 'block');
        
        if (itemType === 'note' || itemType === 'copy') {
            setDisplay('richEditor', 'block');
            setDisplay('editorContent', 'none');
            if (currentEditingItem.richContent) {
                richEditor.innerHTML = currentEditingItem.richContent;
            } else {
                richEditor.innerHTML = textToHtml(currentEditingItem.content || '');
            }
        } else {
            setDisplay('richEditor', 'none');
            setDisplay('editorContent', 'block');
            setValue('editorContent', currentEditingItem.content || '');
        }
        
        if (insertHeadingsBtn) setDisplay('insertHeadingsBtn', itemType === 'note' ? 'inline-flex' : 'none');
        if (copyToClipboardBtn) setDisplay('copyToClipboardBtn', (itemType === 'note' || itemType === 'copy' || itemType === 'brief') ? 'inline-flex' : 'none');
    }
    
    setDisplay('itemEditor', 'block');
    
    const setupPomodoroTimer = () => {
        const pomodoroTimer = getEl('pomodoroTimer');
        if (itemType === 'note' || itemType === 'copy') {
            if (pomodoroTimer) {
                pomodoroTimer.style.display = 'flex';
                pomodoroTimer.style.visibility = 'visible';
                setTimeout(() => {
                    initializePomodoro();
                    updatePomodoroHeaderStyle();
                }, 50);
            }
        } else {
            if (pomodoroTimer) pomodoroTimer.style.display = 'none';
        }
    };
    
    setTimeout(setupPomodoroTimer, 50);
    
    setTimeout(() => {
        setupAutosaveListeners();
        updateAutosaveStatus('ready');
        
        const contextKey = `project-${currentProject.id}`;
        const existingContext = workContext.projectContexts.get(contextKey);
        if (existingContext && 
            existingContext.itemId == currentEditingItem.id && 
            existingContext.itemType == itemType &&
            existingContext.editorState) {
            
            setTimeout(() => {
                restoreEditorState(existingContext);
                showContextIndicator('Previous work state restored', true);
            }, 200);
        }
    }, 100);
}

function insertStandardHeadings() {
    const richEditor = getEl('richEditor');
    let proposition = '';
    
    if (currentEditingType === 'note' && currentEditingItem.linkedBriefId) {
        const linkedBrief = currentProject.briefs.find(b => b.id === currentEditingItem.linkedBriefId);
        if (linkedBrief && linkedBrief.proposition) proposition = linkedBrief.proposition;
    }
    
    const headingsHtml = `<h2>PROPOSITION</h2><p>${proposition}</p><br><h2>1: INSIGHT</h2><p><br></p><br><h2>2: IDEA</h2><p><br></p><br><h2>3: EXECUTION</h2><p><br></p>`;
    
    if (richEditor.style.display !== 'none') {
        richEditor.innerHTML = headingsHtml + richEditor.innerHTML;
        richEditor.focus();
    } else {
        const textarea = getEl('editorContent');
        const headings = `## PROPOSITION\n${proposition}\n\n## 1: INSIGHT\n\n\n## 2: IDEA\n\n\n## 3: EXECUTION\n\n\n`;
        textarea.value = headings + textarea.value;
        textarea.focus();
    }
}

function createProject() {
    const name = getValue('newProjectName');
    const description = getValue('newProjectDescription');
    
    if (name) {
        const project = {
            id: generateId(),
            name,
            description,
            briefs: [],
            notes: [],
            copy: [],
            tasks: [],
            createdAt: getCurrentTimestamp(),
            colorTheme: getNextColorTheme(),
            archived: false
        };
        
        if (window.pendingProjectImport) {
            const importData = window.pendingProjectImport;
            project.briefs = importData.briefs || [];
            project.notes = importData.notes || [];
            project.copy = importData.copy || [];
            window.pendingProjectImport = null;
        }
        
        projects.push(project);
        saveProjects();
        updateProjectSelector();
        closeModal('projectModal');
        
        setValue('newProjectName', '');
        setValue('newProjectDescription', '');
        clearProjectImportZone();
        
        renderProjectOverview();
        showNotification(`Project "${name}" created successfully!`);
    }
}

function setupProjectImportZone() {
    const projectModal = getEl('projectModal');
    if (!projectModal) return;
    
    const existingZone = projectModal.querySelector('.project-import-zone');
    if (existingZone) return;
    
    const formContainer = projectModal.querySelector('.modal-content') || projectModal;
    
    const importZone = document.createElement('div');
    importZone.className = 'project-import-zone';
    importZone.style.cssText = 'border: 2px dashed #d1d5db; border-radius: 8px; padding: 30px; margin: 20px 0; text-align: center; color: #6b7280; background: #f9fafb; cursor: pointer; transition: all 0.2s ease; position: relative;';
    
    const isLibraryAvailable = mammothLibrary !== null;
    importZone.innerHTML = `<div style="font-size: 16px; margin-bottom: 8px;">📄 ${isLibraryAvailable ? 'Import Project from Word Document' : 'Document import not available'}</div><div style="font-size: 13px; opacity: 0.8; margin-bottom: 12px;">${isLibraryAvailable ? 'Drop a .docx file here or click to browse' : 'Document processing library required'}</div><div style="font-size: 12px; opacity: 0.6;">The document will be analyzed and content will be organized into briefs, notes, and copy automatically</div>${isLibraryAvailable ? '<input type="file" accept=".docx,.doc" style="display: none;" class="project-import-input">' : ''}`;
    
    if (!isLibraryAvailable) {
        importZone.style.opacity = '0.5';
        importZone.style.cursor = 'not-allowed';
        importZone.title = 'Document processing not available in this environment';
    } else {
        const fileInput = importZone.querySelector('.project-import-input');
        
        importZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) processProjectImportDocument(file);
        });
        
        importZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            importZone.style.borderColor = '#3b82f6';
            importZone.style.background = '#eff6ff';
        });
        
        importZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            importZone.style.borderColor = '#d1d5db';
            importZone.style.background = '#f9fafb';
        });
        
        importZone.addEventListener('drop', (e) => {
            e.preventDefault();
            importZone.style.borderColor = '#d1d5db';
            importZone.style.background = '#f9fafb';
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
                    processProjectImportDocument(file);
                } else {
                    showNotification('Please select a .docx or .doc file');
                }
            }
        });
    }
    
    const descField = formContainer.querySelector('#newProjectDescription');
    if (descField && descField.parentNode) {
        descField.parentNode.insertBefore(importZone, descField.nextSibling);
    }
}

async function processProjectImportDocument(file) {
    try {
        showNotification('Analyzing document for project import...');
        
        if (!mammothLibrary) throw new Error('Document processing library not available');
        
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammothLibrary.convertToHtml({arrayBuffer: arrayBuffer});
        
        if (result.value && result.value.trim()) {
            const projectData = parseDocumentForProject(result.value, file.name);
            populateProjectForm(projectData);
            showNotification(`Document processed! Found ${projectData.briefs.length} potential briefs, ${projectData.notes.length} notes, and ${projectData.copy.length} copy items.`);
        } else {
            showNotification('No content found in document');
        }
    } catch (error) {
        showNotification('Error processing document. Please try again or create project manually.');
    }
}

function parseDocumentForProject(html, fileName) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    let projectName = fileName.replace(/\.(docx?|doc)$/i, '').replace(/[_-]/g, ' ');
    const firstHeading = tempDiv.querySelector('h1, h2, h3');
    if (firstHeading && firstHeading.textContent.trim()) {
        projectName = firstHeading.textContent.trim();
        firstHeading.remove();
    }
    
    const projectData = {
        name: projectName,
        description: 'Imported from Word document',
        briefs: [],
        notes: [],
        copy: []
    };
    
    const sections = extractDocumentSections(tempDiv);
    
    sections.forEach(section => {
        const category = categorizeSection(section);
        const item = {
            id: generateId(),
            title: section.title || 'Untitled',
            content: section.content || '',
            createdAt: getCurrentTimestamp(),
            order: 0
        };
        
        switch(category) {
            case 'brief':
                const briefParts = splitBriefContent(section.content);
                item.proposition = briefParts.proposition;
                item.clientBrief = briefParts.clientBrief;
                item.clientBriefRich = briefParts.clientBriefRich;
                item.linkColor = getNextLinkColor();
                item.type = 'brief';
                delete item.content;
                projectData.briefs.push(item);
                break;
                
            case 'note':
                item.richContent = section.richContent || textToHtml(section.content);
                item.type = 'note';
                projectData.notes.push(item);
                break;
                
            case 'copy':
                item.richContent = section.richContent || textToHtml(section.content);
                item.type = 'copy';
                projectData.copy.push(item);
                break;
        }
    });
    
    return projectData;
}

function extractDocumentSections(container) {
    const sections = [];
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    
    if (headings.length === 0) {
        const content = container.innerHTML.trim();
        const textContent = container.textContent.trim();
        if (textContent) {
            sections.push({
                title: 'Imported Content',
                content: htmlToText(content),
                richContent: content
            });
        }
        return sections;
    }
    
    headings.forEach((heading, index) => {
        const title = heading.textContent.trim();
        let content = '';
        let richContent = '';
        
        let currentElement = heading.nextElementSibling;
        const nextHeading = headings[index + 1];
        
        while (currentElement && currentElement !== nextHeading) {
            richContent += currentElement.outerHTML;
            content += currentElement.textContent + '\n';
            currentElement = currentElement.nextElementSibling;
        }
        
        if (title && (content.trim() || richContent.trim())) {
            sections.push({
                title: title,
                content: content.trim(),
                richContent: richContent.trim()
            });
        }
    });
    
    return sections;
}

function categorizeSection(section) {
    const title = section.title.toLowerCase();
    const content = section.content.toLowerCase();
    
    const briefKeywords = ['brief', 'proposal', 'proposition', 'project brief', 'creative brief', 'brand brief'];
    const noteKeywords = ['notes', 'research', 'insights', 'analysis', 'thinking', 'ideas', 'brainstorm'];
    const copyKeywords = ['copy', 'content', 'text', 'headline', 'tagline', 'script', 'writing'];
    
    if (briefKeywords.some(keyword => title.includes(keyword))) return 'brief';
    if (noteKeywords.some(keyword => title.includes(keyword))) return 'note';
    if (copyKeywords.some(keyword => title.includes(keyword))) return 'copy';
    
    if (content.includes('proposition') || content.includes('objective') || content.includes('target audience')) return 'brief';
    if (content.includes('insight') || content.includes('research') || content.includes('analysis')) return 'note';
    
    if (section.content.length < 500) {
        return 'copy';
    } else {
        return 'note';
    }
}

function splitBriefContent(content) {
    const lines = content.split('\n').filter(line => line.trim());
    let proposition = '';
    let clientBrief = '';
    
    const propMarkers = ['proposition:', 'prop:', 'objective:', 'goal:'];
    let propIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (propMarkers.some(marker => line.includes(marker))) {
            propIndex = i;
            break;
        }
    }
    
    if (propIndex >= 0) {
        const propLine = lines[propIndex];
        const colonIndex = propLine.indexOf(':');
        if (colonIndex >= 0) proposition = propLine.substring(colonIndex + 1).trim();
        
        const otherLines = [...lines.slice(0, propIndex), ...lines.slice(propIndex + 1)];
        clientBrief = otherLines.join('\n');
    } else {
        clientBrief = content;
    }
    
    return {
        proposition: proposition,
        clientBrief: clientBrief,
        clientBriefRich: textToHtml(clientBrief)
    };
}

function populateProjectForm(projectData) {
    setValue('newProjectName', projectData.name);
    setValue('newProjectDescription', projectData.description);
    window.pendingProjectImport = projectData;
    
    const importZone = document.querySelector('.project-import-zone');
    if (importZone) {
        importZone.style.borderColor = '#16a34a';
        importZone.style.background = '#f0fdf4';
        importZone.innerHTML = `<div style="color: #16a34a; font-size: 16px; margin-bottom: 8px;">✅ Document Imported Successfully!</div><div style="font-size: 13px; opacity: 0.8;">Found: ${projectData.briefs.length} briefs, ${projectData.notes.length} notes, ${projectData.copy.length} copy items</div><div style="font-size: 12px; opacity: 0.6; margin-top: 8px;">Click "Create Project" to proceed with the imported content</div>`;
    }
}

function clearProjectImportZone() {
    window.pendingProjectImport = null;
    
    const importZone = document.querySelector('.project-import-zone');
    if (importZone) {
        importZone.style.borderColor = '#d1d5db';
        importZone.style.background = '#f9fafb';
        
        const isLibraryAvailable = mammothLibrary !== null;
        importZone.innerHTML = `<div style="font-size: 16px; margin-bottom: 8px;">📄 ${isLibraryAvailable ? 'Import Project from Word Document' : 'Document import not available'}</div><div style="font-size: 13px; opacity: 0.8; margin-bottom: 12px;">${isLibraryAvailable ? 'Drop a .docx file here or click to browse' : 'Document processing library required'}</div><div style="font-size: 12px; opacity: 0.6;">The document will be analyzed and content will be organized into briefs, notes, and copy automatically</div>${isLibraryAvailable ? '<input type="file" accept=".docx,.doc" style="display: none;" class="project-import-input">' : ''}`;
    }
}

function addQuickBrief() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const title = getValue('briefTitle');
    if (title) {
        const linkColor = getNextLinkColor();
        
        const brief = {
            id: generateId(),
            title,
            proposition: '',
            clientBrief: '',
            type: 'brief',
            linkColor: linkColor,
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        
        currentProject.briefs.forEach(existingBrief => {
            if (existingBrief.order !== undefined) existingBrief.order += 1;
        });
        
        currentProject.briefs.unshift(brief);
        saveProjects();
        renderBriefs();
        setValue('briefTitle', '');
    }
}

function addQuickNote() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const title = getValue('noteTitle');
    if (title) {
        const note = {
            id: generateId(),
            title,
            content: '',
            type: 'note',
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        
        currentProject.notes.forEach(existingNote => {
            if (existingNote.order !== undefined) existingNote.order += 1;
        });
        
        currentProject.notes.unshift(note);
        saveProjects();
        renderNotes();
        setValue('noteTitle', '');
    }
}

function addQuickCopy() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const title = getValue('copyTitle');
    if (title) {
        const copy = {
            id: generateId(),
            title,
            content: '',
            type: 'copy',
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        
        currentProject.copy.forEach(existingCopy => {
            if (existingCopy.order !== undefined) existingCopy.order += 1;
        });
        
        currentProject.copy.unshift(copy);
        saveProjects();
        renderCopy();
        setValue('copyTitle', '');
    }
}

function addQuickTask() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const title = getValue('taskTitle');
    if (title) {
        const task = {
            id: generateId(),
            title,
            content: '',
            type: 'task',
            completed: false,
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        
        currentProject.tasks.forEach(existingTask => {
            if (existingTask.order !== undefined) existingTask.order += 1;
        });
        
        currentProject.tasks.unshift(task);
        saveProjects();
        renderProjectTasks();
        setValue('taskTitle', '');
    }
}

function handleEnterKey(event, type) {
    if (event.key === 'Enter') {
        switch(type) {
            case 'brief': addQuickBrief(); break;
            case 'note': addQuickNote(); break;
            case 'copy': addQuickCopy(); break;
            case 'task': addQuickTask(); break;
        }
    }
}

function renderProject() {
    if (!currentProject) return;
    
    cleanupProjectDropZones();
    renderBriefs();
    renderNotes();
    renderCopy();
    renderProjectTasks();
    
    setTimeout(() => {
        setupProjectDropZones();
        setTimeout(() => validateDropZones(), 100);
    }, 200);
}

function validateDropZones() {
    const columns = ['briefsColumn', 'notesColumn', 'copyColumn', 'tasksColumn'];
    let allValid = true;
    
    columns.forEach(columnId => {
        const element = getEl(columnId);
        if (element) {
            const hasDropType = element.hasAttribute('data-drop-type');
            const hasHandlers = element._dropHandlers ? true : false;
            
            if (!hasDropType || !hasHandlers) allValid = false;
        } else {
            allValid = false;
        }
    });
    
    if (!allValid) {
        setTimeout(() => {
            cleanupProjectDropZones();
            setupProjectDropZones();
        }, 100);
    }
}

function safeSerializeItem(item) {
    try {
        const cleanItem = {
            id: item.id,
            title: item.title || '',
            type: item.type || '',
            content: item.content || '',
            richContent: item.richContent || '',
            proposition: item.proposition || '',
            clientBrief: item.clientBrief || '',
            clientBriefRich: item.clientBriefRich || '',
            linkedBriefId: item.linkedBriefId || null,
            linkColor: item.linkColor || null,
            sourceItemId: item.sourceItemId || null,
            sourceItemType: item.sourceItemType || null,
            completed: item.completed || false,
            order: item.order || 0,
            createdAt: item.createdAt || getCurrentTimestamp()
        };
        
        const serialized = JSON.stringify(cleanItem);
        return serialized.replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    } catch (error) {
        return JSON.stringify({
            id: item.id || generateId(),
            title: item.title || 'Untitled',
            type: item.type || 'unknown'
        }).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    }
}

function renderProjectOverview() {
    const grid = getEl('projectGrid');
    if (!grid) return;
    
    if (!Array.isArray(projects)) projects = [];
    
    const visibleProjects = projects.filter(project => showArchived ? true : !project.archived);
    
    if (visibleProjects.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #a3a3a3;"><div style="font-size: 14px; margin-bottom: 8px;">No projects</div><div style="font-size: 12px; color: #d4d4d4;">Create your first project to get started</div></div>`;
    } else {
        grid.innerHTML = visibleProjects.map(project => {
            const totalTasks = (project.tasks && Array.isArray(project.tasks)) ? project.tasks.length : 0;
            const completedTasks = (project.tasks && Array.isArray(project.tasks)) ? project.tasks.filter(t => t && t.completed).length : 0;
            const colorTheme = project.colorTheme || 'blue';
            const briefsCount = (project.briefs && Array.isArray(project.briefs)) ? project.briefs.length : 0;
            const notesCount = (project.notes && Array.isArray(project.notes)) ? project.notes.length : 0;
            const copyCount = (project.copy && Array.isArray(project.copy)) ? project.copy.length : 0;
            
            return `<div class="project-card project-theme-${colorTheme} project-themed ${project.archived ? 'archived-project' : ''}" onclick="selectProject(${project.id})"><div class="project-title">${project.name || 'Untitled Project'}</div><div style="color: #737373; font-size: 14px; margin-bottom: 16px;">${project.description || 'No description'}</div><div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0;"><div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;"><div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${briefsCount}</div><div style="font-size: 12px; color: #737373;">Briefs</div></div><div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;"><div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${notesCount}</div><div style="font-size: 12px; color: #737373;">Notes</div></div><div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;"><div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${copyCount}</div><div style="font-size: 12px; color: #737373;">Copy</div></div><div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;"><div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${totalTasks}</div><div style="font-size: 12px; color: #737373;">Tasks</div></div></div><div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;"><div style="font-size: 12px; color: #737373;">Created: ${project.createdAt ? formatDate(project.createdAt) : 'Unknown'}</div><div style="display: flex; gap: 8px;"><button class="archive-btn" onclick="event.stopPropagation(); openProjectSettings(${project.id})" style="background: #171717;">Settings</button><button class="archive-btn" onclick="event.stopPropagation(); toggleArchiveProject(${project.id})">${project.archived ? 'Restore' : 'Archive'}</button></div></div></div>`;
        }).join('');
    
    setupDeleteListeners();
    }
}

function renderBriefs() {
    const list = getEl('briefsList');
    if (!list) return;
    
    if (!currentProject.briefs) currentProject.briefs = [];
    
    currentProject.briefs.forEach((brief, index) => {
        if (brief.order === undefined) brief.order = index;
        if (!brief.id) brief.id = generateId();
        if (!brief.title) brief.title = 'Untitled Brief';
        if (!brief.createdAt) brief.createdAt = getCurrentTimestamp();
    });
    
    const sortedBriefs = [...currentProject.briefs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    try {
        list.innerHTML = sortedBriefs.map(brief => {
            const linkedCount = getLinkedItemsCount(brief.id);
            
            if (!brief.linkColor) {
                brief.linkColor = getNextLinkColor();
                setTimeout(() => saveProjects(), 0);
            }
            
            const borderColor = brief.linkColor || '#a3a3a3';
            
            const proposition = brief.proposition || '';
            const clientBrief = brief.clientBrief || brief.content || '';
            const clientBriefRich = brief.clientBriefRich || '';
            const hasProposition = proposition.trim().length > 0;
            const hasClientBrief = clientBrief.trim().length > 0 || clientBriefRich.trim().length > 0;
            
            let clientBriefPreview = '';
            if (clientBriefRich && clientBriefRich.trim()) {
                clientBriefPreview = truncateContent(htmlToText(clientBriefRich), 120);
            } else if (clientBrief) {
                clientBriefPreview = truncateContent(clientBrief, 120);
            }
            
            const serializedBrief = safeSerializeItem(brief);
            
            return `<div class="item brief-item sortable-item ${linkedCount > 0 ? 'linked-item' : ''}" draggable="true" data-item="${serializedBrief}" data-type="brief" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)" ondblclick="openItemEditor(findItem('${brief.id}', 'brief'), 'brief')" style="border-left: 3px solid ${borderColor};"><div class="grab-handle"></div><div class="item-type type-brief">Brief</div><div class="item-header"><div class="item-title">${brief.title}</div></div><div class="item-meta">Created: ${formatDate(brief.createdAt)}${linkedCount > 0 ? ` • ${linkedCount} linked item${linkedCount > 1 ? 's' : ''}` : ''}${clientBriefRich ? ' • Rich text' : ''}</div>${hasProposition ? `<div style="margin: 8px 0; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; border-radius: 4px;"><div style="font-size: 11px; font-weight: 600; color: #0369a1; text-transform: uppercase; margin-bottom: 4px;">Proposition</div><div style="color: #525252; line-height: 1.4; font-size: 13px;">${truncateContent(proposition, 120)}</div></div>` : ''}${hasClientBrief ? `<div style="margin: 8px 0; padding: 8px; background: #fefce8; border-left: 3px solid #eab308; border-radius: 4px;"><div style="font-size: 11px; font-weight: 600; color: #a16207; text-transform: uppercase; margin-bottom: 4px;">Client Brief ${clientBriefRich ? '(Rich Text)' : ''}</div><div style="color: #525252; line-height: 1.4; font-size: 13px;">${clientBriefPreview}</div></div>` : ''}<div class="item-actions"><div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">Double-click to edit • Drag to create linked items</div><button class="delete-btn" data-delete-type="brief" data-delete-id="${brief.id}">×</button></div></div>`;
        }).join('');
    } catch (error) {
        list.innerHTML = '<div style="padding: 20px; color: #ef4444;">Error rendering briefs. Please refresh the page.</div>';
    }
}

function renderNotes() {
    const list = getEl('notesList');
    if (!currentProject.notes) currentProject.notes = [];
    
    currentProject.notes.forEach((note, index) => {
        if (note.order === undefined) note.order = index;
    });
    
    const sortedNotes = [...currentProject.notes].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedNotes.map(note => {
        const isLinked = note.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === note.linkedBriefId) : null;
        const linkColor = getLinkColor(note, 'note');
        const borderColor = linkColor || '#a3a3a3';
        
        return `<div class="item note-item sortable-item ${isLinked ? 'linked-item' : ''}" draggable="true" data-item='${JSON.stringify(note).replace(/'/g, '&#39;')}' data-type="note" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)" ondblclick="openItemEditor(findItem('${note.id}', 'note'), 'note')" style="border-left: 3px solid ${borderColor};"><div class="grab-handle"></div><div class="item-type type-note">Note</div><div class="item-header"><div class="item-title">${note.title}</div></div><div class="item-meta">Created: ${formatDate(note.createdAt)}${isLinked && linkedBrief ? ` • Linked to "${linkedBrief.title}"` : ''}</div>${note.content ? `<div style="margin: 8px 0; color: #525252; line-height: 1.4;">${truncateContent(note.content)}</div>` : ''}<div class="item-actions"><div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">Double-click to edit • Drag to create task</div><button class="delete-btn" data-delete-type="note" data-delete-id="${note.id}">×</button></div></div>`;
    }).join('');
}

function renderCopy() {
    const list = getEl('copyList');
    if (!currentProject.copy) currentProject.copy = [];
    
    currentProject.copy.forEach((copy, index) => {
        if (copy.order === undefined) copy.order = index;
    });
    
    const sortedCopy = [...currentProject.copy].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedCopy.map(copy => {
        const isLinked = copy.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === copy.linkedBriefId) : null;
        const linkColor = getLinkColor(copy, 'copy');
        const borderColor = linkColor || '#a3a3a3';
        
        return `<div class="item copy-item sortable-item ${isLinked ? 'linked-item' : ''}" draggable="true" data-item='${JSON.stringify(copy).replace(/'/g, '&#39;')}' data-type="copy" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)" ondblclick="openItemEditor(findItem('${copy.id}', 'copy'), 'copy')" style="border-left: 3px solid ${borderColor};"><div class="grab-handle"></div><div class="item-type type-copy">Copy</div><div class="item-header"><div class="item-title">${copy.title}</div></div><div class="item-meta">Created: ${formatDate(copy.createdAt)}${isLinked && linkedBrief ? ` • Linked to "${linkedBrief.title}"` : ''}</div>${copy.content ? `<div style="margin: 8px 0; color: #525252; line-height: 1.4;">${truncateContent(copy.content)}</div>` : ''}<div class="item-actions"><div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">Double-click to edit • Drag to create task</div><button class="delete-btn" data-delete-type="copy" data-delete-id="${copy.id}">×</button></div></div>`;
    }).join('');
}

function renderProjectTasks() {
    const container = getEl('projectTaskContainer');
    if (!container || !currentProject) return;
    
    if (!currentProject.tasks) currentProject.tasks = [];
    
    currentProject.tasks.forEach((task, index) => {
        if (task.order === undefined) task.order = index;
    });
    
    const sortedTasks = sortTasksWithCompletedAtBottom(currentProject.tasks);
    
    if (sortedTasks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #737373;">No tasks yet</div>';
        return;
    }
    
    container.innerHTML = sortedTasks.map(task => {
        const hasSource = task.sourceItemId && task.sourceItemType;
        let sourceItem = null;
        if (hasSource) {
            switch(task.sourceItemType) {
                case 'brief': sourceItem = currentProject.briefs.find(b => b.id === task.sourceItemId); break;
                case 'note': sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId); break;
                case 'copy': sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId); break;
            }
        }
        
        const linkColor = getLinkColor(task, 'task') || '#10b981';
        
        return `<div class="project-task-item" draggable="true" data-item='${JSON.stringify(task).replace(/'/g, '&#39;')}' data-type="task" ondragstart="handleDragStart(event)" ondragend="handleDragEnd(event)" ondblclick="openTaskSource('${task.id}')" style="background: white; border: 1px solid #e5e5e5; border-left: 3px solid ${linkColor}; border-radius: 4px; margin-bottom: 12px; padding: 0px; position: relative; cursor: grab; transition: all 0.2s ease; ${task.completed ? 'opacity: 0.6;' : ''}"><div style="position: absolute; top: 8px; right: 8px; background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Task</div><div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;"><div style="background-color: transparent; border: none; margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;"><input type="checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); toggleProjectTask('${task.id}')" style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;"></div><div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px;"><div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div></div></div><div style="position: absolute; left: 8px; top: 16px;"><div class="grab-handle"></div></div><div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">Created: ${formatDate(task.createdAt)}${hasSource && sourceItem ? ` • From: "${sourceItem.title}"` : ''}${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}</div>${task.content ? `<div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">${truncateContent(task.content)}</div>` : ''}<div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;"><span>${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to reorder within tasks</span><div style="display: flex; gap: 8px;">${hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy') ? `<span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToProjectSource('${task.id}')" title="Open in focus mode with Pomodoro">Dive In</span>` : ''}</div></div></div>`;
    }).join('');
}

function findItem(itemId, itemType) {
    if (!currentProject) return null;
    
    switch(itemType) {
        case 'brief': return currentProject.briefs.find(item => item.id == itemId);
        case 'note': return currentProject.notes.find(item => item.id == itemId);
        case 'copy': return currentProject.copy.find(item => item.id == itemId);
        case 'task': return currentProject.tasks.find(item => item.id == itemId);
        default: return null;
    }
}

function toggleProjectTask(taskId) {
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        if (task.completed) {
            task.completedAt = getCurrentTimestamp();
        } else {
            delete task.completedAt;
        }
        saveProjects();
        renderProjectTasks();
        renderGlobalTasks();
    }
}

function diveInToProjectSource(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    if (!task.sourceItemId || !task.sourceItemType || (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    let sourceItem = null;
    switch(task.sourceItemType) {
        case 'note': sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId); break;
        case 'copy': sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId); break;
    }
    
    if (sourceItem) {
        openItemEditor(sourceItem, task.sourceItemType);
        setTimeout(() => {
            if (pomodoroIsBreak) {
                pomodoroIsBreak = false;
                pomodoroTimeLeft = 25 * 60;
                updatePomodoroDisplay();
                updatePomodoroStatus();
            }
            if (!pomodoroIsRunning) startPomodoro();
            showNotification(`Diving into "${sourceItem.title}" - Focus mode activated!`);
        }, 300);
    } else {
        showNotification('Source item not found');
    }
}

function updateProjectSelector() {
    const select = getEl('projectSelect');
    const activeProjects = projects.filter(project => !project.archived);
    select.innerHTML = '<option value="">Select a project...</option>' +
        activeProjects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');
}

function updateSettingsButton() {
    const settingsBtn = getEl('projectSettingsBtn');
    const archiveBtn = getEl('archiveToggle');
    
    if (currentProject) {
        setDisplay('projectSettingsBtn', 'inline-block');
        setDisplay('archiveToggle', 'none');
    } else {
        setDisplay('projectSettingsBtn', 'none');
        setDisplay('archiveToggle', 'inline-block');
    }
}

function openProjectSettings(projectId) {
    const project = projectId ? projects.find(p => p.id === projectId) : currentProject;
    if (!project) return;
    
    setValue('settingsProjectName', project.name);
    setValue('settingsColorTheme', project.colorTheme || 'blue');
    setDisplay('projectSettingsModal', 'block');
    window.currentSettingsProject = project;
}

function saveProjectSettings() {
    const project = window.currentSettingsProject;
    if (!project) return;
    
    const newName = getValue('settingsProjectName');
    const newTheme = getValue('settingsColorTheme');
    
    if (newName) {
        project.name = newName;
        project.colorTheme = newTheme;
        
        saveProjects();
        updateProjectSelector();
        closeModal('projectSettingsModal');
        
        if (currentProject && currentProject.id === project.id) {
            const dashboard = getEl('dashboard');
            colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
            dashboard.classList.add(`project-theme-${newTheme}`);
        }
        
        renderProjectOverview();
        window.currentSettingsProject = null;
    }
}

function exportProjectAsWord() {
    const project = window.currentSettingsProject;
    if (!project) return;
    
    try {
        showNotification('Generating project export...');
        const projectHtml = generateProjectHtml(project);
        const blob = new Blob([projectHtml], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `${project.name.replace(/[^a-z0-9]/gi, '_')}_Export.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        showNotification('Project exported successfully!');
    } catch (error) {
        showNotification('Export failed. Please try again.');
    }
}

function generateProjectHtml(project) {
    const createdDate = project.createdAt ? formatDate(project.createdAt) : 'Unknown';
    
    const briefsCount = project.briefs ? project.briefs.length : 0;
    const notesCount = project.notes ? project.notes.length : 0;
    const copyCount = project.copy ? project.copy.length : 0;
    const totalTasks = project.tasks ? project.tasks.length : 0;
    const completedTasks = project.tasks ? project.tasks.filter(t => t.completed).length : 0;
    
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${project.name} - Project Export</title><style>body { font-family: Arial, sans-serif; line-height: 1.6; margin: 40px; } h1 { color: #333; border-bottom: 3px solid #007acc; padding-bottom: 10px; } h2 { color: #555; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 30px; } h3 { color: #666; margin-top: 25px; } .project-stats { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; } .item-section { margin: 20px 0; padding: 15px; border-left: 4px solid #007acc; background: #fafafa; } .proposition { background: #e8f4fd; padding: 10px; border-left: 3px solid #007acc; margin: 10px 0; } .client-brief { background: #fff9e6; padding: 10px; border-left: 3px solid #ffa500; margin: 10px 0; } .task-list { margin: 10px 0; } .task-item { margin: 5px 0; padding: 5px; background: white; border-left: 2px solid #28a745; } .task-completed { text-decoration: line-through; opacity: 0.7; } .linked-indicator { color: #007acc; font-style: italic; font-size: 0.9em; } .meta-info { color: #666; font-size: 0.9em; margin: 5px 0; } page-break-before: always;</style></head><body><h1>${project.name}</h1><div class="project-stats"><strong>Project Overview</strong><br>Created: ${createdDate}<br>Description: ${project.description || 'No description provided'}<br><br><strong>Content Summary:</strong><br>• ${briefsCount} Brief${briefsCount !== 1 ? 's' : ''}<br>• ${notesCount} Note${notesCount !== 1 ? 's' : ''}<br>• ${copyCount} Copy item${copyCount !== 1 ? 's' : ''}<br>• ${totalTasks} Task${totalTasks !== 1 ? 's' : ''} (${completedTasks} completed)<br></div>`;

    if (project.briefs && project.briefs.length > 0) {
        html += `<h2>Briefs (${project.briefs.length})</h2>`;
        
        project.briefs.forEach(brief => {
            const linkedItems = getLinkedItemsForBrief(project, brief.id);
            
            html += `<div class="item-section">`;
            html += `<h3>${brief.title}</h3>`;
            html += `<div class="meta-info">Created: ${formatDate(brief.createdAt)}</div>`;
            
            if (brief.proposition && brief.proposition.trim()) {
                html += `<div class="proposition"><strong>Proposition:</strong><br>${brief.proposition.replace(/\n/g, '<br>')}</div>`;
            }
            
            if (brief.clientBriefRich && brief.clientBriefRich.trim()) {
                html += `<div class="client-brief"><strong>Client Brief:</strong><br>${brief.clientBriefRich}</div>`;
            } else if (brief.clientBrief && brief.clientBrief.trim()) {
                html += `<div class="client-brief"><strong>Client Brief:</strong><br>${brief.clientBrief.replace(/\n/g, '<br>')}</div>`;
            }
            
            if (linkedItems.notes.length > 0 || linkedItems.copy.length > 0) {
                html += `<div class="linked-indicator">Linked Items: `;
                const linkedDesc = [];
                if (linkedItems.notes.length > 0) linkedDesc.push(`${linkedItems.notes.length} note${linkedItems.notes.length !== 1 ? 's' : ''}`);
                if (linkedItems.copy.length > 0) linkedDesc.push(`${linkedItems.copy.length} copy item${linkedItems.copy.length !== 1 ? 's' : ''}`);
                html += linkedDesc.join(', ') + `</div>`;
            }
            
            html += `</div>`;
        });
    }
    
    if (project.notes && project.notes.length > 0) {
        html += `<h2>Notes (${project.notes.length})</h2>`;
        
        project.notes.forEach(note => {
            const linkedBrief = note.linkedBriefId ? project.briefs.find(b => b.id === note.linkedBriefId) : null;
            const linkedTasks = project.tasks ? project.tasks.filter(t => t.sourceItemType === 'note' && t.sourceItemId === note.id) : [];
            
            html += `<div class="item-section">`;
            html += `<h3>${note.title}</h3>`;
            html += `<div class="meta-info">Created: ${formatDate(note.createdAt)}</div>`;
            
            if (linkedBrief) {
                html += `<div class="linked-indicator">Linked to brief: "${linkedBrief.title}"</div>`;
            }
            
            if (note.richContent && note.richContent.trim()) {
                html += `<div>${note.richContent}</div>`;
            } else if (note.content && note.content.trim()) {
                html += `<div>${note.content.replace(/\n/g, '<br>')}</div>`;
            }
            
            if (linkedTasks.length > 0) {
                html += `<div class="task-list"><strong>Related Tasks:</strong>`;
                linkedTasks.forEach(task => {
                    html += `<div class="task-item ${task.completed ? 'task-completed' : ''}">• ${task.title}</div>`;
                });
                html += `</div>`;
            }
            
            html += `</div>`;
        });
    }
    
    if (project.copy && project.copy.length > 0) {
        html += `<h2>Copy (${project.copy.length})</h2>`;
        
        project.copy.forEach(copy => {
            const linkedBrief = copy.linkedBriefId ? project.briefs.find(b => b.id === copy.linkedBriefId) : null;
            const linkedTasks = project.tasks ? project.tasks.filter(t => t.sourceItemType === 'copy' && t.sourceItemId === copy.id) : [];
            
            html += `<div class="item-section">`;
            html += `<h3>${copy.title}</h3>`;
            html += `<div class="meta-info">Created: ${formatDate(copy.createdAt)}</div>`;
            
            if (linkedBrief) {
                html += `<div class="linked-indicator">Linked to brief: "${linkedBrief.title}"</div>`;
            }
            
            if (copy.richContent && copy.richContent.trim()) {
                html += `<div>${copy.richContent}</div>`;
            } else if (copy.content && copy.content.trim()) {
                html += `<div>${copy.content.replace(/\n/g, '<br>')}</div>`;
            }
            
            if (linkedTasks.length > 0) {
                html += `<div class="task-list"><strong>Related Tasks:</strong>`;
                linkedTasks.forEach(task => {
                    html += `<div class="task-item ${task.completed ? 'task-completed' : ''}">• ${task.title}</div>`;
                });
                html += `</div>`;
            }
            
            html += `</div>`;
        });
    }
    
    if (project.tasks && project.tasks.length > 0) {
        html += `<h2>Tasks (${project.tasks.length})</h2>`;
        
        const pendingTasks = project.tasks.filter(t => !t.completed);
        const completedTasks = project.tasks.filter(t => t.completed);
        
        if (pendingTasks.length > 0) {
            html += `<h3>Pending Tasks (${pendingTasks.length})</h3>`;
            pendingTasks.forEach(task => {
                const sourceItem = getTaskSourceItem(project, task);
                
                html += `<div class="item-section">`;
                html += `<h4>${task.title}</h4>`;
                html += `<div class="meta-info">Created: ${formatDate(task.createdAt)}</div>`;
                
                if (sourceItem) {
                    html += `<div class="linked-indicator">Source: ${task.sourceItemType} "${sourceItem.title}"</div>`;
                }
                
                if (task.content && task.content.trim()) {
                    html += `<div>${task.content.replace(/\n/g, '<br>')}</div>`;
                }
                
                html += `</div>`;
            });
        }
        
        if (completedTasks.length > 0) {
            html += `<h3>Completed Tasks (${completedTasks.length})</h3>`;
            completedTasks.forEach(task => {
                const sourceItem = getTaskSourceItem(project, task);
                
                html += `<div class="item-section">`;
                html += `<h4 class="task-completed">${task.title}</h4>`;
                html += `<div class="meta-info">Created: ${formatDate(task.createdAt)} | Completed: ${task.completedAt ? formatDate(task.completedAt) : 'Unknown'}</div>`;
                
                if (sourceItem) {
                    html += `<div class="linked-indicator">Source: ${task.sourceItemType} "${sourceItem.title}"</div>`;
                }
                
                if (task.content && task.content.trim()) {
                    html += `<div class="task-completed">${task.content.replace(/\n/g, '<br>')}</div>`;
                }
                
                html += `</div>`;
            });
        }
    }
    
    html += `<br><br><hr><div class="meta-info" style="text-align: center;">Exported from Creative Project Manager on ${new Date().toLocaleDateString()}</div></body></html>`;
    
    return html;
}

function getLinkedItemsForBrief(project, briefId) {
    const notes = project.notes ? project.notes.filter(n => n.linkedBriefId === briefId) : [];
    const copy = project.copy ? project.copy.filter(c => c.linkedBriefId === briefId) : [];
    return { notes, copy };
}

function getTaskSourceItem(project, task) {
    if (!task.sourceItemId || !task.sourceItemType) return null;
    
    switch(task.sourceItemType) {
        case 'brief': return project.briefs ? project.briefs.find(b => b.id === task.sourceItemId) : null;
        case 'note': return project.notes ? project.notes.find(n => n.id === task.sourceItemId) : null;
        case 'copy': return project.copy ? project.copy.find(c => c.id === task.sourceItemId) : null;
        default: return null;
    }
}

function saveProjects() {
    saveToStorage('projects', projects);
    setTimeout(() => cleanupOldCompletedTasks(), 100);
}

function updateAutosaveStatus(status) {
    const autosaveText = getEl('autosaveText');
    if (autosaveText) {
        switch(status) {
            case 'saving':
                autosaveText.textContent = 'Saving...';
                autosaveText.style.color = '#171717';
                break;
            case 'saved':
                autosaveText.textContent = 'Saved';
                autosaveText.style.color = '#16a34a';
                setTimeout(() => {
                    if (autosaveText) {
                        autosaveText.textContent = 'Ready';
                        autosaveText.style.color = '#737373';
                    }
                }, 2000);
                break;
            case 'changes':
                autosaveText.textContent = 'Unsaved changes...';
                autosaveText.style.color = '#f59e0b';
                break;
            default:
                autosaveText.textContent = 'Ready';
                autosaveText.style.color = '#737373';
        }
    }
}

function debouncedAutosave() {
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    hasUnsavedChanges = true;
    updateAutosaveStatus('changes');
    autosaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) autosaveItem();
    }, 1500);
}

function autosaveItem() {
    if (!currentEditingItem) return;
    
    updateAutosaveStatus('saving');
    
    const newTitle = getValue('editorItemTitle');
    
    if (!newTitle) {
        updateAutosaveStatus('ready');
        return;
    }
    
    const oldTitle = currentEditingItem.title;
    const titleChanged = oldTitle !== newTitle;
    
    let actualItem = null;
    let itemArray = null;
    
    switch(currentEditingType) {
        case 'brief':
            itemArray = currentProject.briefs;
            actualItem = currentProject.briefs.find(item => item.id === currentEditingItem.id);
            break;
        case 'note':
            itemArray = currentProject.notes;
            actualItem = currentProject.notes.find(item => item.id === currentEditingItem.id);
            break;
        case 'copy':
            itemArray = currentProject.copy;
            actualItem = currentProject.copy.find(item => item.id === currentEditingItem.id);
            break;
        case 'task':
            itemArray = currentProject.tasks;
            actualItem = currentProject.tasks.find(item => item.id === currentEditingItem.id);
            break;
    }
    
    if (!actualItem) {
        updateAutosaveStatus('ready');
        return;
    }
    
    currentEditingItem.title = newTitle;
    actualItem.title = newTitle;
    actualItem.lastModified = getCurrentTimestamp();
    
    let contentChanged = titleChanged;
    
    if (currentEditingType === 'brief') {
        const oldProposition = actualItem.proposition || '';
        const oldClientBrief = actualItem.clientBrief || '';
        const oldClientBriefRich = actualItem.clientBriefRich || '';
        
        const newProposition = getValue('editorProposition');
        const clientBriefField = getEl('editorClientBrief');
        const newClientBriefRich = clientBriefField ? clientBriefField.innerHTML : '';
        const newClientBrief = htmlToText(newClientBriefRich);
        
        contentChanged = contentChanged || 
                        (oldProposition !== newProposition) || 
                        (oldClientBrief !== newClientBrief) ||
                        (oldClientBriefRich !== newClientBriefRich);
        
        currentEditingItem.proposition = newProposition;
        currentEditingItem.clientBrief = newClientBrief;
        currentEditingItem.clientBriefRich = newClientBriefRich;
        
        actualItem.proposition = newProposition;
        actualItem.clientBrief = newClientBrief;
        actualItem.clientBriefRich = newClientBriefRich;
        
        delete actualItem.content;
        delete currentEditingItem.content;
    } else {
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            const oldContent = actualItem.content || '';
            const newContent = htmlToText(richEditor.innerHTML);
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
            currentEditingItem.richContent = richEditor.innerHTML;
            actualItem.content = newContent;
            actualItem.richContent = richEditor.innerHTML;
        } else if (textEditor) {
            const oldContent = actualItem.content || '';
            const newContent = textEditor.value.trim();
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
            actualItem.content = newContent;
        }
    }
    
    if (titleChanged && (currentEditingType === 'brief' || currentEditingType === 'note' || currentEditingType === 'copy')) {
        updateLinkedTaskNames(actualItem.id, currentEditingType, newTitle);
    }
    
    if (contentChanged && currentProject) {
        moveItemToTop(actualItem, currentEditingType);
    }
    
    saveProjects();
    
    if (currentProject) saveCurrentContext();
    
    hasUnsavedChanges = false;
    updateAutosaveStatus('saved');
    
    switch(currentEditingType) {
        case 'brief': renderBriefs(); break;
        case 'note': renderNotes(); break;
        case 'copy': renderCopy(); break;
        case 'task': renderProjectTasks(); break;
    }
    
    if (titleChanged && (currentEditingType === 'brief' || currentEditingType === 'note' || currentEditingType === 'copy')) {
        renderProjectTasks();
        renderGlobalTasks();
    }
}

function moveItemToTop(item, itemType) {
    if (!currentProject || !item) return;
    
    let itemArray;
    switch(itemType) {
        case 'brief': itemArray = currentProject.briefs; break;
        case 'note': itemArray = currentProject.notes; break;
        case 'copy': itemArray = currentProject.copy; break;
        case 'task': itemArray = currentProject.tasks; break;
        default: return;
    }
    
    itemArray.forEach(arrayItem => {
        if (arrayItem.id === item.id) {
            arrayItem.order = 0;
        } else if (arrayItem.order !== undefined) {
            arrayItem.order += 1;
        }
    });
}

function setupAutosaveListeners() {
    const titleField = getEl('editorItemTitle');
    if (titleField) titleField.addEventListener('input', debouncedAutosave);
    
    const propositionField = getEl('editorProposition');
    const clientBriefField = getEl('editorClientBrief');
    if (propositionField) propositionField.addEventListener('input', debouncedAutosave);
    if (clientBriefField && clientBriefField.contentEditable === 'true') {
        clientBriefField.addEventListener('input', debouncedAutosave);
        clientBriefField.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
    
    const richEditor = getEl('richEditor');
    if (richEditor) {
        richEditor.addEventListener('input', debouncedAutosave);
        richEditor.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
    
    const textEditor = getEl('editorContent');
    if (textEditor) {
        textEditor.addEventListener('input', debouncedAutosave);
        textEditor.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
}

window.openTaskSource = function(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task || !task.sourceItemId || !task.sourceItemType) {
        openItemEditor(task, 'task');
        return;
    }
    
    let sourceItem = null;
    switch(task.sourceItemType) {
        case 'brief': sourceItem = currentProject.briefs.find(b => b.id === task.sourceItemId); break;
        case 'note': sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId); break;
        case 'copy': sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId); break;
    }
    
    if (sourceItem) {
        const editorModal = getEl('itemEditor');
        if (editorModal.style.display === 'block') closeEditor();
        setTimeout(() => openItemEditor(sourceItem, task.sourceItemType), 100);
    } else {
        openItemEditor(task, 'task');
    }
};

function setupDeleteListeners() {
    document.removeEventListener('click', handleDeleteClick);
    document.addEventListener('click', handleDeleteClick);
}

function handleDeleteClick(event) {
    if (event.target.classList.contains('delete-btn')) {
        event.stopPropagation();
        event.preventDefault();
        
        const deleteType = event.target.getAttribute('data-delete-type');
        const deleteId = event.target.getAttribute('data-delete-id');
        
        switch(deleteType) {
            case 'brief': deleteBrief(deleteId); break;
            case 'note': deleteNote(deleteId); break;
            case 'copy': deleteCopy(deleteId); break;
        }
    }
}

function migrateBriefsToRichText() {
    let hasChanges = false;
    
    projects.forEach(project => {
        if (project.briefs) {
            project.briefs.forEach(brief => {
                if (brief.clientBrief && !brief.clientBriefRich) {
                    brief.clientBriefRich = textToHtml(brief.clientBrief);
                    hasChanges = true;
                } else if (brief.content && !brief.clientBrief && !brief.clientBriefRich) {
                    brief.clientBrief = brief.content;
                    brief.clientBriefRich = textToHtml(brief.content);
                    delete brief.content;
                    hasChanges = true;
                }
            });
        }
    });
    
    if (hasChanges) {
        saveProjects();
    }
}

function forceDropZoneReset() {
    elementsWithListeners.clear();
    cleanupProjectDropZones();
    setTimeout(() => {
        setupProjectDropZones();
        showNotification('Drop zones reset - try dragging again');
    }, 100);
}

function initializeApp() {
    try {
        loadWorkContext();
        
        const savedProjects = loadFromStorage('projects');
        if (savedProjects) {
            projects = Array.isArray(savedProjects) ? savedProjects : [];
            
            projects.forEach(project => {
                if (!project.colorTheme) project.colorTheme = getNextColorTheme();
                if (project.archived === undefined) project.archived = false;
                if (!project.briefs) project.briefs = [];
                if (!project.notes) project.notes = [];
                if (!project.copy) project.copy = [];
                if (!project.tasks) project.tasks = [];
                
                if (project.briefs) {
                    project.briefs.forEach(brief => {
                        if (brief.content && !brief.proposition && !brief.clientBrief) {
                            brief.clientBrief = brief.content;
                            brief.proposition = '';
                            delete brief.content;
                        }
                        if (brief.proposition === undefined) brief.proposition = '';
                        if (brief.clientBrief === undefined) brief.clientBrief = '';
                        if (!brief.linkColor) brief.linkColor = getNextLinkColor();
                    });
                }
                
                [project.tasks, project.briefs, project.notes, project.copy].forEach(itemArray => {
                    if (itemArray) {
                        itemArray.forEach((item, index) => {
                            if (item.order === undefined) item.order = index;
                        });
                    }
                });
            });
            saveProjects();
            migrateBriefsToRichText();
            initializeLinkColorIndex();
        } else {
            projects = [];
            initializeLinkColorIndex();
        }
        
        loadGlobalTaskOrder();
        cleanupGlobalTaskOrder();
        autoPopulateTopThree();
        setupTopTasksDropZones();
        cleanupOldCompletedTasks();
        loadPomodoroState();
        
        const today = new Date().toDateString();
        const savedDaily = loadFromStorage('pomodoroDaily');
        if (savedDaily) pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
        
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        
        let dropZoneAttempts = 0;
        const maxAttempts = 3;
        
        const attemptDropZoneSetup = () => {
            dropZoneAttempts++;
            setupProjectDropZones();
            
            setTimeout(() => {
                const columns = ['briefsColumn', 'notesColumn', 'copyColumn', 'tasksColumn'];
                const workingColumns = columns.filter(id => {
                    const element = getEl(id);
                    return element && element.hasAttribute('data-drop-type') && element._dropHandlers;
                });
                
                if (workingColumns.length < columns.length && dropZoneAttempts < maxAttempts) {
                    setTimeout(attemptDropZoneSetup, 500);
                }
            }, 200);
        };
        
        setTimeout(attemptDropZoneSetup, 100);
        renderBreadcrumbs();
        
        setInterval(() => cleanupOldCompletedTasks(), 60 * 60 * 1000);
        
        setInterval(() => {
            if (currentProject) {
                const columns = ['briefsColumn', 'notesColumn', 'copyColumn', 'tasksColumn'];
                const brokenColumns = columns.filter(id => {
                    const element = getEl(id);
                    return element && (!element.hasAttribute('data-drop-type') || !element._dropHandlers);
                });
                
                if (brokenColumns.length > 0) forceDropZoneReset();
            }
        }, 30000);
        
        setTimeout(() => offerWorkResumption(), 2000);
    } catch (error) {
        projects = [];
        initializeLinkColorIndex();
        loadGlobalTaskOrder();
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        setTimeout(() => setupProjectDropZones(), 1000);
        renderBreadcrumbs();
        showNotification('App loaded with some issues - drag & drop might need a refresh');
    }
}

document.addEventListener('DOMContentLoaded', initializeApp);

document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        const editorModal = getEl('itemEditor');
        if (editorModal) {
            editorModal.classList.remove('fullscreen');
            editorModal.classList.remove('true-fullscreen');
        }
        
        const overlay = getEl('focusOverlay');
        if (overlay) overlay.remove();
        
        document.body.style.cursor = 'default';
    }
});

window.onclick = function(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('editor-modal')) {
        if (event.target.id === 'confirmModal') {
            cancelConfirm();
        } else {
            event.target.style.display = 'none';
        }
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const confirmModal = getEl('confirmModal');
        if (confirmModal && confirmModal.style.display === 'block') {
            cancelConfirm();
            return;
        }
        
        const helpModal = getEl('helpModal');
        if (helpModal && helpModal.style.display === 'block') {
            closeModal('helpModal');
            return;
        }
        
        const editorModal = getEl('itemEditor');
        if (editorModal && (editorModal.classList.contains('fullscreen') || editorModal.classList.contains('true-fullscreen'))) {
            exitFocusMode();
            if (pomodoroIsRunning) pausePomodoro();
            return;
        }
        
        document.querySelectorAll('.modal, .editor-modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    if (e.key === 'F1' || (e.key === '?' && e.ctrlKey)) {
        e.preventDefault();
        showHelp();
        return;
    }
    
    if (e.key === 'Enter') {
        const confirmModal = getEl('confirmModal');
        if (confirmModal && confirmModal.style.display === 'block') {
            proceedConfirm();
            return;
        }
    }
    
    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        if (getEl('itemEditor').style.display === 'block') {
            autosaveItem();
            showContextIndicator('Work saved with context preserved');
        }
    }
    
    if (e.key === 'b' && e.altKey) {
        e.preventDefault();
        const breadcrumbContainer = getEl('breadcrumbContainer');
        if (breadcrumbContainer && breadcrumbContainer.style.display !== 'none') {
            const breadcrumbs = document.querySelectorAll('.breadcrumb-item');
            if (breadcrumbs.length > 0) breadcrumbs[breadcrumbs.length - 1].focus();
        }
    }
    
    if (e.key === 'R' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (workContext.currentContext) {
            if (!currentProject || currentProject.id != workContext.currentContext.projectId) {
                switchToProject(workContext.currentContext.projectId, () => {
                    setTimeout(() => restoreContext(workContext.currentContext), 200);
                });
            } else {
                restoreContext(workContext.currentContext);
            }
            showContextIndicator(`Resumed work on "${workContext.currentContext.title}"`, true);
        }
    }
    
    if (getEl('itemEditor') && getEl('itemEditor').style.display === 'block') {
        const pomodoroTimer = getEl('pomodoroTimer');
        if (pomodoroTimer && pomodoroTimer.style.display === 'block') {
            const isInEditor = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.contentEditable === 'true';
            
            if (e.code === 'Space' && !isInEditor) {
                e.preventDefault();
                if (pomodoroIsRunning) {
                    pausePomodoro();
                } else {
                    startPomodoro();
                }
            }
            
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                resetPomodoro();
            }
        }
    }
});

// Export all functions to window
Object.keys(this).filter(key => typeof this[key] === 'function').forEach(key => {
    window[key] = this[key];
});WithContext(itemId, itemType) {
    const item = findItem(itemId, itemType);
    if (item) {
        openItemEditor(item, itemType);
        addToBreadcrumbs(currentProject.id, itemId, itemType, item.title);
    }
}

function switchToProject(projectId, callback) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    currentProject = project;
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    if (project.colorTheme) dashboard.classList.add(`project-theme-${project.colorTheme}`);
    dashboard.classList.add('project-themed');
    
    updateSettingsButton();
    renderProject();
    if (callback) callback();
}

function saveCurrentContext() {
    if (!currentEditingItem || !currentEditingType || !currentProject) return;
    
    const context = createContextState(currentProject.id, currentEditingItem.id, currentEditingType);
    context.title = currentEditingItem.title;
    
    if (currentEditingType === 'brief') {
        const clientBriefField = getEl('editorClientBrief');
        context.editorState = {
            title: getValue('editorItemTitle'),
            proposition: getValue('editorProposition'),
            clientBrief: clientBriefField ? htmlToText(clientBriefField.innerHTML) : '',
            clientBriefRich: clientBriefField ? clientBriefField.innerHTML : ''
        };
        if (clientBriefField && clientBriefField.contentEditable === 'true') {
            context.cursorPosition = saveCursorPosition(clientBriefField);
        }
    } else {
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            context.editorState = {
                title: getValue('editorItemTitle'),
                content: richEditor.innerHTML,
                isRichText: true
            };
            context.cursorPosition = saveCursorPosition(richEditor);
        } else if (textEditor) {
            context.editorState = {
                title: getValue('editorItemTitle'),
                content: textEditor.value,
                isRichText: false
            };
            context.cursorPosition = {
                start: textEditor.selectionStart,
                end: textEditor.selectionEnd
            };
        }
    }
    
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
        context.scrollPosition = {
            top: editorContent.scrollTop,
            left: editorContent.scrollLeft
        };
    }
    
    const projectKey = `project-${currentProject.id}`;
    workContext.projectContexts.set(projectKey, context);
    workContext.currentContext = context;
    saveWorkContext();
}

function saveCursorPosition(element) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    
    return {
        start: preCaretRange.toString().length,
        end: preCaretRange.toString().length + range.toString().length
    };
}

function restoreCursorPosition(element, position) {
    if (!position) return;
    
    let charIndex = 0;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    
    let node;
    const range = document.createRange();
    
    while (node = walker.nextNode()) {
        const nodeLength = node.textContent.length;
        if (charIndex + nodeLength >= position.start) {
            range.setStart(node, position.start - charIndex);
            range.setEnd(node, Math.min(position.end - charIndex, nodeLength));
            break;
        }
        charIndex += nodeLength;
    }
    
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

function restoreContext(context) {
    if (!context || !context.editorState) return false;
    
    const project = projects.find(p => p.id == context.projectId);
    if (!project) return false;
    
    let item = null;
    switch(context.itemType) {
        case 'brief': item = project.briefs.find(b => b.id == context.itemId); break;
        case 'note': item = project.notes.find(n => n.id == context.itemId); break;
        case 'copy': item = project.copy.find(c => c.id == context.itemId); break;
        case 'task': item = project.tasks.find(t => t.id == context.itemId); break;
    }
    
    if (!item) return false;
    
    openItemEditor(item, context.itemType);
    setTimeout(() => {
        restoreEditorState(context);
        showContextIndicator(`Resumed: ${context.title}`, true);
    }, 300);
    
    return true;
}

function restoreEditorState(context) {
    if (!context.editorState) return;
    
    setValue('editorItemTitle', context.editorState.title || '');
    
    if (context.itemType === 'brief') {
        setValue('editorProposition', context.editorState.proposition || '');
        
        const clientBriefField = getEl('editorClientBrief');
        if (clientBriefField && context.editorState.clientBriefRich) {
            clientBriefField.innerHTML = context.editorState.clientBriefRich;
            if (context.cursorPosition) {
                setTimeout(() => restoreCursorPosition(clientBriefField, context.cursorPosition), 100);
            }
        }
    } else {
        if (context.editorState.isRichText) {
            const richEditor = getEl('richEditor');
            if (richEditor && context.editorState.content) {
                richEditor.innerHTML = context.editorState.content;
                if (context.cursorPosition) {
                    setTimeout(() => restoreCursorPosition(richEditor, context.cursorPosition), 100);
                }
            }
        } else {
            const textEditor = getEl('editorContent');
            if (textEditor && context.editorState.content) {
                textEditor.value = context.editorState.content;
                if (context.cursorPosition) {
                    setTimeout(() => {
                        textEditor.setSelectionRange(context.cursorPosition.start, context.cursorPosition.end);
                        textEditor.focus();
                    }, 100);
                }
            }
        }
    }
    
    if (context.scrollPosition) {
        const editorContent = document.querySelector('.editor-content');
        if (editorContent) {
            setTimeout(() => {
                editorContent.scrollTop = context.scrollPosition.top;
                editorContent.scrollLeft = context.scrollPosition.left;
            }, 200);
        }
    }
}

function showContextIndicator(message, isSuccess = false) {
    const existing = getEl('contextIndicator');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.id = 'contextIndicator';
    indicator.className = `context-indicator ${isSuccess ? 'success' : ''}`;
    indicator.textContent = message;
    document.body.appendChild(indicator);
    
    setTimeout(() => indicator.classList.add('show'), 100);
    setTimeout(() => {
        indicator.classList.remove('show');
        setTimeout(() => {
            if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
        }, 300);
    }, 2000);
}

function offerWorkResumption() {
    const lastContext = workContext.currentContext;
    if (!lastContext || !lastContext.editorState) return;
    
    const timeDiff = Date.now() - lastContext.timestamp;
    if (timeDiff > 24 * 60 * 60 * 1000) return;
    
    const project = projects.find(p => p.id == lastContext.projectId);
    if (!project) return;
    
    let item = null;
    switch(lastContext.itemType) {
        case 'brief': item = project.briefs.find(b => b.id == lastContext.itemId); break;
        case 'note': item = project.notes.find(n => n.id == lastContext.itemId); break;
        case 'copy': item = project.copy.find(c => c.id == lastContext.itemId); break;
        case 'task': item = project.tasks.find(t => t.id == lastContext.itemId); break;
    }
    
    if (!item) return;
    showResumePanel(lastContext);
}

function showResumePanel(context) {
    const existing = getEl('resumePanel');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'resumePanel';
    panel.className = 'resume-panel';
    
    const timeAgo = getTimeAgo(context.timestamp);
    
    panel.innerHTML = `<h4>Resume Work</h4><p>Continue working on <strong>${context.title}</strong> in ${projects.find(p => p.id == context.projectId)?.name || 'Unknown Project'}<br><small>Last worked on ${timeAgo}</small></p><div class="resume-panel-actions"><button onclick="dismissResumePanel()" class="btn-secondary">Dismiss</button><button onclick="resumeWork('${context.projectId}', '${context.itemId}', '${context.itemType}')">Resume</button></div>`;
    
    document.body.appendChild(panel);
    setTimeout(() => panel.classList.add('show'), 100);
    setTimeout(() => {
        if (panel.parentNode) dismissResumePanel();
    }, 10000);
}

function dismissResumePanel() {
    const panel = getEl('resumePanel');
    if (panel) {
        panel.classList.remove('show');
        setTimeout(() => {
            if (panel.parentNode) panel.parentNode.removeChild(panel);
        }, 300);
    }
}

function resumeWork(projectId, itemId, itemType) {
    dismissResumePanel();
    
    const context = workContext.currentContext;
    if (!context || context.projectId != projectId || context.itemId != itemId) return;
    
    if (!currentProject || currentProject.id != projectId) {
        switchToProject(projectId, () => {
            setTimeout(() => restoreContext(context), 200);
        });
    } else {
        restoreContext(context);
    }
}

function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
}

function saveWorkContext() {
    const contextData = {
        breadcrumbs: workContext.breadcrumbs,
        currentContext: workContext.currentContext,
        projectContexts: Array.from(workContext.projectContexts.entries()),
        globalContext: workContext.globalContext,
        timestamp: Date.now()
    };
    saveToStorage('workContext', contextData);
}

function loadWorkContext() {
    const saved = loadFromStorage('workContext');
    if (saved) {
        workContext.breadcrumbs = saved.breadcrumbs || [];
        workContext.currentContext = saved.currentContext || null;
        workContext.projectContexts = new Map(saved.projectContexts || []);
        workContext.globalContext = saved.globalContext || null;
    }
}

function saveBreadcrumbs() {
    saveToStorage('breadcrumbs', workContext.breadcrumbs);
}

// ===== POMODORO TIMER =====
function startPomodoro() {
    pomodoroIsRunning = true;
    setDisplay('pomodoroStart', 'none');
    setDisplay('pomodoroPause', 'inline-block');
    
    updatePomodoroHeaderStyle();
    updatePomodoroStatus();
    savePomodoroState();
    
    if (!pomodoroIsBreak) enterFocusMode();
    
    pomodoroTimer = setInterval(() => {
        pomodoroTimeLeft--;
        updatePomodoroDisplay();
        
        if (pomodoroTimeLeft % 10 === 0) savePomodoroState();
        if (pomodoroTimeLeft <= 0) completePomodoro();
    }, 1000);
}

function pausePomodoro() {
    pomodoroIsRunning = false;
    clearInterval(pomodoroTimer);
    setDisplay('pomodoroStart', 'inline-block');
    setDisplay('pomodoroPause', 'none');
    
    updatePomodoroHeaderStyle();
    exitFocusMode();
    updatePomodoroStatus();
    savePomodoroState();
}

function resetPomodoro() {
    pausePomodoro();
    pomodoroIsBreak = false;
    pomodoroTimeLeft = 25 * 60;
    
    const startBtn = getEl('pomodoroStart');
    const pauseBtn = getEl('pomodoroPause');
    if (startBtn) setDisplay('pomodoroStart', 'inline-block');
    if (pauseBtn) setDisplay('pomodoroPause', 'none');
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroHeaderStyle();
    clearPomodoroState();
}

function skipPomodoro() {
    pausePomodoro();
    completePomodoro();
}

function completePomodoro() {
    pausePomodoro();
    
    if (currentEditingItem && currentEditingType && currentProject) saveCurrentContext();
    
    if (pomodoroIsBreak) {
        pomodoroIsBreak = false;
        pomodoroTimeLeft = 25 * 60;
        
        if (workContext.currentContext) {
            setTimeout(() => {
                restoreContext(workContext.currentContext);
                showContextIndicator('Work resumed after break', true);
            }, 1000);
        }
    } else {
        pomodoroSessionCount++;
        pomodoroDailyCount++;
        
        pomodoroIsBreak = true;
        pomodoroTimeLeft = pomodoroSessionCount % 4 === 0 ? 15 * 60 : 5 * 60;
        
        const today = new Date().toDateString();
        saveToStorage('pomodoroDaily', {
            date: today,
            count: pomodoroDailyCount
        });
    }
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroStats();
    updatePomodoroHeaderStyle();
    clearPomodoroState();
    
    showNotification(pomodoroIsBreak ? 'Work session complete! Take a break.' : 'Break over! Ready for another session?');
    playPomodoroSound();
}

function updatePomodoroHeaderStyle() {
    const header = document.querySelector('.editor-header');
    const timer = getEl('pomodoroTimer');
    
    if (!header) return;
    
    header.classList.remove('pomodoro-active', 'pomodoro-break');
    
    if (timer && timer.style.display !== 'none') {
        if (pomodoroIsRunning) {
            if (pomodoroIsBreak) {
                header.classList.add('pomodoro-break');
            } else {
                header.classList.add('pomodoro-active');
            }
        }
    }
}

function enterFocusMode() {
    const editorModal = getEl('itemEditor');
    editorModal.classList.add('true-fullscreen');
    setupFullscreenOverlay();
    
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen().catch(() => {});
    } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen().catch(() => {});
    }
}

function setupFullscreenOverlay() {
    const existingOverlay = getEl('focusOverlay');
    if (existingOverlay) existingOverlay.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-overlay';
    overlay.id = 'focusOverlay';
    overlay.innerHTML = `<div style="display: flex; align-items: center; gap: 8px;"><span>Focus Mode</span><span id="overlayTimer">${Math.floor(pomodoroTimeLeft / 60)}:${(pomodoroTimeLeft % 60).toString().padStart(2, '0')}</span><button onclick="exitFocusMode()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 6px; border-radius: 2px; font-size: 10px; margin-left: 8px; cursor: pointer;">Exit</button></div>`;
    document.body.appendChild(overlay);
    
    let cursorTimeout;
    const hideCursor = () => { document.body.style.cursor = 'none'; };
    const showCursor = () => {
        document.body.style.cursor = 'default';
        clearTimeout(cursorTimeout);
        cursorTimeout = setTimeout(hideCursor, 3000);
    };
    
    document.removeEventListener('mousemove', showCursor);
    document.addEventListener('mousemove', showCursor);
    showCursor();
}

function exitFocusMode() {
    const editorModal = getEl('itemEditor');
    
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen().catch(() => {});
    } else if (document.msFullscreenElement) {
        document.msExitFullscreen().catch(() => {});
    }
    
    editorModal.classList.remove('fullscreen');
    editorModal.classList.remove('true-fullscreen');
    
    const overlay = getEl('focusOverlay');
    if (overlay) overlay.remove();
    
    document.body.style.cursor = 'default';
}

function updatePomodoroDisplay() {
    const displayElement = getEl('pomodoroDisplay');
    if (!displayElement) return;
    
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    displayElement.textContent = timeString;
    
    const overlayTimer = getEl('overlayTimer');
    if (overlayTimer) overlayTimer.textContent = timeString;
}

function updatePomodoroStatus() {
    const statusElement = getEl('pomodoroStatus');
    if (!statusElement) return;
    
    if (pomodoroIsRunning) {
        statusElement.textContent = pomodoroIsBreak ? 'Break time - relax!' : 'Focus time - stay concentrated!';
    } else {
        if (pomodoroIsBreak) {
            statusElement.textContent = 'Break paused';
        } else {
            statusElement.textContent = pomodoroTimeLeft === 25 * 60 ? 'Ready to focus' : 'Paused';
        }
    }
}

function updatePomodoroStats() {
    const sessionElement = getEl('sessionCount');
    const dailyElement = getEl('dailyCount');
    
    if (sessionElement) sessionElement.textContent = pomodoroSessionCount;
    if (dailyElement) dailyElement.textContent = pomodoroDailyCount;
}

function playPomodoroSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {}
}

function initializePomodoro() {
    const today = new Date().toDateString();
    const savedDaily = loadFromStorage('pomodoroDaily');
    
    if (savedDaily) {
        pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
    }
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroStats();
    
    const timer = getEl('pomodoroTimer');
    if (timer) timer.style.display = 'flex';
}

function savePomodoroState() {
    const pomodoroState = {
        timeLeft: pomodoroTimeLeft,
        isRunning: pomodoroIsRunning,
        isBreak: pomodoroIsBreak,
        sessionCount: pomodoroSessionCount,
        lastUpdate: Date.now()
    };
    saveToStorage('pomodoroState', pomodoroState);
}

function loadPomodoroState() {
    const savedState = loadFromStorage('pomodoroState');
    if (savedState) {
        const now = Date.now();
        const elapsed = Math.floor((now - savedState.lastUpdate) / 1000);
        
        pomodoroTimeLeft = Math.max(0, savedState.timeLeft - (savedState.isRunning ? elapsed : 0));
        pomodoroIsRunning = savedState.isRunning && pomodoroTimeLeft > 0;
        pomodoroIsBreak = savedState.isBreak;
        pomodoroSessionCount = savedState.sessionCount;
        
        if (savedState.isRunning && pomodoroTimeLeft <= 0) completePomodoro();
    }
}

function clearPomodoroState() {
    if (window.appStorage) delete window.appStorage['pomodoroState'];
}

// ===== UI FUNCTIONS =====
function openProjectModal() {
    setDisplay('projectModal', 'block');
}

function showHelp() {
    setDisplay('helpModal', 'block');
}

function closeModal(modalId) {
    setDisplay(modalId, 'none');
    if (modalId === 'confirmModal') {
        confirmCallback = null;
        confirmData = null;
    }
}

function closeEditor() {
    if (currentEditingItem && currentEditingType && currentProject) saveCurrentContext();
    if (pomodoroIsRunning) pausePomodoro();
    exitFocusMode();
    setDisplay('itemEditor', 'none');
    currentEditingItem = null;
    currentEditingType = null;
}

function showProjectOverview() {
    setDisplay('dashboard', 'none');
    setDisplay('projectOverview', 'block');
    setValue('projectSelect', '');
    currentProject = null;
    
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    dashboard.classList.remove('project-themed');
    
    updateSettingsButton();
    renderProjectOverview();
    renderGlobalTasks();
}

function toggleArchivedProjects() {
    try {
        showArchived = !showArchived;
        const button = getEl('archiveToggle');
        if (button) button.innerHTML = showArchived ? 'Hide Archived' : 'Show Archived';
        renderProjectOverview();
    } catch (error) {}
}

function toggleArchiveProject(projectId) {
    try {
        const project = projects.find(p => p && p.id === projectId);
        if (project) {
            project.archived = !project.archived;
            saveProjects();
            updateProjectSelector();
            renderProjectOverview();
        }
    } catch (error) {}
}

function selectProject(projectId) {
    setValue('projectSelect', projectId);
    switchProject();
}

function switchProject() {
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
        showContextIndicator(`Work saved: ${currentEditingItem.title}`);
    }
    
    const select = getEl('projectSelect');
    const projectId = select.value;
    
    if (projectId) {
        currentProject = projects.find(p => p.id == projectId);
        setDisplay('dashboard', 'grid');
        setDisplay('projectOverview', 'none');
        
        const dashboard = getEl('dashboard');
        colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
        if (currentProject.colorTheme) dashboard.classList.add(`project-theme-${currentProject.colorTheme}`);
        dashboard.classList.add('project-themed');
        
        updateSettingsButton();
        renderProject();
        
        const contextKey = `project-${projectId}`;
        const projectContext = workContext.projectContexts.get(contextKey);
        if (projectContext && projectContext.editorState) {
            setTimeout(() => {
                const timeDiff = Date.now() - projectContext.timestamp;
                if (timeDiff < 4 * 60 * 60 * 1000) {
                    restoreContext(projectContext);
                    showContextIndicator(`Resumed work on "${projectContext.title}"`, true);
                }
            }, 500);
        }
    } else {
        showProjectOverview();
    }
}

function formatRichText(command, value = null) {
    document.execCommand(command, false, value);
    getEl('richEditor').focus();
}

function createLink() {
    const url = prompt('Enter URL:');
    if (url) formatRichText('createLink', url);
}

function copyContentToClipboard() {
    let contentToCopy = '';
    let htmlContent = '';
    
    if (currentEditingType === 'brief') {
        const title = getValue('editorItemTitle');
        const proposition = getValue('editorProposition');
        const clientBriefField = getEl('editorClientBrief');
        const clientBriefHtml = clientBriefField ? clientBriefField.innerHTML : '';
        const clientBriefText = htmlToText(clientBriefHtml);
        
        contentToCopy = title;
        if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
        if (clientBriefText) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBriefText;
        
        htmlContent = `<h3>${title}</h3>`;
        if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
        if (clientBriefHtml) htmlContent += `<h4>CLIENT BRIEF:</h4>${clientBriefHtml}`;
    } else {
        const title = getValue('editorItemTitle');
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        let content = '';
        if (richEditor && richEditor.style.display !== 'none') {
            content = richEditor.innerHTML;
            htmlContent = `<h3>${title}</h3>${content}`;
            contentToCopy = title + '\n\n' + htmlToText(content);
        } else if (textEditor) {
            content = textEditor.value.trim();
            contentToCopy = title + '\n\n' + content;
            htmlContent = `<h3>${title}</h3><p>${content.replace(/\n/g, '<br>')}</p>`;
        }
    }
    
    if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([contentToCopy], { type: 'text/plain' })
        });
        
        navigator.clipboard.write([clipboardItem]).then(() => {
            showNotification('Content copied to clipboard with formatting!');
        }).catch(err => {
            fallbackCopyToClipboard(contentToCopy);
        });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(contentToCopy).then(() => {
            showNotification('Content copied to clipboard!');
        }).catch(err => {
            fallbackCopyToClipboard(contentToCopy);
        });
    } else {
        fallbackCopyToClipboard(contentToCopy);
    }
}

function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        showNotification('Content copied to clipboard!');
    } catch (err) {
        showNotification('Failed to copy to clipboard');
    }
    
    document.body.removeChild(textArea);
}

function htmlToText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

function textToHtml(text) {
    if (!text) return '';
    
    return text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
}

function openItem
