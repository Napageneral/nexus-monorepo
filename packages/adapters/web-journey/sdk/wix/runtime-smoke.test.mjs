import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

import { buildDevenirAestheticsWixCustomCodeSnippetFromMetadata } from "./index.mjs";

class FakeStorage {
  #map = new Map();

  getItem(key) {
    return this.#map.has(key) ? this.#map.get(key) : null;
  }

  setItem(key, value) {
    this.#map.set(String(key), String(value));
  }

  removeItem(key) {
    this.#map.delete(key);
  }
}

class FakeElement {
  constructor(tagName, attributes = {}, options = {}) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.form = null;
    this.id = "";
    this.className = "";
    this.href = null;
    this.innerText = options.text ?? "";
    this.textContent = options.text ?? "";
    this.value = options.value ?? "";

    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
  }

  appendChild(child) {
    child.parent = this;
    child.form = this.tagName === "FORM" ? this : this.form;
    this.children.push(child);
    return child;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === "id") this.id = normalized;
    if (name === "class") this.className = normalized;
    if (name === "href") this.href = normalized;
    if (name === "value") this.value = normalized;
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (matchesSelector(current, selector)) return current;
      current = current.parent;
    }
    return null;
  }

  querySelector(selector) {
    return findDescendant(this.children, selector);
  }
}

function findDescendant(children, selector) {
  for (const child of children) {
    if (matchesSelector(child, selector)) return child;
    const descendant = findDescendant(child.children, selector);
    if (descendant) return descendant;
  }
  return null;
}

function matchesSelector(node, selector) {
  return selector
    .split(",")
    .map((part) => part.trim())
    .some((part) => matchesSingleSelector(node, part));
}

function matchesSingleSelector(node, selector) {
  if (!selector) return false;
  if (selector === "a") return node.tagName === "A";
  if (selector === "button") return node.tagName === "BUTTON";
  if (selector === "input") return node.tagName === "INPUT";
  if (selector === "textarea") return node.tagName === "TEXTAREA";
  if (selector === "select") return node.tagName === "SELECT";
  if (selector === "form") return node.tagName === "FORM";
  if (selector === "nav") return node.tagName === "NAV";
  if (selector === "header") return node.tagName === "HEADER";
  if (selector === "footer") return node.tagName === "FOOTER";
  if (selector === "[role='button']") return node.getAttribute("role") === "button";
  if (selector === "button[type='submit']") {
    return node.tagName === "BUTTON" && node.getAttribute("type") === "submit";
  }
  if (selector === "input[type='submit']") {
    return node.tagName === "INPUT" && node.getAttribute("type") === "submit";
  }
  return false;
}

function createLocation(initialHref) {
  let current = new URL(initialHref);
  return {
    get href() {
      return current.href;
    },
    set href(next) {
      current = new URL(next, current.href);
    },
    get pathname() {
      return current.pathname;
    },
    get search() {
      return current.search;
    },
    get hash() {
      return current.hash;
    },
    get host() {
      return current.host;
    },
    get origin() {
      return current.origin;
    },
    _set(next) {
      current = new URL(next, current.href);
    },
  };
}

function createHarness({ href, title = "Devenir Aesthetics", referrer = "https://www.google.com/" }) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const fetchCalls = [];
  const localStorage = new FakeStorage();
  const sessionStorage = new FakeStorage();
  const location = createLocation(href);

  const document = {
    title,
    referrer,
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
  };

  const history = {
    pushState(_state, _title, nextUrl) {
      if (nextUrl) location._set(nextUrl);
    },
    replaceState(_state, _title, nextUrl) {
      if (nextUrl) location._set(nextUrl);
    },
  };

  let uuidCounter = 0;
  const window = {
    document,
    history,
    location,
    navigator: { userAgent: "devenir-wix-smoke" },
    localStorage,
    sessionStorage,
    crypto: {
      randomUUID() {
        uuidCounter += 1;
        return `uuid-${uuidCounter}`;
      },
    },
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
  };
  window.window = window;

  function fetch(url, init = {}) {
    fetchCalls.push({
      url,
      init,
      body: init.body ? JSON.parse(init.body) : null,
    });
    return Promise.resolve({ ok: true });
  }

  const context = {
    window,
    document,
    history,
    location,
    navigator: window.navigator,
    localStorage,
    sessionStorage,
    fetch,
    URL,
    URLSearchParams,
    console,
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
    Promise,
    JSON,
    Math,
    Date,
  };

  return {
    context,
    fetchCalls,
    history,
    execute(snippet) {
      vm.runInNewContext(snippet, context);
    },
    dispatchDocument(type, event) {
      for (const listener of documentListeners.get(type) ?? []) {
        listener(event);
      }
    },
    dispatchWindow(type, event = {}) {
      for (const listener of windowListeners.get(type) ?? []) {
        listener(event);
      }
    },
  };
}

function buildSnippet() {
  return buildDevenirAestheticsWixCustomCodeSnippetFromMetadata({
    metadata: {
      runtime_base_url: "https://t-devenir.nexushub.sh",
      web_installation_id: "install-123",
    },
    sender_token: "token-123",
  });
}

function extractScriptSource(snippet) {
  return String(snippet)
    .replace(/^<script>\s*/u, "")
    .replace(/\s*<\/script>$/u, "");
}

function lastEvent(fetchCalls) {
  return fetchCalls.at(-1)?.body?.event ?? null;
}

