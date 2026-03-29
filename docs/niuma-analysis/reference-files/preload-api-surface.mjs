import { ipcRenderer, contextBridge, webUtils } from "electron";
const api = {
  // Dialog APIs
  dialog: {
    openDirectory: (defaultPath) => ipcRenderer.invoke("dialog:openDirectory", defaultPath),
    openFiles: (options) => ipcRenderer.invoke("dialog:openFiles", options),
    showSaveDialog: (options) => ipcRenderer.invoke("dialog:showSaveDialog", options)
  },
  // Storage APIs
  storage: {
    readFile: (filePath) => ipcRenderer.invoke("storage:readFile", filePath),
    readFileBase64: (filePath) => ipcRenderer.invoke("storage:readFileBase64", filePath),
    writeFile: (filePath, content) => ipcRenderer.invoke("storage:writeFile", filePath, content),
    copyFile: (src, dest) => ipcRenderer.invoke("storage:copyFile", src, dest),
    copyPath: (src, dest) => ipcRenderer.invoke("storage:copyPath", src, dest),
    exists: (filePath) => ipcRenderer.invoke("storage:exists", filePath),
    findFile: (rootDir, fileName) => ipcRenderer.invoke("storage:findFile", rootDir, fileName),
    listDir: (dirPath) => ipcRenderer.invoke("storage:listDir", dirPath),
    listFilesRecursive: (dirPath) => ipcRenderer.invoke("storage:listFilesRecursive", dirPath),
    deleteFile: (filePath) => ipcRenderer.invoke("storage:deleteFile", filePath),
    deleteDirectory: (dirPath) => ipcRenderer.invoke("storage:deleteDirectory", dirPath),
    rename: (oldPath, newPath) => ipcRenderer.invoke("storage:rename", oldPath, newPath),
    createDirectory: (dirPath) => ipcRenderer.invoke("storage:createDirectory", dirPath),
    searchFiles: (dirPath, query) => ipcRenderer.invoke("storage:searchFiles", dirPath, query),
    searchContent: (dirPath, query, options) => ipcRenderer.invoke("storage:searchContent", dirPath, query, options),
    searchContentAbort: (abortId) => ipcRenderer.invoke("storage:searchContentAbort", abortId)
  },
  // Export APIs
  export: {
    htmlToPDF: (html) => ipcRenderer.invoke("export:htmlToPDF", html),
    htmlToImage: (html, opts) => ipcRenderer.invoke("export:htmlToImage", html, opts),
    htmlToDocx: (html) => ipcRenderer.invoke("export:htmlToDocx", html),
    saveBuffer: (filePath, base64Data) => ipcRenderer.invoke("export:saveBuffer", filePath, base64Data)
  },
  // File watcher APIs
  fileWatcher: {
    watch: (dirPath) => ipcRenderer.invoke("file-watcher:watch", dirPath),
    unwatch: () => ipcRenderer.invoke("file-watcher:unwatch"),
    onFileChanged: (callback) => {
      const handler = (_, filePath) => callback(filePath);
      ipcRenderer.on("file-watcher:file-changed", handler);
      return () => {
        ipcRenderer.removeListener("file-watcher:file-changed", handler);
      };
    },
    onDirChanged: (callback) => {
      const handler = (_, dirPath) => callback(dirPath);
      ipcRenderer.on("file-watcher:dir-changed", handler);
      return () => {
        ipcRenderer.removeListener("file-watcher:dir-changed", handler);
      };
    }
  },
  // App APIs
  app: {
    getPath: (name) => ipcRenderer.invoke("app:getPath", name),
    getDefaultWorkspace: () => ipcRenderer.invoke("app:getDefaultWorkspace"),
    openWorkspaceFolder: (workspacePath) => ipcRenderer.invoke("app:openWorkspaceFolder", workspacePath),
    openLogFolder: () => ipcRenderer.invoke("app:openLogFolder")
  },
  // Window APIs
  window: {
    resizeBy: (deltaWidth, deltaHeight) => ipcRenderer.invoke("window:resizeBy", deltaWidth, deltaHeight)
  },
  // Agent APIs
  agent: {
    query: (params) => ipcRenderer.invoke("agent:query", params),
    cancel: (conversationId) => ipcRenderer.invoke("agent:cancel", conversationId),
    reset: (conversationId) => ipcRenderer.invoke("agent:reset", conversationId),
    onChunk: (callback) => {
      const handler = (_, chunk) => callback(chunk);
      ipcRenderer.on("agent:chunk", handler);
      return () => ipcRenderer.removeListener("agent:chunk", handler);
    },
    onStreamingState: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("conversation:streamingState", handler);
      return () => ipcRenderer.removeListener("conversation:streamingState", handler);
    },
    onAskUser: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("agent:ask-user", handler);
      return () => ipcRenderer.removeListener("agent:ask-user", handler);
    },
    onFailover: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("agent:failover", handler);
      return () => ipcRenderer.removeListener("agent:failover", handler);
    },
    respondToAskUser: (params) => ipcRenderer.invoke("agent:ask-user-response", params),
    dismissAskUser: (params) => ipcRenderer.invoke("agent:ask-user-dismiss", params)
  },
  // Skills APIs
  skills: {
    load: (workspacePath) => ipcRenderer.invoke("skills:load", workspacePath),
    get: () => ipcRenderer.invoke("skills:get"),
    installZip: (zipPath) => ipcRenderer.invoke("skills:installZip", zipPath),
    installFolder: (folderPath) => ipcRenderer.invoke("skills:installFolder", folderPath)
  },
  // MCP APIs
  mcp: {
    load: (workspacePath) => ipcRenderer.invoke("mcp:load", workspacePath),
    get: () => ipcRenderer.invoke("mcp:get"),
    save: (config) => ipcRenderer.invoke("mcp:save", config),
    checkInstalled: (packageName) => ipcRenderer.invoke("mcp:checkInstalled", packageName),
    install: (packageName) => ipcRenderer.invoke("mcp:install", packageName),
    onConfigUpdated: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("mcp:config-updated", handler);
      return () => ipcRenderer.removeListener("mcp:config-updated", handler);
    },
    onInstallProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on("mcp:installProgress", handler);
      return () => ipcRenderer.removeListener("mcp:installProgress", handler);
    }
  },
  // IM Bot Gateway APIs
  im: {
    getConfig: () => ipcRenderer.invoke("im:config:get"),
    setConfig: (platform, config) => ipcRenderer.invoke("im:config:set", platform, config),
    getStatus: () => ipcRenderer.invoke("im:status:get"),
    startGateway: (platform) => ipcRenderer.invoke("im:gateway:start", platform),
    stopGateway: (platform) => ipcRenderer.invoke("im:gateway:stop", platform),
    testGateway: (platform) => ipcRenderer.invoke("im:gateway:test", platform),
    listSessions: (platform) => ipcRenderer.invoke("im:sessions:list", platform),
    setActiveWorkspace: (workspaceId) => ipcRenderer.invoke("im:setActiveWorkspace", workspaceId),
    onStatusChanged: (callback) => {
      const handler = (_, status) => callback(status);
      ipcRenderer.on("im:statusChanged", handler);
      return () => ipcRenderer.removeListener("im:statusChanged", handler);
    },
    onConversationUpdated: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("im:conversationUpdated", handler);
      return () => ipcRenderer.removeListener("im:conversationUpdated", handler);
    }
  },
  // Workspace APIs
  workspaces: {
    list: () => ipcRenderer.invoke("workspaces:list"),
    save: (ws) => ipcRenderer.invoke("workspaces:save", ws),
    delete: (id) => ipcRenderer.invoke("workspaces:delete", id),
    findByPath: (path) => ipcRenderer.invoke("workspaces:findByPath", path),
    reassociateByPath: (targetWorkspaceId, path) => ipcRenderer.invoke("workspaces:reassociateByPath", targetWorkspaceId, path)
  },
  // Conversation APIs
  conversations: {
    list: (workspaceId, limit, offset) => ipcRenderer.invoke("conversations:list", workspaceId, limit, offset),
    search: (workspaceId, query) => ipcRenderer.invoke("conversations:search", workspaceId, query),
    get: (id) => ipcRenderer.invoke("conversations:get", id),
    create: (params) => ipcRenderer.invoke("conversations:create", params),
    delete: (id) => ipcRenderer.invoke("conversations:delete", id),
    updateTitle: (id, newTitle) => ipcRenderer.invoke("conversations:updateTitle", id, newTitle),
    saveMessage: (params) => ipcRenderer.invoke("conversations:saveMessage", params),
    setFavorited: (id, favorited) => ipcRenderer.invoke("conversations:setFavorited", id, favorited),
    setArchived: (id, archived) => ipcRenderer.invoke("conversations:setArchived", id, archived),
    listArchived: (workspaceId) => ipcRenderer.invoke("conversations:listArchived", workspaceId)
  },
  // Claude Code APIs
  claudeCode: {
    isInstalled: () => ipcRenderer.invoke("claudeCode:isInstalled"),
    getVersion: () => ipcRenderer.invoke("claudeCode:getVersion"),
    install: () => ipcRenderer.invoke("claudeCode:install"),
    installFromMirror: () => ipcRenderer.invoke("claudeCode:installFromMirror"),
    checkAuth: () => ipcRenderer.invoke("claudeCode:checkAuth"),
    loginInTerminal: () => ipcRenderer.invoke("claudeCode:loginInTerminal"),
    openInTerminal: (workspacePath) => ipcRenderer.invoke("claudeCode:openInTerminal", workspacePath),
    onInstallProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on("claudeCode:installProgress", handler);
      return () => ipcRenderer.removeListener("claudeCode:installProgress", handler);
    },
    getSupportedModels: () => ipcRenderer.invoke("claudeCode:getSupportedModels"),
    syncHistory: (params) => ipcRenderer.invoke("claudeCode:syncHistory", params),
    getHistoryStatus: (params) => ipcRenderer.invoke("claudeCode:getHistoryStatus", params),
    diagnose: () => ipcRenderer.invoke("claudeCode:diagnose"),
    setCustomPath: (path) => ipcRenderer.invoke("claudeCode:setCustomPath", path)
  },
  // Git Bash APIs (Windows)
  gitBash: {
    detect: () => ipcRenderer.invoke("gitBash:detect"),
    install: () => ipcRenderer.invoke("gitBash:install"),
    onInstallProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on("gitBash:installProgress", handler);
      return () => ipcRenderer.removeListener("gitBash:installProgress", handler);
    },
    onAutoInstalled: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("gitBash:autoInstalled", handler);
      return () => ipcRenderer.removeListener("gitBash:autoInstalled", handler);
    }
  },
  settings: {
    sync: (settings) => ipcRenderer.invoke("settings:sync", settings),
    load: () => ipcRenderer.invoke("settings:load"),
    testProvider: (provider, modelOverride) => ipcRenderer.invoke("provider:test", provider, modelOverride)
  },
  startup: {
    getSnapshot: async () => {
      const base = await ipcRenderer.invoke("startup:getSnapshot");
      let gateCache = {
        exists: false,
        isValid: false,
        value: null
      };
      try {
        const raw = window.localStorage.getItem("claudeCode:gateCache");
        if (raw) {
          const parsed = JSON.parse(raw);
          gateCache = {
            exists: true,
            isValid: parsed.status === "installed" && parsed.authStatus === "authenticated",
            value: parsed
          };
        }
      } catch {
        gateCache = {
          exists: true,
          isValid: false,
          value: null
        };
      }
      return {
        ...base ?? {},
        claudeCodeGateCache: gateCache
      };
    }
  },
  // Auth APIs
  auth: {
    login: () => ipcRenderer.invoke("auth:login"),
    logout: () => ipcRenderer.invoke("auth:logout"),
    getUser: () => ipcRenderer.invoke("auth:getUser"),
    getToken: () => ipcRenderer.invoke("auth:getToken"),
    handleCallback: (params) => ipcRenderer.invoke("auth:handleCallback", params),
    onCallback: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("auth:callback", handler);
      return () => ipcRenderer.removeListener("auth:callback", handler);
    },
    onStateChanged: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("auth:state-changed", handler);
      return () => ipcRenderer.removeListener("auth:state-changed", handler);
    },
    onCallbackError: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("auth:callback-error", handler);
      return () => ipcRenderer.removeListener("auth:callback-error", handler);
    },
    updateProfile: (updates) => ipcRenderer.invoke("auth:updateProfile", updates)
  },
  // WeChat Publish APIs
  wechatPublish: {
    login: () => ipcRenderer.invoke("wechatPublish:login"),
    logout: () => ipcRenderer.invoke("wechatPublish:logout"),
    getUser: () => ipcRenderer.invoke("wechatPublish:getUser"),
    getToken: () => ipcRenderer.invoke("wechatPublish:getToken"),
    isAuthenticated: () => ipcRenderer.invoke("wechatPublish:isAuthenticated"),
    getAccounts: () => ipcRenderer.invoke("wechatPublish:getAccounts"),
    publish: (data) => ipcRenderer.invoke("wechatPublish:publish", data),
    publishNewspic: (data) => ipcRenderer.invoke("wechatPublish:publishNewspic", data),
    onStateChanged: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("wechatPublish:state-changed", handler);
      return () => ipcRenderer.removeListener("wechatPublish:state-changed", handler);
    }
  },
  // Xiaohongshu Publish APIs
  xhsPublish: {
    publish: (data) => ipcRenderer.invoke("xhsPublish:publish", data)
  },
  // Shell APIs
  shell: {
    openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
  },
  // File APIs
  file: {
    getDefaultApp: (filePath) => ipcRenderer.invoke("file:getDefaultApp", filePath),
    openInDefaultApp: (filePath) => ipcRenderer.invoke("file:openInDefaultApp", filePath),
    showInFolder: (filePath) => ipcRenderer.invoke("file:showInFolder", filePath),
    moveToTrash: (filePath) => ipcRenderer.invoke("file:moveToTrash", filePath),
    getPathForFile: (file) => webUtils.getPathForFile(file)
  },
  // Image Upload APIs
  image: {
    upload: (data, filename, mimeType) => ipcRenderer.invoke("image:upload", data, filename, mimeType),
    uploadFromPath: (filePath) => ipcRenderer.invoke("image:uploadFromPath", filePath)
  },
  // Webview APIs (用于处理 webview 内部的链接)
  webview: {
    onOpenUrl: (callback) => {
      const handler = (_, url) => callback(url);
      ipcRenderer.on("webview:open-url", handler);
      return () => ipcRenderer.removeListener("webview:open-url", handler);
    }
  },
  // Auto Update APIs
  autoUpdate: {
    check: () => ipcRenderer.invoke("autoUpdate:check"),
    getVersion: () => ipcRenderer.invoke("autoUpdate:getVersion"),
    onStatus: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("autoUpdate:status", handler);
      return () => ipcRenderer.removeListener("autoUpdate:status", handler);
    },
    // Progress events are no longer used (manual download mode)
    onProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("autoUpdate:progress", handler);
      return () => ipcRenderer.removeListener("autoUpdate:progress", handler);
    },
    // Dev-only: simulate update status events for testing UI
    ...process.env.NODE_ENV !== "production" ? {
      __devTrigger: (data) => {
        ipcRenderer.emit("autoUpdate:status", {}, data);
      }
    } : {}
  },
  // Releases API (changelog for What's New dialog)
  releases: {
    getChangelog: (fromVersion) => ipcRenderer.invoke("releases:changelog", fromVersion)
  },
  // Model Gateway APIs
  modelGateway: {
    getStatus: () => ipcRenderer.invoke("modelGateway:getStatus"),
    sync: () => ipcRenderer.invoke("modelGateway:sync"),
    onStatusChanged: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("modelGateway:statusChanged", handler);
      return () => ipcRenderer.removeListener("modelGateway:statusChanged", handler);
    }
  },
  // Usage Statistics APIs
  usageStats: {
    getSummary: (startDate, endDate) => ipcRenderer.invoke("usage:getSummary", startDate, endDate),
    getProviderStats: (startDate, endDate) => ipcRenderer.invoke("usage:getProviderStats", startDate, endDate),
    getModelStats: (startDate, endDate) => ipcRenderer.invoke("usage:getModelStats", startDate, endDate),
    getRequestLogs: (filters, page, pageSize) => ipcRenderer.invoke("usage:getRequestLogs", filters, page, pageSize),
    getRequestDetail: (requestId) => ipcRenderer.invoke("usage:getRequestDetail", requestId),
    getModelPricing: () => ipcRenderer.invoke("usage:getModelPricing"),
    updateModelPricing: (data) => ipcRenderer.invoke("usage:updateModelPricing", data),
    deleteModelPricing: (modelId) => ipcRenderer.invoke("usage:deleteModelPricing", modelId),
    clearLogs: (beforeTimestamp) => ipcRenderer.invoke("usage:clearLogs", beforeTimestamp),
    // Tool call stats
    logToolCall: (params) => ipcRenderer.invoke("usage:logToolCall", params),
    getToolCallSummary: (filters) => ipcRenderer.invoke("usage:getToolCallSummary", filters),
    getToolCallsByName: (filters) => ipcRenderer.invoke("usage:getToolCallsByName", filters),
    getToolCallsByModel: (startDate, endDate) => ipcRenderer.invoke("usage:getToolCallsByModel", startDate, endDate),
    getToolCallsByProvider: (startDate, endDate) => ipcRenderer.invoke("usage:getToolCallsByProvider", startDate, endDate),
    getToolCallErrors: (filters, page, pageSize) => ipcRenderer.invoke("usage:getToolCallErrors", filters, page, pageSize),
    clearToolCallLogs: (beforeTimestamp) => ipcRenderer.invoke("usage:clearToolCallLogs", beforeTimestamp)
  },
  // Claude Proxy APIs
  claudeProxy: {
    getStatus: () => ipcRenderer.invoke("claudeProxy:getStatus"),
    getHealth: () => ipcRenderer.invoke("claudeProxy:getHealth"),
    resetHealth: (providerId) => ipcRenderer.invoke("claudeProxy:resetHealth", providerId),
    resetAllHealth: () => ipcRenderer.invoke("claudeProxy:resetAllHealth"),
    onStatusChanged: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("claudeProxy:statusChanged", handler);
      return () => ipcRenderer.removeListener("claudeProxy:statusChanged", handler);
    },
    onFailover: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("claudeProxy:failover", handler);
      return () => ipcRenderer.removeListener("claudeProxy:failover", handler);
    },
    onProviderSwitched: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("claudeProxy:providerSwitched", handler);
      return () => ipcRenderer.removeListener("claudeProxy:providerSwitched", handler);
    },
    onError: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("claudeProxy:error", handler);
      return () => ipcRenderer.removeListener("claudeProxy:error", handler);
    }
  },
  // Notification APIs
  notification: {
    onClick: (callback) => {
      const handler = (_, conversationId) => callback(conversationId);
      ipcRenderer.on("notification:click", handler);
      return () => ipcRenderer.removeListener("notification:click", handler);
    }
  },
  // Quick window APIs
  quickWindow: {
    showMain: (conversationId) => ipcRenderer.invoke("quickWindow:showMain", conversationId),
    submitAndShow: (params) => ipcRenderer.invoke("quickWindow:submitAndShow", params),
    hide: () => ipcRenderer.invoke("quickWindow:hide"),
    setHeight: (height) => ipcRenderer.invoke("quickWindow:setHeight", height),
    setIgnoreMouseEvents: (ignore, opts) => ipcRenderer.invoke("quickWindow:setIgnoreMouseEvents", ignore, opts),
    onShow: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("quickWindow:show", handler);
      return () => ipcRenderer.removeListener("quickWindow:show", handler);
    },
    onPendingQuery: (callback) => {
      const handler = (_, params) => callback(params);
      ipcRenderer.on("quickWindow:pendingQuery", handler);
      return () => ipcRenderer.removeListener("quickWindow:pendingQuery", handler);
    }
  },
  // Shared Skills APIs
  sharedSkills: {
    submit: (data) => ipcRenderer.invoke("sharedSkills:submit", data),
    list: (status) => ipcRenderer.invoke("sharedSkills:list", status),
    update: (id, updates) => ipcRenderer.invoke("sharedSkills:update", id, updates),
    delete: (id) => ipcRenderer.invoke("sharedSkills:delete", id),
    resubmit: (id) => ipcRenderer.invoke("sharedSkills:resubmit", id)
  },
  // Skill Market APIs
  skillMarket: {
    list: () => ipcRenderer.invoke("skillMarket:list"),
    listPublished: () => ipcRenderer.invoke("skillMarket:listPublished"),
    getInstalled: () => ipcRenderer.invoke("skillMarket:getInstalled"),
    getUninstalled: () => ipcRenderer.invoke("skillMarket:getUninstalled"),
    getSkillReferences: (skillName) => ipcRenderer.invoke("skillMarket:getSkillReferences", skillName),
    install: (params) => ipcRenderer.invoke("skillMarket:install", params),
    installShared: (params) => ipcRenderer.invoke("skillMarket:installShared", params),
    uninstall: (name) => ipcRenderer.invoke("skillMarket:uninstall", name),
    getSkillContent: (folder) => ipcRenderer.invoke("skillMarket:getSkillContent", folder),
    getSharedSkillContent: (skillFileUrl) => ipcRenderer.invoke("skillMarket:getSharedSkillContent", skillFileUrl)
  },
  // Home Scenario APIs
  scenarios: {
    getAll: () => ipcRenderer.invoke("scenarios:getAll"),
    syncRemote: () => ipcRenderer.invoke("scenarios:syncRemote"),
    setPrefs: (prefs) => ipcRenderer.invoke("scenarios:setPrefs", prefs),
    addCustom: (scenario) => ipcRenderer.invoke("scenarios:addCustom", scenario),
    updateCustom: (scenario) => ipcRenderer.invoke("scenarios:updateCustom", scenario),
    removeCustom: (scenarioId) => ipcRenderer.invoke("scenarios:removeCustom", scenarioId),
    resetPrefs: () => ipcRenderer.invoke("scenarios:resetPrefs")
  },
  // Project APIs
  projects: {
    list: (workspaceId) => ipcRenderer.invoke("projects:list", workspaceId),
    get: (id) => ipcRenderer.invoke("projects:get", id),
    create: (input) => ipcRenderer.invoke("projects:create", input),
    update: (id, updates) => ipcRenderer.invoke("projects:update", id, updates),
    delete: (id) => ipcRenderer.invoke("projects:delete", id),
    archive: (id) => ipcRenderer.invoke("projects:archive", id),
    unarchive: (id) => ipcRenderer.invoke("projects:unarchive", id),
    listArchived: (workspaceId) => ipcRenderer.invoke("projects:listArchived", workspaceId),
    updatePlanDocument: (id, content) => ipcRenderer.invoke("projects:updatePlanDocument", id, content)
  },
  // Project Template APIs
  projectTemplates: {
    list: () => ipcRenderer.invoke("projectTemplates:list")
  },
  // Project Task APIs
  projectTasks: {
    list: (projectId) => ipcRenderer.invoke("projectTasks:list", projectId),
    get: (id) => ipcRenderer.invoke("projectTasks:get", id),
    create: (input) => ipcRenderer.invoke("projectTasks:create", input),
    createBatch: (projectId, tasks) => ipcRenderer.invoke("projectTasks:createBatch", projectId, tasks),
    update: (id, updates) => ipcRenderer.invoke("projectTasks:update", id, updates),
    move: (id, status) => ipcRenderer.invoke("projectTasks:move", id, status),
    delete: (id) => ipcRenderer.invoke("projectTasks:delete", id),
    execute: (taskId) => ipcRenderer.invoke("projectTasks:execute", taskId),
    cancelExecution: (taskId) => ipcRenderer.invoke("projectTasks:cancelExecution", taskId),
    getExecutionState: (taskId) => ipcRenderer.invoke("projectTasks:getExecutionState", taskId)
  },
  // Task Dependency APIs
  taskDependencies: {
    list: (projectId) => ipcRenderer.invoke("taskDependencies:list", projectId),
    add: (taskId, dependsOnTaskId) => ipcRenderer.invoke("taskDependencies:add", taskId, dependsOnTaskId),
    remove: (taskId, dependsOnTaskId) => ipcRenderer.invoke("taskDependencies:remove", taskId, dependsOnTaskId)
  },
  // Task Execution APIs
  taskExecutions: {
    list: (taskId) => ipcRenderer.invoke("taskExecutions:list", taskId),
    get: (id) => ipcRenderer.invoke("taskExecutions:get", id)
  },
  // Project Conversations APIs
  projectConversations: {
    create: (params) => ipcRenderer.invoke("projectConversations:create", params),
    list: (projectId) => ipcRenderer.invoke("projectConversations:list", projectId)
  },
  // Project Settings APIs
  projectSettings: {
    get: (projectId) => ipcRenderer.invoke("projectSettings:get", projectId),
    update: (projectId, updates) => ipcRenderer.invoke("projectSettings:update", projectId, updates)
  },
  // Notification Channels APIs
  notificationChannels: {
    list: () => ipcRenderer.invoke("notificationChannels:list"),
    create: (input) => ipcRenderer.invoke("notificationChannels:create", input),
    update: (id, updates) => ipcRenderer.invoke("notificationChannels:update", id, updates),
    delete: (id) => ipcRenderer.invoke("notificationChannels:delete", id)
  },
  // Project Conversion Events
  projectConvert: {
    onConverted: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("project:converted", handler);
      return () => ipcRenderer.removeListener("project:converted", handler);
    },
    migrateFiles: (projectId, workspacePath, files) => ipcRenderer.invoke("project:migrateFiles", { projectId, workspacePath, files })
  },
  // Project Plan Events
  projectPlan: {
    onUpdated: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("projectPlan:updated", handler);
      return () => ipcRenderer.removeListener("projectPlan:updated", handler);
    }
  },
  // Project Execution Events
  projectExecution: {
    onStarted: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("projectExecution:started", handler);
      return () => ipcRenderer.removeListener("projectExecution:started", handler);
    },
    onProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("projectExecution:progress", handler);
      return () => ipcRenderer.removeListener("projectExecution:progress", handler);
    },
    onCompleted: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("projectExecution:completed", handler);
      return () => ipcRenderer.removeListener("projectExecution:completed", handler);
    }
  },
  // Scheduled Tasks APIs
  scheduledTasks: {
    list: (workspaceId) => ipcRenderer.invoke("scheduledTasks:list", workspaceId),
    get: (id) => ipcRenderer.invoke("scheduledTasks:get", id),
    create: (params) => ipcRenderer.invoke("scheduledTasks:create", params),
    update: (id, params) => ipcRenderer.invoke("scheduledTasks:update", id, params),
    delete: (id) => ipcRenderer.invoke("scheduledTasks:delete", id),
    toggle: (id) => ipcRenderer.invoke("scheduledTasks:toggle", id),
    trigger: (id) => ipcRenderer.invoke("scheduledTasks:trigger", id),
    getExecutionState: (taskId) => ipcRenderer.invoke("scheduledTasks:getExecutionState", taskId),
    updateWorkspaces: (workspaces) => ipcRenderer.invoke("scheduledTasks:updateWorkspaces", workspaces),
    // Event listeners
    onChanged: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("scheduledTasks:changed", handler);
      return () => ipcRenderer.removeListener("scheduledTasks:changed", handler);
    },
    onExecutionStarted: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("scheduledTasks:executionStarted", handler);
      return () => ipcRenderer.removeListener("scheduledTasks:executionStarted", handler);
    },
    onExecutionProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("scheduledTasks:executionProgress", handler);
      return () => ipcRenderer.removeListener("scheduledTasks:executionProgress", handler);
    },
    onExecutionCompleted: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("scheduledTasks:executionCompleted", handler);
      return () => ipcRenderer.removeListener("scheduledTasks:executionCompleted", handler);
    }
  },
  // AI Insights APIs
  insights: {
    listReports: (limit) => ipcRenderer.invoke("insights:listReports", limit),
    syncWorkspaces: (workspaces) => ipcRenderer.invoke("insights:syncWorkspaces", workspaces),
    generate: (options) => ipcRenderer.invoke("insights:generate", options),
    onGenerated: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on("insights:generated", handler);
      return () => ipcRenderer.removeListener("insights:generated", handler);
    }
  },
  // Terminal APIs
  terminal: {
    create: (params) => ipcRenderer.invoke("terminal:create", params),
    write: (sessionId, data) => ipcRenderer.send("terminal:write", sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send("terminal:resize", sessionId, cols, rows),
    kill: (sessionId) => ipcRenderer.invoke("terminal:kill", sessionId),
    exists: (sessionId) => ipcRenderer.invoke("terminal:exists", sessionId),
    list: () => ipcRenderer.invoke("terminal:list"),
    getBuffer: (sessionId) => ipcRenderer.invoke("terminal:getBuffer", sessionId),
    onData: (callback) => {
      const handler = (_, sessionId, data) => callback(sessionId, data);
      ipcRenderer.on("terminal:data", handler);
      return () => ipcRenderer.removeListener("terminal:data", handler);
    },
    onExit: (callback) => {
      const handler = (_, sessionId, exitCode) => callback(sessionId, exitCode);
      ipcRenderer.on("terminal:exit", handler);
      return () => ipcRenderer.removeListener("terminal:exit", handler);
    }
  },
  // Data Management APIs
  data: {
    export: (params) => ipcRenderer.invoke("data:export", params),
    import: (params) => ipcRenderer.invoke("data:import", params),
    backup: (params) => ipcRenderer.invoke("data:backup", params),
    listBackups: (params) => ipcRenderer.invoke("data:listBackups", params),
    restore: (params) => ipcRenderer.invoke("data:restore", params),
    storageStats: () => ipcRenderer.invoke("data:storageStats"),
    cleanConversations: (params) => ipcRenderer.invoke("data:cleanConversations", params)
  },
  // SQLite Preview APIs
  find: {
    findInPage: (text, options) => ipcRenderer.invoke("find:findInPage", text, options),
    stopFindInPage: (action) => ipcRenderer.invoke("find:stopFindInPage", action),
    onResult: (callback) => {
      const handler = (_, result) => callback(result);
      ipcRenderer.on("find:result", handler);
      return () => ipcRenderer.removeListener("find:result", handler);
    }
  },
  // Voice Model APIs
  voiceModel: {
    getStatus: () => ipcRenderer.invoke("voiceModel:getStatus"),
    download: () => ipcRenderer.invoke("voiceModel:download"),
    cancelDownload: () => ipcRenderer.invoke("voiceModel:cancelDownload"),
    delete: () => ipcRenderer.invoke("voiceModel:delete"),
    transcribe: (params) => ipcRenderer.invoke("voiceModel:transcribe", params),
    saveRecording: (params) => ipcRenderer.invoke("voiceModel:saveRecording", params),
    requestMicPermission: () => ipcRenderer.invoke("voiceModel:requestMicPermission"),
    openMicSettings: () => ipcRenderer.invoke("voiceModel:openMicSettings"),
    onDownloadProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on("voiceModel:downloadProgress", handler);
      return () => ipcRenderer.removeListener("voiceModel:downloadProgress", handler);
    },
    onStartRecording: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("voice:startRecording", handler);
      return () => ipcRenderer.removeListener("voice:startRecording", handler);
    },
    onStopRecording: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("voice:stopRecording", handler);
      return () => ipcRenderer.removeListener("voice:stopRecording", handler);
    },
    onCancelRecording: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("voice:cancelRecording", handler);
      return () => ipcRenderer.removeListener("voice:cancelRecording", handler);
    },
    notifyTranscriptionDone: () => {
      ipcRenderer.send("voice:transcriptionDone");
    },
    isExternalMode: () => {
      return ipcRenderer.invoke("voice:isExternalMode");
    },
    pasteTranscription: (text) => {
      return ipcRenderer.invoke("voice:pasteTranscription", text);
    }
  },
  // Voice indicator floating window API
  voiceIndicator: {
    onStateChanged: (callback) => {
      const handler = (_, state, duration) => callback(state, duration);
      ipcRenderer.on("voiceIndicator:stateChanged", handler);
      return () => ipcRenderer.removeListener("voiceIndicator:stateChanged", handler);
    }
  },
  // Transcription History APIs
  transcriptions: {
    list: (params) => ipcRenderer.invoke("transcriptions:list", params),
    get: (id) => ipcRenderer.invoke("transcriptions:get", id),
    delete: (id) => ipcRenderer.invoke("transcriptions:delete", id),
    deleteAll: () => ipcRenderer.invoke("transcriptions:deleteAll")
  },
  // Meeting Minutes APIs
  meeting: {
    start: () => ipcRenderer.invoke("meeting:start"),
    appendChunk: (params) => ipcRenderer.invoke("meeting:appendChunk", params),
    finalize: (params) => ipcRenderer.invoke("meeting:finalize", params),
    transcribe: (params) => ipcRenderer.invoke("meeting:transcribe", params),
    saveText: (params) => ipcRenderer.invoke("meeting:saveText", params),
    getMeetingsDir: () => ipcRenderer.invoke("meeting:getMeetingsDir"),
    onTranscribeProgress: (callback) => {
      const handler = (_, progress) => callback(progress);
      ipcRenderer.on("meeting:transcribeProgress", handler);
      return () => ipcRenderer.removeListener("meeting:transcribeProgress", handler);
    }
  },
  // Report APIs
  report: {
    submitCrash: (data) => ipcRenderer.invoke("report:submitCrash", data),
    submitSession: (data) => ipcRenderer.invoke("report:submitSession", data)
  },
  // Feedback APIs
  feedback: {
    submit: (data) => ipcRenderer.invoke("feedback:submit", data),
    captureScreen: () => ipcRenderer.invoke("feedback:captureScreen"),
    list: () => ipcRenderer.invoke("feedback:list"),
    postMessage: (feedbackId, content) => ipcRenderer.invoke("feedback:postMessage", feedbackId, content),
    onBeforeCapture: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("feedback:beforeCapture", handler);
      return () => ipcRenderer.removeListener("feedback:beforeCapture", handler);
    },
    onAfterCapture: (callback) => {
      const handler = () => callback();
      ipcRenderer.on("feedback:afterCapture", handler);
      return () => ipcRenderer.removeListener("feedback:afterCapture", handler);
    }
  },
  // Invitation Code APIs
  invitationCode: {
    checkLocal: () => ipcRenderer.invoke("invitationCode:checkLocal"),
    checkActivation: () => ipcRenderer.invoke("invitationCode:checkActivation"),
    verify: (code) => ipcRenderer.invoke("invitationCode:verify", code),
    getMine: () => ipcRenderer.invoke("invitationCode:getMine"),
    generate: () => ipcRenderer.invoke("invitationCode:generate")
  },
  sqlite: {
    open: (filePath, readonly) => ipcRenderer.invoke("sqlite:open", filePath, readonly),
    getTableData: (filePath, tableName, offset, limit) => ipcRenderer.invoke("sqlite:getTableData", filePath, tableName, offset, limit),
    getSchema: (filePath, tableName) => ipcRenderer.invoke("sqlite:getSchema", filePath, tableName),
    executeQuery: (filePath, sql) => ipcRenderer.invoke("sqlite:executeQuery", filePath, sql),
    close: (filePath) => ipcRenderer.invoke("sqlite:close", filePath)
  }
};
ipcRenderer.on("app:open-settings", (_, tab) => {
  window.dispatchEvent(new CustomEvent("open-settings", { detail: { tab } }));
});
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("newmax", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.newmax = api;
}
