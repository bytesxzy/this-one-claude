/* Minimal DOM/browser shim so c4-mini.html's inline language stack can be
 * driven headlessly from Node. It implements only what the page touches:
 * element creation, class lists, a query selector over a small fixed id map,
 * localStorage, fetch, and the timers. Nothing here changes page behaviour;
 * it exists so the LM harness measures the code that actually ships.
 */
"use strict";

function ClassList(node) { this.node = node; this._s = {}; }
ClassList.prototype.add = function () {
  for (var i = 0; i < arguments.length; i++) this._s[arguments[i]] = 1;
  this._sync();
};
ClassList.prototype.remove = function () {
  for (var i = 0; i < arguments.length; i++) delete this._s[arguments[i]];
  this._sync();
};
ClassList.prototype.contains = function (c) { return !!this._s[c]; };
ClassList.prototype.toggle = function (c, on) {
  if (on === undefined) on = !this._s[c];
  if (on) this._s[c] = 1; else delete this._s[c];
  this._sync();
  return on;
};
ClassList.prototype._sync = function () {
  this.node.className = Object.keys(this._s).join(" ");
};

function Node(tag) {
  this.tagName = String(tag || "div").toUpperCase();
  this.children = [];
  this.childNodes = [];
  this.parentNode = null;
  this.style = {};
  this.dataset = {};
  this.attributes = {};
  this._text = "";
  this._html = "";
  this.className = "";
  this.classList = new ClassList(this);
  this._listeners = {};
}
Object.defineProperty(Node.prototype, "textContent", {
  get: function () {
    if (this.childNodes.length) {
      return this.childNodes.map(function (c) {
        return typeof c === "string" ? c : c.textContent;
      }).join("");
    }
    return this._text;
  },
  set: function (v) { this._text = String(v == null ? "" : v); this.childNodes = []; this.children = []; }
});
Object.defineProperty(Node.prototype, "innerHTML", {
  get: function () { return this._html || this.textContent; },
  set: function (v) { this._html = String(v == null ? "" : v); this.childNodes = []; this.children = []; this._text = ""; }
});
Object.defineProperty(Node.prototype, "innerText", {
  get: function () { return this.textContent; },
  set: function (v) { this.textContent = v; }
});
Object.defineProperty(Node.prototype, "firstChild", {
  get: function () { return this.childNodes.length ? this.childNodes[0] : null; }
});
Object.defineProperty(Node.prototype, "lastChild", {
  get: function () { return this.childNodes.length ? this.childNodes[this.childNodes.length - 1] : null; }
});
Node.prototype.appendChild = function (c) {
  if (c && typeof c === "object") c.parentNode = this;
  this.childNodes.push(c);
  if (c && c.tagName) this.children.push(c);
  return c;
};
Node.prototype.insertBefore = function (c, ref) {
  var i = this.childNodes.indexOf(ref);
  if (i < 0) return this.appendChild(c);
  if (c && typeof c === "object") c.parentNode = this;
  this.childNodes.splice(i, 0, c);
  if (c && c.tagName) this.children.splice(Math.max(0, this.children.indexOf(ref)), 0, c);
  return c;
};
Node.prototype.removeChild = function (c) {
  var i = this.childNodes.indexOf(c);
  if (i >= 0) this.childNodes.splice(i, 1);
  var j = this.children.indexOf(c);
  if (j >= 0) this.children.splice(j, 1);
  if (c && typeof c === "object") c.parentNode = null;
  return c;
};
Node.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
Node.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); if (k === "class") { this.className = String(v); } };
Node.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; };
Node.prototype.removeAttribute = function (k) { delete this.attributes[k]; };
Node.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
Node.prototype.removeEventListener = function (t, fn) {
  var l = this._listeners[t]; if (!l) return;
  var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
};
Node.prototype.dispatchEvent = function (ev) {
  var l = this._listeners[ev && ev.type]; if (!l) return true;
  l.slice().forEach(function (fn) { try { fn(ev); } catch (e) {} });
  return true;
};
Node.prototype.querySelector = function () { return null; };
Node.prototype.querySelectorAll = function () { return []; };
Node.prototype.focus = function () {};
Node.prototype.select = function () {};
Node.prototype.click = function () { this.dispatchEvent({ type: "click", preventDefault: function () {} }); };
Node.prototype.closest = function () { return null; };
Node.prototype.getBoundingClientRect = function () { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; };
Node.prototype.scrollIntoView = function () {};

