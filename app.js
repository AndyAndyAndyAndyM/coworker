// ===== HELPER FUNCTIONS (DEFINED EARLY) =====
// DOM Helpers
const getEl = (id) => document.getElementById(id);
const setDisplay = (id, display) => { const el = getEl(id); if (el) el.style.display = display; };
const setValue = (id, value) => { const el = getEl(id); if (el) el.value = value; };
const getValue = (id) => { const el = getEl(id); return el ? el.value.trim() : ''; };
const setContent = (id, content) => { const el = getEl(id); if (el) el.textContent = content; };
const setHTML = (id, html) => { const el = getEl(id); if (el) el.innerHTML = html; };

// Common UI Patterns
const showModal = (id) => setDisplay(id, 'block');
const hideModal = (id) => setDisplay(id, 'none');
const toggleDisplay = (id, condition) => setDisplay(id, condition ? 'block' : 'none');

// Item Management Helpers
const getItemCollection = (project, itemType) => {
    const collections = { brief: 'briefs', note: 'notes', copy: 'copy', task: 'tasks' };
    return project[collections[itemType]] || [];
};

const setItemCollection = (project, itemType, items) => {
    const collections = { brief: 'briefs', note: 'notes', copy: 'copy', task: 'tasks' };
    project[collections[itemType]] = items;
};

const getItemTypePlural = (itemType) => {
    const plurals = { brief: 'briefs', note: 'notes', copy: 'copy', task: 'tasks' };
    return plurals[itemType];
};

const getItemDisplayName = (itemType) => {
    const names = { brief: 'Brief', note: 'Note', copy: 'Copy', task: 'Task' };
    return names[itemType];
};

const generateId = () => Date.now();
const getCurrentTimestamp = () => new Date().toISOString();

// Project Theme Helpers
const applyProjectTheme = (project) => {
    const dashboard = getEl('dashboard');
    if (!dashboard) return;
    
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    if (project?.colorTheme) {
        dashboard.classList.add(`project-theme-${project.colorTheme}`);
    }
    dashboard.classList.add('project-themed');
};

const removeProjectTheme = () => {
    const dashboard = getEl('dashboard');
    if (!dashboard) return;
    
    colorThemes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
    dashboard.classList.remove('project-themed');
};

// Date Formatting Helper
const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

// Content Truncation Helper
const truncateContent = (content, maxLength = 100) => {
    if (!content) return '';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
};

// Storage Helpers
const saveToStorage = (key, data) => localStorage.setItem(key, JSON.stringify(data));
const loadFromStorage = (key, defaultValue = null) => {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
        console.error(`Error loading ${key} from storage:`, error);
        return defaultValue;
    }
};

// Item Order Management Helper
const updateItemOrder = (items, targetItem, newOrder = 0) => {
    items.forEach(item => {
        if (item.id === targetItem.id) {
            item.order = newOrder;
        } else if (item.order !== undefined) {
            item.order += 1;
        }
    });
};

const ensureItemOrder = (items) => {
    items.forEach((item, index) => {
        if (item.order === undefined) item.order = index;
    });
};

// Task Filtering and Sorting Helper
const filterAndSortTasks = (tasks) => {
    return [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const aOrder = a.order !== undefined ? a.order : 0;
        const bOrder = b.order !== undefined ? b.order : 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(a.createdAt) - new Date(b.createdAt);
    });
};

// HTML Generation Helpers
const createItemHTML = (item, itemType, linkColor, isLinked, content, actions) => {
    const typeClass = `type-${itemType}`;
    const displayName = getItemDisplayName(itemType);
    
    return `
        <div class="item ${itemType}-item sortable-item ${isLinked ? 'linked-item' : ''}" 
             draggable="true"
             data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}'
             data-type="${itemType}"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             ondblclick="openItemEditor(findItem('${item.id}', '${itemType}'), '${itemType}')"
             style="border-left: 3px solid ${linkColor};">
            <div class="grab-handle"></div>
            <div class="item-type ${typeClass}">${displayName}</div>
            <div class="item-header">
                <div class="item-title">${item.title}</div>
            </div>
            <div class="item-meta">
                Created: ${formatDate(item.createdAt)}
                ${item.completed && item.completedAt ? ` • Completed: ${formatDate(item.completedAt)}` : ''}
            </div>
            ${content}
            <div class="item-actions">
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">${actions}</div>
                <button class="delete-btn" data-delete-type="${itemType}" data-delete-id="${item.id}">×</button>
            </div>
        </div>
    `;
};

const createBriefSectionHTML = (title, content, colorClass) => {
    if (!content?.trim()) return '';
    return `
        <div style="margin: 8px 0; padding: 8px; background: ${colorClass === 'proposition' ? '#f0f9ff' : '#fefce8'}; border-left: 3px solid ${colorClass === 'proposition' ? '#0ea5e9' : '#eab308'}; border-radius: 4px;">
            <div style="font-size: 11px; font-weight: 600; color: ${colorClass === 'proposition' ? '#0369a1' : '#a16207'}; text-transform: uppercase; margin-bottom: 4px;">${title}</div>
            <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                ${truncateContent(content, 120)}
            </div>
        </div>
    `;
};

// Notification Helper
const showNotification = (message) => {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
};

// Context Helper
const createContextIndicator = (message, isSuccess = false) => {
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
        setTimeout(() => indicator.remove(), 300);
    }, 2000);
};

// Task ID Helper
const createTaskUniqueId = (projectId, taskId) => `${projectId}-${taskId}`;

// ===== ORIGINAL STATE MANAGEMENT =====
let projects = [];
let currentProject = null;
let currentEditingItem = null;
let currentEditingType = null;
let draggedItem = null;
let draggedItemType = null;
let showArchived = false;
let autosaveTimeout = null;
let hasUnsavedChanges = false;

// Global tasks management
let globalTaskOrder = { topThree: [], other: [] };
let draggedGlobalTask = null;

// Pomodoro timer variables
let pomodoroTimer = null;
let pomodoroTimeLeft = 25 * 60; // 25 minutes in seconds
let pomodoroIsRunning = false;
let pomodoroIsBreak = false;
let pomodoroSessionCount = 0;
let pomodoroDailyCount = 0;

// Color themes for projects
const colorThemes = [
    'blue', 'green', 'purple', 'pink', 'orange', 'teal', 'indigo', 'red'
];

// Link colors for connected items (brief -> notes/copy -> tasks)
const linkColors = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', 
    '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1'
];

let nextLinkColorIndex = 0;

// Custom confirmation modal variables
let confirmCallback = null;
let confirmData = null;

// Context Preservation System
let workContext = {
    breadcrumbs: [],
    currentContext: null,
    projectContexts: new Map(),
    globalContext: null
};

// ===== ORIGINAL FUNCTIONS WITH HELPER USAGE =====

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
                    if (colorIndex !== -1 && colorIndex > maxIndex) {
                        maxIndex = colorIndex;
                    }
                }
            });
        }
    });
    nextLinkColorIndex = maxIndex + 1;
}

