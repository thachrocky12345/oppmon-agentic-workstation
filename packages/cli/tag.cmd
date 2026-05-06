@echo off
set TAG_API_URL=http://localhost:3001
node "%~dp0dist\index.js" %*
