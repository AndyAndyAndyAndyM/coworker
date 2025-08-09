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
    
    // Keep only last 10 items
    if (workContext.breadcrumbs.length > 10) {
        workContext.breadcrumbs = workContext.breadcrumbs.slice(-10);
    }
    
    saveBreadcrumbs();
    renderBreadcrumbs();
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
        <button class="breadcrumb-clear" onclick="clearBreadcrumbs()" title="Clear trail">
            Clear
        </button>
    `;
}

// Context state management
function saveCurrentContext() {
    if (!currentEditingItem || !currentEditingType || !currentProject) return;
    
    const context = createContextState(currentProject.id, currentEditingItem.id, currentEditingType);
    context.title = currentEditingItem.title;
    
    // Save editor state
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
            context.cursorPosition = saveCursorPosition(richEditor);
        } else if (textEditor) {
            context.editorState = {
                title: document.getElementById('editorItemTitle').value,
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
    
    // Restore editor state after a short delay
    setTimeout(() => {
        restoreEditorState(context);
        showContextIndicator(`Resumed: ${context.title}`, true);
    }, 300);
    
    return true;
}

function restoreEditorState(context) {
    if (!context.editorState) return;
    
    // Restore title
    const titleField = document.getElementById('editorItemTitle');
    if (titleField && context.editorState.title) {
        titleField.value = context.editorState.title;
    }
    
    if (context.itemType === 'brief') {
        // Restore brief fields
        const propField = document.getElementById('editorProposition');
        const clientField = document.getElementById('editorClientBrief');
        
        if (propField && context.editorState.proposition) {
            propField.value = context.editorState.proposition;
        }
        if (clientField && context.editorState.clientBrief) {
            clientField.value = context.editorState.clientBrief;
        }
    } else {
        // Restore content fields
        if (context.editorState.isRichText) {
            const richEditor = document.getElementById('richEditor');
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
            const textEditor = document.getElementById('editorContent');
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
    const existing = document.getElementById('contextIndicator');
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
    const existing = document.getElementById('resumePanel');
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
    const panel = document.getElementById('resumePanel');
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

// Integration functions
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
    document.getElementById('projectSelect').value = project.id;
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('projectOverview').style.display = 'none';
    
    // Apply project color theme
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
}

// Global functions
window.navigateToBreadcrumb = navigateToBreadcrumb;
window.clearBreadcrumbs = clearBreadcrumbs;
window.dismissResumePanel = dismissResumePanel;
window.resumeWork = resumeWork;
window.startPomodoro = startPomodoro;
window.pausePomodoro = pausePomodoro;
window.resetPomodoro = resetPomodoro;
window.skipPomodoro = skipPomodoro;

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
    
    // Create a map of tasks by unique ID (projectId + taskId)
    allTasks.forEach(task => {
        const uniqueId = `${task.projectId}-${task.id}`;
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
        const uniqueId = `${task.projectId}-${task.id}`;
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

// Global task interaction functions
function toggleGlobalTask(projectId, taskId) {
    const project = projects.find(p => p.id == projectId);
    if (project) {
        const task = project.tasks.find(t => t.id == taskId);
        if (task) {
            task.completed = !task.completed;
            // Add completion timestamp when completed
            if (task.completed) {
                task.completedAt = new Date().toISOString();
                
                // Remove completed tasks from priority lists immediately
                const uniqueId = `${projectId}-${taskId}`;
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
    document.getElementById('projectSelect').value = project.id;
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('projectOverview').style.display = 'none';
    
    // Apply project color theme
    const dashboard = document.getElementById('dashboard');
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
    document.getElementById('projectSelect').value = project.id;
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('projectOverview').style.display = 'none';
    
    // Apply project color theme
    const dashboard = document.getElementById('dashboard');
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

function saveGlobalTaskOrder() {
    localStorage.setItem('globalTaskOrder', JSON.stringify(globalTaskOrder));
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

function loadGlobalTaskOrder() {
    const saved = localStorage.getItem('globalTaskOrder');
    if (saved) {
        try {
            globalTaskOrder = JSON.parse(saved);
            // Ensure the structure exists
            if (!globalTaskOrder.topThree) globalTaskOrder.topThree = [];
            if (!globalTaskOrder.other) globalTaskOrder.other = [];
        } catch (error) {
            console.error('Error loading global task order:', error);
            globalTaskOrder = { topThree: [], other: [] };
        }
    }
}

function showConfirm(title, message, callback, data = null) {
    console.log('Showing custom confirmation:', title, message);
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmModal').style.display = 'block';
    
    confirmCallback = callback;
    confirmData = data;
}

function proceedConfirm() {
    console.log('User confirmed action');
    document.getElementById('confirmModal').style.display = 'none';
    
    if (confirmCallback) {
        confirmCallback(confirmData);
    }
    
    confirmCallback = null;
    confirmData = null;
}

function cancelConfirm() {
    console.log('User cancelled action');
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
    confirmData = null;
}

// FIXED: Delete functions using custom confirmation
function deleteBrief(briefId) {
    console.log('Delete brief called with ID:', briefId);
    
    showConfirm(
        'Delete Brief',
        'Are you sure you want to delete this brief? This will also remove any linked notes, copy, and tasks.',
        (id) => {
            console.log('Proceeding with brief deletion for ID:', id);
            
            const parsedId = parseInt(id);
            console.log('Parsed ID:', parsedId);
            
            const originalLength = currentProject.briefs.length;
            const briefsBefore = currentProject.briefs.map(b => ({ id: b.id, title: b.title }));
            console.log('Briefs before deletion:', briefsBefore);
            
            currentProject.briefs = currentProject.briefs.filter(item => {
                console.log('Comparing item.id:', item.id, 'with target id:', parsedId, 'equal?', item.id === parsedId);
                return item.id !== parsedId;
            });
            
            console.log('Briefs length before:', originalLength, 'after:', currentProject.briefs.length);
            
            // Also remove any linked notes/copy
            currentProject.notes = currentProject.notes.filter(note => note.linkedBriefId !== parsedId);
            currentProject.copy = currentProject.copy.filter(copy => copy.linkedBriefId !== parsedId);
            
            // Remove all linked tasks from all projects
            removeLinkedTasks('brief', parsedId);
            
            // Remove from breadcrumbs
            removeFromBreadcrumbs('brief', parsedId);
            
            saveProjects();
            renderBriefs();
            renderNotes();
            renderCopy();
            renderProjectTasks();
            renderGlobalTasks();
            console.log('Brief deleted successfully');
            
            showNotification('Brief and all linked items deleted successfully');
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

function deleteTaskFromSummary(taskId, projectName) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    const project = projects.find(p => p.name === projectName);
    if (project) {
        const targetId = parseInt(taskId);
        project.tasks = project.tasks.filter(t => parseInt(t.id) !== targetId);
        saveProjects();
        
        // If we're viewing this project, update the local view too
        if (currentProject && currentProject.id === project.id) {
            renderTasks();
        }
    }
}

// Also add to window object for maximum compatibility
window.deleteBrief = deleteBrief;
window.deleteNote = deleteNote;
window.deleteCopy = deleteCopy;
window.showConfirm = showConfirm;
window.proceedConfirm = proceedConfirm;
window.cancelConfirm = cancelConfirm;
window.toggleArchivedProjects = toggleArchivedProjects;

// Global task functions
window.handleGlobalTaskDragStart = handleGlobalTaskDragStart;
window.handleGlobalTaskDragEnd = handleGlobalTaskDragEnd;
window.handleTaskDragOver = handleTaskDragOver;
window.handleTaskDragLeave = handleTaskDragLeave;
window.handleTaskDrop = handleTaskDrop;
window.toggleGlobalTask = toggleGlobalTask;
window.openGlobalTaskSource = openGlobalTaskSource;
window.diveInToGlobalSource = diveInToGlobalSource;

// FIXED: Simplified drag and drop functions
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
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
        console.log('Drag over:', event.currentTarget.getAttribute('data-drop-message'));
    }
}

function handleDragLeave(event) {
    // Only remove drag-over if we're actually leaving the drop zone
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
        console.log('Drag leave');
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
        console.log('Same column drop - reordering not implemented yet');
        showNotification('Reordering within columns will be implemented soon');
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
