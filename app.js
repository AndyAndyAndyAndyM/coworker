// ===== HELPER FUNCTIONS (DEFINED EARLY) =====
// DOM Helpers
const getEl = (id) => document.getElementById(id);
const setDisplay = (id, display) => { const el = getEl(id); if (el) el.style.display = display; };
const setValue = (id, value) => { const el = getEl(id); if (el) el.value = value; };
const getValue = (id) => { const el = getEl(id); return el ? el.value.trim() : ''; };
const setContent = (id, content) => { const el = getEl(id); if (el) el.textContent = content; };
const setHTML = (id, html) => { const el = getEl(id); if (el) el.innerHTML = html; };

// Storage Helpers - UPDATED TO USE LOCALSTORAGE
const saveToStorage = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error(`Error saving ${key}:`, error);
        // Fallback to in-memory storage if localStorage fails
        if (!window.appStorage) window.appStorage = {};
        window.appStorage[key] = JSON.stringify(data);
    }
};

const loadFromStorage = (key, defaultValue = null) => {
    try {
        const saved = localStorage.getItem(key);
        if (saved) {
            return JSON.parse(saved);
        }
        // Check fallback storage if localStorage is empty
        if (window.appStorage && window.appStorage[key]) {
            return JSON.parse(window.appStorage[key]);
        }
        return defaultValue;
    } catch (error) {
        console.error(`Error loading ${key}:`, error);
        return defaultValue;
    }
};

// Common ID and Date Helpers
const generateId = () => Date.now();
const getCurrentTimestamp = () => new Date().toISOString();
const formatDate = (dateString) => new Date(dateString).toLocaleDateString();

// Content Helpers
const truncateContent = (content, maxLength = 100) => {
    if (!content) return '';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
};

// Notification Helper (consolidates repeated notification code)
const showNotification = (message) => {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
};

// ===== MAIN APPLICATION CODE =====

// Initialize data storage
let projects = [];
let currentProject = null;
let currentEditingItem = null;
let currentEditingType = null;
let draggedItem = null;
let draggedItemType = null;
let showArchived = false;
let autosaveTimeout = null;
let hasUnsavedChanges = false;

// Global tasks management (keeping this for overview page)
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
    // Count how many briefs already have colors across all projects
    let maxIndex = 0;
    let colorsInUse = [];
    
    projects.forEach(project => {
        if (project.briefs) {
            project.briefs.forEach(brief => {
                if (brief.linkColor) {
                    const colorIndex = linkColors.indexOf(brief.linkColor);
                    if (colorIndex !== -1) {
                        colorsInUse.push(brief.linkColor);
                        if (colorIndex > maxIndex) {
                            maxIndex = colorIndex;
                        }
                    }
                }
            });
        }
    });
    
    nextLinkColorIndex = maxIndex + 1;
    console.log('Initialized link color index:', nextLinkColorIndex, 'Colors in use:', colorsInUse);
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

// ===== GLOBAL TASKS FUNCTIONS (KEEPING FOR OVERVIEW PAGE) =====

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
    
    // Create a map of tasks by unique ID (projectId + taskId)
    allTasks.forEach(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        taskMap.set(uniqueId, task);
    });
    
    // Get ordered tasks based on globalTaskOrder, but exclude completed tasks from top three
    const topThreeTasks = globalTaskOrder.topThree
        .map(id => taskMap.get(id))
        .filter(task => task && !task.completed) // Exclude completed tasks from top three
        .slice(0, 3); // Ensure only top 3
    
    const otherTaskIds = new Set(globalTaskOrder.other);
    const topThreeIds = new Set(globalTaskOrder.topThree.slice(0, 3));
    
    // Get other tasks (either in other order or not in any order)
    const otherTasks = [];
    
    // First add tasks that are specifically in the "other" order
    globalTaskOrder.other.forEach(id => {
        const task = taskMap.get(id);
        if (task && !topThreeIds.has(id)) {
            otherTasks.push(task);
        }
    });
    
    // Then add any remaining tasks that aren't in either list
    allTasks.forEach(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        if (!topThreeIds.has(uniqueId) && !otherTaskIds.has(uniqueId)) {
            otherTasks.push(task);
        }
    });
    
    // Sort other tasks with completed tasks at bottom
    const sortedOther = sortTasksWithCompletedAtBottom(otherTasks);
    
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
        container.innerHTML = `
            <div class="task-drop-zone" style="
                border: 2px dashed #d1d5db;
                border-radius: 8px;
                padding: 40px;
                text-align: center;
                color: #6b7280;
                background: #f9fafb;
                margin: 8px 0;
            ">
                <div style="font-size: 14px; margin-bottom: 4px;">${message}</div>
                <div style="font-size: 12px; opacity: 0.7;">Drag tasks here to organize</div>
            </div>
        `;
        container.className = 'task-drop-zone';
        return;
    }
    
    container.className = '';
    container.innerHTML = tasks.map(task => {
        const uniqueId = createTaskUniqueId(task.projectId, task.id);
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        
        // Get link color for the task
        let linkColor = '#10b981'; // Default green
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
                
                <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; align-items: center;">
                    <div style="background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">
                        ${isTopThree ? 'Priority' : 'Task'}
                    </div>
                    ${!isTopThree ? `
                        <button onclick="event.stopPropagation(); promoteToTopThree('${task.projectId}', '${task.id}')" 
                                style="background: #3b82f6; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer; font-weight: 600;"
                                title="Add to Top 3">
                            ★
                        </button>
                    ` : `
                        <button onclick="event.stopPropagation(); removeTaskFromTopThree('${task.projectId}', '${task.id}')" 
                                style="background: #6b7280; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;"
                                title="Remove from Top 3">
                            ×
                        </button>
                    `}
                </div>
                
                <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                    <div style="background-color: transparent; border: none; margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" 
                               ${task.completed ? 'checked' : ''}
                               onclick="event.stopPropagation(); toggleGlobalTask('${task.projectId}', '${task.id}')"
                               style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                    </div>
                    <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px; padding-right: 80px;">
                        <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                    </div>
                </div>
                
                <div style="position: absolute; left: 8px; top: 16px;">
                    <div class="grab-handle"></div>
                </div>
                
                <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; padding-right: 80px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                    <span class="global-task-project project-theme-${task.projectColorTheme || 'blue'}">${task.projectName}</span>
                    Created: ${formatDate(task.createdAt)}
                    ${hasSource ? ` • Has source` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; padding-right: 80px; ${task.completed ? 'text-decoration: line-through;' : ''}">
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

function createTaskUniqueId(projectId, taskId) {
    return `${projectId}-${taskId}`;
}

function addTaskToTopThree(projectId, taskId) {
    const uniqueId = createTaskUniqueId(projectId, taskId);
    
    // Remove from other if it exists there
    globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
    
    // Remove from top three if it already exists (avoid duplicates)
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    
    // Add to top three (but respect the limit of 3)
    if (globalTaskOrder.topThree.length >= 3) {
        // Move the last item from top three to other
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
    
    // Remove from top three
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    
    // Add to other tasks (at the beginning)
    if (!globalTaskOrder.other.includes(uniqueId)) {
        globalTaskOrder.other.unshift(uniqueId);
    }
    
    saveGlobalTaskOrder();
    renderGlobalTasks();
    showNotification('Task removed from Top 3');
}

function promoteToTopThree(projectId, taskId) {
    const task = getAllTasks().find(t => 
        t.projectId == projectId && t.id == taskId && !t.completed
    );
    
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
            // Add completion timestamp when completed
            if (task.completed) {
                task.completedAt = getCurrentTimestamp();
                
                // Remove completed tasks from priority lists immediately
                const uniqueId = createTaskUniqueId(projectId, taskId);
                const wasInTopThree = globalTaskOrder.topThree.includes(uniqueId);
                const wasInOther = globalTaskOrder.other.includes(uniqueId);
                
                globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
                globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
                
                if (wasInTopThree || wasInOther) {
                    saveGlobalTaskOrder();
                    console.log('Removed completed task from priority lists:', uniqueId);
                }
            } else {
                delete task.completedAt;
            }
            saveProjects();
            
            // Force immediate re-render of global tasks
            setTimeout(() => {
                renderGlobalTasks();
            }, 100);
            
            // If we're viewing this project, update the local view too
            if (currentProject && currentProject.id == projectId) {
                renderProjectTasks();
            }
        }
    }
}

function openGlobalTaskSource(projectId, taskId) {
    // Switch to the project and open the task source
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    // Switch to the project
    currentProject = project;
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    
    // Apply project color theme
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    if (project.colorTheme) {
        dashboard.classList.add(`project-theme-${project.colorTheme}`);
    }
    dashboard.classList.add('project-themed');
    
    renderProject();
    
    // Open the appropriate editor after a delay
    setTimeout(() => {
        if (task.sourceItemId && task.sourceItemType) {
            openTaskSource(taskId);
        } else {
            openItemEditor(task, 'task');
        }
    }, 200);
}

function diveInToGlobalSource(projectId, taskId) {
    // Similar to openGlobalTaskSource but with dive-in functionality
    const project = projects.find(p => p.id == projectId);
    if (!project) return;
    
    const task = project.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    // Only proceed if the source is a note or copy
    if (!task.sourceItemId || !task.sourceItemType || (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    // Switch to the project
    currentProject = project;
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    
    // Apply project color theme
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    if (project.colorTheme) {
        dashboard.classList.add(`project-theme-${project.colorTheme}`);
    }
    dashboard.classList.add('project-themed');
    
    renderProject();
    
    // Find the source item and dive in
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
            // Open the item editor
            openItemEditor(sourceItem, task.sourceItemType);
            
            // Wait for editor to be ready, then enter focus mode and start pomodoro
            setTimeout(() => {
                // Reset pomodoro to work session if it's currently a break
                if (pomodoroIsBreak) {
                    pomodoroIsBreak = false;
                    pomodoroTimeLeft = 25 * 60;
                    document.querySelector('.pomodoro-timer').className = 'pomodoro-timer';
                    updatePomodoroDisplay();
                    updatePomodoroStatus();
                }
                
                // Start the pomodoro and enter focus mode
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
    
    // Remove task from both arrays
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => id !== uniqueId);
    globalTaskOrder.other = globalTaskOrder.other.filter(id => id !== uniqueId);
    
    // Add to appropriate array
    if (targetSection === 'top-three') {
        // Only allow 3 items in top three
        if (globalTaskOrder.topThree.length >= 3) {
            // Move the last item from top three to other
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
    if (saved) {
        globalTaskOrder = { topThree: [], other: [], ...saved };
    }
}

function cleanupGlobalTaskOrder() {
    // Remove any task references that no longer exist
    const allTasks = getAllTasks();
    const validTaskIds = new Set(allTasks.map(task => createTaskUniqueId(task.projectId, task.id)));
    
    globalTaskOrder.topThree = globalTaskOrder.topThree.filter(id => validTaskIds.has(id));
    globalTaskOrder.other = globalTaskOrder.other.filter(id => validTaskIds.has(id));
    
    saveGlobalTaskOrder();
}

function autoPopulateTopThree() {
    if (globalTaskOrder.topThree.length === 0) {
        const allTasks = getAllTasks().filter(task => !task.completed);
        
        // Sort by creation date (most recent first)
        allTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Take up to 3 most recent tasks
        const tasksToAdd = allTasks.slice(0, 3);
        
        tasksToAdd.forEach(task => {
            const uniqueId = createTaskUniqueId(task.projectId, task.id);
            globalTaskOrder.topThree.push(uniqueId);
        });
        
        saveGlobalTaskOrder();
        
        if (tasksToAdd.length > 0) {
            console.log(`Auto-populated top 3 with ${tasksToAdd.length} recent tasks`);
        }
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
            
            if (project.tasks.length !== originalLength) {
                hasChanges = true;
            }
        }
    });
    
    if (hasChanges) {
        saveProjects();
        // Clean up global task order references for deleted tasks
        cleanupGlobalTaskOrder();
        console.log('Cleaned up old completed tasks');
    }
}

function sortTasksWithCompletedAtBottom(tasks) {
    return [...tasks].sort((a, b) => {
        // First sort by completion status (incomplete first)
        if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
        }
        
        // Within each group, sort by order or creation date
        const aOrder = a.order !== undefined ? a.order : 0;
        const bOrder = b.order !== undefined ? b.order : 0;
        
        if (aOrder !== bOrder) {
            return aOrder - bOrder;
        }
        
        // Fallback to creation date
        return new Date(a.createdAt) - new Date(b.createdAt);
    });
}

// ===== DOCUMENT UPLOAD AND PROCESSING - UPDATED FOR RICH TEXT =====

// Try to load mammoth library for document processing
let mammothLibrary = null;
try {
    // Import mammoth if available
    if (typeof mammoth !== 'undefined') {
        mammothLibrary = mammoth;
    }
} catch (e) {
    console.log('Mammoth library not available, document upload will use fallback');
}

function setupDocumentUpload() {
    const briefFields = getEl('briefFields');
    if (!briefFields) return;
    
    // Check if upload zone already exists to prevent duplicates
    const existingUploadZone = briefFields.querySelector('.document-upload-zone');
    if (existingUploadZone) {
        console.log('Document upload zone already exists, skipping setup');
        return;
    }
    
    // Add drag and drop zone to client brief area
    const clientBriefField = getEl('editorClientBrief');
    if (!clientBriefField) return;
    
    // Create upload zone
    const uploadZone = document.createElement('div');
    uploadZone.className = 'document-upload-zone';
    uploadZone.style.cssText = `
        border: 2px dashed #d1d5db;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 10px;
        text-align: center;
        color: #6b7280;
        background: #f9fafb;
        cursor: pointer;
        transition: all 0.2s ease;
    `;
    
    // Show different message based on library availability
    const isLibraryAvailable = mammothLibrary !== null;
    uploadZone.innerHTML = `
        <div style="font-size: 14px; margin-bottom: 4px;">📄 ${isLibraryAvailable ? 'Drop Word document here' : 'Document upload'}</div>
        <div style="font-size: 12px; opacity: 0.7;">${isLibraryAvailable ? 'Or click to browse files (.docx)' : 'Feature requires document processing library'}</div>
        ${isLibraryAvailable ? '<input type="file" accept=".docx,.doc" style="display: none;" class="docx-file-input">' : ''}
    `;
    
    // Only add functionality if library is available
    if (!isLibraryAvailable) {
        uploadZone.style.opacity = '0.5';
        uploadZone.style.cursor = 'not-allowed';
        uploadZone.title = 'Document processing not available in this environment';
        clientBriefField.parentNode.insertBefore(uploadZone, clientBriefField);
        return;
    }
    
    // Insert upload zone before client brief field
    clientBriefField.parentNode.insertBefore(uploadZone, clientBriefField);
    
    const fileInput = uploadZone.querySelector('.docx-file-input');
    
    // Handle click to browse
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });
    
    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            processWordDocument(file);
        }
    });
    
    // Handle drag and drop
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
        
        // Check if mammoth is available
        if (!mammothLibrary) {
            throw new Error('Document processing library not available');
        }
        
        // Read file as array buffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Use mammoth to extract HTML with formatting preserved
        const result = await mammothLibrary.convertToHtml({arrayBuffer: arrayBuffer});
        
        if (result.value && result.value.trim()) {
            // Clean up the HTML - remove excessive whitespace and normalize
            const cleanedHtml = cleanupDocumentHtml(result.value);
            
            // Insert extracted HTML into client brief field
            const clientBriefField = getEl('editorClientBrief');
            if (clientBriefField) {
                clientBriefField.innerHTML = cleanedHtml;
                
                // Trigger autosave
                debouncedAutosave();
                
                const textLength = htmlToText(cleanedHtml).length;
                showNotification(`Document imported successfully! (${Math.round(textLength / 1000)}k characters)`);
            }
        } else {
            showNotification('No content found in document');
        }
        
        if (result.messages && result.messages.length > 0) {
            console.log('Document processing messages:', result.messages);
            // Show warnings if any
            const warnings = result.messages.filter(msg => msg.type === 'warning');
            if (warnings.length > 0) {
                console.warn('Document processing warnings:', warnings);
            }
        }
        
    } catch (error) {
        console.error('Error processing document:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Error processing document. ';
        if (error.message.includes('not available')) {
            errorMessage += 'Document processing feature is not available.';
        } else if (error.message.includes('Invalid file')) {
            errorMessage += 'Invalid file format. Please use .docx files.';
        } else if (error.message.includes('arrayBuffer')) {
            errorMessage += 'Unable to read file. Please try again.';
        } else {
            errorMessage += 'Please try again or use copy/paste instead.';
        }
        
        showNotification(errorMessage);
        
        // Fallback suggestion
        setTimeout(() => {
            showNotification('Tip: You can also copy text from Word and paste it directly into the field');
        }, 3000);
    }
}