function makeEnv(opts) {
  opts = opts || {};
  var store = {};
  var localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    clear: function () { store = {}; },
    key: function (i) { return Object.keys(store)[i] || null; }
  };
  Object.defineProperty(localStorage, "length", { get: function () { return Object.keys(store).length; } });

  var doc = new Node("html");
  doc.documentElement = new Node("html");
  doc.head = new Node("head");
  doc.body = new Node("body");
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  doc.readyState = "complete";
  doc.baseURI = opts.baseURI || "http://localhost/c4-mini.html";
  doc.title = "CELL4 mini";
  doc.createElement = function (t) { return new Node(t); };
  doc.createTextNode = function (t) { return String(t); };
  doc.createDocumentFragment = function () { return new Node("fragment"); };
  doc.execCommand = function () { return true; };
  var selectorCache = {};
  doc.querySelector = function (sel) {
    if (!selectorCache[sel]) {
      var n = new Node(/^#/.test(sel) ? "div" : "div");
      if (/^#/.test(sel)) n.id = sel.slice(1);
      else n.className = sel.replace(/^\./, "");
      selectorCache[sel] = n;
      doc.body.appendChild(n);
    }
    return selectorCache[sel];
  };
  doc.querySelectorAll = function (sel) { return [doc.querySelector(sel)]; };
  doc.getElementById = function (id) { return doc.querySelector("#" + id); };
  doc.addEventListener = Node.prototype.addEventListener.bind(doc);
  doc.removeEventListener = Node.prototype.removeEventListener.bind(doc);
  doc.dispatchEvent = Node.prototype.dispatchEvent.bind(doc);
  doc._listeners = {};

  var win = {
    document: doc,
    localStorage: localStorage,
    sessionStorage: localStorage,
    location: { href: doc.baseURI, origin: "http://localhost", protocol: "http:", host: "localhost", hostname: "localhost", pathname: "/c4-mini.html", search: "" },
    navigator: { userAgent: "node-harness", clipboard: null, onLine: true, language: "en-US" },
    matchMedia: function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; },
    performance: { now: function () { return Number(process.hrtime.bigint() / 1000n) / 1000; } },
    requestAnimationFrame: function (fn) { return setTimeout(function () { fn(Date.now()); }, 0); },
    cancelAnimationFrame: function (id) { clearTimeout(id); },
    getComputedStyle: function () { return { getPropertyValue: function () { return ""; } }; },
    addEventListener: function () {}, removeEventListener: function () {},
    scrollTo: function () {}, alert: function () {}, confirm: function () { return false; },
    URL: URL, URLSearchParams: URLSearchParams,
    Promise: Promise, JSON: JSON, Math: Math, Date: Date,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    queueMicrotask: queueMicrotask,
    AbortController: typeof AbortController !== "undefined" ? AbortController : function () { this.signal = {}; this.abort = function () {}; },
    TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    atob: function (b) { return Buffer.from(b, "base64").toString("binary"); },
    btoa: function (s) { return Buffer.from(s, "binary").toString("base64"); },
    console: console
  };
  win.window = win;
  win.self = win;
  win.top = win;
  win.globalThis = win;
  win.parent = win;
  doc.defaultView = win;
  win.fetch = opts.fetch || function () { return Promise.reject(new Error("offline")); };
  win.XMLHttpRequest = function () {
    this.open = function () {}; this.send = function () { var s = this; setTimeout(function () { s.onerror && s.onerror(); }, 0); };
    this.setRequestHeader = function () {}; this.abort = function () {};
  };
  win.Node = Node;
  return win;
}

module.exports = { makeEnv: makeEnv, Node: Node };
