//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/jchv/go-webview2/pkg/edge"
	"golang.org/x/sys/windows"
)

const (
	hotkeyFileName  = "hotkey.txt"
	aliveFileName   = "launcher-alive.txt"
	clientIndexHTML = "client/index.html"
	shellFlagJS     = "window.__FXSHELL__ = 1;"
	mutexName       = "Local\\QuickYantraFxSearchShell"
	hotkeyID        = 0x51
	probeID         = 0x52
	timerID         = 1
	staleAfterMS    = 20000
	defaultW        = 264
	defaultH        = 270
	wsPopup         = 0x80000000
	wsExTopmost     = 0x00000008
	wsExToolwindow  = 0x00000080
	swHide          = 0
	swShow          = 5
	swpNoMove       = 0x0002
	swpNoActivate   = 0x0010
	swpShowWindow   = 0x0040
	wmHotkey        = 0x0312
	wmTimer         = 0x0113
	wmSize          = 0x0005
	wmDestroy       = 0x0002
	modAlt          = 0x0001
	modControl      = 0x0002
	modShift        = 0x0004
	modWin          = 0x0008
	modNoRepeat     = 0x4000
	vkSpace         = 32
	inputKeyboard   = 1
	keyeventfKeyup  = 0x0002
)

var hwndTopmost = ^uintptr(0)

var (
	user32               = windows.NewLazySystemDLL("user32.dll")
	procRegisterHotKey   = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey = user32.NewProc("UnregisterHotKey")
	procSetWindowPos     = user32.NewProc("SetWindowPos")
	procShowWindow       = user32.NewProc("ShowWindow")
	procSetForeground    = user32.NewProc("SetForegroundWindow")
	procGetCursorPos     = user32.NewProc("GetCursorPos")
	procSetTimer         = user32.NewProc("SetTimer")
	procSendInput        = user32.NewProc("SendInput")
	procRegisterClassExW = user32.NewProc("RegisterClassExW")
	procCreateWindowExW  = user32.NewProc("CreateWindowExW")
	procDefWindowProcW   = user32.NewProc("DefWindowProcW")
	procGetMessageW      = user32.NewProc("GetMessageW")
	procTranslateMessage = user32.NewProc("TranslateMessage")
	procDispatchMessageW = user32.NewProc("DispatchMessageW")
	procPostQuitMessage  = user32.NewProc("PostQuitMessage")
	kernel32             = windows.NewLazySystemDLL("kernel32.dll")
	procCreateMutexW     = kernel32.NewProc("CreateMutexW")
	ole32                = windows.NewLazySystemDLL("ole32.dll")
	procCoInitializeEx   = ole32.NewProc("CoInitializeEx")
)

type point struct{ X, Y int32 }

type msg struct {
	Hwnd     uintptr
	Message  uint32
	WParam   uintptr
	LParam   uintptr
	Time     uint32
	Pt       point
	LPrivate uint32
}

type wndClassExW struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     windows.Handle
	HIcon         windows.Handle
	HCursor       windows.Handle
	HbrBackground windows.Handle
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       windows.Handle
}

type keybdInput struct {
	Vk        uint16
	Scan      uint16
	Flags     uint32
	Time      uint32
	ExtraInfo uintptr
}

type input struct {
	Type uint32
	_    uint32
	Ki   keybdInput
	_    [8]byte
}

type jsMsg struct {
	Type   string `json:"type"`
	ID     int    `json:"id"`
	Script string `json:"script"`
	Value  string `json:"value"`
	W      int    `json:"w"`
	H      int    `json:"h"`
	Mods   int    `json:"mods"`
	VK     int    `json:"vk"`
}

type bridgeReq struct {
	ID     string `json:"id"`
	Script string `json:"script"`
}

type bridgeRes struct {
	ID     string `json:"id"`
	Result string `json:"result"`
}

type hotkeyCfg struct {
	mods  int
	vk    int
	label string
}

type shell struct {
	hwnd      uintptr
	chromium  *edge.Chromium
	hostDir   string
	dataHost  string
	bridgeDir string
	extRoot   string
	mu        sync.Mutex
	pref      hotkeyCfg
	active    hotkeyCfg
	visible   bool
}