// New function to clean up HTML from document processing
function cleanupDocumentHtml(html) {
    if (!html) return '';
    
    return html
        // Remove empty paragraphs
        .replace(/<p>\s*<\/p>/g, '')
        .replace(/<p><br\s*\/?><\/p>/g, '')
        // Remove excessive line breaks
        .replace(/(<br\s*\/?>){3,}/g, '<br><br>')
        // Clean up whitespace within tags
        .replace(/>\s+</g, '><')
        // Normalize paragraph spacing
        .replace(/(<\/p>)\s*(<p>)/g, '$1$2')
        // Remove trailing whitespace in paragraphs
        .replace(/<p>\s+/g, '<p>')
        .replace(/\s+<\/p>/g, '</p>')
        // Clean up list formatting
        .replace(/(<\/li>)\s*(<li>)/g, '$1$2')
        .replace(/(<\/ul>)\s*(<ul>)/g, '$1$2')
        .replace(/(<\/ol>)\s*(<ol>)/g, '$1$2')
        // Remove empty list items
        .replace(/<li>\s*<\/li>/g, '')
        // Final cleanup
        .trim();
}

// ===== BREADCRUMB IMPROVEMENTS =====

// Fixed breadcrumb management to limit screen width
function addToBreadcrumbs(projectId, itemId, itemType, title) {
    const breadcrumbId = `${projectId}-${itemId}-${itemType}`;
    
    // Remove if already exists to avoid duplicates
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    
    // Add to end
    workContext.breadcrumbs.push({
        id: breadcrumbId,
        projectId: projectId,
        itemId: itemId,
        itemType: itemType,
        title: title,
        timestamp: Date.now()
    });
    
    // Calculate maximum breadcrumbs that fit on screen
    const maxBreadcrumbs = calculateMaxBreadcrumbs();
    
    // Keep only the most recent items that fit
    if (workContext.breadcrumbs.length > maxBreadcrumbs) {
        workContext.breadcrumbs = workContext.breadcrumbs.slice(-maxBreadcrumbs);
    }
    
    saveBreadcrumbs();
    renderBreadcrumbs();
}

function calculateMaxBreadcrumbs() {
    // Estimate breadcrumb width and calculate how many fit
    const container = getEl('breadcrumbContainer');
    if (!container) return 5; // Default fallback
    
    const containerWidth = container.offsetWidth || 800; // Fallback width
    const clearButtonWidth = 60; // Approximate width of clear button
    const separatorWidth = 20; // Width of separator
    const averageBreadcrumbWidth = 120; // Average breadcrumb item width
    
    const availableWidth = containerWidth - clearButtonWidth - 40; // 40px for margins
    const maxItems = Math.floor(availableWidth / (averageBreadcrumbWidth + separatorWidth));
    
    return Math.max(3, Math.min(maxItems, 8)); // Between 3 and 8 items
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
        
        return `
            <div class="breadcrumb-item ${isLast ? 'current' : ''}" 
                 onclick="navigateToBreadcrumb('${breadcrumb.id}')"
                 title="${projectName} > ${breadcrumb.title}"
                 style="
                    padding: 4px 8px;
                    background: ${isLast ? '#f3f4f6' : 'white'};
                    border: 1px solid #e5e7eb;
                    border-radius: 4px;
                    cursor: pointer;
                    white-space: nowrap;
                    max-width: 120px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    font-size: 12px;
                 ">
                <span style="color: #a3a3a3; font-size: 10px; text-transform: uppercase;">${breadcrumb.itemType}</span>
                <span style="display: block; font-weight: ${isLast ? '600' : '400'};">${breadcrumb.title}</span>
            </div>
            ${!isLast ? '<div class="breadcrumb-separator" style="color: #9ca3af; font-size: 12px; padding: 0 4px;">›</div>' : ''}
        `;
    }).join('');
    
    setHTML('breadcrumbTrail', `
        <div style="display: flex; align-items: center; gap: 4px; flex-wrap: nowrap; overflow: hidden;">
            ${breadcrumbsHtml}
            <button class="breadcrumb-clear" onclick="clearBreadcrumbs()" 
                    style="
                        background: #ef4444;
                        color: white;
                        border: none;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 10px;
                        cursor: pointer;
                        margin-left: 8px;
                        flex-shrink: 0;
                    " title="Clear trail">
                Clear
            </button>
        </div>
    `);
}

function navigateToBreadcrumb(breadcrumbId) {
    const breadcrumb = workContext.breadcrumbs.find(b => b.id === breadcrumbId);
    if (!breadcrumb) return;
    
    // Switch to project if needed
    const project = projects.find(p => p.id == breadcrumb.projectId);
    if (!project) return;
    
    if (!currentProject || currentProject.id != breadcrumb.projectId) {
        // Switch project and then open item
        switchToProject(breadcrumb.projectId, () => {
            setTimeout(() => {
                openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
            }, 200);
        });
    } else {
        // Same project, just open item
        openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
    }
}

function clearBreadcrumbs() {
    workContext.breadcrumbs = [];
    saveBreadcrumbs();
    renderBreadcrumbs();
}

// ===== CONFIRMATION AND DELETE FUNCTIONS =====

function showConfirm(title, message, callback, data = null) {
    console.log('Showing custom confirmation:', title, message);
    
    setContent('confirmTitle', title);
    setContent('confirmMessage', message);
    setDisplay('confirmModal', 'block');
    
    confirmCallback = callback;
    confirmData = data;
}

function proceedConfirm() {
    console.log('User confirmed action');
    setDisplay('confirmModal', 'none');
    
    if (confirmCallback) {
        confirmCallback(confirmData);
    }
    
    confirmCallback = null;
    confirmData = null;
}

function cancelConfirm() {
    console.log('User cancelled action');
    setDisplay('confirmModal', 'none');
    confirmCallback = null;
    confirmData = null;
}

