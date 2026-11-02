// Kiki 的原生窗口外壳。
// 两种用法（第一次打开时选，菜单「连接到…」随时改，和 Hermes 的远程网关一样前后端分离）：
//   本机：在这台电脑上运行 Kiki——登记 launchd 后台服务、等它起来，再在窗口里显示界面
//   远程：只当界面，连另一台电脑上的 Kiki（比如经 Tailscale 的 https://mac-mini.xxx.ts.net:8888），本机不跑后台
// 关掉窗口不会停服务；点 Dock 图标再打开。外部链接用默认浏览器打开。
import Cocoa
import WebKit

// 和网页一致的背景色，免得标题栏和页面之间有色差
let pageBackground = NSColor(name: nil) { appearance in
    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? NSColor(srgbRed: 0.098, green: 0.098, blue: 0.106, alpha: 1)
        : NSColor.white
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var base = URL(string: "http://localhost:4567")!  // 当前连的 Kiki
    var loaded = false
    var generation = 0  // 切换连接时作废旧的等待/重试

    // 保存的选择："local" 或远程地址；nil 表示还没选过
    var server: String? {
        get { UserDefaults.standard.string(forKey: "server") }
        set { UserDefaults.standard.set(newValue, forKey: "server") }
    }
    var isRemote: Bool { server != nil && server != "local" }

    // 外观："system" / "light" / "dark"。网页（设置 → 外观）改了会发消息过来，标题栏跟着变
    var theme: String {
        get { UserDefaults.standard.string(forKey: "theme") ?? "system" }
        set { UserDefaults.standard.set(newValue, forKey: "theme") }
    }
    var themeItems: [NSMenuItem] = []

    func applyTheme() {
        switch theme {
        case "light": window?.appearance = NSAppearance(named: .aqua)
        case "dark": window?.appearance = NSAppearance(named: .darkAqua)
        default: window?.appearance = nil
        }
        for item in themeItems { item.state = (item.representedObject as? String) == theme ? .on : .off }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "kikiWindow", let v = message.body as? String { windowAction(v); return }
        guard message.name == "kikiTheme", let v = message.body as? String, ["system", "light", "dark"].contains(v) else { return }
        theme = v
        applyTheme()
    }

    // 标题栏是透明的、网页铺满整个窗口，所以顶部空白处的拖动和双击由网页告诉这里
    func windowAction(_ v: String) {
        switch v {
        case "drag":
            if let e = NSApp.currentEvent, e.type == .leftMouseDown || e.type == .leftMouseDragged { window.performDrag(with: e) }
        case "zoom":
            // 跟随「系统设置 → 桌面与程序坞 → 连按窗口标题栏」的选择
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.performMiniaturize(nil)
            case "None": break
            default: window.zoom(nil)
            }
        default: break
        }
    }

    // 菜单「显示 → 外观」：交给网页去改（网页记住选择，再发消息回来）
    @objc func pickTheme(_ sender: NSMenuItem) {
        guard let v = sender.representedObject as? String else { return }
        theme = v
        applyTheme()
        webView.evaluateJavaScript("window.kikiTheme && kikiTheme.set('\(v)')", completionHandler: nil)
    }

    // 菜单「设置…」（⌘,）：在网页里打开设置弹窗
    @objc func openSettings(_ sender: Any?) {
        webView.evaluateJavaScript("window.kikiOpenSettings && kikiOpenSettings()", completionHandler: nil)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        if server == nil {
            showSplash("")
            chooseServer(firstTime: true)
        } else {
            connect()
        }
    }

    func connect() {
        generation += 1
        loaded = false
        if isRemote, let url = URL(string: server!) {
            base = url
            showSplash("正在连接 \(url.host ?? "")…")
            waitForServer(tries: 0, gen: generation)
        } else {
            showSplash("正在启动 Kiki…")
            startBackend(gen: generation)
        }
    }

    // MARK: 选择连哪个 Kiki

    @objc func changeServer(_ sender: Any?) { chooseServer(firstTime: false) }

    func chooseServer(firstTime: Bool, error: String? = nil) {
        let a = NSAlert()
        a.messageText = firstTime ? "欢迎使用 Kiki" : "连接到哪个 Kiki？"
        a.informativeText = (error.map { $0 + "\n\n" } ?? "") + """
        在这台电脑上运行 Kiki；或者只把这里当界面，连接另一台电脑（比如家里的 Mac mini）上的 Kiki。\
        连远程时两台电脑都要开着 Tailscale，地址形如 https://mac-mini.xxx.ts.net:8888
        """
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.placeholderString = "远程地址，比如 https://mac-mini.xxx.ts.net:8888"
        if isRemote { field.stringValue = server! }
        a.accessoryView = field
        a.addButton(withTitle: "连接远程地址")
        a.addButton(withTitle: "在这台电脑上运行")
        if !firstTime { a.addButton(withTitle: "取消") }
        a.window.initialFirstResponder = field
        a.beginSheetModal(for: window) { r in
            switch r {
            case .alertFirstButtonReturn:
                var text = field.stringValue.trimmingCharacters(in: .whitespaces)
                if !text.isEmpty && !text.contains("://") { text = "https://" + text }
                while text.hasSuffix("/") { text.removeLast() }
                guard let url = URL(string: text), url.host != nil, ["http", "https"].contains(url.scheme ?? "") else {
                    DispatchQueue.main.async { self.chooseServer(firstTime: firstTime, error: "地址看起来不对。") }
                    return
                }
                self.server = url.absoluteString
                self.connect()
            case .alertSecondButtonReturn:
                self.server = "local"
                self.connect()
            default:
                break
            }
        }
    }

    // 点 Dock 图标时把窗口叫回来
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    // MARK: 窗口

    func buildWindow() {
        let config = WKWebViewConfiguration()
        // 告诉网页自己在 App 里（网页可以据此微调样式）
        let script = WKUserScript(
            source: "document.documentElement.classList.add('kiki-app', 'kiki-fullsize')",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)
        config.userContentController.add(self, name: "kikiTheme")
        config.userContentController.add(self, name: "kikiWindow")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = false

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false)
        window.title = "Kiki"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        // 网页一直铺到窗口顶上，红绿灯落在左栏上，没有单独的一条标题栏
        if #available(macOS 11.0, *) { window.titlebarSeparatorStyle = .none }
        window.backgroundColor = pageBackground
        window.minSize = NSSize(width: 720, height: 480)
        window.isReleasedWhenClosed = false
        window.contentView = webView
        applyTheme()
        window.center()
        window.setFrameAutosaveName("KikiMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func showSplash(_ text: String) {
        let html = """
        <html><head><meta charset="utf-8"><style>
        html,body{height:100%;margin:0;background:transparent;font:15px -apple-system,"PingFang SC",sans-serif;color:#8a8984}
        body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px}
        .s{width:22px;height:22px;border:2.5px solid #5b6cf0;border-top-color:transparent;border-radius:50%;animation:r .8s linear infinite}
        @keyframes r{to{transform:rotate(360deg)}}
        </style></head><body><div class="s"></div><div>\(text)</div>
        <script>document.onmousedown=function(e){if(e.button===0)try{webkit.messageHandlers.kikiWindow.postMessage(e.detail===2?"zoom":"drag")}catch(x){}}</script>
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: 后台服务

    func startBackend(gen: Int) {
        let setup = Bundle.main.resourceURL!.appendingPathComponent("kiki-setup")
        DispatchQueue.global().async {
            let p = Process()
            p.executableURL = setup
            let out = Pipe()
            p.standardOutput = out
            p.standardError = FileHandle.nullDevice
            try? p.run()
            p.waitUntilExit()
            let text = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let port = text.split(separator: "\n").last.flatMap { Int($0) } ?? 4567
            DispatchQueue.main.async {
                guard gen == self.generation else { return }
                self.base = URL(string: "http://localhost:\(port)")!
                self.waitForServer(tries: 0, gen: gen)
            }
        }
    }

    func waitForServer(tries: Int, gen: Int) {
        var req = URLRequest(url: base.appendingPathComponent("api/health"))
        req.timeoutInterval = 3
        URLSession.shared.dataTask(with: req) { data, resp, _ in
            DispatchQueue.main.async {
                guard gen == self.generation else { return }
                let ok = (resp as? HTTPURLResponse)?.statusCode == 200
                    && String(data: data ?? Data(), encoding: .utf8)?.contains("\"ok\":true") == true
                if ok {
                    self.loaded = true
                    self.webView.load(URLRequest(url: self.base))
                } else if tries < 60 {
                    if tries == 8 {
                        self.showSplash(self.isRemote
                            ? "还没连上 \(self.base.host ?? "")，确认两台电脑都开着 Tailscale…"
                            : "Kiki 启动得有点慢，再等等…")
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.waitForServer(tries: tries + 1, gen: gen) }
                } else if self.isRemote {
                    self.showSplash("连不上 \(self.base.absoluteString)")
                    self.chooseServer(firstTime: false, error: "连不上 \(self.base.absoluteString)。")
                } else {
                    self.showSplash("Kiki 没能启动。日志在 ~/Library/Logs/Kiki/server.log")
                }
            }
        }.resume()
    }

    // 服务重启（比如自动更新）时页面会断开，过一会儿自动重连
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retryLater() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { retryLater() }
    func retryLater() {
        guard loaded else { return }
        loaded = false
        showSplash("正在重新连接 Kiki…")
        let gen = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.waitForServer(tries: 0, gen: gen) }
    }

    // MARK: 链接

    // 是不是 Kiki 自己的页面（不是就交给浏览器）
    func isKiki(_ url: URL?) -> Bool {
        guard let url = url else { return true }
        if url.scheme == "about" || url.scheme == "data" { return true }
        return url.host == base.host && url.port == base.port
    }

    // 外部链接交给默认浏览器
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, !isKiki(url) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    // target="_blank" 的链接
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // 网页里的 alert / confirm
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert()
        a.messageText = message
        a.addButton(withTitle: "好")
        a.addButton(withTitle: "取消")
        a.beginSheetModal(for: window) { r in completionHandler(r == .alertFirstButtonReturn) }
    }

    // MARK: 菜单

    @objc func reload(_ sender: Any?) {
        if loaded { webView.reload() } else { connect() }
    }

    @objc func openInBrowser(_ sender: Any?) {
        NSWorkspace.shared.open(base)
    }

    @objc func showLogs(_ sender: Any?) {
        let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Kiki")
        NSWorkspace.shared.open(logs)
    }

    @objc func showData(_ sender: Any?) {
        let data = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("kiki-data")
        NSWorkspace.shared.open(data)
    }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let app = NSMenu()
        app.addItem(withTitle: "关于 Kiki", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "设置…", action: #selector(openSettings(_:)), keyEquivalent: ",")
        let conn = app.addItem(withTitle: "连接到…", action: #selector(changeServer(_:)), keyEquivalent: "k")
        conn.keyEquivalentModifierMask = [.command, .shift]
        app.addItem(.separator())
        app.addItem(withTitle: "打开数据文件夹", action: #selector(showData(_:)), keyEquivalent: "")
        app.addItem(withTitle: "打开日志文件夹", action: #selector(showLogs(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "隐藏 Kiki", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = app.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        app.addItem(.separator())
        app.addItem(withTitle: "退出 Kiki 窗口（后台继续运行）", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = app
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let viewItem = NSMenuItem()
        let view = NSMenu(title: "显示")
        view.addItem(withTitle: "重新载入", action: #selector(reload(_:)), keyEquivalent: "r")
        view.addItem(withTitle: "在浏览器中打开", action: #selector(openInBrowser(_:)), keyEquivalent: "")
        view.addItem(.separator())
        let lookItem = NSMenuItem(title: "外观", action: nil, keyEquivalent: "")
        let look = NSMenu(title: "外观")
        for (title, value) in [("跟随系统", "system"), ("浅色", "light"), ("深色", "dark")] {
            let item = look.addItem(withTitle: title, action: #selector(pickTheme(_:)), keyEquivalent: "")
            item.representedObject = value
            themeItems.append(item)
        }
        lookItem.submenu = look
        view.addItem(lookItem)
        view.addItem(.separator())
        let full = view.addItem(withTitle: "进入全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = view
        main.addItem(viewItem)

        let winItem = NSMenuItem()
        let win = NSMenu(title: "窗口")
        win.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        winItem.submenu = win
        main.addItem(winItem)
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
