#!/bin/bash
# 没法编译原生窗口时（比如在 Linux 上打包）的退路：登记服务后用浏览器打开
exec "$(dirname "$0")/../Resources/kiki-setup" --open
