export const TASK_STATUSES = ["未开始", "进行中", "挂起", "已完成"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TodoItem = {
  id: number;
  taskId: number;
  userId: string;
  content: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProgressRecord = {
  id: number;
  taskId: number;
  userId: string;
  content: string;
  createdAt: string;
};

export type AppUser = {
  id: string;
  authUserId: string | null;
  email: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskDetail = {
  id: number;
  userId: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  todos: TodoItem[];
  progressRecords: ProgressRecord[];
};

export type TaskListItem = Omit<TaskDetail, "todos" | "progressRecords"> & {
  todoTotal: number;
  todoCompleted: number;
  latestProgress: string | null;
  latestProgressAt: string | null;
};

type TaskRow = {
  id: number;
  user_id: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
};

type TodoRow = {
  id: number;
  task_id: number;
  user_id: string;
  content: string;
  completed: boolean | 0 | 1;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProgressRow = {
  id: number;
  task_id: number;
  user_id: string;
  content: string;
  created_at: string;
};

type AppUserRow = {
  id: string;
  auth_user_id: string | null;
  email: string;
  created_at: string;
  updated_at: string;
};

type SupabaseRequestInit = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase 未配置：请在 .env.local 中设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    restUrl: `${url}/rest/v1`,
    serviceRoleKey
  };
}

async function supabaseRequest<T>(path: string, init: SupabaseRequestInit = {}): Promise<T> {
  const { restUrl, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${restUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    let detail = message;

    try {
      const payload = JSON.parse(message) as { message?: string };
      detail = payload.message || message;
    } catch {
      detail = message;
    }

    if (detail.includes("row-level security")) {
      throw new Error(
        "Supabase RLS 阻止写入：请确认 .env.local 中的 SUPABASE_SERVICE_ROLE_KEY 是真正的 Secret/service_role key，或在 Supabase 为相关表添加写入策略。"
      );
    }

    if (detail.includes("app_users") || detail.includes("user_id") || detail.includes("schema cache")) {
      throw new Error("Supabase 表结构未更新：请先执行 supabase/migrations/20260707_email_login_user_scope.sql。");
    }

    throw new Error(`Supabase 请求失败：${response.status} ${detail}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }

  const value = query.toString();
  return value ? `?${value}` : "";
}

function currentTimestamp() {
  return new Date().toISOString();
}

function timeValue(value: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function mapTask(row: TaskRow): Omit<TaskDetail, "todos" | "progressRecords"> {
  return {
    id: Number(row.id),
    userId: row.user_id,
    goal: row.goal,
    status: row.status,
    priority: row.priority,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapTodo(row: TodoRow): TodoItem {
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    userId: row.user_id,
    content: row.content,
    completed: Boolean(row.completed),
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProgress(row: ProgressRow): ProgressRecord {
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at
  };
}

function mapUser(row: AppUserRow): AppUser {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && TASK_PRIORITIES.includes(value as TaskPriority);
}

export function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function syncAuthUser(authUserId: string, email: string): Promise<AppUser> {
  const existing = await supabaseRequest<AppUserRow[]>(
    `/app_users${buildQuery({ select: "*", email: `eq.${email}`, limit: 1 })}`
  );

  if (existing[0]) {
    const existingUser = mapUser(existing[0]);
    if (existingUser.authUserId !== authUserId) {
      const [updated] = await supabaseRequest<AppUserRow[]>(
        `/app_users${buildQuery({ email: `eq.${email}` })}`,
        {
          method: "PATCH",
          headers: {
            Prefer: "return=representation"
          },
          body: {
            auth_user_id: authUserId,
            updated_at: currentTimestamp()
          }
        }
      );
      return mapUser(updated);
    }

    return existingUser;
  }

  const [created] = await supabaseRequest<AppUserRow[]>("/app_users", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: {
      id: authUserId,
      auth_user_id: authUserId,
      email
    }
  });

  return mapUser(created);
}

export function normalizeDeadline(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}:00`;
}

export async function getTasks(userId: string): Promise<TaskListItem[]> {
  const [taskRows, todoRows, progressRows] = await Promise.all([
    supabaseRequest<TaskRow[]>(`/tasks${buildQuery({ select: "*", user_id: `eq.${userId}` })}`),
    supabaseRequest<TodoRow[]>(
      `/todo_items${buildQuery({ select: "id,task_id,user_id,completed", user_id: `eq.${userId}` })}`
    ),
    supabaseRequest<ProgressRow[]>(
      `/progress_records${buildQuery({ select: "id,task_id,user_id,content,created_at", user_id: `eq.${userId}` })}`
    )
  ]);

  const todosByTask = new Map<number, TodoRow[]>();
  for (const todo of todoRows) {
    const taskId = Number(todo.task_id);
    todosByTask.set(taskId, [...(todosByTask.get(taskId) || []), todo]);
  }

  const latestProgressByTask = new Map<number, ProgressRow>();
  for (const progress of progressRows) {
    const taskId = Number(progress.task_id);
    const current = latestProgressByTask.get(taskId);
    const isNewer =
      !current ||
      timeValue(progress.created_at) > timeValue(current.created_at) ||
      (progress.created_at === current.created_at && Number(progress.id) > Number(current.id));

    if (isNewer) {
      latestProgressByTask.set(taskId, progress);
    }
  }

  const priorityRank = new Map<TaskPriority, number>(TASK_PRIORITIES.map((priority, index) => [priority, index]));

  return taskRows
    .map((row) => {
      const todos = todosByTask.get(Number(row.id)) || [];
      const latestProgress = latestProgressByTask.get(Number(row.id));

      return {
        ...mapTask(row),
        todoTotal: todos.length,
        todoCompleted: todos.filter((todo) => Boolean(todo.completed)).length,
        latestProgress: latestProgress?.content || null,
        latestProgressAt: latestProgress?.created_at || null
      };
    })
    .sort((left, right) => {
      const holdRank = Number(left.status === "挂起") - Number(right.status === "挂起");
      if (holdRank !== 0) {
        return holdRank;
      }

      const priorityDelta = (priorityRank.get(left.priority) ?? 4) - (priorityRank.get(right.priority) ?? 4);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const deadlineDelta = timeValue(left.deadlineAt) - timeValue(right.deadlineAt);
      if (deadlineDelta !== 0) {
        return deadlineDelta;
      }

      const updatedDelta = timeValue(right.updatedAt) - timeValue(left.updatedAt);
      return updatedDelta === 0 ? right.id - left.id : updatedDelta;
    });
}

export async function getTask(userId: string, taskId: number): Promise<TaskDetail | null> {
  const taskRows = await supabaseRequest<TaskRow[]>(
    `/tasks${buildQuery({ select: "*", id: `eq.${taskId}`, user_id: `eq.${userId}`, limit: 1 })}`
  );
  const row = taskRows[0];

  if (!row) {
    return null;
  }

  const [todos, progressRecords] = await Promise.all([
    supabaseRequest<TodoRow[]>(
      `/todo_items${buildQuery({
        select: "*",
        task_id: `eq.${taskId}`,
        user_id: `eq.${userId}`,
        order: "sort_order.asc,id.asc"
      })}`
    ),
    supabaseRequest<ProgressRow[]>(
      `/progress_records${buildQuery({
        select: "*",
        task_id: `eq.${taskId}`,
        user_id: `eq.${userId}`,
        order: "created_at.desc,id.desc"
      })}`
    )
  ]);

  return {
    ...mapTask(row),
    todos: todos.map(mapTodo),
    progressRecords: progressRecords.map(mapProgress)
  };
}

export async function createTask(
  userId: string,
  goal: string,
  todos: string[],
  deadlineAt: string | null,
  priority: TaskPriority
): Promise<TaskDetail> {
  const [task] = await supabaseRequest<TaskRow[]>("/tasks", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: {
      user_id: userId,
      goal,
      deadline_at: deadlineAt,
      priority
    }
  });
  const taskId = Number(task.id);

  for (const [index, todo] of todos.entries()) {
    await supabaseRequest<TodoRow[]>("/todo_items", {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: {
        task_id: taskId,
        user_id: userId,
        content: todo,
        sort_order: index
      }
    });
  }

  return (await getTask(userId, taskId)) as TaskDetail;
}

export async function updateTask(
  userId: string,
  taskId: number,
  values: { goal?: string; status?: TaskStatus; deadlineAt?: string | null; priority?: TaskPriority }
): Promise<TaskDetail | null> {
  const existing = await getTask(userId, taskId);
  if (!existing) {
    return null;
  }

  const updateValues: Partial<Pick<TaskRow, "goal" | "status" | "deadline_at" | "priority" | "updated_at">> = {};

  if (values.goal !== undefined && values.goal !== existing.goal) {
    updateValues.goal = values.goal;
  }

  if (values.status !== undefined && values.status !== existing.status) {
    updateValues.status = values.status;
  }

  if (values.deadlineAt !== undefined && values.deadlineAt !== existing.deadlineAt) {
    updateValues.deadline_at = values.deadlineAt;
  }

  if (values.priority !== undefined && values.priority !== existing.priority) {
    updateValues.priority = values.priority;
  }

  if (Object.keys(updateValues).length > 0) {
    await supabaseRequest(`/tasks${buildQuery({ id: `eq.${taskId}`, user_id: `eq.${userId}` })}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: {
        ...updateValues,
        updated_at: currentTimestamp()
      }
    });
  }

  return getTask(userId, taskId);
}

export async function createTodo(userId: string, taskId: number, content: string): Promise<TaskDetail | null> {
  const task = await getTask(userId, taskId);
  if (!task) {
    return null;
  }

  const maxSortOrder = task.todos.reduce((max, todo) => Math.max(max, todo.sortOrder), -1);
  await supabaseRequest<TodoRow[]>("/todo_items", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: {
      task_id: taskId,
      user_id: userId,
      content,
      sort_order: maxSortOrder + 1
    }
  });

  await touchTask(userId, taskId);
  return getTask(userId, taskId);
}

export async function updateTodo(
  userId: string,
  todoId: number,
  values: { content?: string; completed?: boolean }
): Promise<TaskDetail | null> {
  const rows = await supabaseRequest<TodoRow[]>(
    `/todo_items${buildQuery({ select: "*", id: `eq.${todoId}`, user_id: `eq.${userId}`, limit: 1 })}`
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  const updateValues: Partial<Pick<TodoRow, "content" | "completed" | "updated_at">> = {};

  if (values.content !== undefined && values.content !== row.content) {
    updateValues.content = values.content;
  }

  if (values.completed !== undefined && values.completed !== Boolean(row.completed)) {
    updateValues.completed = values.completed;
  }

  if (Object.keys(updateValues).length > 0) {
    await supabaseRequest(`/todo_items${buildQuery({ id: `eq.${todoId}`, user_id: `eq.${userId}` })}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal"
      },
      body: {
        ...updateValues,
        updated_at: currentTimestamp()
      }
    });

    await touchTask(userId, Number(row.task_id));
  }

  return getTask(userId, Number(row.task_id));
}

export async function deleteTodo(userId: string, todoId: number): Promise<TaskDetail | null> {
  const rows = await supabaseRequest<TodoRow[]>(
    `/todo_items${buildQuery({ select: "*", id: `eq.${todoId}`, user_id: `eq.${userId}`, limit: 1 })}`
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  await supabaseRequest(`/todo_items${buildQuery({ id: `eq.${todoId}`, user_id: `eq.${userId}` })}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    }
  });
  await touchTask(userId, Number(row.task_id));
  return getTask(userId, Number(row.task_id));
}

export async function createProgress(userId: string, taskId: number, content: string): Promise<TaskDetail | null> {
  const task = await getTask(userId, taskId);
  if (!task) {
    return null;
  }

  await supabaseRequest("/progress_records", {
    method: "POST",
    headers: {
      Prefer: "return=minimal"
    },
    body: {
      task_id: taskId,
      user_id: userId,
      content
    }
  });
  await touchTask(userId, taskId);
  return getTask(userId, taskId);
}

async function touchTask(userId: string, taskId: number) {
  await supabaseRequest(`/tasks${buildQuery({ id: `eq.${taskId}`, user_id: `eq.${userId}` })}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: {
      updated_at: currentTimestamp()
    }
  });
}
