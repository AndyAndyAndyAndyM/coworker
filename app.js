// ===== CORE UTILITIES =====
const $ = (id) => document.getElementById(id);
const $$ = (selector) => document.querySelectorAll(selector);
const show = (id) => $.style.display = 'block';
const hide = (id) => $.style.display = 'none';
const toggle = (id, display = 'block') => {
    const el = $(id);
    if (el) el.style.display = el.style.display === 'none' ? display : 'none';
};

// Enhanced storage helpers
const storage = {
    save: (key, data) => {
        try {
            if (!window.appStorage) window.appStorage = {};
            window.appStorage[key] = JSON.stringify(data);
        } catch (error) { console.error(`Storage save error:`, error); }
    },
    load: (key, defaultValue = null) => {
        try {
            if (!window.appStorage) window.appStorage = {};
            const saved = window.appStorage[key];
            return saved ? JSON.parse(saved) : defaultValue;
        } catch (error) {
            console.error(`Storage load error:`, error);
            return defaultValue;
        }
    }
};

// Unified utility functions
const utils = {
    generateId: () => Date.now(),
    timestamp: () => new Date().toISOString(),
    formatDate: (dateString) => new Date(dateString).toLocaleDateString(),
    truncate: (content, length = 100) => !content ? '' : content.length > length ? content.substring(0, length) + '...' : content,
    
    notify: (message) => {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    htmlToText: (html) => {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent || temp.innerText || '';
    },

    textToHtml: (text) => {
        if (!text) return '';
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>');
    }
};

// ===== STATE MANAGEMENT =====
let state = {
    projects: [],
    currentProject: null,
    currentEditingItem: null,
    currentEditingType: null,
    draggedItem: null,
    draggedItemType: null,
    showArchived: false,
    autosaveTimeout: null,
    hasUnsavedChanges: false,
    globalTaskOrder: { topThree: [], other: [] },
    draggedGlobalTask: null,
    
    // Pomodoro state
    pomodoro: {
        timer: null,
        timeLeft: 25 * 60,
        isRunning: false,
        isBreak: false,
        sessionCount: 0,
        dailyCount: 0
    },
    
    // Context state
    context: {
        breadcrumbs: [],
        current: null,
        projectContexts: new Map()
    }
};

// Color management
const colors = {
    themes: ['blue', 'green', 'purple', 'pink', 'orange', 'teal', 'indigo', 'red'],
    links: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6366F1'],
    linkIndex: 0,
    
    getNextTheme() {
        const usedThemes = state.projects.map(p => p.colorTheme).filter(Boolean);
        const available = this.themes.filter(theme => !usedThemes.includes(theme));
        return available.length > 0 ? available[0] : this.themes[state.projects.length % this.themes.length];
    },
    
    getNextLink() {
        const color = this.links[this.linkIndex % this.links.length];
        this.linkIndex++;
        return color;
    },
    
    initLinkIndex() {
        let maxIndex = 0;
        state.projects.forEach(project => {
            project.briefs?.forEach(brief => {
                if (brief.linkColor) {
                    const colorIndex = this.links.indexOf(brief.linkColor);
                    if (colorIndex > maxIndex) maxIndex = colorIndex;
                }
            });
        });
        this.linkIndex = maxIndex + 1;
    },

    getLinkColor(item, itemType) {
        if (itemType === 'brief' && item.linkColor) return item.linkColor;
        if ((itemType === 'note' || itemType === 'copy') && item.linkedBriefId) {
            const brief = state.currentProject.briefs.find(b => b.id === item.linkedBriefId);
            return brief?.linkColor || null;
        }
        if (itemType === 'task' && item.sourceItemId && item.sourceItemType) {
            const sourceItem = dataManager.findItem(item.sourceItemId, item.sourceItemType);
            if (sourceItem) return this.getLinkColor(sourceItem, item.sourceItemType);
        }
        return null;
    }
};

// ===== DATA MANAGEMENT =====
const dataManager = {
    save() {
        storage.save('projects', state.projects);
        this.cleanupOldTasks();
        if ($('projectOverview').style.display === 'block') {
            this.cleanupGlobalTaskOrder();
            taskManager.renderGlobal();
        }
    },

    load() {
        const saved = storage.load('projects');
        if (saved) {
            state.projects = Array.isArray(saved) ? saved : [];
            this.migrateData();
            colors.initLinkIndex();
        } else {
            state.projects = [];
            colors.initLinkIndex();
        }
    },

    migrateData() {
        state.projects.forEach(project => {
            // Set defaults
            if (!project.colorTheme) project.colorTheme = colors.getNextTheme();
            if (project.archived === undefined) project.archived = false;
            
            // Ensure arrays exist
            ['briefs', 'notes', 'copy', 'tasks'].forEach(type => {
                if (!project[type]) project[type] = [];
            });

            // Migrate briefs
            project.briefs.forEach(brief => {
                if (brief.content && !brief.proposition && !brief.clientBrief) {
                    brief.clientBrief = brief.content;
                    brief.proposition = '';
                    delete brief.content;
                }
                if (!brief.linkColor) brief.linkColor = colors.getNextLink();
                if (brief.order === undefined) brief.order = 0;
            });

            // Set order values
            ['briefs', 'notes', 'copy', 'tasks'].forEach(type => {
                project[type].forEach((item, index) => {
                    if (item.order === undefined) item.order = index;
                });
            });
        });
        this.save();
    },

    findItem(itemId, itemType) {
        if (!state.currentProject) return null;
        return state.currentProject[`${itemType}s`]?.find(item => item.id == itemId);
    },

    createTaskUniqueId: (projectId, taskId) => `${projectId}-${taskId}`,

    getAllTasks() {
        return state.projects.flatMap(project => 
            (project.tasks || []).map(task => ({
                ...task,
                projectName: project.name,
                projectId: project.id,
                projectColorTheme: project.colorTheme
            }))
        );
    },

    cleanupOldTasks() {
        const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
        let hasChanges = false;
        
        state.projects.forEach(project => {
            const originalLength = project.tasks.length;
            project.tasks = project.tasks.filter(task => {
                if (task.completed && task.completedAt) {
                    return new Date(task.completedAt).getTime() > dayAgo;
                }
                return true;
            });
            if (project.tasks.length !== originalLength) hasChanges = true;
        });
        
        if (hasChanges) {
            this.save();
            this.cleanupGlobalTaskOrder();
        }
    },

    cleanupGlobalTaskOrder() {
        const allTasks = this.getAllTasks();
        const validIds = new Set(allTasks.map(task => this.createTaskUniqueId(task.projectId, task.id)));
        
        state.globalTaskOrder.topThree = state.globalTaskOrder.topThree.filter(id => validIds.has(id));
        state.globalTaskOrder.other = state.globalTaskOrder.other.filter(id => validIds.has(id));
        
        storage.save('globalTaskOrder', state.globalTaskOrder);
    }
};

// ===== TASK MANAGEMENT =====
const taskManager = {
    getOrdered() {
        const allTasks = dataManager.getAllTasks();
        const taskMap = new Map();
        
        allTasks.forEach(task => {
            const uniqueId = dataManager.createTaskUniqueId(task.projectId, task.id);
            taskMap.set(uniqueId, task);
        });
        
        const topThree = state.globalTaskOrder.topThree
            .map(id => taskMap.get(id))
            .filter(task => task && !task.completed)
            .slice(0, 3);
        
        const otherTaskIds = new Set(state.globalTaskOrder.other);
        const topThreeIds = new Set(state.globalTaskOrder.topThree.slice(0, 3));
        
        const other = [];
        state.globalTaskOrder.other.forEach(id => {
            const task = taskMap.get(id);
            if (task && !topThreeIds.has(id)) other.push(task);
        });
        
        allTasks.forEach(task => {
            const uniqueId = dataManager.createTaskUniqueId(task.projectId, task.id);
            if (!topThreeIds.has(uniqueId) && !otherTaskIds.has(uniqueId)) {
                other.push(task);
            }
        });
        
        return { topThree, other: this.sortWithCompletedAtBottom(other) };
    },

    sortWithCompletedAtBottom(tasks) {
        return [...tasks].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const aOrder = a.order || 0;
            const bOrder = b.order || 0;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    },

    createTaskHTML(task, isTopThree, showButtons = false) {
        const uniqueId = dataManager.createTaskUniqueId(task.projectId, task.id);
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        const linkColor = colors.getLinkColor(task, 'task') || '#10b981';
        
        const buttonHTML = showButtons ? 
            (!isTopThree ? 
                `<button onclick="event.stopPropagation(); this.promoteToTopThree('${task.projectId}', '${task.id}')" 
                         style="background: #3b82f6; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer; font-weight: 600;" title="Add to Top 3">★</button>` :
                `<button onclick="event.stopPropagation(); this.removeFromTopThree('${task.projectId}', '${task.id}')" 
                         style="background: #6b7280; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;" title="Remove from Top 3">×</button>`
            ) : '';

        return `
            <div class="global-task-item ${isTopThree ? 'top-three-task' : ''}" 
                 draggable="true"
                 data-unique-id="${uniqueId}"
                 data-project-id="${task.projectId}"
                 data-task-id="${task.id}"
                 style="background: white; border: 1px solid #e5e5e5; border-left: 3px solid ${linkColor}; border-radius: 4px; margin-bottom: 12px; padding: 0px; position: relative; cursor: grab; transition: all 0.2s ease; ${task.completed ? 'opacity: 0.6;' : ''} ${isTopThree ? 'box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);' : ''}">
                
                <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; align-items: center;">
                    <div style="background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">
                        ${isTopThree ? 'Priority' : 'Task'}
                    </div>
                    ${buttonHTML}
                </div>
                
                <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                    <div style="margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); taskManager.toggle('${task.projectId}', '${task.id}')" style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                    </div>
                    <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px; ${showButtons ? 'padding-right: 80px;' : ''}">
                        <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                    </div>
                </div>
                
                <div style="position: absolute; left: 8px; top: 16px;"><div class="grab-handle"></div></div>
                
                <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; ${showButtons ? 'padding-right: 80px;' : ''} ${task.completed ? 'text-decoration: line-through;' : ''}">
                    <span class="global-task-project project-theme-${task.projectColorTheme || 'blue'}">${task.projectName}</span>
                    Created: ${utils.formatDate(task.createdAt)}
                    ${hasSource ? ` • Has source` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${utils.formatDate(task.completedAt)}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${showButtons ? 'padding-right: 80px;' : ''} ${task.completed ? 'text-decoration: line-through;' : ''}">
                        ${utils.truncate(task.content)}
                    </div>
                ` : ''}
                
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span>${hasSource ? 'Click to open source' : 'Click to edit'} • Drag to reorder</span>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="event.stopPropagation(); taskManager.openSource('${task.projectId}', '${task.id}')" style="background: #171717; color: white; border: none; padding: 2px 6px; border-radius: 2px; font-size: 10px; cursor: pointer;">
                            ${hasSource ? 'Open' : 'Edit'}
                        </button>
                        ${canDiveIn ? `
                            <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); taskManager.diveIn('${task.projectId}', '${task.id}')" title="Open in focus mode with Pomodoro">
                                Dive In
                            </span>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    renderSection(containerId, tasks, isTopThree, showButtons = false) {
        const container = $(containerId);
        if (!container) return;
        
        if (tasks.length === 0) {
            const message = isTopThree ? 'Drop your most important tasks here' : 'All other tasks appear here';
            container.innerHTML = `
                <div class="task-drop-zone" style="border: 2px dashed #d1d5db; border-radius: 8px; padding: 40px; text-align: center; color: #6b7280; background: #f9fafb; margin: 8px 0;">
                    <div style="font-size: 14px; margin-bottom: 4px;">${message}</div>
                    <div style="font-size: 12px; opacity: 0.7;">Drag tasks here to organize</div>
                </div>
            `;
            container.className = 'task-drop-zone';
            return;
        }
        
        container.className = '';
        container.innerHTML = tasks.map(task => this.createTaskHTML(task, isTopThree, showButtons)).join('');
    },

    renderGlobal() {
        const { topThree, other } = this.getOrdered();
        this.renderSection('topThreeTasks', topThree, true, true);
        this.renderSection('otherTasks', other, false, true);
    },

    renderHorizontal() {
        const container = $('topTasksRow');
        if (!container) return;
        
        const { topThree } = this.getOrdered();
        container.innerHTML = '';
        
        for (let i = 0; i < 3; i++) {
            const task = topThree[i];
            if (task) {
                container.appendChild(this.createHorizontalElement(task, i));
            } else {
                container.appendChild(this.createDropZone(i));
            }
        }
    },

    createHorizontalElement(task, position) {
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        const linkColor = colors.getLinkColor(task, 'task') || '#10b981';
        
        const el = document.createElement('div');
        el.className = 'top-task-item';
        el.draggable = true;
        el.style.borderLeftColor = linkColor;
        el.setAttribute('data-unique-id', dataManager.createTaskUniqueId(task.projectId, task.id));
        el.setAttribute('data-project-id', task.projectId);
        el.setAttribute('data-task-id', task.id);
        el.setAttribute('data-position', position);
        
        el.innerHTML = `
            <div class="task-title">${task.title}</div>
            <div class="task-meta">
                <span style="background: #f5f5f5; color: #525252; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; text-transform: uppercase; margin-right: 6px;">Task</span>
                ${hasSource ? 'Has source • ' : ''}Created: ${utils.formatDate(task.createdAt)}
                ${canDiveIn ? ` • <span style="background: #fce7f3; color: #be185d; padding: 1px 4px; border-radius: 2px; font-size: 9px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); taskManager.diveIn('${task.projectId}', '${task.id}')" title="Open in focus mode with Pomodoro">Dive In</span>` : ''}
            </div>
            <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); taskManager.toggle('${task.projectId}', '${task.id}')">
        `;
        
        // Add event listeners
        el.addEventListener('dragstart', dragManager.handleStart);
        el.addEventListener('dragend', dragManager.handleEnd);
        el.addEventListener('click', () => taskManager.openSource(task.projectId, task.id));
        
        return el;
    },

    createDropZone(position) {
        const el = document.createElement('div');
        el.className = 'top-tasks-drop-zone';
        el.setAttribute('data-position', position);
        
        el.addEventListener('dragover', dragManager.handleOver);
        el.addEventListener('dragleave', dragManager.handleLeave);
        el.addEventListener('drop', (e) => dragManager.handleDrop(e, position));
        
        return el;
    },

    toggle(projectId, taskId) {
        const project = state.projects.find(p => p.id == projectId);
        if (!project) return;
        
        const task = project.tasks.find(t => t.id == taskId);
        if (!task) return;
        
        task.completed = !task.completed;
        if (task.completed) {
            task.completedAt = utils.timestamp();
            // Remove from priority lists
            const uniqueId = dataManager.createTaskUniqueId(projectId, taskId);
            state.globalTaskOrder.topThree = state.globalTaskOrder.topThree.filter(id => id !== uniqueId);
            state.globalTaskOrder.other = state.globalTaskOrder.other.filter(id => id !== uniqueId);
            storage.save('globalTaskOrder', state.globalTaskOrder);
        } else {
            delete task.completedAt;
        }
        
        dataManager.save();
        setTimeout(() => this.renderGlobal(), 100);
        
        if (state.currentProject && state.currentProject.id == projectId) {
            renderer.projectTasks();
            this.renderHorizontal();
        }
    },

    openSource(projectId, taskId) {
        const project = state.projects.find(p => p.id == projectId);
        if (!project) return;
        
        const task = project.tasks.find(t => t.id == taskId);
        if (!task) return;
        
        if (!state.currentProject || state.currentProject.id != projectId) {
            projectManager.switchTo(projectId, () => {
                setTimeout(() => this._openTaskSource(task), 200);
            });
        } else {
            this._openTaskSource(task);
        }
    },

    _openTaskSource(task) {
        if (!task.sourceItemId || !task.sourceItemType) {
            editor.open(task, 'task');
            return;
        }
        
        const sourceItem = dataManager.findItem(task.sourceItemId, task.sourceItemType);
        if (sourceItem) {
            editor.open(sourceItem, task.sourceItemType);
        } else {
            editor.open(task, 'task');
        }
    },

    diveIn(projectId, taskId) {
        const project = state.projects.find(p => p.id == projectId);
        if (!project) return;
        
        const task = project.tasks.find(t => t.id == taskId);
        if (!task || !task.sourceItemId || !task.sourceItemType || 
            (task.sourceItemType !== 'note' && task.sourceItemType !== 'copy')) {
            utils.notify('Dive In is only available for tasks created from notes or copy');
            return;
        }
        
        if (!state.currentProject || state.currentProject.id != projectId) {
            projectManager.switchTo(projectId, () => {
                setTimeout(() => this._diveInToSource(task), 200);
            });
        } else {
            this._diveInToSource(task);
        }
    },

    _diveInToSource(task) {
        const sourceItem = dataManager.findItem(task.sourceItemId, task.sourceItemType);
        if (!sourceItem) {
            utils.notify('Source item not found');
            return;
        }
        
        editor.open(sourceItem, task.sourceItemType);
        
        setTimeout(() => {
            if (state.pomodoro.isBreak) {
                state.pomodoro.isBreak = false;
                state.pomodoro.timeLeft = 25 * 60;
                pomodoro.updateDisplay();
                pomodoro.updateStatus();
            }
            
            if (!state.pomodoro.isRunning) {
                pomodoro.start();
            }
            
            utils.notify(`Diving into "${sourceItem.title}" - Focus mode activated!`);
        }, 300);
    },

    promoteToTopThree(projectId, taskId) {
        const task = dataManager.getAllTasks().find(t => t.projectId == projectId && t.id == taskId && !t.completed);
        if (!task) {
            utils.notify('Task not found or is completed');
            return;
        }
        
        const uniqueId = dataManager.createTaskUniqueId(projectId, taskId);
        state.globalTaskOrder.other = state.globalTaskOrder.other.filter(id => id !== uniqueId);
        state.globalTaskOrder.topThree = state.globalTaskOrder.topThree.filter(id => id !== uniqueId);
        
        if (state.globalTaskOrder.topThree.length >= 3) {
            const lastTopThree = state.globalTaskOrder.topThree.pop();
            state.globalTaskOrder.other.unshift(lastTopThree);
        }
        
        state.globalTaskOrder.topThree.push(uniqueId);
        storage.save('globalTaskOrder', state.globalTaskOrder);
        this.renderGlobal();
        utils.notify('Task added to Top 3');
    },

    removeFromTopThree(projectId, taskId) {
        const uniqueId = dataManager.createTaskUniqueId(projectId, taskId);
        state.globalTaskOrder.topThree = state.globalTaskOrder.topThree.filter(id => id !== uniqueId);
        
        if (!state.globalTaskOrder.other.includes(uniqueId)) {
            state.globalTaskOrder.other.unshift(uniqueId);
        }
        
        storage.save('globalTaskOrder', state.globalTaskOrder);
        this.renderGlobal();
        utils.notify('Task removed from Top 3');
    }
};

// ===== DRAG AND DROP MANAGEMENT =====
const dragManager = {
    handleStart(event) {
        const el = event.currentTarget;
        const itemData = JSON.parse(el.getAttribute('data-item') || '{}');
        const itemType = el.getAttribute('data-type');
        
        if (el.hasAttribute('data-unique-id')) {
            // Global task drag
            state.draggedGlobalTask = {
                uniqueId: el.getAttribute('data-unique-id'),
                projectId: el.getAttribute('data-project-id'),
                taskId: el.getAttribute('data-task-id'),
                sourcePosition: parseInt(el.getAttribute('data-position') || '0')
            };
        } else {
            // Regular item drag
            state.draggedItem = itemData;
            state.draggedItemType = itemType;
        }
        
        el.classList.add('dragging');
        el.style.opacity = '0.5';
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', '');
    },

    handleEnd(event) {
        event.currentTarget.classList.remove('dragging');
        event.currentTarget.style.opacity = '1';
        state.draggedItem = null;
        state.draggedItemType = null;
        state.draggedGlobalTask = null;
        
        // Clean up indicators
        $$('.drop-position-indicator').forEach(el => el.remove());
    },

    handleOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        
        if (!event.currentTarget.classList.contains('drag-over')) {
            event.currentTarget.classList.add('drag-over');
            if (event.currentTarget.classList.contains('top-tasks-drop-zone')) {
                event.currentTarget.style.background = '#e0f2fe';
                event.currentTarget.style.borderColor = '#0ea5e9';
            }
        }
    },

    handleLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.classList.remove('drag-over');
            if (event.currentTarget.classList.contains('top-tasks-drop-zone')) {
                event.currentTarget.style.background = '#fafafa';
                event.currentTarget.style.borderColor = '#d4d4d4';
            }
        }
    },

    handleDrop(event, targetType) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        if (state.draggedGlobalTask) {
            this.handleGlobalTaskDrop(event, targetType);
        } else if (state.draggedItem && state.draggedItemType) {
            this.handleItemDrop(event, targetType);
        }
        
        this.handleEnd(event);
    },

    handleGlobalTaskDrop(event, targetPosition) {
        if (!state.draggedGlobalTask) return;
        
        const { uniqueId } = state.draggedGlobalTask;
        
        state.globalTaskOrder.topThree = state.globalTaskOrder.topThree.filter(id => id !== uniqueId);
        state.globalTaskOrder.other = state.globalTaskOrder.other.filter(id => id !== uniqueId);
        
        if (typeof targetPosition === 'number') {
            // Drop on horizontal position
            state.globalTaskOrder.topThree.splice(targetPosition, 0, uniqueId);
            if (state.globalTaskOrder.topThree.length > 3) {
                const overflow = state.globalTaskOrder.topThree.splice(3);
                state.globalTaskOrder.other.unshift(...overflow);
            }
        } else if (targetPosition === 'top-three') {
            if (state.globalTaskOrder.topThree.length >= 3) {
                const lastItem = state.globalTaskOrder.topThree.pop();
                state.globalTaskOrder.other.unshift(lastItem);
            }
            state.globalTaskOrder.topThree.push(uniqueId);
        } else {
            state.globalTaskOrder.other.push(uniqueId);
        }
        
        storage.save('globalTaskOrder', state.globalTaskOrder);
        taskManager.renderHorizontal();
        taskManager.renderGlobal();
        utils.notify('Task moved successfully');
    },

    handleItemDrop(event, targetType) {
        if (state.draggedItemType === targetType) {
            this.reorderItem(event);
        } else {
            this.createFromDrop(targetType);
        }
    },

    reorderItem(event) {
        // Simplified reordering logic
        const item = state.draggedItem;
        const itemType = state.draggedItemType;
        
        if (!state.currentProject || !item) return;
        
        const itemArray = state.currentProject[`${itemType}s`];
        const currentIndex = itemArray.findIndex(arrayItem => arrayItem.id === item.id);
        
        if (currentIndex === -1) return;
        
        // Move to top (simplified)
        const movedItem = itemArray.splice(currentIndex, 1)[0];
        itemArray.unshift(movedItem);
        
        itemArray.forEach((arrayItem, index) => {
            arrayItem.order = index;
        });
        
        dataManager.save();
        renderer[`${itemType}s`]();
        utils.notify(`Reordered "${item.title}"`);
    },

    createFromDrop(targetType) {
        const sourceItem = state.draggedItem;
        const sourceType = state.draggedItemType;
        
        if (!state.currentProject) return;
        
        const newItem = {
            id: utils.generateId(),
            title: sourceItem.title,
            content: this.getContentForDrop(sourceItem, sourceType, targetType),
            type: targetType,
            createdAt: utils.timestamp(),
            order: 0
        };
        
        this.handleSpecialDropTypes(newItem, sourceItem, sourceType, targetType);
        
        // Add to project and update orders
        const targetArray = state.currentProject[`${targetType}s`];
        targetArray.forEach(item => {
            if (item.order !== undefined) item.order += 1;
        });
        targetArray.unshift(newItem);
        
        dataManager.save();
        renderer[`${targetType}s`]();
        if (targetType === 'task') {
            taskManager.renderHorizontal();
        }
        
        utils.notify(`Created ${targetType} "${newItem.title}" from ${sourceType}`);
    },

    getContentForDrop(sourceItem, sourceType, targetType) {
        if (sourceType === 'brief' && targetType === 'task') {
            const proposition = sourceItem.proposition || '';
            const clientBrief = sourceItem.clientBrief || sourceItem.content || '';
            return [proposition, clientBrief].filter(Boolean).join('\n\n');
        }
        return targetType === 'task' ? sourceItem.content || '' : '';
    },

    handleSpecialDropTypes(newItem, sourceItem, sourceType, targetType) {
        if (targetType === 'task') {
            newItem.completed = false;
            newItem.sourceItemId = sourceItem.id;
            newItem.sourceItemType = sourceType;
            
            // Remove existing task from same source
            const existingIndex = state.currentProject.tasks.findIndex(task => 
                task.sourceItemId === sourceItem.id && task.sourceItemType === sourceType
            );
            if (existingIndex !== -1) {
                state.currentProject.tasks.splice(existingIndex, 1);
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
            newItem = {
                ...newItem,
                proposition: '',
                clientBrief: newItem.content,
                linkColor: colors.getNextLink()
            };
            delete newItem.content;
        }
        
        return newItem;
    }
};

// ===== PROJECT MANAGEMENT =====
const projectManager = {
    create() {
        const name = $('newProjectName').value.trim();
        const description = $('newProjectDescription').value.trim();
        
        if (!name) return;
        
        const project = {
            id: utils.generateId(),
            name,
            description,
            briefs: [],
            notes: [],
            copy: [],
            tasks: [],
            createdAt: utils.timestamp(),
            colorTheme: colors.getNextTheme(),
            archived: false
        };
        
        state.projects.push(project);
        dataManager.save();
        this.updateSelector();
        modal.close('projectModal');
        
        $('newProjectName').value = '';
        $('newProjectDescription').value = '';
        
        renderer.overview();
    },

    switchTo(projectId, callback) {
        const project = state.projects.find(p => p.id == projectId);
        if (!project) return;
        
        state.currentProject = project;
        $('projectSelect').value = project.id;
        show('dashboard');
        hide('projectOverview');
        show('topTasksRow');
        
        // Apply theme
        const dashboard = $('dashboard');
        colors.themes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
        if (project.colorTheme) {
            dashboard.classList.add(`project-theme-${project.colorTheme}`);
        }
        dashboard.classList.add('project-themed');
        
        this.updateSettingsButton();
        renderer.project();
        taskManager.renderHorizontal();
        
        if (callback) callback();
    },

    showOverview() {
        hide('dashboard');
        show('projectOverview');
        $('projectSelect').value = '';
        hide('topTasksRow');
        state.currentProject = null;
        
        const dashboard = $('dashboard');
        colors.themes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
        dashboard.classList.remove('project-themed');
        
        this.updateSettingsButton();
        renderer.overview();
        taskManager.renderGlobal();
    },

    updateSelector() {
        const select = $('projectSelect');
        const activeProjects = state.projects.filter(project => !project.archived);
        select.innerHTML = '<option value="">Select a project...</option>' +
            activeProjects.map(project => `<option value="${project.id}">${project.name}</option>`).join('');
    },

    updateSettingsButton() {
        if (state.currentProject) {
            show('projectSettingsBtn');
            hide('archiveToggle');
        } else {
            hide('projectSettingsBtn');
            show('archiveToggle');
        }
    },

    openSettings(projectId) {
        const project = projectId ? state.projects.find(p => p.id === projectId) : state.currentProject;
        if (!project) return;
        
        $('settingsProjectName').value = project.name;
        $('settingsColorTheme').value = project.colorTheme || 'blue';
        show('projectSettingsModal');
        
        window.currentSettingsProject = project;
    },

    saveSettings() {
        const project = window.currentSettingsProject;
        if (!project) return;
        
        const newName = $('settingsProjectName').value.trim();
        const newTheme = $('settingsColorTheme').value;
        
        if (!newName) return;
        
        project.name = newName;
        project.colorTheme = newTheme;
        
        dataManager.save();
        this.updateSelector();
        modal.close('projectSettingsModal');
        
        if (state.currentProject && state.currentProject.id === project.id) {
            const dashboard = $('dashboard');
            colors.themes.forEach(theme => dashboard.classList.remove(`project-theme-${theme}`));
            dashboard.classList.add(`project-theme-${newTheme}`);
        }
        
        renderer.overview();
        window.currentSettingsProject = null;
    },

    toggleArchive(projectId) {
        const project = state.projects.find(p => p && p.id === projectId);
        if (project) {
            project.archived = !project.archived;
            dataManager.save();
            this.updateSelector();
            renderer.overview();
        }
    }
};

// ===== RENDERING ENGINE =====
const renderer = {
    overview() {
        const grid = $('projectGrid');
        if (!grid) return;
        
        const visibleProjects = state.projects.filter(project => 
            state.showArchived ? true : !project.archived
        );
        
        if (visibleProjects.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: #a3a3a3;">
                    <div style="font-size: 14px; margin-bottom: 8px;">No projects</div>
                    <div style="font-size: 12px; color: #d4d4d4;">Create your first project to get started</div>
                </div>
            `;
            return;
        }

        grid.innerHTML = visibleProjects.map(project => {
            const totalTasks = project.tasks?.length || 0;
            const completedTasks = project.tasks?.filter(t => t?.completed).length || 0;
            const colorTheme = project.colorTheme || 'blue';
            const briefsCount = project.briefs?.length || 0;
            const notesCount = project.notes?.length || 0;
            const copyCount = project.copy?.length || 0;
            
            return `
                <div class="project-card project-theme-${colorTheme} project-themed ${project.archived ? 'archived-project' : ''}" 
                     onclick="projectManager.switchTo(${project.id})">
                    <div class="project-title">${project.name || 'Untitled Project'}</div>
                    <div style="color: #737373; font-size: 14px; margin-bottom: 16px;">
                        ${project.description || 'No description'}
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0;">
                        ${[
                            ['Briefs', briefsCount],
                            ['Notes', notesCount], 
                            ['Copy', copyCount],
                            ['Tasks', totalTasks]
                        ].map(([label, count]) => `
                            <div style="text-align: center; padding: 8px; background: var(--secondary); border-radius: 4px;">
                                <div style="font-size: 1.5rem; font-weight: 600; color: var(--accent);">${count}</div>
                                <div style="font-size: 12px; color: #737373;">${label}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
                        <div style="font-size: 12px; color: #737373;">
                            Created: ${project.createdAt ? utils.formatDate(project.createdAt) : 'Unknown'}
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="archive-btn" onclick="event.stopPropagation(); projectManager.openSettings(${project.id})" style="background: #171717;">Settings</button>
                            <button class="archive-btn" onclick="event.stopPropagation(); projectManager.toggleArchive(${project.id})">
                                ${project.archived ? 'Restore' : 'Archive'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    project() {
        if (!state.currentProject) return;
        this.briefs();
        this.notes();
        this.copy();
        this.projectTasks();
    },

    createItemHTML(item, itemType) {
        const commonHTML = `
            <div class="grab-handle"></div>
            <div class="item-type type-${itemType}">${itemType.charAt(0).toUpperCase() + itemType.slice(1)}</div>
            <div class="item-header">
                <div class="item-title">${item.title}</div>
            </div>
            <div class="item-meta">
                Created: ${utils.formatDate(item.createdAt)}
                ${this.getMetaExtra(item, itemType)}
            </div>
            ${this.getContentSection(item, itemType)}
            <div class="item-actions">
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; flex: 1;">
                    Double-click to edit • Drag to create ${itemType === 'task' ? 'task' : 'linked items'}
                </div>
                <button class="delete-btn" data-delete-type="${itemType}" data-delete-id="${item.id}">×</button>
            </div>
        `;

        const linkColor = colors.getLinkColor(item, itemType) || '#a3a3a3';
        const linkedCount = itemType === 'brief' ? this.getLinkedItemsCount(item.id) : 0;
        
        return `
            <div class="item ${itemType}-item sortable-item ${linkedCount > 0 ? 'linked-item' : ''}" 
                 draggable="true"
                 data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}'
                 data-type="${itemType}"
                 ondblclick="editor.open(dataManager.findItem('${item.id}', '${itemType}'), '${itemType}')"
                 style="border-left: 3px solid ${linkColor};">
                ${commonHTML}
            </div>
        `;
    },

    getMetaExtra(item, itemType) {
        if (itemType === 'brief') {
            const linkedCount = this.getLinkedItemsCount(item.id);
            return linkedCount > 0 ? ` • ${linkedCount} linked item${linkedCount > 1 ? 's' : ''}` : '';
        }
        
        if ((itemType === 'note' || itemType === 'copy') && item.linkedBriefId) {
            const linkedBrief = state.currentProject.briefs.find(b => b.id === item.linkedBriefId);
            return linkedBrief ? ` • Linked to "${linkedBrief.title}"` : '';
        }
        
        if (itemType === 'task' && item.sourceItemId && item.sourceItemType) {
            const sourceItem = dataManager.findItem(item.sourceItemId, item.sourceItemType);
            return sourceItem ? ` • From: "${sourceItem.title}"` : '';
        }
        
        return '';
    },

    getContentSection(item, itemType) {
        if (itemType === 'brief') {
            const proposition = item.proposition || '';
            const clientBrief = item.clientBrief || item.content || '';
            
            let content = '';
            if (proposition.trim()) {
                content += `
                    <div style="margin: 8px 0; padding: 8px; background: #f0f9ff; border-left: 3px solid #0ea5e9; border-radius: 4px;">
                        <div style="font-size: 11px; font-weight: 600; color: #0369a1; text-transform: uppercase; margin-bottom: 4px;">Proposition</div>
                        <div style="color: #525252; line-height: 1.4; font-size: 13px;">${utils.truncate(proposition, 120)}</div>
                    </div>
                `;
            }
            if (clientBrief.trim()) {
                content += `
                    <div style="margin: 8px 0; padding: 8px; background: #fefce8; border-left: 3px solid #eab308; border-radius: 4px;">
                        <div style="font-size: 11px; font-weight: 600; color: #a16207; text-transform: uppercase; margin-bottom: 4px;">Client Brief</div>
                        <div style="color: #525252; line-height: 1.4; font-size: 13px;">${utils.truncate(clientBrief, 120)}</div>
                    </div>
                `;
            }
            return content;
        }
        
        return item.content ? `
            <div style="margin: 8px 0; color: #525252; line-height: 1.4;">
                ${utils.truncate(item.content)}
            </div>
        ` : '';
    },

    getLinkedItemsCount(briefId) {
        let count = 0;
        if (state.currentProject?.notes) {
            count += state.currentProject.notes.filter(note => note.linkedBriefId === briefId).length;
        }
        if (state.currentProject?.copy) {
            count += state.currentProject.copy.filter(copy => copy.linkedBriefId === briefId).length;
        }
        return count;
    },

    renderItemList(containerId, items, itemType) {
        const list = $(containerId);
        if (!list) return;
        
        if (!items) items = [];
        
        // Ensure order values and sort
        items.forEach((item, index) => {
            if (item.order === undefined) item.order = index;
        });
        
        const sortedItems = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
        list.innerHTML = sortedItems.map(item => this.createItemHTML(item, itemType)).join('');
    },

    briefs() {
        this.renderItemList('briefsList', state.currentProject?.briefs, 'brief');
    },

    notes() {
        this.renderItemList('notesList', state.currentProject?.notes, 'note');
    },

    copy() {
        this.renderItemList('copyList', state.currentProject?.copy, 'copy');
    },

    projectTasks() {
        const container = $('projectTaskContainer');
        if (!container || !state.currentProject) return;
        
        const tasks = state.currentProject.tasks || [];
        if (tasks.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #737373;">No tasks yet</div>';
            return;
        }
        
        const sortedTasks = taskManager.sortWithCompletedAtBottom(tasks);
        container.innerHTML = sortedTasks.map(task => this.createTaskHTML(task)).join('');
    },

    createTaskHTML(task) {
        const hasSource = task.sourceItemId && task.sourceItemType;
        const canDiveIn = hasSource && (task.sourceItemType === 'note' || task.sourceItemType === 'copy');
        const linkColor = colors.getLinkColor(task, 'task') || '#10b981';
        
        return `
            <div class="project-task-item" 
                 draggable="true"
                 data-item='${JSON.stringify(task).replace(/'/g, '&#39;')}'
                 data-type="task"
                 ondblclick="taskManager.openSource('${state.currentProject.id}', '${task.id}')"
                 style="background: white; border: 1px solid #e5e5e5; border-left: 3px solid ${linkColor}; border-radius: 4px; margin-bottom: 12px; padding: 0px; position: relative; cursor: grab; transition: all 0.2s ease; ${task.completed ? 'opacity: 0.6;' : ''}">
                
                <div style="position: absolute; top: 8px; right: 8px; background: #f5f5f5; color: #525252; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase;">Task</div>
                
                <div style="display: flex; gap: 0px; align-items: flex-start; margin-bottom: 6px; padding: 0px; margin: 0px;">
                    <div style="margin: 0; margin-left: 39px; margin-top: 5px; padding: 0; flex-shrink: 0; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">
                        <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="event.stopPropagation(); taskManager.toggle('${state.currentProject.id}', '${task.id}')" style="width: 16px; height: 16px; margin: 0; padding: 0; cursor: pointer;">
                    </div>
                    <div style="flex: 1; min-width: 0; margin: 0; padding: 0; padding-left: 8px;">
                        <div style="font-weight: 600; color: #171717; font-size: 14px; line-height: 1.4; margin: 0; padding: 0; ${task.completed ? 'text-decoration: line-through;' : ''}">${task.title}</div>
                    </div>
                </div>
                
                <div style="position: absolute; left: 8px; top: 16px;"><div class="grab-handle"></div></div>
                
                <div style="font-size: 12px; color: #737373; margin-bottom: 8px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                    Created: ${utils.formatDate(task.createdAt)}
                    ${hasSource ? ` • Has source` : ''}
                    ${task.completed && task.completedAt ? ` • Completed: ${utils.formatDate(task.completedAt)}` : ''}
                </div>
                
                ${task.content ? `
                    <div style="margin: 6px 0; color: #525252; line-height: 1.4; font-size: 13px; padding-left: 63px; ${task.completed ? 'text-decoration: line-through;' : ''}">
                        ${utils.truncate(task.content)}
                    </div>
                ` : ''}
                
                <div style="font-size: 11px; color: #a3a3a3; font-style: italic; margin-top: 8px; margin-bottom: 8px; padding-left: 63px; padding-right: 8px; display: flex; justify-content: space-between; align-items: center;">
                    <span>${hasSource ? 'Double-click to open source' : 'Double-click to edit'} • Drag to create task</span>
                    ${canDiveIn ? `
                        <span style="background: #fce7f3; color: #be185d; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: 600; text-transform: uppercase; cursor: pointer;" onclick="event.stopPropagation(); taskManager.diveIn('${state.currentProject.id}', '${task.id}')" title="Open in focus mode with Pomodoro">
                            Dive In
                        </span>
                    ` : ''}
                </div>
            </div>
        `;
    }
};

// ===== EDITOR MANAGEMENT =====
const editor = {
    open(item, itemType) {
        if (!item) return;
        
        // Save current context
        if (state.currentEditingItem) {
            contextManager.save();
        }
        
        state.currentEditingItem = item;
        state.currentEditingType = itemType;
        state.hasUnsavedChanges = false;
        
        // Add to breadcrumbs
        if (state.currentProject) {
            contextManager.addBreadcrumb(state.currentProject.id, item.id, itemType, item.title);
        }
        
        this.populateEditor(item, itemType);
        show('itemEditor');
        
        setTimeout(() => {
            this.setupPomodoroTimer(itemType);
            this.setupAutosave();
            autosave.updateStatus('ready');
        }, 100);
    },

    populateEditor(item, itemType) {
        $('editorTitle').textContent = `Edit ${itemType.charAt(0).toUpperCase() + itemType.slice(1)}`;
        $('editorItemTitle').value = item.title || '';
        
        if (itemType === 'brief') {
            show('briefFields');
            hide('standardFields');
            $('editorProposition').value = item.proposition || '';
            $('editorClientBrief').value = item.clientBrief || item.content || '';
        } else {
            hide('briefFields');
            show('standardFields');
            
            if (itemType === 'note' || itemType === 'copy') {
                show('richEditor');
                hide('editorContent');
                const richEditor = $('richEditor');
                richEditor.innerHTML = item.richContent || utils.textToHtml(item.content || '');
            } else {
                hide('richEditor');
                show('editorContent');
                $('editorContent').value = item.content || '';
            }
            
            // Show/hide buttons based on type
            const insertBtn = $('insertHeadingsBtn');
            const copyBtn = $('copyToClipboardBtn');
            if (insertBtn) insertBtn.style.display = itemType === 'note' ? 'inline-flex' : 'none';
            if (copyBtn) copyBtn.style.display = (itemType === 'note' || itemType === 'copy') ? 'inline-flex' : 'none';
        }
    },

    setupPomodoroTimer(itemType) {
        const timer = $('pomodoroTimer');
        if (!timer) return;
        
        if (itemType === 'note' || itemType === 'copy') {
            timer.style.display = 'flex';
            timer.style.visibility = 'visible';
            setTimeout(() => {
                pomodoro.init();
                pomodoro.updateHeaderStyle();
            }, 50);
        } else {
            timer.style.display = 'none';
        }
    },

    setupAutosave() {
        // Remove existing listeners
        $$('.autosave-field').forEach(field => {
            field.removeEventListener('input', autosave.debounced);
        });
        
        // Add listeners to all relevant fields
        const fields = ['editorItemTitle', 'editorProposition', 'editorClientBrief', 'editorContent'];
        fields.forEach(fieldId => {
            const field = $(fieldId);
            if (field) {
                field.classList.add('autosave-field');
                field.addEventListener('input', autosave.debounced);
            }
        });
        
        const richEditor = $('richEditor');
        if (richEditor && richEditor.style.display !== 'none') {
            richEditor.classList.add('autosave-field');
            richEditor.addEventListener('input', autosave.debounced);
            richEditor.addEventListener('paste', () => setTimeout(autosave.debounced, 100));
        }
    },

    close() {
        if (state.currentEditingItem && state.currentEditingType && state.currentProject) {
            contextManager.save();
        }
        
        if (state.pomodoro.isRunning) {
            pomodoro.pause();
        }
        
        pomodoro.exitFocus();
        hide('itemEditor');
        state.currentEditingItem = null;
        state.currentEditingType = null;
    },

    insertHeadings() {
        const richEditor = $('richEditor');
        let proposition = '';
        
        if (state.currentEditingType === 'note' && state.currentEditingItem.linkedBriefId) {
            const linkedBrief = state.currentProject.briefs.find(b => b.id === state.currentEditingItem.linkedBriefId);
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
        }
    },

    copyToClipboard() {
        let contentToCopy = '';
        let htmlContent = '';
        
        if (state.currentEditingType === 'brief') {
            const title = $('editorItemTitle').value;
            const proposition = $('editorProposition').value;
            const clientBrief = $('editorClientBrief').value;
            
            contentToCopy = title;
            if (proposition) contentToCopy += '\n\nPROPOSITION:\n' + proposition;
            if (clientBrief) contentToCopy += '\n\nCLIENT BRIEF:\n' + clientBrief;
            
            htmlContent = `<h3>${title}</h3>`;
            if (proposition) htmlContent += `<h4>PROPOSITION:</h4><p>${proposition.replace(/\n/g, '<br>')}</p>`;
            if (clientBrief) htmlContent += `<h4>CLIENT BRIEF:</h4><p>${clientBrief.replace(/\n/g, '<br>')}</p>`;
        } else {
            const title = $('editorItemTitle').value;
            const richEditor = $('richEditor');
            const textEditor = $('editorContent');
            
            if (richEditor && richEditor.style.display !== 'none') {
                const content = richEditor.innerHTML;
                htmlContent = `<h3>${title}</h3>${content}`;
                contentToCopy = title + '\n\n' + utils.htmlToText(content);
            } else if (textEditor) {
                const content = textEditor.value.trim();
                contentToCopy = title + '\n\n' + content;
                htmlContent = `<h3>${title}</h3><p>${content.replace(/\n/g, '<br>')}</p>`;
            }
        }
        
        // Copy with formatting if supported
        if (navigator.clipboard?.write) {
            const clipboardItem = new ClipboardItem({
                'text/html': new Blob([htmlContent], { type: 'text/html' }),
                'text/plain': new Blob([contentToCopy], { type: 'text/plain' })
            });
            
            navigator.clipboard.write([clipboardItem]).then(() => {
                utils.notify('Content copied with formatting!');
            }).catch(() => {
                this.fallbackCopy(contentToCopy);
            });
        } else {
            this.fallbackCopy(contentToCopy);
        }
    },

    fallbackCopy(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                utils.notify('Content copied!');
            }).catch(() => {
                this.textareaCopy(text);
            });
        } else {
            this.textareaCopy(text);
        }
    },

    textareaCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        
        try {
            document.execCommand('copy');
            utils.notify('Content copied!');
        } catch (err) {
            utils.notify('Failed to copy');
        }
        
        document.body.removeChild(textArea);
    },

    formatRichText(command, value = null) {
        document.execCommand(command, false, value);
        $('richEditor').focus();
    },

    createLink() {
        const url = prompt('Enter URL:');
        if (url) {
            this.formatRichText('createLink', url);
        }
    }
};

