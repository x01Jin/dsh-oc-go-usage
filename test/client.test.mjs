import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");

const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children }, children }),
  Fragment: "Fragment",
  useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: (initial) => ({ current: initial }),
};

function loadClient() {
  let factory;
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(registration) {
          factory = registration.factory;
        },
      },
      setInterval: () => 0,
      clearInterval: () => {},
    },
    document: {
      querySelector: () => null,
      createElement: () => ({ dataset: {}, textContent: "" }),
      head: { appendChild: () => {} },
    },
    console,
    URLSearchParams,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "client.js" });
  assert.equal(typeof factory, "function", "client bundle registers a factory");
  return factory((id) => {
    if (id === "react" || id === "react/jsx-runtime") return React;
    throw new Error(`unexpected require(${id})`);
  });
}

function mount({ pick = null } = {}) {
  const registered = [];
  const dictionaries = {};
  const ctx = {
    get: () => undefined,
    remote: { directoryPicker: { pick: async () => ({ ok: true, directory: pick }) } },
    effect(callback) {
      callback();
      return () => {};
    },
    on: () => () => {},
    locale: {
      register(_ns, locale, dict) {
        dictionaries[locale] = dict;
        return () => {};
      },
      bind: () => (key, params) => {
        let text = dictionaries.en[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) text = text.split(`{${k}}`).join(String(v));
        return text;
      },
    },
    slots: {
      inject(_slot, callback) {
        callback();
        return () => {};
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };
  loadClient().apply(ctx);
  return registered;
}

function walk(node, visit) {
  if (typeof node === "string") {
    visit(node);
    return;
  }
  if (node === null || node === undefined || typeof node !== "object") return;
  visit(node);
  const children = Array.isArray(node.children) ? node.children : node.props?.children;
  if (Array.isArray(children)) for (const child of children) walk(child, visit);
  else walk(children, visit);
}

test("client registers one conversation view tab", () => {
  const registered = mount();
  assert.equal(registered.length, 1);
  const { options } = registered[0];
  assert.equal(options.name, "conversation.view");
  assert.equal(options.id, "opencode-go-usage");
  assert.equal(options.label(), "Opencode Go");
  assert.equal(options.inject("session-1").sessionId, "session-1");
});

test("client renders the cost view for a session", () => {
  const registered = mount();
  const tree = registered[0].component({ sessionId: "session-1" });

  let root = null;
  walk(tree, (node) => {
    if (node.props?.className === "ocgsc-view") root = node;
  });
  assert.ok(root, "root view element is rendered");
  assert.ok("data-conversation-composer-overlay" in root.props, "view claims the composer overlay slot");

  const text = [];
  walk(tree, (node) => {
    if (typeof node === "string") text.push(node);
  });
  assert.ok(text.includes("Session cost"), "view heading is rendered");
  assert.ok(text.includes("Save .txt"), "export button is rendered");
  assert.ok(text.includes("Save"), "connection save button is rendered");
});
