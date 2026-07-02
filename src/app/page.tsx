"use client";

import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  FileClock,
  Folder,
  ListChecks,
  Loader2,
  Plus,
  Save,
  SquarePen,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

type EditHistory = {
  id: number;
  taskId: number;
  actionType: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
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

function historyLabel(item: EditHistory) {
  if (item.fieldName === "goal") {
    return "任务目标";
  }

  if (item.fieldName === "status") {
    return "任务状态";
  }

  if (item.fieldName === "deadline_at") {
    return "DDL 时间";
  }

  if (item.fieldName === "priority") {
    return "任务优先级";
  }

  if (item.fieldName.includes(":content")) {
    return "待办内容";
  }

  if (item.fieldName.includes(":completed")) {
    return "待办状态";
  }

  return item.fieldName;
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
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
    已完成: false,
    挂起: false
  });
  const [history, setHistory] = useState<EditHistory[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tasksByStatus = useMemo(
    () =>
      sidebarStatuses.map((status) => ({
        status,
        tasks: tasks.filter((item) => item.status === status)
      })),
    [tasks]
  );

  const completionText = useMemo(() => {
    if (!task || task.todos.length === 0) {
      return "0/0";
    }

    return `${task.todos.filter((todo) => todo.completed).length}/${task.todos.length}`;
  }, [task]);

  async function loadTasks(nextSelectedId?: number) {
    const data = await requestJson<{ tasks: TaskListItem[] }>("/api/tasks");
    setTasks(data.tasks);

    const currentId = nextSelectedId ?? selectedId ?? data.tasks[0]?.id ?? null;
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
      setCreateModalOpen(false);
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

    await run(async () => {
      const data = await requestJson<{ task: TaskDetail }>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(values)
      });
      setTask(data.task);
      setGoalDraft(data.task.goal);
      setDeadlineDraft(toDateTimeInput(data.task.deadlineAt));
      setPriorityDraft(data.task.priority);
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
      await loadTasks(data.task.id);
    });
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
      await loadTasks(data.task.id);
    });
  }

  async function openHistory() {
    if (!task) {
      return;
    }

    await run(async () => {
      const data = await requestJson<{ history: EditHistory[] }>(`/api/tasks/${task.id}/history`);
      setHistory(data.history);
      setHistoryOpen(true);
    });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div>
            <h1>放弃挣扎吧ADHD</h1>
            <p className="brand-subtitle">不上班就会没饭吃，这就是打工人的宿命</p>
          </div>
          <ListChecks aria-hidden="true" />
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          <button className="primary-button" type="button" onClick={() => setCreateModalOpen(true)}>
            <Plus aria-hidden="true" />
            新建任务
          </button>
        </nav>

        <section className="sidebar-task-list" aria-label="任务列表">
          {loading ? (
            <p className="muted">加载中...</p>
          ) : tasks.length === 0 ? (
            <p className="muted">还没有任务</p>
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
                  ) : (
                    folder.tasks.map((item) => {
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
                            <small>
                              <span className={`priority-badge priority-${item.priority}`}>{item.priority}</span>
                              待办 {item.todoCompleted}/{item.todoTotal}
                            </small>
                            <span>{item.latestProgress || "暂无进度记录"}</span>
                            <span className={`time-progress time-progress-${progress.tone}`}>
                              <span className="time-progress-meta">
                                <span>DDL {formatTime(item.deadlineAt)}</span>
                                <span>{progress.label}</span>
                              </span>
                              <span className="time-progress-track">
                                <span style={{ width: `${progress.percent}%` }} />
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </section>
              );
            })
          )}
        </section>
      </aside>

      <section className="workspace">
        {error ? (
          <div className="toast" role="alert">
            {error}
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
              <button className="ghost-button" type="button" onClick={openHistory}>
                <FileClock aria-hidden="true" />
                编辑记录
              </button>
            </div>

            <div className="detail-grid">
              <section className="panel task-editor">
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
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving || goalDraft.trim() === task.goal}
                  onClick={() => handleUpdateTask({ goal: goalDraft })}
                >
                  <Save aria-hidden="true" />
                  保存目标
                </button>

                <div className="deadline-editor">
                  <label htmlFor="deadline-draft">DDL 时间</label>
                  <div className="deadline-row">
                    <input
                      id="deadline-draft"
                      type="datetime-local"
                      value={deadlineDraft}
                      onChange={(event) => setDeadlineDraft(event.target.value)}
                    />
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={saving || deadlineDraft === toDateTimeInput(task.deadlineAt)}
                      onClick={() => handleUpdateTask({ deadlineAt: deadlineDraft || null })}
                    >
                      <CalendarClock aria-hidden="true" />
                      保存 DDL
                    </button>
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
                      onClick={() => handleUpdateTask({ status })}
                    >
                      {status === "已完成" ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                      {status}
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <h3>待办项</h3>
                  <span>{completionText}</span>
                </div>

                <div className="todo-list">
                  {task.todos.length === 0 ? <p className="muted">暂无待办项</p> : null}
                  {task.todos.map((todo) => (
                    <div className="todo-row" key={todo.id}>
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
                  <input
                    value={newTodo}
                    onChange={(event) => setNewTodo(event.target.value)}
                    placeholder="新增待办项"
                  />
                  <button className="icon-submit" type="submit" aria-label="新增待办">
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
                <textarea
                  value={progressDraft}
                  onChange={(event) => setProgressDraft(event.target.value)}
                  placeholder="记录今天推进了什么、遇到什么阻碍、下一步准备做什么"
                  rows={3}
                />
                <button className="secondary-button" type="submit">
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
        <div className="modal-backdrop" role="presentation">
          <section className="modal task-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
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
              <label htmlFor="new-task-goal">任务目标</label>
              <textarea
                id="new-task-goal"
                value={newTaskGoal}
                onChange={(event) => setNewTaskGoal(event.target.value)}
                placeholder="例如：完成个人任务管理软件 MVP"
                rows={3}
              />

              <label htmlFor="new-task-deadline">DDL 时间</label>
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
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>

              <label htmlFor="new-task-todos">待办项</label>
              <textarea
                id="new-task-todos"
                value={newTaskTodos}
                onChange={(event) => setNewTaskTodos(event.target.value)}
                placeholder={"每行一个待办项\n搭建项目\n实现任务编辑\n验证历史记录"}
                rows={5}
              />

              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? <Loader2 className="spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
                创建任务
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <div className="modal-header">
              <h2 id="history-title">编辑记录</h2>
              <button className="icon-button" type="button" aria-label="关闭" onClick={() => setHistoryOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>

            {task ? (
              <div className="history-task-context">
                <span>关联任务</span>
                <strong>
                  #{task.id} {task.goal}
                </strong>
              </div>
            ) : null}

            <div className="history-list">
              {history.length === 0 ? <p className="muted">暂无编辑记录</p> : null}
              {history.map((item) => (
                <article className="history-item" key={item.id}>
                  {task ? (
                    <p className="history-task-line">
                      修改任务：#{task.id} {task.goal}
                    </p>
                  ) : null}
                  <div>
                    <strong>{historyLabel(item)}</strong>
                    <time>{formatTime(item.createdAt)}</time>
                  </div>
                  <p className="history-change">
                    <span>{item.oldValue ?? "空"}</span>
                    <b>→</b>
                    <span>{item.newValue ?? "空"}</span>
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