func main() {
	if !singleInstance() {
		os.Exit(0)
	}
	_, _, _ = procCoInitializeEx.Call(0, 0)

	exe, err := os.Executable()
	if err != nil {
		os.Exit(1)
	}
	hostDir := filepath.Dir(exe)
	extRoot := filepath.Dir(hostDir)
	dataHost := hostDir
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		if args[i] == "--data" && i+1 < len(args) {
			dataHost = args[i+1]
			i++
		}
	}
	bridgeDir := filepath.Join(dataHost, "bridge")
	_ = os.MkdirAll(bridgeDir, 0755)

	s := &shell{
		hostDir:   hostDir,
		dataHost:  dataHost,
		bridgeDir: bridgeDir,
		extRoot:   extRoot,
		pref:      hotkeyCfg{mods: modShift, vk: vkSpace, label: "Shift+Space"},
	}
	s.loadHotkeyFile()
	if err := s.createWindow(); err != nil {
		os.Exit(1)
	}
	s.registerMain()
	s.run()
}

func singleInstance() bool {
	name, _ := windows.UTF16PtrFromString(mutexName)
	r, _, err := procCreateMutexW.Call(0, 1, uintptr(unsafe.Pointer(name)))
	if r == 0 {
		return false
	}
	if err == windows.ERROR_ALREADY_EXISTS {
		return false
	}
	return true
}

func (s *shell) hotkeyPath() string {
	p := filepath.Join(s.dataHost, hotkeyFileName)
	if _, err := os.Stat(p); err == nil {
		return p
	}
	return filepath.Join(s.hostDir, hotkeyFileName)
}

func parseHotkeyLine(line string) hotkeyCfg {
	line = strings.TrimSpace(line)
	parts := strings.Split(line, ",")
	cfg := hotkeyCfg{}
	if len(parts) >= 1 {
		cfg.mods, _ = strconv.Atoi(parts[0])
	}
	if len(parts) >= 2 {
		cfg.vk, _ = strconv.Atoi(parts[1])
	}
	if len(parts) >= 3 {
		cfg.label = strings.Join(parts[2:], ",")
	}
	return cfg
}

func (s *shell) loadHotkeyFile() {
	b, err := ioutil.ReadFile(s.hotkeyPath())
	if err != nil {
		return
	}
	cfg := parseHotkeyLine(string(b))
	if cfg.vk != 0 {
		s.pref = cfg
	}
}

func (s *shell) writeHotkeyFile(cfg hotkeyCfg) {
	line := fmt.Sprintf("%d,%d,%s", cfg.mods, cfg.vk, cfg.label)
	_ = ioutil.WriteFile(s.hotkeyPath(), []byte(line+"\n"), 0644)
}

var shellByHwnd sync.Map

func getShell(hwnd uintptr) (*shell, bool) {
	v, ok := shellByHwnd.Load(hwnd)
	if !ok {
		return nil, false
	}
	return v.(*shell), true
}

func wndproc(hwnd, msgID, wp, lp uintptr) uintptr {
	sh, ok := getShell(hwnd)
	if ok {
		switch msgID {
		case wmHotkey:
			if wp == hotkeyID {
				sh.togglePanel()
			}
			return 0
		case wmTimer:
			sh.onTimer()
			return 0
		case wmSize:
			if sh.chromium != nil {
				sh.chromium.Resize()
			}
			return 0
		case wmDestroy:
			_, _, _ = procPostQuitMessage.Call(0)
			return 0
		}
	}
	r, _, _ := procDefWindowProcW.Call(hwnd, msgID, wp, lp)
	return r
}

