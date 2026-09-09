(function() {
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
			staticDataState: "idle",
			paused: false,
			refreshMs: 5e3,
			timer: null,
			view: "overview",
			timeRange: "30m",
			requestsPage: 0,
			requestFilters: { status: "" },
			configTab: "models",
			statisticsView: "usage",
			usageStatisticsRange: "all",
			usageStatisticsMetric: "tokens",
			usageStatisticsBreakdown: "model",
			usageStatisticsBreakdownSort: "tokens",
			usageStatisticsBreakdownPage: 0,
			usageStatisticsCustomStart: "",
			usageStatisticsCustomEnd: "",
			usageStatisticsFilters: {
				model: "",
				provider: "",
				client_format: ""
			},
			usageStatisticsLoading: false,
			usageStatisticsLoadSeq: 0,
			modelUsageRange: "7d",
			modelUsageQuery: "",
			modelUsageSort: "calls",
			modelUsagePage: 0,
			modelUsageLoading: false,
			selectedRequestIds: /* @__PURE__ */ new Set(),
			allMatchingSelected: false,
			trafficChartMode: "requests",
			settingsTab: "keys",
			settingsKeyDrawerMode: "",
			settingsKeyEditId: "",
			settingsKeyEditRecord: null,
			settingsKeyCreated: null,
			settingsKeySubmitting: false,
			settingsPricingQuery: "",
			settingsPricingPage: 0,
			settingsPricingLoading: false,
			clientKeysAvailable: null,
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
			modelDrawerMode: "summary",
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
				conversionDiagnostics: null,
				usageStatistics: null,
				usageStatisticsDimensions: null,
				modelUsage: null,
				modelUsageDetail: null,
				clientKeys: null,
				pricingCatalog: null,
				version: 0
			}
		};
	}));
	//#endregion
	//#region src/i18n.js
	/**
	* Translate a key with optional parameter interpolation.
	* @param {string} key - Dot-notation key, e.g. "nav.overview"
	* @param {Record<string, string|number>} [params] - Interpolation params, e.g. { name: "OpenAI" }
	* @returns {string} Translated string, or the key itself if not found.
	*/
	function t(key, params) {
		const entry = dict[key];
		if (!entry) return key;
		let text = entry[_lang] || entry.en || key;
		if (params) for (const [k, v] of Object.entries(params)) text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
		return text;
	}
	/** Get the current language code. */
	function getLang() {
		return _lang;
	}
	/** Set the language, persist to localStorage, and notify listeners. */
	function setLang(lang) {
		if (lang !== "en" && lang !== "zh") return;
		if (lang === _lang) return;
		_lang = lang;
		try {
			localStorage.setItem(STORAGE_KEY, lang);
		} catch (_e) {}
		applyI18n();
		_listeners.forEach((fn) => {
			try {
				fn(lang);
			} catch (_e) {}
		});
	}
	/** Register a callback that fires when the language changes. Returns an unsubscribe function. */
	function onLangChange(fn) {
		_listeners.add(fn);
		return () => _listeners.delete(fn);
	}
	/**
	* Scan the document for [data-i18n] and [data-i18n-attr] attributes and apply translations.
	*
	* - data-i18n="key" → sets textContent
	* - data-i18n-attr="placeholder:key,title:key2" → sets attribute values
	* - data-i18n-tip="key" → sets data-tip attribute (for custom tooltip system)
	*/
	function applyI18n(root = document) {
		root.querySelectorAll("[data-i18n]").forEach((node) => {
			const key = node.getAttribute("data-i18n");
			if (key) node.textContent = t(key);
		});
		root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
			const spec = node.getAttribute("data-i18n-attr") || "";
			for (const pair of spec.split(",")) {
				const [attr, key] = pair.split(":").map((s) => s.trim());
				if (attr && key) node.setAttribute(attr, t(key));
			}
		});
		root.querySelectorAll("[data-i18n-tip]").forEach((node) => {
			const key = node.getAttribute("data-i18n-tip");
			if (key) node.setAttribute("data-tip", t(key));
		});
	}
	/** Initialize language from localStorage or browser preference. Call once on startup. */
	function initLang() {
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved === "en" || saved === "zh") _lang = saved;
			else _lang = (navigator.language || "en").toLowerCase().startsWith("zh") ? "zh" : "en";
		} catch (_e) {
			_lang = DEFAULT_LANG;
		}
		applyI18n();
		return _lang;
	}
	var STORAGE_KEY, DEFAULT_LANG, _lang, _listeners, dict;
	var init_i18n = __esmMin((() => {
		STORAGE_KEY = "proxyConsoleLang";
		DEFAULT_LANG = "en";
		_lang = DEFAULT_LANG;
		_listeners = /* @__PURE__ */ new Set();
		dict = {
			"a11y.skip_content": {
				en: "Skip to content",
				zh: "跳到主内容"
			},
			"app.title": {
				en: "Proxy Console",
				zh: "代理控制台"
			},
			"app.subtitle": {
				en: "v2.4.0 • runtime",
				zh: "v2.4.0 • runtime"
			},
			"auth.checking": {
				en: "Checking console access.",
				zh: "正在检查控制台访问权限。"
			},
			"auth.enter_key": {
				en: "Enter the admin key to open runtime operations.",
				zh: "输入管理员密钥以打开运行时管理。"
			},
			"auth.admin_key": {
				en: "Admin key",
				zh: "管理员密钥"
			},
			"auth.admin_key_ph": {
				en: "admin key",
				zh: "管理员密钥"
			},
			"auth.enter": {
				en: "Enter console",
				zh: "进入控制台"
			},
			"auth.invalid": {
				en: "Invalid admin key.",
				zh: "管理员密钥无效。"
			},
			"nav.overview": {
				en: "Overview",
				zh: "概览"
			},
			"nav.requests": {
				en: "Requests",
				zh: "请求日志"
			},
			"nav.providers": {
				en: "Providers",
				zh: "提供商"
			},
			"nav.policy": {
				en: "Routing Policy",
				zh: "路由策略"
			},
			"nav.config": {
				en: "Config",
				zh: "配置与统计"
			},
			"nav.playground": {
				en: "Playground",
				zh: "测试场"
			},
			"nav.settings": {
				en: "Settings",
				zh: "系统设置"
			},
			"action.refresh": {
				en: "Refresh",
				zh: "刷新"
			},
			"action.pause": {
				en: "Pause",
				zh: "暂停"
			},
			"action.resume": {
				en: "Resume",
				zh: "继续"
			},
			"action.auto_refresh": {
				en: "Auto refresh",
				zh: "自动刷新"
			},
			"action.more_settings": {
				en: "More settings",
				zh: "更多设置"
			},
			"action.test_proxy": {
				en: "Test proxy",
				zh: "测试代理"
			},
			"conn.connected": {
				en: "Connected",
				zh: "已连接"
			},
			"conn.disconnected": {
				en: "Not connected",
				zh: "未连接"
			},
			"conn.paused": {
				en: "Paused",
				zh: "已暂停"
			},
			"conn.connection_error": {
				en: "Connection error",
				zh: "连接错误"
			},
			"conn.admin_required": {
				en: "Admin key required",
				zh: "需要管理员密钥"
			},
			"conn.reconnecting": {
				en: "Reconnecting…",
				zh: "重连中…"
			},
			"view.overview.title": {
				en: "Overview",
				zh: "概览"
			},
			"view.overview.subtitle": {
				en: "Live runtime health and request flow.",
				zh: "实时运行状态与请求流量。"
			},
			"view.requests.title": {
				en: "Requests",
				zh: "请求"
			},
			"view.requests.subtitle": {
				en: "request failure details.",
				zh: "请求失败详情。"
			},
			"view.providers.title": {
				en: "Providers",
				zh: "提供商"
			},
			"view.providers.subtitle": {
				en: "Runtime provider and key state.",
				zh: "运行时提供商与密钥状态。"
			},
			"view.policy.title": {
				en: "Routing Policy & Rules",
				zh: "路由策略与规则"
			},
			"view.policy.subtitle": {
				en: "Configure multi-provider scheduling, retry status codes, and circuit-breaker behavior.",
				zh: "配置多提供商调度算法、故障重试状态码与熔断策略。"
			},
			"view.config.title": {
				en: "Config",
				zh: "配置"
			},
			"view.config.subtitle": {
				en: "configuration and safe edits",
				zh: "配置与安全编辑"
			},
			"view.playground.title": {
				en: "Playground",
				zh: "测试场"
			},
			"view.playground.subtitle": {
				en: "Test models with live routing feedback.",
				zh: "测试模型并获取实时路由反馈。"
			},
			"view.settings.title": {
				en: "Settings",
				zh: "系统设置"
			},
			"view.settings.subtitle": {
				en: "Client keys, model pricing, and runtime operations.",
				zh: "客户端密钥分发、模型费率与运行时运维。"
			},
			"settings.tabs_label": {
				en: "Settings sections",
				zh: "设置分区"
			},
			"settings.tab_keys": {
				en: "Client Keys",
				zh: "API 密钥"
			},
			"settings.tab_pricing": {
				en: "Model Pricing",
				zh: "模型价格"
			},
			"settings.tab_ops": {
				en: "System & Operations",
				zh: "运维与系统"
			},
			"settings.keys.title": {
				en: "Client API Keys",
				zh: "客户端 API 密钥"
			},
			"settings.keys.title_tip": {
				en: "Virtual keys distributed to downstream clients. Quota, rate limit, and model scope are enforced per key.",
				zh: "分发给下游客户端的虚拟密钥，可按 Key 控制额度、速率与模型范围。"
			},
			"settings.keys.desc": {
				en: "Issue virtual keys for downstream clients with per-key quota and model scope.",
				zh: "为下游客户端签发虚拟密钥，按 Key 控制额度与模型范围。"
			},
			"settings.keys.create": {
				en: "Create Key",
				zh: "创建新密钥"
			},
			"settings.keys.count_badge": {
				en: "{count} keys",
				zh: "{count} 个密钥"
			},
			"settings.keys.pending_title": {
				en: "Client key service pending",
				zh: "客户端密钥服务待接入"
			},
			"settings.keys.pending_hint": {
				en: "The /-/admin/client-keys endpoint is not deployed yet. The UI below is wired and will manage keys as soon as the backend ships.",
				zh: "后端接口 /-/admin/client-keys 尚未部署。界面已就绪，接口上线后即可在此管理密钥。"
			},
			"settings.keys.empty_title": {
				en: "No client keys yet",
				zh: "暂无客户端密钥"
			},
			"settings.keys.empty_hint": {
				en: "Create the first key to start distributing access.",
				zh: "创建第一个密钥，开始对外分发访问。"
			},
			"settings.keys.backend_pending": {
				en: "Client key backend is not available yet.",
				zh: "客户端密钥后端接口尚未就绪。"
			},
			"settings.keys.col_name": {
				en: "Name",
				zh: "名称"
			},
			"settings.keys.col_key": {
				en: "Key",
				zh: "凭证"
			},
			"settings.keys.col_quota": {
				en: "Quota",
				zh: "额度上限"
			},
			"settings.keys.col_models": {
				en: "Models",
				zh: "模型范围"
			},
			"settings.keys.col_rpm": {
				en: "Rate limit",
				zh: "速率限制"
			},
			"settings.keys.col_status": {
				en: "Status",
				zh: "状态"
			},
			"settings.keys.status_active": {
				en: "Active",
				zh: "活跃"
			},
			"settings.keys.status_disabled": {
				en: "Disabled",
				zh: "已停用"
			},
			"settings.keys.col_actions": {
				en: "Actions",
				zh: "操作"
			},
			"settings.keys.edit": {
				en: "Edit",
				zh: "编辑"
			},
			"settings.keys.copy": {
				en: "Copy full key",
				zh: "复制完整 Key"
			},
			"settings.keys.copied": {
				en: "Key copied to clipboard.",
				zh: "已复制 Key 到剪贴板。"
			},
			"settings.keys.copy_masked_tip": {
				en: "Full key is shown only once at creation",
				zh: "完整 Key 仅在创建时显示一次"
			},
			"settings.keys.copy_masked_notice": {
				en: "The server only keeps a masked preview. Copy the full key right after creating it — this masked value cannot authenticate.",
				zh: "服务端只保留脱敏预览，此值无法用于鉴权。请在创建密钥时立即复制完整 Key。"
			},
			"settings.keys.created_close_note": {
				en: "Create another key",
				zh: "再创建一个密钥"
			},
			"settings.keys.drawer_title_new": {
				en: "Create Client Key",
				zh: "创建客户端密钥"
			},
			"settings.keys.drawer_title_edit": {
				en: "Edit Client Key",
				zh: "编辑客户端密钥"
			},
			"settings.keys.drawer_subtitle": {
				en: "Configure quota, rate limit, and model scope for the key.",
				zh: "配置密钥的额度、速率与模型范围。"
			},
			"settings.keys.f_name": {
				en: "Label",
				zh: "备注名称"
			},
			"settings.keys.f_name_ph": {
				en: "e.g. Cherry-Studio-TeamA",
				zh: "例如：Cherry-Studio-TeamA"
			},
			"settings.keys.f_quota": {
				en: "Token quota",
				zh: "Token 额度上限"
			},
			"settings.keys.f_quota_hint": {
				en: "Blank or 0 means unlimited. Blocked with 429 once exhausted.",
				zh: "留空或 0 表示不限；耗尽后返回 429。"
			},
			"settings.keys.f_rpm": {
				en: "Rate limit (requests/min)",
				zh: "速率限制（请求/分钟）"
			},
			"settings.keys.f_models": {
				en: "Model scope",
				zh: "模型范围"
			},
			"settings.keys.f_models_all": {
				en: "All models",
				zh: "全部模型"
			},
			"settings.keys.f_expires": {
				en: "Expires",
				zh: "有效期限"
			},
			"settings.keys.f_expires_never": {
				en: "Never expires",
				zh: "永久有效"
			},
			"settings.keys.f_expires_30d": {
				en: "In 30 days",
				zh: "30 天后失效"
			},
			"settings.keys.f_expires_90d": {
				en: "In 90 days",
				zh: "90 天后失效"
			},
			"settings.keys.submit": {
				en: "Generate & Activate",
				zh: "生成并激活"
			},
			"settings.keys.status_expired": {
				en: "Expired",
				zh: "已过期"
			},
			"settings.keys.reset_usage": {
				en: "Reset usage",
				zh: "重置用量"
			},
			"settings.keys.reset_done": {
				en: "Key usage counters reset.",
				zh: "密钥用量计数已重置。"
			},
			"settings.keys.delete": {
				en: "Delete",
				zh: "删除"
			},
			"settings.keys.deleted": {
				en: "Client key deleted.",
				zh: "客户端密钥已删除。"
			},
			"settings.keys.delete_confirm_title": {
				en: "Delete client key",
				zh: "删除客户端密钥"
			},
			"settings.keys.delete_confirm_msg": {
				en: "Delete key \"{name}\"? Clients using it will immediately lose access.",
				zh: "确认删除密钥「{name}」？使用它的客户端将立即失去访问权限。"
			},
			"settings.keys.created_title": {
				en: "Client key created.",
				zh: "客户端密钥已创建。"
			},
			"settings.keys.created_hint": {
				en: "Copy the key now and hand it to the client.",
				zh: "请立即复制密钥并发送给客户端。"
			},
			"settings.keys.created_once_note": {
				en: "For security the full key is shown only once; only its hash is stored.",
				zh: "出于安全考虑，完整密钥仅显示一次，服务端只保存其哈希。"
			},
			"settings.keys.f_models_ph": {
				en: "Empty = all models, or comma-separated allowlist",
				zh: "留空 = 全部模型，或逗号分隔的白名单"
			},
			"settings.keys.f_models_hint": {
				en: "Example: gpt-5.5, deepseek-v4-flash",
				zh: "示例：gpt-5.5, deepseek-v4-flash"
			},
			"settings.keys.cancel": {
				en: "Cancel",
				zh: "取消"
			},
			"settings.pricing.overrides_title": {
				en: "Custom Pricing Overrides",
				zh: "自定义价格覆盖"
			},
			"settings.pricing.overrides_tip": {
				en: "Manual per-provider prices in USD per 1M tokens. Overrides take priority over AA pricing.",
				zh: "按供应商手动配置的单价（USD / 1M tokens），优先级高于 AA 价格。"
			},
			"settings.pricing.overrides_desc": {
				en: "Manual per-provider prices; they win over AA estimates.",
				zh: "按供应商手动配置的单价，优先级高于 AA 估算。"
			},
			"settings.pricing.overrides_empty_title": {
				en: "No manual overrides",
				zh: "暂无手动覆盖"
			},
			"settings.pricing.overrides_empty_hint": {
				en: "Set provider pricing in the provider drawer, or edit a row below once overrides exist.",
				zh: "可在提供商抽屉中配置价格；保存后的覆盖可在此直接修改。"
			},
			"settings.pricing.catalog_title": {
				en: "Model Pricing",
				zh: "模型价格"
			},
			"settings.pricing.catalog_tip": {
				en: "Prices from the local Artificial Analysis cache. Enter override values in a row to pin manual prices; overrides win over AA estimates.",
				zh: "来自本地 AA 缓存的价格。在行内填写覆盖价即可手动定价，覆盖价优先于 AA 估算。"
			},
			"settings.pricing.catalog_loading": {
				en: "Loading cached prices…",
				zh: "正在加载缓存价格…"
			},
			"settings.pricing.catalog_meta": {
				en: "{count} models",
				zh: "{count} 个模型"
			},
			"settings.pricing.catalog_filtered": {
				en: "{count} of {total} models",
				zh: "{count} / {total} 个模型"
			},
			"settings.pricing.catalog_empty": {
				en: "No cached pricing yet. Use \"Fetch & Cache\" to pull a model from Artificial Analysis.",
				zh: "暂无缓存价格。可用“抓取并缓存”从 AA 拉取模型价格。"
			},
			"settings.pricing.refresh": {
				en: "Refresh",
				zh: "刷新"
			},
			"settings.pricing.filter_ph": {
				en: "Filter models…",
				zh: "筛选模型…"
			},
			"settings.pricing.col_model": {
				en: "Model",
				zh: "模型"
			},
			"settings.pricing.col_provider": {
				en: "Provider",
				zh: "供应商"
			},
			"settings.pricing.col_input": {
				en: "Input $/1M",
				zh: "输入 $/1M"
			},
			"settings.pricing.col_output": {
				en: "Output $/1M",
				zh: "输出 $/1M"
			},
			"settings.pricing.col_cache_read": {
				en: "Cache read $/1M",
				zh: "缓存读 $/1M"
			},
			"settings.pricing.col_override_in": {
				en: "Override input $/1M",
				zh: "覆盖输入 $/1M"
			},
			"settings.pricing.col_override_out": {
				en: "Override output $/1M",
				zh: "覆盖输出 $/1M"
			},
			"settings.pricing.col_actions": {
				en: "Actions",
				zh: "操作"
			},
			"settings.pricing.save": {
				en: "Save",
				zh: "保存"
			},
			"settings.pricing.clear": {
				en: "Clear",
				zh: "清除"
			},
			"settings.pricing.override_badge": {
				en: "override",
				zh: "已覆盖"
			},
			"settings.pricing.manual_only": {
				en: "manual",
				zh: "手动"
			},
			"settings.pricing.override_empty": {
				en: "Enter at least one override price first.",
				zh: "请先填写至少一个覆盖价格。"
			},
			"settings.pricing.override_saved": {
				en: "Pricing override saved for {model}.",
				zh: "已保存 {model} 的价格覆盖。"
			},
			"settings.pricing.override_cleared": {
				en: "Pricing override cleared for {model}.",
				zh: "已清除 {model} 的价格覆盖。"
			},
			"settings.pricing.fetch": {
				en: "Fetch & Cache",
				zh: "抓取并缓存"
			},
			"settings.pricing.fetch_ph": {
				en: "Fetch a model from AA…",
				zh: "输入模型名从 AA 抓取…"
			},
			"settings.pricing.fetching": {
				en: "Fetching…",
				zh: "抓取中…"
			},
			"settings.pricing.fetched": {
				en: "Cached {model}: input ${input}/1M, output ${output}/1M.",
				zh: "已缓存 {model}：输入 ${input}/1M，输出 ${output}/1M。"
			},
			"settings.pricing.fetched_no_price": {
				en: "Fetched {model}, but no pricing was returned.",
				zh: "已抓取 {model}，但未返回价格信息。"
			},
			"settings.pricing.fetch_failed": {
				en: "Failed to fetch {model}: {error}",
				zh: "抓取 {model} 失败：{error}"
			},
			"settings.ops.proxy_title": {
				en: "Outbound Proxy",
				zh: "全局出口代理"
			},
			"settings.ops.proxy_desc": {
				en: "Default egress for providers and keys without their own proxy.",
				zh: "未单独配置代理的供应商与密钥默认走此出口。"
			},
			"settings.ops.proxy_field": {
				en: "HTTP/HTTPS proxy URL",
				zh: "HTTP/HTTPS 代理地址"
			},
			"settings.ops.proxy_hint": {
				en: "Leave empty for direct connections. Example: http://127.0.0.1:10808",
				zh: "留空表示直连。示例：http://127.0.0.1:10808"
			},
			"settings.ops.runtime_title": {
				en: "Runtime & Timeouts",
				zh: "并发与超时预算"
			},
			"settings.ops.runtime_desc": {
				en: "Attempt budget and per-stage timeout ceilings for upstream calls.",
				zh: "上游调用的尝试预算与各阶段超时上限。"
			},
			"settings.ops.max_workers": {
				en: "Worker threads",
				zh: "Worker 线程数"
			},
			"settings.ops.max_workers_hint": {
				en: "Fixed at startup; edit config.json server.max_workers and restart.",
				zh: "启动时固定；需修改 config.json 的 server.max_workers 并重启。"
			},
			"settings.ops.max_attempts": {
				en: "Max attempts",
				zh: "最大尝试次数"
			},
			"settings.ops.connect_timeout": {
				en: "Connect timeout (s)",
				zh: "连接超时（秒）"
			},
			"settings.ops.read_timeout": {
				en: "Read timeout (s)",
				zh: "读取超时（秒）"
			},
			"settings.ops.first_token_timeout": {
				en: "First token budget (s)",
				zh: "首字响应预算（秒）"
			},
			"settings.ops.agent_timeout": {
				en: "Agent thinking budget (s)",
				zh: "Agent 思考宽限（秒）"
			},
			"settings.ops.stream_mode": {
				en: "Native stream mode",
				zh: "流式直通模式"
			},
			"settings.ops.stream_mode_guarded": {
				en: "guarded — forward SSE headers immediately",
				zh: "guarded — 立即透传 SSE 头，零延迟"
			},
			"settings.ops.stream_mode_safe": {
				en: "safe — wait for first event before responding",
				zh: "safe — 等待首个事件再响应，可透明重试"
			},
			"settings.ops.overlay_title": {
				en: "Config Revision & Overlay",
				zh: "配置版本与运行时覆盖"
			},
			"settings.ops.overlay_desc": {
				en: "Runtime edits live in the overlay; config.json is never rewritten.",
				zh: "运行时修改保存在覆盖层，config.json 永不改写。"
			},
			"settings.ops.overlay_revision": {
				en: "Revision",
				zh: "配置版本"
			},
			"settings.ops.overlay_state": {
				en: "Overlay",
				zh: "覆盖层"
			},
			"settings.ops.overlay_active": {
				en: "Active",
				zh: "已启用"
			},
			"settings.ops.overlay_empty": {
				en: "No overlay",
				zh: "无覆盖"
			},
			"settings.ops.export": {
				en: "Export Config JSON",
				zh: "导出配置 JSON"
			},
			"settings.ops.export_done": {
				en: "Config snapshot exported.",
				zh: "已导出配置快照。"
			},
			"settings.ops.reset": {
				en: "Reset Overlay",
				zh: "重置运行时覆盖"
			},
			"settings.ops.reset_confirm_title": {
				en: "Reset runtime overlay",
				zh: "重置运行时覆盖"
			},
			"settings.ops.reset_confirm_msg": {
				en: "All unsaved runtime edits will be discarded and the base config.json takes effect. Continue?",
				zh: "所有未固化的运行时修改将被丢弃，恢复为基础 config.json。确认继续？"
			},
			"settings.ops.reset_done": {
				en: "Runtime overlay cleared; base config restored.",
				zh: "运行时覆盖已清空，恢复为基础配置。"
			},
			"settings.ops.security_title": {
				en: "Console Security",
				zh: "控制台安全"
			},
			"settings.ops.security_desc": {
				en: "Admin access and trusted-proxy posture (read-only here).",
				zh: "管理访问与可信反代策略（此处只读）。"
			},
			"settings.ops.security_admin_key": {
				en: "Admin key",
				zh: "管理员密钥"
			},
			"settings.ops.security_admin_key_hint": {
				en: "Masked by the API. Rotate by editing config.json server.admin_key.",
				zh: "接口已脱敏；轮换需修改 config.json 的 server.admin_key。"
			},
			"settings.ops.security_trusted": {
				en: "Trusted proxy CIDRs",
				zh: "可信反代网段"
			},
			"settings.ops.security_query_key": {
				en: "Allow ?admin_key query",
				zh: "允许 ?admin_key 传参"
			},
			"settings.ops.security_headers": {
				en: "Trusted IP headers",
				zh: "可信 IP 请求头"
			},
			"settings.ops.save": {
				en: "Save",
				zh: "保存"
			},
			"settings.ops.not_set": {
				en: "Not set",
				zh: "未设置"
			},
			"ov.health_metrics": {
				en: "Live health metrics and proxy request traffic monitoring.",
				zh: "实时健康指标与代理请求流量监控。"
			},
			"ov.time_range": {
				en: "Time range",
				zh: "时间范围"
			},
			"ov.last_30m": {
				en: "Last 30 minutes",
				zh: "近 30 分钟"
			},
			"ov.last_2h": {
				en: "Last 2 hours",
				zh: "近 2 小时"
			},
			"ov.last_24h": {
				en: "Last 24 hours",
				zh: "近 24 小时"
			},
			"ov.last_7d": {
				en: "Last 7 days",
				zh: "近 7 天"
			},
			"ov.selected_window": {
				en: "selected window",
				zh: "所选时段"
			},
			"ov.usage_trend": {
				en: "Usage Trend",
				zh: "使用趋势"
			},
			"ov.usage_trend_desc": {
				en: "Token flow, request volume, and failures in the selected window.",
				zh: "所选时段内的 Token 流量、请求量和失败情况。"
			},
			"ov.recent_failures": {
				en: "Recent Failure Trace",
				zh: "近期失败追踪"
			},
			"ov.recent_failures_desc": {
				en: "Latest failed or recovered requests.",
				zh: "最近的失败或恢复请求。"
			},
			"ov.top_model_usage": {
				en: "Top Model Usage",
				zh: "模型用量排行"
			},
			"ov.top_model_desc": {
				en: "Tokens and top models in the selected window.",
				zh: "所选时段内的 Token 与热门模型。"
			},
			"ov.token_usage": {
				en: "token usage",
				zh: "Token 用量"
			},
			"traffic.request_volume": {
				en: "Request trends and response latency",
				zh: "请求趋势与响应延迟"
			},
			"traffic.token_usage": {
				en: "Token usage",
				zh: "Token 趋势"
			},
			"traffic.requests": {
				en: "Requests",
				zh: "请求数"
			},
			"traffic.total": {
				en: "total",
				zh: "总计"
			},
			"traffic.success": {
				en: "Success",
				zh: "成功"
			},
			"traffic.failed": {
				en: "Failed",
				zh: "失败"
			},
			"traffic.avg_latency": {
				en: "Avg latency",
				zh: "平均延迟"
			},
			"traffic.first_byte": {
				en: "first byte",
				zh: "首字节"
			},
			"traffic.total_tokens": {
				en: "Total tokens",
				zh: "Token 总量"
			},
			"traffic.input": {
				en: "Input",
				zh: "输入"
			},
			"traffic.output": {
				en: "Output",
				zh: "输出"
			},
			"traffic.tokens": {
				en: "tokens",
				zh: "Token"
			},
			"traffic.estimated_cost": {
				en: "Est. cost",
				zh: "预估费用"
			},
			"traffic.window": {
				en: "window",
				zh: "当前时段"
			},
			"traffic.success_requests": {
				en: "Success requests",
				zh: "成功请求"
			},
			"traffic.failures": {
				en: "Failures",
				zh: "失败请求"
			},
			"traffic.requests_per_minute": {
				en: "Unit: requests/min",
				zh: "单位：请求/分钟"
			},
			"traffic.tokens_per_minute": {
				en: "Unit: tokens/min",
				zh: "单位：Token/分钟"
			},
			"traffic.mode": {
				en: "Traffic chart mode",
				zh: "趋势图模式"
			},
			"traffic.chart_aria": {
				en: "Gateway traffic visualization chart",
				zh: "网关流量趋势图"
			},
			"ov.upstream_health": {
				en: "Upstream Health status",
				zh: "上游健康状态"
			},
			"ov.upstream_health_desc": {
				en: "Providers that need attention.",
				zh: "需要关注的提供商。"
			},
			"ov.no_providers": {
				en: "No providers",
				zh: "暂无提供商"
			},
			"ov.total_in_window": {
				en: "total in the selected window",
				zh: "所选时段内总计"
			},
			"health.title": {
				en: "Failover Health",
				zh: "故障转移健康度"
			},
			"health.subtitle": {
				en: "Provider health scores based on success rate, latency, and key availability.",
				zh: "基于成功率、延迟与密钥可用性的提供商健康评分。"
			},
			"health.loading": {
				en: "Loading health scores…",
				zh: "正在加载健康评分…"
			},
			"health.no_data": {
				en: "No provider health data",
				zh: "暂无提供商健康数据"
			},
			"health.providers_count": {
				en: "{count} provider status checks",
				zh: "{count} 提供商状态检测"
			},
			"health.more_providers": {
				en: "+ {count} more providers",
				zh: "+ 另有 {count} 个提供商"
			},
			"health.grade.excellent": {
				en: "Excellent",
				zh: "优秀"
			},
			"health.grade.good": {
				en: "Good",
				zh: "良好"
			},
			"health.grade.fair": {
				en: "Fair",
				zh: "一般"
			},
			"health.grade.poor": {
				en: "Poor",
				zh: "较差"
			},
			"health.grade.critical": {
				en: "Critical",
				zh: "严重"
			},
			"health.grade.unknown": {
				en: "Unknown",
				zh: "未知"
			},
			"metric.requests": {
				en: "Requests",
				zh: "请求"
			},
			"metric.success_rate": {
				en: "Success Rate",
				zh: "成功率"
			},
			"metric.attempt_failures": {
				en: "Attempt Failures",
				zh: "尝试失败"
			},
			"metric.providers": {
				en: "Providers",
				zh: "提供商"
			},
			"metric.tokens": {
				en: "Tokens",
				zh: "Token"
			},
			"metric.cost": {
				en: "Est. Cost",
				zh: "预估费用"
			},
			"metric.in_flight": {
				en: "in flight",
				zh: "进行中"
			},
			"metric.success": {
				en: "success",
				zh: "成功"
			},
			"metric.failed_attempts": {
				en: "failed attempts",
				zh: "次失败"
			},
			"metric.available": {
				en: "available",
				zh: "可用"
			},
			"metric.input_output": {
				en: "0 input / 0 output",
				zh: "0 输入 / 0 输出"
			},
			"metric.configured_pricing": {
				en: "configured pricing only",
				zh: "仅按已配置价格"
			},
			"kpi.success_rate": {
				en: "Success rate",
				zh: "成功率"
			},
			"kpi.first_byte": {
				en: "First byte latency (TTFT)",
				zh: "首字节延迟 (TTFT)"
			},
			"kpi.active_keys": {
				en: "Available API key slots",
				zh: "可用 API KEY 槽位"
			},
			"kpi.input": {
				en: "Input",
				zh: "输入"
			},
			"kpi.output": {
				en: "Output",
				zh: "输出"
			},
			"kpi.failures": {
				en: "Failures",
				zh: "失败"
			},
			"kpi.success": {
				en: "Success",
				zh: "成功"
			},
			"kpi.no_samples": {
				en: "no samples",
				zh: "无样本"
			},
			"kpi.estimated": {
				en: "estimated",
				zh: "预估"
			},
			"kpi.tokens": {
				en: "tokens",
				zh: "Token"
			},
			"req.all": {
				en: "All",
				zh: "全部"
			},
			"req.success": {
				en: "Success",
				zh: "成功"
			},
			"req.failed": {
				en: "Failed",
				zh: "失败"
			},
			"req.model": {
				en: "Model",
				zh: "模型"
			},
			"req.model_ph": {
				en: "model",
				zh: "模型"
			},
			"req.provider": {
				en: "Provider",
				zh: "提供商"
			},
			"req.provider_ph": {
				en: "provider",
				zh: "提供商"
			},
			"req.more": {
				en: "More",
				zh: "更多"
			},
			"req.error_type_ph": {
				en: "error type",
				zh: "错误类型"
			},
			"req.reason_ph": {
				en: "failure reason",
				zh: "失败原因"
			},
			"req.status_ph": {
				en: "attempt status",
				zh: "尝试状态"
			},
			"req.apply": {
				en: "Apply",
				zh: "应用"
			},
			"req.clear": {
				en: "Clear",
				zh: "清除"
			},
			"req.selected_count": {
				en: "0 selected",
				zh: "已选 0 条"
			},
			"req.delete_title": {
				en: "Delete requests",
				zh: "删除请求"
			},
			"req.recent": {
				en: "Recent request records.",
				zh: "最近请求记录。"
			},
			"req.page_desc": {
				en: "Live proxy request details, routing traces, and token usage.",
				zh: "实时代理请求明细、路由轨迹与 Token 统计。"
			},
			"req.detail_title": {
				en: "Request Detail",
				zh: "请求详情"
			},
			"req.detail_subtitle": {
				en: "Click a request to view its trace and payload.",
				zh: "点击请求查看其追踪和负载。"
			},
			"req.select": {
				en: "Select request",
				zh: "选择请求"
			},
			"req.no_records": {
				en: "No request records",
				zh: "暂无请求记录"
			},
			"req.routing_summary": {
				en: "Routing summary",
				zh: "路由摘要"
			},
			"req.summary_attempts": {
				en: "Attempts",
				zh: "尝试"
			},
			"req.summary_failed": {
				en: "Failed",
				zh: "失败"
			},
			"req.summary_final_provider": {
				en: "Final provider",
				zh: "最终提供商"
			},
			"req.summary_final_format": {
				en: "Final format",
				zh: "最终格式"
			},
			"req.summary_next_action": {
				en: "Next action",
				zh: "建议操作"
			},
			"req.route_path": {
				en: "Routing path",
				zh: "路由路径"
			},
			"req.route_path_desc": {
				en: "How the client request became an upstream call.",
				zh: "客户端请求如何转化为上游调用。"
			},
			"req.route_steps_events": {
				en: "{steps} steps · {events} events",
				zh: "{steps} 个步骤 · {events} 条事件"
			},
			"req.route_format_evaluation": {
				en: "Format handling",
				zh: "格式处理"
			},
			"req.route_candidate_filter": {
				en: "Candidate screening",
				zh: "候选筛选"
			},
			"req.route_selected": {
				en: "Upstream selected",
				zh: "选定上游"
			},
			"req.route_upstream_result": {
				en: "Upstream response",
				zh: "上游响应"
			},
			"req.route_no_candidate": {
				en: "No eligible candidate",
				zh: "没有可用候选"
			},
			"req.route_event": {
				en: "Routing event",
				zh: "路由事件"
			},
			"req.route_formats_available": {
				en: "{count} formats available",
				zh: "{count} 种格式可用"
			},
			"req.route_no_format": {
				en: "No compatible format",
				zh: "无兼容格式"
			},
			"req.route_no_conversion": {
				en: "No conversion needed",
				zh: "无需转换"
			},
			"req.route_no_special_limits": {
				en: "No format restrictions",
				zh: "无格式限制"
			},
			"req.route_proxy_conversion": {
				en: "Proxy conversion",
				zh: "代理转换"
			},
			"req.route_format_excluded": {
				en: "{count} formats excluded",
				zh: "排除 {count} 种格式"
			},
			"req.route_blocked_format": {
				en: "{format} blocked by {fields}",
				zh: "{format} 被字段 {fields} 阻止"
			},
			"req.route_parameter_mapped": {
				en: "Mapped {source} to {target}",
				zh: "将 {source} 映射为 {target}"
			},
			"req.route_hints_omitted": {
				en: "Omitted optional hints: {fields}",
				zh: "省略可选提示：{fields}"
			},
			"req.route_candidates_skipped": {
				en: "{count} candidates skipped",
				zh: "跳过 {count} 个候选"
			},
			"req.route_selected_status": {
				en: "selected",
				zh: "已选择"
			},
			"req.route_success": {
				en: "success",
				zh: "成功"
			},
			"req.route_failed_status": {
				en: "failed",
				zh: "失败"
			},
			"req.route_unavailable": {
				en: "unavailable",
				zh: "不可用"
			},
			"req.route_evaluated": {
				en: "evaluated",
				zh: "已评估"
			},
			"req.route_skipped_reasons": {
				en: "{count} skip reasons",
				zh: "{count} 类跳过原因"
			},
			"req.route_mapped_fields": {
				en: "{count} parameters mapped",
				zh: "映射 {count} 个参数"
			},
			"req.route_dropped_hints": {
				en: "{count} hints omitted",
				zh: "省略 {count} 个提示参数"
			},
			"req.route_failure_reason": {
				en: "Reason: {reason}",
				zh: "原因：{reason}"
			},
			"req.route_diagnostics": {
				en: "Diagnostic events",
				zh: "诊断事件"
			},
			"req.route_diagnostics_desc": {
				en: "Raw routing evidence for troubleshooting.",
				zh: "用于排查问题的原始路由证据。"
			},
			"req.route_event_count": {
				en: "{count} events",
				zh: "{count} 条"
			},
			"req.route_candidate": {
				en: "Candidate",
				zh: "候选"
			},
			"req.route_owner": {
				en: "Owner",
				zh: "归属"
			},
			"req.route_details": {
				en: "Details",
				zh: "详情"
			},
			"req.route_format": {
				en: "Format",
				zh: "格式"
			},
			"req.route_field": {
				en: "field",
				zh: "字段"
			},
			"req.route_fidelity": {
				en: "fidelity",
				zh: "保真度"
			},
			"req.route_profile": {
				en: "profile",
				zh: "兼容配置"
			},
			"req.route_recovery": {
				en: "recovery",
				zh: "恢复等待"
			},
			"req.route_action": {
				en: "action",
				zh: "状态操作"
			},
			"req.route_code_provider_cooldown": {
				en: "provider cooldown",
				zh: "提供商冷却"
			},
			"req.route_code_key_cooldown": {
				en: "key cooldown",
				zh: "密钥冷却"
			},
			"req.route_code_key_disabled": {
				en: "key disabled",
				zh: "密钥已禁用"
			},
			"req.route_code_model_unsupported": {
				en: "model unavailable on key",
				zh: "密钥不支持该模型"
			},
			"req.route_code_compatibility": {
				en: "compatibility circuit",
				zh: "兼容性熔断"
			},
			"req.route_code_duplicate": {
				en: "already attempted",
				zh: "候选已尝试"
			},
			"req.route_direct": {
				en: "direct",
				zh: "直连"
			},
			"req.route_recovered": {
				en: "recovered",
				zh: "已恢复"
			},
			"req.route_no_attempts": {
				en: "no attempts",
				zh: "未尝试上游"
			},
			"req.route_unknown": {
				en: "unknown",
				zh: "未知"
			},
			"req.diag_stage_format": {
				en: "Format check",
				zh: "格式检查"
			},
			"req.diag_stage_routing": {
				en: "Routing decision",
				zh: "路由决策"
			},
			"req.diag_stage_candidate": {
				en: "Candidate screening",
				zh: "候选筛选"
			},
			"req.diag_stage_upstream": {
				en: "Upstream result",
				zh: "上游结果"
			},
			"req.diag_status_allowed": {
				en: "allowed",
				zh: "允许"
			},
			"req.diag_status_blocked": {
				en: "blocked",
				zh: "阻止"
			},
			"req.diag_status_mapped": {
				en: "mapped",
				zh: "已映射"
			},
			"req.diag_status_omitted": {
				en: "omitted",
				zh: "已省略"
			},
			"req.diag_status_selected": {
				en: "selected",
				zh: "已选择"
			},
			"req.diag_status_skipped": {
				en: "skipped",
				zh: "已跳过"
			},
			"req.diag_status_observed": {
				en: "observed",
				zh: "已记录"
			},
			"req.diag_format_eligible": {
				en: "{format} can be used upstream",
				zh: "{format} 可作为上游格式"
			},
			"req.diag_format_blocked": {
				en: "{format} cannot preserve {field}",
				zh: "{format} 无法保留字段 {field}"
			},
			"req.diag_parameter_mapped": {
				en: "Map {field} to {target}",
				zh: "将 {field} 映射为 {target}"
			},
			"req.diag_hint_omitted": {
				en: "Omit optional hint {field} for {format}",
				zh: "转换为 {format} 时省略可选提示 {field}"
			},
			"req.diag_provider_selected": {
				en: "Selected {provider} for this attempt",
				zh: "本次尝试选择了 {provider}"
			},
			"req.diag_upstream_success": {
				en: "{provider} returned a usable response",
				zh: "{provider} 返回了可用响应"
			},
			"req.diag_upstream_success_desc": {
				en: "The response was accepted after conversion or passthrough.",
				zh: "响应经过转换或透传后被代理接受。"
			},
			"req.diag_upstream_failed": {
				en: "{provider} attempt failed",
				zh: "{provider} 调用失败"
			},
			"req.diag_no_candidate": {
				en: "No provider, key, model, and format combination was eligible",
				zh: "没有符合条件的提供商、密钥、模型与格式组合"
			},
			"req.diag_candidate_skipped": {
				en: "Skipped {provider} candidate",
				zh: "跳过 {provider} 候选"
			},
			"req.diag_fidelity_lossless": {
				en: "The current request can use this format without semantic loss.",
				zh: "当前请求可以使用此格式，且不会丢失语义。"
			},
			"req.diag_fidelity_mapped": {
				en: "This format is available after explicit parameter mapping.",
				zh: "通过明确的参数映射后可以使用此格式。"
			},
			"req.diag_fidelity_safe_drop": {
				en: "This format is available after omitting optional hints.",
				zh: "省略不影响核心语义的可选提示后可以使用此格式。"
			},
			"req.diag_fidelity_blocked": {
				en: "This format would change request semantics and is excluded.",
				zh: "此格式会改变请求语义，因此已被排除。"
			},
			"req.diag_internal_id": {
				en: "Internal ID",
				zh: "内部标识"
			},
			"req.diag_owner_value": {
				en: "Owner: {owner}",
				zh: "归属：{owner}"
			},
			"prov.title": {
				en: "Providers",
				zh: "提供商"
			},
			"prov.desc": {
				en: "Runtime health, model coverage, key state, and routing readiness.",
				zh: "运行状态、模型覆盖、密钥状态与路由就绪情况。"
			},
			"prov.add": {
				en: "Add Provider",
				zh: "添加提供商"
			},
			"prov.search": {
				en: "Search",
				zh: "搜索"
			},
			"prov.search_ph": {
				en: "provider, model, base url",
				zh: "提供商、模型、基础 URL"
			},
			"prov.format": {
				en: "Format",
				zh: "格式"
			},
			"prov.all_formats": {
				en: "All formats",
				zh: "所有格式"
			},
			"prov.status": {
				en: "Status",
				zh: "状态"
			},
			"prov.all_status": {
				en: "All status",
				zh: "所有状态"
			},
			"prov.normal": {
				en: "Normal",
				zh: "正常"
			},
			"prov.degraded": {
				en: "Degraded",
				zh: "降级"
			},
			"prov.cooldown": {
				en: "Cooldown",
				zh: "冷却中"
			},
			"prov.unavailable": {
				en: "Unavailable",
				zh: "不可用"
			},
			"prov.disabled": {
				en: "Disabled",
				zh: "已禁用"
			},
			"prov.keys": {
				en: "Keys",
				zh: "密钥"
			},
			"prov.all_keys": {
				en: "All keys",
				zh: "所有密钥"
			},
			"prov.has_usable": {
				en: "Has usable key",
				zh: "有可用密钥"
			},
			"prov.partial_usable": {
				en: "Partial usable",
				zh: "部分可用"
			},
			"prov.no_usable": {
				en: "No usable keys",
				zh: "无可用密钥"
			},
			"prov.key_cooldown": {
				en: "Key cooldown",
				zh: "密钥冷却"
			},
			"prov.no_config": {
				en: "No provider config loaded",
				zh: "未加载提供商配置"
			},
			"prov.no_capabilities": {
				en: "No model capabilities loaded",
				zh: "未加载模型能力"
			},
			"prov.no_providers_configured": {
				en: "No providers configured",
				zh: "未配置提供商"
			},
			"prov.drawer_title": {
				en: "Provider",
				zh: "提供商"
			},
			"prov.open_site": {
				en: "Open {name} website",
				zh: "打开{name}站点"
			},
			"prov.drawer_subtitle": {
				en: "Select a provider to view its models and state.",
				zh: "选择一个提供商查看其模型和状态。"
			},
			"prov.drawer_sections": {
				en: "Provider detail sections",
				zh: "提供商详情栏目"
			},
			"prov.drawer_runtime_summary": {
				en: "{state} / {usable}/{total} usable keys / {models} models",
				zh: "{state} / {usable}/{total} 可用密钥 / {models} 模型"
			},
			"prov.tab_overview": {
				en: "Overview",
				zh: "概览"
			},
			"prov.tab_keys": {
				en: "Keys",
				zh: "密钥"
			},
			"prov.tab_models": {
				en: "Models",
				zh: "模型"
			},
			"prov.tab_routing": {
				en: "Routing",
				zh: "路由"
			},
			"prov.tab_config": {
				en: "Config",
				zh: "配置"
			},
			"prov.config_connection": {
				en: "Connection",
				zh: "连接"
			},
			"prov.config_connection_tip": {
				en: "Upstream endpoint and request identity",
				zh: "上游 endpoint 与请求身份"
			},
			"prov.config_runtime": {
				en: "Runtime",
				zh: "运行时"
			},
			"prov.config_runtime_tip": {
				en: "Routing order and provider availability",
				zh: "路由顺序与可用性"
			},
			"prov.provider_enabled": {
				en: "Provider enabled",
				zh: "启用提供商"
			},
			"prov.provider_enabled_tip": {
				en: "Allow this provider to receive new requests",
				zh: "允许该提供商接收新请求"
			},
			"prov.health_probes": {
				en: "Health probes",
				zh: "健康探测"
			},
			"prov.health_probes_tip": {
				en: "Automated recovery checks",
				zh: "自动恢复检查"
			},
			"prov.skip_idle_probes": {
				en: "Skip idle probes",
				zh: "跳过空闲探测"
			},
			"prov.skip_idle_probes_tip": {
				en: "Do not check this provider after an idle period",
				zh: "空闲后不主动检查该提供商"
			},
			"prov.skip_patrol_probes": {
				en: "Skip patrol probes",
				zh: "跳过巡检探测"
			},
			"prov.skip_patrol_probes_tip": {
				en: "Exclude this provider from periodic patrol checks",
				zh: "从定期巡检中排除该提供商"
			},
			"prov.config_runtime_save": {
				en: "Changes save to runtime configuration",
				zh: "更改会保存到运行时配置"
			},
			"prov.no_keys": {
				en: "No keys",
				zh: "暂无密钥"
			},
			"prov.no_keys_configured": {
				en: "No keys configured",
				zh: "未配置密钥"
			},
			"prov.no_formats": {
				en: "no formats",
				zh: "无格式"
			},
			"prov.delete_provider": {
				en: "Delete provider",
				zh: "删除提供商"
			},
			"prov.delete_provider_tip": {
				en: "Remove this provider from config, route pools, model maps, and capability snapshots.",
				zh: "从配置、路由池、模型映射和能力快照中移除此提供商。"
			},
			"prov.api_key": {
				en: "API key",
				zh: "API key"
			},
			"prov.api_key_ph": {
				en: "Paste a new API key",
				zh: "粘贴新的 API key"
			},
			"prov.add_key": {
				en: "Add key",
				zh: "添加密钥"
			},
			"prov.format_routes": {
				en: "Format routes",
				zh: "格式路由"
			},
			"prov.format_routes_tip": {
				en: "Enable upstream formats and edit request paths",
				zh: "启用上游格式并编辑请求路径"
			},
			"prov.models": {
				en: "Models",
				zh: "模型"
			},
			"prov.models_ph": {
				en: "alias=raw, model=model",
				zh: "alias=raw, model=model"
			},
			"prov.inherit": {
				en: "inherit",
				zh: "继承"
			},
			"prov.inherit_proxy_default": {
				en: "Inherit proxy default",
				zh: "继承默认代理"
			},
			"prov.clear_cooldown": {
				en: "Clear cooldown",
				zh: "清除冷却"
			},
			"prov.disable": {
				en: "Disable",
				zh: "禁用"
			},
			"prov.enable": {
				en: "Enable",
				zh: "启用"
			},
			"prov.disable_key": {
				en: "Disable key",
				zh: "禁用密钥"
			},
			"prov.enable_key": {
				en: "Enable key",
				zh: "启用密钥"
			},
			"prov.clear_key_state": {
				en: "Clear key state",
				zh: "清除密钥状态"
			},
			"prov.overview_readiness": {
				en: "Route readiness",
				zh: "路由就绪状态"
			},
			"prov.overview_priority": {
				en: "Priority {priority}",
				zh: "优先级 {priority}"
			},
			"prov.overview_endpoint": {
				en: "Upstream endpoint",
				zh: "上游地址"
			},
			"prov.overview_endpoint_missing": {
				en: "No upstream endpoint configured",
				zh: "尚未配置上游地址"
			},
			"prov.overview_config_state": {
				en: "Configuration",
				zh: "配置状态"
			},
			"prov.overview_runtime_state": {
				en: "Runtime",
				zh: "运行状态"
			},
			"prov.overview_route_state": {
				en: "Routing",
				zh: "路由状态"
			},
			"prov.overview_enabled": {
				en: "Enabled",
				zh: "已启用"
			},
			"prov.overview_disabled": {
				en: "Disabled",
				zh: "已禁用"
			},
			"prov.overview_available": {
				en: "Eligible",
				zh: "可参与"
			},
			"prov.overview_unavailable": {
				en: "Ineligible",
				zh: "不可参与"
			},
			"prov.overview_state_normal": {
				en: "Ready",
				zh: "路由就绪"
			},
			"prov.overview_state_degraded": {
				en: "Needs attention",
				zh: "需要关注"
			},
			"prov.overview_state_cooldown": {
				en: "Cooling down",
				zh: "冷却中"
			},
			"prov.overview_state_unavailable": {
				en: "Unavailable",
				zh: "当前不可用"
			},
			"prov.overview_state_disabled": {
				en: "Disabled",
				zh: "已停用"
			},
			"prov.overview_desc_normal": {
				en: "Configuration, runtime, and usable keys are ready for routing.",
				zh: "配置、运行状态和可用密钥均已就绪，可进入路由选择。"
			},
			"prov.overview_desc_degraded": {
				en: "The provider can still route requests, but some keys or compatibility paths need attention.",
				zh: "仍可能参与路由，但部分密钥或兼容路径需要关注。"
			},
			"prov.overview_desc_cooldown": {
				en: "Temporarily excluded from routing. It becomes eligible again after cooldown.",
				zh: "暂时不会进入路由候选；冷却结束后会重新参与选择。"
			},
			"prov.overview_desc_unavailable": {
				en: "Not currently eligible for routing. Check enable state and usable keys.",
				zh: "当前不会进入路由候选，请检查启用状态和可用密钥。"
			},
			"prov.overview_desc_disabled": {
				en: "Disabled by configuration or runtime state and will not receive new requests.",
				zh: "已被配置或运行状态停用，不会接收新请求。"
			},
			"prov.overview_key_coverage": {
				en: "Key coverage",
				zh: "密钥覆盖"
			},
			"prov.overview_models": {
				en: "Models",
				zh: "可用模型"
			},
			"prov.overview_recent_success": {
				en: "Recent success",
				zh: "近期成功率"
			},
			"prov.overview_avg_first_byte": {
				en: "Avg first byte",
				zh: "平均首字节"
			},
			"prov.overview_usable_keys": {
				en: "{usable}/{total} usable",
				zh: "{usable}/{total} 个可用"
			},
			"prov.overview_models_available": {
				en: "available to this provider",
				zh: "该提供商可用"
			},
			"prov.overview_recent_requests": {
				en: "{count} recent requests",
				zh: "最近 {count} 次请求"
			},
			"prov.overview_successful_calls": {
				en: "successful calls",
				zh: "成功请求"
			},
			"prov.overview_routing_exceptions": {
				en: "Routing exceptions",
				zh: "路由异常"
			},
			"prov.overview_routing_exceptions_tip": {
				en: "Active model, key, and format compatibility circuits",
				zh: "当前生效的模型、密钥与格式兼容性熔断"
			},
			"prov.overview_clear_exceptions": {
				en: "Clear exceptions",
				zh: "清除熔断"
			},
			"prov.compatibility_active": {
				en: "{count} compatibility circuits active",
				zh: "{count} 条兼容性熔断生效中"
			},
			"prov.compatibility_recovery": {
				en: "Nearest recovery {time}",
				zh: "最近恢复 {time}"
			},
			"prov.compatibility_clear_all": {
				en: "Clear all",
				zh: "全部清除"
			},
			"prov.overview_failures": {
				en: "{count} failures",
				zh: "失败 {count} 次"
			},
			"prov.overview_cooldown_remaining": {
				en: "{time} cooldown remaining",
				zh: "剩余冷却 {time}"
			},
			"prov.overview_recent_activity": {
				en: "Recent activity",
				zh: "近期调用"
			},
			"prov.overview_recent_activity_tip": {
				en: "Latest provider attempts; open a row to trace the request",
				zh: "最近的提供商调用；点击记录可追溯到请求详情"
			},
			"prov.overview_activity_loading": {
				en: "Loading recent activity…",
				zh: "正在加载近期调用…"
			},
			"prov.overview_activity_empty": {
				en: "No recent calls for this provider",
				zh: "该提供商暂无近期调用"
			},
			"prov.overview_health_probes": {
				en: "Background health probes",
				zh: "后台健康探测"
			},
			"prov.overview_health_probes_tip": {
				en: "Recovery and patrol evidence; opens automatically when a probe fails",
				zh: "恢复与巡检证据；存在失败探测时自动展开"
			},
			"prov.overview_probe_count": {
				en: "{count} probes",
				zh: "{count} 次探测"
			},
			"prov.overview_probe_empty": {
				en: "No background health probes yet",
				zh: "暂无后台健康探测"
			},
			"prov.overview_more_probes": {
				en: "+ {count} more probes",
				zh: "另有 {count} 次探测"
			},
			"prov.models.discovery": {
				en: "Discovery",
				zh: "发现"
			},
			"prov.models.pending": {
				en: "refreshing",
				zh: "刷新中"
			},
			"prov.models.ok": {
				en: "ready",
				zh: "就绪"
			},
			"prov.models.stale": {
				en: "stale",
				zh: "已过期"
			},
			"prov.models.error": {
				en: "error",
				zh: "错误"
			},
			"prov.models.not_fetched": {
				en: "not fetched",
				zh: "未获取"
			},
			"prov.models.unknown": {
				en: "unknown",
				zh: "未知"
			},
			"prov.models.no_snapshot": {
				en: "No snapshot",
				zh: "暂无快照"
			},
			"prov.models.models": {
				en: "Models",
				zh: "模型"
			},
			"prov.models.disabled_count": {
				en: "{count} disabled",
				zh: "{count} 个已禁用"
			},
			"prov.models.refresh": {
				en: "Refresh models",
				zh: "刷新模型"
			},
			"prov.models.discovering": {
				en: "Discovering models in the background…",
				zh: "正在后台发现模型…"
			},
			"prov.models.catalog": {
				en: "Model catalog",
				zh: "模型目录"
			},
			"prov.models.catalog_desc": {
				en: "Search, map, and stage availability changes for this provider.",
				zh: "搜索、映射并暂存此提供商的可用性变更。"
			},
			"prov.models.shown": {
				en: "{count} shown",
				zh: "显示 {count} 个"
			},
			"prov.models.search": {
				en: "Search models",
				zh: "搜索模型"
			},
			"prov.models.filter_status": {
				en: "Filter model status",
				zh: "筛选模型状态"
			},
			"prov.models.all": {
				en: "All models",
				zh: "全部模型"
			},
			"prov.models.enabled": {
				en: "Enabled",
				zh: "已启用"
			},
			"prov.models.disabled": {
				en: "Disabled",
				zh: "已禁用"
			},
			"prov.models.disable_shown": {
				en: "Disable shown models",
				zh: "禁用显示的模型"
			},
			"prov.models.enable_shown": {
				en: "Enable shown models",
				zh: "启用显示的模型"
			},
			"prov.models.stage_disable": {
				en: "Stage disable",
				zh: "暂存禁用"
			},
			"prov.models.stage_enable": {
				en: "Stage enable",
				zh: "暂存启用"
			},
			"prov.models.legacy_route_notice": {
				en: "Routes still reference legacy name(s) {names}, now replaced by alias {alias}. Update the route to use the alias.",
				zh: "路由仍引用旧名称 {names}，已由别名 {alias} 取代。建议将路由更新为别名。"
			},
			"prov.models.editing_mapping_for": {
				en: "Editing mapping for",
				zh: "正在编辑映射"
			},
			"prov.models.raw_hero_hint": {
				en: "This is the exact upstream model id the proxy sends to the provider.",
				zh: "这是代理实际发往该供应商的上游真实模型 ID。"
			},
			"prov.models.edit_mapping": {
				en: "Edit model mapping",
				zh: "编辑模型映射"
			},
			"prov.models.edit_mapping_for": {
				en: "Edit mapping for {model}",
				zh: "编辑 {model} 的映射"
			},
			"prov.models.pending_short": {
				en: "pending",
				zh: "待应用"
			},
			"prov.models.visible_count": {
				en: "{count} visible provider models",
				zh: "显示 {count} 个提供商模型"
			},
			"prov.models.no_match": {
				en: "No models match the current search and status filter.",
				zh: "没有模型符合当前搜索和状态筛选。"
			},
			"prov.models.more": {
				en: "+ {count} more models…",
				zh: "另外 {count} 个模型…"
			},
			"prov.models.staged_one": {
				en: "1 staged change",
				zh: "已暂存 1 项变更"
			},
			"prov.models.staged_many": {
				en: "{count} staged changes",
				zh: "已暂存 {count} 项变更"
			},
			"prov.models.review_apply": {
				en: "Review and apply to update provider availability.",
				zh: "检查并应用，以更新提供商可用性。"
			},
			"prov.models.reset": {
				en: "Reset staged model changes",
				zh: "撤销暂存的模型变更"
			},
			"prov.models.reset_label": {
				en: "Reset",
				zh: "撤销"
			},
			"prov.models.apply": {
				en: "Apply model changes ({count})",
				zh: "应用模型变更（{count}）"
			},
			"prov.models.apply_label": {
				en: "Apply changes",
				zh: "应用变更"
			},
			"prov.models.canonical_aliases": {
				en: "Canonical aliases",
				zh: "规范模型别名"
			},
			"prov.models.canonical_aliases_desc": {
				en: "Expose multiple upstream variants as one client-facing model.",
				zh: "将多个上游变体映射为一个客户端模型。"
			},
			"prov.models.configured": {
				en: "{count} configured",
				zh: "已配置 {count} 个"
			},
			"prov.models.variants": {
				en: "{count} variants",
				zh: "{count} 个变体"
			},
			"prov.models.edit_alias": {
				en: "Edit alias",
				zh: "编辑别名"
			},
			"prov.models.edit_alias_for": {
				en: "Edit alias {model}",
				zh: "编辑别名 {model}"
			},
			"prov.models.delete_alias": {
				en: "Delete alias",
				zh: "删除别名"
			},
			"prov.models.delete_alias_for": {
				en: "Delete alias {model}",
				zh: "删除别名 {model}"
			},
			"prov.models.no_aliases": {
				en: "No aliases configured. Add one when several raw models should share a client model name.",
				zh: "尚未配置别名。当多个原始模型需要共用一个客户端模型名时，可在这里添加。"
			},
			"prov.models.add_alias": {
				en: "Add alias",
				zh: "添加别名"
			},
			"prov.models.canonical_model": {
				en: "Canonical model",
				zh: "规范模型"
			},
			"prov.models.choose_variants": {
				en: "Choose discovered variants",
				zh: "选择已发现的变体"
			},
			"prov.models.search_variants": {
				en: "Search discovered models",
				zh: "搜索已发现模型"
			},
			"prov.models.no_discovered_variants": {
				en: "No discovered models are available for selection.",
				zh: "暂无可供选择的已发现模型。"
			},
			"prov.models.priority_for": {
				en: "Priority for {model}",
				zh: "{model} 的优先级"
			},
			"prov.models.custom_variants": {
				en: "Custom model IDs",
				zh: "自定义模型 ID"
			},
			"prov.models.raw_variants": {
				en: "Raw variants",
				zh: "原始变体"
			},
			"prov.models.raw_variants_help": {
				en: "Comma-separated raw model IDs with optional priority. Empty clears the canonical variant list.",
				zh: "用逗号分隔原始模型 ID，可选优先级。留空会清空该规范模型的变体列表。"
			},
			"prov.models.save_alias": {
				en: "Save alias",
				zh: "保存别名"
			},
			"prov.models.advanced_fallback": {
				en: "Advanced fallback",
				zh: "高级回退"
			},
			"prov.models.advanced_fallback_desc": {
				en: "Manually assert models that discovery omits or cannot fetch.",
				zh: "手工声明模型，用于补充发现结果遗漏或无法获取的模型。"
			},
			"prov.models.static_count": {
				en: "{count} static",
				zh: "{count} 个静态模型"
			},
			"prov.models.static": {
				en: "static",
				zh: "静态"
			},
			"prov.models.remove_model": {
				en: "Remove {model}",
				zh: "移除 {model}"
			},
			"prov.models.no_static": {
				en: "No static fallback models configured.",
				zh: "未配置静态回退模型。"
			},
			"prov.models.add_model_ids": {
				en: "Add model IDs",
				zh: "添加模型 ID"
			},
			"prov.models.add_model_ids_ph": {
				en: "e.g. gpt-4o, claude-3-5-sonnet-20241022",
				zh: "例如 gpt-4o、claude-3-5-sonnet-20241022"
			},
			"prov.models.add_model_ids_help": {
				en: "Comma-separated. New entries are appended and de-duplicated.",
				zh: "用逗号分隔，新条目会追加并自动去重。"
			},
			"prov.models.add_models": {
				en: "Add models",
				zh: "添加模型"
			},
			"prov.models.clear": {
				en: "Clear",
				zh: "清空"
			},
			"pm.keys": {
				en: "Keys",
				zh: "密钥"
			},
			"pm.usable": {
				en: "usable",
				zh: "可用"
			},
			"pm.priority": {
				en: "Priority",
				zh: "优先级"
			},
			"pm.higher_first": {
				en: "higher first",
				zh: "越大越优先"
			},
			"pm.success": {
				en: "Success",
				zh: "成功率"
			},
			"pm.recent": {
				en: "recent",
				zh: "近期"
			},
			"pm.avg_first_byte": {
				en: "Avg first byte",
				zh: "平均首字节"
			},
			"pm.successful_calls": {
				en: "successful calls",
				zh: "成功调用"
			},
			"pm.last_first_byte": {
				en: "Last first byte",
				zh: "最近首字节"
			},
			"pm.latest_success": {
				en: "latest success",
				zh: "最近成功"
			},
			"pm.runtime_on": {
				en: "Runtime on",
				zh: "运行中"
			},
			"pm.cooldown_m": {
				en: "Cooldown",
				zh: "冷却"
			},
			"pm.fails": {
				en: "Fails",
				zh: "失败"
			},
			"pm.runtime": {
				en: "runtime",
				zh: "运行时"
			},
			"pm.capability": {
				en: "Capability",
				zh: "能力"
			},
			"pm.models": {
				en: "Models",
				zh: "模型"
			},
			"pm.disabled_m": {
				en: "Disabled",
				zh: "已禁用"
			},
			"pm.fetched": {
				en: "Fetched",
				zh: "获取时间"
			},
			"pm.routes": {
				en: "Routes",
				zh: "路由"
			},
			"pm.provider": {
				en: "provider",
				zh: "提供商"
			},
			"pm.default_pool": {
				en: "Default pool",
				zh: "默认池"
			},
			"pm.route_models": {
				en: "Route models",
				zh: "路由模型"
			},
			"pm.explicit": {
				en: "explicit",
				zh: "显式"
			},
			"pm.provider_select": {
				en: "Provider select",
				zh: "提供商选择"
			},
			"pm.default": {
				en: "default",
				zh: "默认"
			},
			"pm.max_attempts": {
				en: "Max attempts",
				zh: "最大尝试"
			},
			"pm.request": {
				en: "request",
				zh: "请求"
			},
			"pm.models_source": {
				en: "Models source",
				zh: "模型来源"
			},
			"pm.config": {
				en: "config",
				zh: "配置"
			},
			"pm.union_models": {
				en: "Union models",
				zh: "合并模型"
			},
			"pm.canonical_ids": {
				en: "canonical ids",
				zh: "标准 ID"
			},
			"pm.configured": {
				en: "configured",
				zh: "已配置"
			},
			"pm.mapped": {
				en: "Mapped",
				zh: "已映射"
			},
			"pm.available": {
				en: "available",
				zh: "可用"
			},
			"pm.snapshot": {
				en: "snapshot",
				zh: "快照"
			},
			"pm.yes": {
				en: "yes",
				zh: "是"
			},
			"pm.no": {
				en: "no",
				zh: "否"
			},
			"pm.on": {
				en: "on",
				zh: "开"
			},
			"pm.off": {
				en: "off",
				zh: "关"
			},
			"pm.refreshing": {
				en: "refreshing",
				zh: "刷新中"
			},
			"pm.not_fetched": {
				en: "not fetched",
				zh: "未获取"
			},
			"policy.routing_controls": {
				en: "Routing Controls",
				zh: "路由控制"
			},
			"policy.routing_tip": {
				en: "Safe runtime-overlay edits for common scheduling and retry settings.",
				zh: "安全地通过运行时覆盖编辑常用调度和重试设置。"
			},
			"policy.rule_table": {
				en: "Trigger Rules",
				zh: "触发场景规则表"
			},
			"policy.rule_tip": {
				en: "How requests move across attempts.",
				zh: "请求在多次尝试间的流转方式。"
			},
			"policy.failure_policies": {
				en: "Failure Policy",
				zh: "失败策略 (Failure Policy)"
			},
			"policy.failure_tip": {
				en: "Cooldown and disable behavior by error type.",
				zh: "按错误类型设置冷却和禁用行为。"
			},
			"policy.routing": {
				en: "Routing",
				zh: "路由"
			},
			"policy.routing_tip2": {
				en: "Attempt budget, provider order, and format preference.",
				zh: "尝试预算、提供商顺序和格式偏好。"
			},
			"policy.provider_pool": {
				en: "Provider Pool",
				zh: "提供商池 (Provider Pool)"
			},
			"policy.provider_pool_tip": {
				en: "Comma-separated provider names used as the default routing pool.",
				zh: "逗号分隔的提供商名称，用作默认路由池。"
			},
			"policy.selection_mode": {
				en: "Mode Selector",
				zh: "选择模式 (Mode Selector)"
			},
			"policy.selection_tip": {
				en: "How providers are picked from the pool for each request.",
				zh: "每次请求如何从池中选择提供商。"
			},
			"policy.format_preference": {
				en: "Format order",
				zh: "格式顺序"
			},
			"policy.format_preference_tip": {
				en: "Choose whether provider priority or a client-native upstream format wins first.",
				zh: "选择优先遵循提供商优先级，还是优先使用与客户端相同的上游格式。"
			},
			"policy.format_priority": {
				en: "Priority first",
				zh: "优先级优先"
			},
			"policy.format_native": {
				en: "Native format first",
				zh: "原生格式优先"
			},
			"policy.semantic_conversion": {
				en: "Conversion safety",
				zh: "转换安全级别"
			},
			"policy.semantic_conversion_tip": {
				en: "Safe permits documented hint drops and local session expansion. Strict permits only lossless or equivalent mappings.",
				zh: "安全模式允许有记录地省略非语义提示并展开本地会话；严格模式只允许无损或等价映射。"
			},
			"policy.semantic_safe": {
				en: "Safe",
				zh: "安全"
			},
			"policy.semantic_strict": {
				en: "Strict",
				zh: "严格"
			},
			"policy.anthropic_default_tokens": {
				en: "Messages token default",
				zh: "Messages 默认 Token"
			},
			"policy.anthropic_default_tokens_tip": {
				en: "Default max_tokens added when converting a request to Anthropic Messages and the client omitted a limit.",
				zh: "转换到 Anthropic Messages 且客户端未提供限制时补充的默认 max_tokens。"
			},
			"policy.max_attempts": {
				en: "Max attempts",
				zh: "最大尝试次数"
			},
			"policy.max_attempts_tip": {
				en: "Maximum number of provider attempts per request before giving up.",
				zh: "每个请求放弃前的最大提供商尝试次数。"
			},
			"policy.connect": {
				en: "Connect",
				zh: "连接"
			},
			"policy.connect_tip": {
				en: "connect_timeout_s — Seconds to wait for the upstream TCP connection.",
				zh: "connect_timeout_s — 等待上游 TCP 连接的秒数。"
			},
			"policy.read": {
				en: "Read",
				zh: "读取"
			},
			"policy.read_tip": {
				en: "read_timeout_s — Seconds to wait for the full upstream response.",
				zh: "read_timeout_s — 等待完整上游响应的秒数。"
			},
			"policy.first_token": {
				en: "First token",
				zh: "首 Token"
			},
			"policy.first_token_tip": {
				en: "first_token_timeout_s — Seconds to wait for the first SSE token (0 = disabled).",
				zh: "first_token_timeout_s — 等待首个 SSE Token 的秒数（0 = 禁用）。"
			},
			"policy.retry": {
				en: "Retry",
				zh: "重试"
			},
			"policy.retry_controls": {
				en: "Retry & Cooldown",
				zh: "重试与冷却"
			},
			"policy.retry_tip": {
				en: "HTTP retry classes and key handling on failure.",
				zh: "HTTP 重试类别和失败时的密钥处理。"
			},
			"policy.retryable_statuses": {
				en: "Retryable statuses",
				zh: "可重试状态码"
			},
			"policy.retryable_tip": {
				en: "HTTP status codes that trigger a retry (e.g. 429, 500, 502, 503, 504).",
				zh: "触发重试的 HTTP 状态码（如 429、500、502、503、504）。"
			},
			"policy.fatal_key_statuses": {
				en: "Fatal key statuses",
				zh: "致命密钥状态码"
			},
			"policy.fatal_tip": {
				en: "HTTP status codes that mark a key as permanently bad (e.g. 401, 403).",
				zh: "将密钥标记为永久失效的 HTTP 状态码（如 401、403）。"
			},
			"policy.respect_retry_after": {
				en: "Respect Retry-After",
				zh: "尊重 Retry-After"
			},
			"policy.respect_tip": {
				en: "Honor the upstream Retry-After header to extend cooldown duration.",
				zh: "遵从上游 Retry-After 头以延长冷却时长。"
			},
			"policy.same_key_retries": {
				en: "Same-key retries",
				zh: "同密钥重试"
			},
			"policy.same_key_tip": {
				en: "same_key_retries — How many times to retry the same key before switching (0-3).",
				zh: "same_key_retries — 切换前重试同一密钥的次数（0-3）。"
			},
			"policy.failure_ladder": {
				en: "Failure ladder",
				zh: "失败阶梯"
			},
			"policy.ladder_tip": {
				en: "key_failure_ladder_s — Escalating cooldown seconds per consecutive key failure (e.g. 10, 60, 3600).",
				zh: "key_failure_ladder_s — 每次连续密钥失败的递增冷却秒数（如 10, 60, 3600）。"
			},
			"policy.key_cooldown": {
				en: "Key cooldown",
				zh: "密钥冷却"
			},
			"policy.key_cooldown_tip": {
				en: "Cooldown duration (seconds) applied to the key on this error type.",
				zh: "此错误类型下密钥的冷却时长（秒）。"
			},
			"policy.provider_cooldown": {
				en: "Provider cooldown",
				zh: "提供商冷却"
			},
			"policy.provider_cooldown_tip": {
				en: "Cooldown duration (seconds) applied to the provider on this error type.",
				zh: "此错误类型下提供商的冷却时长（秒）。"
			},
			"policy.save_routing": {
				en: "Save routing config",
				zh: "保存路由配置"
			},
			"policy.save_retry": {
				en: "Save retry policy",
				zh: "保存重试策略"
			},
			"policy.save_policy": {
				en: "Save policy",
				zh: "保存策略"
			},
			"policy.col_trigger": {
				en: "Trigger",
				zh: "触发场景"
			},
			"policy.col_retry": {
				en: "Retry",
				zh: "重试"
			},
			"policy.col_switch": {
				en: "Switch",
				zh: "换下家"
			},
			"policy.col_stop": {
				en: "Stop",
				zh: "中止"
			},
			"policy.col_cooldown": {
				en: "Cooldown",
				zh: "冷却"
			},
			"policy.col_key": {
				en: "Disable key",
				zh: "禁用密钥"
			},
			"policy.timeouts": {
				en: "Timeouts",
				zh: "超时设置"
			},
			"policy.advanced_cooldown": {
				en: "Advanced cooldown & ladder",
				zh: "高级冷却与阶梯"
			},
			"policy.disable_key": {
				en: "Disable key",
				zh: "禁用密钥"
			},
			"policy.mode_priority": {
				en: "Priority",
				zh: "优先级"
			},
			"policy.mode_priority_tip": {
				en: "priority_failover — Try providers in priority order, failover to next on error",
				zh: "priority_failover — 按优先级顺序尝试提供商，出错时故障转移到下一个"
			},
			"policy.mode_round_robin": {
				en: "Round-robin",
				zh: "轮询"
			},
			"policy.mode_round_robin_tip": {
				en: "round_robin — Cycle through providers evenly across requests",
				zh: "round_robin — 在请求间均匀轮换提供商"
			},
			"policy.mode_weighted": {
				en: "Weighted",
				zh: "加权"
			},
			"policy.mode_weighted_tip": {
				en: "weighted_rr — Distribute by weight (e.g. provider:2 gets 2x traffic of provider:1)",
				zh: "weighted_rr — 按权重分配（如 provider:2 获得 provider:1 的 2 倍流量）"
			},
			"policy.mode_random": {
				en: "Random",
				zh: "随机"
			},
			"policy.mode_random_tip": {
				en: "random — Pick a provider at random from the pool",
				zh: "random — 从池中随机选择一个提供商"
			},
			"policy.mode_auto": {
				en: "Smart",
				zh: "智能"
			},
			"policy.mode_auto_tip": {
				en: "auto — Priority-based routing with real-time health-score adjustment. Degraded providers are automatically deprioritized.",
				zh: "auto — 基于优先级的路由，结合实时健康度自动调整。降级的提供商会被自动降低优先级。"
			},
			"policy.cooldown_rate_limit": {
				en: "Rate limit",
				zh: "速率限制"
			},
			"policy.cooldown_rate_limit_tip": {
				en: "Rate limit cooldown (seconds)",
				zh: "速率限制冷却时长（秒）"
			},
			"policy.cooldown_server_error": {
				en: "Server error",
				zh: "服务器错误"
			},
			"policy.cooldown_server_error_tip": {
				en: "Server error cooldown (seconds)",
				zh: "服务器错误冷却时长（秒）"
			},
			"policy.cooldown_network_error": {
				en: "Network error",
				zh: "网络错误"
			},
			"policy.cooldown_network_error_tip": {
				en: "Network/timeout cooldown (seconds)",
				zh: "网络/超时冷却时长（秒）"
			},
			"policy.cooldown_key_invalid": {
				en: "Invalid key",
				zh: "密钥无效"
			},
			"policy.cooldown_key_invalid_tip": {
				en: "Invalid key cooldown (seconds)",
				zh: "密钥无效冷却时长（秒）"
			},
			"policy.cooldown_quota_or_balance": {
				en: "Quota/balance",
				zh: "配额/余额"
			},
			"policy.cooldown_quota_or_balance_tip": {
				en: "Quota or balance exhausted cooldown (seconds)",
				zh: "配额或余额耗尽冷却时长（秒）"
			},
			"cfg.providers": {
				en: "Providers",
				zh: "提供商"
			},
			"cfg.providers_tip": {
				en: "Edit existing provider config. To add a new provider, use the Add Provider button on the Providers page.",
				zh: "编辑现有提供商配置。要添加新提供商，请使用提供商页面的「添加提供商」按钮。"
			},
			"cfg.audit_trail": {
				en: "Audit Trail",
				zh: "审计日志"
			},
			"cfg.audit_tip": {
				en: "Recent admin mutations with masked details.",
				zh: "最近的管理操作（详情已脱敏）。"
			},
			"cfg.no_audit": {
				en: "No audit events recorded",
				zh: "暂无审计记录"
			},
			"cfg.conversion_diagnostics": {
				en: "Conversion Diagnostics",
				zh: "格式转换诊断"
			},
			"cfg.download_diagnostics": {
				en: "Download",
				zh: "下载诊断"
			},
			"cfg.clear_diagnostics": {
				en: "Clear",
				zh: "清除诊断"
			},
			"cfg.diagnostics_records": {
				en: "Records",
				zh: "错误记录"
			},
			"cfg.diagnostics_files": {
				en: "Files",
				zh: "文件"
			},
			"cfg.diagnostics_size": {
				en: "Size",
				zh: "占用"
			},
			"cfg.diagnostics_dropped": {
				en: "Dropped",
				zh: "丢弃"
			},
			"cfg.diagnostics_empty": {
				en: "No conversion failures recorded",
				zh: "暂无格式转换错误"
			},
			"cfg.diagnostics_disabled": {
				en: "Diagnostics disabled",
				zh: "格式转换诊断未启用"
			},
			"cfg.diagnostics_recent": {
				en: "Recent conversion failures (newest first)",
				zh: "最近转换错误（最新在前）"
			},
			"cfg.tab_routes": {
				en: "Routes",
				zh: "路由"
			},
			"cfg.tab_model_data": {
				en: "Model Data",
				zh: "模型数据"
			},
			"cfg.tab_data_statistics": {
				en: "Data Statistics",
				zh: "数据统计"
			},
			"cfg.tab_map": {
				en: "Map",
				zh: "映射"
			},
			"cfg.tab_runtime": {
				en: "Runtime",
				zh: "运行时"
			},
			"cfg.tab_proxy": {
				en: "Proxy",
				zh: "代理"
			},
			"cfg.tab_health": {
				en: "Health",
				zh: "健康检查"
			},
			"cfg.tab_advanced": {
				en: "Advanced",
				zh: "高级"
			},
			"cfg.model_routes": {
				en: "Model Routes",
				zh: "模型路由"
			},
			"cfg.model_routes_tip": {
				en: "Map one client model to a weighted provider pool.",
				zh: "将一个客户端模型映射到加权提供商池。"
			},
			"cfg.add_edit_route": {
				en: "Add or edit route",
				zh: "添加或编辑路由"
			},
			"cfg.client_model": {
				en: "Client model",
				zh: "客户端模型"
			},
			"cfg.provider_order": {
				en: "Provider order",
				zh: "提供商顺序"
			},
			"cfg.provider_order_help": {
				en: "provider:weight:priority, comma separated. Priority is optional and overrides provider config.",
				zh: "provider:weight:priority，逗号分隔。priority 为可选，会覆盖提供商配置。"
			},
			"cfg.selection": {
				en: "Selection",
				zh: "选择"
			},
			"cfg.format_preference": {
				en: "Format preference",
				zh: "格式偏好"
			},
			"cfg.format_inherit": {
				en: "Inherit global policy",
				zh: "继承全局策略"
			},
			"cfg.format_preference_help": {
				en: "Controls whether provider priority or the client-native format wins for this model.",
				zh: "控制此模型优先遵循提供商优先级，还是优先使用客户端原生格式。"
			},
			"cfg.reasoning_effort": {
				en: "Reasoning effort",
				zh: "思考强度"
			},
			"cfg.reasoning_effort_inherit": {
				en: "Follow client request",
				zh: "跟随客户端请求"
			},
			"cfg.reasoning_effort_help": {
				en: "Overrides the thinking intensity the client asked for on every upstream attempt. \"Follow client\" keeps the requested value; \"off\" disables thinking entirely.",
				zh: "替换客户端请求的思考强度。选“跟随客户端请求”保持原样；选 off 彻底关闭思考。"
			},
			"cfg.save_route": {
				en: "Save route",
				zh: "保存路由"
			},
			"cfg.no_routes": {
				en: "No model routes configured",
				zh: "未配置模型路由"
			},
			"cfg.provider_model_map": {
				en: "Provider Model Map",
				zh: "提供商模型映射"
			},
			"cfg.pmm_tip": {
				en: "Provider-specific model name overrides.",
				zh: "提供商特定的模型名称覆盖。"
			},
			"cfg.no_pmm": {
				en: "No provider model overrides configured",
				zh: "未配置提供商模型覆盖"
			},
			"cfg.runtime_config": {
				en: "Runtime Config",
				zh: "运行时配置"
			},
			"cfg.runtime_tip": {
				en: "Masked status for the active configuration.",
				zh: "当前活动配置的脱敏状态。"
			},
			"cfg.reload": {
				en: "Reload",
				zh: "重新加载"
			},
			"cfg.no_config": {
				en: "No config loaded",
				zh: "未加载配置"
			},
			"cfg.global_proxy": {
				en: "Global Proxy",
				zh: "全局代理"
			},
			"cfg.global_proxy_tip": {
				en: "Lowest-priority fallback for providers without their own proxy.",
				zh: "没有独立代理的提供商的最低优先级回退。"
			},
			"cfg.proxy_url": {
				en: "Proxy URL",
				zh: "代理 URL"
			},
			"cfg.proxy_url_tip": {
				en: "Blank means direct unless a provider or key proxy is set.",
				zh: "留空表示直连，除非设置了提供商或密钥代理。"
			},
			"cfg.save_global_proxy": {
				en: "Save global proxy",
				zh: "保存全局代理"
			},
			"cfg.save_health": {
				en: "Save health",
				zh: "保存健康检查"
			},
			"cfg.run_now": {
				en: "Run now",
				zh: "立即运行"
			},
			"cfg.running": {
				en: "Running...",
				zh: "运行中..."
			},
			"cfg.triggering_patrol": {
				en: "Triggering patrol round...",
				zh: "正在触发巡检..."
			},
			"cfg.patrol_triggered": {
				en: "Patrol round triggered. Check results in a moment.",
				zh: "巡检已触发，稍后查看结果。"
			},
			"cfg.advanced_tools": {
				en: "Advanced overlay tools",
				zh: "高级覆盖工具"
			},
			"cfg.advanced_desc": {
				en: "Validate, export masked JSON, or clear runtime_config.",
				zh: "验证、导出脱敏 JSON 或清除 runtime_config。"
			},
			"cfg.validate": {
				en: "Validate",
				zh: "验证"
			},
			"cfg.export_masked": {
				en: "Export masked",
				zh: "导出脱敏"
			},
			"cfg.clear_overlay": {
				en: "Clear overlay",
				zh: "清除覆盖"
			},
			"cfg.no_overlay": {
				en: "No overlay status loaded",
				zh: "未加载覆盖状态"
			},
			"cfg.show_preview": {
				en: "Show overlay preview",
				zh: "显示覆盖预览"
			},
			"cfg.raw_snapshot": {
				en: "Raw Snapshot",
				zh: "原始快照"
			},
			"cfg.raw_tip": {
				en: "Masked JSON for debugging.",
				zh: "用于调试的脱敏 JSON。"
			},
			"cfg.show_json": {
				en: "Show masked JSON",
				zh: "显示脱敏 JSON"
			},
			"form.add_provider_title": {
				en: "Add Provider",
				zh: "添加提供商"
			},
			"form.add_provider_sub": {
				en: "Create a provider with the required connection fields.",
				zh: "创建一个包含必填连接字段的提供商。"
			},
			"form.base_url": {
				en: "Base URL",
				zh: "基础 URL"
			},
			"form.base_url_tip": {
				en: "The upstream API endpoint for this provider.",
				zh: "此提供商的上游 API 端点。"
			},
			"form.site_url": {
				en: "Website",
				zh: "站点地址"
			},
			"form.site_url_tip": {
				en: "Website opened by the provider server icon. Leave blank when no site link is needed.",
				zh: "点击提供商服务器图标时打开的站点。无需站点链接时留空。"
			},
			"form.proxy": {
				en: "Proxy",
				zh: "代理"
			},
			"form.proxy_tip": {
				en: "Per-provider proxy URL. Leave blank to use the global proxy or direct connection.",
				zh: "每提供商代理 URL。留空则使用全局代理或直连。"
			},
			"form.user_agent": {
				en: "User-Agent",
				zh: "User-Agent"
			},
			"form.ua_tip": {
				en: "Custom User-Agent header for upstream requests. Blank = inherit default.",
				zh: "上游请求的自定义 User-Agent 头。留空 = 继承默认值。"
			},
			"form.priority": {
				en: "Priority",
				zh: "优先级"
			},
			"form.priority_tip": {
				en: "Higher number = higher priority in failover order (e.g. 100 before 90 before 0). New providers default to lowest priority.",
				zh: "数字越大 = 故障转移顺序中优先级越高（如 100 先于 90 先于 0）。新供应商默认为最低优先级。"
			},
			"form.enabled": {
				en: "Enabled",
				zh: "启用"
			},
			"form.enabled_tip": {
				en: "Toggle whether this provider participates in routing.",
				zh: "切换此提供商是否参与路由。"
			},
			"form.save": {
				en: "Save",
				zh: "保存"
			},
			"form.reset": {
				en: "Reset",
				zh: "重置"
			},
			"form.cancel": {
				en: "Cancel",
				zh: "取消"
			},
			"form.save_provider": {
				en: "Save provider",
				zh: "保存提供商"
			},
			"form.save_configuration": {
				en: "Save configuration",
				zh: "保存配置"
			},
			"confirm.title_default": {
				en: "Confirm action",
				zh: "确认操作"
			},
			"confirm.delete": {
				en: "Delete",
				zh: "删除"
			},
			"confirm.clear": {
				en: "Clear",
				zh: "清除"
			},
			"confirm.message_default": {
				en: "This action needs confirmation.",
				zh: "此操作需要确认。"
			},
			"confirm.close": {
				en: "Close",
				zh: "关闭"
			},
			"confirm.delete_key.title": {
				en: "Delete key",
				zh: "删除密钥"
			},
			"confirm.delete_key.msg": {
				en: "Delete {label} from {provider}?",
				zh: "从 {provider} 删除 {label}？"
			},
			"confirm.delete_key.last": {
				en: " This is the last key; the provider will become unavailable until another key is added.",
				zh: " 这是最后一个密钥；在添加新密钥之前，该提供商将不可用。"
			},
			"confirm.delete_provider.title": {
				en: "Delete Provider",
				zh: "删除提供商"
			},
			"confirm.delete_provider.msg": {
				en: "Delete {provider}? It will be removed from provider config, route pools, model maps, and capability snapshots.",
				zh: "删除 {provider}？它将从提供商配置、路由池、模型映射和能力快照中移除。"
			},
			"confirm.clear_overlay.title": {
				en: "Clear runtime overlay",
				zh: "清除运行时覆盖"
			},
			"confirm.clear_overlay.msg": {
				en: "Clear runtime_config overlay and restart runtime objects from base config?",
				zh: "清除 runtime_config 覆盖并从基础配置重启运行时对象？"
			},
			"confirm.clear_compatibility.title": {
				en: "Clear compatibility circuits",
				zh: "清除兼容性熔断"
			},
			"confirm.clear_compatibility.msg": {
				en: "Clear {scope} compatibility circuits? Routing will evaluate these combinations again immediately.",
				zh: "清除{scope}的兼容性熔断？路由会立即重新评估这些组合。"
			},
			"confirm.clear_diagnostics.title": {
				en: "Clear conversion diagnostics",
				zh: "清除格式转换诊断"
			},
			"confirm.clear_diagnostics.msg": {
				en: "Delete all retained conversion diagnostic files?",
				zh: "删除所有保留的格式转换诊断文件？"
			},
			"confirm.delete_route.title": {
				en: "Delete model route",
				zh: "删除模型路由"
			},
			"confirm.delete_route.msg": {
				en: "Delete model route for {model}?",
				zh: "删除模型 {model} 的路由？"
			},
			"confirm.delete_alias.title": {
				en: "Delete model alias",
				zh: "删除模型别名"
			},
			"confirm.delete_alias.msg": {
				en: "Delete alias {model} from {provider}?",
				zh: "从 {provider} 删除模型别名 {model}？"
			},
			"confirm.delete_selected.title": {
				en: "Delete selected requests",
				zh: "删除所选请求"
			},
			"confirm.delete_matching.title": {
				en: "Delete matching requests",
				zh: "删除匹配的请求"
			},
			"confirm.clear_history.title": {
				en: "Clear request history",
				zh: "清除请求历史"
			},
			"confirm.delete_selected.msg": {
				en: "Delete {count} selected request record{plural}? Runtime counters are not reset.",
				zh: "删除 {count} 条已选请求记录？运行时计数器不会重置。"
			},
			"confirm.delete_matching.msg": {
				en: "Delete all {count} request record{plural} matching the current filters? Runtime counters are not reset.",
				zh: "删除所有 {count} 条匹配当前筛选条件的请求记录？运行时计数器不会重置。"
			},
			"confirm.clear_history.msg": {
				en: "Clear all request history, runtime metrics, and diagnostic log records?",
				zh: "清除所有请求历史、运行时指标和诊断日志记录？"
			},
			"notice.provider_added": {
				en: "Provider {name} added.",
				zh: "提供商 {name} 已添加。"
			},
			"notice.compatibility_cleared": {
				en: "Cleared {count} compatibility circuits.",
				zh: "已清除 {count} 条兼容性熔断。"
			},
			"notice.diagnostics_downloaded": {
				en: "Conversion diagnostics downloaded.",
				zh: "格式转换诊断已下载。"
			},
			"notice.diagnostics_cleared": {
				en: "Conversion diagnostics cleared.",
				zh: "格式转换诊断已清除。"
			},
			"notice.add_provider_failed": {
				en: "Add provider failed: {error}",
				zh: "添加提供商失败：{error}"
			},
			"notice.refresh_failed": {
				en: "Console refresh failed: {error}",
				zh: "控制台刷新失败：{error}"
			},
			"notice.config_refresh_failed": {
				en: "Provider config refresh failed: {error}",
				zh: "提供商配置刷新失败：{error}"
			},
			"notice.static_models_saved": {
				en: "Static models for {provider} saved.",
				zh: "{provider} 的静态模型已保存。"
			},
			"notice.static_models_cleared": {
				en: "Static models for {provider} cleared.",
				zh: "{provider} 的静态模型已清除。"
			},
			"notice.static_model_removed": {
				en: "Static model {model} removed from {provider}.",
				zh: "静态模型 {model} 已从 {provider} 移除。"
			},
			"notice.model_alias_deleted": {
				en: "Model alias {model} removed from {provider}.",
				zh: "模型别名 {model} 已从 {provider} 删除。"
			},
			"notice.failed": {
				en: "Failed: {error}",
				zh: "失败：{error}"
			},
			"notice.saving": {
				en: "Saving...",
				zh: "正在保存..."
			},
			"notice.saved": {
				en: "Saved.",
				zh: "已保存。"
			},
			"notice.action_running": {
				en: "Running action...",
				zh: "正在执行操作..."
			},
			"notice.action_already_running": {
				en: "This action is already running.",
				zh: "该操作正在执行。"
			},
			"notice.action_done": {
				en: "Action completed.",
				zh: "操作已完成。"
			},
			"notice.action_failed": {
				en: "Action failed: {error}",
				zh: "操作失败：{error}"
			},
			"notice.proxy_empty": {
				en: "Proxy is empty; this field will use direct or inherited routing.",
				zh: "代理为空；该字段将使用直连或继承代理。"
			},
			"notice.config_loading": {
				en: "Configuration is still loading; try again in a moment.",
				zh: "配置尚未加载完成，请稍候再试。"
			},
			"notice.proxy_connected": {
				en: "Proxy connected in {latency}.",
				zh: "代理已连接，用时 {latency}。"
			},
			"notice.proxy_failed": {
				en: "Proxy test failed: {detail}",
				zh: "代理测试失败：{detail}"
			},
			"notice.health_monitor_saved": {
				en: "Health monitor settings saved.",
				zh: "健康检查设置已保存。"
			},
			"notice.health_monitor_failed": {
				en: "Health monitor save failed: {error}",
				zh: "健康检查保存失败：{error}"
			},
			"notice.key_deleted": {
				en: "Key {index} deleted from {provider}.",
				zh: "密钥 {index} 已从 {provider} 删除。"
			},
			"notice.delete_key_failed": {
				en: "Delete key failed: {error}",
				zh: "删除密钥失败：{error}"
			},
			"notice.models_refreshed": {
				en: "Models for {provider} refreshed.",
				zh: "{provider} 的模型已刷新。"
			},
			"notice.model_refresh_failed": {
				en: "Model refresh failed: {error}",
				zh: "模型刷新失败：{error}"
			},
			"notice.model_settings_saved": {
				en: "Model settings for {provider} saved.",
				zh: "{provider} 的模型设置已保存。"
			},
			"notice.model_setting_failed": {
				en: "Model setting failed: {error}",
				zh: "模型设置失败：{error}"
			},
			"notice.model_mapping_saved": {
				en: "Model mapping saved for {provider}.",
				zh: "{provider} 的模型映射已保存。"
			},
			"notice.model_mapping_reset": {
				en: "Model mapping reset for {provider}.",
				zh: "{provider} 的模型映射已重置。"
			},
			"notice.model_mapping_failed": {
				en: "Model mapping failed: {error}",
				zh: "模型映射失败：{error}"
			},
			"notice.model_mapping_required": {
				en: "Model mapping name is required.",
				zh: "模型映射名称为必填项。"
			},
			"notice.format_path_empty": {
				en: "Format path cannot be empty.",
				zh: "格式路径不能为空。"
			},
			"notice.format_updated": {
				en: "{provider} {format} path updated.",
				zh: "{provider} 的 {format} 路径已更新。"
			},
			"notice.routing_updated": {
				en: "Routing settings updated.",
				zh: "路由设置已更新。"
			},
			"notice.retry_updated": {
				en: "Retry settings updated.",
				zh: "重试设置已更新。"
			},
			"notice.failure_policy_updated": {
				en: "Failure policy {type} updated.",
				zh: "失败策略 {type} 已更新。"
			},
			"notice.policy_failed": {
				en: "Policy update failed: {error}",
				zh: "策略更新失败：{error}"
			},
			"notice.provider_deleted": {
				en: "Provider {provider} deleted.",
				zh: "提供商 {provider} 已删除。"
			},
			"notice.delete_provider_failed": {
				en: "Delete provider failed: {error}",
				zh: "删除提供商失败：{error}"
			},
			"notice.provider_updated": {
				en: "Provider {provider} updated.",
				zh: "提供商 {provider} 已更新。"
			},
			"notice.key_added": {
				en: "Key added to {provider}.",
				zh: "密钥已添加到 {provider}。"
			},
			"notice.key_proxy_updated": {
				en: "Key {index} proxy updated for {provider}.",
				zh: "{provider} 的密钥 {index} 代理已更新。"
			},
			"notice.format_toggled": {
				en: "{provider} {format} {state}.",
				zh: "{provider} 的 {format} 已{state}。"
			},
			"notice.enabled": {
				en: "enabled",
				zh: "启用"
			},
			"notice.disabled": {
				en: "disabled",
				zh: "禁用"
			},
			"notice.format_update_failed": {
				en: "Format update failed: {error}",
				zh: "格式更新失败：{error}"
			},
			"notice.config_update_failed": {
				en: "Config update failed: {error}",
				zh: "配置更新失败：{error}"
			},
			"notice.request_history_cleared": {
				en: "Request history cleared ({count} records).",
				zh: "请求历史已清除（{count} 条记录）。"
			},
			"notice.requests_deleted": {
				en: "Deleted {count} request record{plural}.",
				zh: "已删除 {count} 条请求记录。"
			},
			"notice.delete_requests_failed": {
				en: "Delete requests failed: {error}",
				zh: "删除请求失败：{error}"
			},
			"notice.config_reload_failed": {
				en: "Config reload failed: {error}",
				zh: "配置重新加载失败：{error}"
			},
			"notice.global_proxy_updated": {
				en: "Global proxy updated.",
				zh: "全局代理已更新。"
			},
			"notice.overlay_exported": {
				en: "Masked overlay exported to preview.",
				zh: "脱敏覆盖已导出到预览。"
			},
			"notice.overlay_export_failed": {
				en: "Overlay export failed: {error}",
				zh: "覆盖导出失败：{error}"
			},
			"notice.overlay_validated": {
				en: "Overlay validation passed.",
				zh: "覆盖验证通过。"
			},
			"notice.overlay_validation_failed": {
				en: "Overlay validation failed: {error}",
				zh: "覆盖验证失败：{error}"
			},
			"notice.overlay_cleared_backup": {
				en: "Overlay cleared. Backup: {path}",
				zh: "覆盖已清除。备份：{path}"
			},
			"notice.overlay_cleared": {
				en: "Overlay cleared.",
				zh: "覆盖已清除。"
			},
			"notice.clear_overlay_failed": {
				en: "Clear overlay failed: {error}",
				zh: "清除覆盖失败：{error}"
			},
			"notice.model_route_deleted": {
				en: "Model route {model} deleted.",
				zh: "模型路由 {model} 已删除。"
			},
			"notice.model_route_saved": {
				en: "Model route {model} saved.",
				zh: "模型路由 {model} 已保存。"
			},
			"notice.delete_route_failed": {
				en: "Delete model route failed: {error}",
				zh: "删除模型路由失败：{error}"
			},
			"notice.confirm_unavailable": {
				en: "Confirmation dialog is unavailable. Refresh the console and try again.",
				zh: "确认对话框不可用。请刷新控制台后重试。"
			},
			"modal.edit_mapping_title": {
				en: "Edit model mapping",
				zh: "编辑模型映射"
			},
			"modal.mapping_clash_title": {
				en: "Mapping name collision",
				zh: "映射名称冲突"
			},
			"modal.mapping_clash_msg": {
				en: "You are renaming {editingRaw} to \"{name}\", but that name currently belongs to {ownerRaw}. If you continue, \"{name}\" will point to {editingRaw} and {ownerRaw} will fall back to its original upstream id. Continue?",
				zh: "你正在将 {editingRaw} 命名为「{name}」，但该名称当前属于 {ownerRaw}。继续后「{name}」将指向 {editingRaw}，{ownerRaw} 将恢复其原始上游 ID。确认继续？"
			},
			"modal.mapping_clash_accept": {
				en: "Rename anyway",
				zh: "仍要重命名"
			},
			"modal.mapping_test": {
				en: "Test model",
				zh: "测试模型"
			},
			"modal.mapping_test_running": {
				en: "Testing…",
				zh: "测试中…"
			},
			"modal.mapping_test_ok": {
				en: "OK · {ms} ms",
				zh: "可用 · {ms} ms"
			},
			"modal.mapping_test_failed": {
				en: "Failed: {error}",
				zh: "失败：{error}"
			},
			"notice.model_mapping_saved_detail": {
				en: "Saved: {name} → {raw}",
				zh: "已保存映射：{name} → {raw}"
			},
			"modal.edit_format_title": {
				en: "Edit format path",
				zh: "编辑格式路径"
			},
			"pg.eyebrow": {
				en: "Playground",
				zh: "测试场"
			},
			"pg.page_title": {
				en: "Playground",
				zh: "测试场 (Playground)"
			},
			"pg.page_desc": {
				en: "Test runtime model formats, parameters, and response streams.",
				zh: "即时测试代理运行时的模型格式、参数与响应流。"
			},
			"pg.setup": {
				en: "Request setup",
				zh: "请求配置"
			},
			"pg.setup_desc": {
				en: "Choose the model, client format, and generation controls for this test run.",
				zh: "选择此测试运行的模型、客户端格式和生成参数。"
			},
			"pg.model": {
				en: "Model",
				zh: "模型"
			},
			"pg.search_model": {
				en: "Search model...",
				zh: "搜索模型..."
			},
			"pg.parameters": {
				en: "Parameters",
				zh: "参数"
			},
			"pg.temp": {
				en: "Temp",
				zh: "温度"
			},
			"pg.max_tokens": {
				en: "Max tokens",
				zh: "最大 Token"
			},
			"pg.top_p": {
				en: "Top P",
				zh: "Top P"
			},
			"pg.stream": {
				en: "Stream",
				zh: "流式"
			},
			"pg.include_history": {
				en: "Include history",
				zh: "包含历史"
			},
			"pg.system_prompt": {
				en: "System Prompt",
				zh: "系统提示词"
			},
			"pg.system_ph": {
				en: "Optional system prompt...",
				zh: "可选的系统提示词..."
			},
			"pg.api_format": {
				en: "API Format",
				zh: "API 格式"
			},
			"pg.chat": {
				en: "Chat",
				zh: "Chat"
			},
			"pg.responses": {
				en: "Responses",
				zh: "Responses"
			},
			"pg.anthropic": {
				en: "Anthropic",
				zh: "Anthropic"
			},
			"pg.live_test": {
				en: "Live test",
				zh: "实时测试"
			},
			"pg.sandbox": {
				en: "Message sandbox",
				zh: "消息沙箱 (MESSAGE SANDBOX)"
			},
			"pg.ready": {
				en: "Ready",
				zh: "就绪 (Ready)"
			},
			"pg.input_ph": {
				en: "Type a message... (Enter to send, Shift+Enter for newline)",
				zh: "输入消息...（Enter 发送，Shift+Enter 换行）"
			},
			"pg.clear": {
				en: "Clear",
				zh: "清除"
			},
			"pg.clear_conversation": {
				en: "Clear conversation",
				zh: "清空对话"
			},
			"pg.stop": {
				en: "Stop",
				zh: "停止"
			},
			"pg.send": {
				en: "Send",
				zh: "发送"
			},
			"pg.sending": {
				en: "Sending...",
				zh: "发送中..."
			},
			"pg.done": {
				en: "Done.",
				zh: "完成。"
			},
			"pg.stopped": {
				en: "Stopped.",
				zh: "已停止。"
			},
			"pg.error": {
				en: "Error: {error}",
				zh: "错误：{error}"
			},
			"pg.load_failed": {
				en: "Failed to load models: {error}",
				zh: "加载模型失败：{error}"
			},
			"model.drawer_title": {
				en: "Model Details",
				zh: "模型详情"
			},
			"model.drawer_subtitle": {
				en: "Artificial Analysis Summary",
				zh: "Artificial Analysis 摘要"
			},
			"mobile.sections": {
				en: "Sections",
				zh: "栏目"
			},
			"mobile.runtime": {
				en: "Runtime",
				zh: "运行时"
			},
			"mobile.request_filters": {
				en: "Request filters",
				zh: "请求筛选"
			},
			"mobile.close": {
				en: "Close settings",
				zh: "关闭设置"
			},
			"mobile.nav_desc": {
				en: "Navigation, runtime controls, and view filters.",
				zh: "导航、运行时控制和视图筛选。"
			},
			"misc.mono": {
				en: "mono",
				zh: "mono"
			},
			"misc.open_providers": {
				en: "Open Providers",
				zh: "打开提供商"
			},
			"misc.open_requests": {
				en: "Open Requests",
				zh: "打开请求"
			},
			"misc.priority_total": {
				en: "priority / total",
				zh: "优先 / 总计"
			},
			"misc.key_cooldown_short": {
				en: "key cooldown",
				zh: "密钥冷却"
			},
			"misc.pricing_for": {
				en: "Pricing for {model}",
				zh: "{model} 的定价"
			},
			"pricing.input": {
				en: "Input",
				zh: "输入"
			},
			"pricing.output": {
				en: "Output",
				zh: "输出"
			},
			"pricing.cache_read": {
				en: "Cache read",
				zh: "缓存读取"
			},
			"pricing.cache_write": {
				en: "Cache write",
				zh: "缓存写入"
			},
			"pricing.cache_write_estimated": {
				en: "Cache write (estimated)",
				zh: "缓存写入（估算）"
			},
			"pricing.blended": {
				en: "Blended",
				zh: "混合"
			},
			"cost.priced": {
				en: "Priced",
				zh: "已定价"
			},
			"cost.estimated": {
				en: "Estimated",
				zh: "估算"
			},
			"cost.pending": {
				en: "Pricing pending",
				zh: "待定价"
			},
			"cost.unpriced": {
				en: "Unpriced",
				zh: "无法定价"
			},
			"cost.legacy": {
				en: "Legacy",
				zh: "旧记录"
			},
			"tokens.composition": {
				en: "Token composition",
				zh: "Token 构成"
			},
			"tokens.uncached": {
				en: "Input",
				zh: "普通输入"
			},
			"tokens.cached": {
				en: "Cache read",
				zh: "缓存读取"
			},
			"tokens.cache_write": {
				en: "Cache write",
				zh: "缓存写入"
			},
			"tokens.output": {
				en: "Output",
				zh: "输出"
			},
			"tokens.reasoning": {
				en: "Reasoning",
				zh: "推理"
			},
			"tokens.reasoning_subset": {
				en: "Reasoning is included in output tokens.",
				zh: "推理 Token 已包含在输出 Token 中。"
			},
			"usage_stats.views_label": {
				en: "Statistics views",
				zh: "统计视图"
			},
			"usage_stats.usage_tab": {
				en: "Usage Statistics",
				zh: "使用统计"
			},
			"usage_stats.title": {
				en: "Usage Statistics",
				zh: "使用统计"
			},
			"usage_stats.subtitle": {
				en: "Permanent aggregate usage, cost, request results, and latency.",
				zh: "查看长期累计的用量、成本、请求结果与响应延迟。"
			},
			"usage_stats.filters_label": {
				en: "Usage statistics filters",
				zh: "使用统计筛选"
			},
			"usage_stats.range_label": {
				en: "Statistics time range",
				zh: "统计时间范围"
			},
			"usage_stats.today": {
				en: "Today",
				zh: "今天"
			},
			"usage_stats.one_year": {
				en: "1 year",
				zh: "1 年"
			},
			"usage_stats.custom": {
				en: "Custom",
				zh: "自定义"
			},
			"usage_stats.model_filter": {
				en: "Model filter",
				zh: "模型筛选"
			},
			"usage_stats.provider_filter": {
				en: "Provider filter",
				zh: "供应商筛选"
			},
			"usage_stats.format_filter": {
				en: "Client format filter",
				zh: "客户端格式筛选"
			},
			"usage_stats.all_models": {
				en: "All models",
				zh: "全部模型"
			},
			"usage_stats.all_providers": {
				en: "All providers",
				zh: "全部供应商"
			},
			"usage_stats.all_formats": {
				en: "All formats",
				zh: "全部格式"
			},
			"usage_stats.refresh": {
				en: "Refresh statistics",
				zh: "刷新统计"
			},
			"usage_stats.start_date": {
				en: "Start",
				zh: "开始日期"
			},
			"usage_stats.end_date": {
				en: "End",
				zh: "结束日期"
			},
			"usage_stats.open_tab": {
				en: "Open this tab to load usage statistics.",
				zh: "打开此标签后加载使用统计。"
			},
			"usage_stats.trend": {
				en: "Usage trend",
				zh: "使用趋势"
			},
			"usage_stats.metric_label": {
				en: "Trend metric",
				zh: "趋势指标"
			},
			"usage_stats.requests": {
				en: "Requests",
				zh: "请求"
			},
			"usage_stats.latency": {
				en: "Latency",
				zh: "延迟"
			},
			"usage_stats.breakdown": {
				en: "Usage breakdown",
				zh: "用量下钻"
			},
			"usage_stats.breakdown_hint": {
				en: "Compare the selected range without mixing client requests and upstream consumption.",
				zh: "在同一范围内比较数据，并区分客户端请求与上游消耗。"
			},
			"usage_stats.breakdown_label": {
				en: "Breakdown dimension",
				zh: "下钻维度"
			},
			"usage_stats.by_model": {
				en: "Models",
				zh: "模型"
			},
			"usage_stats.by_provider": {
				en: "Providers",
				zh: "供应商"
			},
			"usage_stats.invalid_custom_range": {
				en: "Choose a valid start and end date.",
				zh: "请选择有效的开始和结束日期。"
			},
			"usage_stats.partial_load_failed": {
				en: "Some statistics could not be loaded: {error}",
				zh: "部分统计加载失败：{error}"
			},
			"usage_stats.failed": {
				en: "Usage statistics failed: {error}",
				zh: "使用统计加载失败：{error}"
			},
			"usage_stats.since": {
				en: "Statistics since {date}",
				zh: "统计始于 {date}"
			},
			"usage_stats.awaiting_data": {
				en: "Waiting for the first sample",
				zh: "等待首条统计数据"
			},
			"usage_stats.complete": {
				en: "Complete",
				zh: "数据完整"
			},
			"usage_stats.partial": {
				en: "Backfilling",
				zh: "正在回填"
			},
			"usage_stats.cost_pending": {
				en: "{count} awaiting price",
				zh: "{count} 条待定价"
			},
			"usage_stats.cost_unpriced": {
				en: "{count} unpriced",
				zh: "{count} 条无法定价"
			},
			"usage_stats.cost_estimated": {
				en: "{count} estimated",
				zh: "{count} 条估算"
			},
			"usage_stats.cost_priced": {
				en: "Price status complete",
				zh: "定价状态完整"
			},
			"usage_stats.total_tokens": {
				en: "Total Tokens",
				zh: "总 Token"
			},
			"usage_stats.upstream_consumption": {
				en: "Upstream attempt consumption",
				zh: "实际已尝试上游消耗"
			},
			"usage_stats.client_requests": {
				en: "Client requests",
				zh: "客户端请求"
			},
			"usage_stats.known_cost": {
				en: "Known cost",
				zh: "已知成本"
			},
			"usage_stats.success_value": {
				en: "{count} success · {rate}",
				zh: "{count} 次成功 · {rate}"
			},
			"usage_stats.no_token_samples": {
				en: "No token samples",
				zh: "暂无 Token 样本"
			},
			"usage_stats.empty": {
				en: "No aggregate usage in this range.",
				zh: "此范围内没有累计用量。"
			},
			"usage_stats.empty_series": {
				en: "No trend data in this range.",
				zh: "此范围内没有趋势数据。"
			},
			"usage_stats.chart_context": {
				en: "{range} · {resolution} · {count} points",
				zh: "{range} · {resolution} · {count} 个数据点"
			},
			"usage_stats.hourly": {
				en: "Hourly",
				zh: "小时粒度"
			},
			"usage_stats.daily": {
				en: "Daily",
				zh: "每日粒度"
			},
			"usage_stats.no_series_title": {
				en: "No measurable trend yet",
				zh: "暂时没有可绘制的趋势"
			},
			"usage_stats.no_series_hint": {
				en: "Requests can exist without reported token, cost, or latency samples.",
				zh: "请求可能存在，但上游没有返回 Token、成本或延迟样本。"
			},
			"usage_stats.chart_aria": {
				en: "Usage trend for {metric}",
				zh: "{metric} 使用趋势"
			},
			"usage_stats.success": {
				en: "Success",
				zh: "成功"
			},
			"usage_stats.failed_requests": {
				en: "Failed",
				zh: "失败"
			},
			"usage_stats.recovered": {
				en: "Recovered",
				zh: "已恢复"
			},
			"usage_stats.first_event": {
				en: "First event",
				zh: "首事件"
			},
			"usage_stats.total_duration": {
				en: "Total duration",
				zh: "总耗时"
			},
			"usage_stats.empty_breakdown": {
				en: "No breakdown data in this range.",
				zh: "此范围内没有下钻数据。"
			},
			"usage_stats.page_of": {
				en: "Page {page} of {total}",
				zh: "第 {page} / {total} 页"
			},
			"usage_stats.provider_semantics": {
				en: "Request outcomes use the final provider; Token and cost use actual upstream attempts.",
				zh: "请求结果按最终供应商统计，Token 与成本按实际上游尝试统计。"
			},
			"usage_stats.model_semantics": {
				en: "Each client model aggregates every provider and upstream variant.",
				zh: "每个客户端模型汇总其全部供应商和上游变体。"
			},
			"usage_stats.no_breakdown_title": {
				en: "Nothing to compare yet",
				zh: "暂时没有可比较的数据"
			},
			"usage_stats.no_breakdown_hint": {
				en: "Change the time range or clear the active filters.",
				zh: "可以调整时间范围或清除当前筛选。"
			},
			"usage_stats.upstream_provider": {
				en: "Upstream provider",
				zh: "上游供应商"
			},
			"usage_stats.client_model": {
				en: "Client model",
				zh: "客户端模型"
			},
			"usage_stats.requests_and_success": {
				en: "{requests} requests · {rate} success",
				zh: "{requests} 次请求 · 成功率 {rate}"
			},
			"usage_stats.cost_short": {
				en: "Known cost",
				zh: "已知成本"
			},
			"usage_stats.backfill_title": {
				en: "Historical statistics are still backfilling",
				zh: "历史统计仍在后台回填"
			},
			"usage_stats.backfill_hint": {
				en: "{count} records remain; displayed values are partial.",
				zh: "还剩 {count} 条记录，当前显示的是部分数据。"
			},
			"usage_stats.data_management": {
				en: "Statistics data management",
				zh: "统计数据管理"
			},
			"usage_stats.clear_title": {
				en: "Clear permanent statistics",
				zh: "清除长期统计"
			},
			"usage_stats.clear_hint": {
				en: "Starts a new statistics generation. Request history is not deleted.",
				zh: "清除后开启新的统计世代，不会删除请求历史。"
			},
			"usage_stats.clear_action": {
				en: "Clear statistics",
				zh: "清除统计"
			},
			"usage_stats.clear_confirm_title": {
				en: "Clear permanent statistics",
				zh: "确认清除长期统计"
			},
			"usage_stats.clear_confirm_message": {
				en: "Clear all permanent usage aggregates and start a new statistics generation? Request details remain available.",
				zh: "清除全部长期用量聚合并开启新的统计世代？请求明细仍会保留。"
			},
			"usage_stats.clear_done": {
				en: "Permanent statistics cleared. A new generation has started.",
				zh: "长期统计已清除，新的统计世代已经开始。"
			},
			"usage_stats.clear_failed": {
				en: "Clear statistics failed: {error}",
				zh: "清除统计失败：{error}"
			},
			"model_usage.title": {
				en: "Model Data",
				zh: "模型数据"
			},
			"model_usage.subtitle": {
				en: "Calls, token composition, cache efficiency, cost, and current routing coverage.",
				zh: "查看调用、Token 构成、缓存效率、成本与当前路由覆盖。"
			},
			"model_usage.search": {
				en: "Search models",
				zh: "搜索模型"
			},
			"model_usage.search_ph": {
				en: "Search model ID…",
				zh: "搜索模型 ID…"
			},
			"model_usage.sort_label": {
				en: "Sort model usage",
				zh: "模型用量排序"
			},
			"model_usage.table_label": {
				en: "Model usage and routing coverage",
				zh: "模型用量与路由覆盖"
			},
			"model_usage.open_model": {
				en: "Open model {model}",
				zh: "打开模型 {model}"
			},
			"model_usage.timeline_label": {
				en: "Calls over time: {summary}",
				zh: "调用趋势：{summary}"
			},
			"model_usage.keys": {
				en: "keys",
				zh: "密钥"
			},
			"model_usage.pages": {
				en: "Model pages",
				zh: "模型分页"
			},
			"model_usage.range_of": {
				en: "{start}–{end} of {total} models",
				zh: "第 {start}–{end} 个，共 {total} 个模型"
			},
			"model_usage.aggregation_hint": {
				en: "Aggregated by client model across all providers",
				zh: "按客户端模型汇总全部供应商"
			},
			"model_usage.token_in_out": {
				en: "{input} input / {output} output",
				zh: "{input} 输入 / {output} 输出"
			},
			"model_usage.sort_calls": {
				en: "Calls",
				zh: "调用量"
			},
			"model_usage.sort_tokens": {
				en: "Tokens",
				zh: "Token"
			},
			"model_usage.sort_cache": {
				en: "Cache rate",
				zh: "缓存率"
			},
			"model_usage.sort_cost": {
				en: "Cost",
				zh: "成本"
			},
			"model_usage.sort_recent": {
				en: "Recently used",
				zh: "最近调用"
			},
			"model_usage.open_tab": {
				en: "Open this tab to load model data.",
				zh: "打开此标签后加载模型数据。"
			},
			"model_usage.loading": {
				en: "Loading model data...",
				zh: "正在加载模型数据..."
			},
			"model_usage.failed": {
				en: "Model data failed: {error}",
				zh: "模型数据加载失败：{error}"
			},
			"model_usage.empty": {
				en: "No model calls in this range.",
				zh: "此时间范围内没有模型调用。"
			},
			"model_usage.calls": {
				en: "Calls",
				zh: "调用"
			},
			"model_usage.success_rate": {
				en: "Success rate",
				zh: "成功率"
			},
			"model_usage.total_tokens": {
				en: "Total tokens",
				zh: "总 Token"
			},
			"model_usage.cache_rate": {
				en: "Cache rate",
				zh: "缓存率"
			},
			"model_usage.cost": {
				en: "Cost",
				zh: "成本"
			},
			"model_usage.col_model": {
				en: "Model",
				zh: "模型"
			},
			"model_usage.col_calls": {
				en: "Calls",
				zh: "调用量"
			},
			"model_usage.col_success": {
				en: "Success rate",
				zh: "成功率"
			},
			"model_usage.col_tokens": {
				en: "Token composition",
				zh: "Token 构成"
			},
			"model_usage.col_cache": {
				en: "Cache rate",
				zh: "缓存率"
			},
			"model_usage.col_cost": {
				en: "Cost",
				zh: "成本"
			},
			"model_usage.col_support": {
				en: "Current support",
				zh: "当前支持"
			},
			"model_usage.col_recent": {
				en: "Last used",
				zh: "最近调用"
			},
			"model_usage.drawer_subtitle": {
				en: "Usage and routing coverage",
				zh: "用量与路由覆盖"
			},
			"model_usage.timeline": {
				en: "Call timeline",
				zh: "调用趋势"
			},
			"model_usage.provider_breakdown": {
				en: "Provider breakdown",
				zh: "供应商明细"
			},
			"model_usage.current_support": {
				en: "Current routing support",
				zh: "当前路由支持"
			},
			"model_usage.no_support": {
				en: "No enabled provider currently declares this model.",
				zh: "当前没有已启用供应商声明支持此模型。"
			},
			"model_usage.keys_available": {
				en: "keys available",
				zh: "密钥可用"
			},
			"model_usage.priority_tip": {
				en: "Effective priority. Higher tries first; route/override sources shown as tags.",
				zh: "有效优先级，数值越高越先尝试；标签标注优先级来源（路由覆盖/临时覆盖/健康调整）。"
			},
			"model_usage.priority_route": {
				en: "route",
				zh: "路由"
			},
			"model_usage.priority_override": {
				en: "override",
				zh: "临时"
			},
			"model_usage.priority_auto": {
				en: "auto",
				zh: "健康"
			},
			"model_usage.rotation_note": {
				en: "{mode} rotates providers per request; the order below is what the next request would try.",
				zh: "{mode} 模式下供应商按请求轮换，以下为下一次请求将尝试的顺序。"
			},
			"model_usage.routing_path": {
				en: "Live routing path",
				zh: "实时路由路径"
			},
			"model_usage.reason_not_selected": {
				en: "Skipped by current routing rules",
				zh: "当前路由规则不会尝试此供应商"
			},
			"model_usage.reason_provider_disabled": {
				en: "Provider disabled",
				zh: "供应商已禁用"
			},
			"model_usage.reason_provider_runtime_disabled": {
				en: "Provider paused at runtime",
				zh: "供应商运行时已暂停"
			},
			"model_usage.reason_model_disabled": {
				en: "Model disabled on this provider",
				zh: "该模型在此供应商已停用"
			},
			"model_usage.reason_provider_cooldown": {
				en: "Cooling down ({seconds}s)",
				zh: "冷却中（{seconds}s）"
			},
			"model_usage.reason_no_available_keys": {
				en: "All keys cooling down or disabled",
				zh: "所有密钥冷却或禁用中"
			},
			"model_usage.reason_no_keys": {
				en: "No keys configured",
				zh: "未配置密钥"
			},
			"req.client_ip_ph": {
				en: "client IP",
				zh: "客户端 IP"
			},
			"req.all_stream_modes": {
				en: "All stream modes",
				zh: "全部流式状态"
			},
			"req.streaming": {
				en: "Streaming",
				zh: "流式"
			},
			"req.non_streaming": {
				en: "Non-streaming",
				zh: "非流式"
			},
			"req.all_client_formats": {
				en: "All client formats",
				zh: "全部客户端格式"
			},
			"req.all_upstream_formats": {
				en: "All upstream formats",
				zh: "全部上游格式"
			},
			"req.all_cost_states": {
				en: "All cost states",
				zh: "全部成本状态"
			},
			"req.select": {
				en: "Select request",
				zh: "选择请求"
			},
			"req.open": {
				en: "Open",
				zh: "打开"
			},
			"req.open_request": {
				en: "Open request {id}",
				zh: "打开请求 {id}"
			},
			"req.table_label": {
				en: "Request history",
				zh: "请求历史"
			},
			"req.source_sqlite": {
				en: "SQLite history",
				zh: "SQLite 历史"
			},
			"req.source_memory": {
				en: "memory",
				zh: "内存"
			},
			"req.matching_count": {
				en: "{total} matching records from {source}. Showing {start}–{end}.",
				zh: "来自{source}的 {total} 条匹配记录，当前显示 {start}–{end}。"
			},
			"req.no_matching_count": {
				en: "No matching request records from {source}.",
				zh: "{source}中没有匹配的请求记录。"
			},
			"req.no_matching": {
				en: "No matching requests",
				zh: "没有匹配的请求"
			},
			"req.selected": {
				en: "{count} selected",
				zh: "已选择 {count} 条"
			},
			"req.select_page": {
				en: "Select page",
				zh: "选择本页"
			},
			"req.page_of": {
				en: "Page {page} / {total}",
				zh: "第 {page} / {total} 页"
			},
			"req.range_of": {
				en: "{start}–{end} of {total} requests",
				zh: "第 {start}–{end} 条，共 {total} 条请求"
			},
			"req.all_matching_selected": {
				en: "All {count} requests matching current filters are selected.",
				zh: "已选择当前筛选条件下的全部 {count} 条请求。"
			},
			"req.page_selected": {
				en: "All {count} requests on this page are selected.",
				zh: "已选择本页全部 {count} 条请求。"
			},
			"req.select_all_matching": {
				en: "Select all {count} matching requests",
				zh: "选择全部 {count} 条匹配请求"
			},
			"req.clear_selection": {
				en: "Clear selection",
				zh: "清除选择"
			},
			"req.request_pages": {
				en: "Request pages",
				zh: "请求分页"
			},
			"req.previous_page": {
				en: "Previous page",
				zh: "上一页"
			},
			"req.next_page": {
				en: "Next page",
				zh: "下一页"
			},
			"req.success_metric": {
				en: "Success",
				zh: "成功"
			},
			"req.recovered_metric": {
				en: "Recovered",
				zh: "已恢复"
			},
			"req.failed_metric": {
				en: "Failed",
				zh: "失败"
			},
			"req.first_event_metric": {
				en: "first event",
				zh: "首事件"
			},
			"req.tokens_metric": {
				en: "tokens",
				zh: "Token"
			},
			"req.col_status": {
				en: "Status",
				zh: "状态"
			},
			"req.col_time": {
				en: "Time",
				zh: "时间"
			},
			"req.col_model": {
				en: "Model",
				zh: "模型"
			},
			"req.col_model_time": {
				en: "Model / request time",
				zh: "模型 / 请求时间"
			},
			"req.col_source": {
				en: "Source",
				zh: "来源"
			},
			"req.col_protocol": {
				en: "Protocol",
				zh: "协议"
			},
			"req.col_route": {
				en: "Route",
				zh: "路由"
			},
			"req.col_provider_route": {
				en: "Provider / route",
				zh: "提供商 / 路由"
			},
			"req.col_tokens": {
				en: "Tokens",
				zh: "Token"
			},
			"req.col_tokens_detail": {
				en: "Token (in / out)",
				zh: "Token（输入 / 输出）"
			},
			"req.col_cost": {
				en: "Cost",
				zh: "成本"
			},
			"req.col_cost_estimate": {
				en: "Estimated cost",
				zh: "估算成本"
			},
			"req.col_latency": {
				en: "First event / total",
				zh: "首事件 / 总耗时"
			},
			"req.col_latency_ttft": {
				en: "TTFT / Latency",
				zh: "TTFT / 延迟"
			},
			"req.ttft_short": {
				en: "ttft",
				zh: "ttft"
			},
			"req.recovered_count": {
				en: "Recovered after {count}",
				zh: "失败 {count} 次后恢复"
			},
			"req.attempts": {
				en: "Attempts",
				zh: "尝试"
			},
			"req.no_attempts": {
				en: "No attempts recorded",
				zh: "没有上游尝试记录"
			},
			"req.key_number": {
				en: "Key {index}",
				zh: "Key {index}"
			},
			"req.key_unknown": {
				en: "an available key",
				zh: "可用密钥"
			},
			"req.no_attempts_desc": {
				en: "The request ended before any provider or key was called.",
				zh: "请求在调用任何提供商或密钥前结束。"
			},
			"req.detail_loading": {
				en: "Loading request detail",
				zh: "正在加载请求详情"
			},
			"req.detail_failed": {
				en: "Request detail failed: {error}",
				zh: "请求详情加载失败：{error}"
			},
			"req.failure_locator": {
				en: "Failure locator",
				zh: "故障定位"
			},
			"req.recovery_locator": {
				en: "Recovery details",
				zh: "恢复过程"
			},
			"req.failure_title": {
				en: "Upstream request failed",
				zh: "上游调用失败"
			},
			"req.no_attempts_title": {
				en: "Routing stopped before an upstream call",
				zh: "请求在调用上游前终止"
			},
			"req.recovery_title": {
				en: "Recovered after fallback",
				zh: "路由回退后恢复"
			},
			"req.failure_owner": {
				en: "Failure owner",
				zh: "错误归属"
			},
			"req.failure_stage": {
				en: "Stage",
				zh: "发生阶段"
			},
			"req.failure_type": {
				en: "Error type",
				zh: "错误类型"
			},
			"req.failure_http": {
				en: "HTTP status",
				zh: "HTTP 状态"
			},
			"req.failure_state_action": {
				en: "State action",
				zh: "状态操作"
			},
			"req.failed_provider": {
				en: "Failed provider",
				zh: "失败提供商"
			},
			"req.failure_evidence": {
				en: "Error evidence",
				zh: "错误证据"
			},
			"req.owner_upstream": {
				en: "Upstream provider",
				zh: "上游提供商"
			},
			"req.owner_proxy_routing": {
				en: "Proxy routing",
				zh: "中转路由"
			},
			"req.owner_proxy_session": {
				en: "Proxy session",
				zh: "中转会话"
			},
			"req.owner_client": {
				en: "Client request",
				zh: "客户端请求"
			},
			"req.no_usage": {
				en: "No token usage recorded",
				zh: "未记录 Token 用量"
			},
			"req.no_usage_desc": {
				en: "The request ended before the upstream returned usage data.",
				zh: "请求在上游返回用量数据前结束。"
			},
			"req.route_technical_evidence": {
				en: "Call details",
				zh: "调用信息"
			},
			"req.route_summary_native": {
				en: "The client format {format} was used without conversion.",
				zh: "客户端格式 {format} 可直接使用，无需转换。"
			},
			"req.route_summary_converted": {
				en: "The proxy converted {source} to {target}.",
				zh: "中转将 {source} 转换为 {target}。"
			},
			"req.route_summary_filtered": {
				en: "Candidate screening skipped {count} unavailable options.",
				zh: "候选筛选跳过了 {count} 个不可用选项。"
			},
			"req.route_summary_selected": {
				en: "Selected {provider}, {key}, to call {model}.",
				zh: "选择 {provider} 的 {key} 调用 {model}。"
			},
			"req.route_summary_succeeded": {
				en: "{provider} returned a usable response and routing stopped.",
				zh: "{provider} 返回可用响应，路由结束。"
			},
			"req.route_summary_failed": {
				en: "{provider} failed: {reason}.",
				zh: "{provider} 调用失败：{reason}。"
			},
			"req.route_summary_no_candidate": {
				en: "No eligible upstream remained after screening.",
				zh: "筛选后没有可用上游。"
			},
			"req.attempt_provider_key": {
				en: "Provider / key",
				zh: "供应商 / 密钥"
			},
			"req.attempt_model": {
				en: "Upstream model",
				zh: "上游模型"
			},
			"req.attempt_format": {
				en: "Format",
				zh: "格式"
			},
			"req.attempt_result": {
				en: "Result",
				zh: "结果"
			},
			"req.attempt_headers": {
				en: "Headers",
				zh: "响应头"
			},
			"req.attempt_first_event": {
				en: "First event",
				zh: "首事件"
			},
			"req.attempt_total": {
				en: "Total",
				zh: "总耗时"
			},
			"req.metadata": {
				en: "Request metadata",
				zh: "请求元数据"
			},
			"req.meta_ip": {
				en: "Client IP",
				zh: "客户端 IP"
			},
			"req.meta_ip_source": {
				en: "IP source",
				zh: "IP 来源"
			},
			"req.meta_size": {
				en: "Request size",
				zh: "请求大小"
			},
			"req.meta_profile": {
				en: "Request profile",
				zh: "请求特征"
			},
			"req.meta_effort": {
				en: "Reasoning effort",
				zh: "思考强度"
			},
			"req.meta_started": {
				en: "Started",
				zh: "开始时间"
			},
			"req.meta_finished": {
				en: "Finished",
				zh: "完成时间"
			}
		};
	}));
	//#endregion
	//#region src/constants.js
	var timeRanges, views;
	var init_constants = __esmMin((() => {
		init_i18n();
		timeRanges = {
			"30m": {
				get label() {
					return t("ov.last_30m");
				},
				bucket_s: 60,
				buckets: 30
			},
			"2h": {
				get label() {
					return t("ov.last_2h");
				},
				bucket_s: 120,
				buckets: 60
			},
			"24h": {
				get label() {
					return t("ov.last_24h");
				},
				bucket_s: 900,
				buckets: 96
			},
			"7d": {
				get label() {
					return t("ov.last_7d");
				},
				bucket_s: 3600,
				buckets: 168
			}
		};
		views = {
			overview: {
				get title() {
					return t("view.overview.title");
				},
				get subtitle() {
					return t("view.overview.subtitle");
				}
			},
			requests: {
				get title() {
					return t("view.requests.title");
				},
				get subtitle() {
					return t("view.requests.subtitle");
				}
			},
			providers: {
				get title() {
					return t("view.providers.title");
				},
				get subtitle() {
					return t("view.providers.subtitle");
				}
			},
			policy: {
				get title() {
					return t("view.policy.title");
				},
				get subtitle() {
					return t("view.policy.subtitle");
				}
			},
			config: {
				get title() {
					return t("view.config.title");
				},
				get subtitle() {
					return t("view.config.subtitle");
				}
			},
			playground: {
				get title() {
					return t("view.playground.title");
				},
				get subtitle() {
					return t("view.playground.subtitle");
				}
			},
			settings: {
				get title() {
					return t("view.settings.title");
				},
				get subtitle() {
					return t("view.settings.subtitle");
				}
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
	async function apiGet(path, { signal, cache = false } = {}) {
		const url = withAdmin(path);
		const cached = cache ? conditionalGetCache.get(url) : null;
		const headers = state.adminKey ? { "X-Admin-Key": state.adminKey } : {};
		if (cached?.etag) headers["If-None-Match"] = cached.etag;
		const resp = await fetch(url, {
			headers,
			signal
		});
		if (resp.status === 304 && cached) return cached.data;
		const data = await readJson(resp);
		if (!resp.ok) throw new Error(errorMessage(data, resp.status));
		if (cache) {
			const etag = resp.headers.get("ETag");
			if (etag) conditionalGetCache.set(url, {
				etag,
				data
			});
		}
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
	var conditionalGetCache;
	var init_api = __esmMin((() => {
		init_state();
		conditionalGetCache = /* @__PURE__ */ new Map();
	}));
	//#endregion
	//#region src/provider-activity-window.mjs
	function recentProviderActivityEvents(events) {
		return (Array.isArray(events) ? events : []).slice(-40);
	}
	var init_provider_activity_window = __esmMin((() => {}));
	//#endregion
	//#region src/optimistic-config.mjs
	function cloneConfig(config) {
		return structuredClone(config && typeof config === "object" ? config : {});
	}
	function configMarker(config) {
		const revision = Number(config?.revision);
		const epoch = Number(config?.revision_epoch_ms);
		return {
			revision: Number.isFinite(revision) ? revision : -1,
			epoch: Number.isFinite(epoch) ? epoch : -1
		};
	}
	function appendPendingKey(config, provider, metadata = {}) {
		const providerConfig = config?.providers?.[provider];
		if (!providerConfig) return;
		const keys = Array.isArray(providerConfig.keys) ? providerConfig.keys : [];
		const pending = {
			index: keys.reduce((highest, entry, index) => {
				const configured = Number(entry && typeof entry === "object" ? entry.index : index);
				return Number.isFinite(configured) ? Math.max(highest, configured + 1) : highest;
			}, keys.length),
			key_id: "pending",
			masked: "pending",
			pending: true
		};
		if (metadata.proxy) pending.proxy = metadata.proxy;
		if (metadata.models && typeof metadata.models === "object") pending.models = cloneConfig(metadata.models);
		providerConfig.keys = [...keys, pending];
	}
	function appendPendingProvider(config, payload = {}) {
		const name = String(payload.name || "").trim();
		if (!name) return;
		if (!config.providers || typeof config.providers !== "object") config.providers = {};
		const provider = cloneConfig(payload);
		delete provider.name;
		const submittedKeys = Array.isArray(provider.keys) ? provider.keys : [];
		provider.keys = [];
		provider.pending = true;
		config.providers[name] = provider;
		for (const entry of submittedKeys) appendPendingKey(config, name, entry && typeof entry === "object" ? {
			proxy: entry.proxy,
			models: entry.models
		} : {});
	}
	var OptimisticConfigStore;
	var init_optimistic_config = __esmMin((() => {
		OptimisticConfigStore = class {
			#confirmed;
			#pending = [];
			#settled = [];
			#nextId = 1;
			#revision = -1;
			#revisionEpoch = -1;
			constructor(config = {}) {
				this.#confirmed = cloneConfig(config);
				const marker = configMarker(config);
				this.#revision = marker.revision;
				this.#revisionEpoch = marker.epoch;
			}
			confirmedConfig() {
				return cloneConfig(this.#confirmed);
			}
			config() {
				const effective = cloneConfig(this.#confirmed);
				for (const mutation of this.#settled) mutation.apply(effective);
				for (const mutation of this.#pending) mutation.apply(effective);
				return effective;
			}
			acceptConfirmed(config) {
				const incoming = configMarker(config);
				if (incoming.epoch >= 0 && this.#revisionEpoch >= 0 && incoming.epoch < this.#revisionEpoch) return this.config();
				const newEpoch = incoming.epoch >= 0 && (this.#revisionEpoch < 0 || incoming.epoch > this.#revisionEpoch);
				if (!newEpoch && this.#revision >= 0 && incoming.revision < 0) return this.config();
				if (!newEpoch && incoming.revision >= 0 && this.#revision >= 0 && incoming.revision < this.#revision) return this.config();
				this.#confirmed = cloneConfig(config);
				if (incoming.revision >= 0) {
					this.#revision = incoming.revision;
					if (incoming.epoch >= 0) this.#revisionEpoch = incoming.epoch;
					this.#settled = [];
				} else if (!this.#pending.length) this.#settled = [];
				return this.config();
			}
			confirm(id, config) {
				const completed = this.#pending.find((mutation) => mutation.id === id);
				if (!completed) return null;
				this.#pending = this.#pending.filter((mutation) => mutation.id !== id);
				const incoming = configMarker(config);
				const epochIsOlder = incoming.epoch >= 0 && this.#revisionEpoch >= 0 && incoming.epoch < this.#revisionEpoch;
				const epochIsNewer = incoming.epoch >= 0 && (this.#revisionEpoch < 0 || incoming.epoch > this.#revisionEpoch);
				if (incoming.revision >= 0) {
					if (!epochIsOlder && (epochIsNewer || this.#revision < 0 || incoming.revision >= this.#revision)) {
						this.#confirmed = cloneConfig(config);
						this.#revision = incoming.revision;
						if (incoming.epoch >= 0) this.#revisionEpoch = incoming.epoch;
					}
					this.#settled = [];
					return this.config();
				}
				this.#settled.push(completed);
				this.#confirmed = cloneConfig(config);
				return this.config();
			}
			reject(id) {
				this.#pending = this.#pending.filter((mutation) => mutation.id !== id);
				return this.config();
			}
			clear() {
				this.#confirmed = {};
				this.#pending = [];
				this.#settled = [];
				this.#revision = -1;
				this.#revisionEpoch = -1;
			}
			begin(resourceKey, apply) {
				const normalizedResourceKey = String(resourceKey || "");
				if (this.#pending.some((mutation) => mutation.resourceKey === normalizedResourceKey)) return null;
				const mutation = {
					id: this.#nextId++,
					resourceKey: normalizedResourceKey,
					apply
				};
				this.#pending.push(mutation);
				return {
					id: mutation.id,
					resourceKey: mutation.resourceKey,
					config: this.config()
				};
			}
		};
	}));
	//#endregion
	//#region src/mutation-ui.mjs
	function liveElementLocator(initialElement, locateCurrent = () => null) {
		return () => {
			if (initialElement?.isConnected) return initialElement;
			return locateCurrent?.() || null;
		};
	}
	function createMutationBusySetter() {
		const controlState = /* @__PURE__ */ new WeakMap();
		return (root, busy) => {
			if (!root) return;
			if (busy) {
				root.setAttribute("aria-busy", "true");
				root.classList.add("is-busy");
			} else {
				root.removeAttribute("aria-busy");
				root.classList.remove("is-busy");
			}
			const controls = new Set(root.querySelectorAll?.("button, input, select, textarea") || []);
			if (root.matches?.("button, input, select, textarea")) controls.add(root);
			controls.forEach((control) => {
				if (busy) {
					if (!controlState.has(control)) controlState.set(control, Boolean(control.disabled));
					control.disabled = true;
				} else if (controlState.has(control)) {
					control.disabled = controlState.get(control);
					controlState.delete(control);
				}
			});
		};
	}
	var MutationBusyTracker;
	var init_mutation_ui = __esmMin((() => {
		MutationBusyTracker = class {
			#locators = /* @__PURE__ */ new Set();
			#setBusy;
			constructor(setBusy) {
				this.#setBusy = setBusy;
			}
			start(locator) {
				if (typeof locator !== "function") return () => {};
				this.#locators.add(locator);
				this.#setBusy?.(locator(), true);
				let active = true;
				return () => {
					if (!active) return;
					active = false;
					this.#locators.delete(locator);
					this.#setBusy?.(locator(), false);
				};
			}
			refresh() {
				for (const locator of this.#locators) this.#setBusy?.(locator(), true);
			}
		};
	}));
	//#endregion
	//#region src/traffic-mode.mjs
	function bindTrafficModeControls(root, { getMode, setMode }) {
		if (!root || typeof getMode !== "function" || typeof setMode !== "function") return;
		root.querySelectorAll("button[data-traffic-mode]").forEach((button) => {
			if (button.dataset.bounddatatrafficmode) return;
			button.dataset.bounddatatrafficmode = "1";
			button.addEventListener("click", () => {
				const mode = button.dataset.trafficMode;
				if (!mode || getMode() === mode) return;
				setMode(mode);
			});
		});
	}
	var init_traffic_mode = __esmMin((() => {}));
	//#endregion
	//#region src/traffic-chart-scale.mjs
	function niceChartMax(value) {
		const raw = Math.max(1, Number(value || 1));
		const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
		const normalized = raw / magnitude;
		return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 3 ? 3 : normalized <= 5 ? 5 : 10) * magnitude;
	}
	function chartScaleMax(values, { fallback = 1, nice = false, padding = 1.15 } = {}) {
		const observed = Math.max(0, ...(Array.isArray(values) ? values : []).map((value) => {
			const number = Number(value || 0);
			return Number.isFinite(number) ? number : 0;
		}));
		const maximum = observed > 0 ? observed * padding : Math.max(Number(fallback || 0), Number.EPSILON);
		return nice ? niceChartMax(maximum) : maximum;
	}
	function positiveChartPoints(points) {
		return (Array.isArray(points) ? points : []).filter((point) => Number(point?.value || 0) > 0);
	}
	var init_traffic_chart_scale = __esmMin((() => {}));
	//#endregion
	//#region src/operation-guard.mjs
	var InFlightActionRegistry, ConfigRefreshCoordinator;
	var init_operation_guard = __esmMin((() => {
		InFlightActionRegistry = class {
			#keys = /* @__PURE__ */ new Set();
			begin(key) {
				const normalized = String(key || "").trim();
				if (!normalized) return () => {};
				if (this.#keys.has(normalized)) return null;
				this.#keys.add(normalized);
				let active = true;
				return () => {
					if (!active) return;
					active = false;
					this.#keys.delete(normalized);
				};
			}
			has(key) {
				return this.#keys.has(String(key || "").trim());
			}
			clear() {
				this.#keys.clear();
			}
		};
		ConfigRefreshCoordinator = class {
			#interactionVersion = 0;
			#mutationDepth = 0;
			markInteraction() {
				this.#interactionVersion += 1;
				return this.#interactionVersion;
			}
			snapshot() {
				return {
					interactionVersion: this.#interactionVersion,
					mutationDepth: this.#mutationDepth
				};
			}
			beginMutation() {
				this.#mutationDepth += 1;
				const interactionVersion = this.markInteraction();
				let active = true;
				return {
					interactionVersion,
					finish: () => {
						if (!active) return;
						active = false;
						this.#mutationDepth = Math.max(0, this.#mutationDepth - 1);
						this.markInteraction();
					}
				};
			}
			shouldDefer(snapshot, hasProtectedInput = false) {
				if (hasProtectedInput) return true;
				if (this.#mutationDepth > 0) return true;
				if (!snapshot) return false;
				return Number(snapshot.interactionVersion) !== this.#interactionVersion;
			}
			get mutationDepth() {
				return this.#mutationDepth;
			}
		};
	}));
	//#endregion
	//#region src/routing-trace-view.mjs
	function normalizedEvent(event) {
		return event && typeof event === "object" ? event : {};
	}
	function groupKind(event) {
		if (event.stage === "format_compatibility") return "format_evaluation";
		if (event.stage === "routing" && CANDIDATE_FILTER_CODES.has(event.code)) return "candidate_filter";
		return "event";
	}
	function summarizeGroup(group) {
		const events = group.events;
		group.eventCount = events.length;
		group.codes = [...new Set(events.map((event) => event.code).filter(Boolean))];
		group.formats = [...new Set(events.map((event) => event.target_format || event.upstream_format).filter(Boolean))];
		group.providers = [...new Set(events.map((event) => event.provider).filter(Boolean))];
		if (group.kind === "format_evaluation") {
			group.eligibleFormats = [...new Set(events.filter((event) => event.code === "format_eligible").map((event) => event.target_format).filter(Boolean))];
			group.blockedFormats = [...new Set(events.filter((event) => event.code === "format_blocked_by_parameter").map((event) => event.target_format).filter(Boolean))];
			group.mappedCount = events.filter((event) => event.code === "format_parameter_mapped").length;
			group.droppedCount = events.filter((event) => event.code === "format_hint_dropped").length;
		}
		return group;
	}
	/**
	* Merge only adjacent diagnostic events. The original order remains intact,
	* while repetitive format checks and candidate rejections become one visual step.
	*/
	function groupRoutingTrace(rawTrace) {
		const trace = Array.isArray(rawTrace) ? rawTrace.map(normalizedEvent) : [];
		const groups = [];
		trace.forEach((event, rawIndex) => {
			const kind = groupKind(event);
			const previous = groups[groups.length - 1];
			if (kind !== "event" && previous?.kind === kind) {
				previous.events.push(event);
				previous.rawIndexes.push(rawIndex);
				return;
			}
			groups.push({
				kind,
				stage: event.stage || "routing",
				code: event.code || "unknown",
				event,
				events: [event],
				rawIndexes: [rawIndex]
			});
		});
		return groups.map(summarizeGroup);
	}
	function routingTraceTone(step) {
		if (!step || typeof step !== "object") return "neutral";
		if (step.kind === "format_evaluation") {
			if (step.eligibleFormats?.length) return step.blockedFormats?.length || step.droppedCount ? "warn" : "ok";
			return step.blockedFormats?.length ? "bad" : "neutral";
		}
		if (step.kind === "candidate_filter") return "warn";
		const code = String(step.code || "");
		if (code === "selected" || code === "attempt_succeeded") return "ok";
		if (code === "attempt_failed" || code === "no_candidate" || code === "format_blocked_by_parameter") return "bad";
		if (CANDIDATE_FILTER_CODES.has(code) || code === "format_hint_dropped") return "warn";
		return "neutral";
	}
	function routingTraceIdentity(event) {
		const item = normalizedEvent(event);
		return [
			item.provider,
			item.key_masked || item.key_id,
			item.provider_model || item.canonical_model,
			item.target_format || item.upstream_format
		].filter(Boolean);
	}
	function summarizeFormatTraceStep(step, { clientFormat = "", finalFormat = "" } = {}) {
		const events = Array.isArray(step?.events) ? step.events : [];
		const sourceFormat = String(clientFormat || "");
		const hasFinalFormat = Boolean(finalFormat);
		const targetFormat = String(finalFormat || sourceFormat || "");
		const blockedByFormat = /* @__PURE__ */ new Map();
		events.forEach((event) => {
			if (event.code !== "format_blocked_by_parameter" || !event.target_format) return;
			if (!blockedByFormat.has(event.target_format)) blockedByFormat.set(event.target_format, /* @__PURE__ */ new Set());
			if (event.field) blockedByFormat.get(event.target_format).add(String(event.field));
		});
		const blocked = [...blockedByFormat.entries()].map(([format, fields]) => ({
			format,
			fields: [...fields]
		}));
		const selectedEvents = events.filter((event) => !targetFormat || event.target_format === targetFormat);
		const transformations = selectedEvents.filter((event) => event.code === "format_parameter_mapped").map((event) => ({
			field: event.field || "",
			target: event.target || "",
			action: event.action || ""
		}));
		const droppedHints = selectedEvents.filter((event) => event.code === "format_hint_dropped").map((event) => ({
			field: event.field || "",
			action: event.action || ""
		}));
		const converted = Boolean(sourceFormat && targetFormat && sourceFormat !== targetFormat);
		return {
			mode: converted ? "converted" : blocked.length ? "blocked" : hasFinalFormat && sourceFormat ? "native" : "unrestricted",
			sourceFormat,
			targetFormat,
			path: [sourceFormat, converted ? targetFormat : ""].filter(Boolean),
			blocked,
			transformations,
			droppedHints
		};
	}
	var CANDIDATE_FILTER_CODES;
	var init_routing_trace_view = __esmMin((() => {
		CANDIDATE_FILTER_CODES = new Set([
			"compatibility_circuit",
			"duplicate_candidate",
			"key_cooldown",
			"key_disabled",
			"model_unsupported_by_key",
			"provider_cooldown"
		]);
	}));
	//#endregion
	//#region src/model-capability-order.mjs
	function finiteNumber(value, fallback = 0) {
		const number = Number(value);
		return Number.isFinite(number) ? number : fallback;
	}
	function providerTimestampMs(snapshot) {
		const providers = snapshot?.providers;
		if (!providers || typeof providers !== "object") return 0;
		let latest = 0;
		Object.values(providers).forEach((entry) => {
			latest = Math.max(latest, finiteNumber(entry?.fetched_at) * 1e3);
		});
		return latest;
	}
	function modelCapabilitySnapshotMarker(snapshot) {
		if (!snapshot || typeof snapshot !== "object") return {
			timestamp: 0,
			version: -1
		};
		return {
			timestamp: finiteNumber(snapshot.models_epoch_ms) || providerTimestampMs(snapshot),
			version: finiteNumber(snapshot.models_version, -1)
		};
	}
	/**
	* Prevent a slower, older capabilities response from replacing a snapshot
	* that the UI already accepted. Process epoch wins across server restarts; the
	* process-local version counter breaks same-millisecond ties.
	*/
	function shouldAcceptModelCapabilitySnapshot(current, incoming) {
		if (!incoming || typeof incoming !== "object") return false;
		if (!current || typeof current !== "object") return true;
		const previous = modelCapabilitySnapshotMarker(current);
		const next = modelCapabilitySnapshotMarker(incoming);
		if (next.timestamp > previous.timestamp) return true;
		if (next.timestamp < previous.timestamp) return false;
		if (next.version >= 0 && previous.version >= 0) return next.version >= previous.version;
		return true;
	}
	var init_model_capability_order = __esmMin((() => {}));
	//#endregion
	//#region src/key-models.mjs
	function parseKeyModelsText(value) {
		const result = {};
		String(value || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).forEach((item) => {
			const separator = item.indexOf("=");
			const canonical = (separator >= 0 ? item.slice(0, separator) : item).trim();
			const raw = (separator >= 0 ? item.slice(separator + 1) : item).trim();
			if (canonical && raw) result[canonical] = raw;
		});
		return result;
	}
	function keyModelsPatchValue(value) {
		const models = parseKeyModelsText(value);
		return Object.keys(models).length ? models : null;
	}
	var init_key_models = __esmMin((() => {}));
	//#endregion
	//#region src/provider-key-view.mjs
	function mergedProviderKeys(runtimeKeys, configKeys) {
		const runtime = Array.isArray(runtimeKeys) ? runtimeKeys : [];
		if (!Array.isArray(configKeys)) return runtime.map((key) => ({ ...key }));
		const availableRuntime = runtime.map((key, position) => ({
			key,
			position
		}));
		const consumedRuntime = /* @__PURE__ */ new Set();
		const stableIdentity = (key) => {
			const value = String(key?.key_id || "").trim();
			if (!value || value === "pending") return "";
			return value;
		};
		const stableMasked = (key) => {
			const value = String(key?.masked || "").trim();
			if (!value || value === "pending") return "";
			return value;
		};
		const findRuntime = (configured, configPosition) => {
			const configuredId = stableIdentity(configured);
			const configuredMasked = stableMasked(configured);
			let match = configuredId ? availableRuntime.find((entry) => !consumedRuntime.has(entry.position) && stableIdentity(entry.key) === configuredId) : null;
			if (!match && configuredMasked) match = availableRuntime.find((entry) => !consumedRuntime.has(entry.position) && stableMasked(entry.key) === configuredMasked);
			if (!match && !configuredId && !configuredMasked && !configured?.pending) {
				const configuredIndex = Number(configured?.index ?? configPosition);
				match = availableRuntime.find((entry) => !consumedRuntime.has(entry.position) && Number(entry.key?.index ?? entry.position) === configuredIndex);
			}
			if (match) consumedRuntime.add(match.position);
			return match?.key || null;
		};
		return configKeys.flatMap((configured, configPosition) => {
			if (!configured || configured.pending_delete) return [];
			const runtimeMatch = findRuntime(configured, configPosition);
			if (!runtimeMatch) return [{ ...configured }];
			return [{
				...runtimeMatch,
				...configured,
				index: Number(configured.index ?? configPosition),
				key_id: configured.key_id ?? runtimeMatch.key_id ?? "",
				masked: configured.masked ?? runtimeMatch.masked ?? "",
				proxy: configured.proxy ?? runtimeMatch.proxy ?? ""
			}];
		});
	}
	var init_provider_key_view = __esmMin((() => {}));
	//#endregion
	//#region src/panel-pagination.mjs
	function bindPanelPaginationDelegated(root, onChange) {
		if (!root || typeof root.addEventListener !== "function" || typeof onChange !== "function") return false;
		if (boundPaginationRoots.has(root)) return false;
		boundPaginationRoots.add(root);
		root.addEventListener("click", (event) => {
			const target = event.target?.closest?.("[data-list-page-key]");
			if (!target || target.disabled || !root.contains(target)) return;
			const pageKey = String(target.dataset?.listPageKey || "");
			const direction = String(target.dataset?.listPage || "");
			if (!pageKey || direction !== "prev" && direction !== "next") return;
			onChange({
				pageKey,
				direction
			});
		});
		return true;
	}
	function changePanelPage(state, pageKey, direction) {
		if (!state || !Object.prototype.hasOwnProperty.call(state, pageKey)) return false;
		const current = Math.max(0, Number(state[pageKey] || 0));
		let next = current;
		if (direction === "prev") next = Math.max(0, current - 1);
		if (direction === "next") next = current + 1;
		if (next === current) return false;
		state[pageKey] = next;
		return true;
	}
	var boundPaginationRoots;
	var init_panel_pagination = __esmMin((() => {
		boundPaginationRoots = /* @__PURE__ */ new WeakSet();
	}));
	//#endregion
	//#region src/request-pagination.mjs
	function requestPageTarget(currentPage, totalPages, direction, pending = false) {
		const current = Math.max(0, Number(currentPage) || 0);
		const lastPage = Math.max(0, (Number(totalPages) || 1) - 1);
		if (pending) return current;
		if (direction === "prev") return Math.max(0, current - 1);
		if (direction === "next") return Math.min(lastPage, current + 1);
		return current;
	}
	function requestPayloadMatchesPage(payload, page, pageSize) {
		if (payload === void 0) return true;
		if (!payload || typeof payload !== "object") return false;
		if (!Object.prototype.hasOwnProperty.call(payload, "offset")) return true;
		const offset = Number(payload.offset);
		const size = Math.max(1, Number(pageSize) || 1);
		return Number.isFinite(offset) && offset === Math.max(0, Number(page) || 0) * size;
	}
	function requestNavigationPayloadMatchesPage(payload, page, pageSize) {
		return payload !== void 0 && requestPayloadMatchesPage(payload, page, pageSize);
	}
	var init_request_pagination = __esmMin((() => {}));
	//#endregion
	//#region src/provider-sort.mjs
	function providerSortGroup(view) {
		const usableKeys = Number(view?.keyStats?.usable || 0);
		return !(view?.runtimeState?.id === "disabled") && usableKeys > 0 ? 0 : 1;
	}
	function compareProviderViews(a, b) {
		const groupDelta = providerSortGroup(a) - providerSortGroup(b);
		if (groupDelta !== 0) return groupDelta;
		if (providerSortGroup(a) === 0) {
			const priorityDelta = Number(b?.priority || 0) - Number(a?.priority || 0);
			if (priorityDelta !== 0) return priorityDelta;
		} else {
			const aStatus = STATUS_ORDER[a?.runtimeState?.id] ?? 99;
			const bStatus = STATUS_ORDER[b?.runtimeState?.id] ?? 99;
			if (aStatus !== bStatus) return aStatus - bStatus;
			const priorityDelta = Number(b?.priority || 0) - Number(a?.priority || 0);
			if (priorityDelta !== 0) return priorityDelta;
		}
		return String(a?.name || "").localeCompare(String(b?.name || ""));
	}
	var STATUS_ORDER;
	var init_provider_sort = __esmMin((() => {
		STATUS_ORDER = {
			normal: 0,
			degraded: 1,
			cooldown: 2,
			unavailable: 3,
			disabled: 4
		};
	}));
	//#endregion
	//#region src/model-brand-icons.js
	function iconSrc(slug, type) {
		return "/-/icons/" + slug + ".svg?type=" + type;
	}
	function modelBrandSlug(model) {
		const value = String(model || "").trim();
		if (!value) return "";
		return MODEL_ICON_RULES.find(([pattern]) => pattern.test(value))?.[1] || "";
	}
	function modelBrandIconMarkup(model, fallbackMarkup = "") {
		const slug = modelBrandSlug(model);
		if (!slug) return "<span class=\"model-brand-mark is-fallback\" aria-hidden=\"true\">" + fallbackMarkup + "</span>";
		return "<span class=\"model-brand-mark\" aria-hidden=\"true\"><img class=\"model-brand-icon\" src=\"" + iconSrc(slug, COLOR_ICON_SLUGS.has(slug) ? "color" : "mono") + "\" alt=\"\" loading=\"lazy\" decoding=\"async\" /><span class=\"model-brand-fallback\">" + fallbackMarkup + "</span></span>";
	}
	function providerBrandSlug(provider) {
		const value = String(provider || "").trim().toLowerCase();
		if (!value) return "";
		const normalized = value.replace(/[._\s]+/g, "-");
		if (PROVIDER_ICON_ALIASES.has(normalized)) return PROVIDER_ICON_ALIASES.get(normalized) || "";
		const namespace = normalized.split(/[\/:]/, 1)[0];
		return PROVIDER_ICON_ALIASES.get(namespace) || "";
	}
	function providerBrandIconMarkup(provider, fallbackMarkup = "") {
		const slug = providerBrandSlug(provider);
		if (!slug) return "<span class=\"model-brand-mark provider-brand-mark is-fallback\" aria-hidden=\"true\">" + fallbackMarkup + "</span>";
		return "<span class=\"model-brand-mark provider-brand-mark\" aria-hidden=\"true\"><img class=\"model-brand-icon\" src=\"" + iconSrc(slug, COLOR_ICON_SLUGS.has(slug) || [
			"google",
			"nvidia",
			"openrouter",
			"modelscope",
			"together"
		].includes(slug) ? "color" : "mono") + "\" alt=\"\" loading=\"lazy\" decoding=\"async\" /><span class=\"model-brand-fallback\">" + fallbackMarkup + "</span></span>";
	}
	var MODEL_ICON_RULES, COLOR_ICON_SLUGS, PROVIDER_ICON_ALIASES;
	var init_model_brand_icons = __esmMin((() => {
		MODEL_ICON_RULES = [
			[/deepseek/i, "deepseek"],
			[/\b(glm|chatglm)/i, "zai"],
			[/(^|[-_/])gpt[-_]|\b(o1|o3|o4|codex)\b/i, "openai"],
			[/claude|anthropic/i, "claude"],
			[/gemini|gemma/i, "gemini"],
			[/grok/i, "grok"],
			[/qwen|qwq|qvq|tongyi/i, "qwen"],
			[/llama/i, "meta"],
			[/mistral|mixtral|codestral|pixtral/i, "mistral"],
			[/minimax|abab/i, "minimax"],
			[/kimi|moonshot/i, "moonshot"],
			[/doubao|\bep-/i, "doubao"],
			[/hunyuan/i, "hunyuan"],
			[/sonar|pplx|perplexity/i, "perplexity"],
			[/command|cohere/i, "cohere"],
			[/jina/i, "jina"],
			[/baichuan/i, "baichuan"],
			[/ernie|wenxin/i, "wenxin"],
			[/internlm|internvl/i, "internlm"],
			[/seed-|bytedance/i, "bytedance"],
			[/nova-/i, "nova"],
			[/mimo-/i, "xiaomimimo"]
		];
		COLOR_ICON_SLUGS = new Set([
			"deepseek",
			"claude",
			"gemini",
			"qwen",
			"meta",
			"mistral",
			"minimax",
			"doubao",
			"hunyuan",
			"perplexity",
			"cohere",
			"baichuan",
			"wenxin",
			"internlm",
			"bytedance",
			"nova"
		]);
		PROVIDER_ICON_ALIASES = new Map([
			["openai", "openai"],
			["anthropic", "anthropic"],
			["claude", "anthropic"],
			["deepseek", "deepseek"],
			["google", "google"],
			["gemini", "google"],
			["groq", "groq"],
			["nvidia", "nvidia"],
			["openrouter", "openrouter"],
			["modelscope", "modelscope"],
			["mistral", "mistral"],
			["moonshot", "moonshot"],
			["zhipu", "zai"],
			["bigmodel", "zai"],
			["zai", "zai"],
			["qwen", "qwen"],
			["together", "together"],
			["perplexity", "perplexity"],
			["cohere", "cohere"]
		]);
	}));
	//#endregion
	//#region src/provider-model-config.mjs
	function modelId(value) {
		if (value && typeof value === "object") return String(value.id || value.model || value.raw_model || "").trim();
		return String(value || "").trim();
	}
	function normalizeStaticModelIds(entries) {
		const seen = /* @__PURE__ */ new Set();
		const models = [];
		for (const entry of Array.isArray(entries) ? entries : []) {
			const id = modelId(entry);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			models.push(id);
		}
		return models;
	}
	function mergeStaticModelIds(existing, rawAdditions) {
		const additions = String(rawAdditions || "").split(",").map((entry) => entry.trim()).filter(Boolean);
		return normalizeStaticModelIds([...normalizeStaticModelIds(existing), ...additions]);
	}
	function normalizeVariantEntries(entries) {
		const seen = /* @__PURE__ */ new Set();
		const variants = [];
		for (const entry of Array.isArray(entries) ? entries : []) {
			const model = modelId(entry);
			if (!model || seen.has(model)) continue;
			seen.add(model);
			const rawPriority = entry && typeof entry === "object" ? Number(entry.priority || 0) : 0;
			variants.push({
				model,
				priority: Number.isFinite(rawPriority) ? rawPriority : 0
			});
		}
		return variants;
	}
	function mergeProviderModelCatalogItems(discoveredItems, configuredMap) {
		const items = [];
		const seenPairs = /* @__PURE__ */ new Set();
		const claimedRawModels = /* @__PURE__ */ new Set();
		const key = (value) => String(value || "").trim().toLowerCase();
		const push = (item) => {
			const label = String(item?.label || item?.raw || "").trim();
			const raw = String(item?.raw || "").trim();
			if (!label) return;
			const pair = `${key(label)}\n${key(raw)}`;
			if (seenPairs.has(pair)) return;
			seenPairs.add(pair);
			items.push({
				...item,
				label,
				raw
			});
		};
		Object.entries(configuredMap || {}).filter(([_canonical, raw]) => String(raw || "").trim()).sort(([a], [b]) => String(a).localeCompare(String(b))).forEach(([canonical, raw]) => {
			const label = String(canonical || raw).trim();
			const rawModel = String(raw || "").trim();
			claimedRawModels.add(key(rawModel));
			push({
				label,
				raw: rawModel,
				title: rawModel !== label ? `${label} maps to ${rawModel}` : label,
				manual: true
			});
		});
		for (const item of Array.isArray(discoveredItems) ? discoveredItems : []) {
			const rawModel = String(item?.raw || item?.label || "").trim();
			if (claimedRawModels.has(key(rawModel))) continue;
			push({
				...item,
				manual: false
			});
		}
		return items;
	}
	function providerModelSourceId(item) {
		return String(item?.raw || item?.label || "").trim();
	}
	function providerModelMappingOldId(item) {
		return item?.manual ? String(item?.label || "").trim() : "";
	}
	function clearLiveFormField(root, selector, fieldName) {
		const elements = (root?.querySelector?.(selector))?.elements;
		const control = elements?.namedItem?.(fieldName) || elements?.[fieldName];
		if (!control) return false;
		control.value = "";
		return true;
	}
	function resetLiveForm(root, selector) {
		const form = root?.querySelector?.(selector);
		if (!form || typeof form.reset !== "function") return false;
		form.reset();
		return true;
	}
	var init_provider_model_config = __esmMin((() => {}));
	(/* @__PURE__ */ __commonJSMin((() => {
		init_morphdom_esm();
		init_state();
		init_constants();
		init_api();
		init_i18n();
		init_provider_activity_window();
		init_optimistic_config();
		init_mutation_ui();
		init_traffic_mode();
		init_traffic_chart_scale();
		init_operation_guard();
		init_routing_trace_view();
		init_model_capability_order();
		init_key_models();
		init_provider_key_view();
		init_panel_pagination();
		init_request_pagination();
		init_provider_sort();
		init_model_brand_icons();
		init_provider_model_config();
		var el = (id) => document.getElementById(id);
		var qsa = (selector) => Array.from(document.querySelectorAll(selector));
		document.addEventListener("error", (event) => {
			const image = event.target;
			if (!(image instanceof HTMLImageElement) || !image.classList.contains("model-brand-icon")) return;
			image.hidden = true;
			image.closest(".model-brand-mark")?.classList.add("is-broken");
		}, true);
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
		var _lastPricingFetchedAt = 0;
		var _pricingFetchInFlight = false;
		var pricingFetchSequence = 0;
		var MODEL_PRICING_BATCH_SIZE = 80;
		var MODEL_PRICING_REFRESH_MS = 3e4;
		var _capabilityFollowUpTimer = null;
		var _lastModelsVersion = null;
		var _refreshInFlight = false;
		var _refreshWanted = false;
		var _refreshWantedArgs = null;
		var _backgroundRefreshTimer = null;
		var _backgroundRefreshArgs = null;
		var _lastRuntimeCoreSignature = "";
		var _lastRuntimeViewSignature = "";
		var _lastRenderedConfigObject = null;
		var _lastRenderedOverlayObject = null;
		var _lastRenderedModelUsageObject = null;
		var _lastRenderedUsageStatisticsObject = null;
		var _lastRenderedConversionDiagnosticsObject = null;
		var _lastRenderedConfigLocale = "";
		var _renderedHtmlByTarget = /* @__PURE__ */ new WeakMap();
		var pendingRuntimeMutations = /* @__PURE__ */ new Set();
		var optimisticConfigStore = new OptimisticConfigStore();
		var setMutationBusy = createMutationBusySetter();
		var mutationBusyTracker = new MutationBusyTracker(setMutationBusy);
		var configRefreshCoordinator = new ConfigRefreshCoordinator();
		var uiActionRegistry = new InFlightActionRegistry();
		var STATIC_CONFIG_DOMAINS = new Set([
			"routing",
			"config",
			"overlay"
		]);
		var POST_CONFIG_MUTATION_DOMAINS = [
			"status",
			"models",
			"routing",
			"overlay",
			"audit",
			"conversionDiagnostics"
		];
		var RUNTIME_SIGNATURE_IGNORED_FIELDS = new Set([
			"uptime_s",
			"idle_seconds",
			"last_run_ago_s",
			"next_probe_in_s",
			"next_run_in_s",
			"nearest_recovery_s",
			"computed_at",
			"duration_ms",
			"disabled_remaining_s"
		]);
		var RUNTIME_SIGNATURE_BUCKETED_FIELDS = new Set(["cooldown_remaining_s", "provider_cooldown_remaining_s"]);
		function runtimeSignature(value) {
			try {
				return JSON.stringify(value, (key, current) => {
					if (RUNTIME_SIGNATURE_IGNORED_FIELDS.has(key)) return void 0;
					if (RUNTIME_SIGNATURE_BUCKETED_FIELDS.has(key)) {
						const numeric = Number(current);
						return Number.isFinite(numeric) ? Math.ceil(Math.max(0, numeric) / 5) : current;
					}
					return current;
				});
			} catch (_err) {
				return "";
			}
		}
		function acceptConfirmedConfig(config) {
			const effective = optimisticConfigStore.acceptConfirmed(config || {});
			state.data.config = effective;
			state.staticDataState = "ready";
			return effective;
		}
		function applyStatusPayload(status) {
			const existingModels = state.data.status?.models;
			state.data.status = status && typeof status === "object" ? status : {};
			if (existingModels && !state.data.status.models) state.data.status.models = existingModels;
			return state.data.status;
		}
		function acceptModelCapabilities(capabilities) {
			const current = state.data.status?.models;
			if (!shouldAcceptModelCapabilitySnapshot(current, capabilities)) return false;
			state.data.status = {
				...state.data.status || {},
				models: capabilities
			};
			if (capabilities.models_version !== void 0) _lastModelsVersion = capabilities.models_version;
			state.data.modelsVersion = Number(state.data.modelsVersion || 0) + 1;
			return true;
		}
		function publishEffectiveConfig(config, { drawer = true } = {}) {
			state.data.config = config || {};
			state.data.version = Number(state.data.version || 0) + 1;
			state.forceConfigRender = true;
			state.forceModelRoutesRender = true;
			state.forceProvidersRender = true;
			state.forceModelCapsRender = true;
			state.forcePolicyRender = true;
			state.forceFailurePoliciesRender = true;
			renderAll({ force: true });
			if (drawer && state.providerDrawerName) renderProviderDrawer({ force: true });
		}
		function beginOptimisticConfigMutation(resourceKey, apply, options = {}) {
			const mutation = optimisticConfigStore.begin(resourceKey, apply);
			if (!mutation) {
				setNotice("This setting is already being saved. Wait for the current request to finish.", "warn");
				return null;
			}
			publishEffectiveConfig(mutation.config, options);
			return mutation;
		}
		function confirmOptimisticConfigMutation(mutation, serverConfig, options = {}) {
			if (!mutation || serverConfig === void 0) return false;
			const effective = optimisticConfigStore.confirm(mutation.id, serverConfig);
			if (effective === null) return false;
			if (options.render === false) state.data.config = effective;
			else publishEffectiveConfig(effective, options);
			return true;
		}
		function rejectOptimisticConfigMutation(mutation, options = {}) {
			if (!mutation) return;
			publishEffectiveConfig(optimisticConfigStore.reject(mutation.id), options);
		}
		function captureFormState(form) {
			const values = [];
			Array.from(form?.elements || []).forEach((control) => {
				if (!control.name) return;
				values.push({
					name: control.name,
					type: control.type || "",
					value: control.value,
					checked: Boolean(control.checked)
				});
			});
			return {
				values,
				active: document.activeElement && form?.contains(document.activeElement) ? document.activeElement.name || "" : ""
			};
		}
		function restoreFormState(form, snapshot) {
			if (!form || !snapshot) return;
			for (const saved of snapshot.values || []) {
				const control = Array.from(form.elements || []).find((entry) => entry.name === saved.name);
				if (!control) continue;
				if (saved.type === "checkbox" || saved.type === "radio") control.checked = saved.checked;
				else control.value = saved.value;
			}
			(Array.from(form.elements || []).find((entry) => entry.name === snapshot.active) || form.querySelector("button[type='submit']"))?.focus?.();
		}
		function formLocator(form) {
			if (!form) return () => null;
			if (form.id) return () => document.getElementById(form.id);
			const provider = form.dataset?.provider || "";
			const keyIndex = form.dataset?.keyIndex || "";
			const className = Array.from(form.classList || [])[0] || "";
			return () => {
				if (form.isConnected) return form;
				if (!className) return null;
				return Array.from(document.querySelectorAll(`.${CSS.escape(className)}`)).find((candidate) => (!provider || candidate.dataset?.provider === provider) && (!keyIndex || candidate.dataset?.keyIndex === keyIndex)) || null;
			};
		}
		function hasProtectedConfigInteraction() {
			if (configRefreshCoordinator.mutationDepth > 0) return true;
			return _trackedFormSelectors.some((selector) => shouldPreserveContainer(selector));
		}
		async function runExclusiveUiAction(key, operation, { duplicateNotice = "" } = {}) {
			const finish = uiActionRegistry.begin(key);
			if (!finish) {
				if (duplicateNotice) setNotice(duplicateNotice, "info", {
					key: `busy:${key}`,
					duration: 1800
				});
				return false;
			}
			try {
				return await operation();
			} finally {
				finish();
			}
		}
		async function runOptimisticConfigAction(root, operation, optimistic, callbacks = {}) {
			const mutationScope = configRefreshCoordinator.beginMutation();
			const locateRoot = callbacks.locateRoot || (() => root?.isConnected ? root : null);
			const mutation = beginOptimisticConfigMutation(optimistic.resourceKey, optimistic.apply, { drawer: callbacks.drawer !== false });
			if (!mutation) {
				mutationScope.finish();
				return false;
			}
			const finishBusy = mutationBusyTracker.start(locateRoot);
			try {
				const result = await operation();
				if (result?.config !== void 0) {
					if (!confirmOptimisticConfigMutation(mutation, result.config, { render: false })) return false;
				} else rejectOptimisticConfigMutation(mutation, { drawer: callbacks.drawer !== false });
				applyMutationResult(result, {
					drawer: callbacks.drawer !== false,
					skipConfig: result?.config !== void 0
				});
				callbacks.onSuccess?.(result);
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true,
					staticDomains: POST_CONFIG_MUTATION_DOMAINS
				});
				return true;
			} catch (err) {
				rejectOptimisticConfigMutation(mutation, { drawer: callbacks.drawer !== false });
				if (callbacks.onError) callbacks.onError(err);
				else setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
				return false;
			} finally {
				mutationScope.finish();
				finishBusy();
			}
		}
		function mergeRefreshArgs(previous, next) {
			if (!previous) return { ...next || {} };
			next = next || {};
			const prevDomains = previous.staticDomains || [];
			const nextDomains = next.staticDomains || [];
			const prevWantsAll = Boolean(previous.staticData) && prevDomains.length === 0;
			const nextWantsAll = Boolean(next.staticData) && nextDomains.length === 0;
			return {
				quiet: Boolean(previous.quiet && next.quiet),
				preserveNotice: Boolean(previous.preserveNotice || next.preserveNotice),
				staticData: Boolean(previous.staticData || next.staticData),
				staticDomains: prevWantsAll || nextWantsAll ? [] : Array.from(new Set([...prevDomains, ...nextDomains]))
			};
		}
		function scheduleBackgroundRefresh(args = {}, delayMs = 120) {
			_backgroundRefreshArgs = mergeRefreshArgs(_backgroundRefreshArgs, {
				quiet: true,
				preserveNotice: true,
				...args
			});
			if (_backgroundRefreshTimer) return;
			_backgroundRefreshTimer = window.setTimeout(() => {
				const refreshArgs = _backgroundRefreshArgs || {
					quiet: true,
					preserveNotice: true
				};
				_backgroundRefreshTimer = null;
				_backgroundRefreshArgs = null;
				const task = refreshArgs.staticData ? refreshStaticAdminData({
					preserveNotice: refreshArgs.preserveNotice,
					domains: refreshArgs.staticDomains?.length ? refreshArgs.staticDomains : null
				}) : refreshRuntimeData();
				Promise.resolve(task).catch(() => {});
			}, delayMs);
		}
		function applyMutationResult(result, { render = true, drawer = false, skipConfig = false } = {}) {
			if (!state.adminKey) return false;
			if (!result || typeof result !== "object") return false;
			let changed = false;
			if (result.config !== void 0) {
				if (!skipConfig) acceptConfirmedConfig(result.config);
				changed = true;
			}
			if (result.routing !== void 0) {
				state.data.routing = result.routing;
				changed = true;
			}
			if (result.status !== void 0) {
				applyStatusPayload(result.status);
				changed = true;
			}
			if (result.models !== void 0) {
				if (acceptModelCapabilities(result.models)) changed = true;
			}
			if (result.router !== void 0) {
				state.data.status = {
					...state.data.status || {},
					router: result.router
				};
				changed = true;
			}
			if (result.policy !== void 0) {
				state.data.routing = {
					...state.data.routing || {},
					policy: result.policy
				};
				changed = true;
			}
			if (!changed) return false;
			state.data.version = Number(state.data.version || 0) + 1;
			if (result.config !== void 0) {
				state.forceConfigRender = true;
				state.forceModelRoutesRender = true;
				state.forceProvidersRender = true;
				state.forceModelCapsRender = true;
			}
			if (result.routing !== void 0 || result.policy !== void 0) {
				state.forcePolicyRender = true;
				state.forceFailurePoliciesRender = true;
			}
			if (result.status !== void 0 || result.router !== void 0) state.forceProvidersRender = true;
			if (render) renderAll({ force: true });
			if (drawer) renderProviderDrawer({ force: true });
			return true;
		}
		function updateDOM(target, htmlString) {
			if (!target) return;
			const nextHtml = String(htmlString ?? "");
			if (_renderedHtmlByTarget.get(target) === nextHtml) return;
			const __t0 = performance.now();
			if (!target.innerHTML.trim()) {
				target.innerHTML = nextHtml;
				_renderedHtmlByTarget.set(target, nextHtml);
				scheduleTooltipReconcile();
				window.__perfMark && window.__perfMark("updateDOM.innerHTML[" + (target.id || target.className || "?") + "]", performance.now() - __t0);
				return;
			}
			const wrapper = target.cloneNode(false);
			wrapper.innerHTML = nextHtml;
			const __t1 = performance.now();
			morphdom(target, wrapper, {
				childrenOnly: true,
				getNodeKey(node) {
					if (!node || node.nodeType !== 1) return void 0;
					if (node.id) return `id:${node.id}`;
					for (const attr of [
						"data-provider-card",
						"data-request-row",
						"data-model-usage-row",
						"data-provider-activity-list",
						"data-provider-probe-list"
					]) {
						const value = node.getAttribute(attr);
						if (value) return `${attr}:${value}`;
					}
				}
			});
			_renderedHtmlByTarget.set(target, nextHtml);
			scheduleTooltipReconcile();
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
			return Number.isFinite(n) ? n.toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US") : "0";
		}
		function fmtTokenCount(value) {
			const n = Number(value || 0);
			if (!Number.isFinite(n)) return "0";
			const abs = Math.abs(n);
			const compact = (divisor, suffix) => {
				const scaled = n / divisor;
				const maxDigits = Math.abs(scaled) < 10 ? 1 : 0;
				return `${scaled.toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US", {
					minimumFractionDigits: 0,
					maximumFractionDigits: maxDigits
				})}${suffix}`;
			};
			if (abs >= 0xe8d4a51000) return compact(0xe8d4a51000, "T");
			if (abs >= 1e9) return compact(1e9, "B");
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
			return `${Math.round(n).toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US")}ms`;
		}
		function fmtCompactMs(value) {
			const n = Math.max(0, Number(value || 0));
			if (n >= 1e3) {
				const seconds = n / 1e3;
				return `${(seconds >= 10 ? Math.round(seconds) : Math.round(seconds * 10) / 10).toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US")}s`;
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
			if (n < 1e-6) return "<$0.000001";
			if (n < 1e-4) return `$${n.toFixed(6)}`;
			return `$${n.toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US", {
				minimumFractionDigits: 2,
				maximumFractionDigits: 6
			})}`;
		}
		function fmtPricing(value) {
			return value === null || value === void 0 || value === "" ? "-" : fmtCost(value);
		}
		function costState(value) {
			const status = String(value?.cost_status || "legacy");
			const labels = {
				priced: t("cost.priced"),
				estimated: t("cost.estimated"),
				pending: t("cost.pending"),
				unpriced: t("cost.unpriced"),
				legacy: t("cost.legacy")
			};
			const icons = {
				priced: "check",
				estimated: "info",
				pending: "clock",
				unpriced: "alert",
				legacy: "info"
			};
			const display = status === "pending" || status === "unpriced" ? labels[status] : fmtCost(value?.cost_usd);
			return {
				status,
				label: labels[status] || status,
				icon: icons[status] || "info",
				display
			};
		}
		function renderCost(value, { compact = false } = {}) {
			const stateInfo = costState(value);
			const source = value?.pricing_source ? ` · ${value.pricing_source}` : "";
			const tip = `${stateInfo.label}${source}`;
			return `<span class="cost-state cost-${escapeHtml(stateInfo.status)}" data-tip="${escapeHtml(tip)}" tabindex="0" aria-label="${escapeHtml(tip)}">${iconSvg(stateInfo.icon)}<strong>${escapeHtml(stateInfo.display)}</strong>${compact ? "" : `<small>${escapeHtml(stateInfo.label)}</small>`}</span>`;
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
		function proxyTestButton(title = t("action.test_proxy")) {
			return `<button class="button secondary icon-action proxy-test-button" type="button" data-proxy-test title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${iconSvg("activity")}</button>`;
		}
		function proxyControlInput(name, value = "", placeholder = "http://host:port · socks5://host:port · host:port", attrs = "") {
			return `
      <div class="proxy-control-row">
        <input class="control" name="${escapeHtml(name)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${attrs} />
        ${proxyTestButton()}
      </div>
    `;
		}
		function usageFrom(value) {
			const usage = value?.usage && typeof value.usage === "object" ? value.usage : value || {};
			const inputTokens = Number(usage.input_tokens || value?.input_tokens || 0);
			const outputTokens = Number(usage.output_tokens || value?.output_tokens || 0);
			const totalTokens = Number(usage.total_tokens || value?.total_tokens || 0);
			const cachedInputTokens = Number(usage.cached_input_tokens || value?.cached_input_tokens || 0);
			const cacheWriteTokens = Number(usage.cache_write_tokens || value?.cache_write_tokens || 0);
			return {
				input_tokens: inputTokens,
				uncached_input_tokens: Number(usage.uncached_input_tokens ?? value?.uncached_input_tokens ?? Math.max(0, inputTokens - cachedInputTokens - cacheWriteTokens)),
				cached_input_tokens: cachedInputTokens,
				cache_write_tokens: cacheWriteTokens,
				output_tokens: outputTokens,
				reasoning_tokens: Number(usage.reasoning_tokens || value?.reasoning_tokens || 0),
				total_tokens: Math.max(totalTokens, inputTokens + outputTokens),
				cost_usd: Number(value?.cost_usd || usage.cost_usd || 0)
			};
		}
		function addUsage(target, source) {
			const usage = usageFrom(source);
			target.input_tokens += usage.input_tokens;
			target.uncached_input_tokens += usage.uncached_input_tokens;
			target.cached_input_tokens += usage.cached_input_tokens;
			target.cache_write_tokens += usage.cache_write_tokens;
			target.output_tokens += usage.output_tokens;
			target.reasoning_tokens += usage.reasoning_tokens;
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
		function fmtRequestDateParts(ts) {
			const n = Number(ts || 0);
			if (!n) return {
				date: "-",
				time: "-",
				iso: ""
			};
			const value = /* @__PURE__ */ new Date(n * 1e3);
			const locale = getLang() === "zh" ? "zh-CN" : "en-US";
			return {
				date: value.toLocaleDateString(locale, {
					month: "2-digit",
					day: "2-digit"
				}),
				time: value.toLocaleTimeString(locale, {
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
					hour12: false
				}),
				iso: value.toISOString()
			};
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
			if (root && !(active.closest && active.closest(root))) return false;
			if (active.matches?.("[data-refresh-safe-control]")) return false;
			const tag = (active.tagName || "").toLowerCase();
			if (tag === "input" || tag === "textarea" || tag === "select") return true;
			if (active.isContentEditable) return true;
			if (!root) return false;
			return Boolean(active.closest && active.closest(root));
		}
		var _dirtyContainers = /* @__PURE__ */ new Set();
		var _trackedFormSelectors = [
			"#globalProxyForm",
			"#configProviders",
			"#providerDrawer",
			"#modelRoutesPanel",
			"#providersTable",
			"#modelCapabilities",
			"#settingsOpsGrid",
			"#settingsPricingCatalog",
			"#keyDrawerBody"
		];
		function _markContainerDirty(e) {
			const target = e.target;
			if (!target) return;
			const tag = (target.tagName || "").toLowerCase();
			if (tag !== "input" && tag !== "textarea" && tag !== "select") return;
			if (target.type === "search" || target.type === "button" || target.type === "submit") return;
			if (target.matches?.("[data-refresh-safe-control]")) return;
			for (const sel of _trackedFormSelectors) if (target.closest(sel)) {
				_dirtyContainers.add(sel);
				configRefreshCoordinator.markInteraction();
				return;
			}
		}
		function _clearContainerDirtyOnSubmit(e) {
			const form = e.target;
			if (!form) return;
			for (const sel of _trackedFormSelectors) if (form.closest(sel)) {
				_dirtyContainers.add(sel);
				configRefreshCoordinator.markInteraction();
				return;
			}
		}
		function clearDirty(selector) {
			_dirtyContainers.delete(selector);
			configRefreshCoordinator.markInteraction();
		}
		function clearAllDirty() {
			_dirtyContainers.clear();
			configRefreshCoordinator.markInteraction();
		}
		function isContainerDirty(selector) {
			return _dirtyContainers.has(selector);
		}
		function shouldPreserveContainer(selector) {
			return interactiveElementHasFocus(selector) || isContainerDirty(selector);
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
			optimisticConfigStore.clear();
			uiActionRegistry.clear();
			state.data.config = null;
			state.staticDataState = "idle";
		}
		async function validateAdminKey(key) {
			state.adminKey = String(key || "").trim();
			if (!state.adminKey) throw new Error("Admin key is required.");
			return apiGet("/-/admin/status");
		}
		async function openConsoleWithKey(key, { persist = false, checkingMessage = "Checking console access." } = {}) {
			showAuthChecking(checkingMessage);
			try {
				applyStatusPayload(await validateAdminKey(key));
				state.staticDataState = state.data.config ? "ready" : "loading";
				if (persist) try {
					localStorage.setItem("proxyConsoleAdminKey", state.adminKey);
				} catch (_err) {}
				showConsole();
				if (persist) try {
					const url = new URL(window.location.href);
					url.searchParams.delete("admin_key");
					window.history.replaceState(null, "", url.toString());
				} catch (_err) {}
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
				setNotice(t("notice.confirm_unavailable"));
				return Promise.resolve(false);
			}
			if (state.confirmResolve) {
				state.confirmResolve(false);
				state.confirmResolve = null;
			}
			state.confirmLastFocus = document.activeElement;
			titleEl.textContent = title || t("confirm.title_default");
			messageEl.textContent = message || t("confirm.message_default");
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
			body.replaceChildren();
			_renderedHtmlByTarget.delete(body);
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
		var PROVIDER_PRESETS = [
			{
				name: "openai",
				base_url: "https://api.openai.com",
				format: "chat_completions",
				label: "OpenAI",
				env_var: "OPENAI_API_KEY",
				priority: 10
			},
			{
				name: "anthropic",
				base_url: "https://api.anthropic.com",
				format: "anthropic_messages",
				label: "Anthropic",
				env_var: "ANTHROPIC_API_KEY",
				priority: 10
			},
			{
				name: "deepseek",
				base_url: "https://api.deepseek.com",
				format: "chat_completions",
				label: "DeepSeek",
				env_var: "DEEPSEEK_API_KEY",
				priority: 8
			},
			{
				name: "groq",
				base_url: "https://api.groq.com/openai",
				format: "chat_completions",
				label: "Groq",
				env_var: "GROQ_API_KEY",
				priority: 7
			},
			{
				name: "openrouter",
				base_url: "https://openrouter.ai/api",
				format: "chat_completions",
				label: "OpenRouter",
				env_var: "OPENROUTER_API_KEY",
				priority: 6
			},
			{
				name: "xai",
				base_url: "https://api.x.ai",
				format: "chat_completions",
				label: "xAI",
				env_var: "XAI_API_KEY",
				priority: 7
			},
			{
				name: "mistral",
				base_url: "https://api.mistral.ai",
				format: "chat_completions",
				label: "Mistral",
				env_var: "MISTRAL_API_KEY",
				priority: 7
			},
			{
				name: "siliconflow",
				base_url: "https://api.siliconflow.cn",
				format: "chat_completions",
				label: "SiliconFlow",
				env_var: "SILICONFLOW_API_KEY",
				priority: 6
			},
			{
				name: "moonshot",
				base_url: "https://api.moonshot.cn",
				format: "chat_completions",
				label: "Moonshot",
				env_var: "MOONSHOT_API_KEY",
				priority: 6
			},
			{
				name: "together",
				base_url: "https://api.together.xyz",
				format: "chat_completions",
				label: "Together",
				env_var: "TOGETHER_AI_API_KEY",
				priority: 6
			}
		];
		function addProviderModalBody() {
			return `
      <form id="addProviderModalForm" class="provider-create-form">
        <div class="provider-preset-section">
          <span class="provider-preset-label">Quick fill:</span>
          <div class="provider-preset-chips">${PROVIDER_PRESETS.map((p) => `<button type="button" class="provider-preset-chip" data-preset='${JSON.stringify(p)}' title="Fill from ${escapeHtml(p.label)} preset">${escapeHtml(p.label)}</button>`).join("")}</div>
          <button type="button" class="provider-preset-chip" id="addProviderPasteBtn" title="Read clipboard and auto-fill URL & key">📋 Paste & Auto-fill</button>
        </div>
        <label class="field form-field-inline">
          <span>Provider name</span>
          <input class="control" name="name" required placeholder="my-provider" autocomplete="off" />
        </label>
        <div class="form-row-2 provider-main-fields">
          <label class="field form-field-inline">
            <span>Base URL</span>
            <input class="control" name="base_url" required placeholder="https://api.example.com/v1" autocomplete="off" />
          </label>
          <label class="field form-field-inline">
            <span>API key</span>
            <input class="control" name="key" type="password" required placeholder="sk-..." autocomplete="off" />
          </label>
        </div>
        <label class="field form-field-inline">
          <span>${escapeHtml(t("form.site_url"))}<span class="help-tip" data-tip="${escapeHtml(t("form.site_url_tip"))}">?</span></span>
          <input class="control" name="site_url" type="url" placeholder="https://provider.example.com" autocomplete="off" />
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
            <span>Priority <small class="muted">(auto: place first)</small></span>
            <input class="control" name="priority" type="number" value="0" />
          </label>
        </div>
        <details>
          <summary>Advanced options</summary>
          <div class="form-field-inline" style="margin-top:10px;display:grid;gap:10px">
            <label class="field form-field-inline">
              <span>Provider proxy <small class="muted">(optional)</small></span>
              ${proxyControlInput("proxy", "", "http://host:port · socks5://host:port · host:port", "autocomplete=\"off\"")}
            </label>
            <label class="field form-field-inline">
              <span>Initial key proxy <small class="muted">(optional)</small></span>
              ${proxyControlInput("key_proxy", "", "http://host:port · socks5://host:port · host:port", "autocomplete=\"off\"")}
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
				title: t("form.add_provider_title"),
				subtitle: t("form.add_provider_sub"),
				bodyHtml: addProviderModalBody()
			});
			const form = document.getElementById("addProviderModalForm");
			if (form) {
				function detectProviderFields(text) {
					const result = {
						base_url: null,
						key: null,
						name: null
					};
					if (!text) return result;
					const baseUrlJson = text.match(/"base_url"\s*:\s*"([^"]+)"/i);
					if (baseUrlJson) result.base_url = baseUrlJson[1].replace(/\/+$/, "");
					const keysJson = text.match(/"keys"\s*:\s*\[?\s*"([^"]+)"/i);
					if (keysJson) result.key = keysJson[1];
					if (!result.key) {
						const keyJson = text.match(/"key"\s*:\s*"([^"]+)"/i);
						if (keyJson) result.key = keyJson[1];
					}
					const nameJson = text.match(/"name"\s*:\s*"([^"]+)"/i);
					if (nameJson) result.name = nameJson[1];
					if (!result.base_url && !result.key) try {
						let jsonStr = text.trim();
						if (!jsonStr.startsWith("{") && /"\w+"\s*:/.test(jsonStr)) jsonStr = "{" + jsonStr + "}";
						jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
						const parsed = JSON.parse(jsonStr);
						if (parsed && typeof parsed === "object" && parsed.providers) for (const [pname, cfg] of Object.entries(parsed.providers)) {
							if (cfg && cfg.base_url) {
								result.base_url = String(cfg.base_url).replace(/\/+$/, "");
								if (!result.name) result.name = pname;
							}
							if (cfg && Array.isArray(cfg.keys) && cfg.keys.length > 0) {
								const k = cfg.keys[0];
								result.key = typeof k === "object" ? k.key || "" : String(k);
							}
							break;
						}
					} catch (_e) {}
					if (!result.base_url) {
						const urlMatch = text.match(/https?:\/\/[^\s"'<>},\])]+/i);
						if (urlMatch) result.base_url = urlMatch[0].replace(/\/+$/, "");
					}
					if (!result.key) {
						const quotedKey = text.match(/"((?:sk-|key-|pk-|rqsty-|rk-|cos-|tencent-|AKID)[^"]{16,})"/i);
						if (quotedKey && quotedKey[1] !== result.base_url) result.key = quotedKey[1];
						if (!result.key) {
							const quotedAny = text.match(/"([a-zA-Z0-9+\/_=+-]{32,})"/);
							if (quotedAny && quotedAny[1] !== result.base_url) result.key = quotedAny[1];
						}
						if (!result.key) for (const prefix of [
							"sk-",
							"key-",
							"pk-",
							"rqsty-",
							"rk-",
							"cos-",
							"tencent-",
							"AKID"
						]) {
							const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
							const re = new RegExp("(" + escaped + "[a-zA-Z0-9+/_=+-]{16,})");
							const m = text.match(re);
							if (m && m[1] && m[1] !== result.base_url) {
								result.key = m[1];
								break;
							}
						}
					}
					return result;
				}
				function autoFillFromText(text, overwrite) {
					if (!text) return false;
					const detected = detectProviderFields(text);
					let filled = false;
					if (detected.base_url) {
						const urlField = form.querySelector("[name=\"base_url\"]");
						if (urlField && (overwrite || !urlField.value.trim())) {
							urlField.value = detected.base_url;
							filled = true;
						}
					}
					if (detected.key) {
						const keyField = form.querySelector("[name=\"key\"]");
						if (keyField && (overwrite || !keyField.value.trim())) {
							keyField.value = detected.key;
							filled = true;
						}
					}
					if (detected.name) {
						const nameField = form.querySelector("[name=\"name\"]");
						if (nameField && (overwrite || !nameField.value.trim())) {
							nameField.value = detected.name;
							filled = true;
						}
					}
					return filled;
				}
				form.addEventListener("paste", (event) => {
					const pastedText = event.clipboardData?.getData("text") || "";
					if (!pastedText) return;
					const detected = detectProviderFields(pastedText);
					const targetName = event.target?.name || "";
					if (!detected.base_url && !detected.key) return;
					if (targetName === "base_url" && detected.key) {
						const keyField = form.querySelector("[name=\"key\"]");
						if (keyField && !keyField.value.trim()) {
							keyField.value = detected.key;
							setNotice("Auto-filled API key from pasted content", "ok");
						}
					}
					if (targetName === "key" && detected.base_url) {
						const urlField = form.querySelector("[name=\"base_url\"]");
						if (urlField && !urlField.value.trim()) {
							urlField.value = detected.base_url;
							setNotice("Auto-filled Base URL from pasted content", "ok");
						}
					}
					if (targetName === "name" || targetName === "" || targetName === "priority") {
						event.preventDefault();
						autoFillFromText(pastedText);
						if (detected.base_url || detected.key) setNotice("Auto-filled from clipboard content", "ok");
					}
				});
				const pasteBtn = document.getElementById("addProviderPasteBtn");
				if (pasteBtn) pasteBtn.addEventListener("click", async () => {
					try {
						const text = await navigator.clipboard.readText();
						if (text) {
							const filled = autoFillFromText(text, true);
							setNotice(filled ? "Auto-filled from clipboard" : "No URL or API key found in clipboard", filled ? "ok" : "");
						} else setNotice("Clipboard is empty");
					} catch (_e) {
						setNotice("Clipboard access denied. Try pasting into a field instead.");
					}
				});
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const data = new FormData(form);
					const format = String(data.get("format") || "chat_completions");
					const proxy = String(data.get("proxy") || "").trim();
					const key = String(data.get("key") || "").trim();
					const keyProxy = String(data.get("key_proxy") || "").trim();
					const siteUrl = String(data.get("site_url") || "").trim();
					const priority = Number(data.get("priority") || 0);
					const payload = {
						name: String(data.get("name") || "").trim(),
						base_url: String(data.get("base_url") || "").trim(),
						keys: [keyProxy ? {
							key,
							proxy: keyProxy
						} : key]
					};
					if (siteUrl) payload.site_url = siteUrl;
					if (priority !== 0) payload.priority = priority;
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
					if (await runConfigMutation(form, async () => {
						const result = await apiPost("/-/admin/providers", payload);
						setNotice(t("notice.provider_added", { name: payload.name }), "ok");
						return result;
					}, {
						resourceKey: `provider:${payload.name}`,
						apply: (config) => appendPendingProvider(config, payload),
						drawer: false
					})) closeFormModal();
				});
			}
			const cancel = document.getElementById("addProviderModalCancel");
			if (cancel) cancel.addEventListener("click", closeFormModal);
			document.querySelectorAll(".provider-preset-chip").forEach((chip) => {
				chip.addEventListener("click", () => {
					try {
						const preset = JSON.parse(chip.getAttribute("data-preset") || "{}");
						const nameField = form.querySelector("[name=\"name\"]");
						const urlField = form.querySelector("[name=\"base_url\"]");
						const formatField = form.querySelector("[name=\"format\"]");
						const priorityField = form.querySelector("[name=\"priority\"]");
						if (preset.name && nameField) nameField.value = preset.name;
						if (preset.base_url && urlField) urlField.value = preset.base_url;
						if (preset.format && formatField) formatField.value = preset.format;
						if (preset.priority != null && priorityField) priorityField.value = preset.priority;
					} catch (_e) {}
				});
			});
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
			const cacheRead = entry.cache_read_per_million ?? entry.cache_hit;
			const cacheWrite = entry.cache_write_per_million;
			const lines = [`${t("pricing.input")} ${fmtCost(input)}/M`, `${t("pricing.output")} ${fmtCost(output)}/M`];
			if (cacheRead !== null && cacheRead !== void 0 && cacheRead !== "") lines.push(`${t("pricing.cache_read")} ${fmtCost(cacheRead)}/M`);
			if (cacheWrite !== null && cacheWrite !== void 0 && cacheWrite !== "") lines.push(`${t("pricing.cache_write")} ${fmtCost(cacheWrite)}/M`);
			else if (entry.cache_write_estimated && input !== null && input !== void 0 && input !== "") lines.push(`${t("pricing.cache_write_estimated")} ${fmtCost(input)}/M`);
			if (entry.blended_per_million !== null && entry.blended_per_million !== void 0) lines.push(`${t("pricing.blended")} ${fmtCost(entry.blended_per_million)}/M`);
			return `<span class="model-price-tip" data-tip="${escapeHtml(lines.join(" · "))}" tabindex="0" aria-label="${escapeHtml(t("misc.pricing_for", { model: modelName }))}">${iconSvg("info")}</span>`;
		}
		async function refreshModelPricing(modelNames) {
			const sequence = ++pricingFetchSequence;
			const batches = [];
			for (let index = 0; index < modelNames.length; index += MODEL_PRICING_BATCH_SIZE) batches.push(modelNames.slice(index, index + MODEL_PRICING_BATCH_SIZE));
			const responses = await Promise.all(batches.map((batch) => apiGet(`/-/admin/model-pricing?models=${encodeURIComponent(batch.join(","))}`)));
			if (sequence !== pricingFetchSequence) return;
			const merged = {};
			responses.forEach((response) => {
				Object.assign(merged, response?.pricing || {});
			});
			const nextSignature = runtimeSignature(merged);
			const previousSignature = runtimeSignature(state.data.pricing || {});
			state.data.pricing = merged;
			if (nextSignature !== previousSignature) try {
				renderAll();
			} catch (_e) {}
		}
		var _staticRefreshInFlight = false;
		var _staticRefreshWanted = false;
		async function refreshStaticAdminData({ preserveNotice = true, domains = null } = {}) {
			if (!state.adminKey || document.hidden) return false;
			if (_staticRefreshInFlight) {
				_staticRefreshWanted = true;
				return false;
			}
			_staticRefreshInFlight = true;
			const includesConfig = !domains || domains.includes("config");
			if (includesConfig && !state.data.config) state.staticDataState = "loading";
			const refreshSnapshot = configRefreshCoordinator.snapshot();
			const protectedAtStart = hasProtectedConfigInteraction();
			try {
				const entries = [
					["status", () => apiGet("/-/admin/status")],
					["models", () => apiGet("/-/admin/models/capabilities", { cache: true })],
					["routing", () => apiGet("/-/admin/routing", { cache: true })],
					["config", () => apiGet("/-/admin/config", { cache: true })],
					["overlay", () => apiGet("/-/admin/config/overlay", { cache: true })],
					["audit", () => apiGet("/-/admin/audit?limit=12", { cache: true })],
					["conversionDiagnostics", () => apiGet("/-/admin/conversion-diagnostics")],
					["conversionDiagRecords", () => apiGet("/-/admin/conversion-diagnostics/records?limit=20", { cache: true })]
				];
				const selectedEntries = (domains ? entries.filter(([name]) => domains.includes(name)) : entries).filter(([name]) => !(protectedAtStart && STATIC_CONFIG_DOMAINS.has(name)));
				if (!selectedEntries.length) {
					setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
					return false;
				}
				const settled = await Promise.allSettled(selectedEntries.map(([, load]) => load()));
				const result = {};
				settled.forEach((entry, index) => {
					if (entry.status === "fulfilled") result[selectedEntries[index][0]] = entry.value;
				});
				const allowConfigApply = !configRefreshCoordinator.shouldDefer(refreshSnapshot, hasProtectedConfigInteraction());
				if (result.status !== void 0) applyStatusPayload(result.status);
				if (result.models !== void 0) acceptModelCapabilities(result.models);
				if (allowConfigApply && result.routing !== void 0) state.data.routing = result.routing;
				if (allowConfigApply && result.config !== void 0) acceptConfirmedConfig(result.config);
				else if (includesConfig && !state.data.config) state.staticDataState = "error";
				if (allowConfigApply && result.overlay !== void 0) state.data.overlay = result.overlay;
				if (result.audit !== void 0) state.data.audit = result.audit;
				if (result.conversionDiagnostics !== void 0) state.data.conversionDiagnostics = result.conversionDiagnostics;
				if (result.conversionDiagRecords !== void 0) state.data.conversionDiagRecords = result.conversionDiagRecords;
				state.data.version = Number(state.data.version || 0) + 1;
				if (allowConfigApply) {
					state.forceConfigRender = true;
					state.forcePolicyRender = true;
					state.forceFailurePoliciesRender = true;
					state.forceModelRoutesRender = true;
					state.forceProvidersRender = true;
					state.forceModelCapsRender = true;
				}
				if (allowConfigApply && !hasProtectedConfigInteraction() && ([
					"providers",
					"policy",
					"config"
				].includes(state.view) || state.providerDrawerName)) {
					renderAll();
					if (state.providerDrawerName) renderProviderDrawer({ force: true });
				}
				if (!preserveNotice) setNotice("");
				setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
				_maybeScheduleCapabilityFollowUp();
				return true;
			} catch (err) {
				if (!state.data.config) state.staticDataState = "error";
				setConnection(false, t("conn.connection_error"));
				return false;
			} finally {
				_staticRefreshInFlight = false;
				if (_staticRefreshWanted) {
					_staticRefreshWanted = false;
					Promise.resolve().then(() => refreshStaticAdminData({ preserveNotice: true }));
				}
			}
		}
		var _runtimeRefreshInFlight = false;
		var _runtimeRefreshWanted = false;
		var _runtimeRefreshWantedForceViewData = false;
		var _runtimeRefreshGeneration = 0;
		var _runtimeViewAbortController = null;
		var _requestPageNavigation = null;
		var _lastMetricsFullAt = 0;
		var RUNTIME_VIEW_REFRESH_MS = 15e3;
		var _lastRuntimeViewRefreshAt = {
			overview: 0,
			requests: 0
		};
		function applyRuntimeCore(result) {
			const signature = runtimeSignature({
				metrics: result.metrics,
				providerActivity: result.providerActivity,
				healthScores: result.healthScores,
				routerSnapshot: result.routerSnapshot
			});
			if (signature && signature === _lastRuntimeCoreSignature) return false;
			_lastRuntimeCoreSignature = signature;
			if (result.metrics !== void 0) state.data.metrics = result.metrics;
			if (result.providerActivity !== void 0) {
				const activity = result.providerActivity || {};
				state.data.providerActivity = activity.providers || activity || {};
			}
			if (result.healthScores !== void 0) state.data.healthScores = result.healthScores;
			if (result.routerSnapshot?.providers) state.data.status = {
				...state.data.status || {},
				router: result.routerSnapshot
			};
			state.data.runtimeVersion = Number(state.data.runtimeVersion || 0) + 1;
			return true;
		}
		function applyRuntimeViewData(result, view) {
			const signature = runtimeSignature({
				view,
				...result
			});
			if (signature && signature === _lastRuntimeViewSignature) return false;
			_lastRuntimeViewSignature = signature;
			if (result.metricsFull !== void 0) {
				state.data.metricsFull = result.metricsFull;
				_lastMetricsFullAt = Date.now();
			}
			if (result.timeseries !== void 0) state.data.timeseries = result.timeseries;
			if (result.requests !== void 0) state.data.requests = result.requests;
			if (view && Object.keys(result).length) _lastRuntimeViewRefreshAt[view] = Date.now();
			state.data.runtimeVersion = Number(state.data.runtimeVersion || 0) + 1;
			return true;
		}
		async function refreshRuntimeData({ forceViewData = false } = {}) {
			if (!state.adminKey || document.hidden) return;
			if (_runtimeRefreshInFlight) {
				_runtimeRefreshWanted = true;
				_runtimeRefreshWantedForceViewData ||= forceViewData;
				return;
			}
			_runtimeRefreshInFlight = true;
			const generation = ++_runtimeRefreshGeneration;
			const requestedView = state.view || "overview";
			const requestedRequestPage = requestedView === "requests" ? Math.max(0, Number(state.requestsPage) || 0) : null;
			let viewController = null;
			try {
				const coreEntries = [
					["metrics", apiGet("/-/admin/metrics")],
					["providerActivity", apiGet(`/-/admin/provider-activity?limit=60&include_events=${requestedView === "providers" ? "1" : "0"}`)],
					["healthScores", apiGet("/-/admin/health/scores")],
					["routerSnapshot", apiGet("/-/admin/router/snapshot")]
				];
				_runtimeViewAbortController?.abort();
				viewController = new AbortController();
				_runtimeViewAbortController = viewController;
				const viewEntries = [];
				const now = Date.now();
				const viewRefreshDue = forceViewData || now - Number(_lastRuntimeViewRefreshAt[requestedView] || 0) >= RUNTIME_VIEW_REFRESH_MS;
				if (requestedView === "overview") {
					const forceTimeseriesFetch = Boolean(state.forceTimeseriesFetch);
					if (viewRefreshDue || forceTimeseriesFetch) {
						viewEntries.push(["timeseries", apiGet(timeseriesPath(), { signal: viewController.signal })]);
						state.forceTimeseriesFetch = false;
					}
					const recentRingStale = now - _lastMetricsFullAt >= 3e4;
					if (forceViewData || !state.data.metricsFull || recentRingStale) viewEntries.push(["metricsFull", apiGet("/-/admin/metrics/full", { signal: viewController.signal })]);
				} else if (requestedView === "requests") {
					const forceRequestsFetch = Boolean(state.forceRequestsFetch);
					if (viewRefreshDue || forceRequestsFetch) {
						viewEntries.push(["requests", apiGet(requestsPath(), { signal: viewController.signal })]);
						state.forceRequestsFetch = false;
					}
				}
				const toResult = (entries, settled) => {
					const result = {};
					settled.forEach((entry, index) => {
						if (entry.status === "fulfilled") result[entries[index][0]] = entry.value;
					});
					return result;
				};
				const viewPromise = Promise.allSettled(viewEntries.map(([, promise]) => promise));
				const coreSettled = await Promise.allSettled(coreEntries.map(([, promise]) => promise));
				if (generation !== _runtimeRefreshGeneration || requestedView !== state.view) return;
				const coreResult = toResult(coreEntries, coreSettled);
				const coreChanged = applyRuntimeCore(coreResult);
				const metricsVersion = coreResult.metrics?.models_version;
				if (metricsVersion !== void 0 && metricsVersion !== _lastModelsVersion) {
					const firstSync = _lastModelsVersion === null;
					_lastModelsVersion = metricsVersion;
					if (!firstSync) refreshCapabilitiesOnly();
				}
				if (coreChanged && !viewEntries.length) renderAll();
				setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
				const viewSettled = await viewPromise;
				if (generation !== _runtimeRefreshGeneration || requestedView !== state.view) return;
				const viewResult = toResult(viewEntries, viewSettled);
				const requestsPayload = requestedView === "requests" ? viewResult.requests : void 0;
				const requestNavigationPending = requestedView === "requests" && _requestPageNavigation?.to === requestedRequestPage;
				const requestViewEntryIndex = viewEntries.findIndex(([key]) => key === "requests");
				const requestViewSettled = requestViewEntryIndex >= 0 ? viewSettled[requestViewEntryIndex] : null;
				const requestViewAborted = requestViewSettled?.status === "rejected" && requestViewSettled.reason?.name === "AbortError";
				const requestViewRejected = requestViewSettled?.status === "rejected";
				const requestViewMatches = requestedView !== "requests" || Number(state.requestsPage) === requestedRequestPage && (requestNavigationPending ? requestNavigationPayloadMatchesPage(requestsPayload, requestedRequestPage, 10) : requestPayloadMatchesPage(requestsPayload, requestedRequestPage, 10));
				if (!requestViewMatches) {
					_runtimeRefreshWanted = true;
					_runtimeRefreshWantedForceViewData = true;
				}
				const viewChanged = requestViewMatches && Object.keys(viewResult).length ? applyRuntimeViewData(viewResult, requestedView) : false;
				if (requestNavigationPending) if (requestNavigationPayloadMatchesPage(requestsPayload, requestedRequestPage, 10) && requestViewMatches) _requestPageNavigation = null;
				else if (!requestViewRejected || requestViewAborted) {
					_runtimeRefreshWanted = true;
					_runtimeRefreshWantedForceViewData = true;
				} else {
					state.requestsPage = _requestPageNavigation.from;
					_requestPageNavigation = null;
					renderAll();
				}
				if (viewChanged || coreChanged && viewEntries.length && requestViewMatches) renderAll();
			} catch (err) {
				setConnection(false, t("conn.connection_error"));
			} finally {
				if (_runtimeViewAbortController === viewController) _runtimeViewAbortController = null;
				if (generation === _runtimeRefreshGeneration) _runtimeRefreshInFlight = false;
				if (_runtimeRefreshWanted && !_runtimeRefreshInFlight) {
					const trailingForceViewData = _runtimeRefreshWantedForceViewData;
					_runtimeRefreshWanted = false;
					_runtimeRefreshWantedForceViewData = false;
					Promise.resolve().then(() => refreshRuntimeData({ forceViewData: trailingForceViewData }));
				}
			}
		}
		async function refreshAll({ quiet = false, preserveNotice = false, staticData = false } = {}) {
			if (!state.adminKey) {
				setConnection(false, t("conn.admin_required"));
				showLogin(quiet ? "" : "Admin key is required to load console data.");
				return;
			}
			if (_refreshInFlight) {
				_refreshWanted = true;
				_refreshWantedArgs = mergeRefreshArgs(_refreshWantedArgs, {
					quiet,
					preserveNotice,
					staticData
				});
				return;
			}
			_refreshInFlight = true;
			try {
				try {
					setConnection(null, t("conn.reconnecting"));
					const view = state.view || "overview";
					const needTimeseries = !quiet || view === "overview" || state.forceTimeseriesFetch;
					const needRequests = !quiet || view === "requests" || state.forceRequestsFetch;
					const needRecentRing = !quiet || !state.data.metricsFull || state.forceRequestsFetch;
					const needStaticAdminData = staticData || !quiet || !state.data.status || !state.data.config;
					if (needStaticAdminData && !state.data.config) state.staticDataState = "loading";
					state.forceTimeseriesFetch = false;
					state.forceRequestsFetch = false;
					const providerActivityPath = `/-/admin/provider-activity?limit=60&include_events=${view === "providers" ? "1" : "0"}`;
					const fetches = {
						metrics: apiGet("/-/admin/metrics"),
						providerActivity: apiGet(providerActivityPath),
						healthScores: apiGet("/-/admin/health/scores")
					};
					if (needStaticAdminData) {
						fetches.status = apiGet("/-/admin/status");
						fetches.models = apiGet("/-/admin/models/capabilities");
						fetches.routing = apiGet("/-/admin/routing");
						fetches.config = apiGet("/-/admin/config");
						fetches.overlay = apiGet("/-/admin/config/overlay");
						fetches.audit = apiGet("/-/admin/audit?limit=12");
						fetches.conversionDiagnostics = apiGet("/-/admin/conversion-diagnostics");
						fetches.conversionDiagRecords = apiGet("/-/admin/conversion-diagnostics/records?limit=20");
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
					if (result.metricsFull !== void 0) {
						state.data.metricsFull = result.metricsFull;
						_lastMetricsFullAt = Date.now();
					}
					if (result.providerActivity !== void 0) {
						const pa = result.providerActivity || {};
						state.data.providerActivity = pa.providers || pa || {};
					}
					if (result.healthScores !== void 0) state.data.healthScores = result.healthScores;
					if (result.timeseries !== void 0) state.data.timeseries = result.timeseries;
					if (result.status !== void 0) applyStatusPayload(result.status);
					if (result.models !== void 0) acceptModelCapabilities(result.models);
					if (result.requests !== void 0) state.data.requests = result.requests;
					if (result.routing !== void 0) state.data.routing = result.routing;
					if (result.config !== void 0) acceptConfirmedConfig(result.config);
					if (result.overlay !== void 0) state.data.overlay = result.overlay;
					if (result.audit !== void 0) state.data.audit = result.audit;
					if (result.conversionDiagnostics !== void 0) state.data.conversionDiagnostics = result.conversionDiagnostics;
					if (result.conversionDiagRecords !== void 0) state.data.conversionDiagRecords = result.conversionDiagRecords;
					const statusVersion = result.status?.models_version;
					const metricsVersion = result.metrics?.models_version ?? statusVersion;
					if (metricsVersion !== void 0 && metricsVersion !== _lastModelsVersion) {
						const isFirstSync = _lastModelsVersion === null;
						_lastModelsVersion = metricsVersion;
						if (!isFirstSync && !result.models) try {
							if (acceptModelCapabilities(await apiGet("/-/admin/models/capabilities"))) state.data.version = Number(state.data.version || 0) + 1;
						} catch (_e) {}
					}
					state.data.version = Number(state.data.version || 0) + 1;
					try {
						const modelNames = collectModelNames(state.data.status, state.data.config);
						const pricingKey = modelNames.join(",");
						const pricingExpired = Date.now() - _lastPricingFetchedAt >= MODEL_PRICING_REFRESH_MS;
						if (modelNames.length && (pricingKey !== _lastPricingKey || pricingExpired) && !_pricingFetchInFlight) {
							_lastPricingKey = pricingKey;
							_lastPricingFetchedAt = Date.now();
							_pricingFetchInFlight = true;
							refreshModelPricing(modelNames).catch(() => {
								_lastPricingFetchedAt = 0;
							}).finally(() => {
								_pricingFetchInFlight = false;
							});
						} else if (!modelNames.length) {
							state.data.pricing = {};
							_lastPricingFetchedAt = 0;
						}
					} catch (e) {
						state.data.pricing = state.data.pricing || {};
						_lastPricingFetchedAt = 0;
					}
					renderAll();
					if (!preserveNotice) setNotice("");
					setConnection(true, `Updated ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`);
					_maybeScheduleCapabilityFollowUp();
				} catch (err) {
					if (!state.data.config) state.staticDataState = "error";
					setConnection(false, t("conn.connection_error"));
					if (isAuthError(err)) {
						clearStoredAdminKey();
						state.adminKey = "";
						showLogin(t("auth.invalid"));
					} else setNotice(t("notice.refresh_failed", { error: err.message }));
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
		function capabilityFollowUpDelayMs() {
			const providers = state.data?.status?.models?.providers || {};
			const statuses = Object.values(providers).filter((cap) => cap && typeof cap === "object").map((cap) => cap.status);
			if (statuses.includes("pending")) return 3e3;
			if (statuses.includes("stale")) return 8e3;
			if (statuses.includes("error")) return 3e4;
			return 0;
		}
		async function refreshCapabilitiesOnly() {
			if (!state.adminKey || document.hidden) return false;
			try {
				if (acceptModelCapabilities(await apiGet("/-/admin/models/capabilities")) && state.view === "providers") {
					state.forceModelCapsRender = true;
					renderModelCapabilities();
					renderProviderDrawer();
				}
				_maybeScheduleCapabilityFollowUp();
				return true;
			} catch (_err) {
				_maybeScheduleCapabilityFollowUp();
				return false;
			}
		}
		function _maybeScheduleCapabilityFollowUp() {
			const delayMs = capabilityFollowUpDelayMs();
			if (!delayMs || document.hidden) {
				if (_capabilityFollowUpTimer) {
					clearTimeout(_capabilityFollowUpTimer);
					_capabilityFollowUpTimer = null;
				}
				return;
			}
			if (_capabilityFollowUpTimer) return;
			_capabilityFollowUpTimer = setTimeout(() => {
				_capabilityFollowUpTimer = null;
				refreshCapabilitiesOnly();
			}, delayMs);
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
				http_status: el("filterHttpStatus")?.value,
				client_ip: el("filterClientIp")?.value,
				stream: el("filterStream")?.value,
				client_format: el("filterClientFormat")?.value,
				upstream_format: el("filterUpstreamFormat")?.value,
				cost_status: el("filterCostStatus")?.value
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
		function pointerOverOpenDrawer() {
			if (document.hidden) return false;
			return Boolean(document.querySelector(".drawer.is-open:hover, .mobile-settings-drawer.is-open:hover"));
		}
		function renderAll({ force = false } = {}) {
			if (!force && pointerOverOpenDrawer()) return;
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
				renderOnboardingBanner();
				__mark("onboarding");
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
				renderHealthOverview();
				__mark("healthOverview");
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
			} else if (view === "settings") {
				renderSettings();
				__mark("settings");
			}
			renderProviderDrawer();
			__mark("providerDrawer");
			bindViewTargetButtons();
			bindConfigTabs();
			bindSettingsTabs();
			bindProxyTestButtons();
			mutationBusyTracker.refresh();
			window.__perfMark && window.__perfMark("renderAll.total", performance.now() - __t0);
		}
		function bindViewTargetButtons() {
			qsa("[data-view-target]").forEach((button) => {
				if (button.dataset.boundViewTarget) return;
				button.dataset.boundViewTarget = "1";
				button.addEventListener("click", () => setView(button.dataset.viewTarget || "overview"));
			});
		}
		function switchConfigTab(tabName) {
			const tabNav = el("configTabNav");
			if (!tabNav || !new Set([
				"routes",
				"models",
				"map",
				"runtime",
				"proxy",
				"health",
				"advanced"
			]).has(tabName)) return;
			tabNav.querySelectorAll("button").forEach((button) => {
				const active = button.dataset.configTab === tabName;
				button.classList.toggle("is-active", active);
				button.setAttribute("aria-selected", active ? "true" : "false");
				button.tabIndex = active ? 0 : -1;
			});
			document.querySelectorAll("[data-config-tab-panel]").forEach((panel) => {
				panel.hidden = panel.dataset.configTabPanel !== tabName;
			});
			state.configTab = tabName;
			el("configView")?.classList.toggle("is-model-data", tabName === "models");
			if (tabName === "models") if (state.statisticsView === "models") loadModelUsage();
			else loadUsageStatistics();
			try {
				localStorage.setItem("proxyConsoleConfigTab", tabName);
			} catch (_e) {}
		}
		function bindConfigTabs() {
			const tabNav = el("configTabNav");
			if (!tabNav) return;
			tabNav.querySelectorAll("[data-config-tab]").forEach((button) => {
				if (button.dataset.boundConfigTab) return;
				button.dataset.boundConfigTab = "1";
				button.addEventListener("click", () => switchConfigTab(button.dataset.configTab || ""));
			});
			if (tabNav.dataset.restoredConfigTab) return;
			tabNav.dataset.restoredConfigTab = "1";
			try {
				switchConfigTab(localStorage.getItem("proxyConsoleConfigTab") || state.configTab || "models");
			} catch (_e) {}
			bindUsageStatisticsControls();
		}
		function switchStatisticsView(viewName, { persist = true } = {}) {
			if (!new Set(["usage", "models"]).has(viewName)) return;
			el("statisticsViewTabs")?.querySelectorAll("[data-statistics-view]").forEach((button) => {
				const active = button.dataset.statisticsView === viewName;
				button.classList.toggle("is-active", active);
				button.setAttribute("aria-selected", active ? "true" : "false");
				button.tabIndex = active ? 0 : -1;
			});
			document.querySelectorAll("[data-statistics-view-panel]").forEach((panel) => {
				panel.hidden = panel.dataset.statisticsViewPanel !== viewName;
			});
			state.statisticsView = viewName;
			if (persist) try {
				localStorage.setItem("proxyConsoleStatisticsView", viewName);
			} catch (_e) {}
			if (state.configTab !== "models") return;
			if (viewName === "models") loadModelUsage();
			else loadUsageStatistics();
		}
		var SETTINGS_TABS = new Set([
			"keys",
			"pricing",
			"ops"
		]);
		var _settingsPricingLoadInFlight = false;
		var _clientKeysLoadInFlight = false;
		function switchSettingsTab(tabName, { persist = true } = {}) {
			if (!SETTINGS_TABS.has(tabName)) return;
			el("settingsTabNav")?.querySelectorAll("[data-settings-tab]").forEach((button) => {
				const active = button.dataset.settingsTab === tabName;
				button.classList.toggle("is-active", active);
				button.setAttribute("aria-selected", active ? "true" : "false");
				button.tabIndex = active ? 0 : -1;
			});
			document.querySelectorAll("[data-settings-tab-panel]").forEach((panel) => {
				panel.hidden = panel.dataset.settingsTabPanel !== tabName;
			});
			state.settingsTab = tabName;
			if (persist) try {
				localStorage.setItem("proxyConsoleSettingsTab", tabName);
			} catch (_e) {}
			loadSettingsTabData(tabName);
		}
		function bindSettingsTabs() {
			const nav = el("settingsTabNav");
			if (!nav) return;
			nav.querySelectorAll("[data-settings-tab]").forEach((button) => {
				if (button.dataset.boundSettingsTab) return;
				button.dataset.boundSettingsTab = "1";
				button.addEventListener("click", () => switchSettingsTab(button.dataset.settingsTab || "keys"));
			});
			const createButton = el("settingsCreateKeyButton");
			if (createButton && !createButton.dataset.boundSettingsCreateKey) {
				createButton.dataset.boundSettingsCreateKey = "1";
				createButton.addEventListener("click", () => openKeyDrawer("new"));
			}
			const closeButton = el("closeKeyDrawerButton");
			if (closeButton && !closeButton.dataset.boundSettingsKeyDrawerClose) {
				closeButton.dataset.boundSettingsKeyDrawerClose = "1";
				closeButton.addEventListener("click", closeKeyDrawer);
			}
			const refreshButton = el("settingsPricingRefresh");
			if (refreshButton && !refreshButton.dataset.boundSettingsPricingRefresh) {
				refreshButton.dataset.boundSettingsPricingRefresh = "1";
				refreshButton.addEventListener("click", () => {
					state.data.pricingCatalog = null;
					state.settingsPricingPage = 0;
					loadSettingsPricingCatalog();
				});
			}
			const fetchButton = el("settingsPricingFetch");
			if (fetchButton && !fetchButton.dataset.boundSettingsPricingFetch) {
				fetchButton.dataset.boundSettingsPricingFetch = "1";
				fetchButton.addEventListener("click", () => fetchSettingsPricingModel());
			}
			const fetchInput = el("settingsPricingFetchModel");
			if (fetchInput && !fetchInput.dataset.boundSettingsPricingFetchInput) {
				fetchInput.dataset.boundSettingsPricingFetchInput = "1";
				fetchInput.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						fetchSettingsPricingModel();
					}
				});
			}
			const queryInput = el("settingsPricingQuery");
			if (queryInput && !queryInput.dataset.boundSettingsPricingQuery) {
				queryInput.dataset.boundSettingsPricingQuery = "1";
				queryInput.addEventListener("input", () => {
					state.settingsPricingQuery = String(queryInput.value || "").trim().toLowerCase();
					state.settingsPricingPage = 0;
					renderSettingsPricingCatalog();
				});
			}
			if (nav.dataset.restoredSettingsTab) return;
			if (!state.adminKey) return;
			nav.dataset.restoredSettingsTab = "1";
			document.addEventListener("keydown", (event) => {
				if (event.key === "Escape" && el("keyDrawer")?.classList.contains("is-open")) closeKeyDrawer();
			});
			let restored = state.settingsTab || "keys";
			try {
				restored = localStorage.getItem("proxyConsoleSettingsTab") || restored;
			} catch (_e) {}
			switchSettingsTab(restored, { persist: false });
		}
		function loadSettingsTabData(tabName) {
			if (tabName === "keys") loadClientKeys();
			else if (tabName === "pricing") loadSettingsPricingCatalog();
		}
		function renderSettings() {
			renderSettingsKeys();
			renderSettingsPricing();
			renderSettingsOps();
			renderKeyDrawer();
		}
		async function loadClientKeys() {
			if (_clientKeysLoadInFlight || state.clientKeysAvailable === true) return;
			_clientKeysLoadInFlight = true;
			try {
				const data = await apiGet("/-/admin/client-keys");
				state.data.clientKeys = Array.isArray(data?.keys) ? data.keys : [];
				state.clientKeysAvailable = true;
			} catch (err) {
				state.data.clientKeys = [];
				state.clientKeysAvailable = false;
				setNotice(`client-keys load failed: ${err && err.message ? err.message : err}`, "bad", {
					key: "settings:keys-load",
					sticky: true
				});
			} finally {
				_clientKeysLoadInFlight = false;
				if (state.view === "settings") renderSettingsKeys();
			}
		}
		async function refreshClientKeys() {
			state.data.clientKeys = null;
			state.clientKeysAvailable = null;
			loadClientKeys();
		}
		function renderSettingsKeys() {
			const target = el("settingsKeysTable");
			if (!target) return;
			const countBadge = el("settingsKeysCountBadge");
			if (countBadge) {
				const showCount = state.clientKeysAvailable === true;
				countBadge.hidden = !showCount;
				countBadge.textContent = showCount ? t("settings.keys.count_badge", { count: (state.data.clientKeys || []).length }) : "";
			}
			if (state.clientKeysAvailable === null) {
				updateDOM(target, `<div class="empty pad">${escapeHtml(t("model_usage.loading"))}</div>`);
				return;
			}
			if (state.clientKeysAvailable === false) {
				updateDOM(target, `
        <div class="usage-statistics-empty-state">
          ${iconSvg("key-round")}
          <span>
            <strong>${escapeHtml(t("settings.keys.pending_title"))}</strong>
            <small>${escapeHtml(t("settings.keys.pending_hint"))}</small>
          </span>
        </div>`);
				return;
			}
			const keys = state.data.clientKeys || [];
			if (!keys.length) {
				updateDOM(target, `
        <div class="usage-statistics-empty-state">
          ${iconSvg("key")}
          <span>
            <strong>${escapeHtml(t("settings.keys.empty_title"))}</strong>
            <small>${escapeHtml(t("settings.keys.empty_hint"))}</small>
          </span>
        </div>`);
				return;
			}
			updateDOM(target, `
      <table class="data-table settings-keys-table">
        <thead><tr>
          <th>${escapeHtml(t("settings.keys.col_name"))}</th>
          <th>${escapeHtml(t("settings.keys.col_key"))}</th>
          <th>${escapeHtml(t("settings.keys.col_quota"))}</th>
          <th>${escapeHtml(t("settings.keys.col_models"))}</th>
          <th>${escapeHtml(t("settings.keys.col_rpm"))}</th>
          <th>${escapeHtml(t("settings.keys.col_status"))}</th>
          <th></th>
        </tr></thead>
        <tbody>${keys.map(settingsKeyRow).join("")}</tbody>
      </table>`);
			bindSettingsKeyRows(target);
		}
		function settingsKeyRow(key) {
			const entry = key || {};
			const name = entry.name || entry.label || `#${entry.id ?? "-"}`;
			const masked = entry.masked || "-";
			const quota = Number(entry.quota_tokens || 0);
			const consumed = Number(entry.consumed_tokens || 0);
			const quotaText = quota > 0 ? `${fmtTokenCount(consumed)} / ${fmtTokenCount(quota)} (${Math.min(100, Math.round(consumed / quota * 100))}%)` : `${fmtTokenCount(consumed)} / ∞`;
			const quotaPct = quota > 0 ? Math.min(100, consumed / quota * 100) : 0;
			const quotaTone = quota > 0 && quotaPct >= 100 ? "is-bad" : quota > 0 && quotaPct >= 80 ? "is-warn" : "";
			const rpm = entry.rpm;
			const models = entry.models === "*" || !entry.models ? t("settings.keys.f_models_all") : Array.isArray(entry.models) ? entry.models.join(", ") : String(entry.models);
			const expired = Boolean(entry.expired);
			const status = entry.enabled === false ? `<span class="badge">${escapeHtml(t("settings.keys.status_disabled"))}</span>` : expired ? `<span class="badge">${escapeHtml(t("settings.keys.status_expired"))}</span>` : `<span class="badge ok">${escapeHtml(t("settings.keys.status_active"))}</span>`;
			const hasFullKey = Boolean(entry.full_key);
			const copyAttrs = hasFullKey ? `data-copy-key="${escapeHtml(entry.full_key)}"` : `data-copy-masked-key="1"`;
			const copyTip = hasFullKey ? t("settings.keys.copy") : t("settings.keys.copy_masked_tip");
			return `
      <tr>
        <td>
          <span class="settings-model-identity"><span class="settings-key-glyph">${iconSvg("key-round")}</span><strong>${escapeHtml(name)}</strong></span>
          <div class="settings-key-meta mono">${escapeHtml(String(entry.requests_total ?? 0))} req · ${escapeHtml(fmtCost(entry.cost_usd || 0))}</div>
        </td>
        <td>
          <span class="key-snippet-box mono">${escapeHtml(masked)}
            <button class="key-snippet-btn" type="button" ${copyAttrs} title="${escapeHtml(copyTip)}" aria-label="${escapeHtml(copyTip)}">${iconSvg("copy")}</button>
          </span>
        </td>
        <td style="min-width: 170px;">
          <div style="display:flex; justify-content:space-between; font-size:11.5px; font-family:var(--mono);">
            <strong>${escapeHtml(quotaText.split(" (")[0])}</strong>${quota > 0 ? `<span style="color:var(--muted);">(${escapeHtml(quotaText.match(/\((\d+%)\)$/)?.[1] || "")})</span>` : ""}
          </div>
          <div class="settings-quota-track">
            <div class="settings-quota-fill ${quotaTone}" style="width:${quota > 0 ? quotaPct : 0}%;"></div>
          </div>
        </td>
        <td>${escapeHtml(models)}</td>
        <td class="mono">${rpm ? `${escapeHtml(String(rpm))} RPM` : "—"}</td>
        <td>${status}</td>
        <td class="cell-actions">
          <button class="button secondary" type="button" data-edit-key-id="${escapeHtml(String(entry.id ?? ""))}">${escapeHtml(t("settings.keys.edit"))}</button>
          <button class="button secondary" type="button" data-reset-key-id="${escapeHtml(String(entry.id ?? ""))}" title="${escapeHtml(t("settings.keys.reset_usage"))}">${iconSvg("rotate")}</button>
          <button class="button secondary settings-danger-btn" type="button" data-delete-key-id="${escapeHtml(String(entry.id ?? ""))}" title="${escapeHtml(t("settings.keys.delete"))}">${iconSvg("trash")}</button>
        </td>
      </tr>`;
		}
		function bindSettingsKeyRows(target) {
			target.querySelectorAll("[data-copy-masked-key]").forEach((button) => {
				if (button.dataset.boundSettingsCopyMaskedKey) return;
				button.dataset.boundSettingsCopyMaskedKey = "1";
				button.addEventListener("click", () => {
					setNotice(t("settings.keys.copy_masked_notice"), "info");
				});
			});
			target.querySelectorAll("[data-copy-key]").forEach((button) => {
				if (button.dataset.boundSettingsCopyKey) return;
				button.dataset.boundSettingsCopyKey = "1";
				button.addEventListener("click", async () => {
					const value = button.dataset.copyKey || "";
					try {
						await navigator.clipboard.writeText(value);
						setNotice(t("settings.keys.copied"), "ok");
					} catch (_e) {
						setNotice(value, "info");
					}
				});
			});
			target.querySelectorAll("[data-edit-key-id]").forEach((button) => {
				if (button.dataset.boundSettingsEditKey) return;
				button.dataset.boundSettingsEditKey = "1";
				button.addEventListener("click", () => {
					openKeyDrawer("edit", (state.data.clientKeys || []).find((item) => String(item.id) === button.dataset.editKeyId));
				});
			});
			target.querySelectorAll("[data-reset-key-id]").forEach((button) => {
				if (button.dataset.boundSettingsResetKey) return;
				button.dataset.boundSettingsResetKey = "1";
				button.addEventListener("click", async () => {
					button.disabled = true;
					try {
						await apiPost(`/-/admin/client-keys/${encodeURIComponent(button.dataset.resetKeyId)}/reset-usage`);
						setNotice(t("settings.keys.reset_done"), "ok");
						refreshClientKeys();
					} catch (err) {
						button.disabled = false;
						setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
					}
				});
			});
			target.querySelectorAll("[data-delete-key-id]").forEach((button) => {
				if (button.dataset.boundSettingsDeleteKey) return;
				button.dataset.boundSettingsDeleteKey = "1";
				button.addEventListener("click", async () => {
					const record = (state.data.clientKeys || []).find((item) => String(item.id) === button.dataset.deleteKeyId);
					if (!await openConfirmDialog({
						title: t("settings.keys.delete_confirm_title"),
						message: t("settings.keys.delete_confirm_msg", { name: record?.name || `#${button.dataset.deleteKeyId}` }),
						acceptLabel: t("settings.keys.delete")
					})) return;
					button.disabled = true;
					try {
						await apiPost(`/-/admin/client-keys/${encodeURIComponent(button.dataset.deleteKeyId)}/delete`);
						setNotice(t("settings.keys.deleted"), "ok");
						refreshClientKeys();
					} catch (err) {
						button.disabled = false;
						setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
					}
				});
			});
		}
		async function loadSettingsPricingCatalog() {
			if (_settingsPricingLoadInFlight) return;
			if (state.data.pricingCatalog) {
				renderSettingsPricingCatalog();
				return;
			}
			_settingsPricingLoadInFlight = true;
			state.settingsPricingLoading = true;
			renderSettingsPricingCatalog();
			try {
				const pricing = (await apiGet("/-/admin/model-pricing") || {}).pricing || {};
				state.data.pricingCatalog = Object.entries(pricing).filter(([, value]) => value && value.available).map(([name, value]) => ({
					name,
					input: value.input,
					output: value.output,
					cache_hit: value.cache_hit ?? value.cache_read_per_million
				})).sort((a, b) => String(a.name).localeCompare(String(b.name)));
			} catch (_err) {} finally {
				state.settingsPricingLoading = false;
				_settingsPricingLoadInFlight = false;
				if (state.view === "settings") renderSettingsPricingCatalog();
			}
		}
		function settingsPricingOverrides() {
			return ((state.data.config || {}).models || {}).pricing_overrides || {};
		}
		function renderSettingsPricing() {
			renderSettingsPricingCatalog();
		}
		function settingsPriceText(value) {
			const num = Number(value);
			if (!Number.isFinite(num)) return "—";
			return String(Number(num.toFixed(4)));
		}
		async function saveSettingsPricingOverride(model, button) {
			const inputs = document.querySelectorAll(`[data-override-model="${CSS.escape(model)}"]`);
			const patch = { model };
			let hasRate = false;
			inputs.forEach((input) => {
				const field = input.dataset.overrideField;
				const raw = String(input.value || "").trim();
				if (raw === "") return;
				const value = Number(raw);
				if (!Number.isFinite(value) || value < 0) return;
				patch[field] = value;
				hasRate = true;
			});
			if (!hasRate) {
				setNotice(t("settings.pricing.override_empty"), "bad");
				return;
			}
			button.disabled = true;
			try {
				applyMutationResult(await apiPatch("/-/admin/models/pricing", patch));
				setNotice(t("settings.pricing.override_saved", { model }), "ok");
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
			} catch (err) {
				setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
			} finally {
				button.disabled = false;
			}
		}
		async function clearSettingsPricingOverride(model, button) {
			button.disabled = true;
			try {
				applyMutationResult(await apiPost("/-/admin/models/pricing/delete", { model }));
				setNotice(t("settings.pricing.override_cleared", { model }), "ok");
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
			} catch (err) {
				setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
			} finally {
				button.disabled = false;
			}
		}
		async function fetchSettingsPricingModel() {
			const input = el("settingsPricingFetchModel");
			const button = el("settingsPricingFetch");
			const model = String(input?.value || "").trim();
			if (!model) {
				input?.focus();
				return;
			}
			button.disabled = true;
			const label = button.textContent;
			button.textContent = t("settings.pricing.fetching");
			try {
				const response = await apiGet(`/-/admin/model-summary/${encodeURIComponent(model)}?refresh=true`);
				const pricing = response?.summary?.pricing || response?.pricing || {};
				const resolvedName = String(response?.model || response?.summary?.name || model);
				if (pricing.input != null || pricing.output != null) setNotice(t("settings.pricing.fetched", {
					model: resolvedName,
					input: settingsPriceText(pricing.input),
					output: settingsPriceText(pricing.output)
				}), "ok");
				else setNotice(t("settings.pricing.fetched_no_price", { model: resolvedName }), "bad");
				state.data.pricingCatalog = null;
				state.settingsPricingPage = 0;
				state.settingsPricingQuery = resolvedName.toLowerCase();
				const filterInput = el("settingsPricingQuery");
				if (filterInput) filterInput.value = resolvedName;
				await loadSettingsPricingCatalog();
			} catch (err) {
				setNotice(t("settings.pricing.fetch_failed", {
					model,
					error: err.message
				}), "bad");
			} finally {
				button.disabled = false;
				button.textContent = label;
			}
		}
		function renderSettingsPricingCatalog() {
			const target = el("settingsPricingCatalog");
			const paginationTarget = el("settingsPricingPagination");
			if (!target) return;
			bindSettingsPricingPagination(paginationTarget);
			if (state.settingsPricingLoading || state.data.pricingCatalog === null) {
				updateDOM(target, `<div class="empty pad">${escapeHtml(t("model_usage.loading"))}</div>`);
				updateDOM(paginationTarget, "");
				return;
			}
			const catalog = [...state.data.pricingCatalog || []];
			const overrides = settingsPricingOverrides();
			const catalogNames = new Set(catalog.map((item) => String(item.name).toLowerCase()));
			Object.keys(overrides).forEach((model) => {
				if (overrides[model] && typeof overrides[model] === "object" && !catalogNames.has(String(model).toLowerCase())) catalog.push({
					name: model,
					input: null,
					output: null,
					cache_hit: null,
					manualOnly: true
				});
			});
			const query = state.settingsPricingQuery;
			if (!catalog.length) {
				updateDOM(target, `
        <div class="usage-statistics-empty-state">
          ${iconSvg("dollar")}
          <span><strong>${escapeHtml(t("settings.pricing.catalog_empty"))}</strong></span>
        </div>`);
				updateDOM(paginationTarget, "");
				return;
			}
			const filtered = query ? catalog.filter((item) => String(item.name).toLowerCase().includes(query)) : catalog;
			const total = filtered.length;
			const pages = Math.max(1, Math.ceil(total / 10));
			const page = Math.min(pages, Math.max(1, Number(state.settingsPricingPage || 0) + 1));
			state.settingsPricingPage = page - 1;
			const offset = (page - 1) * 10;
			const rows = filtered.slice(offset, offset + 10);
			const pagination = pages <= 1 ? "" : `
      <div class="request-pagination" aria-label="${escapeHtml(t("req.request_pages"))}">
        <button class="button secondary icon-action" type="button" data-settings-pricing-page="${page - 2}" data-tip="${escapeHtml(t("req.previous_page"))}" aria-label="${escapeHtml(t("req.previous_page"))}" ${page <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
        <span class="request-page-indicator">${escapeHtml(t("usage_stats.page_of", {
				page: fmtInt(page),
				total: fmtInt(pages)
			}))}</span>
        <button class="button secondary icon-action" type="button" data-settings-pricing-page="${page}" data-tip="${escapeHtml(t("req.next_page"))}" aria-label="${escapeHtml(t("req.next_page"))}" ${page >= pages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
      </div>`;
			const overrideFor = (name) => {
				const lowered = String(name).toLowerCase();
				return Object.entries(overrides).find(([key]) => String(key).toLowerCase() === lowered)?.[1] || null;
			};
			updateDOM(target, `
      <table class="data-table settings-pricing-table">
        <thead><tr>
          <th>${escapeHtml(t("settings.pricing.col_model"))}</th>
          <th class="num">${escapeHtml(t("settings.pricing.col_input"))}</th>
          <th class="num">${escapeHtml(t("settings.pricing.col_output"))}</th>
          <th class="num">${escapeHtml(t("settings.pricing.col_cache_read"))}</th>
          <th class="num">${escapeHtml(t("settings.pricing.col_override_in"))}</th>
          <th class="num">${escapeHtml(t("settings.pricing.col_override_out"))}</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map((item) => {
				const ov = overrideFor(item.name) || {};
				const hasOverride = !!overrideFor(item.name);
				return `
            <tr class="${hasOverride ? "settings-pricing-overridden" : ""}">
              <td class="mono"><span class="settings-model-identity">${modelBrandIconMarkup(item.name, iconSvg("boxes"))}<strong>${escapeHtml(item.name)}</strong>${hasOverride ? badge(t("settings.pricing.override_badge"), "info") : ""}${item.manualOnly ? badge(t("settings.pricing.manual_only"), "warn") : ""}</span></td>
              <td class="num mono">${escapeHtml(settingsPriceText(item.input))}</td>
              <td class="num mono">${escapeHtml(settingsPriceText(item.output))}</td>
              <td class="num mono">${escapeHtml(settingsPriceText(item.cache_hit))}</td>
              <td class="num"><input class="settings-price-input mono" type="number" step="any" min="0" value="${ov.input ?? ""}" data-override-model="${escapeHtml(item.name)}" data-override-field="input" aria-label="${escapeHtml(item.name)} override input" placeholder="—" /></td>
              <td class="num"><input class="settings-price-input mono" type="number" step="any" min="0" value="${ov.output ?? ""}" data-override-model="${escapeHtml(item.name)}" data-override-field="output" aria-label="${escapeHtml(item.name)} override output" placeholder="—" /></td>
              <td class="cell-actions">
                <button class="button secondary compact-action" type="button" data-override-save="${escapeHtml(item.name)}">${escapeHtml(t("settings.pricing.save"))}</button>
                ${hasOverride ? `<button class="button danger compact-action" type="button" data-override-clear="${escapeHtml(item.name)}">${escapeHtml(t("settings.pricing.clear"))}</button>` : ""}
              </td>
            </tr>`;
			}).join("")}
        </tbody>
      </table>`);
			updateDOM(paginationTarget, pagination);
			target.querySelectorAll("[data-override-save]").forEach((button) => {
				if (button.dataset.boundOverrideSave) return;
				button.dataset.boundOverrideSave = "1";
				button.addEventListener("click", () => saveSettingsPricingOverride(button.dataset.overrideSave || "", button));
			});
			target.querySelectorAll("[data-override-clear]").forEach((button) => {
				if (button.dataset.boundOverrideClear) return;
				button.dataset.boundOverrideClear = "1";
				button.addEventListener("click", () => clearSettingsPricingOverride(button.dataset.overrideClear || "", button));
			});
		}
		function bindSettingsPricingPagination(target) {
			if (!target || target.dataset.boundSettingsPricingPagination) return;
			target.dataset.boundSettingsPricingPagination = "1";
			target.addEventListener("click", (event) => {
				const button = event.target.closest?.("[data-settings-pricing-page]");
				if (!button || !target.contains(button) || button.disabled) return;
				state.settingsPricingPage = Math.max(0, Number(button.dataset.settingsPricingPage || 0));
				renderSettingsPricingCatalog();
			});
		}
		function settingsProxyToString(proxy) {
			if (!proxy) return "";
			if (typeof proxy === "string") return proxy;
			return proxy.http || proxy.https || "";
		}
		function renderSettingsOps() {
			const target = el("settingsOpsGrid");
			if (!target) return;
			if (shouldPreserveContainer("#settingsOpsGrid")) return;
			const config = state.data.config || {};
			updateDOM(target, `
      ${settingsOpsProxyCard(config.proxy)}
      ${settingsOpsRuntimeCard(config.routing, config.server)}
      ${settingsOpsOverlayCard(config)}
      ${settingsOpsSecurityCard(config.server)}
    `);
			bindSettingsOpsForms(target);
		}
		function settingsOpsCardShell(titleKey, icon, descKey, body, modifier) {
			return `
      <section class="panel settings-ops-card settings-ops-card--${modifier}">
        <div class="panel-head">
          <div>
            <h3>${iconSvg(icon)}<span>${escapeHtml(t(titleKey))}</span></h3>
            <p>${escapeHtml(t(descKey))}</p>
          </div>
        </div>
        <div class="settings-ops-body">${body}</div>
      </section>`;
		}
		function settingsOpsProxyCard(proxy) {
			return settingsOpsCardShell("settings.ops.proxy_title", "radar", "settings.ops.proxy_desc", `
      <form id="settingsOpsProxyForm" class="settings-ops-form">
        <label class="field">
          <span>${escapeHtml(t("settings.ops.proxy_field"))}</span>
          <input class="control mono" name="proxy" type="text" value="${escapeHtml(settingsProxyToString(proxy))}" placeholder="http://127.0.0.1:10808" />
          <small>${escapeHtml(t("settings.ops.proxy_hint"))}</small>
        </label>
        <div class="settings-ops-form-actions">
          <button class="button primary" type="submit">${escapeHtml(t("settings.ops.save"))}</button>
        </div>
      </form>`, "proxy");
		}
		function settingsOpsRuntimeCard(routing, server) {
			routing = routing || {};
			const numberField = (name, labelKey, value) => `
      <label class="field">
        <span>${escapeHtml(t(labelKey))}</span>
        <input class="control mono" name="${name}" type="number" min="0" step="1" value="${escapeHtml(String(value ?? 0))}" />
      </label>`;
			return settingsOpsCardShell("settings.ops.runtime_title", "zap", "settings.ops.runtime_desc", `
      <div class="settings-kv-list">
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.max_workers"))}</span><strong class="mono">${escapeHtml(String((server || {}).max_workers ?? "—"))}</strong></div>
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.stream_mode"))}</span><strong class="mono">${escapeHtml(String(routing.native_stream_mode || "—"))}</strong></div>
      </div>
      <form id="settingsOpsRuntimeForm" class="settings-ops-form">
        <div class="settings-ops-field-grid">
          ${numberField("max_attempts", "settings.ops.max_attempts", routing.max_attempts)}
          ${numberField("connect_timeout_s", "settings.ops.connect_timeout", routing.connect_timeout_s)}
          ${numberField("read_timeout_s", "settings.ops.read_timeout", routing.read_timeout_s)}
          ${numberField("first_token_timeout_s", "settings.ops.first_token_timeout", routing.first_token_timeout_s)}
          ${numberField("agent_first_event_timeout_s", "settings.ops.agent_timeout", routing.agent_first_event_timeout_s)}
        </div>
        <div class="settings-ops-form-actions">
          <button class="button primary" type="submit">${escapeHtml(t("settings.ops.save"))}</button>
        </div>
      </form>`, "runtime");
		}
		function settingsOpsOverlayCard(config) {
			const revision = Number(config.revision ?? 0);
			const epoch = Number(config.revision_epoch_ms || 0);
			const epochText = epoch ? new Date(epoch).toLocaleString() : "—";
			return settingsOpsCardShell("settings.ops.overlay_title", "layers", "settings.ops.overlay_desc", `
      <div class="settings-kv-list">
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.overlay_revision"))}</span><strong class="mono">#${fmtInt(revision)} · ${escapeHtml(epochText)}</strong></div>
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.overlay_state"))}</span><strong>${config.has_overlay ? escapeHtml(t("settings.ops.overlay_active")) : escapeHtml(t("settings.ops.overlay_empty"))}</strong></div>
      </div>
      <div class="settings-ops-actions">
        <button class="button secondary" type="button" data-settings-export>${escapeHtml(t("settings.ops.export"))}</button>
        <button class="button secondary settings-danger-btn" type="button" data-settings-reset>${escapeHtml(t("settings.ops.reset"))}</button>
      </div>`, "overlay");
		}
		function settingsOpsSecurityCard(server) {
			server = server || {};
			const cidrs = Array.isArray(server.trusted_proxy_cidrs) ? server.trusted_proxy_cidrs.join(", ") : "";
			const headers = Array.isArray(server.trusted_proxy_headers) ? server.trusted_proxy_headers.join(", ") : "";
			return settingsOpsCardShell("settings.ops.security_title", "shield", "settings.ops.security_desc", `
      <div class="settings-kv-list">
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.security_admin_key"))}</span><strong class="mono">${escapeHtml(server.admin_key || "—")}</strong></div>
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.security_trusted"))}</span><strong class="mono">${escapeHtml(cidrs || t("settings.ops.not_set"))}</strong></div>
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.security_headers"))}</span><strong class="mono">${escapeHtml(headers || t("settings.ops.not_set"))}</strong></div>
        <div class="settings-kv"><span>${escapeHtml(t("settings.ops.security_query_key"))}</span><strong>${server.allow_query_admin_key ? "On" : "Off"}</strong></div>
      </div>
      <p class="settings-ops-note">${escapeHtml(t("settings.ops.security_admin_key_hint"))}</p>`, "security");
		}
		function bindSettingsOpsForms(target) {
			const proxyForm = target.querySelector("#settingsOpsProxyForm");
			if (proxyForm && !proxyForm.dataset.boundSettingsOpsProxy) {
				proxyForm.dataset.boundSettingsOpsProxy = "1";
				proxyForm.addEventListener("submit", async (event) => {
					event.preventDefault();
					const proxy = String(proxyForm.elements.proxy.value || "").trim();
					await runConfigMutation(proxyForm, async () => {
						const result = await apiPatch("/-/admin/proxy", { proxy });
						setNotice(t("notice.global_proxy_updated"), "ok");
						return result;
					}, {
						resourceKey: "global-proxy",
						apply: (config) => {
							config.proxy = proxy;
						},
						drawer: false
					});
				});
			}
			const runtimeForm = target.querySelector("#settingsOpsRuntimeForm");
			if (runtimeForm && !runtimeForm.dataset.boundSettingsOpsRuntime) {
				runtimeForm.dataset.boundSettingsOpsRuntime = "1";
				runtimeForm.addEventListener("submit", async (event) => {
					event.preventDefault();
					const payload = {
						max_attempts: Number(runtimeForm.elements.max_attempts.value || 0),
						connect_timeout_s: Number(runtimeForm.elements.connect_timeout_s.value || 0),
						read_timeout_s: Number(runtimeForm.elements.read_timeout_s.value || 0),
						first_token_timeout_s: Number(runtimeForm.elements.first_token_timeout_s.value || 0),
						agent_first_event_timeout_s: Number(runtimeForm.elements.agent_first_event_timeout_s.value || 0)
					};
					await runConfigMutation(runtimeForm, async () => {
						const result = await apiPatch("/-/admin/routing", payload);
						setNotice(t("notice.routing_updated"), "ok");
						return result;
					}, {
						resourceKey: "routing",
						apply: (config) => {
							Object.assign(config.routing = config.routing || {}, payload);
						},
						drawer: false
					});
				});
			}
			target.querySelectorAll("[data-settings-export]").forEach((button) => {
				if (button.dataset.boundSettingsExport) return;
				button.dataset.boundSettingsExport = "1";
				button.addEventListener("click", exportSettingsConfig);
			});
			target.querySelectorAll("[data-settings-reset]").forEach((button) => {
				if (button.dataset.boundSettingsReset) return;
				button.dataset.boundSettingsReset = "1";
				button.addEventListener("click", () => resetSettingsOverlay(button));
			});
		}
		function exportSettingsConfig() {
			const config = state.data.config;
			if (!config) return;
			try {
				const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `proxy-config-rev${config.revision ?? 0}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
				document.body.appendChild(link);
				link.click();
				link.remove();
				URL.revokeObjectURL(url);
				setNotice(t("settings.ops.export_done"), "ok");
			} catch (_err) {
				setNotice(t("notice.config_update_failed", { error: "export failed" }), "bad");
			}
		}
		async function resetSettingsOverlay(button) {
			if (!await openConfirmDialog({
				title: t("settings.ops.reset_confirm_title"),
				message: t("settings.ops.reset_confirm_msg"),
				acceptLabel: t("settings.ops.reset")
			})) return;
			button.disabled = true;
			try {
				applyMutationResult(await apiPost("/-/admin/config/overlay/clear", { confirm: "clear_runtime_overlay" }));
				setNotice(t("settings.ops.reset_done"), "ok");
				renderAll();
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
			} catch (err) {
				setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
			} finally {
				button.disabled = false;
			}
		}
		function openKeyDrawer(mode, record = null) {
			state.settingsKeyDrawerMode = mode === "edit" ? "edit" : "new";
			state.settingsKeyEditId = mode === "edit" ? String(record?.id ?? "") : "";
			state.settingsKeyEditRecord = mode === "edit" ? record : null;
			state.settingsKeyCreated = null;
			clearDirty("#keyDrawerBody");
			const drawer = el("keyDrawer");
			drawer?.classList.add("is-open");
			drawer?.setAttribute("aria-hidden", "false");
			renderKeyDrawer({ force: true });
		}
		function closeKeyDrawer() {
			const drawer = el("keyDrawer");
			if (!drawer) return;
			drawer.classList.remove("is-open");
			drawer.setAttribute("aria-hidden", "true");
			state.settingsKeyDrawerMode = "";
			state.settingsKeyEditId = "";
			state.settingsKeyEditRecord = null;
			state.settingsKeyCreated = null;
			clearDirty("#keyDrawerBody");
		}
		function renderKeyDrawer({ force = false } = {}) {
			const drawer = el("keyDrawer");
			if (!drawer || !drawer.classList.contains("is-open")) return;
			const title = el("keyDrawerTitle");
			if (title) title.textContent = state.settingsKeyDrawerMode === "edit" ? t("settings.keys.drawer_title_edit") : t("settings.keys.drawer_title_new");
			const body = el("keyDrawerBody");
			if (!body) return;
			if (state.settingsKeyCreated) {
				const created = state.settingsKeyCreated;
				updateDOM(body, `
        <div class="settings-key-created">
          <div class="settings-key-created-head">
            <span class="settings-key-created-glyph">${iconSvg("check-circle")}</span>
            <div>
              <strong>${escapeHtml(t("settings.keys.created_title"))}</strong>
              <p class="settings-ops-desc">${escapeHtml(t("settings.keys.created_hint"))}</p>
            </div>
          </div>
          <div class="settings-created-key-box">
            <span class="mono">${escapeHtml(created.full_key)}</span>
            <button class="button secondary icon-action" type="button" data-copy-created-key="${escapeHtml(created.full_key)}" title="${escapeHtml(t("settings.keys.copy"))}" aria-label="${escapeHtml(t("settings.keys.copy"))}">${iconSvg("copy")}</button>
          </div>
          <p class="settings-ops-note">${escapeHtml(t("settings.keys.created_once_note"))}</p>
          <div class="drawer-actions">
            <button class="button secondary" type="button" data-key-drawer-create-another>${escapeHtml(t("settings.keys.created_close_note"))}</button>
            <button class="button primary" type="button" data-key-drawer-done>${escapeHtml(t("confirm.close"))}</button>
          </div>
        </div>`);
				body.querySelector("[data-copy-created-key]")?.addEventListener("click", async () => {
					try {
						await navigator.clipboard.writeText(created.full_key);
						setNotice(t("settings.keys.copied"), "ok");
					} catch (_e) {
						setNotice(created.full_key, "info");
					}
				});
				body.querySelector("[data-key-drawer-create-another]")?.addEventListener("click", () => {
					state.settingsKeyCreated = null;
					clearDirty("#keyDrawerBody");
					renderKeyDrawer({ force: true });
				});
				body.querySelector("[data-key-drawer-done]")?.addEventListener("click", () => {
					closeKeyDrawer();
					refreshClientKeys();
				});
				return;
			}
			if (!force && shouldPreserveContainer("#keyDrawerBody")) return;
			const editing = state.settingsKeyEditRecord || {};
			const modelsValue = editing.models === "*" || !editing.models ? "" : Array.isArray(editing.models) ? editing.models.join(", ") : String(editing.models);
			updateDOM(body, `
      <form id="settingsKeyForm" class="settings-key-form">
        <label class="field">
          <span>${escapeHtml(t("settings.keys.f_name"))}</span>
          <input class="control" name="name" type="text" required value="${escapeHtml(editing.name || "")}" placeholder="${escapeHtml(t("settings.keys.f_name_ph"))}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t("settings.keys.f_quota"))}</span>
          <input class="control mono" name="quota" type="text" value="${escapeHtml(editing.quota_tokens ? String(editing.quota_tokens) : "")}" placeholder="100M / 1.5B / 500000" />
          <small>${escapeHtml(t("settings.keys.f_quota_hint"))}</small>
        </label>
        <label class="field">
          <span>${escapeHtml(t("settings.keys.f_rpm"))}</span>
          <input class="control mono" name="rpm" type="number" min="0" value="${escapeHtml(String(editing.rpm ?? 60))}" />
        </label>
        <label class="field">
          <span>${escapeHtml(t("settings.keys.f_models"))}</span>
          <input class="control mono" name="models" type="text" value="${escapeHtml(modelsValue)}" placeholder="${escapeHtml(t("settings.keys.f_models_ph"))}" />
          <small>${escapeHtml(t("settings.keys.f_models_hint"))}</small>
        </label>
        <label class="field">
          <span>${escapeHtml(t("settings.keys.f_expires"))}</span>
          <select class="control" name="expires">
            <option value="never">${escapeHtml(t("settings.keys.f_expires_never"))}</option>
            <option value="30d">${escapeHtml(t("settings.keys.f_expires_30d"))}</option>
            <option value="90d">${escapeHtml(t("settings.keys.f_expires_90d"))}</option>
          </select>
        </label>
        <div class="drawer-actions">
          <button class="button secondary" type="button" data-key-drawer-cancel>${escapeHtml(t("settings.keys.cancel"))}</button>
          <button class="button primary" type="submit">${escapeHtml(state.settingsKeyDrawerMode === "edit" ? t("settings.ops.save") : t("settings.keys.submit"))}</button>
        </div>
      </form>`);
			const form = el("settingsKeyForm");
			if (form && !form.dataset.boundSettingsKeyForm) {
				form.dataset.boundSettingsKeyForm = "1";
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					if (state.settingsKeySubmitting) return;
					const modelsRaw = String(form.elements.models.value || "").trim();
					const payload = {
						name: String(form.elements.name.value || "").trim(),
						quota: String(form.elements.quota.value || "").trim(),
						rpm: Number(form.elements.rpm.value || 0),
						models: modelsRaw ? modelsRaw : "*",
						expires: form.elements.expires.value
					};
					if (!payload.name) return;
					const submitButton = form.querySelector("button[type=\"submit\"]");
					if (submitButton) submitButton.disabled = true;
					state.settingsKeySubmitting = true;
					try {
						if (state.settingsKeyDrawerMode === "edit" && state.settingsKeyEditId) {
							await apiPatch(`/-/admin/client-keys/${encodeURIComponent(state.settingsKeyEditId)}`, payload);
							setNotice(t("notice.saved"), "ok");
							closeKeyDrawer();
							refreshClientKeys();
						} else {
							const data = await apiPost("/-/admin/client-keys", payload);
							state.settingsKeyCreated = { full_key: String(data?.full_key || "") };
							setNotice(t("settings.keys.created_title"), "ok");
							clearDirty("#keyDrawerBody");
							renderKeyDrawer({ force: true });
							refreshClientKeys();
						}
					} catch (err) {
						setNotice(t("notice.config_update_failed", { error: err.message }), "bad");
						if (submitButton) submitButton.disabled = false;
					} finally {
						state.settingsKeySubmitting = false;
					}
				});
			}
			const cancelButton = body.querySelector("[data-key-drawer-cancel]");
			if (cancelButton && !cancelButton.dataset.boundSettingsKeyCancel) {
				cancelButton.dataset.boundSettingsKeyCancel = "1";
				cancelButton.addEventListener("click", closeKeyDrawer);
			}
		}
		function usageStatisticsCustomTimestamp(value, endOfDay = false) {
			const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
			if (!match) return 0;
			const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
			const timestamp = Math.floor(date.getTime() / 1e3);
			return Number.isFinite(timestamp) ? timestamp : 0;
		}
		function bindHorizontalSelectorKeys(root, selector) {
			if (!root || root.dataset.boundHorizontalSelectorKeys) return;
			root.dataset.boundHorizontalSelectorKeys = "1";
			root.addEventListener("keydown", (event) => {
				if (![
					"ArrowLeft",
					"ArrowRight",
					"Home",
					"End"
				].includes(event.key)) return;
				const buttons = Array.from(root.querySelectorAll(selector)).filter((button) => !button.disabled);
				const current = buttons.indexOf(document.activeElement);
				if (!buttons.length || current < 0) return;
				event.preventDefault();
				let next = current;
				if (event.key === "Home") next = 0;
				else if (event.key === "End") next = buttons.length - 1;
				else if (event.key === "ArrowRight") next = (current + 1) % buttons.length;
				else next = (current - 1 + buttons.length) % buttons.length;
				buttons[next].focus();
				buttons[next].click();
			});
		}
		function bindUsageStatisticsControls() {
			const tabs = el("statisticsViewTabs");
			bindHorizontalSelectorKeys(tabs, "[data-statistics-view]");
			tabs?.querySelectorAll("[data-statistics-view]").forEach((button) => {
				if (button.dataset.boundStatisticsView) return;
				button.dataset.boundStatisticsView = "1";
				button.addEventListener("click", () => switchStatisticsView(button.dataset.statisticsView || "usage"));
			});
			if (tabs && !tabs.dataset.restoredStatisticsView) {
				tabs.dataset.restoredStatisticsView = "1";
				let saved = state.statisticsView || "usage";
				try {
					saved = localStorage.getItem("proxyConsoleStatisticsView") || saved;
				} catch (_e) {}
				switchStatisticsView(saved, { persist: false });
			}
			const range = el("usageStatisticsRange");
			bindHorizontalSelectorKeys(range, "[data-usage-statistics-range]");
			if (range && !range.dataset.boundUsageStatisticsRange) {
				range.dataset.boundUsageStatisticsRange = "1";
				range.addEventListener("click", (event) => {
					const button = event.target.closest("[data-usage-statistics-range]");
					if (!button) return;
					state.usageStatisticsRange = button.dataset.usageStatisticsRange || "all";
					state.usageStatisticsBreakdownPage = 0;
					range.querySelectorAll("[data-usage-statistics-range]").forEach((item) => {
						const active = item === button;
						item.classList.toggle("is-active", active);
						item.setAttribute("aria-pressed", active ? "true" : "false");
					});
					const custom = el("usageStatisticsCustomRange");
					if (custom) custom.hidden = state.usageStatisticsRange !== "custom";
					if (state.usageStatisticsRange !== "custom") loadUsageStatistics({ force: true });
				});
			}
			const metric = el("usageStatisticsMetric");
			bindHorizontalSelectorKeys(metric, "[data-usage-statistics-metric]");
			if (metric && !metric.dataset.boundUsageStatisticsMetric) {
				metric.dataset.boundUsageStatisticsMetric = "1";
				metric.addEventListener("click", (event) => {
					const button = event.target.closest("[data-usage-statistics-metric]");
					if (!button) return;
					state.usageStatisticsMetric = button.dataset.usageStatisticsMetric || "tokens";
					state.usageStatisticsBreakdownSort = state.usageStatisticsMetric === "requests" ? "requests" : state.usageStatisticsMetric === "latency" ? "latency" : state.usageStatisticsMetric;
					state.usageStatisticsBreakdownPage = 0;
					metric.querySelectorAll("[data-usage-statistics-metric]").forEach((item) => {
						const active = item === button;
						item.classList.toggle("is-active", active);
						item.setAttribute("aria-pressed", active ? "true" : "false");
					});
					loadUsageStatistics({ force: true });
				});
			}
			const breakdown = el("usageStatisticsBreakdownMode");
			bindHorizontalSelectorKeys(breakdown, "[data-usage-statistics-breakdown]");
			if (breakdown && !breakdown.dataset.boundUsageStatisticsBreakdown) {
				breakdown.dataset.boundUsageStatisticsBreakdown = "1";
				breakdown.addEventListener("click", (event) => {
					const button = event.target.closest("[data-usage-statistics-breakdown]");
					if (!button) return;
					state.usageStatisticsBreakdown = button.dataset.usageStatisticsBreakdown || "model";
					state.usageStatisticsBreakdownPage = 0;
					breakdown.querySelectorAll("[data-usage-statistics-breakdown]").forEach((item) => {
						const active = item === button;
						item.classList.toggle("is-active", active);
						item.setAttribute("aria-pressed", active ? "true" : "false");
					});
					loadUsageStatistics({ force: true });
				});
			}
			document.querySelectorAll("[data-usage-statistics-filter]").forEach((select) => {
				if (select.dataset.boundUsageStatisticsFilter) return;
				select.dataset.boundUsageStatisticsFilter = "1";
				select.addEventListener("change", () => {
					const key = select.dataset.usageStatisticsFilter;
					if (!key) return;
					state.usageStatisticsFilters[key] = select.value || "";
					state.usageStatisticsBreakdownPage = 0;
					loadUsageStatistics({ force: true });
				});
			});
			const refresh = el("usageStatisticsRefresh");
			if (refresh && !refresh.dataset.boundUsageStatisticsRefresh) {
				refresh.dataset.boundUsageStatisticsRefresh = "1";
				refresh.addEventListener("click", () => loadUsageStatistics({
					force: true,
					includeDimensions: true
				}));
			}
			const applyCustom = el("usageStatisticsApplyCustom");
			if (applyCustom && !applyCustom.dataset.boundUsageStatisticsCustom) {
				applyCustom.dataset.boundUsageStatisticsCustom = "1";
				applyCustom.addEventListener("click", () => {
					const startValue = el("usageStatisticsStart")?.value || "";
					const endValue = el("usageStatisticsEnd")?.value || "";
					const start = usageStatisticsCustomTimestamp(startValue);
					const end = usageStatisticsCustomTimestamp(endValue, true);
					if (!start || !end || start >= end) {
						setNotice(t("usage_stats.invalid_custom_range"), "bad");
						return;
					}
					state.usageStatisticsCustomStart = startValue;
					state.usageStatisticsCustomEnd = endValue;
					state.usageStatisticsBreakdownPage = 0;
					loadUsageStatistics({ force: true });
				});
			}
			const clear = el("usageStatisticsClear");
			if (clear && !clear.dataset.boundUsageStatisticsClear) {
				clear.dataset.boundUsageStatisticsClear = "1";
				clear.addEventListener("click", async () => {
					if (!await openConfirmDialog({
						title: t("usage_stats.clear_confirm_title"),
						message: t("usage_stats.clear_confirm_message"),
						acceptLabel: t("confirm.clear")
					})) return;
					clear.disabled = true;
					try {
						await apiPost("/-/admin/usage-statistics/clear", { confirm: "clear_usage_statistics" });
						state.data.usageStatistics = null;
						state.data.usageStatisticsDimensions = null;
						state.usageStatisticsBreakdownPage = 0;
						setNotice(t("usage_stats.clear_done"), "ok");
						await loadUsageStatistics({
							force: true,
							includeDimensions: true
						});
					} catch (err) {
						setNotice(t("usage_stats.clear_failed", { error: err.message }), "bad");
					} finally {
						clear.disabled = false;
					}
				});
			}
		}
		async function handleProxyTestRequest(button) {
			if (state.staticDataState !== "ready") {
				setNotice(t("notice.config_loading"), "info");
				return;
			}
			const input = (button.closest(".proxy-control-row") || button.parentElement)?.querySelector?.("input[name='proxy'], input[name='key_proxy']");
			const proxy = String(input?.value || "").trim();
			if (!proxy) {
				button.classList.remove("is-ok", "is-bad", "is-testing");
				setNotice(t("notice.proxy_empty"), "info");
				return;
			}
			await runExclusiveUiAction(`proxy-test:${proxy}`, async () => {
				button.disabled = true;
				button.classList.remove("is-ok", "is-bad");
				button.classList.add("is-testing");
				updateDOM(button, refreshSpinner());
				try {
					const result = (await apiPost("/-/admin/proxy/test", { proxy })).result || {};
					button.classList.toggle("is-ok", Boolean(result.ok));
					button.classList.toggle("is-bad", !result.ok);
					updateDOM(button, iconSvg(result.ok ? "check" : "alert"));
					if (result.ok) setNotice(t("notice.proxy_connected", { latency: fmtCompactMs(result.elapsed_ms || 0) }), "ok");
					else setNotice(t("notice.proxy_failed", { detail: result.error || `HTTP ${result.status || "-"}` }));
				} catch (err) {
					button.classList.add("is-bad");
					updateDOM(button, iconSvg("alert"));
					setNotice(t("notice.proxy_failed", { detail: err.message }));
				} finally {
					button.classList.remove("is-testing");
					button.disabled = false;
				}
			}, { duplicateNotice: t("notice.action_already_running") });
		}
		function bindProxyTestButtons(root = document) {
			root.querySelectorAll("[data-proxy-test]").forEach((button) => {
				if (!button.innerHTML.trim()) updateDOM(button, iconSvg("activity"));
				const configReady = state.staticDataState === "ready";
				button.disabled = !configReady;
				button.classList.toggle("is-waiting-config", !configReady);
			});
			const modelUsageRange = el("modelUsageRange");
			if (modelUsageRange && !modelUsageRange.dataset.boundModelUsageRange) {
				modelUsageRange.dataset.boundModelUsageRange = "1";
				modelUsageRange.addEventListener("click", (event) => {
					const button = event.target.closest("[data-model-usage-range]");
					if (!button) return;
					state.modelUsageRange = button.dataset.modelUsageRange || "7d";
					state.modelUsagePage = 0;
					qsa("[data-model-usage-range]").forEach((item) => {
						const active = item === button;
						item.classList.toggle("is-active", active);
						item.setAttribute("aria-pressed", active ? "true" : "false");
					});
					loadModelUsage({ force: true });
				});
			}
			const modelUsageApply = el("modelUsageApply");
			if (modelUsageApply && !modelUsageApply.dataset.boundModelUsageApply) {
				modelUsageApply.dataset.boundModelUsageApply = "1";
				modelUsageApply.addEventListener("click", () => {
					state.modelUsageQuery = el("modelUsageQuery")?.value || "";
					state.modelUsageSort = el("modelUsageSort")?.value || "calls";
					state.modelUsagePage = 0;
					loadModelUsage({ force: true });
				});
			}
			const modelUsageQuery = el("modelUsageQuery");
			if (modelUsageQuery && !modelUsageQuery.dataset.boundModelUsageQuery) {
				modelUsageQuery.dataset.boundModelUsageQuery = "1";
				modelUsageQuery.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					state.modelUsageQuery = event.currentTarget.value || "";
					state.modelUsageSort = el("modelUsageSort")?.value || "calls";
					state.modelUsagePage = 0;
					loadModelUsage({ force: true });
				});
			}
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
			const usage = currentUsageTotal(counters);
			const displaySuccess = traffic.requests > 0 ? Math.min(traffic.success, traffic.requests) : traffic.success;
			const displayFailed = traffic.requests > 0 ? Math.max(0, traffic.requests - displaySuccess) : traffic.failed;
			const successRate = traffic.requests > 0 ? Math.min(1, traffic.success / traffic.requests) : 1;
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
			const healthTone = providerPct >= .9 && keyPct >= .9 ? "ok" : providerPct >= .5 && keyPct >= .5 ? "warn" : providerPct > 0 && keyPct > 0 ? "soft" : "bad";
			updateDOM(target, `
      ${overviewMetricCard(t("traffic.total_tokens"), fmtTokenCount(usage.total_tokens), `${fmtTokenCount(usage.input_tokens)} ${t("traffic.input")} · ${fmtTokenCount(usage.output_tokens)} ${t("traffic.output")}`, "compat", "layers", `${fmtInt(usage.total_tokens)} ${t("traffic.tokens")}`, `${fmtInt(usage.input_tokens)} ${t("traffic.input")} · ${fmtInt(usage.output_tokens)} ${t("traffic.output")}`, "token", "token")}
      ${overviewMetricCard(t("kpi.success_rate"), fmtPct(successRate), `${fmtInt(displaySuccess)} ${t("metric.success")} / ${fmtInt(displayFailed)} ${t("traffic.failed")}`, successRate >= .98 ? "success" : successRate >= .95 ? "info" : successRate >= .85 ? "warning" : "danger", "check-circle", "", "", "percent", "success")}
      ${overviewMetricCard(t("kpi.first_byte"), latestLatency === null ? "-" : fmtMs(latestLatency), avgLatency === null ? t("kpi.no_samples") : `avg ${fmtMs(avgLatency)} / max ${fmtMs(maxLatency)}`, toneForLatency(avgLatency || latestLatency || 0), "zap", "", "", "latency")}
      ${overviewMetricCard(t("kpi.active_keys"), `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, `${fmtInt(providerAvailable)}/${fmtInt(providerCount)} ${t("metric.providers")}`, healthTone === "bad" ? "danger" : healthTone === "soft" ? "warning" : healthTone === "warn" ? "info" : "success", "key-round", "", "", "ratio", "key")}
    `);
		}
		function overviewMetricCard(label, value, hint, tone, icon, valueTitle = "", hintTitle = "", valueKind = "plain", hintKind = "plain") {
			const safeTone = [
				"compat",
				"success",
				"warning",
				"danger",
				"info"
			].includes(tone) ? tone : "info";
			return `
      <article class="visual-card accent-${escapeHtml(safeTone)}">
        <div class="metric-header">
          <span class="metric-label">${escapeHtml(label)}</span>
          <span class="metric-icon tone-${escapeHtml(safeTone)}">${iconSvg(icon || "activity")}</span>
        </div>
        <strong class="metric-val metric-val-${escapeHtml(valueKind)}"${valueTitle ? ` title="${escapeHtml(valueTitle)}"` : ""}>${overviewMetricValue(value, valueKind)}</strong>
        <small class="metric-sub metric-sub-${escapeHtml(hintKind)}"${hintTitle ? ` title="${escapeHtml(hintTitle)}"` : ""}>${overviewMetricHint(hint, safeTone, hintKind)}</small>
      </article>
    `;
		}
		function overviewMetricValue(value, kind) {
			const text = String(value ?? "-");
			if (kind === "ratio" && text.includes("/")) {
				const [primary, ...rest] = text.split("/");
				return `<span class="metric-val-main">${escapeHtml(primary.trim())}</span><span class="metric-val-secondary">/ ${escapeHtml(rest.join("/").trim())}</span>`;
			}
			const suffixPattern = kind === "percent" ? /^(.*?)(%)$/ : kind === "latency" ? /^(.*?)(ms|s)$/i : kind === "token" ? /^(.*?)([kmbt])$/i : null;
			const match = suffixPattern ? text.match(suffixPattern) : null;
			if (!match) return `<span class="metric-val-main">${escapeHtml(text)}</span>`;
			return `<span class="metric-val-main">${escapeHtml(match[1])}</span><span class="metric-val-unit">${escapeHtml(match[2])}</span>`;
		}
		function overviewMetricHint(hint, tone, kind) {
			const text = String(hint ?? "");
			if (kind === "success") {
				const [positive, ...rest] = text.split(" / ");
				const failure = rest.join(" / ");
				return `<span class="metric-sub-positive">${escapeHtml(positive)}</span>${failure ? `<span class="metric-sub-divider">/</span><span>${escapeHtml(failure)}</span>` : ""}`;
			}
			if (kind === "token") return `${metricDot("success")}<span>${escapeHtml(text)}</span>`;
			if (kind === "key") {
				const match = text.match(/^(\S+)\s+(.*)$/);
				if (match) return `<span class="metric-sub-positive">${escapeHtml(match[1])}</span><span>${escapeHtml(match[2])}</span>`;
			}
			return `<span>${escapeHtml(text)}</span>`;
		}
		function metricDot(tone) {
			return `<span class="metric-dot ${[
				"compat",
				"danger",
				"warning",
				"success"
			].includes(tone) ? tone : "info"}"></span>`;
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
			const bucketHasSignal = chartBuckets.some((bucket) => Number(bucket.requests || 0) || Number(bucket.success || 0) || Number(bucket.failed || 0) || Number(bucket.input || 0) || Number(bucket.output || 0) || Number(bucket.total_tokens || 0));
			const range = currentTimeRange();
			const nowTs = Date.now() / 1e3;
			const windowFirstTs = Number(chartBuckets[0]?.start || nowTs - range.bucket_s * range.buckets);
			const windowLastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || nowTs);
			const recentInWindow = recentSorted.filter((request) => {
				const ts = Number(request.finished_at || 0);
				return ts >= windowFirstTs && ts <= windowLastTs;
			});
			const useRecentSamples = !bucketHasSignal && recentInWindow.length > 0;
			if (useRecentSamples) chartBuckets = recentInWindow.slice(-72).map((request) => {
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
				const bucketTimes = chartBuckets.map((bucket) => Number(bucket.ts || 0));
				const nearestBucket = (timestamp) => {
					let low = 0;
					let high = bucketTimes.length;
					while (low < high) {
						const middle = low + high >> 1;
						if (bucketTimes[middle] < timestamp) low = middle + 1;
						else high = middle;
					}
					if (low <= 0) return chartBuckets[0];
					if (low >= bucketTimes.length) return chartBuckets[chartBuckets.length - 1];
					return timestamp - bucketTimes[low - 1] <= bucketTimes[low] - timestamp ? chartBuckets[low - 1] : chartBuckets[low];
				};
				recentSorted.filter((request) => Number(request.finished_at || 0) >= firstTs && Number(request.finished_at || 0) <= lastTs).forEach((request) => {
					const ts = Number(request.finished_at || 0);
					const usage = usageFrom(request);
					if (!ts || !usage.total_tokens) return;
					const bucket = nearestBucket(ts);
					if (!bucket) return;
					bucket.input += usage.input_tokens;
					bucket.output += usage.output_tokens;
					bucket.total_tokens += usage.total_tokens;
					bucket.cost_usd += usage.cost_usd;
				});
			}
			if (!chartBuckets.length) {
				if (chartWindow) chartWindow.textContent = `${currentTimeRange().label} / no samples`;
				updateDOM(target, `
        <div class="traffic-chart-shell traffic-workspace-empty">
          <strong>No traffic in this window</strong>
          <span>Choose a wider time range or wait for the next completed request.</span>
        </div>
      `);
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
			const latencySamples = chartBuckets.filter((bucket) => Number(bucket.requests || 0) > 0 && Number(bucket.first_byte_ms_avg || 0) > 0);
			const latencyRequests = latencySamples.reduce((sum, bucket) => sum + Number(bucket.requests || 0), 0);
			const avgLatency = latencyRequests ? latencySamples.reduce((sum, bucket) => sum + Number(bucket.first_byte_ms_avg || 0) * Number(bucket.requests || 0), 0) / latencyRequests : 0;
			const firstTs = Number(chartBuckets[0]?.start || chartBuckets[0]?.ts || 0);
			const lastTs = Number(chartBuckets[chartBuckets.length - 1]?.end || chartBuckets[chartBuckets.length - 1]?.ts || firstTs);
			if (chartWindow) chartWindow.textContent = useRecentSamples ? `${currentTimeRange().label} / recent requests` : `${currentTimeRange().label} / ${sourceLabel}`;
			updateDOM(target, renderTrafficComboChart({
				buckets: chartBuckets,
				firstTs,
				lastTs,
				width: 1120,
				height: 360,
				pad: {
					top: 24,
					right: 96,
					bottom: 32,
					left: 72
				},
				sourceLabel: useRecentSamples ? "recent requests" : sourceLabel,
				windowLabel: currentTimeRange().label,
				summary: {
					requests: totals.requests,
					success: totals.success,
					failed: totals.failed,
					successRate,
					avgLatency,
					input: displayUsage.input_tokens,
					output: displayUsage.output_tokens,
					totalTokens: displayUsage.total_tokens,
					costUsd: displayUsage.cost_usd
				}
			}));
			bindTrafficModeControls(target, {
				getMode: () => state.trafficChartMode,
				setMode: (mode) => {
					state.trafficChartMode = mode;
					renderTrafficChart();
				}
			});
			bindTrafficChartInspection(target);
		}
		function bindTrafficChartInspection(target) {
			const shell = target?.querySelector(".traffic-chart-shell");
			const tooltip = shell?.querySelector("[data-traffic-tooltip]");
			const guide = shell?.querySelector("[data-traffic-guide]");
			if (!shell || !tooltip || !guide) return;
			const time = tooltip.querySelector("[data-traffic-tooltip-time]");
			const rows = Array.from(tooltip.querySelectorAll("[data-traffic-tooltip-row]"));
			const hide = () => {
				tooltip.hidden = true;
				guide.classList.remove("is-visible");
			};
			const show = (bucket) => {
				if (!bucket) return;
				const x = Number(bucket.dataset.trafficBucketX || 0);
				shell.style.setProperty("--traffic-inspect-x", `${Math.max(0, Math.min(100, x))}%`);
				guide.setAttribute("x1", bucket.dataset.trafficBucketSvgX || "0");
				guide.setAttribute("x2", bucket.dataset.trafficBucketSvgX || "0");
				guide.classList.add("is-visible");
				if (time) time.textContent = bucket.dataset.trafficBucketTime || "-";
				const values = shell.dataset.trafficCurrentMode === "tokens" ? [
					["Total tokens", bucket.dataset.trafficBucketTokens || "0"],
					["Input", bucket.dataset.trafficBucketInput || "0"],
					["Output", bucket.dataset.trafficBucketOutput || "0"],
					["Est. cost", bucket.dataset.trafficBucketCost || "$0"]
				] : [
					["Requests", bucket.dataset.trafficBucketRequests || "0"],
					["Successful", bucket.dataset.trafficBucketSuccess || "0"],
					["Failed", bucket.dataset.trafficBucketFailed || "0"],
					["Avg latency", bucket.dataset.trafficBucketLatency || "-"]
				];
				rows.forEach((row, index) => {
					const [label, value] = values[index] || ["", ""];
					const labelNode = row.querySelector("span");
					const valueNode = row.querySelector("strong");
					if (labelNode) labelNode.textContent = label;
					if (valueNode) valueNode.textContent = value;
				});
				tooltip.hidden = false;
			};
			shell.querySelectorAll("[data-traffic-bucket]").forEach((bucket) => {
				bucket.addEventListener("pointerenter", () => show(bucket));
				bucket.addEventListener("focus", () => show(bucket));
				bucket.addEventListener("keydown", (event) => {
					if (event.key === "Escape") {
						hide();
						bucket.blur();
					}
				});
			});
			shell.addEventListener("pointerleave", hide);
			shell.addEventListener("focusout", (event) => {
				if (!shell.contains(event.relatedTarget)) hide();
			});
		}
		function svgNum(value) {
			return Number(value || 0).toFixed(2).replace(/\.?0+$/, "");
		}
		function smoothSvgPath(points, minY, maxY, curveFactor = 1 / 6) {
			if (!points.length) return "";
			if (points.length === 1) return `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
			const clampY = (value) => Math.max(minY, Math.min(maxY, Number(value || 0)));
			let path = `M ${svgNum(points[0].x)} ${svgNum(points[0].y)}`;
			for (let i = 0; i < points.length - 1; i += 1) {
				const p0 = points[i - 1] || points[i];
				const p1 = points[i];
				const p2 = points[i + 1];
				const p3 = points[i + 2] || p2;
				const cp1x = p1.x + (p2.x - p0.x) * curveFactor;
				const cp1y = clampY(p1.y + (p2.y - p0.y) * curveFactor);
				const cp2x = p2.x - (p3.x - p1.x) * curveFactor;
				const cp2y = clampY(p2.y - (p3.y - p1.y) * curveFactor);
				path += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
			}
			return path;
		}
		function trafficDisplayBuckets(buckets) {
			const source = Array.isArray(buckets) ? buckets : [];
			if (state.timeRange !== "7d" || source.length <= 8) return source;
			const groups = Array.from({ length: 8 }, () => []);
			source.forEach((bucket, index) => {
				groups[Math.round(index * (groups.length - 1) / Math.max(1, source.length - 1))].push(bucket);
			});
			return groups.map((group, groupIndex) => {
				const representative = source[Math.round(groupIndex * (source.length - 1) / (groups.length - 1))] || group[0] || {};
				const totals = group.reduce((memo, bucket) => {
					const requests = Number(bucket.requests || 0);
					const latency = Number(bucket.first_byte_ms_avg || 0);
					memo.requests += requests;
					memo.success += Number(bucket.success || 0);
					memo.failed += Number(bucket.failed || 0);
					memo.input += Number(bucket.input || 0);
					memo.output += Number(bucket.output || 0);
					memo.total_tokens += Number(bucket.total_tokens || 0);
					memo.cost_usd += Number(bucket.cost_usd || 0);
					if (requests > 0 && latency > 0) {
						memo.latencyTotal += latency * requests;
						memo.latencyRequests += requests;
					}
					return memo;
				}, {
					requests: 0,
					success: 0,
					failed: 0,
					input: 0,
					output: 0,
					total_tokens: 0,
					cost_usd: 0,
					latencyTotal: 0,
					latencyRequests: 0
				});
				return {
					ts: Number(representative.ts || representative.start || 0),
					start: Number(representative.start || representative.ts || 0),
					end: Number(representative.end || representative.ts || 0),
					requests: totals.requests,
					success: totals.success,
					failed: totals.failed,
					input: totals.input,
					output: totals.output,
					total_tokens: totals.total_tokens,
					cost_usd: totals.cost_usd,
					first_byte_ms_avg: totals.latencyRequests ? totals.latencyTotal / totals.latencyRequests : 0,
					displayBucket: true
				};
			});
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
			const buckets = trafficDisplayBuckets(options.buckets);
			const summary = options.summary || {};
			const requestMode = state.trafficChartMode === "requests";
			const workspaceTitle = requestMode ? t("traffic.request_volume") : t("traffic.token_usage");
			const workspaceSubtitle = `${options.windowLabel || currentTimeRange().label} / ${options.sourceLabel || "history"}`;
			const workspaceMetrics = requestMode ? [
				{
					label: t("traffic.requests"),
					value: fmtInt(summary.requests),
					hint: t("traffic.total"),
					icon: "activity",
					tone: "tone-info"
				},
				{
					label: t("traffic.success"),
					value: fmtInt(summary.success),
					hint: fmtPct(summary.successRate),
					icon: "check",
					tone: "tone-success"
				},
				{
					label: t("traffic.failed"),
					value: fmtInt(summary.failed),
					hint: fmtPct(1 - Number(summary.successRate || 0)),
					icon: "alert",
					tone: "tone-danger"
				},
				{
					label: t("traffic.avg_latency"),
					value: fmtMs(summary.avgLatency),
					hint: t("traffic.first_byte"),
					icon: "clock",
					tone: "tone-warning"
				}
			] : [
				{
					label: t("traffic.total_tokens"),
					value: fmtTokenCount(summary.totalTokens),
					hint: fmtInt(summary.totalTokens),
					icon: "bolt",
					tone: "tone-compat"
				},
				{
					label: t("traffic.input"),
					value: fmtTokenCount(summary.input),
					hint: t("traffic.tokens"),
					icon: "arrow-down",
					tone: "tone-info"
				},
				{
					label: t("traffic.output"),
					value: fmtTokenCount(summary.output),
					hint: t("traffic.tokens"),
					icon: "arrow-up",
					tone: "tone-compat"
				},
				{
					label: t("traffic.estimated_cost"),
					value: fmtCost(summary.costUsd),
					hint: t("traffic.window"),
					icon: "dollar",
					tone: "tone-success"
				}
			];
			const xFor = (bucket, index, total) => {
				const ts = Number(bucket.ts || 0);
				if (bucket.displayBucket) return pad.left + (total > 1 ? index / (total - 1) * plotW : plotW / 2);
				if (lastTs > firstTs && ts) return pad.left + (ts - firstTs) / (lastTs - firstTs) * plotW;
				return pad.left + (total > 1 ? index / (total - 1) * plotW : plotW / 2);
			};
			const enriched = buckets.map((bucket, index) => ({
				...bucket,
				x: xFor(bucket, index, buckets.length)
			}));
			const inspectableBuckets = enriched.filter((bucket) => requestMode ? Number(bucket.requests || 0) > 0 || Number(bucket.first_byte_ms_avg || 0) > 0 : Number(bucket.total_tokens || 0) > 0 || Number(bucket.input || 0) > 0 || Number(bucket.output || 0) > 0 || Number(bucket.cost_usd || 0) > 0);
			const inspectionSlot = buckets.length ? plotW / buckets.length : plotW;
			const inspectionWidth = Math.max(3, inspectionSlot);
			const inspectionTargets = inspectableBuckets.map((bucket) => {
				const time = fmtDate(bucket.start || bucket.ts);
				const requestLabel = `${time}, ${fmtInt(bucket.requests)} requests, ${fmtInt(bucket.success)} successful, ${fmtInt(bucket.failed)} failed, ${fmtMs(bucket.first_byte_ms_avg)} average latency`;
				const tokenLabel = `${time}, ${fmtInt(bucket.total_tokens)} total tokens, ${fmtInt(bucket.input)} input, ${fmtInt(bucket.output)} output, ${fmtCost(bucket.cost_usd)} estimated cost`;
				return `
        <rect class="traffic-inspection-target"
          x="${svgNum(bucket.x - inspectionWidth / 2)}" y="${svgNum(pad.top)}"
          width="${svgNum(inspectionWidth)}" height="${svgNum(plotH)}"
          fill="transparent" tabindex="0" role="button"
          aria-label="${escapeHtml(requestMode ? requestLabel : tokenLabel)}"
          data-traffic-bucket
          data-traffic-bucket-x="${svgNum(bucket.x / width * 100)}"
          data-traffic-bucket-svg-x="${svgNum(bucket.x)}"
          data-traffic-bucket-time="${escapeHtml(time)}"
          data-traffic-bucket-requests="${escapeHtml(fmtInt(bucket.requests))}"
          data-traffic-bucket-success="${escapeHtml(fmtInt(bucket.success))}"
          data-traffic-bucket-failed="${escapeHtml(fmtInt(bucket.failed))}"
          data-traffic-bucket-latency="${escapeHtml(bucket.first_byte_ms_avg ? fmtMs(bucket.first_byte_ms_avg) : "-")}"
          data-traffic-bucket-tokens="${escapeHtml(fmtInt(bucket.total_tokens))}"
          data-traffic-bucket-input="${escapeHtml(fmtInt(bucket.input))}"
          data-traffic-bucket-output="${escapeHtml(fmtInt(bucket.output))}"
          data-traffic-bucket-cost="${escapeHtml(fmtCost(bucket.cost_usd))}"></rect>
      `;
			}).join("");
			const safeMax = (values, fallback = 1) => Math.max(fallback, ...values.map((value) => Number(value || 0)));
			const barBaseline = height - pad.bottom;
			const demoCurveFactor = .1;
			let svgContent = "";
			let legendItems = [];
			if (state.trafficChartMode === "requests") {
				const requestMax = niceChartMax(Math.max(4, safeMax(buckets.map((b) => b.requests), 1) * 1.15));
				const latencyMax = chartScaleMax(buckets.map((bucket) => bucket.first_byte_ms_avg), {
					fallback: 1e3,
					nice: true
				});
				const yBar = (value) => barBaseline - Number(value || 0) / Math.max(1, requestMax) * plotH;
				const yLatency = (value) => barBaseline - Number(value || 0) / Math.max(1, latencyMax) * plotH;
				const gridAndLabels = Array.from({ length: 6 }, (_, index) => requestMax * index / 5).map((label) => `
        <line class="axis traffic-grid-line" x1="${pad.left}" y1="${yBar(label)}" x2="${width - pad.right}" y2="${yBar(label)}"></line>
        <text class="traffic-axis-label" x="${pad.left - 14}" y="${yBar(label) + 4}" text-anchor="end">${escapeHtml(fmtInt(label))}</text>
      `).join("");
				const successPoints = enriched.map((bucket) => ({
					x: bucket.x,
					y: yBar(Math.max(0, Number(bucket.requests || 0) - Number(bucket.failed || 0))),
					value: Math.max(0, Number(bucket.requests || 0) - Number(bucket.failed || 0)),
					start: bucket.start,
					ts: bucket.ts
				}));
				const failurePoints = enriched.map((bucket) => ({
					x: bucket.x,
					y: yBar(Math.min(Number(bucket.requests || 0), Number(bucket.failed || 0))),
					value: Math.min(Number(bucket.requests || 0), Number(bucket.failed || 0)),
					start: bucket.start,
					ts: bucket.ts
				}));
				const successPath = smoothSvgPath(successPoints, pad.top, barBaseline, demoCurveFactor);
				const failurePath = smoothSvgPath(failurePoints, pad.top, barBaseline, demoCurveFactor);
				const hasFailures = failurePoints.some((point) => point.value > 0);
				const successAreaPath = successPath && successPoints.length > 1 ? `${successPath} L ${svgNum(successPoints[successPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(successPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				const requestTrends = `
        ${successAreaPath ? `<path class="traffic-success-area" d="${successAreaPath}"></path>` : ""}
        ${successPath ? `<path class="traffic-success-line" d="${successPath}"></path>` : ""}
        ${hasFailures && failurePath ? `<path class="traffic-failure-line" d="${failurePath}"></path>` : ""}
        ${successPoints.length <= 64 ? successPoints.filter((point) => point.value > 0).map((point) => `<circle class="traffic-trend-dot traffic-success-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3"></circle>`).join("") : ""}
        ${hasFailures && failurePoints.length <= 64 ? failurePoints.filter((point) => point.value > 0).map((point) => `<circle class="traffic-trend-dot traffic-failure-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3"></circle>`).join("") : ""}
      `;
				const latencyPoints = enriched.map((bucket) => {
					const value = Number(bucket.requests || 0) > 0 ? Math.max(0, Number(bucket.first_byte_ms_avg || 0)) : 0;
					return {
						x: bucket.x,
						y: yLatency(value),
						value,
						start: bucket.start,
						ts: bucket.ts
					};
				});
				const latencyPath = smoothSvgPath(latencyPoints, pad.top, barBaseline, demoCurveFactor);
				const latencyAreaPath = latencyPath && latencyPoints.length > 1 ? `${latencyPath} L ${svgNum(latencyPoints[latencyPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(latencyPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				const latencyArea = latencyAreaPath ? `<path class="traffic-latency-region" d="${latencyAreaPath}"></path>` : "";
				const latencyLine = latencyPath ? `<path class="traffic-latency-line" d="${latencyPath}"></path>` : "";
				const latencyDots = latencyPoints.length <= 64 ? latencyPoints.filter((point) => point.value > 0).map((point) => `
            <circle class="traffic-trend-dot traffic-latency-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Avg Latency: ${fmtMs(point.value)}`)}</title>
            </circle>
          `).join("") : "";
				svgContent = `
        ${gridAndLabels}
        ${[
					0,
					latencyMax / 2,
					latencyMax
				].map((label) => `
        <text class="traffic-axis-label traffic-axis-label-info" x="${width - pad.right + 14}" y="${yLatency(label) + 4}">${escapeHtml(fmtMs(label))}</text>
      `).join("")}
        ${latencyArea}
        ${requestTrends}
        ${latencyLine}
        ${latencyDots}
      `;
				legendItems = [
					{
						dotClass: "traffic-success-legend",
						label: t("traffic.success_requests")
					},
					...hasFailures ? [{
						dotClass: "traffic-failure-legend",
						label: t("traffic.failures")
					}] : [],
					{
						dotClass: "traffic-latency-legend",
						label: t("traffic.avg_latency")
					}
				];
			} else {
				const tokenMax = chartScaleMax(buckets.flatMap((bucket) => [
					bucket.total_tokens,
					bucket.input,
					bucket.output
				]), {
					fallback: 1e3,
					nice: true
				});
				const costMax = chartScaleMax(buckets.map((bucket) => bucket.cost_usd), { fallback: .01 });
				const yToken = (value) => barBaseline - Number(value || 0) / Math.max(1, tokenMax) * plotH;
				const yCost = (value) => barBaseline - Number(value || 0) / Math.max(1e-6, costMax) * plotH;
				const tokenLabels = Array.from({ length: 5 }, (_, index) => tokenMax * index / 4);
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
				const totalPath = smoothSvgPath(totalPoints, pad.top, barBaseline, demoCurveFactor);
				const totalAreaPath = totalPath && totalPoints.length > 1 ? `${totalPath} L ${svgNum(totalPoints[totalPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(totalPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				const totalArea = totalAreaPath ? `<path class="traffic-token-area" d="${totalAreaPath}"></path>` : "";
				const totalLine = totalPath ? `<path class="traffic-total-line" d="${totalPath}"></path>` : "";
				const inputPath = smoothSvgPath(enriched.map((bucket) => ({
					x: bucket.x,
					y: yToken(bucket.input),
					value: bucket.input,
					start: bucket.start,
					ts: bucket.ts
				})), pad.top, barBaseline, demoCurveFactor);
				const inputLine = inputPath ? `<path class="traffic-input-line" d="${inputPath}"></path>` : "";
				const outputPath = smoothSvgPath(enriched.map((bucket) => ({
					x: bucket.x,
					y: yToken(bucket.output),
					value: bucket.output,
					start: bucket.start,
					ts: bucket.ts
				})), pad.top, barBaseline, demoCurveFactor);
				const outputLine = outputPath ? `<path class="traffic-output-line" d="${outputPath}"></path>` : "";
				const costPoints = enriched.map((bucket) => ({
					x: bucket.x,
					y: yCost(bucket.cost_usd),
					value: bucket.cost_usd,
					start: bucket.start,
					ts: bucket.ts
				}));
				const costPath = smoothSvgPath(costPoints, pad.top, barBaseline, demoCurveFactor);
				const costAreaPath = costPath && costPoints.length > 1 ? `${costPath} L ${svgNum(costPoints[costPoints.length - 1].x)} ${svgNum(barBaseline)} L ${svgNum(costPoints[0].x)} ${svgNum(barBaseline)} Z` : "";
				svgContent = `
        ${gridAndLabels}
        ${rightLabels}
        ${costAreaPath ? `<path class="traffic-cost-region" d="${costAreaPath}"></path>` : ""}
        ${totalArea}
        ${totalLine}
        ${inputLine}
        ${outputLine}
        ${costPath ? `<path class="traffic-cost-line" d="${costPath}"></path>` : ""}
        ${totalPoints.length <= 64 ? positiveChartPoints(totalPoints).map((point) => `
            <circle class="traffic-trend-dot traffic-total-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="3.6">
              <title>${escapeHtml(`${fmtDate(point.start || point.ts)} Total Tokens: ${fmtTokenCount(point.value)}`)}</title>
            </circle>
          `).join("") : ""}
        ${costPoints.length <= 64 && costPath ? positiveChartPoints(costPoints).map((point) => `
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
						label: t("traffic.total_tokens")
					},
					{
						dotClass: "traffic-input-dot",
						label: t("traffic.input")
					},
					{
						dotClass: "traffic-output-dot",
						label: t("traffic.output")
					},
					{
						dotClass: "traffic-cost-legend",
						label: t("traffic.estimated_cost")
					}
				];
			}
			const desiredTickCount = {
				"30m": 7,
				"2h": 5,
				"24h": 7,
				"7d": 8
			}[state.timeRange] || 8;
			const tickCount = Math.min(desiredTickCount, enriched.length);
			const xTicks = tickCount > 1 ? Array.from({ length: tickCount }, (_, index) => enriched[Math.round(index * (enriched.length - 1) / (tickCount - 1))]) : enriched;
			const shortDate = (ts) => {
				const n = Number(ts || 0);
				if (!n) return "-";
				const d = /* @__PURE__ */ new Date(n * 1e3);
				const opts = currentTimeRange() === timeRanges["7d"] ? {
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
			const legend = legendItems.map((item) => `
      <span class="traffic-trend-legend-item ${item.dotClass}">
        <i></i>${escapeHtml(item.label)}
      </span>
    `).join("");
			return `
      <div class="traffic-chart-shell" data-traffic-current-mode="${escapeHtml(state.trafficChartMode)}">
        <div class="traffic-workspace-header">
          <div class="traffic-workspace-title">
            <strong>${escapeHtml(workspaceTitle)}</strong>
            <div class="traffic-workspace-subtitle-row">
              <small>${escapeHtml(workspaceSubtitle)}</small>
              <div class="traffic-mode-selectors" role="group" aria-label="${escapeHtml(t("traffic.mode"))}">
                <button type="button" class="button pill-toggle ${state.trafficChartMode === "requests" ? "is-active" : ""}" data-traffic-mode="requests" aria-pressed="${state.trafficChartMode === "requests" ? "true" : "false"}">${escapeHtml(t("traffic.requests"))}</button>
                <button type="button" class="button pill-toggle ${state.trafficChartMode === "tokens" ? "is-active" : ""}" data-traffic-mode="tokens" aria-pressed="${state.trafficChartMode === "tokens" ? "true" : "false"}">${escapeHtml(t("traffic.tokens"))}</button>
              </div>
            </div>
          </div>
          <div class="traffic-workspace-metrics">
            ${workspaceMetrics.map((metric) => `
              <div class="traffic-workspace-metric ${metric.tone}">
                <span class="traffic-workspace-metric-icon">${iconSvg(metric.icon)}</span>
                <span class="traffic-workspace-metric-copy">
                  <span class="traffic-workspace-metric-label">${escapeHtml(metric.label)}</span>
                  <span class="traffic-workspace-metric-value"><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.hint)}</small></span>
                </span>
              </div>
            `).join("")}
          </div>
          <div class="traffic-workspace-actions">
            <div class="traffic-trend-legend">${legend}</div>
          </div>
        </div>
        <div class="traffic-chart-header">
          <span class="traffic-chart-unit">${escapeHtml(t(state.trafficChartMode === "requests" ? "traffic.requests_per_minute" : "traffic.tokens_per_minute"))}</span>
        </div>
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="group" aria-label="${escapeHtml(t("traffic.chart_aria"))}">
          <defs>
            <linearGradient id="trafficTokenArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#7b55d6" stop-opacity="0.16"></stop>
              <stop offset="55%" stop-color="#7b55d6" stop-opacity="0.055"></stop>
              <stop offset="100%" stop-color="#7b55d6" stop-opacity="0"></stop>
            </linearGradient>
            <linearGradient id="trafficLatencyArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.10"></stop>
              <stop offset="58%" stop-color="#f59e0b" stop-opacity="0.03"></stop>
              <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"></stop>
            </linearGradient>
            <linearGradient id="trafficCostArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#e49a24" stop-opacity="0.09"></stop>
              <stop offset="58%" stop-color="#e49a24" stop-opacity="0.025"></stop>
              <stop offset="100%" stop-color="#e49a24" stop-opacity="0"></stop>
            </linearGradient>
            <linearGradient id="trafficRequestArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.12"></stop>
              <stop offset="55%" stop-color="#10b981" stop-opacity="0.04"></stop>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0"></stop>
            </linearGradient>
          </defs>
          <g aria-hidden="true">
            <rect class="traffic-plot-bg" x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" rx="0"></rect>
            <line class="axis traffic-y-axis" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${barBaseline}"></line>
            ${svgContent}
            <line class="traffic-inspection-guide" data-traffic-guide x1="0" y1="${pad.top}" x2="0" y2="${barBaseline}"></line>
            <line class="axis traffic-baseline" x1="${pad.left}" y1="${barBaseline}" x2="${width - pad.right}" y2="${barBaseline}"></line>
            ${xTicksHtml}
          </g>
          ${inspectionTargets}
        </svg>
        <div class="traffic-inspection-tooltip" data-traffic-tooltip aria-live="polite" hidden>
          <strong data-traffic-tooltip-time>-</strong>
          ${Array.from({ length: 4 }, () => `<div data-traffic-tooltip-row><span></span><strong></strong></div>`).join("")}
        </div>
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
				updateDOM(target, `<div class="empty pad">No model usage recorded yet</div>`);
				return;
			}
			updateDOM(target, `
      <div class="usage-summary">
        ${miniMetric("Input", fmtTokenCount(totalUsage.input_tokens), "tokens")}
        ${miniMetric("Output", fmtTokenCount(totalUsage.output_tokens), "tokens")}
        ${miniMetric("Total", fmtTokenCount(totalUsage.total_tokens), "tokens")}
        ${miniMetric("Cost", fmtCost(totalUsage.cost_usd), "estimated")}
      </div>
      <div class="usage-columns usage-model-only">
        <section>
          <div class="usage-section-title">
            <h3>${iconSvg("boxes")} Top ${fmtInt(5)} models</h3>
            <span>${fmtTokenCount(totalUsage.total_tokens)} tokens</span>
          </div>
          ${usageRows(modelRows, "No model calls")}
        </section>
      </div>
    `);
		}
		function emptyUsageTotal() {
			return {
				input_tokens: 0,
				uncached_input_tokens: 0,
				cached_input_tokens: 0,
				cache_write_tokens: 0,
				output_tokens: 0,
				reasoning_tokens: 0,
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
            <div class="usage-row usage-model-row">
              <span class="usage-rank usage-rank-tile">#${fmtInt(row.rank || 0)}</span>
              <div class="usage-row-head">
                <strong class="mono" title="${escapeHtml(row.label)}">
                  <span class="usage-model-name">${escapeHtml(row.label)}</span>
                </strong>
                <span class="usage-call-count">${escapeHtml(row.hint || "")}</span>
              </div>
              <div class="usage-track usage-track-calls" title="${escapeHtml(fmtInt(row.calls || 0))} calls">
                <span class="usage-fill calls" style="width:${callPct}%"></span>
              </div>
              <div class="usage-row-foot usage-model-foot">
                <span title="${escapeHtml(fmtCost(row.usage.cost_usd))} total cost">${iconSvg("activity")} <strong>${fmtCost(row.usage.cost_usd)}</strong></span>
                <span title="${escapeHtml(fmtInt(row.usage.input_tokens))} input tokens">${iconSvg("arrow-left")} ${fmtTokenCount(row.usage.input_tokens)}</span>
                <span title="${escapeHtml(fmtInt(row.usage.output_tokens))} output tokens">${iconSvg("arrow-right")} ${fmtTokenCount(row.usage.output_tokens)}</span>
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
			if (!target) return;
			const names = providerNames(providers, configProviders);
			if (!names.length) {
				target.classList.add("empty");
				updateDOM(target, "No providers");
				return;
			}
			target.classList.remove("empty");
			const views = names.map((name) => providerLightView(name)).sort((a, b) => providerOverviewPriority(a) - providerOverviewPriority(b) || a.name.localeCompare(b.name));
			const visible = views.slice(0, 5);
			updateDOM(target, `
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
    `);
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
		function renderOnboardingBanner() {
			const target = el("onboardingBanner");
			if (!target) return;
			if (state.staticDataState !== "ready") {
				updateDOM(target, "");
				target.style.display = "none";
				return;
			}
			const status = state.data.status || {};
			const providers = (state.data.config || {}).providers || {};
			const providerNames = Object.keys(providers);
			const zeroConfig = !!status.zero_config;
			const hasProviders = providerNames.length > 0 && providerNames.some((name) => {
				const p = providers[name];
				return p && p.keys && Array.isArray(p.keys) && p.keys.length > 0;
			});
			if (!zeroConfig && hasProviders) {
				updateDOM(target, "");
				target.style.display = "none";
				return;
			}
			target.style.display = "";
			const presets = status.provider_presets || [];
			const presetChips = presets.length ? `<div class="onboarding-presets">
          <span class="onboarding-presets-label">Detected env vars (zero-config):</span>
          ${presets.slice(0, 6).map((p) => `<span class="onboarding-preset-chip" title="${escapeHtml(p.env_var)}">${escapeHtml(p.name)}</span>`).join("")}
        </div>` : "";
			updateDOM(target, `
      <div class="onboarding-banner">
        <div class="onboarding-banner-icon">${iconSvg("settings")}</div>
        <div class="onboarding-banner-content">
          <h3>${zeroConfig ? "Zero-config mode active" : "Welcome! Get started in seconds"}</h3>
          <p>${zeroConfig ? "Providers were auto-detected from environment variables. Create a config.json for full control, or add more providers below." : "No providers are configured yet. Set environment variables like OPENAI_API_KEY for zero-config, or manually add a provider."}</p>
          ${presetChips}
          <div class="onboarding-banner-actions">
            <button class="button primary" type="button" id="onboardingAddProvider" data-goto-modal="addProvider">Add Provider</button>
            <button class="button secondary" type="button" data-view-target="config">View Config</button>
          </div>
        </div>
      </div>
    `);
			const addBtn = document.getElementById("onboardingAddProvider");
			if (addBtn) addBtn.addEventListener("click", openAddProviderModal);
			bindViewTargetButtons();
		}
		function renderHealthOverview() {
			const target = el("healthOverview");
			const summaryTarget = el("healthHeaderSummary");
			const subtitleTarget = el("healthPanelSubtitle");
			if (!target) return;
			const hs = state.data.healthScores;
			if (!hs || !hs.providers) {
				if (summaryTarget) updateDOM(summaryTarget, "");
				if (subtitleTarget) subtitleTarget.textContent = t("health.loading");
				updateDOM(target, `<div class="health-overview-loading">${iconSvg("rotate")}<span>${escapeHtml(t("health.loading"))}</span></div>`);
				return;
			}
			const overall = hs.overall || 0;
			const providers = hs.providers;
			const names = Object.keys(providers);
			if (!names.length) {
				if (summaryTarget) updateDOM(summaryTarget, "");
				if (subtitleTarget) subtitleTarget.textContent = t("health.no_data");
				updateDOM(target, `<div class="health-overview-empty">${escapeHtml(t("health.no_data"))}</div>`);
				return;
			}
			names.sort((a, b) => (providers[a].score || 0) - (providers[b].score || 0));
			const overallGrade = overall >= 90 ? "excellent" : overall >= 75 ? "good" : overall >= 50 ? "fair" : overall >= 25 ? "poor" : "critical";
			const overallTone = overall >= 75 ? "success" : overall >= 50 ? "warning" : "danger";
			const visibleNames = names.slice(0, 9);
			const hiddenCount = Math.max(0, names.length - visibleNames.length);
			if (subtitleTarget) subtitleTarget.textContent = t("health.providers_count", { count: fmtInt(names.length) });
			if (summaryTarget) updateDOM(summaryTarget, `
      <span class="health-overview-score tone-${escapeHtml(overallTone)}">
        <span class="health-score-ring ${escapeHtml(overallGrade)}">
          <strong>${fmtInt(overall)}</strong>
          <small>/ 100</small>
        </span>
        <span class="health-score-label">${escapeHtml(t("health.grade." + overallGrade))}</span>
      </span>
    `);
			updateDOM(target, `
      <div class="health-overview-list">
        ${visibleNames.map((name) => {
				const p = providers[name];
				const tone = p.score >= 75 ? "ok" : p.score >= 50 ? "warn" : p.score >= 25 ? "soft" : "bad";
				const gradeLabel = String(p.grade || "unknown").toLowerCase();
				return `
            <div class="health-provider-row tone-${escapeHtml(tone)}" data-provider-card="${escapeHtml(name)}">
              <span class="health-provider-name mono">${escapeHtml(name)}</span>
              <div class="health-provider-bar">
                <div class="health-provider-bar-fill tone-${escapeHtml(tone)}" style="width:${Math.max(2, Math.min(100, p.score))}%"></div>
              </div>
              <span class="health-provider-grade grade-${escapeHtml(gradeLabel)}">${escapeHtml(t("health.grade." + gradeLabel))} <strong>${fmtInt(p.score)}</strong></span>
            </div>
          `;
			}).join("")}
        ${hiddenCount ? `<button class="health-overview-more" type="button" data-view-target="providers">${escapeHtml(t("health.more_providers", { count: fmtInt(hiddenCount) }))}</button>` : ""}
      </div>
    `);
			bindViewTargetButtons();
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
				updateDOM(target, `<div class="empty pad">No recent failures</div>`);
				return;
			}
			updateDOM(target, `
      <div class="overview-summary-meta recent-failure-summary">
        <span>${iconSvg("alert")} latest ${fmtInt(rows.length)} / ${fmtInt(failures.length)}</span>
        <button class="overview-jump-button" type="button" data-view-target="requests" title="Open Requests" aria-label="Open Requests">${iconSvg("arrow-right")}</button>
      </div>
      <div class="recent-failure-list">
        ${rows.map((r) => {
				const failedAttempt = (r.attempts || []).find((a) => a.outcome !== "success") || {};
				const reason = failedAttempt.reason || failedAttempt.error_type || r.error || "-";
				const finalOk = r.status === "success" || r.status === "recovered" || Number(r.status_code || 0) > 0 && Number(r.status_code || 0) < 400;
				const tone = finalOk ? "warning" : "danger";
				const firstByte = firstByteMsFromRequest(r);
				const latency = firstByte ? fmtMs(firstByte) : "-";
				return `
            <button class="recent-failure-row tone-${tone}" type="button" data-request-id="${escapeHtml(r.request_id || "")}">
              <span class="recent-failure-icon">${iconSvg(finalOk ? "undo" : "alert")}</span>
              <span class="recent-failure-main">
                <strong class="mono">${escapeHtml(r.model || "-")}</strong>
                <small>${iconSvg("clock")} ${escapeHtml(fmtDate(r.finished_at))}</small>
              </span>
              <span class="recent-failure-metrics">
                <span class="recent-failure-status">${statusBadge(r.status, r.status_code)}</span>
                <span class="recent-failure-latency">${iconSvg("bolt")} ${escapeHtml(latency)}</span>
              </span>
              <span class="recent-failure-reason ${escapeHtml(toneForText(reason))}" title="${escapeHtml(reason)}">${highlightKeywords(reason)}</span>
            </button>
          `;
			}).join("")}
      </div>
    `);
			target.querySelectorAll("[data-request-id]").forEach((row) => {
				if (row.dataset.bounddatarequestid) return;
				row.dataset.bounddatarequestid = "1";
				row.addEventListener("click", () => {
					if (row.dataset.requestId) openRequestDetail(row.dataset.requestId);
				});
			});
			bindViewTargetButtons();
		}
		function renderRequestsTable() {
			const data = state.data.requests || {};
			const items = Array.isArray(data.items) ? data.items : [];
			const sourceLabel = data.source === "sqlite" ? t("req.source_sqlite") : t("req.source_memory");
			const total = Number(data.total || 0);
			const totalPages = Math.max(1, Math.ceil(total / 10));
			if (total > 0 && state.requestsPage >= totalPages) {
				state.requestsPage = totalPages - 1;
				refreshRuntimeData({ forceViewData: true });
				return;
			}
			syncRequestFilterUi();
			const currentPage = Math.min(state.requestsPage + 1, totalPages);
			const start = total ? state.requestsPage * 10 + 1 : 0;
			const end = total ? Math.min(total, start + items.length - 1) : 0;
			el("requestCountLabel").textContent = total ? t("req.matching_count", {
				total: fmtInt(total),
				source: sourceLabel,
				start: fmtInt(start),
				end: fmtInt(end)
			}) : t("req.no_matching_count", { source: sourceLabel });
			const target = el("requestsTable");
			const pageRoot = el("requestsView");
			const paginationTarget = el("requestToolbarPagination");
			const vitalsTarget = el("requestsPageVitals");
			const searchIcon = el("requestSearchIcon");
			if (searchIcon && !searchIcon.dataset.iconified) {
				updateDOM(searchIcon, iconSvg("search"));
				searchIcon.dataset.iconified = "1";
			}
			updateDOM(vitalsTarget, requestPageVisuals(items));
			updateDOM(paginationTarget, requestPagination(total, currentPage, totalPages, items));
			if (!items.length) {
				updateDOM(target, `<div class="empty pad">${escapeHtml(t("req.no_matching"))}</div>`);
				bindRequestPagination(paginationTarget, totalPages);
				updateRequestSelectionUi(pageRoot, items);
				return;
			}
			const rows = items.map(requestSummaryRow).join("");
			updateDOM(target, `
      <div class="request-table-scroll">
        <table class="request-data-table${items.length === 10 ? " is-full-page" : ""}">
          <caption class="sr-only">${escapeHtml(t("req.table_label"))}</caption>
          <thead>
            <tr>
              <th scope="col">${escapeHtml(t("req.col_model_time"))}</th>
              <th scope="col">${escapeHtml(t("req.meta_ip"))}</th>
              <th scope="col">${escapeHtml(t("req.col_status"))}</th>
              <th scope="col">${escapeHtml(t("req.provider"))}</th>
              <th scope="col">${escapeHtml(t("req.col_route"))}</th>
              <th scope="col" class="request-numeric-column">${escapeHtml(t("req.col_tokens_detail"))}</th>
              <th scope="col" class="request-numeric-column">${escapeHtml(t("req.col_cost_estimate"))}</th>
              <th scope="col" class="request-numeric-column">${escapeHtml(t("req.col_latency_ttft"))}</th>
              <th scope="col" class="request-open-column"><span class="sr-only">${escapeHtml(t("req.open"))}</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
			bindRequestRowInteractions(target);
			bindRequestPagination(paginationTarget, totalPages);
			updateRequestSelectionUi(pageRoot, items);
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
      ${requestVital(t("req.success_metric"), success, rows.length, "success")}
      ${requestVital(t("req.recovered_metric"), recovered, rows.length, "warning")}
      ${requestVital(t("req.failed_metric"), failed, rows.length, "danger")}
      <span class="request-vital request-vital-info">${iconSvg("clock")}<strong>${avgFirstByte === null ? "-" : escapeHtml(fmtMs(avgFirstByte))}</strong><small>${escapeHtml(t("req.first_event_metric"))}</small></span>
      <span class="request-vital request-vital-compat">${iconSvg("activity")}<strong>${escapeHtml(fmtTokenCount(totalTokens))}</strong><small>${escapeHtml(t("req.tokens_metric"))}</small></span>
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
			const failedAttempts = (Array.isArray(r.attempts) ? r.attempts : []).filter((attempt) => attempt.outcome !== "success").length;
			const provider = primaryProvider(r);
			const route = r.routing_summary?.outcome || "unknown";
			const code = Number(r.status_code || 0);
			const firstByte = firstByteMsFromRequest(r);
			const requestId = String(r.request_id || "");
			const source = String(r.client_ip || "-");
			const sourceTip = r.client_ip_source ? `${source} · ${String(r.client_ip_source)}` : source;
			const requestTime = fmtRequestDateParts(r.finished_at);
			const tokenTip = [
				`${t("tokens.uncached")}: ${fmtInt(usage.uncached_input_tokens)}`,
				`${t("tokens.cached")}: ${fmtInt(usage.cached_input_tokens)}`,
				`${t("tokens.cache_write")}: ${fmtInt(usage.cache_write_tokens)}`,
				`${t("tokens.output")}: ${fmtInt(usage.output_tokens)}`,
				`${t("tokens.reasoning")}: ${fmtInt(usage.reasoning_tokens)}`,
				`${t("req.meta_effort")}: ${reasoningEffortLabel(r.reasoning_effort)}`
			].join(" · ");
			const recoveryText = failedAttempts > 0 && code < 400 ? t("req.recovered_count", { count: fmtInt(failedAttempts) }) : routeOutcomeLabel(route);
			const firstEventTone = firstByte >= 3e4 ? "is-danger" : firstByte >= 15e3 ? "is-warning" : "";
			const durationTone = Number(r.duration_ms || 0) >= 6e4 ? "is-warning" : "";
			return `
      <tr class="request-data-row tone-${escapeHtml(statusTone)}" data-request-row="${escapeHtml(requestId)}">
        <td class="request-cell-request">
          <span class="request-model-mark" data-tip="${escapeHtml(r.model || "-")}" aria-hidden="true">${modelBrandIconMarkup(r.model, iconSvg("boxes"))}</span>
          <span class="request-identity">
            <strong class="mono" data-tip="${escapeHtml(r.model || "-")}">${escapeHtml(r.model || "-")}</strong>
            <small>
              <time datetime="${escapeHtml(requestTime.iso)}">${escapeHtml(requestTime.date)} ${escapeHtml(requestTime.time)}</time>
              ${requestFormatBadge(r)}
              ${r.stream ? `<span class="request-meta-chip request-stream-chip" data-tip="${escapeHtml(t("req.streaming"))}">${iconSvg("activity")}${escapeHtml(t("req.streaming"))}</span>` : ""}
              <span class="request-meta-chip request-reasoning-chip effort-${escapeHtml(reasoningEffortTone(r.reasoning_effort))}" data-tip="${escapeHtml(reasoningEffortTip(r.reasoning_effort))}">${iconSvg("bolt")}${escapeHtml(reasoningEffortLabel(r.reasoning_effort))}</span>
            </small>
          </span>
        </td>
        <td class="request-cell-client-ip"><span class="request-client-ip mono" data-tip="${escapeHtml(sourceTip)}">${escapeHtml(source)}</span></td>
        <td class="request-cell-result"><span>${statusBadge(r.status, r.status_code)}</span><small class="mono">${code || "-"}</small></td>
        <td class="request-cell-provider">
          <span class="request-provider-chip" data-tip="${escapeHtml(provider)}">${providerBrandIconMarkup(provider, iconSvg("server"))}<strong>${escapeHtml(provider)}</strong></span>
        </td>
        <td class="request-cell-route">
          <span class="request-route-chip tone-${escapeHtml(routeOutcomeTone(route))}">${iconSvg(routeOutcomeIcon(route))}${escapeHtml(recoveryText)}</span>
        </td>
        <td class="request-cell-usage" data-tip="${escapeHtml(tokenTip)}">
          <span class="request-token-block mono"><strong>${escapeHtml(fmtTokenCount(usage.total_tokens))}</strong><small>${escapeHtml(fmtTokenCount(usage.input_tokens))} / ${escapeHtml(fmtTokenCount(usage.output_tokens))}</small></span>
        </td>
        <td class="request-cell-cost">
          <span class="request-cost-chip">${renderCost({
				...r,
				cost_usd: usage.cost_usd
			}, { compact: true })}</span>
        </td>
        <td class="request-cell-performance mono"><span class="request-latency-chip"><strong class="${firstEventTone}">${firstByte ? escapeHtml(fmtCompactMs(firstByte)) : "-"}</strong><i aria-hidden="true">/</i><small class="${durationTone}">${escapeHtml(fmtCompactMs(r.duration_ms))}</small></span></td>
        <td class="request-row-open"><button class="icon-action request-row-open-button" type="button" data-request-open="${escapeHtml(requestId)}" aria-label="${escapeHtml(t("req.open_request", { id: requestId }))}">${iconSvg("chevron-right")}</button></td>
      </tr>
    `;
		}
		function requestFormatBadge(request) {
			const clientFormat = String(request?.client_format || request?.endpoint || "").trim();
			const finalUpstreamFormat = String(request?.routing_summary?.final_upstream_format || "").trim();
			const converted = Boolean(clientFormat && finalUpstreamFormat && clientFormat !== finalUpstreamFormat);
			const displayFormat = converted ? finalUpstreamFormat : clientFormat;
			const label = shortFormatLabel(displayFormat);
			const tip = converted ? `${formatLabel(clientFormat)} → ${formatLabel(finalUpstreamFormat)}` : formatLabel(clientFormat);
			return `<span class="request-meta-chip request-format-chip format-${escapeHtml(displayFormat === "chat_completions" ? "chat" : displayFormat === "responses" ? "responses" : displayFormat === "anthropic_messages" ? "messages" : "neutral")}${converted ? " is-converted" : ""}" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${converted ? iconSvg("arrow-right-left") : ""}${escapeHtml(label)}</span>`;
		}
		var REASONING_EFFORT_BUDGET_STEPS = [
			[1024, "minimal"],
			[2048, "low"],
			[4096, "medium"],
			[8192, "high"],
			[16384, "xhigh"]
		];
		function reasoningEffortLabel(value) {
			const raw = String(value || "").trim().toLowerCase();
			if (!raw || raw === "on" || raw === "default") return "default";
			const budgetMatch = raw.match(/^budget:(\d+)$/);
			if (budgetMatch) {
				const budget = Number(budgetMatch[1]);
				for (const [limit, label] of REASONING_EFFORT_BUDGET_STEPS) if (budget <= limit) return label;
				return "xhigh";
			}
			return raw;
		}
		function reasoningEffortTone(value) {
			switch (reasoningEffortLabel(value)) {
				case "off": return "off";
				case "minimal": return "minimal";
				case "low": return "low";
				case "medium": return "medium";
				case "high": return "high";
				case "xhigh":
				case "max":
				case "extra_high": return "xhigh";
				default: return "default";
			}
		}
		function reasoningEffortTip(value) {
			const raw = String(value || "").trim().toLowerCase();
			const label = reasoningEffortLabel(raw);
			const base = t("req.meta_effort");
			return raw && raw !== label ? `${base}: ${raw}` : base;
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
			const visibleCount = (Array.isArray(visibleItems) ? visibleItems : []).length;
			const start = total ? state.requestsPage * 10 + 1 : 0;
			const end = total ? Math.min(total, start + Number(visibleCount || 0) - 1) : 0;
			const navigationBusy = Boolean(_requestPageNavigation);
			return `
      <div class="request-page-summary">
        <span>${escapeHtml(t("req.range_of", {
				start: fmtInt(start),
				end: fmtInt(end),
				total: fmtInt(total)
			}))}</span>
      </div>
      <div class="request-pagination" aria-label="${escapeHtml(t("req.request_pages"))}" ${navigationBusy ? "aria-busy=\"true\"" : ""}>
        <button class="button secondary icon-action" type="button" data-request-page="prev" data-tip="${escapeHtml(t("req.previous_page"))}" aria-label="${escapeHtml(t("req.previous_page"))}" ${navigationBusy || currentPage <= 1 ? "disabled" : ""}>${iconSvg("arrow-left")}</button>
        <span class="request-page-indicator">${escapeHtml(t("req.page_of", {
				page: fmtInt(currentPage),
				total: fmtInt(totalPages)
			}))}</span>
        <button class="button secondary icon-action" type="button" data-request-page="next" data-tip="${escapeHtml(t("req.next_page"))}" aria-label="${escapeHtml(t("req.next_page"))}" ${navigationBusy || currentPage >= totalPages ? "disabled" : ""}>${iconSvg("arrow-right")}</button>
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
					if (event.target.closest("input, button, a")) return;
					open();
				});
			});
			root.querySelectorAll("[data-request-open]").forEach((button) => {
				button.addEventListener("click", () => openRequestDetail(button.dataset.requestOpen || ""));
			});
		}
		function updateRequestSelectionUi() {
			const deleteButton = el("deleteRequestsButton");
			if (deleteButton) {
				if (!deleteButton.dataset.iconified) {
					updateDOM(deleteButton, iconSvg("trash"));
					deleteButton.dataset.iconified = "1";
				}
				const filters = activeRequestFilters();
				const action = Object.keys(filters).length ? "Delete matching" : "Clear history";
				deleteButton.title = action;
				deleteButton.setAttribute("aria-label", action);
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
			if (!root || root.dataset.requestPaginationBound) return;
			root.dataset.requestPaginationBound = "1";
			root.addEventListener("click", (event) => {
				const button = event.target?.closest?.("[data-request-page]");
				if (!button || !root.contains(button) || button.disabled || _requestPageNavigation) return;
				const direction = button.dataset.requestPage;
				const currentPage = Math.max(0, Number(state.requestsPage) || 0);
				const currentTotal = Number(state.data.requests?.total || 0);
				const targetPage = requestPageTarget(currentPage, currentTotal > 0 ? Math.max(1, Math.ceil(currentTotal / 10)) : totalPages, direction);
				if (targetPage === currentPage) return;
				_requestPageNavigation = {
					from: currentPage,
					to: targetPage
				};
				state.requestsPage = targetPage;
				root.querySelectorAll("[data-request-page]").forEach((control) => {
					control.disabled = true;
				});
				root.querySelector(".request-pagination")?.setAttribute("aria-busy", "true");
				state.forceRequestsFetch = true;
				refreshRuntimeData({ forceViewData: true });
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
			bindPanelPaginationDelegated(root, ({ pageKey, direction }) => {
				if (!changePanelPage(state, pageKey, direction)) return;
				if (pageKey === "providersPage") {
					state.forceProvidersRender = true;
					renderProvidersTable();
					return;
				}
				if (pageKey === "configProvidersPage") {
					state.forceConfigRender = true;
					renderConfigProviders(state.data.config || {});
					return;
				}
				if (pageKey === "modelRoutesPage") {
					state.forceModelRoutesRender = true;
					renderModelRoutes(state.data.config || {});
					return;
				}
				if (pageKey === "providerModelMapPage") {
					renderProviderModelMap(state.data.config || {});
					return;
				}
				if (pageKey === "auditPage") {
					renderAuditTrail();
					return;
				}
				renderAll();
			});
		}
		function renderProvidersTable() {
			const providers = state.data.status?.router?.providers || {};
			const configProviders = state.data.config?.providers || {};
			const target = el("providersTable");
			if (!target) return;
			providerCompatibilityToolbar();
			if (!state.forceProvidersRender && shouldPreserveContainer("#providersTable")) return;
			state.forceProvidersRender = false;
			const allNames = providerNames(providers, configProviders);
			const filtered = allNames.map((name) => providerLightView(name)).filter(providerMatchesFiltersLight).sort(compareProviderViews);
			if (!allNames.length) {
				updateDOM(target, `<div class="empty pad">No providers configured</div>`);
				return;
			}
			if (!filtered.length) {
				updateDOM(target, `<div class="empty pad">No providers match the current filters</div>`);
				return;
			}
			const page = paginate(filtered, "providersPage", 8);
			const visibleCards = page.items.map((view) => providerViewModel(view.name));
			updateDOM(target, `
      ${panelPagination("providersPage", page, "providers")}
      <div class="provider-card-grid">${visibleCards.map(providerRuntimeCard).join("")}</div>
    `);
			bindPanelPagination(target);
			bindActionButtons(target);
			bindProviderCards(target);
		}
		function providerCompatibilityToolbar() {
			const target = el("providerCompatibilityToolbar");
			if (!target) return;
			const circuits = state.data.status?.router?.compatibility_circuits || {};
			const active = Math.max(0, Number(circuits.active || 0));
			if (!active) {
				updateDOM(target, "");
				target.hidden = true;
				return;
			}
			target.hidden = false;
			updateDOM(target, `
      <span class="provider-compatibility-icon">${iconSvg("alert")}</span>
      <span class="provider-compatibility-copy">
        <strong>${escapeHtml(t("prov.compatibility_active", { count: fmtInt(active) }))}</strong>
        <small>${escapeHtml(t("prov.compatibility_recovery", { time: fmtNextProbe(Number(circuits.nearest_recovery_s || 0)) || "0s" }))}</small>
      </span>
      <button class="button provider-compatibility-clear" type="button" data-clear-compatibility="all">${iconSvg("rotate")}<span>${escapeHtml(t("prov.compatibility_clear_all"))}</span></button>
    `);
			bindCompatibilityClearButtons(target);
		}
		function bindCompatibilityClearButtons(root) {
			root?.querySelectorAll("[data-clear-compatibility]").forEach((button) => {
				if (button.dataset.boundClearCompatibility) return;
				button.dataset.boundClearCompatibility = "1";
				button.addEventListener("click", async () => {
					const scope = button.dataset.clearCompatibility || "all";
					const all = scope === "all";
					const label = all ? t("prov.compatibility_clear_all") : scope;
					if (!await openConfirmDialog({
						title: t("confirm.clear_compatibility.title"),
						message: t("confirm.clear_compatibility.msg", { scope: label }),
						acceptLabel: t("confirm.clear")
					})) return;
					const path = all ? "/-/admin/compatibility/clear" : `/-/admin/providers/${encodeURIComponent(scope)}/compatibility/clear`;
					await runExclusiveUiAction(`compatibility:${scope}`, async () => {
						button.disabled = true;
						try {
							const result = await apiPost(path, {});
							applyMutationResult(result, { drawer: true });
							setNotice(t("notice.compatibility_cleared", { count: fmtInt(result.removed || 0) }), "ok");
							await refreshRuntimeData({ forceViewData: false });
						} catch (err) {
							setNotice(t("notice.action_failed", { error: err.message }), "bad");
						} finally {
							button.disabled = false;
						}
					});
				});
			});
		}
		function providerNames(runtimeProviders, configProviders) {
			return Array.from(new Set([...Object.keys(runtimeProviders || {}), ...Object.keys(configProviders || {})])).filter((name) => !configProviders?.[name]?.pending_delete).sort();
		}
		function providerViewModel(name) {
			const __t0 = performance.now();
			const runtime = state.data.status?.router?.providers?.[name] || {};
			const config = state.data.config?.providers?.[name] || {};
			const capability = state.data.status?.models?.providers?.[name] || {};
			const formats = config.formats || runtime.formats || {};
			const runtimeKeys = Array.isArray(runtime.keys) ? runtime.keys : [];
			const configKeys = Array.isArray(config.keys) ? config.keys : null;
			const keys = mergedProviderKeys(runtimeKeys, configKeys);
			const keyStats = providerKeyStats(runtimeKeys, configKeys);
			const formatNames = enabledFormats(formats);
			const __t1 = performance.now();
			const modelItems = providerModelItems(name, capability);
			const __t2 = performance.now();
			const routeModels = providerRouteModels(name);
			const __t3 = performance.now();
			const activity = providerActivity(name);
			const compatibilityCircuits = (state.data.status?.router?.compatibility_circuits?.entries || []).filter((entry) => entry.provider === name);
			const runtimeState = providerRuntimeState(runtime, keyStats, config);
			const __t4 = performance.now();
			window.__perfMark && window.__perfMark("viewModel.modelItems[" + name + "]", __t2 - __t1);
			window.__perfMark && window.__perfMark("viewModel.routeModels[" + name + "]", __t3 - __t2);
			window.__perfMark && window.__perfMark("viewModel.total[" + name + "]", __t4 - __t0);
			return {
				name,
				runtime,
				config,
				priority: Number(runtime.priority ?? config.priority ?? 0),
				capability,
				formats,
				keys,
				configKeys: configKeys || [],
				keyStats,
				formatNames,
				modelItems,
				routeModels,
				activity,
				compatibilityCircuits,
				runtimeState
			};
		}
		function providerLightView(name) {
			const runtime = state.data.status?.router?.providers?.[name] || {};
			const config = state.data.config?.providers?.[name] || {};
			const formats = config.formats || runtime.formats || {};
			const keyStats = providerKeyStats(Array.isArray(runtime.keys) ? runtime.keys : [], Array.isArray(config.keys) ? config.keys : null);
			const formatNames = enabledFormats(formats);
			const activity = providerActivity(name);
			const runtimeState = providerRuntimeState(runtime, keyStats, config);
			const capability = state.data.status?.models?.providers?.[name] || {};
			const modelCountLite = (Array.isArray(capability.models) ? capability.models.length : 0) || Object.keys(capability.canonical_map || {}).length;
			return {
				name,
				runtime,
				config,
				priority: Number(runtime.priority ?? config.priority ?? 0),
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
		function providerKeyStats(runtimeKeys, configKeys) {
			const visibleKeys = mergedProviderKeys(runtimeKeys, configKeys);
			return {
				total: visibleKeys.length,
				usable: visibleKeys.filter((key) => key.available && key.runtime_enabled).length,
				runtimeEnabled: visibleKeys.filter((key) => key.runtime_enabled).length,
				cooldown: visibleKeys.filter((key) => Number(key.cooldown_remaining_s || key.disabled_remaining_s || 0) > 0).length,
				fails: visibleKeys.reduce((sum, key) => sum + Number(key.fails || 0), 0)
			};
		}
		function providerModelItemsCapability(provider) {
			return state.data.status?.models?.providers?.[provider] || {};
		}
		function providerModelItems(name, capability) {
			const base = modelCapabilityItemsMemo(name, Array.isArray(capability.models) ? capability.models : [], capability.canonical_map || {});
			const configuredMap = state.data.config?.models?.provider_model_map?.[name] || {};
			const items = mergeProviderModelCatalogItems(base, configuredMap);
			const visibleLabels = new Set(items.map((item) => String(item.label || "").trim().toLowerCase()));
			const claimedRaws = new Set(Object.values(configuredMap || {}).filter((raw) => String(raw || "").trim()).map((raw) => String(raw).trim().toLowerCase()));
			const replacedLegacyNames = /* @__PURE__ */ new Set();
			base.forEach((item) => {
				const raw = String(item?.raw || item?.label || "").trim().toLowerCase();
				const label = String(item?.label || "").trim().toLowerCase();
				if (raw && claimedRaws.has(raw) && !visibleLabels.has(label)) replacedLegacyNames.add(String(item?.label || "").trim());
			});
			const legacyRouteRefs = [];
			providerRouteModels(name).forEach((model) => {
				const normalized = String(model || "").trim().toLowerCase();
				if (!normalized || visibleLabels.has(normalized)) return;
				if (replacedLegacyNames.has(String(model || "").trim())) {
					legacyRouteRefs.push(String(model || "").trim());
					return;
				}
				items.push({
					label: model,
					raw: "",
					title: model,
					manual: false
				});
				visibleLabels.add(normalized);
			});
			const mappedItems = items.map((item) => {
				const sourceModel = providerModelSourceId(item);
				return {
					...item,
					sourceModel,
					disabled: isProviderModelDisabled(name, sourceModel),
					pending: Object.prototype.hasOwnProperty.call(providerModelDraft(name), sourceModel)
				};
			});
			mappedItems.legacyRouteRefs = legacyRouteRefs;
			return mappedItems;
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
			const keyUsable = view.keyStats.usable;
			const keyTotal = view.keyStats.total;
			const keyTone = keyUsable === 0 && keyTotal > 0 ? "bad" : keyUsable < keyTotal ? "warn" : "ok";
			const successRate = view.activity.successRate;
			const successText = successRate === null ? "—" : fmtPct(successRate);
			const latencyText = view.activity.latestLatency ? fmtCompactMs(view.activity.latestLatency) : "—";
			const modelCount = view.modelItems.length;
			const sparkStats = providerSparklineStats(view.activity);
			view.runtimeState.id;
			const successTone = successRate === null ? "neutral" : successRate >= .9 ? "ok" : successRate >= .5 ? "warn" : "bad";
			const latencyTone = view.activity.latestLatency ? view.activity.latestLatency <= 800 ? "ok" : view.activity.latestLatency <= 2500 ? "warn" : "bad" : "neutral";
			return `
      <article class="provider-runtime-card provider-health-tile ${view.runtimeState.tone}" data-provider-card="${escapeHtml(view.name)}">
        <div class="provider-card-topline">
          ${providerServerIconMarkup(view.config, view.name)}
          <div class="provider-title-block">
            <div class="provider-name name-${view.runtimeState.badge}" title="${escapeHtml(view.name)}">${escapeHtml(view.name)}</div>
          </div>
          <button class="provider-card-settings-btn" type="button" data-provider-open="${escapeHtml(view.name)}" title="Settings" aria-label="Provider settings">${iconSvg("settings")}</button>
          <div class="provider-meta">${view.formatNames.length ? view.formatNames.map(formatChip).join("") : `<span class="muted">No formats</span>`}<span class="priority-chip prio-${view.priority >= 10 ? "hi" : view.priority >= 5 ? "mid" : "lo"}" title="Priority ${view.priority}">P${view.priority}</span><span class="provider-state-badge provider-state-badge-inline tone-${view.runtimeState.badge}">${escapeHtml(view.runtimeState.label)}</span></div>
        </div>
        <div class="provider-card-signal">
          <span class="provider-signal-item ${escapeHtml(successTone)}" title="Success rate">${iconSvg("activity")}<strong>${escapeHtml(successText)}</strong><small>success</small></span>
          <span class="provider-signal-item model-count" title="${escapeHtml(`${fmtInt(modelCount)} available models`)}">${iconSvg("boxes")}<strong>${escapeHtml(view.capability.status === "pending" ? "..." : fmtInt(modelCount))}</strong><small>models</small></span>
          <span class="provider-signal-item ${escapeHtml(latencyTone)}" title="Latest first byte latency">${iconSvg("clock")}<strong>${escapeHtml(latencyText)}</strong><small>ttfb</small></span>
        </div>
        ${providerProbeSummary(view.activity.lastProbe)}
        ${providerSparkline(view.activity, view.name)}

        <div class="provider-card-footer">
          <div class="provider-card-stats">
            ${compactStatInline("key", `${fmtInt(keyUsable)}/${fmtInt(keyTotal)}`, keyTone)}
            ${compactStatInline("activity", `${fmtInt(sparkStats.calls)}x`, sparkStats.calls ? "neutral" : "neutral")}
            ${compactStatInline("clock", sparkStats.avg === null ? "—" : fmtCompactMs(sparkStats.avg), sparkStats.avg === null ? "neutral" : sparkStats.avg <= 800 ? "ok" : sparkStats.avg <= 2500 ? "warn" : "bad")}
          </div>
          <div class="provider-runtime-actions">
            <button class="button primary compact-action icon-action" type="button" data-provider-open="${escapeHtml(view.name)}" title="Details" aria-label="Details">${iconSvg("info")}</button>
            ${actionButton(view.runtime.runtime_enabled !== false ? "Disable" : "Enable", `/providers/${encodeURIComponent(view.name)}/${view.runtime.runtime_enabled !== false ? "disable" : "enable"}`, view.runtime.runtime_enabled !== false ? "danger" : "secondary", { iconOnly: true })}
            ${actionButton("Clear cooldown", `/providers/${encodeURIComponent(view.name)}/cooldown/clear`, "secondary", { iconOnly: true })}
          </div>
        </div>
      </article>
    `;
		}
		function compactStatInline(iconName, value, tone) {
			return `<span class="provider-stat ${tone || ""}" title="${escapeHtml(value)}">${iconSvg(iconName)}<strong>${escapeHtml(value)}</strong></span>`;
		}
		function providerSiteUrl(value) {
			const raw = String(value || "").trim();
			if (!raw) return "";
			try {
				const parsed = new URL(raw);
				return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
			} catch (_error) {
				return "";
			}
		}
		function providerServerIconMarkup(providerConfig, providerName) {
			const siteUrl = providerSiteUrl(providerConfig?.site_url);
			const label = t("prov.open_site", { name: providerName });
			if (!siteUrl) return `<span class="provider-server-icon" aria-hidden="true">${iconSvg("server")}</span>`;
			return `<a class="provider-server-icon" href="${escapeHtml(siteUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${iconSvg("server")}</a>`;
		}
		function probeTone(probe = {}) {
			const outcome = String(probe.outcome || "");
			if (outcome === "success") return "ok";
			if (String(probe.action || "") === "observed_only") return "warn";
			if (outcome === "failed") return "bad";
			return "neutral";
		}
		function idleTierLabel(tier) {
			return {
				cold_start: {
					text: "cold start",
					title: "No request has ever completed — 45s cadence",
					tone: "neutral"
				},
				recent: {
					text: "recent",
					title: "Last request < 2 min ago — 30s cadence",
					tone: "ok"
				},
				medium: {
					text: "medium",
					title: "Last request 2-10 min ago — 60s cadence",
					tone: "ok"
				},
				long: {
					text: "long",
					title: "Last request 10-30 min ago — 5 min cadence",
					tone: "warn"
				},
				deep: {
					text: "deep",
					title: "Last request 30+ min ago — 3-6h random cadence",
					tone: "soft"
				}
			}[tier] || null;
		}
		function renderIdleStateBar() {
			const is = state.data.metrics?.idle_state;
			if (!is) return "";
			const tierInfo = idleTierLabel(is.tier);
			if (!tierInfo) return "";
			const idleDesc = is.idle_seconds >= 0 ? `idle ${fmtNextProbe(is.idle_seconds)}` : "no request yet";
			return `
      <div class="idle-state-bar" title="${escapeHtml(tierInfo.title)}">
        ${iconSvg("radar")}
        <span class="idle-state-tier tone-${escapeHtml(tierInfo.tone)}">${escapeHtml(tierInfo.text)}</span>
        <span class="idle-state-sep">·</span>
        <span class="idle-state-cadence">cadence ${escapeHtml(fmtNextProbe(is.next_probe_in_s))}</span>
        <span class="idle-state-sep">·</span>
        <span class="idle-state-idle">${escapeHtml(idleDesc)}</span>
      </div>
    `;
		}
		function fmtNextProbe(s) {
			if (!s || s <= 0) return "";
			if (s < 60) return `${s}s`;
			if (s < 3600) return `${Math.round(s / 60)}m`;
			return `${(s / 3600).toFixed(1)}h`;
		}
		function fmtProbeTime(ts) {
			const n = Number(ts || 0);
			if (!n) return "";
			const d = /* @__PURE__ */ new Date(n * 1e3);
			return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		}
		function providerProbeSummary(probe) {
			if (!probe) return `<div class="provider-probe-summary empty" title="No background health probe yet">${iconSvg("radar")}<span>No health probe yet</span></div>`;
			const tone = probeTone(probe);
			const reason = probe.reason || probe.error_type || probe.outcome || "probe";
			const isPatrol = String(probe.idle_tier || "") === "patrol";
			const baseLabel = tone === "ok" ? "Probe OK" : tone === "bad" ? "Probe failed" : "Probe observed";
			const label = isPatrol ? `Patrol · ${baseLabel}` : baseLabel;
			const detail = probe.latency_ms != null ? fmtCompactMs(probe.latency_ms) : probe.http_status ? `HTTP ${fmtInt(probe.http_status)}` : "";
			return `
      <div class="provider-probe-summary tone-${escapeHtml(tone)}${isPatrol ? " patrol-probe" : ""}" title="${escapeHtml(reason)}">
        ${iconSvg(isPatrol ? "shield" : "radar")}
        <span>${escapeHtml(label)}</span>
        ${detail ? `<small>${escapeHtml(detail)}</small>` : ""}
      </div>
    `;
		}
		function providerProbeRow(probe) {
			const tone = probeTone(probe);
			const reason = probe.reason || probe.error_type || probe.outcome || "probe";
			const action = probe.action || "none";
			const model = probe.model || "-";
			const isPatrol = String(probe.idle_tier || "") === "patrol";
			const tierInfo = idleTierLabel(probe.idle_tier);
			const tierLabel = isPatrol ? {
				text: "patrol",
				title: "Patrol health checker — full sweep every 6–12h",
				tone: "info"
			} : tierInfo;
			const meta = [
				probe.format || "",
				probe.model_source ? `source:${probe.model_source}` : "",
				probe.key_index >= 0 ? `key ${probe.key_index}` : "",
				tierInfo ? `tier:${tierInfo.text}` : "",
				probe.next_probe_in_s ? `next:${fmtNextProbe(probe.next_probe_in_s)}` : ""
			].filter(Boolean).join(" · ");
			const timing = probe.latency_ms != null ? fmtMs(probe.latency_ms) : probe.http_status ? `HTTP ${fmtInt(probe.http_status)}` : "-";
			const tierBadge = tierLabel ? `<span class="probe-tier-badge tone-${escapeHtml(tierLabel.tone)}${isPatrol ? " patrol-badge" : ""}" title="${escapeHtml(tierLabel.title)}">${escapeHtml(tierLabel.text)}</span>` : "";
			const nextBadge = probe.next_probe_in_s ? `<span class="probe-next-badge" title="Next probe in ~${fmtNextProbe(probe.next_probe_in_s)}">→ ${escapeHtml(fmtNextProbe(probe.next_probe_in_s))}</span>` : "";
			const timeStr = fmtProbeTime(probe.ts);
			const timeBadge = timeStr ? `<span class="probe-time-badge" title="${escapeHtml(fmtDate(probe.ts))}">${escapeHtml(timeStr)}</span>` : "";
			return `
      <div class="provider-probe-row tone-${escapeHtml(tone)}">
        <span class="provider-status-dot ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : ""}"></span>
        <strong title="${escapeHtml(reason)}">${escapeHtml(reason)}</strong>
        <span title="${escapeHtml(model)}">${escapeHtml(model)}</span>
        <small title="${escapeHtml(meta)}">${escapeHtml(meta || "-")}</small>
        <em title="${escapeHtml(action)}">${escapeHtml(action)}</em>
        <b>${escapeHtml(timing)}</b>
        ${tierBadge}
        ${nextBadge}
        ${timeBadge}
      </div>
    `;
		}
		function providerSparklineStats(activity) {
			const events = recentProviderActivityEvents(activity?.events);
			const latencies = events.map((event) => Math.max(0, Number(event.latencyMs) || 0));
			const avg = latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null;
			const failed = events.filter((event) => event.ok === false || event.status === "failed").length;
			return {
				calls: events.length,
				avg,
				failed,
				latencies,
				events
			};
		}
		function providerSparkline(activity, providerName) {
			const stats = providerSparklineStats(activity);
			const events = stats.events;
			const slotCount = 40;
			const barW = 3.4;
			const gap = 6;
			const svgPad = .5;
			const svgW = 238.4;
			const emptyBars = Array.from({ length: slotCount }, (_, index) => `<rect class="is-empty-slot" x="${svgPad + index * gap}" y="0.5" width="${barW}" height="13" rx="1.7"></rect>`).join("");
			if (!events.length) return `
        <div class="provider-sparkline provider-call-strip is-empty" title="No recent provider activity">
          <svg class="provider-call-bars" viewBox="0 0 ${svgW} 14" preserveAspectRatio="none" aria-hidden="true">${emptyBars}</svg>
          <div class="provider-call-axis"><span>PAST</span><span>NOW</span></div>
        </div>
      `;
			const failed = stats.failed;
			const slow = events.filter((event) => Number(event.latencyMs || 0) > 5e3).length;
			const tone = failed ? "bad" : slow ? "warn" : "ok";
			const avg = stats.avg || 0;
			const start = Math.max(0, slotCount - events.length);
			const eventBars = events.map((event, index) => {
				const latency = Math.max(0, Number(event.latencyMs) || 0);
				const bad = event.ok === false || event.status === "failed";
				const warn = !bad && latency > 5e3;
				const label = `${bad ? "failed" : warn ? "slow" : "ok"} / ${fmtCompactMs(latency || avg)}`;
				const slot = Math.min(slotCount - 1, start + index);
				return `<rect class="${bad ? "is-bad" : warn ? "is-warn" : "is-ok"}" x="${svgPad + slot * gap}" y="0.5" width="${barW}" height="13" rx="1.7"><title>${escapeHtml(label)}</title></rect>`;
			}).join("");
			return `
      <div class="provider-sparkline provider-call-strip tone-${escapeHtml(tone)}" title="${escapeHtml(`${providerName}: ${events.length} recent calls / avg ${fmtCompactMs(avg)} / ${failed} failed`)}">
        <svg class="provider-call-bars" viewBox="0 0 ${svgW} 14" preserveAspectRatio="none" aria-hidden="true">${emptyBars}${eventBars}</svg>
        <div class="provider-call-axis"><span>PAST</span><span>NOW</span></div>
      </div>
    `;
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
		function bindProviderCards(target) {
			target.querySelectorAll("[data-provider-open]").forEach((button) => {
				if (button.dataset.bounddataprovideropen) return;
				button.dataset.bounddataprovideropen = "1";
				button.addEventListener("click", (event) => {
					event.stopPropagation();
					openProviderDrawer(button.dataset.providerOpen || "");
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
			_lastDrawerRenderSignature = "";
			resetProviderActivityEventsCache("");
			clearDirty("#providerDrawer");
		}
		function providerDrawerTabMeta(tab) {
			return {
				overview: {
					label: t("prov.tab_overview"),
					icon: "activity"
				},
				keys: {
					label: t("prov.tab_keys"),
					icon: "key"
				},
				models: {
					label: t("prov.tab_models"),
					icon: "boxes"
				},
				routing: {
					label: t("prov.tab_routing"),
					icon: "radar"
				},
				config: {
					label: t("prov.tab_config"),
					icon: "settings"
				}
			}[tab] || {
				label: capitalize(tab),
				icon: "dot"
			};
		}
		var _lastDrawerRenderSignature = "";
		function providerDrawerRenderSignature(name) {
			try {
				return JSON.stringify([
					name,
					state.providerDrawerTab,
					getLang(),
					state.data.config?.providers?.[name] ?? null,
					state.data.status?.router?.providers?.[name] ?? null,
					state.data.status?.models?.providers?.[name] ?? null,
					state.data.status?.router?.compatibility_circuits ?? null,
					state.data.providerActivity?.[name] ?? null
				]);
			} catch (_err) {
				return "";
			}
		}
		function renderProviderDrawer({ force = false } = {}) {
			const drawer = el("providerDrawer");
			const body = el("providerDrawerBody");
			const name = state.providerDrawerName;
			if (!drawer || !body || !name || !drawer.classList.contains("is-open")) return;
			if (!force && shouldPreserveContainer("#providerDrawer")) return;
			const signature = providerDrawerRenderSignature(name);
			if (!force && signature === _lastDrawerRenderSignature) return;
			if (!force && drawer.matches(":hover")) {
				_lastDrawerRenderSignature = "";
				return;
			}
			_lastDrawerRenderSignature = signature;
			const view = providerViewModel(name);
			const tabs = [
				"overview",
				"keys",
				"models",
				"routing",
				"config"
			];
			if (!tabs.includes(state.providerDrawerTab)) state.providerDrawerTab = "overview";
			const drawerIconSlot = el("providerDrawerIconSlot");
			if (drawerIconSlot) updateDOM(drawerIconSlot, providerServerIconMarkup(view.config, name));
			const drawerTitleText = el("providerDrawerTitleText");
			if (drawerTitleText) drawerTitleText.textContent = name;
			else el("providerDrawerTitle").textContent = name;
			el("providerDrawerSubtitle").textContent = t("prov.drawer_runtime_summary", {
				state: view.runtimeState.label,
				usable: view.keyStats.usable,
				total: view.keyStats.total,
				models: fmtInt(view.modelItems.length)
			});
			updateDOM(body, `
      <div class="provider-drawer-tabs" role="tablist" aria-label="${escapeHtml(t("prov.drawer_sections"))}">
        ${tabs.map((tab) => {
				const meta = providerDrawerTabMeta(tab);
				const active = state.providerDrawerTab === tab;
				return `
          <button class="provider-drawer-tab ${active ? "is-active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}" data-provider-drawer-tab="${escapeHtml(tab)}">
            <span class="provider-drawer-tab-icon">${iconSvg(meta.icon)}</span>
            <span class="provider-drawer-tab-label">${escapeHtml(meta.label)}</span>
          </button>
        `;
			}).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
			bindProviderDrawerEvents(body);
			if (state.providerDrawerTab === "overview") loadProviderActivityEvents(name);
			mutationBusyTracker.refresh();
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
      <div class="provider-drawer-tabs" role="tablist" aria-label="${escapeHtml(t("prov.drawer_sections"))}">
        ${tabs.map((tab) => {
				const meta = providerDrawerTabMeta(tab);
				const active = state.providerDrawerTab === tab;
				return `
          <button class="provider-drawer-tab ${active ? "is-active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" title="${escapeHtml(meta.label)}" aria-label="${escapeHtml(meta.label)}" data-provider-drawer-tab="${escapeHtml(tab)}">
            <span class="provider-drawer-tab-icon">${iconSvg(meta.icon)}</span>
            <span class="provider-drawer-tab-label">${escapeHtml(meta.label)}</span>
          </button>
        `;
			}).join("")}
      </div>
      ${providerDrawerPanel(view)}
    `);
			bindProviderDrawerEvents(body);
			_lastDrawerRenderSignature = providerDrawerRenderSignature(name);
			if (state.providerDrawerTab === "overview") loadProviderActivityEvents(name);
			mutationBusyTracker.refresh();
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
			bindCompatibilityClearButtons(root);
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
					const input = form.elements.namedItem("static_models");
					const raw = String(input?.value || "").trim();
					const models = mergeStaticModelIds(state.data.config?.providers?.[provider]?.static_models || [], raw);
					if (await runConfigMutation(form, async () => {
						const result = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models });
						setNotice(t("notice.static_models_saved", { provider }), "ok");
						return result;
					}, {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) config.providers[provider].static_models = [...models];
						}
					})) clearLiveFormField(root, `.config-static-models-form[data-provider="${CSS.escape(provider)}"]`, "static_models");
				});
			});
			root.querySelectorAll("[data-clear-static-models]").forEach((button) => {
				if (button.dataset.bounddataclearstaticmodels) return;
				button.dataset.bounddataclearstaticmodels = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.clearStaticModels || "";
					await runOptimisticConfigAction(button, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: [] }), {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) config.providers[provider].static_models = [];
						}
					}, {
						locateRoot: () => root.querySelector(`[data-clear-static-models="${CSS.escape(provider)}"]`),
						onSuccess: () => setNotice(t("notice.static_models_cleared", { provider }), "ok"),
						onError: (err) => setNotice(t("notice.failed", { error: err.message }))
					});
				});
			});
			root.querySelectorAll("[data-delete-static-model]").forEach((button) => {
				if (button.dataset.bounddatadeletestaticmodel) return;
				button.dataset.bounddatadeletestaticmodel = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.deleteStaticProvider || "";
					const model = button.dataset.deleteStaticModel || "";
					const models = normalizeStaticModelIds(state.data.config?.providers?.[provider]?.static_models || []).filter((item) => item !== model);
					await runOptimisticConfigAction(button, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { static_models: models }), {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) config.providers[provider].static_models = [...models];
						}
					}, {
						locateRoot: () => root.querySelector(`[data-delete-static-provider="${CSS.escape(provider)}"][data-delete-static-model="${CSS.escape(model)}"]`),
						onSuccess: () => setNotice(t("notice.static_model_removed", {
							model,
							provider
						}), "ok"),
						onError: (err) => setNotice(t("notice.failed", { error: err.message }))
					});
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
		function providerOverviewStateLabel(stateId) {
			const key = {
				normal: "prov.overview_state_normal",
				degraded: "prov.overview_state_degraded",
				cooldown: "prov.overview_state_cooldown",
				unavailable: "prov.overview_state_unavailable",
				disabled: "prov.overview_state_disabled"
			}[String(stateId || "")];
			return t(key || "prov.overview_state_unavailable");
		}
		function providerOverviewStateDescription(stateId) {
			const key = {
				normal: "prov.overview_desc_normal",
				degraded: "prov.overview_desc_degraded",
				cooldown: "prov.overview_desc_cooldown",
				unavailable: "prov.overview_desc_unavailable",
				disabled: "prov.overview_desc_disabled"
			}[String(stateId || "")];
			return t(key || "prov.overview_desc_unavailable");
		}
		function providerOverviewStateFact(icon, label, value, tone) {
			return `
      <div class="provider-overview-state-fact tone-${escapeHtml(tone || "neutral")}" role="listitem">
        <span class="provider-overview-state-icon">${iconSvg(icon)}</span>
        <span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span>
      </div>
    `;
		}
		function providerOverviewMetric(icon, label, value, hint, tone = "neutral") {
			return `
      <article class="provider-overview-kpi tone-${escapeHtml(tone)}">
        <span class="provider-overview-kpi-icon">${iconSvg(icon)}</span>
        <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(hint)}</span></div>
      </article>
    `;
		}
		function providerDrawerOverview(view) {
			const recent = (Array.isArray(view.activity.events) ? view.activity.events : []).slice(-10).reverse();
			const probeEvents = Array.isArray(view.activity.probeEvents) ? view.activity.probeEvents : [];
			const recentProbes = probeEvents.slice(0, 20);
			const probeOverflow = Math.max(0, probeEvents.length - 20);
			const compatibilityCircuits = Array.isArray(view.compatibilityCircuits) ? view.compatibilityCircuits : [];
			const configOn = view.config.enabled !== false && view.runtime.config_enabled !== false;
			const runtimeOn = view.runtime.runtime_enabled !== false;
			const routeEligible = ["normal", "degraded"].includes(view.runtimeState.id);
			const cooldownRemaining = Number(view.runtime.cooldown_remaining_s || 0);
			const hasFailedProbe = recentProbes.some((probe) => probeTone(probe) === "bad");
			const endpoint = String(view.config.base_url || "").trim();
			const successRate = view.activity.successRate;
			const successTone = successRate === null ? "neutral" : successRate >= .9 ? "ok" : successRate >= .5 ? "warn" : "bad";
			const stateTone = view.runtimeState.badge || "neutral";
			return `
      <section class="provider-drawer-section provider-overview-workspace">
        <section class="provider-overview-readiness ${view.runtimeState.tone}" aria-label="${escapeHtml(t("prov.overview_readiness"))}">
          <div class="provider-overview-readiness-head">
            <span class="provider-overview-readiness-icon tone-${escapeHtml(stateTone)}">${iconSvg(routeEligible ? "check" : view.runtimeState.id === "cooldown" ? "clock" : "alert")}</span>
            <div>
              <span>${escapeHtml(t("prov.overview_readiness"))}</span>
              <h3>${escapeHtml(providerOverviewStateLabel(view.runtimeState.id))}</h3>
              <p>${escapeHtml(providerOverviewStateDescription(view.runtimeState.id))}</p>
            </div>
            <span class="provider-overview-priority">${escapeHtml(t("prov.overview_priority", { priority: fmtInt(view.priority) }))}</span>
          </div>
          <div class="provider-overview-endpoint">
            <span>${iconSvg("server")} ${escapeHtml(t("prov.overview_endpoint"))}</span>
            <code translate="no" title="${escapeHtml(endpoint || t("prov.overview_endpoint_missing"))}">${escapeHtml(endpoint || t("prov.overview_endpoint_missing"))}</code>
          </div>
          <div class="provider-overview-state-facts" role="list">
            ${providerOverviewStateFact("settings", t("prov.overview_config_state"), t(configOn ? "prov.overview_enabled" : "prov.overview_disabled"), configOn ? "ok" : "bad")}
            ${providerOverviewStateFact("activity", t("prov.overview_runtime_state"), t(runtimeOn ? "prov.overview_enabled" : "prov.overview_disabled"), runtimeOn ? "ok" : "bad")}
            ${providerOverviewStateFact("radar", t("prov.overview_route_state"), t(routeEligible ? "prov.overview_available" : "prov.overview_unavailable"), routeEligible ? "ok" : view.runtimeState.id === "cooldown" ? "warn" : "bad")}
          </div>
          ${cooldownRemaining > 0 ? `
            <div class="provider-overview-cooldown" role="status">
              ${iconSvg("clock")}
              <span>${escapeHtml(t("prov.overview_cooldown_remaining", { time: fmtNextProbe(cooldownRemaining) }))}</span>
            </div>
          ` : ""}
        </section>

        <div class="provider-overview-kpis">
          ${providerOverviewMetric("key", t("prov.overview_key_coverage"), `${fmtInt(view.keyStats.usable)}/${fmtInt(view.keyStats.total)}`, t("prov.overview_usable_keys", {
				usable: fmtInt(view.keyStats.usable),
				total: fmtInt(view.keyStats.total)
			}), view.keyStats.usable > 0 ? view.keyStats.usable === view.keyStats.total ? "ok" : "warn" : "bad")}
          ${providerOverviewMetric("boxes", t("prov.overview_models"), fmtInt(view.modelItems.length), t("prov.overview_models_available"), view.modelItems.length ? "info" : "neutral")}
          ${providerOverviewMetric("activity", t("prov.overview_recent_success"), successRate === null ? "—" : fmtPct(successRate), t("prov.overview_recent_requests", { count: fmtInt(view.activity.total) }), successTone)}
          ${providerOverviewMetric("clock", t("prov.overview_avg_first_byte"), view.activity.avgLatency ? fmtMs(view.activity.avgLatency) : "—", t("prov.overview_successful_calls"), view.activity.avgLatency ? "info" : "neutral")}
        </div>

        ${compatibilityCircuits.length ? `
          <section class="provider-overview-section provider-overview-attention">
            <div class="provider-overview-section-head">
              <span class="provider-overview-section-icon">${iconSvg("alert")}</span>
              <div><h3>${escapeHtml(t("prov.overview_routing_exceptions"))}</h3><p>${escapeHtml(t("prov.overview_routing_exceptions_tip"))}</p></div>
              <span class="section-count-badge">${fmtInt(compatibilityCircuits.length)}</span>
              <button class="button provider-compatibility-clear" type="button" data-clear-compatibility="${escapeHtml(view.name)}">${iconSvg("rotate")}<span>${escapeHtml(t("prov.overview_clear_exceptions"))}</span></button>
            </div>
            <div class="provider-route-list">
              ${compatibilityCircuits.map((entry) => `
                <article class="provider-route-card provider-compatibility-circuit" data-compatibility-circuit="${escapeHtml([
				entry.provider,
				entry.key_id,
				entry.canonical_model,
				entry.upstream_format,
				entry.compatibility_profile
			].join(":"))}">
                  <div>
                    <strong class="mono" translate="no">${escapeHtml(entry.canonical_model || "-")} → ${escapeHtml(entry.provider_model || "-")}</strong>
                    <small translate="no">${escapeHtml([
				entry.key_id && `key ${entry.key_id}`,
				entry.upstream_format,
				entry.compatibility_profile
			].filter(Boolean).join(" · "))}</small>
                  </div>
                  <span class="provider-overview-exception-state">
                    <strong>${escapeHtml(t("prov.overview_failures", { count: fmtInt(entry.fails) }))}</strong>
                    <small>${escapeHtml(t("prov.overview_cooldown_remaining", { time: fmtNextProbe(Number(entry.cooldown_remaining_s || 0)) || "0s" }))}</small>
                  </span>
                </article>
              `).join("")}
            </div>
          </section>
        ` : ""}

        <section class="provider-overview-section">
          <div class="provider-overview-section-head">
            <span class="provider-overview-section-icon">${iconSvg("activity")}</span>
            <div><h3>${escapeHtml(t("prov.overview_recent_activity"))}</h3><p>${escapeHtml(t("prov.overview_recent_activity_tip"))}</p></div>
            ${view.activity.total ? `<span class="section-count-badge">${fmtInt(view.activity.total)}</span>` : ""}
          </div>
          <div class="provider-activity-list" data-provider-activity-list="${escapeHtml(view.name)}">
            ${recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.overview_activity_loading"))}</div>`}
          </div>
        </section>

        <details class="provider-overview-disclosure" data-provider-probes-disclosure="${escapeHtml(view.name)}" ${hasFailedProbe ? "open" : ""}>
          <summary>
            <span class="provider-overview-section-icon">${iconSvg("radar")}</span>
            <span><strong>${escapeHtml(t("prov.overview_health_probes"))}</strong><small>${escapeHtml(t("prov.overview_health_probes_tip"))}</small></span>
            <span class="provider-overview-disclosure-count" data-provider-probe-count>${escapeHtml(t("prov.overview_probe_count", { count: fmtInt(probeEvents.length) }))}</span>
          </summary>
          <div class="provider-overview-disclosure-body">
            ${renderIdleStateBar()}
            <div class="provider-probe-list" data-provider-probe-list="${escapeHtml(view.name)}">
              ${recentProbes.length ? recentProbes.map(providerProbeRow).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.overview_probe_empty"))}</div>`}
              ${probeOverflow ? `<div class="probe-list-more" data-probe-list-more="${escapeHtml(view.name)}">${escapeHtml(t("prov.overview_more_probes", { count: fmtInt(probeOverflow) }))}</div>` : ""}
            </div>
          </div>
        </details>
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
					list.innerHTML = recent.length ? recent.map(providerActivityRow).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.overview_activity_empty"))}</div>`;
				}
				const probeLists = document.querySelectorAll("[data-provider-probe-list]");
				const probeList = Array.from(probeLists).find((el) => el.getAttribute("data-provider-probe-list") === name);
				if (probeList) {
					const probes = Array.isArray(activity?.probeEvents) ? activity.probeEvents : [];
					const visibleProbes = probes.slice(0, 20);
					const overflow = Math.max(0, probes.length - 20);
					probeList.innerHTML = visibleProbes.length ? visibleProbes.map(providerProbeRow).join("") + (overflow ? `<div class="probe-list-more" data-probe-list-more="${escapeHtml(name)}">${escapeHtml(t("prov.overview_more_probes", { count: fmtInt(overflow) }))}</div>` : "") : `<div class="empty pad-slim">${escapeHtml(t("prov.overview_probe_empty"))}</div>`;
					const disclosures = document.querySelectorAll("[data-provider-probes-disclosure]");
					const disclosure = Array.from(disclosures).find((el) => el.getAttribute("data-provider-probes-disclosure") === name);
					if (disclosure) {
						const count = disclosure.querySelector("[data-provider-probe-count]");
						if (count) count.textContent = t("prov.overview_probe_count", { count: fmtInt(probes.length) });
						if (visibleProbes.some((probe) => probeTone(probe) === "bad")) disclosure.open = true;
					}
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
			const keyListId = `key-list-${view.name}`;
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Usable", fmtInt(view.keyStats.usable), "keys")}
          ${miniMetric("Runtime on", fmtInt(view.keyStats.runtimeEnabled), "keys")}
          ${miniMetric("Cooldown", fmtInt(view.keyStats.cooldown), "keys")}
          ${miniMetric("Fails", fmtInt(view.keyStats.fails), "runtime")}
        </div>
        <div class="provider-key-list drawer-key-list" id="${escapeHtml(keyListId)}">
          ${view.keys.length ? view.keys.map((key) => keyCard(view.name, key, view.keyStats.total)).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.no_keys_configured"))}</div>`}
        </div>
        <form class="config-key-form provider-key-add-form" data-provider="${escapeHtml(view.name)}">
          <label class="field"><span>${escapeHtml(t("prov.api_key"))}</span><input class="control" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(t("prov.api_key_ph"))}" required /></label>
          <label class="field"><span>${escapeHtml(t("form.proxy"))}</span>${proxyControlInput("proxy", "", "http://host:port / socks5://host:port")}</label>
          <button class="button secondary" type="submit">${escapeHtml(t("prov.add_key"))}</button>
        </form>
      </section>
    `;
		}
		function providerModelStatusLabel(status) {
			return t({
				pending: "prov.models.pending",
				ok: "prov.models.ok",
				stale: "prov.models.stale",
				error: "prov.models.error",
				not_fetched: "prov.models.not_fetched"
			}[String(status || "").toLowerCase()] || "prov.models.unknown");
		}
		function providerDrawerModels(view) {
			const capability = view.capability || {};
			const configuredVariants = state.data.config?.models?.provider_model_variants?.[view.name] || {};
			const modelItems = view.modelItems;
			const legacyRouteRefs = Array.isArray(modelItems?.legacyRouteRefs) ? modelItems.legacyRouteRefs : [];
			const visibleItems = filteredProviderModelItems(modelItems);
			const largeCatalog = visibleItems.length > 24;
			const disabledCount = modelItems.filter((item) => item.disabled).length;
			const modelFilters = state.providerModelFilters || {};
			const draftCount = providerModelDraftCount(view.name);
			const staticModels = normalizeStaticModelIds(view.config.static_models);
			const variantChoices = [];
			const seenVariantChoices = /* @__PURE__ */ new Set();
			modelCapabilityItems(Array.isArray(capability.models) ? capability.models : [], capability.canonical_map || {}).forEach((item) => {
				const rawModel = String(item.raw || item.label || "").trim();
				if (!rawModel || seenVariantChoices.has(rawModel)) return;
				seenVariantChoices.add(rawModel);
				variantChoices.push({
					label: String(item.label || rawModel),
					rawModel
				});
			});
			return `
      <section class="provider-drawer-section provider-models-workspace">
        <div class="provider-model-status-strip">
          <div class="provider-model-status-item">
            <span>${iconSvg("radar")} ${escapeHtml(t("prov.models.discovery"))}</span>
            <strong>${escapeHtml(providerModelStatusLabel(capability.status))}</strong>
            <small>${escapeHtml(capability.fetched_at ? fmtDate(capability.fetched_at) : t("prov.models.no_snapshot"))}</small>
          </div>
          <div class="provider-model-status-item">
            <span>${iconSvg("boxes")} ${escapeHtml(t("prov.models.models"))}</span>
            <strong>${escapeHtml(fmtInt(modelItems.length))}</strong>
            <small>${escapeHtml(t("prov.models.disabled_count", { count: fmtInt(disabledCount) }))}</small>
          </div>
          <button class="button secondary compact-action provider-model-refresh-action" type="button"
            data-provider-models-refresh="${escapeHtml(view.name)}">
            ${iconSvg("rotate")}<span>${escapeHtml(t("prov.models.refresh"))}</span>
          </button>
        </div>
        ${capability.status === "pending" ? `<div class="model-capability-refreshing">${refreshSpinner()} ${escapeHtml(t("prov.models.discovering"))}</div>` : ""}
        ${capability.error ? `<div class="model-capability-error">${messageMarkup(capability.error)}</div>` : ""}
        <section class="provider-model-catalog ${largeCatalog ? "is-large-catalog" : ""}" aria-labelledby="provider-model-catalog-title">
          <div class="provider-model-section-heading">
            <div>
              <h3 id="provider-model-catalog-title">${iconSvg("boxes")} ${escapeHtml(t("prov.models.catalog"))}</h3>
              <p>${escapeHtml(t("prov.models.catalog_desc"))}</p>
            </div>
            <span class="provider-model-section-count">${escapeHtml(t("prov.models.shown", { count: fmtInt(visibleItems.length) }))}</span>
          </div>
          <div class="provider-model-toolbar">
            <input class="control provider-model-search" type="search"
              data-refresh-safe-control
              data-provider-model-search="${escapeHtml(view.name)}"
              placeholder="${escapeHtml(t("prov.models.search"))}"
              aria-label="${escapeHtml(t("prov.models.search"))}"
              value="${escapeHtml(modelFilters.search || "")}" />
            <select class="control provider-model-status-filter" data-refresh-safe-control data-provider-model-status-filter="${escapeHtml(view.name)}" aria-label="${escapeHtml(t("prov.models.filter_status"))}">
              <option value="" ${!modelFilters.status ? "selected" : ""}>${escapeHtml(t("prov.models.all"))}</option>
              <option value="enabled" ${modelFilters.status === "enabled" ? "selected" : ""}>${escapeHtml(t("prov.models.enabled"))}</option>
              <option value="disabled" ${modelFilters.status === "disabled" ? "selected" : ""}>${escapeHtml(t("prov.models.disabled"))}</option>
            </select>
            <button class="button small secondary icon-action provider-model-toolbar-action" type="button"
              data-provider-model-bulk="${escapeHtml(view.name)}"
              data-provider-model-bulk-action="disable"
              title="${escapeHtml(t("prov.models.disable_shown"))}"
              aria-label="${escapeHtml(t("prov.models.disable_shown"))}"
              ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye-off")}</button>
            <button class="button small secondary icon-action provider-model-toolbar-action" type="button"
              data-provider-model-bulk="${escapeHtml(view.name)}"
              data-provider-model-bulk-action="enable"
              title="${escapeHtml(t("prov.models.enable_shown"))}"
              aria-label="${escapeHtml(t("prov.models.enable_shown"))}"
              ${visibleItems.length ? "" : "disabled"}>${iconSvg("eye")}</button>
          </div>
          ${legacyRouteRefs.length ? `
          <div class="provider-model-legacy-notice">
            ${iconSvg("alert")}
            <span>${escapeHtml(t("prov.models.legacy_route_notice", {
				names: legacyRouteRefs.join(", "),
				alias: Object.entries(state.data.config?.models?.provider_model_map?.[view.name] || {}).map(([c, r]) => [r, c]).filter(([r]) => legacyRouteRefs.some((n) => String(n).toLowerCase() === String(r).toLowerCase())).map(([, c]) => c).join(", ")
			}))}</span>
          </div>` : ""}
          <div class="model-chip-list provider-drawer-models" role="list" ${largeCatalog ? `aria-label="${escapeHtml(t("prov.models.visible_count", { count: fmtInt(visibleItems.length) }))}"` : ""}>
            ${visibleItems.length ? visibleItems.slice(0, 100).map((item) => `
              <span class="model-map-chip provider-model-chip ${item.disabled ? "is-disabled" : ""} ${item.pending ? "is-pending" : ""} ${item.manual ? "is-manual-map" : ""}" role="listitem">
                <button class="model-chip-toggle" type="button"
                  data-provider-model-disable-provider="${escapeHtml(view.name)}"
                  data-provider-model-disable-model="${escapeHtml(item.sourceModel)}"
                  data-provider-model-disable-next="${item.disabled ? "false" : "true"}"
                  title="${escapeHtml(`${item.disabled ? t("prov.models.stage_enable") : t("prov.models.stage_disable")} ${item.title}`)}"
                  aria-label="${escapeHtml(`${item.disabled ? t("prov.models.stage_enable") : t("prov.models.stage_disable")} ${item.label}`)}">
                  <b>${escapeHtml(item.label)}</b>
                  ${item.raw && item.raw !== item.label ? `<small>${escapeHtml(item.raw)}</small>` : ""}
                  ${item.pending ? `<small class="model-pending-note">${escapeHtml(t("prov.models.pending_short"))}</small>` : ""}
                </button>
                <button class="model-map-edit-button" type="button"
                  data-provider-model-map-edit-provider="${escapeHtml(view.name)}"
                  data-provider-model-map-edit-model="${escapeHtml(item.label)}"
                  data-provider-model-map-edit-raw="${escapeHtml(item.raw || item.label)}"
                  data-provider-model-map-edit-manual="${item.manual ? "1" : "0"}"
                  title="${escapeHtml(t("prov.models.edit_mapping"))}"
                  aria-label="${escapeHtml(t("prov.models.edit_mapping_for", { model: item.label }))}">${iconSvg("pencil")}</button>
              </span>
            `).join("") + (visibleItems.length > 100 ? `<span class="muted provider-model-overflow-note" role="listitem">${escapeHtml(t("prov.models.more", { count: fmtInt(visibleItems.length - 100) }))}</span>` : "") : `<div class="empty pad-slim" role="listitem">${escapeHtml(t("prov.models.no_match"))}</div>`}
          </div>
          ${draftCount ? `
            <div class="provider-model-draft-bar" role="status">
              <div><strong>${escapeHtml(draftCount === 1 ? t("prov.models.staged_one") : t("prov.models.staged_many", { count: fmtInt(draftCount) }))}</strong><small>${escapeHtml(t("prov.models.review_apply"))}</small></div>
              <div class="provider-model-draft-actions">
                <button class="button small secondary" type="button"
                  data-provider-model-reset="${escapeHtml(view.name)}"
                  title="${escapeHtml(t("prov.models.reset"))}">${iconSvg("undo")}<span>${escapeHtml(t("prov.models.reset_label"))}</span></button>
                <button class="button small" type="button"
                  data-provider-model-apply="${escapeHtml(view.name)}"
                  title="${escapeHtml(t("prov.models.apply", { count: fmtInt(draftCount) }))}">${iconSvg("save")}<span>${escapeHtml(t("prov.models.apply_label"))}</span></button>
              </div>
            </div>
          ` : ""}
        </section>

        <details class="provider-model-disclosure provider-model-aliases">
          <summary>
            <span><strong>${iconSvg("layers")} ${escapeHtml(t("prov.models.canonical_aliases"))}</strong><small>${escapeHtml(t("prov.models.canonical_aliases_desc"))}</small></span>
            <span class="provider-model-disclosure-meta">${escapeHtml(t("prov.models.configured", { count: fmtInt(Object.keys(configuredVariants).length) }))}</span>
          </summary>
          <div class="provider-model-disclosure-body">
            <div class="provider-route-list">
              ${Object.keys(configuredVariants).length ? Object.entries(configuredVariants).map(([canonical, rawVariants]) => {
				const variants = normalizeVariantEntries(rawVariants);
				return `
                <article class="provider-route-card provider-model-alias-card">
                  <div>
                    <strong class="mono">${escapeHtml(canonical)}</strong>
                    <small>${escapeHtml((variants || []).map((entry) => `${entry.model}:${entry.priority ?? 0}`).join(", "))}</small>
                  </div>
                  ${badge(t("prov.models.variants", { count: fmtInt((variants || []).length) }), "info")}
                  <button class="button small secondary icon-action" type="button"
                    data-provider-variant-edit="${escapeHtml(canonical)}"
                    data-provider-variant-provider="${escapeHtml(view.name)}"
                    title="${escapeHtml(t("prov.models.edit_alias"))}"
                    aria-label="${escapeHtml(t("prov.models.edit_alias_for", { model: canonical }))}">${iconSvg("pencil")}</button>
                  <button class="button small danger icon-action" type="button"
                    data-provider-variant-delete="${escapeHtml(canonical)}"
                    data-provider-variant-provider="${escapeHtml(view.name)}"
                    title="${escapeHtml(t("prov.models.delete_alias"))}"
                    aria-label="${escapeHtml(t("prov.models.delete_alias_for", { model: canonical }))}">${iconSvg("trash")}</button>
                </article>
              `;
			}).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.models.no_aliases"))}</div>`}
            </div>
            <details class="provider-model-inline-editor">
              <summary>${iconSvg("plus")}<span>${escapeHtml(t("prov.models.add_alias"))}</span></summary>
              <form class="provider-variant-form" data-provider="${escapeHtml(view.name)}">
                <div class="form-row">
                  <label>${escapeHtml(t("prov.models.canonical_model"))}</label>
                  <input class="control" name="canonical_model" placeholder="grok-4.3" required />
                </div>
                <div class="provider-variant-picker-shell">
                  <div class="provider-variant-picker-head">
                    <label>${escapeHtml(t("prov.models.choose_variants"))}</label>
                    <input class="control" type="search" data-refresh-safe-control data-provider-variant-search
                      placeholder="${escapeHtml(t("prov.models.search_variants"))}"
                      aria-label="${escapeHtml(t("prov.models.search_variants"))}" />
                  </div>
                  <div class="provider-variant-picker" role="group" aria-label="${escapeHtml(t("prov.models.choose_variants"))}">
                    ${variantChoices.length ? variantChoices.map((item) => `
                      <div class="provider-variant-option" data-provider-variant-option data-search-text="${escapeHtml(`${item.label} ${item.rawModel}`.toLowerCase())}">
                        <label>
                          <input type="checkbox" data-provider-variant-model value="${escapeHtml(item.rawModel)}" />
                          <span><b>${escapeHtml(item.label)}</b>${item.rawModel !== item.label ? `<small>${escapeHtml(item.rawModel)}</small>` : ""}</span>
                        </label>
                        <input class="control provider-variant-priority" type="number" min="-1000" max="1000" value="0"
                          data-provider-variant-priority disabled
                          aria-label="${escapeHtml(t("prov.models.priority_for", { model: item.rawModel }))}" />
                      </div>
                    `).join("") : `<div class="empty pad-slim">${escapeHtml(t("prov.models.no_discovered_variants"))}</div>`}
                  </div>
                </div>
                <details class="provider-variant-custom-input">
                  <summary>${escapeHtml(t("prov.models.custom_variants"))}</summary>
                  <div class="form-row">
                    <label>${escapeHtml(t("prov.models.raw_variants"))}</label>
                    <input class="control" name="variants" placeholder="custom-model:50" />
                    <small class="muted">${escapeHtml(t("prov.models.raw_variants_help"))}</small>
                  </div>
                </details>
                <div class="form-actions">
                  <button class="button small secondary" type="reset">${escapeHtml(t("form.reset"))}</button>
                  <button class="button small" type="submit">${escapeHtml(t("prov.models.save_alias"))}</button>
                </div>
              </form>
            </details>
          </div>
        </details>

        <details class="provider-model-disclosure provider-model-static-fallback">
          <summary>
            <span><strong>${iconSvg("shield")} ${escapeHtml(t("prov.models.advanced_fallback"))}</strong><small>${escapeHtml(t("prov.models.advanced_fallback_desc"))}</small></span>
            <span class="provider-model-disclosure-meta">${escapeHtml(t("prov.models.static_count", { count: fmtInt(staticModels.length) }))}</span>
          </summary>
          <div class="provider-model-disclosure-body">
            <form class="config-static-models-form" data-provider="${escapeHtml(view.name)}">
              ${staticModels.length ? `
                <div class="model-chip-list static-model-chip-list">
                  ${staticModels.slice(0, 100).map((model) => `
                    <span class="model-map-chip static-model-chip">
                      <b>${escapeHtml(model)}</b><small>${escapeHtml(t("prov.models.static"))}</small>
                      <button class="static-model-delete" type="button"
                        title="${escapeHtml(t("prov.models.remove_model", { model }))}"
                        aria-label="${escapeHtml(t("prov.models.remove_model", { model }))}"
                        data-delete-static-provider="${escapeHtml(view.name)}"
                        data-delete-static-model="${escapeHtml(model)}">${iconSvg("x")}</button>
                    </span>
                  `).join("") + (staticModels.length > 100 ? `<span class="muted provider-model-overflow-note">${escapeHtml(t("prov.models.more", { count: fmtInt(staticModels.length - 100) }))}</span>` : "")}
                </div>
              ` : `<div class="empty pad-slim">${escapeHtml(t("prov.models.no_static"))}</div>`}
              <div class="form-row">
                <label for="static-models-${escapeHtml(view.name)}">${escapeHtml(t("prov.models.add_model_ids"))}</label>
                <input id="static-models-${escapeHtml(view.name)}" name="static_models" type="text"
                  placeholder="${escapeHtml(t("prov.models.add_model_ids_ph"))}"
                  value=""
                  style="font-family:monospace;width:100%">
                <small class="muted">${escapeHtml(t("prov.models.add_model_ids_help"))}</small>
              </div>
              <div class="form-actions">
                <button class="button small" type="submit">${escapeHtml(t("prov.models.add_models"))}</button>
                ${staticModels.length ? `<button class="button small secondary" type="button" data-clear-static-models="${escapeHtml(view.name)}">${escapeHtml(t("prov.models.clear"))}</button>` : ""}
              </div>
            </form>
          </div>
        </details>
      </section>
    `;
		}
		function providerDrawerRouting(view) {
			const routing = state.data.config?.routing || {};
			const defaultPool = Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool : [];
			const routeRows = providerRoutingRows(view.name);
			const currentMode = routing.provider_select || "priority_failover";
			return `
      <section class="provider-drawer-section">
        <div class="provider-detail-metrics">
          ${miniMetric("Default pool", defaultPool.includes(view.name) ? "yes" : "no", currentMode)}
          ${miniMetric("Priority", fmtInt(view.priority), "provider")}
          ${miniMetric("Route models", fmtInt(routeRows.length), "explicit")}
          ${miniMetric("Provider select", currentMode, "default")}
          ${miniMetric("Max attempts", fmtInt(routing.max_attempts), "request")}
        </div>
        <div class="provider-hot-reload-controls">
          <div class="hot-reload-row">
            <label class="field hot-reload-field">
              <span>Quick priority (hot-reload)</span>
              <div class="hot-reload-input-row">
                <input class="control" type="number" min="-1000" max="1000" step="1" value="${escapeHtml(view.priority ?? 0)}" data-hot-priority="${escapeHtml(view.name)}" />
                <button class="button secondary compact-action" type="button" data-hot-priority-apply="${escapeHtml(view.name)}">Apply</button>
              </div>
              <small class="muted">Instantly updates priority without full config reload</small>
            </label>
          </div>
        </div>
        ${providerFormatConfiguration(view.name, view.formats)}
        <div class="provider-route-list">
          ${routeRows.length ? routeRows.slice(0, 50).map((row) => `
            <article class="provider-route-card">
              <div>
                <strong class="mono">${escapeHtml(row.model)}</strong>
                <small>${escapeHtml(row.providerText)}</small>
              </div>
              ${badge(row.select || currentMode, "info")}
            </article>
          `).join("") + (routeRows.length > 50 ? `<div class="pad-slim muted">+ ${routeRows.length - 50} more routes...</div>` : "") : `<div class="empty pad-slim">No explicit model route includes this provider</div>`}
        </div>
      </section>
    `;
		}
		function providerDrawerConfig(view) {
			return `
      <section class="provider-drawer-section provider-config-inspector-shell">
        ${providerConfigInspector(view.name, view.config)}
        <div class="provider-danger-zone">
          <div>
            <strong>${escapeHtml(t("prov.delete_provider"))}</strong>
            <p>${escapeHtml(t("prov.delete_provider_tip"))}</p>
          </div>
          <button class="button danger icon-action" type="button" data-provider-delete="${escapeHtml(view.name)}" title="${escapeHtml(t("prov.delete_provider"))}" aria-label="${escapeHtml(t("prov.delete_provider"))}">${iconSvg("trash")}</button>
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
			const rawStatus = String(event.reason || event.status || "-");
			const statusText = rawStatus.toLowerCase() === "success" ? t("req.success") : [
				"failed",
				"failure",
				"error"
			].includes(rawStatus.toLowerCase()) ? t("req.failed") : rawStatus;
			return `
      <button class="provider-activity-row ${escapeHtml(event.tone)}" type="button" ${event.requestId ? `data-request-id="${escapeHtml(event.requestId)}"` : ""}>
        <span class="provider-status-dot ${escapeHtml(event.tone)}"></span>
        <strong>${escapeHtml(event.model || "-")}</strong>
        <small>${escapeHtml(fmtDate(event.ts))}</small>
        <span class="provider-activity-status">${messageMarkup(statusText)}</span>
        <em>${event.latencyMs ? escapeHtml(fmtMs(event.latencyMs)) : "-"}</em>
      </button>
    `;
		}
		function capitalize(value) {
			const text = String(value || "");
			return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
		}
		function renderModelCapabilities() {
			const target = el("modelCapabilities");
			if (!target) return;
			if (!state.forceModelCapsRender && shouldPreserveContainer("#modelCapabilities")) return;
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
				updateDOM(target, `${header}<div class="pad-slim">No providers configured</div>`);
				return;
			}
			target.classList.remove("empty");
			updateDOM(target, `${header}${names.map((name) => modelCapabilityCard(name, providers[name] || {}, configProviders[name] || {})).join("")}`);
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
		var _modelCapabilityItemsCacheVersion = "";
		function modelCapabilityItemsMemo(name, models, canonicalMap) {
			const nextVersion = `${Number(state.data?.version || 0)}\n${Number(state.data?.modelsVersion || 0)}`;
			if (nextVersion !== _modelCapabilityItemsCacheVersion) {
				_modelCapabilityItemsCache.clear();
				_modelCapabilityItemsCacheVersion = nextVersion;
			}
			const cacheKey = String(name || "");
			const cached = _modelCapabilityItemsCache.get(cacheKey);
			if (cached) return cached;
			const items = modelCapabilityItems(models, canonicalMap);
			if (_modelCapabilityItemsCache.size >= 512) _modelCapabilityItemsCache.clear();
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
		function providerConfigInspector(name, provider) {
			return `
      <form class="config-provider-form provider-config-inspector" data-provider="${escapeHtml(name)}">
        <div class="provider-inspector-content">
          <section class="provider-inspector-section">
            <div class="provider-inspector-head">
              <div><strong>${escapeHtml(t("prov.config_connection"))}</strong><small>${escapeHtml(t("prov.config_connection_tip"))}</small></div>
              <span class="provider-inspector-code">HTTP</span>
            </div>
            <div class="provider-inspector-grid">
              <label for="provider-base-url-${escapeHtml(name)}">${escapeHtml(t("form.base_url"))}</label>
              <input id="provider-base-url-${escapeHtml(name)}" class="control mono" name="base_url" type="url" autocomplete="off" spellcheck="false" value="${escapeHtml(provider.base_url || "")}" placeholder="https://api.example.com" required />
              <label for="provider-site-url-${escapeHtml(name)}">${escapeHtml(t("form.site_url"))}</label>
              <input id="provider-site-url-${escapeHtml(name)}" class="control mono" name="site_url" type="url" autocomplete="off" spellcheck="false" value="${escapeHtml(provider.site_url || "")}" placeholder="https://provider.example.com" />
              <label for="provider-proxy-${escapeHtml(name)}">${escapeHtml(t("form.proxy"))}</label>
              <div>${proxyControlInput("proxy", provider.proxy || "", "direct / http://host:port / socks5://host:port", `id="provider-proxy-${escapeHtml(name)}" autocomplete="off" spellcheck="false"`)}</div>
              <label for="provider-user-agent-${escapeHtml(name)}">${escapeHtml(t("form.user_agent"))}</label>
              <input id="provider-user-agent-${escapeHtml(name)}" class="control mono" name="user_agent" autocomplete="off" spellcheck="false" value="${escapeHtml(provider.user_agent || "")}" placeholder="${escapeHtml(t("prov.inherit_proxy_default"))}" />
            </div>
          </section>
          <section class="provider-inspector-section">
            <div class="provider-inspector-head">
              <div><strong>${escapeHtml(t("prov.config_runtime"))}</strong><small>${escapeHtml(t("prov.config_runtime_tip"))}</small></div>
              <span class="provider-inspector-code">LIVE</span>
            </div>
            <div class="provider-inspector-grid provider-runtime-grid">
              <label for="provider-priority-${escapeHtml(name)}">${escapeHtml(t("form.priority"))}</label>
              <input id="provider-priority-${escapeHtml(name)}" class="control mono" name="priority" type="number" inputmode="numeric" min="-1000" max="1000" step="1" value="${escapeHtml(provider.priority ?? 0)}" />
            </div>
            <label class="provider-setting-row">
              <span><strong>${escapeHtml(t("prov.provider_enabled"))}</strong><small>${escapeHtml(t("prov.provider_enabled_tip"))}</small></span>
              <span class="provider-setting-switch"><input type="checkbox" name="enabled" ${provider.enabled === false ? "" : "checked"} /><i></i></span>
            </label>
          </section>
          <section class="provider-inspector-section">
            <div class="provider-inspector-head">
              <div><strong>${escapeHtml(t("prov.health_probes"))}</strong><small>${escapeHtml(t("prov.health_probes_tip"))}</small></div>
            </div>
            <label class="provider-setting-row">
              <span><strong>${escapeHtml(t("prov.skip_idle_probes"))}</strong><small>${escapeHtml(t("prov.skip_idle_probes_tip"))}</small></span>
              <span class="provider-setting-switch"><input type="checkbox" name="skip_idle_probe" ${provider.skip_idle_probe ? "checked" : ""} data-skip-idle-toggle="${escapeHtml(name)}" /><i></i></span>
            </label>
            <label class="provider-setting-row">
              <span><strong>${escapeHtml(t("prov.skip_patrol_probes"))}</strong><small>${escapeHtml(t("prov.skip_patrol_probes_tip"))}</small></span>
              <span class="provider-setting-switch"><input type="checkbox" name="skip_patrol_probe" ${provider.skip_patrol_probe ? "checked" : ""} data-skip-patrol-toggle="${escapeHtml(name)}" /><i></i></span>
            </label>
          </section>
        </div>
        <div class="provider-inspector-actions">
          <span class="provider-inspector-status">${escapeHtml(t("prov.config_runtime_save"))}</span>
          <div>
            <button class="button secondary" type="reset">${escapeHtml(t("form.reset"))}</button>
            <button class="button primary" type="submit">${escapeHtml(t("form.save_configuration"))}</button>
          </div>
        </div>
      </form>
    `;
		}
		function providerFormatConfiguration(name, formats) {
			return `
      <section class="provider-tab-section provider-formats-group">
        <div class="provider-tab-section-head">
          <div><strong>${escapeHtml(t("prov.format_routes"))}</strong><small>${escapeHtml(t("prov.format_routes_tip"))}</small></div>
        </div>
        <div class="format-route-list provider-format-edit-list">
          ${formatRouteItems(formats, name)}
        </div>
      </section>
    `;
		}
		function providerRuntimeState(p = {}, keyStats = null, config = {}) {
			const stats = keyStats || providerKeyStats(Array.isArray(p.keys) ? p.keys : [], []);
			const enabled = p.enabled !== false && p.config_enabled !== false && p.runtime_enabled !== false && config.enabled !== false;
			const providerCooldown = Number(p.cooldown_remaining_s || 0);
			const compatibilityCircuits = Number(p.compatibility_circuit_count || 0);
			const hardFailure = Boolean(p.has_hard_failure);
			if (!enabled) return {
				id: "disabled",
				label: "disabled",
				tone: "is-disabled",
				badge: "disabled"
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
			if (compatibilityCircuits > 0) return {
				id: "degraded",
				label: "compatibility degraded",
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
				badge: "bad"
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
				const dataAttrs = interactive ? `data-format-provider="${escapeHtml(provider)}" data-format="${escapeHtml(name)}" data-format-enabled="${enabled ? "1" : "0"}" data-format-path="${escapeHtml(cfg?.path || "")}"` : "";
				const toggle = interactive ? `
          <button class="format-route-switch ${enabled ? "is-on" : ""}" type="button"
            data-format-toggle
            role="switch"
            aria-checked="${enabled ? "true" : "false"}"
            title="${escapeHtml(`${enabled ? "Disable" : "Enable"} ${label}`)}"
            aria-label="${escapeHtml(`${enabled ? "Disable" : "Enable"} ${label} for ${provider}`)}">
            <span></span>
          </button>
        ` : "";
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
          <span class="format-route-actions">
            ${toggle}
            ${edit}
          </span>
        </span>
      `;
			}).join("");
		}
		function keyCard(provider, key, totalKeys = 0) {
			const available = key.available && key.runtime_enabled;
			const tone = available ? "ok" : key.runtime_enabled ? "warn" : "bad";
			const keyId = `key-${provider}-${key.index}`;
			const proxy = proxyText(key.proxy);
			const models = keyModelsText(key.models);
			return `
      <article class="provider-key-card" data-key="${escapeHtml(keyId)}" data-key-total="${escapeHtml(totalKeys)}">
        <div class="key-card-head">
          <div>
            <div class="mono key-title">key ${escapeHtml(key.index)}</div>
            <div class="provider-meta" title="${escapeHtml(key.key_id || "")}">${escapeHtml(key.masked || key.key_id || "-")}</div>
          </div>
          <div class="key-card-badges">
            ${badge(available ? "available" : key.runtime_enabled ? "cooldown" : "disabled", tone)}
          </div>
        </div>
        <form class="key-proxy-row" data-provider="${escapeHtml(provider)}" data-key-index="${escapeHtml(key.index)}">
          <label class="field key-proxy-field">
            <span>${escapeHtml(t("form.proxy"))}</span>
            ${proxyControlInput("proxy", proxy, t("prov.inherit"))}
          </label>
          <label class="field key-proxy-field">
            <span>${escapeHtml(t("prov.models"))}</span>
            <input class="control" name="models" value="${escapeHtml(models)}" placeholder="${escapeHtml(t("prov.models_ph"))}" />
          </label>
          <button class="button secondary compact-action" type="submit">${escapeHtml(t("form.save"))}</button>
        </form>
        <div class="key-card-foot">
          <div class="key-card-stats mono">
            <span>fails <strong>${fmtInt(key.fails)}</strong></span>
            <span>cooldown <strong>${fmtInt(key.cooldown_remaining_s)}s</strong></span>
            <span>disabled <strong>${fmtInt(key.disabled_remaining_s)}s</strong></span>
          </div>
          <div class="actions key-actions">
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
				"check-circle": `<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>`,
				key: `<circle cx="7.5" cy="12.5" r="3.5"></circle><path d="M11 12.5h9"></path><path d="M16 12.5v3"></path><path d="M19 12.5v2"></path>`,
				"key-round": `<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"></path><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"></circle>`,
				activity: `<path d="M3 12h4l3-7 4 14 3-7h4"></path>`,
				radar: `<path d="M12 12l6-6"></path><circle cx="12" cy="12" r="2"></circle><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M16.2 8.2a6 6 0 1 1-8.4 0"></path>`,
				alert: `<path d="M12 3 2.8 20h18.4L12 3z"></path><path d="M12 9v5"></path><path d="M12 17h.01"></path>`,
				gauge: `<path d="M4 14a8 8 0 1 1 16 0"></path><path d="M12 14l4-4"></path><path d="M7 14h.01"></path><path d="M17 14h.01"></path>`,
				layers: `<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"></path><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"></path><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"></path>`,
				server: `<rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect><rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect><line x1="6" x2="6.01" y1="6" y2="6"></line><line x1="6" x2="6.01" y1="18" y2="18"></line>`,
				"arrow-left": `<path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path>`,
				"arrow-right": `<path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path>`,
				"arrow-up": `<path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path>`,
				"arrow-down": `<path d="M12 5v14"></path><path d="M19 12l-7 7-7-7"></path>`,
				"arrow-right-left": `<path d="M8 3 4 7l4 4"></path><path d="M4 7h16"></path><path d="m16 21 4-4-4-4"></path><path d="M20 17H4"></path>`,
				"git-branch": `<line x1="6" x2="6" y1="3" y2="15"></line><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path>`,
				boxes: `<path d="M4 7l8-4 8 4-8 4-8-4z"></path><path d="M4 7v10l8 4 8-4V7"></path><path d="M12 11v10"></path>`,
				"chevron-right": `<path d="M9 18l6-6-6-6"></path>`,
				clock: `<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>`,
				dollar: `<circle cx="12" cy="12" r="9"></circle><path d="M16 8.5c-.8-1-2-1.5-3.5-1.5-2 0-3.5 1-3.5 2.5s1.2 2.2 3.5 2.7 3.5 1.2 3.5 2.8-1.5 2.5-3.7 2.5c-1.7 0-3-.6-3.8-1.7"></path><path d="M12 5v14"></path>`,
				filter: `<path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path>`,
				pencil: `<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path>`,
				search: `<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>`,
				eye: `<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><circle cx="12" cy="12" r="3"></circle>`,
				copy: `<rect width="14" height="14" x="8" y="8" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>`,
				"eye-off": `<path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M7.4 7.4C4.3 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1"></path><path d="M10 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.2"></path>`,
				save: `<path d="M5 3h12l2 2v16H5z"></path><path d="M8 3v6h8V3"></path><path d="M8 21v-7h8v7"></path>`,
				undo: `<path d="M9 7H4v5"></path><path d="M4 12a8 8 0 1 0 2.3-5.7L4 7"></path>`,
				plus: `<path d="M12 5v14"></path><path d="M5 12h14"></path>`,
				settings: `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>`,
				dot: `<circle cx="12" cy="12" r="2"></circle>`,
				bolt: `<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"></path>`,
				zap: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>`,
				message: `<path d="M5 19l3-3h9a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3"></path><path d="M8 9h8"></path><path d="M8 12h5"></path>`,
				shield: `<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5l-8-3z"></path>`,
				brain: `<path d="M9.5 4.5A3 3 0 0 0 4 6v1.2A3 3 0 0 0 3 12a3 3 0 0 0 1.5 4.8V18a3 3 0 0 0 5.5 1.6V4.8"></path><path d="M14.5 4.5A3 3 0 0 1 20 6v1.2a3 3 0 0 1 1 4.8 3 3 0 0 1-1.5 4.8V18a3 3 0 0 1-5.5 1.6V4.8"></path><path d="M8 9h2M14 9h2M8 15h2M14 15h2"></path>`
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
					await runExclusiveUiAction(`action:${path}`, async () => {
						button.disabled = true;
						try {
							setNotice(t("notice.action_running") || "Action is running...", "info", {
								key: "action:manual",
								sticky: true
							});
							applyMutationResult(await apiPost(path), { drawer: true });
							setNotice(t("notice.action_done") || "Action completed.", "ok", { key: "action:manual" });
							scheduleBackgroundRefresh({
								quiet: true,
								staticData: true
							});
						} catch (err) {
							setNotice(t("notice.action_failed", { error: err.message }), "bad", { key: "action:manual" });
						} finally {
							button.disabled = false;
						}
					}, { duplicateNotice: t("notice.action_already_running") });
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
					const lastKeyText = total <= 1 ? t("confirm.delete_key.last") : "";
					if (!await openConfirmDialog({
						title: t("confirm.delete_key.title"),
						message: t("confirm.delete_key.msg", {
							label,
							provider
						}) + lastKeyText,
						acceptLabel: t("confirm.delete")
					})) return;
					await runOptimisticConfigAction(button, () => apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}/delete`, { confirm: "delete_key" }), {
						resourceKey: `provider-key-list:${provider}`,
						apply: (config) => {
							const keys = config.providers?.[provider]?.keys;
							if (!Array.isArray(keys)) return;
							const key = keys.find((entry, index) => String(entry?.index ?? index) === String(keyIndex));
							if (key && typeof key === "object") key.pending_delete = true;
						}
					}, {
						locateRoot: () => root.querySelector(`[data-key-delete-provider="${CSS.escape(provider)}"][data-key-delete-index="${CSS.escape(String(keyIndex))}"]`),
						onSuccess: () => setNotice(t("notice.key_deleted", {
							index: keyIndex,
							provider
						}), "ok"),
						onError: (err) => setNotice(t("notice.delete_key_failed", { error: err.message }))
					});
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
						applyMutationResult(await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/models/refresh`), { drawer: true });
						setNotice(t("notice.models_refreshed", { provider }), "ok");
						scheduleBackgroundRefresh({
							quiet: true,
							preserveNotice: true,
							staticData: true
						});
						renderProviderDrawer({ force: true });
					} catch (err) {
						setNotice(t("notice.model_refresh_failed", { error: err.message }), "bad");
					} finally {
						_modelRefreshInFlight.delete(provider);
						button.disabled = false;
					}
				});
			});
		}
		async function updateProviderModelDisabled(provider, models, successMessage, root = null) {
			if (!provider || !models || !Object.keys(models).length) return;
			const locateRoot = liveElementLocator(root, () => qsa("[data-provider-model-apply]").find((button) => button.dataset.providerModelApply === provider) || null);
			return runOptimisticConfigAction(root, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/disabled`, { models }), {
				resourceKey: `provider-model-disabled:${provider}`,
				apply: (config) => {
					const disabled = (config.models ||= {}).provider_model_disabled ||= {};
					const providerDisabled = disabled[provider] ||= {};
					Object.entries(models).forEach(([model, value]) => {
						if (value) providerDisabled[model] = true;
						else delete providerDisabled[model];
					});
				}
			}, {
				locateRoot,
				onSuccess: () => {
					if (state.providerModelDrafts) delete state.providerModelDrafts[provider];
					setNotice(successMessage || t("notice.model_settings_saved", { provider }), "ok");
				},
				onError: (err) => setNotice(t("notice.model_setting_failed", { error: err.message }), "bad")
			});
		}
		async function updateProviderModelMapping(provider, oldModel, rawModel, nextModel) {
			if (!provider || !rawModel) return false;
			return runOptimisticConfigAction(null, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/map`, {
				old_model: oldModel,
				model: nextModel,
				raw_model: rawModel
			}), {
				resourceKey: `provider-model-map:${provider}:${oldModel || rawModel}`,
				apply: (config) => {
					const providerMap = ((config.models ||= {}).provider_model_map ||= {})[provider] ||= {};
					if (oldModel && oldModel !== nextModel) delete providerMap[oldModel];
					if (nextModel) providerMap[nextModel] = rawModel;
				}
			}, {
				onSuccess: (result) => {
					if (result?.warning) setNotice(String(result.warning), "warn", {
						duration: 8e3,
						key: "mapping:warning"
					});
					else if (nextModel) setNotice(t("notice.model_mapping_saved_detail", {
						name: nextModel,
						raw: rawModel
					}), "ok");
					else setNotice(t("notice.model_mapping_reset", { provider }), "ok");
				},
				onError: (err) => setNotice(t("notice.model_mapping_failed", { error: err.message }), "bad")
			});
		}
		function openProviderModelMappingModal({ provider, oldModel, rawModel, isManual }) {
			if (!provider || !oldModel || !rawModel) return;
			openFormModal({
				title: t("modal.edit_mapping_title"),
				subtitle: provider,
				bodyHtml: `
        <form class="model-map-form" data-provider-model-map-form>
          <div class="model-map-raw-hero">
            <span class="model-map-raw-hero-icon">${modelBrandIconMarkup(rawModel, iconSvg("boxes"))}</span>
            <div class="model-map-raw-hero-text">
              <span class="model-map-raw-hero-label">${escapeHtml(t("prov.models.editing_mapping_for"))} · ${escapeHtml(oldModel)}</span>
              <strong class="mono">${escapeHtml(rawModel)}</strong>
              <small>${escapeHtml(t("prov.models.raw_hero_hint"))}</small>
            </div>
          </div>
          <label class="model-map-field">
            <span>Client model</span>
            <input name="model" value="${escapeHtml(oldModel)}" autocomplete="off" spellcheck="false" />
          </label>
          <div class="model-map-raw-line">
            <span>Provider</span>
            <code>${escapeHtml(rawModel)}</code>
          </div>
          ${isManual ? `<p class="model-map-hint">Empty name restores automatic mapping.</p>` : ""}
          <div class="model-map-clash-warning" data-model-map-clash hidden></div>
          <div class="model-map-test-result" data-model-map-test-result hidden></div>
          <div class="model-map-actions">
            <button class="model-map-action secondary model-map-test-button" type="button" data-model-map-test title="${escapeHtml(t("modal.mapping_test"))}" aria-label="${escapeHtml(t("modal.mapping_test"))}">${iconSvg("activity")}</button>
            <button class="model-map-action secondary" type="button" data-model-map-cancel title="Cancel" aria-label="Cancel">${iconSvg("x")}</button>
            ${isManual ? `<button class="model-map-action danger" type="button" data-model-map-reset title="Reset to automatic mapping" aria-label="Reset to automatic mapping">${iconSvg("trash")}</button>` : ""}
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
			const testButton = form.querySelector("[data-model-map-test]");
			const testResult = form.querySelector("[data-model-map-test-result]");
			testButton?.addEventListener("click", async () => {
				if (testButton.disabled) return;
				testButton.disabled = true;
				if (testResult) {
					testResult.hidden = false;
					testResult.className = "model-map-test-result is-running";
					testResult.innerHTML = `${refreshSpinner()}<span>${escapeHtml(t("modal.mapping_test_running"))}</span>`;
				}
				try {
					const result = (await apiPost("/-/admin/models/test", {
						provider,
						model: rawModel
					}))?.result || {};
					if (testResult) if (result.ok) {
						testResult.className = "model-map-test-result is-ok";
						testResult.innerHTML = `${iconSvg("check")}<span>${escapeHtml(t("modal.mapping_test_ok", { ms: fmtInt(result.latency_ms || 0) }))}</span>`;
					} else {
						const errText = [
							result.error_type || "",
							result.http_status ? `HTTP ${result.http_status}` : "",
							result.error || ""
						].filter(Boolean).join(" · ");
						testResult.className = "model-map-test-result is-bad";
						testResult.innerHTML = `${iconSvg("alert")}<span>${escapeHtml(t("modal.mapping_test_failed", { error: errText || "unknown" }))}</span>`;
					}
				} catch (err) {
					if (testResult) {
						testResult.className = "model-map-test-result is-bad";
						testResult.innerHTML = `${iconSvg("alert")}<span>${escapeHtml(t("modal.mapping_test_failed", { error: errorMessage(err) }))}</span>`;
					}
				} finally {
					testButton.disabled = false;
				}
			});
			form.querySelector("[data-model-map-reset]")?.addEventListener("click", async () => {
				const resetBtn = form.querySelector("[data-model-map-reset]");
				if (resetBtn) resetBtn.disabled = true;
				if (await updateProviderModelMapping(provider, providerModelMappingOldId({
					label: oldModel,
					manual: isManual
				}), rawModel, "")) closeFormModal();
				else if (resetBtn) resetBtn.disabled = false;
			});
			let mappingSubmitInFlight = false;
			let clashAcknowledged = false;
			const input = form.elements.model;
			const submitBtn = form.querySelector("button[type=\"submit\"]");
			const clashBox = form.querySelector("[data-model-map-clash]");
			const defaultSubmitLabel = submitBtn?.innerHTML || "";
			const findClash = (target) => {
				if (!target) return null;
				return providerModelItems(provider, providerModelItemsCapability(provider)).find((item) => {
					const label = String(item.label || "").trim().toLowerCase();
					const raw = String(item.raw || "").trim();
					return label === String(target).trim().toLowerCase() && raw !== String(rawModel).trim() && label !== String(oldModel || "").trim().toLowerCase();
				}) || null;
			};
			const resetClashUi = () => {
				clashAcknowledged = false;
				if (clashBox) clashBox.hidden = true;
				if (submitBtn) {
					submitBtn.innerHTML = defaultSubmitLabel;
					submitBtn.classList.remove("is-danger");
				}
			};
			input?.addEventListener("input", resetClashUi);
			form.addEventListener("submit", async (event) => {
				event.preventDefault();
				if (mappingSubmitInFlight) return;
				const nextModel = String(input?.value || "").trim();
				if (!nextModel && !isManual) {
					setNotice(t("notice.model_mapping_required"), "bad");
					input?.focus();
					return;
				}
				if (nextModel === oldModel) {
					closeFormModal();
					return;
				}
				const clash = findClash(nextModel);
				if (clash && !clashAcknowledged) {
					clashAcknowledged = true;
					if (clashBox) {
						clashBox.innerHTML = `${iconSvg("alert")}<div><strong>${escapeHtml(t("modal.mapping_clash_title"))}</strong><small>${escapeHtml(t("modal.mapping_clash_msg", {
							editingRaw: rawModel,
							name: nextModel,
							ownerRaw: clash.raw || rawModel
						}))}</small></div>`;
						clashBox.hidden = false;
					}
					if (submitBtn) {
						submitBtn.innerHTML = `${iconSvg("alert")} ${escapeHtml(t("modal.mapping_clash_accept"))}`;
						submitBtn.classList.add("is-danger");
					}
					input?.focus();
					return;
				}
				mappingSubmitInFlight = true;
				if (submitBtn) submitBtn.disabled = true;
				try {
					if (await updateProviderModelMapping(provider, providerModelMappingOldId({
						label: oldModel,
						manual: isManual
					}), rawModel, nextModel)) closeFormModal();
				} finally {
					mappingSubmitInFlight = false;
					if (submitBtn) submitBtn.disabled = false;
				}
			});
		}
		function openProviderFormatPathModal({ provider, fmt, label, path, enabled, ownerCard }) {
			if (!provider || !fmt) return;
			const current = path || defaultFormatPath(fmt);
			openFormModal({
				title: t("modal.edit_format_title"),
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
					setNotice(t("notice.format_path_empty"), "bad");
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
					setNotice(t("notice.format_updated", {
						provider,
						format: fmt
					}), "ok");
					return resp;
				}, {
					resourceKey: `provider-format:${provider}:${fmt}`,
					apply: (config) => {
						const formatConfig = config.providers?.[provider]?.formats?.[fmt];
						if (formatConfig) formatConfig.path = normalized;
					}
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
						if (!item.sourceModel) return;
						models[item.sourceModel] = next;
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
					await updateProviderModelDisabled(provider, draft, `Applied ${Object.keys(draft).length} model changes for ${provider}.`, applyButton);
					renderProviderDrawer({ force: true });
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
      <div class="policy-facts">
        <span class="policy-fact" title="${escapeHtml(t("policy.max_attempts_tip"))}">${iconSvg("rotate")}${t("policy.max_attempts")}<b>${fmtInt(policy.max_attempts)}</b></span>
        <span class="policy-fact" title="connect / read">${iconSvg("clock")}${t("policy.timeouts")}<b>${fmtInt(policy.connect_timeout_s)}s · ${fmtInt(policy.read_timeout_s)}s</b></span>
        <span class="policy-fact" title="${escapeHtml(t("policy.retryable_tip"))}">${iconSvg("shield")}${t("policy.retryable_statuses")}<b>${retryStatuses.length ? retryStatuses.join(", ") : "-"}</b></span>
      </div>
      <div class="policy-matrix-wrap">
        <table class="policy-matrix">
          <thead>
            <tr>
              <th class="pm-idx">#</th>
              <th class="pm-trigger">${t("policy.col_trigger")}</th>
              <th class="pm-col">${iconSvg("rotate")}<span>${t("policy.col_retry")}</span></th>
              <th class="pm-col">${iconSvg("arrow-right")}<span>${t("policy.col_switch")}</span></th>
              <th class="pm-col">${iconSvg("power-off")}<span>${t("policy.col_stop")}</span></th>
              <th class="pm-col">${iconSvg("clock")}<span>${t("policy.col_cooldown")}</span></th>
              <th class="pm-col">${iconSvg("key")}<span>${t("policy.col_key")}</span></th>
            </tr>
          </thead>
          <tbody>
            ${ruleRows.map(renderPolicyRule).join("")}
          </tbody>
        </table>
      </div>
    ` : `<div class="empty pad">No rule table</div>`);
			renderFailurePolicies(policy);
		}
		function renderFailurePolicies(policy) {
			const target = el("failurePoliciesTable");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceFailurePoliciesRender && active && active.closest("#failurePoliciesTable")) return;
			const policies = state.data.config?.retry?.failure_policies || policy.failure_policies || {};
			const rows = Object.entries(policies).sort();
			updateDOM(target, rows.length ? `
      <div class="failure-policy-list">
        ${rows.map(([errorType, cfg]) => failurePolicyCard(errorType, cfg || {})).join("")}
      </div>
    ` : `<div class="empty pad">No failure policies</div>`);
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
			const providerPool = Array.isArray(routing.default_provider_pool) ? routing.default_provider_pool.join(", ") : "";
			const currentSelect = String(routing.provider_select || "priority_failover");
			const currentFormatPreference = String(routing.format_preference || "priority_first");
			const currentSemanticConversion = String(routing.semantic_conversion || "safe");
			const routeModes = [
				{
					value: "priority_failover",
					icon: "bolt",
					label: t("policy.mode_priority"),
					tip: t("policy.mode_priority_tip")
				},
				{
					value: "auto",
					icon: "settings",
					label: t("policy.mode_auto"),
					tip: t("policy.mode_auto_tip")
				},
				{
					value: "round_robin",
					icon: "rotate",
					label: t("policy.mode_round_robin"),
					tip: t("policy.mode_round_robin_tip")
				},
				{
					value: "weighted_rr",
					icon: "layers",
					label: t("policy.mode_weighted"),
					tip: t("policy.mode_weighted_tip")
				},
				{
					value: "random",
					icon: "dot",
					label: t("policy.mode_random"),
					tip: t("policy.mode_random_tip")
				}
			];
			updateDOM(target, `
      <div class="policy-control-grid">
        <form id="routingControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>${iconSvg("git-branch")}<span>${t("policy.routing_controls")}</span><span class="help-tip" data-tip="${escapeHtml(t("policy.routing_tip2"))}">?</span></h3>
          </div>
          <label class="field">
            <span class="label-with-tip">${t("policy.provider_pool")}<span class="help-tip" data-tip="${escapeHtml(t("policy.provider_pool_tip"))}">?</span></span>
            <textarea class="control" name="default_provider_pool" rows="2" placeholder="opencode, deepseek, rawchat" required>${escapeHtml(providerPool)}</textarea>
          </label>
          <div class="form-pair-grid routing-mode-grid">
            <div class="field selection-mode-field">
              <span class="label-with-tip">${t("policy.selection_mode")}<span class="help-tip" data-tip="${escapeHtml(t("policy.selection_tip"))}">?</span></span>
              <input type="hidden" name="provider_select" value="${escapeHtml(currentSelect)}" />
              <div class="icon-btn-group" id="routeModeGroup">
                ${routeModes.map((m) => `<button type="button" data-route-mode="${escapeHtml(m.value)}" class="${currentSelect === m.value ? "is-active" : ""}" title="${escapeHtml(m.tip)}">${iconSvg(m.icon)}<span>${escapeHtml(m.label)}</span></button>`).join("")}
              </div>
            </div>
            <label class="field">
              <span class="label-with-tip">${t("policy.max_attempts")}<span class="help-tip" data-tip="${escapeHtml(t("policy.max_attempts_tip"))}">?</span></span>
              <input class="control" name="max_attempts" type="number" min="1" max="50" value="${escapeHtml(routing.max_attempts ?? policy.max_attempts ?? 6)}" required />
            </label>
          </div>
          <div class="form-pair-grid routing-format-grid">
            <label class="field">
              <span class="label-with-tip">${t("policy.format_preference")}<span class="help-tip" data-tip="${escapeHtml(t("policy.format_preference_tip"))}">?</span></span>
              <select class="control" name="format_preference">
                <option value="priority_first" ${currentFormatPreference === "priority_first" ? "selected" : ""}>${escapeHtml(t("policy.format_priority"))}</option>
                <option value="native_first" ${currentFormatPreference === "native_first" ? "selected" : ""}>${escapeHtml(t("policy.format_native"))}</option>
              </select>
            </label>
            <label class="field">
              <span class="label-with-tip">${t("policy.semantic_conversion")}<span class="help-tip" data-tip="${escapeHtml(t("policy.semantic_conversion_tip"))}">?</span></span>
              <select class="control" name="semantic_conversion">
                <option value="safe" ${currentSemanticConversion === "safe" ? "selected" : ""}>${escapeHtml(t("policy.semantic_safe"))}</option>
                <option value="strict" ${currentSemanticConversion === "strict" ? "selected" : ""}>${escapeHtml(t("policy.semantic_strict"))}</option>
              </select>
            </label>
            <label class="field">
              <span class="label-with-tip">${t("policy.anthropic_default_tokens")}<span class="help-tip" data-tip="${escapeHtml(t("policy.anthropic_default_tokens_tip"))}">?</span></span>
              <input class="control" name="anthropic_default_max_tokens" type="number" min="1" max="1000000" value="${escapeHtml(routing.anthropic_default_max_tokens ?? 4096)}" required />
            </label>
          </div>
          <div class="policy-routing-footer">
            <details class="policy-advanced">
              <summary>${t("policy.timeouts")}</summary>
              <div class="form-pair-grid" style="margin-top:10px">
                <label class="field">
                  <span class="label-with-tip">${t("policy.connect")}<span class="help-tip" data-tip="${escapeHtml(t("policy.connect_tip"))}">?</span></span>
                  <input class="control" name="connect_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.connect_timeout_s ?? policy.connect_timeout_s ?? 15)}" required />
                </label>
                <label class="field">
                  <span class="label-with-tip">${t("policy.read")}<span class="help-tip" data-tip="${escapeHtml(t("policy.read_tip"))}">?</span></span>
                  <input class="control" name="read_timeout_s" type="number" min="1" max="3600" value="${escapeHtml(routing.read_timeout_s ?? policy.read_timeout_s ?? 120)}" required />
                </label>
                <label class="field">
                  <span class="label-with-tip">${t("policy.first_token")}<span class="help-tip" data-tip="${escapeHtml(t("policy.first_token_tip"))}">?</span></span>
                  <input class="control" name="first_token_timeout_s" type="number" min="0" max="600" value="${escapeHtml(routing.first_token_timeout_s ?? policy.first_token_timeout_s ?? 30)}" required />
                </label>
              </div>
            </details>
            <button class="button secondary" type="submit">${t("policy.save_routing")}</button>
          </div>
        </form>

        <form id="retryControlForm" class="policy-control-card">
          <div class="policy-control-card-head">
            <h3>${iconSvg("rotate")}<span>${t("policy.retry_controls")}</span><span class="help-tip" data-tip="${escapeHtml(t("policy.retry_tip"))}">?</span></h3>
          </div>
          <label class="field">
            <span class="label-with-tip">${t("policy.retryable_statuses")}<span class="help-tip" data-tip="${escapeHtml(t("policy.retryable_tip"))}">?</span></span>
            <input class="control" name="retryable_status" value="${escapeHtml(joinList(retry.retryable_status || policy.retryable_status || []))}" placeholder="408, 429, 500, 502, 503, 504" required />
          </label>
          <label class="field">
            <span class="label-with-tip">${t("policy.fatal_key_statuses")}<span class="help-tip" data-tip="${escapeHtml(t("policy.fatal_tip"))}">?</span></span>
            <input class="control" name="key_fatal_status" value="${escapeHtml(joinList(retry.key_fatal_status || policy.key_fatal_status || []))}" placeholder="401, 403" required />
          </label>
          <details class="policy-advanced">
            <summary>${t("policy.advanced_cooldown")}</summary>
            <label class="check-field" style="margin-top:10px">
              <span class="toggle-switch"><input type="checkbox" name="respect_retry_after" ${retry.respect_retry_after ?? policy.respect_retry_after ? "checked" : ""} /><span class="slider"></span></span>
              <span class="label-with-tip">${t("policy.respect_retry_after")}<span class="help-tip" data-tip="${escapeHtml(t("policy.respect_tip"))}">?</span></span>
            </label>
            <div class="form-pair-grid" style="margin-top:8px">
              <label class="field">
                <span class="label-with-tip">${t("policy.same_key_retries")}<span class="help-tip" data-tip="${escapeHtml(t("policy.same_key_tip"))}">?</span></span>
                <input class="control" name="same_key_retries" type="number" min="0" max="3" value="${escapeHtml(retry.same_key_retries ?? 1)}" required />
              </label>
              <label class="field">
                <span class="label-with-tip">${t("policy.failure_ladder")}<span class="help-tip" data-tip="${escapeHtml(t("policy.ladder_tip"))}">?</span></span>
                <input class="control" name="key_failure_ladder_s" value="${escapeHtml(joinNumberList(ladder))}" placeholder="10, 60, 3600" required />
              </label>
              ${cooldownField("rate_limit", t("policy.cooldown_rate_limit"), t("policy.cooldown_rate_limit_tip"), cooldown.rate_limit ?? 30)}
              ${cooldownField("server_error", t("policy.cooldown_server_error"), t("policy.cooldown_server_error_tip"), cooldown.server_error ?? 10)}
              ${cooldownField("network_error", t("policy.cooldown_network_error"), t("policy.cooldown_network_error_tip"), cooldown.network_error ?? 10)}
              ${cooldownField("key_invalid", t("policy.cooldown_key_invalid"), t("policy.cooldown_key_invalid_tip"), cooldown.key_invalid ?? 3600)}
              ${cooldownField("quota_or_balance", t("policy.cooldown_quota_or_balance"), t("policy.cooldown_quota_or_balance_tip"), cooldown.quota_or_balance ?? 3600)}
            </div>
          </details>
          <button class="button secondary" type="submit">${t("policy.save_retry")}</button>
        </form>
      </div>
    `);
			state.forcePolicyRender = false;
			bindPolicyControlForms(target);
		}
		function cooldownField(name, label, tip, value) {
			return `
      <label class="field">
        <span class="label-with-tip">${escapeHtml(label)}<span class="help-tip" data-tip="${escapeHtml(tip)}">?</span></span>
        <input class="control" name="${escapeHtml(name)}" type="number" min="0" max="86400" value="${escapeHtml(value)}" required />
      </label>
    `;
		}
		function bindPolicyControlForms(root) {
			const routingForm = root.querySelector("#routingControlForm");
			if (routingForm) {
				const routeModeGroup = routingForm.querySelector("#routeModeGroup");
				if (routeModeGroup) routeModeGroup.addEventListener("click", (event) => {
					const btn = event.target.closest("[data-route-mode]");
					if (!btn) return;
					const mode = btn.dataset.routeMode || "";
					routingForm.elements.provider_select.value = mode;
					routeModeGroup.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b === btn));
				});
				routingForm.addEventListener("submit", async (event) => {
					event.preventDefault();
					const payload = {
						default_provider_pool: String(routingForm.elements.default_provider_pool.value || "").trim(),
						provider_select: String(routingForm.elements.provider_select.value || "").trim(),
						format_preference: String(routingForm.elements.format_preference.value || "priority_first").trim(),
						semantic_conversion: String(routingForm.elements.semantic_conversion.value || "safe").trim(),
						anthropic_default_max_tokens: Number(routingForm.elements.anthropic_default_max_tokens.value || 0),
						max_attempts: Number(routingForm.elements.max_attempts.value || 0),
						connect_timeout_s: Number(routingForm.elements.connect_timeout_s.value || 0),
						read_timeout_s: Number(routingForm.elements.read_timeout_s.value || 0),
						first_token_timeout_s: Number(routingForm.elements.first_token_timeout_s.value || 0)
					};
					await runPolicyMutation(routingForm, async () => {
						const result = await apiPatch("/-/admin/routing", payload);
						setNotice(t("notice.routing_updated"), "ok");
						return result;
					}, {
						resourceKey: "routing",
						apply: (config) => {
							Object.assign(config.routing ||= {}, payload, { default_provider_pool: String(payload.default_provider_pool || "").split(",").map((item) => item.trim()).filter(Boolean) });
						},
						drawer: false
					});
				});
			}
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
					const result = await apiPatch("/-/admin/retry", payload);
					setNotice(t("notice.retry_updated"), "ok");
					return result;
				}, {
					resourceKey: "retry",
					apply: (config) => {
						Object.assign(config.retry ||= {}, structuredClone(payload));
					},
					drawer: false
				});
			});
		}
		function bindFailurePolicyForms(root) {
			root.querySelectorAll(".failure-policy-form").forEach((form) => {
				if (form.dataset.boundfailurepolicyform) return;
				form.dataset.boundfailurepolicyform = "1";
				const storageKey = `proxyConsoleFold_failure_${form.dataset.errorType || ""}`;
				try {
					if (localStorage.getItem(storageKey) === "1") form.classList.add("is-open");
				} catch (_e) {}
				const header = form.querySelector(".collapsible-card-header");
				if (header) header.addEventListener("click", (event) => {
					if (event.target.closest("select, input, button, .help-tip, .toggle-switch")) return;
					const willOpen = !form.classList.contains("is-open");
					form.classList.toggle("is-open");
					try {
						localStorage.setItem(storageKey, willOpen ? "1" : "0");
					} catch (_e) {}
				});
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
						const result = await apiPatch("/-/admin/retry/failure-policies", payload);
						setNotice(t("notice.failure_policy_updated", { type: payload.error_type }), "ok");
						return result;
					}, {
						resourceKey: `failure-policy:${payload.error_type}`,
						apply: (config) => {
							const policies = (config.retry ||= {}).failure_policies ||= {};
							policies[payload.error_type] = {
								cooldown_scope: payload.cooldown_scope,
								cooldown_s: payload.cooldown_s,
								provider_cooldown_s: payload.provider_cooldown_s,
								disables_key: payload.disables_key
							};
						},
						drawer: false
					});
				});
			});
		}
		async function runPolicyMutation(form, operation, optimistic = null) {
			return runConfigMutation(form, operation, optimistic);
		}
		function pmStateCell(tone, icon, tip) {
			return `<td class="pm-state ${tone}" title="${escapeHtml(tip)}">${icon ? iconSvg(icon) : `<span class="pm-dash">—</span>`}</td>`;
		}
		function pmShortDuration(value) {
			const n = Number(value) || 0;
			if (n >= 3600 && n % 3600 === 0) return `${n / 3600}h`;
			if (n >= 60 && n % 60 === 0) return `${n / 60}m`;
			return `${n}s`;
		}
		function renderPolicyRule(rule, index) {
			const decision = policyDecision(rule);
			const scope = decision.cooldown_scope || "none";
			const canSwitch = Boolean(rule.retry_next_attempt);
			const codes = [decision.error_type, decision.reason].filter((item, idx, arr) => item && arr.indexOf(item) === idx);
			const tip = [rule.notes || "", codes.join(" · ")].filter(Boolean).join("\n");
			return `
      <tr>
        <td class="pm-idx">${String(index + 1).padStart(2, "0")}</td>
        <td class="pm-trigger" title="${escapeHtml(tip)}">${escapeHtml(rule.match || rule.name || "-")}</td>
        ${decision.retryable ? pmStateCell("pass", "check", "retry") : pmStateCell("deny", "x", "no retry")}
        ${canSwitch ? pmStateCell("pass", "check", "switch attempt") : pmStateCell("deny", "x", "no switch")}
        ${decision.stop_attempts ? pmStateCell("deny", "power-off", "stop attempts") : pmStateCell("idle", "", "continue")}
        ${scope === "none" ? pmStateCell("idle", "", "no cooldown") : `<td class="pm-state cool" title="cooldown ${escapeHtml(scope)} · ${fmtInt(decision.cooldown_s)}s">${iconSvg("clock")}<span>${pmShortDuration(decision.cooldown_s)}</span></td>`}
        ${decision.disables_key ? pmStateCell("deny", "key", "disable key") : pmStateCell("idle", "", "keep key")}
      </tr>
    `;
		}
		function failurePolicyCard(errorType, cfg) {
			const scope = cfg.cooldown_scope || "none";
			const dotTone = scope === "none" ? "off" : scope === "key" ? "warn" : scope === "provider" ? "warn" : "bad";
			return `
      <form class="failure-policy-card failure-policy-form collapsible-card" data-error-type="${escapeHtml(errorType)}">
        <div class="failure-policy-head collapsible-card-header">
          <span class="status-dot ${dotTone}"></span>
          <h3>${escapeHtml(errorType)}</h3>
          <select class="control compact-control" name="cooldown_scope" aria-label="${escapeHtml(errorType)} cooldown scope">
            ${[
				"none",
				"key",
				"provider",
				"key_provider"
			].map((item) => `<option value="${item}" ${scope === item ? "selected" : ""}>${item}</option>`).join("")}
          </select>
          <svg class="chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"></path></svg>
        </div>
        <div class="collapsible-card-body">
          <div class="failure-policy-edit-grid">
            <label class="field">
              <span class="label-with-tip">${t("policy.key_cooldown")}<span class="help-tip" data-tip="${escapeHtml(t("policy.key_cooldown_tip"))}">?</span></span>
              <input class="control" name="cooldown_s" type="number" min="0" max="86400" value="${escapeHtml(cfg.cooldown_s ?? 0)}" required />
            </label>
            <label class="field">
              <span class="label-with-tip">${t("policy.provider_cooldown")}<span class="help-tip" data-tip="${escapeHtml(t("policy.provider_cooldown_tip"))}">?</span></span>
              <input class="control" name="provider_cooldown_s" type="number" min="0" max="300" value="${escapeHtml(cfg.provider_cooldown_s ?? 0)}" required />
            </label>
            <label class="check-field failure-disable-check">
              <span class="toggle-switch"><input type="checkbox" name="disables_key" ${cfg.disables_key ? "checked" : ""} /><span class="slider"></span></span>
              <span class="label-with-tip">${t("policy.disable_key")}<span class="help-tip" data-tip="${escapeHtml(failurePolicyDescription(errorType))}">?</span></span>
            </label>
            <button class="button secondary" type="submit">${t("policy.save_policy")}</button>
          </div>
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
		function usageStatisticsParams() {
			const params = new URLSearchParams({ range: state.usageStatisticsRange || "all" });
			const filters = state.usageStatisticsFilters || {};
			Object.entries(filters).forEach(([key, value]) => {
				if (value) params.set(key, value);
			});
			if (state.usageStatisticsRange === "custom") {
				const start = usageStatisticsCustomTimestamp(state.usageStatisticsCustomStart);
				const end = usageStatisticsCustomTimestamp(state.usageStatisticsCustomEnd, true);
				if (start && end && start < end) {
					params.set("start", String(start));
					params.set("end", String(end));
				}
			}
			return params;
		}
		function setUsageStatisticsBusy(parts, busy) {
			const mapping = {
				summary: "usageStatisticsSummary",
				timeseries: "usageStatisticsChart",
				breakdown: "usageStatisticsBreakdown"
			};
			parts.forEach((part) => el(mapping[part])?.setAttribute("aria-busy", busy ? "true" : "false"));
			el("usageStatisticsRefresh")?.classList.toggle("is-loading", busy);
		}
		async function loadUsageStatistics({ force = false, parts = [
			"summary",
			"timeseries",
			"breakdown"
		], includeDimensions = false } = {}) {
			if (state.configTab !== "models" || state.statisticsView !== "usage") return;
			if (state.usageStatisticsLoading && !force) return;
			const requested = Array.from(new Set(parts));
			const hasData = state.data.usageStatistics && typeof state.data.usageStatistics === "object";
			if (!force && hasData && requested.every((part) => state.data.usageStatistics?.[part])) {
				renderUsageStatistics();
				return;
			}
			const sequence = Number(state.usageStatisticsLoadSeq || 0) + 1;
			const requestedMetric = state.usageStatisticsMetric || "tokens";
			state.usageStatisticsLoadSeq = sequence;
			el("usageStatisticsChart")?.setAttribute("data-requested-metric", requestedMetric);
			state.usageStatisticsLoading = true;
			setUsageStatisticsBusy(requested, true);
			const notice = el("usageStatisticsNotice");
			if (notice) notice.textContent = "";
			const base = usageStatisticsParams();
			const requests = [];
			requested.forEach((part) => {
				const params = new URLSearchParams(base);
				if (part === "summary") requests.push([part, apiGet(`/-/admin/usage-statistics/summary?${params.toString()}`)]);
				if (part === "timeseries") {
					params.set("metric", requestedMetric);
					params.set("resolution", "auto");
					requests.push([part, apiGet(`/-/admin/usage-statistics/timeseries?${params.toString()}`)]);
				}
				if (part === "breakdown") {
					params.set("group_by", state.usageStatisticsBreakdown || "model");
					params.set("sort", state.usageStatisticsBreakdownSort || "tokens");
					params.set("order", "desc");
					params.set("limit", String(6));
					params.set("offset", String(Math.max(0, Number(state.usageStatisticsBreakdownPage || 0)) * 6));
					requests.push([part, apiGet(`/-/admin/usage-statistics/breakdown?${params.toString()}`)]);
				}
			});
			if (includeDimensions || !state.data.usageStatisticsDimensions) requests.push(["dimensions", apiGet("/-/admin/usage-statistics/dimensions")]);
			try {
				const settled = await Promise.allSettled(requests.map(([, promise]) => promise));
				if (sequence !== state.usageStatisticsLoadSeq) return;
				const current = { ...state.data.usageStatistics || {} };
				const failures = [];
				settled.forEach((result, index) => {
					const key = requests[index][0];
					if (result.status === "fulfilled") if (key === "dimensions") state.data.usageStatisticsDimensions = result.value;
					else {
						current[key] = result.value;
						if (key === "timeseries") el("usageStatisticsChart")?.setAttribute("data-response-metric", result.value?.metric || "");
					}
					else failures.push(result.reason?.message || String(result.reason || key));
				});
				state.data.usageStatistics = current;
				renderUsageStatistics();
				if (failures.length && notice) notice.innerHTML = `<span class="notice danger">${escapeHtml(t("usage_stats.partial_load_failed", { error: failures.join(" · ") }))}</span>`;
			} catch (err) {
				if (sequence !== state.usageStatisticsLoadSeq) return;
				if (notice) notice.innerHTML = `<span class="notice danger">${escapeHtml(t("usage_stats.failed", { error: err.message }))}</span>`;
			} finally {
				if (sequence === state.usageStatisticsLoadSeq) {
					state.usageStatisticsLoading = false;
					setUsageStatisticsBusy(requested, false);
					renderUsageStatistics();
				}
			}
		}
		function populateUsageStatisticsDimensions() {
			const dimensions = state.data.usageStatisticsDimensions || {};
			[
				[
					"usageStatisticsModel",
					"models",
					"model",
					t("usage_stats.all_models")
				],
				[
					"usageStatisticsProvider",
					"providers",
					"provider",
					t("usage_stats.all_providers")
				],
				[
					"usageStatisticsFormat",
					"client_formats",
					"client_format",
					t("usage_stats.all_formats")
				]
			].forEach(([id, listKey, filterKey, allLabel]) => {
				const select = el(id);
				if (!select) return;
				const values = Array.isArray(dimensions[listKey]) ? dimensions[listKey] : [];
				const selected = String(state.usageStatisticsFilters?.[filterKey] || "");
				const signature = JSON.stringify([values, allLabel]);
				if (select.dataset.dimensionSignature !== signature) {
					select.dataset.dimensionSignature = signature;
					updateDOM(select, `<option value="">${escapeHtml(allLabel)}</option>${values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}`);
				}
				select.value = selected;
			});
		}
		function usageStatisticsMetaPayload() {
			const data = state.data.usageStatistics || {};
			return data.summary || data.timeseries || data.breakdown || {};
		}
		function renderUsageStatisticsMeta() {
			const payload = usageStatisticsMetaPayload();
			const target = el("usageStatisticsMeta");
			if (!target) return;
			const startedAt = Number(payload.statistics_started_at || 0);
			const timezone = payload.reporting_timezone || payload.range?.timezone || "-";
			const complete = !payload.partial;
			updateDOM(target, `
      <span class="usage-statistics-period">${iconSvg("clock")}<span>${escapeHtml(startedAt ? t("usage_stats.since", { date: fmtDate(startedAt) }) : t("usage_stats.awaiting_data"))}</span></span>
      <span class="usage-statistics-timezone mono">${escapeHtml(timezone)}</span>
      <span class="usage-statistics-completeness ${complete ? "is-complete" : "is-partial"}"><i aria-hidden="true"></i>${escapeHtml(complete ? t("usage_stats.complete") : t("usage_stats.partial"))}</span>
    `);
		}
		function usageStatisticsCostStatus(summary) {
			const statuses = summary?.cost?.statuses || {};
			const pending = Number(statuses.pending || 0);
			const unpriced = Number(statuses.unpriced || 0);
			if (pending) return {
				tone: "warning",
				icon: "clock",
				label: t("usage_stats.cost_pending", { count: fmtInt(pending) })
			};
			if (unpriced) return {
				tone: "danger",
				icon: "alert",
				label: t("usage_stats.cost_unpriced", { count: fmtInt(unpriced) })
			};
			const estimated = Number(statuses.estimated || 0);
			if (estimated) return {
				tone: "info",
				icon: "info",
				label: t("usage_stats.cost_estimated", { count: fmtInt(estimated) })
			};
			return {
				tone: "success",
				icon: "check",
				label: t("usage_stats.cost_priced")
			};
		}
		function usageStatisticsTokenCard(icon, label, value, tone, share) {
			return `
      <article class="usage-token-card tone-${escapeHtml(tone)}">
        <span class="usage-token-card-icon">${iconSvg(icon)}</span>
        <span class="usage-token-card-copy"><small>${escapeHtml(label)}</small><strong>${escapeHtml(fmtTokenCount(value))}</strong></span>
        <span class="usage-token-card-share"><b style="--usage-share:${svgNum(Math.max(0, Math.min(100, share)))}%"></b></span>
      </article>
    `;
		}
		function renderUsageStatisticsSummary() {
			const payload = state.data.usageStatistics?.summary;
			const target = el("usageStatisticsSummary");
			if (!target) return;
			if (!payload) {
				if (!state.usageStatisticsLoading) updateDOM(target, `<div class="empty pad">${escapeHtml(t("usage_stats.empty"))}</div>`);
				return;
			}
			const summary = payload.summary || {};
			const usage = usageFrom(summary.usage || {});
			const total = Math.max(1, Number(usage.total_tokens || 0));
			const costStatus = usageStatisticsCostStatus(summary);
			const requestCount = Number(summary.requests || 0);
			const successRate = Number(summary.success_rate || 0);
			const tokensKnown = Number(usage.total_tokens || 0) > 0;
			updateDOM(target, `
      <div class="usage-statistics-primary-row">
        <article class="usage-total-card">
          <div class="usage-total-label"><span class="usage-total-icon">${iconSvg("bolt")}</span><span><small>${escapeHtml(t("usage_stats.total_tokens"))}</small><b>${escapeHtml(t("usage_stats.upstream_consumption"))}</b></span></div>
          <strong>${escapeHtml(tokensKnown ? fmtTokenCount(usage.total_tokens) : "—")}</strong>
          <span class="usage-total-exact mono">${escapeHtml(tokensKnown ? fmtInt(usage.total_tokens) : t("usage_stats.no_token_samples"))}</span>
        </article>
        <article class="usage-compact-card">
          <span class="usage-compact-icon tone-info">${iconSvg("activity")}</span>
          <span><small>${escapeHtml(t("usage_stats.client_requests"))}</small><strong>${escapeHtml(fmtInt(requestCount))}</strong><b>${escapeHtml(t("usage_stats.success_value", {
				rate: fmtPct(successRate),
				count: fmtInt(summary.success || 0)
			}))}</b></span>
        </article>
        <article class="usage-compact-card">
          <span class="usage-compact-icon tone-success">${iconSvg("dollar")}</span>
          <span><small>${escapeHtml(t("usage_stats.known_cost"))}</small><strong>${escapeHtml(fmtCost(summary.cost?.known_usd || 0))}</strong><b class="tone-${escapeHtml(costStatus.tone)}">${iconSvg(costStatus.icon)}${escapeHtml(costStatus.label)}</b></span>
        </article>
      </div>
      <div class="usage-token-grid">
        ${usageStatisticsTokenCard("arrow-down", t("tokens.uncached"), usage.uncached_input_tokens, "info", usage.uncached_input_tokens / total * 100)}
        ${usageStatisticsTokenCard("layers", t("tokens.cached"), usage.cached_input_tokens, "success", usage.cached_input_tokens / total * 100)}
        ${usageStatisticsTokenCard("boxes", t("tokens.cache_write"), usage.cache_write_tokens, "warning", usage.cache_write_tokens / total * 100)}
        ${usageStatisticsTokenCard("arrow-up", t("tokens.output"), usage.output_tokens, "compat", usage.output_tokens / total * 100)}
        ${usageStatisticsTokenCard("brain", t("tokens.reasoning"), usage.reasoning_tokens, "reasoning", usage.reasoning_tokens / total * 100)}
        <article class="usage-token-card tone-cache">
          <span class="usage-token-card-icon">${iconSvg("zap")}</span>
          <span class="usage-token-card-copy"><small>${escapeHtml(t("model_usage.cache_rate"))}</small><strong>${escapeHtml(fmtPct(summary.cache_rate || 0))}</strong></span>
          <span class="usage-token-card-share"><b style="--usage-share:${svgNum(Math.max(0, Math.min(100, Number(summary.cache_rate || 0) * 100)))}%"></b></span>
        </article>
      </div>
    `);
		}
		function usageStatisticsRangeLabel(range) {
			return {
				today: t("usage_stats.today"),
				"24h": "24h",
				"7d": "7d",
				"30d": "30d",
				"90d": "90d",
				"1y": t("usage_stats.one_year"),
				all: t("req.all"),
				custom: t("usage_stats.custom")
			}[range] || range || "-";
		}
		function usageStatisticsMetricSeries(metric) {
			const configs = {
				tokens: [
					{
						key: "uncached",
						label: t("tokens.uncached"),
						color: "#2f7df4",
						value: (point) => Number(point.usage?.uncached_input_tokens || 0)
					},
					{
						key: "cached",
						label: t("tokens.cached"),
						color: "#12a36b",
						value: (point) => Number(point.usage?.cached_input_tokens || 0)
					},
					{
						key: "write",
						label: t("tokens.cache_write"),
						color: "#e89420",
						value: (point) => Number(point.usage?.cache_write_tokens || 0)
					},
					{
						key: "output",
						label: t("tokens.output"),
						color: "#8157d9",
						value: (point) => Number(point.usage?.output_tokens || 0)
					}
				],
				cost: [
					{
						key: "priced",
						label: t("cost.priced"),
						color: "#12a36b",
						value: (point) => Number(point.cost?.priced_usd || 0)
					},
					{
						key: "estimated",
						label: t("cost.estimated"),
						color: "#e89420",
						value: (point) => Number(point.cost?.estimated_usd || 0)
					},
					{
						key: "legacy",
						label: t("cost.legacy"),
						color: "#718096",
						value: (point) => Number(point.cost?.legacy_usd || 0)
					}
				],
				requests: [
					{
						key: "success",
						label: t("usage_stats.success"),
						color: "#12a36b",
						value: (point) => Number(point.success || 0)
					},
					{
						key: "failed",
						label: t("usage_stats.failed_requests"),
						color: "#e34b59",
						value: (point) => Number(point.failed || 0)
					},
					{
						key: "recovered",
						label: t("usage_stats.recovered"),
						color: "#e89420",
						value: (point) => Number(point.recovered || 0)
					}
				],
				latency: [{
					key: "first",
					label: t("usage_stats.first_event"),
					color: "#2f7df4",
					value: (point) => Number(point.latency?.avg_first_event_ms || 0)
				}, {
					key: "duration",
					label: t("usage_stats.total_duration"),
					color: "#8157d9",
					value: (point) => Number(point.latency?.avg_duration_ms || 0)
				}]
			};
			return configs[metric] || configs.tokens;
		}
		function formatUsageStatisticsMetric(metric, value) {
			if (metric === "cost") return fmtCost(value);
			if (metric === "latency") return fmtCompactMs(value);
			if (metric === "tokens") return fmtTokenCount(value);
			return fmtInt(value);
		}
		function usageStatisticsAxisDate(timestamp, resolution) {
			const value = /* @__PURE__ */ new Date(Number(timestamp || 0) * 1e3);
			if (!Number.isFinite(value.getTime())) return "-";
			const locale = getLang() === "zh" ? "zh-CN" : "en-US";
			return value.toLocaleString(locale, resolution === "hour" ? {
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false
			} : {
				year: "2-digit",
				month: "2-digit",
				day: "2-digit"
			});
		}
		function renderUsageStatisticsChart() {
			const payload = state.data.usageStatistics?.timeseries;
			const target = el("usageStatisticsChart");
			if (!target) return;
			if (!payload) {
				if (!state.usageStatisticsLoading) updateDOM(target, `<div class="empty pad">${escapeHtml(t("usage_stats.empty_series"))}</div>`);
				return;
			}
			const points = Array.isArray(payload.points) ? payload.points : [];
			const metric = payload.metric || state.usageStatisticsMetric || "tokens";
			target.setAttribute("data-rendered-metric", metric);
			const series = usageStatisticsMetricSeries(metric).map((definition) => ({
				...definition,
				values: points.map((point) => Math.max(0, definition.value(point)))
			})).filter((definition) => definition.values.some((value) => value > 0));
			const subtitle = el("usageStatisticsChartSubtitle");
			if (subtitle) subtitle.textContent = t("usage_stats.chart_context", {
				range: usageStatisticsRangeLabel(payload.range?.name || state.usageStatisticsRange),
				resolution: payload.resolution === "hour" ? t("usage_stats.hourly") : t("usage_stats.daily"),
				count: fmtInt(points.length)
			});
			if (!points.length || !series.some((definition) => definition.values.some((value) => value > 0))) {
				updateDOM(target, `<div class="usage-statistics-empty-state">${iconSvg("activity")}<span><strong>${escapeHtml(t("usage_stats.no_series_title"))}</strong><small>${escapeHtml(t("usage_stats.no_series_hint"))}</small></span></div>`);
				return;
			}
			const width = 1e3;
			const height = 286;
			const pad = {
				top: 24,
				right: 24,
				bottom: 42,
				left: 62
			};
			const plotW = width - pad.left - pad.right;
			const plotH = height - pad.top - pad.bottom;
			const maxValue = niceChartMax(Math.max(1, ...series.flatMap((definition) => definition.values)));
			const xFor = (index) => pad.left + (points.length > 1 ? index / (points.length - 1) * plotW : plotW / 2);
			const yFor = (value) => pad.top + plotH - Math.max(0, value) / maxValue * plotH;
			const seriesGeometry = series.map((definition, seriesIndex) => {
				const linePoints = definition.values.map((value, index) => ({
					x: xFor(index),
					y: yFor(value)
				}));
				const path = smoothSvgPath(linePoints, pad.top, pad.top + plotH);
				return {
					definition,
					linePoints,
					path,
					gradientId: `usage-statistics-fill-${seriesIndex}`,
					area: path ? `${path} L ${svgNum(linePoints[linePoints.length - 1].x)} ${svgNum(pad.top + plotH)} L ${svgNum(linePoints[0].x)} ${svgNum(pad.top + plotH)} Z` : ""
				};
			});
			const gradientDefs = seriesGeometry.map(({ definition, gradientId }) => `<linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${definition.color}" stop-opacity=".22"></stop><stop offset="1" stop-color="${definition.color}" stop-opacity="0"></stop></linearGradient>`).join("");
			const seriesAreas = seriesGeometry.map(({ area, gradientId }) => area ? `<path class="usage-statistics-area" d="${area}" fill="url(#${gradientId})"></path>` : "").join("");
			const seriesLines = seriesGeometry.map(({ definition, linePoints, path }) => `<path class="usage-statistics-line" d="${path}" style="--series-color:${definition.color}"></path>${points.length <= 48 ? linePoints.map((point, index) => definition.values[index] > 0 ? `<circle class="usage-statistics-dot" cx="${svgNum(point.x)}" cy="${svgNum(point.y)}" r="2.8" style="--series-color:${definition.color}"></circle>` : "").join("") : ""}`).join("");
			const grid = [
				0,
				.25,
				.5,
				.75,
				1
			].map((ratio) => {
				const y = pad.top + plotH - ratio * plotH;
				return `<line x1="${pad.left}" y1="${svgNum(y)}" x2="${width - pad.right}" y2="${svgNum(y)}"></line><text x="${pad.left - 12}" y="${svgNum(y + 3)}" text-anchor="end">${escapeHtml(formatUsageStatisticsMetric(metric, maxValue * ratio))}</text>`;
			}).join("");
			const xLabels = Array.from(new Set([
				0,
				...Array.from({ length: 5 }, (_, index) => Math.round((index + 1) / 6 * (points.length - 1))),
				points.length - 1
			])).filter((index) => index >= 0 && index < points.length).map((index) => `<text x="${svgNum(xFor(index))}" y="${height - 15}" text-anchor="middle">${escapeHtml(usageStatisticsAxisDate(points[index].start, payload.resolution))}</text>`).join("");
			const slot = Math.max(3, plotW / Math.max(1, points.length));
			const inspection = points.map((point, index) => {
				const details = series.map((definition) => `${definition.label}: ${formatUsageStatisticsMetric(metric, definition.values[index])}`).join(" · ");
				const label = `${fmtDate(point.start)} · ${details}`;
				return `<rect class="usage-statistics-inspection" x="${svgNum(xFor(index) - slot / 2)}" y="${pad.top}" width="${svgNum(slot)}" height="${plotH}" tabindex="0" role="img" aria-label="${escapeHtml(label)}" data-tip="${escapeHtml(label)}"></rect>`;
			}).join("");
			updateDOM(target, `
          <div class="usage-statistics-chart-canvas">
            <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(t("usage_stats.chart_aria", { metric }))}">
              <defs>${gradientDefs}</defs>
              <g class="usage-statistics-grid">${grid}</g>
              <g class="usage-statistics-x-axis">${xLabels}</g>
              <g>${seriesAreas}</g>
              <g>${seriesLines}</g>
              <g>${inspection}</g>
            </svg>
          </div>
          <div class="usage-statistics-legend">${series.map((definition) => `<span><i style="--series-color:${definition.color}"></i>${escapeHtml(definition.label)}</span>`).join("")}</div>
        `);
		}
		function usageStatisticsBreakdownMetric(item) {
			const sort = state.usageStatisticsBreakdownSort || "tokens";
			if (sort === "cost") return Number(item.cost?.known_usd || 0);
			if (sort === "requests") return Number(item.requests || 0);
			if (sort === "latency") return Number(item.latency?.avg_duration_ms || 0);
			return Number(item.usage?.total_tokens || 0);
		}
		function usageStatisticsBreakdownMetricText(item) {
			const sort = state.usageStatisticsBreakdownSort || "tokens";
			return formatUsageStatisticsMetric(sort === "requests" ? "requests" : sort, usageStatisticsBreakdownMetric(item));
		}
		function usageStatisticsBreakdownPagination(payload) {
			const total = Math.max(0, Number(payload?.total || 0));
			const limit = Math.max(1, Number(payload?.limit || 6));
			const pages = Math.max(1, Math.ceil(total / limit));
			const page = Math.min(pages, Math.max(1, Number(state.usageStatisticsBreakdownPage || 0) + 1));
			if (pages <= 1) return "";
			return `<div class="usage-statistics-breakdown-pagination"><span>${escapeHtml(t("usage_stats.page_of", {
				page: fmtInt(page),
				total: fmtInt(pages)
			}))}</span><span><button class="icon-button" type="button" data-usage-statistics-breakdown-page="${page - 2}" aria-label="${escapeHtml(t("req.previous_page"))}" ${page <= 1 ? "disabled" : ""}>${iconSvg("chevron-left")}</button><button class="icon-button" type="button" data-usage-statistics-breakdown-page="${page}" aria-label="${escapeHtml(t("req.next_page"))}" ${page >= pages ? "disabled" : ""}>${iconSvg("chevron-right")}</button></span></div>`;
		}
		function bindUsageStatisticsBreakdownPagination(target) {
			target?.querySelectorAll("[data-usage-statistics-breakdown-page]").forEach((button) => {
				button.addEventListener("click", () => {
					if (button.disabled) return;
					state.usageStatisticsBreakdownPage = Math.max(0, Number(button.dataset.usageStatisticsBreakdownPage || 0));
					loadUsageStatistics({
						force: true,
						parts: ["breakdown"]
					});
				});
			});
		}
		function renderUsageStatisticsBreakdown() {
			const payload = state.data.usageStatistics?.breakdown;
			const target = el("usageStatisticsBreakdown");
			if (!target) return;
			if (!payload) {
				if (!state.usageStatisticsLoading) updateDOM(target, `<div class="empty pad">${escapeHtml(t("usage_stats.empty_breakdown"))}</div>`);
				return;
			}
			const items = Array.isArray(payload.items) ? payload.items : [];
			const group = payload.group_by || state.usageStatisticsBreakdown || "model";
			const maxValue = Math.max(1, ...items.map(usageStatisticsBreakdownMetric));
			const subtitle = el("usageStatisticsBreakdownSubtitle");
			if (subtitle) subtitle.textContent = group === "provider" ? t("usage_stats.provider_semantics") : t("usage_stats.model_semantics");
			if (!items.length) {
				updateDOM(target, `<div class="usage-statistics-empty-state">${iconSvg(group === "provider" ? "server" : "boxes")}<span><strong>${escapeHtml(t("usage_stats.no_breakdown_title"))}</strong><small>${escapeHtml(t("usage_stats.no_breakdown_hint"))}</small></span></div>`);
				return;
			}
			updateDOM(target, `
      <div class="usage-statistics-breakdown-list">
        ${items.map((item, index) => {
				const dimension = item.dimension || "-";
				const metricValue = usageStatisticsBreakdownMetric(item);
				const brand = group === "provider" ? providerBrandIconMarkup(dimension, iconSvg("server")) : modelBrandIconMarkup(dimension, iconSvg("boxes"));
				return `<article class="usage-statistics-breakdown-row">
            <span class="usage-statistics-rank mono">${escapeHtml(String(Number(payload.offset || 0) + index + 1).padStart(2, "0"))}</span>
            <span class="usage-statistics-breakdown-identity">${brand}<span><strong data-tip="${escapeHtml(dimension)}">${escapeHtml(dimension)}</strong><small>${escapeHtml(group === "provider" ? t("usage_stats.upstream_provider") : t("usage_stats.client_model"))}</small></span></span>
            <span class="usage-statistics-breakdown-bar"><i style="--breakdown-share:${svgNum(metricValue / maxValue * 100)}%"></i></span>
            <span class="usage-statistics-breakdown-result"><strong>${escapeHtml(usageStatisticsBreakdownMetricText(item))}</strong><small>${escapeHtml(t("usage_stats.requests_and_success", {
					requests: fmtInt(item.requests || 0),
					rate: fmtPct(item.success_rate || 0)
				}))}</small></span>
            <span class="usage-statistics-breakdown-cost"><strong>${escapeHtml(fmtCost(item.cost?.known_usd || 0))}</strong><small>${escapeHtml(t("usage_stats.cost_short"))}</small></span>
          </article>`;
			}).join("")}
      </div>
      ${usageStatisticsBreakdownPagination(payload)}
    `);
			bindUsageStatisticsBreakdownPagination(target);
		}
		function renderUsageStatistics() {
			populateUsageStatisticsDimensions();
			renderUsageStatisticsMeta();
			renderUsageStatisticsSummary();
			renderUsageStatisticsChart();
			renderUsageStatisticsBreakdown();
			const payload = usageStatisticsMetaPayload();
			const notice = el("usageStatisticsNotice");
			if (notice && payload.partial && !notice.textContent.trim()) {
				const remaining = Number(payload.backfill?.remaining || 0);
				notice.innerHTML = `<span class="usage-statistics-partial">${iconSvg("info")}<span><strong>${escapeHtml(t("usage_stats.backfill_title"))}</strong><small>${escapeHtml(t("usage_stats.backfill_hint", { count: fmtInt(remaining) }))}</small></span></span>`;
			}
		}
		function renderConfig() {
			const config = state.data.config || {};
			const locale = getLang();
			const configChanged = state.forceConfigRender || config !== _lastRenderedConfigObject || locale !== _lastRenderedConfigLocale;
			const overlayChanged = configChanged || state.data.overlay !== _lastRenderedOverlayObject;
			if (configChanged) {
				const snapshot = el("configSnapshot");
				if (snapshot) snapshot.textContent = JSON.stringify(config, null, 2);
				renderConfigSummary(config);
				renderGlobalProxy(config);
				renderModelRoutes(config);
				renderProviderModelMap(config);
				renderConfigProviders(config);
				renderAuditTrail();
				_lastRenderedConfigObject = config;
				_lastRenderedConfigLocale = locale;
				state.forceConfigRender = false;
			}
			if (overlayChanged) {
				renderOverlaySafety(config);
				_lastRenderedOverlayObject = state.data.overlay;
			}
			if (state.data.usageStatistics && (configChanged || state.data.usageStatistics !== _lastRenderedUsageStatisticsObject)) {
				renderUsageStatistics();
				_lastRenderedUsageStatisticsObject = state.data.usageStatistics;
			}
			if (state.data.modelUsage && (configChanged || state.data.modelUsage !== _lastRenderedModelUsageObject)) {
				renderModelUsage();
				_lastRenderedModelUsageObject = state.data.modelUsage;
			}
			if (configChanged || state.data.conversionDiagnostics !== _lastRenderedConversionDiagnosticsObject) {
				renderConversionDiagnostics();
				_lastRenderedConversionDiagnosticsObject = state.data.conversionDiagnostics;
			}
		}
		function fmtFileSize(value) {
			const bytes = Math.max(0, Number(value || 0));
			if (bytes < 1024) return `${fmtInt(bytes)} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
		}
		function renderConversionDiagnostics() {
			const target = el("conversionDiagnosticsStatus");
			if (!target) return;
			const data = state.data.conversionDiagnostics;
			if (!data) {
				updateDOM(target, `<span class="conversion-diagnostics-empty">${iconSvg("rotate")}<span>${escapeHtml(t("model_usage.loading"))}</span></span>`);
				renderConversionDiagRecords();
				return;
			}
			if (!data.enabled) {
				updateDOM(target, `<span class="conversion-diagnostics-empty">${iconSvg("alert")}<span>${escapeHtml(t("cfg.diagnostics_disabled"))}</span></span>`);
				renderConversionDiagRecords();
				return;
			}
			const records = Math.max(0, Number(data.records || 0));
			updateDOM(target, records ? `
      <span><small>${escapeHtml(t("cfg.diagnostics_records"))}</small><strong>${fmtInt(records)}</strong></span>
      <span><small>${escapeHtml(t("cfg.diagnostics_files"))}</small><strong>${fmtInt(data.files || 0)}</strong></span>
      <span><small>${escapeHtml(t("cfg.diagnostics_size"))}</small><strong>${escapeHtml(fmtFileSize(data.bytes || 0))}</strong></span>
      <span class="${Number(data.dropped || 0) ? "tone-warning" : ""}"><small>${escapeHtml(t("cfg.diagnostics_dropped"))}</small><strong>${fmtInt(data.dropped || 0)}</strong></span>
    ` : `<span class="conversion-diagnostics-empty">${iconSvg("check")}<span>${escapeHtml(t("cfg.diagnostics_empty"))}</span></span>`);
			renderConversionDiagRecords();
		}
		function renderConversionDiagRecords() {
			const target = el("conversionDiagnosticsRecords");
			if (!target) return;
			const items = Array.isArray(state.data.conversionDiagRecords?.items) ? state.data.conversionDiagRecords.items : [];
			if (!items.length) {
				updateDOM(target, "");
				return;
			}
			const rows = items.slice(0, 20).map((item) => {
				const error = item.error || {};
				const time = Number(item.timestamp || 0) ? (/* @__PURE__ */ new Date(Number(item.timestamp) * 1e3)).toLocaleString(getLang() === "zh" ? "zh-CN" : "en-US", {
					month: "2-digit",
					day: "2-digit",
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit"
				}) : "-";
				const formats = [item.source_format, item.target_format].filter(Boolean).join(" → ");
				const message = String(error.message || error.code || "-");
				const model = String(item.provider_model || item.context && item.context.model || "");
				return `
        <div class="conversion-diag-record" data-tip="${escapeHtml(`${String(error.code || "")} ${message}`.trim().slice(0, 300))}" tabindex="0">
          <span class="conversion-diag-time mono">${escapeHtml(time)}</span>
          ${badge(String(item.stage || "-"), item.stage === "request" ? "warn" : "info")}
          <span class="conversion-diag-formats mono">${escapeHtml(formats || "-")}</span>
          <span class="conversion-diag-provider">${escapeHtml(String(item.provider || "-"))}</span>
          <span class="conversion-diag-model mono">${escapeHtml(model || "-")}</span>
          <span class="conversion-diag-message">${escapeHtml(message.slice(0, 120))}</span>
        </div>
      `;
			}).join("");
			updateDOM(target, `<div class="conversion-diag-records-head">${escapeHtml(t("cfg.diagnostics_recent"))}</div>${rows}`);
		}
		async function loadModelUsage({ force = false } = {}) {
			if (state.configTab !== "models" || state.modelUsageLoading) return;
			if (state.data.modelUsage && !force) {
				renderModelUsage();
				return;
			}
			state.modelUsageLoading = true;
			const tableTarget = el("modelUsageTable");
			tableTarget?.setAttribute("aria-busy", "true");
			if (!state.data.modelUsage) updateDOM(tableTarget, `<div class="empty pad">${escapeHtml(t("model_usage.loading"))}</div>`);
			const params = new URLSearchParams({
				range: state.modelUsageRange || "7d",
				query: state.modelUsageQuery || "",
				sort: state.modelUsageSort || "calls",
				order: "desc",
				limit: String(10),
				offset: String(Math.max(0, Number(state.modelUsagePage || 0)) * 10)
			});
			try {
				state.data.modelUsage = await apiGet(`/-/admin/models/usage?${params.toString()}`);
				renderModelUsage();
			} catch (err) {
				updateDOM(el("modelUsageTable"), `<div class="notice danger pad">${escapeHtml(t("model_usage.failed", { error: err.message }))}</div>`);
			} finally {
				state.modelUsageLoading = false;
				tableTarget?.setAttribute("aria-busy", "false");
			}
		}
		function tokenCompositionBar(usageValue, label = "") {
			const usage = usageFrom(usageValue);
			const total = Math.max(1, usage.total_tokens);
			const parts = [
				[
					"uncached",
					usage.uncached_input_tokens,
					t("tokens.uncached")
				],
				[
					"cached",
					usage.cached_input_tokens,
					t("tokens.cached")
				],
				[
					"write",
					usage.cache_write_tokens,
					t("tokens.cache_write")
				],
				[
					"output",
					usage.output_tokens,
					t("tokens.output")
				]
			];
			const aria = parts.map(([, value, name]) => `${name} ${fmtInt(value)}`).join(", ");
			return `<div class="model-token-composition" data-tip="${escapeHtml(aria)}"><div class="token-composition-bar" role="img" aria-label="${escapeHtml(`${label} ${aria}`)}">${parts.map(([tone, value]) => `<i class="token-segment token-${tone}" aria-hidden="true" style="--token-share:${svgNum(value / total * 100)}%"></i>`).join("")}</div><small>${escapeHtml(t("model_usage.token_in_out", {
				input: fmtTokenCount(usage.input_tokens),
				output: fmtTokenCount(usage.output_tokens)
			}))}</small></div>`;
		}
		function modelUsagePagination(payload) {
			const total = Math.max(0, Number(payload?.total || 0));
			const limit = Math.max(1, Number(payload?.limit || 10));
			const totalPages = Math.max(1, Math.ceil(total / limit));
			const currentPage = Math.min(totalPages, Math.max(1, Number(state.modelUsagePage || 0) + 1));
			const start = total ? Number(payload?.offset || 0) + 1 : 0;
			const end = total ? Math.min(total, start + (Array.isArray(payload?.items) ? payload.items.length : 0) - 1) : 0;
			return `
      <div class="model-usage-pagination" aria-label="${escapeHtml(t("model_usage.pages"))}">
        <span class="model-usage-page-copy"><strong>${escapeHtml(t("model_usage.range_of", {
				start: fmtInt(start),
				end: fmtInt(end),
				total: fmtInt(total)
			}))}</strong><small>${escapeHtml(t("model_usage.aggregation_hint"))}</small></span>
        <span class="model-usage-page-actions">
          <button class="icon-button model-usage-page-button" type="button" data-model-usage-page="${currentPage - 2}" aria-label="${escapeHtml(t("req.previous_page"))}" ${currentPage <= 1 ? "disabled" : ""}>${iconSvg("chevron-left")}</button>
          <strong>${escapeHtml(t("req.page_of", {
				page: fmtInt(currentPage),
				total: fmtInt(totalPages)
			}))}</strong>
          <button class="icon-button model-usage-page-button" type="button" data-model-usage-page="${currentPage}" aria-label="${escapeHtml(t("req.next_page"))}" ${currentPage >= totalPages ? "disabled" : ""}>${iconSvg("chevron-right")}</button>
        </span>
      </div>
    `;
		}
		function bindModelUsagePagination(target) {
			target?.querySelectorAll("[data-model-usage-page]").forEach((button) => {
				button.addEventListener("click", () => {
					if (button.disabled) return;
					state.modelUsagePage = Math.max(0, Number(button.dataset.modelUsagePage || 0));
					loadModelUsage({ force: true });
				});
			});
		}
		function renderModelUsage() {
			const payload = state.data.modelUsage || {};
			const items = Array.isArray(payload.items) ? payload.items : [];
			const summary = payload.summary || {};
			updateDOM(el("modelUsageSummary"), `
      <span class="model-summary-stat tone-info"><i>${iconSvg("activity")}</i><span><small>${escapeHtml(t("model_usage.calls"))}</small><strong>${escapeHtml(fmtInt(summary.calls || 0))}</strong></span></span>
      <span class="model-summary-stat tone-compat"><i>${iconSvg("boxes")}</i><span><small>${escapeHtml(t("model_usage.total_tokens"))}</small><strong>${escapeHtml(fmtTokenCount(summary.total_tokens || 0))}</strong></span></span>
      <span class="model-summary-stat tone-success"><i>${iconSvg("layers")}</i><span><small>${escapeHtml(t("model_usage.cache_rate"))}</small><strong>${escapeHtml(fmtPct(summary.cache_rate || 0))}</strong></span></span>
      <span class="model-summary-stat tone-warning"><i>${iconSvg("dollar")}</i><span><small>${escapeHtml(t("model_usage.cost"))}</small><strong>${escapeHtml(fmtCost(summary.cost_usd || 0))}</strong></span></span>
    `);
			const target = el("modelUsageTable");
			if (!items.length) {
				updateDOM(target, `<div class="empty pad">${escapeHtml(t("model_usage.empty"))}</div>`);
				return;
			}
			updateDOM(target, `
      ${modelUsagePagination(payload)}
      <div class="model-usage-table-scroll">
      <table class="model-usage-table">
        <caption class="sr-only">${escapeHtml(t("model_usage.table_label"))}</caption>
        <thead><tr><th scope="col">${escapeHtml(t("model_usage.col_model"))}</th><th scope="col">${escapeHtml(t("model_usage.col_calls"))}</th><th scope="col">${escapeHtml(t("model_usage.col_success"))}</th><th scope="col">${escapeHtml(t("model_usage.col_tokens"))}</th><th scope="col">${escapeHtml(t("model_usage.col_cache"))}</th><th scope="col">${escapeHtml(t("model_usage.col_cost"))}</th><th scope="col">${escapeHtml(t("model_usage.col_support"))}</th><th scope="col">${escapeHtml(t("model_usage.col_recent"))}</th><th scope="col"><span class="sr-only">${escapeHtml(t("req.open"))}</span></th></tr></thead>
        <tbody>${items.map((item) => {
				const support = Array.isArray(item.current_support) ? item.current_support.filter((entry) => entry.enabled) : [];
				const providers = support.slice(0, 2).map((entry) => entry.provider);
				const more = Math.max(0, support.length - providers.length);
				const successRate = Number(item.success_rate || 0);
				const successTone = successRate >= .98 ? "success" : successRate >= .8 ? "warning" : "danger";
				const cacheRate = Number(item.cache_rate || 0);
				const cacheTone = cacheRate > 0 ? "compat" : "neutral";
				const recent = fmtRequestDateParts(item.last_used);
				return `<tr data-model-usage-row="${escapeHtml(item.client_model || "")}">
            <td class="mono model-usage-model" data-tip="${escapeHtml(item.client_model || "-")}"><span class="model-usage-identity">${modelBrandIconMarkup(item.client_model, iconSvg("boxes"))}<strong>${escapeHtml(item.client_model || "-")}</strong></span></td>
            <td class="model-usage-calls" data-label="${escapeHtml(t("model_usage.col_calls"))}"><strong class="model-call-count">${escapeHtml(fmtInt(item.calls || 0))}</strong></td>
            <td class="model-usage-success" data-label="${escapeHtml(t("model_usage.col_success"))}"><small class="model-rate-badge tone-${successTone}">${iconSvg(successTone === "success" ? "check" : successTone === "warning" ? "clock" : "alert")}${escapeHtml(fmtPct(successRate))}</small></td>
            <td class="model-usage-tokens">${tokenCompositionBar(item.usage, item.client_model)}</td>
            <td class="model-usage-cache"><span class="model-cache-badge tone-${cacheTone}">${iconSvg("layers")}${escapeHtml(fmtPct(cacheRate))}</span></td>
            <td class="model-usage-cost">${renderCost({
					cost_usd: item.cost_usd,
					cost_status: dominantCostStatus(item.cost_statuses)
				}, { compact: true })}</td>
            <td class="model-usage-support"><div class="model-support-tags">${providers.map((provider) => `<span>${iconSvg("server")}${escapeHtml(provider)}</span>`).join("")}${more ? `<span class="is-more">+${fmtInt(more)}</span>` : ""}${!providers.length && !more ? `<span class="is-empty">—</span>` : ""}</div></td>
            <td class="model-usage-recent"><time class="model-last-used" datetime="${escapeHtml(recent.iso)}"><strong>${escapeHtml(recent.date)}</strong><small>${escapeHtml(recent.time)}</small></time></td>
            <td class="model-usage-open"><button class="icon-action model-usage-open-button" type="button" data-model-usage-open="${escapeHtml(item.client_model || "")}" aria-label="${escapeHtml(t("model_usage.open_model", { model: item.client_model || "-" }))}">${iconSvg("chevron-right")}</button></td>
          </tr>`;
			}).join("")}</tbody>
      </table>
      </div>
    `);
			bindModelUsagePagination(target);
			target.querySelectorAll("[data-model-usage-row]").forEach((row) => {
				const open = () => openUsageModelDrawer(row.dataset.modelUsageRow || "");
				row.addEventListener("click", (event) => {
					if (event.target.closest("button, a, input")) return;
					open();
				});
			});
			target.querySelectorAll("[data-model-usage-open]").forEach((button) => {
				button.addEventListener("click", () => openUsageModelDrawer(button.dataset.modelUsageOpen || ""));
			});
		}
		function dominantCostStatus(statuses) {
			const counts = statuses || {};
			return [
				"pending",
				"unpriced",
				"estimated",
				"priced",
				"legacy"
			].find((key) => Number(counts[key] || 0) > 0) || "legacy";
		}
		async function openUsageModelDrawer(modelName) {
			if (!modelName) return;
			closeDrawer(false);
			closeProviderDrawer();
			state.modelDrawerMode = "usage";
			const drawer = el("modelDrawer");
			const body = el("modelDrawerBody");
			el("modelDrawerTitle").innerHTML = `${modelBrandIconMarkup(modelName, iconSvg("boxes"))}<span>${escapeHtml(modelName)}</span>`;
			el("modelDrawerSubtitle").textContent = t("model_usage.drawer_subtitle");
			updateDOM(body, `<div class="empty pad">${escapeHtml(t("model_usage.loading"))}</div>`);
			drawer.classList.add("is-open");
			drawer.setAttribute("aria-hidden", "false");
			try {
				const detail = await apiGet(`/-/admin/models/usage/${encodeURIComponent(modelName)}?range=${encodeURIComponent(state.modelUsageRange || "7d")}`);
				state.data.modelUsageDetail = detail;
				renderUsageModelDrawer(detail);
			} catch (err) {
				updateDOM(body, `<div class="notice danger pad">${escapeHtml(t("model_usage.failed", { error: err.message }))}</div>`);
			}
		}
		function modelSupportReasonLabel(code, item) {
			if (code === "provider_cooldown") return t("model_usage.reason_provider_cooldown", { seconds: fmtInt(item.cooldown_remaining_s || 0) });
			return t(`model_usage.reason_${code}`);
		}
		function modelSupportPriorityBadge(item) {
			const priorityKnown = Number.isFinite(Number(item.effective_priority));
			const priorityTags = [item.priority_source === "model_route" ? t("model_usage.priority_route") : item.priority_source === "runtime_override" ? t("model_usage.priority_override") : "", item.auto_adjusted ? t("model_usage.priority_auto") : ""].filter(Boolean);
			if (!priorityKnown && !priorityTags.length) return "";
			return `<span class="support-priority mono" data-tip="${escapeHtml(t("model_usage.priority_tip"))}">${priorityKnown ? `P${escapeHtml(fmtInt(item.effective_priority))}` : "P?"}${priorityTags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</span>`;
		}
		function renderModelRoutingStep(step) {
			const keysLabel = step.key_count !== void 0 ? `${fmtInt(step.available_key_count || 0)}/${fmtInt(step.key_count || 0)} ${t("model_usage.keys_available")}` : "";
			return `<div class="support-row is-available"><span class="support-rank">#${escapeHtml(fmtInt(step.rank || 0))}</span><strong>${escapeHtml(step.provider || "-")}</strong>${modelSupportPriorityBadge(step)}<span class="mono">${escapeHtml(step.provider_model || "-")}</span><span>${escapeHtml(shortFormatLabel(step.upstream_format || "-"))}</span>${keysLabel ? `<small>${escapeHtml(keysLabel)}</small>` : ""}</div>`;
		}
		function renderModelSupportRow(item, { excluded = false } = {}) {
			const enriched = item.available !== void 0;
			const isAvailable = enriched ? !!item.available : !!item.enabled;
			const keysLabel = enriched ? `${fmtInt(item.available_key_count || 0)}/${fmtInt(item.key_count || 0)} ${t("model_usage.keys_available")}` : `${fmtInt(item.key_coverage?.eligible || 0)}/${fmtInt(item.key_coverage?.total || 0)} ${t("model_usage.keys")}`;
			const reasons = (Array.isArray(item.unavailable_reasons) ? item.unavailable_reasons : []).map((code) => modelSupportReasonLabel(code, item)).join(" · ") || (excluded && isAvailable ? t("model_usage.reason_not_selected") : "");
			return `<div class="support-row ${excluded ? "is-excluded" : isAvailable ? "is-available" : "is-unavailable"}"><span class="support-rank">${excluded ? "—" : isAvailable ? "•" : iconSvg("alert")}</span><strong>${escapeHtml(item.provider || "-")}</strong>${modelSupportPriorityBadge(item)}<span class="mono">${escapeHtml(item.provider_model || "-")}</span><span>${(Array.isArray(item.formats) ? item.formats : []).map(shortFormatLabel).map(escapeHtml).join(" · ") || "-"}</span><small>${escapeHtml(keysLabel)}</small>${reasons ? `<span class="support-reason">${escapeHtml(reasons)}</span>` : ""}</div>`;
		}
		function renderUsageModelDrawer(detail) {
			const body = el("modelDrawerBody");
			const summary = detail.summary || {};
			const providers = Array.isArray(detail.providers) ? detail.providers : [];
			const support = Array.isArray(detail.current_support) ? detail.current_support : [];
			const routeOverview = detail.routing_overview || {};
			const routingPath = Array.isArray(detail.routing_path) ? detail.routing_path : [];
			const pathProviders = new Set(routingPath.map((step) => step.provider));
			const excludedSupport = support.filter((item) => !pathProviders.has(item.provider));
			const rotationMode = [
				"round_robin",
				"weighted_rr",
				"random"
			].includes(routeOverview.provider_select) ? routeOverview.provider_select : "";
			const series = Array.isArray(detail.timeseries) ? detail.timeseries : [];
			const maxCalls = Math.max(1, ...series.map((item) => Number(item.calls || 0)));
			const seriesSummary = series.map((item) => `${fmtDate(item.start)}: ${fmtInt(item.calls)} ${t("model_usage.calls")}`).join(", ");
			updateDOM(body, `
      <div class="model-usage-drawer">
        <div class="model-usage-summary drawer-summary">
          <span class="model-summary-stat tone-info"><i>${iconSvg("activity")}</i><span><small>${escapeHtml(t("model_usage.calls"))}</small><strong>${escapeHtml(fmtInt(summary.calls || 0))}</strong></span></span>
          <span class="model-summary-stat tone-success"><i>${iconSvg("check")}</i><span><small>${escapeHtml(t("model_usage.success_rate"))}</small><strong>${escapeHtml(fmtPct(summary.success_rate || 0))}</strong></span></span>
          <span class="model-summary-stat tone-compat"><i>${iconSvg("boxes")}</i><span><small>${escapeHtml(t("model_usage.total_tokens"))}</small><strong>${escapeHtml(fmtTokenCount(summary.usage?.total_tokens || 0))}</strong></span></span>
          <span class="model-summary-stat tone-warning"><i>${iconSvg("dollar")}</i><span><small>${escapeHtml(t("model_usage.cost"))}</small><strong>${escapeHtml(fmtCost(summary.cost_usd || 0))}</strong></span></span>
        </div>
        ${renderUsageComposition({
				usage: summary.usage,
				cost_usd: summary.cost_usd,
				cost_status: dominantCostStatus(summary.cost_statuses)
			})}
        <section class="model-usage-series"><h3>${escapeHtml(t("model_usage.timeline"))}</h3><div role="img" aria-label="${escapeHtml(t("model_usage.timeline_label", { summary: seriesSummary || t("model_usage.empty") }))}">${series.map((item) => `<span aria-hidden="true" style="--series-height:${svgNum(Math.max(6, Number(item.calls || 0) / maxCalls * 100))}%" data-tip="${escapeHtml(`${fmtDate(item.start)} · ${fmtInt(item.calls)} ${t("model_usage.calls")}`)}"></span>`).join("") || `<span class="empty">${escapeHtml(t("model_usage.empty"))}</span>`}</div></section>
        <section class="model-provider-breakdown"><h3 class="drawer-section-title model-drawer-section-head"><span>${escapeHtml(t("model_usage.provider_breakdown"))}</span><strong>${escapeHtml(fmtInt(providers.length))}</strong></h3>
          <div class="attempt-table-scroll"><table class="model-provider-usage-table"><thead><tr><th scope="col">${escapeHtml(t("req.provider"))} / ${escapeHtml(t("req.attempt_model"))}</th><th scope="col">${escapeHtml(t("req.attempt_format"))}</th><th scope="col">${escapeHtml(t("model_usage.calls"))}</th><th scope="col">${escapeHtml(t("req.col_tokens"))} / ${escapeHtml(t("req.col_cost"))}</th><th scope="col">${escapeHtml(t("req.col_latency"))}</th></tr></thead><tbody>${providers.map((item) => `<tr><td><span class="model-provider-identity"><strong>${iconSvg("server")}${escapeHtml(item.provider || "-")}</strong><small class="mono">${escapeHtml(item.provider_model || "-")}</small></span></td><td><span class="model-format-badge">${escapeHtml(shortFormatLabel(item.upstream_format || "-"))}</span></td><td><span class="model-attempt-badge">${iconSvg("check")}${escapeHtml(`${fmtInt(item.success || 0)}/${fmtInt(item.attempts || 0)}`)}</span></td><td><span class="model-provider-usage"><strong>${escapeHtml(fmtTokenCount(item.total_tokens || 0))}</strong><small>${escapeHtml(fmtCost(item.cost_usd || 0))}</small></span></td><td><span class="model-latency-badge mono">${iconSvg("clock")}${escapeHtml(fmtCompactMs(item.avg_first_event_ms || item.avg_duration_ms || 0))}</span></td></tr>`).join("")}</tbody></table></div>
        </section>
        <section class="model-current-support"><h3 class="drawer-section-title model-drawer-section-head"><span>${escapeHtml(routingPath.length ? t("model_usage.routing_path") : t("model_usage.current_support"))}</span><strong>${escapeHtml(routingPath.length ? excludedSupport.length ? `${fmtInt(routingPath.length)}/${fmtInt(routingPath.length + excludedSupport.length)}` : fmtInt(routingPath.length) : `${fmtInt(support.filter((item) => item.available !== void 0 ? item.available : item.enabled).length)}/${fmtInt(support.length)}`)}</strong></h3>${rotationMode ? `<p class="support-mode-note">${escapeHtml(t("model_usage.rotation_note", { mode: rotationMode }))}</p>` : ""}${routingPath.length ? `${routingPath.map(renderModelRoutingStep).join("")}${excludedSupport.map((item) => renderModelSupportRow(item, { excluded: true })).join("")}` : support.map((item) => renderModelSupportRow(item)).join("") || `<div class="empty">${escapeHtml(t("model_usage.no_support"))}</div>`}</section>
      </div>
    `);
		}
		function renderConfigSummary(config) {
			const target = el("configSummary");
			if (!target) return;
			const providers = config.providers || {};
			const names = Object.keys(providers).filter((name) => !providers[name]?.pending_delete).sort();
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
			updateDOM(target, `
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
    `);
		}
		function renderGlobalProxy(config) {
			const form = el("globalProxyForm");
			if (!form) return;
			const active = document.activeElement;
			if (active && (active.closest("#globalProxyForm") || isContainerDirty("#globalProxyForm"))) return;
			form.elements.proxy.value = proxyText(config.proxy);
		}
		function renderOverlaySafety(config) {
			const target = el("overlaySafety");
			if (!target) return;
			const overlay = state.data.overlay || {};
			const hasOverlay = Boolean(overlay.has_overlay ?? config.has_overlay);
			const overlayPath = overlay.overlay_path || config.overlay_path || "-";
			const overlayKeys = overlay.overlay && typeof overlay.overlay === "object" ? Object.keys(overlay.overlay).sort() : [];
			updateDOM(target, `
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
    `);
			const preview = el("overlayPreview");
			if (preview && !state.data.overlayPreviewPinned) preview.textContent = JSON.stringify(overlay.overlay || {}, null, 2);
		}
		function renderConfigProviders(config) {
			const target = el("configProviders");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceConfigRender && active && (active.closest("#configProviders") || isContainerDirty("#configProviders"))) return;
			const providers = config.providers || {};
			const names = Object.keys(providers).sort();
			if (!names.length) {
				target.classList.add("empty");
				updateDOM(target, "No providers configured");
				state.forceConfigRender = false;
				return;
			}
			const page = paginate(names, "configProvidersPage", 8);
			target.classList.remove("empty");
			updateDOM(target, `
      ${panelPagination("configProvidersPage", page, "providers")}
      <div class="config-provider-page-list">
        ${page.items.map((name) => providerConfigSummaryCard(name, providers[name] || {})).join("")}
      </div>
    `);
			bindPanelPagination(target);
			state.forceConfigRender = false;
		}
		function renderModelRoutes(config) {
			const target = el("modelRoutes");
			if (!target) return;
			const active = document.activeElement;
			if (!state.forceModelRoutesRender && active && (active.closest("#modelRoutesPanel") || isContainerDirty("#modelRoutesPanel"))) return;
			const providers = Object.keys(config.providers || {}).sort();
			const routes = config.models?.routes || {};
			const entries = Object.entries(routes).filter(([_model, route]) => route && typeof route === "object").sort(([a], [b]) => a.localeCompare(b));
			const hint = providers.length ? `<div class="model-route-hint">Available providers ${chipList(providers)}</div>` : `<div class="model-route-hint muted">No providers available</div>`;
			if (!entries.length) {
				target.classList.add("empty");
				updateDOM(target, `${hint}<div class="pad-slim">No model routes configured</div>`);
				state.forceModelRoutesRender = false;
				return;
			}
			target.classList.remove("empty");
			const page = paginate(entries, "modelRoutesPage", 8);
			updateDOM(target, `
      ${hint}
      ${panelPagination("modelRoutesPage", page, "routes")}
      <div class="model-route-page-list">
        ${page.items.map(([model, route]) => modelRouteCard(model, route, config.providers || {})).join("")}
      </div>
    `);
			bindPanelPagination(target);
			state.forceModelRoutesRender = false;
		}
		function modelRouteCard(model, route, providerConfigs = {}) {
			const providers = routeProviderItems(route.providers);
			const providerSelect = route.provider_select || "priority_failover";
			const formatPreference = route.format_preference || "";
			return `
      <article class="model-route-card">
        <div class="model-route-main">
          <div class="provider-name mono">${escapeHtml(model)}</div>
          <div class="model-route-provider-list">
            ${providers.length ? providers.map((item) => {
				const configuredPriority = Number(providerConfigs[item.name]?.priority);
				const globalPriority = Number.isFinite(configuredPriority) ? configuredPriority : 0;
				const hasOverride = item.priority !== null && item.priority !== void 0;
				return `
                <div class="model-route-provider-priority">
                  <span class="tag">${escapeHtml(item.name)} · W${escapeHtml(item.weight)}</span>
                  <input
                    class="control"
                    type="number"
                    min="-1000"
                    max="1000"
                    value="${hasOverride ? escapeHtml(item.priority) : ""}"
                    placeholder="P${escapeHtml(globalPriority)}"
                    data-model-route-priority
                    aria-label="Model priority for ${escapeHtml(item.name)} on ${escapeHtml(model)}"
                  />
                  <button
                    class="button secondary compact-action"
                    type="button"
                    data-model-route-priority-apply
                    data-model="${escapeHtml(model)}"
                    data-provider="${escapeHtml(item.name)}"
                  >Save</button>
                  <small>${hasOverride ? `model P${escapeHtml(item.priority)}` : `inherits P${escapeHtml(globalPriority)}`}</small>
                </div>
              `;
			}).join("") : `<span class="muted">No providers</span>`}
          </div>
        </div>
        <div class="model-route-side">
          ${badge(providerSelect, providerSelect === "random" ? "warn" : providerSelect === "weighted_rr" ? "info" : "ok")}
          ${badge(formatPreference ? formatPreference === "native_first" ? t("policy.format_native") : t("policy.format_priority") : t("cfg.format_inherit"), formatPreference ? "info" : "neutral")}
          ${route.reasoning_effort ? badge(`${t("cfg.reasoning_effort")}: ${route.reasoning_effort}`, route.reasoning_effort === "off" ? "warn" : "info") : ""}
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
		function parseRouteProvidersInput(value) {
			return routeProviderItems(String(value || "").split(",").map((item) => item.trim()).filter(Boolean));
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
				updateDOM(target, `<div class="pad-slim">No provider model overrides configured</div>`);
				return;
			}
			target.classList.remove("empty");
			const page = paginate(providers, "providerModelMapPage", 6);
			updateDOM(target, `
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
    `);
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
				updateDOM(target, "No audit events recorded");
				return;
			}
			target.classList.remove("empty");
			const page = paginate(items, "auditPage", 8);
			updateDOM(target, `
      ${panelPagination("auditPage", page, "events")}
      <div class="audit-page-list">
        ${page.items.map((item) => auditTrailItem(item)).join("")}
      </div>
    `);
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
			const keyText = firstKey ? `key ${firstKey.index} / ${firstKey.masked || firstKey.key_id || "-"}` : t("prov.no_keys");
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
			if (format === "chat_completions") return "Chat";
			if (format === "responses") return "Resp";
			if (format === "anthropic_messages") return "Anth";
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
			root.querySelectorAll(".config-provider-card.collapsible-card").forEach((card) => {
				if (card.dataset.boundcollapsible) return;
				card.dataset.boundcollapsible = "1";
				const storageKey = `proxyConsoleFold_provider_${card.querySelector(".provider-name")?.textContent || ""}`;
				try {
					if (localStorage.getItem(storageKey) === "1") card.classList.add("is-open");
				} catch (_e) {}
				const header = card.querySelector(".collapsible-card-header");
				if (header) header.addEventListener("click", (event) => {
					if (event.target.closest("input, button, select, .help-tip, .toggle-switch, .capsule-toggle")) return;
					const willOpen = !card.classList.contains("is-open");
					card.classList.toggle("is-open");
					try {
						localStorage.setItem(storageKey, willOpen ? "1" : "0");
					} catch (_e) {}
					if (willOpen) requestAnimationFrame(() => {
						if (card.getBoundingClientRect().bottom > window.innerHeight) card.scrollIntoView({
							behavior: "smooth",
							block: "nearest"
						});
					});
				});
			});
			root.querySelectorAll("[data-provider-delete]").forEach((button) => {
				if (button.dataset.bounddataproviderdelete) return;
				button.dataset.bounddataproviderdelete = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.providerDelete || "";
					if (!provider) return;
					if (!await openConfirmDialog({
						title: t("confirm.delete_provider.title"),
						message: t("confirm.delete_provider.msg", { provider }),
						acceptLabel: t("confirm.delete")
					})) return;
					await runOptimisticConfigAction(button, () => apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/delete`, { confirm: "delete_provider" }), {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) config.providers[provider].pending_delete = true;
						}
					}, {
						locateRoot: () => root.querySelector(`[data-provider-delete="${CSS.escape(provider)}"]`),
						onSuccess: () => {
							state.openProviderDetails.delete(provider);
							state.openProviderEditors.delete(provider);
							if (state.providerDrawerName === provider) closeProviderDrawer();
							if (state.data.status?.router?.providers) delete state.data.status.router.providers[provider];
							state.forceProvidersRender = true;
							renderAll();
							setNotice(t("notice.provider_deleted", { provider }), "ok");
						},
						onError: (err) => setNotice(t("notice.delete_provider_failed", { error: err.message }))
					});
				});
			});
			root.querySelectorAll("[data-hot-priority-apply]").forEach((button) => {
				if (button.dataset.boundHotPriority) return;
				button.dataset.boundHotPriority = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.hotPriorityApply || "";
					if (!provider) return;
					const input = root.querySelector(`[data-hot-priority="${CSS.escape(provider)}"]`);
					if (!input) return;
					const priority = Number(input.value || 0);
					const resourceKey = `provider-priority:${provider}`;
					if (pendingRuntimeMutations.has(resourceKey)) return;
					pendingRuntimeMutations.add(resourceKey);
					const runtime = state.data.status?.router?.providers?.[provider];
					const previousPriority = runtime?.priority;
					const previousOverride = runtime?.priority_override_active;
					if (runtime) {
						runtime.priority = priority;
						runtime.priority_override_active = true;
					}
					state.forceProvidersRender = true;
					renderAll();
					renderProviderDrawer({ force: true });
					const currentButton = () => root.querySelector(`[data-hot-priority-apply="${CSS.escape(provider)}"]`);
					setMutationBusy(currentButton(), true);
					try {
						applyMutationResult(await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/priority`, { priority }), { drawer: true });
						setNotice(`Priority for ${provider} hot-updated to ${priority}.`, "ok");
						scheduleBackgroundRefresh({
							quiet: true,
							preserveNotice: true
						});
					} catch (err) {
						if (runtime) {
							runtime.priority = previousPriority;
							runtime.priority_override_active = previousOverride;
						}
						state.forceProvidersRender = true;
						renderAll();
						renderProviderDrawer({ force: true });
						const restoredInput = root.querySelector(`[data-hot-priority="${CSS.escape(provider)}"]`);
						if (restoredInput) {
							restoredInput.value = String(priority);
							restoredInput.focus();
						}
						setNotice(`Hot-reload priority failed: ${err.message}`);
					} finally {
						pendingRuntimeMutations.delete(resourceKey);
						setMutationBusy(currentButton(), false);
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
						site_url: String(form.elements.site_url?.value || "").trim(),
						proxy: String(form.elements.proxy.value || "").trim(),
						user_agent: String(form.elements.user_agent?.value || "").trim(),
						priority: Number(form.elements.priority.value || 0),
						enabled: Boolean(form.elements.enabled.checked)
					};
					if (form.elements.skip_idle_probe) payload.skip_idle_probe = Boolean(form.elements.skip_idle_probe.checked);
					if (form.elements.skip_patrol_probe) payload.skip_patrol_probe = Boolean(form.elements.skip_patrol_probe.checked);
					await runConfigMutation(form, async () => {
						const result = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, payload);
						setNotice(t("notice.provider_updated", { provider }), "ok");
						return result;
					}, {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) Object.assign(config.providers[provider], payload);
						}
					});
				});
			});
			root.querySelectorAll("[data-skip-idle-toggle], [data-skip-patrol-toggle]").forEach((toggle) => {
				if (toggle.dataset.boundskipprobe) return;
				toggle.dataset.boundskipprobe = "1";
				toggle.addEventListener("change", async () => {
					const provider = toggle.dataset.skipIdleToggle || toggle.dataset.skipPatrolToggle || "";
					if (!provider) return;
					const field = toggle.dataset.skipIdleToggle ? "skip_idle_probe" : "skip_patrol_probe";
					const value = Boolean(toggle.checked);
					const selector = toggle.dataset.skipIdleToggle ? "data-skip-idle-toggle" : "data-skip-patrol-toggle";
					await runOptimisticConfigAction(toggle, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}`, { [field]: value }), {
						resourceKey: `provider:${provider}`,
						apply: (config) => {
							if (config.providers?.[provider]) config.providers[provider][field] = value;
						}
					}, {
						locateRoot: () => root.querySelector(`[${selector}="${CSS.escape(provider)}"]`),
						onSuccess: () => setNotice(`${field === "skip_idle_probe" ? "Idle" : "Patrol"} probe ${value ? "skipped" : "enabled"} for ${provider}.`, "ok"),
						onError: (err) => setNotice(`Failed to update ${field}: ${err.message}`)
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
					if (await runConfigMutation(form, async () => {
						const result = await apiPost(`/-/admin/providers/${encodeURIComponent(provider)}/keys`, payload);
						setNotice(t("notice.key_added", { provider }), "ok");
						return result;
					}, {
						resourceKey: `provider-key-list:${provider}`,
						apply: (config) => appendPendingKey(config, provider, payload)
					})) resetLiveForm(root, `.config-key-form[data-provider="${CSS.escape(provider)}"]`);
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
					const models = keyModelsPatchValue(form.elements.models?.value || "");
					await runConfigMutation(form, async () => {
						const result = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/keys/${encodeURIComponent(keyIndex)}`, {
							proxy,
							models
						});
						setNotice(t("notice.key_proxy_updated", {
							index: keyIndex,
							provider
						}), "ok");
						return result;
					}, {
						resourceKey: `key:${provider}:${keyIndex}`,
						apply: (config) => {
							const keys = config.providers?.[provider]?.keys;
							if (!Array.isArray(keys)) return;
							const key = keys.find((entry, index) => String(entry?.index ?? index) === keyIndex);
							if (key && typeof key === "object") {
								key.proxy = proxy;
								if (models) key.models = models;
								else delete key.models;
							}
						}
					});
				});
			});
			root.querySelectorAll("[data-provider-variant-edit]").forEach((button) => {
				if (button.dataset.boundprovidervariantedit) return;
				button.dataset.boundprovidervariantedit = "1";
				button.addEventListener("click", () => {
					const provider = button.dataset.providerVariantProvider || "";
					const canonicalModel = button.dataset.providerVariantEdit || "";
					const form = Array.from(root.querySelectorAll(".provider-variant-form")).find((candidate) => candidate.dataset.provider === provider);
					if (!form || !canonicalModel) return;
					const configured = normalizeVariantEntries(state.data.config?.models?.provider_model_variants?.[provider]?.[canonicalModel] || []);
					const byModel = new Map(configured.map((entry) => [entry.model, entry.priority]));
					const knownModels = /* @__PURE__ */ new Set();
					form.querySelectorAll("[data-provider-variant-model]").forEach((checkbox) => {
						const model = String(checkbox.value || "");
						const selected = byModel.has(model);
						knownModels.add(model);
						checkbox.checked = selected;
						const priority = checkbox.closest("[data-provider-variant-option]")?.querySelector("[data-provider-variant-priority]");
						if (priority) {
							priority.disabled = !selected;
							priority.value = String(selected ? byModel.get(model) : 0);
						}
					});
					const custom = configured.filter((entry) => !knownModels.has(entry.model)).map((entry) => `${entry.model}:${entry.priority ?? 0}`).join(", ");
					const canonicalInput = form.elements.namedItem("canonical_model");
					const variantsInput = form.elements.namedItem("variants");
					if (!canonicalInput || !variantsInput) return;
					canonicalInput.value = canonicalModel;
					canonicalInput.readOnly = true;
					variantsInput.value = custom;
					form.dataset.editingCanonical = canonicalModel;
					const editor = form.closest(".provider-model-inline-editor");
					if (editor) editor.open = true;
					form.scrollIntoView?.({ block: "nearest" });
				});
			});
			root.querySelectorAll("[data-provider-variant-delete]").forEach((button) => {
				if (button.dataset.boundprovidervariantdelete) return;
				button.dataset.boundprovidervariantdelete = "1";
				button.addEventListener("click", async () => {
					const provider = button.dataset.providerVariantProvider || "";
					const canonicalModel = button.dataset.providerVariantDelete || "";
					if (!provider || !canonicalModel) return;
					if (!await openConfirmDialog({
						title: t("confirm.delete_alias.title"),
						message: t("confirm.delete_alias.msg", {
							model: canonicalModel,
							provider
						}),
						acceptLabel: t("confirm.delete")
					})) return;
					await runOptimisticConfigAction(button, () => apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/${encodeURIComponent(canonicalModel)}/variants`, { variants: [] }), {
						resourceKey: `model-variants:${provider}:${canonicalModel}`,
						apply: (config) => {
							const providerVariants = config.models?.provider_model_variants?.[provider];
							if (!providerVariants) return;
							delete providerVariants[canonicalModel];
							if (!Object.keys(providerVariants).length) delete config.models.provider_model_variants[provider];
						}
					}, {
						locateRoot: () => root.querySelector(`[data-provider-variant-delete="${CSS.escape(canonicalModel)}"][data-provider-variant-provider="${CSS.escape(provider)}"]`),
						onSuccess: () => setNotice(t("notice.model_alias_deleted", {
							model: canonicalModel,
							provider
						}), "ok"),
						onError: (err) => setNotice(t("notice.failed", { error: err.message }), "bad")
					});
				});
			});
			root.querySelectorAll(".provider-variant-form").forEach((form) => {
				if (form.dataset.boundprovidervariantform) return;
				form.dataset.boundprovidervariantform = "1";
				const search = form.querySelector("[data-provider-variant-search]");
				search?.addEventListener("input", () => {
					const query = String(search.value || "").trim().toLowerCase();
					form.querySelectorAll("[data-provider-variant-option]").forEach((option) => {
						option.hidden = Boolean(query && !String(option.dataset.searchText || "").includes(query));
					});
				});
				form.querySelectorAll("[data-provider-variant-model]").forEach((checkbox) => {
					checkbox.addEventListener("change", () => {
						const priority = checkbox.closest("[data-provider-variant-option]")?.querySelector("[data-provider-variant-priority]");
						if (priority) priority.disabled = !checkbox.checked;
					});
				});
				form.addEventListener("reset", () => {
					window.setTimeout(() => {
						form.elements.canonical_model.readOnly = false;
						delete form.dataset.editingCanonical;
						form.querySelectorAll("[data-provider-variant-option]").forEach((option) => {
							option.hidden = false;
						});
						form.querySelectorAll("[data-provider-variant-priority]").forEach((priority) => {
							priority.disabled = true;
						});
					}, 0);
				});
				form.addEventListener("submit", async (event) => {
					event.preventDefault();
					const provider = form.dataset.provider || "";
					const canonicalModel = String(form.elements.canonical_model?.value || "").trim();
					const variantsByModel = /* @__PURE__ */ new Map();
					form.querySelectorAll("[data-provider-variant-model]:checked").forEach((checkbox) => {
						const model = String(checkbox.value || "").trim();
						const priority = Number(checkbox.closest("[data-provider-variant-option]")?.querySelector("[data-provider-variant-priority]")?.value || 0);
						if (model) variantsByModel.set(model, {
							model,
							priority: Number.isFinite(priority) ? priority : 0
						});
					});
					parseModelVariants(form.elements.variants?.value || "").forEach((entry) => {
						if (!variantsByModel.has(entry.model)) variantsByModel.set(entry.model, entry);
					});
					const variants = Array.from(variantsByModel.values());
					if (!provider || !canonicalModel) return;
					if (await runConfigMutation(form, async () => {
						const result = await apiPatch(`/-/admin/providers/${encodeURIComponent(provider)}/models/${encodeURIComponent(canonicalModel)}/variants`, { variants });
						setNotice(`Model variants updated for ${provider} / ${canonicalModel}.`, "ok");
						return result;
					}, {
						resourceKey: `model-variants:${provider}:${canonicalModel}`,
						apply: (config) => {
							const modelsConfig = config.models ||= {};
							const providerVariants = modelsConfig.provider_model_variants ||= {};
							const variantsByModel = providerVariants[provider] ||= {};
							if (variants.length) variantsByModel[canonicalModel] = structuredClone(variants);
							else delete variantsByModel[canonicalModel];
						}
					})) Array.from(root.querySelectorAll(".provider-variant-form")).find((candidate) => candidate.dataset.provider === provider)?.reset();
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
						setNotice(t("notice.format_toggled", {
							provider,
							format: fmt,
							state: nextEnabled ? t("notice.enabled") : t("notice.disabled")
						}), "ok");
						return resp;
					}, {
						resourceKey: `provider-format:${provider}:${fmt}`,
						apply: (config) => {
							const formatConfig = config.providers?.[provider]?.formats?.[fmt];
							if (formatConfig) formatConfig.enabled = nextEnabled;
						}
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
				card.querySelector("[data-format-toggle]")?.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					toggle();
				});
				card.addEventListener("keydown", (event) => {
					if (event.key === "F2") {
						event.preventDefault();
						editPath();
					}
				});
			});
		}
		async function runFormatMutation(card, operation, optimistic = null) {
			const provider = card?.dataset?.formatProvider || "";
			const fmt = card?.dataset?.format || "";
			const locateCard = liveElementLocator(card, () => qsa(".format-route.is-interactive").find((candidate) => candidate.dataset.formatProvider === provider && candidate.dataset.format === fmt) || null);
			const mutation = optimistic ? beginOptimisticConfigMutation(optimistic.resourceKey, optimistic.apply) : null;
			if (optimistic && !mutation) return false;
			const finishBusy = mutationBusyTracker.start(locateCard);
			try {
				setNotice(t("notice.saving"), "info", {
					key: "mutation:format",
					sticky: true
				});
				const result = await operation();
				if (mutation && result?.config !== void 0) {
					if (!confirmOptimisticConfigMutation(mutation, result.config, { render: false })) return false;
				} else if (mutation) rejectOptimisticConfigMutation(mutation);
				clearAllDirty();
				if (!applyMutationResult(result, {
					drawer: true,
					skipConfig: Boolean(mutation && result?.config !== void 0)
				})) {
					state.data.version = Number(state.data.version || 0) + 1;
					state.forceConfigRender = true;
					state.forceProvidersRender = true;
					state.forceModelCapsRender = true;
					renderAll();
					renderProviderDrawer({ force: true });
				}
				setNotice(t("notice.saved"), "ok", { key: "mutation:format" });
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
				return true;
			} catch (err) {
				if (mutation) rejectOptimisticConfigMutation(mutation);
				setNotice(t("notice.format_update_failed", { error: err.message }), "bad", { key: "mutation:format" });
				return false;
			} finally {
				finishBusy();
			}
		}
		async function runConfigMutation(form, operation, optimistic = null) {
			const mutationScope = configRefreshCoordinator.beginMutation();
			const locateForm = formLocator(form);
			const formSnapshot = captureFormState(form);
			const mutation = optimistic ? beginOptimisticConfigMutation(optimistic.resourceKey, optimistic.apply, { drawer: optimistic.drawer !== false }) : null;
			if (optimistic && !mutation) {
				mutationScope.finish();
				return false;
			}
			const finishBusy = mutationBusyTracker.start(locateForm);
			try {
				setNotice(t("notice.saving"), "info", {
					key: "mutation:config",
					sticky: true
				});
				const result = await operation();
				if (mutation && result?.config !== void 0) {
					if (!confirmOptimisticConfigMutation(mutation, result.config, { render: false })) return false;
				} else if (mutation) rejectOptimisticConfigMutation(mutation, { drawer: optimistic?.drawer !== false });
				clearAllDirty();
				if (!applyMutationResult(result, { skipConfig: Boolean(mutation && result?.config !== void 0) })) {
					state.forceConfigRender = true;
					state.forceModelRoutesRender = true;
					renderAll();
				}
				if (document.activeElement && typeof document.activeElement.blur === "function") document.activeElement.blur();
				setNotice(t("notice.saved"), "ok", { key: "mutation:config" });
				scheduleBackgroundRefresh({
					quiet: true,
					preserveNotice: true,
					staticData: true
				});
				return true;
			} catch (err) {
				if (mutation) {
					rejectOptimisticConfigMutation(mutation, { drawer: optimistic?.drawer !== false });
					restoreFormState(locateForm(), formSnapshot);
				}
				setNotice(t("notice.config_update_failed", { error: err.message }), "bad", { key: "mutation:config" });
				return false;
			} finally {
				mutationScope.finish();
				finishBusy();
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
					name: modelName,
					mode: state.modelDrawerMode || "summary"
				};
			}
			closeProviderDrawer();
			closeModelDrawer();
			const drawer = el("detailDrawer");
			drawer.classList.add("is-open");
			drawer.setAttribute("aria-hidden", "false");
			el("drawerSubtitle").textContent = requestId;
			updateDOM(el("drawerBody"), `<div class="empty">${escapeHtml(t("req.detail_loading"))}</div>`);
			try {
				renderDrawer(await apiGet(`/-/admin/requests/${encodeURIComponent(requestId)}`));
			} catch (err) {
				updateDOM(el("drawerBody"), `<div class="notice">${escapeHtml(t("req.detail_failed", { error: err.message }))}</div>`);
			}
		}
		function renderDrawer(detail) {
			const attempts = Array.isArray(detail.attempts) ? detail.attempts : [];
			const summary = detail.routing_summary || {};
			const usage = usageFrom(detail);
			const firstEvent = firstByteMsFromRequest(detail);
			const outcome = summary.outcome || "unknown";
			const routeTone = routeOutcomeTone(outcome);
			el("drawerSubtitle").textContent = `${detail.request_id || "-"} / ${detail.state || "unknown"}`;
			updateDOM(el("drawerBody"), `
      <section class="request-result-band tone-${escapeHtml(requestTone(detail))} outcome-${escapeHtml(routeTone)}">
        <div class="request-result-status">
          ${statusBadge(detail.status || detail.state, detail.status_code || "")}
          <span class="request-detail-route-chip tone-${escapeHtml(routeTone)}">${iconSvg(routeOutcomeIcon(outcome))}${escapeHtml(routeOutcomeLabel(outcome))}</span>
        </div>
        <div class="request-result-stat">${iconSvg("boxes")}<span><small>${escapeHtml(t("req.col_model"))}</small><strong class="mono">${escapeHtml(detail.model || "-")}</strong></span></div>
        <div class="request-result-stat">${iconSvg("server")}<span><small>${escapeHtml(t("req.summary_final_provider"))}</small><strong>${escapeHtml(summary.final_provider || "-")}</strong></span></div>
        <div class="request-result-stat">${iconSvg("clock")}<span><small>${escapeHtml(t("req.col_latency"))}</small><strong class="mono">${firstEvent ? escapeHtml(fmtCompactMs(firstEvent)) : "-"} / ${escapeHtml(fmtCompactMs(detail.duration_ms))}</strong></span></div>
        <div class="request-result-stat">${iconSvg("dollar")}<span><small>${escapeHtml(t("req.col_cost"))}</small>${renderCost({
				...detail,
				cost_usd: usage.cost_usd
			}, { compact: true })}</span></div>
        <p class="request-result-message tone-${escapeHtml(routeTone)}">${iconSvg(routeOutcomeIcon(outcome))}<span>${requestResultHeadlineMarkup(summary.headline || detail.error || "-")}</span></p>
      </section>
      ${renderRequestIssuePanel(detail, attempts, summary)}
      ${renderRoutingTrace(detail.routing_trace, {
				clientFormat: detail.client_format || "",
				finalFormat: summary.final_upstream_format || ""
			})}
      ${renderUsageComposition(detail)}
      <section class="request-attempts-section">
        <h3 class="drawer-section-title request-attempts-title"><span>${escapeHtml(t("req.attempts"))}</span><strong>${escapeHtml(fmtInt(attempts.length))}</strong></h3>
        ${renderAttemptsTable(attempts)}
      </section>
      ${renderRequestMetadata(detail)}
    `);
		}
		function requestResultHeadlineMarkup(value) {
			return messageMarkup(String(value || "-").replace(/;\s+/g, ". "));
		}
		function renderRequestIssuePanel(detail, attempts, summary) {
			const outcome = String(summary?.outcome || "unknown");
			if (outcome === "direct_success" || outcome === "unknown" && requestTone(detail) === "success") return "";
			const failedAttempts = (Array.isArray(attempts) ? attempts : []).filter((attempt) => attempt?.outcome !== "success");
			const failedAttempt = failedAttempts[failedAttempts.length - 1] || {};
			const terminalEvent = [...Array.isArray(detail?.routing_trace) ? detail.routing_trace : []].reverse().find((event) => ["attempt_failed", "no_candidate"].includes(String(event?.code || ""))) || {};
			const recovered = outcome === "recovered";
			const noAttempts = outcome === "no_attempts";
			const ownerRaw = summary?.owner || failedAttempt.failure_owner || terminalEvent.owner || (noAttempts ? "proxy_routing" : "");
			const provider = failedAttempt.provider || terminalEvent.provider || "";
			const stage = failedAttempt.diagnostic_stage || terminalEvent.stage || (noAttempts ? "routing" : "");
			const errorType = failedAttempt.error_type || terminalEvent.error_type || (noAttempts ? terminalEvent.code : "") || "";
			const reason = failedAttempt.reason || terminalEvent.reason || detail?.error || "";
			const httpStatus = failedAttempt.http_status || (!recovered ? detail?.status_code : "") || "";
			const evidence = requestErrorEvidenceSummary(failedAttempt.upstream_error_summary || detail?.error || summary?.headline || reason || "-");
			const stateAction = requestStateActionText(failedAttempt.state_action);
			const facts = [
				ownerRaw ? requestIssueFact("shield", t("req.failure_owner"), requestFailureOwnerLabel(ownerRaw)) : "",
				provider ? requestIssueFact("server", recovered ? t("req.failed_provider") : t("req.provider"), provider) : "",
				stage ? requestIssueFact("layers", t("req.failure_stage"), stage, true) : "",
				errorType || reason ? requestIssueFact("alert", t("req.failure_type"), errorType || reason, true) : "",
				httpStatus ? requestIssueFact("info", t("req.failure_http"), String(httpStatus), true) : "",
				stateAction ? requestIssueFact("activity", t("req.failure_state_action"), stateAction, true) : ""
			].filter(Boolean).join("");
			const tone = recovered ? "warn" : "bad";
			const title = recovered ? t("req.recovery_title") : noAttempts ? t("req.no_attempts_title") : t("req.failure_title");
			const label = recovered ? t("req.recovery_locator") : t("req.failure_locator");
			return `
      <section class="request-issue-panel tone-${escapeHtml(tone)}" aria-label="${escapeHtml(label)}">
        <header class="request-issue-head">
          <span class="request-issue-marker">${iconSvg(recovered ? "rotate" : "alert")}</span>
          <div><small>${escapeHtml(label)}</small><h3>${escapeHtml(title)}</h3></div>
        </header>
        ${facts ? `<div class="request-issue-facts">${facts}</div>` : ""}
        <div class="request-issue-evidence"><span>${escapeHtml(t("req.failure_evidence"))}</span><strong>${messageMarkup(evidence)}</strong></div>
        <div class="request-issue-action">${iconSvg("arrow-right")}<span><small>${escapeHtml(t("req.summary_next_action"))}</small><strong>${messageMarkup(summary?.next_action || "-")}</strong></span></div>
      </section>
    `;
		}
		function requestIssueFact(icon, label, value, mono = false) {
			return `<div class="request-issue-fact">${iconSvg(icon)}<span><small>${escapeHtml(label)}</small><strong class="${mono ? "mono" : ""}" title="${escapeHtml(value || "-")}">${escapeHtml(value || "-")}</strong></span></div>`;
		}
		function requestFailureOwnerLabel(owner) {
			const key = {
				upstream: "req.owner_upstream",
				proxy_routing: "req.owner_proxy_routing",
				proxy_session: "req.owner_proxy_session",
				client: "req.owner_client"
			}[String(owner || "").toLowerCase()];
			return key ? t(key) : String(owner || "-");
		}
		function requestErrorEvidenceSummary(value) {
			const text = String(value || "").trim();
			if (!text) return "-";
			let payload = null;
			try {
				payload = JSON.parse(text);
			} catch (error) {
				const jsonStart = text.indexOf("{");
				const jsonEnd = text.lastIndexOf("}");
				if (jsonStart >= 0 && jsonEnd > jsonStart) try {
					payload = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
				} catch (nestedError) {
					payload = null;
				}
			}
			const message = payload?.error?.message || payload?.message || (typeof payload?.error === "string" ? payload.error : "");
			return String(message || text);
		}
		function requestStateActionText(action) {
			if (!action || typeof action !== "object") return "";
			const parts = [action.action, action.scope].filter(Boolean);
			if (Number(action.cooldown_s || 0) > 0) parts.push(`${fmtInt(action.cooldown_s)}s`);
			if (Number(action.provider_cooldown_s || 0) > 0) parts.push(`provider ${fmtInt(action.provider_cooldown_s)}s`);
			return parts.join(" · ");
		}
		function renderUsageComposition(value) {
			const usage = usageFrom(value);
			if (usage.total_tokens <= 0 && Number(usage.cost_usd || 0) <= 0) return `
        <section class="usage-composition is-empty" aria-label="${escapeHtml(t("tokens.composition"))}">
          <div class="usage-composition-head"><h3>${escapeHtml(t("tokens.composition"))}</h3><strong>0</strong>${renderCost({
				...value,
				cost_usd: 0
			})}</div>
          <div class="usage-empty-state">${iconSvg("activity")}<span><strong>${escapeHtml(t("req.no_usage"))}</strong><small>${escapeHtml(t("req.no_usage_desc"))}</small></span></div>
        </section>
      `;
			const total = Math.max(1, usage.total_tokens);
			const segments = [
				[
					"uncached",
					usage.uncached_input_tokens,
					t("tokens.uncached")
				],
				[
					"cached",
					usage.cached_input_tokens,
					t("tokens.cached")
				],
				[
					"write",
					usage.cache_write_tokens,
					t("tokens.cache_write")
				],
				[
					"output",
					usage.output_tokens,
					t("tokens.output")
				]
			];
			return `
      <section class="usage-composition" aria-label="${escapeHtml(t("tokens.composition"))}">
        <div class="usage-composition-head"><h3>${escapeHtml(t("tokens.composition"))}</h3><strong>${escapeHtml(fmtTokenCount(usage.total_tokens))}</strong>${renderCost({
				...value,
				cost_usd: usage.cost_usd
			})}</div>
        <div class="token-composition-bar" role="img" aria-label="${escapeHtml(segments.map(([, count, label]) => `${label} ${fmtInt(count)}`).join(", "))}">
          ${segments.map(([tone, count, label]) => `<i class="token-segment token-${tone}" aria-hidden="true" style="--token-share:${svgNum(count / total * 100)}%" data-tip="${escapeHtml(`${label}: ${fmtInt(count)}`)}"></i>`).join("")}
        </div>
        <div class="token-composition-legend">
          ${segments.map(([tone, count, label]) => `<span><i class="token-dot token-${tone}" aria-hidden="true"></i><small>${escapeHtml(label)}</small><strong>${escapeHtml(fmtTokenCount(count))}</strong></span>`).join("")}
          ${usage.reasoning_tokens ? `<span data-tip="${escapeHtml(t("tokens.reasoning_subset"))}" tabindex="0"><i class="token-dot token-reasoning" aria-hidden="true"></i><small>${escapeHtml(t("tokens.reasoning"))}</small><strong>${escapeHtml(fmtTokenCount(usage.reasoning_tokens))}</strong></span>` : ""}
        </div>
      </section>
    `;
		}
		function renderAttemptsTable(attempts) {
			if (!attempts.length) return `<div class="request-attempts-empty">${iconSvg("info")}<span><strong>${escapeHtml(t("req.no_attempts"))}</strong><small>${escapeHtml(t("req.no_attempts_desc"))}</small></span></div>`;
			return `
      <div class="attempt-table-scroll">
        <table class="attempt-data-table">
          <caption class="sr-only">${escapeHtml(t("req.attempts"))}</caption>
          <thead><tr>
            <th scope="col"># / ${escapeHtml(t("req.attempt_result"))}</th><th scope="col">${escapeHtml(t("req.attempt_provider_key"))}</th><th scope="col">${escapeHtml(t("req.attempt_model"))} / ${escapeHtml(t("req.attempt_format"))}</th><th scope="col">${escapeHtml(t("req.col_latency"))}</th><th scope="col">${escapeHtml(t("req.col_tokens"))} / ${escapeHtml(t("req.col_cost"))}</th>
          </tr></thead>
          <tbody>${attempts.map((attempt) => {
				const usage = usageFrom(attempt);
				const result = attempt.outcome === "success" ? t("req.success") : attempt.reason || attempt.error_type || t("req.failed");
				const key = attempt.key_masked || attempt.key_id || "-";
				const keyNumber = requestKeyNumber(attempt.key_index);
				const keyDisplay = [keyNumber, key].filter(Boolean).join(" · ");
				return `<tr class="tone-${attempt.outcome === "success" ? "success" : "danger"}">
              <td><span class="attempt-result-cluster"><strong class="mono">#${escapeHtml(attempt.attempt_no || "-")}</strong><span data-tip="${escapeHtml(attempt.upstream_error_summary || result)}">${badge(result, attempt.outcome === "success" ? "ok" : "bad")}</span></span></td>
              <td><span class="attempt-provider-cluster"><strong>${iconSvg("server")}${escapeHtml(attempt.provider || "-")}</strong><small class="attempt-key-meta" data-tip="${escapeHtml(keyDisplay)}">${keyNumber ? `<b>${escapeHtml(keyNumber)}</b>` : ""}<span class="mono">${escapeHtml(key)}</span></small></span></td>
              <td><span class="attempt-model-cluster"><strong class="mono" data-tip="${escapeHtml(attempt.provider_model || "-")}">${escapeHtml(attempt.provider_model || "-")}</strong><small>${escapeHtml(shortFormatLabel(attempt.upstream_format || "-"))}</small></span></td>
              <td><span class="attempt-timing-cluster mono"><span>${escapeHtml(t("req.attempt_headers"))} <strong>${attempt.upstream_headers_ms ? escapeHtml(fmtCompactMs(attempt.upstream_headers_ms)) : "-"}</strong></span><span>${escapeHtml(t("req.attempt_first_event"))} <strong>${attempt.first_event_ms ? escapeHtml(fmtCompactMs(attempt.first_event_ms)) : "-"}</strong></span><span>${escapeHtml(t("req.attempt_total"))} <strong>${attempt.duration_ms ? escapeHtml(fmtCompactMs(attempt.duration_ms)) : "-"}</strong></span></span></td>
              <td><span class="attempt-usage-cluster"><strong class="mono" data-tip="${escapeHtml(fmtInt(usage.total_tokens))}">${escapeHtml(fmtTokenCount(usage.total_tokens))}</strong>${renderCost({
					...attempt,
					cost_usd: usage.cost_usd
				}, { compact: true })}</span></td>
            </tr>`;
			}).join("")}</tbody>
        </table>
      </div>
    `;
		}
		function requestKeyNumber(value) {
			if (value === null || value === void 0 || value === "") return "";
			const index = Number(value);
			if (!Number.isInteger(index) || index < 0) return "";
			return t("req.key_number", { index: fmtInt(index + 1) });
		}
		function reasoningEffortText(detail) {
			const clientEffort = String(detail?.reasoning_effort || "");
			let overrideTo = "";
			let overrideFrom = "";
			const attempts = Array.isArray(detail?.attempts) ? detail.attempts : [];
			for (const attempt of attempts) {
				const adaptations = Array.isArray(attempt?.parameter_adaptations) ? attempt.parameter_adaptations : [];
				for (const item of adaptations) if (item?.field === "reasoning_effort" && item.to) {
					overrideTo = String(item.to);
					overrideFrom = String(item.from || "");
				}
			}
			if (overrideTo) {
				const from = overrideFrom || clientEffort;
				return from ? `${reasoningEffortLabel(from)} → ${reasoningEffortLabel(overrideTo)}` : reasoningEffortLabel(overrideTo);
			}
			return reasoningEffortLabel(clientEffort);
		}
		function renderRequestMetadata(detail) {
			const rows = [
				[t("req.meta_ip"), detail.client_ip || "-"],
				[t("req.meta_ip_source"), detail.client_ip_source || "-"],
				["User-Agent", detail.user_agent || "-"],
				["Path", detail.path || "-"],
				[t("req.meta_size"), detail.request_bytes ? `${fmtInt(detail.request_bytes)} B` : "-"],
				[t("req.meta_profile"), detail.request_profile || "plain"],
				[t("req.meta_effort"), reasoningEffortText(detail)],
				[t("req.meta_started"), fmtDate(detail.started_at)],
				[t("req.meta_finished"), fmtDate(detail.finished_at)]
			];
			return `<details class="request-metadata"><summary>${iconSvg("info")}<span>${escapeHtml(t("req.metadata"))}</span></summary><dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd class="mono" title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join("")}</dl></details>`;
		}
		function keyModelsText(models) {
			if (Array.isArray(models)) return models.join(", ");
			if (!models || typeof models !== "object") return "";
			return Object.entries(models).map(([canonical, raw]) => `${canonical}=${raw}`).join(", ");
		}
		function parseModelVariants(value) {
			return String(value || "").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean).map((item) => {
				const match = item.match(/^(.*?):(-?\d+)$/);
				return match ? {
					model: match[1].trim(),
					priority: Number(match[2])
				} : {
					model: item,
					priority: 0
				};
			}).filter((entry) => entry.model);
		}
		function renderRoutingTrace(rawTrace, context = {}) {
			const trace = Array.isArray(rawTrace) ? rawTrace : [];
			if (!trace.length) return "";
			const steps = groupRoutingTrace(trace);
			return `
      <section class="routing-path-shell" aria-labelledby="routing-path-title">
        <header class="routing-path-header">
          <div>
            <h3 id="routing-path-title">${iconSvg("radar")}<span>${escapeHtml(t("req.route_path"))}</span></h3>
            <p>${escapeHtml(t("req.route_path_desc"))}</p>
          </div>
          <span class="routing-path-count">${escapeHtml(t("req.route_steps_events", {
				steps: fmtInt(steps.length),
				events: fmtInt(trace.length)
			}))}</span>
        </header>
        <ol class="routing-path" aria-label="${escapeHtml(t("req.route_path"))}">
          ${steps.map((step, index) => renderRoutingTraceStep(step, index, context)).join("")}
        </ol>
        <details class="routing-diagnostics">
          <summary>
            <span class="routing-diagnostics-title">${iconSvg("info")}<span><strong>${escapeHtml(t("req.route_diagnostics"))}</strong><small>${escapeHtml(t("req.route_diagnostics_desc"))}</small></span></span>
            <span class="routing-diagnostics-count">${escapeHtml(t("req.route_event_count", { count: fmtInt(trace.length) }))}</span>
          </summary>
          <ol class="routing-diagnostic-list">
            ${collapseRoutingDiagnostics(trace).map(renderRoutingDiagnosticEvent).join("")}
          </ol>
        </details>
      </section>
    `;
		}
		function collapseRoutingDiagnostics(trace) {
			const out = [];
			(Array.isArray(trace) ? trace : []).forEach((event) => {
				const key = [
					event.stage,
					event.code,
					event.provider,
					event.key_id || event.key_masked,
					event.provider_model,
					event.upstream_format,
					event.reason,
					event.target_format
				].join("|");
				const previous = out[out.length - 1];
				if (previous && previous._collapseKey === key) {
					previous._repeatCount = Number(previous._repeatCount || 1) + 1;
					return;
				}
				out.push({
					...event,
					_collapseKey: key,
					_repeatCount: 1
				});
			});
			return out;
		}
		function routingTraceCodeLabel(code) {
			const key = {
				provider_cooldown: "req.route_code_provider_cooldown",
				key_cooldown: "req.route_code_key_cooldown",
				key_disabled: "req.route_code_key_disabled",
				model_unsupported_by_key: "req.route_code_model_unsupported",
				compatibility_circuit: "req.route_code_compatibility",
				duplicate_candidate: "req.route_code_duplicate"
			}[String(code || "")];
			return key ? t(key) : String(code || "unknown");
		}
		function routingTraceStepLabel(step) {
			if (step.kind === "format_evaluation") return t("req.route_format_evaluation");
			if (step.kind === "candidate_filter") return t("req.route_candidate_filter");
			if (step.code === "selected") return t("req.route_selected");
			if (step.code === "attempt_succeeded" || step.code === "attempt_failed") return t("req.route_upstream_result");
			if (step.code === "no_candidate") return t("req.route_no_candidate");
			return step.stage && step.stage !== "routing" ? step.stage : t("req.route_event");
		}
		function routingTraceStepStatus(step, context = {}) {
			if (step.kind === "format_evaluation") {
				const summary = summarizeFormatTraceStep(step, context);
				if (summary.mode === "converted") return t("req.route_proxy_conversion");
				if (summary.mode === "blocked") return t("req.route_format_excluded", { count: fmtInt(summary.blocked.length) });
				if (summary.mode === "native") return t("req.route_no_conversion");
				return t("req.route_no_special_limits");
			}
			if (step.kind === "candidate_filter") return t("req.route_candidates_skipped", { count: fmtInt(step.eventCount) });
			if (step.code === "selected") return t("req.route_selected_status");
			if (step.code === "attempt_succeeded") return t("req.route_success");
			if (step.code === "attempt_failed") return t("req.route_failed_status");
			if (step.code === "no_candidate") return t("req.route_unavailable");
			return routingTraceCodeLabel(step.code);
		}
		function routingTraceStepIcon(step) {
			if (step.kind === "format_evaluation") return "layers";
			if (step.kind === "candidate_filter") return "filter";
			if (step.code === "selected") return "radar";
			if (step.code === "attempt_succeeded") return "check";
			if (step.code === "attempt_failed" || step.code === "no_candidate") return "alert";
			return "dot";
		}
		function renderRoutingFormatPath(source, target) {
			const formats = [source, target].filter(Boolean);
			if (!formats.length) return escapeHtml("-");
			if (formats.length === 1 || source === target) return chipList([formats[0]]);
			return `<span class="routing-format-path">${chip(source)}${iconSvg("arrow-right")}${chip(target)}</span>`;
		}
		function renderRoutingTraceStep(step, index, context = {}) {
			const tone = routingTraceTone(step);
			const event = step.event || {};
			const identity = routingTraceIdentity(event);
			const keyNumber = requestKeyNumber(event.key_index);
			if (keyNumber) {
				const providerIndex = identity.indexOf(event.provider);
				identity.splice(providerIndex >= 0 ? providerIndex + 1 : 0, 0, keyNumber);
			}
			let evidence = identity.length ? chipList(identity) : escapeHtml("-");
			const notes = [];
			if (step.kind === "format_evaluation") {
				const summary = summarizeFormatTraceStep(step, context);
				evidence = renderRoutingFormatPath(summary.sourceFormat, summary.mode === "converted" ? summary.targetFormat : "");
				summary.transformations.forEach((item) => {
					notes.push(t("req.route_parameter_mapped", {
						source: item.field || "-",
						target: item.target || "-"
					}));
				});
				if (summary.droppedHints.length) notes.push(t("req.route_hints_omitted", { fields: summary.droppedHints.map((item) => item.field).filter(Boolean).join(", ") || "-" }));
				summary.blocked.forEach(({ format, fields }) => {
					notes.push(t("req.route_blocked_format", {
						format,
						fields: fields.join(", ") || "-"
					}));
				});
			} else if (step.kind === "candidate_filter") {
				evidence = step.providers.length ? chipList(step.providers) : escapeHtml("-");
				const reasons = step.codes.map(routingTraceCodeLabel);
				if (reasons.length) notes.push(reasons.join(" · "));
			} else if (step.code === "attempt_failed" && (event.reason || event.error_type)) notes.push(t("req.route_failure_reason", { reason: event.reason || event.error_type }));
			return `
      <li class="routing-path-step tone-${escapeHtml(tone)}">
        <span class="routing-path-marker" aria-hidden="true">${iconSvg(routingTraceStepIcon(step))}</span>
        <div class="routing-path-step-body">
          <div class="routing-path-step-head">
            <strong><span class="routing-path-step-index">${fmtInt(index + 1)}</span>${escapeHtml(routingTraceStepLabel(step))}</strong>
            <span class="routing-path-status">${escapeHtml(routingTraceStepStatus(step, context))}</span>
          </div>
          <p class="routing-path-summary">${escapeHtml(routingTraceStepSummary(step, context))}</p>
          <details class="routing-path-technical">
            <summary>${escapeHtml(t("req.route_technical_evidence"))}</summary>
            <div class="routing-path-evidence">${evidence}</div>
          </details>
          ${notes.length ? `<p>${messageMarkup(notes.join(" · "))}</p>` : ""}
        </div>
      </li>
    `;
		}
		function routingTraceStepSummary(step, context = {}) {
			const event = step.event || {};
			if (step.kind === "format_evaluation") {
				const summary = summarizeFormatTraceStep(step, context);
				if (summary.mode === "converted") return t("req.route_summary_converted", {
					source: routingFormatDisplayName(summary.sourceFormat),
					target: routingFormatDisplayName(summary.targetFormat)
				});
				return t("req.route_summary_native", { format: routingFormatDisplayName(summary.sourceFormat) });
			}
			if (step.kind === "candidate_filter") return t("req.route_summary_filtered", { count: fmtInt(step.eventCount || 0) });
			if (step.code === "selected") return t("req.route_summary_selected", {
				provider: event.provider || "-",
				key: requestKeyNumber(event.key_index) || t("req.key_unknown"),
				model: event.provider_model || "-"
			});
			if (step.code === "attempt_succeeded") return t("req.route_summary_succeeded", { provider: event.provider || "-" });
			if (step.code === "attempt_failed") return t("req.route_summary_failed", {
				provider: event.provider || "-",
				reason: event.reason || event.error_type || "-"
			});
			if (step.code === "no_candidate") return t("req.route_summary_no_candidate");
			return routingTraceStepLabel(step);
		}
		function routingDiagnosticDetails(event) {
			const details = [];
			if (event.field) details.push(`${t("req.route_field")}: ${event.field}`);
			if (event.fidelity) details.push(`${t("req.route_fidelity")}: ${event.fidelity}`);
			if (event.compatibility_profile) details.push(`${t("req.route_profile")}: ${event.compatibility_profile}`);
			if (Number(event.cooldown_remaining_s || 0) > 0) details.push(`${t("req.route_recovery")}: ${fmtInt(event.cooldown_remaining_s)}s`);
			const action = event.state_action && typeof event.state_action === "object" ? event.state_action : null;
			if (action?.action) details.push(`${t("req.route_action")}: ${action.action}${action.scope ? ` (${action.scope})` : ""}${Number(action.cooldown_s || 0) > 0 ? ` ${fmtInt(action.cooldown_s)}s` : ""}`);
			return details;
		}
		function routingFormatDisplayName(format) {
			return {
				anthropic_messages: "Anthropic Messages",
				chat_completions: "Chat Completions",
				responses: "Responses"
			}[String(format || "")] || String(format || "-");
		}
		function routingDiagnosticStageLabel(event) {
			if (event.stage === "format_compatibility") return t("req.diag_stage_format");
			if (event.stage === "upstream_result") return t("req.diag_stage_upstream");
			if (["selected", "no_candidate"].includes(event.code)) return t("req.diag_stage_routing");
			if (event.stage === "routing") return t("req.diag_stage_candidate");
			return String(event.stage || t("req.diag_stage_routing"));
		}
		function routingDiagnosticStatus(event) {
			const key = {
				format_eligible: "req.diag_status_allowed",
				format_blocked_by_parameter: "req.diag_status_blocked",
				format_parameter_mapped: "req.diag_status_mapped",
				format_hint_dropped: "req.diag_status_omitted",
				selected: "req.diag_status_selected",
				attempt_succeeded: "req.route_success",
				attempt_failed: "req.route_failed_status",
				no_candidate: "req.route_unavailable",
				provider_cooldown: "req.diag_status_skipped",
				key_cooldown: "req.diag_status_skipped",
				key_disabled: "req.diag_status_skipped",
				model_unsupported_by_key: "req.diag_status_skipped",
				compatibility_circuit: "req.diag_status_skipped",
				duplicate_candidate: "req.diag_status_skipped"
			}[String(event.code || "")];
			return key ? t(key) : t("req.diag_status_observed");
		}
		function routingDiagnosticHeadline(event) {
			const format = routingFormatDisplayName(event.target_format || event.upstream_format);
			const provider = String(event.provider || "-");
			if (event.code === "format_eligible") return t("req.diag_format_eligible", { format });
			if (event.code === "format_blocked_by_parameter") return t("req.diag_format_blocked", {
				format,
				field: event.field || "-"
			});
			if (event.code === "format_parameter_mapped") return t("req.diag_parameter_mapped", {
				field: event.field || "-",
				target: event.target || "-"
			});
			if (event.code === "format_hint_dropped") return t("req.diag_hint_omitted", {
				field: event.field || "-",
				format
			});
			if (event.code === "selected") return t("req.diag_provider_selected", { provider });
			if (event.code === "attempt_succeeded") return t("req.diag_upstream_success", { provider });
			if (event.code === "attempt_failed") return t("req.diag_upstream_failed", { provider });
			if (event.code === "no_candidate") return t("req.diag_no_candidate");
			if (event.stage === "routing") return t("req.diag_candidate_skipped", { provider });
			return routingTraceCodeLabel(event.code);
		}
		function routingDiagnosticDescription(event) {
			const fidelityKey = {
				lossless: "req.diag_fidelity_lossless",
				mapped: "req.diag_fidelity_mapped",
				safe_drop: "req.diag_fidelity_safe_drop",
				blocked: "req.diag_fidelity_blocked"
			}[String(event.fidelity || "")];
			if (fidelityKey) return t(fidelityKey);
			if (event.code === "attempt_succeeded") return t("req.diag_upstream_success_desc");
			if (event.code === "attempt_failed" && (event.reason || event.error_type)) return t("req.route_failure_reason", { reason: event.reason || event.error_type });
			if (event.stage === "routing" && !["selected", "no_candidate"].includes(event.code)) return routingTraceCodeLabel(event.code);
			return "";
		}
		function routingDiagnosticIcon(event) {
			if (event.code === "attempt_succeeded") return "check";
			if ([
				"attempt_failed",
				"no_candidate",
				"format_blocked_by_parameter"
			].includes(event.code)) return "alert";
			if (event.code === "selected") return "radar";
			if (event.stage === "format_compatibility") return "layers";
			if (event.stage === "routing") return "filter";
			return "dot";
		}
		function renderRoutingDiagnosticEvent(event, index) {
			const identity = routingTraceIdentity(event);
			const details = routingDiagnosticDetails(event);
			const tone = routingTraceTone({
				kind: "event",
				code: event.code,
				event
			});
			const description = routingDiagnosticDescription(event);
			return `
      <li class="routing-diagnostic-event tone-${escapeHtml(tone)}">
        <span class="routing-diagnostic-marker" aria-hidden="true">${iconSvg(routingDiagnosticIcon(event))}</span>
        <div class="routing-diagnostic-content">
          <div class="routing-diagnostic-head">
            <div><strong>${escapeHtml(routingDiagnosticHeadline(event))}</strong><small>${escapeHtml(`${fmtInt(index + 1)} · ${routingDiagnosticStageLabel(event)}`)}</small></div>
            <span class="routing-diagnostic-status">${escapeHtml(routingDiagnosticStatus(event))}${Number(event._repeatCount || 1) > 1 ? ` ×${fmtInt(event._repeatCount)}` : ""}</span>
          </div>
          ${identity.length && event.stage !== "format_compatibility" ? `<div class="routing-diagnostic-identity">${chipList(identity)}</div>` : ""}
          ${description ? `<p>${messageMarkup(description)}</p>` : ""}
          ${event.owner ? `<p class="routing-diagnostic-owner">${escapeHtml(t("req.diag_owner_value", { owner: event.owner }))}</p>` : ""}
          ${details.length && !event.fidelity ? `<p class="routing-diagnostic-meta">${messageMarkup(details.join(" · "))}</p>` : ""}
          <small class="routing-diagnostic-internal"><span>${escapeHtml(t("req.diag_internal_id"))}</span><code>${escapeHtml(event.stage || "routing")}</code><i>/</i><code>${escapeHtml(event.code || "unknown")}</code></small>
        </div>
      </li>
    `;
		}
		function routeOutcomeLabel(outcome) {
			if (outcome === "direct_success") return t("req.route_direct");
			if (outcome === "recovered") return t("req.route_recovered");
			if (outcome === "failed") return t("req.route_failed_status");
			if (outcome === "no_attempts") return t("req.route_no_attempts");
			return outcome || t("req.route_unknown");
		}
		function routeOutcomeTone(outcome) {
			if (outcome === "direct_success") return "ok";
			if (outcome === "recovered") return "warn";
			if (outcome === "failed") return "bad";
			if (outcome === "no_attempts") return "route-info";
			return "neutral";
		}
		function routeOutcomeIcon(outcome) {
			if (outcome === "direct_success") return "check";
			if (outcome === "recovered") return "rotate";
			if (outcome === "failed") return "alert";
			if (outcome === "no_attempts") return "info";
			return "dot";
		}
		function setView(view) {
			const nextView = views[view] ? view : "overview";
			const viewChanged = nextView !== state.view;
			if (viewChanged) {
				clearAllDirty();
				_runtimeViewAbortController?.abort();
			}
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
			if (viewChanged) window.scrollTo(0, 0);
			renderAll();
			if (nextView === "overview" || nextView === "requests" || nextView === "providers") refreshRuntimeData({ forceViewData: true });
			else if (nextView === "playground") pgLoadModels();
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
			document.addEventListener("input", _markContainerDirty, true);
			document.addEventListener("change", _markContainerDirty, true);
			document.addEventListener("submit", _clearContainerDirtyOnSubmit, true);
			bindSettingsTabs();
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
			el("refreshButton")?.addEventListener("click", () => {
				refreshAll();
				closeMobileSettings();
			});
			el("pauseButton").addEventListener("click", () => {
				state.paused = !state.paused;
				updatePauseButtonState();
				if (!state.paused) refreshRuntimeData({ forceViewData: true });
			});
			qsa("[data-time-range]").forEach((button) => {
				button.addEventListener("click", () => {
					const nextRange = button.dataset.timeRange || "30m";
					if (!timeRanges[nextRange] || nextRange === state.timeRange) return;
					state.timeRange = nextRange;
					localStorage.setItem("proxyConsoleTimeRange", state.timeRange);
					renderTimeRangeControl();
					state.forceTimeseriesFetch = true;
					refreshRuntimeData({ forceViewData: true });
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
					state.forceRequestsFetch = true;
					refreshRuntimeData({ forceViewData: true });
				});
			});
			[
				"filterModel",
				"filterProvider",
				"filterErrorType",
				"filterReason",
				"filterHttpStatus",
				"filterClientIp"
			].forEach((id) => {
				el(id)?.addEventListener("keydown", (event) => {
					if (event.key !== "Enter") return;
					state.requestsPage = 0;
					state.selectedRequestIds.clear();
					state.allMatchingSelected = false;
					state.forceRequestsFetch = true;
					refreshRuntimeData({ forceViewData: true });
					closeMobileSettings();
				});
			});
			el("applyFiltersButton").addEventListener("click", () => {
				state.requestsPage = 0;
				state.selectedRequestIds.clear();
				state.allMatchingSelected = false;
				state.forceRequestsFetch = true;
				refreshRuntimeData({ forceViewData: true });
				closeMobileSettings();
			});
			el("clearFiltersButton").addEventListener("click", () => {
				[
					"filterModel",
					"filterProvider",
					"filterErrorType",
					"filterReason",
					"filterHttpStatus",
					"filterClientIp",
					"filterStream",
					"filterClientFormat",
					"filterUpstreamFormat",
					"filterCostStatus"
				].forEach((id) => {
					el(id).value = "";
				});
				state.requestFilters.status = "";
				syncRequestFilterUi();
				state.requestsPage = 0;
				state.selectedRequestIds.clear();
				state.allMatchingSelected = false;
				state.forceRequestsFetch = true;
				refreshRuntimeData({ forceViewData: true });
				closeMobileSettings();
			});
			el("deleteRequestsButton")?.addEventListener("click", async () => {
				const ids = Array.from(state.selectedRequestIds);
				const filters = activeRequestFilters();
				const filterCount = Object.keys(filters).length;
				const mode = state.allMatchingSelected ? filterCount ? "matching" : "all" : ids.length ? "selected" : filterCount ? "matching" : "all";
				const title = mode === "selected" ? t("confirm.delete_selected.title") : mode === "matching" ? t("confirm.delete_matching.title") : t("confirm.clear_history.title");
				const plural = (mode === "selected" ? ids.length : Number(state.data.requests?.total || 0)) === 1 ? "" : "s";
				if (!await openConfirmDialog({
					title,
					message: mode === "selected" ? t("confirm.delete_selected.msg", {
						count: fmtInt(ids.length),
						plural
					}) : mode === "matching" ? t("confirm.delete_matching.msg", {
						count: fmtInt(state.data.requests?.total || 0),
						plural
					}) : t("confirm.clear_history.msg"),
					acceptLabel: t("confirm.delete")
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
					const plural = deleted === 1 ? "" : "s";
					setNotice(mode === "all" ? t("notice.request_history_cleared", { count: fmtInt(deleted) }) : t("notice.requests_deleted", {
						count: fmtInt(deleted),
						plural
					}), "ok");
					if (mode === "selected" && Array.isArray(state.data.requests?.items)) {
						const deletedIds = new Set(ids);
						state.data.requests.items = state.data.requests.items.filter((item) => !deletedIds.has(item.request_id || item.id));
						state.data.requests.total = Math.max(0, Number(state.data.requests.total || 0) - deletedIds.size);
						state.data.version = Number(state.data.version || 0) + 1;
						renderAll();
					} else {
						state.forceRequestsFetch = true;
						renderAll();
					}
					scheduleBackgroundRefresh({
						quiet: true,
						preserveNotice: true
					});
				} catch (err) {
					setNotice(t("notice.delete_requests_failed", { error: err.message }));
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
					applyMutationResult(await apiPost("/-/admin/config/reload"));
					scheduleBackgroundRefresh({
						quiet: true,
						staticData: true
					});
				} catch (err) {
					setNotice(t("notice.config_reload_failed", { error: err.message }));
				}
			});
			el("globalProxyForm").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const proxy = String(form.elements.proxy.value || "").trim();
				await runConfigMutation(form, async () => {
					const result = await apiPatch("/-/admin/proxy", { proxy });
					setNotice(t("notice.global_proxy_updated"), "ok");
					return result;
				}, {
					resourceKey: "global-proxy",
					apply: (config) => {
						config.proxy = proxy;
					},
					drawer: false
				});
			});
			function loadHealthMonitorForm() {
				const hm = (state.data.config || {}).health_monitor || {};
				el("hmIdleEnabled").checked = hm.idle_check_enabled !== false;
				el("hmIdleRecent").value = hm.idle_check_interval_recent_s ?? 30;
				el("hmIdleMedium").value = hm.idle_check_interval_medium_s ?? 60;
				el("hmIdleLong").value = hm.idle_check_interval_long_s ?? 300;
				el("hmIdleDeepMin").value = hm.idle_check_interval_deep_min_s ?? 10800;
				el("hmIdleDeepMax").value = hm.idle_check_interval_deep_max_s ?? 21600;
				el("hmPatrolEnabled").checked = hm.patrol_check_enabled !== false;
				el("hmPatrolMin").value = hm.patrol_interval_min_s ?? 21600;
				el("hmPatrolMax").value = hm.patrol_interval_max_s ?? 43200;
				el("hmPatrolDelay").value = hm.patrol_delay_s ?? 3;
				el("hmPatrolJitter").value = hm.patrol_delay_jitter_s ?? 2;
				el("hmPatrolTimeout").value = hm.patrol_first_byte_timeout_s ?? 15;
			}
			function collectHealthMonitorPatch() {
				return {
					idle_check_enabled: el("hmIdleEnabled").checked,
					idle_check_interval_recent_s: parseInt(el("hmIdleRecent").value, 10) || 30,
					idle_check_interval_medium_s: parseInt(el("hmIdleMedium").value, 10) || 60,
					idle_check_interval_long_s: parseInt(el("hmIdleLong").value, 10) || 300,
					idle_check_interval_deep_min_s: parseInt(el("hmIdleDeepMin").value, 10) || 10800,
					idle_check_interval_deep_max_s: parseInt(el("hmIdleDeepMax").value, 10) || 21600,
					patrol_check_enabled: el("hmPatrolEnabled").checked,
					patrol_interval_min_s: parseInt(el("hmPatrolMin").value, 10) || 21600,
					patrol_interval_max_s: parseInt(el("hmPatrolMax").value, 10) || 43200,
					patrol_delay_s: parseInt(el("hmPatrolDelay").value, 10) || 3,
					patrol_delay_jitter_s: parseInt(el("hmPatrolJitter").value, 10) || 2,
					patrol_first_byte_timeout_s: parseInt(el("hmPatrolTimeout").value, 10) || 15
				};
			}
			const _origRenderAll = renderAll;
			renderAll = function() {
				_origRenderAll.apply(this, arguments);
				if (el("hmIdleEnabled") && state.data.config) loadHealthMonitorForm();
				updateHealthMonitorRuntime();
			};
			function fmtDuration(s) {
				if (!s || s <= 0) return "—";
				if (s < 60) return Math.round(s) + "s";
				if (s < 3600) return Math.floor(s / 60) + "m " + Math.round(s % 60) + "s";
				const h = Math.floor(s / 3600);
				const m = Math.floor(s % 3600 / 60);
				return h + "h " + (m > 0 ? m + "m" : "");
			}
			function fmtAgo(s) {
				if (!s || s <= 0) return "never";
				if (s < 60) return Math.round(s) + "s ago";
				if (s < 3600) return Math.floor(s / 60) + "m ago";
				return Math.floor(s / 3600) + "h ago";
			}
			function updateHealthMonitorRuntime() {
				const metrics = state.data.metrics || {};
				const idleState = metrics.idle_state;
				if (idleState) {
					const statusEl = el("hmIdleStatus");
					const nextEl = el("hmIdleNext");
					const tierEl = el("hmIdleTier");
					if (statusEl) {
						const enabled = el("hmIdleEnabled").checked;
						statusEl.textContent = enabled ? idleState.tier || "active" : "disabled";
						statusEl.className = "hm-runtime-status " + (enabled ? "ok" : "off");
					}
					if (nextEl) nextEl.textContent = idleState.next_probe_in_s > 0 ? fmtDuration(idleState.next_probe_in_s) : "—";
					if (tierEl) tierEl.textContent = idleState.tier || "—";
				}
				const patrolState = metrics.patrol_state;
				if (patrolState) {
					const statusEl = el("hmPatrolStatus");
					const lastEl = el("hmPatrolLast");
					const resultEl = el("hmPatrolResult");
					const nextEl = el("hmPatrolNext");
					const runBtn = el("hmPatrolRunBtn");
					if (statusEl) if (patrolState.running) {
						statusEl.textContent = "running...";
						statusEl.className = "hm-runtime-status running";
					} else if (!patrolState.enabled) {
						statusEl.textContent = "disabled";
						statusEl.className = "hm-runtime-status off";
					} else if (patrolState.last_result === "ok") {
						statusEl.textContent = "healthy";
						statusEl.className = "hm-runtime-status ok";
					} else if (patrolState.last_result === "partial") {
						statusEl.textContent = "partial";
						statusEl.className = "hm-runtime-status warn";
					} else if (patrolState.last_result === "failed") {
						statusEl.textContent = "failed";
						statusEl.className = "hm-runtime-status bad";
					} else {
						statusEl.textContent = "idle";
						statusEl.className = "hm-runtime-status";
					}
					if (lastEl) if (patrolState.last_run_at > 0) lastEl.textContent = fmtAgo(patrolState.last_run_ago_s) + (patrolState.last_run_duration_s > 0 ? ` (${fmtDuration(patrolState.last_run_duration_s)})` : "");
					else lastEl.textContent = "never";
					if (resultEl) if (patrolState.last_summary) resultEl.textContent = patrolState.last_summary;
					else if (patrolState.last_result === "skipped") resultEl.textContent = "skipped";
					else resultEl.textContent = "—";
					if (nextEl) if (patrolState.running) nextEl.textContent = "in progress";
					else if (!patrolState.enabled) nextEl.textContent = "—";
					else if (patrolState.next_run_in_s > 0) nextEl.textContent = fmtDuration(patrolState.next_run_in_s);
					else nextEl.textContent = "—";
					if (runBtn) {
						runBtn.disabled = patrolState.running || !patrolState.enabled;
						runBtn.textContent = patrolState.running ? t("cfg.running") : t("cfg.run_now");
					}
				}
			}
			if (el("hmPatrolRunBtn")) el("hmPatrolRunBtn").addEventListener("click", async () => {
				const btn = el("hmPatrolRunBtn");
				const status = el("healthMonitorStatus");
				btn.disabled = true;
				btn.textContent = t("cfg.running");
				if (status) {
					status.textContent = t("cfg.triggering_patrol");
					status.className = "health-monitor-status info";
				}
				try {
					const result = await apiPost("/-/admin/health/patrol/trigger", {});
					if (status) {
						status.textContent = t("cfg.patrol_triggered");
						status.className = "health-monitor-status ok";
					}
					if (result.patrol_state) {
						state.data.metrics = state.data.metrics || {};
						state.data.metrics.patrol_state = result.patrol_state;
						updateHealthMonitorRuntime();
					}
					setTimeout(() => scheduleBackgroundRefresh({
						quiet: true,
						staticData: true
					}), 5e3);
				} catch (err) {
					if (status) {
						status.textContent = t("pg.error", { error: err.message });
						status.className = "health-monitor-status bad";
					}
				} finally {
					btn.disabled = false;
					btn.textContent = t("cfg.run_now");
					setTimeout(() => {
						if (status) {
							status.textContent = "";
							status.className = "health-monitor-status";
						}
					}, 5e3);
				}
			});
			el("saveHealthMonitorBtn").addEventListener("click", async () => {
				const btn = el("saveHealthMonitorBtn");
				const status = el("healthMonitorStatus");
				status.textContent = t("notice.saving");
				status.className = "health-monitor-status info";
				const patch = collectHealthMonitorPatch();
				await runOptimisticConfigAction(btn, () => apiPost("/-/admin/config/health-monitor", patch), {
					resourceKey: "health-monitor",
					apply: (config) => {
						Object.assign(config.health_monitor ||= {}, structuredClone(patch));
					}
				}, {
					drawer: false,
					locateRoot: () => el("saveHealthMonitorBtn"),
					onSuccess: () => {
						loadHealthMonitorForm();
						status.textContent = t("notice.saved");
						status.className = "health-monitor-status ok";
						setNotice(t("notice.health_monitor_saved"), "ok");
					},
					onError: (err) => {
						status.textContent = t("pg.error", { error: err.message });
						status.className = "health-monitor-status bad";
						setNotice(t("notice.health_monitor_failed", { error: err.message }));
					}
				});
				setTimeout(() => {
					status.textContent = "";
					status.className = "health-monitor-status";
				}, 3e3);
			});
			el("downloadConversionDiagnostics")?.addEventListener("click", async () => {
				const button = el("downloadConversionDiagnostics");
				button.disabled = true;
				try {
					const response = await fetch(withAdmin("/-/admin/conversion-diagnostics/export"), { headers: state.adminKey ? { "X-Admin-Key": state.adminKey } : {} });
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const blob = await response.blob();
					const filename = (response.headers.get("Content-Disposition") || "").match(/filename="?([^";]+)"?/i)?.[1] || "conversion-errors.jsonl";
					const href = URL.createObjectURL(blob);
					const anchor = document.createElement("a");
					anchor.href = href;
					anchor.download = filename;
					document.body.appendChild(anchor);
					anchor.click();
					anchor.remove();
					URL.revokeObjectURL(href);
					setNotice(t("notice.diagnostics_downloaded"), "ok");
				} catch (err) {
					setNotice(t("notice.action_failed", { error: err.message }), "bad");
				} finally {
					button.disabled = false;
				}
			});
			el("clearConversionDiagnostics")?.addEventListener("click", async () => {
				if (!await openConfirmDialog({
					title: t("confirm.clear_diagnostics.title"),
					message: t("confirm.clear_diagnostics.msg"),
					acceptLabel: t("confirm.clear")
				})) return;
				const button = el("clearConversionDiagnostics");
				button.disabled = true;
				try {
					await apiPost("/-/admin/conversion-diagnostics/clear", { confirm: "clear_conversion_diagnostics" });
					state.data.conversionDiagnostics = await apiGet("/-/admin/conversion-diagnostics");
					renderConversionDiagnostics();
					setNotice(t("notice.diagnostics_cleared"), "ok");
				} catch (err) {
					setNotice(t("notice.action_failed", { error: err.message }), "bad");
				} finally {
					button.disabled = false;
				}
			});
			el("exportOverlayButton").addEventListener("click", async () => {
				try {
					const overlay = await apiGet("/-/admin/config/overlay");
					state.data.overlay = overlay;
					state.data.overlayPreviewPinned = true;
					state.data.overlayPreviewStatus = overlay.has_overlay ? "exported" : "empty";
					el("overlayPreview").textContent = JSON.stringify(overlay.overlay || {}, null, 2);
					renderOverlaySafety(state.data.config || {});
					setNotice(t("notice.overlay_exported"), "ok");
				} catch (err) {
					setNotice(t("notice.overlay_export_failed", { error: err.message }));
				}
			});
			el("validateOverlayButton").addEventListener("click", async () => {
				try {
					const result = await apiPost("/-/admin/config/overlay/validate", {});
					state.data.overlayPreviewPinned = true;
					state.data.overlayPreviewStatus = result.preview?.valid ? "valid" : "invalid";
					el("overlayPreview").textContent = JSON.stringify(result.preview || {}, null, 2);
					renderOverlaySafety(state.data.config || {});
					setNotice(t("notice.overlay_validated"), "ok");
				} catch (err) {
					state.data.overlayPreviewStatus = "failed";
					renderOverlaySafety(state.data.config || {});
					setNotice(t("notice.overlay_validation_failed", { error: err.message }));
				}
			});
			el("clearOverlayButton").addEventListener("click", async () => {
				if (!await openConfirmDialog({
					title: t("confirm.clear_overlay.title"),
					message: t("confirm.clear_overlay.msg"),
					acceptLabel: t("confirm.clear")
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
					setNotice(result.backup_path ? t("notice.overlay_cleared_backup", { path: result.backup_path }) : t("notice.overlay_cleared"), "ok");
					applyMutationResult(result);
					scheduleBackgroundRefresh({
						quiet: true,
						preserveNotice: true,
						staticData: true,
						staticDomains: [
							"config",
							"overlay",
							"audit"
						]
					});
				} catch (err) {
					setNotice(t("notice.clear_overlay_failed", { error: err.message }));
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
				const siteUrl = String(form.get("site_url") || "").trim();
				const priority = Number(form.get("priority") || 0);
				const payload = {
					name: String(form.get("name") || "").trim(),
					base_url: String(form.get("base_url") || "").trim(),
					keys: [keyProxy ? {
						key,
						proxy: keyProxy
					} : key]
				};
				if (siteUrl) payload.site_url = siteUrl;
				if (priority !== 0) payload.priority = priority;
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
				if (await runConfigMutation(formEl, async () => {
					const result = await apiPost("/-/admin/providers", payload);
					setNotice(t("notice.provider_added", { name: payload.name }), "ok");
					return result;
				}, {
					resourceKey: `provider:${payload.name}`,
					apply: (config) => appendPendingProvider(config, payload),
					drawer: false
				})) el("addProviderForm")?.reset();
			});
			el("modelRouteForm").addEventListener("submit", async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				const payload = {
					model: String(form.elements.model.value || "").trim(),
					providers: String(form.elements.providers.value || "").trim(),
					provider_select: String(form.elements.provider_select.value || "priority_failover").trim(),
					format_preference: String(form.elements.format_preference.value || "").trim(),
					reasoning_effort: String(form.elements.reasoning_effort?.value || "").trim()
				};
				await runConfigMutation(form, async () => {
					const result = await apiPatch("/-/admin/models/routes", payload);
					setNotice(t("notice.model_route_saved", { model: payload.model }), "ok");
					return result;
				}, {
					resourceKey: `model-route:${payload.model}`,
					apply: (config) => {
						const routes = (config.models ||= {}).routes ||= {};
						routes[payload.model] = {
							providers: parseRouteProvidersInput(payload.providers),
							provider_select: payload.provider_select,
							...payload.format_preference ? { format_preference: payload.format_preference } : {},
							...payload.reasoning_effort ? { reasoning_effort: payload.reasoning_effort } : {}
						};
					},
					drawer: false
				});
			});
			el("clearModelRouteFormButton").addEventListener("click", () => {
				el("modelRouteForm").reset();
				const editor = el("modelRouteEditor");
				if (editor) editor.open = false;
			});
			el("modelRoutes").addEventListener("click", async (event) => {
				const priorityButton = event.target.closest("[data-model-route-priority-apply]");
				const editButton = event.target.closest("[data-model-route-edit]");
				const deleteButton = event.target.closest("[data-model-route-delete]");
				if (priorityButton) {
					const model = priorityButton.dataset.model || "";
					const provider = priorityButton.dataset.provider || "";
					const route = routeByModel(model);
					const input = priorityButton.closest(".model-route-provider-priority")?.querySelector("[data-model-route-priority]");
					if (!route || !provider || !input) return;
					const rawPriority = String(input.value || "").trim();
					const priority = rawPriority === "" ? null : Number(rawPriority);
					if (priority !== null && (!Number.isInteger(priority) || priority < -1e3 || priority > 1e3)) {
						setNotice("Model priority must be an integer from -1000 to 1000.");
						return;
					}
					const providers = routeProviderItems(route.providers).map((item) => ({
						name: item.name,
						weight: item.weight || 1,
						...item.name === provider ? priority === null ? {} : { priority } : item.priority === null || item.priority === void 0 ? {} : { priority: item.priority }
					}));
					const requestPayload = {
						model,
						providers,
						provider_select: "priority_failover",
						format_preference: String(route.format_preference || ""),
						reasoning_effort: String(route.reasoning_effort || "")
					};
					await runOptimisticConfigAction(priorityButton, () => apiPatch("/-/admin/models/routes", requestPayload), {
						resourceKey: `model-route:${model}`,
						apply: (config) => {
							const routes = (config.models ||= {}).routes ||= {};
							routes[model] = {
								providers: structuredClone(providers),
								provider_select: "priority_failover",
								...requestPayload.format_preference ? { format_preference: requestPayload.format_preference } : {},
								...requestPayload.reasoning_effort ? { reasoning_effort: requestPayload.reasoning_effort } : {}
							};
						}
					}, {
						drawer: false,
						locateRoot: () => el("modelRoutes")?.querySelector(`[data-model-route-priority-apply][data-model="${CSS.escape(model)}"][data-provider="${CSS.escape(provider)}"]`),
						onSuccess: () => {
							clearAllDirty();
							setNotice(priority === null ? `${provider} now inherits its global priority for ${model}.` : `${provider} model priority for ${model} updated to ${priority}.`, "ok");
						},
						onError: (err) => {
							const restored = el("modelRoutes")?.querySelector(`[data-model-route-priority-apply][data-model="${CSS.escape(model)}"][data-provider="${CSS.escape(provider)}"]`)?.closest(".model-route-provider-priority")?.querySelector("[data-model-route-priority]");
							if (restored) {
								restored.value = rawPriority;
								restored.focus();
							}
							setNotice(`Model priority update failed: ${err.message}`);
						}
					});
					return;
				}
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
					form.elements.format_preference.value = route.format_preference || "";
					if (form.elements.reasoning_effort) form.elements.reasoning_effort.value = route.reasoning_effort || "";
					(editor || form).scrollIntoView({ block: "nearest" });
					form.elements.providers.focus();
					return;
				}
				if (deleteButton) {
					const model = deleteButton.dataset.modelRouteDelete || "";
					if (!model) return;
					if (!await openConfirmDialog({
						title: t("confirm.delete_route.title"),
						message: t("confirm.delete_route.msg", { model }),
						acceptLabel: t("confirm.delete")
					})) return;
					await runOptimisticConfigAction(deleteButton, () => apiPost("/-/admin/models/routes/delete", { model }), {
						resourceKey: `model-route:${model}`,
						apply: (config) => {
							delete config.models?.routes?.[model];
						}
					}, {
						drawer: false,
						locateRoot: () => el("modelRoutes")?.querySelector(`[data-model-route-delete="${CSS.escape(model)}"]`),
						onSuccess: () => setNotice(t("notice.model_route_deleted", { model }), "ok"),
						onError: (err) => setNotice(t("notice.delete_route_failed", { error: err.message }))
					});
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
			document.addEventListener("pointerdown", (event) => {
				if (event.button !== 0) return;
				const target = event.target;
				if (!target || typeof target.closest !== "function") return;
				if (target.closest(".drawer.is-open, .mobile-settings-drawer.is-open, .form-modal.is-open, .confirm-dialog.is-open")) return;
				if (el("formModal")?.classList.contains("is-open")) return;
				if (el("confirmDialog")?.classList.contains("is-open")) return;
				if (el("providerDrawer")?.classList.contains("is-open")) closeProviderDrawer();
				if (el("detailDrawer")?.classList.contains("is-open")) closeDrawer(false);
				if (el("modelDrawer")?.classList.contains("is-open")) closeModelDrawer();
				if (el("keyDrawer")?.classList.contains("is-open")) closeKeyDrawer();
				if (el("mobileSettingsDrawer")?.classList.contains("is-open")) closeMobileSettings();
			}, true);
			document.addEventListener("click", (event) => {
				const target = event.target;
				if (!target || typeof target.closest !== "function") return;
				const button = target.closest("[data-proxy-test]");
				if (!button || button.disabled) return;
				handleProxyTestRequest(button);
			});
		}
		function updatePauseButtonState() {
			const button = el("pauseButton");
			if (!button) return;
			const label = t("action.auto_refresh");
			button.setAttribute("aria-label", label);
			button.setAttribute("title", label);
			button.setAttribute("aria-pressed", state.paused ? "false" : "true");
			button.classList.toggle("is-paused", state.paused);
		}
		function closeDrawer(restoreReturn = true) {
			const drawer = el("detailDrawer");
			drawer.classList.remove("is-open");
			drawer.setAttribute("aria-hidden", "true");
			const returnTarget = restoreReturn ? state.detailDrawerReturn : null;
			state.detailDrawerReturn = null;
			if (returnTarget?.type === "provider" && returnTarget.name) openProviderDrawer(returnTarget.name, returnTarget.tab || "overview");
			else if (returnTarget?.type === "model" && returnTarget.name) if (returnTarget.mode === "usage") openUsageModelDrawer(returnTarget.name);
			else openModelDrawer(returnTarget.name);
		}
		async function openModelDrawer(modelName) {
			closeDrawer(false);
			closeProviderDrawer();
			const drawer = el("modelDrawer");
			const title = el("modelDrawerTitle");
			const subtitle = el("modelDrawerSubtitle");
			const body = el("modelDrawerBody");
			if (!drawer || !body) return;
			state.modelDrawerMode = "summary";
			title.innerHTML = `${modelBrandIconMarkup(modelName, iconSvg("boxes"))}<span>${escapeHtml(modelName)}</span>`;
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
					const sugRaw = result.suggestion;
					const sugSlug = sugRaw && typeof sugRaw === "object" ? sugRaw.slug || "" : sugRaw || "";
					const sugLabel = sugRaw && typeof sugRaw === "object" ? sugRaw.name || sugSlug : sugSlug;
					updateDOM(body, `
          <div style="padding: 24px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
            <strong style="display: block; font-size: 15px; color: var(--text); margin-bottom: 8px;">Model Not Found</strong>
            <p style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">${escapeHtml(result.error)}</p>
            ${sugSlug ? `
              <div style="border-top: 1px solid var(--line-soft); padding-top: 16px; margin-top: 16px;">
                <span style="font-size: 12px; color: var(--muted); display: block; margin-bottom: 8px;">Did you mean?</span>
                <button class="button secondary pill-toggle" style="padding: 6px 12px; font-size: 12px; font-weight: bold;" onclick="window.LP_openModelDrawer('${escapeHtml(sugSlug)}')">
                  ${escapeHtml(sugLabel)}
                </button>
              </div>
            ` : ""}
          </div>
        `);
					subtitle.textContent = "Not Found";
				} else {
					const summary = result.summary || {};
					const url = result.source_url || `https://artificialanalysis.ai/models/${encodeURIComponent(result.model)}`;
					const approx = result.match && result.match.approximate;
					subtitle.textContent = (approx ? "≈ " : "") + result.model;
					if (approx) subtitle.title = `Approximate match for "${modelName}" (${result.match.kind})`;
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
                  <strong style="font-size: 18px; font-weight: 800; font-family: var(--mono); color: var(--text);">${fmtPricing(summary.price_blended.price_per_1m_tokens)}<span style="font-size: 11px; font-weight: normal;">/1M</span></strong>
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
                <span style="color: var(--muted);">Input Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtPricing(summary.pricing.input)}</span>
                <span style="color: var(--muted);">Output Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtPricing(summary.pricing.output)}</span>
                <span style="color: var(--muted);">Cache Read Price</span><span class="mono" style="font-family: var(--mono); font-weight: 600; text-align: right;">${fmtPricing(summary.pricing.cache_hit)}</span>
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
			state.modelDrawerMode = "summary";
		}
		window.LP_openModelDrawer = openModelDrawer;
		function startTimer() {
			if (state.timer) window.clearInterval(state.timer);
			state.timer = window.setInterval(() => {
				if (!state.paused && !document.hidden) refreshRuntimeData();
			}, state.refreshMs);
		}
		function handleVisibilityChange() {
			if (document.hidden) {
				_runtimeViewAbortController?.abort();
				if (_capabilityFollowUpTimer) {
					clearTimeout(_capabilityFollowUpTimer);
					_capabilityFollowUpTimer = null;
				}
				return;
			}
			if (!state.paused && state.adminKey) refreshRuntimeData({ forceViewData: true });
			_maybeScheduleCapabilityFollowUp();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
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
		var _tooltipReconcileCallback = null;
		function scheduleTooltipReconcile() {
			if (_tooltipReconcileCallback) _tooltipReconcileCallback();
		}
		function installTooltip() {
			if (_tipEl) return;
			_tipEl = document.createElement("div");
			_tipEl.className = "lp-tip";
			_tipEl.id = "lpGlobalTooltip";
			_tipEl.setAttribute("role", "tooltip");
			_tipEl.setAttribute("aria-hidden", "true");
			document.body.appendChild(_tipEl);
			let _currentTipTarget = null;
			let _lastPointer = null;
			let _reconcileRaf = 0;
			const setDescribedBy = (target, enabled) => {
				if (!target?.getAttribute) return;
				const ids = new Set(String(target.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
				if (enabled) ids.add(_tipEl.id);
				else ids.delete(_tipEl.id);
				if (ids.size) target.setAttribute("aria-describedby", [...ids].join(" "));
				else target.removeAttribute("aria-describedby");
			};
			const setCurrentTarget = (target) => {
				if (_currentTipTarget === target) return;
				setDescribedBy(_currentTipTarget, false);
				_currentTipTarget = target;
				setDescribedBy(_currentTipTarget, true);
			};
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
				setCurrentTarget(target);
				_tipEl.textContent = trimmed;
				_tipEl.setAttribute("aria-hidden", "false");
				positionTip(target);
				_tipEl.classList.add("is-visible");
			};
			const hideNow = () => {
				window.clearTimeout(_tipHideTimer);
				_tipEl.classList.remove("is-visible");
				_tipEl.setAttribute("aria-hidden", "true");
				setCurrentTarget(null);
			};
			const hide = () => {
				window.clearTimeout(_tipHideTimer);
				_tipHideTimer = window.setTimeout(() => {
					_tipEl.classList.remove("is-visible");
					_tipEl.setAttribute("aria-hidden", "true");
					setCurrentTarget(null);
				}, 80);
			};
			const positionTip = (target) => {
				if (!target?.isConnected) {
					hideNow();
					return;
				}
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
			const selector = "[data-tip], [title], [data-original-title]";
			const targetFromEvent = (event) => {
				const node = event.target;
				if (!node || !node.closest) return null;
				return node.closest(selector);
			};
			const targetAtPointer = () => {
				if (_lastPointer) {
					const node = document.elementFromPoint(_lastPointer.x, _lastPointer.y);
					if (node?.closest) return node.closest(selector);
				}
				const active = document.activeElement;
				return active?.closest ? active.closest(selector) : null;
			};
			const reconcile = () => {
				_reconcileRaf = 0;
				const nextTarget = targetAtPointer();
				if (nextTarget) if (!_currentTipTarget || !_currentTipTarget.isConnected || nextTarget !== _currentTipTarget || !_tipEl.classList.contains("is-visible")) show(nextTarget);
				else positionTip(nextTarget);
				else if (_currentTipTarget && (!_currentTipTarget.isConnected || !_lastPointer)) hideNow();
			};
			_tooltipReconcileCallback = () => {
				if (_reconcileRaf) return;
				_reconcileRaf = window.requestAnimationFrame(reconcile);
			};
			document.addEventListener("pointermove", (event) => {
				_lastPointer = {
					x: event.clientX,
					y: event.clientY
				};
			}, { passive: true });
			document.addEventListener("mouseover", (event) => {
				_lastPointer = {
					x: event.clientX,
					y: event.clientY
				};
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
			document.addEventListener("mouseleave", () => {
				_lastPointer = null;
				hideNow();
			});
			window.addEventListener("blur", hideNow);
			window.addEventListener("scroll", scheduleTooltipReconcile, { passive: true });
			window.addEventListener("resize", scheduleTooltipReconcile);
			document.addEventListener("focusin", (event) => {
				const target = targetFromEvent(event);
				if (target) show(target);
			});
			document.addEventListener("focusout", (event) => {
				if (targetFromEvent(event)) hide();
			});
		}
		async function init() {
			initLang();
			installMobileSettings();
			installEvents();
			installTooltip();
			bindLangToggle();
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
				checkingMessage: t("auth.checking")
			});
		}
		function bindLangToggle() {
			const btn = el("langToggleButton");
			if (!btn) return;
			btn.addEventListener("click", () => {
				setLang(getLang() === "en" ? "zh" : "en");
			});
			onLangChange(() => {
				updateLangToggleLabel();
				updatePauseButtonState();
				renderAll();
				applyI18n();
				const meta = views[state.view] || views.overview;
				el("viewTitle").textContent = meta.title;
				el("viewSubtitle").textContent = meta.subtitle;
				renderTimeRangeControl();
				if (state.providerDrawerName) renderProviderDrawer({ force: true });
			});
			updateLangToggleLabel();
		}
		function updateLangToggleLabel() {
			const btn = el("langToggleButton");
			if (!btn) return;
			btn.textContent = getLang() === "en" ? "中" : "EN";
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
			return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		}
		/**
		* Lightweight Markdown renderer for playground assistant messages.
		*
		* Supports: headings (h1-h4), bold, italic, inline code, code blocks
		* (``` and ~~~), unordered/ordered lists, blockquotes, links, horizontal
		* rules, and paragraphs.  All raw HTML in the source is escaped first so
		* the output is safe to set via innerHTML.
		*/
		function pgMarkdown(src) {
			let s = pgEsc(String(src || ""));
			const codeBlocks = [];
			s = s.replace(/(```|~~~)(\w*)\n([\s\S]*?)\1/g, (_m, _fence, lang, code) => {
				const idx = codeBlocks.length;
				codeBlocks.push(`<pre class="pg-md-code"><code class="lang-${pgEsc(lang || "")}">${code.replace(/\n$/, "")}</code></pre>`);
				return `\x00CODEBLOCK${idx}\x00`;
			});
			const inlineCodes = [];
			s = s.replace(/`([^`]+)`/g, (_m, code) => {
				const idx = inlineCodes.length;
				inlineCodes.push(`<code class="pg-md-inline">${code}</code>`);
				return `\x00INLINE${idx}\x00`;
			});
			const lines = s.split("\n");
			const out = [];
			let i = 0;
			let inList = null;
			let inQuote = false;
			function closeList() {
				if (inList) {
					out.push(`</${inList}>`);
					inList = null;
				}
			}
			function closeQuote() {
				if (inQuote) {
					out.push("</blockquote>");
					inQuote = false;
				}
			}
			while (i < lines.length) {
				const line = lines[i];
				if (/^\x00CODEBLOCK\d+\x00$/.test(line.trim())) {
					closeList();
					closeQuote();
					out.push(line);
					i++;
					continue;
				}
				if (/^(\s*[-*_]\s*){3,}$/.test(line) && line.trim().length >= 3) {
					closeList();
					closeQuote();
					out.push("<hr class=\"pg-md-hr\">");
					i++;
					continue;
				}
				const h = line.match(/^(#{1,4})\s+(.*)$/);
				if (h) {
					closeList();
					closeQuote();
					const level = h[1].length;
					out.push(`<h${level} class="pg-md-h${level}">${h[2].trim()}</h${level}>`);
					i++;
					continue;
				}
				const bq = line.match(/^&gt;\s?(.*)$/);
				if (bq) {
					closeList();
					if (!inQuote) {
						out.push("<blockquote class=\"pg-md-quote\">");
						inQuote = true;
					}
					out.push(bq[1]);
					i++;
					continue;
				} else closeQuote();
				const ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
				if (ul) {
					if (inList !== "ul") {
						closeList();
						out.push("<ul class=\"pg-md-ul\">");
						inList = "ul";
					}
					out.push(`<li>${ul[2]}</li>`);
					i++;
					continue;
				}
				const ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
				if (ol) {
					if (inList !== "ol") {
						closeList();
						out.push("<ol class=\"pg-md-ol\">");
						inList = "ol";
					}
					out.push(`<li>${ol[2]}</li>`);
					i++;
					continue;
				}
				closeList();
				if (line.trim() === "") {
					i++;
					continue;
				}
				const para = [line];
				let j = i + 1;
				while (j < lines.length && lines[j].trim() !== "" && !/^(#{1,4})\s/.test(lines[j]) && !/^(\s*)[-*+]\s/.test(lines[j]) && !/^(\s*)\d+\.\s/.test(lines[j]) && !/^&gt;\s?/.test(lines[j]) && !/^(\s*[-*_]\s*){3,}$/.test(lines[j]) && !/^\x00CODEBLOCK\d+\x00$/.test(lines[j].trim())) {
					para.push(lines[j]);
					j++;
				}
				out.push(`<p class="pg-md-p">${para.join("<br>")}</p>`);
				i = j;
			}
			closeList();
			closeQuote();
			let html = out.join("\n");
			html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
			html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
			html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
			html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, "<em>$1</em>");
			html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
			html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "<a class=\"pg-md-link\" href=\"$2\" target=\"_blank\" rel=\"noopener\">$1</a>");
			html = html.replace(/\x00CODEBLOCK(\d+)\x00/g, (_m, idx) => codeBlocks[+idx] || "");
			html = html.replace(/\x00INLINE(\d+)\x00/g, (_m, idx) => inlineCodes[+idx] || "");
			return html;
		}
		/** Render assistant content as markdown; user/system content as plain text. */
		function pgRenderContent(m) {
			const text = m.content || "";
			if ((m.role || "") === "assistant" && text.trim()) return pgMarkdown(text);
			return pgEsc(text);
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
				chat.innerHTML = `<div class="pg-empty"><span class="pg-empty-icon">${iconSvg("message")}</span><span class="pg-empty-text">Send a message to start testing.</span></div>`;
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
			if ((m.role || "") === "assistant") content.innerHTML = pgMarkdown(m.content || "");
			else content.textContent = m.content || "";
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
			else if (m.streaming) body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgRenderContent(m)}<span class="pg-stream-cursor"></span></div>`;
			else body = `${pgRenderThinking(m)}<div class="pg-message-content">${pgRenderContent(m)}</div>`;
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
			const isOpen = text.trim() && m.streaming;
			return `<details class="pg-thinking" ${text.trim() ? isOpen ? "open" : "" : "hidden"}>
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
				pgStatus(t("pg.load_failed", { error: err.message }));
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
			pgStatus(t("pg.sending"));
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
				pgStatus(t("pg.done"));
			} catch (err) {
				if (err.name === "AbortError") {
					assistantMsg.content += "\n[stopped by user]";
					pgStatus(t("pg.stopped"));
				} else {
					assistantMsg.error = err.message;
					pgStatus(t("pg.error", { error: err.message }));
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
			pgStatus(t("pg.ready"));
			pgRenderMessages({ scroll: "bottom" });
		}
		function pgBindEvents() {
			const sendBtn = el("pgSendButton");
			const stopBtn = el("pgStopButton");
			const clearBtn = el("pgClearButton");
			const headerClearBtn = el("pgHeaderClearButton");
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
			if (headerClearBtn && !headerClearBtn.dataset.pgBound) {
				headerClearBtn.dataset.pgBound = "1";
				headerClearBtn.addEventListener("click", pgClear);
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