// UPDATED: Delete functions using custom confirmation and preserving linked items for briefs
function deleteBrief(briefId) {
    console.log('Delete brief called with ID:', briefId);
    
    showConfirm(
        'Delete Brief',
        'Are you sure you want to delete this brief? Any linked notes and copy will remain but lose their connection to this brief.',
        (id) => {
            console.log('Proceeding with brief deletion for ID:', id);
            
            const parsedId = parseInt(id);
            console.log('Parsed ID:', parsedId);
            
            const originalLength = currentProject.briefs.length;
            const briefsBefore = currentProject.briefs.map(b => ({ id: b.id, title: b.title }));
            console.log('Briefs before deletion:', briefsBefore);
            
            // Remove the brief
            currentProject.briefs = currentProject.briefs.filter(item => {
                console.log('Comparing item.id:', item.id, 'with target id:', parsedId, 'equal?', item.id === parsedId);
                return item.id !== parsedId;
            });
            
            console.log('Briefs length before:', originalLength, 'after:', currentProject.briefs.length);
            
            // Remove linking from notes/copy but keep the items
            currentProject.notes.forEach(note => {
                if (note.linkedBriefId === parsedId) {
                    delete note.linkedBriefId;
                    console.log(`Removed linking from note: ${note.title}`);
                }
            });
            
            currentProject.copy.forEach(copy => {
                if (copy.linkedBriefId === parsedId) {
                    delete copy.linkedBriefId;
                    console.log(`Removed linking from copy: ${copy.title}`);
                }
            });
            
            // Remove all linked tasks from all projects (tasks are still deleted as they're derived from briefs)
            removeLinkedTasks('brief', parsedId);
            
            // Remove from breadcrumbs
            removeFromBreadcrumbs('brief', parsedId);
            
            saveProjects();
            renderBriefs();
            renderNotes();
            renderCopy();
            renderProjectTasks();
            renderGlobalTasks();
            console.log('Brief deleted successfully, linked items preserved');
            
            showNotification('Brief deleted. Linked notes and copy preserved but unlinked.');
        },
        briefId
    );
}

function deleteNote(noteId) {
    console.log('Delete note called with ID:', noteId);
    
    showConfirm(
        'Delete Note',
        'Are you sure you want to delete this note? This will also remove any linked tasks.',
        (id) => {
            console.log('Proceeding with note deletion for ID:', id);
            
            const parsedId = parseInt(id);
            console.log('Parsed ID:', parsedId);
            
            const originalLength = currentProject.notes.length;
            const notesBefore = currentProject.notes.map(n => ({ id: n.id, title: n.title }));
            console.log('Notes before deletion:', notesBefore);
            
            currentProject.notes = currentProject.notes.filter(item => {
                console.log('Comparing note item.id:', item.id, 'with target id:', parsedId, 'equal?', item.id === parsedId);
                return item.id !== parsedId;
            });
            
            console.log('Notes length before:', originalLength, 'after:', currentProject.notes.length);
            
            // Remove all linked tasks from all projects
            removeLinkedTasks('note', parsedId);
            
            // Remove from breadcrumbs
            removeFromBreadcrumbs('note', parsedId);
            
            saveProjects();
            renderNotes();
            renderProjectTasks();
            renderGlobalTasks();
            console.log('Note deleted successfully');
            
            showNotification('Note and linked tasks deleted successfully');
        },
        noteId
    );
}

function deleteCopy(copyId) {
    console.log('Delete copy called with ID:', copyId);
    
    showConfirm(
        'Delete Copy',
        'Are you sure you want to delete this copy? This will also remove any linked tasks.',
        (id) => {
            console.log('Proceeding with copy deletion for ID:', id);
            
            const parsedId = parseInt(id);
            console.log('Parsed ID:', parsedId);
            
            const originalLength = currentProject.copy.length;
            currentProject.copy = currentProject.copy.filter(item => item.id !== parsedId);
            console.log('Copy length before:', originalLength, 'after:', currentProject.copy.length);
            
            // Remove all linked tasks from all projects
            removeLinkedTasks('copy', parsedId);
            
            // Remove from breadcrumbs
            removeFromBreadcrumbs('copy', parsedId);
            
            saveProjects();
            renderCopy();
            renderProjectTasks();
            renderGlobalTasks();
            console.log('Copy deleted successfully');
            
            showNotification('Copy and linked tasks deleted successfully');
        },
        copyId
    );
}

function removeLinkedTasks(sourceType, sourceId) {
    // Remove linked tasks from all projects
    projects.forEach(project => {
        if (project.tasks && Array.isArray(project.tasks)) {
            const beforeLength = project.tasks.length;
            project.tasks = project.tasks.filter(task => 
                !(task.sourceItemType === sourceType && task.sourceItemId === sourceId)
            );
            const removedCount = beforeLength - project.tasks.length;
            if (removedCount > 0) {
                console.log(`Removed ${removedCount} linked tasks from project ${project.name}`);
            }
        }
    });
    
    // Clean up global task order
    cleanupGlobalTaskOrder();
}