func (s *shell) createWindow() error {
	var hinstance windows.Handle
	_ = windows.GetModuleHandleEx(0, nil, &hinstance)
	className, _ := windows.UTF16PtrFromString("FxSearchShellWnd")
	wc := wndClassExW{
		CbSize:        uint32(unsafe.Sizeof(wndClassExW{})),
		HInstance:     hinstance,
		LpszClassName: className,
		LpfnWndProc:   windows.NewCallback(wndproc),
	}
	_, _, _ = procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

	title, _ := windows.UTF16PtrFromString("Quick Yantra")
	s.hwnd, _, _ = procCreateWindowExW.Call(
		uintptr(wsExTopmost|wsExToolwindow),
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		uintptr(wsPopup),
		100, 100, defaultW, defaultH,
		0, 0, uintptr(hinstance), 0,
	)
	if s.hwnd == 0 {
		return fmt.Errorf("create window failed")
	}
	shellByHwnd.Store(s.hwnd, s)

	cr := edge.NewChromium()
	cr.MessageCallback = s.onWebMessage
	cr.DataPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "QuickYantraShell")
	s.chromium = cr
	if !cr.Embed(s.hwnd) {
		return fmt.Errorf("webview2 embed failed")
	}
	cr.Init(shellFlagJS)
	page := filepath.Join(s.extRoot, clientIndexHTML)
	url := "file:///" + strings.ReplaceAll(page, "\\", "/")
	cr.Navigate(url)
	cr.Resize()
	_, _, _ = procShowWindow.Call(s.hwnd, swHide)
	s.visible = false
	_, _, _ = procSetTimer.Call(s.hwnd, timerID, 500, 0)
	return nil
}

func (s *shell) run() {
	var m msg
	for {
		r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
		if r == 0 {
			break
		}
		_, _, _ = procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
		_, _, _ = procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
	}
}

func (s *shell) evalJS(js string) {
	if s.chromium == nil {
		return
	}
	s.chromium.Eval(js)
}

func (s *shell) onWebMessage(raw string) {
	var m jsMsg
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return
	}
	switch m.Type {
	case "hide":
		s.hidePanel()
	case "resize":
		s.resizePanel(m.W, m.H)
	case "setHotkey":
		cfg := parseHotkeyLine(m.Value)
		s.mu.Lock()
		s.pref = cfg
		s.mu.Unlock()
		s.writeHotkeyFile(cfg)
		s.registerMain()
	case "eval":
		go s.bridgeEval(m.ID, m.Script)
	case "probeHotkey":
		s.reply(m.ID, s.probeHotkey(m.Value))
	case "getHotkey":
		s.mu.Lock()
		p := s.pref
		s.mu.Unlock()
		if p.vk == 0 {
			s.reply(m.ID, "")
			return
		}
		s.reply(m.ID, fmt.Sprintf("%d,%d,%s", p.mods, p.vk, p.label))
	case "getActiveHotkey":
		s.mu.Lock()
		a := s.active
		s.mu.Unlock()
		if a.vk == 0 {
			s.reply(m.ID, "")
			return
		}
		s.reply(m.ID, fmt.Sprintf("%d,%d", a.mods, a.vk))
	case "sendKeys":
		s.sendCombo(m.Mods, m.VK)
	}
}

func (s *shell) reply(id int, result string) {
	b, _ := json.Marshal(result)
	s.evalJS(fmt.Sprintf("window.__fxshellResult && window.__fxshellResult(%d, %s)", id, string(b)))
}

