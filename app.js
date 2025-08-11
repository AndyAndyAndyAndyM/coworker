// ===== STATE MANAGEMENT =====
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
let pomodoroTimeLeft = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroIsBreak = false;
let pomodoroSessionCount = 0;
let pomodoroDailyCount = 0;

// Context preservation
let workContext = {
    breadcrumbs: [],
    currentContext: null,
    projectContexts: new Map(),
    globalContext: null
};

// Custom confirmation modal
let confirmCallback = null;
let confirmData = null;

// Constants
const colorThemes = ['blue', 'green', 'purple', 'pink', 'orange', 'teal', 'indigo', 'red'];
const linkColors = ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1'];
let nextLinkColorIndex = 0;

const itemTypes = {
    brief: { plural: 'briefs', displayName: 'Brief', color: 'type-brief' },
    note: { plural: 'notes', displayName: 'Note', color: 'type-note' },
    copy: { plural: 'copy', displayName: 'Copy', color: 'type-copy' },
    task: { plural: 'tasks', displayName: 'Task', color: 'type-task' }
};

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

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showConfirm(title, message, callback, data = null) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'block';
    confirmCallback = callback;
    confirmData = data;
}

function proceedConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    if (confirmCallback) confirmCallback(confirmData);
    confirmCallback = null;
    confirmData = null;
}

function cancelConfirm() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
    confirmData = null;
}

// ===== ITEM MANAGEMENT =====
function findItem(itemId, itemType) {
    if (!currentProject) return null;
    const collection = currentProject[itemTypes[itemType].plural];
    return collection?.find(item => item.id == itemId);
}

function getAllItems(itemType) {
    if (!currentProject) return [];
    return currentProject[itemTypes[itemType].plural] || [];
}

function createItem(itemType, data) {
    const newItem = {
        id: Date.now(),
        type: itemType,
        createdAt: new Date().toISOString(),
        order: 0,
        ...data
    };
    
    // Handle special cases
    if (itemType === 'brief') {
        newItem.linkColor = getNextLinkColor();
        newItem.proposition = data.proposition || '';
        newItem.clientBrief = data.clientBrief || '';
    } else if (itemType === 'task') {
        newItem.completed = false;
    }
    
    return newItem;
}

function addItemToProject(item, itemType) {
    const collection = itemTypes[itemType].plural;
    if (!currentProject[collection]) currentProject[collection] = [];
    
    // Update order of existing items
    currentProject[collection].forEach(existingItem => {
        if (existingItem.order !== undefined) existingItem.order += 1;
    });
    
    currentProject[collection].unshift(item);
    saveProjects();
}

function deleteItem(itemId, itemType) {
    const displayName = itemTypes[itemType].displayName;
    
    showConfirm(
        `Delete ${displayName}`,
        `Are you sure you want to delete this ${displayName.toLowerCase()}? This will also remove any linked items.`,
        () => {
            const collection = itemTypes[itemType].plural;
            const parsedId = parseInt(itemId);
            
            currentProject[collection] = currentProject[collection].filter(item => item.id !== parsedId);
            
            // Handle cascading deletes
            if (itemType === 'brief') {
                currentProject.notes = currentProject.notes.filter(note => note.linkedBriefId !== parsedId);
                currentProject.copy = currentProject.copy.filter(copy => copy.linkedBriefId !== parsedId);
            }
            
            // Remove linked tasks from all projects
            projects.forEach(project => {
                if (project.tasks) {
                    project.tasks = project.tasks.filter(task => 
                        !(task.sourceItemType === itemType && task.sourceItemId === parsedId)
                    );
                }
            });
            
            removeFromBreadcrumbs(itemType, parsedId);
            cleanupGlobalTaskOrder();
            saveProjects();
            renderProject();
            renderGlobalTasks();
            
            showNotification(`${displayName} and linked items deleted successfully`);
        },
        itemId
    );
}

function moveItemToTop(item, itemType) {
    if (!currentProject || !item) return;
    
    const collection = currentProject[itemTypes[itemType].plural];
    collection.forEach(arrayItem => {
        if (arrayItem.id === item.id) {
            arrayItem.order = 0;
        } else if (arrayItem.order !== undefined) {
            arrayItem.order += 1;
        }
    });
}

// ===== QUICK ADD FUNCTIONS =====
function addQuickItem(itemType) {
    if (!currentProject) {
        alert('Please select a project first');
        return;
    }
    
    const titleFieldId = `${itemType}Title`;
    const title = document.getElementById(titleFieldId).value.trim();
    
    if (title) {
        const item = createItem(itemType, { title });
        addItemToProject(item, itemType);
        renderItems(itemType);
        document.getElementById(titleFieldId).value = '';
    }
}

// Specific quick add functions
window.addQuickBrief = () => addQuickItem('brief');
window.addQuickNote = () => addQuickItem('note');
window.addQuickCopy = () => addQuickItem('copy');
window.addQuickTask = () => addQuickItem('task');

// ===== RENDERING FUNCTIONS =====
function getLinkColor(item, itemType) {
    if (itemType === 'brief' && item.linkColor) return item.linkColor;
    if ((itemType === 'note' || itemType === 'copy') && item.linkedBriefId) {
        const brief = currentProject.briefs.find(b => b.id === item.linkedBriefId);
        return brief?.linkColor;
    }
    if (itemType === 'task' && item.sourceItemId && item.sourceItemType) {
        const sourceItem = findItem(item.sourceItemId, item.sourceItemType);
        if (sourceItem) return getLinkColor(sourceItem, item.sourceItemType);
    }
    return null;
}

