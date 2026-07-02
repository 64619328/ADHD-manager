function request(path, options = {}) {
  const app = getApp();
  const baseUrl = app.globalData.apiBaseUrl.replace(/\/$/, "");

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${path}`,
      method: options.method || "GET",
      data: options.data || undefined,
      header: {
        "content-type": "application/json"
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }

        reject(new Error((res.data && res.data.error) || "请求失败"));
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络请求失败"));
      }
    });
  });
}

function showError(error) {
  wx.showToast({
    title: error && error.message ? error.message : "操作失败",
    icon: "none"
  });
}

module.exports = {
  request,
  showError
};