func (s *shell) bridgeEval(id int, script string) {
	reqID := fmt.Sprintf("%d-%d", time.Now().UnixNano(), id)
	req := bridgeReq{ID: reqID, Script: script}
	raw, _ := json.Marshal(req)
	reqPath := filepath.Join(s.bridgeDir, "req-"+reqID+".json")
	resPath := filepath.Join(s.bridgeDir, "res-"+reqID+".json")
	_ = ioutil.WriteFile(reqPath, raw, 0644)
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		b, err := ioutil.ReadFile(resPath)
		if err == nil && len(b) > 0 {
			var res bridgeRes
			if json.Unmarshal(b, &res) == nil {
				_ = os.Remove(resPath)
				s.reply(id, res.Result)
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	s.reply(id, "EvalScript error.")
}

func (s *shell) probeHotkey(value string) string {
	cfg := parseHotkeyLine(value)
	if cfg.vk == 0 {
		return "unknown"
	}
	s.mu.Lock()
	self := s.active.vk == cfg.vk && s.active.mods == cfg.mods && s.active.vk != 0
	s.mu.Unlock()
	if self {
		return "self"
	}
	ok, _, _ := procRegisterHotKey.Call(s.hwnd, probeID, uintptr(cfg.mods|modNoRepeat), uintptr(cfg.vk))
	if ok != 0 {
		_, _, _ = procUnregisterHotKey.Call(s.hwnd, probeID)
		return "free"
	}
	return "taken"
}

func (s *shell) registerMain() {
	_, _, _ = procUnregisterHotKey.Call(s.hwnd, hotkeyID)
	s.mu.Lock()
	cfg := s.pref
	s.mu.Unlock()
	if cfg.vk == 0 {
		s.mu.Lock()
		s.active = hotkeyCfg{}
		s.mu.Unlock()
		return
	}
	ok, _, _ := procRegisterHotKey.Call(s.hwnd, hotkeyID, uintptr(cfg.mods|modNoRepeat), uintptr(cfg.vk))
	if ok != 0 {
		s.mu.Lock()
		s.active = cfg
		s.mu.Unlock()
		return
	}
	s.mu.Lock()
	s.active = hotkeyCfg{}
	s.mu.Unlock()
}

func (s *shell) togglePanel() {
	if s.visible {
		s.hidePanel()
		return
	}
	s.showPanel()
}

func (s *shell) showPanel() {
	var pt point
	_, _, _ = procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	x, y := int(pt.X)-40, int(pt.Y)+16
	_, _, _ = procSetWindowPos.Call(s.hwnd, hwndTopmost, uintptr(x), uintptr(y), defaultW, defaultH, swpShowWindow)
	_, _, _ = procShowWindow.Call(s.hwnd, swShow)
	_, _, _ = procSetForeground.Call(s.hwnd)
	s.visible = true
	s.evalJS("window.__fxshellShown && window.__fxshellShown();")
}

func (s *shell) hidePanel() {
	_, _, _ = procShowWindow.Call(s.hwnd, swHide)
	s.visible = false
	s.evalJS("window.__fxshellHidden && window.__fxshellHidden();")
}

func (s *shell) resizePanel(w, h int) {
	if w < 50 {
		w = defaultW
	}
	if h < 22 {
		h = defaultH
	}
	_, _, _ = procSetWindowPos.Call(s.hwnd, hwndTopmost, 0, 0, uintptr(w), uintptr(h), swpNoMove|swpNoActivate)
	if s.chromium != nil {
		s.chromium.Resize()
	}
}

func (s *shell) onTimer() {
	s.loadHotkeyFile()
	s.mu.Lock()
	pref := s.pref
	act := s.active
	s.mu.Unlock()
	if pref.vk != act.vk || pref.mods != act.mods {
		s.registerMain()
	}
	alive := filepath.Join(s.dataHost, aliveFileName)
	st, err := os.Stat(alive)
	if err != nil {
		st, err = os.Stat(filepath.Join(s.hostDir, aliveFileName))
	}
	if err == nil && time.Since(st.ModTime()) > staleAfterMS*time.Millisecond {
		_, _, _ = procPostQuitMessage.Call(0)
	}
}

func (s *shell) sendCombo(mods, vk int) {
	var seq []input
	down := func(v uint16) {
		seq = append(seq, input{Type: inputKeyboard, Ki: keybdInput{Vk: v}})
	}
	up := func(v uint16) {
		seq = append(seq, input{Type: inputKeyboard, Ki: keybdInput{Vk: v, Flags: keyeventfKeyup}})
	}
	if mods&modControl != 0 {
		down(0x11)
	}
	if mods&modAlt != 0 {
		down(0x12)
	}
	if mods&modShift != 0 {
		down(0x10)
	}
	if mods&modWin != 0 {
		down(0x5B)
	}
	down(uint16(vk))
	up(uint16(vk))
	if mods&modWin != 0 {
		up(0x5B)
	}
	if mods&modShift != 0 {
		up(0x10)
	}
	if mods&modAlt != 0 {
		up(0x12)
	}
	if mods&modControl != 0 {
		up(0x11)
	}
	if len(seq) == 0 {
		return
	}
	_, _, _ = procSendInput.Call(uintptr(len(seq)), uintptr(unsafe.Pointer(&seq[0])), unsafe.Sizeof(seq[0]))
}