function renderItems(itemType) {
    const listId = `${itemType}${itemType === 'copy' ? 'List' : 'sList'}`;
    const list = document.getElementById(listId);
    if (!list) return;
    
    const items = getAllItems(itemType);
    if (!items.length) {
        list.innerHTML = `<div style="text-align: center; padding: 20px; color: #737373;">No ${itemType}s yet</div>`;
        return;
    }
    
    // Ensure order values and sort
    items.forEach((item, index) => {
        if (item.order === undefined) item.order = index;
    });
    
    const sortedItems = itemType === 'task' 
        ? sortTasksWithCompletedAtBottom(items)
        : [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedItems.map(item => renderItem(item, itemType)).join('');
}

function renderItem(item, itemType) {
    const config = itemTypes[itemType];
    const linkColor = getLinkColor(item, itemType) || '#a3a3a3';
    const isLinked = item.linkedBriefId || (itemType === 'brief' && getLinkedItemsCount(item.id) > 0);
    
    let content = '';
    let actions = 'Double-click to edit • Drag to create linked items';
    
    // Type-specific content
    if (itemType === 'brief') {
        content = renderBriefContent(item);
        const linkedCount = getLinkedItemsCount(item.id);
        if (linkedCount > 0) {
            content += `<div style="margin: 8px 0; font-size: 12px; color: #737373;">${linkedCount} linked item${linkedCount > 1 ? 's' : ''}</div>`;
        }
    } else if (itemType === 'task') {
        content = renderTaskContent(item);
        actions = item.sourceItemId ? 'Double-click to open source' : 'Double-click to edit';
    } else {
        if (item.content) {
            content = `<div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                ${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}
            </div>`;
        }
        if (item.linkedBriefId) {
            const linkedBrief = currentProject.briefs.find(b => b.id === item.linkedBriefId);
            if (linkedBrief) {
                content += `<div style="font-size: 12px; color: #737373;">Linked to "${linkedBrief.title}"</div>`;
            }
        }
    }
    
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
            <div class="item-type ${config.color}">${config.displayName}</div>
            <div class="item-header">
                <div class="item-title">${item.title}</div>
            </div>
            <div class="item-meta">
                Created: ${new Date(item.createdAt).toLocaleDateString()}
                ${item.completed && item.completedAt ? ` • Completed: ${new Date(item.completedAt).toLocaleDateString()}` : ''}
            </div>
            ${content}
            <div class="item-actions">
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">${actions}</div>
                <button class="delete-btn" data-delete-type="${itemType}" data-delete-id="${item.id}">×</button>
            </div>
        </div>
    `;
}

function renderBriefContent(brief) {
    const proposition = brief.proposition || '';
    const clientBrief = brief.clientBrief || brief.content || '';
    let content = '';
    
    if (proposition.trim()) {
        content += `
            <div style="margin: 8px 0; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 600; color: #0369a1; text-transform: uppercase; margin-bottom: 4px;">Proposition</div>
                <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                    ${proposition.substring(0, 120)}${proposition.length > 120 ? '...' : ''}
                </div>
            </div>
        `;
    }
    
    if (clientBrief.trim()) {
        content += `
            <div style="margin: 8px 0; padding: 8px; background: #fefce8; border-left: 3px solid #eab308; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 600; color: #a16207; text-transform: uppercase; margin-bottom: 4px;">Client Brief</div>
                <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                    ${clientBrief.substring(0, 120)}${clientBrief.length > 120 ? '...' : ''}
                </div>
            </div>
        `;
    }
    
    return content;
}

function renderTaskContent(task) {
    let content = '';
    const hasSource = task.sourceItemId && task.sourceItemType;
    
    if (hasSource) {
        const sourceItem = findItem(task.sourceItemId, task.sourceItemType);
        if (sourceItem) {
            content += `<div style="font-size: 12px; color: #737373;">From: "${sourceItem.title}"</div>`;
        }
    }
    
    if (task.content) {
        content += `
            <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                ${task.content.substring(0, 100)}${task.content.length > 100 ? '...' : ''}
            </div>
        `;
    }
    
    // Add dive-in button for note/copy sources
    if (hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy')) {
        content += `
            <div style="margin-top: 8px;">
                <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" 
                      onclick="event.stopPropagation(); diveInToProjectSource('${task.id}')" 
                      title="Open in focus mode with Pomodoro">
                    Dive In
                </span>
            </div>
        `;
    }
    
    return content;
}

function renderProject() {
    if (!currentProject) return;
    renderItems('brief');
    renderItems('note');
    renderItems('copy');
    renderItems('task');
}

// Update specific render function names
window.renderBriefs = () => renderItems('brief');
window.renderNotes = () => renderItems('note');
window.renderCopy = () => renderItems('copy');
window.renderProjectTasks = () => renderItems('task');

function getLinkedItemsCount(briefId) {
    let count = 0;
    if (currentProject?.notes) count += currentProject.notes.filter(note => note.linkedBriefId === briefId).length;
    if (currentProject?.copy) count += currentProject.copy.filter(copy => copy.linkedBriefId === briefId).length;
    return count;
}

// ===== DRAG AND DROP =====
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
    
    createItemFromDrop(draggedItem, draggedItemType, targetType);
}

function createItemFromDrop(sourceItem, sourceType, targetType) {
    let content = '';
    let title = sourceItem.title;
    
    if (sourceType === 'brief' && targetType === 'task') {
        const proposition = sourceItem.proposition || '';
        const clientBrief = sourceItem.clientBrief || sourceItem.content || '';
        content = [proposition, clientBrief].filter(Boolean).join('\n\n');
    } else if (sourceType !== 'brief') {
        content = sourceItem.content || '';
    }
    
    const newItem = createItem(targetType, { title, content });
    
    // Handle special relationships
    if (targetType === 'task') {
        newItem.sourceItemId = sourceItem.id;
        newItem.sourceItemType = sourceType;
        
        // Remove existing duplicate task
        const existingIndex = currentProject.tasks.findIndex(task => 
            task.sourceItemId === sourceItem.id && task.sourceItemType === sourceType
        );
        if (existingIndex !== -1) {
            currentProject.tasks.splice(existingIndex, 1);
        }
    } else if (sourceType === 'brief' && (targetType === 'note' || targetType === 'copy')) {
        newItem.linkedBriefId = sourceItem.id;
        newItem.title = `${sourceItem.title} - ${targetType}`;
        
        if (targetType === 'note' && sourceItem.proposition?.trim()) {
            const propText = sourceItem.proposition.trim();
            newItem.richContent = `<p><strong>Prop:</strong> <em>${propText}</em></p><br><p></p>`;
            newItem.content = `Prop: ${propText}\n\n`;
        } else {
            newItem.content = '';
            newItem.richContent = '<p></p>';
        }
    } else if (targetType === 'brief') {
        newItem.proposition = '';
        newItem.clientBrief = content;
        delete newItem.content;
    }
    
    addItemToProject(newItem, targetType);
    renderItems(targetType);
    showNotification(`Created ${targetType} "${newItem.title}" from ${sourceType}`);
}

// ===== GLOBAL TASK MANAGEMENT =====
function getAllTasks() {
    return projects.flatMap(project => 
        (project.tasks || []).map(task => ({
            ...task,
            projectName: project.name,
            projectId: project.id,
            projectColorTheme: project.colorTheme
        }))
    );
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

function toggleTask(taskId, isGlobal = false) {
    let task, project;
    
    if (isGlobal) {
        const [projectId, tId] = taskId.split('-');
        project = projects.find(p => p.id == projectId);
        task = project?.tasks.find(t => t.id == tId);
    } else {
        task = currentProject.tasks.find(t => t.id == taskId);
        project = currentProject;
    }
    
    if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? new Date().toISOString() : undefined;
        
        if (task.completed && isGlobal) {
            const uniqueId = `${project.id}-${task.id}`;
            globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
            globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
            saveGlobalTaskOrder();
        }
        
        saveProjects();
        if (currentProject) renderItems('task');
        renderGlobalTasks();
    }
}

// Make functions globally available
window.toggleGlobalTask = (projectId, taskId) => toggleTask(`${projectId}-${taskId}`, true);
window.toggleProjectTask = (taskId) => toggleTask(taskId, false);

// ===== EDITOR MANAGEMENT =====
function openItemEditor(item, itemType) {
    if (!item) return;
    
    if (currentEditingItem) saveCurrentContext();
    
    currentEditingItem = item;
    currentEditingType = itemType;
    hasUnsavedChanges = false;
    
    if (currentProject) {
        addToBreadcrumbs(currentProject.id, item.id, itemType, item.title);
    }
    
    setupEditor(item, itemType);
    document.getElementById('itemEditor').style.display = 'block';
    
    setTimeout(() => {
        setupAutosaveListeners();
        setupPomodoroForEditor(itemType);
        updateAutosaveStatus('ready');
    }, 100);
}

function setupEditor(item, itemType) {
    document.getElementById('editorTitle').textContent = `Edit ${itemTypes[itemType].displayName}`;
    document.getElementById('editorItemTitle').value = item.title || '';
    
    const briefFields = document.getElementById('briefFields');
    const standardFields = document.getElementById('standardFields');
    const richEditor = document.getElementById('richEditor');
    const textEditor = document.getElementById('editorContent');
    
    if (itemType === 'brief') {
        briefFields.style.display = 'block';
        standardFields.style.display = 'none';
        document.getElementById('editorProposition').value = item.proposition || '';
        document.getElementById('editorClientBrief').value = item.clientBrief || item.content || '';
    } else {
        briefFields.style.display = 'none';
        standardFields.style.display = 'block';
        
        if (itemType === 'note' || itemType === 'copy') {
            richEditor.style.display = 'block';
            textEditor.style.display = 'none';
            richEditor.innerHTML = item.richContent || textToHtml(item.content || '');
        } else {
            richEditor.style.display = 'none';
            textEditor.style.display = 'block';
            textEditor.value = item.content || '';
        }
        
        document.getElementById('insertHeadingsBtn').style.display = itemType === 'note' ? 'inline-flex' : 'none';
        document.getElementById('copyToClipboardBtn').style.display = 
            (itemType === 'note' || itemType === 'copy') ? 'inline-flex' : 'none';
    }
}

function setupPomodoroForEditor(itemType) {
    const pomodoroTimer = document.getElementById('pomodoroTimer');
    if (!pomodoroTimer) return;
    
    if (itemType === 'note' || itemType === 'copy') {
        pomodoroTimer.style.display = 'flex';
        pomodoroTimer.style.visibility = 'visible';
        setTimeout(() => {
            initializePomodoro();
            updatePomodoroHeaderStyle();
        }, 50);
    } else {
        pomodoroTimer.style.display = 'none';
    }
}

// ===== AUTOSAVE SYSTEM =====
function setupAutosaveListeners() {
    ['editorItemTitle', 'editorProposition', 'editorClientBrief', 'richEditor', 'editorContent']
        .forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', debouncedAutosave);
                if (element.tagName === 'TEXTAREA' || element.contentEditable === 'true') {
                    element.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
                }
            }
        });
}

function debouncedAutosave() {
    clearTimeout(autosaveTimeout);
    hasUnsavedChanges = true;
    updateAutosaveStatus('changes');
    autosaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) autosaveItem();
    }, 1500);
}

function autosaveItem() {
    if (!currentEditingItem) return;
    
    updateAutosaveStatus('saving');
    
    const newTitle = document.getElementById('editorItemTitle').value.trim();
    if (!newTitle) {
        updateAutosaveStatus('ready');
        return;
    }
    
    const oldTitle = currentEditingItem.title;
    currentEditingItem.title = newTitle;
    currentEditingItem.lastModified = new Date().toISOString();
    
    let contentChanged = oldTitle !== newTitle;
    
    if (currentEditingType === 'brief') {
        const oldProp = currentEditingItem.proposition || '';
        const oldClient = currentEditingItem.clientBrief || '';
        const newProp = document.getElementById('editorProposition').value.trim();
        const newClient = document.getElementById('editorClientBrief').value.trim();
        
        contentChanged = contentChanged || (oldProp !== newProp) || (oldClient !== newClient);
        currentEditingItem.proposition = newProp;
        currentEditingItem.clientBrief = newClient;
        delete currentEditingItem.content;
    } else {
        const richEditor = document.getElementById('richEditor');
        const textEditor = document.getElementById('editorContent');
        
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
    if (currentProject) saveCurrentContext();
    
    hasUnsavedChanges = false;
    updateAutosaveStatus('saved');
    
    setTimeout(() => renderItems(currentEditingType), 100);
}

function updateAutosaveStatus(status) {
    const autosaveText = document.getElementById('autosaveText');
    if (!autosaveText) return;
    
    const statusConfig = {
        saving: { text: 'Saving...', color: '#171717' },
        saved: { text: 'Saved', color: '#16a34a' },
        changes: { text: 'Unsaved changes...', color: '#f59e0b' },
        ready: { text: 'Ready', color: '#737373' }
    };
    
    const config = statusConfig[status] || statusConfig.ready;
    autosaveText.textContent = config.text;
    autosaveText.style.color = config.color;
    
    if (status === 'saved') {
        setTimeout(() => {
            autosaveText.textContent = 'Ready';
            autosaveText.style.color = '#737373';
        }, 2000);
    }
}

// ===== TEXT UTILITIES =====
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

// ===== STORAGE FUNCTIONS =====
function saveProjects() {
    localStorage.setItem('projects', JSON.stringify(projects));
    setTimeout(cleanupOldCompletedTasks, 100);
    if (document.getElementById('projectOverview').style.display === 'block') {
        cleanupGlobalTaskOrder();
        renderGlobalTasks();
    }
}

function saveGlobalTaskOrder() {
    localStorage.setItem('globalTaskOrder', JSON.stringify(globalTaskOrder));
}

function loadGlobalTaskOrder() {
    const saved = localStorage.getItem('globalTaskOrder');
    if (saved) {
        try {
            globalTaskOrder = JSON.parse(saved);
            if (!globalTaskOrder.topThree) globalTaskOrder.topThree = [];
            if (!globalTaskOrder.other) globalTaskOrder.other = [];
        } catch (error) {
            globalTaskOrder = { topThree: [], other: [] };
        }
    }
}

function cleanupGlobalTaskOrder() {
    const allTasks = getAllTasks();
    const validTaskIds = new Set(allTasks.map(task => `${task.projectId}-${task.id}`));
    
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => validTaskIds.has(id));
    globalTaskOrder.other = globalTaskOrder.other.filter(id => validTaskIds.has(id));
    saveGlobalTaskOrder();
}

function cleanupOldCompletedTasks() {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    let hasChanges = false;
    
    projects.forEach(project => {
        if (project.tasks) {
            const originalLength = project.tasks.length;
            project.tasks = project.tasks.filter(task => {
                if (task.completed && task.completedAt) {
                    return new Date(task.completedAt).getTime() > twentyFourHoursAgo;
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

// ===== INITIALIZATION =====
function initializeProjects() {
    const saved = localStorage.getItem('projects');
    if (saved) {
        try {
            projects = JSON.parse(saved);
            if (!Array.isArray(projects)) projects = [];
            
            projects.forEach(project => {
                // Ensure properties exist
                Object.assign(project, {
                    colorTheme: project.colorTheme || getNextColorTheme(),
                    archived: project.archived || false,
                    briefs: project.briefs || [],
                    notes: project.notes || [],
                    copy: project.copy || [],
                    tasks: project.tasks || []
                });
                
                // Migrate old brief format
                project.briefs.forEach(brief => {
                    if (brief.content && !brief.proposition && !brief.clientBrief) {
                        brief.clientBrief = brief.content;
                        brief.proposition = '';
                        delete brief.content;
                    }
                    if (!brief.linkColor) brief.linkColor = getNextLinkColor();
                });
                
                // Ensure order values
                ['briefs', 'notes', 'copy', 'tasks'].forEach(type => {
                    project[type].forEach((item, index) => {
                        if (item.order === undefined) item.order = index;
                    });
                });
            });
            
            saveProjects();
            initializeLinkColorIndex();
        } catch (error) {
            console.error('Error loading projects:', error);
            projects = [];
        }
    } else {
        projects = [];
    }
}

function initializeLinkColorIndex() {
    let maxIndex = 0;
    projects.forEach(project => {
        project.briefs?.forEach(brief => {
            if (brief.linkColor) {
                const colorIndex = linkColors.indexOf(brief.linkColor);
                if (colorIndex > maxIndex) maxIndex = colorIndex;
            }
        });
    });
    nextLinkColorIndex = maxIndex + 1;
}

// ===== ADDITIONAL UTILITY FUNCTIONS =====
function formatRichText(command, value = null) {
    document.execCommand(command, false, value);
    document.getElementById('richEditor').focus();
}

function createLink() {
    const url = prompt('Enter URL:');
    if (url) {
        formatRichText('createLink', url);
    }
}

function insertStandardHeadings() {
    const richEditor = document.getElementById('richEditor');
    let proposition = '';
    
    if (currentEditingType === 'note' && currentEditingItem.linkedBriefId) {
        const linkedBrief = currentProject.briefs.find(b => b.id === currentEditingItem.linkedBriefId);
        if (linkedBrief?.proposition) {
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
        const textarea = document.getElementById('editorContent');
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

function copyContentToClipboard() {
    let contentToCopy = '';
    let htmlContent = '';
    
    if (currentEditingType === 'brief') {
        const title = document.getElementById('editorItemTitle').value.trim();
        const proposition = document.getElementById('editorProposition').value.trim();
        const clientBrief = document.getElementById('editorClientBrief').value.trim();
        
        contentToCopy = title;
        if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
        if (clientBrief) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBrief;
        
        htmlContent = `<h3>${title}</h3>`;
        if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
        if (clientBrief) htmlContent += `<h4>CLIENT BRIEF:</h4><p>${clientBrief.replace(/\n/g, '<br>')}</p>`;
    } else {
        const title = document.getElementById('editorItemTitle').value.trim();
        const richEditor = document.getElementById('richEditor');
        const textEditor = document.getElementById('editorContent');
        
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

// Context preservation window functions
function clearBreadcrumbs() {
    workContext.breadcrumbs = [];
    saveBreadcrumbs();
    renderBreadcrumbs();
}

function dismissResumePanel() {
    const panel = document.getElementById('resumePanel');
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

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        const editorModal = document.getElementById('itemEditor');
        if (editorModal) {
            editorModal.classList.remove('true-fullscreen', 'fullscreen');
        }
        
        const overlay = document.getElementById('focusOverlay');
        if (overlay) overlay.remove();
        
        document.body.style.cursor = 'default';
    }
});

// ===== GLOBAL FUNCTIONS =====
// Export essential functions to window
Object.assign(window, {
    // Core functions
    openProjectModal: () => document.getElementById('projectModal').style.display = 'block',
    closeModal: (id) => document.getElementById(id).style.display = 'none',
    closeEditor: () => {
        if (currentEditingItem) saveCurrentContext();
        if (pomodoroIsRunning) pausePomodoro();
        exitFocusMode();
        document.getElementById('itemEditor').style.display = 'none';
        currentEditingItem = null;
        currentEditingType = null;
    },
    
    // Project management
    createProject: () => {
        const name = document.getElementById('newProjectName').value.trim();
        const description = document.getElementById('newProjectDescription').value.trim();
        
        if (name) {
            const project = {
                id: Date.now(),
                name,
                description,
                briefs: [],
                notes: [],
                copy: [],
                tasks: [],
                createdAt: new Date().toISOString(),
                colorTheme: getNextColorTheme(),
                archived: false
            };
            
            projects.push(project);
            saveProjects();
            updateProjectSelector();
            closeModal('projectModal');
            document.getElementById('newProjectName').value = '';
            document.getElementById('newProjectDescription').value = '';
            renderProjectOverview();
        }
    },
    
    // Project navigation
    showProjectOverview,
    switchProject,
    selectProject,
    toggleArchivedProjects,
    toggleArchiveProject,
    openProjectSettings,
    saveProjectSettings,
    
    // Quick add functions
    addQuickBrief, addQuickNote, addQuickCopy, addQuickTask,
    
    // Item management
    openItemEditor, findItem, deleteItem,
    
    // Drag and drop
    handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop,
    
    // Global task drag and drop
    handleGlobalTaskDragStart, handleGlobalTaskDragEnd, handleTaskDragOver, 
    handleTaskDragLeave, handleTaskDrop,
    
    // Confirmation
    showConfirm, proceedConfirm, cancelConfirm,
    
    // Task management
    toggleGlobalTask, toggleProjectTask, openGlobalTaskSource, diveInToGlobalSource,
    openTaskSource, diveInToProjectSource,
    
    // Context management
    navigateToBreadcrumb, clearBreadcrumbs, dismissResumePanel, resumeWork,
    
    // Pomodoro functions
    startPomodoro, pausePomodoro, resetPomodoro, skipPomodoro, exitFocusMode,
    
    // Editor functions
    formatRichText, createLink, insertStandardHeadings, copyContentToClipboard,
    
    // Utility
    handleEnterKey: (event, type) => {
        if (event.key === 'Enter') addQuickItem(type);
    }
});

// ===== INITIALIZATION ON LOAD =====
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Load work context first
        loadWorkContext();
        
        // Load projects
        initializeProjects();
        
        // Load global task order and clean up stale references
        loadGlobalTaskOrder();
        cleanupGlobalTaskOrder();
        
        // Clean up old completed tasks (24+ hours old)
        cleanupOldCompletedTasks();
        
        // Load pomodoro state
        loadPomodoroState();
        
        // Initialize pomodoro daily count
        const today = new Date().toDateString();
        const savedDaily = localStorage.getItem('pomodoroDaily');
        if (savedDaily) {
            const dailyData = JSON.parse(savedDaily);
            pomodoroDailyCount = dailyData.date === today ? dailyData.count : 0;
        }
        
        // Initialize UI
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        renderBreadcrumbs();
        
        // Setup periodic cleanup (every hour)
        setInterval(cleanupOldCompletedTasks, 60 * 60 * 1000);
        
        // Offer work resumption after a short delay
        setTimeout(offerWorkResumption, 2000);
        
    } catch (error) {
        console.error('Initialization error:', error);
        // Fallback initialization
        projects = [];
        loadGlobalTaskOrder();
        updateProjectSelector();
        showProjectOverview();
        setupDeleteListeners();
        renderBreadcrumbs();
    }
});

function setupDeleteListeners() {
    document.removeEventListener('click', handleDeleteClick);
    document.addEventListener('click', handleDeleteClick);
}

function handleDeleteClick(event) {
    if (event.target.classList.contains('delete-btn')) {
        event.stopPropagation();
        const deleteType = event.target.getAttribute('data-delete-type');
        const deleteId = event.target.getAttribute('data-delete-id');
        deleteItem(deleteId, deleteType);
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const confirmModal = document.getElementById('confirmModal');
        if (confirmModal.style.display === 'block') {
            cancelConfirm();
            return;
        }
        
        const editorModal = document.getElementById('itemEditor');
        if (editorModal?.classList.contains('fullscreen') || editorModal?.classList.contains('true-fullscreen')) {
            exitFocusMode();
            if (pomodoroIsRunning) pausePomodoro();
            return;
        }
        
        document.querySelectorAll('.modal, .editor-modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    if (e.key === 'Enter' && document.getElementById('confirmModal').style.display === 'block') {
        proceedConfirm();
    }
    
    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        if (document.getElementById('itemEditor').style.display === 'block') {
            autosaveItem();
            showContextIndicator('Work saved with context preserved');
        }
    }
    
    // Alt+B for breadcrumb navigation
    if (e.key === 'b' && e.altKey) {
        e.preventDefault();
        const breadcrumbContainer = document.getElementById('breadcrumbContainer');
        if (breadcrumbContainer.style.display !== 'none') {
            const breadcrumbs = document.querySelectorAll('.breadcrumb-item');
            if (breadcrumbs.length > 0) {
                breadcrumbs[breadcrumbs.length - 1].focus();
            }
        }
    }
    
    // Ctrl+Shift+R for work resumption
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
    
    // Pomodoro shortcuts when editor is open
    if (document.getElementById('itemEditor').style.display === 'block') {
        const pomodoroTimer = document.getElementById('pomodoroTimer');
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

// Close modals on outside click
window.onclick = function(event) {
    if (event.target.classList.contains('modal') || event.target.classList.contains('editor-modal')) {
        if (event.target.id === 'confirmModal') {
            cancelConfirm();
        } else {
            event.target.style.display = 'none';
        }
    }
}

// ===== CONTEXT PRESERVATION SYSTEM =====
function createContextState(projectId, itemId, itemType) {
    return {
        projectId, itemId, itemType,
        timestamp: Date.now(),
        editorState: null,
        cursorPosition: null,
        scrollPosition: null,
        title: null
    };
}

function addToBreadcrumbs(projectId, itemId, itemType, title) {
    const breadcrumbId = `${projectId}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    workContext.breadcrumbs.push({
        id: breadcrumbId, projectId, itemId, itemType, title,
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
            setTimeout(() => openItemWithContext(breadcrumb.itemId, breadcrumb.itemType), 200);
        });
    } else {
        openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
    }
}

