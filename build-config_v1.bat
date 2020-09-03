@echo off

cd ..\DesignData
@echo %cd%
svn update
@echo ¸üÐÂÅäÖÃ±í
ping 127.0.0.1 -n 1 > nul

cd /d %~dp0
@echo %cd%
node parseConfig.js config_v1
pause