function getLinkColor(item, itemType) {
    if (itemType === 'brief' && item.linkColor) {
        return item.linkColor;
    }
    if ((itemType === 'note' || itemType === 'copy') && item.linkedBriefId) {
        const brief = currentProject.briefs.find(b => b.id === item.linkedBriefId);
        return brief ? brief.linkColor : null;
    }
    if (itemType === 'task' && item.sourceItemId && item.sourceItemType) {
        const sourceItem = findItem(item.sourceItemId, item.sourceItemType);
        if (sourceItem) {
            return getLinkColor(sourceItem, item.sourceItemType);
        }
    }
    return null;
}

// Context state structure
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

// Breadcrumb management
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
    
    if (workContext.breadcrumbs.length > 10) {
        workContext.breadcrumbs = workContext.breadcrumbs.slice(-10);
    }
    
    saveBreadcrumbs();
    renderBreadcrumbs();
}

function navigateToBreadcrumb(breadcrumbId) {
    const breadcrumb = workContext.breadcrumbs.find(b => b.id === breadcrumbId);
    if (!breadcrumb) return;
    
    const project = projects.find(p => p.id == breadcrumb.projectId);
    if (!project) return;
    
    if (!currentProject || currentProject.id != breadcrumb.projectId) {
        switchToProject(breadcrumb.projectId, () => {
            setTimeout(() => {
                openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
            }, 200);
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

function renderBreadcrumbs() {
    const container = getEl('breadcrumbContainer');
    const trail = getEl('breadcrumbTrail');
    
    if (workContext.breadcrumbs.length === 0) {
        setDisplay('breadcrumbContainer', 'none');
        return;
    }
    
    setDisplay('breadcrumbContainer', 'block');
    
    const breadcrumbsHtml = workContext.breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === workContext.breadcrumbs.length - 1;
        const project = projects.find(p => p.id == breadcrumb.projectId);
        const projectName = project ? project.name : 'Unknown Project';
        
        return `
            <div class="breadcrumb-item ${isLast ? 'current' : ''}" 
                 onclick="navigateToBreadcrumb('${breadcrumb.id}')"
                 title="${projectName} > ${breadcrumb.title}">
                <span style="color: #a3a3a3; font-size: 10px;">${breadcrumb.itemType.toUpperCase()}</span>
                <span>${breadcrumb.title}</span>
            </div>
            ${!isLast ? '<div class="breadcrumb-separator">></div>' : ''}
        `;
    }).join('');
    
    setHTML('breadcrumbTrail', breadcrumbsHtml + `
        <button class="breadcrumb-clear" onclick="clearBreadcrumbs()" title="Clear trail">
            Clear
        </button>
    `);
}

// Context state management
function saveCurrentContext() {
    if (!currentEditingItem || !currentEditingType || !currentProject) return;
    
    const context = createContextState(currentProject.id, currentEditingItem.id, currentEditingType);
    context.title = currentEditingItem.title;
    
    if (currentEditingType === 'brief') {
        context.editorState = {
            title: getValue('editorItemTitle'),
            proposition: getValue('editorProposition'),
            clientBrief: getValue('editorClientBrief')
        };
    } else {
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            context.editorState = {
                title: getValue('editorItemTitle'),
                content: richEditor.innerHTML,
                isRichText: true
            };
        } else if (textEditor) {
            context.editorState = {
                title: getValue('editorItemTitle'),
                content: textEditor.value,
                isRichText: false
            };
        }
    }
    
    const projectKey = `project-${currentProject.id}`;
    workContext.projectContexts.set(projectKey, context);
    workContext.currentContext = context;
    
    saveWorkContext();
}

function restoreContext(context) {
    if (!context || !context.editorState) return false;
    
    const project = projects.find(p => p.id == context.projectId);
    if (!project) return false;
    
    const item = findItem(context.itemId, context.itemType);
    if (!item) return false;
    
    openItemEditor(item, context.itemType);
    
    setTimeout(() => {
        restoreEditorState(context);
        createContextIndicator(`Resumed: ${context.title}`, true);
    }, 300);
    
    return true;
}

function restoreEditorState(context) {
    if (!context.editorState) return;
    
    setValue('editorItemTitle', context.editorState.title || '');
    
    if (context.itemType === 'brief') {
        setValue('editorProposition', context.editorState.proposition || '');
        setValue('editorClientBrief', context.editorState.clientBrief || '');
    } else {
        if (context.editorState.isRichText) {
            const richEditor = getEl('richEditor');
            if (richEditor) richEditor.innerHTML = context.editorState.content || '';
        } else {
            setValue('editorContent', context.editorState.content || '');
        }
    }
}

function offerWorkResumption() {
    const lastContext = workContext.currentContext;
    if (!lastContext || !lastContext.editorState) return;
    
    const timeDiff = Date.now() - lastContext.timestamp;
    if (timeDiff > 24 * 60 * 60 * 1000) return;
    
    const project = projects.find(p => p.id == lastContext.projectId);
    if (!project) return;
    
    const item = findItem(lastContext.itemId, lastContext.itemType);
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
    
    panel.innerHTML = `
        <h4>Resume Work</h4>
        <p>Continue working on <strong>${context.title}</strong> in ${projects.find(p => p.id == context.projectId)?.name || 'Unknown Project'}<br>
        <small>Last worked on ${timeAgo}</small></p>
        <div class="resume-panel-actions">
            <button onclick="dismissResumePanel()" class="btn-secondary">Dismiss</button>
            <button onclick="resumeWork('${context.projectId}', '${context.itemId}', '${context.itemType}')">Resume</button>
        </div>
    `;
    
    document.body.appendChild(panel);
    setTimeout(() => panel.classList.add('show'), 100);
    setTimeout(() => dismissResumePanel(), 10000);
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
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
    const data = loadFromStorage('workContext');
    if (data) {
        workContext.breadcrumbs = data.breadcrumbs || [];
        workContext.currentContext = data.currentContext || null;
        workContext.projectContexts = new Map(data.projectContexts || []);
        workContext.globalContext = data.globalContext || null;
    }
}

function saveBreadcrumbs() {
    saveToStorage('breadcrumbs', workContext.breadcrumbs);
}

function dismissResumePanel() {
    const panel = getEl('resumePanel');
    if (panel) {
        panel.classList.remove('show');
        setTimeout(() => panel.remove(), 300);
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

function openItemWithContext(itemId, itemType) {
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
    setDisplay('topTasksRow', 'flex');
    
    applyProjectTheme(project);
    updateSettingsButton();
    renderProject();
    
    if (callback) callback();
}

// Global Tasks Functions
function getAllTasks() {
    let allTasks = [];
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks.forEach(task => {
                allTasks.push({
                    ...task,
                    projectName: project.name,
                    projectId: project.id,
                    projectColorTheme: project.colorTheme
                });
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
        if (task && !topThreeIds.has(id)) {
            otherTasks.push(task);
        }
    });
    
    allTasks.forEach(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        if (!topThreeIds.has(uniqueId) && !otherTaskIds.has(uniqueId)) {
            otherTasks.push(task);
        }
    });
    
    const sortedOther = filterAndSortTasks(otherTasks);
    
    return { topThree: topThreeTasks, other: sortedOther };
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
        const message = isTopThree ? 
            'Drop your most important tasks here' : 
            'All other tasks appear here';
        container.innerHTML = `<div class="task-drop-zone">${message}</div>`;
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
                    case 'brief':
                        sourceItem = project.briefs?.find(b => b.id === task.sourceItemId);
                        break;
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
                if (sourceItem && task.sourceItemType === 'brief') {
                    linkColor = sourceItem.linkColor || linkColor;
                }
            }
        }
        
        return `
            <div class="global-task-item ${isTopThree ? 'top-three-task' : ''}" 
                 draggable="true"
                 data-unique-id="${uniqueId}"
                 data-project-id="${task.projectId}"
                 data-task-id="${task.id}"
                 ondragstart="handleGlobalTaskDragStart(event)"
                 ondragend="handleGlobalTaskDragEnd(event)"
                 style="
                    background: white;
                    border: 1px solid #e5e5e5;
                    border-left: 3px solid ${linkColor};
                    border-radius: 4px;
                    margin-bottom: 12px;
                    padding: 0px;
                    position: relative;
                    cursor: grab;
                    transition: all 0.2s ease;
                    ${task.completed ? 'opacity: 0.6;' : ''}
                    ${isTopThree ? 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);' : ''}
                 ">
                
                <div style="position: absolute; top: 8px; right: 8px; background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">
                    ${isTopThree ? 'Priority' : 'Task'}
                </div>
                
                <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                    <div style="background-color: transparent; border: none; margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" 
                               ${task.completed ? 'checked' : ''}
                               onclick="event.stopPropagation(); toggleGlobalTask('${task.projectId}', '${task.id}')"
                               style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                    </div>
                    <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px;">
                        <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                    </div>
                </div>
                
                <div style="position: absolute; left: 8px; top: 16px;">
                    <div class="grab-handle"></div>
                </div>
                
                <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                    <span class="global-task-project project-theme-${task.projectColorTheme || 'blue'}">${task.projectName}</span>
                    Created: ${formatDate(task.createdAt)}
                    ${hasSource ? ` • Has source` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                        ${truncateContent(task.content)}
                    </div>
                ` : ''}
                
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span>${hasSource ? 'Click to open source' : 'Click to edit'} • Drag to reorder</span>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="event.stopPropagation(); openGlobalTaskSource('${task.projectId}', '${task.id}')" style="background: #171717; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;">
                            ${hasSource ? 'Open' : 'Edit'}
                        </button>
                        ${canDiveIn ? `
                            <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToGlobalSource('${task.projectId}', '${task.id}')" title="Open in focus mode with Pomodoro">
                                Dive In
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Global task drag and drop handlers
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

// Global task interaction functions
function toggleGlobalTask(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (project) {
        const task = project.tasks.find(t => t.id == taskId);
        if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? getCurrentTimestamp() : undefined;
            
            if (task.completed) {
                const uniqueId = createTaskUniqueId(projectId, taskId);
                globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
                globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
                saveGlobalTaskOrder();
            }
            
            saveProjects();
            setTimeout(() => renderGlobalTasks(), 100);
            
            if (currentProject && currentProject.id == projectId) {
                renderProjectTasks();
            }
        }
    }
}

function openGlobalTaskSource(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    switchToProject(projectId);
    
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
    if (!task || !task.sourceItemId || !task.sourceItemType || 
        (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    switchToProject(projectId);
    
    setTimeout(() => {
        let sourceItem = null;
        switch(task.sourceItemType) {
            case 'note':
                sourceItem = project.notes.find(n => n.id === task.sourceItemId);
                break;
            case 'copy':
                sourceItem = project.copy.find(c => c.id === task.sourceItemId);
                break;
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
                
                if (!pomodoroIsRunning) {
                    startPomodoro();
                }
                
                showNotification(`Diving into "${sourceItem.title}" - Focus mode activated!`);
            }, 300);
        } else {
            showNotification('Source item not found');
        }
    }, 200);
}

function saveGlobalTaskOrder() {
    saveToStorage('globalTaskOrder', globalTaskOrder);
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
            
            if (project.tasks.length !== originalLength) {
                hasChanges = true;
            }
        }
    });
    
    if (hasChanges) {
        saveProjects();
        cleanupGlobalTaskOrder();
    }
}

function loadGlobalTaskOrder() {
    const saved = loadFromStorage('globalTaskOrder');
    if (saved) {
        globalTaskOrder = { topThree: [], other: [], ...saved };
    }
}

function showConfirm(title, message, callback, data = null) {
    setContent('confirmTitle', title);
    setContent('confirmMessage', message);
    showModal('confirmModal');
    
    confirmCallback = callback;
    confirmData = data;
}

function proceedConfirm() {
    hideModal('confirmModal');
    
    if (confirmCallback) {
        confirmCallback(confirmData);
    }
    
    confirmCallback = null;
    confirmData = null;
}

function cancelConfirm() {
    hideModal('confirmModal');
    confirmCallback = null;
    confirmData = null;
}

// Delete functions using custom confirmation
function deleteBrief(briefId) {
    showConfirm(
        'Delete Brief',
        'Are you sure you want to delete this brief? This will also remove any linked notes, copy, and tasks.',
        (id) => {
            const parsedId = parseInt(id);
            const items = getItemCollection(currentProject, 'brief');
            setItemCollection(currentProject, 'brief', items.filter(item => item.id !== parsedId));
            
            currentProject.notes = currentProject.notes.filter(note => note.linkedBriefId !== parsedId);
            currentProject.copy = currentProject.copy.filter(copy => copy.linkedBriefId !== parsedId);
            
            removeLinkedTasks('brief', parsedId);
            removeFromBreadcrumbs('brief', parsedId);
            
            saveProjects();
            renderBriefs();
            renderNotes();
            renderCopy();
            renderProjectTasks();
            renderGlobalTasks();
            
            showNotification('Brief and all linked items deleted successfully');
        },
        briefId
    );
}

function deleteNote(noteId) {
    showConfirm(
        'Delete Note',
        'Are you sure you want to delete this note? This will also remove any linked tasks.',
        (id) => {
            const parsedId = parseInt(id);
            const items = getItemCollection(currentProject, 'note');
            setItemCollection(currentProject, 'note', items.filter(item => item.id !== parsedId));
            
            removeLinkedTasks('note', parsedId);
            removeFromBreadcrumbs('note', parsedId);
            
            saveProjects();
            renderNotes();
            renderProjectTasks();
            renderGlobalTasks();
            
            showNotification('Note and linked tasks deleted successfully');
        },
        noteId
    );
}

function deleteCopy(copyId) {
    showConfirm(
        'Delete Copy',
        'Are you sure you want to delete this copy? This will also remove any linked tasks.',
        (id) => {
            const parsedId = parseInt(id);
            const items = getItemCollection(currentProject, 'copy');
            setItemCollection(currentProject, 'copy', items.filter(item => item.id !== parsedId));
            
            removeLinkedTasks('copy', parsedId);
            removeFromBreadcrumbs('copy', parsedId);
            
            saveProjects();
            renderCopy();
            renderProjectTasks();
            renderGlobalTasks();
            
            showNotification('Copy and linked tasks deleted successfully');
        },
        copyId
    );
}

function removeLinkedTasks(sourceType, sourceId) {
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks = project.tasks.filter(task => 
                !(task.sourceItemType === sourceType && task.sourceItemId === sourceId)
            );
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

// Drag and drop functions
function handleDragStart(event) {
    const itemElement = event.currentTarget;
    const itemData = JSON.parse(itemElement.getAttribute('data-item'));
    const itemType = itemElement.getAttribute('data-type');
    
    draggedItem = itemData;
    draggedItemType = itemType;
    
    itemElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    draggedItem = null;
    draggedItemType = null;
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
    }
}

function handleDrop(event, targetType) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    if (!draggedItem || !draggedItemType) return;
    
    if (draggedItemType === targetType) {
        showNotification('Reordering within columns will be implemented soon');
        return;
    }
    
    if ((draggedItemType === 'note' && targetType === 'copy') || 
        (draggedItemType === 'copy' && targetType === 'note')) {
        moveItemBetweenColumns(draggedItem, draggedItemType, targetType);
        return;
    }
    
    createItemFromDrop(draggedItem, draggedItemType, targetType);
}

function moveItemBetweenColumns(item, fromType, toType) {
    if (!currentProject) return;
    
    const fromItems = getItemCollection(currentProject, fromType);
    const toItems = getItemCollection(currentProject, toType);
    
    setItemCollection(currentProject, fromType, fromItems.filter(i => i.id !== item.id));
    
    item.type = toType;
    item.order = 0;
    
    updateItemOrder(toItems, item, 0);
    toItems.unshift(item);
    setItemCollection(currentProject, toType, toItems);
    
    saveProjects();
    renderBriefs();
    renderNotes();
    renderCopy();
    
    showNotification(`Moved "${item.title}" to ${getItemDisplayName(toType)}s`);
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
        const existingTaskIndex = currentProject.tasks.findIndex(task => 
            task.sourceItemId === sourceItem.id && task.sourceItemType === sourceType
        );
        if (existingTaskIndex !== -1) {
            currentProject.tasks.splice(existingTaskIndex, 1);
        }
        
        newItem.completed = false;
        newItem.sourceItemId = sourceItem.id;
        newItem.sourceItemType = sourceType;
        newItem.order = 0;
        
        updateItemOrder(currentProject.tasks, newItem, 0);
        currentProject.tasks.unshift(newItem);
        renderProjectTasks();
        
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
        
        const items = getItemCollection(currentProject, targetType);
        newItem.order = 0;
        updateItemOrder(items, newItem, 0);
        items.unshift(newItem);
        setItemCollection(currentProject, targetType, items);
        
        if (targetType === 'note') {
            renderNotes();
        } else {
            renderCopy();
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
        
        updateItemOrder(currentProject.briefs, newItem, 0);
        currentProject.briefs.unshift(newItem);
        renderBriefs();
        
    } else {
        const items = getItemCollection(currentProject, targetType);
        newItem.order = 0;
        updateItemOrder(items, newItem, 0);
        items.unshift(newItem);
        setItemCollection(currentProject, targetType, items);
        
        if (targetType === 'note') {
            renderNotes();
        } else if (targetType === 'copy') {
            renderCopy();
        }
    }
    
    saveProjects();
    showNotification(`Created ${getItemDisplayName(targetType).toLowerCase()} "${newItem.title}" from ${getItemDisplayName(sourceType).toLowerCase()}`);
}

// Autosave functions
function updateAutosaveStatus(status) {
    const autosaveText = getEl('autosaveText');
    if (!autosaveText) return;
    
    const configs = {
        saving: { text: 'Saving...', color: '#171717' },
        saved: { text: 'Saved', color: '#16a34a' },
        changes: { text: 'Unsaved changes...', color: '#f59e0b' },
        ready: { text: 'Ready', color: '#737373' }
    };
    
    const config = configs[status] || configs.ready;
    autosaveText.textContent = config.text;
    autosaveText.style.color = config.color;
    
    if (status === 'saved') {
        setTimeout(() => {
            autosaveText.textContent = 'Ready';
            autosaveText.style.color = '#737373';
        }, 2000);
    }
}

function debouncedAutosave() {
    clearTimeout(autosaveTimeout);
    hasUnsavedChanges = true;
    updateAutosaveStatus('changes');
    
    autosaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) {
            autosaveItem();
        }
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
    currentEditingItem.title = newTitle;
    currentEditingItem.lastModified = getCurrentTimestamp();
    
    let contentChanged = oldTitle !== newTitle;
    
    if (currentEditingType === 'brief') {
        const oldProposition = currentEditingItem.proposition || '';
        const oldClientBrief = currentEditingItem.clientBrief || '';
        const newProposition = getValue('editorProposition');
        const newClientBrief = getValue('editorClientBrief');
        
        contentChanged = contentChanged || (oldProposition !== newProposition) || (oldClientBrief !== newClientBrief);
        
        currentEditingItem.proposition = newProposition;
        currentEditingItem.clientBrief = newClientBrief;
        delete currentEditingItem.content;
    } else {
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            const oldContent = currentEditingItem.content || '';
            const newContent = htmlToText(richEditor.innerHTML);
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
            currentEditingItem.richContent = richEditor.innerHTML;
        } else if (textEditor) {
            const oldContent = currentEditingItem.content || '';
            const newContent = textEditor.value.trim();
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
        }
    }
    
    if (contentChanged && currentProject) {
        moveItemToTop(currentEditingItem, currentEditingType);
    }
    
    saveProjects();
    
    if (currentProject) {
        saveCurrentContext();
    }
    
    hasUnsavedChanges = false;
    updateAutosaveStatus('saved');
    
    setTimeout(() => {
        switch(currentEditingType) {
            case 'brief': renderBriefs(); break;
            case 'note': renderNotes(); break;
            case 'copy': renderCopy(); break;
            case 'task': renderProjectTasks(); break;
        }
    }, 100);
}

function moveItemToTop(item, itemType) {
    if (!currentProject || !item) return;
    
    const itemArray = getItemCollection(currentProject, itemType);
    updateItemOrder(itemArray, item, 0);
}

function setupAutosaveListeners() {
    const elementIds = ['editorItemTitle', 'editorProposition', 'editorClientBrief', 'richEditor', 'editorContent'];
    
    elementIds.forEach(id => {
        const element = getEl(id);
        if (element) {
            element.addEventListener('input', debouncedAutosave);
            if (element.tagName === 'TEXTAREA' || element.contentEditable === 'true') {
                element.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
            }
        }
    });
}

// Task source functions
function openTaskSource(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task || !task.sourceItemId || !task.sourceItemType) {
        openItemEditor(task, 'task');
        return;
    }
    
    const sourceItem = findItem(task.sourceItemId, task.sourceItemType);
    
    if (sourceItem) {
        const editorModal = getEl('itemEditor');
        if (editorModal.style.display === 'block') {
            closeEditor();
        }
        
        setTimeout(() => {
            openItemEditor(sourceItem, task.sourceItemType);
        }, 100);
    } else {
        openItemEditor(task, 'task');
    }
}

function diveInToProjectSource(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task || !task.sourceItemId || !task.sourceItemType || 
        (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    const sourceItem = findItem(task.sourceItemId, task.sourceItemType);
    
    if (sourceItem) {
        openItemEditor(sourceItem, task.sourceItemType);
        
        setTimeout(() => {
            if (pomodoroIsBreak) {
                pomodoroIsBreak = false;
                pomodoroTimeLeft = 25 * 60;
                updatePomodoroDisplay();
                updatePomodoroStatus();
            }
            
            if (!pomodoroIsRunning) {
                startPomodoro();
            }
            
            showNotification(`Diving into "${sourceItem.title}" - Focus mode activated!`);
        }, 300);
    } else {
        showNotification('Source item not found');
    }
}

// Pomodoro persistence functions
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
        
        if (savedState.isRunning && pomodoroTimeLeft <= 0) {
            completePomodoro();
        }
    }
}

function clearPomodoroState() {
    localStorage.removeItem('pomodoroState');
}

// Pomodoro Timer Functions
function startPomodoro() {
    pomodoroIsRunning = true;
    setDisplay('pomodoroStart', 'none');
    setDisplay('pomodoroPause', 'inline-block');
    
    updatePomodoroHeaderStyle();
    updatePomodoroStatus();
    savePomodoroState();
    
    if (!pomodoroIsBreak) {
        enterFocusMode();
    }
    
    pomodoroTimer = setInterval(() => {
        pomodoroTimeLeft--;
        updatePomodoroDisplay();
        
        if (pomodoroTimeLeft % 10 === 0) {
            savePomodoroState();
        }
        
        if (pomodoroTimeLeft <= 0) {
            completePomodoro();
        }
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
    
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
    }
    
    if (pomodoroIsBreak) {
        pomodoroIsBreak = false;
        pomodoroTimeLeft = 25 * 60;
        
        if (workContext.currentContext) {
            setTimeout(() => {
                restoreContext(workContext.currentContext);
                createContextIndicator('Work resumed after break', true);
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
    }
}

function setupFullscreenOverlay() {
    const existing = getEl('focusOverlay');
    if (existing) existing.remove();
    
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-overlay';
    overlay.id = 'focusOverlay';
    overlay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
            <span>Focus Mode</span>
            <span id="overlayTimer">${Math.floor(pomodoroTimeLeft / 60)}:${(pomodoroTimeLeft % 60).toString().padStart(2, '0')}</span>
            <button onclick="exitFocusMode()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 6px; border-radius: 2px; font-size: 10px; margin-left: 8px; cursor: pointer;">Exit</button>
        </div>
    `;
    document.body.appendChild(overlay);
}

