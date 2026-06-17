@echo off
chcp 65001 >nul
echo.
echo =====================================================
echo   CloudVault — 启动开发环境
echo =====================================================
echo.

:: 检查 pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未找到 pnpm，请先执行: npm install -g pnpm
  pause
  exit /b 1
)

:: 检查 node 版本
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [信息] Node.js %NODE_VER%

:: 安装依赖（首次或更新后需要）
if not exist "node_modules" (
  echo [信息] 安装依赖中...
  pnpm install
)
if not exist "packages\server\node_modules" (
  echo [信息] 安装 server 依赖中...
  pnpm install
)
if not exist "packages\client\node_modules" (
  echo [信息] 安装 client 依赖中...
  pnpm install
)

echo.
echo [信息] 启动服务 (Ctrl+C 退出)
echo   后端: http://127.0.0.1:3721
echo   前端: http://localhost:5173
echo.

pnpm dev
