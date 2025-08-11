// ===== HELPER FUNCTIONS (DEFINED EARLY) =====
// DOM Helpers
const getEl = (id) => document.getElementById(id);
const setDisplay = (id, display) => { const el = getEl(id); if (el) el.style.display = display; };
const setValue = (id, value) => { const el = getEl(id); if (el) el.value = value; };
const getValue = (id) => { const el = getEl(id); return el ? el.value.trim() : ''; };
const setContent = (id, content) => { const el = getEl(id); if (el) el.textContent = content; };
const setHTML = (id, html) => { const el = getEl(id); if (el) el.innerHTML = html; };

// Storage Helpers
const saveToStorage = (key, data) => {
    try {
        // Use in-memory storage instead of localStorage for Claude.ai compatibility
        if (!window.appStorage) window.appStorage = {};
        window.appStorage[key] = JSON.stringify(data);
    } catch (error) {
        console.error(`Error saving ${key}:`, error);
    }
};

const loadFromStorage = (key, defaultValue = null) => {
    try {
        if (!window.appStorage) window.appStorage = {};
        const saved = window.appStorage[key];
        return saved ? JSON.parse(saved) : defaultValue;
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

// ===== ORIGINAL CODE WITH MINIMAL HELPER USAGE =====

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

// Project-specific top tasks management (replaces old global system)
let draggedTopTask = null;

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

// ===== PROJECT-SPECIFIC TOP TASKS SYSTEM =====

// Project-specific top tasks management (replaces global system)
function getProjectTopTasks() {
    if (!currentProject) return { topThree: [], other: [] };
    
    // Initialize topTaskIds if it doesn't exist
    if (!currentProject.topTaskIds) {
        currentProject.topTaskIds = [];
    }
    
    const allProjectTasks = currentProject.tasks || [];
    const taskMap = new Map();
    
    // Create a map of tasks by ID
    allProjectTasks.forEach(task => {
        taskMap.set(task.id, task);
    });
    
    // Get top three tasks based on project's topTaskIds, excluding completed tasks
    const topThreeTasks = currentProject.topTaskIds
        .map(id => taskMap.get(id))
        .filter(task => task && !task.completed)
        .slice(0, 3); // Ensure only top 3
    
    const topThreeIds = new Set(currentProject.topTaskIds.slice(0, 3));
    
    // Get other tasks (not in top three)
    const otherTasks = allProjectTasks.filter(task => 
        !topThreeIds.has(task.id) && !task.completed
    );
    
    // Sort other tasks with completed tasks at bottom
    const sortedOther = sortTasksWithCompletedAtBottom([...allProjectTasks.filter(task => 
        !topThreeIds.has(task.id)
    )]);
    
    return { topThree: topThreeTasks, other: sortedOther };
}

function renderTopTasks() {
    if (!currentProject) return;
    
    const { topThree, other } = getProjectTopTasks();
    
    renderTopThreeSection(topThree);
    renderOtherTasksSection(other);
}

function renderTopThreeSection(tasks) {
    const container = getEl('topTasksRow');
    if (!container) return;
    
    console.log('Rendering project-specific top three tasks:', tasks);
    
    container.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const task = tasks[i];
        if (task) {
            container.appendChild(createTopTaskElement(task, i));
        } else {
            container.appendChild(createTopTaskDropZone(i));
        }
    }
}

function createTopTaskElement(task, position) {
    const hasSource = task.sourceItemId && task.sourceItemType;
    const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
    let linkColor = '#10b981'; // Default green
    
    // Get link color for the task
    if (hasSource) {
        let sourceItem = null;
        switch(task.sourceItemType) {
            case 'brief':
                sourceItem = currentProject.briefs?.find(b => b.id === task.sourceItemId);
                break;
            case 'note':
                sourceItem = currentProject.notes?.find(n => n.id === task.sourceItemId);
                if (sourceItem?.linkedBriefId) {
                    const brief = currentProject.briefs?.find(b => b.id === sourceItem.linkedBriefId);
                    linkColor = brief?.linkColor || linkColor;
                }
                break;
            case 'copy':
                sourceItem = currentProject.copy?.find(c => c.id === task.sourceItemId);
                if (sourceItem?.linkedBriefId) {
                    const brief = currentProject.briefs?.find(b => b.id === sourceItem.linkedBriefId);
                    linkColor = brief?.linkColor || linkColor;
                }
                break;
        }
        if (sourceItem && task.sourceItemType === 'brief') {
            linkColor = sourceItem.linkColor || linkColor;
        }
    }
    
    const taskElement = document.createElement('div');
    taskElement.className = 'top-task-item';
    taskElement.draggable = true;
    taskElement.style.borderLeftColor = linkColor;
    
    // Add data attributes for drag and drop
    taskElement.setAttribute('data-task-id', task.id);
    taskElement.setAttribute('data-position', position);
    
    // Add event listeners
    taskElement.addEventListener('dragstart', handleTopTaskDragStart);
    taskElement.addEventListener('dragend', handleTopTaskDragEnd);
    taskElement.addEventListener('click', () => {
        if (hasSource) {
            openTaskSource(task.id);
        } else {
            openItemEditor(task, 'task');
        }
    });
    
    // Create content
    taskElement.innerHTML = `
        <div class="task-title">${task.title}</div>
        <div class="task-meta">
            <span style="background: #f5f5f5; color: #525252; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; text-transform: uppercase; margin-right: 6px;">Task</span>
            ${hasSource ? 'Has source • ' : ''}Created: ${formatDate(task.createdAt)}
            ${canDiveIn ? ` • <span style="background: #fce7f3; color: #be185d; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); diveInToTopTaskSource('${task.id}')" title="Open in focus mode with Pomodoro">Dive In</span>` : ''}
        </div>
        <input type="checkbox" 
               class="task-checkbox"
               ${task.completed ? 'checked' : ''}
               onclick="event.stopPropagation(); toggleTopTask('${task.id}')">
        <button class="remove-from-top" onclick="event.stopPropagation(); removeFromTopThree('${task.id}')" title="Remove from top 3">×</button>
    `;
    
    return taskElement;
}

function createTopTaskDropZone(position) {
    const dropZone = document.createElement('div');
    dropZone.className = 'top-tasks-drop-zone';
    dropZone.setAttribute('data-position', position);
    
    dropZone.innerHTML = `
        <div class="drop-zone-content">
            <div class="drop-zone-icon">+</div>
            <div class="drop-zone-text">Drop item here</div>
        </div>
    `;
    
    // Add drag and drop event listeners
    dropZone.addEventListener('dragover', handleTopTaskDragOver);
    dropZone.addEventListener('dragleave', handleTopTaskDragLeave);
    dropZone.addEventListener('drop', (e) => handleTopTaskDrop(e, position));
    
    return dropZone;
}

// Top task drag and drop handlers
function handleTopTaskDragStart(event) {
    const taskElement = event.currentTarget;
    const taskId = taskElement.getAttribute('data-task-id');
    const position = parseInt(taskElement.getAttribute('data-position'));
    
    draggedTopTask = { taskId, sourcePosition: position, type: 'task' };
    taskElement.classList.add('dragging');
    taskElement.style.opacity = '0.5';
    
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
}

function handleTopTaskDragEnd(event) {
    event.currentTarget.classList.remove('dragging');
    event.currentTarget.style.opacity = '1';
    draggedTopTask = null;
}

function handleTopTaskDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (!event.currentTarget.classList.contains('drag-over')) {
        event.currentTarget.classList.add('drag-over');
        event.currentTarget.style.background = '#e0f2fe';
        event.currentTarget.style.borderColor = '#0ea5e9';
    }
}

function handleTopTaskDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
        event.currentTarget.classList.remove('drag-over');
        event.currentTarget.style.background = '#fafafa';
        event.currentTarget.style.borderColor = '#d4d4d4';
    }
}

function handleTopTaskDrop(event, targetPosition) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    event.currentTarget.style.background = '#fafafa';
    event.currentTarget.style.borderColor = '#d4d4d4';
    
    // Handle different types of dragged items
    if (draggedTopTask && draggedTopTask.type === 'task') {
        // Moving existing task within top three
        moveTaskWithinTopThree(draggedTopTask.taskId, targetPosition);
    } else if (draggedItem && draggedItemType) {
        // Creating task from brief/note/copy
        createTaskFromItemDrop(draggedItem, draggedItemType, targetPosition);
    }
}

function moveTaskWithinTopThree(taskId, targetPosition) {
    if (!currentProject.topTaskIds) {
        currentProject.topTaskIds = [];
    }
    
    // Remove task from current position
    const currentIndex = currentProject.topTaskIds.indexOf(taskId);
    if (currentIndex !== -1) {
        currentProject.topTaskIds.splice(currentIndex, 1);
    }
    
    // Insert at target position
    currentProject.topTaskIds.splice(targetPosition, 0, taskId);
    
    // Ensure only 3 items maximum
    if (currentProject.topTaskIds.length > 3) {
        currentProject.topTaskIds = currentProject.topTaskIds.slice(0, 3);
    }
    
    saveProjects();
    renderTopTasks();
    showNotification(`Task moved to position ${targetPosition + 1} in top 3`);
}