function exitFocusMode() {
    const editorModal = getEl('itemEditor');
    
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    
    editorModal.classList.remove('fullscreen', 'true-fullscreen');
    
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
    if (overlayTimer) {
        overlayTimer.textContent = timeString;
    }
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
    } catch (error) {
        console.log('Audio notification not available');
    }
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

// Essential functions
function openProjectModal() {
    showModal('projectModal');
}

function closeModal(modalId) {
    hideModal(modalId);
    
    if (modalId === 'confirmModal') {
        confirmCallback = null;
        confirmData = null;
    }
}

function closeEditor() {
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
    }
    
    if (pomodoroIsRunning) {
        pausePomodoro();
    }
    
    exitFocusMode();
    
    hideModal('itemEditor');
    currentEditingItem = null;
    currentEditingType = null;
}

function showProjectOverview() {
    setDisplay('dashboard', 'none');
    setDisplay('projectOverview', 'block');
    setValue('projectSelect', '');
    setDisplay('topTasksRow', 'none');
    currentProject = null;
    
    removeProjectTheme();
    updateSettingsButton();
    renderProjectOverview();
    renderGlobalTasks();
}

function toggleArchivedProjects() {
    try {
        showArchived = !showArchived;
        const button = getEl('archiveToggle');
        if (button) {
            button.innerHTML = showArchived ? 'Hide Archived' : 'Show Archived';
        }
        renderProjectOverview();
    } catch (error) {
        console.error('Error toggling archived projects:', error);
    }
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
    } catch (error) {
        console.error('Error toggling archive status:', error);
    }
}