function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumbContainer');
    const trail = document.getElementById('breadcrumbTrail');
    
    if (workContext.breadcrumbs.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
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
    
    trail.innerHTML = breadcrumbsHtml + `
        <button class="breadcrumb-clear" onclick="clearBreadcrumbs()" title="Clear trail">Clear</button>
    `;
}

function saveCurrentContext() {
    if (!currentEditingItem || !currentEditingType || !currentProject) return;
    
    const context = createContextState(currentProject.id, currentEditingItem.id, currentEditingType);
    context.title = currentEditingItem.title;
    
    if (currentEditingType === 'brief') {
        context.editorState = {
            title: document.getElementById('editorItemTitle').value,
            proposition: document.getElementById('editorProposition').value,
            clientBrief: document.getElementById('editorClientBrief').value
        };
    } else {
        const richEditor = document.getElementById('richEditor');
        const textEditor = document.getElementById('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            context.editorState = {
                title: document.getElementById('editorItemTitle').value,
                content: richEditor.innerHTML,
                isRichText: true
            };
        } else if (textEditor) {
            context.editorState = {
                title: document.getElementById('editorItemTitle').value,
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
        showContextIndicator(`Resumed: ${context.title}`, true);
    }, 300);
    
    return true;
}

function restoreEditorState(context) {
    if (!context.editorState) return;
    
    const titleField = document.getElementById('editorItemTitle');
    if (titleField) titleField.value = context.editorState.title || '';
    
    if (context.itemType === 'brief') {
        const propField = document.getElementById('editorProposition');
        const clientField = document.getElementById('editorClientBrief');
        if (propField) propField.value = context.editorState.proposition || '';
        if (clientField) clientField.value = context.editorState.clientBrief || '';
    } else {
        if (context.editorState.isRichText) {
            const richEditor = document.getElementById('richEditor');
            if (richEditor) richEditor.innerHTML = context.editorState.content || '';
        } else {
            const textEditor = document.getElementById('editorContent');
            if (textEditor) textEditor.value = context.editorState.content || '';
        }
    }
}

