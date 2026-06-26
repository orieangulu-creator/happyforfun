// config.js 是【可选】的本地覆盖，且【不再包含任何机密】。
//
// 生产环境下，Claude API key 只存在于服务端环境变量（见 .env.example / README），
// 浏览器永远不会拿到 key——前端只调用同源的 /api/generate，由后端带 key 转发。
//
// 本文件唯一用途：本地开发时覆盖后端地址（例如指向另一个端口的代理）。不填则默认 "/api/generate"。
// 纯静态打开（python -m http.server，无 /api）时会自动回落到本地 DEMO 规则引擎，无需任何配置。
//
//   cp config.example.js config.js   # 仅在需要自定义 API_BASE 时
window.APP_CONFIG = {
  // 后端代理地址，默认同源 /api/generate；一般无需修改
  API_BASE: "/api/generate"
};