test("generated Devenir snippet emits page, booking, and navigation events without double boot", () => {
  const snippet = buildSnippet();
  const harness = createHarness({
    href: "https://www.deveniratx.com/services?utm_source=meta&fbclid=fb-123",
    title: "Services",
  });

  harness.execute(extractScriptSource(snippet));

  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(lastEvent(harness.fetchCalls).event_name, "page_view");
  assert.equal(lastEvent(harness.fetchCalls).metadata.page_family, "services");
  assert.equal(lastEvent(harness.fetchCalls).utm_source, "meta");
  assert.equal(lastEvent(harness.fetchCalls).fbclid, "fb-123");

  harness.execute(extractScriptSource(snippet));
  assert.equal(harness.fetchCalls.length, 1);

  const nav = new FakeElement("nav");
  const bookingLink = nav.appendChild(
    new FakeElement("a", {
      href: "https://deveniratx.zenoti.com/webstoreNew/services/433ee0e5-16e3-425d-bfaf-f192b7b5f9c4",
    }, { text: "Book your Appointment" }),
  );
  harness.dispatchDocument("click", { target: bookingLink });

  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(lastEvent(harness.fetchCalls).event_name, "booking_start");
  assert.equal(lastEvent(harness.fetchCalls).bridge_surface, "booking");
  assert.equal(lastEvent(harness.fetchCalls).metadata.provider_hint, "zenoti");
  assert.equal(
    lastEvent(harness.fetchCalls).metadata.booking_center_id,
    "433ee0e5-16e3-425d-bfaf-f192b7b5f9c4",
  );

  harness.history.pushState({}, "", "/bookonline");
  assert.equal(harness.fetchCalls.length, 3);
  assert.equal(lastEvent(harness.fetchCalls).event_name, "page_view");
  assert.equal(lastEvent(harness.fetchCalls).metadata.page_family, "booking");

  harness.history.pushState({}, "", "/bookonline");
  assert.equal(harness.fetchCalls.length, 3);
});

test("generated Devenir snippet emits storefront and gift-card commerce outcomes", () => {
  const snippet = buildSnippet();

  const productHarness = createHarness({
    href: "https://www.deveniratx.com/product-page/example-serum",
    title: "Example Serum",
  });
  productHarness.execute(extractScriptSource(snippet));
  assert.equal(lastEvent(productHarness.fetchCalls).event_name, "product_view");

  const addToCart = new FakeElement("button", {}, { text: "Add to Cart" });
  productHarness.dispatchDocument("click", { target: addToCart });
  assert.equal(lastEvent(productHarness.fetchCalls).event_name, "cart_add");
  assert.equal(lastEvent(productHarness.fetchCalls).metadata.page_family, "product");

  const shopHarness = createHarness({
    href: "https://www.deveniratx.com/shop",
    title: "Shop",
  });
  shopHarness.execute(extractScriptSource(snippet));
  const checkout = new FakeElement("button", {}, { text: "Checkout" });
  shopHarness.dispatchDocument("click", { target: checkout });
  assert.equal(lastEvent(shopHarness.fetchCalls).event_name, "checkout_start");
  assert.equal(lastEvent(shopHarness.fetchCalls).bridge_surface, "checkout");
  assert.equal(lastEvent(shopHarness.fetchCalls).metadata.page_family, "storefront");

  const giftCardHarness = createHarness({
    href: "https://www.deveniratx.com/gift-card",
    title: "Gift Cards",
  });
  giftCardHarness.execute(extractScriptSource(snippet));
  const buyNow = new FakeElement("button", {}, { text: "Buy Now" });
  giftCardHarness.dispatchDocument("click", { target: buyNow });
  assert.equal(lastEvent(giftCardHarness.fetchCalls).event_name, "checkout_start");
  assert.equal(lastEvent(giftCardHarness.fetchCalls).surface_category, "gift_card");
});

test("generated Devenir snippet tracks lead forms and ignores search forms", () => {
  const snippet = buildSnippet();
  const harness = createHarness({
    href: "https://www.deveniratx.com/contact",
    title: "Contact",
  });

  harness.execute(extractScriptSource(snippet));
  assert.equal(harness.fetchCalls.length, 1);

  const leadForm = new FakeElement("form", {
    id: "comp-krj69oje",
    class: "JVi7i2 comp-krj69oje wixui-form",
  });
  const input = leadForm.appendChild(new FakeElement("input", { type: "text" }));
  const submitter = leadForm.appendChild(
    new FakeElement("button", { type: "submit" }, { text: "Submit" }),
  );

  harness.dispatchDocument("focusin", { target: input });
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(lastEvent(harness.fetchCalls).event_name, "form_start");
  assert.equal(lastEvent(harness.fetchCalls).bridge_surface, "form");
  assert.equal(lastEvent(harness.fetchCalls).form_id, "comp-krj69oje");
  assert.equal(lastEvent(harness.fetchCalls).metadata.target_path, "/contact");
  assert.equal(lastEvent(harness.fetchCalls).metadata.form_action_path, null);

  harness.dispatchDocument("submit", { target: leadForm, submitter });
  assert.equal(harness.fetchCalls.length, 3);
  assert.equal(lastEvent(harness.fetchCalls).event_name, "form_submit");
  assert.equal(lastEvent(harness.fetchCalls).metadata.form_family, "lead_capture");

  const searchForm = new FakeElement("form", {
    role: "search",
    "data-testid": "search-box-form",
    action: "/search",
  });
  const searchField = searchForm.appendChild(new FakeElement("input", { type: "text" }));
  const searchSubmitter = searchForm.appendChild(
    new FakeElement("button", { type: "submit" }, { text: "Search" }),
  );

  harness.dispatchDocument("focusin", { target: searchField });
  harness.dispatchDocument("submit", { target: searchForm, submitter: searchSubmitter });
  assert.equal(harness.fetchCalls.length, 3);
});