function showContextIndicator(message, isSuccess = false) {
    const existing = document.getElementById('contextIndicator');
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
    const existing = document.getElementById('resumePanel');
    if (existing) existing.remove();
    
    const panel = document.createElement('div');
    panel.id = 'resumePanel';
    panel.className = 'resume-panel';
    
    const timeAgo = getTimeAgo(context.timestamp);
    
    panel.innerHTML = `
        <h4>Resume Work</h4>
        <p>Continue working on <strong>${context.title}</strong> in ${projects.find(p => p.id == context.projectId)?.name}<br>
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
    localStorage.setItem('workContext', JSON.stringify(contextData));
}

function loadWorkContext() {
    const saved = localStorage.getItem('workContext');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            workContext.breadcrumbs = data.breadcrumbs || [];
            workContext.currentContext = data.currentContext || null;
            workContext.projectContexts = new Map(data.projectContexts || []);
            workContext.globalContext = data.globalContext || null;
        } catch (error) {
            console.error('Error loading work context:', error);
        }
    }
}

function saveBreadcrumbs() {
    localStorage.setItem('breadcrumbs', JSON.stringify(workContext.breadcrumbs));
}

function removeFromBreadcrumbs(itemType, itemId) {
    const breadcrumbId = `${currentProject.id}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    saveBreadcrumbs();
    renderBreadcrumbs();
}