function createTaskFromItemDrop(sourceItem, sourceType, targetPosition) {
    if (!currentProject) return;
    
    // Create new task from the dropped item
    const newTask = {
        id: generateId(),
        title: sourceItem.title,
        content: sourceItem.content || '',
        type: 'task',
        completed: false,
        sourceItemId: sourceItem.id,
        sourceItemType: sourceType,
        order: 0,
        createdAt: getCurrentTimestamp()
    };
    
    // Add task to project
    currentProject.tasks.unshift(newTask);
    
    // Initialize topTaskIds if needed
    if (!currentProject.topTaskIds) {
        currentProject.topTaskIds = [];
    }
    
    // If dropping in position 0, 1, or 2 - add to top three
    if (targetPosition < 3) {
        // Displace existing tasks if necessary
        if (currentProject.topTaskIds.length >= 3) {
            // Remove tasks beyond position to make room
            currentProject.topTaskIds = currentProject.topTaskIds.slice(0, targetPosition)
                .concat(currentProject.topTaskIds.slice(targetPosition + 1));
        }
        
        // Insert new task at target position
        currentProject.topTaskIds.splice(targetPosition, 0, newTask.id);
        
        // Ensure only 3 items maximum
        if (currentProject.topTaskIds.length > 3) {
            currentProject.topTaskIds = currentProject.topTaskIds.slice(0, 3);
        }
        
        showNotification(`Created task "${newTask.title}" in top 3 position ${targetPosition + 1}`);
    } else {
        // Add to regular tasks list (already done above)
        showNotification(`Created task "${newTask.title}" and added to tasks list`);
    }
    
    saveProjects();
    renderTopTasks();
    renderProjectTasks();
}

// Handle drops to the right of the top three (beyond position 2)
function setupTopTasksContainer() {
    const container = getEl('topTasksRow');
    if (!container) return;
    
    // Add container-level drop handling for items dropped to the right
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    
    container.addEventListener('drop', (e) => {
        // Check if dropped to the right of existing tasks
        const rect = container.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const containerWidth = rect.width;
        
        // If dropped in the rightmost third, treat as "add to general tasks"
        if (dropX > containerWidth * 0.75 && draggedItem && draggedItemType) {
            e.preventDefault();
            createTaskFromItemDrop(draggedItem, draggedItemType, 999); // Use high number to indicate "general tasks"
        }
    });
}

