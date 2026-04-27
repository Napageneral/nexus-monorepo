import test from "node:test";
import assert from "node:assert/strict";

import { getDevenirAestheticsWixProfile } from "./devenir-aesthetics.mjs";
import { classifyWixClick, classifyWixForm, classifyWixPage } from "../snippet.mjs";

test("devenir profile classifies page families with locale awareness", () => {
  const profile = getDevenirAestheticsWixProfile();

  const services = classifyWixPage({
    profile,
    page_url: "https://www.deveniratx.com/services",
    page_title: "Services",
  });
  const booking = classifyWixPage({
    profile,
    page_url: "https://www.deveniratx.com/bookonline",
    page_title: "Book Online",
  });
  const localizedBooking = classifyWixPage({
    profile,
    page_url: "https://www.deveniratx.com/es/bookonline",
    page_title: "Reservar",
  });
  const product = classifyWixPage({
    profile,
    page_url: "https://www.deveniratx.com/product-page/example-serum",
    page_title: "Serum",
  });

  assert.equal(services.metadata.page_family, "services");
  assert.equal(services.event_name, "page_view");
  assert.equal(booking.metadata.page_family, "booking");
  assert.equal(localizedBooking.metadata.page_locale, "es");
  assert.equal(localizedBooking.metadata.page_canonical_path, "/bookonline");
  assert.equal(product.event_name, "product_view");
  assert.equal(product.metadata.page_family, "product");
});

test("devenir profile classifies booking, commerce, and route clicks exactly", () => {
  const profile = getDevenirAestheticsWixProfile();

  const booking = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/services",
    target_url: "https://deveniratx.zenoti.com/webstoreNew/services/433ee0e5-16e3-425d-bfaf-f192b7b5f9c4",
    label: "Book your Appointment",
    tag_name: "a",
    control_origin: "content",
  });
  const bookingRoute = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/",
    target_url: "/es/bookonline",
    label: "Book Online",
    tag_name: "a",
    control_origin: "nav",
  });
  const cartAdd = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/product-page/example-serum",
    target_url: null,
    label: "Add to Cart",
    tag_name: "button",
    control_origin: "content",
  });
  const checkout = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/shop",
    target_url: null,
    label: "Checkout",
    tag_name: "button",
    control_origin: "content",
  });
  const giftCard = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/gift-card",
    target_url: null,
    label: "Buy Now",
    tag_name: "button",
    control_origin: "content",
  });
  const membership = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/",
    target_url: "/memberships",
    label: "Memberships",
    tag_name: "a",
    control_origin: "nav",
  });
  const loyalty = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/",
    target_url: "/loyalty",
    label: "Loyalty",
    tag_name: "a",
    control_origin: "nav",
  });
  const referral = classifyWixClick({
    profile,
    page_url: "https://www.deveniratx.com/",
    target_url: "/refer-friends",
    label: "Refer Friends",
    tag_name: "a",
    control_origin: "content",
  });

  assert.equal(booking.event_name, "booking_start");
  assert.equal(booking.metadata.provider_hint, "zenoti");
  assert.equal(booking.metadata.booking_center_id, "433ee0e5-16e3-425d-bfaf-f192b7b5f9c4");
  assert.equal(booking.bridge.bridge_surface, "booking");
  assert.equal(bookingRoute.event_name, "booking_start");
  assert.equal(bookingRoute.metadata.target_locale, "es");
  assert.equal(cartAdd.event_name, "cart_add");
  assert.equal(checkout.event_name, "checkout_start");
  assert.equal(checkout.bridge.bridge_surface, "checkout");
  assert.equal(giftCard.event_name, "checkout_start");
  assert.equal(giftCard.surface_category, "gift_card");
  assert.equal(membership.event_name, "cta_click");
  assert.equal(membership.surface_category, "membership");
  assert.equal(loyalty.event_name, "cta_click");
  assert.equal(loyalty.surface_category, "loyalty");
  assert.equal(referral.event_name, "cta_click");
  assert.equal(referral.surface_category, "referral");
});

test("devenir profile tracks lead forms but ignores Wix search forms", () => {
  const profile = getDevenirAestheticsWixProfile();

  const tracked = classifyWixForm({
    profile,
    page_url: "https://www.deveniratx.com/contact",
    form_id: "comp-krj69oje",
    form_action: null,
    form_class_name: "JVi7i2 comp-krj69oje wixui-form",
    form_role: null,
    form_testid: null,
    submit_label: "Submit",
    event_type: "submit",
  });
  const search = classifyWixForm({
    profile,
    page_url: "https://www.deveniratx.com/contact",
    form_id: null,
    form_action: "https://www.deveniratx.com/search",
    form_class_name: "wdVIxK",
    form_role: "search",
    form_testid: "search-box-form",
    submit_label: "Search",
    event_type: "submit",
  });

  assert.equal(tracked.event_name, "form_submit");
  assert.equal(tracked.metadata.form_family, "lead_capture");
  assert.equal(tracked.bridge.form_id, "comp-krj69oje");
  assert.equal(search, null);
});