function selectProject(projectId) {
    setValue('projectSelect', projectId);
    switchProject();
}

function switchProject() {
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
        createContextIndicator(`Work saved: ${currentEditingItem.title}`);
    }
    
    const select = getEl('projectSelect');
    const projectId = select.value;
    
    if (projectId) {
        currentProject = projects.find(p => p.id == projectId);
        setDisplay('dashboard', 'grid');
        setDisplay('projectOverview', 'none');
        setDisplay('topTasksRow', 'flex');
        
        applyProjectTheme(currentProject);
        updateSettingsButton();
        renderProject();
        
        const contextKey = `project-${projectId}`;
        const projectContext = workContext.projectContexts.get(contextKey);
        if (projectContext?.editorState) {
            setTimeout(() => {
                const timeDiff = Date.now() - projectContext.timestamp;
                if (timeDiff < 4 * 60 * 60 * 1000) {
                    restoreContext(projectContext);
                    createContextIndicator(`Resumed work on "${projectContext.title}"`, true);
                }
            }, 500);
        }
    } else {
        showProjectOverview();
    }
}

function getLinkedItemsCount(briefId) {
    let count = 0;
    if (currentProject?.notes) {
        count += currentProject.notes.filter(note => note.linkedBriefId === briefId).length;
    }
    if (currentProject?.copy) {
        count += currentProject.copy.filter(copy => copy.linkedBriefId === briefId).length;
    }
    return count;
}

