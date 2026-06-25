(function() {
	var __vite_style__ = document.createElement("style");
	__vite_style__.textContent = ":root {\r\n  color-scheme: light;\r\n  --bg: #f4f4f5;\r\n  --surface: #ffffff;\r\n  --surface-raised: #fafafa;\r\n  --surface-soft: #f1f1f3;\r\n  --surface-strong: #e4e4e7;\r\n  --sidebar: #ffffff;\r\n  --sidebar-soft: #f4f4f5;\r\n  --line: #e4e4e7;\r\n  --line-soft: #f0f0f2;\r\n  --line-strong: #d4d4d8;\r\n  --text: #09090b;\r\n  --muted: #52525b;\r\n  --faint: #b97983;\r\n  --accent: #09090b;\r\n  --accent-strong: #18181b;\r\n  --accent-soft: #f4f4f5;\r\n  --success: #14795c;\r\n  --success-soft: #e6f5ee;\r\n  --warning: #d1431f;\r\n  --warning-soft: #fff3dc;\r\n  --danger: #b23a48;\r\n  --danger-soft: #fde8eb;\r\n  --info: #20d264;\r\n  --info-soft: #e8efff;\r\n  --compat: #6f55c4;\r\n  --compat-soft: #f0edff;\r\n  --metric-neutral: #2f3437;\r\n  --metric-requests: #2f3437;\r\n  --metric-success: #14795c;\r\n  --metric-failure: #b36a20;\r\n  --metric-provider: #3267c7;\r\n  --metric-token: #6f55c4;\r\n  --metric-cost: #7a5a25;\r\n  --neutral: #52525b;\r\n  --neutral-soft: #f4f4f5;\r\n  --ok: var(--success);\r\n  --warn: var(--warning);\r\n  --bad: var(--danger);\r\n  --shadow: 0 1px 3px rgba(0, 0, 0, 0.045), 0 1px 2px rgba(0, 0, 0, 0.035);\r\n  --shadow-tight: 0 8px 18px rgba(0, 0, 0, 0.055);\r\n  --mono: ui-monospace, SFMono-Regular, \"SF Mono\", Menlo, Consolas, \"Liberation Mono\", monospace;\r\n  --sans: system-ui, -apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", \"Helvetica Neue\", sans-serif;\r\n}\r\n\r\n* {\r\n  box-sizing: border-box;\r\n}\r\n\r\n::-webkit-scrollbar {\r\n  width: 5px;\r\n  height: 5px;\r\n}\r\n::-webkit-scrollbar-track {\r\n  background: transparent;\r\n}\r\n::-webkit-scrollbar-thumb {\r\n  background: var(--line-strong);\r\n  border-radius: 999px;\r\n}\r\n::-webkit-scrollbar-thumb:hover {\r\n  background: var(--muted);\r\n}\r\n::-webkit-scrollbar-corner {\r\n  background: transparent;\r\n}\r\nhtml {\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--line-strong) transparent;\r\n}\r\n\r\nhtml {\r\n  scroll-behavior: smooth;\r\n}\r\n\r\nbody {\r\n  margin: 0;\r\n  min-width: 320px;\r\n  background: var(--bg);\r\n  color: var(--text);\r\n  font-family: var(--sans);\r\n  font-size: 13px;\r\n  font-variant-numeric: tabular-nums;\r\n  line-height: 1.5;\r\n  -webkit-font-smoothing: antialiased;\r\n}\r\n\r\nbutton,\r\ninput,\r\nselect {\r\n  font: inherit;\r\n}\r\n\r\nbutton,\r\ninput,\r\nselect,\r\ntextarea {\r\n  outline: none;\r\n}\r\n\r\nbutton:focus-visible,\r\ninput:focus-visible,\r\nselect:focus-visible {\r\n  box-shadow: 0 0 0 3px rgba(47, 52, 55, 0.16);\r\n}\r\n\r\n.shell {\r\n  display: grid;\r\n  grid-template-columns: 240px minmax(0, 1fr);\r\n  min-height: 100dvh;\r\n}\r\n\r\n[hidden] {\r\n  display: none !important;\r\n}\r\n\r\n.login-gate {\r\n  min-height: 100dvh;\r\n  display: grid;\r\n  place-items: center;\r\n  padding: 24px;\r\n  background: var(--bg);\r\n}\r\n\r\n.login-card {\r\n  width: min(420px, 100%);\r\n  display: grid;\r\n  gap: 16px;\r\n  padding: 26px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.login-mark {\r\n  display: grid;\r\n  width: 34px;\r\n  height: 34px;\r\n  place-items: center;\r\n  border-radius: 7px;\r\n  background: var(--text);\r\n  color: #fff;\r\n  font: 760 11px var(--mono);\r\n}\r\n\r\n.login-card h1 {\r\n  font-size: 24px;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.login-card p {\r\n  margin-top: 6px;\r\n  max-width: 34rem;\r\n  color: var(--muted);\r\n  line-height: 1.45;\r\n}\r\n\r\n.auth-card {\r\n  gap: 18px;\r\n}\r\n\r\n.auth-progress {\r\n  position: relative;\r\n  height: 3px;\r\n  overflow: hidden;\r\n  border-radius: 999px;\r\n  background: var(--surface-soft);\r\n}\r\n\r\n.auth-progress::after {\r\n  position: absolute;\r\n  inset: 0;\r\n  width: 42%;\r\n  border-radius: inherit;\r\n  background: var(--accent);\r\n  content: \"\";\r\n  animation: auth-progress 1.1s ease-in-out infinite;\r\n}\r\n\r\n@keyframes auth-progress {\r\n  0% {\r\n    transform: translateX(-120%);\r\n  }\r\n  100% {\r\n    transform: translateX(260%);\r\n  }\r\n}\r\n\r\n.login-field {\r\n  display: grid;\r\n  gap: 7px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.login-field input {\r\n  min-height: 42px;\r\n  padding: 0 11px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: #fff;\r\n  color: var(--text);\r\n  font-family: var(--mono);\r\n}\r\n\r\n.login-error {\r\n  min-height: 18px;\r\n  color: var(--danger) !important;\r\n  font-size: 12px;\r\n}\r\n\r\n.sidebar {\r\n  position: sticky;\r\n  top: 0;\r\n  height: 100dvh;\r\n  display: flex;\r\n  flex-direction: column;\r\n  border-right: 1px solid var(--line-strong);\r\n  background: linear-gradient(180deg, #ffffff 0%, #fafafa 100%);\r\n  box-shadow: 10px 0 26px rgba(9, 9, 11, 0.045);\r\n  color: var(--text);\r\n  z-index: 10;\r\n}\r\n\r\n.sidebar::after {\r\n  position: absolute;\r\n  top: 0;\r\n  right: -1px;\r\n  bottom: 0;\r\n  width: 1px;\r\n  background: linear-gradient(180deg, rgba(9, 9, 11, 0.12), rgba(9, 9, 11, 0.04));\r\n  content: \"\";\r\n  pointer-events: none;\r\n}\r\n\r\n.brand {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: center;\r\n  padding: 24px 16px 18px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.brand-mark {\r\n  display: grid;\r\n  width: 24px;\r\n  height: 24px;\r\n  place-items: center;\r\n  border: 0;\r\n  border-radius: 6px;\r\n  background: var(--text);\r\n  color: #fff;\r\n  font: 760 10px var(--mono);\r\n  letter-spacing: 0;\r\n}\r\n\r\n.brand-title {\r\n  font-size: 14px;\r\n  font-weight: 720;\r\n}\r\n\r\n.brand-subtitle {\r\n  margin-top: 2px;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n}\r\n\r\n.nav {\r\n  display: grid;\r\n  gap: 3px;\r\n  padding: 12px 16px;\r\n}\r\n\r\n.nav-item {\r\n  position: relative;\r\n  width: 100%;\r\n  min-height: 38px;\r\n  padding: 8px 12px;\r\n  border: 1px solid transparent;\r\n  border-radius: 7px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n  text-align: left;\r\n  cursor: pointer;\r\n  font-weight: 560;\r\n  transition: background 160ms ease, color 160ms ease, transform 160ms ease, border-color 160ms ease;\r\n}\r\n\r\n.nav-item:hover {\r\n  border-color: var(--line-soft);\r\n  background: var(--surface);\r\n  color: var(--text);\r\n}\r\n\r\n.nav-item.is-active {\r\n  border-color: var(--line-strong);\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  font-weight: 720;\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.nav-item.is-active::before {\r\n  display: none;\r\n}\r\n\r\n.sidebar-actions {\r\n  display: grid;\r\n  grid-template-columns: 1fr;\r\n  gap: 8px;\r\n  margin-top: auto;\r\n  padding: 12px 16px 8px;\r\n  border-top: 0;\r\n}\r\n\r\n.sidebar-actions .button {\r\n  width: 100%;\r\n  min-width: 0;\r\n}\r\n\r\n.sidebar-footer {\r\n  display: flex;\r\n  gap: 9px;\r\n  align-items: center;\r\n  margin-top: 0;\r\n  padding: 6px 20px 24px;\r\n  border-top: 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.dot {\r\n  width: 8px;\r\n  height: 8px;\r\n  border-radius: 999px;\r\n  background: var(--neutral);\r\n}\r\n\r\n.dot.ok {\r\n  background: var(--success);\r\n}\r\n\r\n.dot.bad {\r\n  background: var(--danger);\r\n}\r\n\r\n.workspace {\r\n  min-width: 0;\r\n  width: 100%;\r\n  max-width: 1220px;\r\n  margin: 0 auto;\r\n  padding: 12px 40px 40px;\r\n}\r\n\r\n.topbar {\r\n  position: sticky;\r\n  top: 0;\r\n  z-index: 9;\r\n  display: none;\r\n  gap: 16px;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  margin: -20px -20px 16px;\r\n  padding: 18px 20px 14px;\r\n  border-bottom: 1px solid var(--line);\r\n  background: rgba(244, 244, 245, 0.88);\r\n  backdrop-filter: blur(18px);\r\n}\r\n\r\nh1,\r\nh2,\r\nh3,\r\np {\r\n  margin: 0;\r\n}\r\n\r\nh1 {\r\n  font-size: 22px;\r\n  line-height: 1.15;\r\n  letter-spacing: 0;\r\n}\r\n\r\nh2 {\r\n  color: var(--text);\r\n  font-size: 14px;\r\n  line-height: 1.35;\r\n  font-weight: 720;\r\n}\r\n\r\n.topbar p,\r\n.panel-head p {\r\n  margin-top: 4px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.mobile-settings-button,\r\n.mobile-settings-backdrop,\r\n.mobile-settings-drawer {\r\n  display: none;\r\n}\r\n\r\n.button,\r\n.icon-button {\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  cursor: pointer;\r\n  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 120ms ease, box-shadow 150ms ease;\r\n  touch-action: manipulation;\r\n}\r\n\r\n.button {\r\n  min-height: 36px;\r\n  padding: 0 12px;\r\n  font-size: 12.5px;\r\n  font-weight: 680;\r\n}\r\n\r\n.button.icon-action {\r\n  display: inline-grid;\r\n  width: 32px;\r\n  min-width: 32px;\r\n  height: 32px;\r\n  min-height: 32px;\r\n  place-items: center;\r\n  padding: 0;\r\n  font: 780 15px/1 var(--mono);\r\n}\r\n\r\n.button.icon-action span {\r\n  display: block;\r\n  transform: translateY(-0.5px);\r\n}\r\n\r\n.icon-svg {\r\n  width: 16px;\r\n  height: 16px;\r\n  fill: none;\r\n  stroke: currentColor;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  stroke-width: 2;\r\n  pointer-events: none;\r\n}\r\n\r\n.button.icon-action .icon-svg {\r\n  width: 15px;\r\n  height: 15px;\r\n}\r\n\r\n.button:hover,\r\n.icon-button:hover {\r\n  border-color: #c8c8ce;\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n.button:active,\r\n.icon-button:active {\r\n  transform: translateY(1px);\r\n  box-shadow: none;\r\n}\r\n\r\n.button:disabled,\r\n.icon-button:disabled {\r\n  cursor: not-allowed;\r\n  opacity: 0.55;\r\n  transform: none;\r\n  box-shadow: none;\r\n}\r\n\r\n.button.primary {\r\n  border-color: var(--accent);\r\n  border-radius: 7px;\r\n  background: var(--accent);\r\n  color: #fff;\r\n}\r\n\r\n.button.primary:hover {\r\n  border-color: var(--accent-strong);\r\n  background: var(--accent-strong);\r\n}\r\n\r\n.button.secondary {\r\n  background: var(--surface);\r\n  color: var(--text);\r\n}\r\n\r\n.button.secondary:hover {\r\n  border-color: #c8c8ce;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.button.ghost {\r\n  border-color: transparent;\r\n  background: transparent;\r\n  color: var(--muted);\r\n}\r\n\r\n.button.ghost:hover {\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.button.danger {\r\n  border-color: color-mix(in srgb, var(--danger) 24%, white);\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n}\r\n\r\n.icon-button {\r\n  width: 34px;\r\n  height: 34px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  font-size: 18px;\r\n}\r\n\r\n.toast-stack {\r\n  position: fixed;\r\n  top: 18px;\r\n  left: 50%;\r\n  z-index: 1200;\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  gap: 10px;\r\n  width: min(360px, calc(100vw - 36px));\r\n  transform: translateX(-50%);\r\n  pointer-events: none;\r\n}\r\n\r\n.toast {\r\n  pointer-events: auto;\r\n  padding: 12px 14px;\r\n  border: 1px solid color-mix(in srgb, var(--danger) 22%, white);\r\n  border-radius: 11px;\r\n  background: color-mix(in srgb, var(--danger) 12%, var(--surface));\r\n  color: var(--danger);\r\n  font-size: 13px;\r\n  font-weight: 640;\r\n  line-height: 1.4;\r\n  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);\r\n  opacity: 0;\r\n  transform: translateY(-10px);\r\n  transition: opacity 0.2s ease, transform 0.2s ease;\r\n  width: 100%;\r\n  word-break: break-word;\r\n  overflow-wrap: anywhere;\r\n  white-space: pre-wrap;\r\n  max-height: 80vh;\r\n  overflow-y: auto;\r\n  backdrop-filter: blur(24px);\r\n  -webkit-backdrop-filter: blur(24px);\r\n}\r\n\r\n.toast.toast-in {\r\n  opacity: 1;\r\n  transform: translateY(0);\r\n}\r\n\r\n.toast.toast-leaving {\r\n  opacity: 0;\r\n  transform: translateY(-10px);\r\n}\r\n\r\n.toast[data-tone=\"ok\"] {\r\n  border-color: color-mix(in srgb, var(--success) 22%, white);\r\n  background: color-mix(in srgb, var(--success) 12%, var(--surface));\r\n  color: var(--success);\r\n}\r\n\r\n.toast[data-tone=\"warn\"] {\r\n  border-color: color-mix(in srgb, var(--warning) 22%, white);\r\n  background: color-mix(in srgb, var(--warning) 12%, var(--surface));\r\n  color: var(--warning);\r\n}\r\n\r\n.toast[data-tone=\"info\"] {\r\n  border-color: color-mix(in srgb, var(--info) 26%, white);\r\n  background: color-mix(in srgb, var(--info) 10%, var(--surface));\r\n  color: var(--info);\r\n}\r\n\r\n.notice {\r\n  padding: 11px 12px;\r\n  border: 1px solid color-mix(in srgb, var(--danger) 22%, white);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--danger) 12%, var(--surface));\r\n  color: var(--danger);\r\n}\r\n\r\n.is-hidden {\r\n  display: none !important;\r\n}\r\n\r\n@keyframes viewFadeIn {\r\n  0% { opacity: 0; transform: translateY(4px); }\r\n  100% { opacity: 1; transform: translateY(0); }\r\n}\r\n\r\n.view {\r\n  display: none;\r\n}\r\n\r\n.view.is-active {\r\n  display: block;\r\n  animation: viewFadeIn 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;\r\n}\r\n\r\n.time-range-control {\r\n  display: flex;\r\n  gap: 12px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  margin-bottom: 14px;\r\n  padding: 10px 12px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--text);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.eyebrow {\r\n  display: block;\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 700;\r\n  letter-spacing: 0.04em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.time-range-control strong {\r\n  display: block;\r\n  margin-top: 3px;\r\n  font-size: 13px;\r\n  line-height: 1.2;\r\n}\r\n\r\n.segmented-control {\r\n  display: inline-grid;\r\n  grid-auto-flow: column;\r\n  gap: 2px;\r\n  padding: 4px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.segmented-button {\r\n  min-width: 48px;\r\n  min-height: 30px;\r\n  padding: 0 10px;\r\n  border: 0;\r\n  border-radius: 5px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 680;\r\n  cursor: pointer;\r\n  transition: background 160ms ease, color 160ms ease, transform 120ms ease;\r\n}\r\n\r\n.segmented-button:hover {\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.segmented-button:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.segmented-button.is-active {\r\n  background: var(--text);\r\n  color: #fff;\r\n}\r\n\r\n.metric-grid {\r\n  display: none;\r\n  grid-template-columns: repeat(6, minmax(0, 1fr));\r\n  gap: 14px;\r\n  margin-bottom: 24px;\r\n}\r\n\r\n.metric {\r\n  --metric-color: var(--metric-neutral);\r\n  --metric-soft: rgba(47, 52, 55, 0.045);\r\n  position: relative;\r\n  min-height: 108px;\r\n  overflow: hidden;\r\n  padding: 15px 16px;\r\n  border: 1px solid color-mix(in srgb, var(--metric-color) 24%, var(--line));\r\n  border-radius: 9px;\r\n  background:\r\n    linear-gradient(180deg, var(--metric-soft), rgba(255, 255, 255, 0) 58%),\r\n    var(--surface);\r\n  box-shadow: var(--shadow);\r\n  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;\r\n}\r\n\r\n.metric::before {\r\n  content: \"\";\r\n  position: absolute;\r\n  top: 0;\r\n  right: 0;\r\n  left: 0;\r\n  height: 2px;\r\n  background: var(--metric-color);\r\n}\r\n\r\n.metric::after {\r\n  content: \"\";\r\n  position: absolute;\r\n  right: auto;\r\n  bottom: 0;\r\n  left: 0;\r\n  width: var(--metric-progress, 0%);\r\n  height: 3px;\r\n  border-radius: 0 999px 999px 0;\r\n  background: var(--metric-color);\r\n  opacity: 0.72;\r\n  transition: width 260ms ease;\r\n}\r\n\r\n.metric:hover {\r\n  border-color: color-mix(in srgb, var(--metric-color) 42%, var(--line));\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n.metric:nth-child(1) {\r\n  --metric-color: var(--metric-requests);\r\n  --metric-soft: rgba(47, 52, 55, 0.052);\r\n}\r\n\r\n.metric:nth-child(2) {\r\n  --metric-color: var(--metric-success);\r\n  --metric-soft: rgba(20, 121, 92, 0.08);\r\n}\r\n\r\n.metric:nth-child(3) {\r\n  --metric-color: var(--metric-failure);\r\n  --metric-soft: rgba(179, 106, 32, 0.085);\r\n}\r\n\r\n.metric:nth-child(4) {\r\n  --metric-color: var(--metric-provider);\r\n  --metric-soft: rgba(50, 103, 199, 0.08);\r\n}\r\n\r\n.metric:nth-child(5) {\r\n  --metric-color: var(--metric-token);\r\n  --metric-soft: rgba(111, 85, 196, 0.08);\r\n}\r\n\r\n.metric:nth-child(6) {\r\n  --metric-color: var(--metric-cost);\r\n  --metric-soft: rgba(122, 90, 37, 0.075);\r\n}\r\n\r\n.metric-label {\r\n  display: block;\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 760;\r\n  letter-spacing: 0.045em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.metric strong {\r\n  display: block;\r\n  margin-top: 8px;\r\n  color: color-mix(in srgb, var(--metric-color) 20%, var(--text));\r\n  font-size: 28px;\r\n  font-weight: 720;\r\n  line-height: 1;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.metric small {\r\n  display: block;\r\n  margin-top: 8px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.overview-visuals {\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 10px;\r\n  margin: 0 0 18px;\r\n}\r\n\r\n.visual-card {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  gap: 10px;\r\n  align-items: center;\r\n  min-width: 0;\r\n  min-height: 74px;\r\n  padding: 11px 12px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 10px;\r\n  background:\r\n    linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(244, 244, 245, 0.52)),\r\n    var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.visual-card span,\r\n.visual-card small {\r\n  display: block;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.visual-card strong {\r\n  display: block;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  font: 840 18px/1.16 var(--mono);\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.visual-card-icon,\r\n.visual-ring {\r\n  display: grid;\r\n  width: 42px;\r\n  height: 42px;\r\n  place-items: center;\r\n  border-radius: 12px;\r\n}\r\n\r\n.visual-card-icon {\r\n  border: 1px solid var(--line);\r\n  background: var(--surface-raised);\r\n  color: var(--neutral);\r\n}\r\n\r\n.visual-card-icon.tone-success {\r\n  border-color: color-mix(in srgb, var(--success) 18%, var(--line));\r\n  background: var(--success-soft);\r\n  color: var(--success);\r\n}\r\n\r\n.visual-card-icon.tone-warning {\r\n  border-color: color-mix(in srgb, var(--warning) 18%, var(--line));\r\n  background: var(--warning-soft);\r\n  color: var(--warning);\r\n}\r\n\r\n.visual-card-icon.tone-danger {\r\n  border-color: color-mix(in srgb, var(--danger) 18%, var(--line));\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n}\r\n\r\n.visual-card-icon.tone-info {\r\n  border-color: color-mix(in srgb, var(--info) 18%, var(--line));\r\n  background: var(--info-soft);\r\n  color: var(--info);\r\n}\r\n\r\n.visual-card-icon.tone-compat {\r\n  border-color: color-mix(in srgb, var(--compat) 18%, var(--line));\r\n  background: var(--compat-soft);\r\n  color: var(--compat);\r\n}\r\n\r\n.visual-ring {\r\n  --ring-color: var(--neutral);\r\n  --ring-value: 0%;\r\n  background:\r\n    radial-gradient(circle at center, var(--surface) 0 55%, transparent 56%),\r\n    conic-gradient(var(--ring-color) var(--ring-value), var(--line-soft) 0);\r\n}\r\n\r\n.visual-ring strong {\r\n  max-width: 32px;\r\n  font-size: 10.5px;\r\n  text-align: center;\r\n}\r\n\r\n.visual-ring-card.tone-success,\r\n.visual-ring-card.tone-ok {\r\n  --ring-color: var(--success);\r\n  border-color: color-mix(in srgb, var(--success) 18%, var(--line));\r\n}\r\n\r\n.visual-ring-card.tone-warn,\r\n.visual-ring-card.tone-warning {\r\n  --ring-color: var(--warning);\r\n  border-color: color-mix(in srgb, var(--warning) 18%, var(--line));\r\n}\r\n\r\n.visual-ring-card.tone-bad,\r\n.visual-ring-card.tone-danger {\r\n  --ring-color: var(--danger);\r\n  border-color: color-mix(in srgb, var(--danger) 18%, var(--line));\r\n}\r\n\r\n.visual-progress-card {\r\n  --progress-color: var(--neutral);\r\n}\r\n\r\n.visual-progress-card.tone-success,\r\n.visual-progress-card.tone-ok {\r\n  --progress-color: var(--success);\r\n  border-color: color-mix(in srgb, var(--success) 18%, var(--line));\r\n}\r\n\r\n.visual-progress-card.tone-warn,\r\n.visual-progress-card.tone-warning {\r\n  --progress-color: var(--warning);\r\n  border-color: color-mix(in srgb, var(--warning) 18%, var(--line));\r\n}\r\n\r\n.visual-progress-card.tone-bad,\r\n.visual-progress-card.tone-danger {\r\n  --progress-color: var(--danger);\r\n  border-color: color-mix(in srgb, var(--danger) 18%, var(--line));\r\n}\r\n\r\n.visual-progress {\r\n  position: relative;\r\n  height: 5px;\r\n  margin-top: 6px;\r\n  overflow: hidden;\r\n  border-radius: 999px;\r\n  background: var(--line-soft);\r\n}\r\n\r\n.visual-progress::before {\r\n  content: \"\";\r\n  position: absolute;\r\n  inset: 0 auto 0 0;\r\n  width: var(--progress, 0%);\r\n  border-radius: inherit;\r\n  background: var(--progress-color);\r\n}\r\n\r\n.token-split {\r\n  display: flex;\r\n  height: 5px;\r\n  margin-top: 6px;\r\n  overflow: hidden;\r\n  border-radius: 999px;\r\n  background: var(--compat-soft);\r\n}\r\n\r\n.token-split i,\r\n.token-split b {\r\n  display: block;\r\n  min-width: 2px;\r\n  height: 100%;\r\n}\r\n\r\n.token-split i {\r\n  background: var(--info);\r\n}\r\n\r\n.token-split b {\r\n  flex: 1;\r\n  background: var(--compat);\r\n}\r\n\r\n.overview-grid,\r\n.policy-grid,\r\n.config-grid {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 2fr) minmax(340px, 1fr);\r\n  gap: 16px 20px;\r\n}\r\n\r\n.config-grid {\r\n  grid-template-columns: minmax(460px, 1.45fr) minmax(320px, 0.85fr);\r\n  align-items: start;\r\n}\r\n\r\n.config-column {\r\n  display: grid;\r\n  gap: 16px;\r\n  align-content: start;\r\n  min-width: 0;\r\n}\r\n\r\n.config-column > .panel {\r\n  margin-bottom: 0;\r\n}\r\n\r\n.config-status-panel {\r\n  --panel-accent: var(--metric-neutral);\r\n}\r\n\r\n.model-routes-panel {\r\n  --panel-accent: var(--metric-neutral);\r\n}\r\n\r\n.config-provider-panel,\r\n.config-audit-panel,\r\n.config-advanced-panel,\r\n.global-proxy-panel,\r\n.provider-model-map-panel {\r\n  --panel-accent: var(--metric-neutral);\r\n}\r\n\r\n.panel {\r\n  --panel-accent: var(--metric-neutral);\r\n  min-width: 0;\r\n  margin-bottom: 20px;\r\n  overflow: hidden;\r\n  border: 1px solid color-mix(in srgb, var(--panel-accent) 14%, var(--line));\r\n  border-radius: 9px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.overview-grid > .panel:nth-child(1) {\r\n  --panel-accent: var(--success);\r\n}\r\n\r\n.overview-grid > .panel:nth-child(2) {\r\n  --panel-accent: var(--metric-token);\r\n}\r\n\r\n.overview-grid > .panel:nth-child(3) {\r\n  --panel-accent: var(--metric-provider);\r\n}\r\n\r\n.overview-grid > .panel:nth-child(4) {\r\n  --panel-accent: var(--danger);\r\n}\r\n\r\n.panel-wide {\r\n  grid-column: span 1;\r\n}\r\n\r\n.panel-head {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 10px 16px;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  padding: 13px 18px;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--panel-accent) 14%, var(--line));\r\n  background:\r\n    linear-gradient(90deg, color-mix(in srgb, var(--panel-accent) 8%, transparent), rgba(255, 255, 255, 0) 52%),\r\n    var(--surface-raised);\r\n}\r\n\r\n.panel-head h2 {\r\n  color: color-mix(in srgb, var(--panel-accent) 16%, var(--text));\r\n  font-size: 14px;\r\n  font-weight: 760;\r\n}\r\n\r\n.panel-head > div {\r\n  min-width: 0;\r\n}\r\n\r\n.panel-head .tag {\r\n  max-width: min(100%, 360px);\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.tag,\r\n.badge {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  min-height: 22px;\r\n  padding: 0 8px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 6px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  font: 680 10.5px var(--mono);\r\n  white-space: nowrap;\r\n}\r\n\r\n.badge.ok {\r\n  border-color: #bbf7d0;\r\n  background: var(--success-soft);\r\n  color: var(--success);\r\n  font-weight: 820;\r\n}\r\n\r\n.badge.warn {\r\n  border-color: #fde68a;\r\n  background: var(--warning-soft);\r\n  color: var(--warning);\r\n  font-weight: 820;\r\n}\r\n\r\n.badge.bad {\r\n  border-color: #fecaca;\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n  font-weight: 820;\r\n}\r\n\r\n.badge.prio-0 {\r\n  color: var(--text);\r\n}\r\n\r\n.badge.prio-1 {\r\n  color: var(--info);\r\n  border-color: color-mix(in srgb, var(--info) 30%, white);\r\n}\r\n\r\n.badge.prio-2 {\r\n  color: var(--warning);\r\n  border-color: color-mix(in srgb, var(--warning) 30%, white);\r\n}\r\n\r\n.badge.prio-3 {\r\n  color: var(--danger);\r\n  border-color: color-mix(in srgb, var(--danger) 30%, white);\r\n  font-weight: 820;\r\n}\r\n\r\n.chart {\r\n  min-height: 332px;\r\n  padding: 15px 18px 16px;\r\n  background: var(--surface);\r\n}\r\n\r\n.traffic-legend {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 9px;\r\n  margin-bottom: 12px;\r\n}\r\n\r\n.traffic-legend-item {\r\n  --series-color: var(--neutral);\r\n  --series-soft: rgba(82, 82, 91, 0.055);\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 9px;\r\n  min-width: 0;\r\n  padding: 10px 11px;\r\n  border: 1px solid color-mix(in srgb, var(--series-color) 20%, var(--line));\r\n  border-radius: 8px;\r\n  background:\r\n    linear-gradient(180deg, var(--series-soft), rgba(255, 255, 255, 0) 70%),\r\n    var(--surface-raised);\r\n}\r\n\r\n.traffic-legend-item.tone-success {\r\n  --series-color: var(--success);\r\n  --series-soft: rgba(20, 121, 92, 0.075);\r\n}\r\n\r\n.traffic-legend-item.tone-danger {\r\n  --series-color: var(--danger);\r\n  --series-soft: rgba(178, 58, 72, 0.075);\r\n}\r\n\r\n.traffic-legend-item.tone-info {\r\n  --series-color: var(--info);\r\n  --series-soft: rgba(50, 103, 199, 0.075);\r\n}\r\n\r\n.traffic-legend-item.tone-compat {\r\n  --series-color: var(--compat);\r\n  --series-soft: rgba(111, 85, 163, 0.075);\r\n}\r\n\r\n.traffic-legend-item > span {\r\n  width: 28px;\r\n  height: 18px;\r\n  border-radius: 5px;\r\n  background:\r\n    linear-gradient(180deg, color-mix(in srgb, var(--series-color) 74%, white), var(--series-color));\r\n  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);\r\n}\r\n\r\n.traffic-legend-item.tone-info > span {\r\n  background: var(--text);\r\n}\r\n\r\n.traffic-legend-item.tone-compat > span {\r\n  background: #7c3aed;\r\n}\r\n\r\n.traffic-legend-item strong,\r\n.traffic-legend-item small {\r\n  display: block;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.traffic-legend-item strong {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n\r\n.traffic-legend-item small {\r\n  margin-top: 1px;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n}\r\n\r\n.traffic-chart-shell {\r\n  overflow: hidden;\r\n  border: 1px solid color-mix(in srgb, var(--panel-accent) 12%, var(--line));\r\n  border-radius: 12px;\r\n  background:\r\n    radial-gradient(circle at 82% 4%, color-mix(in srgb, var(--info) 8%, transparent), transparent 34%),\r\n    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 250, 250, 0.92)),\r\n    var(--surface);\r\n  box-shadow:\r\n    inset 0 1px 0 rgba(255, 255, 255, 0.78),\r\n    0 12px 28px rgba(15, 23, 42, 0.045);\r\n}\r\n\r\n.traffic-chart-shell svg {\r\n  display: block;\r\n  width: 100%;\r\n  height: 286px;\r\n}\r\n\r\n.chart-stats {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 8px;\r\n  margin-bottom: 12px;\r\n}\r\n\r\n.chart-stats div {\r\n  min-width: 0;\r\n  padding: 10px 12px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.chart-stats span {\r\n  display: block;\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 700;\r\n  letter-spacing: 0.03em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.chart-stats strong {\r\n  display: block;\r\n  margin-top: 2px;\r\n  color: var(--text);\r\n  font: 760 16px/1.15 var(--mono);\r\n}\r\n\r\n.chart > svg {\r\n  display: block;\r\n  width: 100%;\r\n  height: 248px;\r\n}\r\n\r\n.chart .axis {\r\n  stroke: color-mix(in srgb, var(--line-strong) 44%, transparent);\r\n  stroke-width: 1;\r\n}\r\n\r\n.traffic-bar {\r\n  opacity: 0.9;\r\n  rx: 4px;\r\n  shape-rendering: geometricPrecision;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-bar-success {\r\n  fill: url(\"#trafficSuccessBar\");\r\n}\r\n\r\n.traffic-bar-failed {\r\n  fill: url(\"#trafficFailedBar\");\r\n}\r\n\r\n.traffic-firstbyte-area {\r\n  fill: url(\"#trafficFirstByteArea\");\r\n  pointer-events: none;\r\n}\r\n\r\n.traffic-firstbyte-line {\r\n  fill: none;\r\n  stroke: var(--info);\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  stroke-width: 3.4;\r\n  filter: drop-shadow(0 6px 12px color-mix(in srgb, var(--info) 18%, transparent));\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-firstbyte-dot {\r\n  fill: var(--info);\r\n  stroke: var(--surface);\r\n  stroke-width: 2.2;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-firstbyte-dot.warn,\r\n.traffic-firstbyte-dot.slow {\r\n  fill: var(--warning);\r\n}\r\n\r\n.traffic-firstbyte-label {\r\n  fill: var(--info);\r\n  font: 760 11px var(--mono);\r\n  paint-order: stroke;\r\n  stroke: var(--surface);\r\n  stroke-linejoin: round;\r\n  stroke-width: 4px;\r\n}\r\n\r\n.chart .line,\r\n.chart .success-line,\r\n.chart .fail-line,\r\n.chart .latency-line {\r\n  fill: none;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  stroke-width: 3.2;\r\n  filter: none;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.chart .line {\r\n  stroke: var(--text);\r\n  stroke-width: 2.2;\r\n}\r\n\r\n.chart .success-line {\r\n  stroke: var(--success);\r\n}\r\n\r\n.chart .fail-line {\r\n  stroke: var(--danger);\r\n  filter: none;\r\n}\r\n\r\n.chart .latency-line {\r\n  stroke: var(--info);\r\n}\r\n\r\n.chart .success-line-dot,\r\n.chart .fail-line-dot,\r\n.chart .latency-line-dot,\r\n.chart .latency-dot {\r\n  stroke: var(--surface);\r\n  stroke-width: 2;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.chart .success-line-dot {\r\n  fill: var(--success);\r\n}\r\n\r\n.chart .fail-line-dot {\r\n  fill: var(--danger);\r\n}\r\n\r\n.chart .latency-line-dot {\r\n  fill: var(--info);\r\n}\r\n\r\n.traffic-value-label {\r\n  font: 760 11px var(--mono);\r\n  paint-order: stroke;\r\n  stroke: var(--surface);\r\n  stroke-width: 4px;\r\n  stroke-linejoin: round;\r\n}\r\n\r\n.success-line-label {\r\n  fill: var(--success);\r\n}\r\n\r\n.fail-line-label {\r\n  fill: var(--danger);\r\n}\r\n\r\n.latency-line-label {\r\n  fill: var(--info);\r\n}\r\n\r\n.chart .latency-dot.ok {\r\n  fill: var(--success);\r\n}\r\n\r\n.chart .latency-dot.warn {\r\n  fill: var(--warning);\r\n}\r\n\r\n.chart .latency-dot.slow {\r\n  fill: var(--warning);\r\n}\r\n\r\n.chart .animated-line {\r\n  stroke-dasharray: 1;\r\n  stroke-dashoffset: 1;\r\n  animation: drawLine 680ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;\r\n}\r\n\r\n.latency-samples {\r\n  display: flex;\r\n  gap: 6px;\r\n  min-height: 38px;\r\n  margin-top: 8px;\r\n  overflow-x: auto;\r\n  padding-bottom: 2px;\r\n}\r\n\r\n.latency-sample {\r\n  --latency: 12%;\r\n  position: relative;\r\n  display: grid;\r\n  min-width: 88px;\r\n  overflow: hidden;\r\n  padding: 7px 9px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n}\r\n\r\n.latency-sample::before {\r\n  content: \"\";\r\n  position: absolute;\r\n  inset: auto 0 0 0;\r\n  height: 3px;\r\n  width: var(--latency);\r\n  background: var(--success);\r\n}\r\n\r\n.latency-sample.warn::before {\r\n  background: var(--warning);\r\n}\r\n\r\n.latency-sample.slow::before {\r\n  background: var(--warning);\r\n}\r\n\r\n.latency-sample span {\r\n  position: relative;\r\n  font: 760 12px var(--mono);\r\n}\r\n\r\n.latency-sample small {\r\n  position: relative;\r\n  margin-top: 1px;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.usage-chart {\r\n  display: grid;\r\n  gap: 13px;\r\n  padding: 14px 16px 16px;\r\n}\r\n\r\n.usage-summary {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 9px;\r\n}\r\n\r\n.usage-columns {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  gap: 14px;\r\n}\r\n\r\n.usage-columns.usage-model-only {\r\n  grid-template-columns: 1fr;\r\n}\r\n\r\n.usage-columns section {\r\n  min-width: 0;\r\n}\r\n\r\n.usage-columns h3 {\r\n  margin: 0 0 8px;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 820;\r\n  letter-spacing: 0;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.usage-section-title {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  margin-bottom: 8px;\r\n}\r\n\r\n.usage-section-title h3 {\r\n  margin: 0;\r\n}\r\n\r\n.usage-section-title span {\r\n  color: var(--muted);\r\n  font: 680 10.5px var(--mono);\r\n  white-space: nowrap;\r\n}\r\n\r\n.usage-bars {\r\n  display: grid;\r\n  gap: 10px;\r\n}\r\n\r\n.usage-row {\r\n  display: grid;\r\n  gap: 9px;\r\n  min-width: 0;\r\n  padding: 11px 12px;\r\n  border: 1px solid color-mix(in srgb, var(--metric-token) 16%, #d8d8dd);\r\n  border-radius: 8px;\r\n  background:\r\n    linear-gradient(180deg, rgba(111, 85, 196, 0.045), rgba(255, 255, 255, 0) 68%),\r\n    #fff;\r\n}\r\n\r\n.usage-row-head,\r\n.usage-row-foot {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n  min-width: 0;\r\n}\r\n\r\n.usage-row-head strong {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.usage-model-name {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.usage-rank {\r\n  display: inline-flex;\r\n  min-width: 28px;\r\n  justify-content: center;\r\n  padding: 1px 5px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 5px;\r\n  background: var(--compat-soft);\r\n  color: var(--compat);\r\n  font: 760 10px var(--mono);\r\n}\r\n\r\n.usage-call-count,\r\n.usage-row-foot span {\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  white-space: nowrap;\r\n}\r\n\r\n.usage-row-foot {\r\n  flex-wrap: wrap;\r\n  justify-content: flex-start;\r\n  gap: 6px 12px;\r\n}\r\n\r\n.usage-row-foot strong {\r\n  color: var(--text);\r\n  font: 760 12px var(--mono);\r\n}\r\n\r\n.usage-track {\r\n  position: relative;\r\n  display: flex;\r\n  gap: 2px;\r\n  height: 7px;\r\n  overflow: hidden;\r\n  border-radius: 999px;\r\n  background: #ededf0;\r\n}\r\n\r\n.usage-fill {\r\n  display: block;\r\n  min-width: 2px;\r\n  height: 100%;\r\n  border-radius: 999px;\r\n}\r\n\r\n.usage-fill.calls {\r\n  background: linear-gradient(90deg, var(--metric-token), color-mix(in srgb, var(--metric-token) 62%, var(--text)));\r\n}\r\n\r\n.usage-track-calls {\r\n  height: 7px;\r\n}\r\n\r\n.provider-health {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 12px;\r\n}\r\n\r\n#recentFailures.table-wrap {\r\n  overflow: visible;\r\n}\r\n\r\n.overview-summary-meta {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  min-width: 0;\r\n  padding: 3px 2px 1px;\r\n  color: var(--muted);\r\n  font: 760 11px var(--mono);\r\n  text-transform: uppercase;\r\n}\r\n\r\n.overview-summary-meta span {\r\n  display: inline-flex;\r\n  gap: 6px;\r\n  align-items: center;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.overview-summary-meta .icon-svg {\r\n  width: 14px;\r\n  height: 14px;\r\n}\r\n\r\n.overview-jump-button {\r\n  display: inline-grid;\r\n  width: 28px;\r\n  height: 28px;\r\n  place-items: center;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  cursor: pointer;\r\n  transition: border-color 160ms ease, background 160ms ease, transform 120ms ease;\r\n}\r\n\r\n.overview-jump-button:hover {\r\n  border-color: var(--text);\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.overview-jump-button:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.overview-provider-list,\r\n.recent-failure-list {\r\n  display: grid;\r\n  gap: 8px;\r\n}\r\n\r\n.overview-provider-row,\r\n.recent-failure-row {\r\n  --row-tone: var(--neutral);\r\n  display: grid;\r\n  gap: 10px;\r\n  align-items: center;\r\n  width: 100%;\r\n  min-width: 0;\r\n  border: 1px solid color-mix(in srgb, var(--row-tone) 16%, var(--line));\r\n  border-radius: 8px;\r\n  background:\r\n    linear-gradient(90deg, color-mix(in srgb, var(--row-tone) 7%, transparent), rgba(255, 255, 255, 0) 48%),\r\n    var(--surface);\r\n  color: var(--text);\r\n  text-align: left;\r\n  cursor: pointer;\r\n  transition: border-color 160ms ease, background 160ms ease, transform 120ms ease;\r\n}\r\n\r\n.overview-provider-row {\r\n  grid-template-columns: auto minmax(0, 1fr) auto;\r\n  padding: 10px 11px;\r\n}\r\n\r\n.recent-failure-row {\r\n  grid-template-columns: auto minmax(160px, 1fr) auto minmax(160px, 1.2fr);\r\n  padding: 10px 12px;\r\n}\r\n\r\n.overview-provider-row:hover,\r\n.recent-failure-row:hover,\r\n.overview-provider-row:focus-visible,\r\n.recent-failure-row:focus-visible {\r\n  border-color: color-mix(in srgb, var(--row-tone) 38%, var(--line-strong));\r\n  background:\r\n    linear-gradient(90deg, color-mix(in srgb, var(--row-tone) 11%, transparent), rgba(255, 255, 255, 0) 58%),\r\n    var(--surface-raised);\r\n}\r\n\r\n.overview-provider-row:active,\r\n.recent-failure-row:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.overview-provider-row.tone-ok,\r\n.recent-failure-row.tone-success {\r\n  --row-tone: var(--success);\r\n}\r\n\r\n.overview-provider-row.tone-warn,\r\n.recent-failure-row.tone-warning {\r\n  --row-tone: var(--warning);\r\n}\r\n\r\n.overview-provider-row.tone-bad,\r\n.recent-failure-row.tone-danger {\r\n  --row-tone: var(--danger);\r\n}\r\n\r\n.overview-provider-main,\r\n.recent-failure-main {\r\n  display: grid;\r\n  gap: 2px;\r\n  min-width: 0;\r\n}\r\n\r\n.overview-provider-main strong,\r\n.recent-failure-main strong {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  font-size: 12px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.overview-provider-main small,\r\n.recent-failure-main small,\r\n.overview-provider-kpi small {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.overview-provider-kpi {\r\n  display: grid;\r\n  justify-items: end;\r\n  min-width: 46px;\r\n}\r\n\r\n.overview-provider-kpi strong {\r\n  font: 820 12px var(--mono);\r\n}\r\n\r\n.recent-failure-status {\r\n  min-width: 0;\r\n}\r\n\r\n.recent-failure-reason {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-card {\r\n  display: grid;\r\n  gap: 9px;\r\n  padding: 12px 13px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.provider-card-head {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n\r\n.provider-name {\r\n  font-family: var(--mono);\r\n  font-weight: 760;\r\n}\r\n\r\n.provider-name.name-ok {\r\n  color: var(--success);\r\n}\r\n\r\n.provider-name.name-warn {\r\n  color: var(--warning);\r\n}\r\n\r\n.provider-name.name-bad {\r\n  color: var(--danger);\r\n}\r\n\r\n.provider-meta {\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.toolbar {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n  margin-bottom: 14px;\r\n  padding: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 9px;\r\n  background: var(--surface-raised);\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n#requestsToolbar {\r\n  position: relative;\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 12px;\r\n  align-items: center;\r\n  margin-bottom: 16px;\r\n  padding: 11px;\r\n  border: 1px solid color-mix(in srgb, var(--line-strong) 78%, var(--line));\r\n  border-radius: 11px;\r\n  background: color-mix(in srgb, var(--surface) 92%, var(--surface-raised));\r\n  box-shadow: 0 8px 22px rgba(30, 41, 59, 0.055), 0 1px 2px rgba(30, 41, 59, 0.045);\r\n}\r\n\r\n.request-filter-primary,\r\n.request-bulk-actions,\r\n.request-status-chips,\r\n.advanced-filter-fields {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n  align-items: center;\r\n  min-width: 0;\r\n}\r\n\r\n.request-filter-title {\r\n  display: grid;\r\n  gap: 1px;\r\n  min-width: 96px;\r\n  padding-right: 4px;\r\n}\r\n\r\n.request-filter-title span {\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  font-weight: 780;\r\n  letter-spacing: 0.055em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.request-filter-title strong {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n\r\n.request-status-chips {\r\n  gap: 6px;\r\n  padding: 3px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 9px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.filter-chip {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  min-height: 28px;\r\n  padding: 0 10px;\r\n  border: 1px solid transparent;\r\n  border-radius: 7px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n  cursor: pointer;\r\n  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;\r\n}\r\n\r\n.filter-chip:hover,\r\n.filter-chip:focus-visible {\r\n  border-color: var(--line);\r\n  background: var(--surface);\r\n  color: var(--text);\r\n}\r\n\r\n.filter-chip.is-active {\r\n  border-color: color-mix(in srgb, var(--text) 13%, var(--line));\r\n  background: var(--text);\r\n  color: #fff;\r\n}\r\n\r\n.filter-chip.tone-success.is-active {\r\n  border-color: color-mix(in srgb, var(--success) 36%, var(--line));\r\n  background: var(--success);\r\n}\r\n\r\n.filter-chip.tone-danger.is-active {\r\n  border-color: color-mix(in srgb, var(--danger) 38%, var(--line));\r\n  background: var(--danger);\r\n}\r\n\r\n.filter-search-field {\r\n  min-width: 0;\r\n}\r\n\r\n#requestsToolbar .control {\r\n  width: 168px;\r\n  min-height: 34px;\r\n  border-color: color-mix(in srgb, var(--info) 12%, var(--line));\r\n  background: rgba(255, 255, 255, 0.82);\r\n}\r\n\r\n#requestsToolbar .control:focus-visible {\r\n  border-color: color-mix(in srgb, var(--info) 62%, var(--line));\r\n  box-shadow: 0 0 0 3px rgba(50, 103, 199, 0.14);\r\n}\r\n\r\n#requestsToolbar .button.secondary {\r\n  border-color: color-mix(in srgb, var(--text) 86%, var(--line));\r\n  background: var(--text);\r\n  color: #fff;\r\n}\r\n\r\n#requestsToolbar .button.ghost {\r\n  color: color-mix(in srgb, var(--text) 72%, var(--muted));\r\n}\r\n\r\n.advanced-filter-box {\r\n  position: relative;\r\n}\r\n\r\n.advanced-filter-box summary {\r\n  display: inline-flex;\r\n  min-height: 34px;\r\n  align-items: center;\r\n  padding: 0 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface);\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n  cursor: pointer;\r\n  list-style: none;\r\n}\r\n\r\n.advanced-filter-box summary::-webkit-details-marker {\r\n  display: none;\r\n}\r\n\r\n.advanced-filter-box[open] summary {\r\n  border-color: color-mix(in srgb, var(--info) 36%, var(--line));\r\n  color: var(--text);\r\n}\r\n\r\n.advanced-filter-fields {\r\n  position: absolute;\r\n  top: calc(100% + 8px);\r\n  right: 0;\r\n  z-index: 8;\r\n  width: min(520px, calc(100vw - 48px));\r\n  padding: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  box-shadow: 0 14px 34px rgba(30, 41, 59, 0.14);\r\n}\r\n\r\n.request-bulk-actions {\r\n  justify-content: flex-end;\r\n  padding-left: 12px;\r\n  border-left: 1px solid var(--line-soft);\r\n}\r\n\r\n.selection-count {\r\n  min-width: 78px;\r\n  color: var(--muted);\r\n  font: 720 11px var(--mono);\r\n  text-align: right;\r\n}\r\n\r\n.request-bulk-actions .button {\r\n  gap: 6px;\r\n}\r\n\r\n.request-bulk-actions .icon-svg {\r\n  width: 15px;\r\n  height: 15px;\r\n}\r\n\r\n.sr-only {\r\n  position: absolute;\r\n  width: 1px;\r\n  height: 1px;\r\n  overflow: hidden;\r\n  clip: rect(0, 0, 0, 0);\r\n  white-space: nowrap;\r\n}\r\n\r\n.control {\r\n  min-height: 36px;\r\n  padding: 0 11px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  transition: border-color 160ms ease, box-shadow 160ms ease;\r\n}\r\n\r\n.control:hover {\r\n  border-color: #c8c8ce;\r\n}\r\n\r\n.table-wrap {\r\n  overflow: auto;\r\n}\r\n\r\n#requestsTable.table-wrap {\r\n  overflow-x: hidden;\r\n}\r\n\r\n.request-list-head {\r\n  display: flex;\r\n  gap: 12px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  padding: 10px 14px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n  background: linear-gradient(90deg, rgba(50, 103, 199, 0.04), rgba(255, 255, 255, 0));\r\n}\r\n\r\n.request-page-summary {\r\n  display: flex;\r\n  gap: 6px;\r\n  align-items: baseline;\r\n  min-width: 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.request-page-select {\r\n  display: inline-flex;\r\n  gap: 6px;\r\n  align-items: center;\r\n  margin-right: 8px;\r\n  padding-right: 10px;\r\n  border-right: 1px solid var(--line-soft);\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-page-select input,\r\n.request-row-select input {\r\n  width: 15px;\r\n  height: 15px;\r\n  margin: 0;\r\n  accent-color: var(--text);\r\n  cursor: pointer;\r\n}\r\n\r\n.request-page-summary strong {\r\n  color: var(--text);\r\n  font: 760 12px var(--mono);\r\n}\r\n\r\n.request-pagination {\r\n  display: inline-flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-page-indicator {\r\n  color: var(--muted);\r\n  font: 680 11px var(--mono);\r\n}\r\n\r\n.request-page-vitals {\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 8px;\r\n  padding: 10px 14px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n  background: color-mix(in srgb, var(--surface-raised) 72%, var(--surface));\r\n}\r\n\r\n.request-vital {\r\n  --vital-color: var(--neutral);\r\n  --vital: 0%;\r\n  position: relative;\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  gap: 2px 8px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  padding: 8px 9px;\r\n  border: 1px solid color-mix(in srgb, var(--vital-color) 18%, var(--line));\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n}\r\n\r\n.request-vital::after {\r\n  content: \"\";\r\n  position: absolute;\r\n  inset: auto 0 0 0;\r\n  width: var(--vital);\r\n  height: 3px;\r\n  background: var(--vital-color);\r\n  opacity: 0.75;\r\n}\r\n\r\n.request-vital .icon-svg {\r\n  grid-row: 1 / span 2;\r\n  align-self: center;\r\n  color: var(--vital-color);\r\n}\r\n\r\n.request-vital strong {\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  font: 840 13px/1 var(--mono);\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-vital small {\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  font-weight: 720;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-vital-success {\r\n  --vital-color: var(--success);\r\n}\r\n\r\n.request-vital-warning {\r\n  --vital-color: var(--warning);\r\n}\r\n\r\n.request-vital-danger {\r\n  --vital-color: var(--danger);\r\n}\r\n\r\n.request-vital-info {\r\n  --vital-color: var(--info);\r\n}\r\n\r\n.request-vital-compat {\r\n  --vital-color: var(--compat);\r\n}\r\n\r\n.request-summary-list {\r\n  display: grid;\r\n  gap: 0;\r\n}\r\n\r\n.request-summary-row {\r\n  --row-tone: var(--neutral);\r\n  display: grid;\r\n  grid-template-columns: 24px 10px minmax(180px, 1.35fr) minmax(108px, 0.55fr) minmax(145px, 0.9fr) minmax(146px, 0.72fr) 28px;\r\n  gap: 10px;\r\n  align-items: center;\r\n  width: 100%;\r\n  min-width: 0;\r\n  padding: 11px 14px;\r\n  border: 0;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--line-strong) 52%, var(--line-soft));\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  text-align: left;\r\n  cursor: pointer;\r\n  transition: background 140ms ease, box-shadow 140ms ease, border-color 140ms ease;\r\n}\r\n\r\n.request-summary-row:nth-child(even) {\r\n  background: color-mix(in srgb, var(--surface-raised) 62%, var(--surface));\r\n}\r\n\r\n.request-summary-row:hover,\r\n.request-summary-row:focus-visible {\r\n  background: color-mix(in srgb, var(--info-soft) 36%, var(--surface));\r\n  box-shadow: inset 3px 0 0 var(--row-tone);\r\n}\r\n\r\n.request-summary-row.is-selected {\r\n  background: color-mix(in srgb, var(--info-soft) 56%, var(--surface));\r\n  box-shadow: inset 3px 0 0 var(--info);\r\n}\r\n\r\n.request-summary-row.tone-success {\r\n  --row-tone: var(--success);\r\n}\r\n\r\n.request-summary-row.tone-warning {\r\n  --row-tone: var(--warning);\r\n}\r\n\r\n.request-summary-row.tone-danger {\r\n  --row-tone: var(--danger);\r\n}\r\n\r\n.request-row-dot {\r\n  width: 10px;\r\n  height: 10px;\r\n  border-radius: 50%;\r\n  background: var(--row-tone);\r\n  box-shadow: 0 0 0 3px color-mix(in srgb, var(--row-tone) 14%, transparent);\r\n}\r\n\r\n.request-row-select {\r\n  display: grid;\r\n  width: 24px;\r\n  height: 24px;\r\n  place-items: center;\r\n  border: 1px solid transparent;\r\n  border-radius: 7px;\r\n  cursor: pointer;\r\n}\r\n\r\n.request-row-select:hover,\r\n.request-row-select:focus-within {\r\n  border-color: var(--line);\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.request-row-main,\r\n.request-row-status,\r\n.request-row-route,\r\n.request-row-metrics {\r\n  min-width: 0;\r\n}\r\n\r\n.request-row-main {\r\n  display: grid;\r\n  gap: 3px;\r\n}\r\n\r\n.request-row-main strong {\r\n  overflow: hidden;\r\n  font-size: 12.5px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-row-main small,\r\n.request-row-metrics small {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 4px 8px;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  line-height: 1.25;\r\n}\r\n\r\n.request-row-main small span {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.request-row-status {\r\n  display: flex;\r\n  gap: 6px;\r\n  align-items: center;\r\n}\r\n\r\n.request-row-status small {\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n}\r\n\r\n.request-row-route {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  align-items: center;\r\n}\r\n\r\n.request-provider-pill,\r\n.route-pill {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  min-height: 22px;\r\n  padding: 2px 7px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 6px;\r\n  background: var(--surface-raised);\r\n  font: 760 11px var(--mono);\r\n}\r\n\r\n.request-provider-pill {\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.route-pill.ok {\r\n  border-color: color-mix(in srgb, var(--success) 24%, var(--line));\r\n  background: var(--success-soft);\r\n  color: var(--success);\r\n}\r\n\r\n.route-pill.warn {\r\n  border-color: color-mix(in srgb, var(--warning) 24%, var(--line));\r\n  background: var(--warning-soft);\r\n  color: var(--warning);\r\n}\r\n\r\n.route-pill.bad {\r\n  border-color: color-mix(in srgb, var(--danger) 24%, var(--line));\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n}\r\n\r\n.route-pill.neutral {\r\n  color: var(--muted);\r\n}\r\n\r\n.request-row-metrics {\r\n  display: grid;\r\n  gap: 2px;\r\n  justify-items: start;\r\n}\r\n\r\n.request-row-metrics strong {\r\n  font-size: 13px;\r\n}\r\n\r\n.request-row-open {\r\n  display: grid;\r\n  width: 28px;\r\n  height: 28px;\r\n  place-items: center;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 7px;\r\n  color: var(--muted);\r\n}\r\n\r\n.requests-summary-table {\r\n  border-top: 1px solid var(--line);\r\n  table-layout: fixed;\r\n}\r\n\r\n.requests-summary-table th:nth-child(1),\r\n.requests-summary-table td:nth-child(1) {\r\n  width: 16%;\r\n}\r\n\r\n.requests-summary-table th:nth-child(2),\r\n.requests-summary-table td:nth-child(2) {\r\n  width: 15%;\r\n}\r\n\r\n.requests-summary-table th:nth-child(3),\r\n.requests-summary-table td:nth-child(3) {\r\n  width: 25%;\r\n}\r\n\r\n.requests-summary-table th:nth-child(4),\r\n.requests-summary-table td:nth-child(4) {\r\n  width: 16%;\r\n}\r\n\r\n.requests-summary-table th:nth-child(5),\r\n.requests-summary-table td:nth-child(5) {\r\n  width: 14%;\r\n}\r\n\r\n.requests-summary-table th:nth-child(6),\r\n.requests-summary-table td:nth-child(6) {\r\n  width: 14%;\r\n}\r\n\r\n.request-model-cell,\r\n.request-provider-cell,\r\n.request-route-cell,\r\n.request-status-cell {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n}\r\n\r\n.request-time-cell {\r\n  white-space: normal;\r\n}\r\n\r\n.request-usage-cell small {\r\n  display: inline;\r\n  margin-left: 7px;\r\n  color: var(--muted);\r\n  font: 680 11px var(--mono);\r\n}\r\n\r\n.request-usage-cell small::before {\r\n  content: \"/\";\r\n  margin-right: 7px;\r\n  color: var(--faint);\r\n}\r\n\r\ntable {\r\n  width: 100%;\r\n  border-collapse: collapse;\r\n}\r\n\r\nth,\r\ntd {\r\n  padding: 12px 13px;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--line-strong) 58%, var(--line-soft));\r\n  text-align: left;\r\n  vertical-align: top;\r\n}\r\n\r\nth {\r\n  position: sticky;\r\n  top: 0;\r\n  z-index: 1;\r\n  background: var(--surface-raised);\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 720;\r\n  letter-spacing: 0.045em;\r\n  text-transform: uppercase;\r\n}\r\n\r\ntd {\r\n  color: var(--text);\r\n  font-size: 12.5px;\r\n}\r\n\r\ntr.clickable {\r\n  cursor: pointer;\r\n}\r\n\r\ntbody tr {\r\n  position: relative;\r\n  transition: background 140ms ease, box-shadow 140ms ease;\r\n}\r\n\r\ntbody tr:nth-child(even) {\r\n  background: rgba(244, 244, 245, 0.42);\r\n}\r\n\r\ntbody tr:hover,\r\ntr.clickable:hover {\r\n  background: color-mix(in srgb, var(--info-soft) 28%, var(--surface));\r\n  box-shadow: inset 3px 0 0 var(--info);\r\n}\r\n\r\n.mono {\r\n  font-family: var(--mono);\r\n}\r\n\r\n.muted {\r\n  color: var(--muted);\r\n}\r\n\r\n.empty {\r\n  color: var(--muted);\r\n  font-size: 13px;\r\n}\r\n\r\n.pad {\r\n  padding: 15px;\r\n}\r\n\r\n.keyword {\r\n  border-radius: 5px;\r\n  padding: 1px 4px;\r\n  font-weight: 760;\r\n}\r\n\r\n.keyword.danger,\r\n.message-text.danger,\r\n.message-chip.danger {\r\n  color: var(--danger);\r\n}\r\n\r\n.keyword.warn,\r\n.message-text.warn,\r\n.message-chip.warn {\r\n  color: var(--warning);\r\n}\r\n\r\n.keyword.info,\r\n.message-text.info,\r\n.message-chip.info {\r\n  color: var(--info);\r\n}\r\n\r\n.keyword.compat,\r\n.message-text.compat,\r\n.message-chip.compat {\r\n  color: var(--compat);\r\n}\r\n\r\n.keyword.success,\r\n.message-text.success,\r\n.message-chip.success {\r\n  color: var(--success);\r\n}\r\n\r\n.keyword.neutral,\r\n.message-text.neutral,\r\n.message-chip.neutral {\r\n  color: var(--neutral);\r\n}\r\n\r\n.keyword.muted,\r\n.message-text.muted,\r\n.message-chip.muted {\r\n  color: var(--faint);\r\n}\r\n\r\n.keyword.danger {\r\n  background: var(--danger-soft);\r\n}\r\n\r\n.keyword.warn {\r\n  background: var(--warning-soft);\r\n}\r\n\r\n.keyword.info {\r\n  background: var(--info-soft);\r\n}\r\n\r\n.keyword.compat {\r\n  background: var(--compat-soft);\r\n}\r\n\r\n.keyword.success {\r\n  background: var(--success-soft);\r\n}\r\n\r\n.message-text {\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.chip-list {\r\n  display: inline-flex;\r\n  flex-wrap: wrap;\r\n  gap: 5px;\r\n  vertical-align: middle;\r\n}\r\n\r\n.message-chip {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  min-height: 22px;\r\n  padding: 2px 7px;\r\n  border: 1px solid color-mix(in srgb, currentColor 42%, white);\r\n  border-radius: 6px;\r\n  background: color-mix(in srgb, currentColor 15%, white);\r\n  font: 780 11px var(--mono);\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-table {\r\n  display: block;\r\n  overflow: visible;\r\n  padding: 12px;\r\n}\r\n\r\n.provider-card-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  align-items: stretch;\r\n  gap: 12px;\r\n}\r\n\r\n.panel-pagination {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  margin-bottom: 10px;\r\n  padding: 8px 10px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--surface-raised) 72%, var(--surface));\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.panel-pagination strong {\r\n  color: var(--text);\r\n  font-family: var(--mono);\r\n}\r\n\r\n.panel-pagination-actions {\r\n  display: inline-flex;\r\n  gap: 7px;\r\n  align-items: center;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-toolbar {\r\n  display: grid;\r\n  grid-template-columns: minmax(220px, 1.4fr) minmax(150px, 0.75fr) minmax(150px, 0.75fr) minmax(150px, 0.75fr) auto;\r\n  gap: 10px;\r\n  align-items: end;\r\n  margin: 0 12px 4px;\r\n  padding: 12px;\r\n  border: 1px solid color-mix(in srgb, var(--info) 10%, var(--line));\r\n  border-radius: 10px;\r\n  background:\r\n    linear-gradient(135deg, color-mix(in srgb, var(--info-soft) 50%, var(--surface)) 0, var(--surface) 52%),\r\n    var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.provider-search-field {\r\n  min-width: 0;\r\n}\r\n\r\n.provider-model-list {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 14px;\r\n}\r\n\r\n.model-capability-summary {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.model-capability-card {\r\n  display: grid;\r\n  gap: 10px;\r\n  min-width: 0;\r\n  padding: 12px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--neutral);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.model-capability-card.tone-success {\r\n  border-left-color: var(--success);\r\n}\r\n\r\n.model-capability-card.tone-danger {\r\n  border-left-color: var(--danger);\r\n}\r\n\r\n.model-chip-list {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  min-width: 0;\r\n}\r\n\r\n.model-chip-list .tag,\r\n.model-map-chip {\r\n  max-width: 100%;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.model-map-chip {\r\n  display: grid;\r\n  gap: 2px;\r\n  min-width: 0;\r\n  padding: 5px 8px 6px;\r\n  border: 1px solid color-mix(in srgb, var(--info) 14%, var(--line-soft));\r\n  border-radius: 6px;\r\n  background: color-mix(in srgb, var(--info-soft) 36%, var(--surface));\r\n  font-size: 11px;\r\n  cursor: pointer;\r\n  transition: all 0.12s ease;\r\n}\r\n\r\n.model-map-chip:hover {\r\n  background: color-mix(in srgb, var(--info-soft) 72%, var(--surface));\r\n  border-color: color-mix(in srgb, var(--info) 45%, var(--line));\r\n  transform: translateY(-1px);\r\n  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);\r\n}\r\n\r\n.model-map-chip b,\r\n.model-map-chip small {\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.model-map-chip b {\r\n  font-family: var(--mono);\r\n  font-weight: 780;\r\n}\r\n\r\n.model-map-chip small {\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 10px;\r\n}\r\n\r\n.provider-model-toolbar {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n  align-items: center;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-model-search {\r\n  flex: 1 1 180px;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-model-status-filter {\r\n  flex: 0 0 118px;\r\n}\r\n\r\n.provider-model-chip {\r\n  position: relative;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: start;\r\n  color: inherit;\r\n  font: inherit;\r\n  text-align: left;\r\n}\r\n\r\n.model-chip-toggle,\r\n.model-map-edit-button {\r\n  appearance: none;\r\n  border: 0;\r\n  background: transparent;\r\n  color: inherit;\r\n  font: inherit;\r\n}\r\n\r\n.model-chip-toggle {\r\n  display: grid;\r\n  gap: 2px;\r\n  min-width: 0;\r\n  padding: 0;\r\n  text-align: left;\r\n  cursor: pointer;\r\n}\r\n\r\n.model-map-edit-button {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 22px;\r\n  height: 22px;\r\n  padding: 0;\r\n  border-radius: 5px;\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n}\r\n\r\n.model-map-edit-button:hover {\r\n  color: var(--info);\r\n  background: color-mix(in srgb, var(--info-soft) 64%, transparent);\r\n}\r\n\r\n.model-chip-toggle:focus-visible,\r\n.model-map-edit-button:focus-visible {\r\n  outline: 2px solid color-mix(in srgb, var(--info) 70%, transparent);\r\n  outline-offset: 2px;\r\n}\r\n\r\n.provider-model-chip.is-disabled {\r\n  border-color: color-mix(in srgb, var(--danger) 34%, var(--line));\r\n  background: color-mix(in srgb, var(--danger-soft) 48%, var(--surface));\r\n}\r\n\r\n.provider-model-chip.is-pending {\r\n  outline: 1px dashed color-mix(in srgb, var(--warning) 70%, var(--line));\r\n  outline-offset: 2px;\r\n}\r\n\r\n.provider-model-chip.is-manual-map {\r\n  border-color: color-mix(in srgb, var(--success) 28%, var(--line));\r\n  background: color-mix(in srgb, var(--success-soft) 42%, var(--surface));\r\n}\r\n\r\n.provider-model-chip.is-disabled b {\r\n  color: color-mix(in srgb, var(--danger) 72%, var(--text));\r\n  text-decoration: line-through;\r\n  text-decoration-thickness: 2px;\r\n  text-decoration-color: var(--danger);\r\n}\r\n\r\n.model-pending-note {\r\n  color: color-mix(in srgb, var(--warning) 78%, var(--muted));\r\n}\r\n\r\n.model-price-tip {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  margin-left: 4px;\r\n  vertical-align: -2px;\r\n  color: var(--muted);\r\n  opacity: 0.55;\r\n  cursor: help;\r\n  transition: opacity 0.12s ease;\r\n}\r\n\r\n.model-price-tip .icon-svg {\r\n  width: 12px;\r\n  height: 12px;\r\n}\r\n\r\n.model-price-tip:hover {\r\n  opacity: 1;\r\n  color: var(--info, #3b82f6);\r\n}\r\n\r\n.provider-model-pill .model-price-tip {\r\n  margin-left: 6px;\r\n}\r\n\r\n.static-model-chip {\r\n  position: relative;\r\n  padding-right: 24px;\r\n}\r\n\r\n.static-model-delete {\r\n  position: absolute;\r\n  top: 4px;\r\n  right: 5px;\r\n  width: 16px;\r\n  height: 16px;\r\n  display: grid;\r\n  place-items: center;\r\n  border: 1px solid transparent;\r\n  border-radius: 999px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n  font-size: 12px;\r\n  line-height: 1;\r\n}\r\n\r\n.static-model-delete:hover {\r\n  border-color: var(--danger);\r\n  color: var(--danger);\r\n  background: color-mix(in srgb, var(--danger) 8%, transparent);\r\n}\r\n\r\n.model-capability-error {\r\n  padding: 8px;\r\n  border: 1px solid var(--danger);\r\n  border-radius: 8px;\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n  font-size: 12px;\r\n  font-weight: 740;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.provider-runtime-card {\r\n  position: relative;\r\n  display: grid;\r\n  min-width: 0;\r\n  gap: 10px;\r\n  padding: 13px;\r\n  border: 1px solid color-mix(in srgb, var(--neutral) 16%, var(--line));\r\n  border-top: 3px solid var(--neutral);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;\r\n}\r\n\r\n.provider-health-tile {\r\n  min-height: 268px;\r\n  height: 100%;\r\n  cursor: pointer;\r\n}\r\n\r\n.provider-health-tile:hover {\r\n  border-color: color-mix(in srgb, var(--info) 24%, var(--line));\r\n  box-shadow: var(--shadow-tight);\r\n  transform: translateY(-1px);\r\n}\r\n\r\n.provider-health-tile:focus-visible {\r\n  box-shadow: 0 0 0 3px rgba(50, 103, 199, 0.16), var(--shadow-tight);\r\n}\r\n\r\n.provider-runtime-card.is-available {\r\n  border-top-color: var(--success);\r\n}\r\n\r\n.provider-runtime-card.is-degraded,\r\n.provider-runtime-card.is-cooldown,\r\n.provider-runtime-card.is-unavailable {\r\n  border-top-color: var(--warning);\r\n}\r\n\r\n.provider-runtime-card.is-unavailable {\r\n  border-top-color: var(--danger);\r\n}\r\n\r\n.provider-runtime-card.is-disabled {\r\n  border-top-color: var(--faint);\r\n  opacity: 0.76;\r\n}\r\n\r\n.provider-card-topline {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr) auto;\r\n  gap: 9px;\r\n  align-items: start;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-card-badges {\r\n  display: inline-flex;\r\n  flex-wrap: wrap;\r\n  justify-content: flex-end;\r\n  gap: 5px;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-status-dot {\r\n  width: 9px;\r\n  height: 9px;\r\n  margin-top: 6px;\r\n  border-radius: 50%;\r\n  background: var(--neutral);\r\n  box-shadow: 0 0 0 4px color-mix(in srgb, var(--neutral) 12%, transparent);\r\n}\r\n\r\n.provider-status-dot.ok {\r\n  background: var(--success);\r\n  box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 14%, transparent);\r\n}\r\n\r\n.provider-status-dot.warn {\r\n  background: var(--warning);\r\n  box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning) 16%, transparent);\r\n}\r\n\r\n.provider-status-dot.bad {\r\n  background: var(--danger);\r\n  box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger) 14%, transparent);\r\n}\r\n\r\n.provider-card-models {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  min-height: 28px;\r\n  align-content: start;\r\n}\r\n\r\n.provider-model-pill,\r\n.provider-model-more,\r\n.format-chip {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  min-width: 0;\r\n  max-width: 100%;\r\n  min-height: 24px;\r\n  padding: 3px 7px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 6px;\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n  font: 720 11px/1.2 var(--mono);\r\n}\r\n\r\n.provider-model-pill {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-model-pill.provider-model-refreshing {\r\n  border-color: var(--accent, #3b82f6);\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n  font-weight: 720;\r\n  gap: 6px;\r\n}\r\n\r\n.refresh-spinner {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 14px;\r\n  height: 14px;\r\n  vertical-align: -2px;\r\n}\r\n\r\n.refresh-spinner .icon-svg {\r\n  width: 14px;\r\n  height: 14px;\r\n  animation: refresh-spin 0.9s linear infinite;\r\n}\r\n\r\n@keyframes refresh-spin {\r\n  from { transform: rotate(0deg); }\r\n  to { transform: rotate(360deg); }\r\n}\r\n\r\n.provider-cap-refreshing-badge {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n}\r\n\r\n.model-capability-refreshing {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 8px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 8px;\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 740;\r\n}\r\n\r\n.provider-model-more {\r\n  color: var(--info);\r\n  border-color: color-mix(in srgb, var(--info) 18%, var(--line));\r\n  background: color-mix(in srgb, var(--info-soft) 55%, var(--surface));\r\n}\r\n\r\n.format-chip {\r\n  margin-right: 4px;\r\n  min-height: 21px;\r\n  padding: 2px 6px;\r\n  color: var(--info);\r\n  border-color: color-mix(in srgb, var(--info) 18%, var(--line));\r\n  background: color-mix(in srgb, var(--info-soft) 64%, var(--surface));\r\n  font-size: 10px;\r\n}\r\n\r\n.format-chip.tone-compat {\r\n  color: var(--compat);\r\n  border-color: color-mix(in srgb, var(--compat) 18%, var(--line));\r\n  background: color-mix(in srgb, var(--compat-soft) 64%, var(--surface));\r\n}\r\n\r\n.provider-card-metrics {\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 5px;\r\n}\r\n\r\n.provider-card-metric {\r\n  display: grid;\r\n  grid-template-columns: 16px minmax(0, auto);\r\n  min-width: 0;\r\n  justify-content: start;\r\n  gap: 1px 3px;\r\n  align-items: center;\r\n  min-height: 39px;\r\n  padding: 7px 5px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--surface-raised) 86%, var(--surface));\r\n}\r\n\r\n.provider-card-metric small {\r\n  display: none;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  font-weight: 720;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-card-metric b {\r\n  display: grid;\r\n  width: 16px;\r\n  height: 18px;\r\n  place-items: center;\r\n  border-radius: 5px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n}\r\n\r\n.provider-card-metric b .icon-svg {\r\n  width: 12px;\r\n  height: 12px;\r\n}\r\n\r\n.provider-card-metric strong {\r\n  overflow: visible;\r\n  color: var(--text);\r\n  font: 820 13px/1.15 var(--mono);\r\n  text-overflow: clip;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-card-error {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  gap: 7px;\r\n  align-items: center;\r\n  min-height: 34px;\r\n  padding: 8px;\r\n  border: 1px solid color-mix(in srgb, var(--warning) 16%, var(--line));\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--warning-soft) 56%, var(--surface));\r\n}\r\n\r\n.provider-card-error.is-empty {\r\n  border-color: var(--line-soft);\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.provider-card-error span {\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  font-weight: 780;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.provider-card-error strong {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  font-size: 11px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-sparkline {\r\n  display: flex;\r\n  align-items: end;\r\n  gap: 2px;\r\n  height: 24px;\r\n  padding: 5px 0 1px;\r\n}\r\n\r\n.provider-spark {\r\n  flex: 1 1 0;\r\n  min-width: 2px;\r\n  height: 14px;\r\n  border-radius: 2px;\r\n  background: var(--line-strong);\r\n}\r\n\r\n.provider-spark.ok {\r\n  background: var(--success);\r\n}\r\n\r\n.provider-spark.warn {\r\n  background: var(--warning);\r\n}\r\n\r\n.provider-spark.bad {\r\n  background: var(--danger);\r\n}\r\n\r\n.provider-spark.neutral {\r\n  background: var(--line-strong);\r\n}\r\n\r\n.provider-card-footer {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  margin-top: auto;\r\n  padding-top: 2px;\r\n}\r\n\r\n.provider-config-state {\r\n  color: var(--muted);\r\n  font: 720 11px var(--mono);\r\n}\r\n\r\n.provider-runtime-head,\r\n.key-card-head,\r\n.failure-policy-head {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n}\r\n\r\n.failure-policy-head {\r\n  align-items: center;\r\n}\r\n\r\n.key-card-badges {\r\n  display: inline-flex;\r\n  gap: 6px;\r\n  align-items: center;\r\n  flex-wrap: wrap;\r\n  justify-content: flex-end;\r\n}\r\n\r\n.compact-control {\r\n  width: auto;\r\n  min-width: 142px;\r\n  min-height: 32px;\r\n  padding: 0 9px;\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.provider-title-block {\r\n  min-width: 0;\r\n}\r\n\r\n.provider-runtime-actions {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  justify-content: flex-end;\r\n}\r\n\r\n.provider-runtime-actions .button {\r\n  min-height: 30px;\r\n  padding: 0 9px;\r\n  font-size: 11.5px;\r\n}\r\n\r\n.provider-runtime-actions .button.icon-action {\r\n  width: 30px;\r\n  min-width: 30px;\r\n  height: 30px;\r\n  min-height: 30px;\r\n  padding: 0;\r\n}\r\n\r\n.provider-runtime-actions .badge {\r\n  min-height: 30px;\r\n}\r\n\r\n.provider-compact-stats {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 7px;\r\n}\r\n\r\n.compact-stat {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  gap: 1px 8px;\r\n  min-width: 0;\r\n  padding: 7px 8px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.compact-stat b,\r\n.compact-stat small {\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 720;\r\n}\r\n\r\n.compact-stat strong {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--text);\r\n  font: 800 13px/1.2 var(--mono);\r\n  text-align: right;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.compact-stat small {\r\n  grid-column: 1 / -1;\r\n  color: var(--faint);\r\n}\r\n\r\n.provider-metrics,\r\n.policy-summary-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.mini-metric {\r\n  min-width: 0;\r\n  padding: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.mini-metric span {\r\n  display: block;\r\n  color: var(--text);\r\n  font-size: 11px;\r\n  font-weight: 780;\r\n}\r\n\r\n.mini-metric strong {\r\n  display: block;\r\n  margin-top: 2px;\r\n  color: var(--text);\r\n  font: 820 17px/1.2 var(--mono);\r\n}\r\n\r\n.mini-metric small {\r\n  display: block;\r\n  margin-top: 2px;\r\n  overflow: hidden;\r\n  color: var(--faint);\r\n  font-size: 10px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.runtime-state-strip,\r\n.policy-decision-strip {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n}\r\n\r\n.provider-runtime-details {\r\n  border-top: 1px solid var(--line-soft);\r\n  padding-top: 4px;\r\n}\r\n\r\n.provider-runtime-details > summary {\r\n  cursor: pointer;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 760;\r\n}\r\n\r\n.provider-runtime-details[open] {\r\n  display: grid;\r\n  gap: 9px;\r\n}\r\n\r\n.provider-runtime-details[open] > summary {\r\n  color: var(--text);\r\n}\r\n\r\n.format-route-list {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.format-route {\r\n  position: relative;\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  align-items: center;\r\n  gap: 2px;\r\n  min-width: 0;\r\n  padding: 9px 9px 9px 11px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  opacity: 1;\r\n  transition: border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease, transform 0.06s ease;\r\n}\r\n\r\n.format-route.enabled {\r\n  border-color: color-mix(in srgb, var(--info, #3b82f6) 70%, var(--line));\r\n  background: var(--success-soft);\r\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--info, #3b82f6) 22%, transparent) inset;\r\n}\r\n\r\n.format-route.enabled b {\r\n  color: black;\r\n}\r\n\r\n.format-route.disabled {\r\n  opacity: 0.55;\r\n}\r\n\r\n.format-route-main {\r\n  display: grid;\r\n  gap: 2px;\r\n  min-width: 0;\r\n}\r\n\r\n.format-route-main b,\r\n.format-route-main small {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.format-route-main b {\r\n  font: 760 11px var(--mono);\r\n}\r\n\r\n.format-route-main small {\r\n  color: var(--muted);\r\n  font: 11px var(--mono);\r\n}\r\n\r\n/* Checkmark badge shown on enabled interactive cards so the selected state is\r\n   unmistakable. Pure CSS, no extra markup needed. */\r\n.format-route.is-interactive.enabled::after {\r\n  content: \"\";\r\n  position: absolute;\r\n  top: 7px;\r\n  right: 42px;\r\n  width: 9px;\r\n  height: 9px;\r\n  border-radius: 50%;\r\n  background: var(--success);\r\n  box-shadow: 0 0 0 2px color-mix(in srgb, var(--info, #3b82f6) 18%, transparent);\r\n}\r\n\r\n.format-route.is-interactive {\r\n  cursor: pointer;\r\n  user-select: none;\r\n}\r\n\r\n.format-route.is-interactive:hover {\r\n  border-color: color-mix(in srgb, var(--info, #3b82f6) 55%, var(--line));\r\n  background: color-mix(in srgb, var(--info, #3b82f6) 6%, var(--surface));\r\n}\r\n\r\n.format-route.is-interactive.enabled:hover {\r\n  background: color-mix(in srgb, var(--info, #3b82f6) 18%, var(--surface));\r\n}\r\n\r\n.format-route.is-interactive:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.format-route.is-interactive:focus-visible {\r\n  outline: 2px solid var(--info, #3b82f6);\r\n  outline-offset: 1px;\r\n}\r\n\r\n.format-route-edit {\r\n  position: relative;\r\n  z-index: 1;\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 28px;\r\n  height: 28px;\r\n  margin-left: 8px;\r\n  border: 1px solid transparent;\r\n  border-radius: 7px;\r\n  background: transparent;\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n  transition: color 0.14s ease, background 0.14s ease, border-color 0.14s ease, transform 0.06s ease;\r\n}\r\n\r\n.format-route-edit:hover {\r\n  border-color: var(--line);\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n}\r\n\r\n.format-route-edit:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.format-route-edit:focus-visible {\r\n  outline: 2px solid var(--info, #3b82f6);\r\n  outline-offset: 1px;\r\n}\r\n\r\n.format-route.is-interactive.is-busy {\r\n  opacity: 0.6;\r\n  pointer-events: none;\r\n}\r\n\r\n.format-route-hint {\r\n  display: block;\r\n  margin-top: 3px;\r\n  font: 600 9px/1.3 var(--mono);\r\n  color: var(--muted);\r\n  opacity: 0.62;\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n.provider-key-list {\r\n  display: grid;\r\n  grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.provider-key-card {\r\n  display: grid;\r\n  gap: 9px;\r\n  min-width: 0;\r\n  padding: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.key-title {\r\n  color: var(--text);\r\n  font-weight: 760;\r\n}\r\n\r\n.provider-key-card .provider-meta {\r\n  font-family: var(--mono);\r\n  color: var(--text);\r\n}\r\n\r\n.key-card-grid {\r\n  display: grid;\r\n  grid-template-columns: auto 1fr;\r\n  gap: 4px 10px;\r\n  font-size: 12px;\r\n}\r\n\r\n.key-card-grid span {\r\n  color: var(--muted);\r\n}\r\n\r\n.key-card-grid strong {\r\n  min-width: 0;\r\n  color: var(--text);\r\n  font-family: var(--mono);\r\n  text-align: right;\r\n}\r\n\r\n.key-actions {\r\n  justify-content: flex-start;\r\n}\r\n\r\n.key-probe-model {\r\n  position: relative;\r\n  flex: 1 1 170px;\r\n  min-width: 0;\r\n}\r\n\r\n.key-probe-trigger {\r\n  width: 100%;\r\n  max-width: 100%;\r\n  justify-content: flex-start;\r\n  text-align: left;\r\n}\r\n\r\n.key-probe-trigger span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.key-probe-menu {\r\n  position: absolute;\r\n  z-index: 40;\r\n  top: calc(100% + 5px);\r\n  left: 0;\r\n  width: min(360px, calc(100vw - 32px));\r\n  max-width: 100%;\r\n  padding: 7px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  box-shadow: 0 14px 34px color-mix(in srgb, var(--shadow) 22%, transparent);\r\n}\r\n\r\n.key-probe-search {\r\n  width: 100%;\r\n  min-height: 30px;\r\n  margin-bottom: 6px;\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n}\r\n\r\n.key-probe-option-list {\r\n  display: grid;\r\n  gap: 3px;\r\n  max-height: min(260px, 42vh);\r\n  overflow-y: auto;\r\n  overscroll-behavior: contain;\r\n  scrollbar-width: thin;\r\n  scrollbar-color: color-mix(in srgb, var(--muted) 35%, transparent) transparent;\r\n}\r\n\r\n.key-probe-option-list::-webkit-scrollbar {\r\n  width: 6px;\r\n}\r\n\r\n.key-probe-option-list::-webkit-scrollbar-thumb {\r\n  border-radius: 999px;\r\n  background: color-mix(in srgb, var(--muted) 28%, transparent);\r\n}\r\n\r\n.key-probe-option,\r\n.key-probe-empty {\r\n  min-width: 0;\r\n  min-height: 28px;\r\n  padding: 0 7px;\r\n  border: 1px solid transparent;\r\n  border-radius: 5px;\r\n  background: transparent;\r\n  color: var(--text);\r\n  font: 720 11.5px/1.2 var(--mono);\r\n  text-align: left;\r\n}\r\n\r\n.key-probe-option {\r\n  display: flex;\r\n  align-items: center;\r\n  cursor: pointer;\r\n}\r\n\r\n.key-probe-option span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.key-probe-option:hover,\r\n.key-probe-option.is-selected {\r\n  border-color: color-mix(in srgb, var(--info) 42%, transparent);\r\n  background: var(--info-soft);\r\n  color: var(--info);\r\n}\r\n\r\n.key-probe-empty {\r\n  display: grid;\r\n  place-items: center start;\r\n  color: var(--muted);\r\n}\r\n\r\n.provider-edit-drawer {\r\n  border-top: 1px solid var(--line);\r\n  padding-top: 2px;\r\n}\r\n\r\n.provider-edit-drawer summary,\r\n.raw-config-details summary {\r\n  cursor: pointer;\r\n  color: var(--text);\r\n  font-weight: 820;\r\n}\r\n\r\n.provider-edit-panel {\r\n  display: grid;\r\n  gap: 10px;\r\n  margin-top: 10px;\r\n  padding: 12px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.provider-inline-form {\r\n  display: grid;\r\n  grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 0.8fr) auto auto;\r\n  gap: 8px;\r\n  align-items: end;\r\n}\r\n\r\n.provider-inline-key-form {\r\n  display: grid;\r\n  grid-template-columns: minmax(180px, 1fr) minmax(180px, 0.9fr) auto;\r\n  gap: 8px;\r\n  align-items: end;\r\n}\r\n\r\n.provider-key-chips {\r\n  padding: 2px 0;\r\n}\r\n\r\n.key-proxy-list {\r\n  display: grid;\r\n  gap: 7px;\r\n}\r\n\r\n.key-proxy-row {\r\n  display: grid;\r\n  grid-template-columns: minmax(150px, 0.85fr) minmax(220px, 1fr) auto;\r\n  gap: 8px;\r\n  align-items: end;\r\n  padding: 8px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface);\r\n}\r\n\r\n.key-proxy-id {\r\n  display: grid;\r\n  gap: 2px;\r\n  min-width: 0;\r\n}\r\n\r\n.key-proxy-id strong {\r\n  color: var(--text);\r\n  font-size: 12px;\r\n}\r\n\r\n.key-proxy-id span {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.key-proxy-field {\r\n  min-width: 0;\r\n}\r\n\r\n.provider-format-edit-list {\r\n  grid-template-columns: 1fr;\r\n}\r\n\r\n.actions {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  justify-content: flex-end;\r\n}\r\n\r\n.actions .button {\r\n  min-height: 31px;\r\n  font-size: 12px;\r\n}\r\n\r\n.policy-summary-grid {\r\n  padding: 14px 14px 0;\r\n}\r\n\r\n.policy-controls {\r\n  padding: 14px;\r\n}\r\n\r\n.policy-control-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  gap: 12px;\r\n}\r\n\r\n.policy-control-card {\r\n  display: grid;\r\n  gap: 11px;\r\n  min-width: 0;\r\n  padding: 13px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.policy-control-card-head h3 {\r\n  margin: 0 0 4px;\r\n  font-size: 14px;\r\n  font-weight: 820;\r\n}\r\n\r\n.policy-control-card-head p {\r\n  margin: 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  line-height: 1.4;\r\n}\r\n\r\n.form-pair-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  gap: 9px;\r\n}\r\n\r\n.policy-advanced {\r\n  border-top: 1px solid var(--line-soft);\r\n  padding-top: 10px;\r\n  margin-top: 2px;\r\n}\r\n\r\n.policy-advanced > summary {\r\n  cursor: pointer;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n  user-select: none;\r\n  padding: 2px 0;\r\n  list-style: none;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n}\r\n\r\n.policy-advanced > summary::before {\r\n  content: \"▸\";\r\n  font-size: 10px;\r\n  transition: transform 140ms ease;\r\n  color: var(--muted);\r\n}\r\n\r\n.policy-advanced[open] > summary::before {\r\n  transform: rotate(90deg);\r\n}\r\n\r\n.policy-advanced > summary:hover {\r\n  color: var(--text);\r\n}\r\n\r\n.policy-card-list,\r\n.failure-policy-list {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 14px;\r\n}\r\n\r\n.policy-rule-card,\r\n.failure-policy-card {\r\n  display: grid;\r\n  gap: 10px;\r\n  min-width: 0;\r\n  padding: 12px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--neutral);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.policy-rule-card.tone-danger,\r\n.failure-policy-card.tone-danger {\r\n  border-left-color: var(--danger);\r\n}\r\n\r\n.policy-rule-card.tone-warn,\r\n.failure-policy-card.tone-warn {\r\n  border-left-color: var(--warning);\r\n}\r\n\r\n.policy-rule-card.tone-info,\r\n.failure-policy-card.tone-info {\r\n  border-left-color: var(--info);\r\n}\r\n\r\n.policy-rule-card.tone-compat,\r\n.failure-policy-card.tone-compat {\r\n  border-left-color: var(--compat);\r\n}\r\n\r\n.policy-rule-card.tone-success,\r\n.failure-policy-card.tone-success {\r\n  border-left-color: var(--success);\r\n}\r\n\r\n.policy-rule-head {\r\n  display: grid;\r\n  grid-template-columns: 34px minmax(0, 1fr);\r\n  gap: 10px;\r\n}\r\n\r\n.rule-index {\r\n  display: grid;\r\n  width: 30px;\r\n  height: 30px;\r\n  place-items: center;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  color: var(--muted);\r\n  font: 760 11px var(--mono);\r\n}\r\n\r\n.policy-rule-head h3,\r\n.failure-policy-head h3 {\r\n  margin: 0;\r\n  color: var(--text);\r\n  font-size: 14px;\r\n  font-weight: 820;\r\n  line-height: 1.35;\r\n}\r\n\r\n.policy-rule-head p,\r\n.failure-policy-card p {\r\n  margin-top: 3px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  line-height: 1.45;\r\n}\r\n\r\n.policy-rule-meta,\r\n.failure-policy-grid {\r\n  display: grid;\r\n  grid-template-columns: minmax(68px, auto) minmax(0, 1fr);\r\n  gap: 5px 10px;\r\n  padding-top: 2px;\r\n  font-size: 12px;\r\n}\r\n\r\n.policy-rule-meta span,\r\n.failure-policy-grid span {\r\n  color: var(--muted);\r\n}\r\n\r\n.policy-rule-meta strong,\r\n.failure-policy-grid strong {\r\n  min-width: 0;\r\n  color: var(--text);\r\n  font-family: var(--mono);\r\n  font-weight: 780;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.failure-policy-edit-grid {\r\n  display: grid;\r\n  grid-template-columns: minmax(130px, 1fr) minmax(130px, 1fr);\r\n  gap: 8px;\r\n  align-items: end;\r\n}\r\n\r\n.failure-disable-check {\r\n  min-height: 36px;\r\n}\r\n\r\n.failure-policy-edit-grid .button {\r\n  justify-self: start;\r\n}\r\n\r\n.code-block {\r\n  max-height: 620px;\r\n  margin: 0;\r\n  overflow: auto;\r\n  padding: 15px;\r\n  background: #18181b;\r\n  color: #f4f4f5;\r\n  font: 12px/1.58 var(--mono);\r\n}\r\n\r\n.form-grid {\r\n  display: grid;\r\n  gap: 9px;\r\n  padding: 15px;\r\n}\r\n\r\n.form-actions {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 8px;\r\n  align-items: center;\r\n}\r\n\r\n.provider-create-form {\r\n  display: grid;\r\n  grid-template-columns: minmax(150px, 0.8fr) minmax(260px, 1.4fr);\r\n  gap: 10px 12px;\r\n  padding: 13px 16px 14px;\r\n}\r\n\r\n.provider-create-format {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.provider-create-form .control {\r\n  min-height: 34px;\r\n}\r\n\r\n.provider-create-actions {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.provider-create-form .control {\r\n  width: 100%;\r\n  min-width: 0;\r\n}\r\n\r\n.field-help,\r\n.form-note {\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 560;\r\n  line-height: 1.25;\r\n}\r\n\r\n.field-help {\r\n  margin-top: 1px;\r\n}\r\n\r\n.form-note {\r\n  max-width: 38rem;\r\n}\r\n\r\n.global-proxy-form {\r\n  display: grid;\r\n  grid-template-columns: minmax(220px, 1fr) auto;\r\n  gap: 8px;\r\n  align-items: end;\r\n  padding: 12px 14px 14px;\r\n}\r\n\r\n.global-proxy-form .form-note {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.config-primary-panel .panel-head,\r\n.model-routes-panel .panel-head,\r\n.provider-model-map-panel .panel-head,\r\n.config-provider-panel .panel-head,\r\n.global-proxy-panel .panel-head,\r\n.config-status-panel .panel-head,\r\n.config-audit-panel .panel-head {\r\n  padding-top: 11px;\r\n  padding-bottom: 10px;\r\n}\r\n\r\n.model-route-form {\r\n  display: grid;\r\n  grid-template-columns: minmax(180px, 1fr) minmax(220px, 1.4fr) minmax(150px, 0.8fr) auto;\r\n  gap: 9px;\r\n  align-items: end;\r\n  padding: 10px 0 0;\r\n}\r\n\r\n.model-route-editor {\r\n  padding: 10px 12px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.model-route-editor > summary {\r\n  cursor: pointer;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n\r\n.config-side-column .model-route-form {\r\n  grid-template-columns: minmax(0, 1fr);\r\n  align-items: stretch;\r\n  padding: 10px 0 0;\r\n}\r\n\r\n.config-side-column .model-route-form .form-actions {\r\n  justify-content: flex-start;\r\n}\r\n\r\n.model-route-form .form-actions {\r\n  align-self: end;\r\n}\r\n\r\n.model-route-list {\r\n  display: grid;\r\n  gap: 6px;\r\n  padding: 10px;\r\n}\r\n\r\n.provider-model-map-list {\r\n  display: grid;\r\n  gap: 6px;\r\n  padding: 10px;\r\n}\r\n\r\n.config-provider-page-list,\r\n.model-route-page-list,\r\n.provider-model-map-page-list,\r\n.audit-page-list {\r\n  display: grid;\r\n  gap: 6px;\r\n}\r\n\r\n.model-route-hint {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n  align-items: center;\r\n  padding: 7px 8px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.model-route-card {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 8px;\r\n  align-items: center;\r\n  padding: 9px 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.model-route-main,\r\n.model-route-side {\r\n  min-width: 0;\r\n}\r\n\r\n.model-route-main {\r\n  display: grid;\r\n  gap: 5px;\r\n}\r\n\r\n.model-route-provider-list {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n}\r\n\r\n.model-route-side {\r\n  display: grid;\r\n  gap: 5px;\r\n  justify-items: end;\r\n}\r\n\r\n.provider-model-map-card {\r\n  display: grid;\r\n  gap: 8px;\r\n  padding: 9px 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.provider-model-map-head {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-model-map-pairs {\r\n  display: grid;\r\n  gap: 5px;\r\n}\r\n\r\n.provider-model-map-pair {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\r\n  gap: 7px;\r\n  align-items: center;\r\n  padding: 6px 7px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  font-size: 11px;\r\n}\r\n\r\n.provider-model-map-pair span,\r\n.provider-model-map-pair strong {\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.provider-model-map-pair strong {\r\n  color: var(--text);\r\n  font-weight: 760;\r\n}\r\n\r\n.actions.tight {\r\n  gap: 4px;\r\n}\r\n\r\n.compact-action {\r\n  min-height: 30px;\r\n  padding: 0 9px;\r\n  font-size: 11.5px;\r\n}\r\n\r\n.pad-slim {\r\n  padding: 8px 2px 0;\r\n}\r\n\r\n.config-provider-list {\r\n  display: grid;\r\n  gap: 6px;\r\n  padding: 10px;\r\n}\r\n\r\n.config-summary {\r\n  padding: 14px;\r\n}\r\n\r\n.config-summary-compact {\r\n  padding: 10px;\r\n}\r\n\r\n.overlay-safety {\r\n  padding: 12px 0 0;\r\n}\r\n\r\n.config-summary-grid {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.config-status-grid {\r\n  grid-template-columns: repeat(2, minmax(0, 1fr));\r\n}\r\n\r\n.config-summary-compact .mini-metric {\r\n  padding: 8px;\r\n}\r\n\r\n.config-summary-compact .mini-metric strong {\r\n  font-size: 14px;\r\n}\r\n\r\n.config-path-row {\r\n  display: grid;\r\n  grid-template-columns: 110px minmax(0, 1fr);\r\n  gap: 10px;\r\n  margin-top: 8px;\r\n  padding: 8px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  font-size: 12px;\r\n}\r\n\r\n.config-path-row span {\r\n  color: var(--muted);\r\n  font-weight: 720;\r\n}\r\n\r\n.config-path-row strong {\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.config-provider-summary-card {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto auto;\r\n  gap: 7px 10px;\r\n  align-items: center;\r\n  min-height: 66px;\r\n  padding: 8px 10px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--info);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.config-provider-summary-main,\r\n.config-provider-summary-keys,\r\n.config-provider-summary-formats {\r\n  min-width: 0;\r\n}\r\n\r\n.config-provider-summary-main {\r\n  grid-column: 1;\r\n  grid-row: 1;\r\n}\r\n\r\n.config-provider-summary-badges {\r\n  grid-column: 2;\r\n  grid-row: 1;\r\n  justify-self: end;\r\n  display: inline-flex;\r\n  flex-wrap: wrap;\r\n  justify-content: flex-end;\r\n  gap: 5px;\r\n}\r\n\r\n.config-provider-summary-keys,\r\n.config-provider-summary-formats {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.config-provider-summary-keys {\r\n  grid-column: 1;\r\n  grid-row: 2;\r\n}\r\n\r\n.config-provider-summary-formats {\r\n  grid-column: 2 / span 2;\r\n  grid-row: 2;\r\n  justify-self: end;\r\n}\r\n\r\n.config-provider-summary-card > .button {\r\n  grid-column: 3;\r\n  grid-row: 1;\r\n  justify-self: end;\r\n}\r\n\r\n.config-provider-summary-card .provider-name,\r\n.config-provider-summary-card .provider-meta {\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.audit-list {\r\n  display: grid;\r\n  gap: 8px;\r\n  max-height: 460px;\r\n  overflow: auto;\r\n  padding: 12px;\r\n}\r\n\r\n.audit-item {\r\n  min-width: 0;\r\n  padding: 9px 10px;\r\n  border: 1px solid var(--line);\r\n  border-left-width: 3px;\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n}\r\n\r\n.audit-item.tone-ok {\r\n  border-left-color: var(--success);\r\n}\r\n\r\n.audit-item.tone-bad {\r\n  border-left-color: var(--danger);\r\n}\r\n\r\n.audit-item-title {\r\n  display: flex;\r\n  min-width: 0;\r\n  gap: 8px;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n}\r\n\r\n.audit-item-title .mono {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  font-size: 11.5px;\r\n}\r\n\r\n.audit-item-meta {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px 10px;\r\n  margin-top: 4px;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 700;\r\n}\r\n\r\n.audit-detail-details,\r\n.audit-older {\r\n  margin-top: 7px;\r\n}\r\n\r\n.audit-detail-details > summary,\r\n.audit-older > summary {\r\n  cursor: pointer;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n}\r\n\r\n.audit-older-list {\r\n  display: grid;\r\n  gap: 8px;\r\n  margin-top: 8px;\r\n}\r\n\r\n.audit-detail {\r\n  max-height: 120px;\r\n  margin: 6px 0 0;\r\n  overflow: auto;\r\n  padding: 8px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 7px;\r\n  background: var(--surface-raised);\r\n  color: var(--text);\r\n  font: 11px/1.45 var(--mono);\r\n  white-space: pre-wrap;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.audit-error {\r\n  margin-top: 8px;\r\n  color: var(--danger);\r\n  font-size: 12px;\r\n  font-weight: 750;\r\n  overflow-wrap: anywhere;\r\n}\r\n\r\n.raw-config-details {\r\n  padding: 14px;\r\n}\r\n\r\n.raw-config-details .code-block {\r\n  margin-top: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n}\r\n\r\n.config-advanced-panel {\r\n  background: color-mix(in srgb, var(--surface-raised) 66%, var(--surface));\r\n}\r\n\r\n.config-advanced-details {\r\n  padding: 13px 14px;\r\n}\r\n\r\n.config-advanced-details > summary {\r\n  display: grid;\r\n  gap: 2px;\r\n  cursor: pointer;\r\n  list-style: none;\r\n}\r\n\r\n.config-advanced-details > summary::-webkit-details-marker {\r\n  display: none;\r\n}\r\n\r\n.config-advanced-details > summary span {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 760;\r\n}\r\n\r\n.config-advanced-details > summary small {\r\n  color: var(--muted);\r\n  font-size: 11.5px;\r\n}\r\n\r\n.config-advanced-details > .actions {\r\n  margin-top: 12px;\r\n}\r\n\r\n.nested-details {\r\n  padding: 10px 0 0;\r\n}\r\n\r\n.config-provider-card {\r\n  display: grid;\r\n  gap: 12px;\r\n  padding: 14px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.config-provider-card:last-child {\r\n  border-bottom: 0;\r\n}\r\n\r\n.config-provider-head {\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n}\r\n\r\n.config-provider-form,\r\n.config-key-form {\r\n  display: grid;\r\n  gap: 8px;\r\n}\r\n\r\n.field {\r\n  display: grid;\r\n  gap: 5px;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n}\r\n\r\n.field .control {\r\n  width: 100%;\r\n  font-weight: 500;\r\n  min-width: 0;\r\n}\r\n\r\n.check-field {\r\n  display: flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  min-height: 28px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 700;\r\n}\r\n\r\n.check-field input {\r\n  width: 15px;\r\n  height: 15px;\r\n  accent-color: var(--accent);\r\n}\r\n\r\n.masked-key-list {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 6px;\r\n}\r\n\r\n.format-edit-list {\r\n  display: grid;\r\n  gap: 7px;\r\n}\r\n\r\n.format-edit-row {\r\n  display: grid;\r\n  grid-template-columns: minmax(156px, 0.8fr) minmax(130px, 1fr) auto;\r\n  gap: 7px;\r\n  align-items: center;\r\n}\r\n\r\n.format-edit-row .control {\r\n  width: 100%;\r\n}\r\n\r\n.drawer {\r\n  position: fixed;\r\n  top: 0;\r\n  right: 0;\r\n  width: min(580px, 100vw);\r\n  height: 100dvh;\r\n  border-left: 1px solid var(--line);\r\n  background: rgba(255, 255, 255, 0.75);\r\n  backdrop-filter: blur(30px) saturate(200%);\r\n  -webkit-backdrop-filter: blur(30px) saturate(200%);\r\n  box-shadow: -24px 0 60px rgba(9, 9, 11, 0);\r\n  transform: translateX(100%);\r\n  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease;\r\n  z-index: 20;\r\n}\r\n\r\n.drawer.is-open {\r\n  transform: translateX(0);\r\n  box-shadow: -24px 0 60px rgba(9, 9, 11, 0.1);\r\n}\r\n\r\n#detailDrawer {\r\n  z-index: 36;\r\n}\r\n\r\n.drawer-head {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  padding: 17px;\r\n  border-bottom: 1px solid var(--line);\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.drawer-head p {\r\n  margin-top: 4px;\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n}\r\n\r\n.drawer-body {\r\n  height: calc(100dvh - 74px);\r\n  overflow: auto;\r\n  padding: 15px;\r\n}\r\n\r\n.provider-drawer {\r\n  width: min(720px, 100vw);\r\n}\r\n\r\n.provider-drawer-body {\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-height: 0;\r\n  overflow: hidden;\r\n  background:\r\n    radial-gradient(120% 180px at 50% 0, color-mix(in srgb, var(--info, #3b82f6) 7%, transparent) 0, transparent 70%),\r\n    var(--surface);\r\n}\r\n\r\n.provider-drawer-tabs {\r\n  position: relative;\r\n  top: auto;\r\n  flex: 0 0 auto;\r\n  z-index: 2;\r\n  display: grid;\r\n  grid-template-columns: repeat(5, minmax(0, 1fr));\r\n  gap: 5px;\r\n  padding: 4px 0 8px;\r\n  background: color-mix(in srgb, var(--surface) 88%, transparent);\r\n  backdrop-filter: blur(14px) saturate(1.3);\r\n  -webkit-backdrop-filter: blur(14px) saturate(1.3);\r\n}\r\n\r\n.provider-drawer-tab {\r\n  min-width: 0;\r\n  min-height: 32px;\r\n  padding: 0 8px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 9px;\r\n  background: var(--surface);\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n  cursor: pointer;\r\n  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 0.06s ease;\r\n}\r\n\r\n.provider-drawer-tab:hover {\r\n  border-color: color-mix(in srgb, var(--info, #3b82f6) 32%, var(--line));\r\n  background: color-mix(in srgb, var(--info, #3b82f6) 6%, var(--surface));\r\n  color: var(--text);\r\n}\r\n\r\n.provider-drawer-tab:active {\r\n  transform: translateY(1px);\r\n}\r\n\r\n.provider-drawer-tab.is-active {\r\n  border-color: color-mix(in srgb, var(--info, #3b82f6) 55%, var(--line));\r\n  background: color-mix(in srgb, var(--info, #3b82f6) 14%, var(--surface));\r\n  color: color-mix(in srgb, var(--info, #3b82f6) 90%, var(--text));\r\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--info, #3b82f6) 18%, transparent) inset;\r\n}\r\n\r\n.provider-drawer-section {\r\n  display: grid;\r\n  flex: 1 1 auto;\r\n  gap: 12px;\r\n  align-content: start;\r\n  grid-auto-rows: max-content;\r\n  overflow: auto;\r\n  min-width: 0;\r\n  min-height: 0;\r\n  margin-top: 10px;\r\n  padding-right: 2px;\r\n}\r\n\r\n.provider-models-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  min-width: 0;\r\n  margin-top: -2px;\r\n}\r\n\r\n.provider-detail-hero {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 12px;\r\n  align-items: center;\r\n  padding: 14px;\r\n  border: 1px solid var(--line);\r\n  border-top: 3px solid var(--neutral);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.provider-detail-hero.is-available {\r\n  border-top-color: var(--success);\r\n}\r\n\r\n.provider-detail-hero.is-degraded,\r\n.provider-detail-hero.is-cooldown {\r\n  border-top-color: var(--warning);\r\n}\r\n\r\n.provider-detail-hero.is-unavailable {\r\n  border-top-color: var(--danger);\r\n}\r\n\r\n.provider-detail-hero.is-disabled {\r\n  border-top-color: var(--faint);\r\n}\r\n\r\n.provider-detail-hero > div:first-child {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  gap: 3px 8px;\r\n  align-items: center;\r\n  min-width: 0;\r\n}\r\n\r\n.provider-detail-hero strong,\r\n.provider-detail-hero p {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-detail-hero p {\r\n  grid-column: 2;\r\n  margin: 0;\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 11px;\r\n}\r\n\r\n.provider-detail-metrics {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 8px;\r\n  align-items: start;\r\n  grid-auto-rows: max-content;\r\n}\r\n\r\n.provider-detail-metrics .mini-metric {\r\n  align-self: start;\r\n}\r\n\r\n.provider-detail-metrics .mini-metric span,\r\n.provider-detail-metrics .mini-metric strong,\r\n.provider-detail-metrics .mini-metric small {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-activity-list,\r\n.provider-route-list {\r\n  display: grid;\r\n  gap: 7px;\r\n}\r\n\r\n.provider-activity-row,\r\n.provider-route-card {\r\n  display: grid;\r\n  min-width: 0;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 9px 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.provider-activity-row {\r\n  grid-template-columns: 10px minmax(110px, 0.8fr) minmax(120px, 0.9fr) minmax(0, 1.2fr) auto;\r\n  width: 100%;\r\n  color: var(--text);\r\n  text-align: left;\r\n  cursor: pointer;\r\n}\r\n\r\n.provider-activity-row:hover {\r\n  border-color: color-mix(in srgb, var(--info) 22%, var(--line));\r\n  background: color-mix(in srgb, var(--info-soft) 32%, var(--surface));\r\n}\r\n\r\n.provider-activity-row strong,\r\n.provider-activity-row span,\r\n.provider-activity-row small,\r\n.provider-activity-row em,\r\n.provider-route-card strong,\r\n.provider-route-card small {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.provider-activity-row small {\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 11px;\r\n}\r\n\r\n.provider-activity-row em {\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-style: normal;\r\n}\r\n\r\n.provider-route-card {\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n}\r\n\r\n.provider-route-card small {\r\n  display: block;\r\n  margin-top: 2px;\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 11px;\r\n}\r\n\r\n.drawer-key-list,\r\n.drawer-format-list,\r\n.provider-drawer-models {\r\n  padding: 0;\r\n}\r\n\r\n.provider-danger-zone {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 10px;\r\n  align-items: center;\r\n  padding: 12px;\r\n  border: 1px solid color-mix(in srgb, var(--danger) 22%, var(--line));\r\n  border-radius: 10px;\r\n  background: color-mix(in srgb, var(--danger-soft) 52%, var(--surface));\r\n}\r\n\r\n.provider-danger-zone p {\r\n  margin: 2px 0 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.provider-danger-zone .icon-action {\r\n  width: 36px;\r\n  min-width: 36px;\r\n  height: 36px;\r\n}\r\n\r\n.confirm-backdrop {\r\n  position: fixed;\r\n  inset: 0;\r\n  z-index: 38;\r\n  background: rgba(9, 9, 11, 0.32);\r\n  backdrop-filter: blur(3px);\r\n}\r\n\r\n.confirm-dialog {\r\n  position: fixed;\r\n  top: 50%;\r\n  left: 50%;\r\n  z-index: 39;\r\n  width: min(420px, calc(100vw - 32px));\r\n  display: grid;\r\n  gap: 18px;\r\n  padding: 18px;\r\n  border: 1px solid var(--line-strong);\r\n  border-radius: 12px;\r\n  background: var(--surface);\r\n  box-shadow: 0 24px 64px rgba(9, 9, 11, 0.2);\r\n  transform: translate(-50%, -48%) scale(0.98);\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 120ms ease, transform 120ms ease;\r\n}\r\n\r\n.confirm-dialog.is-open {\r\n  transform: translate(-50%, -50%) scale(1);\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n}\r\n\r\n.confirm-head {\r\n  display: grid;\r\n  grid-template-columns: 34px minmax(0, 1fr);\r\n  gap: 12px;\r\n  align-items: start;\r\n}\r\n\r\n.confirm-tone {\r\n  position: relative;\r\n  width: 34px;\r\n  height: 34px;\r\n  border: 1px solid color-mix(in srgb, var(--danger) 24%, white);\r\n  border-radius: 9px;\r\n  background: var(--danger-soft);\r\n}\r\n\r\n.confirm-tone::before {\r\n  position: absolute;\r\n  top: 8px;\r\n  left: 16px;\r\n  width: 2px;\r\n  height: 11px;\r\n  border-radius: 999px;\r\n  background: var(--danger);\r\n  content: \"\";\r\n}\r\n\r\n.confirm-tone::after {\r\n  position: absolute;\r\n  left: 16px;\r\n  bottom: 8px;\r\n  width: 2px;\r\n  height: 2px;\r\n  border-radius: 999px;\r\n  background: var(--danger);\r\n  content: \"\";\r\n}\r\n\r\n.confirm-dialog h2 {\r\n  margin: 0;\r\n  font-size: 15px;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.confirm-dialog p {\r\n  margin: 5px 0 0;\r\n  color: var(--muted);\r\n  line-height: 1.45;\r\n}\r\n\r\n.confirm-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n}\r\n\r\n/* ---- Form modal (Add Provider, etc.) ---- */\r\n.form-modal {\r\n  position: fixed;\r\n  top: 50%;\r\n  left: 50%;\r\n  transform: translate(-50%, -48%) scale(0.97);\r\n  width: min(560px, calc(100vw - 32px));\r\n  max-height: calc(100dvh - 48px);\r\n  display: flex;\r\n  flex-direction: column;\r\n  border: 1px solid var(--line);\r\n  border-radius: 14px;\r\n  background: var(--surface);\r\n  box-shadow: 0 24px 64px rgba(9, 9, 11, 0.2);\r\n  z-index: 39;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);\r\n}\r\n\r\n.form-modal.is-open {\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n  transform: translate(-50%, -50%) scale(1);\r\n}\r\n\r\n.form-modal-head {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n  padding: 18px 20px 14px;\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.form-modal-head h2 {\r\n  font-size: 16px;\r\n  font-weight: 780;\r\n}\r\n\r\n.form-modal-head p {\r\n  margin-top: 3px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.form-modal-body {\r\n  padding: 18px 20px;\r\n  overflow: auto;\r\n  display: grid;\r\n  gap: 14px;\r\n}\r\n\r\n.form-modal .provider-create-form {\r\n  display: grid;\r\n  gap: 12px;\r\n}\r\n\r\n.form-modal .provider-create-form .form-field-inline {\r\n  display: grid;\r\n  grid-template-columns: 1fr;\r\n  gap: 6px;\r\n}\r\n\r\n.form-modal .provider-create-form .form-row-2 {\r\n  display: grid;\r\n  grid-template-columns: 1fr 1fr;\r\n  gap: 10px;\r\n}\r\n\r\n.form-modal .provider-create-form details {\r\n  border-top: 1px solid var(--line-soft);\r\n  padding-top: 10px;\r\n  margin-top: 4px;\r\n}\r\n\r\n.form-modal .provider-create-form summary {\r\n  cursor: pointer;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n  user-select: none;\r\n  padding: 2px 0;\r\n}\r\n\r\n.form-modal .form-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n  border-top: 1px solid var(--line-soft);\r\n  padding-top: 14px;\r\n  margin-top: 4px;\r\n}\r\n\r\n.form-modal.is-model-map-modal,\r\n.form-modal.is-format-path-modal {\r\n  width: min(480px, calc(100vw - 32px));\r\n}\r\n\r\n.form-modal.is-model-map-modal .form-modal-body,\r\n.form-modal.is-format-path-modal .form-modal-body {\r\n  padding-top: 16px;\r\n}\r\n\r\n.model-map-form,\r\n.format-path-form {\r\n  display: grid;\r\n  gap: 14px;\r\n}\r\n\r\n.model-map-field,\r\n.format-path-field {\r\n  display: grid;\r\n  gap: 7px;\r\n}\r\n\r\n.model-map-field span,\r\n.model-map-raw-line span,\r\n.format-path-field span {\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.model-map-field input,\r\n.format-path-field input {\r\n  width: 100%;\r\n  min-width: 0;\r\n  height: 42px;\r\n  padding: 0 12px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  font: 13px var(--mono-font, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", monospace);\r\n}\r\n\r\n.model-map-field input:focus,\r\n.format-path-field input:focus {\r\n  border-color: color-mix(in srgb, var(--info) 70%, var(--line));\r\n  outline: 3px solid color-mix(in srgb, var(--info-soft) 80%, transparent);\r\n}\r\n\r\n.model-map-raw-line {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 10px;\r\n  min-height: 38px;\r\n  padding: 8px 10px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--surface-muted) 72%, transparent);\r\n}\r\n\r\n.model-map-raw-line code {\r\n  min-width: 0;\r\n  justify-self: end;\r\n  overflow-wrap: anywhere;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  text-align: right;\r\n}\r\n\r\n.model-map-hint {\r\n  margin: -2px 0 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.format-path-summary {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  align-items: center;\r\n  gap: 10px;\r\n  padding: 10px;\r\n  border: 1px solid var(--line-soft);\r\n  border-radius: 8px;\r\n  background: color-mix(in srgb, var(--surface-muted) 72%, transparent);\r\n}\r\n\r\n.format-path-summary > div {\r\n  display: grid;\r\n  gap: 3px;\r\n  min-width: 0;\r\n}\r\n\r\n.format-path-summary strong,\r\n.format-path-summary code {\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.format-path-summary strong {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 780;\r\n}\r\n\r\n.format-path-summary code {\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.format-path-state {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 28px;\r\n  height: 28px;\r\n  border-radius: 8px;\r\n  border: 1px solid var(--line);\r\n  color: var(--muted);\r\n  background: var(--surface);\r\n}\r\n\r\n.format-path-state.is-enabled {\r\n  border-color: color-mix(in srgb, var(--success) 48%, var(--line));\r\n  color: var(--success);\r\n  background: color-mix(in srgb, var(--success-soft) 76%, var(--surface));\r\n}\r\n\r\n.format-path-state.is-disabled {\r\n  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));\r\n  color: var(--danger);\r\n  background: color-mix(in srgb, var(--danger-soft) 76%, var(--surface));\r\n}\r\n\r\n.format-path-hint {\r\n  margin: -4px 0 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  line-height: 1.45;\r\n}\r\n\r\n.model-map-actions {\r\n  display: flex;\r\n  justify-content: flex-end;\r\n  gap: 8px;\r\n  padding-top: 12px;\r\n  border-top: 1px solid var(--line-soft);\r\n}\r\n\r\n.model-map-action {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 36px;\r\n  height: 36px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n}\r\n\r\n.model-map-action:hover {\r\n  color: var(--text);\r\n  background: var(--surface-muted);\r\n}\r\n\r\n.model-map-action.primary {\r\n  border-color: color-mix(in srgb, var(--info) 42%, var(--line));\r\n  background: var(--text);\r\n  color: var(--surface);\r\n}\r\n\r\n.model-map-action.primary:hover {\r\n  background: color-mix(in srgb, var(--text) 88%, var(--info));\r\n}\r\n\r\n.mobile-settings-body {\r\n  display: grid;\r\n  gap: 16px;\r\n  height: calc(100dvh - 74px);\r\n  align-content: start;\r\n  overflow: auto;\r\n  padding: 15px;\r\n}\r\n\r\n.mobile-settings-section {\r\n  display: grid;\r\n  gap: 10px;\r\n  align-content: start;\r\n}\r\n\r\n.mobile-settings-section-title {\r\n  margin: 0;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 780;\r\n  letter-spacing: 0;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.drawer-section-title {\r\n  margin: 10px 0 10px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 780;\r\n}\r\n\r\n.drawer-section-hint {\r\n  margin-left: 6px;\r\n  color: var(--muted);\r\n  font-size: 10px;\r\n  font-weight: 600;\r\n  opacity: 0.7;\r\n  letter-spacing: 0.01em;\r\n}\r\n\r\n.provider-formats-group {\r\n  margin-top: 14px;\r\n  padding-top: 12px;\r\n  border-top: 1px solid var(--line-soft);\r\n}\r\n\r\n.provider-formats-group .format-route-list {\r\n  margin-top: 2px;\r\n}\r\n\r\n.drawer-kv {\r\n  padding: 13px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.routing-summary-card {\r\n  display: grid;\r\n  gap: 12px;\r\n  margin-bottom: 12px;\r\n  padding: 14px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--neutral);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.routing-summary-card.tone-ok {\r\n  border-left-color: var(--success);\r\n}\r\n\r\n.routing-summary-card.tone-warn {\r\n  border-left-color: var(--warning);\r\n}\r\n\r\n.routing-summary-card.tone-bad {\r\n  border-left-color: var(--danger);\r\n}\r\n\r\n.routing-summary-head {\r\n  display: flex;\r\n  align-items: flex-start;\r\n  justify-content: space-between;\r\n  gap: 12px;\r\n}\r\n\r\n.routing-summary-head h3 {\r\n  margin: 0 0 5px;\r\n  color: var(--text);\r\n  font-size: 14px;\r\n}\r\n\r\n.routing-summary-head p {\r\n  margin: 0;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  line-height: 1.5;\r\n}\r\n\r\n.routing-summary-card .badge,\r\n.routing-summary-card .message-chip {\r\n  justify-self: start;\r\n  width: fit-content;\r\n  max-width: 100%;\r\n}\r\n\r\n.routing-summary-card .chip-list {\r\n  justify-content: flex-start;\r\n}\r\n\r\n.routing-summary-grid,\r\n.routing-next-action {\r\n  display: grid;\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 8px;\r\n}\r\n\r\n.routing-summary-grid span,\r\n.routing-next-action span {\r\n  display: block;\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n}\r\n\r\n.routing-summary-grid strong,\r\n.routing-next-action strong {\r\n  display: block;\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n  color: var(--text);\r\n  font-family: var(--mono);\r\n  font-size: 12px;\r\n}\r\n\r\n.routing-next-action {\r\n  grid-template-columns: 86px minmax(0, 1fr);\r\n  align-items: start;\r\n  padding-top: 10px;\r\n  border-top: 1px solid var(--line);\r\n}\r\n\r\n.route-inline {\r\n  display: grid;\r\n  gap: 5px;\r\n  min-width: 220px;\r\n  max-width: 360px;\r\n}\r\n\r\n.route-inline .badge {\r\n  width: fit-content;\r\n}\r\n\r\n.route-inline .message-text {\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  line-height: 1.35;\r\n}\r\n\r\n.attempt {\r\n  display: grid;\r\n  gap: 9px;\r\n  margin-bottom: 10px;\r\n  padding: 13px;\r\n  border: 1px solid var(--line);\r\n  border-left: 3px solid var(--neutral);\r\n  border-radius: 8px;\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.attempt.tone-success,\r\n.attempt.tone-ok {\r\n  border-color: color-mix(in srgb, var(--ok) 40%, var(--line));\r\n  border-left-color: var(--success);\r\n}\r\n\r\n.attempt.tone-warn,\r\n.attempt.tone-compat {\r\n  border-color: color-mix(in srgb, var(--warn) 46%, var(--line));\r\n  border-left-color: var(--warning);\r\n}\r\n\r\n.attempt.tone-danger,\r\n.attempt.tone-bad {\r\n  border-color: color-mix(in srgb, var(--bad) 42%, var(--line));\r\n  border-left-color: var(--danger);\r\n}\r\n\r\n.attempt-head {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  gap: 8px;\r\n}\r\n\r\n.attempt-explain {\r\n  display: grid;\r\n  gap: 7px;\r\n  padding: 10px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n}\r\n\r\n.attempt-explain div {\r\n  display: grid;\r\n  grid-template-columns: 74px minmax(0, 1fr);\r\n  gap: 8px;\r\n}\r\n\r\n.attempt-explain span {\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 760;\r\n}\r\n\r\n.attempt-explain strong {\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-weight: 680;\r\n  line-height: 1.45;\r\n}\r\n\r\n.kv-grid {\r\n  display: grid;\r\n  grid-template-columns: 128px minmax(0, 1fr);\r\n  gap: 7px 11px;\r\n  font-size: 12px;\r\n}\r\n\r\n.kv-grid span:nth-child(odd) {\r\n  color: var(--muted);\r\n}\r\n\r\n.kv-grid span:nth-child(even) {\r\n  min-width: 0;\r\n  overflow-wrap: anywhere;\r\n  font-family: var(--mono);\r\n}\r\n\r\n@keyframes viewIn {\r\n  from {\r\n    opacity: 0;\r\n    transform: translateY(4px);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: translateY(0);\r\n  }\r\n}\r\n\r\n@keyframes drawLine {\r\n  to {\r\n    stroke-dashoffset: 0;\r\n  }\r\n}\r\n\r\n@keyframes barRise {\r\n  from {\r\n    opacity: 0;\r\n    transform: scaleY(0.2);\r\n  }\r\n  to {\r\n    opacity: 1;\r\n    transform: scaleY(1);\r\n  }\r\n}\r\n\r\n/* Modern overview pass: reduce table-like borders and make the dashboard read as a runtime product surface. */\r\n:root {\r\n  --bg: #eef4fb;\r\n  --surface: #ffffff;\r\n  --surface-raised: #f8fbff;\r\n  --surface-soft: #eef5ff;\r\n  --surface-strong: #dce8f6;\r\n  --sidebar: #ffffff;\r\n  --sidebar-soft: #edf5ff;\r\n  --line: #e3edf8;\r\n  --line-soft: #eef4fb;\r\n  --line-strong: #cfdded;\r\n  --text: #111827;\r\n  --muted: #637083;\r\n  --faint: #8994a6;\r\n  --accent: #2563eb;\r\n  --accent-strong: #1d4ed8;\r\n  --accent-soft: #e7f0ff;\r\n  --success: #10b981;\r\n  --success-soft: #e8f8f1;\r\n  --warning: #d97706;\r\n  --warning-soft: #fff4df;\r\n  --danger: #e5485d;\r\n  --danger-soft: #ffedf0;\r\n  --info: #20d264;\r\n  --info-soft: #e8f2ff;\r\n  --compat: #8b5cf6;\r\n  --compat-soft: #f2edff;\r\n  --metric-neutral: #334155;\r\n  --metric-requests: #2563eb;\r\n  --metric-success: #12a474;\r\n  --metric-failure: #e5485d;\r\n  --metric-provider: #0ea5e9;\r\n  --metric-token: #8b5cf6;\r\n  --metric-cost: #d97706;\r\n  --shadow: 0 12px 30px rgba(31, 56, 88, 0.07);\r\n  --shadow-tight: 0 18px 44px rgba(31, 56, 88, 0.11);\r\n}\r\n\r\nbody {\r\n  background:\r\n    linear-gradient(180deg, #f7fbff 0, #eef5fc 330px, #f6f8fb 100%);\r\n}\r\n\r\n.shell {\r\n  grid-template-columns: 248px minmax(0, 1fr);\r\n}\r\n\r\n.sidebar {\r\n  border-right: 0;\r\n  background:\r\n    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 253, 255, 0.96)),\r\n    var(--sidebar);\r\n  box-shadow: 18px 0 46px rgba(31, 56, 88, 0.08);\r\n}\r\n\r\n.sidebar::after {\r\n  right: 0;\r\n  width: 1px;\r\n  background: linear-gradient(180deg, rgba(37, 99, 235, 0.18), rgba(37, 99, 235, 0.04));\r\n}\r\n\r\n.brand {\r\n  padding: 26px 20px 18px;\r\n  border-bottom: 0;\r\n}\r\n\r\n.brand-mark,\r\n.login-mark {\r\n  border-radius: 11px;\r\n  background: linear-gradient(135deg, #2563eb, #0ea5e9);\r\n  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);\r\n}\r\n\r\n.brand-title {\r\n  font-size: 15px;\r\n  font-weight: 800;\r\n}\r\n\r\n.nav {\r\n  gap: 6px;\r\n  padding: 12px 14px;\r\n}\r\n\r\n.nav-item {\r\n  min-height: 42px;\r\n  padding: 10px 13px;\r\n  border: 0;\r\n  border-radius: 14px;\r\n  color: #4b5565;\r\n  font-weight: 650;\r\n}\r\n\r\n.nav-item:hover {\r\n  background: rgba(37, 99, 235, 0.06);\r\n  color: var(--accent-strong);\r\n  box-shadow: none;\r\n}\r\n\r\n.nav-item.is-active {\r\n  border: 0;\r\n  background: var(--accent-soft);\r\n  color: var(--accent-strong);\r\n  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);\r\n}\r\n\r\n.sidebar-actions {\r\n  gap: 10px;\r\n  padding: 14px 16px 10px;\r\n}\r\n\r\n.button {\r\n  border-radius: 11px;\r\n}\r\n\r\n.button.primary {\r\n  border-color: var(--accent);\r\n  background: var(--accent);\r\n  color: #fff;\r\n  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);\r\n}\r\n\r\n.button.primary:hover {\r\n  border-color: var(--accent-strong);\r\n  background: var(--accent-strong);\r\n  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);\r\n}\r\n\r\n.button.secondary {\r\n  border-color: rgba(148, 163, 184, 0.24);\r\n  background: rgba(255, 255, 255, 0.82);\r\n}\r\n\r\n.workspace {\r\n  max-width: 1480px;\r\n  padding: 24px 44px 48px;\r\n}\r\n\r\n.time-range-control {\r\n  width: fit-content;\r\n  max-width: 100%;\r\n  margin: 0 0 18px auto;\r\n  padding: 8px 10px 8px 14px;\r\n  border: 0;\r\n  border-radius: 18px;\r\n  background: rgba(255, 255, 255, 0.86);\r\n  box-shadow: 0 12px 30px rgba(31, 56, 88, 0.08), inset 0 0 0 1px rgba(207, 221, 237, 0.7);\r\n}\r\n\r\n.time-range-control .eyebrow {\r\n  color: var(--accent);\r\n}\r\n\r\n.time-range-control strong {\r\n  color: var(--text);\r\n}\r\n\r\n.segmented-control {\r\n  border: 0;\r\n  border-radius: 14px;\r\n  background: #edf4fb;\r\n  box-shadow: inset 0 0 0 1px rgba(207, 221, 237, 0.62);\r\n}\r\n\r\n.segmented-button {\r\n  min-height: 34px;\r\n  border-radius: 11px;\r\n}\r\n\r\n.segmented-button.is-active {\r\n  background: #ffffff;\r\n  color: var(--accent-strong);\r\n  box-shadow: 0 8px 18px rgba(31, 56, 88, 0.08);\r\n}\r\n\r\n.overview-visuals {\r\n  grid-template-columns: minmax(280px, 1.35fr) repeat(4, minmax(132px, 1fr));\r\n  gap: 16px;\r\n  margin: 0 0 22px;\r\n  min-width: 0;\r\n}\r\n\r\n.visual-card {\r\n  grid-template-columns: 44px minmax(0, 1fr);\r\n  min-height: 122px;\r\n  gap: 12px;\r\n  padding: 16px;\r\n  min-width: 0;\r\n  border: 0;\r\n  border-radius: 22px;\r\n  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(250, 253, 255, 0.94));\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.visual-card:hover {\r\n  transform: translateY(-1px);\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n.visual-card-icon,\r\n.visual-ring {\r\n  width: 44px;\r\n  height: 44px;\r\n  border: 0;\r\n  border-radius: 16px;\r\n}\r\n\r\n.visual-card-icon {\r\n  background: var(--surface-soft);\r\n}\r\n\r\n.visual-card-icon.tone-info {\r\n  background: var(--info-soft);\r\n}\r\n\r\n.visual-card-icon.tone-success {\r\n  background: var(--success-soft);\r\n}\r\n\r\n.visual-card-icon.tone-warning {\r\n  background: var(--warning-soft);\r\n}\r\n\r\n.visual-card-icon.tone-danger {\r\n  background: var(--danger-soft);\r\n}\r\n\r\n.visual-card-icon.tone-compat {\r\n  background: var(--compat-soft);\r\n}\r\n\r\n.visual-card span,\r\n.visual-card small {\r\n  color: var(--muted);\r\n  font-weight: 700;\r\n}\r\n\r\n.visual-card small {\r\n  line-height: 1.25;\r\n  white-space: normal;\r\n}\r\n\r\n.visual-card strong {\r\n  margin-top: 4px;\r\n  overflow: visible;\r\n  color: var(--text);\r\n  font-family: var(--sans);\r\n  font-variant-numeric: tabular-nums;\r\n  font-size: 21px;\r\n  font-weight: 850;\r\n  line-height: 1.08;\r\n  text-overflow: clip;\r\n  white-space: normal;\r\n}\r\n\r\n.visual-hero-card {\r\n  grid-column: span 1;\r\n  min-height: 146px;\r\n  align-items: start;\r\n  background:\r\n    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(232, 242, 255, 0.95)),\r\n    var(--surface);\r\n  box-shadow: 0 18px 44px rgba(37, 99, 235, 0.12);\r\n}\r\n\r\n@media (max-width: 1360px) {\r\n  .overview-visuals {\r\n    grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  }\r\n\r\n  .visual-hero-card {\r\n    grid-column: span 2;\r\n  }\r\n}\r\n\r\n@media (max-width: 1180px) {\r\n  .overview-visuals {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n\r\n  .visual-hero-card {\r\n    grid-column: 1 / -1;\r\n  }\r\n}\r\n\r\n.visual-hero-card .visual-card-icon {\r\n  color: var(--accent);\r\n  background: #dbeafe;\r\n}\r\n\r\n.visual-hero-card.tone-warning .visual-card-icon {\r\n  color: var(--warning);\r\n  background: var(--warning-soft);\r\n}\r\n\r\n.visual-hero-card.tone-danger .visual-card-icon {\r\n  color: var(--danger);\r\n  background: var(--danger-soft);\r\n}\r\n\r\n.visual-hero-card.tone-warning .visual-hero-meta b {\r\n  background: rgba(217, 119, 6, 0.1);\r\n  color: var(--warning);\r\n}\r\n\r\n.visual-hero-card.tone-danger .visual-hero-meta b {\r\n  background: rgba(229, 72, 93, 0.1);\r\n  color: var(--danger);\r\n}\r\n\r\n.visual-hero-card strong {\r\n  margin-top: 6px;\r\n  font-size: 42px;\r\n  letter-spacing: 0;\r\n  white-space: nowrap;\r\n}\r\n\r\n.visual-hero-card small {\r\n  margin-top: 5px;\r\n  font-size: 12px;\r\n}\r\n\r\n.visual-hero-meta {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 7px;\r\n  margin-top: 12px;\r\n}\r\n\r\n.visual-hero-meta b {\r\n  display: inline-flex;\r\n  min-height: 24px;\r\n  align-items: center;\r\n  padding: 0 9px;\r\n  border-radius: 999px;\r\n  background: rgba(37, 99, 235, 0.08);\r\n  color: var(--accent-strong);\r\n  font: 750 11px var(--mono);\r\n}\r\n\r\n.visual-progress {\r\n  height: 6px;\r\n  background: #edf2f7;\r\n}\r\n\r\n.token-split {\r\n  height: 6px;\r\n}\r\n\r\n.overview-grid {\r\n  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);\r\n  gap: 22px;\r\n  align-items: start;\r\n}\r\n\r\n.overview-traffic-panel,\r\n.overview-failures-panel {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.panel {\r\n  border: 0;\r\n  border-radius: 24px;\r\n  background: rgba(255, 255, 255, 0.96);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.panel-head {\r\n  padding: 22px 24px 8px;\r\n  border-bottom: 0;\r\n  background: transparent;\r\n}\r\n\r\n.panel-head h2 {\r\n  color: var(--text);\r\n  font-size: 18px;\r\n  font-weight: 820;\r\n}\r\n\r\n.panel-head p {\r\n  margin-top: 3px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n}\r\n\r\n.panel-head .tag {\r\n  border: 0;\r\n  border-radius: 999px;\r\n  background: var(--accent-soft);\r\n  color: var(--accent-strong);\r\n}\r\n\r\n.chart {\r\n  min-height: 420px;\r\n  padding: 8px 24px 24px;\r\n}\r\n\r\n.traffic-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 14px 22px;\r\n  align-items: center;\r\n  margin: 0 0 12px;\r\n  padding: 0 4px;\r\n}\r\n\r\n.traffic-legend-item {\r\n  display: inline-flex;\r\n  gap: 8px;\r\n  padding: 0;\r\n  border: 0;\r\n  background: transparent;\r\n  box-shadow: none;\r\n}\r\n\r\n.traffic-legend-item > span {\r\n  width: 28px;\r\n  height: 4px;\r\n  border-radius: 999px;\r\n  background: var(--series-color);\r\n  box-shadow: none;\r\n}\r\n\r\n.traffic-legend-item.tone-danger > span {\r\n  background-image: repeating-linear-gradient(90deg, #dc2626 0 6px, transparent 6px 10px);\r\n}\r\n\r\n.traffic-legend-item strong {\r\n  font-size: 12px;\r\n}\r\n\r\n.traffic-legend-item small {\r\n  color: var(--faint);\r\n}\r\n\r\n.traffic-chart-shell {\r\n  border: 0;\r\n  border-radius: 22px;\r\n  background: linear-gradient(180deg, #ffffff, #f8fbff);\r\n  box-shadow: inset 0 0 0 1px rgba(207, 221, 237, 0.55);\r\n}\r\n\r\n.traffic-chart-shell svg {\r\n  height: 352px;\r\n}\r\n\r\n.chart .axis {\r\n  stroke: rgba(148, 163, 184, 0.22);\r\n}\r\n\r\n.traffic-axis-label {\r\n  fill: var(--faint);\r\n  font: 650 11px var(--sans);\r\n}\r\n\r\n.traffic-axis-title {\r\n  font-weight: 760;\r\n}\r\n\r\n.traffic-axis-label-info {\r\n  fill: color-mix(in srgb, var(--info) 76%, var(--muted));\r\n}\r\n\r\n.traffic-success-area {\r\n  fill: url(\"#trafficSuccessArea\");\r\n  pointer-events: none;\r\n}\r\n\r\n.traffic-success-line,\r\n.traffic-failed-line,\r\n.traffic-firstbyte-line {\r\n  fill: none;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  stroke-width: 3.2;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-success-line {\r\n  stroke: var(--success);\r\n}\r\n\r\n.traffic-failed-line {\r\n  stroke: var(--danger);\r\n  stroke-dasharray: 7 7;\r\n}\r\n\r\n.traffic-firstbyte-line {\r\n  stroke: var(--info);\r\n  filter: drop-shadow(0 8px 14px rgba(47, 128, 237, 0.18));\r\n}\r\n\r\n.traffic-series-dot,\r\n.traffic-firstbyte-dot {\r\n  stroke: #fff;\r\n  stroke-width: 2.4;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-success-dot {\r\n  fill: var(--success);\r\n}\r\n\r\n.traffic-failed-dot {\r\n  fill: var(--danger);\r\n}\r\n\r\n.traffic-firstbyte-dot {\r\n  fill: var(--info);\r\n}\r\n\r\n.traffic-firstbyte-label {\r\n  fill: var(--info);\r\n  font: 760 11px var(--mono);\r\n}\r\n\r\n.usage-chart {\r\n  gap: 16px;\r\n  padding: 14px 22px 22px;\r\n}\r\n\r\n.usage-summary {\r\n  gap: 12px;\r\n}\r\n\r\n.usage-chart .mini-metric {\r\n  border: 0;\r\n  border-radius: 16px;\r\n  background: linear-gradient(180deg, #f8fbff, #f1f6fd);\r\n  box-shadow: inset 0 0 0 1px rgba(207, 221, 237, 0.48);\r\n}\r\n\r\n.usage-section-title h3 {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  letter-spacing: 0;\r\n  text-transform: none;\r\n}\r\n\r\n.usage-bars {\r\n  display: grid;\r\n  gap: 10px;\r\n}\r\n\r\n.usage-row {\r\n  border: 0;\r\n  border-radius: 16px;\r\n  background: #f8fbff;\r\n  box-shadow: inset 0 0 0 1px rgba(207, 221, 237, 0.48);\r\n}\r\n\r\n.usage-rank {\r\n  border: 0;\r\n  border-radius: 999px;\r\n  background: var(--compat-soft);\r\n}\r\n\r\n.usage-track {\r\n  height: 8px;\r\n  background: #e6edf7;\r\n}\r\n\r\n.provider-health {\r\n  gap: 10px;\r\n  padding: 14px 18px 20px;\r\n}\r\n\r\n.overview-summary-meta {\r\n  padding: 0 0 4px;\r\n  color: var(--faint);\r\n  font-family: var(--sans);\r\n  font-size: 11px;\r\n  letter-spacing: 0;\r\n  text-transform: none;\r\n}\r\n\r\n.overview-provider-row,\r\n.recent-failure-row {\r\n  border: 0;\r\n  border-radius: 16px;\r\n  background: #f8fbff;\r\n  box-shadow: inset 0 0 0 1px rgba(207, 221, 237, 0.5);\r\n}\r\n\r\n.overview-provider-row:hover,\r\n.recent-failure-row:hover,\r\n.overview-provider-row:focus-visible,\r\n.recent-failure-row:focus-visible {\r\n  background: #ffffff;\r\n  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.2), 0 12px 24px rgba(31, 56, 88, 0.08);\r\n}\r\n\r\n.recent-failure-list {\r\n  padding: 0 18px 18px;\r\n}\r\n\r\n/* Minimalist correction: warm monochrome surface, low shadow, muted semantic color only. */\r\n:root {\r\n  --bg: #f7f6f3;\r\n  --surface: #ffffff;\r\n  --surface-raised: #fbfbfa;\r\n  --surface-soft: #f3f2ef;\r\n  --surface-strong: #eceae6;\r\n  --sidebar: #ffffff;\r\n  --sidebar-soft: #f7f6f3;\r\n  --line: #e8e6e1;\r\n  --line-soft: #efede8;\r\n  --line-strong: #d9d6cf;\r\n  --text: #222320;\r\n  --muted: #6f706a;\r\n  --faint: #9a9a93;\r\n  --accent: #222320;\r\n  --accent-strong: #343530;\r\n  --accent-soft: #f2f1ed;\r\n  --success: #346538;\r\n  --success-soft: #edf3ec;\r\n  --warning: #956400;\r\n  --warning-soft: #fbf3db;\r\n  --danger: #9f2f2d;\r\n  --danger-soft: #fdebec;\r\n  --info: #20d264;\r\n  --info-soft: #e1f3fe;\r\n  --compat: #6f55a3;\r\n  --compat-soft: #eee9f7;\r\n  --metric-neutral: #3f403b;\r\n  --metric-requests: #1f6c9f;\r\n  --metric-success: #346538;\r\n  --metric-failure: #9f2f2d;\r\n  --metric-provider: #53717d;\r\n  --metric-token: #6f55a3;\r\n  --metric-cost: #956400;\r\n  --shadow: 0 2px 10px rgba(34, 35, 32, 0.035);\r\n  --shadow-tight: 0 4px 16px rgba(34, 35, 32, 0.05);\r\n}\r\n\r\nbody {\r\n  background: var(--bg);\r\n}\r\n\r\n.sidebar {\r\n  border-right: 1px solid var(--line);\r\n  background: var(--sidebar);\r\n  box-shadow: none;\r\n}\r\n\r\n.sidebar::after {\r\n  display: none;\r\n}\r\n\r\n.brand {\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.brand-mark,\r\n.login-mark {\r\n  background: var(--text);\r\n  box-shadow: none;\r\n}\r\n\r\n.nav-item:hover {\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.nav-item.is-active {\r\n  background: var(--text);\r\n  color: #fff;\r\n  box-shadow: none;\r\n}\r\n\r\n.button.primary {\r\n  border-color: var(--accent);\r\n  background: var(--accent);\r\n  box-shadow: none;\r\n}\r\n\r\n.button.primary:hover {\r\n  border-color: var(--accent-strong);\r\n  background: var(--accent-strong);\r\n}\r\n\r\n.button.secondary,\r\n.time-range-control,\r\n.segmented-control {\r\n  box-shadow: none;\r\n}\r\n\r\n.time-range-control {\r\n  border: 1px solid var(--line);\r\n  background: var(--surface);\r\n}\r\n\r\n.time-range-control .eyebrow {\r\n  color: var(--muted);\r\n}\r\n\r\n.segmented-control {\r\n  border: 1px solid var(--line);\r\n  background: var(--surface-soft);\r\n}\r\n\r\n.segmented-button.is-active {\r\n  background: var(--text);\r\n  color: #fff;\r\n  box-shadow: none;\r\n}\r\n\r\n.visual-card,\r\n.panel {\r\n  border: 1px solid var(--line);\r\n  border-radius: 12px;\r\n  background: var(--surface);\r\n  box-shadow: none;\r\n}\r\n\r\n.visual-card:hover,\r\n.panel:hover {\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n.visual-card-icon,\r\n.visual-ring {\r\n  border-radius: 10px;\r\n}\r\n\r\n.visual-hero-card {\r\n  background: var(--surface);\r\n  box-shadow: none;\r\n}\r\n\r\n.visual-hero-card .visual-card-icon {\r\n  color: var(--info);\r\n  background: var(--info-soft);\r\n}\r\n\r\n.visual-hero-card strong {\r\n  color: var(--text);\r\n}\r\n\r\n.visual-hero-meta b {\r\n  background: var(--accent-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.panel-head .tag {\r\n  background: var(--surface-soft);\r\n  color: var(--muted);\r\n}\r\n\r\n.traffic-chart-shell,\r\n.usage-chart .mini-metric,\r\n.usage-row,\r\n.overview-provider-row,\r\n.recent-failure-row {\r\n  border: 1px solid var(--line);\r\n  border-radius: 12px;\r\n  background: var(--surface-raised);\r\n  box-shadow: none;\r\n}\r\n\r\n.traffic-chart-shell {\r\n  background: #fff;\r\n}\r\n\r\n.traffic-firstbyte-line {\r\n  filter: none;\r\n}\r\n\r\n.overview-provider-row:hover,\r\n.recent-failure-row:hover,\r\n.overview-provider-row:focus-visible,\r\n.recent-failure-row:focus-visible {\r\n  background: #fff;\r\n  box-shadow: var(--shadow-tight);\r\n}\r\n\r\n/* Overview mockup skin: crisp operations console, based on design_mockup.html. */\r\n:root {\r\n  /* macOS Aqua/System UI Theme */\r\n  --bg: #f5f5f7;\r\n  --surface: #ffffff;\r\n  --surface-raised: #fbfbfd;\r\n  --surface-soft: #f2f2f7;\r\n  --surface-strong: #e5e5ea;\r\n  --sidebar: rgba(255, 255, 255, 0.75);\r\n  \r\n  /* Mac-style borders rely on transparency */\r\n  --line: rgba(0, 0, 0, 0.14);\r\n  --line-soft: rgba(0, 0, 0, 0.08);\r\n  --line-strong: rgba(0, 0, 0, 0.22);\r\n  \r\n  /* Apple Typography Colors */\r\n  --text: #1d1d1f;\r\n  --muted: #86868b;\r\n  --faint: #d2d2d7;\r\n  \r\n  /* Graphite / Monochrome Accent */\r\n  --accent: #1d1d1f;\r\n  --accent-strong: #000000;\r\n  --accent-soft: rgba(0, 0, 0, 0.04);\r\n  --accent-hover: #3a3a3c;\r\n  \r\n  /* Semantic Colors (Apple HIG) */\r\n  --success: #34c759;\r\n  --success-soft: rgba(52, 199, 89, 0.1);\r\n  --warning: #ff9500;\r\n  --warning-soft: rgba(255, 149, 0, 0.1);\r\n  --danger: #ff3b30;\r\n  --danger-soft: rgba(255, 59, 48, 0.1);\r\n  --info: #86868b;\r\n  --info-soft: rgba(0, 0, 0, 0.05);\r\n  --compat: #1d1d1f; \r\n  --compat-soft: rgba(0, 0, 0, 0.05);\r\n  \r\n  /* Mac Window/Card Elevation */\r\n  --shadow: 0 2px 6px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04);\r\n  --shadow-tight: 0 4px 12px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.05);\r\n}\r\n\r\nbody {\r\n  background: var(--bg);\r\n}\r\n\r\n.shell {\r\n  grid-template-columns: 240px minmax(0, 1fr);\r\n}\r\n\r\n.workspace {\r\n  max-width: 1200px;\r\n  padding: 12px 40px 48px;\r\n}\r\n\r\n.sidebar {\r\n  border-right: 1px solid var(--line);\r\n  background: var(--sidebar);\r\n  backdrop-filter: blur(28px) saturate(200%);\r\n  -webkit-backdrop-filter: blur(28px) saturate(200%);\r\n  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.04);\r\n  z-index: 10;\r\n}\r\n\r\n.brand {\r\n  padding: 24px 16px 28px;\r\n  border-bottom: 0;\r\n}\r\n\r\n.brand-mark,\r\n.login-mark {\r\n  width: 24px;\r\n  height: 24px;\r\n  border-radius: 6px;\r\n  background: var(--text);\r\n  color: #fff;\r\n  font-size: 10px;\r\n  box-shadow: none;\r\n}\r\n\r\n.brand-title {\r\n  font-size: 14px;\r\n  font-weight: 700;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.brand-subtitle {\r\n  color: var(--muted);\r\n}\r\n\r\n.nav {\r\n  gap: 2px;\r\n  padding: 0 16px;\r\n}\r\n\r\n.nav-item {\r\n  min-height: 40px;\r\n  padding: 8px 12px;\r\n  border: 1px solid transparent;\r\n  border-radius: 6px;\r\n  color: var(--muted);\r\n  font-weight: 620;\r\n}\r\n\r\n.nav-item:hover {\r\n  border-color: transparent;\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.nav-item.is-active {\r\n  border: 1px solid var(--line);\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n  font-weight: 760;\r\n}\r\n\r\n.sidebar-actions {\r\n  gap: 8px;\r\n  padding: 12px 16px 8px;\r\n}\r\n\r\n.button {\r\n  border-radius: 6px;\r\n  box-shadow: none;\r\n}\r\n\r\n.button.primary {\r\n  border-color: var(--accent);\r\n  background: var(--accent);\r\n  color: #fff;\r\n}\r\n\r\n.button.primary:hover {\r\n  border-color: var(--accent-strong);\r\n  background: var(--accent-strong);\r\n}\r\n\r\n.button.secondary {\r\n  border-color: var(--line);\r\n  background: var(--surface);\r\n}\r\n\r\n.overview-page-head {\r\n  display: flex;\r\n  gap: 20px;\r\n  align-items: flex-end;\r\n  justify-content: space-between;\r\n  margin-bottom: 24px;\r\n  padding-top: 16px;\r\n  padding-bottom: 16px;\r\n  border-bottom: 1px solid var(--line);\r\n}\r\n\r\n.overview-page-head h1 {\r\n  color: var(--text);\r\n  font-size: 20px;\r\n  font-weight: 720;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.overview-page-head p {\r\n  margin-top: 4px;\r\n  color: var(--muted);\r\n  font-size: 12.5px;\r\n}\r\n\r\n.overview-page-head .time-range-control {\r\n  margin: 0;\r\n}\r\n\r\n.time-range-control {\r\n  width: fit-content;\r\n  padding: 0;\r\n  border: 0;\r\n  border-left: 0;\r\n  border-radius: 0;\r\n  background: transparent;\r\n}\r\n\r\n.time-range-control > div:first-child {\r\n  display: none;\r\n}\r\n\r\n.segmented-control {\r\n  gap: 2px;\r\n  padding: 3px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.segmented-button {\r\n  min-width: 44px;\r\n  min-height: 30px;\r\n  border-radius: 6px;\r\n  font-size: 12px;\r\n  font-weight: 680;\r\n}\r\n\r\n.segmented-button.is-active {\r\n  background: var(--text);\r\n  color: #fff;\r\n}\r\n\r\n.overview-visuals {\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 16px;\r\n  margin-bottom: 24px;\r\n}\r\n\r\n.visual-card {\r\n  position: relative;\r\n  display: flex;\r\n  min-height: 100px;\r\n  flex-direction: column;\r\n  align-items: stretch;\r\n  justify-content: space-between;\r\n  gap: 10px;\r\n  overflow: hidden;\r\n  padding: 16px 20px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.visual-card::before {\r\n  position: absolute;\r\n  top: 0;\r\n  right: 0;\r\n  left: 0;\r\n  height: 2px;\r\n  background: transparent;\r\n  content: \"\";\r\n}\r\n\r\n.visual-card.accent-info::before {\r\n  background: #3b82f6;\r\n}\r\n\r\n.visual-card.accent-success::before {\r\n  background: #10b981;\r\n}\r\n\r\n.visual-card.accent-warning::before {\r\n  background: #f59e0b;\r\n}\r\n\r\n.visual-card.accent-danger::before {\r\n  background: #ef4444;\r\n}\r\n\r\n.visual-card:hover {\r\n  border-color: rgba(9, 9, 11, 0.14);\r\n  box-shadow: var(--shadow-tight);\r\n  transform: none;\r\n}\r\n\r\n.visual-card .metric-header {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: space-between;\r\n}\r\n\r\n.visual-card .metric-label {\r\n  color: var(--muted);\r\n  font-size: 10.5px;\r\n  font-weight: 720;\r\n  letter-spacing: 0.05em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.visual-card .metric-icon {\r\n  display: inline-grid;\r\n  color: var(--faint);\r\n}\r\n\r\n.visual-card .metric-icon .icon-svg {\r\n  width: 15px;\r\n  height: 15px;\r\n}\r\n\r\n.visual-card .metric-val {\r\n  display: block;\r\n  margin: 0;\r\n  overflow: visible;\r\n  color: var(--text);\r\n  font-family: var(--sans);\r\n  font-size: 26px;\r\n  font-weight: 760;\r\n  line-height: 1.05;\r\n  letter-spacing: 0;\r\n  white-space: nowrap;\r\n}\r\n\r\n.visual-card.accent-success .metric-val {\r\n  color: var(--success);\r\n}\r\n\r\n.visual-card.accent-danger .metric-val {\r\n  color: var(--danger);\r\n}\r\n\r\n.visual-card.accent-warning .metric-val {\r\n  color: var(--warning);\r\n}\r\n\r\n.visual-card.accent-info .metric-val {\r\n  color: var(--info);\r\n}\r\n\r\n.visual-card .metric-sub {\r\n  display: flex;\r\n  gap: 5px;\r\n  align-items: center;\r\n  min-width: 0;\r\n  overflow: hidden;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  font-weight: 500;\r\n  text-overflow: ellipsis;\r\n  white-space: nowrap;\r\n}\r\n\r\n.metric-dot {\r\n  display: inline-block;\r\n  width: 5px;\r\n  min-width: 5px;\r\n  height: 5px;\r\n  border-radius: 50%;\r\n  background: var(--info);\r\n}\r\n\r\n.metric-dot.success {\r\n  background: #16a34a;\r\n}\r\n\r\n.metric-dot.warning {\r\n  background: #d97706;\r\n}\r\n\r\n.metric-dot.danger {\r\n  background: #dc2626;\r\n}\r\n\r\n.overview-grid {\r\n  grid-template-columns: 1fr;\r\n  gap: 24px;\r\n}\r\n\r\n.overview-traffic-panel,\r\n.overview-secondary-layout {\r\n  grid-column: 1 / -1;\r\n}\r\n\r\n.overview-secondary-layout {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1.9fr) minmax(320px, 0.9fr);\r\n  gap: 24px;\r\n  align-items: start;\r\n}\r\n\r\n.overview-main-column,\r\n.overview-side-column {\r\n  display: grid;\r\n  gap: 24px;\r\n  min-width: 0;\r\n  align-content: start;\r\n}\r\n\r\n.panel {\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n  box-shadow: var(--shadow);\r\n}\r\n\r\n.panel-head {\r\n  padding: 12px 20px;\r\n  border-bottom: 1px solid var(--line);\r\n  background: var(--surface-raised);\r\n}\r\n\r\n.panel-head h2 {\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  font-weight: 760;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.panel-head p {\r\n  display: none;\r\n}\r\n\r\n.panel-head .tag,\r\n.panel-head .badge {\r\n  min-height: 22px;\r\n  border-radius: 4px;\r\n  font-family: var(--mono);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n  letter-spacing: 0.02em;\r\n  text-transform: uppercase;\r\n}\r\n\r\n.panel-head .badge.info {\r\n  border-color: #bfdbfe;\r\n  background: #dbeafe;\r\n  color: #1e3a8a;\r\n}\r\n\r\n.chart {\r\n  min-height: 332px;\r\n  padding: 20px;\r\n}\r\n\r\n.traffic-legend {\r\n  gap: 18px;\r\n  margin-bottom: 14px;\r\n  padding: 0;\r\n}\r\n\r\n.traffic-legend-item {\r\n  gap: 8px;\r\n}\r\n\r\n.traffic-legend-item > span {\r\n  width: 28px;\r\n  height: 3px;\r\n  border-radius: 3px;\r\n}\r\n\r\n.traffic-legend-item strong {\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.traffic-legend-item small {\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n  font-size: 10.5px;\r\n}\r\n\r\n.traffic-chart-shell {\r\n  border: 0;\r\n  border-radius: 0;\r\n  background: #fff;\r\n  box-shadow: none;\r\n}\r\n\r\n.traffic-chart-shell svg {\r\n  height: 250px;\r\n}\r\n\r\n.chart .axis {\r\n  stroke: #d4d4d8;\r\n  stroke-dasharray: 2 2;\r\n  stroke-width: 1.2;\r\n}\r\n\r\n.traffic-firstbyte-area,\r\n.traffic-success-area {\r\n  display: none;\r\n}\r\n\r\n.traffic-success-line,\r\n.traffic-failed-line,\r\n.traffic-firstbyte-line {\r\n  stroke-width: 2.8;\r\n  filter: none;\r\n}\r\n\r\n.traffic-firstbyte-line {\r\n  stroke: var(--text);\r\n}\r\n\r\n.traffic-success-line {\r\n  stroke: #3b82f6;\r\n}\r\n\r\n.traffic-failed-line {\r\n  stroke: #dc2626;\r\n  stroke-dasharray: 5 5;\r\n}\r\n\r\n.traffic-firstbyte-dot,\r\n.traffic-series-dot,\r\n.traffic-token-dot {\r\n  stroke: #fff;\r\n  stroke-width: 1.8;\r\n}\r\n\r\n.traffic-token-bar {\r\n  fill: rgba(124, 58, 237, 0.22);\r\n  stroke: rgba(124, 58, 237, 0.72);\r\n  stroke-width: 1;\r\n}\r\n\r\n.traffic-token-dot {\r\n  fill: #7c3aed;\r\n}\r\n\r\n.traffic-firstbyte-label {\r\n  display: none;\r\n}\r\n\r\n.traffic-axis-label {\r\n  fill: #52525b;\r\n  font: 680 11px var(--mono);\r\n}\r\n\r\n.usage-chart {\r\n  grid-template-columns: 1fr;\r\n  align-items: start;\r\n  padding: 20px;\r\n}\r\n\r\n.usage-summary {\r\n  grid-template-columns: repeat(4, minmax(0, 1fr));\r\n  gap: 12px;\r\n}\r\n\r\n.usage-columns.usage-model-only {\r\n  grid-template-columns: 1fr;\r\n}\r\n\r\n.usage-chart .mini-metric,\r\n.usage-row,\r\n.overview-provider-row,\r\n.recent-failure-row {\r\n  border: 1px solid var(--line);\r\n  border-radius: 6px;\r\n  background: var(--surface);\r\n  box-shadow: none;\r\n}\r\n\r\n.usage-chart .mini-metric {\r\n  padding: 12px;\r\n}\r\n\r\n.usage-row {\r\n  padding: 11px 12px;\r\n}\r\n\r\n.provider-health {\r\n  padding: 20px;\r\n}\r\n\r\n.overview-summary-meta {\r\n  color: var(--muted);\r\n  font: 650 11px var(--mono);\r\n  text-transform: uppercase;\r\n}\r\n\r\n.overview-provider-row {\r\n  padding: 12px;\r\n}\r\n\r\n.recent-failure-list {\r\n  padding: 0;\r\n}\r\n\r\n#recentFailures {\r\n  padding: 20px;\r\n}\r\n\r\n.recent-failure-row {\r\n  grid-template-columns: auto minmax(180px, 1fr) auto minmax(180px, 1.1fr);\r\n  padding: 12px;\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-warning .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-warning .request-row-dot {\r\n  background: var(--warning);\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-danger .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-danger .request-row-dot {\r\n  background: var(--danger);\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-success .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-success .request-row-dot {\r\n  background: var(--success);\r\n}\r\n\r\n@media (max-width: 1080px) {\r\n  .shell {\r\n    width: 100%;\r\n    max-width: 100vw;\r\n    overflow-x: clip;\r\n    align-content: start;\r\n    grid-auto-rows: max-content;\r\n    grid-template-columns: minmax(0, 1fr);\r\n  }\r\n\r\n  .sidebar {\r\n    position: static;\r\n    height: auto;\r\n    width: 100%;\r\n    max-width: 100vw;\r\n    align-self: start;\r\n    overflow: hidden;\r\n    border-right: 0;\r\n    border-bottom: 1px solid var(--line-strong);\r\n    box-shadow: 0 8px 18px rgba(9, 9, 11, 0.04);\r\n  }\r\n\r\n  .sidebar::after {\r\n    display: none;\r\n  }\r\n\r\n  .brand {\r\n    padding: 14px 14px 12px;\r\n  }\r\n\r\n  .nav {\r\n    grid-template-columns: repeat(5, minmax(0, 1fr));\r\n    padding: 10px;\r\n  }\r\n\r\n  .nav-item {\r\n    padding: 10px 8px;\r\n    text-align: center;\r\n  }\r\n\r\n  .nav-item.is-active::before {\r\n    right: 18px;\r\n    bottom: 5px;\r\n    left: 18px;\r\n    top: auto;\r\n    width: auto;\r\n    height: 3px;\r\n  }\r\n\r\n  .sidebar-actions {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n    padding: 0 10px 10px;\r\n    border-top: 0;\r\n  }\r\n\r\n  .sidebar-footer {\r\n    display: none;\r\n  }\r\n\r\n  .overview-grid,\r\n  .policy-grid,\r\n  .config-grid {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .overview-secondary-layout {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .overview-traffic-panel,\r\n  .overview-failures-panel,\r\n  .overview-health-panel,\r\n  .overview-usage-panel {\r\n    grid-column: 1 / -1;\r\n  }\r\n\r\n  .metric-grid {\r\n    grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  }\r\n\r\n  .overview-visuals {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n\r\n  .usage-chart {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .request-summary-row {\r\n    grid-template-columns: 24px 10px minmax(150px, 1fr) minmax(96px, auto) minmax(122px, 0.8fr) minmax(118px, auto) 28px;\r\n  }\r\n\r\n  .provider-card-grid {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n\r\n  .provider-toolbar {\r\n    grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(130px, 0.7fr)) auto;\r\n  }\r\n\r\n  .workspace {\r\n    width: 100%;\r\n    max-width: 100vw;\r\n  }\r\n}\r\n\r\n@media (max-width: 760px) {\r\n  body.is-mobile-settings-open {\r\n    overflow: hidden;\r\n  }\r\n\r\n  .sidebar {\r\n    display: none;\r\n  }\r\n\r\n  .workspace {\r\n    padding: 10px;\r\n  }\r\n\r\n  .topbar {\r\n    display: grid;\r\n    grid-template-columns: minmax(0, 1fr) auto;\r\n    margin: 1px 1px 5px 0px;\r\n    padding: 10px;\r\n    align-items: start;\r\n    background: transparent;\r\n    border: 1px solid var(--line-strong);\r\n    border-radius: 12px;\r\n    box-shadow: var(--shadow);\r\n    \r\n  }\r\n\r\n\r\n\r\n\r\n  \r\n  .brand {\r\n    gap: 10px;\r\n    padding: 10px 12px 9px;\r\n  }\r\n\r\n  .brand-mark {\r\n    width: 32px;\r\n    height: 32px;\r\n    border-radius: 7px;\r\n    font-size: 11px;\r\n  }\r\n\r\n  .brand-title {\r\n    font-size: 14px;\r\n  }\r\n\r\n  .brand-subtitle {\r\n    margin-top: 0;\r\n    font-size: 11px;\r\n  }\r\n\r\n  h1 {\r\n    font-size: 22px;\r\n  }\r\n\r\n  .topbar p {\r\n    margin-top: 2px;\r\n    font-size: 11px;\r\n    line-height: 1.35;\r\n  }\r\n\r\n  .mobile-settings-button {\r\n    display: inline-flex;\r\n    align-items: center;\r\n    justify-content: center;\r\n    justify-self: end;\r\n    min-height: 34px;\r\n    padding: 0 11px;\r\n    white-space: nowrap;\r\n  }\r\n\r\n  .mobile-settings-backdrop {\r\n    position: fixed;\r\n    inset: 0;\r\n    z-index: 28;\r\n    display: block;\r\n    background: rgba(9, 9, 11, 0.28);\r\n    backdrop-filter: blur(2px);\r\n    opacity: 0;\r\n    pointer-events: none;\r\n    transition: opacity 180ms ease;\r\n  }\r\n\r\n  .mobile-settings-backdrop[hidden] {\r\n    display: none;\r\n  }\r\n\r\n  .mobile-settings-backdrop.is-open {\r\n    opacity: 1;\r\n    pointer-events: auto;\r\n  }\r\n\r\n  .mobile-settings-drawer {\r\n    position: fixed;\r\n    top: 0;\r\n    right: 0;\r\n    z-index: 29;\r\n    display: flex;\r\n    width: min(322px, calc(100vw - 42px));\r\n    height: 100dvh;\r\n    flex-direction: column;\r\n    border-left: 1px solid var(--line);\r\n    background: rgba(255, 255, 255, 0.75);\r\n    backdrop-filter: blur(30px) saturate(200%);\r\n    -webkit-backdrop-filter: blur(30px) saturate(200%);\r\n    box-shadow: -22px 0 42px rgba(9, 9, 11, 0);\r\n    transform: translateX(100%);\r\n    transition: transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 190ms ease;\r\n  }\r\n\r\n  .mobile-settings-drawer.is-open {\r\n    transform: translateX(0);\r\n    box-shadow: -22px 0 42px rgba(9, 9, 11, 0.18);\r\n  }\r\n\r\n  .mobile-settings-drawer .drawer-head {\r\n    display: grid;\r\n    grid-template-columns: minmax(0, 1fr) 34px;\r\n    gap: 10px;\r\n    align-items: center;\r\n    padding: 14px 14px 12px;\r\n    border-bottom: 1px solid color-mix(in srgb, var(--info) 14%, var(--line));\r\n    background: transparent;\r\n  }\r\n\r\n  .mobile-settings-drawer .drawer-head h2 {\r\n    font-size: 16px;\r\n    line-height: 1.15;\r\n  }\r\n\r\n  .mobile-settings-drawer .drawer-head p {\r\n    max-width: 19rem;\r\n    margin-top: 3px;\r\n    color: var(--muted);\r\n    font-family: var(--sans);\r\n    font-size: 11px;\r\n    line-height: 1.35;\r\n  }\r\n\r\n  .mobile-settings-drawer .icon-button {\r\n    width: 34px;\r\n    height: 34px;\r\n    border-color: color-mix(in srgb, var(--info) 18%, var(--line));\r\n    background: color-mix(in srgb, var(--surface) 86%, var(--info-soft));\r\n    font-size: 17px;\r\n  }\r\n\r\n  .mobile-settings-body {\r\n    gap: 11px;\r\n    height: calc(100dvh - 72px);\r\n    padding: 12px;\r\n  }\r\n\r\n  .mobile-settings-section .nav,\r\n  .mobile-settings-section .sidebar-actions,\r\n  .mobile-settings-section .toolbar {\r\n    display: grid;\r\n    gap: 8px;\r\n    justify-content: stretch;\r\n    margin: 0;\r\n    padding: 0;\r\n    border: 0;\r\n    border-radius: 0;\r\n    background: transparent;\r\n    box-shadow: none;\r\n  }\r\n\r\n  .mobile-settings-section {\r\n    gap: 8px;\r\n    padding: 10px;\r\n    border: 1px solid var(--line);\r\n    border-radius: 10px;\r\n    background: color-mix(in srgb, var(--surface) 88%, var(--surface-raised));\r\n    box-shadow: var(--shadow);\r\n  }\r\n\r\n  .mobile-settings-section-title {\r\n    color: color-mix(in srgb, var(--muted) 84%, var(--text));\r\n    font-size: 10px;\r\n    letter-spacing: 0.04em;\r\n  }\r\n\r\n  .mobile-settings-section #requestsToolbar::before {\r\n    display: none;\r\n  }\r\n\r\n  .mobile-settings-section #requestsToolbar,\r\n  #requestsToolbar {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .request-filter-primary,\r\n  .request-bulk-actions {\r\n    width: 100%;\r\n  }\r\n\r\n  .request-filter-title,\r\n  .request-status-chips,\r\n  .filter-search-field,\r\n  #requestsToolbar .control,\r\n  .advanced-filter-box,\r\n  .advanced-filter-box summary {\r\n    width: 100%;\r\n  }\r\n\r\n  .request-status-chips {\r\n    display: grid;\r\n    grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  }\r\n\r\n  .filter-chip {\r\n    text-align: center;\r\n  }\r\n\r\n  .advanced-filter-fields {\r\n    position: static;\r\n    width: 100%;\r\n    margin-top: 8px;\r\n    box-shadow: none;\r\n  }\r\n\r\n  .request-bulk-actions {\r\n    justify-content: stretch;\r\n    padding: 9px 0 0;\r\n    border-top: 1px solid var(--line-soft);\r\n    border-left: 0;\r\n  }\r\n\r\n  .request-bulk-actions .button,\r\n  .selection-count {\r\n    width: 100%;\r\n    justify-content: center;\r\n    text-align: center;\r\n  }\r\n\r\n  .mobile-settings-section .nav {\r\n    grid-template-columns: 1fr;\r\n    width: 100%;\r\n    max-width: none;\r\n    overflow: visible;\r\n  }\r\n\r\n  .mobile-settings-section .nav-item {\r\n    width: 100%;\r\n    min-height: 36px;\r\n    padding: 8px 10px 8px 13px;\r\n    border-color: var(--line-soft);\r\n    background: var(--surface);\r\n    text-align: left;\r\n    white-space: normal;\r\n    box-shadow: none;\r\n  }\r\n\r\n  .mobile-settings-section .nav-item.is-active::before {\r\n    top: 8px;\r\n    right: auto;\r\n    bottom: 8px;\r\n    left: 6px;\r\n    width: 2px;\r\n    height: auto;\r\n  }\r\n\r\n  .mobile-settings-section .nav-item.is-active {\r\n    border-color: color-mix(in srgb, var(--accent) 18%, var(--line));\r\n    background: color-mix(in srgb, var(--accent-soft) 62%, var(--surface));\r\n    box-shadow: none;\r\n  }\r\n\r\n  .mobile-settings-section .nav::-webkit-scrollbar {\r\n    display: none;\r\n  }\r\n\r\n  .mobile-settings-section .nav > *,\r\n  .mobile-settings-section .sidebar-actions > *,\r\n  .mobile-settings-section .toolbar > * {\r\n    width: 100%;\r\n    min-width: 0;\r\n  }\r\n\r\n  .nav {\r\n    width: 100%;\r\n    max-width: 100vw;\r\n  }\r\n\r\n  .time-range-control {\r\n    width: 100%;\r\n    display: grid;\r\n    gap: 8px;\r\n    margin-bottom: 10px;\r\n    padding: 10px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .overview-page-head {\r\n    display: block;\r\n    margin-bottom: 12px;\r\n    padding-bottom: 0;\r\n    border-bottom: 0;\r\n  }\r\n\r\n  .overview-page-head > div:first-child {\r\n    display: none;\r\n  }\r\n\r\n  .overview-page-head .time-range-control {\r\n    margin: 0;\r\n  }\r\n\r\n  .segmented-control {\r\n    width: 100%;\r\n    grid-auto-flow: column;\r\n  }\r\n\r\n  .segmented-button {\r\n    min-width: 0;\r\n    padding: 0 6px;\r\n  }\r\n\r\n  .metric-grid {\r\n    gap: 8px;\r\n    grid-template-columns: 1fr 1fr;\r\n    margin-bottom: 8px;\r\n  }\r\n\r\n  .overview-visuals {\r\n    grid-template-columns: 1fr;\r\n    gap: 7px;\r\n    margin: 0 0 8px;\r\n  }\r\n\r\n  .visual-hero-card {\r\n    min-height: 116px;\r\n  }\r\n\r\n  .visual-hero-card strong {\r\n    font-size: 30px;\r\n  }\r\n\r\n  .visual-hero-meta {\r\n    gap: 5px;\r\n    margin-top: 8px;\r\n  }\r\n\r\n  .visual-hero-meta b {\r\n    min-height: 22px;\r\n    padding: 0 7px;\r\n    font-size: 10px;\r\n  }\r\n\r\n  .visual-card {\r\n    min-height: 64px;\r\n    padding: 9px 10px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .visual-card-icon,\r\n  .visual-ring {\r\n    width: 36px;\r\n    height: 36px;\r\n    border-radius: 9px;\r\n  }\r\n\r\n  .metric {\r\n    min-height: 76px;\r\n    padding: 10px 11px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .metric-label {\r\n    font-size: 11px;\r\n  }\r\n\r\n  .metric strong {\r\n    margin-top: 5px;\r\n    font-size: 23px;\r\n  }\r\n\r\n  .metric small {\r\n    margin-top: 5px;\r\n    font-size: 11px;\r\n    line-height: 1.25;\r\n  }\r\n\r\n  .overview-grid,\r\n  .policy-grid,\r\n  .config-grid {\r\n    gap: 8px;\r\n  }\r\n\r\n  .panel {\r\n    margin-bottom: 8px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .panel-head {\r\n    display: grid;\r\n    grid-template-columns: minmax(0, 1fr);\r\n    gap: 8px;\r\n    padding: 10px 11px 9px;\r\n  }\r\n\r\n  .panel-head > .tag,\r\n  .panel-head > .badge,\r\n  .panel-head > .button,\r\n  .panel-head > .actions {\r\n    justify-self: start;\r\n  }\r\n\r\n  .overview-traffic-panel .panel-head {\r\n    gap: 6px;\r\n  }\r\n\r\n  .panel-head > .tag,\r\n  .panel-head > .badge {\r\n    max-width: 100%;\r\n    white-space: normal;\r\n    overflow-wrap: anywhere;\r\n  }\r\n\r\n  .panel-head p {\r\n    display: none;\r\n  }\r\n\r\n  .tag,\r\n  .badge {\r\n    min-height: 21px;\r\n    padding: 0 7px;\r\n    font-size: 10px;\r\n  }\r\n\r\n  .chart {\r\n    min-height: 320px;\r\n    padding: 8px 9px 7px;\r\n  }\r\n\r\n  .traffic-chart-shell {\r\n    border-radius: 14px;\r\n  }\r\n\r\n  .traffic-chart-shell svg {\r\n    height: 282px;\r\n  }\r\n\r\n  .request-page-vitals {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n    gap: 6px;\r\n    padding: 8px;\r\n  }\r\n\r\n  .request-summary-row {\r\n    grid-template-columns: 24px 9px minmax(0, 1fr) 28px;\r\n    gap: 8px;\r\n    padding: 10px;\r\n  }\r\n\r\n  .request-row-status,\r\n  .request-row-route,\r\n  .request-row-metrics {\r\n    grid-column: 3 / -1;\r\n  }\r\n\r\n  .request-row-open {\r\n    grid-column: 4;\r\n    grid-row: 1;\r\n  }\r\n\r\n  .chart-stats {\r\n    gap: 5px;\r\n  }\r\n\r\n  .chart-stats div {\r\n    padding: 7px;\r\n  }\r\n\r\n  .chart-stats span {\r\n    font-size: 10px;\r\n  }\r\n\r\n  .chart-stats strong {\r\n    font-size: 12px;\r\n  }\r\n\r\n  .chart > svg {\r\n    height: 220px;\r\n  }\r\n\r\n  .usage-chart {\r\n    gap: 9px;\r\n    padding: 9px;\r\n  }\r\n\r\n  .usage-summary {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n    gap: 6px;\r\n  }\r\n\r\n  .usage-columns {\r\n    grid-template-columns: 1fr;\r\n    gap: 10px;\r\n  }\r\n\r\n  .usage-row {\r\n    gap: 6px;\r\n    padding: 8px;\r\n  }\r\n\r\n  .usage-row-foot {\r\n    display: grid;\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n\r\n  .latency-samples {\r\n    min-height: 38px;\r\n  }\r\n\r\n  .latency-sample {\r\n    min-width: 82px;\r\n    padding: 6px 7px;\r\n  }\r\n\r\n  .provider-health,\r\n  .pad,\r\n  .form-grid,\r\n  .drawer-body,\r\n  .mobile-settings-body {\r\n    padding: 11px;\r\n  }\r\n\r\n  th,\r\n  td {\r\n    padding: 9px 10px;\r\n  }\r\n\r\n  .button {\r\n    min-height: 34px;\r\n  }\r\n\r\n  .control {\r\n    min-height: 34px;\r\n  }\r\n\r\n  .config-provider-card {\r\n    gap: 10px;\r\n    padding: 11px;\r\n  }\r\n\r\n  .config-provider-head,\r\n  .format-edit-row {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .config-provider-head {\r\n    display: grid;\r\n  }\r\n\r\n  .format-edit-row {\r\n    gap: 6px;\r\n  }\r\n\r\n  .provider-runtime-head,\r\n  .key-card-head,\r\n  .failure-policy-head {\r\n    display: grid;\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .compact-control {\r\n    width: 100%;\r\n    min-width: 0;\r\n  }\r\n  .key-probe-menu {\r\n    position: fixed;\r\n    right: 12px;\r\n    left: 12px;\r\n    width: auto;\r\n    max-width: none;\r\n  }\r\n\r\n  .provider-runtime-actions,\r\n  .actions {\r\n    justify-content: flex-start;\r\n  }\r\n\r\n  .provider-card-grid,\r\n  .provider-model-list,\r\n  .policy-card-list,\r\n  .failure-policy-list {\r\n    grid-template-columns: 1fr;\r\n    gap: 8px;\r\n  }\r\n\r\n  .provider-toolbar {\r\n    grid-template-columns: 1fr;\r\n    margin: 0 9px 4px;\r\n    padding: 10px;\r\n  }\r\n\r\n  .recent-failure-row {\r\n    grid-template-columns: auto minmax(0, 1fr) auto;\r\n  }\r\n\r\n  .recent-failure-reason {\r\n    grid-column: 2 / -1;\r\n  }\r\n\r\n  .provider-runtime-card,\r\n  .model-capability-card,\r\n  .policy-rule-card,\r\n  .failure-policy-card {\r\n    gap: 10px;\r\n    padding: 10px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .provider-metrics,\r\n  .provider-compact-stats,\r\n  .provider-card-metrics,\r\n  .model-capability-summary,\r\n  .policy-summary-grid {\r\n    grid-template-columns: 1fr 1fr;\r\n    gap: 7px;\r\n  }\r\n\r\n  .provider-detail-metrics {\r\n    grid-template-columns: repeat(3, minmax(0, 1fr));\r\n    gap: 6px;\r\n  }\r\n\r\n  .provider-detail-metrics .mini-metric {\r\n    min-height: 0;\r\n    padding: 6px 7px;\r\n    border-radius: 6px;\r\n  }\r\n\r\n  .provider-detail-metrics .mini-metric span {\r\n    font-size: 10px;\r\n    line-height: 1.1;\r\n  }\r\n\r\n  .provider-detail-metrics .mini-metric strong {\r\n    margin-top: 1px;\r\n    font-size: 12px;\r\n    line-height: 1.1;\r\n  }\r\n\r\n  .provider-detail-metrics .mini-metric small {\r\n    display: none;\r\n  }\r\n\r\n  .provider-health-tile {\r\n    min-height: 0;\r\n  }\r\n\r\n  .provider-card-footer,\r\n  .provider-detail-hero,\r\n  .provider-danger-zone {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .provider-card-footer {\r\n    align-items: stretch;\r\n  }\r\n\r\n  .provider-runtime-actions {\r\n    width: 100%;\r\n  }\r\n\r\n  .provider-runtime-actions .button {\r\n    flex: 1 1 auto;\r\n  }\r\n\r\n  .provider-runtime-actions .button.icon-action {\r\n    flex: 0 0 34px;\r\n  }\r\n\r\n  .provider-drawer {\r\n    width: 100vw;\r\n  }\r\n\r\n  .provider-drawer-tabs {\r\n    grid-template-columns: repeat(6, minmax(94px, 1fr));\r\n    overflow-x: auto;\r\n    padding-bottom: 8px;\r\n  }\r\n\r\n  .provider-activity-row {\r\n    grid-template-columns: 10px minmax(0, 1fr) auto;\r\n  }\r\n\r\n  .provider-activity-row > span:not(.provider-status-dot) {\r\n    grid-column: 2 / -1;\r\n  }\r\n\r\n  .provider-activity-row small {\r\n    display: none;\r\n  }\r\n\r\n  .policy-summary-grid {\r\n    padding: 9px 9px 0;\r\n  }\r\n\r\n  .policy-controls {\r\n    padding: 9px;\r\n  }\r\n\r\n  .policy-control-grid,\r\n  .form-pair-grid,\r\n  .failure-policy-edit-grid,\r\n  .model-route-form {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .policy-control-card {\r\n    padding: 10px;\r\n  }\r\n\r\n  .mini-metric {\r\n    padding: 8px;\r\n  }\r\n\r\n  .mini-metric strong {\r\n    font-size: 13px;\r\n  }\r\n\r\n  .format-route-list,\r\n  .provider-key-list,\r\n  .provider-inline-form,\r\n  .provider-inline-key-form,\r\n  .key-proxy-row,\r\n  .global-proxy-form,\r\n  .provider-create-form,\r\n  .config-summary-grid,\r\n  .config-provider-summary-card,\r\n  .model-route-card {\r\n    grid-template-columns: 1fr;\r\n    gap: 7px;\r\n  }\r\n\r\n  .provider-create-actions,\r\n  .provider-create-format,\r\n  .global-proxy-form .form-note,\r\n  .config-provider-summary-main,\r\n  .config-provider-summary-keys,\r\n  .config-provider-summary-formats,\r\n  .config-provider-summary-card > .badge,\r\n  .config-provider-summary-card > .button {\r\n    grid-column: 1 / -1;\r\n    grid-row: auto;\r\n  }\r\n\r\n  .config-provider-summary-card {\r\n    min-height: 0;\r\n  }\r\n\r\n  .config-provider-summary-card > .badge {\r\n    justify-self: start;\r\n  }\r\n\r\n  .config-provider-summary-card > .button {\r\n    justify-self: start;\r\n  }\r\n\r\n  .model-route-form,\r\n  .model-route-list {\r\n    padding: 9px;\r\n  }\r\n\r\n  .model-route-side {\r\n    justify-items: start;\r\n  }\r\n\r\n  .provider-edit-panel,\r\n  .raw-config-details,\r\n  .overlay-safety,\r\n  .config-summary {\r\n    padding: 9px;\r\n  }\r\n\r\n  .config-path-row {\r\n    grid-template-columns: 1fr;\r\n    gap: 4px;\r\n  }\r\n\r\n  .policy-rule-head {\r\n    grid-template-columns: 28px minmax(0, 1fr);\r\n    gap: 8px;\r\n  }\r\n\r\n  .rule-index {\r\n    width: 26px;\r\n    height: 26px;\r\n    border-radius: 7px;\r\n    font-size: 10px;\r\n  }\r\n\r\n  .kv-grid {\r\n    grid-template-columns: 104px minmax(0, 1fr);\r\n  }\r\n\r\n  .routing-summary-card,\r\n  .attempt {\r\n    padding: 10px;\r\n    border-radius: 8px;\r\n  }\r\n\r\n  .routing-summary-head {\r\n    align-items: flex-start;\r\n  }\r\n\r\n  .routing-summary-grid {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n  }\r\n\r\n  .routing-next-action,\r\n  .attempt-explain div {\r\n    grid-template-columns: 1fr;\r\n    gap: 4px;\r\n  }\r\n\r\n  .attempt-explain {\r\n    padding: 8px;\r\n  }\r\n\r\n  .route-inline {\r\n    min-width: 180px;\r\n    max-width: 280px;\r\n  }\r\n\r\n  .view {\r\n    animation: none;\r\n  }\r\n}\r\n\r\n@media (max-width: 420px) {\r\n  .metric-grid {\r\n    grid-template-columns: 1fr 1fr;\r\n  }\r\n\r\n  .routing-summary-head,\r\n  .attempt-head {\r\n    display: grid;\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .routing-summary-grid {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .kv-grid {\r\n    grid-template-columns: 92px minmax(0, 1fr);\r\n  }\r\n}\r\n\r\n@media (max-width: 340px) {\r\n  .metric-grid {\r\n    grid-template-columns: 1fr;\r\n  }\r\n}\r\n\r\n@media (prefers-reduced-motion: reduce) {\r\n  html {\r\n    scroll-behavior: auto;\r\n  }\r\n\r\n  .view,\r\n  .button,\r\n  .icon-button,\r\n  .drawer,\r\n  .nav-item,\r\n  .animated-line {\r\n    animation: none !important;\r\n    transition: none !important;\r\n  }\r\n}\r\n\r\n/* Usage trend chart refresh. Keep this block late so older telemetry chart skins do not leak through. */\r\n.overview-traffic-panel .panel-head {\r\n  align-items: center;\r\n}\r\n\r\n.overview-traffic-panel .panel-head h2 {\r\n  font-size: 15px;\r\n  font-weight: 780;\r\n}\r\n\r\n.overview-traffic-panel .panel-head .badge.info {\r\n  border: 1px solid #e5e7eb;\r\n  background: #fff;\r\n  color: #6b7280;\r\n  text-transform: none;\r\n}\r\n\r\n.overview-traffic-panel .chart {\r\n  min-height: 500px;\r\n  padding: 18px 24px 24px;\r\n  background: #fff;\r\n}\r\n\r\n.usage-trend-overview {\r\n  display: grid;\r\n  grid-template-columns: minmax(250px, 0.62fr) minmax(0, 1.38fr);\r\n  gap: 16px;\r\n  align-items: stretch;\r\n  margin-bottom: 18px;\r\n}\r\n\r\n.usage-trend-total,\r\n.usage-trend-kpi {\r\n  border: 1px solid #eceff3;\r\n  background: #fff;\r\n}\r\n\r\n.usage-trend-total {\r\n  display: grid;\r\n  align-content: center;\r\n  min-height: 112px;\r\n  padding: 18px 22px;\r\n  border-radius: 12px;\r\n  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.035);\r\n}\r\n\r\n.usage-trend-total span,\r\n.usage-trend-kpi span {\r\n  color: #767b85;\r\n  font-size: 12px;\r\n  font-weight: 720;\r\n}\r\n\r\n.usage-trend-total strong {\r\n  margin-top: 6px;\r\n  color: #09090b;\r\n  font: 820 36px/1.02 var(--mono);\r\n  letter-spacing: -0.01em;\r\n}\r\n\r\n.usage-trend-total small {\r\n  margin-top: 8px;\r\n  color: #8b919b;\r\n  font: 650 12px var(--mono);\r\n}\r\n\r\n.usage-trend-kpis {\r\n  display: grid;\r\n  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));\r\n  gap: 10px;\r\n}\r\n\r\n.usage-trend-kpi {\r\n  display: grid;\r\n  grid-template-columns: auto minmax(0, 1fr);\r\n  grid-template-rows: auto auto;\r\n  gap: 6px 8px;\r\n  align-content: center;\r\n  min-height: 112px;\r\n  padding: 14px;\r\n  border-radius: 12px;\r\n}\r\n\r\n.usage-trend-kpi i {\r\n  grid-row: 1 / span 2;\r\n  width: 10px;\r\n  height: 10px;\r\n  margin-top: 4px;\r\n  border-radius: 999px;\r\n  background: #71717a;\r\n  box-shadow: 0 0 0 4px rgba(113, 113, 122, 0.08);\r\n}\r\n\r\n.usage-trend-kpi strong {\r\n  min-width: 0;\r\n  overflow: visible;\r\n  color: #18181b;\r\n  font: 780 19px/1.1 var(--mono);\r\n  overflow-wrap: anywhere;\r\n  white-space: normal;\r\n}\r\n\r\n.usage-trend-kpi.usage-input i {\r\n  background: #2563eb;\r\n  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);\r\n}\r\n\r\n.usage-trend-kpi.usage-output i,\r\n.usage-trend-kpi.usage-success i {\r\n  background: #10b981;\r\n  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);\r\n}\r\n\r\n.usage-trend-kpi.usage-request i {\r\n  background: #f97316;\r\n  box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12);\r\n}\r\n\r\n.usage-trend-kpi.usage-failure i {\r\n  background: #f43f5e;\r\n  box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.11);\r\n}\r\n\r\n.traffic-chart-shell {\r\n  overflow: visible;\r\n  padding: 18px 18px 12px;\r\n  border: 1px solid #dce3ec;\r\n  border-radius: 14px;\r\n  background: #fff;\r\n  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.045);\r\n}\r\n\r\n.traffic-chart-shell svg {\r\n  display: block;\r\n  width: 100%;\r\n  height: 390px;\r\n}\r\n\r\n.traffic-plot-bg {\r\n  fill: #fff;\r\n}\r\n\r\n.chart .traffic-grid-line,\r\n.chart .traffic-x-tick {\r\n  stroke: #e6eaf0;\r\n  stroke-dasharray: 4 5;\r\n  stroke-width: 1;\r\n}\r\n\r\n.chart .traffic-x-tick {\r\n  opacity: 0.46;\r\n}\r\n\r\n.chart .traffic-baseline {\r\n  stroke: #8f98a6;\r\n  stroke-width: 1.5;\r\n}\r\n\r\n.traffic-axis-label {\r\n  fill: #667085;\r\n  font: 760 12px var(--mono);\r\n  paint-order: stroke;\r\n  stroke: #fff;\r\n  stroke-linejoin: round;\r\n  stroke-width: 3px;\r\n}\r\n\r\n.traffic-axis-title {\r\n  fill: #344054;\r\n  font: 820 12px var(--mono);\r\n  letter-spacing: 0.01em;\r\n}\r\n\r\n.traffic-axis-label-info {\r\n  fill: #8a5a22;\r\n}\r\n\r\n.traffic-token-area {\r\n  fill: url(\"#trafficTokenArea\");\r\n  pointer-events: none;\r\n}\r\n\r\n.traffic-plot-bg {\r\n  fill: transparent;\r\n}\r\n\r\n.traffic-total-line,\r\n.traffic-input-line,\r\n.traffic-output-line {\r\n  fill: none;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-total-line {\r\n  stroke: #a855f7;\r\n  stroke-width: 2.2;\r\n  filter: drop-shadow(0 4px 6px rgba(168, 85, 247, 0.22));\r\n}\r\n\r\n.traffic-input-line {\r\n  stroke: #3b82f6;\r\n  stroke-width: 1.5;\r\n  stroke-dasharray: 6 4;\r\n}\r\n\r\n.traffic-output-line {\r\n  stroke: #10b981;\r\n  stroke-width: 1.5;\r\n  stroke-dasharray: 2 3;\r\n}\r\n\r\n.traffic-bar-success {\r\n  fill: #10b981;\r\n  opacity: 0.85;\r\n  transition: opacity 0.12s ease;\r\n}\r\n\r\n.traffic-bar-success:hover {\r\n  opacity: 1;\r\n}\r\n\r\n.traffic-bar-fail {\r\n  fill: #ef4444;\r\n  opacity: 0.9;\r\n  transition: opacity 0.12s ease;\r\n}\r\n\r\n.traffic-bar-fail:hover {\r\n  opacity: 1;\r\n}\r\n\r\n.traffic-latency-line {\r\n  fill: none;\r\n  stroke: #f59e0b;\r\n  stroke-width: 2.0;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  filter: drop-shadow(0 4px 6px rgba(245, 158, 11, 0.22));\r\n}\r\n\r\n.traffic-latency-region {\r\n  fill: url(\"#trafficLatencyArea\");\r\n  pointer-events: none;\r\n}\r\n\r\n.traffic-latency-dot {\r\n  fill: #f59e0b;\r\n  stroke: #ffffff;\r\n  stroke-width: 2;\r\n}\r\n\r\n.traffic-cost-line {\r\n  fill: none;\r\n  stroke: #f59e0b;\r\n  stroke-width: 2.0;\r\n  stroke-linecap: round;\r\n  stroke-linejoin: round;\r\n  filter: drop-shadow(0 4px 6px rgba(245, 158, 11, 0.22));\r\n}\r\n\r\n.traffic-cost-dot {\r\n  fill: #f59e0b;\r\n  stroke: #ffffff;\r\n  stroke-width: 2;\r\n}\r\n\r\n.traffic-trend-dot {\r\n  stroke: #fff;\r\n  stroke-width: 2.4;\r\n  vector-effect: non-scaling-stroke;\r\n}\r\n\r\n.traffic-total-dot {\r\n  fill: #a855f7;\r\n}\r\n\r\n.traffic-input-dot {\r\n  fill: #3b82f6;\r\n}\r\n\r\n.traffic-output-dot {\r\n  fill: #10b981;\r\n}\r\n\r\n.traffic-chart-header {\r\n  display: flex;\r\n  justify-content: space-between;\r\n  align-items: center;\r\n  padding: 14px 20px;\r\n  border-bottom: 1px solid color-mix(in srgb, var(--line) 40%, transparent);\r\n}\r\n\r\n.traffic-chart-header .traffic-trend-legend {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 16px;\r\n  align-items: center;\r\n  padding: 0;\r\n  margin: 0;\r\n}\r\n\r\n.traffic-mode-selectors {\r\n  display: inline-flex;\r\n  background: #f1f5f9;\r\n  padding: 3px;\r\n  border-radius: 99px;\r\n  border: 1px solid #e2e8f0;\r\n}\r\n\r\n.traffic-mode-selectors .pill-toggle {\r\n  background: transparent;\r\n  border: none;\r\n  outline: none;\r\n  font-size: 11px;\r\n  font-weight: 700;\r\n  color: #64748b;\r\n  padding: 6px 12px;\r\n  border-radius: 99px;\r\n  cursor: pointer;\r\n  transition: all 0.15s ease;\r\n  margin: 0;\r\n  height: auto;\r\n  line-height: 1.2;\r\n}\r\n\r\n.traffic-mode-selectors .pill-toggle:hover {\r\n  color: #1e293b;\r\n}\r\n\r\n.traffic-mode-selectors .pill-toggle.is-active {\r\n  background: #ffffff;\r\n  color: #0f172a;\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);\r\n  font-weight: 800;\r\n}\r\n\r\n.traffic-trend-legend-item {\r\n  display: inline-flex;\r\n  gap: 8px;\r\n  align-items: center;\r\n  color: #475569;\r\n  font-size: 12px;\r\n  font-weight: 600;\r\n}\r\n\r\n.traffic-trend-legend-item i {\r\n  display: inline-block;\r\n  vertical-align: middle;\r\n}\r\n\r\n/* Line series legend indicators (pills/lines) */\r\n.traffic-trend-legend-item.traffic-latency-legend i,\r\n.traffic-trend-legend-item.traffic-total-dot i,\r\n.traffic-trend-legend-item.traffic-input-dot i,\r\n.traffic-trend-legend-item.traffic-output-dot i,\r\n.traffic-trend-legend-item.traffic-cost-legend i {\r\n  width: 18px;\r\n  height: 2px;\r\n  border-radius: 999px;\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-latency-legend i {\r\n  background: #f59e0b;\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-total-dot i {\r\n  background: #a855f7;\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-input-dot i {\r\n  background: repeating-linear-gradient(90deg, #3b82f6 0 6px, transparent 6px 10px);\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-output-dot i {\r\n  background: repeating-linear-gradient(90deg, #10b981 0 3px, transparent 3px 6px);\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-cost-legend i {\r\n  background: #f59e0b;\r\n}\r\n\r\n/* Bar series legend indicators (squares/dots) */\r\n.traffic-trend-legend-item.traffic-bar-success-legend i,\r\n.traffic-trend-legend-item.traffic-bar-fail-legend i {\r\n  width: 11px;\r\n  height: 11px;\r\n  border-radius: 3px;\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-bar-success-legend i {\r\n  background: #10b981;\r\n}\r\n\r\n.traffic-trend-legend-item.traffic-bar-fail-legend i {\r\n  background: #ef4444;\r\n}\r\n\r\n/* Cleaner provider health status dots. */\r\n.provider-status-dot {\r\n  width: 10px;\r\n  height: 10px;\r\n  margin-top: 5px;\r\n  border: 2px solid #fff;\r\n  background: #94a3b8;\r\n  box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);\r\n}\r\n\r\n.provider-status-dot.ok {\r\n  background: #10b981;\r\n  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);\r\n}\r\n\r\n.provider-status-dot.warn {\r\n  background: #f59e0b;\r\n  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);\r\n}\r\n\r\n.provider-status-dot.bad {\r\n  background: #ef4444;\r\n  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);\r\n}\r\n\r\n.request-row-dot {\r\n  border: 2px solid #fff;\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-success .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-success .request-row-dot {\r\n  background: #10b981;\r\n  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-warning .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-warning .request-row-dot {\r\n  background: #f59e0b;\r\n  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);\r\n}\r\n\r\n.recent-failure-list .recent-failure-row.tone-danger .request-row-dot,\r\n#recentFailures .recent-failure-row.tone-danger .request-row-dot {\r\n  background: #ef4444;\r\n  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);\r\n}\r\n\r\n.provider-activity-row .provider-status-dot {\r\n  margin-top: 0;\r\n  flex-shrink: 0;\r\n}\r\n\r\n@media (max-width: 980px) {\r\n  .usage-trend-overview {\r\n    grid-template-columns: 1fr;\r\n  }\r\n\r\n  .usage-trend-kpis {\r\n    grid-template-columns: repeat(3, minmax(0, 1fr));\r\n  }\r\n}\r\n\r\n@media (max-width: 760px) {\r\n  .overview-traffic-panel .chart {\r\n    min-height: 450px;\r\n    padding: 10px;\r\n  }\r\n\r\n  .usage-trend-total {\r\n    min-height: 96px;\r\n    padding: 15px;\r\n  }\r\n\r\n  .usage-trend-total strong {\r\n    font-size: 28px;\r\n  }\r\n\r\n  .usage-trend-kpis {\r\n    grid-template-columns: repeat(2, minmax(0, 1fr));\r\n    gap: 8px;\r\n  }\r\n\r\n  .usage-trend-kpi {\r\n    min-height: 78px;\r\n    padding: 11px;\r\n  }\r\n\r\n  .usage-trend-kpi strong {\r\n    font-size: 15px;\r\n  }\r\n\r\n  .traffic-chart-shell {\r\n    padding: 10px 6px 8px;\r\n    border-radius: 12px;\r\n  }\r\n\r\n  .traffic-chart-shell svg {\r\n    height: 300px;\r\n  }\r\n\r\n  .traffic-axis-label {\r\n    font-size: 10px;\r\n  }\r\n}\r\n\r\n/* Final shell polish: brand plaque and unified provider tools. */\r\n.sidebar .brand {\r\n  position: relative;\r\n  gap: 11px;\r\n  margin: 14px 12px 16px;\r\n  padding: 13px 13px 14px;\r\n  border: 1px solid color-mix(in srgb, var(--line-strong) 72%, var(--line));\r\n  border-radius: 11px;\r\n  background:\r\n    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 74%, #fff) 0%, var(--surface) 100%),\r\n    var(--surface);\r\n  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.055);\r\n}\r\n\r\n.sidebar .brand::after {\r\n  position: absolute;\r\n  right: 12px;\r\n  bottom: -9px;\r\n  left: 12px;\r\n  height: 1px;\r\n  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--line-strong) 80%, transparent), transparent);\r\n  content: \"\";\r\n}\r\n\r\n.sidebar .brand-mark {\r\n  width: 26px;\r\n  height: 26px;\r\n  border-radius: 7px;\r\n  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22) inset, 0 8px 16px rgba(9, 9, 11, 0.12);\r\n}\r\n\r\n.sidebar .brand-title {\r\n  font-size: 13.5px;\r\n  font-weight: 780;\r\n  line-height: 1.15;\r\n}\r\n\r\n.sidebar .brand-subtitle {\r\n  margin-top: 3px;\r\n  color: color-mix(in srgb, var(--muted) 84%, var(--text));\r\n  font-size: 11px;\r\n  line-height: 1.2;\r\n}\r\n\r\n.providers-panel {\r\n  overflow: visible;\r\n}\r\n\r\n.providers-panel .providers-tools {\r\n  border-bottom: 1px solid color-mix(in srgb, var(--line-strong) 64%, var(--line-soft));\r\n  background:\r\n    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 70%, var(--surface)) 0%, var(--surface) 100%),\r\n    var(--surface);\r\n}\r\n\r\n.providers-tools-head {\r\n  display: grid;\r\n  grid-template-columns: minmax(0, 1fr) auto;\r\n  gap: 12px;\r\n  align-items: center;\r\n  padding: 14px 18px 10px;\r\n}\r\n\r\n.providers-tools-head h2 {\r\n  color: var(--text);\r\n  font-size: 15px;\r\n  font-weight: 800;\r\n  letter-spacing: 0;\r\n}\r\n\r\n.providers-tools-head p {\r\n  margin-top: 3px;\r\n  color: var(--muted);\r\n  font-size: 12px;\r\n  line-height: 1.25;\r\n}\r\n\r\n.providers-tools-head .button {\r\n  min-height: 34px;\r\n}\r\n\r\n#providersView .provider-toolbar {\r\n  grid-template-columns: minmax(240px, 1.55fr) minmax(140px, 0.75fr) minmax(140px, 0.75fr) minmax(140px, 0.75fr) auto;\r\n  gap: 9px;\r\n  align-items: end;\r\n  margin: 0;\r\n  padding: 0 18px 16px;\r\n  border: 0;\r\n  border-radius: 0;\r\n  background: transparent;\r\n  box-shadow: none;\r\n}\r\n\r\n#providersView .provider-toolbar .field {\r\n  gap: 6px;\r\n}\r\n\r\n#providersView .provider-toolbar .field > span {\r\n  color: color-mix(in srgb, var(--muted) 88%, var(--text));\r\n  font-size: 10.5px;\r\n  font-weight: 780;\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n#providersView .provider-toolbar .control {\r\n  min-height: 36px;\r\n  border-color: color-mix(in srgb, var(--line-strong) 74%, var(--line));\r\n  background: rgba(255, 255, 255, 0.78);\r\n}\r\n\r\n#providersView .provider-toolbar .control:focus-visible {\r\n  border-color: color-mix(in srgb, var(--info) 56%, var(--line));\r\n  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);\r\n}\r\n\r\n#providersView .provider-toolbar #clearProviderFiltersButton {\r\n  min-height: 36px;\r\n  padding-inline: 13px;\r\n  border-color: color-mix(in srgb, var(--line-strong) 68%, var(--line));\r\n}\r\n\r\n#providersView .provider-table {\r\n  padding-top: 12px;\r\n}\r\n\r\n@media (max-width: 1024px) {\r\n  #providersView .provider-toolbar {\r\n    grid-template-columns: minmax(220px, 1fr) repeat(3, minmax(130px, 0.7fr)) auto;\r\n  }\r\n}\r\n\r\n@media (max-width: 760px) {\r\n  .sidebar .brand {\r\n    margin: 10px;\r\n    padding: 11px 12px;\r\n  }\r\n\r\n  .sidebar .brand::after {\r\n    display: none;\r\n  }\r\n\r\n  .providers-tools-head,\r\n  #providersView .provider-toolbar {\r\n    grid-template-columns: 1fr;\r\n    padding-right: 12px;\r\n    padding-left: 12px;\r\n  }\r\n\r\n  .providers-tools-head .button,\r\n  #providersView .provider-toolbar .button,\r\n  #providersView .provider-toolbar .field,\r\n  #providersView .provider-toolbar .control {\r\n    width: 100%;\r\n  }\r\n}\r\n\r\n/* static models form */\r\n.config-static-models-form {\r\n  display: grid;\r\n  gap: 8px;\r\n  padding: 12px 14px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 8px;\r\n  background: var(--surface);\r\n}\r\n\r\n.config-static-models-form .form-row {\r\n  display: grid;\r\n  gap: 5px;\r\n}\r\n\r\n.config-static-models-form label {\r\n  color: var(--muted);\r\n  font-size: 11px;\r\n  font-weight: 720;\r\n}\r\n\r\n.config-static-models-form input[type=\"text\"] {\r\n  width: 100%;\r\n  min-height: 32px;\r\n  padding: 4px 8px;\r\n  background: var(--bg);\r\n  border: 1px solid var(--line);\r\n  border-radius: 6px;\r\n  color: var(--text);\r\n  font-size: 12px;\r\n  font-family: var(--mono, monospace);\r\n  box-sizing: border-box;\r\n}\r\n\r\n.config-static-models-form input[type=\"text\"]:focus {\r\n  outline: none;\r\n  border-color: var(--accent);\r\n}\r\n\r\n.config-static-models-form small.muted {\r\n  font-size: 11px;\r\n  color: var(--muted);\r\n}\r\n\r\n.request-select-all-banner {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 12px;\r\n  padding: 8px 14px;\r\n  background-color: color-mix(in srgb, var(--accent, #3b82f6) 8%, transparent);\r\n  border-bottom: 1px dashed var(--line-soft);\r\n  font-size: 12px;\r\n  color: var(--text);\r\n  animation: viewIn 0.15s ease-out;\r\n}\r\n\r\n.request-select-all-banner .button.link-action {\r\n  background: none;\r\n  border: none;\r\n  padding: 0;\r\n  color: var(--accent);\r\n  font-weight: 600;\r\n  text-decoration: underline;\r\n  cursor: pointer;\r\n  font-family: inherit;\r\n}\r\n\r\n.request-select-all-banner .button.link-action:hover {\r\n  color: var(--accent-hover, #2563eb);\r\n}\r\n\r\n/* ---- Custom tooltip (Apple-style frosted popover) ---------------------- */\r\n.lp-tip {\r\n  position: fixed;\r\n  top: 0;\r\n  left: 0;\r\n  z-index: 1000;\r\n  max-width: 320px;\r\n  padding: 7px 11px;\r\n  border-radius: 9px;\r\n  background: color-mix(in srgb, #1d1d1f 86%, transparent);\r\n  color: #f5f5f7;\r\n  font: 600 11.5px/1.45 var(--mono);\r\n  letter-spacing: 0.01em;\r\n  box-shadow:\r\n    0 1px 2px rgba(0, 0, 0, 0.18),\r\n    0 8px 24px rgba(0, 0, 0, 0.22);\r\n  backdrop-filter: blur(18px) saturate(1.5);\r\n  -webkit-backdrop-filter: blur(18px) saturate(1.5);\r\n  pointer-events: none;\r\n  opacity: 0;\r\n  /* No transform on the resting state so getBoundingClientRect measures the\r\n     true size during positioning. The entrance transform lives on is-visible\r\n     and animates back to none, which does not affect layout measurement\r\n     because measurement happens before is-visible is added. */\r\n  visibility: hidden;\r\n  transition: opacity 130ms ease, transform 130ms cubic-bezier(0.2, 0.8, 0.2, 1);\r\n}\r\n\r\n.lp-tip.is-below {\r\n  transform-origin: top center;\r\n}\r\n\r\n.lp-tip.is-visible {\r\n  opacity: 1;\r\n  visibility: visible;\r\n  transform: translateY(0) scale(1);\r\n}\r\n\r\n.lp-tip::after {\r\n  content: \"\";\r\n  position: absolute;\r\n  left: 50%;\r\n  bottom: -4px;\r\n  width: 8px;\r\n  height: 8px;\r\n  background: inherit;\r\n  border-radius: 1px;\r\n  transform: translateX(-50%) rotate(45deg);\r\n  box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.12);\r\n}\r\n\r\n.lp-tip.is-below::after {\r\n  bottom: auto;\r\n  top: -4px;\r\n  box-shadow: -1px -1px 2px rgba(0, 0, 0, 0.12);\r\n}\r\n\r\n/* ─── Playground ────────────────────────────────────────── */\r\n\r\n.playground-layout {\r\n  display: grid;\r\n  grid-template-columns: 280px minmax(0, 1fr);\r\n  gap: 0;\r\n  height: calc(100dvh - 58px);\r\n  overflow: hidden;\r\n}\r\n\r\n/* ── Config sidebar ── */\r\n.playground-config {\r\n  display: flex;\r\n  flex-direction: column;\r\n  gap: 0;\r\n  border-right: 1px solid var(--line);\r\n  background: var(--surface);\r\n  overflow-y: auto;\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--line-strong) transparent;\r\n}\r\n\r\n.playground-config::-webkit-scrollbar {\r\n  width: 5px;\r\n}\r\n.playground-config::-webkit-scrollbar-thumb {\r\n  background: var(--line-strong);\r\n  border-radius: 3px;\r\n}\r\n\r\n/* Config section header bar */\r\n.pg-config-section {\r\n  border-bottom: 1px solid var(--line-soft);\r\n}\r\n\r\n.pg-config-section summary {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 6px;\r\n  padding: 10px 16px;\r\n  font-size: 10px;\r\n  font-weight: 760;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.08em;\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n  transition: background 120ms ease, color 120ms ease;\r\n  list-style: none;\r\n  user-select: none;\r\n}\r\n\r\n.pg-config-section summary::-webkit-details-marker {\r\n  display: none;\r\n}\r\n\r\n.pg-config-section summary::before {\r\n  content: \"\";\r\n  display: inline-block;\r\n  width: 6px;\r\n  height: 6px;\r\n  border-right: 1.5px solid var(--line-strong);\r\n  border-bottom: 1.5px solid var(--line-strong);\r\n  transform: rotate(-45deg);\r\n  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);\r\n  flex-shrink: 0;\r\n}\r\n\r\n.pg-config-section[open] summary::before {\r\n  transform: rotate(45deg);\r\n}\r\n\r\n.pg-config-section summary:hover {\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.pg-config-body {\r\n  display: grid;\r\n  gap: 10px;\r\n  padding: 4px 16px 14px;\r\n}\r\n\r\n/* Parameter grid */\r\n.pg-param-grid {\r\n  grid-template-columns: 1fr 1fr;\r\n  gap: 8px 10px;\r\n}\r\n\r\n.pg-param {\r\n  display: grid;\r\n  gap: 3px;\r\n}\r\n\r\n.pg-param span {\r\n  font-size: 10px;\r\n  font-weight: 680;\r\n  color: var(--muted);\r\n  letter-spacing: 0.01em;\r\n}\r\n\r\n.pg-param .control {\r\n  min-height: 32px;\r\n  padding: 0 10px;\r\n  font-size: 12px;\r\n  font-family: var(--mono);\r\n  border-radius: 6px;\r\n  transition: border-color 150ms ease, box-shadow 150ms ease;\r\n}\r\n\r\n.pg-param .control:focus-visible {\r\n  border-color: var(--accent);\r\n  box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.08);\r\n}\r\n\r\n/* Model select */\r\n.pg-config-body .control {\r\n  min-height: 32px;\r\n  font-size: 12px;\r\n  border-radius: 6px;\r\n  transition: border-color 150ms ease, box-shadow 150ms ease;\r\n}\r\n\r\n.pg-config-body .control:focus-visible {\r\n  border-color: var(--accent);\r\n  box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.08);\r\n}\r\n\r\n/* Segmented control */\r\n.pg-segment-row {\r\n  margin-bottom: 2px;\r\n}\r\n\r\n.pg-segment-row .segmented-control {\r\n  display: flex;\r\n  border-radius: 6px;\r\n  overflow: hidden;\r\n  border: 1px solid var(--line);\r\n}\r\n\r\n.pg-segment-row .segmented-button {\r\n  flex: 1;\r\n  min-height: 32px;\r\n  font-size: 11px;\r\n  font-weight: 640;\r\n  border: none;\r\n  border-right: 1px solid var(--line);\r\n  background: var(--surface);\r\n  color: var(--muted);\r\n  cursor: pointer;\r\n  transition: background 120ms ease, color 120ms ease;\r\n}\r\n\r\n.pg-segment-row .segmented-button:last-child {\r\n  border-right: none;\r\n}\r\n\r\n.pg-segment-row .segmented-button:hover {\r\n  background: var(--surface-soft);\r\n  color: var(--text);\r\n}\r\n\r\n.pg-segment-row .segmented-button.is-active {\r\n  background: var(--text);\r\n  color: #fff;\r\n}\r\n\r\n/* Checkbox field */\r\n.pg-config-body .check-field {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  min-height: 28px;\r\n  font-size: 11.5px;\r\n  font-weight: 580;\r\n  color: var(--text);\r\n  cursor: pointer;\r\n}\r\n\r\n.pg-config-body .check-field input[type=\"checkbox\"] {\r\n  width: 14px;\r\n  height: 14px;\r\n  accent-color: var(--text);\r\n  cursor: pointer;\r\n}\r\n\r\n/* System prompt textarea */\r\n.pg-system-prompt {\r\n  min-height: 56px;\r\n  max-height: 140px;\r\n  resize: vertical;\r\n  font-family: var(--sans);\r\n  font-size: 12px;\r\n  line-height: 1.5;\r\n  border-radius: 6px;\r\n  padding: 8px 10px;\r\n  transition: border-color 150ms ease, box-shadow 150ms ease;\r\n}\r\n\r\n.pg-system-prompt:focus-visible {\r\n  border-color: var(--accent);\r\n  box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.08);\r\n}\r\n\r\n/* Footer */\r\n.pg-config-footer {\r\n  padding: 10px 16px 14px;\r\n  margin-top: auto;\r\n  border-top: 1px solid var(--line-soft);\r\n}\r\n\r\n.pg-config-footer .button {\r\n  width: 100%;\r\n  min-height: 32px;\r\n  font-size: 11.5px;\r\n  font-weight: 640;\r\n  border-radius: 6px;\r\n}\r\n\r\n/* ── Main chat area ── */\r\n.playground-main {\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-width: 0;\r\n  min-height: 0;\r\n  background: var(--bg);\r\n}\r\n\r\n.pg-chat-wrap {\r\n  flex: 1;\r\n  display: flex;\r\n  flex-direction: column;\r\n  min-height: 0;\r\n  overflow: hidden;\r\n}\r\n\r\n.pg-chat {\r\n  flex: 1;\r\n  overflow-y: auto;\r\n  padding: 20px 24px;\r\n  min-height: 0;\r\n  scrollbar-width: thin;\r\n  scrollbar-color: var(--line-strong) transparent;\r\n}\r\n\r\n.pg-chat::-webkit-scrollbar {\r\n  width: 6px;\r\n}\r\n.pg-chat::-webkit-scrollbar-thumb {\r\n  background: var(--line-strong);\r\n  border-radius: 3px;\r\n}\r\n\r\n/* Empty state */\r\n.pg-empty {\r\n  display: flex;\r\n  flex-direction: column;\r\n  align-items: center;\r\n  justify-content: center;\r\n  gap: 10px;\r\n  height: 100%;\r\n  min-height: 200px;\r\n  color: var(--muted);\r\n}\r\n\r\n.pg-empty::before {\r\n  content: \"\";\r\n  display: block;\r\n  width: 32px;\r\n  height: 32px;\r\n  border: 1.5px solid var(--line-strong);\r\n  border-radius: 50%;\r\n  position: relative;\r\n}\r\n\r\n.pg-empty-text {\r\n  font-size: 13px;\r\n  font-weight: 580;\r\n}\r\n\r\n/* Message blocks */\r\n.pg-message {\r\n  margin-bottom: 16px;\r\n  max-width: 760px;\r\n  animation: pg-msg-in 300ms cubic-bezier(0.16, 1, 0.3, 1);\r\n}\r\n\r\n@keyframes pg-msg-in {\r\n  from { opacity: 0; transform: translateY(6px); }\r\n  to   { opacity: 1; transform: translateY(0); }\r\n}\r\n\r\n.pg-message:last-child {\r\n  margin-bottom: 8px;\r\n}\r\n\r\n.pg-message-head {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 7px;\r\n  margin-bottom: 5px;\r\n}\r\n\r\n.pg-message-role {\r\n  font-size: 10px;\r\n  font-weight: 760;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.06em;\r\n  color: var(--muted);\r\n  font-family: var(--mono);\r\n}\r\n\r\n.pg-message-content {\r\n  padding: 11px 15px;\r\n  border: 1px solid var(--line);\r\n  border-radius: 10px;\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  font-size: 13px;\r\n  line-height: 1.65;\r\n  white-space: pre-wrap;\r\n  word-break: break-word;\r\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);\r\n  transition: box-shadow 200ms ease;\r\n}\r\n\r\n.pg-message-content:hover {\r\n  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);\r\n}\r\n\r\n.pg-role-assistant .pg-message-content {\r\n  border-color: color-mix(in srgb, var(--success) 20%, var(--line));\r\n  background: var(--success-soft);\r\n}\r\n\r\n.pg-role-assistant .pg-message-role {\r\n  color: var(--success);\r\n}\r\n\r\n.pg-role-user .pg-message-content {\r\n  border-color: color-mix(in srgb, var(--info) 16%, var(--line));\r\n  background: var(--info-soft);\r\n}\r\n\r\n.pg-role-user .pg-message-role {\r\n  color: color-mix(in srgb, var(--info) 80%, var(--text));\r\n}\r\n\r\n.pg-role-system .pg-message-content {\r\n  border-color: color-mix(in srgb, var(--compat) 18%, var(--line));\r\n  background: var(--compat-soft);\r\n}\r\n\r\n.pg-role-system .pg-message-role {\r\n  color: var(--compat);\r\n}\r\n\r\n.pg-message-error {\r\n  padding: 11px 15px;\r\n  border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--line));\r\n  border-radius: 10px;\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n  font-size: 12.5px;\r\n  font-weight: 600;\r\n  line-height: 1.55;\r\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);\r\n}\r\n\r\n.pg-message-meta {\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  gap: 5px;\r\n  margin-top: 6px;\r\n}\r\n\r\n.pg-message-meta .badge {\r\n  font-size: 10px;\r\n  font-weight: 620;\r\n  font-family: var(--mono);\r\n  min-height: 20px;\r\n  padding: 0 7px;\r\n  border-radius: 4px;\r\n  display: inline-flex;\r\n  align-items: center;\r\n}\r\n\r\n/* Streaming cursor */\r\n.pg-stream-cursor {\r\n  display: inline-block;\r\n  width: 7px;\r\n  height: 15px;\r\n  margin-left: 2px;\r\n  vertical-align: text-bottom;\r\n  background: var(--text);\r\n  border-radius: 1px;\r\n  animation: pg-blink 1s steps(2) infinite;\r\n}\r\n\r\n@keyframes pg-blink {\r\n  0%, 50% { opacity: 1; }\r\n  51%, 100% { opacity: 0; }\r\n}\r\n\r\n/* ── Trace strip ── */\r\n.pg-trace-strip {\r\n  flex-shrink: 0;\r\n  display: flex;\r\n  flex-wrap: wrap;\r\n  align-items: center;\r\n  gap: 0;\r\n  padding: 0 24px;\r\n  border-top: 1px solid var(--line-soft);\r\n  background: var(--surface-raised);\r\n  font-size: 11px;\r\n  font-family: var(--mono);\r\n}\r\n\r\n.pg-trace-strip .pg-trace-item {\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 5px;\r\n  padding: 7px 12px 7px 0;\r\n  border-right: 1px solid var(--line-soft);\r\n  margin-right: 10px;\r\n}\r\n\r\n.pg-trace-strip .pg-trace-item:last-child {\r\n  border-right: none;\r\n}\r\n\r\n.pg-trace-strip .pg-trace-k {\r\n  color: var(--muted);\r\n  font-size: 9px;\r\n  text-transform: uppercase;\r\n  letter-spacing: 0.06em;\r\n  font-weight: 720;\r\n}\r\n\r\n.pg-trace-strip .pg-trace-v {\r\n  color: var(--text);\r\n  font-weight: 620;\r\n}\r\n\r\n/* ── Model search combobox ── */\r\n.pg-model-combo {\r\n  position: relative;\r\n}\r\n\r\n.pg-model-combo input {\r\n  width: 100%;\r\n}\r\n\r\n.pg-model-dropdown {\r\n  position: absolute;\r\n  top: calc(100% + 2px);\r\n  left: 0;\r\n  right: 0;\r\n  max-height: 260px;\r\n  overflow-y: auto;\r\n  background: var(--surface-raised, #fff);\r\n  border: 1px solid var(--line-soft, #ddd);\r\n  border-radius: 6px;\r\n  z-index: 100;\r\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);\r\n}\r\n\r\n.pg-model-option {\r\n  padding: 8px 12px;\r\n  font-size: 12px;\r\n  font-family: var(--mono, monospace);\r\n  cursor: pointer;\r\n  border-bottom: 1px solid var(--line-soft, #eee);\r\n  transition: background 0.12s;\r\n}\r\n\r\n.pg-model-option:last-child {\r\n  border-bottom: none;\r\n}\r\n\r\n.pg-model-option:hover {\r\n  background: var(--surface-soft, #f5f5f5);\r\n}\r\n\r\n.pg-model-option.selected {\r\n  background: var(--accent-soft, #e8f0fe);\r\n  font-weight: 600;\r\n}\r\n\r\n.pg-model-empty {\r\n  padding: 12px;\r\n  font-size: 12px;\r\n  color: var(--muted, #999);\r\n  text-align: center;\r\n}\r\n\r\n/* ── Input bar ── */\r\n.pg-input-bar {\r\n  flex-shrink: 0;\r\n  display: flex;\r\n  gap: 10px;\r\n  align-items: flex-end;\r\n  padding: 12px 20px 10px;\r\n  border-top: 1px solid var(--line);\r\n  background: var(--surface);\r\n  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.02);\r\n}\r\n\r\n.pg-input {\r\n  flex: 1;\r\n  min-height: 40px;\r\n  max-height: 140px;\r\n  resize: none;\r\n  font-family: var(--sans);\r\n  font-size: 13px;\r\n  line-height: 1.55;\r\n  padding: 9px 13px;\r\n  border-radius: 8px;\r\n  border: 1px solid var(--line);\r\n  background: var(--surface);\r\n  color: var(--text);\r\n  transition: border-color 150ms ease, box-shadow 150ms ease;\r\n}\r\n\r\n.pg-input::placeholder {\r\n  color: var(--line-strong);\r\n}\r\n\r\n.pg-input:focus-visible {\r\n  border-color: var(--accent);\r\n  box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.08);\r\n}\r\n\r\n.pg-send-btn,\r\n.pg-stop-btn {\r\n  min-height: 40px;\r\n  padding: 0 20px;\r\n  font-size: 12.5px;\r\n  font-weight: 680;\r\n  white-space: nowrap;\r\n  border-radius: 8px;\r\n  transition: background 150ms ease, border-color 150ms ease, transform 100ms ease, box-shadow 150ms ease;\r\n}\r\n\r\n.pg-send-btn {\r\n  border: 1px solid var(--text);\r\n  background: var(--text);\r\n  color: #fff;\r\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);\r\n}\r\n\r\n.pg-send-btn:hover {\r\n  background: var(--accent-strong);\r\n  border-color: var(--accent-strong);\r\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);\r\n}\r\n\r\n.pg-send-btn:active {\r\n  transform: scale(0.97);\r\n}\r\n\r\n.pg-send-btn:disabled {\r\n  opacity: 0.5;\r\n  cursor: not-allowed;\r\n  transform: none;\r\n}\r\n\r\n.pg-stop-btn {\r\n  border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--line));\r\n  background: var(--danger-soft);\r\n  color: var(--danger);\r\n}\r\n\r\n.pg-stop-btn:hover {\r\n  background: color-mix(in srgb, var(--danger) 12%, var(--danger-soft));\r\n  border-color: var(--danger);\r\n}\r\n\r\n.pg-stop-btn:active {\r\n  transform: scale(0.97);\r\n}\r\n\r\n/* ── Status bar ── */\r\n.pg-status-bar {\r\n  flex-shrink: 0;\r\n  display: flex;\r\n  align-items: center;\r\n  gap: 8px;\r\n  padding: 5px 20px 7px;\r\n  font-size: 10px;\r\n  font-weight: 560;\r\n  color: var(--muted);\r\n  background: var(--surface);\r\n  border-top: 1px solid var(--line-soft);\r\n  font-family: var(--mono);\r\n  letter-spacing: 0.02em;\r\n}\r\n\r\n.pg-status-bar::before {\r\n  content: \"\";\r\n  display: inline-block;\r\n  width: 6px;\r\n  height: 6px;\r\n  border-radius: 50%;\r\n  background: var(--line-strong);\r\n  flex-shrink: 0;\r\n}\r\n\r\n/* ── Responsive ── */\r\n@media (max-width: 760px) {\n  .playground-layout {\n    grid-template-columns: 1fr;\n    height: auto;\n  }\n\r\n  .playground-config {\r\n    border-right: none;\r\n    border-bottom: 1px solid var(--line);\r\n    max-height: 40dvh;\r\n  }\r\n\r\n  .playground-main {\r\n    min-height: 50dvh;\r\n  }\r\n\r\n  .pg-chat {\r\n    min-height: 200px;\r\n    padding: 14px 16px;\r\n  }\r\n\r\n  .pg-input-bar {\r\n    padding: 10px 14px 8px;\r\n  }\r\n\r\n  .pg-status-bar {\n    padding: 5px 14px 7px;\n  }\n}\n\n/* ─── Playground polish override ───────────────────────────────────────── */\n\n.playground-view {\n  height: calc(100dvh - 52px);\n  min-height: 560px;\n}\n\n.playground-layout {\n  grid-template-columns: minmax(260px, 310px) minmax(0, 1fr);\n  gap: 14px;\n  height: 100%;\n  min-height: 0;\n  padding: 0;\n  overflow: hidden;\n}\n\n.playground-config,\n.playground-main,\n.pg-compose-panel {\n  border: 1px solid color-mix(in srgb, var(--line-strong) 72%, var(--line));\n  background: #fff;\n  box-shadow: var(--shadow);\n}\n\n.playground-config {\n  min-height: 0;\n  border-radius: 10px;\n  border-right: 1px solid color-mix(in srgb, var(--line-strong) 72%, var(--line));\n  overflow-x: hidden;\n}\n\n.pg-config-head {\n  display: grid;\n  gap: 4px;\n  padding: 16px 16px 14px;\n  border-bottom: 1px solid var(--line-soft);\n  background:\n    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(250, 250, 250, 0.78)),\n    var(--surface);\n}\n\n.pg-config-head h2,\n.pg-workbench-head h2 {\n  font-size: 15px;\n  font-weight: 760;\n  line-height: 1.2;\n}\n\n.pg-config-head p {\n  color: var(--muted);\n  font-size: 12px;\n  line-height: 1.45;\n}\n\n.pg-config-section {\n  border-bottom: 1px solid var(--line-soft);\n  background: transparent;\n}\n\n.pg-config-section summary {\n  min-height: 38px;\n  padding: 10px 16px;\n  color: color-mix(in srgb, var(--muted) 86%, var(--text));\n  font-size: 10.5px;\n  letter-spacing: 0.055em;\n}\n\n.pg-config-section[open] summary {\n  color: var(--text);\n}\n\n.pg-config-body {\n  gap: 11px;\n  padding: 0 16px 16px;\n}\n\n.pg-model-combo {\n  z-index: 20;\n}\n\n.pg-model-combo input,\n.pg-param .control,\n.pg-config-body .control {\n  min-height: 36px;\n  border-color: color-mix(in srgb, var(--line-strong) 70%, var(--line));\n  background: rgba(255, 255, 255, 0.92);\n  color: var(--text);\n}\n\n.pg-model-combo input {\n  padding-inline: 11px;\n  font-family: var(--mono);\n}\n\n.pg-param-grid {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n}\n\n.pg-param span {\n  color: color-mix(in srgb, var(--muted) 90%, var(--text));\n  font-size: 10.5px;\n  font-weight: 740;\n}\n\n.pg-param .control {\n  width: 100%;\n}\n\n.pg-param-wide {\n  grid-column: 1 / -1;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  min-height: 36px;\n  padding: 0 10px;\n  border: 1px solid var(--line);\n  border-radius: 7px;\n  background: #fff;\n}\n\n.pg-param:has(#pgStream) {\n  align-content: end;\n}\n\n.pg-param #pgStream,\n.pg-param #pgIncludeHistory {\n  width: 18px;\n  height: 18px;\n  margin: 8px 0 5px;\n  accent-color: var(--text);\n}\n\n.pg-system-prompt {\n  min-height: 112px;\n  padding: 10px 11px;\n  resize: vertical;\n}\n\n.pg-format-selector {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 4px;\n  padding: 4px;\n  border: 1px solid var(--line);\n  border-radius: 8px;\n  background: var(--surface-soft);\n}\n\n.pg-format-btn {\n  min-width: 0;\n  min-height: 32px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--muted);\n  font: 700 11px/1 var(--sans);\n  cursor: pointer;\n  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 120ms ease;\n}\n\n.pg-format-btn:hover {\n  background: rgba(255, 255, 255, 0.72);\n  color: var(--text);\n}\n\n.pg-format-btn:active {\n  transform: translateY(1px);\n}\n\n.pg-format-btn.is-active {\n  background: var(--surface);\n  color: var(--text);\n  box-shadow: 0 1px 4px rgba(9, 9, 11, 0.08);\n}\n\n.playground-main {\n  min-height: 0;\n  border-radius: 10px;\n  overflow: hidden;\n  background: #fff;\n}\n\n.pg-workbench-head {\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 16px;\n  padding: 14px 18px;\n  border-bottom: 1px solid var(--line-soft);\n  background: rgba(255, 255, 255, 0.78);\n}\n\n.pg-status {\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  min-height: 28px;\n  max-width: 50%;\n  overflow: hidden;\n  padding: 0 10px;\n  border: 1px solid var(--line);\n  border-radius: 999px;\n  background: var(--surface);\n  color: var(--muted);\n  font: 680 11px/1 var(--mono);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.pg-status::before {\n  width: 6px;\n  height: 6px;\n  border-radius: 999px;\n  background: var(--success);\n  content: \"\";\n}\n\n.pg-chat-wrap {\n  min-height: 0;\n  background: #fafafa;\n}\n\n.pg-chat-area {\n  flex: 1;\n  min-height: 0;\n  height: 100%;\n  overflow-y: auto;\n  padding: 26px 28px 30px;\n  scrollbar-width: thin;\n  scrollbar-color: var(--line-strong) transparent;\n}\n\n.pg-chat-area::-webkit-scrollbar {\n  width: 6px;\n}\n\n.pg-chat-area::-webkit-scrollbar-thumb {\n  border-radius: 999px;\n  background: var(--line-strong);\n}\n\n.pg-empty {\n  min-height: 100%;\n  gap: 12px;\n  color: var(--muted);\n}\n\n.pg-empty::before {\n  width: 38px;\n  height: 38px;\n  border: 1px solid color-mix(in srgb, var(--line-strong) 78%, var(--line));\n  background:\n    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(244, 244, 245, 0.74));\n  box-shadow: inset 0 0 0 8px rgba(255, 255, 255, 0.45);\n}\n\n.pg-empty-text {\n  color: color-mix(in srgb, var(--muted) 88%, var(--text));\n  font-size: 13px;\n  font-weight: 660;\n}\n\n.pg-message {\n  max-width: min(780px, 92%);\n  margin-bottom: 18px;\n  animation: none;\n}\n\n.pg-role-assistant,\n.pg-role-system {\n  width: min(780px, 92%);\n}\n\n.pg-role-user {\n  width: fit-content;\n  max-width: min(520px, 74%);\n  margin-left: auto;\n}\n\n.pg-role-user .pg-message-head {\n  justify-content: flex-end;\n}\n\n.pg-message-role {\n  color: var(--muted);\n  font-size: 10px;\n  letter-spacing: 0.05em;\n}\n\n.pg-message-content,\n.pg-message-error {\n  border-radius: 8px;\n  font-size: 13px;\n  line-height: 1.68;\n  box-shadow: none;\n}\n\n.pg-message-content {\n  border-color: var(--line);\n  background: #fff;\n}\n\n.pg-role-user .pg-message-content {\n  border-color: color-mix(in srgb, var(--text) 16%, var(--line));\n  background: #f5f5f6;\n  color: var(--text);\n  padding: 10px 13px;\n}\n\n.pg-role-user .pg-message-role {\n  color: var(--text);\n}\n\n.pg-role-assistant .pg-message-content {\n  border-color: color-mix(in srgb, var(--success) 14%, var(--line));\n  background: #fff;\n}\n\n.pg-thinking {\n  margin: 0 0 8px;\n  border: 1px solid color-mix(in srgb, var(--compat) 18%, var(--line));\n  border-radius: 8px;\n  background: color-mix(in srgb, var(--compat-soft) 58%, #fff);\n  color: var(--text);\n  overflow: hidden;\n}\n\n.pg-thinking summary {\n  min-height: 32px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 0 11px;\n  color: color-mix(in srgb, var(--compat) 72%, var(--text));\n  cursor: pointer;\n  font: 700 11px/1 var(--mono);\n  list-style: none;\n}\n\n.pg-thinking summary::-webkit-details-marker {\n  display: none;\n}\n\n.pg-thinking summary::before {\n  width: 6px;\n  height: 6px;\n  border-radius: 999px;\n  background: currentColor;\n  opacity: 0.55;\n  content: \"\";\n}\n\n.pg-thinking-text {\n  max-height: 220px;\n  margin: 0;\n  padding: 10px 12px 12px;\n  overflow: auto;\n  border-top: 1px solid color-mix(in srgb, var(--compat) 12%, var(--line));\n  color: color-mix(in srgb, var(--muted) 82%, var(--text));\n  font: 12px/1.6 var(--mono);\n  white-space: pre-wrap;\n  word-break: break-word;\n}\n\n.pg-message-content:hover {\n  box-shadow: none;\n}\n\n.pg-stream-cursor {\n  display: inline-block;\n  width: 2px;\n  height: 1em;\n  margin-left: 3px;\n  vertical-align: -0.12em;\n  background: color-mix(in srgb, var(--text) 58%, transparent);\n  border-radius: 1px;\n  animation: none;\n}\n\n.pg-message-meta {\n  gap: 6px;\n  margin-top: 8px;\n}\n\n.pg-message-meta .badge {\n  min-height: 22px;\n  border-color: transparent;\n  border-radius: 6px;\n  background: rgba(255, 255, 255, 0.78);\n  color: var(--muted);\n}\n\n.pg-compose-panel {\n  flex-shrink: 0;\n  border-width: 1px 0 0;\n  border-radius: 0;\n  background: rgba(255, 255, 255, 0.9);\n  box-shadow: 0 -10px 24px rgba(9, 9, 11, 0.045);\n}\n\n.pg-trace-strip {\n  min-height: 0;\n  padding: 8px 18px 0;\n  border-top: 0;\n  background: transparent;\n}\n\n.pg-trace-strip[hidden] {\n  display: none !important;\n}\n\n.pg-trace-strip .pg-trace-item {\n  margin: 0 6px 8px 0;\n  padding: 5px 8px;\n  border: 1px solid var(--line);\n  border-radius: 7px;\n  background: var(--surface);\n}\n\n.pg-input-bar {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  gap: 12px;\n  align-items: end;\n  padding: 12px 18px 16px;\n  border-top: 0;\n  background: transparent;\n  box-shadow: none;\n}\n\n.pg-input {\n  min-height: 48px;\n  max-height: 150px;\n  padding: 12px 13px;\n  border-color: color-mix(in srgb, var(--line-strong) 72%, var(--line));\n  border-radius: 9px;\n  background: #fff;\n}\n\n.pg-input::placeholder {\n  color: color-mix(in srgb, var(--muted) 55%, var(--line-strong));\n}\n\n.pg-input-actions {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.pg-btn {\n  min-height: 40px;\n  border-radius: 8px;\n}\n\n.pg-send-btn,\n.pg-stop-btn {\n  min-height: 40px;\n}\n\n.pg-model-dropdown {\n  top: calc(100% + 6px);\n  border-color: var(--line);\n  border-radius: 8px;\n  box-shadow: 0 16px 34px rgba(9, 9, 11, 0.14);\n}\n\n.pg-model-option {\n  padding: 9px 11px;\n}\n\n.playground-view {\n  --pg-scroll-thumb: color-mix(in srgb, var(--muted) 14%, transparent);\n  --pg-scroll-thumb-hover: color-mix(in srgb, var(--muted) 28%, transparent);\n  --pg-scroll-track: transparent;\n}\n\n.playground-config,\n.pg-chat-area,\n.pg-model-dropdown,\n.pg-thinking-text {\n  scrollbar-width: thin;\n  scrollbar-color: var(--pg-scroll-thumb) var(--pg-scroll-track);\n}\n\n.playground-config::-webkit-scrollbar,\n.pg-chat-area::-webkit-scrollbar,\n.pg-model-dropdown::-webkit-scrollbar,\n.pg-thinking-text::-webkit-scrollbar {\n  width: 3px;\n  height: 3px;\n}\n\n.playground-config::-webkit-scrollbar-track,\n.pg-chat-area::-webkit-scrollbar-track,\n.pg-model-dropdown::-webkit-scrollbar-track,\n.pg-thinking-text::-webkit-scrollbar-track {\n  background: var(--pg-scroll-track);\n}\n\n.playground-config::-webkit-scrollbar-thumb,\n.pg-chat-area::-webkit-scrollbar-thumb,\n.pg-model-dropdown::-webkit-scrollbar-thumb,\n.pg-thinking-text::-webkit-scrollbar-thumb {\n  border-radius: 999px;\n  background: var(--pg-scroll-thumb);\n}\n\n.playground-config::-webkit-scrollbar-thumb:hover,\n.pg-chat-area::-webkit-scrollbar-thumb:hover,\n.pg-model-dropdown::-webkit-scrollbar-thumb:hover,\n.pg-thinking-text::-webkit-scrollbar-thumb:hover {\n  background: var(--pg-scroll-thumb-hover);\n}\n\n.playground-config::-webkit-scrollbar-corner,\n.pg-chat-area::-webkit-scrollbar-corner,\n.pg-model-dropdown::-webkit-scrollbar-corner,\n.pg-thinking-text::-webkit-scrollbar-corner {\n  background: transparent;\n}\n\n@media (max-width: 980px) {\n  .playground-view {\n    height: auto;\n    min-height: 0;\n  }\n\n  .playground-layout {\n    grid-template-columns: 1fr;\n    overflow: visible;\n  }\n\n  .playground-config {\n    max-height: none;\n  }\n\n  .playground-main {\n    min-height: 620px;\n  }\n}\n\n@media (max-width: 760px) {\n  .playground-layout {\n    gap: 10px;\n  }\n\n  .pg-config-head,\n  .pg-workbench-head {\n    padding: 13px 14px;\n  }\n\n  .pg-param-grid {\n    grid-template-columns: 1fr 1fr;\n  }\n\n  .pg-format-selector {\n    grid-template-columns: 1fr;\n  }\n\n  .pg-status {\n    max-width: 44vw;\n  }\n\n  .pg-chat-area {\n    padding: 18px 14px 20px;\n  }\n\n  .pg-message {\n    max-width: 100%;\n  }\n\n  .pg-input-bar {\n    grid-template-columns: 1fr;\n    padding: 10px 12px 12px;\n  }\n\n  .pg-input-actions {\n    justify-content: flex-end;\n  }\n}\n\r\n/*$vite$:1*/";
	document.head.appendChild(__vite_style__);
	//#region \0rolldown/runtime.js
	var __esmMin = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
	var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
	//#endregion
	//#region node_modules/morphdom/dist/morphdom-esm.js
	function morphAttrs(fromNode, toNode) {
		var toNodeAttrs = toNode.attributes;
		var attr;
		var attrName;
		var attrNamespaceURI;
		var attrValue;
		var fromValue;
		if (toNode.nodeType === DOCUMENT_FRAGMENT_NODE || fromNode.nodeType === DOCUMENT_FRAGMENT_NODE) return;
		for (var i = toNodeAttrs.length - 1; i >= 0; i--) {
			attr = toNodeAttrs[i];
			attrName = attr.name;
			attrNamespaceURI = attr.namespaceURI;
			attrValue = attr.value;
			if (attrNamespaceURI) {
				attrName = attr.localName || attrName;
				fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);
				if (fromValue !== attrValue) {
					if (attr.prefix === "xmlns") attrName = attr.name;
					fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
				}
			} else {
				fromValue = fromNode.getAttribute(attrName);
				if (fromValue !== attrValue) fromNode.setAttribute(attrName, attrValue);
			}
		}
		var fromNodeAttrs = fromNode.attributes;
		for (var d = fromNodeAttrs.length - 1; d >= 0; d--) {
			attr = fromNodeAttrs[d];
			attrName = attr.name;
			attrNamespaceURI = attr.namespaceURI;
			if (attrNamespaceURI) {
				attrName = attr.localName || attrName;
				if (!toNode.hasAttributeNS(attrNamespaceURI, attrName)) fromNode.removeAttributeNS(attrNamespaceURI, attrName);
			} else if (!toNode.hasAttribute(attrName)) fromNode.removeAttribute(attrName);
		}
	}
	function createFragmentFromTemplate(str) {
		var template = doc.createElement("template");
		template.innerHTML = str;
		return template.content.childNodes[0];
	}
	function createFragmentFromRange(str) {
		if (!range) {
			range = doc.createRange();
			range.selectNode(doc.body);
		}
		return range.createContextualFragment(str).childNodes[0];
	}
	function createFragmentFromWrap(str) {
		var fragment = doc.createElement("body");
		fragment.innerHTML = str;
		return fragment.childNodes[0];
	}
	/**
	* This is about the same
	* var html = new DOMParser().parseFromString(str, 'text/html');
	* return html.body.firstChild;
	*
	* @method toElement
	* @param {String} str
	*/
	function toElement(str) {
		str = str.trim();
		if (HAS_TEMPLATE_SUPPORT) return createFragmentFromTemplate(str);
		else if (HAS_RANGE_SUPPORT) return createFragmentFromRange(str);
		return createFragmentFromWrap(str);
	}
	/**
	* Returns true if two node's names are the same.
	*
	* NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
	*       nodeName and different namespace URIs.
	*
	* @param {Element} a
	* @param {Element} b The target element
	* @return {boolean}
	*/
	function compareNodeNames(fromEl, toEl) {
		var fromNodeName = fromEl.nodeName;
		var toNodeName = toEl.nodeName;
		var fromCodeStart, toCodeStart;
		if (fromNodeName === toNodeName) return true;
		fromCodeStart = fromNodeName.charCodeAt(0);
		toCodeStart = toNodeName.charCodeAt(0);
		if (fromCodeStart <= 90 && toCodeStart >= 97) return fromNodeName === toNodeName.toUpperCase();
		else if (toCodeStart <= 90 && fromCodeStart >= 97) return toNodeName === fromNodeName.toUpperCase();
		else return false;
	}
	/**
	* Create an element, optionally with a known namespace URI.
	*
	* @param {string} name the element name, e.g. 'div' or 'svg'
	* @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
	* its `xmlns` attribute or its inferred namespace.
	*
	* @return {Element}
	*/
	function createElementNS(name, namespaceURI) {
		return !namespaceURI || namespaceURI === NS_XHTML ? doc.createElement(name) : doc.createElementNS(namespaceURI, name);
	}
	/**
	* Copies the children of one DOM element to another DOM element
	*/
	function moveChildren(fromEl, toEl) {
		var curChild = fromEl.firstChild;
		while (curChild) {
			var nextChild = curChild.nextSibling;
			toEl.appendChild(curChild);
			curChild = nextChild;
		}
		return toEl;
	}
	function syncBooleanAttrProp(fromEl, toEl, name) {
		if (fromEl[name] !== toEl[name]) {
			fromEl[name] = toEl[name];
			if (fromEl[name]) fromEl.setAttribute(name, "");
			else fromEl.removeAttribute(name);
		}
	}
	function noop() {}
	function defaultGetNodeKey(node) {
		if (node) return node.getAttribute && node.getAttribute("id") || node.id;
	}
	function morphdomFactory(morphAttrs) {
		return function morphdom(fromNode, toNode, options) {
			if (!options) options = {};
			if (typeof toNode === "string") if (fromNode.nodeName === "#document" || fromNode.nodeName === "HTML") {
				var toNodeHtml = toNode;
				toNode = doc.createElement("html");
				toNode.innerHTML = toNodeHtml;
			} else if (fromNode.nodeName === "BODY") {
				var toNodeBody = toNode;
				toNode = doc.createElement("html");
				toNode.innerHTML = toNodeBody;
				var bodyElement = toNode.querySelector("body");
				if (bodyElement) toNode = bodyElement;
			} else toNode = toElement(toNode);
			else if (toNode.nodeType === DOCUMENT_FRAGMENT_NODE$1) toNode = toNode.firstElementChild;
			var getNodeKey = options.getNodeKey || defaultGetNodeKey;
			var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
			var onNodeAdded = options.onNodeAdded || noop;
			var onBeforeElUpdated = options.onBeforeElUpdated || noop;
			var onElUpdated = options.onElUpdated || noop;
			var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
			var onNodeDiscarded = options.onNodeDiscarded || noop;
			var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
			var skipFromChildren = options.skipFromChildren || noop;
			var addChild = options.addChild || function(parent, child) {
				return parent.appendChild(child);
			};
			var childrenOnly = options.childrenOnly === true;
			var fromNodesLookup = Object.create(null);
			var keyedRemovalList = [];
			function addKeyedRemoval(key) {
				keyedRemovalList.push(key);
			}
			function walkDiscardedChildNodes(node, skipKeyedNodes) {
				if (node.nodeType === ELEMENT_NODE) {
					var curChild = node.firstChild;
					while (curChild) {
						var key = void 0;
						if (skipKeyedNodes && (key = getNodeKey(curChild))) addKeyedRemoval(key);
						else {
							onNodeDiscarded(curChild);
							if (curChild.firstChild) walkDiscardedChildNodes(curChild, skipKeyedNodes);
						}
						curChild = curChild.nextSibling;
					}
				}
			}
			/**
			* Removes a DOM node out of the original DOM
			*
			* @param  {Node} node The node to remove
			* @param  {Node} parentNode The nodes parent
			* @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
			* @return {undefined}
			*/
			function removeNode(node, parentNode, skipKeyedNodes) {
				if (onBeforeNodeDiscarded(node) === false) return;
				if (parentNode) parentNode.removeChild(node);
				onNodeDiscarded(node);
				walkDiscardedChildNodes(node, skipKeyedNodes);
			}
			function indexTree(node) {
				if (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE$1) {
					var curChild = node.firstChild;
					while (curChild) {
						var key = getNodeKey(curChild);
						if (key) fromNodesLookup[key] = curChild;
						indexTree(curChild);
						curChild = curChild.nextSibling;
					}
				}
			}
			indexTree(fromNode);
			function handleNodeAdded(el) {
				onNodeAdded(el);
				var curChild = el.firstChild;
				while (curChild) {
					var nextSibling = curChild.nextSibling;
					var key = getNodeKey(curChild);
					if (key) {
						var unmatchedFromEl = fromNodesLookup[key];
						if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
							curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
							morphEl(unmatchedFromEl, curChild);
						} else handleNodeAdded(curChild);
					} else handleNodeAdded(curChild);
					curChild = nextSibling;
				}
			}
			function cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey) {
				while (curFromNodeChild) {
					var fromNextSibling = curFromNodeChild.nextSibling;
					if (curFromNodeKey = getNodeKey(curFromNodeChild)) addKeyedRemoval(curFromNodeKey);
					else removeNode(curFromNodeChild, fromEl, true);
					curFromNodeChild = fromNextSibling;
				}
			}
			function morphEl(fromEl, toEl, childrenOnly) {
				var toElKey = getNodeKey(toEl);
				if (toElKey) delete fromNodesLookup[toElKey];
				if (!childrenOnly) {
					var beforeUpdateResult = onBeforeElUpdated(fromEl, toEl);
					if (beforeUpdateResult === false) return;
					else if (beforeUpdateResult instanceof HTMLElement) {
						fromEl = beforeUpdateResult;
						indexTree(fromEl);
					}
					morphAttrs(fromEl, toEl);
					onElUpdated(fromEl);
					if (onBeforeElChildrenUpdated(fromEl, toEl) === false) return;
				}
				if (fromEl.nodeName !== "TEXTAREA") morphChildren(fromEl, toEl);
				else specialElHandlers.TEXTAREA(fromEl, toEl);
			}
			function morphChildren(fromEl, toEl) {
				var skipFrom = skipFromChildren(fromEl, toEl);
				var curToNodeChild = toEl.firstChild;
				var curFromNodeChild = fromEl.firstChild;
				var curToNodeKey;
				var curFromNodeKey;
				var fromNextSibling;
				var toNextSibling;
				var matchingFromEl;
				outer: while (curToNodeChild) {
					toNextSibling = curToNodeChild.nextSibling;
					curToNodeKey = getNodeKey(curToNodeChild);
					while (!skipFrom && curFromNodeChild) {
						fromNextSibling = curFromNodeChild.nextSibling;
						if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
							curToNodeChild = toNextSibling;
							curFromNodeChild = fromNextSibling;
							continue outer;
						}
						curFromNodeKey = getNodeKey(curFromNodeChild);
						var curFromNodeType = curFromNodeChild.nodeType;
						var isCompatible = void 0;
						if (curFromNodeType === curToNodeChild.nodeType) {
							if (curFromNodeType === ELEMENT_NODE) {
								if (curToNodeKey) {
									if (curToNodeKey !== curFromNodeKey) if (matchingFromEl = fromNodesLookup[curToNodeKey]) if (fromNextSibling === matchingFromEl) isCompatible = false;
									else {
										fromEl.insertBefore(matchingFromEl, curFromNodeChild);
										if (curFromNodeKey) addKeyedRemoval(curFromNodeKey);
										else removeNode(curFromNodeChild, fromEl, true);
										curFromNodeChild = matchingFromEl;
										curFromNodeKey = getNodeKey(curFromNodeChild);
									}
									else isCompatible = false;
								} else if (curFromNodeKey) isCompatible = false;
								isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);
								if (isCompatible) morphEl(curFromNodeChild, curToNodeChild);
							} else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
								isCompatible = true;
								if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
							}
						}
						if (isCompatible) {
							curToNodeChild = toNextSibling;
							curFromNodeChild = fromNextSibling;
							continue outer;
						}
						if (curFromNodeKey) addKeyedRemoval(curFromNodeKey);
						else removeNode(curFromNodeChild, fromEl, true);
						curFromNodeChild = fromNextSibling;
					}
					if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
						if (!skipFrom) addChild(fromEl, matchingFromEl);
						morphEl(matchingFromEl, curToNodeChild);
					} else {
						var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);
						if (onBeforeNodeAddedResult !== false) {
							if (onBeforeNodeAddedResult) curToNodeChild = onBeforeNodeAddedResult;
							if (curToNodeChild.actualize) curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
							addChild(fromEl, curToNodeChild);
							handleNodeAdded(curToNodeChild);
						}
					}
					curToNodeChild = toNextSibling;
					curFromNodeChild = fromNextSibling;
				}
				cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey);
				var specialElHandler = specialElHandlers[fromEl.nodeName];
				if (specialElHandler) specialElHandler(fromEl, toEl);
			}
			var morphedNode = fromNode;
			var morphedNodeType = morphedNode.nodeType;
			var toNodeType = toNode.nodeType;
			if (!childrenOnly) {
				if (morphedNodeType === ELEMENT_NODE) if (toNodeType === ELEMENT_NODE) {
					if (!compareNodeNames(fromNode, toNode)) {
						onNodeDiscarded(fromNode);
						morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
					}
				} else morphedNode = toNode;
				else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) if (toNodeType === morphedNodeType) {
					if (morphedNode.nodeValue !== toNode.nodeValue) morphedNode.nodeValue = toNode.nodeValue;
					return morphedNode;
				} else morphedNode = toNode;
			}
			if (morphedNode === toNode) onNodeDiscarded(fromNode);
			else {
				if (toNode.isSameNode && toNode.isSameNode(morphedNode)) return;
				morphEl(morphedNode, toNode, childrenOnly);
				if (keyedRemovalList) for (var i = 0, len = keyedRemovalList.length; i < len; i++) {
					var elToRemove = fromNodesLookup[keyedRemovalList[i]];
					if (elToRemove) removeNode(elToRemove, elToRemove.parentNode, false);
				}
			}
			if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
				if (morphedNode.actualize) morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
				fromNode.parentNode.replaceChild(morphedNode, fromNode);
			}
			return morphedNode;
		};
	}
	var DOCUMENT_FRAGMENT_NODE, range, NS_XHTML, doc, HAS_TEMPLATE_SUPPORT, HAS_RANGE_SUPPORT, specialElHandlers, ELEMENT_NODE, DOCUMENT_FRAGMENT_NODE$1, TEXT_NODE, COMMENT_NODE, morphdom;
	var init_morphdom_esm = __esmMin((() => {
		DOCUMENT_FRAGMENT_NODE = 11;
		NS_XHTML = "http://www.w3.org/1999/xhtml";
		doc = typeof document === "undefined" ? void 0 : document;
		HAS_TEMPLATE_SUPPORT = !!doc && "content" in doc.createElement("template");
		HAS_RANGE_SUPPORT = !!doc && doc.createRange && "createContextualFragment" in doc.createRange();
		specialElHandlers = {
			OPTION: function(fromEl, toEl) {
				var parentNode = fromEl.parentNode;
				if (parentNode) {
					var parentName = parentNode.nodeName.toUpperCase();
					if (parentName === "OPTGROUP") {
						parentNode = parentNode.parentNode;
						parentName = parentNode && parentNode.nodeName.toUpperCase();
					}
					if (parentName === "SELECT" && !parentNode.hasAttribute("multiple")) {
						if (fromEl.hasAttribute("selected") && !toEl.selected) {
							fromEl.setAttribute("selected", "selected");
							fromEl.removeAttribute("selected");
						}
						parentNode.selectedIndex = -1;
					}
				}
				syncBooleanAttrProp(fromEl, toEl, "selected");
			},
			/**
			* The "value" attribute is special for the <input> element since it sets
			* the initial value. Changing the "value" attribute without changing the
			* "value" property will have no effect since it is only used to the set the
			* initial value.  Similar for the "checked" attribute, and "disabled".
			*/
			INPUT: function(fromEl, toEl) {
				syncBooleanAttrProp(fromEl, toEl, "checked");
				syncBooleanAttrProp(fromEl, toEl, "disabled");
				if (fromEl.value !== toEl.value) fromEl.value = toEl.value;
				if (!toEl.hasAttribute("value")) fromEl.removeAttribute("value");
			},
			TEXTAREA: function(fromEl, toEl) {
				var newValue = toEl.value;
				if (fromEl.value !== newValue) fromEl.value = newValue;
				var firstChild = fromEl.firstChild;
				if (firstChild) {
					var oldValue = firstChild.nodeValue;
					if (oldValue == newValue || !newValue && oldValue == fromEl.placeholder) return;
					firstChild.nodeValue = newValue;
				}
			},
			SELECT: function(fromEl, toEl) {
				if (!toEl.hasAttribute("multiple")) {
					var selectedIndex = -1;
					var i = 0;
					var curChild = fromEl.firstChild;
					var optgroup;
					var nodeName;
					while (curChild) {
						nodeName = curChild.nodeName && curChild.nodeName.toUpperCase();
						if (nodeName === "OPTGROUP") {
							optgroup = curChild;
							curChild = optgroup.firstChild;
							if (!curChild) {
								curChild = optgroup.nextSibling;
								optgroup = null;
							}
						} else {
							if (nodeName === "OPTION") {
								if (curChild.hasAttribute("selected")) {
									selectedIndex = i;
									break;
								}
								i++;
							}
							curChild = curChild.nextSibling;
							if (!curChild && optgroup) {
								curChild = optgroup.nextSibling;
								optgroup = null;
							}
						}
					}
					fromEl.selectedIndex = selectedIndex;
				}
			}
		};
		ELEMENT_NODE = 1;
		DOCUMENT_FRAGMENT_NODE$1 = 11;
		TEXT_NODE = 3;
		COMMENT_NODE = 8;
		morphdom = morphdomFactory(morphAttrs);
	}));
	//#endregion
	//#region src/state.js
	var state;
	var init_state = __esmMin((() => {
		state = {
			adminKey: "",
			paused: false,
			refreshMs: 5e3,
			timer: null,
			view: "overview",
			timeRange: "30m",
			requestsPage: 0,
			requestFilters: { status: "" },
			selectedRequestIds: /* @__PURE__ */ new Set(),
			allMatchingSelected: false,
			trafficChartMode: "requests",
			providersPage: 0,
			configProvidersPage: 0,
			modelRoutesPage: 0,
			providerModelMapPage: 0,
			auditPage: 0,
			forceConfigRender: false,
			forceModelRoutesRender: false,
			forcePolicyRender: false,
			forceFailurePoliciesRender: false,
			forceProvidersRender: false,
			forceModelCapsRender: false,
			forceTimeseriesFetch: false,
			forceRequestsFetch: false,
			openProviderDetails: /* @__PURE__ */ new Set(),
			openProviderEditors: /* @__PURE__ */ new Set(),
			providerDrawerName: "",
			providerDrawerTab: "overview",
			detailDrawerReturn: null,
			providerFilters: {
				search: "",
				format: "",
				status: "",
				keys: ""
			},
			providerModelFilters: {
				search: "",
				status: ""
			},
			providerModelDrafts: {},
			confirmResolve: null,
			confirmLastFocus: null,
			keyProbes: {},
			keyProbeInFlight: {},
			data: {
				metrics: null,
				metricsFull: null,
				status: null,
				routing: null,
				config: null,
				timeseries: null,
				requests: null,
				overlay: null,
				providerActivity: null,
				version: 0
			}
		};
	}));
	//#endregion
	//#region src/constants.js
	var timeRanges, views;
	var init_constants = __esmMin((() => {
		timeRanges = {
			"30m": {
				label: "Last 30 minutes",
				bucket_s: 60,
				buckets: 30
			},
			"2h": {
				label: "Last 2 hours",
				bucket_s: 120,
				buckets: 60
			},
			"24h": {
				label: "Last 24 hours",
				bucket_s: 900,
				buckets: 96
			},
			"7d": {
				label: "Last 7 days",
				bucket_s: 3600,
				buckets: 168
			}
		};
		views = {
			overview: {
				title: "Overview",
				subtitle: "Live runtime health and request flow."
			},
			requests: {
				title: "Requests",
				subtitle: "request failure details."
			},
			providers: {
				title: "Providers",
				subtitle: "Runtime provider and key state."
			},
			policy: {
				title: "Routing Policy",
				subtitle: "switching rules."
			},
			config: {
				title: "Config",
				subtitle: "configuration and safe edits"
			},
			playground: {
				title: "Playground",
				subtitle: "Test models with live routing feedback."
			}
		};
	}));
	//#endregion
	//#region src/api.js
	function adminQuery() {
		return state.adminKey ? `admin_key=${encodeURIComponent(state.adminKey)}` : "";
	}
	function withAdmin(path) {
		const q = adminQuery();
		if (!q) return path;
		return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
	}
	async function apiGet(path) {
		const resp = await fetch(withAdmin(path), { headers: state.adminKey ? { "X-Admin-Key": state.adminKey } : {} });
		const data = await readJson(resp);
		if (!resp.ok) throw new Error(errorMessage(data, resp.status));
		return data;
	}
	async function apiPost(path, body) {
		const resp = await fetch(withAdmin(path), {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...state.adminKey ? { "X-Admin-Key": state.adminKey } : {}
			},
			body: JSON.stringify(body || {})
		});
		const data = await readJson(resp);
		if (!resp.ok) throw new Error(errorMessage(data, resp.status));
		return data;
	}
	async function apiPatch(path, body) {
		const resp = await fetch(withAdmin(path), {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				...state.adminKey ? { "X-Admin-Key": state.adminKey } : {}
			},
			body: JSON.stringify(body || {})
		});
		const data = await readJson(resp);
		if (!resp.ok) throw new Error(errorMessage(data, resp.status));
		return data;
	}
	async function readJson(resp) {
		try {
			return await resp.json();
		} catch (_err) {
			return {};
		}
	}
	function errorMessage(data, status) {
		return data?.error?.message || `HTTP ${status}`;
	}
	var init_api = __esmMin((() => {
		init_state();
	}));
	(/* @__PURE__ */ __commonJSMin((() => {
		init_morphdom_esm();
		init_state();
		init_constants();
		init_api();
		var el = (id) => document.getElementById(id);
		var qsa = (selector) => Array.from(document.querySelectorAll(selector));
		window.__perf = {
			enabled: false,
			records: []
		};
		try {
			window.__perf.enabled = localStorage.getItem("perfTrace") === "1";
		} catch (_e) {}
		window.__perfMark = function(name, dtMs) {
			if (!window.__perf.enabled) return;
			window.__perf.records.push({
				fn: name,
				dt: Math.round(dtMs * 100) / 100
			});
			if (window.__perf.records.length >= 40) {
				const batch = window.__perf.records.splice(0, window.__perf.records.length);
				const byName = {};
				for (const r of batch) {
					if (!byName[r.fn]) byName[r.fn] = {
						calls: 0,
						total: 0,
						max: 0
					};
					byName[r.fn].calls++;
					byName[r.fn].total += r.dt;
					byName[r.fn].max = Math.max(byName[r.fn].max, r.dt);
				}
				const rows = Object.entries(byName).map(([fn, s]) => ({
					fn,
					calls: s.calls,
					total_ms: Math.round(s.total),
					avg_ms: Math.round(s.total / s.calls * 100) / 100,
					max_ms: Math.round(s.max * 100) / 100
				})).sort((a, b) => b.total_ms - a.total_ms);
				console.table(rows);
			}
		};
		var _lastPricingKey = "";
		var _refreshInFlight = false;
		var _refreshWanted = false;
		var _refreshWantedArgs = null;
		function updateDOM(target, htmlString) {
			if (!target) return;
			const __t0 = performance.now();
			if (!target.innerHTML.trim()) {
				target.innerHTML = htmlString;
				window.__perfMark && window.__perfMark("updateDOM.innerHTML[" + (target.id || target.className || "?") + "]", performance.now() - __t0);
				return;
			}
			const wrapper = target.cloneNode(false);
			wrapper.innerHTML = htmlString;
			const __t1 = performance.now();
			morphdom(target, wrapper, { childrenOnly: true });
			const __t2 = performance.now();
			window.__perfMark && window.__perfMark("updateDOM.build[" + (target.id || target.className || "?") + "]", __t1 - __t0);
			window.__perfMark && window.__perfMark("updateDOM.morphdom[" + (target.id || target.className || "?") + "]", __t2 - __t1);
		}
		var mobileSettings = {
			query: "(max-width: 760px)",
			media: null,
			anchors: {}
		};
		var keywordRules = [
			{
				tone: "danger",
				words: [
					"key_invalid",
					"invalid",
					"unauthorized",
					"forbidden",
					"401",
					"403",
					"auth"
				]
			},
			{
				tone: "warn",
				words: [
					"quota_or_balance",
					"rate_limited",
					"rate limit",
					"retry_after",
					"quota",
					"balance",
					"429",
					"402",
					"cooldown"
				]
			},
			{
				tone: "danger",
				words: [
					"server_error",
					"failed",
					"failure",
					"error",
					"timeout",
					"502",
					"503",
					"504",
					"500"
				]
			},
			{
				tone: "info",
				words: [
					"network_error",
					"network",
					"connect",
					"connection",
					"transport"
				]
			},
			{
				tone: "compat",
				words: [
					"provider_compat",
					"tool_choice",
					"unsupported",
					"compat",
					"empty_visible_output",
					"reasoning",
					"thinking",
					"length"
				]
			},
			{
				tone: "success",
				words: [
					"success",
					"available",
					"enabled",
					"ok",
					"200"
				]
			},
			{
				tone: "neutral",
				words: [
					"chat_completions",
					"responses",
					"anthropic_messages",
					"client_error",
					"400",
					"404",
					"422"
				]
			}
		];
		var keywordRegex = new RegExp(keywordRules.flatMap((rule) => rule.words).sort((a, b) => b.length - a.length).map(escapeRegExp).join("|"), "gi");
		function escapeRegExp(value) {
			return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function escapeHtml(value) {
			return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		function fmtInt(value) {
			const n = Number(value || 0);
			return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
		}
		function fmtTokenCount(value) {
			const n = Number(value || 0);
			if (!Number.isFinite(n)) return "0";
			const abs = Math.abs(n);
			const compact = (divisor, suffix) => {
				const scaled = n / divisor;
				const maxDigits = Math.abs(scaled) < 10 ? 1 : 0;
				return `${scaled.toLocaleString("en-US", {
					minimumFractionDigits: 0,
					maximumFractionDigits: maxDigits
				})}${suffix}`;
			};
			if (abs >= 1e6) return compact(1e6, "M");
			if (abs >= 1e3) return compact(1e3, "K");
			return fmtInt(n);
		}
		function fmtPct(value) {
			const n = Number(value || 0);
			return `${Math.round(n * 1e3) / 10}%`;
		}
		function fmtMs(value) {
			const n = Math.max(0, Number(value || 0));
			return `${Math.round(n).toLocaleString("en-US")}ms`;
		}
		function fmtCompactMs(value) {
			const n = Math.max(0, Number(value || 0));
			if (n >= 1e3) {
				const seconds = n / 1e3;
				return `${(seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10).toLocaleString("en-US")}s`;
			}
			return `${Math.round(n)}ms`;
		}
		function firstByteMsFromRequest(request) {
			const value = Number(request?.first_byte_ms || 0);
			return Number.isFinite(value) && value > 0 ? value : 0;
		}
		function fmtCost(value) {
			const n = Number(value || 0);
			if (!Number.isFinite(n) || n <= 0) return "$0";
			if (n < 1e-4) return `$${n.toFixed(8)}`;
			return `$${n.toLocaleString("en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 6
			})}`;
		}
		function proxyText(value) {
			if (!value) return "";
			if (typeof value === "string") return value.trim();
			if (typeof value === "object") return String(value.https || value.http || value.url || value.all || "").trim();
			return "";
		}
		function proxyLabel(value, fallback = "direct") {
			return proxyText(value) || fallback;
		}
		function usageFrom(value) {
			const usage = value?.usage && typeof value.usage === "object" ? value.usage : value || {};
			const inputTokens = Number(usage.input_tokens || value?.input_tokens || 0);
			const outputTokens = Number(usage.output_tokens || value?.output_tokens || 0);
			const totalTokens = Number(usage.total_tokens || value?.total_tokens || 0);
			return {
				input_tokens: inputTokens,
				output_tokens: outputTokens,
				total_tokens: Math.max(totalTokens, inputTokens + outputTokens),
				cost_usd: Number(value?.cost_usd || usage.cost_usd || 0)
			};
		}
		function addUsage(target, source) {
			const usage = usageFrom(source);
			target.input_tokens += usage.input_tokens;
			target.output_tokens += usage.output_tokens;
			target.total_tokens += usage.total_tokens;
			target.cost_usd += usage.cost_usd;
		}
		function resolveUsageTotal(windowUsage, counters) {
			return Number(windowUsage?.total_tokens || 0) > 0 ? windowUsage : usageFrom((counters || {}).usage || {});
		}
		function timeseriesUsageTotal() {
			const series = state.data.timeseries || {};
			const buckets = Array.isArray(series.buckets) ? series.buckets : [];
			const usage = emptyUsageTotal();
			buckets.forEach((bucket) => addUsage(usage, bucket.usage || {}));
			return usage;
		}
		function currentUsageTotal(counters) {
			return resolveUsageTotal(timeseriesUsageTotal(), counters || {});
		}
		function timeseriesTrafficTotal() {
			const series = state.data.timeseries || {};
			const buckets = Array.isArray(series.buckets) ? series.buckets : [];
			const totals = {
				requests: 0,
				success: 0,
				failed: 0,
				attempts: 0,
				failedAttempts: 0
			};
			buckets.forEach((bucket) => {
				totals.requests += Number(bucket.requests || 0);
				totals.success += Number(bucket.success || 0);
				totals.failed += Number(bucket.failed || 0);
				Object.values(bucket.by_provider || {}).forEach((provider) => {
					totals.attempts += Number(provider?.attempts || 0);
					totals.failedAttempts += Number(provider?.failed || 0);
				});
			});
			return totals;
		}
		function currentTrafficTotal(counters) {
			const windowTotals = timeseriesTrafficTotal();
			if (windowTotals.requests > 0 || windowTotals.attempts > 0) return windowTotals;
			return {
				requests: Number(counters?.requests_total || 0),
				success: Number(counters?.requests_success || 0),
				failed: Number(counters?.requests_failed || 0),
				attempts: Number(counters?.attempts_total || 0),
				failedAttempts: Number(counters?.attempts_failed || 0)
			};
		}
		function fmtDate(ts) {
			const n = Number(ts || 0);
			if (!n) return "-";
			return (/* @__PURE__ */ new Date(n * 1e3)).toLocaleString();
		}
		function joinList(items) {
			const arr = Array.isArray(items) ? items.filter(Boolean) : [];
			return arr.length ? arr.join(", ") : "-";
		}
		function joinNumberList(items) {
			const arr = Array.isArray(items) ? items.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];
			return arr.length ? arr.join(", ") : "";
		}
		function parseNumberList(value) {
			return String(value || "").split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item));
		}
		function interactiveElementHasFocus(root) {
			const active = document.activeElement;
			if (!active) return false;
			const tag = (active.tagName || "").toLowerCase();
			if (tag === "input" || tag === "textarea" || tag === "select") return true;
			if (active.isContentEditable) return true;
			if (!root) return false;
			return Boolean(active.closest && active.closest(root));
		}
		function toneForText(value) {
			const text = String(value || "").toLowerCase();
			if (!text || text === "-") return "muted";
			for (const rule of keywordRules) if (rule.words.some((word) => text.includes(word))) return rule.tone;
			if (/^2\d\d$/.test(text)) return "success";
			if (/^4\d\d$/.test(text)) return text === "429" ? "warn" : "danger";
			if (/^5\d\d$/.test(text)) return "danger";
			return "neutral";
		}
		function highlightKeywords(value) {
			const text = String(value ?? "");
			if (!text) return "";
			let last = 0;
			let out = "";
			for (const match of text.matchAll(keywordRegex)) {
				out += escapeHtml(text.slice(last, match.index));
				const word = match[0];
				out += `<span class="keyword ${toneForText(word)}">${escapeHtml(word)}</span>`;
				last = match.index + word.length;
			}
			out += escapeHtml(text.slice(last));
			return out;
		}
		function messageMarkup(value) {
			return `<span class="message-text ${toneForText(value)}">${highlightKeywords(value || "-")}</span>`;
		}
		function chip(label, tone) {
			return `<span class="message-chip ${tone || toneForText(label)}">${escapeHtml(label || "-")}</span>`;
		}
		function chipList(items, fallback = "-") {
			const arr = Array.isArray(items) ? items.filter(Boolean) : String(items || "").split(",").map((x) => x.trim()).filter(Boolean);
			if (!arr.length) return escapeHtml(fallback);
			return `<span class="chip-list">${arr.map((item) => chip(item)).join("")}</span>`;
		}
		function badge(label, tone = "") {
			return `<span class="badge${tone ? ` ${tone}` : ""}">${escapeHtml(label)}</span>`;
		}
		function priorityBadgeTone(priority) {
			const p = Number(priority) || 0;
			if (p < 5) return "prio-0";
			if (p < 10) return "prio-1";
			if (p < 15) return "prio-2";
			return "prio-3";
		}
		function statusBadge(status, statusCode) {
			const code = Number(statusCode || 0);
			if (status === "success" || code > 0 && code < 400) return badge("success", "ok");
			if (code === 429) return badge("rate limited", "warn");
			if (code >= 500) return badge("server error", "bad");
			return badge("failed", "bad");
		}
		var toasts = {
			byKey: /* @__PURE__ */ new Map(),
			seq: 0
		};
		function dismissToast(node) {
			if (!node || !node.parentNode) return;
			if (node.dataset.toastKey) toasts.byKey.delete(node.dataset.toastKey);
			if (node._hideTimer) window.clearTimeout(node._hideTimer);
			node.classList.add("toast-leaving");
			window.setTimeout(() => {
				if (node.parentNode) node.parentNode.removeChild(node);
			}, 220);
		}
		function toastDuration(tone) {
			if (tone === "bad") return 6500;
			if (tone === "warn") return 5e3;
			if (tone === "info") return 4e3;
			return 3200;
		}
		function setNotice(message, tone = "bad", opts = {}) {
			const stack = el("toastStack");
			if (!stack) return;
			const explicitKey = opts && opts.key ? String(opts.key) : "";
			const dedupeKey = explicitKey || `msg:${tone}:${message}`;
			if (!message) {
				if (explicitKey && toasts.byKey.has(explicitKey)) dismissToast(toasts.byKey.get(explicitKey));
				return;
			}
			let node = toasts.byKey.get(dedupeKey);
			if (!node) {
				node = document.createElement("div");
				node.className = "toast";
				node.dataset.toastKey = dedupeKey;
				toasts.byKey.set(dedupeKey, node);
				stack.appendChild(node);
				requestAnimationFrame(() => node.classList.add("toast-in"));
			}
			node.dataset.tone = tone;
			node.textContent = message;
			if (node._hideTimer) window.clearTimeout(node._hideTimer);
			if (!(opts && opts.sticky)) node._hideTimer = window.setTimeout(() => dismissToast(node), opts.duration || toastDuration(tone));
		}
		function setConnection(ok, text) {
			const dot = el("connectionDot");
			dot.classList.toggle("ok", Boolean(ok));
			dot.classList.toggle("bad", ok === false);
			el("connectionText").textContent = text;
		}
		function setLoginError(message = "") {
			const node = el("loginError");
			if (!node) return;
			node.textContent = message;
		}
		function stopTimer() {
			if (state.timer) {
				window.clearInterval(state.timer);
				state.timer = null;
			}
		}
		function setLoginBusy(busy, label = "Enter console") {
			const button = el("loginButton");
			const input = el("loginAdminKeyInput");
			if (button) {
				button.disabled = Boolean(busy);
				button.textContent = label;
			}
			if (input) input.disabled = Boolean(busy);
		}
		function showAuthChecking(message = "Checking console access.") {
			stopTimer();
			el("app")?.setAttribute("hidden", "");
			el("loginGate")?.setAttribute("hidden", "");
			el("authChecking")?.removeAttribute("hidden");
			const text = el("authCheckingText");
			if (text) text.textContent = message;
			document.body.classList.add("is-auth-checking");
			document.body.classList.remove("is-login-mode");
		}
		function showLogin(message = "") {
			stopTimer();
			el("app")?.setAttribute("hidden", "");
			el("authChecking")?.setAttribute("hidden", "");
			el("loginGate")?.removeAttribute("hidden");
			document.body.classList.add("is-login-mode");
			document.body.classList.remove("is-auth-checking");
			setLoginBusy(false);
			setLoginError(message);
			window.requestAnimationFrame(() => el("loginAdminKeyInput")?.focus());
		}
		function showConsole() {
			el("authChecking")?.setAttribute("hidden", "");
			el("loginGate")?.setAttribute("hidden", "");
			el("app")?.removeAttribute("hidden");
			document.body.classList.remove("is-login-mode");
			document.body.classList.remove("is-auth-checking");
			setLoginError("");
		}
		function isAuthError(err) {
			return /admin auth required|HTTP 401|HTTP 403|unauthorized|forbidden/i.test(err?.message || "");
		}
		function clearStoredAdminKey() {
			try {
				localStorage.removeItem("proxyConsoleAdminKey");
			} catch (_err) {}
		}
		async function validateAdminKey(key) {
			state.adminKey = String(key || "").trim();
			if (!state.adminKey) throw new Error("Admin key is required.");
			return apiGet("/-/admin/status");
		}
		async function openConsoleWithKey(key, { persist = false, checkingMessage = "Checking console access." } = {}) {
			showAuthChecking(checkingMessage);
			try {
				await validateAdminKey(key);
				if (persist) try {
					localStorage.setItem("proxyConsoleAdminKey", state.adminKey);
				} catch (_err) {}
				showConsole();
				setView(loadSavedView());
				renderAll();
				await refreshAll({ quiet: true });
				startTimer();
			} catch (err) {
				clearStoredAdminKey();
				state.adminKey = "";
				el("loginAdminKeyInput").value = "";
				showLogin(isAuthError(err) ? "Admin key was rejected. Enter the current key to continue." : err.message);
			}
		}
		function openConfirmDialog({ title, message, acceptLabel = "Delete" }) {
			const dialog = el("confirmDialog");
			const backdrop = el("confirmBackdrop");
			const titleEl = el("confirmTitle");
			const messageEl = el("confirmMessage");
			const acceptButton = el("confirmAcceptButton");
			if (!dialog || !backdrop || !titleEl || !messageEl || !acceptButton) {
				setNotice("Confirmation dialog is unavailable. Refresh the console and try again.");
				return Promise.resolve(false);
			}
			if (state.confirmResolve) {
				state.confirmResolve(false);
				state.confirmResolve = null;
			}
			state.confirmLastFocus = document.activeElement;
			titleEl.textContent = title || "Confirm action";
			messageEl.textContent = message || "This action needs confirmation.";
			acceptButton.textContent = acceptLabel;
			backdrop.hidden = false;
			dialog.classList.add("is-open");
			dialog.setAttribute("aria-hidden", "false");
			acceptButton.focus();
			return new Promise((resolve) => {
				state.confirmResolve = resolve;
			});
		}
		function closeConfirmDialog(accepted) {
			const dialog = el("confirmDialog");
			const backdrop = el("confirmBackdrop");
			if (dialog) {
				dialog.classList.remove("is-open");
				dialog.setAttribute("aria-hidden", "true");
			}
			if (backdrop) backdrop.hidden = true;
			const resolve = state.confirmResolve;
			state.confirmResolve = null;
			if (resolve) resolve(Boolean(accepted));
			if (state.confirmLastFocus && typeof state.confirmLastFocus.focus === "function") state.confirmLastFocus.focus();
			state.confirmLastFocus = null;
		}
		function openFormModal({ title, subtitle = "", bodyHtml = "" }) {
			const dialog = el("formModal");
			const backdrop = el("formModalBackdrop");
			const body = el("formModalBody");
			if (!dialog || !backdrop || !body) return;
			state.formModalLastFocus = document.activeElement;
			el("formModalTitle").textContent = title || "";
			el("formModalSubtitle").textContent = subtitle || "";
			updateDOM(body, bodyHtml);
			backdrop.hidden = false;
			dialog.classList.add("is-open");
			dialog.setAttribute("aria-hidden", "false");
			const closeBtn = el("formModalClose");
			if (closeBtn && !closeBtn.innerHTML.trim()) updateDOM(closeBtn, `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>`);
			const focusable = dialog.querySelector("input, select, textarea, button");
			if (focusable) focusable.focus();
		}
		function closeFormModal() {
			const dialog = el("formModal");
			const backdrop = el("formModalBackdrop");
			if (dialog) {
				dialog.classList.remove("is-open");
				dialog.classList.remove("is-model-map-modal");
				dialog.classList.remove("is-format-path-modal");
				dialog.setAttribute("aria-hidden", "true");
			}
			if (backdrop) backdrop.hidden = true;
			if (state.formModalLastFocus && typeof state.formModalLastFocus.focus === "function") state.formModalLastFocus.focus();
			state.formModalLastFocus = null;
		}
		function addProviderModalBody() {
			return `
      <form id="addProviderModalForm" class="provider-create-form">
        <label class="field form-field-inline">
          <span>Provider name</span>
          <input class="control" name="name" required placeholder="my-provider" autocomplete="off" />
        </label>
        <label class="field form-field-inline">
          <span>Base URL</span>
          <input class="control" name="base_url" required placeholder="https://api.example.com/v1" autocomplete="off" />
        </label>
        <label class="field form-field-inline">
          <span>API key</span>
          <input class="control" name="key" type="password" required placeholder="sk-..." autocomplete="off" />
        </label>
        <div class="form-row-2">
          <label class="field form-field-inline">
            <span>Upstream format</span>
            <select class="control" name="format">
              <option value="auto">Auto detect</option>
              <option value="chat_completions" selected>Chat Completions</option>
              <option value="responses">Responses</option>
              <option value="anthropic_messages">Anthropic Messages</option>
            </select>
          </label>
          <label class="field form-field-inline">
            <span>Priority</span>
            <input class="control" name="priority" type="number" value="0" min="0" />
          </label>
        </div>
        <details>
          <summary>Advanced options</summary>
          <div class="form-field-inline" style="margin-top:10px;display:grid;gap:10px">
            <label class="field form-field-inline">
              <span>Provider proxy <small class="muted">(optional)</small></span>
              <input class="control" name="proxy" placeholder="http://proxy:port" autocomplete="off" />
            </label>
            <label class="field form-field-inline">
              <span>Initial key proxy <small class="muted">(optional)</small></span>
              <input class="control" name="key_proxy" placeholder="http://proxy:port" autocomplete="off" />
            </label>
          </div>
        </details>
        <div class="form-actions">
          <button class="button secondary" type="button" id="addProviderModalCancel">Cancel</button>
          <button class="button primary" type="submit">Add Provider</button>
        </div>
      </form>
    `;
		}
		function openAddProviderModal() {
			openFormModal({
				title: "Add Provider",
				subtitle: "Create a provider with the required connection fields.",
				bodyHtml: addProviderModalBody()
			});
			const form = document.getElementById("addProviderModalForm");
			if (form) form.addEventListener("submit", async (event) => {
				event.preventDefault();
				const data = new FormData(form);
				const format = String(data.get("format") || "chat_completions");
				const proxy = String(data.get("proxy") || "").trim();
				const key = String(data.get("key") || "").trim();
				const keyProxy = String(data.get("key_proxy") || "").trim();
				const priority = Number(data.get("priority") || 0);
				const payload = {
					name: String(data.get("name") || "").trim(),
					base_url: String(data.get("base_url") || "").trim(),
					keys: [keyProxy ? {
						key,
						proxy: keyProxy
					} : key],
					priority
				};
				if (proxy) payload.proxy = proxy;
				if (format !== "auto") payload.formats = {
					chat_completions: {
						enabled: format === "chat_completions",
						path: "/v1/chat/completions"
					},
					responses: {
						enabled: format === "responses",
						path: "/v1/responses"
					},
					anthropic_messages: {
						enabled: format === "anthropic_messages",
						path: "/v1/messages"
					}
				};
				try {
					await apiPost("/-/admin/providers", payload);
					closeFormModal();
					await refreshAll({
						quiet: true,
						staticData: true
					});
					setNotice(`Provider ${payload.name} added.`, "ok");
				} catch (err) {
					setNotice(`Add provider failed: ${err.message}`);
				}
			});
			const cancel = document.getElementById("addProviderModalCancel");
			if (cancel) cancel.addEventListener("click", closeFormModal);
		}
		function collectModelNames(status, config) {
			const names = /* @__PURE__ */ new Set();
			const caps = status?.models?.providers || {};
			Object.values(caps).forEach((entry) => {
				if (!entry || typeof entry !== "object") return;
				(entry.models || []).forEach((m) => m && names.add(String(m)));
				Object.entries(entry.canonical_map || {}).forEach(([k, v]) => {
					if (k) names.add(String(k));
					if (v) names.add(String(v));
				});
			});
			const maps = config?.models?.provider_model_map || {};
			Object.values(maps).forEach((map) => {
				if (map && typeof map === "object") Object.entries(map).forEach(([k, v]) => {
					if (k) names.add(String(k));
					if (v) names.add(String(v));
				});
			});
			(config?.models?.routes && Object.keys(config.models.routes) || []).forEach((m) => m && names.add(String(m)));
			(status?.models?.union_model_ids || []).forEach((m) => m && names.add(String(m)));
			return Array.from(names).filter(Boolean).sort();
		}
		function lookupPricing(modelName) {
			const pricing = state.data.pricing || {};
			if (!modelName) return null;
			let entry = pricing[modelName];
			if (entry && entry.available) return entry;
			entry = pricing[String(modelName).toLowerCase()];
			if (entry && entry.available) return entry;
			const parts = String(modelName).split(/[/\s]+/);
			if (parts.length > 1) {
				const last = parts[parts.length - 1];
				entry = pricing[last];
				if (entry && entry.available) return entry;
				entry = pricing[last.toLowerCase()];
				if (entry && entry.available) return entry;
			}
			entry = pricing[String(modelName).toLowerCase().replace(/[.\s/]/g, "-").replace(/[^a-z0-9-]/g, "")];
			if (entry && entry.available) return entry;
			return null;
		}
		function modelPriceTooltip(modelName) {
			const entry = lookupPricing(modelName);
			if (!entry) return "";
			const input = entry.input;
			const output = entry.output;
			const cacheHit = entry.cache_hit;
			const lines = [`Input ${fmtCost(input)}/M`, `Output ${fmtCost(output)}/M`];
			if (cacheHit !== null && cacheHit !== void 0 && cacheHit !== "") lines.push(`Cache hit ${fmtCost(cacheHit)}/M`);
			if (entry.blended_per_million !== null && entry.blended_per_million !== void 0) lines.push(`Blended ${fmtCost(entry.blended_per_million)}/M`);
			return `<span class="model-price-tip" data-tip="${escapeHtml(lines.join(" · "))}" tabindex="0" aria-label="Pricing for ${escapeHtml(modelName)}">${iconSvg("info")}</span>`;
		}
		async function refreshAll({ quiet = false, preserveNotice = false, staticData = false } = {}) {
			if (!state.adminKey) {
				setConnection(false, "Admin key required");
				showLogin(quiet ? "" : "Admin key is required to load console data.");
				return;
			}
			if (_refreshInFlight) {
				_refreshWanted = true;
				const previous = _refreshWantedArgs;
				_refreshWantedArgs = {
					quiet: previous ? Boolean(previous.quiet && quiet) : Boolean(quiet),
					preserveNotice: previous ? Boolean(previous.preserveNotice || preserveNotice) : Boolean(preserveNotice),
					staticData: previous ? Boolean(previous.staticData || staticData) : Boolean(staticData)
				};
				return;
			}
			_refreshInFlight = true;
			try {
				try {
					setConnection(null, "Refreshing");
					const view = state.view || "overview";
					const needTimeseries = !quiet || view === "overview" || state.forceTimeseriesFetch;
					const needRequests = !quiet || view === "requests" || state.forceRequestsFetch;
					const needRecentRing = !quiet || view === "overview" || state.forceRequestsFetch;
					const needStaticAdminData = staticData || !quiet || !state.data.status || !state.data.config;
					state.forceTimeseriesFetch = false;
					state.forceRequestsFetch = false;
					const fetches = {
						metrics: apiGet("/-/admin/metrics"),
						providerActivity: apiGet("/-/admin/provider-activity?limit=60")
					};
					if (needStaticAdminData) {
						fetches.status = apiGet("/-/admin/status");
						fetches.models = apiGet("/-/admin/models/capabilities");
						fetches.routing = apiGet("/-/admin/routing");
						fetches.config = apiGet("/-/admin/config");
						fetches.overlay = apiGet("/-/admin/config/overlay");
						fetches.audit = apiGet("/-/admin/audit?limit=12");
					}
					if (needRecentRing) fetches.metricsFull = apiGet("/-/admin/metrics/full");
					if (needTimeseries) fetches.timeseries = apiGet(timeseriesPath());
					if (needRequests) fetches.requests = apiGet(requestsPath());
					const entries = Object.entries(fetches);
					const keys = entries.map(([k]) => k);
					const values = await Promise.all(entries.map(([, v]) => v));
					const result = {};
					keys.forEach((k, i) => {
						result[k] = values[i];
					});
					if (result.metrics !== void 0) state.data.metrics = result.metrics;
					if (result.metricsFull !== void 0) state.data.metricsFull = result.metricsFull;
					if (result.providerActivity !== void 0) {
						const pa = result.providerActivity || {};
						state.data.providerActivity = pa.providers || pa || {};
					}
					if (result.timeseries !== void 0) state.data.timeseries = result.timeseries;
					if (result.status !== void 0) state.data.status = result.status;
					if (result.models !== void 0) state.data.status = {
						...state.data.status || {},
						models: result.models
					};
					if (result.requests !== void 0) state.data.requests = result.requests;
					if (result.routing !== void 0) state.data.routing = result.routing;
					if (result.config !== void 0) state.data.config = result.config;
					if (result.overlay !== void 0) state.data.overlay = result.overlay;
					if (result.audit !== void 0) state.data.audit = result.audit;
					state.data.version = Number(state.data.version || 0) + 1;
					try {
						const modelNames = collectModelNames(state.data.status, state.data.config).slice(0, 60);
						const pricingKey = modelNames.join(",");
						if (modelNames.length && pricingKey !== _lastPricingKey) {
							_lastPricingKey = pricingKey;
							apiGet(`/-/admin/model-pricing?models=${encodeURIComponent(pricingKey)}`).then((pricingResp) => {
								state.data.pricing = pricingResp && pricingResp.pricing || {};
								try {
									renderAll();
								} catch (_e) {}
							}).catch(() => {
								state.data.pricing = state.data.pricing || {};
							});
						} else if (!modelNames.length) state.data.pricing = {};
					} catch (e) {
						state.data.pricing = state.data.pricing || {};
					}
					renderAll();
					if (!preserveNotice) setNotice("");
					setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
				} catch (err) {
					setConnection(false, "Connection error");
					if (isAuthError(err)) {
						clearStoredAdminKey();
						state.adminKey = "";
						showLogin("Admin key was rejected. Enter the current key to continue.");
					} else setNotice(`Console refresh failed: ${err.message}`);
				} finally {
					_refreshInFlight = false;
					if (_refreshWanted) {
						const args = _refreshWantedArgs || {};
						_refreshWanted = false;
						_refreshWantedArgs = null;
						Promise.resolve().then(() => refreshAll(args));
					}
				}
			} catch (_outerErr) {
				_refreshInFlight = false;
			}
		}
		async function refreshProviderConfigView({ preserveNotice = true } = {}) {
			if (!state.adminKey) return false;
			try {
				const [status, config] = await Promise.all([apiGet("/-/admin/status"), apiGet("/-/admin/config")]);
				state.data.status = status;
				state.data.config = config;
				state.data.version = Number(state.data.version || 0) + 1;
				state.forceConfigRender = true;
				state.forceProvidersRender = true;
				state.forceModelCapsRender = true;
				renderAll();
				renderProviderDrawer({ force: true });
				if (!preserveNotice) setNotice("");
				setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
				return true;
			} catch (err) {
				setConnection(false, "Connection error");
				setNotice(`Provider config refresh failed: ${err.message}`, "bad");
				return false;
			}
		}
		function currentTimeRange() {
			return timeRanges[state.timeRange] || timeRanges["30m"];
		}
		function timeseriesPath() {
			const range = currentTimeRange();
			return `/-/admin/metrics/timeseries?bucket_s=${range.bucket_s}&buckets=${range.buckets}`;
		}
		function requestsPath() {
			const params = new URLSearchParams();
			params.set("limit", String(10));
			params.set("offset", String(Math.max(0, state.requestsPage) * 10));
			Object.entries(currentRequestFilters()).forEach(([key, value]) => {
				const v = String(value || "").trim();
				if (v) params.set(key, v);
			});
			return `/-/admin/requests?${params.toString()}`;
		}
		function currentRequestFilters() {
			return {
				model: el("filterModel")?.value,
				provider: el("filterProvider")?.value,
				status: state.requestFilters.status,
				error_type: el("filterErrorType")?.value,
				failure_reason: el("filterReason")?.value,
				http_status: el("filterHttpStatus")?.value
			};
		}
		function activeRequestFilters() {
			const out = {};
			Object.entries(currentRequestFilters()).forEach(([key, value]) => {
				const text = String(value || "").trim();
				if (text) out[key] = text;
			});
			return out;
		}
		function renderAll() {
			const __t0 = performance.now();
			renderTimeRangeControl();
			const view = state.view || "overview";
			let __ta = __t0;
			const __mark = (label) => {
				const t = performance.now();
				window.__perfMark && window.__perfMark("renderAll." + label, t - __ta);
				__ta = t;
			};
			if (view === "overview") {
				renderMetrics();
				__mark("metrics");
				renderOverviewVisuals();
				__mark("visuals");
				renderTrafficChart();
				__mark("traffic");
				renderUsageChart();
				__mark("usage");
				renderProviderHealth();
				__mark("providerHealth");
				renderRecentFailures();
				__mark("recentFailures");
			} else if (view === "requests") {
				renderRequestsTable();
				__mark("requestsTable");
			} else if (view === "providers") {
				renderProvidersTable();
				__mark("providersTable");
				renderModelCapabilities();
				__mark("modelCapabilities");
			} else if (view === "policy") {
				renderPolicy();
				__mark("policy");
			} else if (view === "config") {
				renderConfig();
				__mark("config");
			} else if (view === "playground") {
				renderPlayground();
				__mark("playground");
			}
			renderProviderDrawer();
			__mark("providerDrawer");
			bindViewTargetButtons();
			window.__perfMark && window.__perfMark("renderAll.total", performance.now() - __t0);
		}
		function bindViewTargetButtons() {
			qsa("[data-view-target]").forEach((button) => {
				if (button.dataset.boundViewTarget) return;
				button.dataset.boundViewTarget = "1";
				button.addEventListener("click", () => setView(button.dataset.viewTarget || "overview"));
			});
		}
		function renderTimeRangeControl() {
			const range = currentTimeRange();
			const label = el("timeRangeLabel");
			if (label) label.textContent = range.label;
			qsa("[data-time-range]").forEach((button) => {
				const active = button.dataset.timeRange === state.timeRange;
				button.classList.toggle("is-active", active);
				button.setAttribute("aria-pressed", active ? "true" : "false");
			});
		}
		function renderMetrics() {
			const metrics = state.data.metrics || {};
			const status = state.data.status || {};
			const counters = metrics.counters || {};
			const providers = status.router?.providers || {};
			const providerValues = Object.values(providers);
			const available = providerValues.filter((p) => p.available && p.enabled).length;
			const traffic = currentTrafficTotal(counters);
			const displaySuccess = traffic.requests > 0 ? Math.min(traffic.success, traffic.requests) : traffic.success;
			const successRate = traffic.requests > 0 ? Math.min(1, traffic.success / traffic.requests) : 1;
			const attemptFailureRate = traffic.attempts > 0 ? traffic.failedAttempts / traffic.attempts : 0;
			const windowLabel = `${state.timeRange} window`;
			el("metricRequests").textContent = fmtInt(traffic.requests);
			el("metricRequestsSub").textContent = `${windowLabel} / ${fmtInt(counters.requests_in_flight)} live`;
			el("metricSuccessRate").textContent = fmtPct(successRate);
			el("metricSuccessSub").textContent = `${fmtInt(displaySuccess)} success in ${state.timeRange}`;
			el("metricAttemptFailureRate").textContent = fmtPct(attemptFailureRate);
			el("metricAttemptSub").textContent = `${fmtInt(traffic.failedAttempts)}/${fmtInt(traffic.attempts)} failed attempts`;
			el("metricProviders").textContent = `${available}/${providerValues.length}`;
			el("metricProvidersSub").textContent = "available";
			const usage = currentUsageTotal(counters);
			el("metricTokens").textContent = fmtTokenCount(usage.total_tokens);
			el("metricTokens").title = `${fmtInt(usage.total_tokens)} tokens`;
			el("metricTokensSub").textContent = `${fmtTokenCount(usage.input_tokens)} input / ${fmtTokenCount(usage.output_tokens)} output`;
			el("metricTokensSub").title = `${fmtInt(usage.input_tokens)} input / ${fmtInt(usage.output_tokens)} output`;
			el("metricCost").textContent = fmtCost(usage.cost_usd);
			el("metricCostSub").textContent = usage.cost_usd > 0 ? "estimated from configured pricing" : "pricing not configured";
			setMetricProgress("metricRequests", traffic.requests > 0 ? 1 : 0);
			setMetricProgress("metricSuccessRate", successRate);
			setMetricProgress("metricAttemptFailureRate", attemptFailureRate);
			setMetricProgress("metricProviders", providerValues.length ? available / providerValues.length : 0);
			setMetricProgress("metricTokens", usage.total_tokens > 0 ? Math.max(.08, usage.output_tokens / usage.total_tokens) : 0);
			setMetricProgress("metricCost", usage.cost_usd > 0 ? 1 : 0);
		}
		function setMetricProgress(valueId, value) {
			const card = el(valueId)?.closest(".metric");
			if (!card) return;
			const pct = Math.max(0, Math.min(100, Number(value || 0) * 100));
			card.style.setProperty("--metric-progress", `${pct}%`);
		}
		function renderOverviewVisuals() {
			const target = el("overviewVisuals");
			if (!target) return;
			const counters = (state.data.metrics || {}).counters || {};
			const status = state.data.status || {};
			const providers = Object.values(status.router?.providers || {});
			const traffic = currentTrafficTotal(counters);
			currentUsageTotal(counters);
			const displaySuccess = traffic.requests > 0 ? Math.min(traffic.success, traffic.requests) : traffic.success;
			const successRate = traffic.requests > 0 ? Math.min(1, traffic.success / traffic.requests) : 1;
			const requestFailureRate = traffic.requests > 0 ? traffic.failed / traffic.requests : 0;
			const failureRate = traffic.attempts > 0 ? traffic.failedAttempts / traffic.attempts : 0;
			const providerCount = providers.length;
			const providerAvailable = providers.filter((p) => p.available && p.enabled).length;
			let keyTotal = 0;
			let keyUsable = 0;
			providers.forEach((provider) => {
				const keys = Array.isArray(provider.keys) ? provider.keys : [];
				keyTotal += keys.length;
				keyUsable += keys.filter((key) => key.available && key.runtime_enabled).length;
			});
			const latencySamples = (Array.isArray(state.data.metricsFull?.recent_requests) ? state.data.metricsFull.recent_requests : []).map(firstByteMsFromRequest).filter((value) => value > 0).slice(-60);
			const latestLatency = latencySamples.length ? latencySamples[latencySamples.length - 1] : null;
			const avgLatency = latencySamples.length ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length) : null;
			const maxLatency = latencySamples.length ? Math.max(...latencySamples) : null;
			const providerPct = providerCount ? providerAvailable / providerCount : 0;
			const keyPct = keyTotal ? keyUsable / keyTotal : 0;
			const healthTone = providerPct >= .9 && keyPct >= .9 && failureRate < .05 ? "ok" : providerPct >= .5 && keyPct >= .5 && failureRate < .2 ? "warn" : providerPct > 0 && keyPct > 0 ? "soft" : "bad";
			currentTimeRange().label || state.timeRange;
			target.innerHTML = `
      ${overviewMetricCard("Requests", fmtInt(traffic.requests), `${fmtInt(counters.requests_in_flight || 0)} in flight`, requestFailureRate >= .1 ? "danger" : requestFailureRate > 0 ? "warning" : "info", "activity")}
      ${overviewMetricCard("Success rate", fmtPct(successRate), `${fmtInt(displaySuccess)} success`, successRate >= .98 ? "success" : successRate >= .95 ? "info" : successRate >= .85 ? "warning" : "danger", "check")}
      ${overviewMetricCard("First byte", latestLatency === null ? "-" : fmtMs(latestLatency), avgLatency === null ? "no samples" : `avg ${fmtMs(avgLatency)} / max ${fmtMs(maxLatency)}`, toneForLatency(avgLatency || latestLatency || 0), "clock")}
      ${overviewMetricCard("Active keys", `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, `${fmtInt(providerAvailable)}/${fmtInt(providerCount)} providers`, healthTone === "bad" ? "danger" : healthTone === "soft" ? "warning" : healthTone === "warn" ? "info" : "success", "key")}
    `;
		}
		function overviewMetricCard(label, value, hint, tone, icon) {
			return `
      <article class="visual-card accent-${escapeHtml(tone || "info")}">
        <div class="metric-header">
          <span class="metric-label">${escapeHtml(label)}</span>
          <span class="metric-icon">${iconSvg(icon || "activity")}</span>
        </div>
        <strong class="metric-val">${escapeHtml(value)}</strong>
        <small class="metric-sub">${metricDot(tone)}${escapeHtml(hint)}</small>
      </article>
    `;
		}
		function metricDot(tone) {
			return `<span class="metric-dot ${tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "success" ? "success" : "info"}"></span>`;
		}
		function renderTrafficChart() {
			const series = state.data.timeseries || {};
			const buckets = Array.isArray(series.buckets) ? series.buckets : [];
			const recent = Array.isArray(state.data.metricsFull?.recent_requests) ? state.data.metricsFull.recent_requests : [];
			const target = el("trafficChart");
			if (!target) return;
			const chartWindow = el("chartWindow");
			const bucketS = Number(series.bucket_s || 60);
			const sourceLabel = series.source === "sqlite" ? "sqlite history" : "memory";
			const recentSorted = recent.filter((request) => Number(request.finished_at || 0) > 0).slice().sort((a, b) => Number(a.finished_at || 0) - Number(b.finished_at || 0));
			let chartBuckets = buckets.map((bucket) => {
				const start = Number(bucket.start || 0);
				const end = Number(bucket.end || (start ? start + bucketS : 0));
				const usage = usageFrom(bucket.usage || {});
				const success = Number(bucket.success || 0);
				const failed = Number(bucket.failed || 0);
				const requests = Number(bucket.requests || success + failed || 0);
				return {
					ts: start + Math.max(0, end - start) / 2,
					start,
					end,
					requests,
					success,
					failed,
					input: usage.input_tokens,
					output: usage.output_tokens,
					total_tokens: usage.total_tokens,
					cost_usd: usage.cost_usd,
					first_byte_ms_avg: Number(bucket.first_byte_ms_avg || 0)
				};
			});
			const useRecentSamples = !chartBuckets.some((bucket) => Number(bucket.requests || 0) || Number(bucket.success || 0) || Number(bucket.failed || 0) || Number(bucket.input || 0) || Number(bucket.output || 0) || Number(bucket.total_tokens || 0)) && recentSorted.length > 0;
			if (useRecentSamples) chartBuckets = recentSorted.slice(-72).map((request) => {
				const ts = Number(request.finished_at || 0);
				const usage = usageFrom(request);
				const statusCode = Number(request.status_code || 0);
				const failed = request.status === "success" || statusCode > 0 && statusCode < 400 ? 0 : 1;
				return {
					ts,
					start: ts,
					end: ts,
					requests: 1,
					success: failed ? 0 : 1,
					failed,
					input: usage.input_tokens,
					output: usage.output_tokens,
					total_tokens: usage.total_tokens,
					cost_usd: usage.cost_usd,
					first_byte_ms_avg: Number(request.first_byte_ms || 0)
				};
			});
			if (chartBuckets.length && !chartBuckets.some((bucket) => Number(bucket.total_tokens || 0) > 0)) {
				const firstTs = Number(chartBuckets[0]?.start || chartBuckets[0]?.ts || 0);
				const lastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || chartBuckets[chartBuckets.length - 1]?.ts || firstTs);
				recentSorted.filter((request) => Number(request.finished_at || 0) >= firstTs && Number(request.finished_at || 0) <= lastTs).forEach((request) => {
					const ts = Number(request.finished_at || 0);
					const usage = usageFrom(request);
					if (!ts || !usage.total_tokens) return;
					let closest = null;
					chartBuckets.forEach((bucket) => {
						const distance = Math.abs(Number(bucket.ts || 0) - ts);
						if (!closest || distance < closest.distance) closest = {
							bucket,
							distance
						};
					});
					if (!closest?.bucket) return;
					closest.bucket.input += usage.input_tokens;
					closest.bucket.output += usage.output_tokens;
					closest.bucket.total_tokens += usage.total_tokens;
					closest.bucket.cost_usd += usage.cost_usd;
				});
			}
			if (!chartBuckets.length) {
				if (chartWindow) chartWindow.textContent = `${currentTimeRange().label} / no samples`;
				target.innerHTML = `<div class="empty">No time-series data</div>`;
				return;
			}
			const totals = chartBuckets.reduce((memo, bucket) => {
				memo.requests += Number(bucket.requests || 0);
				memo.success += Number(bucket.success || 0);
				memo.failed += Number(bucket.failed || 0);
				memo.input += Number(bucket.input || 0);
				memo.output += Number(bucket.output || 0);
				memo.total_tokens += Number(bucket.total_tokens || 0);
				memo.cost_usd += Number(bucket.cost_usd || 0);
				return memo;
			}, {
				requests: 0,
				success: 0,
				failed: 0,
				input: 0,
				output: 0,
				total_tokens: 0,
				cost_usd: 0
			});
			totals.total_tokens = Math.max(totals.total_tokens, totals.input + totals.output);
			const windowUsage = {
				input_tokens: totals.input,
				output_tokens: totals.output,
				total_tokens: totals.total_tokens,
				cost_usd: totals.cost_usd
			};
			const fallbackUsage = currentUsageTotal(state.data.metrics?.counters || {});
			const displayUsage = windowUsage.total_tokens > 0 ? windowUsage : fallbackUsage;
			const successRate = totals.requests ? Math.min(1, totals.success / totals.requests) : 1;
			const firstTs = Number(chartBuckets[0]?.start || chartBuckets[0]?.ts || 0);
			const lastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || chartBuckets[chartBuckets.length - 1]?.ts || firstTs);
			if (chartWindow) chartWindow.textContent = useRecentSamples ? `${currentTimeRange().label} / recent requests` : `${currentTimeRange().label} / ${sourceLabel}`;
			target.innerHTML = `
      <div class="usage-trend-overview">
        <div class="usage-trend-total">
          <span>Consumed tokens</span>
          <strong>${escapeHtml(fmtTokenCount(displayUsage.total_tokens))}</strong>
          <small>${escapeHtml(fmtInt(displayUsage.total_tokens))} total in the selected window</small>
        </div>
        <div class="usage-trend-kpis">
          ${usageTrendKpi("Input", fmtTokenCount(displayUsage.input_tokens), "usage-input")}
          ${usageTrendKpi("Output", fmtTokenCount(displayUsage.output_tokens), "usage-output")}
          ${usageTrendKpi("Requests", fmtInt(totals.requests), "usage-request")}
          ${usageTrendKpi("Failures", fmtInt(totals.failed), "usage-failure")}
          ${usageTrendKpi("Success", fmtPct(successRate), "usage-success")}
        </div>
      </div>
      ${renderTrafficComboChart({
				buckets: chartBuckets,
				firstTs,
				lastTs,
				width: 1120,
				height: 360,
				pad: {
					top: 32,
					right: 72,
					bottom: 48,
					left: 72
				}
			})}
    `;
			target.querySelectorAll("[data-traffic-mode]").forEach((btn) => {
				if (btn.dataset.bounddatatrafficmode) return;
				btn.dataset.bounddatatrafficmode = "1";
				btn.addEventListener("click", () => {
					const mode = btn.dataset.trafficMode;
					if (state.trafficChartMode === mode) return;
					state.trafficChartMode = mode;
					renderTrafficChart();
				});
			});
		}
		function usageTrendKpi(label, value, tone) {
			return `
      <div class="usage-trend-kpi ${escapeHtml(tone)}">
        <i></i>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
		}
		function niceChartMax(value) {
			const raw = Math.max(1, Number(value || 1));
			const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
			const normalized = raw / magnitude;
			return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10) * magnitude;
		}
		function svgNum(value) {
			return Number(value || 0).toFixed(2).replace(/\.?0+$/, "");
		}
		function smoothSvgPath(points, minY, maxY) {
			if (!points.length) return "";
			if (points.length === 1) return `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
			const clampY = (value) => Math.max(minY, Math.min(maxY, Number(value || 0)));
			let path = `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] || points[i];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] || p2;
				const cp1x = p1.x + (p2.x - p0.x) / 6;
				const cp1y = clampY(p1.y + (p2.y - p0.y) / 6);
				const cp2x = p2.x - (p3.x - p1.x) / 6;
				const cp2y = clampY(p2.y - (p3.y - p1.y) / 6);
				path += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
			}
			return path;
		}
		function renderTrafficComboChart(options) {
			const width = Number(options.width || 1120);
			const height = Number(options.height || 360);
			const pad = options.pad || {
				top: 32,
				right: 72,
				bottom: 48,
				left: 72
			};
			const firstTs = Number(options.firstTs || 0);
			const lastTs = Number(options.lastTs || firstTs);
			const plotW = width - pad.left - pad.right;
			const plotH = height - pad.top - pad.bottom;
			const buckets = Array.isArray(options.buckets) ? options.buckets : [];
			const xFor = (bucket, index, total) => {
				const ts = Number(bucket.ts || 0);
				if (lastTs > firstTs && ts) return pad.left + (ts - firstTs) / (lastTs - firstTs) * plotW;
				return pad.left + (total > 1 ? index / (total - 1) * plotW : plotW / 2);
			};
			const enriched = buckets.map((bucket, index) => ({
				...bucket,
				x: xFor(bucket, index, buckets.length)
			}));
			const safeMax = (values, fallback = 1) => Math.max(fallback, ...values.map((value) => Number(value || 0)));
			const barBaseline = height - pad.bottom;
			let svgContent = "";
			let legendItems = [];
			if (state.trafficChartMode === "requests") {
				const requestMax = niceChartMax(Math.max(4, safeMax(buckets.map((b) => b.requests), 1) * 1.15));
				const latencyMax = niceChartMax(safeMax(buckets.map((b) => b.first_byte_ms_avg), 1e3) * 1.15);
				const yBar = (value) => barBaseline - Number(value || 0) / Math.max(1, requestMax) * plotH;
				const yLatency = (value) => barBaseline - Number(value || 0) / Math.max(1, latencyMax) * plotH;
				const requestLabels = [
					0,
					Math.ceil(requestMax / 2),
					requestMax
				];
				const latencyLabels = [
					0,
					Math.ceil(latencyMax / 2),
					latencyMax
				];
				const gridAndLabels = requestLabels.map((label) => `
        <line class="axis traffic-grid-line" x1="${pad.left}" y1="${yBar(label)}" x2="${width - pad.right}" y2="${yBar(label)}"></line>
        <text class="traffic-axis-label" x="${pad.left - 14}" y="${yBar(label) + 4}" text-anchor="end">${escapeHtml(fmtInt(label))}</text>
      `).join("");
				const rightLabels = latencyLabels.map((label) => `
        <text class="traffic-axis-label traffic-axis-label-info" x="${width - pad.right + 14}" y="${yLatency(label) + 4}">${escapeHtml(fmtMs(label))}</text>
      `).join("");
				const count = enriched.length;
				const slot = count > 0 ? plotW / count : plotW;
				const barW = Math.max(2, Math.min(26, slot * .5));
				const bars = enriched.map((bucket) => {
					const requests = Number(bucket.requests || 0);
					const failed = Math.min(requests, Number(bucket.failed || 0));
					const success = Math.max(0, requests - failed);
					const x = bucket.x - barW / 2;
					if (requests === 0) return "";
					const successTop = yBar(success);
					const totalTop = yBar(requests);
					const successHeight = barBaseline - successTop;
					const failedHeight = successTop - totalTop;
					return (success > 0 ? `<rect class="traffic-bar-success" x="${svgNum(x)}" y="${svgNum(successTop)}" width="${svgNum(barW)}" height="${svgNum(successHeight)}" rx="1.5">
              <title>${escapeHtml(`${fmtDate(bucket.start || bucket.ts)} Success: ${fmtInt(success)}`)}</title>
             </rect>` : "") + (failed > 0 ? `<rect class="traffic-bar-fail" x="${svgNum(x)}" y="${svgNum(totalTop)}" width="${svgNum(barW)}" height="${svgNum(failedHeight)}" rx="1.5">
              <title>${escapeHtml(`${fmtDate(bucket.start || bucket.ts)} Failures: ${fmtInt(failed)}`)}</title>
             </rect>` : "");
				}).join("");
				const latencyPoints = enriched.filter((bucket) => bucket.requests > 0 && bucket.first_byte_ms_avg > 0).map((bucket) => ({
					x: bucket.x,
					y: yLatency(bucket.first_byte_ms_avg),
					value: bucket.first_byte_ms_avg,
					start: bucket.start,
					ts: bucket.ts
				}));
				const latencyPath = smoothSvgPath(latencyPoints, pad.top, barBaseline);
				const latencyAreaPath = latencyPath && latencyPoints.length > 1 ? `${latencyPath} L ${svgNum(latencyPoints[latencyPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(latencyPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				svgContent = `
        ${gridAndLabels}
        ${rightLabels}
        ${bars}
        ${latencyAreaPath ? `<path class="traffic-latency-region" d="${latencyAreaPath}"></path>` : ""}
        ${latencyPath ? `<path class="traffic-latency-line" d="${latencyPath}"></path>` : ""}
        ${latencyPoints.length <= 64 ? latencyPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-latency-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.2">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Avg Latency: ${fmtMs(point.value)}`)}</title>
            </circle>
          `).join("") : ""}
        <text class="traffic-axis-title" x="${pad.left}" y="${pad.top - 8}">requests</text>
        <text class="traffic-axis-title traffic-axis-label-info" x="${width - pad.right}" y="${pad.top - 8}" text-anchor="end">latency</text>
      `;
				legendItems = [
					{
						dotClass: "traffic-bar-success-legend",
						label: "Success requests"
					},
					{
						dotClass: "traffic-bar-fail-legend",
						label: "Failures"
					},
					{
						dotClass: "traffic-latency-legend",
						label: "Avg Latency"
					}
				];
			} else {
				const tokenMax = niceChartMax(safeMax(buckets.flatMap((bucket) => [
					bucket.total_tokens,
					bucket.input,
					bucket.output
				]), 1e3) * 1.15);
				const costMax = safeMax(buckets.map((b) => b.cost_usd), .01) * 1.15;
				const yToken = (value) => barBaseline - Number(value || 0) / Math.max(1, tokenMax) * plotH;
				const yCost = (value) => barBaseline - Number(value || 0) / Math.max(1e-6, costMax) * plotH;
				const tokenLabels = [
					0,
					Math.ceil(tokenMax / 2),
					tokenMax
				];
				const costLabels = [
					0,
					costMax / 2,
					costMax
				];
				const gridAndLabels = tokenLabels.map((label) => `
        <line class="axis traffic-grid-line" x1="${pad.left}" y1="${yToken(label)}" x2="${width - pad.right}" y2="${yToken(label)}"></line>
        <text class="traffic-axis-label" x="${pad.left - 14}" y="${yToken(label) + 4}" text-anchor="end">${escapeHtml(fmtTokenCount(label))}</text>
      `).join("");
				const rightLabels = costLabels.map((label) => `
        <text class="traffic-axis-label traffic-axis-label-info" x="${width - pad.right + 14}" y="${yCost(label) + 4}">${escapeHtml(fmtCost(label))}</text>
      `).join("");
				const totalPoints = enriched.map((bucket) => ({
					x: bucket.x,
					y: yToken(bucket.total_tokens),
					value: bucket.total_tokens,
					start: bucket.start,
					ts: bucket.ts
				}));
				const totalPath = smoothSvgPath(totalPoints, pad.top, barBaseline);
				const totalAreaPath = totalPath && totalPoints.length > 1 ? `${totalPath} L ${svgNum(totalPoints[totalPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(totalPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				const totalArea = totalAreaPath ? `<path class="traffic-token-area" d="${totalAreaPath}"></path>` : "";
				const totalLine = totalPath ? `<path class="traffic-total-line" d="${totalPath}"></path>` : "";
				const inputPath = smoothSvgPath(enriched.map((bucket) => ({
					x: bucket.x,
					y: yToken(bucket.input),
					value: bucket.input,
					start: bucket.start,
					ts: bucket.ts
				})), pad.top, barBaseline);
				const inputLine = inputPath ? `<path class="traffic-input-line" d="${inputPath}"></path>` : "";
				const outputPath = smoothSvgPath(enriched.map((bucket) => ({
					x: bucket.x,
					y: yToken(bucket.output),
					value: bucket.output,
					start: bucket.start,
					ts: bucket.ts
				})), pad.top, barBaseline);
				const outputLine = outputPath ? `<path class="traffic-output-line" d="${outputPath}"></path>` : "";
				const costPoints = enriched.map((bucket) => ({
					x: bucket.x,
					y: yCost(bucket.cost_usd),
					value: bucket.cost_usd,
					start: bucket.start,
					ts: bucket.ts
				}));
				const costPath = smoothSvgPath(costPoints, pad.top, barBaseline);
				svgContent = `
        ${gridAndLabels}
        ${rightLabels}
        ${totalArea}
        ${totalLine}
        ${inputLine}
        ${outputLine}
        ${costPath ? `<path class="traffic-cost-line" d="${costPath}"></path>` : ""}
        ${totalPoints.length <= 64 ? totalPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-total-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.6">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Total Tokens: ${fmtTokenCount(point.value)}`)}</title>
            </circle>
          `).join("") : ""}
        ${costPoints.length <= 64 && costPath ? costPoints.map((point) => `
            <circle class="traffic-trend-dot traffic-cost-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.2">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Est. Cost: ${fmtCost(point.value)}`)}</title>
            </circle>
          `).join("") : ""}
        <text class="traffic-axis-title" x="${pad.left}" y="${pad.top - 8}">tokens</text>
        <text class="traffic-axis-title traffic-axis-label-info" x="${width - pad.right}" y="${pad.top - 8}" text-anchor="end">cost</text>
      `;
				legendItems = [
					{
						dotClass: "traffic-total-dot",
						label: "Total tokens"
					},
					{
						dotClass: "traffic-input-dot",
						label: "Input"
					},
					{
						dotClass: "traffic-output-dot",
						label: "Output"
					},
					{
						dotClass: "traffic-cost-legend",
						label: "Est. Cost"
					}
				];
			}
			const xTicks = enriched.length > 2 ? [
				enriched[0],
				enriched[Math.floor(enriched.length / 2)],
				enriched[enriched.length - 1]
			] : enriched;
			const shortDate = (ts) => {
				const n = Number(ts || 0);
				if (!n) return "-";
				const d = /* @__PURE__ */ new Date(n * 1e3);
				const range = currentTimeRange();
				const opts = range === timeRanges["24h"] || range === timeRanges["7d"] ? {
					month: "2-digit",
					day: "2-digit"
				} : {
					hour: "2-digit",
					minute: "2-digit"
				};
				return d.toLocaleString(void 0, opts);
			};
			const xTicksHtml = xTicks.map((point) => `
      <text class="traffic-axis-label" x="${svgNum(point.x)}" y="${height - 18}" text-anchor="middle">${escapeHtml(shortDate(point.start || point.ts))}</text>
    `).join("");
			return `
      <div class="traffic-chart-shell">
        <div class="traffic-chart-header">
          <div class="traffic-trend-legend">${legendItems.map((item) => `
      <span class="traffic-trend-legend-item ${item.dotClass}">
        <i></i>${escapeHtml(item.label)}
      </span>
    `).join("")}</div>
          <div class="traffic-mode-selectors">
            <button type="button" class="button pill-toggle ${state.trafficChartMode === "requests" ? "is-active" : ""}" data-traffic-mode="requests">Requests & Latency</button>
            <button type="button" class="button pill-toggle ${state.trafficChartMode === "tokens" ? "is-active" : ""}" data-traffic-mode="tokens">Usage</button>
          </div>
        </div>
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gateway traffic visualization chart">
          <defs>
            <linearGradient id="trafficTokenArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#a855f7" stop-opacity="0.22"></stop>
              <stop offset="55%" stop-color="#a855f7" stop-opacity="0.07"></stop>
              <stop offset="100%" stop-color="#a855f7" stop-opacity="0"></stop>
            </linearGradient>
            <linearGradient id="trafficLatencyArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.16"></stop>
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          <rect class="traffic-plot-bg" x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" rx="0"></rect>
          ${svgContent}
          <line class="axis traffic-baseline" x1="${pad.left}" y1="${barBaseline}" x2="${width - pad.right}" y2="${barBaseline}"></line>
          ${xTicksHtml}
        </svg>
      </div>
    `;
		}
		function renderUsageChart() {
			const target = el("usageChart");
			if (!target) return;
			const counters = (state.data.metrics || {}).counters || {};
			const series = state.data.timeseries || {};
			const buckets = Array.isArray(series.buckets) ? series.buckets : [];
			const windowUsage = {
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0,
				cost_usd: 0
			};
			const modelTotals = {};
			buckets.forEach((bucket) => {
				addUsage(windowUsage, bucket.usage || {});
				Object.entries(bucket.by_model || {}).forEach(([label, count]) => {
					const entry = modelTotals[label] || {
						usage: {
							input_tokens: 0,
							output_tokens: 0,
							total_tokens: 0,
							cost_usd: 0
						},
						calls: 0
					};
					entry.calls += Number(count || 0);
					modelTotals[label] = entry;
				});
				Object.entries(bucket.by_model_usage || {}).forEach(([label, usage]) => {
					const entry = modelTotals[label] || {
						usage: {
							input_tokens: 0,
							output_tokens: 0,
							total_tokens: 0,
							cost_usd: 0
						},
						calls: 0
					};
					addUsage(entry.usage, usage || {});
					modelTotals[label] = entry;
				});
			});
			const hasWindowModels = Object.values(modelTotals).some((entry) => Number(entry.calls || 0) > 0 || usageFrom(entry.usage).total_tokens > 0);
			const totalUsage = resolveUsageTotal(windowUsage, counters);
			const modelRows = hasWindowModels ? modelRankRows(modelTotals) : modelRankRowsFromCounters(counters);
			el("usageWindow").textContent = totalUsage.total_tokens ? `${currentTimeRange().label} / ${fmtTokenCount(totalUsage.total_tokens)} tokens / ${fmtCost(totalUsage.cost_usd)}` : "no token samples";
			if (!totalUsage.total_tokens && !modelRows.length) {
				target.innerHTML = `<div class="empty pad">No model usage recorded yet</div>`;
				return;
			}
			target.innerHTML = `
      <div class="usage-summary">
        ${miniMetric("Input", fmtTokenCount(totalUsage.input_tokens), "tokens")}
        ${miniMetric("Output", fmtTokenCount(totalUsage.output_tokens), "tokens")}
        ${miniMetric("Total", fmtTokenCount(totalUsage.total_tokens), "tokens")}
        ${miniMetric("Cost", fmtCost(totalUsage.cost_usd), "estimated")}
      </div>
      <div class="usage-columns usage-model-only">
        <section>
          <div class="usage-section-title">
            <h3>Top ${fmtInt(5)} models by calls</h3>
            <span>selected window</span>
          </div>
          ${usageRows(modelRows, "No model calls")}
        </section>
      </div>
    `;
		}
		function emptyUsageTotal() {
			return {
				input_tokens: 0,
				output_tokens: 0,
				total_tokens: 0,
				cost_usd: 0
			};
		}
		function modelRankRows(modelTotals) {
			return Object.entries(modelTotals || {}).map(([label, stats]) => ({
				label: label || "-",
				calls: Number(stats.calls || 0),
				usage: usageFrom(stats.usage || {})
			})).filter((row) => row.calls > 0 || row.usage.total_tokens > 0).sort((a, b) => b.calls - a.calls || b.usage.total_tokens - a.usage.total_tokens || a.label.localeCompare(b.label)).slice(0, 5).map((row, index) => ({
				...row,
				rank: index + 1,
				hint: `${fmtInt(row.calls)} calls`
			}));
		}
		function modelRankRowsFromCounters(counters) {
			const counts = counters.by_model || {};
			const usage = counters.by_model_usage || {};
			const names = Array.from(new Set([...Object.keys(counts), ...Object.keys(usage)]));
			return modelRankRows(Object.fromEntries(names.map((name) => [name, {
				calls: Number(counts[name] || 0),
				usage: usageFrom(usage[name] || emptyUsageTotal())
			}])));
		}
		function usageRows(rows, emptyText) {
			if (!rows.length) return `<div class="empty pad-slim">${escapeHtml(emptyText)}</div>`;
			const max = Math.max(1, ...rows.map((row) => Number(row.calls || 0)));
			return `
      <div class="usage-bars">
        ${rows.map((row) => {
				const callPct = Math.max(3, Number(row.calls || 0) / max * 100);
				return `
            <div class="usage-row">
              <div class="usage-row-head">
                <strong class="mono" title="${escapeHtml(row.label)}">
                  <span class="usage-rank">#${fmtInt(row.rank || 0)}</span>
                  <span class="usage-model-name">${escapeHtml(row.label)}</span>
                </strong>
                <span class="usage-call-count">${escapeHtml(row.hint || "")}</span>
              </div>
              <div class="usage-track usage-track-calls" title="${escapeHtml(fmtInt(row.calls || 0))} calls">
                <span class="usage-fill calls" style="width:${callPct}%"></span>
              </div>
              <div class="usage-row-foot">
                <span title="${escapeHtml(fmtInt(row.usage.total_tokens))} tokens"><strong>${fmtTokenCount(row.usage.total_tokens)}</strong> tokens</span>
                <span title="${escapeHtml(fmtInt(row.usage.input_tokens))} input tokens">${fmtTokenCount(row.usage.input_tokens)} in</span>
                <span title="${escapeHtml(fmtInt(row.usage.output_tokens))} output tokens">${fmtTokenCount(row.usage.output_tokens)} out</span>
              </div>
            </div>
          `;
			}).join("")}
      </div>
    `;
		}
		function toneForLatency(value) {
			const ms = Number(value || 0);
			if (ms >= 6e3) return "danger";
			if (ms >= 2500) return "warning";
			if (ms >= 800) return "info";
			return "success";
		}
		function renderProviderHealth() {
			const providers = state.data.status?.router?.providers || {};
			const configProviders = state.data.config?.providers || {};
			const target = el("providerHealth");
			const names = providerNames(providers, configProviders);
			if (!names.length) {
				target.classList.add("empty");
				target.innerHTML = "No providers";
				return;
			}
			target.classList.remove("empty");
			const views = names.map((name) => providerLightView(name)).sort((a, b) => providerOverviewPriority(a) - providerOverviewPriority(b) || a.name.localeCompare(b.name));
			const visible = views.slice(0, 5);
			target.innerHTML = `
      <div class="overview-summary-meta">
        <span>${iconSvg("server")} ${fmtInt(visible.length)} priority / ${fmtInt(views.length)} total</span>
        ${views.length > visible.length ? `<button class="overview-jump-button" type="button" data-view-target="providers" title="Open Providers" aria-label="Open Providers">${iconSvg("arrow-right")}</button>` : ""}
      </div>
      <div class="overview-provider-list">
        ${visible.map((view) => {
				const stateLabel = view.runtimeState.label;
				const keyText = `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`;
				const issue = view.activity.lastError?.reason || (view.keyStats.cooldown ? `${fmtInt(view.keyStats.cooldown)} key cooldown` : "");
				return `
            <button class="overview-provider-row tone-${escapeHtml(view.runtimeState.badge)}" type="button" data-view-target="providers" title="Open providers">
              <span class="provider-status-dot ${escapeHtml(view.runtimeState.badge)}"></span>
              <span class="overview-provider-main">
                <strong class="mono">${escapeHtml(view.name)}</strong>
                <small>${issue ? highlightKeywords(issue) : escapeHtml(stateLabel)}</small>
              </span>
              <span class="overview-provider-kpi">
                <strong>${escapeHtml(keyText)}</strong>
                <small>keys</small>
              </span>
            </button>
          `;
			}).join("")}
      </div>
    `;
			bindViewTargetButtons();
		}
		function providerOverviewPriority(view) {
			if (view.runtimeState.id === "unavailable") return 0;
			if (view.runtimeState.id === "cooldown") return 1;
			if (view.runtimeState.id === "degraded") return 2;
			if (view.runtimeState.id === "disabled") return 3;
			if (view.activity.lastError) return 4;
			if (view.keyStats.cooldown > 0) return 5;
			return 10;
		}
		function enabledFormats(formats) {
			return Object.entries(formats || {}).filter(([_name, cfg]) => cfg && cfg.enabled).map(([name]) => name);
		}
		function renderRecentFailures() {
			const failures = (state.data.metricsFull?.recent_requests || []).filter((item) => {
				if (Number(item.status_code || 0) >= 400) return true;
				return (item.attempts || []).some((a) => a.outcome !== "success");
			});
			const rows = failures.slice(0, 5);
			const target = el("recentFailures");
			if (!rows.length) {
				target.innerHTML = `<div class="empty pad">No recent failures</div>`;
				return;
			}
			target.innerHTML = `
      <div class="overview-summary-meta">
        <span>${iconSvg("alert")} latest ${fmtInt(rows.length)} / ${fmtInt(failures.length)}</span>
        <button class="overview-jump-button" type="button" data-view-target="requests" title="Open Requests" aria-label="Open Requests">${iconSvg("arrow-right")}</button>
      </div>
      <div class="recent-failure-list">
        ${rows.map((r) => {
				const failedAttempt = (r.attempts || []).find((a) => a.outcome !== "success") || {};
				const reason = failedAttempt.reason || failedAttempt.error_type || r.error || "-";
				return `
            <button class="recent-failure-row tone-${r.status === "success" || r.status === "recovered" || Number(r.status_code || 0) > 0 && Number(r.status_code || 0) < 400 ? "warning" : "danger"}" type="button" data-request-id="${escapeHtml(r.request_id || "")}">
              <span class="request-row-dot"></span>
              <span class="recent-failure-main">
                <strong class="mono">${escapeHtml(r.model || "-")}</strong>
                <small>${escapeHtml(fmtDate(r.finished_at))} / first byte ${escapeHtml(firstByteMsFromRequest(r) ? fmtMs(firstByteMsFromRequest(r)) : "-")}</small>
              </span>
              <span class="recent-failure-status">${statusBadge(r.status, r.status_code)}</span>
              <span class="recent-failure-reason ${escapeHtml(toneForText(reason))}">${highlightKeywords(reason)}</span>
            </button>
          `;
			}).join("")}
      </div>
    `;
			target.querySelectorAll("[data-request-id]").forEach((row) => {
				if (row.dataset.bounddatarequestid) return;
				row.dataset.bounddatarequestid = "1";
				row.addEventListener("click", () => {
					if (row.dataset.requestId) openRequestDetail(row.dataset.requestId);
				});
			});
			bindViewTargetButtons();
		}
		function selectAllBannerHtml(total, items) {
			const visibleIds = items.map((item) => String(item.request_id || "")).filter(Boolean);
			const selectedVisible = visibleIds.filter((id) => state.selectedRequestIds.has(id)).length;
			if (visibleIds.length > 0 && selectedVisible === visibleIds.length && total > visibleIds.length) if (state.allMatchingSelected) return `
          <div class="request-select-all-banner">
            <span>All ${fmtInt(total)} requests matching current filters are selected.</span>
            <button type="button" class="button link-action" data-request-clear-all-matching>Clear selection</button>
          </div>
        `;
			else return `
          <div class="request-select-all-banner">
            <span>All ${fmtInt(visibleIds.length)} requests on this page are selected.</span>
            <button type="button" class="button link-action" data-request-select-all-matching>Select all ${fmtInt(total)} matching requests</button>
          </div>
        `;
			return "";
		}
		function renderRequestsTable() {
			const data = state.data.requests || {};
			const items = Array.isArray(data.items) ? data.items : [];
			const sourceLabel = data.source === "sqlite" ? "sqlite history" : "memory";
			const total = Number(data.total || 0);
			const totalPages = Math.max(1, Math.ceil(total / 10));
			if (total > 0 && state.requestsPage >= totalPages) {
				state.requestsPage = totalPages - 1;
				refreshAll({ quiet: true });
				return;
			}
			syncRequestFilterUi();
			const currentPage = Math.min(state.requestsPage + 1, totalPages);
			const start = total ? state.requestsPage * 10 + 1 : 0;
			const end = total ? Math.min(total, start + items.length - 1) : 0;
			el("requestCountLabel").textContent = total ? `${fmtInt(total)} matching records from ${sourceLabel}. Showing ${fmtInt(start)}-${fmtInt(end)}.` : `No matching request records from ${sourceLabel}.`;
			const target = el("requestsTable");
			if (!items.length) {
				target.innerHTML = `<div class="request-list-head">${requestPagination(total, currentPage, totalPages, items)}</div><div class="empty pad">No matching requests</div>`;
				bindRequestPagination(target, totalPages);
				updateRequestSelectionUi();
				return;
			}
			const rows = items.map(requestSummaryRow).join("");
			target.innerHTML = `
      <div class="request-list-head">${requestPagination(total, currentPage, totalPages, items)}</div>
      ${selectAllBannerHtml(total, items)}
      ${requestPageVisuals(items)}
      <div class="request-summary-list">${rows}</div>
    `;
			bindRequestRowInteractions(target);
			bindRequestSelection(target, items);
			bindRequestPagination(target, totalPages);
			updateRequestSelectionUi();
		}
		function requestPageVisuals(items) {
			const rows = Array.isArray(items) ? items : [];
			const success = rows.filter((r) => r.status === "success" || Number(r.status_code || 0) < 400).length;
			const failed = rows.length - success;
			const recovered = rows.filter((r) => r.routing_summary?.outcome === "recovered").length;
			const firstByteSamples = rows.map(firstByteMsFromRequest).filter((value) => value > 0);
			const avgFirstByte = firstByteSamples.length ? Math.round(firstByteSamples.reduce((sum, value) => sum + value, 0) / firstByteSamples.length) : null;
			const totalTokens = rows.reduce((sum, r) => sum + usageFrom(r).total_tokens, 0);
			return `
      <div class="request-page-vitals">
        ${requestVital("Success", success, rows.length, "success")}
        ${requestVital("Recovered", recovered, rows.length, "warning")}
        ${requestVital("Failed", failed, rows.length, "danger")}
        <span class="request-vital request-vital-info">${iconSvg("clock")}<strong>${avgFirstByte === null ? "-" : escapeHtml(fmtMs(avgFirstByte))}</strong><small>first byte</small></span>
        <span class="request-vital request-vital-compat">${iconSvg("activity")}<strong>${escapeHtml(fmtTokenCount(totalTokens))}</strong><small>tokens</small></span>
      </div>
    `;
		}
		function requestVital(label, value, total, tone) {
			const pct = total ? Math.max(0, Math.min(100, Number(value || 0) / total * 100)) : 0;
			return `
      <span class="request-vital request-vital-${escapeHtml(tone)}" style="--vital:${svgNum(pct)}%">
        ${iconSvg(tone === "success" ? "check" : tone === "danger" ? "alert" : "rotate")}
        <strong>${escapeHtml(fmtInt(value))}</strong>
        <small>${escapeHtml(label)}</small>
      </span>
    `;
		}
		function requestSummaryRow(r) {
			const usage = usageFrom(r);
			const statusTone = requestTone(r);
			const attempts = Array.isArray(r.attempts) ? r.attempts : [];
			const failedAttempts = attempts.filter((attempt) => attempt.outcome !== "success").length;
			const provider = primaryProvider(r);
			const route = r.routing_summary?.outcome || "unknown";
			const routeTone = routeOutcomeTone(route);
			const code = Number(r.status_code || 0);
			const format = r.client_format || r.endpoint || "";
			const attemptText = attempts.length ? `${fmtInt(attempts.length)} attempts${failedAttempts ? ` / ${fmtInt(failedAttempts)} failed` : ""}` : "no attempts";
			const firstByte = firstByteMsFromRequest(r);
			const requestId = String(r.request_id || "");
			const isSelected = state.allMatchingSelected || state.selectedRequestIds.has(requestId);
			const checked = isSelected ? "checked" : "";
			return `
      <article class="request-summary-row tone-${escapeHtml(statusTone)} ${isSelected ? "is-selected" : ""}" data-request-row="${escapeHtml(requestId)}" tabindex="0" role="button" aria-label="Open request ${escapeHtml(requestId)}">
        <label class="request-row-select" title="Select request" aria-label="Select request">
          <input type="checkbox" data-request-select="${escapeHtml(requestId)}" ${checked} />
        </label>
        <span class="request-row-dot"></span>
        <span class="request-row-main">
          <strong class="mono" title="${escapeHtml(r.model || "-")}">${escapeHtml(r.model || "-")}</strong>
          <small>
            <span>${escapeHtml(fmtDate(r.finished_at))}</span>
            ${format ? `<span>${escapeHtml(format)}</span>` : ""}
          </small>
        </span>
        <span class="request-row-status">
          ${statusBadge(r.status, r.status_code)}
          <small class="mono">${code || "-"}</small>
        </span>
        <span class="request-row-route">
          <span class="request-provider-pill" title="${escapeHtml(provider)}">${escapeHtml(provider)}</span>
          <span class="route-pill ${escapeHtml(routeTone)}">${escapeHtml(routeOutcomeLabel(route))}</span>
        </span>
        <span class="request-row-metrics mono">
          <strong title="${escapeHtml(fmtInt(usage.total_tokens))} tokens">${escapeHtml(fmtTokenCount(usage.total_tokens))} <span style="font-weight: normal; color: var(--muted); opacity: 0.85; margin: 0 3px;">/</span> <span style="color: #0f172a; font-weight: 700;">${escapeHtml(fmtCost(usage.cost_usd))}</span></strong>
          <small>${escapeHtml(firstByte ? fmtMs(firstByte) : "-")} first / ${escapeHtml(attemptText)}</small>
        </span>
        <span class="request-row-open">${iconSvg("chevron-right")}</span>
      </article>
    `;
		}
		function requestTone(request) {
			const code = Number(request?.status_code || 0);
			if (request?.status === "success" || code > 0 && code < 400) return request?.routing_summary?.outcome === "recovered" ? "warning" : "success";
			if (code === 429 || code === 402) return "warning";
			return "danger";
		}
		function primaryProvider(request) {
			const summaryProvider = request?.routing_summary?.final_provider;
			if (summaryProvider) return summaryProvider;
			return (Array.isArray(request?.providers) ? request.providers.filter(Boolean) : [])[0] || "-";
		}
		function requestPagination(total, currentPage, totalPages, visibleItems) {
			const items = Array.isArray(visibleItems) ? visibleItems : [];
			const visibleCount = items.length;
			const start = total ? state.requestsPage * 10 + 1 : 0;
			const end = total ? Math.min(total, start + Number(visibleCount || 0) - 1) : 0;
			const visibleIds = items.map((item) => String(item.request_id || "")).filter(Boolean);
			const selectedVisible = state.allMatchingSelected ? visibleIds.length : visibleIds.filter((id) => state.selectedRequestIds.has(id)).length;
			const allVisibleSelected = state.allMatchingSelected || visibleIds.length > 0 && selectedVisible === visibleIds.length;
			const labelText = state.allMatchingSelected ? `${fmtInt(total)} selected` : selectedVisible ? `${fmtInt(selectedVisible)} selected` : "Select page";
			return `
      <div class="request-page-summary">
        <label class="request-page-select">
          <input type="checkbox" data-request-select-page ${allVisibleSelected ? "checked" : ""} ${visibleIds.length ? "" : "disabled"} />
          <span>${labelText}</span>
        </label>
        <strong>${fmtInt(start)}-${fmtInt(end)}</strong>
        <span>of ${fmtInt(total)} requests</span>
      </div>
      <div class="request-pagination" aria-label="Request pages">
        <button class="button secondary icon-action" type="button" data-request-page="prev" title="Previous page" aria-label="Previous page" ${currentPage <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
        <span class="request-page-indicator">Page ${fmtInt(currentPage)} / ${fmtInt(totalPages)}</span>
        <button class="button secondary icon-action" type="button" data-request-page="next" title="Next page" aria-label="Next page" ${currentPage >= totalPages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
      </div>
    `;
		}
		function bindRequestRowInteractions(root) {
			root.querySelectorAll("[data-request-row]").forEach((row) => {
				if (row.dataset.bounddatarequestrow) return;
				row.dataset.bounddatarequestrow = "1";
				const open = () => {
					const requestId = row.dataset.requestRow || "";
					if (requestId) openRequestDetail(requestId);
				};
				row.addEventListener("click", (event) => {
					if (event.target.closest(".request-row-select, input, button, a")) return;
					open();
				});
				row.addEventListener("keydown", (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					if (event.target.closest(".request-row-select, input, button, a")) return;
					event.preventDefault();
					open();
				});
			});
		}
		function bindRequestSelection(root, items) {
			root.querySelectorAll("[data-request-select]").forEach((input) => {
				if (input.dataset.bounddatarequestselect) return;
				input.dataset.bounddatarequestselect = "1";
				input.addEventListener("click", (event) => event.stopPropagation());
				input.addEventListener("change", () => {
					const requestId = input.dataset.requestSelect || "";
					if (!requestId) return;
					if (state.allMatchingSelected) {
						state.allMatchingSelected = false;
						state.selectedRequestIds.clear();
						(Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean).forEach((id) => {
							if (id !== requestId) state.selectedRequestIds.add(id);
						});
						renderRequestsTable();
					} else {
						if (input.checked) state.selectedRequestIds.add(requestId);
						else state.selectedRequestIds.delete(requestId);
						const row = input.closest("[data-request-row]");
						if (row) row.classList.toggle("is-selected", input.checked);
						updateRequestSelectionUi(root, items);
					}
				});
			});
			const pageInput = root.querySelector("[data-request-select-page]");
			if (pageInput) {
				const ids = (Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean);
				const selected = ids.filter((id) => state.selectedRequestIds.has(id)).length;
				pageInput.indeterminate = !state.allMatchingSelected && selected > 0 && selected < ids.length;
				pageInput.addEventListener("change", () => {
					state.allMatchingSelected = false;
					ids.forEach((id) => {
						if (pageInput.checked) state.selectedRequestIds.add(id);
						else state.selectedRequestIds.delete(id);
					});
					renderRequestsTable();
				});
			}
			const selectAllBtn = root.querySelector("[data-request-select-all-matching]");
			if (selectAllBtn) selectAllBtn.addEventListener("click", () => {
				state.allMatchingSelected = true;
				state.selectedRequestIds.clear();
				renderRequestsTable();
			});
			const clearAllBtn = root.querySelector("[data-request-clear-all-matching]");
			if (clearAllBtn) clearAllBtn.addEventListener("click", () => {
				state.allMatchingSelected = false;
				state.selectedRequestIds.clear();
				renderRequestsTable();
			});
		}
		function updateRequestSelectionUi(root = el("requestsTable"), items = state.data.requests?.items || []) {
			const total = Number(state.data.requests?.total || 0);
			const count = state.allMatchingSelected ? total : state.selectedRequestIds.size;
			const countEl = el("requestSelectedCount");
			if (countEl) countEl.textContent = count ? `${fmtInt(count)} selected` : "0 selected";
			const deleteButton = el("deleteRequestsButton");
			if (deleteButton) {
				if (!deleteButton.dataset.iconified) {
					updateDOM(deleteButton, iconSvg("trash"));
					deleteButton.dataset.iconified = "1";
				}
				const filters = activeRequestFilters();
				const action = count ? "Delete selected" : Object.keys(filters).length ? "Delete matching" : "Clear history";
				deleteButton.title = action;
				deleteButton.setAttribute("aria-label", action);
			}
			const ids = (Array.isArray(items) ? items : []).map((item) => String(item.request_id || "")).filter(Boolean);
			const selected = state.allMatchingSelected ? ids.length : ids.filter((id) => state.selectedRequestIds.has(id)).length;
			const pageInput = root?.querySelector?.("[data-request-select-page]");
			if (pageInput) {
				pageInput.checked = ids.length > 0 && selected === ids.length;
				pageInput.indeterminate = !state.allMatchingSelected && selected > 0 && selected < ids.length;
				const label = pageInput.closest(".request-page-select")?.querySelector("span");
				if (label) label.textContent = state.allMatchingSelected ? `${fmtInt(total)} selected` : selected ? `${fmtInt(selected)} selected` : "Select page";
			}
		}
		function syncRequestFilterUi() {
			qsa("[data-request-status]").forEach((button) => {
				const active = (button.dataset.requestStatus || "") === (state.requestFilters.status || "");
				button.classList.toggle("is-active", active);
				button.setAttribute("aria-pressed", active ? "true" : "false");
			});
		}
		function bindRequestPagination(root, totalPages) {
			root.querySelectorAll("[data-request-page]").forEach((button) => {
				if (button.dataset.bounddatarequestpage) return;
				button.dataset.bounddatarequestpage = "1";
				button.addEventListener("click", () => {
					const direction = button.dataset.requestPage;
					if (direction === "prev") state.requestsPage = Math.max(0, state.requestsPage - 1);
					if (direction === "next") state.requestsPage = Math.min(totalPages - 1, state.requestsPage + 1);
					refreshAll({ quiet: true });
				});
			});
		}
		function paginate(items, pageKey, pageSize) {
			const list = Array.isArray(items) ? items : [];
			const total = list.length;
			const totalPages = Math.max(1, Math.ceil(total / pageSize));
			const current = Math.max(0, Math.min(Number(state[pageKey] || 0), totalPages - 1));
			if (current !== state[pageKey]) state[pageKey] = current;
			const start = total ? current * pageSize : 0;
			const end = Math.min(total, start + pageSize);
			return {
				items: list.slice(start, end),
				total,
				totalPages,
				currentPage: current + 1,
				start: total ? start + 1 : 0,
				end,
				pageSize
			};
		}
		function panelPagination(pageKey, page, noun) {
			if (!page || page.total <= page.pageSize) return "";
			return `
      <div class="panel-pagination" data-pagination-for="${escapeHtml(pageKey)}">
        <span><strong>${fmtInt(page.start)}-${fmtInt(page.end)}</strong> of ${fmtInt(page.total)} ${escapeHtml(noun || "items")}</span>
        <div class="panel-pagination-actions">
          <button class="button secondary icon-action" type="button" data-list-page-key="${escapeHtml(pageKey)}" data-list-page="prev" title="Previous page" aria-label="Previous page" ${page.currentPage <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
          <span class="request-page-indicator">${fmtInt(page.currentPage)} / ${fmtInt(page.totalPages)}</span>
          <button class="button secondary icon-action" type="button" data-list-page-key="${escapeHtml(pageKey)}" data-list-page="next" title="Next page" aria-label="Next page" ${page.currentPage >= page.totalPages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
        </div>
      </div>
    `;
		}
		function bindPanelPagination(root) {
			root.querySelectorAll("[data-list-page-key]").forEach((button) => {
				if (button.dataset.bounddatalistpagekey) return;
				button.dataset.bounddatalistpagekey = "1";
				button.addEventListener("click", () => {
					const pageKey = button.dataset.listPageKey || "";
					if (!(pageKey in state)) return;
					const direction = button.dataset.listPage;
					if (direction === "prev") state[pageKey] = Math.max(0, Number(state[pageKey] || 0) - 1);
					if (direction === "next") state[pageKey] = Number(state[pageKey] || 0) + 1;
					state.forceConfigRender = true;
					state.forceModelRoutesRender = true;
					state.forceProvidersRender = true;
					state.forceModelCapsRender = true;
					renderAll();
				});
			});
		}
		function renderProvidersTable() {
			const providers = state.data.status?.router?.providers || {};
			const configProviders = state.data.config?.providers || {};
			const target = el("providersTable");
			if (!target) return;
			if (!state.forceProvidersRender && interactiveElementHasFocus("#providersTable")) return;
			state.forceProvidersRender = false;
			const allNames = providerNames(providers, configProviders);
			const filtered = allNames.map((name) => providerLightView(name)).filter(providerMatchesFiltersLight).sort((a, b) => {
				const statusOrder = {
					normal: 0,
					degraded: 1,
					cooldown: 2,
					unavailable: 3,
					disabled: 4
				};
				const aStatus = statusOrder[a.runtimeState.id] ?? 99;
				const bStatus = statusOrder[b.runtimeState.id] ?? 99;
				if (aStatus !== bStatus) return aStatus - bStatus;
				if (a.priority !== b.priority) return b.priority - a.priority;
				return a.name.localeCompare(b.name);
			});
			if (!allNames.length) {
				target.innerHTML = `<div class="empty pad">No providers configured</div>`;
				return;
			}
			if (!filtered.length) {
				target.innerHTML = `<div class="empty pad">No providers match the current filters</div>`;
				return;
			}
			const page = paginate(filtered, "providersPage", 6);
			const visibleCards = page.items.map((view) => providerViewModel(view.name));
			target.innerHTML = `
      ${panelPagination("providersPage", page, "providers")}
      <div class="provider-card-grid">${visibleCards.map(providerRuntimeCard).join("")}</div>
    `;
			bindPanelPagination(target);
			bindActionButtons(target);
			bindProviderCards(target);
		}
		function providerNames(runtimeProviders, configProviders) {
			return Array.from(new Set([...Object.keys(runtimeProviders || {}), ...Object.keys(configProviders || {})])).sort();
		}
		function providerViewModel(name) {
			const __t0 = performance.now();
			const runtime = state.data.status?.router?.providers?.[name] || {};
			const config = state.data.config?.providers?.[name] || {};
			const capability = state.data.status?.models?.providers?.[name] || {};
			const formats = config.formats || runtime.formats || {};
			const runtimeKeys = Array.isArray(runtime.keys) ? runtime.keys : [];
			const configKeys = Array.isArray(config.keys) ? config.keys : [];
			const keys = mergedProviderKeys(runtimeKeys, configKeys);
			const keyStats = providerKeyStats(runtimeKeys, configKeys);
			const formatNames = enabledFormats(formats);
			const __t1 = performance.now();
			const modelItems = providerModelItems(name, capability);
			const __t2 = performance.now();
			const routeModels = providerRouteModels(name);
			const __t3 = performance.now();
			const activity = providerActivity(name);
			const runtimeState = providerRuntimeState(runtime, keyStats, config);
			const __t4 = performance.now();
			window.__perfMark && window.__perfMark("viewModel.modelItems[" + name + "]", __t2 - __t1);
			window.__perfMark && window.__perfMark("viewModel.routeModels[" + name + "]", __t3 - __t2);
			window.__perfMark && window.__perfMark("viewModel.total[" + name + "]", __t4 - __t0);
			return {
				name,
				runtime,
				config,
				priority: Number(config.priority || 0),
				capability,
				formats,
				keys,
				configKeys,
				keyStats,
				formatNames,
				modelItems,
				routeModels,
				activity,
				runtimeState
			};
		}
		function providerLightView(name) {
			const runtime = state.data.status?.router?.providers?.[name] || {};
			const config = state.data.config?.providers?.[name] || {};
			const formats = config.formats || runtime.formats || {};
			const keyStats = providerKeyStats(Array.isArray(runtime.keys) ? runtime.keys : [], Array.isArray(config.keys) ? config.keys : []);
			const formatNames = enabledFormats(formats);
			const activity = providerActivity(name);
			const runtimeState = providerRuntimeState(runtime, keyStats, config);
			const capability = state.data.status?.models?.providers?.[name] || {};
			const modelCountLite = (Array.isArray(capability.models) ? capability.models.length : 0) || Object.keys(capability.canonical_map || {}).length;
			return {
				name,
				runtime,
				config,
				priority: Number(config.priority || 0),
				capability,
				formats,
				keyStats,
				formatNames,
				activity,
				runtimeState,
				modelCountLite,
				isLight: true
			};
		}
		function providerMatchesFiltersLight(view) {
			const filters = state.providerFilters || {};
			if (filters.format && !view.formatNames.includes(filters.format)) return false;
			if (filters.status && view.runtimeState.id !== filters.status) return false;
			if (filters.keys === "usable" && view.keyStats.usable <= 0) return false;
			if (filters.keys === "partial" && !(view.keyStats.usable > 0 && view.keyStats.usable < view.keyStats.total)) return false;
			if (filters.keys === "none" && view.keyStats.usable > 0) return false;
			if (filters.keys === "cooldown" && view.keyStats.cooldown <= 0) return false;
			const search = String(filters.search || "").trim().toLowerCase();
			if (!search) return true;
			return [
				view.name,
				view.config.base_url,
				view.runtimeState.label,
				view.formatNames.join(" "),
				view.activity.lastError?.reason
			].join(" ").toLowerCase().includes(search);
		}
		function mergedProviderKeys(runtimeKeys, configKeys) {
			if (!runtimeKeys.length) return configKeys;
			const configByIndex = new Map((configKeys || []).map((key) => [Number(key.index), key]));
			return runtimeKeys.map((key) => {
				const cfg = configByIndex.get(Number(key.index)) || {};
				return {
					...cfg,
					...key,
					masked: key.masked || cfg.masked || "",
					proxy: key.proxy || cfg.proxy || ""
				};
			});
		}
		function providerKeyStats(runtimeKeys, configKeys) {
			return {
				total: runtimeKeys.length || configKeys.length || 0,
				usable: runtimeKeys.filter((key) => key.available && key.runtime_enabled).length,
				runtimeEnabled: runtimeKeys.filter((key) => key.runtime_enabled).length,
				cooldown: runtimeKeys.filter((key) => Number(key.cooldown_remaining_s || key.disabled_remaining_s || 0) > 0).length,
				fails: runtimeKeys.reduce((sum, key) => sum + Number(key.fails || 0), 0)
			};
		}
		function providerModelItems(name, capability) {
			const base = modelCapabilityItemsMemo(name, Array.isArray(capability.models) ? capability.models : [], capability.canonical_map || {});
			const items = [];
			const seen = /* @__PURE__ */ new Set();
			const seenKey = (value) => String(value || "").trim().toLowerCase();
			const rememberModelItem = (item) => {
				[item?.label, item?.raw].forEach((value) => {
					const key = seenKey(value);
					if (key) seen.add(key);
				});
			};
			const configuredMap = state.data.config?.models?.provider_model_map?.[name] || {};
			Object.entries(configuredMap || {}).filter(([_canonical, raw]) => raw).sort(([a], [b]) => String(a).localeCompare(String(b))).forEach(([canonical, raw]) => {
				if (seen.has(seenKey(canonical)) || seen.has(seenKey(raw))) return;
				const item = {
					label: String(canonical || raw),
					raw: String(raw || ""),
					title: raw && raw !== canonical ? `${canonical} maps to ${raw}` : String(canonical || raw),
					manual: true
				};
				items.push(item);
				rememberModelItem(item);
			});
			base.forEach((item) => {
				if (seen.has(seenKey(item.label)) || seen.has(seenKey(item.raw))) return;
				items.push(item);
				rememberModelItem(item);
			});
			providerRouteModels(name).forEach((model) => {
				if (seen.has(seenKey(model))) return;
				const item = {
					label: model,
					raw: "",
					title: model
				};
				items.push(item);
				rememberModelItem(item);
			});
			return items.map((item) => ({
				...item,
				disabled: isProviderModelDisabled(name, item.label),
				pending: Object.prototype.hasOwnProperty.call(providerModelDraft(name), String(item.label || ""))
			}));
		}
		function providerModelDisabledMap(provider) {
			const disabled = state.data.config?.models?.provider_model_disabled?.[provider] || {};
			return disabled && typeof disabled === "object" ? disabled : {};
		}
		function savedProviderModelDisabled(provider, model) {
			const disabled = providerModelDisabledMap(provider);
			const key = String(model || "");
			return Boolean(disabled[key] || disabled[key.toLowerCase()]);
		}
		function providerModelDraft(provider) {
			const draft = (state.providerModelDrafts || {})[provider] || {};
			return draft && typeof draft === "object" ? draft : {};
		}
		function isProviderModelDisabled(provider, model) {
			const draft = providerModelDraft(provider);
			const key = String(model || "");
			if (Object.prototype.hasOwnProperty.call(draft, key)) return Boolean(draft[key]);
			return savedProviderModelDisabled(provider, model);
		}
		function setProviderModelDisabledDraft(provider, model, disabled) {
			if (!provider || !model) return;
			if (!state.providerModelDrafts) state.providerModelDrafts = {};
			const draft = { ...state.providerModelDrafts[provider] || {} };
			if (Boolean(disabled) === savedProviderModelDisabled(provider, model)) delete draft[model];
			else draft[model] = Boolean(disabled);
			if (Object.keys(draft).length) state.providerModelDrafts[provider] = draft;
			else delete state.providerModelDrafts[provider];
		}
		function setProviderModelsDisabledDraft(provider, modelStates) {
			if (!provider || !modelStates || typeof modelStates !== "object") return;
			if (!state.providerModelDrafts) state.providerModelDrafts = {};
			const draft = { ...state.providerModelDrafts[provider] || {} };
			Object.entries(modelStates).forEach(([model, disabled]) => {
				if (!model) return;
				if (Boolean(disabled) === savedProviderModelDisabled(provider, model)) delete draft[model];
				else draft[model] = Boolean(disabled);
			});
			if (Object.keys(draft).length) state.providerModelDrafts[provider] = draft;
			else delete state.providerModelDrafts[provider];
		}
		function providerModelDraftCount(provider) {
			return Object.keys(providerModelDraft(provider)).length;
		}
		function filteredProviderModelItems(items) {
			const filters = state.providerModelFilters || {};
			const search = String(filters.search || "").trim().toLowerCase();
			const status = String(filters.status || "");
			return (items || []).filter((item) => {
				if (status === "enabled" && item.disabled) return false;
				if (status === "disabled" && !item.disabled) return false;
				if (!search) return true;
				return [
					item.label,
					item.raw,
					item.title
				].join(" ").toLowerCase().includes(search);
			});
		}
		function providerRouteModels(name) {
			const routes = state.data.config?.models?.routes || {};
			return Object.entries(routes).filter(([_model, route]) => {
				return routeProviderItems(route?.providers).some((item) => item.name === name);
			}).map(([model]) => String(model)).sort((a, b) => a.localeCompare(b));
		}
		function providerActivity(name) {
			const aggregate = (state.data.providerActivity || {})[name];
			if (aggregate) return aggregate;
			return {
				events: [],
				total: 0,
				ok: 0,
				warn: 0,
				bad: 0,
				successRate: null,
				latestLatency: 0,
				avgLatency: 0,
				lastError: null
			};
		}
		function providerRuntimeCard(view) {
			const keyText = `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`;
			const successText = view.activity.successRate === null ? "-" : fmtPct(view.activity.successRate);
			const latencyText = view.activity.latestLatency ? fmtCompactMs(view.activity.latestLatency) : "-";
			const avgLatencyText = view.activity.avgLatency ? `${fmtCompactMs(view.activity.avgLatency)} avg` : "no first byte";
			const modelCount = view.modelItems.length;
			const primaryModels = view.modelItems.slice(0, 3);
			const recentError = view.activity.lastError?.reason || "";
			const configEnabled = view.config.enabled === false ? "config off" : "config on";
			const priorityText = `P${fmtInt(view.priority)}`;
			return `
      <article class="provider-runtime-card provider-health-tile ${view.runtimeState.tone}" data-provider-card="${escapeHtml(view.name)}" tabindex="0">
        <div class="provider-card-topline">
          <span class="provider-status-dot ${view.runtimeState.badge}"></span>
          <div class="provider-title-block">
            <div class="provider-name name-${view.runtimeState.badge}" title="${escapeHtml(view.name)}">${escapeHtml(view.name)}</div>
            <div class="provider-meta">${view.formatNames.length ? view.formatNames.map(formatChip).join("") : `<span class="muted">no enabled formats</span>`}</div>
          </div>
          <div class="provider-card-badges">
            ${badge(priorityText, priorityBadgeTone(view.priority))}
            ${badge(view.runtimeState.label, view.runtimeState.badge)}
          </div>
        </div>

        <div class="provider-card-models">
          ${view.capability.status === "pending" ? `<span class="provider-model-pill provider-model-refreshing" title="Models are being discovered in the background">${refreshSpinner()} Refreshing models…</span>` : primaryModels.length ? primaryModels.map((item) => `<span class="provider-model-pill" title="${escapeHtml(item.title)}">${escapeHtml(item.label)}${modelPriceTooltip(item.label)}</span>`).join("") : `<span class="muted">No discovered models</span>`}
          ${view.capability.status !== "pending" && modelCount > primaryModels.length ? `<span class="provider-model-more">+${fmtInt(modelCount - primaryModels.length)}</span>` : ""}
        </div>

        <div class="provider-card-metrics">
          ${providerMetric("Keys", keyText, view.keyStats.cooldown ? `${fmtInt(view.keyStats.cooldown)} cooldown` : "usable")}
          ${providerMetric("Priority", fmtInt(view.priority), "route order")}
          ${providerMetric("Models", fmtInt(modelCount), view.capability.status === "pending" ? "refreshing" : view.capability.status || "capability")}
          ${providerMetric("Success", successText, `${fmtInt(view.activity.total)} recent`)}
          ${providerMetric("First byte", latencyText, avgLatencyText)}
        </div>

        <div class="provider-card-error ${recentError ? "" : "is-empty"}">
          <span>Last issue</span>
          <strong>${recentError ? messageMarkup(recentError) : "No recent provider issue"}</strong>
        </div>

        ${providerSparkline(view.activity)}

        <div class="provider-card-footer">
          <span class="provider-config-state">${escapeHtml(configEnabled)}</span>
          <div class="provider-runtime-actions">
            <button class="button primary compact-action icon-action" type="button" data-provider-open="${escapeHtml(view.name)}" title="Details" aria-label="Details">${iconSvg("info")}</button>
            ${actionButton(view.runtime.runtime_enabled !== false ? "Disable" : "Enable", `/providers/${encodeURIComponent(view.name)}/${view.runtime.runtime_enabled !== false ? "disable" : "enable"}`, view.runtime.runtime_enabled !== false ? "danger" : "secondary", { iconOnly: true })}
            ${actionButton("Clear cooldown", `/providers/${encodeURIComponent(view.name)}/cooldown/clear`, "secondary", { iconOnly: true })}
          </div>
        </div>
      </article>
    `;
		}
		function providerMetric(label, value, hint) {
			return `
      <span class="provider-card-metric" title="${escapeHtml(`${label}: ${value} / ${hint}`)}">
        <b>${iconSvg(metricIcon(label))}</b>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </span>
    `;
		}
		function metricIcon(label) {
			const text = String(label || "").toLowerCase();
			if (text.includes("key")) return "key";
			if (text.includes("priority")) return "arrow-up";
			if (text.includes("model")) return "boxes";
			if (text.includes("success")) return "activity";
			if (text.includes("latency")) return "clock";
			return "dot";
		}
		function formatChip(fmt) {
			return `<span class="format-chip tone-${escapeHtml(toneForText(fmt))}" title="${escapeHtml(formatLabel(fmt))}">${escapeHtml(shortFormatLabel(fmt))}</span>`;
		}
		function shortFormatLabel(fmt) {
			if (fmt === "chat_completions") return "Chat";
			if (fmt === "responses") return "Responses";
			if (fmt === "anthropic_messages") return "Anthropic";
			return String(fmt || "");
		}
		function providerSparkline(activity) {
			const raw = Array.isArray(activity?.events) ? activity.events.slice(-24) : [];
			return `
      <div class="provider-sparkline" aria-label="Recent provider attempts">
        ${(raw.length ? raw : Array.from({ length: 24 }, () => ({
				tone: "neutral",
				reason: "No recent calls"
			}))).map((event) => `
          <span class="provider-spark ${escapeHtml(event.tone)}" title="${escapeHtml(`${fmtDate(event.ts)} / ${event.model || "-"} / ${event.reason || event.status || "-"}`)}"></span>
        `).join("")}
      </div>
    `;
		}
		function bindProviderCards(target) {
			target.querySelectorAll("[data-provider-open]").forEach((button) => {
				if (button.dataset.bounddataprovideropen) return;
				button.dataset.bounddataprovideropen = "1";
				button.addEventListener("click", (event) => {
					event.stopPropagation();
					openProviderDrawer(button.dataset.providerOpen || "");
				});
			});
			target.querySelectorAll("[data-provider-card]").forEach((card) => {
				if (card.dataset.bounddataprovidercard) return;
				card.dataset.bounddataprovidercard = "1";
				const open = () => openProviderDrawer(card.dataset.providerCard || "");
				card.addEventListener("click", (event) => {
					if (event.target.closest("button, input, select, textarea, a, summary, details, form")) return;
					open();
				});
				card.addEventListener("keydown", (event) => {
					if (event.key !== "Enter" && event.key !== " ") return;
					if (event.target.closest("button, input, select, textarea, a")) return;
					event.preventDefault();
					open();
				});
			});
		}
		function syncProviderFiltersFromControls() {
			state.providerFilters = {
				search: el("providerSearchInput")?.value || "",
				format: el("providerFormatFilter")?.value || "",
				status: el("providerStatusFilter")?.value || "",
				keys: el("providerKeyFilter")?.value || ""
			};
			state.providersPage = 0;
			state.forceProvidersRender = true;
			renderProvidersTable();
		}
		function clearProviderFilters() {
			[
				"providerSearchInput",
				"providerFormatFilter",
				"providerStatusFilter",
				"providerKeyFilter"
			].forEach((id) => {
				const node = el(id);
				if (node) node.value = "";
			});
			syncProviderFiltersFromControls();
		}
		function openProviderDrawer(name, tab = "") {
			if (!name) return;
			closeDrawer(false);
			closeModelDrawer();
			state.providerDrawerName = name;
			if (tab) state.providerDrawerTab = tab;
			resetProviderActivityEventsCache(name);
			const drawer = el("providerDrawer");
			if (!drawer) return;
			drawer.classList.add("is-open");
			drawer.setAttribute("aria-hidden", "false");
			renderProviderDrawer({ force: true });
		}
		function closeProviderDrawer() {
			const drawer = el("providerDrawer");
			if (!drawer) return;
			drawer.classList.remove("is-open");
			drawer.setAttribute("aria-hidden", "true");
			state.providerDrawerName = "";
			resetProviderActivityEventsCache("");
		}
		function renderProviderDrawer({ force = false } = {}) {
			const drawer = el("providerDrawer");
			const body = el("providerDrawerBody");
			const name = state.providerDrawerName;
			if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
			if (!force && interactiveElementHasFocus("#providerDrawer")) return;
			const view = providerViewModel(name);
			const tabs = [
				"overview",
				"keys",
				"models",
				"routing",
				"config"
			];
			if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
			el("providerDrawerTitle").textContent = name;
			el("providerDrawerSubtitle").textContent = `${view.runtimeState.label} / ${view.keyStats.usable}/${view.keyStats.total} usable keys / ${fmtInt(view.modelItems.length)} models`;
			updateDOM(body, `
      <div class="provider-drawer-tabs" role="tablist" aria-label="Provider detail sections">
        ${tabs.map((tab) => `
          <button class="provider-drawer-tab ${state.providerDrawerTab === tab ? "is-active" : ""}" type="button" data-provider-drawer-tab="${escapeHtml(tab)}">
            ${escapeHtml(capitalize(tab))}
          </button>
        `).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
			bindProviderDrawerEvents(body);
			if (state.providerDrawerTab === "overview") loadProviderActivityEvents(name);
		}
		var _tabSwitchRaf = 0;
		function renderProviderDrawerTabSwitch() {
			if (_tabSwitchRaf) return;
			_tabSwitchRaf = requestAnimationFrame(() => {
				_tabSwitchRaf = 0;
				_renderProviderDrawerTabSwitchNow();
			});
		}
		function _renderProviderDrawerTabSwitchNow() {
			const drawer = el("providerDrawer");
			const body = el("providerDrawerBody");
			const name = state.providerDrawerName;
			if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
			const tabs = [
				"overview",
				"keys",
				"models",
				"routing",
				"config"
			];
			if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
			const view = providerViewModel(name);
			updateDOM(body, `
      <div class="provider-drawer-tabs" role="tablist" aria-label="Provider detail sections">
        ${tabs.map((tab) => `
          <button class="provider-drawer-tab ${state.providerDrawerTab === tab ? "is-active" : ""}" type="button" data-provider-drawer-tab="${escapeHtml(tab)}">
            ${escapeHtml(capitalize(tab))}
          </button>
        `).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
			bindProviderDrawerEvents(body);
			if (state.providerDrawerTab === "overview") loadProviderActivityEvents(name);
		}
		function bindProviderDrawerEvents(root) {
			root.querySelectorAll("[data-provider-drawer-tab]").forEach((button) => {
				if (button.dataset.bounddataproviderdrawertab) return;
				button.dataset.bounddataproviderdrawertab = "1";
				button.addEventListener("click", () => {
					state.providerDrawerTab = button.dataset.providerDrawerTab || "overview";
					renderProviderDrawerTabSwitch();
				});
			});
			if (!root.dataset.boundprovideractivityrows) {
				root.dataset.boundprovideractivityrows = "1";
				root.addEventListener("click", (event) => {
					const row = event.target.closest(".provider-activity-row[data-request-id]");
					if (!row || !root.contains(row)) return;
					openRequestDetail(row.dataset.requestId || "");
				});
			}
			bindKeyDeleteButtons(root);
			bindProbeModelPickers(root);
			bindKeyTestButtons(root);
			bindActionButtons(root);
			bindConfigProviderForms(root);
			bindProviderModelRefreshButtons(root);
			bindProviderModelDisableControls(root);
			root.querySelectorAll(".config-static-models-form").forEach((form) => {
				if (form.dataset.boundconfigstaticmodelsform) return;
				form.dataset.boundconfigstaticmodelsform = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const provider = form.dataset.provider || "";
					const raw = String(form.elements.static_models.value || "").trim();
					const additions = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
					const existing = state.data.config?.providers?.[provider]?.static_models || [];
					const seen = /* @__PURE__ */ new Set();
					const models = [];
					[...Array.isArray(existing) ? existing : [], ...additions].forEach((model) => {
						const value = String(model || "").trim();
						if (!value || seen.has(value)) return;
						seen.add(value);
						models.push(value);
					});
					await runConfigMutation(form, async () => {
						await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
						setNotice(`Static models for ${provider} saved.`, "ok");
						form.elements.static_models.value = "";
					});
				});
			});
			root.querySelectorAll("[data-clear-static-models]").forEach((button) => {
				if (button.dataset.bounddataclearstaticmodels) return;
				button.dataset.bounddataclearstaticmodels = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.clearStaticModels || "";
					button.disabled = true;
					try {
						await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: [] });
						setNotice(`Static models for ${provider} cleared.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
						renderProviderDrawer({ force: true });
					} catch (err) {
						setNotice(`Failed: ${err.message}`);
					} finally {
						button.disabled = false;
					}
				});
			});
			root.querySelectorAll("[data-delete-static-model]").forEach((button) => {
				if (button.dataset.bounddatadeletestaticmodel) return;
				button.dataset.bounddatadeletestaticmodel = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.deleteStaticProvider || "";
					const model = button.dataset.deleteStaticModel || "";
					const existing = state.data.config?.providers?.[provider]?.static_models || [];
					const models = (Array.isArray(existing) ? existing : []).filter((item) => String(item || "") !== model);
					button.disabled = true;
					try {
						await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
						setNotice(`Static model ${model} removed from ${provider}.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
						renderProviderDrawer({ force: true });
					} catch (err) {
						setNotice(`Failed: ${err.message}`);
					} finally {
						button.disabled = false;
					}
				});
			});
		}
		function providerDrawerPanel(view) {
			if (state.providerDrawerTab === "keys") return providerDrawerKeys(view);
			if (state.providerDrawerTab === "models") return providerDrawerModels(view);
			if (state.providerDrawerTab === "routing") return providerDrawerRouting(view);
			if (state.providerDrawerTab === "config") return providerDrawerConfig(view);
			return providerDrawerOverview(view);
		}
		function providerDrawerOverview(view) {
			const recent = (Array.isArray(view.activity.events) ? view.activity.events : []).slice(-10).reverse();
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-hero ${view.runtimeState.tone}">
          <div>
            <span class="provider-status-dot ${view.runtimeState.badge}"></span>
            <strong>${escapeHtml(view.runtimeState.label)}</strong>
            <p>${escapeHtml(view.config.base_url || "No base_url configured")}</p>
          </div>
          <div class="runtime-state-strip">
            ${providerStateChips(view)}
          </div>
        </div>
        <div class="provider-detail-metrics">
          ${miniMetric("Keys", `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`, "usable")}
          ${miniMetric("Priority", fmtInt(view.priority), "higher first")}
          ${miniMetric("Success", view.activity.successRate === null ? "-" : fmtPct(view.activity.successRate), `${fmtInt(view.activity.total)} recent`)}
          ${miniMetric("Avg first byte", view.activity.avgLatency ? fmtMs(view.activity.avgLatency) : "-", "successful calls")}
          ${miniMetric("Last first byte", view.activity.latestLatency ? fmtMs(view.activity.latestLatency) : "-", "latest success")}
        </div>
        <h3 class="drawer-section-title">Recent provider activity</h3>
        <div class="provider-activity-list" data-provider-activity-list="${escapeHtml(view.name)}">
          ${recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">Loading recent activity…</div>`}
        </div>
      </section>
    `;
		}
		var _providerActivityEventsState = {
			name: "",
			loading: false,
			loaded: false
		};
		async function loadProviderActivityEvents(name) {
			if (!name) return;
			if (_providerActivityEventsState.loading) return;
			if (_providerActivityEventsState.name === name && _providerActivityEventsState.loaded) return;
			_providerActivityEventsState.name = name;
			_providerActivityEventsState.loading = true;
			try {
				const resp = await apiGet(`/-/admin/provider-activity/${encodeURIComponent(name)}`);
				const activity = resp && resp.activity || null;
				const aggregate = (state.data.providerActivity || {})[name] || {};
				if (activity) state.data.providerActivity[name] = {
					...aggregate,
					...activity
				};
				_providerActivityEventsState.loaded = true;
				if (state.providerDrawerName !== name || state.providerDrawerTab !== "overview") return;
				const lists = document.querySelectorAll("[data-provider-activity-list]");
				const list = Array.from(lists).find((el) => el.getAttribute("data-provider-activity-list") === name);
				if (list) {
					const recent = (Array.isArray(activity?.events) ? activity.events : []).slice(-10).reverse();
					list.innerHTML = recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">No recent calls for this provider</div>`;
				}
			} catch (_err) {} finally {
				_providerActivityEventsState.loading = false;
			}
		}
		function resetProviderActivityEventsCache(name) {
			if (_providerActivityEventsState.name !== name) {
				_providerActivityEventsState.name = name || "";
				_providerActivityEventsState.loaded = false;
			}
		}
		function providerDrawerKeys(view) {
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Usable", fmtInt(view.keyStats.usable), "keys")}
          ${miniMetric("Runtime on", fmtInt(view.keyStats.runtimeEnabled), "keys")}
          ${miniMetric("Cooldown", fmtInt(view.keyStats.cooldown), "keys")}
          ${miniMetric("Fails", fmtInt(view.keyStats.fails), "runtime")}
        </div>
        <div class="provider-key-list drawer-key-list">
          ${view.keys.length ? view.keys.map((key) => keyCard(view.name, key, view.keyStats.total)).join("") : `<div class="empty pad-slim">No keys configured</div>`}
        </div>
      </section>
    `;
		}
		function providerDrawerModels(view) {
			const capability = view.capability || {};
			const modelItems = view.modelItems;
			const visibleItems = filteredProviderModelItems(modelItems);
			const disabledCount = modelItems.filter((item) => item.disabled).length;
			const modelFilters = state.providerModelFilters || {};
			const draftCount = providerModelDraftCount(view.name);
			const staticModels = [];
			const seenStatic = /* @__PURE__ */ new Set();
			(Array.isArray(view.config.static_models) ? view.config.static_models : []).forEach((model) => {
				const value = String(model || "").trim();
				if (!value || seenStatic.has(value)) return;
				seenStatic.add(value);
				staticModels.push(value);
			});
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Capability", capability.status === "pending" ? "refreshing" : capability.status || "not fetched", "models endpoint")}
          ${miniMetric("Models", fmtInt(modelItems.length), "canonical/raw")}
          ${miniMetric("Disabled", fmtInt(disabledCount), "provider")}
          ${miniMetric("Fetched", capability.fetched_at ? fmtDate(capability.fetched_at) : "-", "snapshot")}
          ${miniMetric("Routes", fmtInt(view.routeModels.length), "configured")}
        </div>
        ${capability.status === "pending" ? `<div class="model-capability-refreshing">${refreshSpinner()} Discovering models in the background…</div>` : ""}
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <div class="provider-model-toolbar">
          <input class="control provider-model-search" type="search"
            data-provider-model-search="${escapeHtml(view.name)}"
            placeholder="Search models"
            value="${escapeHtml(modelFilters.search || "")}" />
          <select class="control provider-model-status-filter" data-provider-model-status-filter="${escapeHtml(view.name)}">
            <option value="" ${!modelFilters.status ? "selected" : ""}>All</option>
            <option value="enabled" ${modelFilters.status === "enabled" ? "selected" : ""}>Enabled</option>
            <option value="disabled" ${modelFilters.status === "disabled" ? "selected" : ""}>Disabled</option>
          </select>
          <button class="button small secondary" type="button"
            data-provider-model-bulk="${escapeHtml(view.name)}"
            data-provider-model-bulk-action="disable"
            title="Stage disable visible models"
            aria-label="Stage disable visible models"
            ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye-off")}</button>
          <button class="button small secondary" type="button"
            data-provider-model-bulk="${escapeHtml(view.name)}"
            data-provider-model-bulk-action="enable"
            title="Stage enable visible models"
            aria-label="Stage enable visible models"
            ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye")}</button>
          <button class="button small icon-action" type="button"
            data-provider-model-apply="${escapeHtml(view.name)}"
            title="Apply model changes${draftCount ? ` (${draftCount})` : ""}"
            aria-label="Apply model changes"
            ${draftCount ? "" : "disabled"}>${iconSvg("save")}</button>
          <button class="button small secondary icon-action" type="button"
            data-provider-model-reset="${escapeHtml(view.name)}"
            title="Reset staged model changes"
            aria-label="Reset staged model changes"
            ${draftCount ? "" : "disabled"}>${iconSvg("undo")}</button>
        </div>
        <div class="model-chip-list provider-drawer-models">
          ${visibleItems.length ? visibleItems.slice(0, 100).map((item) => `
            <span class="model-map-chip provider-model-chip ${item.disabled ? "is-disabled" : ""} ${item.pending ? "is-pending" : ""} ${item.manual ? "is-manual-map" : ""}">
              <button class="model-chip-toggle" type="button"
                data-provider-model-disable-provider="${escapeHtml(view.name)}"
                data-provider-model-disable-model="${escapeHtml(item.label)}"
                data-provider-model-disable-next="${item.disabled ? "false" : "true"}"
                title="${escapeHtml(`${item.disabled ? "Stage enable" : "Stage disable"} ${item.title}`)}"
                aria-label="${escapeHtml(`${item.disabled ? "Stage enable" : "Stage disable"} ${item.label}`)}">
                <b>${escapeHtml(item.label)}</b>
                ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
                ${item.pending ? `<small class="model-pending-note">pending</small>` : ""}
              </button>
              <button class="model-map-edit-button" type="button"
                data-provider-model-map-edit-provider="${escapeHtml(view.name)}"
                data-provider-model-map-edit-model="${escapeHtml(item.label)}"
                data-provider-model-map-edit-raw="${escapeHtml(item.raw || item.label)}"
                data-provider-model-map-edit-manual="${item.manual ? "1" : "0"}"
                title="Edit model mapping"
                aria-label="${escapeHtml(`Edit mapping for ${item.label}`)}">${iconSvg("pencil")}</button>
            </span>
          `).join("") + (visibleItems.length > 100 ? `<span class="muted" style="padding: 4px 8px;">+ ${visibleItems.length - 100} more models...</span>` : "") : `<span class="muted">No matching models</span>`}
        </div>
        <div class="provider-models-actions">
          <button class="button secondary icon-action" type="button"
            data-provider-models-refresh="${escapeHtml(view.name)}"
            title="Refresh models"
            aria-label="Refresh models">${iconSvg("rotate")}</button>
        </div>
        <h3 class="drawer-section-title">Static models (fallback when /v1/models unreachable)</h3>
        <form class="config-static-models-form" data-provider="${escapeHtml(view.name)}">
          ${staticModels.length ? `
            <div class="model-chip-list static-model-chip-list">
              ${staticModels.slice(0, 100).map((model) => `
                <span class="model-map-chip static-model-chip">
                  <b>${escapeHtml(model)}</b><small>static</small>
                  <button class="static-model-delete" type="button"
                    title="Remove ${escapeHtml(model)}"
                    aria-label="Remove ${escapeHtml(model)}"
                    data-delete-static-provider="${escapeHtml(view.name)}"
                    data-delete-static-model="${escapeHtml(model)}">x</button>
                </span>
              `).join("") + (staticModels.length > 100 ? `<span class="muted" style="padding: 4px 8px;">+ ${staticModels.length - 100} more...</span>` : "")}
            </div>
          ` : `<span class="muted">No static models configured</span>`}
          <div class="form-row">
            <label for="static-models-${escapeHtml(view.name)}">Add model IDs</label>
            <input id="static-models-${escapeHtml(view.name)}" name="static_models" type="text"
              placeholder="e.g. gpt-4o, claude-3-5-sonnet-20241022"
              value=""
              style="font-family:monospace;width:100%">
            <small class="muted">Comma-separated. New entries are appended and de-duplicated.</small>
          </div>
          <div class="form-actions">
            <button class="button small" type="submit">Add models</button>
            ${staticModels.length ? `<button class="button small secondary" type="button" data-clear-static-models="${escapeHtml(view.name)}">Clear</button>` : ""}
          </div>
        </form>
      </section>
    `;
		}
		function providerDrawerRouting(view) {
			const routing = state.data.config?.routing || {};
			const defaultPool = Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool : [];
			const routeRows = providerRoutingRows(view.name);
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Default pool", defaultPool.includes(view.name) ? "yes" : "no", routing.provider_select || "priority_failover")}
          ${miniMetric("Priority", fmtInt(view.priority), "provider")}
          ${miniMetric("Route models", fmtInt(routeRows.length), "explicit")}
          ${miniMetric("Provider select", routing.provider_select || "priority_failover", "default")}
          ${miniMetric("Max attempts", fmtInt(routing.max_attempts), "request")}
        </div>
        <div class="provider-route-list">
          ${routeRows.length ? routeRows.slice(0, 50).map((row) => `
            <article class="provider-route-card">
              <div>
                <strong class="mono">${escapeHtml(row.model)}</strong>
                <small>${escapeHtml(row.providerText)}</small>
              </div>
              ${badge(row.select || routing.provider_select || "priority_failover", "info")}
            </article>
          `).join("") + (routeRows.length > 50 ? `<div class="pad-slim muted">+ ${routeRows.length - 50} more routes...</div>` : "") : `<div class="empty pad-slim">No explicit model route includes this provider</div>`}
        </div>
      </section>
    `;
		}
		function providerDrawerConfig(view) {
			return `
      <section class="provider-drawer-section">
        ${providerEditPanel(view.name, view.config, view.configKeys, view.formats, { includeFormats: true })}
        <div class="provider-danger-zone">
          <div>
            <strong>Delete provider</strong>
            <p>Remove this provider from config, route pools, model maps, and capability snapshots.</p>
          </div>
          <button class="button danger icon-action" type="button" data-provider-delete="${escapeHtml(view.name)}" title="Delete provider" aria-label="Delete provider">${iconSvg("trash")}</button>
        </div>
      </section>
    `;
		}
		function providerRoutingRows(name) {
			const routes = state.data.config?.models?.routes || {};
			return Object.entries(routes).map(([model, route]) => {
				const providers = routeProviderItems(route?.providers);
				return {
					model,
					select: route?.provider_select || "",
					providers,
					providerText: providers.map((item) => `${item.name}:${item.weight}${item.priority !== null && item.priority !== void 0 ? `:${item.priority}` : ""}`).join(", ")
				};
			}).filter((row) => row.providers.some((item) => item.name === name)).sort((a, b) => a.model.localeCompare(b.model));
		}
		function providerActivityRow(event) {
			return `
      <button class="provider-activity-row ${escapeHtml(event.tone)}" type="button" ${event.requestId ? `data-request-id="${escapeHtml(event.requestId)}"` : ""}>
        <span class="provider-status-dot ${escapeHtml(event.tone)}"></span>
        <strong>${escapeHtml(event.model || "-")}</strong>
        <small>${escapeHtml(fmtDate(event.ts))}</small>
        <span>${messageMarkup(event.reason || event.status || "-")}</span>
        <em>${event.latencyMs ? escapeHtml(fmtMs(event.latencyMs)) : "-"}</em>
      </button>
    `;
		}
		function providerStateChips(view) {
			const runtimeOn = view.runtime.runtime_enabled !== false;
			const configOn = view.config.enabled !== false && view.runtime.config_enabled !== false;
			return [
				badge(configOn ? "config on" : "config off", configOn ? "ok" : "bad"),
				badge(runtimeOn ? "runtime on" : "runtime off", runtimeOn ? "ok" : "bad"),
				badge(view.runtime.available ? "available" : "not available", view.runtime.available ? "ok" : "warn"),
				badge(`${fmtInt(view.runtime.cooldown_remaining_s)}s cooldown`, Number(view.runtime.cooldown_remaining_s || 0) > 0 ? "warn" : "neutral")
			].join(" ");
		}
		function capitalize(value) {
			const text = String(value || "");
			return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
		}
		function renderModelCapabilities() {
			const target = el("modelCapabilities");
			if (!target) return;
			if (!state.forceModelCapsRender && interactiveElementHasFocus("#modelCapabilities")) return;
			state.forceModelCapsRender = false;
			const snapshot = state.data.status?.models || {};
			const providers = snapshot.providers || {};
			const configProviders = state.data.config?.providers || {};
			const names = Array.from(new Set([...Object.keys(configProviders), ...Object.keys(providers)])).sort();
			const unionCount = Array.isArray(snapshot.union_model_ids) ? snapshot.union_model_ids.length : 0;
			const header = `
      <div class="model-capability-summary">
        ${miniMetric("Models source", snapshot.models_source || "-", "config")}
        ${miniMetric("Union models", fmtInt(unionCount), "canonical ids")}
        ${miniMetric("Providers", fmtInt(names.length), "configured")}
      </div>
    `;
			if (!names.length) {
				target.classList.add("empty");
				target.innerHTML = `${header}<div class="pad-slim">No providers configured</div>`;
				return;
			}
			target.classList.remove("empty");
			target.innerHTML = `${header}${names.map((name) => modelCapabilityCard(name, providers[name] || {}, configProviders[name] || {})).join("")}`;
		}
		function modelCapabilityCard(name, capability, providerConfig) {
			const status = capability.status || "not_fetched";
			const tone = status === "ok" ? "success" : status === "error" ? "danger" : "neutral";
			const models = Array.isArray(capability.models) ? capability.models : [];
			const canonicalMap = capability.canonical_map || {};
			const mapEntries = Object.entries(canonicalMap).sort();
			const modelItems = modelCapabilityItemsMemo(name, models, canonicalMap);
			const formats = Array.isArray(capability.formats) && capability.formats.length ? capability.formats : enabledFormats(providerConfig.formats || {});
			return `
      <article class="model-capability-card tone-${toneForText(status)}">
        <div class="provider-runtime-head">
          <div class="provider-title-block">
            <div class="provider-name">${escapeHtml(name)}</div>
            <div class="provider-meta">${chipList(formats, "no enabled formats")}</div>
          </div>
          ${status === "pending" ? `<span class="badge neutral provider-cap-refreshing-badge">${refreshSpinner()} refreshing</span>` : badge(status, tone === "success" ? "ok" : tone === "danger" ? "bad" : "neutral")}
        </div>
        <div class="provider-metrics">
          ${miniMetric("Models", fmtInt(modelItems.length), "available")}
          ${miniMetric("Mapped", fmtInt(mapEntries.length), "canonical ids")}
          ${miniMetric("Fetched", capability.fetched_at ? fmtDate(capability.fetched_at) : "-", "snapshot")}
          ${miniMetric("Config", providerConfig.enabled === false ? "off" : "on", "provider")}
        </div>
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <div class="model-chip-list">
          ${modelItems.length ? modelItems.slice(0, 18).map((item) => `
            <span class="model-map-chip" data-model-name="${escapeHtml(item.label)}" title="${escapeHtml(item.title)}">
              <b>${escapeHtml(item.label)}</b>
              ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
              ${modelPriceTooltip(item.label)}
            </span>
          `).join("") : `<span class="muted">No discovered models</span>`}
          ${modelItems.length > 18 ? `<span class="tag">+${fmtInt(modelItems.length - 18)} more</span>` : ""}
        </div>
      </article>
    `;
		}
		var _modelCapabilityItemsCache = /* @__PURE__ */ new Map();
		function modelCapabilityItemsMemo(name, models, canonicalMap) {
			const cacheKey = `${name}\n${Number(state.data?.version || 0)}`;
			const cached = _modelCapabilityItemsCache.get(cacheKey);
			if (cached) return cached;
			const items = modelCapabilityItems(models, canonicalMap);
			_modelCapabilityItemsCache.set(cacheKey, items);
			return items;
		}
		function modelCapabilityItems(models, canonicalMap) {
			const items = [];
			const seen = /* @__PURE__ */ new Set();
			const seenKey = (value) => String(value || "").trim().toLowerCase();
			const push = (label, raw) => {
				const safeLabel = String(label || raw || "").trim();
				const safeRaw = String(raw || "").trim();
				if (!safeLabel) return;
				if (seen.has(seenKey(safeLabel)) || seen.has(seenKey(safeRaw))) return;
				[safeLabel, safeRaw].forEach((value) => {
					const key = seenKey(value);
					if (key) seen.add(key);
				});
				items.push({
					label: safeLabel,
					raw: safeRaw,
					title: safeRaw && safeRaw !== safeLabel ? `${safeLabel} maps to ${safeRaw}` : safeLabel
				});
			};
			Object.entries(canonicalMap || {}).sort(([a], [b]) => String(a).localeCompare(String(b))).forEach(([canonical, raw]) => push(canonical, raw));
			(Array.isArray(models) ? models : []).slice().sort((a, b) => String(a).localeCompare(String(b))).forEach((model) => push(model, model));
			return items;
		}
		function providerEditPanel(name, provider, keys, formats, options = {}) {
			const includeFormats = options.includeFormats !== false;
			return `
      <div class="provider-edit-panel">
        <form class="config-provider-form provider-inline-form" data-provider="${escapeHtml(name)}">
          <label class="field">
            <span>Base URL</span>
            <input class="control" name="base_url" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
          </label>
          <label class="field">
            <span>Proxy</span>
            <input class="control" name="proxy" value="${escapeHtml(provider.proxy || "")}" placeholder="direct or http://127.0.0.1:8002" />
          </label>
          <label class="field">
            <span>User-Agent override</span>
            <input class="control" name="user_agent" value="${escapeHtml(provider.user_agent || "")}" placeholder="inherit client User-Agent" />
          </label>
          <label class="field">
            <span>Priority</span>
            <input class="control" name="priority" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
          </label>
          <label class="check-field">
            <input type="checkbox" name="enabled" ${provider.enabled === false ? "" : "checked"} />
            <span>Enabled in config</span>
          </label>
          <button class="button primary" type="submit">Save config</button>
        </form>
        <div class="key-proxy-list">
          ${keys.length ? keys.map((key) => keyProxyRow(name, key)).join("") : `<span class="muted">No config keys</span>`}
        </div>
        <form class="config-key-form provider-inline-key-form" data-provider="${escapeHtml(name)}">
          <input class="control" name="key" type="password" autocomplete="off" placeholder="new api key" required />
          <input class="control" name="proxy" placeholder="optional key proxy" />
          <button class="button secondary" type="submit">Add key</button>
        </form>
        ${includeFormats ? `
          <div class="provider-formats-group">
            <h3 class="drawer-section-title">Formats <small class="drawer-section-hint">click card to toggle · pencil edits path</small></h3>
            <div class="format-route-list provider-format-edit-list">
              ${formatRouteItems(formats, name)}
            </div>
          </div>
        ` : ""}
      </div>
    `;
		}
		function keyProxyRow(provider, key) {
			const proxy = proxyText(key.proxy);
			return `
      <form class="key-proxy-row" data-provider="${escapeHtml(provider)}" data-key-index="${escapeHtml(key.index)}">
        <div class="key-proxy-id">
          <strong class="mono">key ${escapeHtml(key.index)}</strong>
          <span title="${escapeHtml(key.key_id || "")}">${escapeHtml(key.masked || key.key_id || "-")}</span>
        </div>
        <label class="field key-proxy-field">
          <span>Key proxy</span>
          <input class="control" name="proxy" value="${escapeHtml(proxy)}" placeholder="inherit provider/global" />
        </label>
        <button class="button secondary compact-action" type="submit">Save</button>
      </form>
    `;
		}
		function providerRuntimeState(p = {}, keyStats = null, config = {}) {
			const stats = keyStats || providerKeyStats(Array.isArray(p.keys) ? p.keys : [], []);
			const enabled = p.enabled !== false && p.config_enabled !== false && p.runtime_enabled !== false && config.enabled !== false;
			const providerCooldown = Number(p.cooldown_remaining_s || 0);
			const hardFailure = Boolean(p.has_hard_failure);
			if (!enabled) return {
				id: "disabled",
				label: "disabled",
				tone: "is-disabled",
				badge: "bad"
			};
			if (providerCooldown > 0) return {
				id: "cooldown",
				label: "cooldown",
				tone: "is-cooldown",
				badge: "warn"
			};
			if (stats.total > 0 && stats.usable <= 0) {
				if (stats.cooldown > 0) return {
					id: "cooldown",
					label: "key cooldown",
					tone: "is-cooldown",
					badge: "warn"
				};
				return {
					id: "unavailable",
					label: "no usable key",
					tone: "is-unavailable",
					badge: "bad"
				};
			}
			if (hardFailure) return {
				id: "degraded",
				label: "degraded",
				tone: "is-degraded",
				badge: "warn"
			};
			if (p.available) {
				if (stats.total > 0 && stats.usable < stats.total) return {
					id: "degraded",
					label: "degraded",
					tone: "is-degraded",
					badge: "warn"
				};
				return {
					id: "normal",
					label: "normal",
					tone: "is-available",
					badge: "ok"
				};
			}
			return {
				id: "unavailable",
				label: "unavailable",
				tone: "is-unavailable",
				badge: "warn"
			};
		}
		function miniMetric(label, value, hint) {
			return `
      <div class="mini-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(hint)}</small>
      </div>
    `;
		}
		function formatRouteItems(formats, provider) {
			const rows = Object.entries(formats || {}).sort();
			if (!rows.length) return `<span class="empty">No format routes</span>`;
			const interactive = Boolean(provider);
			return rows.map(([name, cfg]) => {
				const enabled = cfg?.enabled;
				const path = cfg?.path || "-";
				const label = formatLabel(name) || name;
				const dataAttrs = interactive ? `data-format-provider="${escapeHtml(provider)}" data-format="${escapeHtml(name)}" data-format-enabled="${enabled ? "1" : "0"}" data-format-path="${escapeHtml(cfg?.path || "")}" role="button" tabindex="0" aria-label="${escapeHtml(`${enabled ? "Disable" : "Enable"} ${label} for ${provider}`)}"` : "";
				const edit = interactive ? `
          <button class="format-route-edit" type="button"
            data-format-path-edit
            title="Edit path"
            aria-label="${escapeHtml(`Edit ${label} path for ${provider}`)}">${iconSvg("pencil")}</button>
        ` : "";
				return `
        <span class="format-route ${enabled ? "enabled" : "disabled"} ${interactive ? "is-interactive" : ""}" ${dataAttrs}>
          <span class="format-route-main">
            <b>${escapeHtml(label)}</b>
            <small>${escapeHtml(path)}</small>
          </span>
          ${edit}
        </span>
      `;
			}).join("");
		}
		function probeBadge(provider, keyIndex) {
			const probe = state.keyProbes[`${provider}#${keyIndex}`];
			if (!probe) return "";
			if (probe.pending) return badge("testing", "info");
			if (probe.ok) return badge(`probe ok${probe.latency_ms != null ? ` ${fmtInt(probe.latency_ms)}ms` : ""}`, "ok");
			return badge(`probe fail${probe.http_status ? ` ${fmtInt(probe.http_status)}` : probe.error_type ? ` ${probe.error_type}` : ""}`, "bad");
		}
		function providerProbeModelOptions(provider) {
			const values = [];
			const seen = /* @__PURE__ */ new Set();
			const add = (value) => {
				const text = String(value || "").trim();
				if (!text || seen.has(text)) return;
				seen.add(text);
				values.push(text);
			};
			const caps = state.data.status?.models?.providers?.[provider] || state.data.status?.models?.providers?.[String(provider)] || {};
			Object.keys(caps.canonical_map || {}).forEach(add);
			(caps.models || []).forEach(add);
			((state.data.config?.providers?.[provider] || {}).static_models || []).forEach(add);
			const providerModelMap = state.data.config?.models?.provider_model_map?.[provider] || {};
			Object.keys(providerModelMap || {}).forEach(add);
			providerRouteModels(provider).forEach(add);
			return values.sort((a, b) => a.localeCompare(b));
		}
		function probeModelSelect(provider, keyIndex) {
			const options = providerProbeModelOptions(provider);
			const probeKey = `${provider}#${keyIndex}`;
			const selected = options[0] || "";
			const optionHtml = options.length ? options.map((model, index) => `
        <button class="key-probe-option ${index === 0 ? "is-selected" : ""}" type="button" data-probe-model-option="${escapeHtml(model)}" title="${escapeHtml(model)}">
          <span>${escapeHtml(model)}</span>
        </button>
      `).join("") : `<div class="key-probe-empty">No discovered models</div>`;
			return `
      <div class="key-probe-model" data-probe-model-picker>
        <button class="control compact-control key-probe-trigger" type="button" data-probe-model-trigger title="${escapeHtml(selected || "No discovered models")}" ${options.length ? "" : "disabled"}>
          <span data-probe-model-label>${escapeHtml(selected || "No discovered models")}</span>
        </button>
        <input type="hidden" data-key-test-model="${escapeHtml(probeKey)}" value="${escapeHtml(selected)}" />
        <div class="key-probe-menu" data-probe-model-menu hidden>
          <input class="control key-probe-search" type="search" data-probe-model-search placeholder="Filter models" autocomplete="off" />
          <div class="key-probe-option-list" data-probe-model-options>
            ${optionHtml}
          </div>
        </div>
      </div>
    `;
		}
		function keyCard(provider, key, totalKeys = 0) {
			const available = key.available && key.runtime_enabled;
			const tone = available ? "ok" : key.runtime_enabled ? "warn" : "bad";
			const probeKey = `${provider}#${key.index}`;
			const probePending = Boolean(state.keyProbeInFlight[probeKey] || state.keyProbes[probeKey]?.pending);
			return `
      <article class="provider-key-card" data-key-total="${escapeHtml(totalKeys)}">
        <div class="key-card-head">
          <div>
            <div class="mono key-title">key ${escapeHtml(key.index)}</div>
            <div class="provider-meta" title="${escapeHtml(key.key_id || "")}">${escapeHtml(key.masked || key.key_id || "-")}</div>
          </div>
          <div class="key-card-badges">
            ${probeBadge(provider, key.index)}
            ${badge(available ? "available" : key.runtime_enabled ? "cooldown" : "disabled", tone)}
          </div>
        </div>
        <div class="key-card-grid">
          <span>fails</span><strong>${fmtInt(key.fails)}</strong>
          <span>cooldown</span><strong>${fmtInt(key.cooldown_remaining_s)}s</strong>
          <span>disabled</span><strong>${fmtInt(key.disabled_remaining_s)}s</strong>
        </div>
        <div class="actions key-actions">
          ${probeModelSelect(provider, key.index)}
          <button
            class="button secondary icon-action"
            type="button"
            data-key-test-provider="${escapeHtml(provider)}"
            data-key-test-index="${escapeHtml(key.index)}"
            title="Test key"
            aria-label="Test key"
            ${providerProbeModelOptions(provider).length && !probePending ? "" : "disabled"}
          >${iconSvg("bolt")}</button>
          ${actionButton(key.runtime_enabled ? "Disable key" : "Enable key", `/providers/${encodeURIComponent(provider)}/keys/${key.index}/${key.runtime_enabled ? "disable" : "enable"}`, key.runtime_enabled ? "danger" : "secondary", { iconOnly: true })}
          ${actionButton("Clear key state", `/providers/${encodeURIComponent(provider)}/keys/${key.index}/state/clear`, "secondary", { iconOnly: true })}
          <button
            class="button danger icon-action"
            type="button"
            data-key-delete-provider="${escapeHtml(provider)}"
            data-key-delete-index="${escapeHtml(key.index)}"
            data-key-delete-total="${escapeHtml(totalKeys)}"
            data-key-delete-label="${escapeHtml(key.masked || key.key_id || `key ${key.index}`)}"
            title="Delete key"
            aria-label="Delete key"
          >${iconSvg("trash")}</button>
        </div>
      </article>
    `;
		}
		function actionButton(label, path, tone, options = {}) {
			const iconOnly = Boolean(options.iconOnly);
			const classes = `button ${tone || "secondary"}${iconOnly ? " icon-action" : ""}`;
			const content = iconOnly ? iconSvg(actionIcon(label)) : escapeHtml(label);
			return `<button class="${classes}" type="button" data-action-path="${escapeHtml(path)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${content}</button>`;
		}
		function actionIcon(label) {
			const text = String(label || "").toLowerCase();
			if (text.includes("delete")) return "trash";
			if (text.includes("disable")) return "power-off";
			if (text.includes("enable")) return "power";
			if (text.includes("clear")) return "rotate";
			if (text.includes("refresh")) return "rotate";
			if (text.includes("edit")) return "pencil";
			if (text.includes("config")) return "settings";
			if (text.includes("save")) return "check";
			if (text.includes("detail")) return "info";
			return "dot";
		}
		function iconSvg(name) {
			const icons = {
				info: `<circle cx="12" cy="12" r="9"></circle><path d="M12 10v6"></path><path d="M12 7.5h.01"></path>`,
				x: `<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>`,
				"power": `<path d="M12 3v8"></path><path d="M17.7 6.3a8 8 0 1 1-11.4 0"></path>`,
				"power-off": `<path d="M12 3v4"></path><path d="M6.3 6.3a8 8 0 0 0 11.4 11.4"></path><path d="M18.7 13.8a8 8 0 0 0-2.4-7.5"></path><path d="M4 4l16 16"></path>`,
				rotate: `<path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 4v7h-7"></path>`,
				trash: `<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path>`,
				check: `<path d="M5 12l4 4L19 6"></path>`,
				key: `<circle cx="7.5" cy="12.5" r="3.5"></circle><path d="M11 12.5h9"></path><path d="M16 12.5v3"></path><path d="M19 12.5v2"></path>`,
				activity: `<path d="M3 12h4l3-7 4 14 3-7h4"></path>`,
				alert: `<path d="M12 3 2.8 20h18.4L12 3z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`,
				gauge: `<path d="M4 14a8 8 0 1 1 16 0"></path><path d="M12 14l4-4"></path><path d="M7 14h.01"></path><path d="M17 14h.01"></path>`,
				layers: `<path d="M12 3 3 8l9 5 9-5-9-5z"></path><path d="M3 12l9 5 9-5"></path><path d="M3 16l9 5 9-5"></path>`,
				server: `<rect x="4" y="4" width="16" height="6" rx="2"></rect><rect x="4" y="14" width="16" height="6" rx="2"></rect><path d="M8 7h.01"></path><path d="M8 17h.01"></path><path d="M12 7h4"></path><path d="M12 17h4"></path>`,
				"arrow-left": `<path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>`,
				"arrow-right": `<path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>`,
				"arrow-up": `<path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path>`,
				boxes: `<path d="M4 7l8-4 8 4-8 4-8-4z"></path><path d="M4 7v10l8 4 8-4V7"></path><path d="M12 11v10"></path>`,
				"chevron-right": `<path d="M9 18l6-6-6-6"></path>`,
				clock: `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>`,
				filter: `<path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>`,
				pencil: `<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path>`,
				search: `<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>`,
				eye: `<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="3"></circle>`,
				"eye-off": `<path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M7.4 7.4C4.3 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1"></path><path d="M10 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.2"></path>`,
				save: `<path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3"></path><path d="M8 21v-7h8v7"></path>`,
				undo: `<path d="M9 7H4v5"></path><path d="M4 12a8 8 0 1 0 2.3-5.7L4 7"></path>`,
				settings: `<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"></path><path d="M4 12h2"></path><path d="M18 12h2"></path><path d="M12 4v2"></path><path d="M12 18v2"></path><path d="M5.6 5.6 7 7"></path><path d="M17 17l1.4 1.4"></path><path d="M18.4 5.6 17 7"></path><path d="M7 17l-1.4 1.4"></path>`,
				dot: `<circle cx="12" cy="12" r="2"></circle>`,
				bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"></path>`
			};
			return `<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[name] || icons.dot}</svg>`;
		}
		function refreshSpinner() {
			return `<span class="refresh-spinner" aria-hidden="true">${iconSvg("rotate")}</span>`;
		}
		function bindActionButtons(root) {
			root.querySelectorAll("[data-action-path]").forEach((button) => {
				if (button.dataset.bounddataactionpath) return;
				button.dataset.bounddataactionpath = "1";
				button.addEventListener("click", async () => {
					const path = `/-/admin${button.dataset.actionPath}`;
					button.disabled = true;
					try {
						const result = await apiPost(path);
						if (result?.router) {
							state.data.status = {
								...state.data.status || {},
								router: result.router
							};
							state.data.version = Number(state.data.version || 0) + 1;
							state.forceProvidersRender = true;
							renderAll();
							renderProviderDrawer({ force: true });
						}
						await refreshAll({
							quiet: true,
							staticData: true
						});
					} catch (err) {
						setNotice(`Action failed: ${err.message}`);
					} finally {
						button.disabled = false;
					}
				});
			});
		}
		function bindProbeModelPickers(root) {
			const closePicker = (picker) => {
				const menu = picker?.querySelector?.("[data-probe-model-menu]");
				const trigger = picker?.querySelector?.("[data-probe-model-trigger]");
				if (!menu || !trigger) return;
				menu.hidden = true;
				picker.classList.remove("is-open");
				trigger.setAttribute("aria-expanded", "false");
			};
			const closeOthers = (activePicker) => {
				root.querySelectorAll("[data-probe-model-picker].is-open").forEach((picker) => {
					if (picker.dataset.bounddataprobemodelpickerisopen) return;
					picker.dataset.bounddataprobemodelpickerisopen = "1";
					if (picker !== activePicker) closePicker(picker);
				});
			};
			root.querySelectorAll("[data-probe-model-picker]").forEach((picker) => {
				if (picker.dataset.bounddataprobemodelpicker) return;
				picker.dataset.bounddataprobemodelpicker = "1";
				const trigger = picker.querySelector("[data-probe-model-trigger]");
				const menu = picker.querySelector("[data-probe-model-menu]");
				const search = picker.querySelector("[data-probe-model-search]");
				const hidden = picker.querySelector("[data-key-test-model]");
				const label = picker.querySelector("[data-probe-model-label]");
				if (!trigger || !menu || !hidden || !label) return;
				trigger.setAttribute("aria-haspopup", "listbox");
				trigger.setAttribute("aria-expanded", "false");
				trigger.addEventListener("click", (event) => {
					event.stopPropagation();
					const nextOpen = menu.hidden;
					closeOthers(picker);
					menu.hidden = !nextOpen;
					picker.classList.toggle("is-open", nextOpen);
					trigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
					if (nextOpen && search) {
						search.value = "";
						picker.querySelectorAll("[data-probe-model-option]").forEach((option) => {
							option.hidden = false;
						});
						search.focus();
					}
				});
				search?.addEventListener("input", () => {
					const needle = String(search.value || "").trim().toLowerCase();
					picker.querySelectorAll("[data-probe-model-option]").forEach((option) => {
						const model = String(option.dataset.probeModelOption || "").toLowerCase();
						option.hidden = needle ? !model.includes(needle) : false;
					});
				});
				picker.querySelectorAll("[data-probe-model-option]").forEach((option) => {
					option.addEventListener("click", (event) => {
						event.stopPropagation();
						const model = String(option.dataset.probeModelOption || "").trim();
						if (!model) return;
						hidden.value = model;
						label.textContent = model;
						trigger.title = model;
						picker.querySelectorAll("[data-probe-model-option]").forEach((item) => {
							item.classList.toggle("is-selected", item === option);
						});
						closePicker(picker);
						trigger.focus();
					});
				});
				picker.addEventListener("keydown", (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						closePicker(picker);
						trigger.focus();
					}
				});
			});
		}
		function bindKeyDeleteButtons(root) {
			root.querySelectorAll("[data-key-delete-provider]").forEach((button) => {
				if (button.dataset.bounddatakeydeleteprovider) return;
				button.dataset.bounddatakeydeleteprovider = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.keyDeleteProvider || "";
					const keyIndex = button.dataset.keyDeleteIndex || "";
					const total = Number(button.dataset.keyDeleteTotal || 0);
					const label = button.dataset.keyDeleteLabel || `key ${keyIndex}`;
					if (!provider || keyIndex === "") return;
					if (!await openConfirmDialog({
						title: "Delete key",
						message: `Delete ${label} from ${provider}?${total <= 1 ? " This is the last key; the provider will become unavailable until another key is added." : ""}`,
						acceptLabel: "Delete"
					})) return;
					button.disabled = true;
					try {
						await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/delete`, { confirm: "delete_key" });
						setNotice(`Key ${keyIndex} deleted from ${provider}.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
					} catch (err) {
						setNotice(`Delete key failed: ${err.message}`);
					} finally {
						button.disabled = false;
					}
				});
			});
		}
		function bindKeyTestButtons(root) {
			root.querySelectorAll("[data-key-test-provider]").forEach((button) => {
				if (button.dataset.bounddatakeytestprovider) return;
				button.dataset.bounddatakeytestprovider = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.keyTestProvider || "";
					const keyIndex = button.dataset.keyTestIndex || "";
					if (!provider || keyIndex === "") return;
					const probeKey = `${provider}#${keyIndex}`;
					const toastKey = `probe:${probeKey}`;
					const modelSelect = root.querySelector(`[data-key-test-model="${CSS.escape(probeKey)}"]`);
					const model = String(modelSelect?.value || "").trim();
					if (!model) {
						setNotice("Refresh model capabilities before testing this key.", "info");
						return;
					}
					if (state.keyProbeInFlight[probeKey]) return;
					state.keyProbeInFlight[probeKey] = true;
					state.keyProbes[probeKey] = { pending: true };
					button.disabled = true;
					setNotice(`Testing key ${keyIndex} of ${provider} on ${model}...`, "info", {
						key: toastKey,
						sticky: true
					});
					try {
						const result = (await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/test`, { model })).result || {};
						state.keyProbes[probeKey] = result;
						if (result.ok) {
							const shownModel = result.requested_model || model;
							const upstreamModel = result.upstream_model && result.upstream_model !== shownModel ? result.upstream_model : "";
							const upstreamText = upstreamModel ? `, upstream ${upstreamModel}` : "";
							setNotice(`Key ${keyIndex} of ${provider} works on ${shownModel} (${result.format}${upstreamText}, ${fmtInt(result.latency_ms)}ms).`, "ok", { key: toastKey });
						} else setNotice(`Key ${keyIndex} of ${provider} failed: ${result.http_status ? `HTTP ${result.http_status}` : result.error_type || "failed"}.`, "bad", { key: toastKey });
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
					} catch (err) {
						state.keyProbes[probeKey] = {
							ok: false,
							error_type: "request_error"
						};
						setNotice(`Test key failed: ${err.message}`, "bad", { key: toastKey });
					} finally {
						delete state.keyProbeInFlight[probeKey];
						button.disabled = false;
					}
				});
			});
		}
		var _modelRefreshInFlight = /* @__PURE__ */ new Set();
		function bindProviderModelRefreshButtons(root) {
			root.querySelectorAll("[data-provider-models-refresh]").forEach((button) => {
				if (button.dataset.bounddataprovidermodelsrefresh) return;
				button.dataset.bounddataprovidermodelsrefresh = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.providerModelsRefresh || "";
					if (!provider) return;
					if (_modelRefreshInFlight.has(provider)) return;
					_modelRefreshInFlight.add(provider);
					button.disabled = true;
					try {
						await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/models/refresh`);
						setNotice(`Models for ${provider} refreshed.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
						renderProviderDrawer({ force: true });
					} catch (err) {
						setNotice(`Model refresh failed: ${err.message}`, "bad");
					} finally {
						_modelRefreshInFlight.delete(provider);
						button.disabled = false;
					}
				});
			});
		}
		async function updateProviderModelDisabled(provider, models, successMessage) {
			if (!provider || !models || !Object.keys(models).length) return;
			try {
				await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/disabled`, { models });
				if (state.providerModelDrafts) delete state.providerModelDrafts[provider];
				setNotice(successMessage || `Model settings for ${provider} saved.`, "ok");
				await refreshAll({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
				renderProviderDrawer({ force: true });
			} catch (err) {
				setNotice(`Model setting failed: ${err.message}`, "bad");
			}
		}
		async function updateProviderModelMapping(provider, oldModel, rawModel, nextModel) {
			if (!provider || !oldModel || !rawModel) return false;
			try {
				await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/map`, {
					old_model: oldModel,
					model: nextModel,
					raw_model: rawModel
				});
				setNotice(nextModel ? `Model mapping saved for ${provider}.` : `Model mapping reset for ${provider}.`, "ok");
				await refreshAll({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
				renderProviderDrawer({ force: true });
				return true;
			} catch (err) {
				setNotice(`Model mapping failed: ${err.message}`, "bad");
				return false;
			}
		}
		function openProviderModelMappingModal({ provider, oldModel, rawModel, isManual }) {
			if (!provider || !oldModel || !rawModel) return;
			openFormModal({
				title: "Edit model mapping",
				subtitle: provider,
				bodyHtml: `
        <form class="model-map-form" data-provider-model-map-form>
          <label class="model-map-field">
            <span>Client model</span>
            <input name="model" value="${escapeHtml(oldModel)}" autocomplete="off" spellcheck="false" />
          </label>
          <div class="model-map-raw-line">
            <span>Provider</span>
            <code>${escapeHtml(rawModel)}</code>
          </div>
          ${isManual ? `<p class="model-map-hint">Empty name restores automatic mapping.</p>` : ""}
          <div class="model-map-actions">
            <button class="model-map-action secondary" type="button" data-model-map-cancel title="Cancel" aria-label="Cancel">${iconSvg("x")}</button>
            <button class="model-map-action primary" type="submit" title="Save mapping" aria-label="Save mapping">${iconSvg("save")}</button>
          </div>
        </form>
      `
			});
			el("formModal")?.classList.add("is-model-map-modal");
			const form = el("formModalBody")?.querySelector("[data-provider-model-map-form]");
			if (!form) return;
			form.elements.model?.focus();
			form.elements.model?.select();
			form.querySelector("[data-model-map-cancel]")?.addEventListener("click", closeFormModal);
			form.addEventListener("submit", async (event) => {
				event.preventDefault();
				const input = form.elements.model;
				const nextModel = String(input?.value || "").trim();
				if (!nextModel && !isManual) {
					setNotice("Model mapping name is required.", "bad");
					input?.focus();
					return;
				}
				if (nextModel === oldModel) {
					closeFormModal();
					return;
				}
				const submit = form.querySelector("button[type=\"submit\"]");
				if (submit) submit.disabled = true;
				if (await updateProviderModelMapping(provider, oldModel, rawModel, nextModel)) closeFormModal();
				else if (submit) submit.disabled = false;
			});
		}
		function openProviderFormatPathModal({ provider, fmt, label, path, enabled, ownerCard }) {
			if (!provider || !fmt) return;
			const current = path || defaultFormatPath(fmt);
			openFormModal({
				title: "Edit format path",
				subtitle: provider,
				bodyHtml: `
        <form class="format-path-form" data-provider-format-path-form>
          <div class="format-path-summary">
            <span class="format-path-state ${enabled ? "is-enabled" : "is-disabled"}">${enabled ? iconSvg("check") : iconSvg("x")}</span>
            <div>
              <strong>${escapeHtml(label || formatLabel(fmt) || fmt)}</strong>
              <code>${escapeHtml(fmt)}</code>
            </div>
          </div>
          <label class="format-path-field">
            <span>Upstream path</span>
            <input name="path" value="${escapeHtml(current)}" autocomplete="off" spellcheck="false" required />
          </label>
          <p class="format-path-hint">Use the provider endpoint path, for example /v1/chat/completions.</p>
          <div class="model-map-actions">
            <button class="model-map-action secondary" type="button" data-format-path-cancel title="Cancel" aria-label="Cancel">${iconSvg("x")}</button>
            <button class="model-map-action primary" type="submit" title="Save path" aria-label="Save path">${iconSvg("save")}</button>
          </div>
        </form>
      `
			});
			el("formModal")?.classList.add("is-format-path-modal");
			const form = el("formModalBody")?.querySelector("[data-provider-format-path-form]");
			if (!form) return;
			form.elements.path?.focus();
			form.elements.path?.select();
			form.querySelector("[data-format-path-cancel]")?.addEventListener("click", closeFormModal);
			form.addEventListener("submit", async (event) => {
				event.preventDefault();
				const input = form.elements.path;
				const trimmed = String(input?.value || "").trim();
				if (!trimmed) {
					setNotice("Format path cannot be empty.", "bad");
					input?.focus();
					return;
				}
				const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
				if (normalized === current) {
					closeFormModal();
					return;
				}
				const submit = form.querySelector("button[type=\"submit\"]");
				if (submit) submit.disabled = true;
				if (await runFormatMutation(ownerCard, async () => {
					const resp = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/formats/${encodeURIComponent(fmt)}`, { path: normalized });
					setNotice(`${provider} ${fmt} path updated.`, "ok");
					return resp;
				})) closeFormModal();
				else if (submit) submit.disabled = false;
			});
		}
		function bindProviderModelDisableControls(root) {
			if (root.dataset.boundProviderModelControls === "1") return;
			root.dataset.boundProviderModelControls = "1";
			root.addEventListener("input", (event) => {
				const input = event.target.closest("[data-provider-model-search]");
				if (!input || !root.contains(input)) return;
				state.providerModelFilters.search = String(input.value || "");
				renderProviderDrawer({ force: true });
			});
			root.addEventListener("change", (event) => {
				const select = event.target.closest("[data-provider-model-status-filter]");
				if (!select || !root.contains(select)) return;
				state.providerModelFilters.status = String(select.value || "");
				renderProviderDrawer({ force: true });
			});
			root.addEventListener("click", async (event) => {
				const mapEditButton = event.target.closest("[data-provider-model-map-edit-provider]");
				if (mapEditButton && root.contains(mapEditButton)) {
					openProviderModelMappingModal({
						provider: mapEditButton.dataset.providerModelMapEditProvider || "",
						oldModel: mapEditButton.dataset.providerModelMapEditModel || "",
						rawModel: mapEditButton.dataset.providerModelMapEditRaw || "",
						isManual: mapEditButton.dataset.providerModelMapEditManual === "1"
					});
					return;
				}
				const modelButton = event.target.closest("[data-provider-model-disable-model]");
				if (modelButton && root.contains(modelButton)) {
					setProviderModelDisabledDraft(modelButton.dataset.providerModelDisableProvider || "", modelButton.dataset.providerModelDisableModel || "", modelButton.dataset.providerModelDisableNext === "true");
					renderProviderDrawer({ force: true });
					return;
				}
				const bulkButton = event.target.closest("[data-provider-model-bulk]");
				if (bulkButton && root.contains(bulkButton)) {
					const provider = bulkButton.dataset.providerModelBulk || "";
					const action = bulkButton.dataset.providerModelBulkAction || "";
					const view = providerViewModel(provider);
					if (!view) return;
					const visibleItems = filteredProviderModelItems(view.modelItems);
					const next = action === "disable";
					const models = {};
					visibleItems.forEach((item) => {
						if (!item.label) return;
						models[item.label] = next;
					});
					if (!Object.keys(models).length) return;
					setProviderModelsDisabledDraft(provider, models);
					renderProviderDrawer({ force: true });
					return;
				}
				const applyButton = event.target.closest("[data-provider-model-apply]");
				if (applyButton && root.contains(applyButton)) {
					const provider = applyButton.dataset.providerModelApply || "";
					const draft = providerModelDraft(provider);
					if (!Object.keys(draft).length) return;
					applyButton.disabled = true;
					await updateProviderModelDisabled(provider, draft, `Applied ${Object.keys(draft).length} model changes for ${provider}.`);
					applyButton.disabled = false;
					return;
				}
				const resetButton = event.target.closest("[data-provider-model-reset]");
				if (resetButton && root.contains(resetButton)) {
					const provider = resetButton.dataset.providerModelReset || "";
					if (state.providerModelDrafts) delete state.providerModelDrafts[provider];
					renderProviderDrawer({ force: true });
				}
			});
		}
		function renderPolicy() {
			const policy = state.data.routing?.policy || state.data.status?.policy || {};
			const ruleRows = Array.isArray(policy.rule_table) ? policy.rule_table : [];
			const retryStatuses = Array.isArray(policy.retryable_status) ? policy.retryable_status : [];
			renderPolicyControls(policy);
			updateDOM(el("ruleTable"), ruleRows.length ? `
      <div class="policy-summary-grid">
        ${miniMetric("Max attempts", fmtInt(policy.max_attempts), "per request")}
        ${miniMetric("Connect timeout", `${fmtInt(policy.connect_timeout_s)}s`, "upstream")}
        ${miniMetric("Read timeout", `${fmtInt(policy.read_timeout_s)}s`, "upstream")}
        ${miniMetric("Retry HTTP", retryStatuses.length ? retryStatuses.join(", ") : "-", "status codes")}
      </div>
      <div class="policy-card-list">
        ${ruleRows.map(renderPolicyRule).join("")}
      </div>
    ` : `<div class="empty pad">No rule table</div>`);
			renderFailurePolicies(policy);
		}
		function renderFailurePolicies(policy) {
			const target = el("failurePoliciesTable");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceFailurePoliciesRender && active && active.closest("#failurePoliciesTable")) return;
			const policies = policy.failure_policies || {};
			const rows = Object.entries(policies).sort();
			target.innerHTML = rows.length ? `
      <div class="failure-policy-list">
        ${rows.map(([errorType, cfg]) => failurePolicyCard(errorType, cfg || {})).join("")}
      </div>
    ` : `<div class="empty pad">No failure policies</div>`;
			state.forceFailurePoliciesRender = false;
			bindFailurePolicyForms(target);
		}
		function renderPolicyControls(policy) {
			const target = el("policyControls");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forcePolicyRender && active && active.closest("#policyControls")) return;
			const config = state.data.config || {};
			const routing = config.routing || {};
			const retry = config.retry || {};
			const cooldown = retry.cooldown_s || policy.cooldown_s || {};
			const ladder = Array.isArray(retry.key_failure_ladder_s) ? retry.key_failure_ladder_s : [
				10,
				60,
				3600
			];
			target.innerHTML = `
      <div class="policy-control-grid">
        <form id="routingControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>Routing</h3>
            <p>Attempt budget, provider order, and format preference.</p>
          </div>
          <label class="field">
            <span>Provider pool</span>
            <input class="control" name="default_provider_pool" value="${escapeHtml(Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool.join(", ") : "")}" placeholder="opencode, deepseek, rawchat" required />
          </label>
          <div class="form-pair-grid">
            <label class="field">
              <span>Provider select</span>
              <select class="control" name="provider_select">
                ${[
				"priority_failover",
				"round_robin",
				"weighted_rr",
				"random"
			].map((mode) => `<option value="${mode}" ${String(routing.provider_select || "priority_failover") === mode ? "selected" : ""}>${mode}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>Max attempts</span>
              <input class="control" name="max_attempts" type="number" min="1" max="50" value="${escapeHtml(routing.max_attempts ?? policy.max_attempts ?? 6)}" required />
            </label>
          </div>
          <details class="policy-advanced">
            <summary>Timeouts</summary>
            <div class="form-pair-grid" style="margin-top:10px">
              <label class="field">
                <span>Connect timeout</span>
                <input class="control" name="connect_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.connect_timeout_s ?? policy.connect_timeout_s ?? 15)}" required />
              </label>
              <label class="field">
                <span>Read timeout</span>
                <input class="control" name="read_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.read_timeout_s ?? policy.read_timeout_s ?? 120)}" required />
              </label>
              <label class="field">
                <span>First token timeout</span>
                <input class="control" name="first_token_timeout_s" type="number" min="0" max="600" value="${escapeHtml(routing.first_token_timeout_s ?? policy.first_token_timeout_s ?? 30)}" required />
              </label>
            </div>
          </details>
          <button class="button secondary" type="submit">Save routing</button>
        </form>

        <form id="retryControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>Retry</h3>
            <p>HTTP retry classes and key handling.</p>
          </div>
          <label class="field">
            <span>Retry HTTP statuses</span>
            <input class="control" name="retryable_status" value="${escapeHtml(joinList(retry.retryable_status || policy.retryable_status || []))}" placeholder="408, 429, 500, 502, 503, 504" required />
          </label>
          <label class="field">
            <span>Fatal key statuses</span>
            <input class="control" name="key_fatal_status" value="${escapeHtml(joinList(retry.key_fatal_status || policy.key_fatal_status || []))}" placeholder="401, 403" required />
          </label>
          <details class="policy-advanced">
            <summary>Advanced cooldown & ladder</summary>
            <label class="check-field" style="margin-top:10px">
              <input type="checkbox" name="respect_retry_after" ${retry.respect_retry_after ?? policy.respect_retry_after ? "checked" : ""} />
              <span>Respect upstream Retry-After</span>
            </label>
            <div class="form-pair-grid" style="margin-top:8px">
              <label class="field">
                <span>Same-key retries</span>
                <input class="control" name="same_key_retries" type="number" min="0" max="3" value="${escapeHtml(retry.same_key_retries ?? 1)}" required />
              </label>
              <label class="field">
                <span>Key failure ladder</span>
                <input class="control" name="key_failure_ladder_s" value="${escapeHtml(joinNumberList(ladder))}" placeholder="10, 60, 3600" required />
              </label>
              ${cooldownField("rate_limit", "Rate limit cooldown", cooldown.rate_limit ?? 30)}
              ${cooldownField("server_error", "Server error cooldown", cooldown.server_error ?? 10)}
              ${cooldownField("network_error", "Network cooldown", cooldown.network_error ?? 10)}
              ${cooldownField("key_invalid", "Invalid key cooldown", cooldown.key_invalid ?? 3600)}
              ${cooldownField("quota_or_balance", "Quota cooldown", cooldown.quota_or_balance ?? 3600)}
            </div>
          </details>
          <button class="button secondary" type="submit">Save retry</button>
        </form>
      </div>
    `;
			state.forcePolicyRender = false;
			bindPolicyControlForms(target);
		}
		function cooldownField(name, label, value) {
			return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input class="control" name="${escapeHtml(name)}" type="number" min="0" max="86400" value="${escapeHtml(value)}" required />
      </label>
    `;
		}
		function bindPolicyControlForms(root) {
			const routingForm = root.querySelector("#routingControlForm");
			if (routingForm) routingForm.addEventListener("submit", async (event) => {
				event.preventDefault();
				const payload = {
					default_provider_pool: String(routingForm.elements.default_provider_pool.value || "").trim(),
					provider_select: String(routingForm.elements.provider_select.value || "").trim(),
					max_attempts: Number(routingForm.elements.max_attempts.value || 0),
					connect_timeout_s: Number(routingForm.elements.connect_timeout_s.value || 0),
					read_timeout_s: Number(routingForm.elements.read_timeout_s.value || 0),
					first_token_timeout_s: Number(routingForm.elements.first_token_timeout_s.value || 0)
				};
				await runPolicyMutation(routingForm, async () => {
					await apiPatch("/-/admin/routing", payload);
					setNotice("Routing settings updated.", "ok");
				});
			});
			const retryForm = root.querySelector("#retryControlForm");
			if (retryForm) retryForm.addEventListener("submit", async (event) => {
				event.preventDefault();
				const payload = {
					retryable_status: String(retryForm.elements.retryable_status.value || "").trim(),
					key_fatal_status: String(retryForm.elements.key_fatal_status.value || "").trim(),
					respect_retry_after: Boolean(retryForm.elements.respect_retry_after.checked),
					same_key_retries: Number(retryForm.elements.same_key_retries.value || 0),
					key_failure_ladder_s: parseNumberList(retryForm.elements.key_failure_ladder_s.value),
					cooldown_s: {
						rate_limit: Number(retryForm.elements.rate_limit.value || 0),
						server_error: Number(retryForm.elements.server_error.value || 0),
						network_error: Number(retryForm.elements.network_error.value || 0),
						key_invalid: Number(retryForm.elements.key_invalid.value || 0),
						quota_or_balance: Number(retryForm.elements.quota_or_balance.value || 0)
					}
				};
				await runPolicyMutation(retryForm, async () => {
					await apiPatch("/-/admin/retry", payload);
					setNotice("Retry settings updated.", "ok");
				});
			});
		}
		function bindFailurePolicyForms(root) {
			root.querySelectorAll(".failure-policy-form").forEach((form) => {
				if (form.dataset.boundfailurepolicyform) return;
				form.dataset.boundfailurepolicyform = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const payload = {
						error_type: form.dataset.errorType || "",
						cooldown_scope: String(form.elements.cooldown_scope.value || "none"),
						cooldown_s: Number(form.elements.cooldown_s.value || 0),
						provider_cooldown_s: Number(form.elements.provider_cooldown_s.value || 0),
						disables_key: Boolean(form.elements.disables_key.checked)
					};
					await runPolicyMutation(form, async () => {
						await apiPatch("/-/admin/retry/failure-policies", payload);
						setNotice(`Failure policy ${payload.error_type} updated.`, "ok");
					});
				});
			});
		}
		async function runPolicyMutation(form, operation) {
			const buttons = Array.from(form.querySelectorAll("button"));
			buttons.forEach((button) => {
				button.disabled = true;
			});
			try {
				await operation();
				state.forcePolicyRender = true;
				state.forceFailurePoliciesRender = true;
				if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
				await refreshAll({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
			} catch (err) {
				setNotice(`Policy update failed: ${err.message}`);
			} finally {
				buttons.forEach((button) => {
					button.disabled = false;
				});
			}
		}
		function renderPolicyRule(rule, index) {
			const decision = policyDecision(rule);
			return `
      <article class="policy-rule-card tone-${toneForText(decision.error_type || rule.match || "")}">
        <div class="policy-rule-head">
          <span class="rule-index">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${messageMarkup(rule.match || rule.name || "-")}</h3>
            <p>${messageMarkup(rule.notes || decision.reason || "-")}</p>
          </div>
        </div>
        <div class="policy-decision-strip">
          ${decisionBadge(decision.retryable ? "retry" : "no retry", decision.retryable ? "ok" : "bad")}
          ${decisionBadge(rule.retry_next_attempt ? "switch attempt" : "do not switch", rule.retry_next_attempt ? "ok" : "bad")}
          ${decisionBadge(decision.stop_attempts ? "stop attempts" : "continue", decision.stop_attempts ? "bad" : "ok")}
          ${decisionBadge(`cooldown ${decision.cooldown_scope || "none"}`, toneForText(decision.cooldown_scope || "none"))}
          ${decision.disables_key ? decisionBadge("disable key", "bad") : decisionBadge("keep key", "neutral")}
        </div>
        <div class="policy-rule-meta">
          <span>Error</span><strong>${messageMarkup(decision.error_type || "-")}</strong>
          <span>Reason</span><strong>${messageMarkup(decision.reason || "-")}</strong>
          <span>Cooldown</span><strong>${escapeHtml(fmtInt(decision.cooldown_s))}s</strong>
        </div>
      </article>
    `;
		}
		function failurePolicyCard(errorType, cfg) {
			const scope = cfg.cooldown_scope || "none";
			return `
      <form class="failure-policy-card failure-policy-form tone-${toneForText(errorType)}" data-error-type="${escapeHtml(errorType)}">
        <div class="failure-policy-head">
          <h3>${messageMarkup(errorType)}</h3>
          <select class="control compact-control" name="cooldown_scope" aria-label="${escapeHtml(errorType)} cooldown scope">
            ${[
				"none",
				"key",
				"provider",
				"key_provider"
			].map((item) => `<option value="${item}" ${scope === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
        </div>
        <p>${escapeHtml(failurePolicyDescription(errorType))}</p>
        <div class="failure-policy-edit-grid">
          <label class="field">
            <span>Key cooldown</span>
            <input class="control" name="cooldown_s" type="number" min="0" max="86400" value="${escapeHtml(cfg.cooldown_s ?? 0)}" required />
          </label>
          <label class="field">
            <span>Provider cooldown</span>
            <input class="control" name="provider_cooldown_s" type="number" min="0" max="300" value="${escapeHtml(cfg.provider_cooldown_s ?? 0)}" required />
          </label>
          <label class="check-field failure-disable-check">
            <input type="checkbox" name="disables_key" ${cfg.disables_key ? "checked" : ""} />
            <span>Disable key</span>
          </label>
          <button class="button secondary" type="submit">Save policy</button>
        </div>
      </form>
    `;
		}
		function failurePolicyDescription(errorType) {
			const text = String(errorType || "");
			if (text.includes("key_invalid")) return "Auth/key failures mark that key unhealthy; rotation may continue with another key.";
			if (text.includes("rate")) return "Rate limits cool the key briefly; Retry-After can extend this when upstream provides it.";
			if (text.includes("network")) return "Network and timeout failures cool the current key by default; provider cooldown is optional.";
			if (text.includes("server")) return "Provider-side failures are retryable before the client response starts.";
			if (text.includes("empty_visible")) return "Empty converted output is retried without cooling the upstream key.";
			if (text.includes("compat")) return "Compatibility failures are retried when another format/provider may satisfy the request.";
			return "Default failure handling for this error type.";
		}
		function decisionBadge(label, tone) {
			return badge(label, tone === "success" ? "ok" : tone === "danger" ? "bad" : tone === "warn" ? "warn" : tone);
		}
		function policyDecision(rule) {
			const decision = rule?.decision && typeof rule.decision === "object" ? rule.decision : rule || {};
			return {
				error_type: decision.error_type || rule?.error_type || "",
				retryable: Boolean(decision.retryable ?? rule?.retryable),
				reason: decision.reason || rule?.reason || "",
				stop_attempts: Boolean(decision.stop_attempts ?? rule?.stop_attempts),
				cooldown_scope: decision.cooldown_scope || rule?.cooldown_scope || "none",
				cooldown_s: Number(decision.cooldown_s ?? rule?.cooldown_s ?? 0),
				disables_key: Boolean(decision.disables_key ?? rule?.disables_key)
			};
		}
		function renderConfig() {
			const config = state.data.config || {};
			el("configSnapshot").textContent = JSON.stringify(config, null, 2);
			renderConfigSummary(config);
			renderGlobalProxy(config);
			renderOverlaySafety(config);
			renderModelRoutes(config);
			renderProviderModelMap(config);
			renderConfigProviders(config);
			renderAuditTrail();
		}
		function renderConfigSummary(config) {
			const target = el("configSummary");
			if (!target) return;
			const providers = config.providers || {};
			const names = Object.keys(providers).sort();
			const providerCount = names.length;
			const keyCount = names.reduce((sum, name) => sum + (Array.isArray(providers[name]?.keys) ? providers[name].keys.length : 0), 0);
			const enabledProviders = names.filter((name) => providers[name]?.enabled !== false).length;
			const overlayPath = config.overlay_path || "-";
			const formatCounts = {
				chat_completions: 0,
				responses: 0,
				anthropic_messages: 0
			};
			names.forEach((name) => {
				Object.entries(providers[name]?.formats || {}).forEach(([fmt, cfg]) => {
					if (cfg?.enabled && formatCounts[fmt] !== void 0) formatCounts[fmt] += 1;
				});
			});
			target.innerHTML = `
      <div class="config-summary-grid config-status-grid">
        ${miniMetric("Providers", `${fmtInt(enabledProviders)}/${fmtInt(providerCount)}`, "enabled")}
        ${miniMetric("Keys", fmtInt(keyCount), "masked")}
        ${miniMetric("Global proxy", proxyLabel(config.proxy, "direct"), "fallback")}
        ${miniMetric("Overlay", config.has_overlay ? "active" : "none", "runtime_config")}
        ${miniMetric("Formats", Object.entries(formatCounts).map(([k, v]) => `${shortFormatName(k)} ${v}`).join(" / "), "enabled routes")}
      </div>
      <div class="config-path-row">
        <span>Overlay path</span>
        <strong class="mono">${escapeHtml(overlayPath)}</strong>
      </div>
    `;
		}
		function renderGlobalProxy(config) {
			const form = el("globalProxyForm");
			if (!form) return;
			const active = document.activeElement;
			if (active && active.closest("#globalProxyForm")) return;
			form.elements.proxy.value = proxyText(config.proxy);
		}
		function renderOverlaySafety(config) {
			const target = el("overlaySafety");
			if (!target) return;
			const overlay = state.data.overlay || {};
			const hasOverlay = Boolean(overlay.has_overlay ?? config.has_overlay);
			const overlayPath = overlay.overlay_path || config.overlay_path || "-";
			const overlayKeys = overlay.overlay && typeof overlay.overlay === "object" ? Object.keys(overlay.overlay).sort() : [];
			target.innerHTML = `
      <div class="config-summary-grid overlay-summary-grid">
        ${miniMetric("Overlay", hasOverlay ? "active" : "none", "runtime_config")}
        ${miniMetric("Sections", overlayKeys.length ? overlayKeys.join(", ") : "-", "overlay")}
        ${miniMetric("Preview", state.data.overlayPreviewStatus || "-", "last validation")}
        ${miniMetric("Rollback", hasOverlay ? "available" : "not needed", "clear overlay")}
      </div>
      <div class="config-path-row">
        <span>Overlay path</span>
        <strong class="mono">${escapeHtml(overlayPath)}</strong>
      </div>
    `;
			const preview = el("overlayPreview");
			if (preview && !state.data.overlayPreviewPinned) preview.textContent = JSON.stringify(overlay.overlay || {}, null, 2);
		}
		function renderConfigProviders(config) {
			const target = el("configProviders");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceConfigRender && active && active.closest("#configProviders")) return;
			const providers = config.providers || {};
			const names = Object.keys(providers).sort();
			if (!names.length) {
				target.classList.add("empty");
				target.innerHTML = "No providers configured";
				state.forceConfigRender = false;
				return;
			}
			const page = paginate(names, "configProvidersPage", 8);
			target.classList.remove("empty");
			target.innerHTML = `
      ${panelPagination("configProvidersPage", page, "providers")}
      <div class="config-provider-page-list">
        ${page.items.map((name) => providerConfigSummaryCard(name, providers[name] || {})).join("")}
      </div>
    `;
			bindPanelPagination(target);
			state.forceConfigRender = false;
		}
		function renderModelRoutes(config) {
			const target = el("modelRoutes");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceModelRoutesRender && active && active.closest("#modelRoutesPanel")) return;
			const providers = Object.keys(config.providers || {}).sort();
			const routes = config.models?.routes || {};
			const entries = Object.entries(routes).filter(([_model, route]) => route && typeof route === "object").sort(([a], [b]) => a.localeCompare(b));
			const hint = providers.length ? `<div class="model-route-hint">Available providers ${chipList(providers)}</div>` : `<div class="model-route-hint muted">No providers available</div>`;
			if (!entries.length) {
				target.classList.add("empty");
				target.innerHTML = `${hint}<div class="pad-slim">No model routes configured</div>`;
				state.forceModelRoutesRender = false;
				return;
			}
			target.classList.remove("empty");
			const page = paginate(entries, "modelRoutesPage", 8);
			target.innerHTML = `
      ${hint}
      ${panelPagination("modelRoutesPage", page, "routes")}
      <div class="model-route-page-list">
        ${page.items.map(([model, route]) => modelRouteCard(model, route)).join("")}
      </div>
    `;
			bindPanelPagination(target);
			state.forceModelRoutesRender = false;
		}
		function modelRouteCard(model, route) {
			const providers = routeProviderItems(route.providers);
			const providerSelect = route.provider_select || "priority_failover";
			return `
      <article class="model-route-card">
        <div class="model-route-main">
          <div class="provider-name mono">${escapeHtml(model)}</div>
          <div class="model-route-provider-list">
            ${providers.length ? providers.map((item) => `<span class="tag">${escapeHtml(item.name)}:${escapeHtml(item.weight)}</span>`).join("") : `<span class="muted">No providers</span>`}
          </div>
        </div>
        <div class="model-route-side">
          ${badge(providerSelect, providerSelect === "random" ? "warn" : providerSelect === "weighted_rr" ? "info" : "ok")}
          <div class="actions tight">
            <button class="button secondary compact-action icon-action" type="button" data-model-route-edit="${escapeHtml(model)}" title="Edit route" aria-label="Edit route">${iconSvg("pencil")}</button>
            <button class="button danger compact-action icon-action" type="button" data-model-route-delete="${escapeHtml(model)}" title="Delete route" aria-label="Delete route">${iconSvg("trash")}</button>
          </div>
        </div>
      </article>
    `;
		}
		function routeProviderItems(providers) {
			if (!Array.isArray(providers)) return [];
			return providers.map((item) => {
				if (typeof item === "string") {
					const parts = String(item).split(":").map((part) => part.trim());
					const priority = parts[2] === void 0 || parts[2] === "" ? null : Number(parts.slice(2).join(":"));
					return {
						name: parts[0] || "",
						weight: Number(parts[1] || 1),
						priority: Number.isFinite(priority) ? priority : null
					};
				}
				if (item && typeof item === "object") return {
					name: item.name || "",
					weight: item.weight || 1,
					priority: item.priority ?? null
				};
				return null;
			}).filter((item) => item && item.name);
		}
		function routeProvidersText(providers) {
			return routeProviderItems(providers).map((item) => `${item.name}:${item.weight || 1}${item.priority !== null && item.priority !== void 0 ? `:${item.priority}` : ""}`).join(", ");
		}
		function renderProviderModelMap(config) {
			const target = el("providerModelMap");
			if (!target) return;
			const map = config.models?.provider_model_map || {};
			const providers = Object.entries(map).filter(([_provider, entries]) => entries && typeof entries === "object" && Object.keys(entries).length).sort(([a], [b]) => a.localeCompare(b));
			if (!providers.length) {
				target.classList.add("empty");
				target.innerHTML = `<div class="pad-slim">No provider model overrides configured</div>`;
				return;
			}
			target.classList.remove("empty");
			const page = paginate(providers, "providerModelMapPage", 6);
			target.innerHTML = `
      ${panelPagination("providerModelMapPage", page, "maps")}
      <div class="provider-model-map-page-list">
        ${page.items.map(([provider, entries]) => {
				const pairs = Object.entries(entries || {}).sort(([a], [b]) => a.localeCompare(b));
				return `
        <article class="provider-model-map-card">
          <div class="provider-model-map-head">
            <span class="provider-name">${escapeHtml(provider)}</span>
            ${badge(`${fmtInt(pairs.length)} overrides`, "info")}
          </div>
          <div class="provider-model-map-pairs">
            ${pairs.map(([canonical, upstream]) => `
              <div class="provider-model-map-pair">
                <span class="mono">${escapeHtml(canonical)}</span>
                <strong class="mono">${escapeHtml(upstream)}</strong>
              </div>
            `).join("")}
          </div>
        </article>
      `;
			}).join("")}
      </div>
    `;
			bindPanelPagination(target);
		}
		function routeByModel(model) {
			const route = (state.data.config?.models?.routes || {})[model];
			return route && typeof route === "object" ? route : null;
		}
		function renderAuditTrail() {
			const target = el("auditTrail");
			if (!target) return;
			const audit = state.data.audit || {};
			const items = Array.isArray(audit.items) ? audit.items : [];
			if (!items.length) {
				target.classList.add("empty");
				target.innerHTML = "No audit events recorded";
				return;
			}
			target.classList.remove("empty");
			const page = paginate(items, "auditPage", 8);
			target.innerHTML = `
      ${panelPagination("auditPage", page, "events")}
      <div class="audit-page-list">
        ${page.items.map((item) => auditTrailItem(item)).join("")}
      </div>
    `;
			bindPanelPagination(target);
		}
		function auditTrailItem(item) {
			const status = String(item.status || "success");
			const tone = status === "failed" ? "bad" : "ok";
			const detail = item.detail && Object.keys(item.detail).length ? JSON.stringify(item.detail) : "";
			return `
      <article class="audit-item tone-${escapeHtml(tone)}">
        <div class="audit-item-main">
          <div class="audit-item-title">
            <span class="mono">${escapeHtml(item.action || "unknown")}</span>
            ${badge(status, tone)}
          </div>
          <div class="audit-item-meta">
            <span>${escapeHtml(fmtDate(item.ts))}</span>
            <span>${escapeHtml(item.target || "-")}</span>
            <span>${escapeHtml(item.source_ip || "-")}</span>
          </div>
          ${detail ? `
            <details class="audit-detail-details">
              <summary>Detail</summary>
              <pre class="audit-detail">${escapeHtml(detail)}</pre>
            </details>
          ` : ""}
          ${item.error ? `<div class="audit-error">${escapeHtml(item.error)}</div>` : ""}
        </div>
      </article>
    `;
		}
		function providerConfigSummaryCard(name, provider) {
			const formats = provider.formats || {};
			const keys = Array.isArray(provider.keys) ? provider.keys : [];
			const enabled = enabledFormats(formats);
			const firstKey = keys[0];
			const keyText = firstKey ? `key ${firstKey.index} / ${firstKey.masked || firstKey.key_id || "-"}` : "No keys";
			const moreKeys = keys.length > 1 ? ` +${keys.length - 1}` : "";
			const priority = Number(provider.priority || 0);
			return `
      <article class="config-provider-summary-card">
        <div class="config-provider-summary-main">
          <div class="provider-name">${escapeHtml(name)}</div>
          <div class="provider-meta">${escapeHtml(provider.base_url || "-")}</div>
        </div>
        <div class="config-provider-summary-badges">
          ${badge(`P${fmtInt(priority)}`, "info")}
          ${badge(provider.enabled === false ? "config off" : "config on", provider.enabled === false ? "bad" : "ok")}
        </div>
        <div class="config-provider-summary-keys mono">${escapeHtml(keyText)}${escapeHtml(moreKeys)}</div>
        <div class="config-provider-summary-formats">${chipList(enabled, "no enabled formats")}</div>
        <button class="button secondary compact-action icon-action" type="button" data-view-target="providers" title="Open providers" aria-label="Open providers">${iconSvg("settings")}</button>
      </article>
    `;
		}
		function shortFormatName(format) {
			if (format === "chat_completions") return "chat";
			if (format === "anthropic_messages") return "messages";
			return String(format || "");
		}
		function formatLabel(fmt) {
			if (fmt === "chat_completions") return "OpenAI Chat Completions";
			if (fmt === "responses") return "OpenAI Responses";
			if (fmt === "anthropic_messages") return "Anthropic Messages";
			return String(fmt || "");
		}
		function defaultFormatPath(fmt) {
			if (fmt === "responses") return "/v1/responses";
			if (fmt === "anthropic_messages") return "/v1/messages";
			return "/v1/chat/completions";
		}
		function bindConfigProviderForms(root) {
			root.querySelectorAll("[data-provider-delete]").forEach((button) => {
				if (button.dataset.bounddataproviderdelete) return;
				button.dataset.bounddataproviderdelete = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.providerDelete || "";
					if (!provider) return;
					if (!await openConfirmDialog({
						title: "Delete Provider",
						message: `Delete ${provider}? It will be removed from provider config, route pools, model maps, and capability snapshots.`,
						acceptLabel: "Delete"
					})) return;
					button.disabled = true;
					try {
						await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/delete`, { confirm: "delete_provider" });
						state.openProviderDetails.delete(provider);
						state.openProviderEditors.delete(provider);
						if (state.providerDrawerName === provider) closeProviderDrawer();
						state.forceConfigRender = true;
						setNotice(`Provider ${provider} deleted.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
					} catch (err) {
						setNotice(`Delete provider failed: ${err.message}`);
					} finally {
						button.disabled = false;
					}
				});
			});
			root.querySelectorAll(".config-provider-form").forEach((form) => {
				if (form.dataset.boundconfigproviderform) return;
				form.dataset.boundconfigproviderform = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const provider = form.dataset.provider || "";
					const payload = {
						base_url: String(form.elements.base_url.value || "").trim(),
						proxy: String(form.elements.proxy.value || "").trim(),
						user_agent: String(form.elements.user_agent?.value || "").trim(),
						priority: Number(form.elements.priority.value || 0),
						enabled: Boolean(form.elements.enabled.checked)
					};
					await runConfigMutation(form, async () => {
						await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, payload);
						setNotice(`Provider ${provider} updated.`, "ok");
					});
				});
			});
			root.querySelectorAll(".config-key-form").forEach((form) => {
				if (form.dataset.boundconfigkeyform) return;
				form.dataset.boundconfigkeyform = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const provider = form.dataset.provider || "";
					const key = String(form.elements.key.value || "").trim();
					const proxy = String(form.elements.proxy?.value || "").trim();
					const payload = { key };
					if (proxy) payload.proxy = proxy;
					await runConfigMutation(form, async () => {
						await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys`, payload);
						form.reset();
						setNotice(`Key added to ${provider}.`, "ok");
					});
				});
			});
			root.querySelectorAll(".key-proxy-row").forEach((form) => {
				if (form.dataset.boundkeyproxyrow) return;
				form.dataset.boundkeyproxyrow = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const provider = form.dataset.provider || "";
					const keyIndex = String(form.dataset.keyIndex || "").trim();
					const proxy = String(form.elements.proxy.value || "").trim();
					await runConfigMutation(form, async () => {
						await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}`, { proxy });
						setNotice(`Key ${keyIndex} proxy updated for ${provider}.`, "ok");
					});
				});
			});
			root.querySelectorAll(".format-route.is-interactive").forEach((card) => {
				if (card.dataset.boundformatrouteisinteractive) return;
				card.dataset.boundformatrouteisinteractive = "1";
				const provider = card.dataset.formatProvider || "";
				const fmt = card.dataset.format || "";
				const label = card.querySelector(".format-route-main b")?.textContent || formatLabel(fmt) || fmt;
				const toggle = async () => {
					const nextEnabled = card.dataset.formatEnabled !== "1";
					await runFormatMutation(card, async () => {
						const resp = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/formats/${encodeURIComponent(fmt)}`, { enabled: nextEnabled });
						setNotice(`${provider} ${fmt} ${nextEnabled ? "enabled" : "disabled"}.`, "ok");
						return resp;
					});
				};
				const editPath = () => {
					openProviderFormatPathModal({
						provider,
						fmt,
						label,
						path: card.dataset.formatPath || defaultFormatPath(fmt),
						enabled: card.dataset.formatEnabled === "1",
						ownerCard: card
					});
				};
				card.querySelector("[data-format-path-edit]")?.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					editPath();
				});
				card.addEventListener("click", (event) => {
					if (event.target.closest("[data-format-path-edit]")) return;
					toggle();
				});
				card.addEventListener("keydown", (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						toggle();
					} else if (event.key === "F2") {
						event.preventDefault();
						editPath();
					}
				});
			});
		}
		async function runFormatMutation(card, operation) {
			if (card) {
				card.setAttribute("aria-busy", "true");
				card.classList.add("is-busy");
			}
			try {
				const result = await operation();
				if (result?.config) state.data.config = result.config;
				state.data.version = Number(state.data.version || 0) + 1;
				state.forceConfigRender = true;
				state.forceProvidersRender = true;
				state.forceModelCapsRender = true;
				renderAll();
				renderProviderDrawer({ force: true });
				Promise.resolve().then(() => refreshProviderConfigView({ preserveNotice: true })).catch(() => {});
				return true;
			} catch (err) {
				setNotice(`Format update failed: ${err.message}`, "bad");
				return false;
			} finally {
				if (card) {
					card.removeAttribute("aria-busy");
					card.classList.remove("is-busy");
				}
			}
		}
		async function runConfigMutation(form, operation) {
			const buttons = Array.from(form.querySelectorAll("button"));
			buttons.forEach((button) => {
				button.disabled = true;
			});
			try {
				await operation();
				state.forceConfigRender = true;
				state.forceModelRoutesRender = true;
				if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
				await refreshAll({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
			} catch (err) {
				setNotice(`Config update failed: ${err.message}`);
			} finally {
				buttons.forEach((button) => {
					button.disabled = false;
				});
			}
		}
		async function openRequestDetail(requestId) {
			if (!requestId) return;
			state.detailDrawerReturn = null;
			if (el("providerDrawer")?.classList.contains("is-open") && state.providerDrawerName) state.detailDrawerReturn = {
				type: "provider",
				name: state.providerDrawerName,
				tab: state.providerDrawerTab || "overview"
			};
			else if (el("modelDrawer")?.classList.contains("is-open")) {
				const modelName = el("modelDrawerTitle")?.textContent || "";
				if (modelName) state.detailDrawerReturn = {
					type: "model",
					name: modelName
				};
			}
			closeProviderDrawer();
			closeModelDrawer();
			const drawer = el("detailDrawer");
			drawer.classList.add("is-open");
			drawer.setAttribute("aria-hidden", "false");
			el("drawerSubtitle").textContent = requestId;
			updateDOM(el("drawerBody"), `<div class="empty">Loading request detail</div>`);
			try {
				renderDrawer(await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`));
			} catch (err) {
				updateDOM(el("drawerBody"), `<div class="notice">Request detail failed: ${escapeHtml(err.message)}</div>`);
			}
		}
		function renderDrawer(detail) {
			const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
			const summary = detail.routing_summary || {};
			el("drawerSubtitle").textContent = `${detail.request_id || "-"} / ${detail.state || "unknown"}`;
			updateDOM(el("drawerBody"), `
      ${renderRoutingSummary(summary)}
      <div class="kv-grid drawer-kv">
        <span>Status</span><span>${detail.status_code ? statusBadge(detail.status, detail.status_code) : messageMarkup(detail.state || "-")}</span>
        <span>Model</span><span>${escapeHtml(detail.model || "-")}</span>
        <span>Client</span><span>${chipList([detail.client_format || "-"])}</span>
        <span>Endpoint</span><span>${messageMarkup(detail.endpoint || "-")}</span>
        <span>Path</span><span>${escapeHtml(detail.path || "-")}</span>
        <span>Stream</span><span>${detail.stream ? "yes" : "no"}</span>
        <span>Duration</span><span>${escapeHtml(fmtMs(detail.duration_ms))}</span>
        <span>First byte</span><span>${detail.first_byte_ms ? escapeHtml(fmtMs(detail.first_byte_ms)) : escapeHtml("-")}</span>
        <span>Tokens</span><span class="mono" title="${escapeHtml(fmtInt(usageFrom(detail).total_tokens))} tokens">${escapeHtml(fmtTokenCount(usageFrom(detail).total_tokens))}</span>
        <span>Cost</span><span class="mono">${escapeHtml(fmtCost(usageFrom(detail).cost_usd))}</span>
        <span>Error</span><span>${messageMarkup(detail.error || "-")}</span>
      </div>
      <h3 class="drawer-section-title">Attempts</h3>
      ${attempts.length ? attempts.map(renderAttempt).join("") : `<div class="empty">No attempts recorded</div>`}
    `);
		}
		function renderAttempt(attempt) {
			const ok = attempt.outcome === "success";
			const keyLabel = attempt.key_masked ? `key ${attempt.key_index ?? "-"} / ${attempt.key_masked}` : `key ${attempt.key_index ?? "-"}`;
			const maskedKey = attempt.key_masked || attempt.key_id || "-";
			const explanation = attempt.routing_explanation || {};
			const diagnosticRows = renderAttemptDiagnostics(attempt);
			return `
      <article class="attempt tone-${escapeHtml(explanation.tone || toneForText(attempt.reason || attempt.error_type || attempt.outcome || ""))}">
        <div class="attempt-head">
          <strong class="mono">#${escapeHtml(attempt.attempt_no || "-")} ${chipList([attempt.provider || "-"])}</strong>
          ${badge(attempt.outcome || "unknown", ok ? "ok" : "bad")}
        </div>
        ${renderAttemptExplanation(explanation)}
        <div class="kv-grid">
          <span>Key</span><span>${escapeHtml(keyLabel)}</span>
          <span>Key ID</span><span>${escapeHtml(maskedKey)}</span>
          <span>Provider Model</span><span>${escapeHtml(attempt.provider_model || "-")}</span>
          <span>Upstream Format</span><span>${chipList([attempt.upstream_format || "-"])}</span>
          <span>Duration</span><span>${attempt.duration_ms ? escapeHtml(fmtMs(attempt.duration_ms)) : escapeHtml("-")}</span>
          <span>HTTP Status</span><span>${attempt.http_status ? statusBadge("", attempt.http_status) : escapeHtml("-")}</span>
          <span>Tokens</span><span class="mono" title="${escapeHtml(fmtInt(usageFrom(attempt).total_tokens))} tokens">${escapeHtml(fmtTokenCount(usageFrom(attempt).total_tokens))}</span>
          <span>Cost</span><span class="mono">${escapeHtml(fmtCost(usageFrom(attempt).cost_usd))}</span>
          <span>Error Type</span><span>${messageMarkup(attempt.error_type || "-")}</span>
          <span>Reason</span><span>${messageMarkup(attempt.reason || "-")}</span>
          ${diagnosticRows}
        </div>
      </article>
    `;
		}
		function renderAttemptDiagnostics(attempt) {
			const rows = [];
			if (attempt.diagnostic_stage) rows.push(`<span>Stage</span><span>${messageMarkup(attempt.diagnostic_stage)}</span>`);
			if (attempt.upstream_error_summary) rows.push(`<span>Upstream Error</span><span>${messageMarkup(attempt.upstream_error_summary)}</span>`);
			if (attempt.upstream_error_type) rows.push(`<span>Upstream Type</span><span>${messageMarkup(attempt.upstream_error_type)}</span>`);
			if (attempt.upstream_error_code) rows.push(`<span>Upstream Code</span><span>${messageMarkup(attempt.upstream_error_code)}</span>`);
			if (attempt.upstream_error_param) rows.push(`<span>Upstream Param</span><span>${messageMarkup(attempt.upstream_error_param)}</span>`);
			return rows.join("");
		}
		function renderRoutingSummary(summary) {
			if (!summary || typeof summary !== "object" || !summary.headline) return "";
			return `
      <section class="routing-summary-card tone-${escapeHtml(routeOutcomeTone(summary.outcome))}">
        <div class="routing-summary-head">
          <div>
            <h3>Routing Summary</h3>
            <p>${messageMarkup(summary.headline)}</p>
          </div>
          ${badge(routeOutcomeLabel(summary.outcome), routeOutcomeTone(summary.outcome))}
        </div>
        <div class="routing-summary-grid">
          <span>Attempts</span><strong>${fmtInt(summary.attempts)}</strong>
          <span>Failed</span><strong>${fmtInt(summary.failed_attempts)}</strong>
          <span>Final Provider</span><strong>${escapeHtml(summary.final_provider || "-")}</strong>
          <span>Final Format</span><strong>${chipList([summary.final_upstream_format || "-"])}</strong>
        </div>
        <div class="routing-next-action">
          <span>Next action</span>
          <strong>${messageMarkup(summary.next_action || "-")}</strong>
        </div>
      </section>
    `;
		}
		function renderAttemptExplanation(explanation) {
			if (!explanation || typeof explanation !== "object") return "";
			return `
      <div class="attempt-explain">
        <div><span>Selected</span><strong>${messageMarkup(explanation.selected || "-")}</strong></div>
        <div><span>Result</span><strong>${messageMarkup(explanation.result || "-")}</strong></div>
        <div><span>Next</span><strong>${messageMarkup(explanation.next_step || "-")}</strong></div>
      </div>
    `;
		}
		function routeOutcomeLabel(outcome) {
			if (outcome === "direct_success") return "direct";
			if (outcome === "recovered") return "recovered";
			if (outcome === "failed") return "failed";
			if (outcome === "no_attempts") return "no attempts";
			return outcome || "unknown";
		}
		function routeOutcomeTone(outcome) {
			if (outcome === "direct_success") return "ok";
			if (outcome === "recovered") return "warn";
			if (outcome === "failed") return "bad";
			return "neutral";
		}
		function setView(view) {
			const nextView = views[view] ? view : "overview";
			state.view = nextView;
			try {
				localStorage.setItem("proxyConsoleView", nextView);
			} catch (err) {}
			try {
				const nextHash = `#${nextView}`;
				if (window.location.hash !== nextHash) window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${nextHash}`);
			} catch (err) {}
			const meta = views[nextView] || views.overview;
			el("viewTitle").textContent = meta.title;
			el("viewSubtitle").textContent = meta.subtitle;
			qsa(".nav-item").forEach((button) => {
				button.classList.toggle("is-active", (button.dataset.view || button.dataset.viewTarget) === nextView);
			});
			qsa(".view").forEach((node) => node.classList.remove("is-active"));
			el(`${nextView}View`)?.classList.add("is-active");
			renderAll();
			if (nextView === "overview") {
				state.forceTimeseriesFetch = true;
				refreshAll({ quiet: true });
			} else if (nextView === "requests") {
				state.forceRequestsFetch = true;
				refreshAll({ quiet: true });
			} else if (nextView === "playground") pgLoadModels();
			syncMobileSettingsContext();
			closeMobileSettings();
		}
		function captureMobileAnchor(id) {
			const node = el(id);
			if (!node) return;
			mobileSettings.anchors[id] = {
				parent: node.parentNode,
				next: node.nextSibling
			};
		}
		function moveNodeTo(id, targetId) {
			const node = el(id);
			const target = el(targetId);
			if (node && target && node.parentNode !== target) target.appendChild(node);
		}
		function restoreNode(id) {
			const node = el(id);
			const anchor = mobileSettings.anchors[id];
			if (!node || !anchor?.parent || node.parentNode === anchor.parent) return;
			if (anchor.next && anchor.next.parentNode === anchor.parent) anchor.parent.insertBefore(node, anchor.next);
			else anchor.parent.appendChild(node);
		}
		function syncMobileSettingsContext() {
			const contextSection = el("mobileContextSection");
			if (!contextSection) return;
			const isMobile = Boolean(mobileSettings.media?.matches);
			contextSection.classList.toggle("is-hidden", !(isMobile && state.view === "requests"));
		}
		function applyMobileSettingsMode() {
			const isMobile = Boolean(mobileSettings.media?.matches);
			document.body.classList.toggle("has-mobile-settings", isMobile);
			if (isMobile) {
				moveNodeTo("sectionNav", "mobileNavActions");
				moveNodeTo("sidebarActions", "mobileGlobalActions");
				moveNodeTo("requestsToolbar", "mobileContextActions");
			} else {
				closeMobileSettings();
				restoreNode("sectionNav");
				restoreNode("sidebarActions");
				restoreNode("requestsToolbar");
			}
			syncMobileSettingsContext();
		}
		function openMobileSettings() {
			if (!mobileSettings.media?.matches) return;
			el("mobileSettingsDrawer")?.classList.add("is-open");
			el("mobileSettingsDrawer")?.setAttribute("aria-hidden", "false");
			el("mobileSettingsButton")?.setAttribute("aria-expanded", "true");
			const backdrop = el("mobileSettingsBackdrop");
			if (backdrop) {
				backdrop.hidden = false;
				backdrop.classList.add("is-open");
			}
			document.body.classList.add("is-mobile-settings-open");
		}
		function closeMobileSettings() {
			el("mobileSettingsDrawer")?.classList.remove("is-open");
			el("mobileSettingsDrawer")?.setAttribute("aria-hidden", "true");
			el("mobileSettingsButton")?.setAttribute("aria-expanded", "false");
			const backdrop = el("mobileSettingsBackdrop");
			if (backdrop) {
				backdrop.classList.remove("is-open");
				backdrop.hidden = true;
			}
			document.body.classList.remove("is-mobile-settings-open");
		}
		function toggleMobileSettings() {
			if (el("mobileSettingsDrawer")?.classList.contains("is-open")) closeMobileSettings();
			else openMobileSettings();
		}
		function installMobileSettings() {
			captureMobileAnchor("sectionNav");
			captureMobileAnchor("sidebarActions");
			captureMobileAnchor("requestsToolbar");
			mobileSettings.media = window.matchMedia(mobileSettings.query);
			const onChange = () => applyMobileSettingsMode();
			if (typeof mobileSettings.media.addEventListener === "function") mobileSettings.media.addEventListener("change", onChange);
			else if (typeof mobileSettings.media.addListener === "function") mobileSettings.media.addListener(onChange);
			applyMobileSettingsMode();
		}
		function installEvents() {
			window.addEventListener("hashchange", () => {
				const hashView = String(window.location.hash || "").replace(/^#/, "");
				if (views[hashView] && hashView !== state.view) setView(hashView);
			});
			qsa(".nav-item").forEach((button) => {
				button.addEventListener("click", () => setView(button.dataset.view || button.dataset.viewTarget));
			});
			el("confirmCancelButton")?.addEventListener("click", () => closeConfirmDialog(false));
			el("confirmAcceptButton")?.addEventListener("click", () => closeConfirmDialog(true));
			el("confirmBackdrop")?.addEventListener("click", () => closeConfirmDialog(false));
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape" && state.confirmResolve) closeConfirmDialog(false);
			});
			el("formModalClose")?.addEventListener("click", closeFormModal);
			el("formModalBackdrop")?.addEventListener("click", closeFormModal);
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape" && el("formModal")?.classList.contains("is-open")) closeFormModal();
			});
			el("openAddProviderModal")?.addEventListener("click", openAddProviderModal);
			document.addEventListener("click", (event) => {
				const link = event.target.closest("[data-goto-view]");
				if (!link) return;
				event.preventDefault();
				const view = link.dataset.gotoView;
				if (view) setView(view);
			});
			el("loginForm").addEventListener("submit", async (event) => {
				event.preventDefault();
				const nextKey = el("loginAdminKeyInput").value.trim();
				if (!nextKey) {
					setLoginError("Admin key is required.");
					return;
				}
				setLoginBusy(true, "Checking...");
				setLoginError("");
				await openConsoleWithKey(nextKey, {
					persist: true,
					checkingMessage: "Checking admin key."
				});
			});
			el("refreshButton").addEventListener("click", () => {
				refreshAll();
				closeMobileSettings();
			});
			el("pauseButton").addEventListener("click", () => {
				state.paused = !state.paused;
				el("pauseButton").textContent = state.paused ? "Resume" : "Pause";
				if (!state.paused) refreshAll({ quiet: true });
			});
			qsa("[data-time-range]").forEach((button) => {
				button.addEventListener("click", () => {
					const nextRange = button.dataset.timeRange || "30m";
					if (!timeRanges[nextRange] || nextRange === state.timeRange) return;
					state.timeRange = nextRange;
					localStorage.setItem("proxyConsoleTimeRange", state.timeRange);
					renderTimeRangeControl();
					refreshAll();
				});
			});
			qsa("[data-request-status]").forEach((button) => {
				button.addEventListener("click", () => {
					const nextStatus = button.dataset.requestStatus || "";
					if (state.requestFilters.status === nextStatus) return;
					state.requestFilters.status = nextStatus;
					state.requestsPage = 0;
					state.selectedRequestIds.clear();
					state.allMatchingSelected = false;
					syncRequestFilterUi();
					refreshAll({ quiet: true });
				});
			});
			[
				"filterModel",
				"filterProvider",
				"filterErrorType",
				"filterReason",
				"filterHttpStatus"
			].forEach((id) => {
				el(id)?.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					state.requestsPage = 0;
					state.selectedRequestIds.clear();
					state.allMatchingSelected = false;
					refreshAll({ quiet: true });
					closeMobileSettings();
				});
			});
			el("applyFiltersButton").addEventListener("click", () => {
				state.requestsPage = 0;
				state.selectedRequestIds.clear();
				state.allMatchingSelected = false;
				refreshAll();
				closeMobileSettings();
			});
			el("clearFiltersButton").addEventListener("click", () => {
				[
					"filterModel",
					"filterProvider",
					"filterErrorType",
					"filterReason",
					"filterHttpStatus"
				].forEach((id) => {
					el(id).value = "";
				});
				state.requestFilters.status = "";
				syncRequestFilterUi();
				state.requestsPage = 0;
				state.selectedRequestIds.clear();
				state.allMatchingSelected = false;
				refreshAll();
				closeMobileSettings();
			});
			el("deleteRequestsButton")?.addEventListener("click", async () => {
				const ids = Array.from(state.selectedRequestIds);
				const filters = activeRequestFilters();
				const filterCount = Object.keys(filters).length;
				const mode = state.allMatchingSelected ? filterCount ? "matching" : "all" : ids.length ? "selected" : filterCount ? "matching" : "all";
				if (!await openConfirmDialog({
					title: mode === "selected" ? "Delete selected requests" : mode === "matching" ? "Delete matching requests" : "Clear request history",
					message: mode === "selected" ? `Delete ${fmtInt(ids.length)} selected request record${ids.length === 1 ? "" : "s"}? Runtime counters are not reset.` : mode === "matching" ? `Delete all ${fmtInt(state.data.requests?.total || 0)} request record${Number(state.data.requests?.total || 0) === 1 ? "" : "s"} matching the current filters? Runtime counters are not reset.` : "Clear all request history, runtime metrics, and diagnostic log records?",
					acceptLabel: "Delete"
				})) return;
				const button = el("deleteRequestsButton");
				button.disabled = true;
				try {
					let result;
					if (mode === "selected") {
						result = await apiPost("/-/admin/requests/delete", {
							confirm: "delete_request_records",
							request_ids: ids
						});
						ids.forEach((id) => state.selectedRequestIds.delete(id));
					} else if (mode === "matching") {
						result = await apiPost("/-/admin/requests/delete-matching", {
							confirm: "delete_matching_request_records",
							filters
						});
						state.allMatchingSelected = false;
						state.selectedRequestIds.clear();
					} else {
						result = await apiPost("/-/admin/requests/clear", {
							confirm: "clear_request_history",
							include_diagnostics: true
						});
						state.allMatchingSelected = false;
						state.selectedRequestIds.clear();
					}
					state.requestsPage = 0;
					const deleted = result.history?.requests_deleted || result.memory?.recent_requests_deleted || 0;
					setNotice(mode === "all" ? `Request history cleared (${fmtInt(deleted)} records).` : `Deleted ${fmtInt(deleted)} request record${deleted === 1 ? "" : "s"}.`, "ok");
					await refreshAll({
						quiet: true,
						preserveNotice: true
					});
				} catch (err) {
					setNotice(`Delete requests failed: ${err.message}`);
				} finally {
					button.disabled = false;
					updateRequestSelectionUi();
					closeMobileSettings();
				}
			});
			document.addEventListener("click", (event) => {
				if (!event.target.closest("[data-probe-model-picker]")) qsa("[data-probe-model-picker].is-open").forEach((picker) => {
					const menu = picker.querySelector("[data-probe-model-menu]");
					const trigger = picker.querySelector("[data-probe-model-trigger]");
					if (menu) menu.hidden = true;
					if (trigger) trigger.setAttribute("aria-expanded", "false");
					picker.classList.remove("is-open");
				});
			});
			el("providerSearchInput")?.addEventListener("input", syncProviderFiltersFromControls);
			[
				"providerFormatFilter",
				"providerStatusFilter",
				"providerKeyFilter"
			].forEach((id) => {
				el(id)?.addEventListener("change", syncProviderFiltersFromControls);
			});
			el("clearProviderFiltersButton")?.addEventListener("click", clearProviderFilters);
			el("reloadConfigButton").addEventListener("click", async () => {
				try {
					await apiPost("/-/admin/config/reload");
					await refreshAll({
						quiet: true,
						staticData: true
					});
				} catch (err) {
					setNotice(`Config reload failed: ${err.message}`);
				}
			});
			el("globalProxyForm").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				await runConfigMutation(form, async () => {
					await apiPatch("/-/admin/proxy", { proxy: String(form.elements.proxy.value || "").trim() });
					setNotice("Global proxy updated.", "ok");
				});
			});
			el("exportOverlayButton").addEventListener("click", async () => {
				try {
					const overlay = await apiGet("/-/admin/config/overlay");
					state.data.overlay = overlay;
					state.data.overlayPreviewPinned = true;
					state.data.overlayPreviewStatus = overlay.has_overlay ? "exported" : "empty";
					el("overlayPreview").textContent = JSON.stringify(overlay.overlay || {}, null, 2);
					renderOverlaySafety(state.data.config || {});
					setNotice("Masked overlay exported to preview.", "ok");
				} catch (err) {
					setNotice(`Overlay export failed: ${err.message}`);
				}
			});
			el("validateOverlayButton").addEventListener("click", async () => {
				try {
					const result = await apiPost("/-/admin/config/overlay/validate", {});
					state.data.overlayPreviewPinned = true;
					state.data.overlayPreviewStatus = result.preview?.valid ? "valid" : "invalid";
					el("overlayPreview").textContent = JSON.stringify(result.preview || {}, null, 2);
					renderOverlaySafety(state.data.config || {});
					setNotice("Overlay validation passed.", "ok");
				} catch (err) {
					state.data.overlayPreviewStatus = "failed";
					renderOverlaySafety(state.data.config || {});
					setNotice(`Overlay validation failed: ${err.message}`);
				}
			});
			el("clearOverlayButton").addEventListener("click", async () => {
				if (!await openConfirmDialog({
					title: "Clear runtime overlay",
					message: "Clear runtime_config overlay and restart runtime objects from base config?",
					acceptLabel: "Clear"
				})) return;
				try {
					const result = await apiPost("/-/admin/config/overlay/clear", { confirm: "clear_runtime_overlay" });
					state.data.overlayPreviewPinned = true;
					state.data.overlayPreviewStatus = "cleared";
					el("overlayPreview").textContent = JSON.stringify({
						action: result.action,
						backup_path: result.backup_path || "",
						config: result.config || {}
					}, null, 2);
					setNotice(result.backup_path ? `Overlay cleared. Backup: ${result.backup_path}` : "Overlay cleared.", "ok");
					await refreshAll({
						quiet: true,
						preserveNotice: true,
						staticData: true
					});
				} catch (err) {
					setNotice(`Clear overlay failed: ${err.message}`);
				}
			});
			el("addProviderForm")?.addEventListener("submit", async (event) => {
				event.preventDefault();
				const formEl = event.currentTarget;
				const form = new FormData(formEl);
				const format = String(form.get("format") || "chat_completions");
				const proxy = String(form.get("proxy") || "").trim();
				const key = String(form.get("key") || "").trim();
				const keyProxy = String(form.get("key_proxy") || "").trim();
				const priority = Number(form.get("priority") || 0);
				const payload = {
					name: String(form.get("name") || "").trim(),
					base_url: String(form.get("base_url") || "").trim(),
					keys: [keyProxy ? {
						key,
						proxy: keyProxy
					} : key],
					priority
				};
				if (proxy) payload.proxy = proxy;
				if (format !== "auto") payload.formats = {
					chat_completions: {
						enabled: format === "chat_completions",
						path: "/v1/chat/completions"
					},
					responses: {
						enabled: format === "responses",
						path: "/v1/responses"
					},
					anthropic_messages: {
						enabled: format === "anthropic_messages",
						path: "/v1/messages"
					}
				};
				try {
					await apiPost("/-/admin/providers", payload);
					if (formEl && typeof formEl.reset === "function") formEl.reset();
					await refreshAll({
						quiet: true,
						staticData: true
					});
					setNotice(`Provider ${payload.name} added.`, "ok");
				} catch (err) {
					setNotice(`Add provider failed: ${err.message}`);
				}
			});
			el("modelRouteForm").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const payload = {
					model: String(form.elements.model.value || "").trim(),
					providers: String(form.elements.providers.value || "").trim(),
					provider_select: String(form.elements.provider_select.value || "priority_failover").trim()
				};
				await runConfigMutation(form, async () => {
					await apiPatch("/-/admin/models/routes", payload);
					setNotice(`Model route ${payload.model} saved.`, "ok");
				});
			});
			el("clearModelRouteFormButton").addEventListener("click", () => {
				el("modelRouteForm").reset();
				const editor = el("modelRouteEditor");
				if (editor) editor.open = false;
			});
			el("modelRoutes").addEventListener("click", async (event) => {
				const editButton = event.target.closest("[data-model-route-edit]");
				const deleteButton = event.target.closest("[data-model-route-delete]");
				if (editButton) {
					const model = editButton.dataset.modelRouteEdit || "";
					const route = routeByModel(model);
					if (!route) return;
					const form = el("modelRouteForm");
					const editor = el("modelRouteEditor");
					if (editor) editor.open = true;
					form.elements.model.value = model;
					form.elements.providers.value = routeProvidersText(route.providers);
					form.elements.provider_select.value = route.provider_select || "priority_failover";
					(editor || form).scrollIntoView({ block: "nearest" });
					form.elements.providers.focus();
					return;
				}
				if (deleteButton) {
					const model = deleteButton.dataset.modelRouteDelete || "";
					if (!model) return;
					if (!await openConfirmDialog({
						title: "Delete model route",
						message: `Delete model route for ${model}?`,
						acceptLabel: "Delete"
					})) return;
					deleteButton.disabled = true;
					try {
						await apiPost("/-/admin/models/routes/delete", { model });
						state.forceModelRoutesRender = true;
						setNotice(`Model route ${model} deleted.`, "ok");
						await refreshAll({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
					} catch (err) {
						setNotice(`Delete model route failed: ${err.message}`);
					} finally {
						deleteButton.disabled = false;
					}
				}
			});
			el("closeDrawerButton").addEventListener("click", closeDrawer);
			el("closeProviderDrawerButton")?.addEventListener("click", closeProviderDrawer);
			el("closeModelDrawerButton")?.addEventListener("click", closeModelDrawer);
			el("modelCapabilities")?.addEventListener("click", (event) => {
				const chip = event.target.closest(".model-map-chip");
				if (chip) {
					const modelName = chip.dataset.modelName;
					if (modelName) openModelDrawer(modelName);
				}
			});
			el("mobileSettingsButton").addEventListener("click", toggleMobileSettings);
			el("closeMobileSettingsButton").addEventListener("click", closeMobileSettings);
			el("mobileSettingsBackdrop").addEventListener("click", closeMobileSettings);
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape") {
					closeDrawer(false);
					closeProviderDrawer();
					closeModelDrawer();
					closeMobileSettings();
				}
			});
		}
		function closeDrawer(restoreReturn = true) {
			const drawer = el("detailDrawer");
			drawer.classList.remove("is-open");
			drawer.setAttribute("aria-hidden", "true");
			const returnTarget = restoreReturn ? state.detailDrawerReturn : null;
			state.detailDrawerReturn = null;
			if (returnTarget?.type === "provider" && returnTarget.name) openProviderDrawer(returnTarget.name, returnTarget.tab || "overview");
			else if (returnTarget?.type === "model" && returnTarget.name) openModelDrawer(returnTarget.name);
		}
		async function openModelDrawer(modelName) {
			closeDrawer(false);
			closeProviderDrawer();
			const drawer = el("modelDrawer");
			const title = el("modelDrawerTitle");
			const subtitle = el("modelDrawerSubtitle");
			const body = el("modelDrawerBody");
			if (!drawer || !body) return;
			title.textContent = modelName;
			subtitle.textContent = "Loading benchmark data...";
			updateDOM(body, `
      <div class="loading-state pad" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 0;">
        <div class="auth-progress" style="width: 40px; height: 40px; border: 3px solid var(--accent-soft, #eff6ff); border-top-color: var(--accent-strong, #3b82f6); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 16px; color: var(--muted); font-size: 13px; font-weight: 500;">Retrieving details from Artificial Analysis...</div>
      </div>
    `);
			drawer.classList.add("is-open");
			drawer.setAttribute("aria-hidden", "false");
			try {
				const result = await apiGet(`/-/admin/model-summary/${encodeURIComponent(modelName)}`);
				if (result.error) {
					updateDOM(body, `
          <div style="padding: 24px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
            <strong style="display: block; font-size: 15px; color: var(--text); margin-bottom: 8px;">Model Not Found</strong>
            <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">${escapeHtml(result.error)}</p>
            ${result.suggestion ? `
              <div style="border-top: 1px solid var(--line-soft); padding-top: 16px; margin-top: 16px;">
                <span style="font-size: 12px; color: var(--muted); display: block; margin-bottom: 8px;">Did you mean?</span>
                <button class="button secondary pill-toggle" style="padding: 6px 12px; font-size: 12px; font-weight: bold;" onclick="window.LP_openModelDrawer('${escapeHtml(result.suggestion)}')">
                  ${escapeHtml(result.suggestion)}
                </button>
              </div>
            ` : ""}
          </div>
        `);
					subtitle.textContent = "Not Found";
				} else {
					const summary = result.summary || {};
					const url = result.source_url || `https://artificialanalysis.ai/models/${encodeURIComponent(result.model)}`;
					subtitle.textContent = result.model;
					const fmtRank = (item) => item && item.rank ? `#${item.rank} of ${item.total}` : "-";
					updateDOM(body, `
          <div class="model-summary-details">
            <div style="display: grid); grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 24px;">
              ${summary.intelligence ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Quality (AA Index)</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${summary.intelligence.score}</strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.intelligence)}</small>
                </div>
              ` : ""}
              ${summary.speed ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Output Speed</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${summary.speed.tokens_per_second} <span style="font-size: 11px; font-weight: normal;">t/s</span></strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.speed)}</small>
                </div>
              ` : ""}
              ${summary.price_blended ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Blended Cost</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${fmtCost(summary.price_blended.price_per_1m_tokens)}<span style="font-size: 11px; font-weight: normal;">/1M</span></strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.price_blended)}</small>
                </div>
              ` : ""}
              ${summary.context_window ? `
                <div class="mini-metric" style="background: var(--surface-raised); border: 1px solid var(--line-soft); border-radius: 8px; padding: 12px;">
                  <span class="metric-label" style="display: block; font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px;">Context Window</span>
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${fmtTokenCount(summary.context_window.tokens)}</strong>
                  <small style="display: block; font-size: 10px; color: var(--muted); margin-top: 2px;">Rank ${fmtRank(summary.context_window)}</small>
                </div>
              ` : ""}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Pricing per 1M Tokens</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">
              ${summary.pricing ? `
                <span style="color: var(--muted);">Input Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtCost(summary.pricing.input)}</span>
                <span style="color: var(--muted);">Output Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtCost(summary.pricing.output)}</span>
                <span style="color: var(--muted);">Cache Hit Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.pricing.cache_hit !== null ? fmtCost(summary.pricing.cache_hit) : "-"}</span>
              ` : "<span>Pricing data</span><span>Not available</span>"}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Latency Performance</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px;">
              ${summary.latency ? `
                <span style="color: var(--muted);">TTFT (Time To First Token)</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.input_time_s !== null ? `${summary.latency.input_time_s.toFixed(2)}s` : "-"}</span>
                <span style="color: var(--muted);">Reasoning Time</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.reasoning_time_s !== null ? `${summary.latency.reasoning_time_s.toFixed(2)}s` : "-"}</span>
                <span style="color: var(--muted);">Answer Generation</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${summary.latency.answer_time_s !== null ? `${summary.latency.answer_time_s.toFixed(2)}s` : "-"}</span>
              ` : "<span>Latency data</span><span>Not available</span>"}
            </div>

            <h3 class="drawer-section-title" style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 24px 0 8px; border-bottom: 1px solid var(--line-soft); padding-bottom: 6px;">Specifications & Openness</h3>
            <div class="kv-grid drawer-kv" style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; font-size: 13px; margin-bottom: 24px;">
              ${summary.model_size ? `
                <span style="color: var(--muted);">Active Parameters</span><span style="font-weight: 600; text-align: right;">${summary.model_size.active_params_b !== null ? `${summary.model_size.active_params_b}B` : "-"}</span>
                <span style="color: var(--muted);">Total Parameters</span><span style="font-weight: 600; text-align: right;">${summary.model_size.total_params_b !== null ? `${summary.model_size.total_params_b}B` : "-"}</span>
              ` : ""}
              ${summary.openness ? `
                <span style="color: var(--muted);">Openness Score</span><span style="font-weight: 600; text-align: right;"><strong>${summary.openness.score}</strong>/10 <small class="muted">(${fmtRank(summary.openness)})</small></span>
              ` : ""}
            </div>

            <div style="margin-top: 32px; display: flex; justify-content: center;">
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="button primary" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 8px 16px; font-size: 13px; font-weight: bold;">
                View on Artificial Analysis ↗
              </a>
            </div>
          </div>
        `);
				}
			} catch (err) {
				updateDOM(body, `
        <div class="notice danger pad" style="margin: 15px);">
          <strong>Fetch Failed</strong>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `);
				subtitle.textContent = "Error";
			}
		}
		function closeModelDrawer() {
			const drawer = el("modelDrawer");
			if (drawer) {
				drawer.classList.remove("is-open");
				drawer.setAttribute("aria-hidden", "true");
			}
		}
		window.LP_openModelDrawer = openModelDrawer;
		function startTimer() {
			if (state.timer) window.clearInterval(state.timer);
			state.timer = window.setInterval(() => {
				if (!state.paused) refreshAll({ quiet: true });
			}, state.refreshMs);
		}
		function loadAdminKey() {
			const fromQuery = new URLSearchParams(window.location.search).get("admin_key") || "";
			const fromStorage = localStorage.getItem("proxyConsoleAdminKey") || "";
			state.adminKey = String(fromQuery || fromStorage).trim();
			el("loginAdminKeyInput").value = state.adminKey;
			return {
				fromQuery: Boolean(fromQuery),
				hasKey: Boolean(state.adminKey)
			};
		}
		function loadTimeRange() {
			const saved = localStorage.getItem("proxyConsoleTimeRange") || "30m";
			state.timeRange = timeRanges[saved] ? saved : "30m";
		}
		function loadSavedView() {
			try {
				const hashView = String(window.location.hash || "").replace(/^#/, "");
				if (views[hashView]) return hashView;
				const savedView = localStorage.getItem("proxyConsoleView") || "overview";
				return views[savedView] ? savedView : "overview";
			} catch (err) {
				return "overview";
			}
		}
		var _tipEl = null;
		var _tipHideTimer = null;
		function installTooltip() {
			if (_tipEl) return;
			_tipEl = document.createElement("div");
			_tipEl.className = "lp-tip";
			_tipEl.setAttribute("role", "tooltip");
			_tipEl.setAttribute("aria-hidden", "true");
			document.body.appendChild(_tipEl);
			let _currentTipTarget = null;
			const suppressNative = (target) => {
				if (target.dataset.tipTitleSuppressed === "1") return;
				const title = target.getAttribute("title");
				if (title) {
					target.setAttribute("data-original-title", title);
					target.removeAttribute("title");
				}
				target.dataset.tipTitleSuppressed = "1";
			};
			const show = (target) => {
				suppressNative(target);
				const text = target.getAttribute("data-tip") || target.getAttribute("data-original-title") || "";
				const trimmed = String(text).trim();
				if (!trimmed) {
					hideNow();
					return;
				}
				window.clearTimeout(_tipHideTimer);
				_currentTipTarget = target;
				_tipEl.textContent = trimmed;
				_tipEl.setAttribute("aria-hidden", "false");
				positionTip(target);
				_tipEl.classList.add("is-visible");
			};
			const hideNow = () => {
				window.clearTimeout(_tipHideTimer);
				_tipEl.classList.remove("is-visible");
				_tipEl.setAttribute("aria-hidden", "true");
				_currentTipTarget = null;
			};
			const hide = () => {
				window.clearTimeout(_tipHideTimer);
				_tipHideTimer = window.setTimeout(() => {
					_tipEl.classList.remove("is-visible");
					_tipEl.setAttribute("aria-hidden", "true");
					_currentTipTarget = null;
				}, 80);
			};
			const positionTip = (target) => {
				const rect = target.getBoundingClientRect();
				_tipEl.style.left = "0px";
				_tipEl.style.top = "0px";
				const tipRect = _tipEl.getBoundingClientRect();
				const tipW = tipRect.width || _tipEl.offsetWidth || 0;
				const tipH = tipRect.height || _tipEl.offsetHeight || 0;
				const margin = 10;
				let top = rect.top - tipH - margin;
				let placeBelow = false;
				if (top < margin) {
					top = rect.bottom + margin;
					placeBelow = true;
				}
				let left = rect.left + rect.width / 2 - tipW / 2;
				left = Math.max(margin, Math.min(left, window.innerWidth - tipW - margin));
				top = Math.max(margin, Math.min(top, window.innerHeight - tipH - margin));
				_tipEl.style.left = `${Math.round(left)}px`;
				_tipEl.style.top = `${Math.round(top)}px`;
				_tipEl.classList.toggle("is-below", placeBelow);
			};
			const selector = "[data-tip], [title]";
			const targetFromEvent = (event) => {
				const node = event.target;
				if (!node || !node.closest) return null;
				return node.closest(selector);
			};
			document.addEventListener("mouseover", (event) => {
				const target = targetFromEvent(event);
				if (target) show(target);
				else if (_currentTipTarget) hide();
			});
			document.addEventListener("mouseout", (event) => {
				const next = event.relatedTarget;
				if (_currentTipTarget && next && _currentTipTarget.contains(next)) return;
				if (_currentTipTarget && next === _currentTipTarget) return;
				hide();
			});
			document.addEventListener("mouseleave", hideNow);
			window.addEventListener("blur", hideNow);
			window.addEventListener("scroll", () => {
				if (_currentTipTarget) positionTip(_currentTipTarget);
			}, { passive: true });
			window.addEventListener("resize", () => {
				if (_currentTipTarget) positionTip(_currentTipTarget);
			});
			document.addEventListener("focusin", (event) => {
				const target = targetFromEvent(event);
				if (target) show(target);
			});
			document.addEventListener("focusout", (event) => {
				if (targetFromEvent(event)) hide();
			});
		}
		async function init() {
			installMobileSettings();
			installEvents();
			installTooltip();
			const adminKeySource = loadAdminKey();
			loadTimeRange();
			setView(loadSavedView());
			if (!state.adminKey) {
				renderTimeRangeControl();
				showLogin("");
				return;
			}
			await openConsoleWithKey(state.adminKey, {
				persist: adminKeySource.fromQuery,
				checkingMessage: "Checking saved admin key."
			});
		}
		var pg = {
			models: [],
			messages: [],
			format: "chat_completions",
			loading: false,
			abortCtrl: null,
			firstByteMs: null,
			startTime: null
		};
		function pgEsc(s) {
			return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		}
		function pgEndpoint() {
			if (pg.format === "anthropic_messages") return "/v1/messages";
			if (pg.format === "responses") return "/v1/responses";
			return "/v1/chat/completions";
		}
		function pgBuildRequest(userText) {
			const model = el("pgModel")?.value || "";
			const temperature = parseFloat(el("pgTemperature")?.value || "0.7");
			const maxTokens = parseInt(el("pgMaxTokens")?.value || "4096", 10);
			const topP = parseFloat(el("pgTopP")?.value || "1");
			const stream = el("pgStream")?.checked !== false;
			const includeHistory = el("pgIncludeHistory")?.checked === true;
			const sysPrompt = (el("pgSystemPrompt")?.value || "").trim();
			const msgs = includeHistory ? [...pg.messages] : [];
			if (sysPrompt) msgs.unshift({
				role: "system",
				content: sysPrompt
			});
			msgs.push({
				role: "user",
				content: userText
			});
			if (pg.format === "anthropic_messages") {
				const body = {
					model,
					messages: msgs.filter((m) => m.role !== "system").map((m) => ({
						role: m.role,
						content: m.content
					})),
					max_tokens: maxTokens,
					temperature,
					top_p: topP,
					stream
				};
				if (sysPrompt) body.system = sysPrompt;
				return body;
			}
			if (pg.format === "responses") return {
				model,
				input: msgs.map((m) => ({
					role: m.role,
					content: m.content
				})),
				max_output_tokens: maxTokens,
				temperature,
				top_p: topP,
				stream
			};
			return {
				model,
				messages: msgs,
				temperature,
				max_tokens: maxTokens,
				top_p: topP,
				stream
			};
		}
		function pgStatus(text) {
			const node = el("pgStatusText");
			if (node) node.textContent = text;
		}
		function pgNewRequestId() {
			try {
				if (window.crypto?.randomUUID) return `pg-${window.crypto.randomUUID()}`;
			} catch (_e) {}
			return `pg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
		}
		function pgShortText(text, limit = 44) {
			const value = String(text || "");
			return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
		}
		function pgTextFromAny(value) {
			if (value == null) return "";
			if (typeof value === "string") return value;
			if (typeof value === "number" || typeof value === "boolean") return String(value);
			if (Array.isArray(value)) return value.map((item) => pgTextFromAny(item)).join("");
			if (typeof value === "object") {
				for (const key of [
					"text",
					"content",
					"summary",
					"thinking"
				]) if (value[key] != null) return pgTextFromAny(value[key]);
			}
			return "";
		}
		function pgAppendStreamText(current, incoming) {
			const base = String(current || "");
			const text = String(incoming || "");
			if (!text) return base;
			if (!base) return text;
			if (text.startsWith(base)) return text;
			return base + text;
		}
		function pgApplyTraceToMessage(message, trace) {
			if (!message || !trace) return;
			if (trace.requestId) message.requestId = trace.requestId;
			if (trace.clientFormat) message.clientFormat = trace.clientFormat;
			if (trace.provider) message.provider = trace.provider;
			if (trace.keyIndex != null) message.keyIndex = trace.keyIndex;
			if (trace.keyMasked) message.keyMasked = trace.keyMasked;
			if (trace.upstreamFormat) message.upstreamFormat = trace.upstreamFormat;
			if (trace.providerModel) message.providerModel = trace.providerModel;
			if (trace.routeHeadline) message.routeHeadline = trace.routeHeadline;
			if (trace.firstByteMs != null) message.firstByteMs = trace.firstByteMs;
			if (trace.totalMs != null) message.totalMs = trace.totalMs;
			if (trace.usage) message.usage = trace.usage;
		}
		function pgIsNearBottom(node, threshold = 80) {
			if (!node) return true;
			return node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
		}
		function pgRenderMessages({ scroll = "preserve" } = {}) {
			const chat = el("pgChat");
			if (!chat) return;
			const previousTop = chat.scrollTop;
			const wasNearBottom = pgIsNearBottom(chat);
			if (!pg.messages.length) {
				chat.innerHTML = `<div class="pg-empty"><span class="pg-empty-text">Send a message to start testing.</span></div>`;
				return;
			}
			chat.innerHTML = pg.messages.map((m) => pgRenderMessage(m)).join("");
			if (scroll === "bottom" || scroll === "follow" && wasNearBottom) chat.scrollTop = chat.scrollHeight;
			else chat.scrollTop = previousTop;
		}
		function pgUpdateStreamingMessage(m) {
			const chat = el("pgChat");
			if (!chat) return;
			const nodes = chat.querySelectorAll(".pg-message");
			const node = nodes[nodes.length - 1];
			const content = node?.querySelector(".pg-message-content");
			const thinking = node?.querySelector(".pg-thinking");
			const thinkingText = node?.querySelector(".pg-thinking-text");
			const thinkingSummary = node?.querySelector(".pg-thinking summary");
			if (!content) {
				pgRenderMessages({ scroll: "follow" });
				return;
			}
			const shouldFollow = pgIsNearBottom(chat);
			if (thinking && thinkingText) {
				const reasoning = m.reasoning || "";
				thinking.hidden = !reasoning.trim();
				if (reasoning.trim()) thinking.open = Boolean(m.streaming);
				thinkingText.textContent = m.reasoning || "";
				if (thinkingSummary) thinkingSummary.textContent = `Thinking${reasoning ? ` · ${reasoning.length} chars` : ""}`;
			}
			content.textContent = m.content || "";
			if (m.streaming) {
				const cursor = document.createElement("span");
				cursor.className = "pg-stream-cursor";
				content.appendChild(cursor);
			}
			if (shouldFollow) chat.scrollTop = chat.scrollHeight;
		}
		function pgRenderMessage(m) {
			const roleClass = `pg-role-${m.role || "user"}`;
			const roleLabel = (m.role || "user").replace("_", " ");
			let body = "";
			let meta = "";
			if (m.error) body = `<div class="pg-message-error">${pgEsc(m.error)}</div>`;
			else if (m.streaming) body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgEsc(m.content || "")}<span class="pg-stream-cursor"></span></div>`;
			else body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgEsc(m.content || "")}</div>`;
			if (m.provider) {
				const parts = [`provider:${pgEsc(m.provider)}`];
				if (m.keyMasked) parts.push(`key:${pgEsc(m.keyMasked)}`);
				else if (m.keyIndex != null) parts.push(`key:${m.keyIndex}`);
				if (m.clientFormat) parts.push(`client:${pgEsc(m.clientFormat)}`);
				if (m.upstreamFormat) parts.push(`upstream:${pgEsc(m.upstreamFormat)}`);
				if (m.firstByteMs != null) parts.push(`${m.firstByteMs}ms first byte`);
				if (m.totalMs != null) parts.push(`${(m.totalMs / 1e3).toFixed(2)}s total`);
				if (m.usage) {
					const u = m.usage;
					const tin = u.input_tokens || u.prompt_tokens || 0;
					const tout = u.output_tokens || u.completion_tokens || 0;
					parts.push(`${tin} in / ${tout} out`);
				}
				meta = `<div class="pg-message-meta">${parts.map((p) => `<span class="badge tone-neutral">${p}</span>`).join("")}</div>`;
			}
			return `<div class="pg-message ${roleClass}">
      <div class="pg-message-head"><span class="pg-message-role">${roleLabel}</span></div>
      ${body}${meta}
    </div>`;
		}
		function pgRenderThinking(m) {
			if ((m.role || "") !== "assistant") return "";
			const text = String(m.reasoning || "");
			return `<details class="pg-thinking" ${text.trim() ? "open" : "hidden"}>
      <summary>Thinking${text ? ` · ${text.length} chars` : ""}</summary>
      <pre class="pg-thinking-text">${pgEsc(text)}</pre>
    </details>`;
		}
		function pgRenderTrace(trace) {
			const strip = el("pgTraceStrip");
			if (!strip) return;
			if (!trace) {
				strip.hidden = true;
				strip.innerHTML = "";
				return;
			}
			strip.hidden = false;
			const items = [];
			if (trace.requestId) items.push(["request", pgShortText(trace.requestId, 18)]);
			if (trace.provider) items.push(["provider", pgEsc(trace.provider)]);
			if (trace.keyMasked) items.push(["key", pgEsc(trace.keyMasked)]);
			else if (trace.keyIndex != null) items.push(["key", trace.keyIndex]);
			if (trace.upstreamFormat) items.push(["format", pgEsc(trace.upstreamFormat)]);
			if (trace.providerModel) items.push(["upstream model", pgEsc(trace.providerModel)]);
			if (trace.firstByteMs != null) items.push(["1st byte", `${trace.firstByteMs}ms`]);
			if (trace.totalMs != null) items.push(["total", `${(trace.totalMs / 1e3).toFixed(2)}s`]);
			if (trace.usage) {
				const u = trace.usage;
				const tin = u.input_tokens || u.prompt_tokens || 0;
				const tout = u.output_tokens || u.completion_tokens || 0;
				items.push(["tokens", `${tin}in/${tout}out`]);
			}
			if (trace.sentText) items.push(["sent", `"${pgEsc(pgShortText(trace.sentText, 32))}"`]);
			strip.innerHTML = items.map(([k, v]) => `<div class="pg-trace-item"><span class="pg-trace-k">${k}</span><span class="pg-trace-v">${v}</span></div>`).join("");
		}
		function pgRouteTraceFromDetail(detail) {
			if (!detail || typeof detail !== "object") return null;
			const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
			const finalAttempt = attempts.find((a) => String(a?.outcome || "") === "success") || attempts[attempts.length - 1] || {};
			const summary = detail.routing_summary || {};
			return {
				requestId: detail.request_id || "",
				clientFormat: detail.client_format || "",
				provider: finalAttempt.provider || summary.final_provider || "",
				keyIndex: finalAttempt.key_index ?? null,
				keyMasked: finalAttempt.key_masked || "",
				upstreamFormat: finalAttempt.upstream_format || summary.final_upstream_format || "",
				providerModel: finalAttempt.provider_model || detail.model || "",
				firstByteMs: detail.first_byte_ms || null,
				totalMs: detail.duration_ms || null,
				usage: detail.usage || finalAttempt.usage || null,
				routeHeadline: summary.headline || ""
			};
		}
		async function pgFetchRouteTrace(requestId) {
			if (!requestId) return null;
			for (let attempt = 0; attempt < 3; attempt += 1) try {
				return pgRouteTraceFromDetail(await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`));
			} catch (_err) {
				await new Promise((resolve) => setTimeout(resolve, 120 + attempt * 180));
			}
			return null;
		}
		async function pgLoadModels() {
			try {
				const data = await apiGet("/v1/models");
				pg.models = (data?.data || data?.models || []).map((m) => m.id || m).sort();
				pgPopulateModelSelect();
			} catch (err) {
				pgStatus(`Failed to load models: ${err.message}`);
			}
		}
		function pgPopulateModelSelect() {
			const hidden = el("pgModel");
			const searchInput = el("pgModelSearch");
			if (!hidden || !searchInput) return;
			if (!hidden.value || !pg.models.includes(hidden.value)) hidden.value = pg.models[0] || "";
			searchInput.value = hidden.value;
		}
		function pgFilterModels(query) {
			const q = (query || "").toLowerCase().trim();
			if (!q) return pg.models;
			return pg.models.filter((m) => m.toLowerCase().includes(q));
		}
		function pgShowModelDropdown() {
			const dropdown = el("pgModelDropdown");
			const searchInput = el("pgModelSearch");
			if (!dropdown || !searchInput) return;
			const filtered = pgFilterModels(searchInput.value);
			if (!filtered.length) dropdown.innerHTML = "<div class=\"pg-model-empty\">No models found</div>";
			else {
				const current = el("pgModel").value;
				dropdown.innerHTML = filtered.map((id) => `<div class="pg-model-option${id === current ? " selected" : ""}" data-model="${pgEsc(id)}">${pgEsc(id)}</div>`).join("");
			}
			dropdown.hidden = false;
		}
		function pgHideModelDropdown() {
			const dropdown = el("pgModelDropdown");
			if (dropdown) dropdown.hidden = true;
		}
		function pgSelectModel(id) {
			const hidden = el("pgModel");
			const searchInput = el("pgModelSearch");
			if (hidden) hidden.value = id;
			if (searchInput) searchInput.value = id;
			pgHideModelDropdown();
		}
		function pgExtractDelta(chunk, format) {
			const out = {
				content: "",
				reasoning: "",
				done: false
			};
			if (format === "anthropic_messages") {
				if (chunk.type === "content_block_delta" && chunk.delta) {
					if (chunk.delta.type === "text_delta") out.content = chunk.delta.text || "";
					if (chunk.delta.type === "thinking_delta") out.reasoning = chunk.delta.thinking || "";
				}
				if (chunk.type === "message_stop") out.done = true;
				return out;
			}
			if (format === "responses") {
				if (chunk.type === "response.output_text.delta") out.content = chunk.delta || "";
				if (chunk.type === "response.reasoning_summary_text.delta" || chunk.type === "response.reasoning_summary.delta" || chunk.type === "response.reasoning_text.delta") out.reasoning = chunk.delta || chunk.text || "";
				if (chunk.type === "response.completed") out.done = true;
				return out;
			}
			const choice = chunk.choices?.[0];
			if (!choice) return out;
			out.content = choice.delta?.content || "";
			out.reasoning = pgTextFromAny(choice.delta?.reasoning_content ?? choice.delta?.reasoning ?? choice.delta?.thinking);
			if (choice.finish_reason) out.done = true;
			return out;
		}
		function pgExtractUsage(data, format) {
			if (format === "anthropic_messages") {
				if (data.usage) return {
					input_tokens: data.usage.input_tokens || 0,
					output_tokens: data.usage.output_tokens || 0
				};
				if (data.message?.usage) return {
					input_tokens: data.message.usage.input_tokens || 0,
					output_tokens: data.message.usage.output_tokens || 0
				};
			}
			if (format === "responses") {
				if (data.usage) return {
					input_tokens: data.usage.input_tokens || 0,
					output_tokens: data.usage.output_tokens || 0
				};
			}
			if (data.usage) return {
				input_tokens: data.usage.prompt_tokens || 0,
				output_tokens: data.usage.completion_tokens || 0
			};
			return null;
		}
		async function pgSend() {
			const input = el("pgChatInput");
			if (!input) return;
			const userText = input.value.trim();
			if (!userText || pg.loading) return;
			input.value = "";
			pg.messages.push({
				role: "user",
				content: userText
			});
			const assistantMsg = {
				role: "assistant",
				content: "",
				reasoning: "",
				streaming: true
			};
			pg.messages.push(assistantMsg);
			pg.loading = true;
			pg.firstByteMs = null;
			pg.startTime = performance.now();
			pgRenderMessages({ scroll: "bottom" });
			const sendBtn = el("pgSendButton");
			const stopBtn = el("pgStopButton");
			if (sendBtn) sendBtn.hidden = true;
			if (stopBtn) stopBtn.hidden = false;
			pgStatus("Sending...");
			const body = pgBuildRequest(userText);
			const stream = body.stream !== false;
			const endpoint = pgEndpoint();
			const requestId = pgNewRequestId();
			assistantMsg.requestId = requestId;
			assistantMsg.sentText = userText;
			assistantMsg.clientFormat = pg.format;
			pg.abortCtrl = new AbortController();
			try {
				const resp = await fetch(withAdmin(endpoint), {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Request-Id": requestId,
						...state.adminKey ? { "X-Admin-Key": state.adminKey } : {}
					},
					body: JSON.stringify(body),
					signal: pg.abortCtrl.signal
				});
				if (!resp.ok) {
					const errData = await readJson(resp);
					throw new Error(errorMessage(errData, resp.status));
				}
				const routeTrace = pgExtractRouteHeaders(resp);
				if (routeTrace) pgApplyTraceToMessage(assistantMsg, {
					...routeTrace,
					requestId,
					clientFormat: pg.format,
					sentText: userText
				});
				if (stream && resp.body) await pgHandleStream(resp, assistantMsg);
				else {
					const data = await resp.json();
					assistantMsg.content = pgExtractNonStreamContent(data, pg.format);
					assistantMsg.reasoning = pgExtractNonStreamReasoning(data, pg.format);
					assistantMsg.usage = pgExtractUsage(data, pg.format);
				}
				assistantMsg.streaming = false;
				assistantMsg.totalMs = performance.now() - pg.startTime;
				const detailTrace = await pgFetchRouteTrace(requestId);
				if (detailTrace) pgApplyTraceToMessage(assistantMsg, {
					...detailTrace,
					clientFormat: detailTrace.clientFormat || pg.format,
					sentText: userText
				});
				pgRenderMessages({ scroll: "follow" });
				assistantMsg.clientFormat || pg.format, assistantMsg.provider, assistantMsg.keyIndex, assistantMsg.keyMasked, assistantMsg.upstreamFormat || pg.format, assistantMsg.providerModel, assistantMsg.firstByteMs ?? pg.firstByteMs, assistantMsg.totalMs, assistantMsg.usage;
				pgRenderTrace(null);
				pgStatus("Done.");
			} catch (err) {
				if (err.name === "AbortError") {
					assistantMsg.content += "\n[stopped by user]";
					pgStatus("Stopped.");
				} else {
					assistantMsg.error = err.message;
					pgStatus(`Error: ${err.message}`);
				}
				assistantMsg.streaming = false;
				pgRenderMessages({ scroll: "follow" });
			} finally {
				pg.loading = false;
				pg.abortCtrl = null;
				if (sendBtn) sendBtn.hidden = false;
				if (stopBtn) stopBtn.hidden = true;
			}
		}
		function pgExtractRouteHeaders(resp) {
			const provider = resp.headers.get("x-route-provider");
			if (!provider) return null;
			return {
				provider,
				keyIndex: null,
				keyMasked: resp.headers.get("x-route-key") || null,
				upstreamFormat: resp.headers.get("x-route-format") || null,
				providerModel: resp.headers.get("x-route-model") || null,
				attemptNo: resp.headers.get("x-route-attempt") || null
			};
		}
		function pgExtractNonStreamContent(data, format) {
			if (format === "anthropic_messages") return (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
			if (format === "responses") return data.output_text || (data.output || []).filter((b) => b.type === "message").map((b) => (b.content || []).map((c) => c.text || "").join("")).join("");
			return data.choices?.[0]?.message?.content || "";
		}
		function pgExtractNonStreamReasoning(data, format) {
			if (format === "anthropic_messages") return (data.content || []).filter((b) => b.type === "thinking").map((b) => b.thinking || "").join("");
			if (format === "responses") {
				const parts = [];
				for (const item of data.output || []) {
					if (item.type !== "reasoning") continue;
					for (const summary of item.summary || []) {
						const text = pgTextFromAny(summary);
						if (text) parts.push(text);
					}
					if (item.text) parts.push(pgTextFromAny(item.text));
					if (item.content) parts.push(pgTextFromAny(item.content));
				}
				return parts.join("");
			}
			const message = data.choices?.[0]?.message || {};
			return pgTextFromAny(message.reasoning_content ?? message.reasoning ?? message.thinking);
		}
		async function pgHandleStream(resp, assistantMsg) {
			const reader = resp.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let gotFirstByte = false;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith(":")) continue;
					if (!trimmed.startsWith("data:")) continue;
					const payload = trimmed.slice(5).trim();
					if (payload === "[DONE]") continue;
					try {
						const chunk = JSON.parse(payload);
						if (!gotFirstByte) {
							gotFirstByte = true;
							pg.firstByteMs = Math.round(performance.now() - pg.startTime);
						}
						const delta = pgExtractDelta(chunk, pg.format);
						if (delta.content) assistantMsg.content = pgAppendStreamText(assistantMsg.content, delta.content);
						if (delta.reasoning) assistantMsg.reasoning = pgAppendStreamText(assistantMsg.reasoning, delta.reasoning);
						if (delta.content || delta.reasoning) pgUpdateStreamingMessage(assistantMsg);
						const usage = pgExtractUsage(chunk, pg.format);
						if (usage) assistantMsg.usage = usage;
						if (chunk.provider && !assistantMsg.provider) assistantMsg.provider = chunk.provider;
					} catch (_e) {}
				}
			}
		}
		function pgStop() {
			if (pg.abortCtrl) pg.abortCtrl.abort();
		}
		function pgClear() {
			pg.messages = [];
			pgRenderTrace(null);
			pgStatus("Ready.");
			pgRenderMessages({ scroll: "bottom" });
		}
		function pgBindEvents() {
			const sendBtn = el("pgSendButton");
			const stopBtn = el("pgStopButton");
			const clearBtn = el("pgClearButton");
			el("pgChat");
			if (sendBtn && !sendBtn.dataset.pgBound) {
				sendBtn.dataset.pgBound = "1";
				sendBtn.addEventListener("click", pgSend);
			}
			if (stopBtn && !stopBtn.dataset.pgBound) {
				stopBtn.dataset.pgBound = "1";
				stopBtn.addEventListener("click", pgStop);
			}
			if (clearBtn && !clearBtn.dataset.pgBound) {
				clearBtn.dataset.pgBound = "1";
				clearBtn.addEventListener("click", pgClear);
			}
			const input = el("pgChatInput");
			if (input && !input.dataset.pgBound) {
				input.dataset.pgBound = "1";
				input.addEventListener("keydown", (e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						pgSend();
					}
				});
			}
			qsa("[data-pg-format]").forEach((btn) => {
				if (btn.dataset.pgBound) return;
				btn.dataset.pgBound = "1";
				btn.addEventListener("click", () => {
					qsa("[data-pg-format]").forEach((b) => b.classList.remove("is-active"));
					btn.classList.add("is-active");
					pg.format = btn.dataset.pgFormat;
				});
			});
			const modelSearch = el("pgModelSearch");
			if (modelSearch && !modelSearch.dataset.pgBound) {
				modelSearch.dataset.pgBound = "1";
				modelSearch.addEventListener("focus", pgShowModelDropdown);
				modelSearch.addEventListener("input", pgShowModelDropdown);
				modelSearch.addEventListener("keydown", (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						const dropdown = el("pgModelDropdown");
						if (dropdown && !dropdown.hidden) {
							const first = dropdown.querySelector(".pg-model-option");
							if (first) pgSelectModel(first.dataset.model);
						}
					} else if (e.key === "Escape") pgHideModelDropdown();
				});
			}
			const modelDropdown = el("pgModelDropdown");
			if (modelDropdown && !modelDropdown.dataset.pgBound) {
				modelDropdown.dataset.pgBound = "1";
				modelDropdown.addEventListener("click", (e) => {
					const opt = e.target.closest(".pg-model-option");
					if (opt) pgSelectModel(opt.dataset.model);
				});
			}
			document.addEventListener("click", (e) => {
				const combo = el("pgModelCombo");
				if (combo && !combo.contains(e.target)) pgHideModelDropdown();
			});
		}
		function renderPlayground() {
			pgRenderMessages({ scroll: "preserve" });
			pgBindEvents();
		}
		document.addEventListener("DOMContentLoaded", init);
	})))();
	//#endregion
})();