function removeFromBreadcrumbs(itemType, itemId) {
    // Remove from breadcrumbs
    const breadcrumbId = `${currentProject.id}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    saveBreadcrumbs();
    renderBreadcrumbs();
    console.log('Removed item from breadcrumbs:', breadcrumbId);
}

// ===== DRAG AND DROP FUNCTIONS =====

function handleDragStart(event) {
    const itemElement = event.currentTarget;
    const itemData = JSON.parse(itemElement.getAttribute('data-item'));
    const itemType = itemElement.getAttribute('data-type');
    
    draggedItem = itemData;
    draggedItemType = itemType;
    
    itemElement.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    
    console.log('Drag started:', itemType, itemData.title);
}

function handleDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    console.log('Drag ended');
    
    // Clean up drop position indicators
    document.querySelectorAll('.drop-position-indicator').forEach(indicator => {
        indicator.remove();
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
        console.log('Drag over:', event.currentTarget.getAttribute('data-drop-message'));
    }
    
    // Add visual indicator for reordering
    if (draggedItem && draggedItemType) {
        showDropPositionIndicator(event);
    }
}

function handleDragLeave(event) {
    // Only remove drag-over if we're actually leaving the drop zone
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
        console.log('Drag leave');
        
        // Remove drop position indicators when leaving
        document.querySelectorAll('.drop-position-indicator').forEach(indicator => {
            indicator.remove();
        });
    }
}

function handleDrop(event, targetType) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    console.log('Drop on:', targetType, 'with item:', draggedItemType, draggedItem?.title);
    
    if (!draggedItem || !draggedItemType) {
        console.log('No dragged item found');
        return;
    }
    
    // Check if this is a same-column drop (for reordering)
    if (draggedItemType === targetType) {
        console.log('Same column drop - implementing reordering');
        reorderItemInColumn(draggedItem, draggedItemType, event);
        draggedItem = null;
        draggedItemType = null;
        return;
    }
    
    // Check if this is a cross-column move between notes/copy
    if ((draggedItemType === 'note' && targetType === 'copy') || 
        (draggedItemType === 'copy' && targetType === 'note')) {
        moveItemBetweenColumns(draggedItem, draggedItemType, targetType);
        draggedItem = null;
        draggedItemType = null;
        return;
    }
    
    // Otherwise create new item from dropped item
    createItemFromDrop(draggedItem, draggedItemType, targetType);
    
    // Clear drag state
    draggedItem = null;
    draggedItemType = null;
}

function reorderItemInColumn(item, itemType, event) {
    if (!currentProject) return;
    
    console.log(`Reordering ${itemType} "${item.title}"`);
    
    // Get the target position from the drop event
    const dropTarget = event.currentTarget;
    const targetPosition = calculateDropPosition(dropTarget, event, itemType);
    
    let itemArray;
    switch(itemType) {
        case 'brief':
            itemArray = currentProject.briefs;
            break;
        case 'note':
            itemArray = currentProject.notes;
            break;
        case 'copy':
            itemArray = currentProject.copy;
            break;
        case 'task':
            itemArray = currentProject.tasks;
            break;
        default:
            console.log('Unknown item type for reordering:', itemType);
            return;
    }
    
    // Find the current item in the array
    const currentIndex = itemArray.findIndex(arrayItem => arrayItem.id === item.id);
    if (currentIndex === -1) {
        console.log('Item not found in array');
        return;
    }
    
    // Calculate new position (0 = top, array.length-1 = bottom)
    let newPosition;
    if (targetPosition === 'top') {
        newPosition = 0;
    } else if (targetPosition === 'bottom') {
        newPosition = itemArray.length - 1;
    } else if (typeof targetPosition === 'number') {
        newPosition = Math.max(0, Math.min(targetPosition, itemArray.length - 1));
    } else {
        // Default to current position if we can't determine target
        newPosition = currentIndex;
    }
    
    console.log(`Moving item from position ${currentIndex} to position ${newPosition}`);
    
    // Only proceed if position actually changed
    if (currentIndex === newPosition) {
        console.log('Item dropped in same position, no reordering needed');
        return;
    }
    
    // Remove item from current position
    const movedItem = itemArray.splice(currentIndex, 1)[0];
    
    // Insert at new position
    itemArray.splice(newPosition, 0, movedItem);
    
    // Update order values for all items
    itemArray.forEach((arrayItem, index) => {
        arrayItem.order = index;
    });
    
    // Save and re-render
    saveProjects();
    
    // Re-render the appropriate column
    switch(itemType) {
        case 'brief':
            renderBriefs();
            break;
        case 'note':
            renderNotes();
            break;
        case 'copy':
            renderCopy();
            break;
        case 'task':
            renderProjectTasks();
            break;
    }
    
    showNotification(`Reordered "${item.title}" in ${itemType}s`);
    console.log(`Successfully reordered ${itemType}`);
}

function calculateDropPosition(dropTarget, event, itemType) {
    // Get the container for this item type
    let container;
    switch(itemType) {
        case 'brief':
            container = getEl('briefsList');
            break;
        case 'note':
            container = getEl('notesList');
            break;
        case 'copy':
            container = getEl('copyList');
            break;
        case 'task':
            container = getEl('projectTaskContainer');
            break;
        default:
            return 'bottom';
    }
    
    if (!container) return 'bottom';
    
    // Get all item elements in the container
    const itemElements = Array.from(container.children).filter(child => 
        child.classList.contains('item') || 
        child.classList.contains('project-task-item') ||
        child.classList.contains('sortable-item')
    );
    
    if (itemElements.length === 0) return 0;
    
    // Find the closest item to the drop position
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
    
    // Determine if we should insert before or after the closest item
    const closestElement = itemElements[closestIndex];
    const rect = closestElement.getBoundingClientRect();
    const elementCenter = rect.top + rect.height / 2;
    
    if (mouseY < elementCenter) {
        // Insert before the closest item
        return closestIndex;
    } else {
        // Insert after the closest item
        return closestIndex + 1;
    }
}

function showDropPositionIndicator(event) {
    // Remove any existing indicators
    document.querySelectorAll('.drop-position-indicator').forEach(indicator => {
        indicator.remove();
    });
    
    // Only show indicator for same-type drops (reordering)
    const targetType = event.currentTarget.getAttribute('data-drop-type') || 
                      event.currentTarget.closest('[data-drop-type]')?.getAttribute('data-drop-type');
    
    if (draggedItemType !== targetType) return;
    
    // Get the container
    let container;
    switch(draggedItemType) {
        case 'brief':
            container = getEl('briefsList');
            break;
        case 'note':
            container = getEl('notesList');
            break;
        case 'copy':
            container = getEl('copyList');
            break;
        case 'task':
            container = getEl('projectTaskContainer');
            break;
        default:
            return;
    }
    
    if (!container) return;
    
    // Calculate drop position
    const position = calculateDropPosition(event.currentTarget, event, draggedItemType);
    const itemElements = Array.from(container.children).filter(child => 
        child.classList.contains('item') || 
        child.classList.contains('project-task-item') ||
        child.classList.contains('sortable-item')
    );
    
    // Create drop indicator
    const indicator = document.createElement('div');
    indicator.className = 'drop-position-indicator';
    indicator.style.cssText = `
        height: 2px;
        background: #3b82f6;
        margin: 2px 0;
        border-radius: 1px;
        opacity: 0.8;
        position: relative;
        z-index: 1000;
    `;
    
    // Insert indicator at the calculated position
    if (typeof position === 'number' && position < itemElements.length) {
        container.insertBefore(indicator, itemElements[position]);
    } else {
        container.appendChild(indicator);
    }
}

function moveItemBetweenColumns(item, fromType, toType) {
    if (!currentProject) return;
    
    console.log(`Moving item from ${fromType} to ${toType}:`, item.title);
    
    // Remove from source column
    if (fromType === 'note') {
        currentProject.notes = currentProject.notes.filter(n => n.id !== item.id);
    } else if (fromType === 'copy') {
        currentProject.copy = currentProject.copy.filter(c => c.id !== item.id);
    }
    
    // Update item type and add to target column
    item.type = toType;
    item.order = 0; // Move to top
    
    if (toType === 'note') {
        // Update order of existing notes
        currentProject.notes.forEach(note => {
            if (note.order !== undefined) {
                note.order += 1;
            }
        });
        currentProject.notes.unshift(item);
        renderNotes();
        showNotification(`Moved "${item.title}" to Notes`);
    } else if (toType === 'copy') {
        // Update order of existing copy
        currentProject.copy.forEach(copy => {
            if (copy.order !== undefined) {
                copy.order += 1;
            }
        });
        currentProject.copy.unshift(item);
        renderCopy();
        showNotification(`Moved "${item.title}" to Copy`);
    }
    
    // Re-render source column
    if (fromType === 'note') {
        renderNotes();
    } else if (fromType === 'copy') {
        renderCopy();
    }
    
    saveProjects();
}

function createItemFromDrop(sourceItem, sourceType, targetType) {
    if (!currentProject) {
        console.log('No current project');
        return;
    }
    
    console.log('Creating item from drop:', sourceType, '->', targetType);
    
    let content = '';
    let title = sourceItem.title;
    
    // Handle different source types and their content
    if (sourceType === 'brief') {
        // For briefs, combine proposition and client brief for tasks only
        if (targetType === 'task') {
            const proposition = sourceItem.proposition || '';
            const clientBrief = sourceItem.clientBrief || sourceItem.content || '';
            content = [proposition, clientBrief].filter(Boolean).join('\n\n');
        } else {
            // For linked notes/copy, don't copy content - start fresh
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
    
    // Special handling for different drop scenarios
    if (targetType === 'task') {
        // Check for existing task from the same source and remove it
        if (sourceItem.id && sourceType) {
            const existingTaskIndex = currentProject.tasks.findIndex(task => 
                task.sourceItemId === sourceItem.id && task.sourceItemType === sourceType
            );
            if (existingTaskIndex !== -1) {
                console.log('Removing existing duplicate task');
                currentProject.tasks.splice(existingTaskIndex, 1);
            }
        }
        
        // Any item dropped on tasks becomes a task
        newItem.completed = false;
        newItem.sourceItemId = sourceItem.id;
        newItem.sourceItemType = sourceType;
        newItem.order = 0; // Always add at top
        
        // Update order of other tasks
        currentProject.tasks.forEach(task => {
            if (task.order !== undefined) {
                task.order += 1;
            }
        });
        
        currentProject.tasks.unshift(newItem);
        renderProjectTasks();
        showNotification(`Created task "${newItem.title}" from ${sourceType}`);
    } else if (sourceType === 'brief' && (targetType === 'note' || targetType === 'copy')) {
        // Brief dropped on note/copy creates linked item
        newItem.linkedBriefId = sourceItem.id;
        newItem.title = `${sourceItem.title} - ${targetType}`;
        
        console.log('Creating note from brief:', sourceItem, 'Proposition:', sourceItem.proposition);
        
        // For notes, automatically insert the proposition
        if (targetType === 'note' && sourceItem.proposition && sourceItem.proposition.trim()) {
            const propText = sourceItem.proposition.trim();
            newItem.richContent = `<p><strong>Prop:</strong> <em>${propText}</em></p><br><p></p>`;
            newItem.content = `Prop: ${propText}\n\n`;
            console.log('Added proposition to note:', propText);
        } else {
            newItem.content = ''; // Start fresh for copy or notes without proposition
            newItem.richContent = '<p></p>';
            console.log('No proposition found or creating copy');
        }
        
        if (targetType === 'note') {
            newItem.order = 0;
            // Update order of other notes
            currentProject.notes.forEach(note => {
                if (note.order !== undefined) {
                    note.order += 1;
                }
            });
            currentProject.notes.unshift(newItem);
            renderNotes();
            showNotification(`Created linked note "${newItem.title}"`);
        } else {
            newItem.order = 0;
            // Update order of other copy
            currentProject.copy.forEach(copy => {
                if (copy.order !== undefined) {
                    copy.order += 1;
                }
            });
            currentProject.copy.unshift(newItem);
            renderCopy();
            showNotification(`Created linked copy "${newItem.title}"`);
        }
    } else if (targetType === 'brief') {
        // Converting to brief - split content into proposition and client brief
        newItem = {
            id: generateId(),
            title: title,
            proposition: '', // Leave empty for user to fill
            clientBrief: content,
            type: 'brief',
            linkColor: getNextLinkColor(),
            order: 0,
            createdAt: getCurrentTimestamp()
        };
        // Update order of other briefs
        currentProject.briefs.forEach(brief => {
            if (brief.order !== undefined) {
                brief.order += 1;
            }
        });
        currentProject.briefs.unshift(newItem);
        renderBriefs();
        showNotification(`Created brief "${newItem.title}" from ${sourceType}`);
    } else {
        // General item conversion
        if (targetType === 'note') {
            newItem.order = 0;
            // Update order of other notes
            currentProject.notes.forEach(note => {
                if (note.order !== undefined) {
                    note.order += 1;
                }
            });
            currentProject.notes.unshift(newItem);
            renderNotes();
            showNotification(`Created note "${newItem.title}" from ${sourceType}`);
        } else if (targetType === 'copy') {
            newItem.order = 0;
            // Update order of other copy
            currentProject.copy.forEach(copy => {
                if (copy.order !== undefined) {
                    copy.order += 1;
                }
            });
            currentProject.copy.unshift(newItem);
            renderCopy();
            showNotification(`Created copy "${newItem.title}" from ${sourceType}`);
        }
    }
    
    saveProjects();
}

// ===== CONTEXT PRESERVATION SYSTEM =====

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
    
    // Apply project color theme
    const dashboard = getEl('dashboard');
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
}

function saveCurrentContext() {
    if (!currentEditingItem || !currentEditingType || !currentProject) return;
    
    const context = createContextState(currentProject.id, currentEditingItem.id, currentEditingType);
    context.title = currentEditingItem.title;
    
    // Save editor state
    if (currentEditingType === 'brief') {
        const clientBriefField = getEl('editorClientBrief');
        context.editorState = {
            title: getValue('editorItemTitle'),
            proposition: getValue('editorProposition'),
            clientBrief: clientBriefField ? htmlToText(clientBriefField.innerHTML) : '',
            clientBriefRich: clientBriefField ? clientBriefField.innerHTML : ''
        };
        
        // Save cursor position for rich text client brief
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
    
    // Save scroll position
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
        context.scrollPosition = {
            top: editorContent.scrollTop,
            left: editorContent.scrollLeft
        };
    }
    
    // Save to project context
    const projectKey = `project-${currentProject.id}`;
    workContext.projectContexts.set(projectKey, context);
    workContext.currentContext = context;
    
    saveWorkContext();
    console.log('Context saved:', context);
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
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
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
    
    console.log('Restoring context:', context);
    
    // Find and open the item
    const project = projects.find(p => p.id == context.projectId);
    if (!project) return false;
    
    let item = null;
    switch(context.itemType) {
        case 'brief':
            item = project.briefs.find(b => b.id == context.itemId);
            break;
        case 'note':
            item = project.notes.find(n => n.id == context.itemId);
            break;
        case 'copy':
            item = project.copy.find(c => c.id == context.itemId);
            break;
        case 'task':
            item = project.tasks.find(t => t.id == context.itemId);
            break;
    }
    
    if (!item) return false;
    
    // Open the item editor
    openItemEditor(item, context.itemType);
    
    // Restore editor state after a delay
    setTimeout(() => {
        restoreEditorState(context);
        showContextIndicator(`Resumed: ${context.title}`, true);
    }, 300);
    
    return true;
}

function restoreEditorState(context) {
    if (!context.editorState) return;
    
    // Restore title
    setValue('editorItemTitle', context.editorState.title || '');
    
    if (context.itemType === 'brief') {
        // Restore brief fields including rich text client brief
        setValue('editorProposition', context.editorState.proposition || '');
        
        const clientBriefField = getEl('editorClientBrief');
        if (clientBriefField && context.editorState.clientBriefRich) {
            clientBriefField.innerHTML = context.editorState.clientBriefRich;
            
            // Restore cursor position for rich text field
            if (context.cursorPosition) {
                setTimeout(() => {
                    restoreCursorPosition(clientBriefField, context.cursorPosition);
                }, 100);
            }
        }
    } else {
        // Restore content fields
        if (context.editorState.isRichText) {
            const richEditor = getEl('richEditor');
            if (richEditor && context.editorState.content) {
                richEditor.innerHTML = context.editorState.content;
                
                // Restore cursor position
                if (context.cursorPosition) {
                    setTimeout(() => {
                        restoreCursorPosition(richEditor, context.cursorPosition);
                    }, 100);
                }
            }
        } else {
            const textEditor = getEl('editorContent');
            if (textEditor && context.editorState.content) {
                textEditor.value = context.editorState.content;
                
                // Restore cursor position
                if (context.cursorPosition) {
                    setTimeout(() => {
                        textEditor.setSelectionRange(
                            context.cursorPosition.start,
                            context.cursorPosition.end
                        );
                        textEditor.focus();
                    }, 100);
                }
            }
        }
    }
    
    // Restore scroll position
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
    // Remove existing indicator
    const existing = getEl('contextIndicator');
    if (existing) {
        existing.remove();
    }
    
    // Create new indicator
    const indicator = document.createElement('div');
    indicator.id = 'contextIndicator';
    indicator.className = `context-indicator ${isSuccess ? 'success' : ''}`;
    indicator.textContent = message;
    document.body.appendChild(indicator);
    
    // Show and auto-hide
    setTimeout(() => indicator.classList.add('show'), 100);
    setTimeout(() => {
        indicator.classList.remove('show');
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 300);
    }, 2000);
}

function offerWorkResumption() {
    const lastContext = workContext.currentContext;
    if (!lastContext || !lastContext.editorState) return;
    
    // Check if the context is recent (within 24 hours)
    const timeDiff = Date.now() - lastContext.timestamp;
    if (timeDiff > 24 * 60 * 60 * 1000) return;
    
    // Check if the item still exists
    const project = projects.find(p => p.id == lastContext.projectId);
    if (!project) return;
    
    let item = null;
    switch(lastContext.itemType) {
        case 'brief':
            item = project.briefs.find(b => b.id == lastContext.itemId);
            break;
        case 'note':
            item = project.notes.find(n => n.id == lastContext.itemId);
            break;
        case 'copy':
            item = project.copy.find(c => c.id == lastContext.itemId);
            break;
        case 'task':
            item = project.tasks.find(t => t.id == lastContext.itemId);
            break;
    }
    
    if (!item) return;
    
    // Show resume panel
    showResumePanel(lastContext);
}

function showResumePanel(context) {
    // Remove existing panel
    const existing = getEl('resumePanel');
    if (existing) {
        existing.remove();
    }
    
    // Create resume panel
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
    
    // Show panel
    setTimeout(() => panel.classList.add('show'), 100);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (panel.parentNode) {
            dismissResumePanel();
        }
    }, 10000);
}

function dismissResumePanel() {
    const panel = getEl('resumePanel');
    if (panel) {
        panel.classList.remove('show');
        setTimeout(() => {
            if (panel.parentNode) {
                panel.parentNode.removeChild(panel);
            }
        }, 300);
    }
}

function resumeWork(projectId, itemId, itemType) {
    dismissResumePanel();
    
    // Find the context
    const context = workContext.currentContext;
    if (!context || context.projectId != projectId || context.itemId != itemId) return;
    
    // Switch to project if needed
    if (!currentProject || currentProject.id != projectId) {
        switchToProject(projectId, () => {
            setTimeout(() => {
                restoreContext(context);
            }, 200);
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

// Storage functions for context
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

// ===== POMODORO TIMER FUNCTIONS =====

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
    
    console.log('Pomodoro reset to 25:00 work session');
}

function skipPomodoro() {
    pausePomodoro();
    completePomodoro();
}

function completePomodoro() {
    pausePomodoro();
    
    // Save current work context before break
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
        console.log('Work context saved before pomodoro break');
    }
    
    if (pomodoroIsBreak) {
        // Break completed, start new work session
        pomodoroIsBreak = false;
        pomodoroTimeLeft = 25 * 60;
        
        // Auto-resume work if there was context saved
        if (workContext.currentContext) {
            setTimeout(() => {
                restoreContext(workContext.currentContext);
                showContextIndicator('Work resumed after break', true);
            }, 1000);
        }
    } else {
        // Work session completed
        pomodoroSessionCount++;
        pomodoroDailyCount++;
        
        // Start break
        pomodoroIsBreak = true;
        pomodoroTimeLeft = pomodoroSessionCount % 4 === 0 ? 15 * 60 : 5 * 60; // Long break every 4 sessions
        
        // Save daily count
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
    
    // Show completion notification
    showNotification(pomodoroIsBreak ? 'Work session complete! Take a break.' : 'Break over! Ready for another session?');
    
    // Optional: Play notification sound
    playPomodoroSound();
}

function updatePomodoroHeaderStyle() {
    const header = document.querySelector('.editor-header');
    const timer = getEl('pomodoroTimer');
    
    if (!header) return;
    
    // Remove all pomodoro classes first
    header.classList.remove('pomodoro-active', 'pomodoro-break');
    
    // Make sure timer is visible if it exists
    if (timer && timer.style.display !== 'none') {
        console.log('Pomodoro timer found, updating header style. Running:', pomodoroIsRunning, 'Break:', pomodoroIsBreak);
        
        // Add appropriate class if running
        if (pomodoroIsRunning) {
            if (pomodoroIsBreak) {
                header.classList.add('pomodoro-break');
                console.log('Applied pomodoro-break style');
            } else {
                header.classList.add('pomodoro-active');
                console.log('Applied pomodoro-active style');
            }
        }
    }
}

function enterFocusMode() {
    const editorModal = getEl('itemEditor');
    
    // First apply our fullscreen styling
    editorModal.classList.add('true-fullscreen');
    setupFullscreenOverlay();
    
    // Then try browser fullscreen as enhancement
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            console.log('Browser fullscreen not available, using app fullscreen');
        });
    } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen().catch(err => {
            console.log('Webkit fullscreen not available, using app fullscreen');
        });
    } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen().catch(err => {
            console.log('MS fullscreen not available, using app fullscreen');
        });
    }
}

function setupFullscreenOverlay() {
    // Remove any existing overlay first
    const existingOverlay = getEl('focusOverlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }
    
    // Add overlay with timer info
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
    
    // Hide cursor after 3 seconds of inactivity
    let cursorTimeout;
    const hideCursor = () => {
        document.body.style.cursor = 'none';
    };
    const showCursor = () => {
        document.body.style.cursor = 'default';
        clearTimeout(cursorTimeout);
        cursorTimeout = setTimeout(hideCursor, 3000);
    };
    
    // Clean up any existing listeners
    document.removeEventListener('mousemove', showCursor);
    document.addEventListener('mousemove', showCursor);
    showCursor();
}

function exitFocusMode() {
    const editorModal = getEl('itemEditor');
    
    // Exit browser fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen().catch(() => {});
    } else if (document.msFullscreenElement) {
        document.msExitFullscreen().catch(() => {});
    }
    
    // Remove our fullscreen classes
    editorModal.classList.remove('fullscreen');
    editorModal.classList.remove('true-fullscreen');
    
    // Remove overlay
    const overlay = getEl('focusOverlay');
    if (overlay) {
        overlay.remove();
    }
    
    // Restore cursor
    document.body.style.cursor = 'default';
}

function updatePomodoroDisplay() {
    const displayElement = getEl('pomodoroDisplay');
    if (!displayElement) {
        console.log('Pomodoro display element not found');
        return;
    }
    
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    displayElement.textContent = timeString;
    
    // Update overlay timer if in fullscreen mode
    const overlayTimer = getEl('overlayTimer');
    if (overlayTimer) {
        overlayTimer.textContent = timeString;
    }
    
    console.log('Updated pomodoro display:', timeString);
}

function updatePomodoroStatus() {
    const statusElement = getEl('pomodoroStatus');
    if (!statusElement) {
        console.log('Pomodoro status element not found');
        return;
    }
    
    if (pomodoroIsRunning) {
        statusElement.textContent = pomodoroIsBreak ? 'Break time - relax!' : 'Focus time - stay concentrated!';
    } else {
        if (pomodoroIsBreak) {
            statusElement.textContent = 'Break paused';
        } else {
            statusElement.textContent = pomodoroTimeLeft === 25 * 60 ? 'Ready to focus' : 'Paused';
        }
    }
    
    console.log('Updated pomodoro status:', statusElement.textContent);
}

function updatePomodoroStats() {
    const sessionElement = getEl('sessionCount');
    const dailyElement = getEl('dailyCount');
    
    if (sessionElement) {
        sessionElement.textContent = pomodoroSessionCount;
    }
    if (dailyElement) {
        dailyElement.textContent = pomodoroDailyCount;
    }
    
    console.log('Updated pomodoro stats - Session:', pomodoroSessionCount, 'Daily:', pomodoroDailyCount);
}

function playPomodoroSound() {
    // Create a simple beep sound using Web Audio API
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
    // Load daily count
    const today = new Date().toDateString();
    const savedDaily = loadFromStorage('pomodoroDaily');
    
    if (savedDaily) {
        pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
    }
    
    updatePomodoroDisplay();
    updatePomodoroStatus();
    updatePomodoroStats();
    
    // Make sure timer is visible
    const timer = getEl('pomodoroTimer');
    if (timer) {
        timer.style.display = 'flex';
        console.log('Pomodoro timer initialized and made visible');
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
        
        // If timer reached zero while away, complete the pomodoro
        if (savedState.isRunning && pomodoroTimeLeft <= 0) {
            completePomodoro();
        }
    }
}

function clearPomodoroState() {
    if (window.appStorage) {
        delete window.appStorage['pomodoroState'];
    }
}

// ===== ESSENTIAL UI FUNCTIONS =====

function openProjectModal() {
    setDisplay('projectModal', 'block');
}

function showHelp() {
    setDisplay('helpModal', 'block');
}

function closeModal(modalId) {
    setDisplay(modalId, 'none');
    
    // If closing the confirm modal, clear callbacks
    if (modalId === 'confirmModal') {
        confirmCallback = null;
        confirmData = null;
    }
}

function closeEditor() {
    // Save current context before closing
    if (currentEditingItem && currentEditingType && currentProject) {
        saveCurrentContext();
    }
    
    // Pause pomodoro if running
    if (pomodoroIsRunning) {
        pausePomodoro();
    }
    
    // Exit focus mode
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
    
    // Remove project themes from dashboard
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    dashboard.classList.remove('project-themed');
    
    updateSettingsButton();
    renderProjectOverview();
    renderGlobalTasks();
}

function toggleArchivedProjects() {
    try {
        showArchived = !showArchived;
        const button = getEl('archiveToggle');
        if (button) {
            button.innerHTML = showArchived ? 
                'Hide Archived' : 
                'Show Archived';
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
    // Save current context before switching
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
        
        // Apply project color theme
        const dashboard = getEl('dashboard');
        colorThemes.forEach(theme => {
            dashboard.classList.remove(`project-theme-${theme}`);
        });
        if (currentProject.colorTheme) {
            dashboard.classList.add(`project-theme-${currentProject.colorTheme}`);
        }
        dashboard.classList.add('project-themed');
        
        updateSettingsButton();
        renderProject();
        
        // Check for previous work context in this project
        const contextKey = `project-${projectId}`;
        const projectContext = workContext.projectContexts.get(contextKey);
        if (projectContext && projectContext.editorState) {
            // Small delay to let project render
            setTimeout(() => {
                const timeDiff = Date.now() - projectContext.timestamp;
                // Only auto-restore if context is recent (within 4 hours)
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

// Helper functions - define early to avoid reference errors
function getLinkedItemsCount(briefId) {
    let count = 0;
    if (currentProject && currentProject.notes) {
        count += currentProject.notes.filter(note => note.linkedBriefId === briefId).length;
    }
    if (currentProject && currentProject.copy) {
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
        // For briefs, combine title, proposition, and client brief
        const title = getValue('editorItemTitle');
        const proposition = getValue('editorProposition');
        const clientBriefField = getEl('editorClientBrief');
        const clientBriefHtml = clientBriefField ? clientBriefField.innerHTML : '';
        const clientBriefText = htmlToText(clientBriefHtml);
        
        contentToCopy = title;
        if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
        if (clientBriefText) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBriefText;
        
        // Create HTML version
        htmlContent = `<h3>${title}</h3>`;
        if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
        if (clientBriefHtml) htmlContent += `<h4>CLIENT BRIEF:</h4>${clientBriefHtml}`;
    } else {
        // For notes, copy, and tasks
        const title = getValue('editorItemTitle');
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        let content = '';
        if (richEditor && richEditor.style.display !== 'none') {
            // Rich text editor - preserve HTML formatting
            content = richEditor.innerHTML;
            htmlContent = `<h3>${title}</h3>${content}`;
            contentToCopy = title + '\n\n' + htmlToText(content);
        } else if (textEditor) {
            // Plain text editor
            content = textEditor.value.trim();
            contentToCopy = title + '\n\n' + content;
            htmlContent = `<h3>${title}</h3><p>${content.replace(/\n/g, '<br>')}</p>`;
        }
    }
    
    // Copy to clipboard with both HTML and plain text
    if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([contentToCopy], { type: 'text/plain' })
        });
        
        navigator.clipboard.write([clipboardItem]).then(() => {
            showNotification('Content copied to clipboard with formatting!');
        }).catch(err => {
            console.error('Failed to copy with formatting:', err);
            fallbackCopyToClipboard(contentToCopy);
        });
    } else if (navigator.clipboard) {
        // Fallback to plain text only
        navigator.clipboard.writeText(contentToCopy).then(() => {
            showNotification('Content copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy to clipboard:', err);
            fallbackCopyToClipboard(contentToCopy);
        });
    } else {
        fallbackCopyToClipboard(contentToCopy);
    }
}

function fallbackCopyToClipboard(text) {
    // Fallback for older browsers
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
        console.error('Fallback copy failed:', err);
        showNotification('Failed to copy to clipboard');
    }
    
    document.body.removeChild(textArea);
}

function htmlToText(html) {
    // Convert HTML to plain text for storage
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
}

function textToHtml(text) {
    // Convert plain text to HTML with basic formatting
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

// Double-click editing functions - define globally
function openItemEditor(item, itemType) {
    if (!item) return;
    
    // Save current context before switching
    if (currentEditingItem) {
        saveCurrentContext();
    }
    
    currentEditingItem = item;
    currentEditingType = itemType;
    hasUnsavedChanges = false;
    
    // Add to breadcrumbs
    if (currentProject) {
        addToBreadcrumbs(currentProject.id, item.id, itemType, item.title);
    }
    
    // Populate editor
    setContent('editorTitle', `Edit ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`);
    setValue('editorItemTitle', item.title || '');
    
    // Show/hide fields based on item type
    const briefFields = getEl('briefFields');
    const standardFields = getEl('standardFields');
    const insertHeadingsBtn = getEl('insertHeadingsBtn');
    const copyToClipboardBtn = getEl('copyToClipboardBtn');
    const richEditor = getEl('richEditor');
    const textEditor = getEl('editorContent');
    
    if (itemType === 'brief') {
        // Brief-specific fields
        setDisplay('briefFields', 'block');
        setDisplay('standardFields', 'none');
        
        // Handle backwards compatibility and set up rich text for client brief
        setValue('editorProposition', item.proposition || '');
        
        // Convert client brief to rich text editor
        const clientBriefField = getEl('editorClientBrief');
        if (clientBriefField) {
            // Make client brief field a rich text editor
            clientBriefField.contentEditable = true;
            clientBriefField.style.minHeight = '200px';
            clientBriefField.style.border = '1px solid #d1d5db';
            clientBriefField.style.borderRadius = '4px';
            clientBriefField.style.padding = '8px';
            clientBriefField.style.fontFamily = 'inherit';
            clientBriefField.style.fontSize = '14px';
            clientBriefField.style.lineHeight = '1.5';
            
            // Set content - use rich content if available, otherwise convert plain text
            if (item.clientBriefRich) {
                clientBriefField.innerHTML = item.clientBriefRich;
            } else if (item.clientBrief) {
                clientBriefField.innerHTML = textToHtml(item.clientBrief);
            } else if (item.content) {
                // Backwards compatibility
                clientBriefField.innerHTML = textToHtml(item.content);
            } else {
                clientBriefField.innerHTML = '<p></p>';
            }
        }
        
        // Setup document upload for briefs
        setTimeout(() => {
            setupDocumentUpload();
        }, 100);
    } else {
        // Standard fields for notes, copy, tasks
        setDisplay('briefFields', 'none');
        setDisplay('standardFields', 'block');
        
        // Use rich text editor for notes and copy, plain text for tasks
        if (itemType === 'note' || itemType === 'copy') {
            setDisplay('richEditor', 'block');
            setDisplay('editorContent', 'none');
            // Use rich content if available, otherwise convert plain text to HTML
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
        
        // Show insert headings button only for notes
        if (insertHeadingsBtn) {
            setDisplay('insertHeadingsBtn', itemType === 'note' ? 'inline-flex' : 'none');
        }
        
        // Show copy to clipboard button for notes, copy, and briefs
        if (copyToClipboardBtn) {
            setDisplay('copyToClipboardBtn', (itemType === 'note' || itemType === 'copy' || itemType === 'brief') ? 'inline-flex' : 'none');
        }
    }
    
    // Show the modal FIRST
    setDisplay('itemEditor', 'block');
    console.log('Modal displayed, item type:', itemType);
    
    // Handle pomodoro timer setup
    const setupPomodoroTimer = () => {
        const pomodoroTimer = getEl('pomodoroTimer');
        const pomodoroDisplay = getEl('pomodoroDisplay');
        const pomodoroStatus = getEl('pomodoroStatus');
        
        if (itemType === 'note' || itemType === 'copy') {
            if (pomodoroTimer) {
                pomodoroTimer.style.display = 'flex';
                pomodoroTimer.style.visibility = 'visible';
                
                setTimeout(() => {
                    if (pomodoroDisplay && pomodoroStatus) {
                        initializePomodoro();
                        updatePomodoroHeaderStyle();
                    }
                }, 50);
            }
        } else {
            if (pomodoroTimer) {
                pomodoroTimer.style.display = 'none';
            }
        }
    };
    
    setTimeout(setupPomodoroTimer, 50);
    
    setTimeout(() => {
        // Setup autosave listeners
        setupAutosaveListeners();
        updateAutosaveStatus('ready');
        
        // Check for existing context to restore
        const contextKey = `project-${currentProject.id}`;
        const existingContext = workContext.projectContexts.get(contextKey);
        if (existingContext && 
            existingContext.itemId == item.id && 
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
    
    // Try to get proposition from linked brief if this is a note
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
    
    // Check if editor is in rich text mode
    if (richEditor.style.display !== 'none') {
        // Insert into rich text editor
        richEditor.innerHTML = headingsHtml + richEditor.innerHTML;
        richEditor.focus();
    } else {
        // Fallback to plain text
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
        
        // Clear form
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
        const linkColor = getNextLinkColor();
        console.log('Assigning color to new brief:', linkColor, 'Index:', nextLinkColorIndex);
        
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
        
        // Update order of existing briefs
        currentProject.briefs.forEach(existingBrief => {
            if (existingBrief.order !== undefined) {
                existingBrief.order += 1;
            }
        });
        
        currentProject.briefs.unshift(brief);
        saveProjects();
        renderBriefs();
        
        // Clear input
        setValue('briefTitle', '');
        
        console.log('Created brief with color:', brief.linkColor);
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
        
        // Update order of existing notes
        currentProject.notes.forEach(existingNote => {
            if (existingNote.order !== undefined) {
                existingNote.order += 1;
            }
        });
        
        currentProject.notes.unshift(note);
        saveProjects();
        renderNotes();
        
        // Clear input
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
        
        // Update order of existing copy
        currentProject.copy.forEach(existingCopy => {
            if (existingCopy.order !== undefined) {
                existingCopy.order += 1;
            }
        });
        
        currentProject.copy.unshift(copy);
        saveProjects();
        renderCopy();
        
        // Clear input
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
        
        // Update order of existing tasks
        currentProject.tasks.forEach(existingTask => {
            if (existingTask.order !== undefined) {
                existingTask.order += 1;
            }
        });
        
        currentProject.tasks.unshift(task);
        saveProjects();
        renderProjectTasks();
        
        // Clear input
        setValue('taskTitle', '');
    }
}

// Handle Enter key press in input fields
function handleEnterKey(event, type) {
    if (event.key === 'Enter') {
        switch(type) {
            case 'brief':
                addQuickBrief();
                break;
            case 'note':
                addQuickNote();
                break;
            case 'copy':
                addQuickCopy();
                break;
            case 'task':
                addQuickTask();
                break;
        }
    }
}

// Render functions
function renderProject() {
    if (!currentProject) return;
    
    renderBriefs();
    renderNotes();
    renderCopy();
    renderProjectTasks();
}

function renderProjectOverview() {
    const grid = getEl('projectGrid');
    if (!grid) return;
    
    // Ensure projects is an array
    if (!Array.isArray(projects)) {
        projects = [];
    }
    
    // Filter projects based on archive status
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
            // Safety checks for project properties
            const totalTasks = (project.tasks && Array.isArray(project.tasks)) ? project.tasks.length : 0;
            const completedTasks = (project.tasks && Array.isArray(project.tasks)) ? project.tasks.filter(t => t && t.completed).length : 0;
            const colorTheme = project.colorTheme || 'blue';
            const briefsCount = (project.briefs && Array.isArray(project.briefs)) ? project.briefs.length : 0;
            const notesCount = (project.notes && Array.isArray(project.notes)) ? project.notes.length : 0;
            const copyCount = (project.copy && Array.isArray(project.copy)) ? project.copy.length : 0;
            
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
    
    // Setup delete listeners after rendering
    setupDeleteListeners();
    }
}

function renderBriefs() {
    const list = getEl('briefsList');
    if (!currentProject.briefs) currentProject.briefs = [];
    
    // Ensure briefs have order values
    currentProject.briefs.forEach((brief, index) => {
        if (brief.order === undefined) {
            brief.order = index;
        }
    });
    
    // Sort briefs by order
    const sortedBriefs = [...currentProject.briefs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedBriefs.map(brief => {
        const linkedCount = getLinkedItemsCount(brief.id);
        
        // Assign link color if not already assigned (for backwards compatibility)
        if (!brief.linkColor) {
            brief.linkColor = getNextLinkColor();
            // Only save if we actually assigned a new color
            setTimeout(() => saveProjects(), 0);
        }
        
        // Use the brief's assigned color always (not just when linked)
        const borderColor = brief.linkColor || '#a3a3a3';
        
        // Handle backwards compatibility and rich text content
        const proposition = brief.proposition || '';
        const clientBrief = brief.clientBrief || brief.content || '';
        const clientBriefRich = brief.clientBriefRich || '';
        const hasProposition = proposition.trim().length > 0;
        const hasClientBrief = clientBrief.trim().length > 0 || clientBriefRich.trim().length > 0;
        
        // Get preview content - prefer rich content, fallback to plain text
        let clientBriefPreview = '';
        if (clientBriefRich && clientBriefRich.trim()) {
            // Convert rich content to plain text for preview
            clientBriefPreview = truncateContent(htmlToText(clientBriefRich), 120);
        } else if (clientBrief) {
            clientBriefPreview = truncateContent(clientBrief, 120);
        }
        
        return `
            <div class="item brief-item sortable-item ${linkedCount > 0 ? 'linked-item' : ''}" 
                 draggable="true"
                 data-item='${JSON.stringify(brief).replace(/'/g, '&#39;')}'
                 data-type="brief"
                 ondragstart="handleDragStart(event)"
                 ondragend="handleDragEnd(event)"
                 ondblclick="openItemEditor(findItem('${brief.id}', 'brief'), 'brief')"
                 style="border-left: 3px solid ${borderColor};">
                <div class="grab-handle"></div>
                <div class="item-type type-brief">Brief</div>
                <div class="item-header">
                    <div class="item-title">${brief.title}</div>
                </div>
                <div class="item-meta">
                    Created: ${formatDate(brief.createdAt)}
                    ${linkedCount > 0 ? ` • ${linkedCount} linked item${linkedCount > 1 ? 's' : ''}` : ''}
                    ${clientBriefRich ? ' • Rich text' : ''}
                </div>
                
                ${hasProposition ? `
                    <div style="margin: 8px 0; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; border-radius: 4px;">
                        <div style="font-size: 11px; font-weight: 600; color: #0369a1; text-transform: uppercase; margin-bottom: 4px;">Proposition</div>
                        <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                            ${truncateContent(proposition, 120)}
                        </div>
                    </div>
                ` : ''}
                
                ${hasClientBrief ? `
                    <div style="margin: 8px 0; padding: 8px; background: #fefce8; border-left: 3px solid #eab308; border-radius: 4px;">
                        <div style="font-size: 11px; font-weight: 600; color: #a16207; text-transform: uppercase; margin-bottom: 4px;">Client Brief ${clientBriefRich ? '(Rich Text)' : ''}</div>
                        <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                            ${clientBriefPreview}
                        </div>
                    </div>
                ` : ''}
                
                <div class="item-actions">
                    <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">
                        Double-click to edit • Drag to create linked items
                    </div>
                    <button class="delete-btn" data-delete-type="brief" data-delete-id="${brief.id}">
                        ×
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderNotes() {
    const list = getEl('notesList');
    if (!currentProject.notes) currentProject.notes = [];
    
    // Ensure notes have order values
    currentProject.notes.forEach((note, index) => {
        if (note.order === undefined) {
            note.order = index;
        }
    });
    
    // Sort notes by order
    const sortedNotes = [...currentProject.notes].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedNotes.map(note => {
        const isLinked = note.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === note.linkedBriefId) : null;
        const linkColor = getLinkColor(note, 'note');
        const borderColor = linkColor || '#a3a3a3'; // Grey for unlinked
        
        return `
            <div class="item note-item sortable-item ${isLinked ? 'linked-item' : ''}" 
                 draggable="true"
                 data-item='${JSON.stringify(note).replace(/'/g, '&#39;')}'
                 data-type="note"
                 ondragstart="handleDragStart(event)"
                 ondragend="handleDragEnd(event)"
                 ondblclick="openItemEditor(findItem('${note.id}', 'note'), 'note')"
                 style="border-left: 3px solid ${borderColor};">
                <div class="grab-handle"></div>
                <div class="item-type type-note">Note</div>
                <div class="item-header">
                    <div class="item-title">${note.title}</div>
                </div>
                <div class="item-meta">
                    Created: ${formatDate(note.createdAt)}
                    ${isLinked && linkedBrief ? ` • Linked to "${linkedBrief.title}"` : ''}
                </div>
                ${note.content ? `
                    <div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                        ${truncateContent(note.content)}
                    </div>
                ` : ''}
                <div class="item-actions">
                    <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">
                        Double-click to edit • Drag to create task
                    </div>
                    <button class="delete-btn" data-delete-type="note" data-delete-id="${note.id}">
                        ×
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderCopy() {
    const list = getEl('copyList');
    if (!currentProject.copy) currentProject.copy = [];
    
    // Ensure copy items have order values
    currentProject.copy.forEach((copy, index) => {
        if (copy.order === undefined) {
            copy.order = index;
        }
    });
    
    // Sort copy items by order
    const sortedCopy = [...currentProject.copy].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    list.innerHTML = sortedCopy.map(copy => {
        const isLinked = copy.linkedBriefId;
        const linkedBrief = isLinked ? currentProject.briefs.find(b => b.id === copy.linkedBriefId) : null;
        const linkColor = getLinkColor(copy, 'copy');
        const borderColor = linkColor || '#a3a3a3'; // Grey for unlinked
        
        return `
            <div class="item copy-item sortable-item ${isLinked ? 'linked-item' : ''}" 
                 draggable="true"
                 data-item='${JSON.stringify(copy).replace(/'/g, '&#39;')}'
                 data-type="copy"
                 ondragstart="handleDragStart(event)"
                 ondragend="handleDragEnd(event)"
                 ondblclick="openItemEditor(findItem('${copy.id}', 'copy'), 'copy')"
                 style="border-left: 3px solid ${borderColor};">
                <div class="grab-handle"></div>
                <div class="item-type type-copy">Copy</div>
                <div class="item-header">
                    <div class="item-title">${copy.title}</div>
                </div>
                <div class="item-meta">
                    Created: ${formatDate(copy.createdAt)}
                    ${isLinked && linkedBrief ? ` • Linked to "${linkedBrief.title}"` : ''}
                </div>
                ${copy.content ? `
                    <div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                        ${truncateContent(copy.content)}
                    </div>
                ` : ''}
                <div class="item-actions">
                    <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">
                        Double-click to edit • Drag to create task
                    </div>
                    <button class="delete-btn" data-delete-type="copy" data-delete-id="${copy.id}">
                        ×
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderProjectTasks() {
    const container = getEl('projectTaskContainer');
    if (!container || !currentProject) return;
    
    if (!currentProject.tasks) currentProject.tasks = [];
    
    // Ensure tasks have order values
    currentProject.tasks.forEach((task, index) => {
        if (task.order === undefined) {
            task.order = index;
        }
    });
    
    // Sort tasks with completed at bottom
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
                case 'brief':
                    sourceItem = currentProject.briefs.find(b => b.id === task.sourceItemId);
                    break;
                case 'note':
                    sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId);
                    break;
                case 'copy':
                    sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId);
                    break;
            }
        }
        
        const linkColor = getLinkColor(task, 'task') || '#10b981';
        
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
                    ${hasSource && sourceItem ? ` • From: "${sourceItem.title}"` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${formatDate(task.completedAt)}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                        ${truncateContent(task.content)}
                    </div>
                ` : ''}
                
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span>${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to reorder</span>
                    ${hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy') ? `
                        <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToProjectSource('${task.id}')" title="Open in focus mode with Pomodoro">
                            Dive In
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function findItem(itemId, itemType) {
    if (!currentProject) return null;
    
    switch(itemType) {
        case 'brief':
            return currentProject.briefs.find(item => item.id == itemId);
        case 'note':
            return currentProject.notes.find(item => item.id == itemId);
        case 'copy':
            return currentProject.copy.find(item => item.id == itemId);
        case 'task':
            return currentProject.tasks.find(item => item.id == itemId);
        default:
            return null;
    }
}

function toggleProjectTask(taskId) {
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        // Add completion timestamp when completed
        if (task.completed) {
            task.completedAt = getCurrentTimestamp();
        } else {
            delete task.completedAt;
        }
        saveProjects();
        renderProjectTasks();
        
        // Update global tasks if this affects them
        renderGlobalTasks();
    }
}

