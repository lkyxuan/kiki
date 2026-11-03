// Kiki 的原生窗口外壳。
// 两种用法（第一次打开时选，菜单「连接到…」随时改，和 Hermes 的远程网关一样前后端分离）：
//   本机：在这台电脑上运行 Kiki——登记 launchd 后台服务、等它起来，再在窗口里显示界面
//   远程：只当界面，连另一台电脑上的 Kiki（比如经 Tailscale 的 https://mac-mini.xxx.ts.net），本机不跑后台
// 关掉窗口不会停服务；点 Dock 图标再打开。外部链接用默认浏览器打开。
import Cocoa
import WebKit

// 和网页一致的背景色，免得标题栏和页面之间有色差
let pageBackground = NSColor(name: nil) { appearance in
    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? NSColor(srgbRed: 0.098, green: 0.098, blue: 0.106, alpha: 1)
        : NSColor.white
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!
    var base = URL(string: "http://localhost:4567")!  // 当前连的 Kiki
    var loaded = false
    var generation = 0  // 切换连接时作废旧的等待/重试
    var lastConnectError = ""  // 最近一次连接失败的原因，显示在「连不上」对话框里
    // 启动页（public/splash.html）：开场动画放完、后台也好了，才进主界面
    var splashOn = false      // 现在窗口里是不是启动页
    var splashReady = false   // 启动页加载完了，可以调它的 kikiSplash.*
    var splashStatus = ""     // 启动页还没加载完时先记下要显示的字
    var splashPlayed = false  // 这次打开已经放过开场动画（重新连接时不再放）
    var leaveGen = -1         // 正在等哪次连接的启动页收尾

    // 开场动画（菜单「显示 → 开场动画」可以关）
    var introOn: Bool {
        get { UserDefaults.standard.object(forKey: "intro") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "intro") }
    }
    var introItem: NSMenuItem?
    // 上次关的时候是不是全屏：是的话下次打开还是全屏
    var wasFullScreen: Bool {
        get { UserDefaults.standard.bool(forKey: "fullscreen") }
        set { UserDefaults.standard.set(newValue, forKey: "fullscreen") }
    }

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
        if message.name == "kikiConnect", let v = message.body as? String { pickFromWelcome(v); return }
        if message.name == "kikiSave", let v = message.body as? [String: Any] { saveFile(v); return }
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
        case "fullscreen":
            window.toggleFullScreen(nil)
        case "splash-done":
            // 启动页收尾动画放完了，换成真正的界面
            if leaveGen == generation { leaveGen = -1; webView.load(URLRequest(url: base)) }
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

    // 直接在 .dmg 里双击、或者从「下载」里打开时，macOS 会把 App 放到一个临时的只读位置运行（App Translocation）。
    // 这时登记的后台服务指向一个推出磁盘或重启后就没了的路径，自动更新也换不了 App，所以先请用户拖进「应用程序」。
    func runningFromTemporaryPlace() -> Bool {
        let path = Bundle.main.bundlePath
        return path.hasPrefix("/Volumes/") || path.contains("/AppTranslocation/")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if runningFromTemporaryPlace() {
            NSApp.activate(ignoringOtherApps: true)
            let a = NSAlert()
            a.messageText = "请先把 Kiki 拖进「应用程序」"
            a.informativeText = """
            Kiki 要在后台一直运行、自己更新，所以不能直接在安装盘或「下载」文件夹里打开。\
            把 Kiki 拖进「应用程序」文件夹，再从那里打开就好了。
            """
            a.addButton(withTitle: "打开「应用程序」文件夹")
            a.addButton(withTitle: "退出")
            if a.runModal() == .alertFirstButtonReturn {
                NSWorkspace.shared.open(URL(fileURLWithPath: "/Applications"))
            }
            NSApp.terminate(nil)
            return
        }
        buildMenu()
        buildWindow()
        if wasFullScreen { window.toggleFullScreen(nil) }
        if server == nil {
            if !loadSplash(mode: "welcome", status: "") { showSplash(""); chooseServer(firstTime: true) }
        } else {
            connect()
        }
        // 连远程时后台的自动更新管不到这里：打开后查一次，之后每 6 小时查一次
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { if self.isRemote { self.checkClientUpdate(manual: false) } }
        Timer.scheduledTimer(withTimeInterval: 6 * 3600, repeats: true) { _ in
            if self.isRemote { self.checkClientUpdate(manual: false) }
        }
    }

    func connect() {
        lastConnectError = ""
        generation += 1
        loaded = false
        if isRemote, let url = normalizedRemote(server!) ?? URL(string: server!) {
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
        第一次用选「在这台电脑上运行」就行。\
        如果 Kiki 已经跑在另一台电脑（比如家里的 Mac mini）上，也可以只把这里当界面：填那台电脑的地址，再点「连接远程地址」。\
        连远程时两台电脑都要开着 Tailscale，地址形如 https://mac-mini.xxx.ts.net
        """
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 340, height: 24))
        field.placeholderString = "远程地址（可不填），比如 https://mac-mini.xxx.ts.net"
        if isRemote { field.stringValue = server! }
        a.accessoryView = field
        // 第一个按钮是默认按钮（按回车就是它）：新用户直接回车就在本机跑起来；本来就连远程的，回车还是连远程
        let remoteFirst = isRemote
        a.addButton(withTitle: remoteFirst ? "连接远程地址" : "在这台电脑上运行")
        a.addButton(withTitle: remoteFirst ? "在这台电脑上运行" : "连接远程地址")
        if !firstTime { a.addButton(withTitle: "取消") }
        if remoteFirst { a.window.initialFirstResponder = field }
        a.beginSheetModal(for: window) { r in
            let local: NSApplication.ModalResponse = remoteFirst ? .alertSecondButtonReturn : .alertFirstButtonReturn
            let remote: NSApplication.ModalResponse = remoteFirst ? .alertFirstButtonReturn : .alertSecondButtonReturn
            switch r {
            case local:
                self.server = "local"
                self.connect()
            case remote:
                guard let url = self.normalizedRemote(field.stringValue) else {
                    DispatchQueue.main.async { self.chooseServer(firstTime: firstTime, error: "地址看起来不对。") }
                    return
                }
                self.server = url.absoluteString
                self.connect()
            default:
                break
            }
        }
    }

    // 启动页上的欢迎页选好了："local" 或 "remote:<地址>"
    func pickFromWelcome(_ v: String) {
        if v == "local" { server = "local"; connect(); return }
        guard v.hasPrefix("remote:") else { return }
        guard let url = normalizedRemote(String(v.dropFirst(7))) else {
            webView.evaluateJavaScript("kikiSplash.error('地址看起来不对，形如 https://mac-mini.xxx.ts.net')", completionHandler: nil)
            return
        }
        server = url.absoluteString
        connect()
    }

    func normalizedRemote(_ raw: String) -> URL? {
        var text = raw.trimmingCharacters(in: .whitespaces)
        // 只填了 IP（比如 Tailscale 的 100.x.x.x:4567）就用 http：HTTPS 证书只认 .ts.net 名字，IP 用不了；Tailscale 本身已经加密
        if !text.isEmpty && !text.contains("://") {
            let host = text.split(separator: "/").first.map(String.init) ?? text
            let isIp = host.first == "[" || host.split(separator: ":").first.map { $0.allSatisfy { $0.isNumber || $0 == "." } } == true
            text = (isIp ? "http://" : "https://") + text
        }
        while text.hasSuffix("/") { text.removeLast() }
        guard var c = URLComponents(string: text), let host = c.host, ["http", "https"].contains(c.scheme ?? "") else { return nil }
        // IP 没写端口：Kiki 在 Tailscale IP 上直接开的是 4567，补上（80/443 上没有 Kiki）
        if c.port == nil && c.scheme == "http" && (host.contains(":") || host.allSatisfy { $0.isNumber || $0 == "." }) { c.port = 4567 }
        return c.url
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
        config.userContentController.add(self, name: "kikiConnect")
        config.userContentController.add(self, name: "kikiSave")
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
        window.collectionBehavior.insert(.fullScreenPrimary)  // 绿色按钮 / ⌃⌘F 进入苹果原生全屏
        window.delegate = self
        window.contentView = webView
        applyTheme()
        window.center()
        window.setFrameAutosaveName("KikiMain")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // MARK: 启动页

    // 显示启动页上的一行状态。启动页已经在了就只换字，不重新加载（动画不会断）
    func showSplash(_ text: String) {
        if splashOn {
            splashStatus = text
            if splashReady { webView.evaluateJavaScript("kikiSplash.status(\(jsString(text)))", completionHandler: nil) }
            return
        }
        if loadSplash(mode: "wait", status: text) { return }
        showPlainSplash(text)
    }

    // 把字符串变成 JS 字面量（借 JSON 数组转义再去掉方括号）
    func jsString(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        let arr = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(arr.dropFirst().dropLast())
    }

    // 从 App 里直接读 public/splash.html（这时后台可能还没起来）。找不到就返回 false，退回到简单的转圈
    @discardableResult
    func loadSplash(mode: String, status: String) -> Bool {
        let pub = Bundle.main.resourceURL!.appendingPathComponent("app/public")
        let file = pub.appendingPathComponent("splash.html")
        guard var html = try? String(contentsOf: file, encoding: .utf8) else { return false }
        var q: [String: String] = ["mode": mode, "s": status]
        if splashPlayed || !introOn { q["quick"] = "1" }
        if window.styleMask.contains(.fullScreen) || wasFullScreen { q["fs"] = "1" }
        if isRemote { q["remote"] = server }
        // 参数直接写进页面，不拼在 file:// 网址后面：带查询参数的 loadFileURL 在有的机器上直接加载失败，窗口就停在空白页
        var c = URLComponents()
        c.queryItems = q.map { URLQueryItem(name: $0.key, value: $0.value) }
        let inject = "<script>window.KIKI_Q=\(jsString(c.percentEncodedQuery ?? ""))</script>"
        if let r = html.range(of: "<head>") { html.replaceSubrange(r, with: "<head>" + inject) } else { html = inject + html }
        splashPlayed = true
        splashOn = true
        splashReady = false
        splashStatus = status
        webView.loadHTMLString(html, baseURL: file)
        return true
    }

    // 后台好了：让启动页放完收尾（自检打勾、「欢迎回来」），它发 splash-done 回来再换界面
    func enterApp() {
        loaded = true
        // 启动页没在、或者一直没加载出来：直接进主界面，别让窗口干等
        guard splashOn, splashReady else { splashOn = false; webView.load(URLRequest(url: base)); return }
        leaveGen = generation
        if splashReady { webView.evaluateJavaScript("kikiSplash.leave()", completionHandler: nil) }
        // 万一启动页没回话，最多等 8 秒
        let gen = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) {
            if self.leaveGen == gen && gen == self.generation { self.windowAction("splash-done") }
        }
    }

    func showPlainSplash(_ text: String) {
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

    // 启动页加载完：补上加载期间来的状态；后台已经好了就让它收尾。主界面加载完：告诉它是不是全屏
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView.url?.isFileURL == true {
            guard splashOn else { return }
            splashReady = true
            webView.evaluateJavaScript("kikiSplash.status(\(jsString(splashStatus)))", completionHandler: nil)
            if leaveGen == generation { webView.evaluateJavaScript("kikiSplash.leave()", completionHandler: nil) }
        } else {
            tellFullScreen()
        }
    }

    // MARK: 全屏

    func windowDidEnterFullScreen(_ notification: Notification) { wasFullScreen = true; tellFullScreen() }
    func windowDidExitFullScreen(_ notification: Notification) { wasFullScreen = false; tellFullScreen() }
    func tellFullScreen() {
        let on = window.styleMask.contains(.fullScreen)
        webView.evaluateJavaScript("document.documentElement.classList.toggle('kiki-fullscreen', \(on)); window.kikiSplash && kikiSplash.fs(\(on))", completionHandler: nil)
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
        URLSession.shared.dataTask(with: req) { data, resp, err in
            DispatchQueue.main.async {
                guard gen == self.generation else { return }
                if let err = err { self.lastConnectError = err.localizedDescription; NSLog("Kiki 连接失败：%@", err.localizedDescription) }
                else if let code = (resp as? HTTPURLResponse)?.statusCode, code != 200 { self.lastConnectError = "服务器回了 \(code)" }
                let ok = (resp as? HTTPURLResponse)?.statusCode == 200
                    && String(data: data ?? Data(), encoding: .utf8)?.contains("\"ok\":true") == true
                if ok {
                    self.enterApp()
                } else if tries < 60 {
                    if tries == 8 {
                        self.showSplash(self.isRemote
                            ? "还没连上 \(self.base.host ?? "")，确认两台电脑都开着 Tailscale…"
                            : "Kiki 启动得有点慢，再等等…")
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.waitForServer(tries: tries + 1, gen: gen) }
                } else if self.isRemote {
                    self.showSplash("连不上 \(self.base.absoluteString)")
                    self.chooseServer(firstTime: false, error: "连不上 \(self.base.absoluteString)。" + (self.lastConnectError.isEmpty ? "" : "\n原因：\(self.lastConnectError)\n如果是「本地网络」被拦，到 系统设置 → 隐私与安全性 → 本地网络 打开 Kiki。"))
                } else {
                    self.showSplash("Kiki 没能启动。日志在 ~/Library/Logs/Kiki/server.log")
                }
            }
        }.resume()
    }

    // 服务重启（比如自动更新）时页面会断开，过一会儿自动重连
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navFailed(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navFailed(error) }
    func navFailed(_ error: Error) {
        NSLog("Kiki 页面加载失败：%@", error.localizedDescription)
        if (error as NSError).code == NSURLErrorCancelled { return }  // 被新的加载顶掉，不算失败
        // 启动页自己没加载出来：换成简单的转圈页；后台已经好了就直接进主界面
        if splashOn && !splashReady {
            splashOn = false
            if server == nil { showPlainSplash(""); chooseServer(firstTime: true) }  // 第一次打开的欢迎页没出来：退回系统对话框
            else if leaveGen == generation || loaded { leaveGen = -1; webView.load(URLRequest(url: base)) }
            else { showPlainSplash(splashStatus) }
            return
        }
        retryLater()
    }
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
        if url.scheme == "about" || url.scheme == "data" || url.isFileURL { return true }
        return url.host == base.host && url.port == base.port
    }

    // 外部链接交给默认浏览器
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, !isKiki(url) {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            if navigationAction.targetFrame?.isMainFrame != false, let url = navigationAction.request.url, !url.isFileURL {
                splashOn = false; splashReady = false  // 离开启动页
            }
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

    // 网页要存一个文件（比如导出的 .bao）：弹「存储」窗口，写好后告诉网页存没存
    func saveFile(_ v: [String: Any]) {
        guard let text = v["text"] as? String else { return }
        let name = (v["name"] as? String).map { $0.replacingOccurrences(of: "/", with: "-") } ?? "Kiki"
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.canCreateDirectories = true
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.beginSheetModal(for: window) { [weak self] r in
            var ok = false
            if r == .OK, let url = panel.url {
                ok = (try? text.write(to: url, atomically: true, encoding: .utf8)) != nil
            }
            self?.webView.evaluateJavaScript("window.kikiSaved && kikiSaved(\(ok))", completionHandler: nil)
        }
    }

    // 网页里的 <input type=file>：弹「打开」窗口
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // MARK: 菜单

    @objc func reload(_ sender: Any?) {
        if loaded { webView.reload() } else { connect() }
    }

    @objc func openInBrowser(_ sender: Any?) {
        NSWorkspace.shared.open(base)
    }

    // MARK: 客户端自己更新
    // 连远程时本机不跑后台，后台的自动更新管不到这个窗口程序；本机后台起不来时也一样。
    // 所以窗口程序自己查 GitHub 最新版，有新版就问一声，换成新 App 再打开。

    var clientVersion: String { Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0" }
    var askedClientUpdate = false  // 这次打开已经问过了，就不再自动弹

    func newer(_ a: String, than b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }, y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }

    @objc func checkClientUpdateMenu(_ sender: Any?) { checkClientUpdate(manual: true) }

    func checkClientUpdate(manual: Bool) {
        var req = URLRequest(url: URL(string: "https://api.github.com/repos/lkyxuan/kiki/releases/latest")!)
        req.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        req.timeoutInterval = 20
        URLSession.shared.dataTask(with: req) { data, _, error in
            let tag = (data.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any])?["tag_name"] as? String
            DispatchQueue.main.async {
                guard let tag = tag else {
                    if manual { self.info("查不到新版本", "连不上 GitHub：\(error?.localizedDescription ?? "返回的内容不对")") }
                    return
                }
                let latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
                if !self.newer(latest, than: self.clientVersion) {
                    if manual { self.info("已经是最新版", "这个 Kiki 窗口程序是 \(self.clientVersion)。") }
                    return
                }
                if !manual && self.askedClientUpdate { return }
                self.askedClientUpdate = true
                NSApp.activate(ignoringOtherApps: true)
                let a = NSAlert()
                a.messageText = "Kiki 有新版本 \(latest)"
                a.informativeText = "这台电脑上的 Kiki 是 \(self.clientVersion)。现在更新会关掉窗口，下载新版，换好后自动重新打开，大约一两分钟。" +
                    (self.isRemote ? "\n\n只更新这台电脑上的程序；远程那台 Kiki 在它的设置里更新。" : "")
                a.addButton(withTitle: "现在更新")
                a.addButton(withTitle: "以后")
                if a.runModal() == .alertFirstButtonReturn { self.runClientUpdate() }
            }
        }.resume()
    }

    func runClientUpdate() {
        // 本机后台活着就交给它更新：它会等手上的对话、后台任务跑完再换，界面上也有进度
        if !isRemote && loaded {
            post("api/update/check") { _ in self.post("api/update/apply") { ok in
                if !ok { DispatchQueue.main.async { self.info("后台没能开始更新", "到「设置 → 更新」里看详情和日志。") } }
            } }
            return
        }
        runStandaloneUpdate()
    }

    func post(_ path: String, done: @escaping (Bool) -> Void) {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.timeoutInterval = 30
        URLSession.shared.dataTask(with: req) { _, res, _ in
            done((res as? HTTPURLResponse).map { $0.statusCode < 400 } ?? false)
        }.resume()
    }

    // 后台不在（连远程，或本机后台起不来）：自己下载新 App 换上
    func runStandaloneUpdate() {
        guard let src = Bundle.main.resourceURL?.appendingPathComponent("client-update.sh"),
              FileManager.default.fileExists(atPath: src.path) else {
            info("没法自动更新", "这个版本里缺少更新脚本，请重新下载安装一次。")
            return
        }
        // 先把脚本拷出去：更新时整个 App 会被换掉
        let script = FileManager.default.temporaryDirectory.appendingPathComponent("kiki-client-update.sh")
        try? FileManager.default.removeItem(at: script)
        do { try FileManager.default.copyItem(at: src, to: script) } catch {
            info("没法自动更新", error.localizedDescription)
            return
        }
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/bin/bash")
        p.arguments = [script.path, Bundle.main.bundlePath, String(ProcessInfo.processInfo.processIdentifier), isRemote ? "remote" : "local"]
        do { try p.run() } catch {
            info("没法自动更新", error.localizedDescription)
            return
        }
        NSApp.terminate(nil)
    }

    func info(_ title: String, _ text: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = text
        a.runModal()
    }

    @objc func showLogs(_ sender: Any?) {
        let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Kiki")
        NSWorkspace.shared.open(logs)
    }

    @objc func showData(_ sender: Any?) {
        let data = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("kiki-data")
        NSWorkspace.shared.open(data)
    }

    @objc func toggleIntro(_ sender: Any?) {
        introOn.toggle()
        introItem?.state = introOn ? .on : .off
    }

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let app = NSMenu()
        app.addItem(withTitle: "关于 Kiki", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(withTitle: "检查 App 更新…", action: #selector(checkClientUpdateMenu(_:)), keyEquivalent: "")
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
        let intro = view.addItem(withTitle: "开场动画", action: #selector(toggleIntro(_:)), keyEquivalent: "")
        intro.state = introOn ? .on : .off
        introItem = intro
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
