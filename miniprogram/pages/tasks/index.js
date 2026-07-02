const { request, showError } = require("../../utils/request");

const SIDEBAR_STATUSES = ["进行中", "未开始", "已完成"];

function formatTime(value) {
  if (!value) return "暂无";
  return String(value).replace("T", " ").slice(0, 16);
}

function parseLocalTime(value) {
  if (!value) return null;
  const timestamp = new Date(String(value).replace(" ", "T")).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getTimeProgress(task) {
  const created = parseLocalTime(task.createdAt);
  const deadline = parseLocalTime(task.deadlineAt);
  const now = Date.now();

  if (!created || !deadline || deadline <= created) {
    return { percent: 0, timeLabel: "未设置 DDL", tone: "none" };
  }

  const total = deadline - created;
  const elapsed = now - created;
  const remaining = deadline - now;
  const percent = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));

  if (remaining <= 0) {
    return { percent: 100, timeLabel: "已超过 DDL", tone: "overdue" };
  }

  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  return {
    percent,
    timeLabel: hours <= 24 ? `剩余 ${hours} 小时` : `剩余 ${Math.ceil(hours / 24)} 天`,
    tone: hours <= 24 ? "urgent" : "normal"
  };
}

Page({
  data: {
    loading: true,
    groups: []
  },

  onShow() {
    this.loadTasks();
  },

  async loadTasks() {
    this.setData({ loading: true });
    try {
      const data = await request("/api/tasks");
      const tasks = (data.tasks || []).map((task) => ({
        ...task,
        deadlineText: formatTime(task.deadlineAt),
        ...getTimeProgress(task)
      }));
      const groups = SIDEBAR_STATUSES.map((status) => ({
        status,
        tasks: tasks.filter((task) => task.status === status)
      }));
      this.setData({ groups, loading: false });
    } catch (error) {
      this.setData({ loading: false });
      showError(error);
    }
  },

  goCreate() {
    wx.navigateTo({ url: "/pages/create/index" });
  },

  goDetail(event) {
    wx.navigateTo({ url: `/pages/detail/index?id=${event.currentTarget.dataset.id}` });
  }
});