// Rich text editor functions
function formatRichText(command, value = null) {
    document.execCommand(command, false, value);
    getEl('richEditor').focus();
}

function createLink() {
    const url = prompt('Enter URL:');
    if (url) {
        formatRichText('createLink', url);
    }
}

function copyContentToClipboard() {
    let contentToCopy = '';
    let htmlContent = '';
    
    if (currentEditingType === 'brief') {
        const title = getValue('editorItemTitle');
        const proposition = getValue('editorProposition');
        const clientBrief = getValue('editorClientBrief');
        
        contentToCopy = title;
        if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
        if (clientBrief) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBrief;
        
        htmlContent = `<h3>${title}</h3>`;
        if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
        if (clientBrief) htmlContent += `<h4>CLIENT BRIEF:</h4><p>${clientBrief.replace(/\n/g, '<br>')}</p>`;
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
        }).catch(() => {
            fallbackCopyToClipboard(contentToCopy);
        });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(contentToCopy).then(() => {
            showNotification('Content copied to clipboard!');
        }).catch(() => {
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
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

function openItemEditor(item, itemType) {
    if (!item) return;
    
    if (currentEditingItem) {
        saveCurrentContext();
    }
    
    currentEditingItem = item;
    currentEditingType = itemType;
    hasUnsavedChanges = false;
    
    if (currentProject) {
        addToBreadcrumbs(currentProject.id, item.id, itemType, item.title);
    }
    
    setContent('editorTitle', `Edit ${getItemDisplayName(itemType)}`);
    setValue('editorItemTitle', item.title || '');
    
    const briefFields = getEl('briefFields');
    const standardFields = getEl('standardFields');
    const insertHeadingsBtn = getEl('insertHeadingsBtn');
    const copyToClipboardBtn = getEl('copyToClipboardBtn');
    const richEditor = getEl('richEditor');
    const textEditor = getEl('editorContent');
    
    if (itemType === 'brief') {
        setDisplay('briefFields', 'block');
        setDisplay('standardFields', 'none');
        
        setValue('editorProposition', item.proposition || '');
        setValue('editorClientBrief', item.clientBrief || item.content || '');
    } else {
        setDisplay('briefFields', 'none');
        setDisplay('standardFields', 'block');
        
        if (itemType === 'note' || itemType === 'copy') {
            setDisplay('richEditor', 'block');
            setDisplay('editorContent', 'none');
            
            if (item.richContent) {
                richEditor.innerHTML = item.richContent;
            } else {
                richEditor.innerHTML = textToHtml(item.content || '');
            }
        } else {
            setDisplay('richEditor', 'none');
            setDisplay('editorContent', 'block');
            setValue('editorContent', item.content || '');
        }
        
        toggleDisplay('insertHeadingsBtn', itemType === 'note');
        toggleDisplay('copyToClipboardBtn', itemType === 'note' || itemType === 'copy');
    }
    
    showModal('itemEditor');
    
    setTimeout(() => {
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
                if (pomodoroTimer) {
                    pomodoroTimer.style.display = 'none';
                }
            }
        };
        
        setTimeout(setupPomodoroTimer, 50);
    }, 100);
    
    setTimeout(() => {
        setupAutosaveListeners();
        updateAutosaveStatus('ready');
        
        const contextKey = `project-${currentProject.id}`;
        const existingContext = workContext.projectContexts.get(contextKey);
        if (existingContext && 
            existingContext.itemId == item.id && 
            existingContext.itemType == itemType &&
            existingContext.editorState) {
            
            setTimeout(() => {
                restoreEditorState(existingContext);
                createContextIndicator('Previous work state restored', true);
            }, 200);
        }
    }, 100);
}