function diveInToProjectSource(taskId) {
    console.log('Diving into project source:', taskId);
    if (!currentProject) {
        console.log('No current project');
        return;
    }
    
    // Find the task
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task) {
        console.log('Task not found in project');
        return;
    }
    
    // Only proceed if the source is a note or copy
    if (!task.sourceItemId || !task.sourceItemType || (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
        console.log('Task source is not a note or copy, cannot dive in');
        showNotification('Dive In is only available for tasks created from notes or copy');
        return;
    }
    
    // Find the source item
    let sourceItem = null;
    switch(task.sourceItemType) {
        case 'note':
            sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId);
            break;
        case 'copy':
            sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId);
            break;
    }
    
    if (sourceItem) {
        console.log('Found source item, entering focus mode:', sourceItem);
        // Open the item editor
        openItemEditor(sourceItem, task.sourceItemType);
        
        // Wait for editor to be ready, then enter focus mode and start pomodoro
        setTimeout(() => {
            // Reset pomodoro to work session if it's currently a break
            if (pomodoroIsBreak) {
                pomodoroIsBreak = false;
                pomodoroTimeLeft = 25 * 60;
                updatePomodoroDisplay();
                updatePomodoroStatus();
            }
            
            // Start the pomodoro and enter focus mode
            if (!pomodoroIsRunning) {
                startPomodoro();
            }
            
            showNotification(`Diving into "${sourceItem.title}" - Focus mode activated!`);
        }, 300);
    } else {
        console.log('Source item not found in project');
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
    
    // Store which project we're editing
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
        
        // Update display
        if (currentProject && currentProject.id === project.id) {
            // Re-apply theme
            const dashboard = getEl('dashboard');
            colorThemes.forEach(theme => {
                dashboard.classList.remove(`project-theme-${theme}`);
            });
            dashboard.classList.add(`project-theme-${newTheme}`);
        }
        
        renderProjectOverview();
        window.currentSettingsProject = null;
    }
}

