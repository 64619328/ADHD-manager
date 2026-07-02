import { DatabaseSync } from "node:sqlite";
import { ensureTasksDbLocation } from "./app-paths";

export const TASK_STATUSES = ["未开始", "进行中", "挂起", "已完成"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TodoItem = {
  id: number;
  taskId: number;
  content: string;
  completed: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProgressRecord = {
  id: number;
  taskId: number;
  content: string;
  createdAt: string;
};

export type EditHistory = {
  id: number;
  taskId: number;
  actionType: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type TaskDetail = {
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

export type TaskListItem = Omit<TaskDetail, "todos" | "progressRecords"> & {
  todoTotal: number;
  todoCompleted: number;
  latestProgress: string | null;
  latestProgressAt: string | null;
};

type TaskRow = {
  id: number;
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
  content: string;
  completed: 0 | 1;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProgressRow = {
  id: number;
  task_id: number;
  content: string;
  created_at: string;
};

type EditHistoryRow = {
  id: number;
  task_id: number;
  action_type: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

const globalForDb = globalThis as unknown as { taskManagerDb?: DatabaseSync };

function ensureTaskStatusConstraint(connection: DatabaseSync) {
  const table = connection
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
    .get() as { sql?: string } | undefined;

  if (table?.sql?.includes("'挂起'")) {
    return;
  }

  connection.exec("PRAGMA foreign_keys = OFF");
  connection.exec("BEGIN IMMEDIATE");

  try {
    connection.exec(`
      CREATE TABLE tasks_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('未开始', '进行中', '挂起', '已完成')) DEFAULT '未开始',
        priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')) DEFAULT 'P2',
        deadline_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      INSERT INTO tasks_new (id, goal, status, priority, deadline_at, created_at, updated_at)
      SELECT
        id,
        goal,
        CASE
          WHEN status IN ('未开始', '进行中', '挂起', '已完成') THEN status
          ELSE '未开始'
        END,
        CASE
          WHEN priority IN ('P0', 'P1', 'P2', 'P3') THEN priority
          ELSE 'P2'
        END,
        deadline_at,
        created_at,
        updated_at
      FROM tasks;

      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;
    `);
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  } finally {
    connection.exec("PRAGMA foreign_keys = ON");
  }
}

function getDb() {
  if (!globalForDb.taskManagerDb) {
    const dbPath = ensureTasksDbLocation();
    const connection = new DatabaseSync(dbPath, {
      open: true
    });

    connection.exec("PRAGMA journal_mode = WAL");
    connection.exec("PRAGMA foreign_keys = ON");
    connection.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('未开始', '进行中', '挂起', '已完成')) DEFAULT '未开始',
        priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')) DEFAULT 'P2',
        deadline_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS todo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS progress_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS edit_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);

    const taskColumns = connection.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>;
    if (!taskColumns.some((column) => column.name === "deadline_at")) {
      connection.exec("ALTER TABLE tasks ADD COLUMN deadline_at TEXT");
    }
    if (!taskColumns.some((column) => column.name === "priority")) {
      connection.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'P2'");
    }
    ensureTaskStatusConstraint(connection);

    globalForDb.taskManagerDb = connection;
  }

  return globalForDb.taskManagerDb;
}

function mapTask(row: TaskRow): Omit<TaskDetail, "todos" | "progressRecords"> {
  return {
    id: row.id,
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
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    completed: Boolean(row.completed),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProgress(row: ProgressRow): ProgressRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    content: row.content,
    createdAt: row.created_at
  };
}

function mapHistory(row: EditHistoryRow): EditHistory {
  return {
    id: row.id,
    taskId: row.task_id,
    actionType: row.action_type,
    fieldName: row.field_name,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at
  };
}

function transaction<T>(callback: () => T): T {
  const connection = getDb();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
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

export function getTasks(): TaskListItem[] {
  const rows = getDb()
    .prepare(
      `
      SELECT
        tasks.id,
        tasks.goal,
        tasks.status,
        tasks.priority,
        tasks.deadline_at,
        tasks.created_at,
        tasks.updated_at,
        COUNT(todo_items.id) AS todo_total,
        COALESCE(SUM(CASE WHEN todo_items.completed = 1 THEN 1 ELSE 0 END), 0) AS todo_completed,
        (
          SELECT content
          FROM progress_records
          WHERE progress_records.task_id = tasks.id
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 1
        ) AS latest_progress,
        (
          SELECT created_at
          FROM progress_records
          WHERE progress_records.task_id = tasks.id
          ORDER BY datetime(created_at) DESC, id DESC
          LIMIT 1
        ) AS latest_progress_at
      FROM tasks
      LEFT JOIN todo_items ON todo_items.task_id = tasks.id
      GROUP BY tasks.id
      ORDER BY
        CASE WHEN tasks.status = '挂起' THEN 1 ELSE 0 END ASC,
        CASE tasks.priority
          WHEN 'P0' THEN 0
          WHEN 'P1' THEN 1
          WHEN 'P2' THEN 2
          WHEN 'P3' THEN 3
          ELSE 4
        END ASC,
        CASE WHEN tasks.deadline_at IS NULL THEN 1 ELSE 0 END ASC,
        datetime(tasks.deadline_at) ASC,
        datetime(tasks.updated_at) DESC,
        tasks.id DESC
    `
    )
    .all() as Array<TaskRow & {
    todo_total: number;
    todo_completed: number;
    latest_progress: string | null;
    latest_progress_at: string | null;
  }>;

  return rows.map((row) => ({
    ...mapTask(row),
    todoTotal: row.todo_total,
    todoCompleted: row.todo_completed,
    latestProgress: row.latest_progress,
    latestProgressAt: row.latest_progress_at
  }));
}

export function getTask(taskId: number): TaskDetail | null {
  const row = getDb().prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as TaskRow | undefined;

  if (!row) {
    return null;
  }

  const todos = getDb()
    .prepare("SELECT * FROM todo_items WHERE task_id = ? ORDER BY sort_order ASC, id ASC")
    .all(taskId) as TodoRow[];
  const progressRecords = getDb()
    .prepare("SELECT * FROM progress_records WHERE task_id = ? ORDER BY datetime(created_at) DESC, id DESC")
    .all(taskId) as ProgressRow[];

  return {
    ...mapTask(row),
    todos: todos.map(mapTodo),
    progressRecords: progressRecords.map(mapProgress)
  };
}

export function getHistory(taskId: number): EditHistory[] {
  const rows = getDb()
    .prepare("SELECT * FROM edit_history WHERE task_id = ? ORDER BY datetime(created_at) DESC, id DESC")
    .all(taskId) as EditHistoryRow[];

  return rows.map(mapHistory);
}

export function createTask(
  goal: string,
  todos: string[],
  deadlineAt: string | null,
  priority: TaskPriority
): TaskDetail {
  const create = () =>
    transaction(() => {
      const taskResult = getDb()
        .prepare("INSERT INTO tasks (goal, deadline_at, priority) VALUES (?, ?, ?)")
        .run(goal, deadlineAt, priority);
      const taskId = Number(taskResult.lastInsertRowid);

      insertHistory(taskId, "create_task", "goal", null, goal);
      insertHistory(taskId, "create_task", "priority", null, priority);
      if (deadlineAt) {
        insertHistory(taskId, "create_task", "deadline_at", null, deadlineAt);
      }

      const todoInsert = getDb().prepare(
        "INSERT INTO todo_items (task_id, content, sort_order) VALUES (?, ?, ?)"
      );

      todos.forEach((todo, index) => {
        const result = todoInsert.run(taskId, todo, index);
        insertHistory(taskId, "create_todo", `todo:${Number(result.lastInsertRowid)}:content`, null, todo);
      });

      return taskId;
    });

  return getTask(create()) as TaskDetail;
}

export function updateTask(
  taskId: number,
  values: { goal?: string; status?: TaskStatus; deadlineAt?: string | null; priority?: TaskPriority }
): TaskDetail | null {
  const update = () =>
    transaction(() => {
      const existing = getTask(taskId);
      if (!existing) {
        return false;
      }

      if (values.goal !== undefined && values.goal !== existing.goal) {
        getDb().prepare("UPDATE tasks SET goal = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
          values.goal,
          taskId
        );
        insertHistory(taskId, "update_task", "goal", existing.goal, values.goal);
      }

      if (values.status !== undefined && values.status !== existing.status) {
        getDb().prepare("UPDATE tasks SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
          values.status,
          taskId
        );
        insertHistory(taskId, "update_task", "status", existing.status, values.status);
      }

      if (values.deadlineAt !== undefined && values.deadlineAt !== existing.deadlineAt) {
        getDb()
          .prepare("UPDATE tasks SET deadline_at = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(values.deadlineAt, taskId);
        insertHistory(taskId, "update_task", "deadline_at", existing.deadlineAt, values.deadlineAt);
      }

      if (values.priority !== undefined && values.priority !== existing.priority) {
        getDb()
          .prepare("UPDATE tasks SET priority = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
          .run(values.priority, taskId);
        insertHistory(taskId, "update_task", "priority", existing.priority, values.priority);
      }

      return true;
    });

  return update() ? getTask(taskId) : null;
}

export function createTodo(taskId: number, content: string): TaskDetail | null {
  const create = () =>
    transaction(() => {
      const task = getTask(taskId);
      if (!task) {
        return false;
      }

      const maxSortOrder = getDb()
        .prepare("SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM todo_items WHERE task_id = ?")
        .get(taskId) as { max_sort_order: number };
      const result = getDb()
        .prepare("INSERT INTO todo_items (task_id, content, sort_order) VALUES (?, ?, ?)")
        .run(taskId, content, maxSortOrder.max_sort_order + 1);

      getDb().prepare("UPDATE tasks SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(taskId);
      insertHistory(taskId, "create_todo", `todo:${Number(result.lastInsertRowid)}:content`, null, content);
      return true;
    });

  return create() ? getTask(taskId) : null;
}

export function updateTodo(
  todoId: number,
  values: { content?: string; completed?: boolean }
): TaskDetail | null {
  const update = () =>
    transaction(() => {
      const row = getDb().prepare("SELECT * FROM todo_items WHERE id = ?").get(todoId) as TodoRow | undefined;
      if (!row) {
        return null;
      }

      if (values.content !== undefined && values.content !== row.content) {
        getDb().prepare("UPDATE todo_items SET content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
          values.content,
          todoId
        );
        insertHistory(row.task_id, "update_todo", `todo:${todoId}:content`, row.content, values.content);
      }

      const completedNumber = values.completed === undefined ? undefined : values.completed ? 1 : 0;
      if (completedNumber !== undefined && completedNumber !== row.completed) {
        getDb().prepare("UPDATE todo_items SET completed = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(
          completedNumber,
          todoId
        );
        insertHistory(
          row.task_id,
          "update_todo",
          `todo:${todoId}:completed`,
          row.completed ? "已完成" : "未完成",
          completedNumber ? "已完成" : "未完成"
        );
      }

      getDb().prepare("UPDATE tasks SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(row.task_id);
      return row.task_id;
    });

  const taskId = update();
  return taskId ? getTask(taskId) : null;
}

export function deleteTodo(todoId: number): TaskDetail | null {
  const remove = () =>
    transaction(() => {
      const row = getDb().prepare("SELECT * FROM todo_items WHERE id = ?").get(todoId) as TodoRow | undefined;
      if (!row) {
        return null;
      }

      getDb().prepare("DELETE FROM todo_items WHERE id = ?").run(todoId);
      getDb().prepare("UPDATE tasks SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(row.task_id);
      insertHistory(row.task_id, "delete_todo", `todo:${todoId}:content`, row.content, null);
      return row.task_id;
    });

  const taskId = remove();
  return taskId ? getTask(taskId) : null;
}

export function createProgress(taskId: number, content: string): TaskDetail | null {
  const create = () =>
    transaction(() => {
      const task = getTask(taskId);
      if (!task) {
        return false;
      }

      getDb().prepare("INSERT INTO progress_records (task_id, content) VALUES (?, ?)").run(taskId, content);
      getDb().prepare("UPDATE tasks SET updated_at = datetime('now', 'localtime') WHERE id = ?").run(taskId);
      return true;
    });

  return create() ? getTask(taskId) : null;
}

function insertHistory(
  taskId: number,
  actionType: string,
  fieldName: string,
  oldValue: string | null,
  newValue: string | null
) {
  getDb().prepare(
    `
    INSERT INTO edit_history (task_id, action_type, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(taskId, actionType, fieldName, oldValue, newValue);
}