function insertStandardHeadings() {
    const richEditor = getEl('richEditor');
    let proposition = '';
    
    if (currentEditingType === 'note' && currentEditingItem.linkedBriefId) {
        const linkedBrief = currentProject.briefs.find(b => b.id === currentEditingItem.linkedBriefId);
        if (linkedBrief && linkedBrief.proposition) {
            proposition = linkedBrief.proposition;
        }
    }
    
    const headingsHtml = `
        <h2>PROPOSITION</h2>
        <p>${proposition}</p>
        <br>
        <h2>1: INSIGHT</h2>
        <p><br></p>
        <br>
        <h2>2: IDEA</h2>
        <p><br></p>
        <br>
        <h2>3: EXECUTION</h2>
        <p><br></p>
    `;
    
    if (richEditor.style.display !== 'none') {
        richEditor.innerHTML = headingsHtml + richEditor.innerHTML;
        richEditor.focus();
    } else {
        const textarea = getEl('editorContent');
        const headings = `## PROPOSITION
${proposition}

## 1: INSIGHT


## 2: IDEA


## 3: EXECUTION


`;
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
        
        projects.push(project);
        saveProjects();
        updateProjectSelector();
        closeModal('projectModal');
        
        setValue('newProjectName', '');
        setValue('newProjectDescription', '');
        
        renderProjectOverview();
    }
}