// ===== AUTOSAVE MANAGEMENT =====
const autosave = {
    timeout: null,

    debounced() {
        if (autosave.timeout) clearTimeout(autosave.timeout);
        
        state.hasUnsavedChanges = true;
        autosave.updateStatus('changes');
        
        autosave.timeout = setTimeout(() => {
            if (state.hasUnsavedChanges) autosave.save();
        }, 1500);
    },

    save() {
        if (!state.currentEditingItem) return;
        
        autosave.updateStatus('saving');
        
        const newTitle = $('editorItemTitle').value.trim();
        if (!newTitle) {
            autosave.updateStatus('ready');
            return;
        }
        
        const oldTitle = state.currentEditingItem.title;
        state.currentEditingItem.title = newTitle;
        state.currentEditingItem.lastModified = utils.timestamp();
        
        let contentChanged = oldTitle !== newTitle;
        
        if (state.currentEditingType === 'brief') {
            const oldProp = state.currentEditingItem.proposition || '';
            const oldBrief = state.currentEditingItem.clientBrief || '';
            const newProp = $('editorProposition').value;
            const newBrief = $('editorClientBrief').value;
            
            contentChanged = contentChanged || (oldProp !== newProp) || (oldBrief !== newBrief);
            
            state.currentEditingItem.proposition = newProp;
            state.currentEditingItem.clientBrief = newBrief;
            delete state.currentEditingItem.content;
        } else {
            const richEditor = $('richEditor');
            const textEditor = $('editorContent');
            
            if (richEditor && richEditor.style.display !== 'none') {
                const oldContent = state.currentEditingItem.content || '';
                const newContent = utils.htmlToText(richEditor.innerHTML);
                contentChanged = contentChanged || (oldContent !== newContent);
                
                state.currentEditingItem.content = newContent;
                state.currentEditingItem.richContent = richEditor.innerHTML;
            } else if (textEditor) {
                const oldContent = state.currentEditingItem.content || '';
                const newContent = textEditor.value.trim();
                contentChanged = contentChanged || (oldContent !== newContent);
                
                state.currentEditingItem.content = newContent;
            }
        }
        
        if (contentChanged && state.currentProject) {
            this.moveToTop();
        }
        
        dataManager.save();
        contextManager.save();
        
        state.hasUnsavedChanges = false;
        autosave.updateStatus('saved');
        
        setTimeout(() => {
            renderer[`${state.currentEditingType}s`]();
        }, 100);
    },

    moveToTop() {
        const itemType = state.currentEditingType;
        const itemArray = state.currentProject[`${itemType}s`];
        
        itemArray.forEach(item => {
            if (item.id === state.currentEditingItem.id) {
                item.order = 0;
            } else if (item.order !== undefined) {
                item.order += 1;
            }
        });
    },

    updateStatus(status) {
        const el = $('autosaveText');
        if (!el) return;
        
        const states = {
            saving: { text: 'Saving...', color: '#171717' },
            saved: { text: 'Saved', color: '#16a34a' },
            changes: { text: 'Unsaved changes...', color: '#f59e0b' },
            ready: { text: 'Ready', color: '#737373' }
        };
        
        const state = states[status] || states.ready;
        el.textContent = state.text;
        el.style.color = state.color;
        
        if (status === 'saved') {
            setTimeout(() => {
                if (el) {
                    el.textContent = 'Ready';
                    el.style.color = '#737373';
                }
            }, 2000);
        }
    }
};

