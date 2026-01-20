@echo off
echo Cleaning up old dependencies (node_modules and package-lock.json)...
IF EXIST node_modules (
    rd /s /q node_modules
)
IF EXIST package-lock.json (
    del package-lock.json
)

echo.
echo Installing all project dependencies from package.json...
npm install

echo.
echo All dependencies are installed.

echo.
echo You can now start the application by running:
echo npm start

pause