// Quick add functions for input fields
function addQuickBrief() {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const title = getValue('briefTitle');
    if (title) {
        const brief = {
            id: generateId(),
            title,
            proposition: '',
            clientBrief: '',
            type: 'brief',
            linkColor: getNextLinkColor(),
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        
        updateItemOrder(currentProject.briefs, brief, 0);
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
        
        updateItemOrder(currentProject.notes, note, 0);
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
        
        updateItemOrder(currentProject.copy, copy, 0);
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
        
        updateItemOrder(currentProject.tasks, task, 0);
        currentProject.tasks.unshift(task);
        saveProjects();
        renderProjectTasks();
        
        setValue('taskTitle', '');
    }
}

function toggleProjectTask(taskId) {
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? getCurrentTimestamp() : undefined;
        
        if (task.completed) {
            const uniqueId = createTaskUniqueId(currentProject.id, taskId);
            globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
            globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
            saveGlobalTaskOrder();
        }
        
        saveProjects();
        renderProjectTasks();
        
        setTimeout(() => renderGlobalTasks(), 100);
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

// Render functions
function renderProjectOverview() {
    const grid = getEl('projectGrid');
    if (!grid) return;
    
    if (!Array.isArray(projects)) {
        projects = [];
    }
    
    const visibleProjects = projects.filter(project => 
        showArchived ? true : !project.archived
    );
    
    if (visibleProjects.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #a3a3a3;">
                <div style="font-size: 14px; margin-bottom: 8px;">No projects</div>
                <div style="font-size: 12px; color: #d4d4d4;">Create your first project to get started</div>
            </div>
        `;
    } else {
        grid.innerHTML = visibleProjects.map(project => {
            const totalTasks = (project.tasks || []).length;
            const briefsCount = (project.briefs || []).length;
            const notesCount = (project.notes || []).length;
            const copyCount = (project.copy || []).length;
            const colorTheme = project.colorTheme || 'blue';
            
            return `
                <div class="project-card project-theme-${colorTheme} project-themed ${project.archived ? 'archived-project' : ''}" 
                     onclick="selectProject(${project.id})">
                    <div class="project-title">${project.name || 'Untitled Project'}</div>
                    <div style="color: #737373; font-size: 14px; margin-bottom: 16px;">
                        ${project.description || 'No description'}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0;">
                        <div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;">
                            <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${briefsCount}</div>
                            <div style="font-size: 12px; color: #737373;">Briefs</div>
                        </div>
                        <div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;">
                            <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${notesCount}</div>
                            <div style="font-size: 12px; color: #737373;">Notes</div>
                        </div>
                        <div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;">
                            <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${copyCount}</div>
                            <div style="font-size: 12px; color: #737373;">Copy</div>
                        </div>
                        <div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;">
                            <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${totalTasks}</div>
                            <div style="font-size: 12px; color: #737373;">Tasks</div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                        <div style="font-size: 12px; color: #737373;">
                            Created: ${project.createdAt ? formatDate(project.createdAt) : 'Unknown'}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="archive-btn" onclick="event.stopPropagation(); openProjectSettings(${project.id})" style="background: #171717;">
                                Settings
                            </button>
                            <button class="archive-btn" onclick="event.stopPropagation(); toggleArchiveProject(${project.id})">
                                ${project.archived ? 'Restore' : 'Archive'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function renderProject() {
    if (!currentProject) return;
    
    renderBriefs();
    renderNotes();
    renderCopy();
    renderProjectTasks();
}

function renderBriefs() {
    const list = getEl('briefsList');
    if (!currentProject.briefs) currentProject.briefs = [];
    
    ensureItemOrder(currentProject.briefs);
    const sortedBriefs = [...currentProject.briefs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedBriefs.map(brief => {
        const linkedCount = getLinkedItemsCount(brief.id);
        
        if (!brief.linkColor) {
            brief.linkColor = getNextLinkColor();
            setTimeout(() => saveProjects(), 0);
        }
        
        const borderColor = brief.linkColor || '#a3a3a3';
        const proposition = brief.proposition || '';
        const clientBrief = brief.clientBrief || brief.content || '';
        
        let content = '';
        content += createBriefSectionHTML('Proposition', proposition, 'proposition');
        content += createBriefSectionHTML('Client Brief', clientBrief, 'client');
        
        if (linkedCount > 0) {
            content += `<div class="item-meta">${linkedCount} linked item${linkedCount > 1 ? 's' : ''}</div>`;
        }
        
        return createItemHTML(brief, 'brief', borderColor, linkedCount > 0, content, 'Double-click to edit • Drag to create linked items');
    }).join('');
}

function renderNotes() {
    const list = getEl('notesList');
    if (!currentProject.notes) currentProject.notes = [];
    
    ensureItemOrder(currentProject.notes);
    const sortedNotes = [...currentProject.notes].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedNotes.map(note => {
        const isLinked = note.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === note.linkedBriefId) : null;
        const linkColor = getLinkColor(note, 'note');
        const borderColor = linkColor || '#a3a3a3';
        
        let content = '';
        if (note.content) {
            content += `<div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                ${truncateContent(note.content)}
            </div>`;
        }
        if (isLinked && linkedBrief) {
            content += `<div class="item-meta">Linked to "${linkedBrief.title}"</div>`;
        }
        
        return createItemHTML(note, 'note', borderColor, isLinked, content, 'Double-click to edit • Drag to create task');
    }).join('');
}

function renderCopy() {
    const list = getEl('copyList');
    if (!currentProject.copy) currentProject.copy = [];
    
    ensureItemOrder(currentProject.copy);
    const sortedCopy = [...currentProject.copy].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedCopy.map(copy => {
        const isLinked = copy.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === copy.linkedBriefId) : null;
        const linkColor = getLinkColor(copy, 'copy');
        const borderColor = linkColor || '#a3a3a3';
        
        let content = '';
        if (copy.content) {
            content += `<div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                ${truncateContent(copy.content)}
            </div>`;
        }
        if (isLinked && linkedBrief) {
            content += `<div class="item-meta">Linked to "${linkedBrief.title}"</div>`;
        }
        
        return createItemHTML(copy, 'copy', borderColor, isLinked, content, 'Double-click to edit • Drag to create task');
    }).join('');
}

function renderProjectTasks() {
    const container = getEl('projectTaskContainer');
    if (!container || !currentProject) return;
    
    if (!currentProject.tasks) currentProject.tasks = [];
    
    ensureItemOrder(currentProject.tasks);
    const sortedTasks = filterAndSortTasks(currentProject.tasks);
    
    if (sortedTasks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #737373;">No tasks yet</div>';
        return;
    }
    
    container.innerHTML = sortedTasks.map(task => {
        const hasSource = task.sourceItemId && task.sourceItemType;
        let sourceItem = null;
        if (hasSource) {
            sourceItem = findItem(task.sourceItemId, task.sourceItemType);
        }
        
        const linkColor = getLinkColor(task, 'task') || '#10b981';
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        
        let content = '';
        if (hasSource && sourceItem) {
            content += `<div style="font-size: 12px; color: #737373;">From: "${sourceItem.title}"</div>`;
        }
        
        if (task.content) {
            content += `
                <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                    ${truncateContent(task.content)}
                </div>
            `;
        }
        
        if (canDiveIn) {
            content += `
                <div style="margin-top: 8px;">
                    <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToProjectSource('${task.id}')" title="Open in focus mode with Pomodoro">
                        Dive In
                    </span>
                </div>
            `;
        }
        
        return `
            <div class="project-task-item" 
                 draggable="true"
                 data-item='${JSON.stringify(task).replace(/'/g, '&#39;')}'
                 data-type="task"
                 ondragstart="handleDragStart(event)"
                 ondragend="handleDragEnd(event)"
                 ondblclick="openTaskSource('${task.id}')"
                 style="
                    background: white;
                    border: 1px solid #e5e5e5;
                    border-left: 3px solid ${linkColor};
                    border-radius: 4px;
                    margin-bottom: 12px;
                    padding: 0px;
                    position: relative;
                    cursor: grab;
                    transition: all 0.2s ease;
                    ${task.completed ? 'opacity: 0.6;' : ''}
                 ">
                
                <div style="position: absolute; top: 8px; right: 8px; background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Task</div>
                
                <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                    <div style="background-color: transparent; border: none; margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" 
                               ${task.completed ? 'checked' : ''}
                               onclick="event.stopPropagation(); toggleProjectTask('${task.id}')"
                               style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                    </div>
                    <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px;">
                        <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                    </div>
                </div>
                
                <div style="position: absolute; left: 8px; top: 16px;">
                    <div class="grab-handle"></div>
                </div>
                
                <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                    Created: ${formatDate(task.createdAt)}
                    ${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
                </div>
                
                ${content}
                
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px;">
                    ${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to create task
                </div>
            </div>
        `;
    }).join('');
}

function findItem(itemId, itemType) {
    if (!currentProject) return null;
    
    const items = getItemCollection(currentProject, itemType);
    return items.find(item => item.id == itemId);
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
    showModal('projectSettingsModal');
    
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
            applyProjectTheme(project);
        }
        
        renderProjectOverview();
        window.currentSettingsProject = null;
    }
}

function saveProjects() {
    saveToStorage('projects', projects);
    
    setTimeout(() => {
        cleanupOldCompletedTasks();
    }, 100);
    
    if (getEl('projectOverview').style.display === 'block') {
        cleanupGlobalTaskOrder();
        renderGlobalTasks();
    }
}

function cleanupGlobalTaskOrder() {
    const allTasks = getAllTasks();
    const validTaskIds = new Set(allTasks.map(task => createTaskUniqueId(task.projectId, task.id)));
    
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => validTaskIds.has(id));
    globalTaskOrder.other = globalTaskOrder.other.filter(id => validTaskIds.has(id));
    
    saveGlobalTaskOrder();
}

// Setup delete button event listeners
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

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    try {
        loadWorkContext();
        
        const savedProjects = loadFromStorage('projects');
        if (savedProjects) {
            projects = Array.isArray(savedProjects) ? savedProjects : [];
            
            projects.forEach(project => {
                if (!project.colorTheme) {
                    project.colorTheme = getNextColorTheme();
                }
                if (project.archived === undefined) {
                    project.archived = false;
                }
                
                ['briefs', 'notes', 'copy', 'tasks'].forEach(type => {
                    if (!project[type]) project[type] = [];
                });
                
                if (project.briefs) {
                    project.briefs.forEach(brief => {
                        if (brief.content && !brief.proposition && !brief.clientBrief) {
                            brief.clientBrief = brief.content;
                            brief.proposition = '';
                            delete brief.content;
                        }
                        if (brief.proposition === undefined) brief.proposition = '';
                        if (brief.clientBrief === undefined) brief.clientBrief = '';
                        if (!brief.linkColor) {
                            brief.linkColor = getNextLinkColor();
                        }
                    });
                }
                
                ['briefs', 'notes', 'copy', 'tasks'].forEach(type => {
                    ensureItemOrder(project[type]);
                });
            });
            
            saveProjects();
            initializeLinkColorIndex();
        } else {
            projects = [];
            initializeLinkColorIndex();
        }
        
        loadGlobalTaskOrder();
        cleanupGlobalTaskOrder();
        cleanupOldCompletedTasks();
        
        const today = new Date().toDateString();
        const savedDaily = loadFromStorage('pomodoroDaily');
        
        if (savedDaily) {
            pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
        }
        
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        renderBreadcrumbs();
        
        setInterval(() => {
            cleanupOldCompletedTasks();
        }, 60 * 60 * 1000);
        
        setTimeout(() => {
            offerWorkResumption();
        }, 2000);
        
    } catch (error) {
        console.error('Error during initialization:', error);
        projects = [];
        initializeLinkColorIndex();
        loadGlobalTaskOrder();
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        renderBreadcrumbs();
    }
});

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        const editorModal = getEl('itemEditor');
        if (editorModal) {
            editorModal.classList.remove('true-fullscreen');
            editorModal.classList.remove('fullscreen');
        }
        
        const overlay = getEl('focusOverlay');
        if (overlay) {
            overlay.remove();
        }
        
        document.body.style.cursor = 'default';
    }
});