function openItemWithContext(itemId, itemType) {
    const item = findItem(itemId, itemType);
    if (item) {
        openItemEditor(item, itemType);
        addToBreadcrumbs(currentProject.id, itemId, itemType, item.title);
    }
}

// ===== POMODORO TIMER IMPLEMENTATION =====
function startPomodoro() {
    pomodoroIsRunning = true;
    document.getElementById('pomodoroStart').style.display = 'none';
    document.getElementById('pomodoroPause').style.display = 'inline-block';
    
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
    document.getElementById('pomodoroStart').style.display = 'inline-block';
    document.getElementById('pomodoroPause').style.display = 'none';
    
    updatePomodoroHeaderStyle();
    exitFocusMode();
    updatePomodoroStatus();
    savePomodoroState();
}

function resetPomodoro() {
    pausePomodoro();
    pomodoroIsBreak = false;
    pomodoroTimeLeft = 25 * 60;
    
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
                showContextIndicator('Work resumed after break', true);
            }, 1000);
        }
    } else {
        pomodoroSessionCount++;
        pomodoroDailyCount++;
        pomodoroIsBreak = true;
        pomodoroTimeLeft = pomodoroSessionCount % 4 === 0 ? 15 * 60 : 5 * 60;
        
        const today = new Date().toDateString();
        localStorage.setItem('pomodoroDaily', JSON.stringify({
            date: today,
            count: pomodoroDailyCount
        }));
    }
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroStats();
    updatePomodoroHeaderStyle();
    clearPomodoroState();
    
    showNotification(pomodoroIsBreak ? 'Work session complete! Take a break.' : 'Break over! Ready for another session?');
    playPomodoroSound();
}

