@echo off
setlocal

set "ROOT_DIR=%~dp0.."

mkdir "%ROOT_DIR%\.github\workflows" 2>nul
mkdir "%ROOT_DIR%\assets\scripts\charts" 2>nul
mkdir "%ROOT_DIR%\assets\scripts\data" 2>nul
mkdir "%ROOT_DIR%\assets\scripts\ui" 2>nul
mkdir "%ROOT_DIR%\assets\styles\components" 2>nul
mkdir "%ROOT_DIR%\collector\bin" 2>nul
mkdir "%ROOT_DIR%\collector\config" 2>nul
mkdir "%ROOT_DIR%\collector\src\commands" 2>nul
mkdir "%ROOT_DIR%\collector\src\contracts" 2>nul
mkdir "%ROOT_DIR%\collector\src\data" 2>nul
mkdir "%ROOT_DIR%\collector\src\exceptions" 2>nul
mkdir "%ROOT_DIR%\collector\src\normalizers" 2>nul
mkdir "%ROOT_DIR%\collector\src\providers\stocks" 2>nul
mkdir "%ROOT_DIR%\collector\src\providers\gold" 2>nul
mkdir "%ROOT_DIR%\collector\src\repositories" 2>nul
mkdir "%ROOT_DIR%\collector\src\services" 2>nul
mkdir "%ROOT_DIR%\collector\src\support" 2>nul
mkdir "%ROOT_DIR%\collector\src\validators" 2>nul
mkdir "%ROOT_DIR%\collector\tests\unit" 2>nul
mkdir "%ROOT_DIR%\collector\tests\integration" 2>nul
mkdir "%ROOT_DIR%\collector\tests\fixtures" 2>nul
mkdir "%ROOT_DIR%\data\stocks" 2>nul
mkdir "%ROOT_DIR%\data\gold" 2>nul
mkdir "%ROOT_DIR%\data\corporate-actions" 2>nul
mkdir "%ROOT_DIR%\data\exports" 2>nul
mkdir "%ROOT_DIR%\scripts" 2>nul
mkdir "%ROOT_DIR%\docs" 2>nul

echo Project folders initialized successfully.
