// 复制本文件为 config.js 并填入你的 Claude API key 后，页面会自动调用 Claude 实时生成。
// 不填 / 不创建 config.js 时，页面以「本地规则引擎(DEMO)」模式跑通完整流程，无需联网。
//
//   cp config.example.js config.js   然后编辑 config.js
//
// ⚠️ config.js 已在 .gitignore 中排除，不会被提交。多人共用同一 key 时注意限流与成本(见 PRD G8)。
window.APP_CONFIG = {
  // 填入后启用 Claude 实时生成；留空则用本地规则引擎 DEMO 模式
  CLAUDE_API_KEY: "",
  CLAUDE_MODEL: "claude-opus-4-8",
  // 浏览器直连 Anthropic API 需要此 header；如经代理可改为你的代理地址
  CLAUDE_API_BASE: "https://api.anthropic.com/v1/messages"
};