function enterFocusMode() {
    const editorModal = document.getElementById('itemEditor');
    editorModal.classList.add('true-fullscreen');
    setupFullscreenOverlay();
    
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }
}

function setupFullscreenOverlay() {
    const existing = document.getElementById('focusOverlay');
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
    const editorModal = document.getElementById('itemEditor');
    
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    
    editorModal.classList.remove('fullscreen', 'true-fullscreen');
    
    const overlay = document.getElementById('focusOverlay');
    if (overlay) overlay.remove();
    
    document.body.style.cursor = 'default';
}

function updatePomodoroDisplay() {
    const displayElement = document.getElementById('pomodoroDisplay');
    if (!displayElement) return;
    
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    displayElement.textContent = timeString;
    
    const overlayTimer = document.getElementById('overlayTimer');
    if (overlayTimer) overlayTimer.textContent = timeString;
}

function updatePomodoroStatus() {
    const statusElement = document.getElementById('pomodoroStatus');
    if (!statusElement) return;
    
    if (pomodoroIsRunning) {
        statusElement.textContent = pomodoroIsBreak ? 'Break time - relax!' : 'Focus time - stay concentrated!';
    } else {
        statusElement.textContent = pomodoroIsBreak ? 'Break paused' : 
            pomodoroTimeLeft === 25 * 60 ? 'Ready to focus' : 'Paused';
    }
}

