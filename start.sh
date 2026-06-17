#!/usr/bin/env bash
set -e

echo ""
echo "====================================================="
echo "  CloudVault — 启动开发环境"
echo "====================================================="
echo ""

# 检查 pnpm
if ! command -v pnpm &>/dev/null; then
  echo "[错误] 未找到 pnpm，请先执行: npm install -g pnpm"
  exit 1
fi

echo "[信息] Node.js $(node -v)  pnpm $(pnpm -v)"

# 安装依赖（首次或 package.json 变更后）
if [ ! -d "node_modules" ] || [ ! -d "packages/server/node_modules" ]; then
  echo "[信息] 安装依赖中..."
  pnpm install
fi

echo ""
echo "[信息] 启动服务 (Ctrl+C 退出)"
echo "  后端: http://127.0.0.1:3721"
echo "  前端: http://localhost:5173"
echo ""

pnpm dev
