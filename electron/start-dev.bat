@echo off
echo Starting 4DNote Electron Development Environment...

rem Check if we're in the electron directory
if not exist "package.json" (
    echo Error: Please run this script from the electron directory
    pause
    exit /b 1
)

rem Start the web development server and Electron app
echo Starting development environment...
npm run electron-dev

pause