function updatePomodoroStats() {
    const sessionElement = document.getElementById('sessionCount');
    const dailyElement = document.getElementById('dailyCount');
    
    if (sessionElement) sessionElement.textContent = pomodoroSessionCount;
    if (dailyElement) dailyElement.textContent = pomodoroDailyCount;
}

function updatePomodoroHeaderStyle() {
    const header = document.querySelector('.editor-header');
    const timer = document.getElementById('pomodoroTimer');
    
    if (!header) return;
    
    header.classList.remove('pomodoro-active', 'pomodoro-break');
    
    if (timer && timer.style.display !== 'none' && pomodoroIsRunning) {
        header.classList.add(pomodoroIsBreak ? 'pomodoro-break' : 'pomodoro-active');
    }
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
    const savedDaily = localStorage.getItem('pomodoroDaily');
    
    if (savedDaily) {
        const dailyData = JSON.parse(savedDaily);
        pomodoroDailyCount = dailyData.date === today ? dailyData.count : 0;
    }
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroStats();
    
    const timer = document.getElementById('pomodoroTimer');
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
    localStorage.setItem('pomodoroState', JSON.stringify(pomodoroState));
}

function loadPomodoroState() {
    const savedState = localStorage.getItem('pomodoroState');
    if (savedState) {
        const state = JSON.parse(savedState);
        const now = Date.now();
        const elapsed = Math.floor((now - state.lastUpdate) / 1000);
        
        pomodoroTimeLeft = Math.max(0, state.timeLeft - (state.isRunning ? elapsed : 0));
        pomodoroIsRunning = state.isRunning && pomodoroTimeLeft > 0;
        pomodoroIsBreak = state.isBreak;
        pomodoroSessionCount = state.sessionCount;
        
        if (state.isRunning && pomodoroTimeLeft <= 0) {
            completePomodoro();
        }
    }
}

function clearPomodoroState() {
    localStorage.removeItem('pomodoroState');
}