// Helper functions
function addTaskToTopThree(taskId) {
    if (!currentProject) return;
    
    if (!currentProject.topTaskIds) {
        currentProject.topTaskIds = [];
    }
    
    // Remove if already exists
    const existingIndex = currentProject.topTaskIds.indexOf(taskId);
    if (existingIndex !== -1) {
        currentProject.topTaskIds.splice(existingIndex, 1);
    }
    
    // Add to top three (displace if necessary)
    if (currentProject.topTaskIds.length >= 3) {
        currentProject.topTaskIds.pop(); // Remove last item
    }
    
    currentProject.topTaskIds.unshift(taskId);
    
    saveProjects();
    renderTopTasks();
    showNotification('Task added to top 3');
}

function removeFromTopThree(taskId) {
    if (!currentProject || !currentProject.topTaskIds) return;
    
    const index = currentProject.topTaskIds.indexOf(taskId);
    if (index !== -1) {
        currentProject.topTaskIds.splice(index, 1);
        saveProjects();
        renderTopTasks();
        showNotification('Task removed from top 3');
    }
}

function toggleTopTask(taskId) {
    if (!currentProject) return;
    
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        
        if (task.completed) {
            task.completedAt = getCurrentTimestamp();
            // Remove completed tasks from top three
            removeFromTopThree(taskId);
        } else {
            delete task.completedAt;
        }
        
        saveProjects();
        renderTopTasks();
        renderProjectTasks();
    }
}