function saveProjects() {
    saveToStorage('projects', projects);
    
    // Clean up old completed tasks whenever we save
    setTimeout(() => {
        cleanupOldCompletedTasks();
    }, 100);
}

// Autosave functions
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
                // Reset to ready after 2 seconds
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
    // Clear existing timeout
    if (autosaveTimeout) {
        clearTimeout(autosaveTimeout);
    }
    
    // Show unsaved changes status
    hasUnsavedChanges = true;
    updateAutosaveStatus('changes');
    
    // Set new timeout for autosave
    autosaveTimeout = setTimeout(() => {
        if (hasUnsavedChanges) {
            autosaveItem();
        }
    }, 1500); // Save after 1.5 seconds of inactivity
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
    
    // Check if content has actually changed to trigger reordering
    let contentChanged = oldTitle !== newTitle;
    
    // Handle different item types
    if (currentEditingType === 'brief') {
        // Save brief-specific fields with rich text support
        const oldProposition = currentEditingItem.proposition || '';
        const oldClientBrief = currentEditingItem.clientBrief || '';
        const oldClientBriefRich = currentEditingItem.clientBriefRich || '';
        
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
        
        // Remove old content field for cleanup
        delete currentEditingItem.content;
    } else {
        // Save content based on editor type
        const richEditor = getEl('richEditor');
        const textEditor = getEl('editorContent');
        
        if (richEditor && richEditor.style.display !== 'none') {
            // Rich text editor - convert HTML to text for storage
            const oldContent = currentEditingItem.content || '';
            const newContent = htmlToText(richEditor.innerHTML);
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
            currentEditingItem.richContent = richEditor.innerHTML;
        } else if (textEditor) {
            // Plain text editor
            const oldContent = currentEditingItem.content || '';
            const newContent = textEditor.value.trim();
            contentChanged = contentChanged || (oldContent !== newContent);
            
            currentEditingItem.content = newContent;
        }
    }
    
    // Move to top if content changed and we're actively editing
    if (contentChanged && currentProject) {
        moveItemToTop(currentEditingItem, currentEditingType);
    }
    
    saveProjects();
    
    // Also save work context with each autosave
    if (currentProject) {
        saveCurrentContext();
    }
    
    hasUnsavedChanges = false;
    updateAutosaveStatus('saved');
    
    // Re-render the appropriate panel to show changes
    setTimeout(() => {
        switch(currentEditingType) {
            case 'brief':
                renderBriefs();
                break;
            case 'note':
                renderNotes();
                break;
            case 'copy':
                renderCopy();
                break;
            case 'task':
                renderProjectTasks();
                break;
        }
    }, 100);
}

