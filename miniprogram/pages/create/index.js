const { request, showError } = require("../../utils/request");

Page({
  data: {
    goal: "",
    todosText: "",
    deadlineDate: "",
    deadlineTime: "",
    priority: "P2",
    priorities: ["P0", "P1", "P2", "P3"],
    saving: false
  },

  onGoalInput(event) {
    this.setData({ goal: event.detail.value });
  },

  onTodosInput(event) {
    this.setData({ todosText: event.detail.value });
  },

  onDateChange(event) {
    this.setData({ deadlineDate: event.detail.value });
  },

  onTimeChange(event) {
    this.setData({ deadlineTime: event.detail.value });
  },

  choosePriority(event) {
    this.setData({ priority: event.currentTarget.dataset.value });
  },

  async submit() {
    const goal = this.data.goal.trim();
    if (!goal) {
      wx.showToast({ title: "任务目标不能为空", icon: "none" });
      return;
    }

    const todos = this.data.todosText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const deadlineAt =
      this.data.deadlineDate && this.data.deadlineTime ? `${this.data.deadlineDate}T${this.data.deadlineTime}` : null;

    this.setData({ saving: true });
    try {
      const data = await request("/api/tasks", {
        method: "POST",
        data: {
          goal,
          todos,
          deadlineAt,
          priority: this.data.priority
        }
      });
      wx.redirectTo({ url: `/pages/detail/index?id=${data.task.id}` });
    } catch (error) {
      showError(error);
    } finally {
      this.setData({ saving: false });
    }
  }
});