// ===== POMODORO MANAGEMENT =====
const pomodoro = {
    init() {
        const today = new Date().toDateString();
        const savedDaily = storage.load('pomodoroDaily');
        
        if (savedDaily) {
            state.pomodoro.dailyCount = savedDaily.date === today ? savedDaily.count : 0;
        }
        
        this.updateDisplay();
        this.updateStatus();
        this.updateStats();
    },

    start() {
        state.pomodoro.isRunning = true;
        hide('pomodoroStart');
        show('pomodoroPause');
        
        this.updateHeaderStyle();
        this.updateStatus();
        this.saveState();
        
        if (!state.pomodoro.isBreak) {
            this.enterFocus();
        }
        
        state.pomodoro.timer = setInterval(() => {
            state.pomodoro.timeLeft--;
            this.updateDisplay();
            
            if (state.pomodoro.timeLeft % 10 === 0) {
                this.saveState();
            }
            
            if (state.pomodoro.timeLeft <= 0) {
                this.complete();
            }
        }, 1000);
    },

    pause() {
        state.pomodoro.isRunning = false;
        clearInterval(state.pomodoro.timer);
        show('pomodoroStart');
        hide('pomodoroPause');
        
        this.updateHeaderStyle();
        this.exitFocus();
        this.updateStatus();
        this.saveState();
    },

    reset() {
        this.pause();
        state.pomodoro.isBreak = false;
        state.pomodoro.timeLeft = 25 * 60;
        
        this.updateDisplay();
        this.updateStatus();
        this.updateHeaderStyle();
        this.clearState();
    },

    skip() {
        this.pause();
        this.complete();
    },

    complete() {
        this.pause();
        
        if (state.currentEditingItem && state.currentEditingType && state.currentProject) {
            contextManager.save();
        }
        
        if (state.pomodoro.isBreak) {
            state.pomodoro.isBreak = false;
            state.pomodoro.timeLeft = 25 * 60;
            
            if (state.context.current) {
                setTimeout(() => {
                    contextManager.restore(state.context.current);
                    utils.notify('Work resumed after break');
                }, 1000);
            }
        } else {
            state.pomodoro.sessionCount++;
            state.pomodoro.dailyCount++;
            
            state.pomodoro.isBreak = true;
            state.pomodoro.timeLeft = state.pomodoro.sessionCount % 4 === 0 ? 15 * 60 : 5 * 60;
            
            const today = new Date().toDateString();
            storage.save('pomodoroDaily', {
                date: today,
                count: state.pomodoro.dailyCount
            });
        }
        
        this.updateDisplay();
        this.updateStatus();
        this.updateStats();
        this.updateHeaderStyle();
        this.clearState();
        
        utils.notify(state.pomodoro.isBreak ? 'Work session complete! Take a break.' : 'Break over! Ready for another session?');
        this.playSound();
    },

    updateDisplay() {
        const el = $('pomodoroDisplay');
        if (!el) return;
        
        const minutes = Math.floor(state.pomodoro.timeLeft / 60);
        const seconds = state.pomodoro.timeLeft % 60;
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        el.textContent = timeString;
        
        const overlayTimer = $('overlayTimer');
        if (overlayTimer) {
            overlayTimer.textContent = timeString;
        }
    },

    updateStatus() {
        const el = $('pomodoroStatus');
        if (!el) return;
        
        if (state.pomodoro.isRunning) {
            el.textContent = state.pomodoro.isBreak ? 'Break time - relax!' : 'Focus time - stay concentrated!';
        } else {
            if (state.pomodoro.isBreak) {
                el.textContent = 'Break paused';
            } else {
                el.textContent = state.pomodoro.timeLeft === 25 * 60 ? 'Ready to focus' : 'Paused';
            }
        }
    },

    updateStats() {
        const sessionEl = $('sessionCount');
        const dailyEl = $('dailyCount');
        
        if (sessionEl) sessionEl.textContent = state.pomodoro.sessionCount;
        if (dailyEl) dailyEl.textContent = state.pomodoro.dailyCount;
    },

    updateHeaderStyle() {
        const header = document.querySelector('.editor-header');
        if (!header) return;
        
        header.classList.remove('pomodoro-active', 'pomodoro-break');
        
        const timer = $('pomodoroTimer');
        if (timer && timer.style.display !== 'none' && state.pomodoro.isRunning) {
            if (state.pomodoro.isBreak) {
                header.classList.add('pomodoro-break');
            } else {
                header.classList.add('pomodoro-active');
            }
        }
    },

    enterFocus() {
        const editorModal = $('itemEditor');
        editorModal.classList.add('true-fullscreen');
        this.setupOverlay();
        
        // Try browser fullscreen
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => {});
        }
    },

    exitFocus() {
        const editorModal = $('itemEditor');
        
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        
        editorModal.classList.remove('fullscreen', 'true-fullscreen');
        
        const overlay = $('focusOverlay');
        if (overlay) overlay.remove();
        
        document.body.style.cursor = 'default';
    },

    setupOverlay() {
        const existing = $('focusOverlay');
        if (existing) existing.remove();
        
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-overlay';
        overlay.id = 'focusOverlay';
        overlay.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>Focus Mode</span>
                <span id="overlayTimer">${Math.floor(state.pomodoro.timeLeft / 60)}:${(state.pomodoro.timeLeft % 60).toString().padStart(2, '0')}</span>
                <button onclick="pomodoro.exitFocus()" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 2px 6px; border-radius: 2px; font-size: 10px; margin-left: 8px; cursor: pointer;">Exit</button>
            </div>
        `;
        document.body.appendChild(overlay);
        
        // Cursor management
        let cursorTimeout;
        const hideCursor = () => document.body.style.cursor = 'none';
        const showCursor = () => {
            document.body.style.cursor = 'default';
            clearTimeout(cursorTimeout);
            cursorTimeout = setTimeout(hideCursor, 3000);
        };
        
        document.removeEventListener('mousemove', showCursor);
        document.addEventListener('mousemove', showCursor);
        showCursor();
    },

    playSound() {
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
            // Silent fail
        }
    },

    saveState() {
        storage.save('pomodoroState', {
            timeLeft: state.pomodoro.timeLeft,
            isRunning: state.pomodoro.isRunning,
            isBreak: state.pomodoro.isBreak,
            sessionCount: state.pomodoro.sessionCount,
            lastUpdate: Date.now()
        });
    },

    loadState() {
        const saved = storage.load('pomodoroState');
        if (!saved) return;
        
        const now = Date.now();
        const elapsed = Math.floor((now - saved.lastUpdate) / 1000);
        
        state.pomodoro.timeLeft = Math.max(0, saved.timeLeft - (saved.isRunning ? elapsed : 0));
        state.pomodoro.isRunning = saved.isRunning && state.pomodoro.timeLeft > 0;
        state.pomodoro.isBreak = saved.isBreak;
        state.pomodoro.sessionCount = saved.sessionCount;
        
        if (saved.isRunning && state.pomodoro.timeLeft <= 0) {
            this.complete();
        }
    },

    clearState() {
        if (window.appStorage) {
            delete window.appStorage['pomodoroState'];
        }
    }
};

// ===== CONTEXT MANAGEMENT =====
const contextManager = {
    save() {
        if (!state.currentEditingItem || !state.currentEditingType || !state.currentProject) return;
        
        const context = {
            projectId: state.currentProject.id,
            itemId: state.currentEditingItem.id,
            itemType: state.currentEditingType,
            timestamp: Date.now(),
            title: state.currentEditingItem.title,
            editorState: this.getEditorState()
        };
        
        const projectKey = `project-${state.currentProject.id}`;
        state.context.projectContexts.set(projectKey, context);
        state.context.current = context;
        
        storage.save('workContext', {
            breadcrumbs: state.context.breadcrumbs,
            current: state.context.current,
            projectContexts: Array.from(state.context.projectContexts.entries()),
            timestamp: Date.now()
        });
    },

    getEditorState() {
        if (state.currentEditingType === 'brief') {
            return {
                title: $('editorItemTitle').value,
                proposition: $('editorProposition').value,
                clientBrief: $('editorClientBrief').value
            };
        } else {
            const richEditor = $('richEditor');
            const textEditor = $('editorContent');
            
            if (richEditor && richEditor.style.display !== 'none') {
                return {
                    title: $('editorItemTitle').value,
                    content: richEditor.innerHTML,
                    isRichText: true
                };
            } else if (textEditor) {
                return {
                    title: $('editorItemTitle').value,
                    content: textEditor.value,
                    isRichText: false
                };
            }
        }
        return null;
    },

    load() {
        const saved = storage.load('workContext');
        if (saved) {
            state.context.breadcrumbs = saved.breadcrumbs || [];
            state.context.current = saved.current || null;
            state.context.projectContexts = new Map(saved.projectContexts || []);
        }
    },

    addBreadcrumb(projectId, itemId, itemType, title) {
        const breadcrumbId = `${projectId}-${itemId}-${itemType}`;
        
        state.context.breadcrumbs = state.context.breadcrumbs.filter(b => b.id !== breadcrumbId);
        
        state.context.breadcrumbs.push({
            id: breadcrumbId,
            projectId, itemId, itemType, title,
            timestamp: Date.now()
        });
        
        if (state.context.breadcrumbs.length > 10) {
            state.context.breadcrumbs = state.context.breadcrumbs.slice(-10);
        }
        
        this.renderBreadcrumbs();
        storage.save('breadcrumbs', state.context.breadcrumbs);
    },

    renderBreadcrumbs() {
        const container = $('breadcrumbContainer');
        const trail = $('breadcrumbTrail');
        
        if (state.context.breadcrumbs.length === 0) {
            hide('breadcrumbContainer');
            return;
        }
        
        show('breadcrumbContainer');
        
        const html = state.context.breadcrumbs.map((breadcrumb, index) => {
            const isLast = index === state.context.breadcrumbs.length - 1;
            const project = state.projects.find(p => p.id == breadcrumb.projectId);
            const projectName = project ? project.name : 'Unknown Project';
            
            return `
                <div class="breadcrumb-item ${isLast ? 'current' : ''}" 
                     onclick="contextManager.navigate('${breadcrumb.id}')"
                     title="${projectName} > ${breadcrumb.title}">
                    <span style="color: #a3a3a3; font-size: 10px;">${breadcrumb.itemType.toUpperCase()}</span>
                    <span>${breadcrumb.title}</span>
                </div>
                ${!isLast ? '<div class="breadcrumb-separator">></div>' : ''}
            `;
        }).join('');
        
        trail.innerHTML = html + `
            <button class="breadcrumb-clear" onclick="contextManager.clearBreadcrumbs()" title="Clear trail">Clear</button>
        `;
    },

    navigate(breadcrumbId) {
        const breadcrumb = state.context.breadcrumbs.find(b => b.id === breadcrumbId);
        if (!breadcrumb) return;
        
        const project = state.projects.find(p => p.id == breadcrumb.projectId);
        if (!project) return;
        
        if (!state.currentProject || state.currentProject.id != breadcrumb.projectId) {
            projectManager.switchTo(breadcrumb.projectId, () => {
                setTimeout(() => {
                    this.openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
                }, 200);
            });
        } else {
            this.openItemWithContext(breadcrumb.itemId, breadcrumb.itemType);
        }
    },

    openItemWithContext(itemId, itemType) {
        const item = dataManager.findItem(itemId, itemType);
        if (item) {
            editor.open(item, itemType);
            this.addBreadcrumb(state.currentProject.id, itemId, itemType, item.title);
        }
    },

    clearBreadcrumbs() {
        state.context.breadcrumbs = [];
        this.renderBreadcrumbs();
        storage.save('breadcrumbs', state.context.breadcrumbs);
    }
};

// ===== QUICK ADD MANAGEMENT =====
const quickAdd = {
    brief() {
        if (!state.currentProject) {
            alert('Please select a project first');
            return;
        }
        
        const title = $('briefTitle').value.trim();
        if (!title) return;
        
        const brief = {
            id: utils.generateId(),
            title,
            proposition: '',
            clientBrief: '',
            type: 'brief',
            linkColor: colors.getNextLink(),
            order: 0,
            createdAt: utils.timestamp()
        };
        
        this.addToProject('briefs', brief);
        $('briefTitle').value = '';
        renderer.briefs();
    },

    note() {
        if (!state.currentProject) {
            alert('Please select a project first');
            return;
        }
        
        const title = $('noteTitle').value.trim();
        if (!title) return;
        
        const note = {
            id: utils.generateId(),
            title,
            content: '',
            type: 'note',
            order: 0,
            createdAt: utils.timestamp()
        };
        
        this.addToProject('notes', note);
        $('noteTitle').value = '';
        renderer.notes();
    },

    copy() {
        if (!state.currentProject) {
            alert('Please select a project first');
            return;
        }
        
        const title = $('copyTitle').value.trim();
        if (!title) return;
        
        const copy = {
            id: utils.generateId(),
            title,
            content: '',
            type: 'copy',
            order: 0,
            createdAt: utils.timestamp()
        };
        
        this.addToProject('copy', copy);
        $('copyTitle').value = '';
        renderer.copy();
    },

    task() {
        if (!state.currentProject) {
            alert('Please select a project first');
            return;
        }
        
        const title = $('taskTitle').value.trim();
        if (!title) return;
        
        const task = {
            id: utils.generateId(),
            title,
            content: '',
            type: 'task',
            completed: false,
            order: 0,
            createdAt: utils.timestamp()
        };
        
        this.addToProject('tasks', task);
        $('taskTitle').value = '';
        renderer.projectTasks();
        taskManager.renderHorizontal();
    },

    addToProject(arrayName, item) {
        const array = state.currentProject[arrayName];
        array.forEach(existingItem => {
            if (existingItem.order !== undefined) {
                existingItem.order += 1;
            }
        });
        array.unshift(item);
        dataManager.save();
    }
};

// ===== MODAL MANAGEMENT =====
const modal = {
    open(modalId) {
        show(modalId);
    },

    close(modalId) {
        hide(modalId);
    },

    confirm(title, message, callback, data = null) {
        $('confirmTitle').textContent = title;
        $('confirmMessage').textContent = message;
        show('confirmModal');
        
        window.confirmCallback = callback;
        window.confirmData = data;
    },

    proceedConfirm() {
        hide('confirmModal');
        
        if (window.confirmCallback) {
            window.confirmCallback(window.confirmData);
        }
        
        window.confirmCallback = null;
        window.confirmData = null;
    },

    cancelConfirm() {
        hide('confirmModal');
        window.confirmCallback = null;
        window.confirmData = null;
    }
};

// ===== DELETE MANAGEMENT =====
const deleteManager = {
    init() {
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('delete-btn')) {
                event.stopPropagation();
                event.preventDefault();
                
                const deleteType = event.target.getAttribute('data-delete-type');
                const deleteId = event.target.getAttribute('data-delete-id');
                
                this[deleteType](deleteId);
            }
        });
    },

    brief(briefId) {
        modal.confirm(
            'Delete Brief',
            'Are you sure you want to delete this brief? This will also remove any linked notes, copy, and tasks.',
            (id) => {
                const parsedId = parseInt(id);
                state.currentProject.briefs = state.currentProject.briefs.filter(item => item.id !== parsedId);
                state.currentProject.notes = state.currentProject.notes.filter(note => note.linkedBriefId !== parsedId);
                state.currentProject.copy = state.currentProject.copy.filter(copy => copy.linkedBriefId !== parsedId);
                
                this.removeLinkedTasks('brief', parsedId);
                this.removeFromBreadcrumbs('brief', parsedId);
                
                dataManager.save();
                renderer.briefs();
                renderer.notes();
                renderer.copy();
                renderer.projectTasks();
                taskManager.renderGlobal();
                
                utils.notify('Brief and all linked items deleted successfully');
            },
            briefId
        );
    },

    note(noteId) {
        modal.confirm(
            'Delete Note',
            'Are you sure you want to delete this note? This will also remove any linked tasks.',
            (id) => {
                const parsedId = parseInt(id);
                state.currentProject.notes = state.currentProject.notes.filter(item => item.id !== parsedId);
                
                this.removeLinkedTasks('note', parsedId);
                this.removeFromBreadcrumbs('note', parsedId);
                
                dataManager.save();
                renderer.notes();
                renderer.projectTasks();
                taskManager.renderGlobal();
                
                utils.notify('Note and linked tasks deleted successfully');
            },
            noteId
        );
    },

    copy(copyId) {
        modal.confirm(
            'Delete Copy',
            'Are you sure you want to delete this copy? This will also remove any linked tasks.',
            (id) => {
                const parsedId = parseInt(id);
                state.currentProject.copy = state.currentProject.copy.filter(item => item.id !== parsedId);
                
                this.removeLinkedTasks('copy', parsedId);
                this.removeFromBreadcrumbs('copy', parsedId);
                
                dataManager.save();
                renderer.copy();
                renderer.projectTasks();
                taskManager.renderGlobal();
                
                utils.notify('Copy and linked tasks deleted successfully');
            },
            copyId
        );
    },

    removeLinkedTasks(sourceType, sourceId) {
        state.projects.forEach(project => {
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
        
        dataManager.cleanupGlobalTaskOrder();
    },

    removeFromBreadcrumbs(itemType, itemId) {
        const breadcrumbId = `${state.currentProject.id}-${itemId}-${itemType}`;
        state.context.breadcrumbs = state.context.breadcrumbs.filter(b => b.id !== breadcrumbId);
        storage.save('breadcrumbs', state.context.breadcrumbs);
        contextManager.renderBreadcrumbs();
    }
};

// ===== EVENT LISTENERS =====
const eventManager = {
    init() {
        // Drag and drop setup
        this.setupDragAndDrop();
        
        // Close modals on outside click
        window.onclick = (event) => {
            if (event.target.classList.contains('modal') || event.target.classList.contains('editor-modal')) {
                if (event.target.id === 'confirmModal') {
                    modal.cancelConfirm();
                } else {
                    event.target.style.display = 'none';
                }
            }
        };

        // Keyboard shortcuts
        document.addEventListener('keydown', this.handleKeydown);
        
        // Fullscreen changes
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                const editorModal = $('itemEditor');
                if (editorModal) {
                    editorModal.classList.remove('true-fullscreen', 'fullscreen');
                }
                
                const overlay = $('focusOverlay');
                if (overlay) overlay.remove();
                
                document.body.style.cursor = 'default';
            }
        });

        // Enter key handlers for quick add
        ['briefTitle', 'noteTitle', 'copyTitle', 'taskTitle'].forEach(id => {
            const el = $(id);
            if (el) {
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const type = id.replace('Title', '');
                        quickAdd[type]();
                    }
                });
            }
        });
    },

    setupDragAndDrop() {
        // Add drag listeners to all drop zones
        const dropZones = [
            { id: 'briefsList', type: 'brief' },
            { id: 'notesList', type: 'note' },
            { id: 'copyList', type: 'copy' },
            { id: 'projectTaskContainer', type: 'task' },
            { id: 'topThreeTasks', type: 'top-three' },
            { id: 'otherTasks', type: 'other' },
            { id: 'topTasksRow', type: 'horizontal' }
        ];

        dropZones.forEach(zone => {
            const el = $(zone.id);
            if (el) {
                el.addEventListener('dragover', dragManager.handleOver);
                el.addEventListener('dragleave', dragManager.handleLeave);
                el.addEventListener('drop', (e) => dragManager.handleDrop(e, zone.type));
                el.setAttribute('data-drop-type', zone.type);
            }
        });

        // Add drag listeners to all items (delegated)
        document.addEventListener('dragstart', (e) => {
            if (e.target.draggable) {
                dragManager.handleStart(e);
            }
        });

        document.addEventListener('dragend', (e) => {
            if (e.target.draggable) {
                dragManager.handleEnd(e);
            }
        });
    },

    handleKeydown(e) {
        // ESC key handling
        if (e.key === 'Escape') {
            const confirmModal = $('confirmModal');
            if (confirmModal.style.display === 'block') {
                modal.cancelConfirm();
                return;
            }
            
            const helpModal = $('helpModal');
            if (helpModal && helpModal.style.display === 'block') {
                modal.close('helpModal');
                return;
            }
            
            const editorModal = $('itemEditor');
            if (editorModal && (editorModal.classList.contains('fullscreen') || editorModal.classList.contains('true-fullscreen'))) {
                pomodoro.exitFocus();
                if (state.pomodoro.isRunning) {
                    pomodoro.pause();
                }
                return;
            }
            
            $('.modal, .editor-modal').forEach(modal => {
                modal.style.display = 'none';
            });
        }
        
        // Help shortcuts
        if (e.key === 'F1' || (e.key === '?' && e.ctrlKey)) {
            e.preventDefault();
            modal.open('helpModal');
            return;
        }
        
        // Confirm modal enter
        if (e.key === 'Enter') {
            const confirmModal = $('confirmModal');
            if (confirmModal.style.display === 'block') {
                modal.proceedConfirm();
                return;
            }
        }
        
        // Save shortcut
        if (e.key === 's' && e.ctrlKey) {
            e.preventDefault();
            if ($('itemEditor').style.display === 'block') {
                autosave.save();
                utils.notify('Work saved with context preserved');
            }
        }
        
        // Pomodoro shortcuts in editor
        if ($('itemEditor').style.display === 'block') {
            const timer = $('pomodoroTimer');
            if (timer && timer.style.display === 'block') {
                const isInEditor = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.contentEditable === 'true';
                
                if (e.code === 'Space' && !isInEditor) {
                    e.preventDefault();
                    if (state.pomodoro.isRunning) {
                        pomodoro.pause();
                    } else {
                        pomodoro.start();
                    }
                }
                
                if (e.key === 'r' && e.ctrlKey) {
                    e.preventDefault();
                    pomodoro.reset();
                }
            }
        }
        
        // Task management shortcuts
        if (e.key === '1' && e.ctrlKey && e.altKey) {
            e.preventDefault();
            const allTasks = dataManager.getAllTasks().filter(task => !task.completed);
            if (allTasks.length > 0) {
                allTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                const mostRecentTask = allTasks[0];
                taskManager.promoteToTopThree(mostRecentTask.projectId, mostRecentTask.id);
            }
        }
    }
};

// ===== INITIALIZATION =====
const app = {
    init() {
        try {
            // Load context and data
            contextManager.load();
            dataManager.load();
            
            // Load global task order
            const savedOrder = storage.load('globalTaskOrder');
            if (savedOrder) {
                state.globalTaskOrder = { topThree: [], other: [], ...savedOrder };
            }
            
            // Initialize systems
            pomodoro.loadState();
            projectManager.updateSelector();
            projectManager.showOverview();
            projectManager.updateSettingsButton();
            deleteManager.init();
            eventManager.init();
            contextManager.renderBreadcrumbs();
            
            // Auto-populate top tasks if empty
            if (state.globalTaskOrder.topThree.length === 0) {
                const allTasks = dataManager.getAllTasks().filter(task => !task.completed);
                allTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                
                const tasksToAdd = allTasks.slice(0, 3);
                tasksToAdd.forEach(task => {
                    const uniqueId = dataManager.createTaskUniqueId(task.projectId, task.id);
                    state.globalTaskOrder.topThree.push(uniqueId);
                });
                
                storage.save('globalTaskOrder', state.globalTaskOrder);
            }
            
            // Setup periodic cleanup
            setInterval(() => {
                dataManager.cleanupOldTasks();
            }, 60 * 60 * 1000);
            
            // Offer work resumption
            setTimeout(() => {
                this.offerWorkResumption();
            }, 2000);
            
        } catch (error) {
            console.error('Initialization error:', error);
            // Fallback
            state.projects = [];
            colors.initLinkIndex();
            storage.save('globalTaskOrder', state.globalTaskOrder);
            projectManager.updateSelector();
            projectManager.showOverview();
            projectManager.updateSettingsButton();
            deleteManager.init();
            eventManager.init();
            contextManager.renderBreadcrumbs();
        }
    },

    offerWorkResumption() {
        const lastContext = state.context.current;
        if (!lastContext || !lastContext.editorState) return;
        
        const timeDiff = Date.now() - lastContext.timestamp;
        if (timeDiff > 24 * 60 * 60 * 1000) return;
        
        const project = state.projects.find(p => p.id == lastContext.projectId);
        if (!project) return;
        
        const item = dataManager.findItem(lastContext.itemId, lastContext.itemType);
        if (!item) return;
        
        this.showResumePanel(lastContext);
    },

    showResumePanel(context) {
        const existing = $('resumePanel');
        if (existing) existing.remove();
        
        const panel = document.createElement('div');
        panel.id = 'resumePanel';
        panel.className = 'resume-panel';
        
        const timeAgo = this.getTimeAgo(context.timestamp);
        const project = state.projects.find(p => p.id == context.projectId);
        
        panel.innerHTML = `
            <h4>Resume Work</h4>
            <p>Continue working on <strong>${context.title}</strong> in ${project?.name || 'Unknown Project'}<br>
            <small>Last worked on ${timeAgo}</small></p>
            <div class="resume-panel-actions">
                <button onclick="app.dismissResumePanel()" class="btn-secondary">Dismiss</button>
                <button onclick="app.resumeWork('${context.projectId}', '${context.itemId}', '${context.itemType}')">Resume</button>
            </div>
        `;
        
        document.body.appendChild(panel);
        setTimeout(() => panel.classList.add('show'), 100);
        setTimeout(() => this.dismissResumePanel(), 10000);
    },

    dismissResumePanel() {
        const panel = $('resumePanel');
        if (panel) {
            panel.classList.remove('show');
            setTimeout(() => panel.remove(), 300);
        }
    },

    resumeWork(projectId, itemId, itemType) {
        this.dismissResumePanel();
        
        const context = state.context.current;
        if (!context || context.projectId != projectId || context.itemId != itemId) return;
        
        if (!state.currentProject || state.currentProject.id != projectId) {
            projectManager.switchTo(projectId, () => {
                setTimeout(() => contextManager.restore(context), 200);
            });
        } else {
            contextManager.restore(context);
        }
    },

    getTimeAgo(timestamp) {
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
};

// ===== GLOBAL FUNCTION EXPORTS =====
// Make all functions globally accessible for HTML onclick handlers
window.projectManager = projectManager;
window.taskManager = taskManager;
window.editor = editor;
window.modal = modal;
window.pomodoro = pomodoro;
window.quickAdd = quickAdd;
window.contextManager = contextManager;
window.app = app;
window.dataManager = dataManager;
window.renderer = renderer;

// Legacy compatibility functions
window.openProjectModal = () => modal.open('projectModal');
window.closeModal = modal.close;
window.showHelp = () => modal.open('helpModal');
window.closeEditor = editor.close;
window.showProjectOverview = projectManager.showOverview;
window.toggleArchivedProjects = () => {
    state.showArchived = !state.showArchived;
    const button = $('archiveToggle');
    if (button) {
        button.innerHTML = state.showArchived ? 'Hide Archived' : 'Show Archived';
    }
    renderer.overview();
};
window.selectProject = projectManager.switchTo;
window.switchProject = () => {
    const projectId = $('projectSelect').value;
    if (projectId) {
        projectManager.switchTo(projectId);
    } else {
        projectManager.showOverview();
    }
};
window.createProject = projectManager.create;
window.addQuickBrief = quickAdd.brief;
window.addQuickNote = quickAdd.note;
window.addQuickCopy = quickAdd.copy;
window.addQuickTask = quickAdd.task;
window.handleEnterKey = (event, type) => {
    if (event.key === 'Enter') quickAdd[type]();
};
window.openItemEditor = editor.open;
window.findItem = dataManager.findItem;
window.formatRichText = editor.formatRichText;
window.createLink = editor.createLink;
window.copyContentToClipboard = editor.copyToClipboard;
window.insertStandardHeadings = editor.insertHeadings;
window.openProjectSettings = projectManager.openSettings;
window.saveProjectSettings = projectManager.saveSettings;
window.exitFocusMode = pomodoro.exitFocus;
window.toggleArchiveProject = projectManager.toggleArchive;
window.proceedConfirm = modal.proceedConfirm;
window.cancelConfirm = modal.cancelConfirm;
window.startPomodoro = pomodoro.start;
window.pausePomodoro = pomodoro.pause;
window.resetPomodoro = pomodoro.reset;
window.skipPomodoro = pomodoro.skip;

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', app.init);
