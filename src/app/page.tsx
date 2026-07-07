"use client";

import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Folder,
  ListChecks,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  SquarePen,
  Target,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

const statuses = ["未开始", "进行中", "挂起", "已完成"] as const;
type TaskStatus = (typeof statuses)[number];
const sidebarStatuses: TaskStatus[] = ["进行中", "未开始", "已完成", "挂起"];
const priorities = ["P0", "P1", "P2", "P3"] as const;
type TaskPriority = (typeof priorities)[number];

type TodoItem = {
  id: number;
  taskId: number;
  content: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ProgressRecord = {
  id: number;
  taskId: number;
  content: string;
  createdAt: string;
};

type TaskDetail = {
  id: number;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  todos: TodoItem[];
  progressRecords: ProgressRecord[];
};

type TaskListItem = Omit<TaskDetail, "todos" | "progressRecords"> & {
  todoTotal: number;
  todoCompleted: number;
  latestProgress: string | null;
  latestProgressAt: string | null;
};

type TaskCelebration = {
  taskId: number;
  goal: string;
  completedTodos: number;
};

function formatTime(value: string | null) {
  if (!value) {
    return "暂无";
  }

  return value.replace("T", " ").slice(0, 16);
}

function toDateTimeInput(value: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(" ", "T").slice(0, 16);
}

function parseLocalTime(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value.replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getTimeProgress(task: Pick<TaskDetail, "createdAt" | "deadlineAt">) {
  const created = parseLocalTime(task.createdAt);
  const deadline = parseLocalTime(task.deadlineAt);
  const now = Date.now();

  if (!created || !deadline || deadline <= created) {
    return {
      percent: 0,
      label: "未设置 DDL",
      tone: "none"
    };
  }

  const total = deadline - created;
  const elapsed = now - created;
  const remaining = deadline - now;
  const percent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  if (remaining <= 0) {
    return {
      percent: 100,
      label: "已超过 DDL",
      tone: "overdue"
    };
  }

  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  return {
    percent,
    label: hours <= 24 ? `剩余 ${hours} 小时` : `剩余 ${Math.ceil(hours / 24)} 天`,
    tone: hours <= 24 ? "urgent" : "normal"
  };
}

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "请求失败");
  }

  return payload;
}