// Close modals when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('editor-modal')) {
        if (event.target.id === 'confirmModal') {
            cancelConfirm();
        } else {
            event.target.style.display = 'none';
        }
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const confirmModal = getEl('confirmModal');
        if (confirmModal.style.display === 'block') {
            cancelConfirm();
            return;
        }
        
        const editorModal = getEl('itemEditor');
        if (editorModal && (editorModal.classList.contains('fullscreen') || editorModal.classList.contains('true-fullscreen'))) {
            exitFocusMode();
            if (pomodoroIsRunning) {
                pausePomodoro();
            }
            return;
        }
        
        document.querySelectorAll('.modal, .editor-modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    if (e.key === 'Enter') {
        const confirmModal = getEl('confirmModal');
        if (confirmModal.style.display === 'block') {
            proceedConfirm();
            return;
        }
    }
    
    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        if (getEl('itemEditor').style.display === 'block') {
            autosaveItem();
            createContextIndicator('Work saved with context preserved');
        }
    }
    
    if (e.key === 'b' && e.altKey) {
        e.preventDefault();
        const breadcrumbContainer = getEl('breadcrumbContainer');
        if (breadcrumbContainer.style.display !== 'none') {
            const breadcrumbs = document.querySelectorAll('.breadcrumb-item');
            if (breadcrumbs.length > 0) {
                breadcrumbs[breadcrumbs.length - 1].focus();
            }
        }
    }
    
    if (e.key === 'R' && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        if (workContext.currentContext) {
            if (!currentProject || currentProject.id != workContext.currentContext.projectId) {
                switchToProject(workContext.currentContext.projectId, () => {
                    setTimeout(() => {
                        restoreContext(workContext.currentContext);
                    }, 200);
                });
            } else {
                restoreContext(workContext.currentContext);
            }
            createContextIndicator(`Resumed work on "${workContext.currentContext.title}"`, true);
        }
    }
    
    if (getEl('itemEditor').style.display === 'block') {
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

// Make all functions available globally
window.openProjectModal = openProjectModal;
window.closeModal = closeModal;
window.closeEditor = closeEditor;
window.showProjectOverview = showProjectOverview;
window.toggleArchivedProjects = toggleArchivedProjects;
window.selectProject = selectProject;
window.switchProject = switchProject;
window.createProject = createProject;
window.addQuickBrief = addQuickBrief;
window.addQuickNote = addQuickNote;
window.addQuickCopy = addQuickCopy;
window.addQuickTask = addQuickTask;
window.handleEnterKey = handleEnterKey;
window.openItemEditor = openItemEditor;
window.findItem = findItem;
window.handleDragStart = handleDragStart;
window.handleDragEnd = handleDragEnd;
window.handleDragOver = handleDragOver;
window.handleDragLeave = handleDragLeave;
window.handleDrop = handleDrop;
window.formatRichText = formatRichText;
window.createLink = createLink;
window.copyContentToClipboard = copyContentToClipboard;
window.insertStandardHeadings = insertStandardHeadings;
window.openProjectSettings = openProjectSettings;
window.saveProjectSettings = saveProjectSettings;
window.exitFocusMode = exitFocusMode;
window.deleteBrief = deleteBrief;
window.deleteNote = deleteNote;
window.deleteCopy = deleteCopy;
window.showConfirm = showConfirm;
window.proceedConfirm = proceedConfirm;
window.cancelConfirm = cancelConfirm;
window.toggleArchiveProject = toggleArchiveProject;
window.handleGlobalTaskDragStart = handleGlobalTaskDragStart;
window.handleGlobalTaskDragEnd = handleGlobalTaskDragEnd;
window.handleTaskDragOver = handleTaskDragOver;
window.handleTaskDragLeave = handleTaskDragLeave;
window.handleTaskDrop = handleTaskDrop;
window.toggleGlobalTask = toggleGlobalTask;
window.openGlobalTaskSource = openGlobalTaskSource;
window.diveInToGlobalSource = diveInToGlobalSource;
window.navigateToBreadcrumb = navigateToBreadcrumb;
window.clearBreadcrumbs = clearBreadcrumbs;
window.dismissResumePanel = dismissResumePanel;
window.resumeWork = resumeWork;
window.startPomodoro = startPomodoro;
window.pausePomodoro = pausePomodoro;
window.resetPomodoro = resetPomodoro;
window.skipPomodoro = skipPomodoro;
window.openTaskSource = openTaskSource;
window.diveInToProjectSource = diveInToProjectSource;
window.toggleProjectTask = toggleProjectTask;

// Helper render functions with original names for compatibility
window.renderBriefs = renderBriefs;
window.renderNotes = renderNotes;
window.renderCopy = renderCopy;
window.renderProjectTasks = renderProjectTasks;