// ===== PROJECT OVERVIEW RENDERING =====
function renderProjectOverview() {
    const grid = document.getElementById('projectGrid');
    if (!grid) return;
    
    if (!Array.isArray(projects)) projects = [];
    
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
            const completedTasks = (project.tasks || []).filter(t => t?.completed).length;
            const colorTheme = project.colorTheme || 'blue';
            const briefsCount = (project.briefs || []).length;
            const notesCount = (project.notes || []).length;
            const copyCount = (project.copy || []).length;
            
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
                            Created: ${project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown'}
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

function showProjectOverview() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('projectOverview').style.display = 'block';
    document.getElementById('projectSelect').value = '';
    document.getElementById('topTasksRow').style.display = 'none';
    currentProject = null;
    
    const dashboard = document.getElementById('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    dashboard.classList.remove('project-themed');
    
    updateSettingsButton();
    renderProjectOverview();
    renderGlobalTasks();
}

function toggleArchivedProjects() {
    showArchived = !showArchived;
    const button = document.getElementById('archiveToggle');
    if (button) {
        button.innerHTML = showArchived ? 'Hide Archived' : 'Show Archived';
    }
    renderProjectOverview();
}

function toggleArchiveProject(projectId) {
    const project = projects.find(p => p?.id === projectId);
    if (project) {
        project.archived = !project.archived;
        saveProjects();
        updateProjectSelector();
        renderProjectOverview();
    }
}

function selectProject(projectId) {
    document.getElementById('projectSelect').value = projectId;
    switchProject();
}

function switchProject() {
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
        showContextIndicator(`Work saved: ${currentEditingItem.title}`);
    }
    
    const select = document.getElementById('projectSelect');
    const projectId = select.value;
    
    if (projectId) {
        switchToProject(projectId);
    } else {
        showProjectOverview();
    }
}

function switchToProject(projectId, callback) {
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    currentProject = project;
    document.getElementById('projectSelect').value = project.id;
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('projectOverview').style.display = 'none';
    document.getElementById('topTasksRow').style.display = 'flex';
    
    const dashboard = document.getElementById('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    if (project.colorTheme) {
        dashboard.classList.add(`project-theme-${project.colorTheme}`);
    }
    dashboard.classList.add('project-themed');
    
    updateSettingsButton();
    renderProject();
    
    if (callback) callback();
    
    // Check for previous work context
    const contextKey = `project-${projectId}`;
    const projectContext = workContext.projectContexts.get(contextKey);
    if (projectContext?.editorState) {
        setTimeout(() => {
            const timeDiff = Date.now() - projectContext.timestamp;
            if (timeDiff < 4 * 60 * 60 * 1000) {
                restoreContext(projectContext);
                showContextIndicator(`Resumed work on "${projectContext.title}"`, true);
            }
        }, 500);
    }
}

function updateProjectSelector() {
    const select = document.getElementById('projectSelect');
    const activeProjects = projects.filter(project => !project.archived);
    select.innerHTML = '<option value="">Select a project...</option>' +
        activeProjects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');
}

function updateSettingsButton() {
    const settingsBtn = document.getElementById('projectSettingsBtn');
    const archiveBtn = document.getElementById('archiveToggle');
    
    if (currentProject) {
        settingsBtn.style.display = 'inline-block';
        archiveBtn.style.display = 'none';
    } else {
        settingsBtn.style.display = 'none';
        archiveBtn.style.display = 'inline-block';
    }
}

function openProjectSettings(projectId) {
    const project = projectId ? projects.find(p => p.id === projectId) : currentProject;
    if (!project) return;
    
    document.getElementById('settingsProjectName').value = project.name;
    document.getElementById('settingsColorTheme').value = project.colorTheme || 'blue';
    document.getElementById('projectSettingsModal').style.display = 'block';
    
    window.currentSettingsProject = project;
}

function saveProjectSettings() {
    const project = window.currentSettingsProject;
    if (!project) return;
    
    const newName = document.getElementById('settingsProjectName').value.trim();
    const newTheme = document.getElementById('settingsColorTheme').value;
    
    if (newName) {
        project.name = newName;
        project.colorTheme = newTheme;
        
        saveProjects();
        updateProjectSelector();
        closeModal('projectSettingsModal');
        
        if (currentProject?.id === project.id) {
            const dashboard = document.getElementById('dashboard');
            colorThemes.forEach(theme => {
                dashboard.classList.remove(`project-theme-${theme}`);
            });
            dashboard.classList.add(`project-theme-${newTheme}`);
        }
        
        renderProjectOverview();
        window.currentSettingsProject = null;
    }
}

// ===== GLOBAL TASK MANAGEMENT UI =====
function getOrderedGlobalTasks() {
    const allTasks = getAllTasks();
    const taskMap = new Map();
    
    allTasks.forEach(task => {
        const uniqueId = `${task.projectId}-${task.id}`;
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
        const uniqueId = `${task.projectId}-${task.id}`;
        if (!topThreeIds.has(uniqueId) && !otherTaskIds.has(uniqueId)) {
            otherTasks.push(task);
        }
    });
    
    const sortedOther = sortTasksWithCompletedAtBottom(otherTasks);
    
    return { topThree: topThreeTasks, other: sortedOther };
}

function renderGlobalTasks() {
    const { topThree, other } = getOrderedGlobalTasks();
    
    renderTaskSection('topThreeTasks', topThree, true);
    renderTaskSection('otherTasks', other, false);
}

function renderTaskSection(containerId, tasks, isTopThree) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (tasks.length === 0) {
        const message = isTopThree ? 
            'Drop your most important tasks here' : 
            'All other tasks appear here';
        container.innerHTML = `
            <div class="task-drop-zone">
                ${message}
            </div>
        `;
        container.className = 'task-drop-zone';
        return;
    }
    
    container.className = '';
    container.innerHTML = tasks.map(task => {
        const uniqueId = `${task.projectId}-${task.id}`;
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
                    Created: ${new Date(task.createdAt).toLocaleDateString()}
                    ${hasSource ? ` • Has source` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${new Date(task.completedAt).toLocaleDateString()}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                        ${task.content.substring(0, 100)}${task.content.length > 100 ? '...' : ''}
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

function openTaskSource(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task || !task.sourceItemId || !task.sourceItemType) {
        openItemEditor(task, 'task');
        return;
    }
    
    const sourceItem = findItem(task.sourceItemId, task.sourceItemType);
    
    if (sourceItem) {
        const editorModal = document.getElementById('itemEditor');
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