function diveInToTopTaskSource(taskId) {
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    // Only proceed if the source is a note or copy
    if (!task.sourceItemId || !task.sourceItemType || 
        (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
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

// Initialize project-specific top tasks
function initializeProjectTopTasks() {
    if (!currentProject) return;
    
    // Auto-populate if empty
    if (!currentProject.topTaskIds || currentProject.topTaskIds.length === 0) {
        const incompleteTasks = (currentProject.tasks || []).filter(task => !task.completed);
        
        // Sort by creation date (most recent first)
        incompleteTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        // Take up to 3 most recent tasks
        const tasksToAdd = incompleteTasks.slice(0, 3);
        
        currentProject.topTaskIds = tasksToAdd.map(task => task.id);
        
        if (tasksToAdd.length > 0) {
            console.log(`Auto-populated top 3 with ${tasksToAdd.length} recent tasks for project ${currentProject.name}`);
            saveProjects();
        }
    }
    
    setupTopTasksContainer();
    renderTopTasks();
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
        console.log('Cleaned up old completed tasks');
    }
}

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
            renderTopTasks();
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
            renderTopTasks();
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
            renderTopTasks();
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
    
    // Clean up project top task references
    projects.forEach(project => {
        if (project.topTaskIds && Array.isArray(project.topTaskIds)) {
            const validTaskIds = (project.tasks || []).map(task => task.id);
            project.topTaskIds = project.topTaskIds.filter(taskId => validTaskIds.includes(taskId));
        }
    });
}

function removeFromBreadcrumbs(itemType, itemId) {
    // Remove from breadcrumbs
    const breadcrumbId = `${currentProject.id}-${itemId}-${itemType}`;
    workContext.breadcrumbs = workContext.breadcrumbs.filter(b => b.id !== breadcrumbId);
    saveBreadcrumbs();
    renderBreadcrumbs();
    console.log('Removed item from breadcrumbs:', breadcrumbId);
}

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
        renderTopTasks(); // Update top tasks display
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

// Updated drag and drop setup to handle briefs/notes/copy being dropped into top tasks
function setupHorizontalTasksDropZones() {
    const container = getEl('topTasksRow');
    if (!container) return;
    
    // Allow dropping any item type onto the top tasks area
    container.addEventListener('dragover', (e) => {
        if (draggedItem && (draggedItemType === 'task' || draggedItemType === 'brief' || 
            draggedItemType === 'note' || draggedItemType === 'copy')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    });
    
    container.addEventListener('drop', (e) => {
        if (draggedItem && currentProject) {
            e.preventDefault();
            
            if (draggedItemType === 'task') {
                // Add existing task to top three
                addTaskToTopThree(draggedItem.id);
            } else {
                // Create task from brief/note/copy and add to general tasks
                const newTask = {
                    id: generateId(),
                    title: draggedItem.title,
                    content: draggedItem.content || '',
                    type: 'task',
                    completed: false,
                    sourceItemId: draggedItem.id,
                    sourceItemType: draggedItemType,
                    order: 0,
                    createdAt: getCurrentTimestamp()
                };
                
                currentProject.tasks.unshift(newTask);
                saveProjects();
                renderTopTasks();
                renderProjectTasks();
                
                showNotification(`Created task "${newTask.title}" from ${draggedItemType}`);
            }
            
            // Clear drag state
            draggedItem = null;
            draggedItemType = null;
        }
    });
}

// Context Preservation System
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
    
    // Save editor state
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
    setValue('editorItemTitle', context.editorState.title || '');
    
    if (context.itemType === 'brief') {
        // Restore brief fields
        setValue('editorProposition', context.editorState.proposition || '');
        setValue('editorClientBrief', context.editorState.clientBrief || '');
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
    setValue('projectSelect', project.id);
    setDisplay('dashboard', 'grid');
    setDisplay('projectOverview', 'none');
    setDisplay('topTasksRow', 'flex');
    
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

// Essential functions that need to be available immediately - defined globally so HTML can access them
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
    setDisplay('topTasksRow', 'none');
    currentProject = null;
    
    // Remove project themes from dashboard
    const dashboard = getEl('dashboard');
    colorThemes.forEach(theme => {
        dashboard.classList.remove(`project-theme-${theme}`);
    });
    dashboard.classList.remove('project-themed');
    
    updateSettingsButton();
    renderProjectOverview();
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

// Updated switchProject function
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
        setDisplay('topTasksRow', 'flex');
        
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
        renderProject(); // This now includes project-specific top tasks
        
        // Check for previous work context
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
        const clientBrief = getValue('editorClientBrief');
        
        contentToCopy = title;
        if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
        if (clientBrief) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBrief;
        
        // Create HTML version
        htmlContent = `<h3>${title}</h3>`;
        if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
        if (clientBrief) htmlContent += `<h4>CLIENT BRIEF:</h4><p>${clientBrief.replace(/\n/g, '<br>')}</p>`;
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
    const editorContent = document.querySelector('.editor-content');
    const richEditor = getEl('richEditor');
    const textEditor = getEl('editorContent');
    
    if (itemType === 'brief') {
        // Brief-specific fields
        setDisplay('briefFields', 'block');
        setDisplay('standardFields', 'none');
        
        // Handle backwards compatibility
        setValue('editorProposition', item.proposition || '');
        setValue('editorClientBrief', item.clientBrief || item.content || '');
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
        
        // Show copy to clipboard button for notes and copy
        if (copyToClipboardBtn) {
            setDisplay('copyToClipboardBtn', (itemType === 'note' || itemType === 'copy') ? 'inline-flex' : 'none');
        }
    }
    
    // Show the modal FIRST
    setDisplay('itemEditor', 'block');
    console.log('Modal displayed, item type:', itemType);
    
    // NOW handle pomodoro timer after modal is shown - with multiple attempts
    const setupPomodoroTimer = () => {
        const pomodoroTimer = getEl('pomodoroTimer');
        const pomodoroDisplay = getEl('pomodoroDisplay');
        const pomodoroStatus = getEl('pomodoroStatus');
        
        console.log('Pomodoro elements found:', {
            timer: !!pomodoroTimer,
            display: !!pomodoroDisplay, 
            status: !!pomodoroStatus,
            itemType: itemType
        });
        
        if (itemType === 'note' || itemType === 'copy') {
            if (pomodoroTimer) {
                // Force visibility with important
                pomodoroTimer.style.display = 'flex';
                pomodoroTimer.style.visibility = 'visible';
                console.log('Set pomodoro timer display to flex for', itemType);
                console.log('Timer computed style:', window.getComputedStyle(pomodoroTimer).display);
                
                // Initialize pomodoro after timer is visible
                setTimeout(() => {
                    if (pomodoroDisplay && pomodoroStatus) {
                        initializePomodoro();
                        updatePomodoroHeaderStyle();
                        console.log('Pomodoro initialized successfully for', itemType);
                    } else {
                        console.error('Pomodoro display/status elements missing!');
                    }
                }, 50);
            } else {
                console.error('Pomodoro timer element not found! Retrying...');
                // Retry once more after a longer delay
                setTimeout(() => {
                    const retryTimer = getEl('pomodoroTimer');
                    if (retryTimer) {
                        retryTimer.style.display = 'flex';
                        retryTimer.style.visibility = 'visible';
                        console.log('Retry successful - pomodoro timer found and shown');
                        setTimeout(() => {
                            initializePomodoro();
                            updatePomodoroHeaderStyle();
                        }, 50);
                    } else {
                        console.error('Pomodoro timer still not found after retry');
                    }
                }, 200);
            }
        } else {
            if (pomodoroTimer) {
                pomodoroTimer.style.display = 'none';
                console.log('Hiding pomodoro timer for', itemType);
            }
        }
    };
    
    // Try initializing immediately, then with delays
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
            
            // Auto-restore previous state without asking
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
            topTaskIds: [], // Initialize for new project-specific system
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
        renderTopTasks(); // Update top tasks display
        
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

// Updated renderProject function to use new system
function renderProject() {
    if (!currentProject) return;
    
    renderBriefs();
    renderNotes();
    renderCopy();
    renderProjectTasks();
    initializeProjectTopTasks(); // Use new project-specific initialization
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
        
        // Handle backwards compatibility for old briefs with just 'content'
        const proposition = brief.proposition || '';
        const clientBrief = brief.clientBrief || brief.content || '';
        const hasProposition = proposition.trim().length > 0;
        const hasClientBrief = clientBrief.trim().length > 0;
        
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
                        <div style="font-size: 11px; font-weight: 600; color: #a16207; text-transform: uppercase; margin-bottom: 4px;">Client Brief</div>
                        <div style="color: #525252; line-height: 1.4; font-size: 13px;">
                            ${truncateContent(clientBrief, 120)}
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

// Updated renderProjectTasks to work with new top tasks system
function renderProjectTasks() {
    const container = getEl('projectTaskContainer');
    if (!container || !currentProject) return;
    
    if (!currentProject.tasks) currentProject.tasks = [];
    
    // Get tasks not in top three for the "other tasks" section
    const { other } = getProjectTopTasks();
    
    if (other.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #737373;">No additional tasks</div>';
        return;
    }
    
    container.innerHTML = other.map(task => {
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
        const isInTopThree = currentProject.topTaskIds && currentProject.topTaskIds.includes(task.id);
        
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
                
                <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; align-items: center;">
                    <div style="background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Task</div>
                    ${!isInTopThree && !task.completed ? `
                        <button onclick="event.stopPropagation(); addTaskToTopThree('${task.id}')" 
                                style="background: #3b82f6; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer; font-weight: 600;"
                                title="Add to Top 3">
                            ★
                        </button>
                    ` : ''}
                </div>
                
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
                    <span>${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to top 3 or reorder</span>
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

// Updated toggleProjectTask to work with new system
function toggleProjectTask(taskId) {
    const task = currentProject.tasks.find(t => t.id == taskId);
    if (task) {
        task.completed = !task.completed;
        
        if (task.completed) {
            task.completedAt = getCurrentTimestamp();
            // Remove completed tasks from top three
            removeFromTopThree(taskId);
        } else {
            delete task.completedAt;
        }
        
        saveProjects();
        renderProjectTasks();
        renderTopTasks(); // Update top tasks display
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
        // Save brief-specific fields
        const oldProposition = currentEditingItem.proposition || '';
        const oldClientBrief = currentEditingItem.clientBrief || '';
        const newProposition = getValue('editorProposition');
        const newClientBrief = getValue('editorClientBrief');
        
        contentChanged = contentChanged || (oldProposition !== newProposition) || (oldClientBrief !== newClientBrief);
        
        currentEditingItem.proposition = newProposition;
        currentEditingItem.clientBrief = newClientBrief;
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
            currentEditingItem.richContent = richEditor.innerHTML; // Store rich content separately
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
    if (clientBriefField) clientBriefField.addEventListener('input', debouncedAutosave);
    
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

// Remove old global task order system and cleanup
function cleanupOldGlobalSystem() {
    // Remove old global storage
    if (window.appStorage) {
        delete window.appStorage['globalTaskOrder'];
    }
    
    console.log('Cleaned up old global task system');
}

// Migration function to run once to clean up old data
function migrateToProjectSpecificTopTasks() {
    // Check if migration has already been done
    const migrated = loadFromStorage('topTasksMigrated');
    if (migrated) return;
    
    console.log('Migrating to project-specific top tasks system...');
    
    // Clean up old global system
    cleanupOldGlobalSystem();
    
    // Initialize topTaskIds for all projects
    projects.forEach(project => {
        if (!project.topTaskIds) {
            project.topTaskIds = [];
            
            // Auto-populate with recent tasks
            const incompleteTasks = (project.tasks || []).filter(task => !task.completed);
            incompleteTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const recentTasks = incompleteTasks.slice(0, 3);
            project.topTaskIds = recentTasks.map(task => task.id);
            
            console.log(`Initialized top tasks for project ${project.name} with ${recentTasks.length} tasks`);
        }
    });
    
    saveProjects();
    saveToStorage('topTasksMigrated', true);
    console.log('Migration completed');
}

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

// Add the CSS for the new top tasks design
function addTopTasksCSS() {
    const additionalCSS = `
        .top-task-item {
            position: relative;
            background: white;
            border: 2px solid #e5e7eb;
            border-left: 4px solid #10b981;
            border-radius: 8px;
            padding: 12px;
            margin: 0 8px;
            flex: 1;
            min-height: 80px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .top-task-item:hover {
            border-color: #3b82f6;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .top-task-item.dragging {
            opacity: 0.5;
            transform: scale(0.95);
        }

        .top-tasks-drop-zone {
            flex: 1;
            min-height: 80px;
            border: 2px dashed #d1d5db;
            border-radius: 8px;
            margin: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fafafa;
            transition: all 0.2s ease;
        }

        .top-tasks-drop-zone.drag-over {
            border-color: #0ea5e9;
            background: #e0f2fe;
        }

        .drop-zone-content {
            text-align: center;
            color: #6b7280;
        }

        .drop-zone-icon {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 4px;
        }

        .drop-zone-text {
            font-size: 12px;
        }

        .task-title {
            font-weight: 600;
            color: #171717;
            font-size: 14px;
            line-height: 1.4;
            margin-bottom: 4px;
        }

        .task-meta {
            font-size: 11px;
            color: #6b7280;
            line-height: 1.3;
        }

        .task-checkbox {
            position: absolute;
            top: 8px;
            right: 8px;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }

        .remove-from-top {
            position: absolute;
            top: 8px;
            right: 28px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .top-task-item:hover .remove-from-top {
            opacity: 1;
        }

        .remove-from-top:hover {
            background: #dc2626;
        }

        #topTasksRow {
            display: flex;
            gap: 0;
            margin-bottom: 20px;
            padding: 16px;
            background: #f8fafc;
            border-radius: 12px;
            border: 1px solid #e2e8f0;
        }
    `;
    
    const style = document.createElement('style');
    style.textContent = additionalCSS;
    document.head.appendChild(style);
}

// Updated initialization to include migration
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
                
                // Initialize topTaskIds for new system
                if (!project.topTaskIds) {
                    project.topTaskIds = [];
                }
                
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
            
            saveProjects();
            initializeLinkColorIndex();
        } else {
            projects = [];
            initializeLinkColorIndex();
        }
        
        // Run migration for top tasks system
        migrateToProjectSpecificTopTasks();
        
        // Clean up old completed tasks
        cleanupOldCompletedTasks();
        
        // Load pomodoro state
        loadPomodoroState();
        
        // Initialize pomodoro daily count
        const today = new Date().toDateString();
        const savedDaily = loadFromStorage('pomodoroDaily');
        
        if (savedDaily) {
            pomodoroDailyCount = savedDaily.date === today ? savedDaily.count : 0;
        }
        
        // Add the new CSS
        addTopTasksCSS();
        
        updateProjectSelector();
        showProjectOverview();
        updateSettingsButton();
        setupDeleteListeners();
        renderBreadcrumbs();
        
        // Set up periodic cleanup
        setInterval(() => {
            cleanupOldCompletedTasks();
        }, 60 * 60 * 1000);
        
        // Offer work resumption
        setTimeout(() => {
            offerWorkResumption();
        }, 2000);
        
    } catch (error) {
        console.error('Error during initialization:', error);
        // Fallback initialization
        projects = [];
        initializeLinkColorIndex();
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
        if (confirmModal.style.display === 'block') {
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
        if (confirmModal.style.display === 'block') {
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
        if (breadcrumbContainer.style.display !== 'none') {
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
    
    // Project-specific top tasks keyboard shortcuts
    if (e.key === '1' && e.ctrlKey && e.altKey) {
        e.preventDefault();
        // Quick promote most recent task to top 3
        if (currentProject) {
            const incompleteTasks = (currentProject.tasks || []).filter(task => !task.completed);
            if (incompleteTasks.length > 0) {
                // Sort by creation date (most recent first)
                incompleteTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                const mostRecentTask = incompleteTasks[0];
                addTaskToTopThree(mostRecentTask.id);
            }
        }
    }
    
    if (e.key === '2' && e.ctrlKey && e.altKey) {
        e.preventDefault();
        // Clear project's top 3 tasks
        if (currentProject) {
            currentProject.topTaskIds = [];
            saveProjects();
            renderTopTasks();
            showNotification('Project top 3 tasks cleared');
        }
    }
    
    if (e.key === '3' && e.ctrlKey && e.altKey) {
        e.preventDefault();
        // Force re-render top tasks
        if (currentProject) {
            renderTopTasks();
            showNotification('Top tasks refreshed');
        }
    }
    
    // Pomodoro shortcuts when editor is open
    if (getEl('itemEditor').style.display === 'block') {
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

// New project-specific top tasks functions made globally available
window.renderTopTasks = renderTopTasks;
window.addTaskToTopThree = addTaskToTopThree;
window.removeFromTopThree = removeFromTopThree;
window.toggleTopTask = toggleTopTask;
window.diveInToTopTaskSource = diveInToTopTaskSource;
window.handleTopTaskDragStart = handleTopTaskDragStart;
window.handleTopTaskDragEnd = handleTopTaskDragEnd;
window.handleTopTaskDragOver = handleTopTaskDragOver;
window.handleTopTaskDragLeave = handleTopTaskDragLeave;
window.handleTopTaskDrop = handleTopTaskDrop;
window.initializeProjectTopTasks = initializeProjectTopTasks;
window.setupHorizontalTasksDropZones = setupHorizontalTasksDropZones;

// Helper render functions
window.renderBriefs = renderBriefs;
window.renderNotes = renderNotes;
window.renderCopy = renderCopy;
window.renderProjectTasks = renderProjectTasks;

console.log('Project-specific top tasks system loaded. Features:');
console.log('✓ Top 3 tasks per project (not global)');
console.log('✓ Drag briefs/notes/copy into top 3 to create tasks');
console.log('✓ Displacement when dropping between existing top tasks');
console.log('✓ Drop to right side adds to general task list');
console.log('✓ Brief deletion preserves linked items (removes linking only)');