function moveItemToTop(item, itemType) {
    if (!currentProject || !item) return;
    
    let itemArray;
    switch(itemType) {
        case 'brief':
            itemArray = currentProject.briefs;
            break;
        case 'note':
            itemArray = currentProject.notes;
            break;
        case 'copy':
            itemArray = currentProject.copy;
            break;
        case 'task':
            itemArray = currentProject.tasks;
            break;
        default:
            return;
    }
    
    // Update order values - move this item to top (order 0) and increment others
    itemArray.forEach(arrayItem => {
        if (arrayItem.id === item.id) {
            arrayItem.order = 0;
        } else if (arrayItem.order !== undefined) {
            arrayItem.order += 1;
        }
    });
    
    console.log(`Moved ${itemType} "${item.title}" to top due to active editing`);
}

function setupAutosaveListeners() {
    // Title field
    const titleField = getEl('editorItemTitle');
    if (titleField) {
        titleField.addEventListener('input', debouncedAutosave);
    }
    
    // Brief fields
    const propositionField = getEl('editorProposition');
    const clientBriefField = getEl('editorClientBrief');
    if (propositionField) propositionField.addEventListener('input', debouncedAutosave);
    if (clientBriefField && clientBriefField.contentEditable === 'true') {
        clientBriefField.addEventListener('input', debouncedAutosave);
        clientBriefField.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
    
    // Rich text editor
    const richEditor = getEl('richEditor');
    if (richEditor) {
        richEditor.addEventListener('input', debouncedAutosave);
        richEditor.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
    
    // Plain text editor
    const textEditor = getEl('editorContent');
    if (textEditor) {
        textEditor.addEventListener('input', debouncedAutosave);
        textEditor.addEventListener('paste', () => setTimeout(debouncedAutosave, 100));
    }
}

// Make sure these functions are globally accessible
window.openTaskSource = function(taskId) {
    console.log('Opening task source for:', taskId);
    if (!currentProject) {
        console.log('No current project');
        return;
    }
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task || !task.sourceItemId || !task.sourceItemType) {
        console.log('No source found for task, opening task editor instead');
        openItemEditor(task, 'task');
        return;
    }
    
    // Find the source item
    let sourceItem = null;
    switch(task.sourceItemType) {
        case 'brief':
            sourceItem = currentProject.briefs.find(b => b.id === task.sourceItemId);
            break;
        case 'note':
            sourceItem = currentProject.notes.find(n => n.id === task.sourceItemId);
            break;
        case 'copy':
            sourceItem = currentProject.copy.find(c => c.id === task.sourceItemId);
            break;
    }
    
    if (sourceItem) {
        console.log('Found source item:', sourceItem);
        // Close current editor if open
        const editorModal = getEl('itemEditor');
        if (editorModal.style.display === 'block') {
            closeEditor();
        }
        
        // Small delay to ensure clean transition
        setTimeout(() => {
            openItemEditor(sourceItem, task.sourceItemType);
        }, 100);
    } else {
        console.log('Source item not found, opening task editor instead');
        openItemEditor(task, 'task');
    }
};

// Setup delete button event listeners
function setupDeleteListeners() {
    // Remove existing listeners first
    document.removeEventListener('click', handleDeleteClick);
    
    // Add single delegated event listener for all delete buttons
    document.addEventListener('click', handleDeleteClick);
}

function handleDeleteClick(event) {
    if (event.target.classList.contains('delete-btn')) {
        event.stopPropagation();
        event.preventDefault();
        
        const deleteType = event.target.getAttribute('data-delete-type');
        const deleteId = event.target.getAttribute('data-delete-id');
        
        console.log('Delete button clicked:', deleteType, deleteId);
        
        switch(deleteType) {
            case 'brief':
                deleteBrief(deleteId);
                break;
            case 'note':
                deleteNote(deleteId);
                break;
            case 'copy':
                deleteCopy(deleteId);
                break;
        }
    }
}

// ===== MIGRATION FUNCTION FOR EXISTING BRIEFS =====

function migrateBriefsToRichText() {
    let hasChanges = false;
    
    projects.forEach(project => {
        if (project.briefs) {
            project.briefs.forEach(brief => {
                // If brief has clientBrief but no clientBriefRich, convert it
                if (brief.clientBrief && !brief.clientBriefRich) {
                    brief.clientBriefRich = textToHtml(brief.clientBrief);
                    hasChanges = true;
                }
                // Handle old 'content' field
                else if (brief.content && !brief.clientBrief && !brief.clientBriefRich) {
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
        console.log('Migrated existing briefs to rich text format');
    }
}

// ===== INITIALIZATION =====

function initializeApp() {
    try {
        // Load work context first
        loadWorkContext();
        
        // Load projects from storage with error handling
        const savedProjects = loadFromStorage('projects');
        if (savedProjects) {
            projects = Array.isArray(savedProjects) ? savedProjects : [];
            
            // Add missing properties to existing projects for backward compatibility
            projects.forEach(project => {
                if (!project.colorTheme) {
                    project.colorTheme = getNextColorTheme();
                }
                if (project.archived === undefined) {
                    project.archived = false;
                }
                // Ensure arrays exist
                if (!project.briefs) project.briefs = [];
                if (!project.notes) project.notes = [];
                if (!project.copy) project.copy = [];
                if (!project.tasks) project.tasks = [];
                
                // Migrate old brief format to new format
                if (project.briefs) {
                    project.briefs.forEach(brief => {
                        if (brief.content && !brief.proposition && !brief.clientBrief) {
                            // Migrate old format: move content to clientBrief, leave proposition empty
                            brief.clientBrief = brief.content;
                            brief.proposition = '';
                            delete brief.content;
                        }
                        // Ensure new fields exist
                        if (brief.proposition === undefined) brief.proposition = '';
                        if (brief.clientBrief === undefined) brief.clientBrief = '';
                        // Assign link color if missing
                        if (!brief.linkColor) {
                            brief.linkColor = getNextLinkColor();
                        }
                    });
                }
                
                // Ensure tasks have order values
                if (project.tasks) {
                    project.tasks.forEach((task, index) => {
                        if (task.order === undefined) {
                            task.order = index;
                        }
                    });
                }
                
                // Ensure all other item types have order values
                if (project.briefs) {
                    project.briefs.forEach((brief, index) => {
                        if (brief.order === undefined) {
                            brief.order = index;
                        }
                    });
                }
                
                if (project.notes) {
                    project.notes.forEach((note, index) => {
                        if (note.order === undefined) {
                            note.order = index;
                        }
                    });
                }
                
                if (project.copy) {
                    project.copy.forEach((copy, index) => {
                        if (copy.order === undefined) {
                            copy.order = index;
                        }
                    });
                }
            });
            saveProjects(); // Save the updated projects
            
            // Migrate existing briefs to rich text format
            migrateBriefsToRichText();
            
            // Initialize the link color index based on existing colors
            initializeLinkColorIndex();
        } else {
            projects = [];
            // Initialize link color index for new installations
            initializeLinkColorIndex();
        }
        
        // Initialize global tasks system
        loadGlobalTaskOrder();
        cleanupGlobalTaskOrder();
        autoPopulateTopThree();
        setupTopTasksDropZones();
        
        // Clean up old completed tasks (24+ hours old)
        cleanupOldCompletedTasks();
        
        // Load pomodoro state
        loadPomodoroState();
        
        // Initialize pomodoro daily count
        const today = new Date().toDateString();
        const savedDaily = loadFromStorage('pomodoroDaily');
        
        if (savedDaily) {
            pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
        }
        
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        
        // Setup delete button event listeners
        setupDeleteListeners();
        
        // Render breadcrumbs
        renderBreadcrumbs();
        
        // Set up periodic cleanup (every hour)
        setInterval(() => {
            cleanupOldCompletedTasks();
        }, 60 * 60 * 1000); // Run every hour
        
        // Offer work resumption after a short delay
        setTimeout(() => {
            offerWorkResumption();
        }, 2000);
        
    } catch (error) {
        console.error('Error during initialization:', error);
        // Fallback initialization
        projects = [];
        initializeLinkColorIndex();
        loadGlobalTaskOrder();
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        renderBreadcrumbs();
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initializeApp);

// Listen for fullscreen changes
document.addEventListener('fullscreenchange', function() {
    if (!document.fullscreenElement) {
        // User exited fullscreen - clean up our fullscreen mode
        const editorModal = getEl('itemEditor');
        if (editorModal) {
            editorModal.classList.remove('true-fullscreen');
            editorModal.classList.remove('fullscreen');
        }
        
        // Remove overlay
        const overlay = getEl('focusOverlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Restore cursor
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
        // Close confirmation modal first if open
        const confirmModal = getEl('confirmModal');
        if (confirmModal && confirmModal.style.display === 'block') {
            cancelConfirm();
            return;
        }
        
        // Close help modal if open
        const helpModal = getEl('helpModal');
        if (helpModal && helpModal.style.display === 'block') {
            closeModal('helpModal');
            return;
        }
        
        // Exit fullscreen mode if active
        const editorModal = getEl('itemEditor');
        if (editorModal && (editorModal.classList.contains('fullscreen') || editorModal.classList.contains('true-fullscreen'))) {
            exitFocusMode();
            if (pomodoroIsRunning) {
                pausePomodoro();
            }
            return;
        }
        
        // Otherwise close modals normally
        document.querySelectorAll('.modal, .editor-modal').forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    // F1 or Ctrl+? to open help
    if (e.key === 'F1' || (e.key === '?' && e.ctrlKey)) {
        e.preventDefault();
        showHelp();
        return;
    }
    
    // Enter key on confirmation modal
    if (e.key === 'Enter') {
        const confirmModal = getEl('confirmModal');
        if (confirmModal && confirmModal.style.display === 'block') {
            proceedConfirm();
            return;
        }
    }
    
    // Ctrl+S for manual save (also saves context)
    if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        if (getEl('itemEditor').style.display === 'block') {
            autosaveItem();
            showContextIndicator('Work saved with context preserved');
        }
    }
    
    // Alt+B for breadcrumb navigation
    if (e.key === 'b' && e.altKey) {
        e.preventDefault();
        const breadcrumbContainer = getEl('breadcrumbContainer');
        if (breadcrumbContainer && breadcrumbContainer.style.display !== 'none') {
            // Focus on the last breadcrumb
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
            // Auto-resume without asking
            if (!currentProject || currentProject.id != workContext.currentContext.projectId) {
                switchToProject(workContext.currentContext.projectId, () => {
                    setTimeout(() => {
                        restoreContext(workContext.currentContext);
                    }, 200);
                });
            } else {
                restoreContext(workContext.currentContext);
            }
            showContextIndicator(`Resumed work on "${workContext.currentContext.title}"`, true);
        }
    }
    
    // Pomodoro shortcuts when editor is open
    if (getEl('itemEditor') && getEl('itemEditor').style.display === 'block') {
        const pomodoroTimer = getEl('pomodoroTimer');
        if (pomodoroTimer && pomodoroTimer.style.display === 'block') {
            // Check if we're not in a contenteditable field
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
window.showHelp = showHelp;
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
window.reorderItemInColumn = reorderItemInColumn;
window.calculateDropPosition = calculateDropPosition;
window.showDropPositionIndicator = showDropPositionIndicator;
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
window.promoteToTopThree = promoteToTopThree;
window.removeTaskFromTopThree = removeTaskFromTopThree;
window.navigateToBreadcrumb = navigateToBreadcrumb;
window.clearBreadcrumbs = clearBreadcrumbs;
window.dismissResumePanel = dismissResumePanel;
window.resumeWork = resumeWork;
window.startPomodoro = startPomodoro;
window.pausePomodoro = pausePomodoro;
window.resetPomodoro = resetPomodoro;
window.skipPomodoro = skipPomodoro;
window.toggleProjectTask = toggleProjectTask;
window.diveInToProjectSource = diveInToProjectSource;

// Helper render functions
window.renderBriefs = renderBriefs;
window.renderNotes = renderNotes;
window.renderCopy = renderCopy;
window.renderProjectTasks = renderProjectTasks;
window.renderGlobalTasks = renderGlobalTasks;

console.log('Creative Project Manager loaded successfully!');
console.log('Features:');
console.log('✓ Rich text client briefs with document upload (.docx files)');
console.log('✓ Global task management system');
console.log('✓ Smart breadcrumb trail (screen-width limited)');
console.log('✓ Brief deletion preserves linked items');
console.log('✓ Rich text support for notes, copy, and client briefs');
console.log('✓ Pomodoro timer with focus mode');
console.log('✓ Context preservation system');