export default function Home() {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [deadlineDraft, setDeadlineDraft] = useState("");
  const [priorityDraft, setPriorityDraft] = useState<TaskPriority>("P2");
  const [searchQuery, setSearchQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createAdvancedOpen, setCreateAdvancedOpen] = useState(false);
  const [newTaskGoal, setNewTaskGoal] = useState("");
  const [newTaskTodos, setNewTaskTodos] = useState("");
  const [newTaskDeadline, setNewTaskDeadline] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>("P2");
  const [newTodo, setNewTodo] = useState("");
  const [progressDraft, setProgressDraft] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [editingTodoContent, setEditingTodoContent] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Record<TaskStatus, boolean>>({
    进行中: false,
    未开始: false,
    已完成: true,
    挂起: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [celebratingTodoId, setCelebratingTodoId] = useState<number | null>(null);
  const [undoTodoId, setUndoTodoId] = useState<number | null>(null);
  const [taskCelebration, setTaskCelebration] = useState<TaskCelebration | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [focusElapsed, setFocusElapsed] = useState(0);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const createDialogRef = useRef<HTMLElement>(null);
  const createGoalRef = useRef<HTMLTextAreaElement>(null);
  const focusDialogRef = useRef<HTMLElement>(null);
  const focusExitRef = useRef<HTMLButtonElement>(null);
  const taskEditorRef = useRef<HTMLElement>(null);
  const todoPanelRef = useRef<HTMLElement>(null);
  const celebrationDialogRef = useRef<HTMLElement>(null);
  const celebrationRestRef = useRef<HTMLButtonElement>(null);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("zh-CN");
    if (!query) {
      return tasks;
    }
    return tasks.filter((item) =>
      [item.goal, item.latestProgress || "", item.priority, item.status].some((value) =>
        value.toLocaleLowerCase("zh-CN").includes(query)
      )
    );
  }, [searchQuery, tasks]);

  const tasksByStatus = useMemo(
    () =>
      sidebarStatuses.map((status) => ({
        status,
        tasks: filteredTasks.filter((item) => item.status === status)
      })),
    [filteredTasks]
  );

  const nextTodo = useMemo(() => task?.todos.find((todo) => !todo.completed) ?? null, [task]);

  const completionText = useMemo(() => {
    if (!task || task.todos.length === 0) {
      return "0/0";
    }

    return `${task.todos.filter((todo) => todo.completed).length}/${task.todos.length}`;
  }, [task]);

  async function loadTasks(nextSelectedId?: number) {
    const data = await requestJson<{ tasks: TaskListItem[] }>("/api/tasks");
    setTasks(data.tasks);

    const firstActiveId = data.tasks.find((item) => item.status !== "已完成" && item.status !== "挂起")?.id;
    const currentId = nextSelectedId ?? selectedId ?? firstActiveId ?? data.tasks[0]?.id ?? null;
    setSelectedId(currentId);

    if (currentId) {
      await loadTask(currentId);
    } else {
      setTask(null);
      setGoalDraft("");
      setDeadlineDraft("");
      setPriorityDraft("P2");
    }
  }

  async function loadTask(id: number) {
    const data = await requestJson<{ task: TaskDetail }>(`/api/tasks/${id}`);
    setTask(data.task);
    setGoalDraft(data.task.goal);
    setDeadlineDraft(toDateTimeInput(data.task.deadlineAt));
    setPriorityDraft(data.task.priority);
  }

  async function run(action: () => Promise<void>) {
    setError("");
    setSaving(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSaving(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    run(async () => {
      await loadTasks();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => {
      setNotice("");
      setUndoTodoId(null);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (celebratingTodoId === null) return;
    const timer = window.setTimeout(() => setCelebratingTodoId(null), 900);
    return () => window.clearTimeout(timer);
  }, [celebratingTodoId]);

  useEffect(() => {
    if (!focusMode || focusPaused) {
      return;
    }
    const timer = window.setInterval(() => setFocusElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [focusMode, focusPaused]);

  useEffect(() => {
    if (!taskEditorRef.current || !todoPanelRef.current) return;
    const taskEditor = taskEditorRef.current;
    const todoPanel = todoPanelRef.current;

    function syncPanelHeight() {
      if (window.matchMedia("(max-width: 980px)").matches) {
        todoPanel.style.height = "";
        return;
      }
      todoPanel.style.height = `${Math.round(taskEditor.getBoundingClientRect().height)}px`;
    }

    syncPanelHeight();
    const observer = new ResizeObserver(syncPanelHeight);
    observer.observe(taskEditor);
    window.addEventListener("resize", syncPanelHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPanelHeight);
      todoPanel.style.height = "";
    };
  }, [task?.id]);

  useEffect(() => {
    if (!createModalOpen && !focusMode && !taskCelebration) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      if (createModalOpen) createGoalRef.current?.focus();
      if (focusMode) focusExitRef.current?.focus();
      if (taskCelebration) celebrationRestRef.current?.focus();
    });

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (focusMode) setFocusMode(false);
      else if (taskCelebration) setTaskCelebration(null);
      else if (createModalOpen) setCreateModalOpen(false);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      if (createModalOpen) createTriggerRef.current?.focus();
    };
  }, [createModalOpen, focusMode, taskCelebration]);

  function trapDialogFocus(event: KeyboardEvent<HTMLElement>, container: HTMLElement | null) {
    if (event.key !== "Tab" || !container) return;
    const elements = Array.from(
      container.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const todos = newTaskTodos
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({
          goal: newTaskGoal,
          todos,
          deadlineAt: newTaskDeadline || null,
          priority: newTaskPriority
        })
      });
      setNewTaskGoal("");
      setNewTaskTodos("");
      setNewTaskDeadline("");
      setNewTaskPriority("P2");
      setCreateAdvancedOpen(false);
      setCreateModalOpen(false);
      setNotice("已收进任务列表，先从下一小步开始。");
      await loadTasks(data.task.id);
    });
  }

  async function handleSelectTask(id: number) {
    setSelectedId(id);
    await run(async () => {
      await loadTask(id);
    });
  }

  async function handleUpdateTask(values: Partial<Pick<TaskDetail, "goal" | "status" | "deadlineAt" | "priority">>) {
    if (!task) {
      return;
    }
    const isCompletingTask = values.status === "已完成" && task.status !== "已完成";

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(values)
      });
      setTask(data.task);
      setGoalDraft(data.task.goal);
      setDeadlineDraft(toDateTimeInput(data.task.deadlineAt));
      setPriorityDraft(data.task.priority);
      if (isCompletingTask) {
        setNotice("");
        setTaskCelebration({
          taskId: data.task.id,
          goal: data.task.goal,
          completedTodos: data.task.todos.filter((todo) => todo.completed).length
        });
      } else {
        setNotice("修改已保存。");
      }
      await loadTasks(data.task.id);
    });
  }

  async function handleAddTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) {
      return;
    }

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/tasks/${task.id}/todos`, {
        method: "POST",
        body: JSON.stringify({ content: newTodo })
      });
      setNewTodo("");
      setTask(data.task);
      setNotice("新的一小步已加入。");
      await loadTasks(data.task.id);
    });
  }

  async function handleUpdateTodo(todoId: number, values: Partial<Pick<TodoItem, "content" | "completed">>) {
    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/todos/${todoId}`, {
        method: "PATCH",
        body: JSON.stringify(values)
      });
      setTask(data.task);
      setEditingTodoId(null);
      setEditingTodoContent("");
      if (values.completed === true) {
        setCelebratingTodoId(todoId);
        setUndoTodoId(todoId);
      } else if (values.completed === false) {
        setUndoTodoId(null);
      }
      setNotice(
        values.completed === true
          ? "完成一小步，干得漂亮。"
          : values.completed === false
            ? "已恢复这一步。"
            : "这一步已更新。"
      );
      await loadTasks(data.task.id);
    });
  }

  async function continueAfterCelebration() {
    const completedTaskId = taskCelebration?.taskId;
    setTaskCelebration(null);
    const nextTask = tasks.find(
      (item) => item.id !== completedTaskId && item.status !== "已完成" && item.status !== "挂起"
    );
    if (nextTask) {
      await handleSelectTask(nextTask.id);
    } else {
      setNotice("今天的待推进任务已经处理完了。");
    }
  }

  async function handleDeleteTodo(todoId: number) {
    if (!window.confirm("确定删除这个待办项吗？")) {
      return;
    }

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/todos/${todoId}`, {
        method: "DELETE"
      });
      setTask(data.task);
      if (editingTodoId === todoId) {
        setEditingTodoId(null);
        setEditingTodoContent("");
      }
      await loadTasks(data.task.id);
    });
  }

  async function handleAddProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) {
      return;
    }

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/tasks/${task.id}/progress`, {
        method: "POST",
        body: JSON.stringify({ content: progressDraft })
      });
      setProgressDraft("");
      setTask(data.task);
      setNotice("进度已记下。");
      await loadTasks(data.task.id);
    });
  }

  async function startFocus() {
    if (!task) return;
    setFocusElapsed(0);
    setFocusPaused(false);
    setFocusMode(true);
    if (task.status === "未开始") {
      await handleUpdateTask({ status: "进行中" });
    }
  }

  function renderTaskCard(item: TaskListItem) {
    const progress = getTimeProgress(item);
    return (
      <button
        className={`task-card ${selectedId === item.id ? "is-active" : ""}`}
        key={item.id}
        type="button"
        onClick={() => handleSelectTask(item.id)}
      >
        <span className={`status-dot status-${item.status}`} />
        <span className="task-card-main">
          <strong>{item.goal}</strong>
          <span className="task-card-context">
            {item.latestProgress || (item.todoTotal > 0 ? `还有 ${item.todoTotal - item.todoCompleted} 个小步骤` : "先补上一个可执行的小步骤")}
          </span>
          <span className={`task-card-meta time-progress-${progress.tone}`}>
            <span className={`priority-badge priority-${item.priority}`}>{item.priority}</span>
            <span>{progress.label}</span>
          </span>
        </span>
      </button>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <h1>放弃挣扎吧ADHD</h1>
            <p className="brand-subtitle">不和大脑硬碰硬，先完成下一小步。</p>
          </div>
          <ListChecks aria-hidden="true" />
        </div>

        <button
          ref={createTriggerRef}
          className="quick-capture-trigger"
          type="button"
          onClick={() => setCreateModalOpen(true)}
        >
          <span>想到什么，先记下来…</span>
          <Plus aria-hidden="true" />
        </button>

        <div className="search-box">
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="task-search">搜索任务</label>
          <input
            id="task-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索任务"
          />
        </div>

        <section className="sidebar-task-list" aria-label="任务列表">
          {loading ? (
            <p className="muted">加载中...</p>
          ) : filteredTasks.length === 0 ? (
            <div className="sidebar-empty">
              <p>没有找到任务。</p>
              <button type="button" onClick={() => setSearchQuery("")}>清除搜索</button>
            </div>
          ) : (
            tasksByStatus.map((folder) => {
              const isCollapsed = collapsedFolders[folder.status];

              return (
                <section className={`task-folder ${isCollapsed ? "is-collapsed" : ""}`} key={folder.status}>
                  <button
                    aria-expanded={!isCollapsed}
                    className="task-folder-header"
                    type="button"
                    onClick={() =>
                      setCollapsedFolders((current) => ({
                        ...current,
                        [folder.status]: !current[folder.status]
                      }))
                    }
                  >
                    {isCollapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                    <Folder aria-hidden="true" />
                    <span>{folder.status}</span>
                    <b>{folder.tasks.length}</b>
                  </button>
                  {isCollapsed ? null : folder.tasks.length === 0 ? (
                    <p className="task-folder-empty">暂无任务</p>
                  ) : folder.tasks.map(renderTaskCard)}
                </section>
              );
            })
          )}
        </section>
      </aside>

      <section className="workspace">
        {error ? (
          <div className="toast" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}>知道了</button>
          </div>
        ) : null}
        {notice ? (
          <div className="toast toast-success" role="status" aria-live="polite">
            <CheckCircle2 aria-hidden="true" />
            <span>{notice}</span>
            {undoTodoId !== null ? (
              <button type="button" onClick={() => handleUpdateTodo(undoTodoId, { completed: false })}>
                撤销
              </button>
            ) : null}
          </div>
        ) : null}

        {!task ? (
          <div className="empty-state">
            <CheckCircle2 aria-hidden="true" />
            <h2>创建第一个任务</h2>
            <p>点击左侧的新建任务按钮，填写目标、DDL 和待办项。</p>
          </div>
        ) : (
          <>
            <div className="detail-header">
              <div>
                <p className="eyebrow">任务 #{task.id}</p>
                <h2>{task.goal}</h2>
              </div>
            </div>

            <section className="next-action" aria-labelledby="next-action-title">
              <div className="next-action-icon">
                <Target aria-hidden="true" />
              </div>
              <div className="next-action-copy">
                <h3 id="next-action-title">先不管别的任务，现在就专心做这一项</h3>
              </div>
              <button className="focus-button" type="button" onClick={startFocus} disabled={!nextTodo}>
                <Play aria-hidden="true" />
                开始
              </button>
            </section>

            <div className="detail-grid">
              <section ref={taskEditorRef} className="panel task-editor">
                <div className="panel-heading">
                  <h3>任务详情</h3>
                  <span>更新于 {formatTime(task.updatedAt)}</span>
                </div>

                <label htmlFor="goal-draft">任务目标</label>
                <textarea
                  id="goal-draft"
                  value={goalDraft}
                  rows={4}
                  onChange={(event) => setGoalDraft(event.target.value)}
                  onBlur={() => {
                    if (goalDraft.trim() && goalDraft.trim() !== task.goal) {
                      handleUpdateTask({ goal: goalDraft });
                    }
                  }}
                />
                <p className="field-hint">离开输入框后自动保存</p>

                <div className="deadline-editor">
                  <label htmlFor="deadline-draft">DDL 时间</label>
                  <div className="deadline-row">
                    <input
                      id="deadline-draft"
                      type="datetime-local"
                      value={deadlineDraft}
                      onChange={(event) => setDeadlineDraft(event.target.value)}
                      onBlur={() => {
                        if (deadlineDraft !== toDateTimeInput(task.deadlineAt)) {
                          handleUpdateTask({ deadlineAt: deadlineDraft || null });
                        }
                      }}
                    />
                    <span className="deadline-relative"><CalendarClock aria-hidden="true" />{getTimeProgress(task).label}</span>
                  </div>
                </div>

                <div className="priority-editor">
                  <label>优先级</label>
                  <div className="priority-row" aria-label="任务优先级">
                    {priorities.map((priority) => (
                      <button
                        className={priorityDraft === priority ? `priority-button active priority-${priority}` : "priority-button"}
                        key={priority}
                        type="button"
                        aria-pressed={priorityDraft === priority}
                        onClick={() => {
                          setPriorityDraft(priority);
                          handleUpdateTask({ priority });
                        }}
                      >
                        {priority}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="status-row" aria-label="任务状态">
                  {statuses.map((status) => (
                    <button
                      className={task.status === status ? "status-button active" : "status-button"}
                      key={status}
                      type="button"
                      aria-pressed={task.status === status}
                      onClick={() => handleUpdateTask({ status })}
                    >
                      {status === "已完成" ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section ref={todoPanelRef} className="panel todo-panel">
                <div className="panel-heading">
                  <h3>待办项</h3>
                  <span>{completionText}</span>
                </div>

                <div className="todo-list">
                  {task.todos.length === 0 ? <p className="muted">暂无待办项</p> : null}
                  {task.todos.map((todo) => (
                    <div
                      className={`todo-row ${celebratingTodoId === todo.id ? "is-celebrating" : ""}`}
                      key={todo.id}
                    >
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={todo.completed ? "标记为未完成" : "标记为已完成"}
                        onClick={() => handleUpdateTodo(todo.id, { completed: !todo.completed })}
                      >
                        {todo.completed ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                      </button>

                      {editingTodoId === todo.id ? (
                        <input
                          value={editingTodoContent}
                          onChange={(event) => setEditingTodoContent(event.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span className={todo.completed ? "done" : ""}>{todo.content}</span>
                      )}

                      {editingTodoId === todo.id ? (
                        <button
                          className="icon-button"
                          type="button"
                          aria-label="保存待办"
                          onClick={() => handleUpdateTodo(todo.id, { content: editingTodoContent })}
                        >
                          <Save aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="todo-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label="编辑待办"
                            onClick={() => {
                              setEditingTodoId(todo.id);
                              setEditingTodoContent(todo.content);
                            }}
                          >
                            <SquarePen aria-hidden="true" />
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label="删除待办"
                            onClick={() => handleDeleteTodo(todo.id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <form className="inline-form" onSubmit={handleAddTodo}>
                  <label className="sr-only" htmlFor="new-todo">新的下一小步</label>
                  <input
                    id="new-todo"
                    value={newTodo}
                    onChange={(event) => setNewTodo(event.target.value)}
                    placeholder="下一小步是什么？"
                    required
                  />
                  <button className="icon-submit" type="submit" aria-label="新增下一步" disabled={saving || !newTodo.trim()}>
                    <Plus aria-hidden="true" />
                  </button>
                </form>
              </section>
            </div>

            <section className="panel progress-panel">
              <div className="panel-heading">
                <h3>进度记录</h3>
                <span>{task.progressRecords.length} 条</span>
              </div>

              <form className="progress-form" onSubmit={handleAddProgress}>
                <label className="sr-only" htmlFor="progress-draft">记录进度</label>
                <textarea
                  id="progress-draft"
                  value={progressDraft}
                  onChange={(event) => setProgressDraft(event.target.value)}
                  placeholder="记录今天推进了什么、遇到什么阻碍、下一步准备做什么"
                  rows={3}
                />
                <button className="secondary-button" type="submit" disabled={saving || !progressDraft.trim()}>
                  <Plus aria-hidden="true" />
                  添加记录
                </button>
              </form>

              <div className="timeline">
                {task.progressRecords.length === 0 ? <p className="muted">暂无进度记录</p> : null}
                {task.progressRecords.map((record) => (
                  <article className="timeline-item" key={record.id}>
                    <time>{formatTime(record.createdAt)}</time>
                    <p>{record.content}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </section>

      {createModalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateModalOpen(false);
        }}>
          <section
            ref={createDialogRef}
            className="modal task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
            onKeyDown={(event) => trapDialogFocus(event, createDialogRef.current)}
          >
            <div className="modal-header">
              <h2 id="create-task-title">新建任务</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="关闭"
                onClick={() => setCreateModalOpen(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <form className="create-task" onSubmit={handleCreateTask}>
              <label htmlFor="new-task-goal">现在想做什么？</label>
              <textarea
                ref={createGoalRef}
                id="new-task-goal"
                value={newTaskGoal}
                onChange={(event) => setNewTaskGoal(event.target.value)}
                placeholder="先写下来，不用一次想完…"
                rows={3}
                required
              />
              <p className="field-hint">只填这一项也可以，其他内容之后再补。</p>

              <button
                className="advanced-toggle"
                type="button"
                aria-expanded={createAdvancedOpen}
                onClick={() => setCreateAdvancedOpen((value) => !value)}
              >
                {createAdvancedOpen ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                补充截止时间、优先级和小步骤
              </button>

              {createAdvancedOpen ? (
                <div className="advanced-fields">
                  <label htmlFor="new-task-deadline">截止时间</label>
                  <input
                    id="new-task-deadline"
                    type="datetime-local"
                    value={newTaskDeadline}
                    onChange={(event) => setNewTaskDeadline(event.target.value)}
                  />

                  <label htmlFor="new-task-priority">优先级</label>
                  <select
                    id="new-task-priority"
                    value={newTaskPriority}
                    onChange={(event) => setNewTaskPriority(event.target.value as TaskPriority)}
                  >
                    {priorities.map((priority) => (
                      <option key={priority} value={priority}>{priority}</option>
                    ))}
                  </select>

                  <label htmlFor="new-task-todos">拆成小步骤</label>
                  <textarea
                    id="new-task-todos"
                    value={newTaskTodos}
                    onChange={(event) => setNewTaskTodos(event.target.value)}
                    placeholder={"每行一个 5–20 分钟可完成的步骤"}
                    rows={4}
                  />
                </div>
              ) : null}

              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <Loader2 className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                先记下来
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {taskCelebration ? (
        <div className="celebration-backdrop">
          <section
            ref={celebrationDialogRef}
            className="celebration-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="celebration-title"
            aria-describedby="celebration-description"
            onKeyDown={(event) => trapDialogFocus(event, celebrationDialogRef.current)}
          >
            <div className="celebration-confetti" aria-hidden="true">
              {Array.from({ length: 16 }, (_, index) => <i key={index} />)}
            </div>
            <div className="celebration-check" aria-hidden="true">
              <Check strokeWidth={3} />
            </div>
            <p className="celebration-kicker">任务完成</p>
            <h2 id="celebration-title">这件事完成了。你真的推进了它。</h2>
            <p id="celebration-description">
              {taskCelebration.completedTodos > 0
                ? `“${taskCelebration.goal}”共完成了 ${taskCelebration.completedTodos} 个小步骤。`
                : `“${taskCelebration.goal}”已经完成。`}
            </p>
            <div className="celebration-actions">
              <button
                ref={celebrationRestRef}
                className="secondary-button"
                type="button"
                onClick={() => {
                  setTaskCelebration(null);
                  setNotice("做完了，先休息一下吧。");
                }}
              >
                休息一下
              </button>
              <button className="primary-button" type="button" onClick={continueAfterCelebration}>
                继续下一项
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {focusMode && task ? (
        <div className="focus-backdrop">
          <section
            ref={focusDialogRef}
            className="focus-view"
            role="dialog"
            aria-modal="true"
            aria-labelledby="focus-title"
            onKeyDown={(event) => trapDialogFocus(event, focusDialogRef.current)}
          >
            <button ref={focusExitRef} className="focus-exit" type="button" onClick={() => setFocusMode(false)}>
              <X aria-hidden="true" />
              退出专注
            </button>
            <div className="focus-content">
              <span className="focus-kicker">现在只做一件事</span>
              <h2 id="focus-title">{nextTodo?.content || task.goal}</h2>
              <p>{task.goal}</p>
              <time aria-label={`已专注 ${formatElapsed(focusElapsed)}`}>{formatElapsed(focusElapsed)}</time>
              <div className="focus-actions">
                <button className="secondary-button" type="button" onClick={() => setFocusPaused((value) => !value)}>
                  {focusPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                  {focusPaused ? "继续" : "暂停"}
                </button>
                {nextTodo ? (
                  <button className="primary-button" type="button" onClick={async () => {
                    await handleUpdateTodo(nextTodo.id, { completed: true });
                    setFocusMode(false);
                  }}>
                    <Check aria-hidden="true" />
                    这一步完成了
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
