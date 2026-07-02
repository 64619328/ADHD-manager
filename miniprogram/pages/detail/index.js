const { request, showError } = require("../../utils/request");

function formatTime(value) {
  if (!value) return "暂无";
  return String(value).replace("T", " ").slice(0, 16);
}

function splitDeadline(value) {
  if (!value) return { deadlineDate: "", deadlineTime: "" };
  const text = String(value).replace("T", " ");
  return {
    deadlineDate: text.slice(0, 10),
    deadlineTime: text.slice(11, 16)
  };
}

function decorateTask(task) {
  return {
    ...task,
    updatedText: formatTime(task.updatedAt),
    progressRecords: (task.progressRecords || []).map((record) => ({
      ...record,
      createdText: formatTime(record.createdAt)
    }))
  };
}

Page({
  data: {
    id: null,
    task: null,
    goalDraft: "",
    deadlineDate: "",
    deadlineTime: "",
    newTodo: "",
    progressDraft: "",
    todoCompleted: 0,
    loading: true,
    saving: false,
    statuses: ["未开始", "进行中", "已完成"],
    priorities: ["P0", "P1", "P2", "P3"]
  },

  onLoad(options) {
    this.setData({ id: Number(options.id) });
    this.loadTask();
  },

  async loadTask() {
    this.setData({ loading: true });
    try {
      const data = await request(`/api/tasks/${this.data.id}`);
      const task = decorateTask(data.task);
      this.setData({
        task,
        goalDraft: task.goal,
        ...splitDeadline(task.deadlineAt),
        todoCompleted: task.todos.filter((todo) => todo.completed).length,
        loading: false
      });
    } catch (error) {
      this.setData({ loading: false });
      showError(error);
    }
  },

  onGoalInput(event) {
    this.setData({ goalDraft: event.detail.value });
  },

  onDateChange(event) {
    this.setData({ deadlineDate: event.detail.value });
  },

  onTimeChange(event) {
    this.setData({ deadlineTime: event.detail.value });
  },

  onNewTodoInput(event) {
    this.setData({ newTodo: event.detail.value });
  },

  onProgressInput(event) {
    this.setData({ progressDraft: event.detail.value });
  },

  async patchTask(values) {
    this.setData({ saving: true });
    try {
      const data = await request(`/api/tasks/${this.data.id}`, {
        method: "PATCH",
        data: values
      });
      const task = decorateTask(data.task);
      this.setData({
        task,
        goalDraft: task.goal,
        ...splitDeadline(task.deadlineAt),
        todoCompleted: task.todos.filter((todo) => todo.completed).length
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ saving: false });
    }
  },

  saveGoal() {
    const goal = this.data.goalDraft.trim();
    if (!goal) {
      wx.showToast({ title: "任务目标不能为空", icon: "none" });
      return;
    }
    this.patchTask({ goal });
  },

  saveDeadline() {
    const deadlineAt =
      this.data.deadlineDate && this.data.deadlineTime ? `${this.data.deadlineDate}T${this.data.deadlineTime}` : null;
    this.patchTask({ deadlineAt });
  },

  changeStatus(event) {
    this.patchTask({ status: event.currentTarget.dataset.value });
  },

  changePriority(event) {
    this.patchTask({ priority: event.currentTarget.dataset.value });
  },

  async addTodo() {
    const content = this.data.newTodo.trim();
    if (!content) return;

    this.setData({ saving: true });
    try {
      const data = await request(`/api/tasks/${this.data.id}/todos`, {
        method: "POST",
        data: { content }
      });
      const task = decorateTask(data.task);
      this.setData({
        task,
        newTodo: "",
        todoCompleted: task.todos.filter((todo) => todo.completed).length
      });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ saving: false });
    }
  },

  async toggleTodo(event) {
    const id = event.currentTarget.dataset.id;
    const completed = event.currentTarget.dataset.completed;
    try {
      const data = await request(`/api/todos/${id}`, {
        method: "PATCH",
        data: { completed: !completed }
      });
      const task = decorateTask(data.task);
      this.setData({
        task,
        todoCompleted: task.todos.filter((todo) => todo.completed).length
      });
    } catch (error) {
      showError(error);
    }
  },

  async deleteTodo(event) {
    const id = event.currentTarget.dataset.id;
    try {
      const data = await request(`/api/todos/${id}`, { method: "DELETE" });
      const task = decorateTask(data.task);
      this.setData({
        task,
        todoCompleted: task.todos.filter((todo) => todo.completed).length
      });
    } catch (error) {
      showError(error);
    }
  },

  async addProgress() {
    const content = this.data.progressDraft.trim();
    if (!content) return;

    this.setData({ saving: true });
    try {
      const data = await request(`/api/tasks/${this.data.id}/progress`, {
        method: "POST",
        data: { content }
      });
      const task = decorateTask(data.task);
      this.setData({ task, progressDraft: "" });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ saving: false });
    }
  }
});
