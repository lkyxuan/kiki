// Kiki 的原生窗口外壳。
// 后台服务（Node）由 launchd 运行；这个 App 只负责：登记并等服务起来 → 在原生窗口里显示 Kiki 的界面。
// 关掉窗口不会停服务；点 Dock 图标再打开。外部链接用默认浏览器打开。
import Cocoa
import WebKit

// 和网页一致的背景色，免得标题栏和页面之间有色差
let pageBackground = NSColor(name: nil) { appearance in
    appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? NSColor(srgbRed: 0.106, green: 0.106, blue: 0.114, alpha: 1)
        : NSColor.white
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var port = "4567"
    var loaded = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        showSplash("正在启动 Kiki…")
        startBackend()
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
            source: "document.documentElement.classList.add('kiki-app')",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(script)
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsBackForwardNavigationGestures = false

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 780),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Kiki"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.backgroundColor = pageBackground
        window.minSize = NSSize(width: 720, height: 480)
        window.isReleasedWhenClosed = false
        window.contentView = webView
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
        </style></head><body><div class="s"></div><div>\(text)</div></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: 后台服务

    func startBackend() {
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
            if let last = text.split(separator: "\n").last, Int(last) != nil { self.port = String(last) }
            DispatchQueue.main.async { self.waitForServer(tries: 0) }
        }
    }

    func waitForServer(tries: Int) {
        let url = URL(string: "http://127.0.0.1:\(port)/api/health")!
        var req = URLRequest(url: url)
        req.timeoutInterval = 2
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            DispatchQueue.main.async {
                if (resp as? HTTPURLResponse)?.statusCode == 200 {
                    self.loaded = true
                    self.webView.load(URLRequest(url: URL(string: "http://localhost:\(self.port)/")!))
                } else if tries < 60 {
                    if tries == 10 { self.showSplash("Kiki 启动得有点慢，再等等…") }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.waitForServer(tries: tries + 1) }
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
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.waitForServer(tries: 0) }
    }

    // MARK: 链接

    static func isLocal(_ url: URL?) -> Bool {
        guard let url = url else { return true }
        if url.scheme == "about" || url.scheme == "data" { return true }
        return url.host == "localhost" || url.host == "127.0.0.1"
    }

    // 外部链接交给默认浏览器
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, !AppDelegate.isLocal(url) {
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
        if loaded { webView.reload() } else { waitForServer(tries: 0) }
    }

    @objc func openInBrowser(_ sender: Any?) {
        NSWorkspace.shared.open(URL(string: "http://localhost:\(port)/")!)
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
